jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  supabase: {},
}));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createOutboxSyncEngine, pullReferenceData } from '../src/services/offlineSync';
import { getActiveProgrammeId } from '../src/db/repositories/domainRepositoryUtils';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';
import {
  createSchoolsRepository,
  createReferenceDataRepository,
} from '../src/db/repositories/referenceDataRepository';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createTimeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';

const createSupabaseMock = ({ upsertResults = {}, rpcResults = {} } = {}) => {
  const calls = [];
  const supabaseClient = {
    from: jest.fn((tableName) => ({
      upsert: jest.fn(async (payload, options) => {
        calls.push({ type: 'upsert', tableName, payload, options });
        const result = upsertResults[`${tableName}:${payload.id}`] || upsertResults[tableName];
        if (typeof result === 'function') {
          return result({ tableName, payload, options, calls });
        }
        return result || { error: null };
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

  test('time entry repository writes are consumed by the sync engine', async () => {
    const repository = createTimeEntriesRepository({ database: db });
    await repository.saveTimeEntry({
      id: 'time-1',
      user_id: 'user-1',
      sign_in_time: '2026-05-21T08:00:00.000Z',
      sign_in_lat: -34.1,
      sign_in_lon: 18.4,
      synced: false,
      created_at: '2026-05-21T08:00:00.000Z',
      updated_at: '2026-05-21T08:00:00.000Z',
    });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls).toEqual([
      expect.objectContaining({
        type: 'upsert',
        tableName: 'time_entries',
        payload: expect.objectContaining({
          id: 'time-1',
          user_id: 'user-1',
          sign_in_time: '2026-05-21T08:00:00.000Z',
        }),
      }),
    ]);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from time_entries where id = ?', 'time-1'))
      .toEqual({ sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test('syncAll recovers in-flight rows left by an interrupted process', async () => {
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
    await createSyncOutboxRepository({ database: db }).markInFlight(['classes:class-1:insert']);

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls.map(call => `${call.type}:${call.tableName}`)).toEqual(['upsert:classes']);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-1'))
      .toEqual({ sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select id from sync_outbox where id = ?', 'classes:class-1:insert'))
      .toBeNull();
  });

  test('successful sync finalization does not delete a newer local write made while the row was in flight', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, sync_status)
      values ('child-1', 'Old', 'Dlamini', 'pending')
    `);
    await enqueue(db, 'children', 'child-1', 'insert', {
      id: 'child-1',
      first_name: 'Old',
      last_name: 'Dlamini',
    });

    const { supabaseClient, calls } = createSupabaseMock({
      upsertResults: {
        children: async () => {
          await db.runAsync(`
            update children
            set first_name = 'New',
                sync_status = 'pending',
                updated_at = '2026-05-21T10:00:00.000Z'
            where id = 'child-1'
          `);
          await enqueue(db, 'children', 'child-1', 'insert', {
            id: 'child-1',
            first_name: 'New',
            last_name: 'Dlamini',
          });
          return { error: null };
        },
      },
    });
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls).toEqual([
      expect.objectContaining({
        type: 'upsert',
        tableName: 'children',
        payload: expect.objectContaining({
          id: 'child-1',
          first_name: 'Old',
        }),
      }),
    ]);
    expect(await db.getFirstAsync('select first_name, sync_status, last_sync_error from children where id = ?', 'child-1'))
      .toEqual({ first_name: 'New', sync_status: 'pending', last_sync_error: null });
    const outboxRow = await db.getFirstAsync(
      'select status, payload from sync_outbox where id = ?',
      'children:child-1:insert'
    );
    expect(outboxRow).toEqual(expect.objectContaining({ status: 'pending' }));
    expect(JSON.parse(outboxRow.payload)).toEqual(expect.objectContaining({
      id: 'child-1',
      first_name: 'New',
    }));
  });

  test('non-delete outbox records with missing payload fail terminal without sending an empty upsert', async () => {
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', 'pending')
    `);
    await createSyncOutboxRepository({ database: db }).enqueue({
      tableName: 'classes',
      recordId: 'class-1',
      operation: 'insert',
    });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(false);
    expect(calls).toEqual([]);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-1'))
      .toEqual({
        sync_status: 'terminal',
        last_sync_error: 'Missing outbox payload for classes:class-1 insert',
      });
    expect(await db.getFirstAsync('select status, last_error from sync_outbox where id = ?', 'classes:class-1:insert'))
      .toEqual({
        status: 'terminal',
        last_error: 'Missing outbox payload for classes:class-1 insert',
      });
  });

  test('unknown outbox tables become visible terminal failures without touching a domain table', async () => {
    await createSyncOutboxRepository({ database: db }).enqueue({
      tableName: 'future_table',
      recordId: 'future-1',
      operation: 'insert',
      payload: { id: 'future-1' },
    });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(false);
    expect(calls).toEqual([]);
    expect(result.failedRecords).toEqual([
      {
        id: 'future-1',
        table: 'future_table',
        operation: 'insert',
        reason: 'Unknown sync table: future_table',
      },
    ]);
    expect(await db.getFirstAsync('select status, last_error from sync_outbox where id = ?', 'future_table:future-1:insert'))
      .toEqual({
        status: 'terminal',
        last_error: 'Unknown sync table: future_table',
      });
  });

  test('archive and restore operations upsert their normalized payloads', async () => {
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, archived_at, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', '2026-05-21T09:00:00.000Z', 'pending')
    `);
    await db.runAsync(`
      insert into children (id, first_name, last_name, archived_at, sync_status)
      values ('child-1', 'Amahle', 'Dlamini', null, 'pending')
    `);
    await enqueue(db, 'classes', 'class-1', 'archive', {
      id: 'class-1',
      school_id: 'school-1',
      name: 'Grade 1A',
      grade: '1',
      archived_at: '2026-05-21T09:00:00.000Z',
    });
    await enqueue(db, 'children', 'child-1', 'restore', {
      id: 'child-1',
      first_name: 'Amahle',
      last_name: 'Dlamini',
      archived_at: null,
    });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls).toEqual([
      expect.objectContaining({
        type: 'upsert',
        tableName: 'classes',
        payload: expect.objectContaining({
          id: 'class-1',
          archived_at: '2026-05-21T09:00:00.000Z',
        }),
      }),
      expect.objectContaining({
        type: 'upsert',
        tableName: 'children',
        payload: expect.objectContaining({
          id: 'child-1',
          archived_at: null,
        }),
      }),
    ]);
    expect(await db.getFirstAsync('select sync_status from classes where id = ?', 'class-1'))
      .toEqual({ sync_status: 'synced' });
    expect(await db.getFirstAsync('select sync_status from children where id = ?', 'child-1'))
      .toEqual({ sync_status: 'synced' });
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
      schools: { replaceFromServer: jest.fn() },
      job_titles: { replaceFromServer: jest.fn() },
      programmes: { replaceFromServer: jest.fn() },
      academic_years: { replaceFromServer: jest.fn() },
      assessment_windows: { replaceFromServer: jest.fn() },
      teachers: { replaceFromServer: jest.fn() },
      staff_programme_assignments: { replaceFromServer: jest.fn() },
    };

    const result = await pullReferenceData({ supabaseClient, repositories });

    expect(calls).toEqual([
      'schools',
      'job_titles',
      'programmes',
      'academic_years',
      'assessment_windows',
      'teachers',
      'staff_programme_assignments',
    ]);
    expect(repositories.schools.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'schools-1' }], {});
    expect(repositories.job_titles.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'job_titles-1' }], {});
    expect(repositories.programmes.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'programmes-1' }], {});
    expect(repositories.academic_years.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'academic_years-1' }], {});
    expect(repositories.assessment_windows.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'assessment_windows-1' }], {});
    expect(repositories.teachers.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'teachers-1' }], {});
    expect(repositories.staff_programme_assignments.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'staff_programme_assignments-1' }], {});
    expect(result).toEqual({
      schools: 1,
      job_titles: 1,
      programmes: 1,
      academic_years: 1,
      assessment_windows: 1,
      teachers: 1,
      staff_programme_assignments: 1,
    });
  });

  test('pullReferenceData seeds the local active programme assignment used by offline writes', async () => {
    const db = await createMigratedDatabase(runMigrations);

    const rowsByTable = {
      schools: [{
        id: 'school-server',
        name: 'Server Primary',
      }],
      job_titles: [{
        id: 'job-title-1',
        code: 'ea',
        name: 'Education Assistant',
        sort_order: 1,
        is_active: true,
      }],
      programmes: [{
        id: 'programme-server',
        code: 'literacy',
        name: 'Literacy',
        sort_order: 1,
        is_active: true,
      }],
      academic_years: [{
        id: 'year-server',
        label: '2026',
        starts_on: '2026-01-15',
        ends_on: '2026-12-15',
        is_active: true,
      }],
      assessment_windows: [{
        id: 'window-server',
        academic_year_id: 'year-server',
        label: '2026 Baseline',
        window_type: 'baseline',
        starts_on: '2026-01-15',
        ends_on: '2026-03-15',
        is_required: true,
      }],
      teachers: [{
        id: 'teacher-server',
        first_name: 'Nandi',
        last_name: 'Teacher',
        display_name: 'Nandi Teacher',
        school_id: 'school-server',
      }],
      staff_programme_assignments: [{
        id: 'spa-server',
        user_id: 'user-1',
        programme_id: 'programme-server',
        school_id: 'school-server',
        assigned_at: '2026-01-15T00:00:00.000Z',
        ended_at: null,
      }, {
        id: 'spa-other-user',
        user_id: 'user-2',
        programme_id: 'programme-server',
        school_id: 'school-server',
        assigned_at: '2026-01-15T00:00:00.000Z',
        ended_at: null,
      }],
    };
    const eqCalls = [];
    const supabaseClient = {
      from: jest.fn((tableName) => {
        const builder = {
          select: jest.fn(() => builder),
          eq: jest.fn((column, value) => {
            eqCalls.push({ tableName, column, value });
            builder.filterColumn = column;
            builder.filterValue = value;
            return builder;
          }),
          then: (resolve) => {
            const rows = rowsByTable[tableName] || [];
            const filteredRows = builder.filterColumn
              ? rows.filter(row => row[builder.filterColumn] === builder.filterValue)
              : rows;
            return Promise.resolve({ data: filteredRows, error: null }).then(resolve);
          },
        };
        return builder;
      }),
    };

    try {
      const repositories = {
        schools: createSchoolsRepository({ database: db }),
        job_titles: createReferenceDataRepository({ database: db, tableName: 'job_titles' }),
        programmes: createReferenceDataRepository({ database: db, tableName: 'programmes' }),
        academic_years: createReferenceDataRepository({ database: db, tableName: 'academic_years' }),
        assessment_windows: createReferenceDataRepository({ database: db, tableName: 'assessment_windows' }),
        teachers: createReferenceDataRepository({ database: db, tableName: 'teachers' }),
        staff_programme_assignments: createReferenceDataRepository({
          database: db,
          tableName: 'staff_programme_assignments',
        }),
      };

      await pullReferenceData({ supabaseClient, repositories, userId: 'user-1' });

      expect(eqCalls).toContainEqual({
        tableName: 'staff_programme_assignments',
        column: 'user_id',
        value: 'user-1',
      });
      await expect(getActiveProgrammeId(db, 'user-1')).resolves.toBe('programme-server');
      expect(await db.getFirstAsync(
        'select count(*) as count from staff_programme_assignments'
      )).toEqual({ count: 1 });
    } finally {
      await db.closeAsync();
    }
  });

  test('session save fails before the startup assignment pull and succeeds after it', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db, { includeStaffProgrammeAssignment: false });
      const repository = createSessionsRepository({ database: db });

      const session = {
        id: 'session-after-pull',
        user_id: 'user-1',
        session_date: '2026-05-21',
        children_ids: [],
        activities: { letters_focused: ['a'] },
        synced: false,
      };

      await expect(repository.saveSession(session)).rejects.toThrow(/No active programme assignment/i);

      const rowsByTable = {
        schools: [{ id: 'school-1', name: 'Masi Primary' }],
        job_titles: [],
        programmes: [{ id: 'programme-a', code: 'literacy', name: 'Literacy' }],
        academic_years: [{
          id: 'year-2026',
          label: '2026',
          starts_on: '2026-01-15',
          ends_on: '2026-12-15',
          is_active: true,
        }],
        assessment_windows: [],
        teachers: [],
        staff_programme_assignments: [{
          id: 'spa-after-pull',
          user_id: 'user-1',
          programme_id: 'programme-a',
          school_id: 'school-1',
          assigned_at: '2026-01-15T00:00:00.000Z',
          ended_at: null,
        }],
      };
      const supabaseClient = {
        from: jest.fn((tableName) => {
          const builder = {
            select: jest.fn(() => builder),
            eq: jest.fn((column, value) => {
              builder.filterColumn = column;
              builder.filterValue = value;
              return builder;
            }),
            then: (resolve) => {
              const rows = rowsByTable[tableName] || [];
              const filteredRows = builder.filterColumn
                ? rows.filter(row => row[builder.filterColumn] === builder.filterValue)
                : rows;
              return Promise.resolve({ data: filteredRows, error: null }).then(resolve);
            },
          };
          return builder;
        }),
      };
      const repositories = {
        schools: createSchoolsRepository({ database: db }),
        job_titles: createReferenceDataRepository({ database: db, tableName: 'job_titles' }),
        programmes: createReferenceDataRepository({ database: db, tableName: 'programmes' }),
        academic_years: createReferenceDataRepository({ database: db, tableName: 'academic_years' }),
        assessment_windows: createReferenceDataRepository({ database: db, tableName: 'assessment_windows' }),
        teachers: createReferenceDataRepository({ database: db, tableName: 'teachers' }),
        staff_programme_assignments: createReferenceDataRepository({
          database: db,
          tableName: 'staff_programme_assignments',
        }),
      };

      await pullReferenceData({ supabaseClient, repositories, userId: 'user-1' });

      await repository.saveSession(session);

      expect(await db.getFirstAsync(
        'select id, programme_id from sessions where id = ?',
        'session-after-pull'
      )).toEqual({
        id: 'session-after-pull',
        programme_id: 'programme-a',
      });
      expect(await db.getFirstAsync(
        "select count(*) as count from sync_outbox where table_name = 'sessions' and record_id = ?",
        'session-after-pull'
      )).toEqual({ count: 1 });
    } finally {
      await db.closeAsync();
    }
  });
});
