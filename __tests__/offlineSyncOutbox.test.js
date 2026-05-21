jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  supabase: {},
}));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createOutboxSyncEngine, pullReferenceData } from '../src/services/offlineSync';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';

const createSupabaseMock = ({ upsertResults = {}, rpcResults = {} } = {}) => {
  const calls = [];
  const supabaseClient = {
    from: jest.fn((tableName) => ({
      upsert: jest.fn(async (payload, options) => {
        calls.push({ type: 'upsert', tableName, payload, options });
        return upsertResults[`${tableName}:${payload.id}`] || upsertResults[tableName] || { error: null };
      }),
      delete: jest.fn(() => ({
        eq: jest.fn(async (column, value) => {
          calls.push({ type: 'delete', tableName, column, value });
          return { error: null };
        }),
      })),
    })),
    rpc: jest.fn(async (functionName, args) => {
      calls.push({ type: 'rpc', functionName, args });
      return rpcResults[functionName] || { data: true, error: null };
    }),
  };

  return { supabaseClient, calls };
};

const seedReferences = async (db) => {
  await db.runAsync("insert into schools (id, name, sync_status) values ('school-1', 'Masi Primary', 'synced')");
  await db.runAsync("insert into programmes (id, code, name, sync_status) values ('programme-1', 'lit', 'Literacy', 'synced')");
};

const enqueue = async (db, tableName, recordId, operation, payload) => {
  const outbox = createSyncOutboxRepository({ database: db });
  await outbox.enqueue({ tableName, recordId, operation, payload });
};

describe('SQLite outbox offline sync', () => {
  let db;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    await seedReferences(db);
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('processes parents before children and finalizes success locally', async () => {
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', 'pending')
    `);
    await db.runAsync(`
      insert into children (id, first_name, last_name, class_id, sync_status)
      values ('child-1', 'Amahle', 'Dlamini', 'class-1', 'pending')
    `);
    await db.runAsync(`
      insert into child_ea_assignments (id, user_id, child_id, sync_status)
      values ('assignment-1', 'user-1', 'child-1', 'pending')
    `);

    await enqueue(db, 'child_ea_assignments', 'assignment-1', 'insert', { id: 'assignment-1', user_id: 'user-1', child_id: 'child-1' });
    await enqueue(db, 'children', 'child-1', 'insert', { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' });
    await enqueue(db, 'classes', 'class-1', 'insert', { id: 'class-1', school_id: 'school-1', name: 'Grade 1A', grade: '1' });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls.map(call => `${call.type}:${call.tableName}`)).toEqual([
      'upsert:classes',
      'upsert:children',
      'upsert:child_ea_assignments',
    ]);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-1'))
      .toEqual({ sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select sync_status, last_sync_error from children where id = ?', 'child-1'))
      .toEqual({ sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select sync_status, last_sync_error from child_ea_assignments where id = ?', 'assignment-1'))
      .toEqual({ sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test('skips dependent rows when a parent table fails in the same sync cycle', async () => {
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', 'pending')
    `);
    await db.runAsync(`
      insert into children (id, first_name, last_name, class_id, sync_status)
      values ('child-1', 'Amahle', 'Dlamini', 'class-1', 'pending')
    `);
    await db.runAsync(`
      insert into child_ea_assignments (id, user_id, child_id, sync_status)
      values ('assignment-1', 'user-1', 'child-1', 'pending')
    `);

    await enqueue(db, 'classes', 'class-1', 'insert', { id: 'class-1', school_id: 'school-1', name: 'Grade 1A', grade: '1' });
    await enqueue(db, 'children', 'child-1', 'insert', { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' });
    await enqueue(db, 'child_ea_assignments', 'assignment-1', 'insert', { id: 'assignment-1', user_id: 'user-1', child_id: 'child-1' });

    const { supabaseClient, calls } = createSupabaseMock({
      upsertResults: {
        children: { error: { message: 'network down' } },
      },
    });
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(false);
    expect(calls.map(call => `${call.type}:${call.tableName}`)).toEqual([
      'upsert:classes',
      'upsert:children',
    ]);
    expect(result.tableResults.child_ea_assignments).toEqual(expect.objectContaining({
      skipped: true,
      skippedDependency: 'children',
    }));
    expect(await db.getFirstAsync('select sync_status from child_ea_assignments where id = ?', 'assignment-1'))
      .toEqual({ sync_status: 'pending' });
    expect(await db.getFirstAsync('select status from sync_outbox where table_name = ?', 'child_ea_assignments'))
      .toEqual({ status: 'pending' });
  });

  test('keeps foreign-key and RLS failures visible as terminal failed items', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, sync_status)
      values ('child-1', 'Amahle', 'Dlamini', 'synced')
    `);
    await db.runAsync(`
      insert into assessments (
        id, user_id, child_id, programme_id, assessment_type, assessment_date, sync_status
      )
      values (
        'assessment-1', 'user-1', 'child-1', 'programme-1', 'letter_egra', '2026-05-21', 'pending'
      )
    `);
    await db.runAsync(`
      insert into letter_mastery (
        id, user_id, child_id, programme_id, letter, language, source, sync_status
      )
      values (
        'mastery-1', 'user-1', 'child-1', 'programme-1', 'a', 'en', 'taught', 'pending'
      )
    `);
    await enqueue(db, 'assessments', 'assessment-1', 'insert', {
      id: 'assessment-1',
      user_id: 'user-1',
      child_id: 'child-1',
      programme_id: 'programme-1',
      assessment_type: 'letter_egra',
      assessment_date: '2026-05-21',
    });
    await enqueue(db, 'letter_mastery', 'mastery-1', 'insert', {
      id: 'mastery-1',
      user_id: 'user-1',
      child_id: 'child-1',
      programme_id: 'programme-1',
      letter: 'a',
      language: 'en',
      source: 'taught',
    });

    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        assessments: { error: { code: '23503', message: 'missing parent' } },
        letter_mastery: { error: { code: '42501', message: 'RLS denied' } },
      },
    });
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    const result = await engine.syncAll();
    const status = await engine.getSyncStatus();

    expect(result.success).toBe(false);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from assessments where id = ?', 'assessment-1'))
      .toEqual({ sync_status: 'terminal', last_sync_error: 'missing parent' });
    expect(await db.getFirstAsync('select sync_status, last_sync_error from letter_mastery where id = ?', 'mastery-1'))
      .toEqual({ sync_status: 'terminal', last_sync_error: 'RLS denied' });
    expect(status.failedItems).toEqual([
      expect.objectContaining({
        table: 'assessments',
        id: 'assessment-1',
        terminal: true,
        reason: 'missing parent',
      }),
      expect.objectContaining({
        table: 'letter_mastery',
        id: 'mastery-1',
        terminal: true,
        reason: 'RLS denied',
      }),
    ]);
  });

  test('treats duplicate-key success only for explicitly configured tables', async () => {
    await db.runAsync(`
      insert into time_entries (
        id, user_id, sign_in_time, sign_in_lat, sign_in_lon, sync_status
      )
      values (
        'time-1', 'user-1', '2026-05-21T08:00:00.000Z', -34.1, 18.4, 'pending'
      )
    `);
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', 'pending')
    `);
    await enqueue(db, 'time_entries', 'time-1', 'insert', {
      id: 'time-1',
      user_id: 'user-1',
      sign_in_time: '2026-05-21T08:00:00.000Z',
      sign_in_lat: -34.1,
      sign_in_lon: 18.4,
    });
    await enqueue(db, 'classes', 'class-1', 'insert', {
      id: 'class-1',
      school_id: 'school-1',
      name: 'Grade 1A',
      grade: '1',
    });

    const duplicateError = { code: '23505', message: 'duplicate key' };
    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        time_entries: { error: duplicateError },
        classes: { error: duplicateError },
      },
    });
    const engine = createOutboxSyncEngine({
      database: db,
      supabaseClient,
      safeDuplicateSuccessTables: ['time_entries'],
    });

    const result = await engine.syncAll();

    expect(result.success).toBe(false);
    expect(await db.getFirstAsync('select sync_status from time_entries where id = ?', 'time-1'))
      .toEqual({ sync_status: 'synced' });
    expect(await db.getFirstAsync('select id from sync_outbox where table_name = ?', 'time_entries'))
      .toBeNull();
    expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-1'))
      .toEqual({ sync_status: 'terminal', last_sync_error: 'duplicate key' });
    expect(await db.getFirstAsync('select status from sync_outbox where table_name = ?', 'classes'))
      .toEqual({ status: 'terminal' });
  });

  test('network errors schedule retry metadata without sleeping the sync loop', async () => {
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', 'pending')
    `);
    await enqueue(db, 'classes', 'class-1', 'insert', {
      id: 'class-1',
      school_id: 'school-1',
      name: 'Grade 1A',
      grade: '1',
    });

    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        classes: { error: { message: 'network down' } },
      },
    });
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const beforeSync = new Date().toISOString();
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    try {
      const result = await engine.syncAll();

      expect(result.success).toBe(false);
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-1'))
        .toEqual({ sync_status: 'failed', last_sync_error: 'network down' });

      const outboxRow = await db.getFirstAsync(
        'select status, retry_count, last_error, next_retry_at from sync_outbox where table_name = ?',
        'classes'
      );
      expect(outboxRow).toEqual(expect.objectContaining({
        status: 'failed',
        retry_count: 1,
        last_error: 'network down',
      }));
      expect(outboxRow.next_retry_at > beforeSync).toBe(true);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  test('child hard deletes use delete_child_if_no_history and terminal-fail when history exists', async () => {
    await enqueue(db, 'children', 'child-clean', 'hard_delete', { id: 'child-clean' });
    await enqueue(db, 'children', 'child-history', 'hard_delete', { id: 'child-history' });

    const { calls } = createSupabaseMock();
    const supabaseClient = {
      from: jest.fn(() => {
        throw new Error('children hard delete must not use direct table delete');
      }),
      rpc: jest.fn(async (functionName, args) => {
        calls.push({ type: 'rpc', functionName, args });
        return { data: args.p_child_id === 'child-clean', error: null };
      }),
    };
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(false);
    expect(calls).toEqual([
      {
        type: 'rpc',
        functionName: 'delete_child_if_no_history',
        args: { p_child_id: 'child-clean' },
      },
      {
        type: 'rpc',
        functionName: 'delete_child_if_no_history',
        args: { p_child_id: 'child-history' },
      },
    ]);
    expect(await db.getFirstAsync('select id from sync_outbox where record_id = ?', 'child-clean'))
      .toBeNull();
    expect(await db.getFirstAsync('select status, last_error from sync_outbox where record_id = ?', 'child-history'))
      .toEqual({
        status: 'terminal',
        last_error: 'Child has history and must be archived instead of hard-deleted',
      });
  });

  test('pullReferenceData refreshes Plan 4 reference caches in dependency order', async () => {
    const calls = [];
    const supabaseClient = {
      from: jest.fn((tableName) => ({
        select: jest.fn(async () => {
          calls.push(tableName);
          return { data: [{ id: `${tableName}-1` }], error: null };
        }),
      })),
    };
    const repositories = {
      academic_years: { replaceFromServer: jest.fn() },
      assessment_windows: { replaceFromServer: jest.fn() },
      teachers: { replaceFromServer: jest.fn() },
    };

    const result = await pullReferenceData({ supabaseClient, repositories });

    expect(calls).toEqual(['academic_years', 'assessment_windows', 'teachers']);
    expect(repositories.academic_years.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'academic_years-1' }]);
    expect(repositories.assessment_windows.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'assessment_windows-1' }]);
    expect(repositories.teachers.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'teachers-1' }]);
    expect(result).toEqual({
      academic_years: 1,
      assessment_windows: 1,
      teachers: 1,
    });
  });
});
