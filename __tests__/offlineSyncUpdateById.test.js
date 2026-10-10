jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { runMigrations } from '../src/db/migrations';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { letterMasteryDomainId } from '../src/db/repositories/domainRepositoryUtils';

const HEAD_OFFICE = 'head-office-1';
const liveTestSession = async () => ({ data: { session: { user: { id: 'user-1' } } } });

const enqueue = async (db, tableName, recordId, operation, payload) => {
  const outbox = createSyncOutboxRepository({ database: db });
  await outbox.enqueue({ tableName, recordId, operation, payload });
};

const seedHeadOfficeChild = async (db, id = 'child-ho-1') => {
  await db.runAsync(`
    insert into children (id, first_name, last_name, reading_level, created_by, sync_status)
    values (?, 'Amahle', 'Dlamini', 'words', ?, 'pending')
  `, id, HEAD_OFFICE);
  return {
    id,
    first_name: 'Amahle',
    last_name: 'Dlamini',
    reading_level: 'words',
    created_by: HEAD_OFFICE,
    created_at: '2026-10-01T08:00:00.000Z',
    updated_at: '2026-10-10T08:00:00.000Z',
  };
};

describe('edits are sent as UPDATE by id (spec §6.5)', () => {
  let db;

  const seedClassMediatedGrant = async ({ membershipStatus, assignmentStatus }) => {
    await db.runAsync(`
      insert into classes (id, name, school_id, grade, created_by, sync_status)
      values ('class-1', 'Grade 1', 'school-1', '1', ?, 'synced')
    `, HEAD_OFFICE);
    await db.runAsync(`
      insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by, sync_status)
      values ('cea-class-1', 'class-1', 'user-1', 'programme-1', ?, ?)
    `, HEAD_OFFICE, assignmentStatus);
    await db.runAsync(`
      insert into child_class_memberships (id, child_id, class_id, academic_year_id, created_by, sync_status)
      values ('ccm-1', 'child-ho-1', 'class-1', 'academic-year-2026', 'user-1', ?)
    `, membershipStatus);
  };

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    await db.runAsync("insert into schools (id, name, sync_status) values ('school-1', 'Test School', 'synced')");
    await db.runAsync(`
      insert into academic_years (id, label, starts_on, ends_on, sync_status)
      values ('academic-year-2026', '2026', '2026-01-01', '2026-12-31', 'synced')
    `);
    await db.runAsync("insert into programmes (id, code, name, sync_status) values ('programme-1', 'lit', 'Literacy', 'synced')");
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('a Head Office-created child edit is an UPDATE without provenance columns', async () => {
    const child = await seedHeadOfficeChild(db);
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.totalSynced).toBe(1);
    const childCalls = calls.filter((call) => call.tableName === 'children');
    expect(childCalls).toEqual([expect.objectContaining({ type: 'update', column: 'id', value: child.id })]);
    expect(childCalls[0].payload).toEqual(expect.objectContaining({ reading_level: 'words' }));
    for (const column of ['id', 'created_by', 'created_at', 'user_id', 'archived_by_user_id']) {
      expect(childCalls[0].payload).not.toHaveProperty(column);
    }
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test('zero acknowledged rows is UPDATE_NOT_APPLIED and terminal when nothing is pending', async () => {
    const child = await seedHeadOfficeChild(db);
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient } = createSupabaseMock({ updateResults: { children: { data: [], error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.totalTerminal).toBe(1);
    const row = await db.getFirstAsync("select status, last_error from sync_outbox where record_id = ?", child.id);
    expect(row.status).toBe('terminal');
    expect(row.last_error).toContain('did not acknowledge exactly one');
  });

  test('a letter_mastery update targets the re-derived deterministic id, not a legacy local id', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-m', 'Lebo', 'Mokoena', 'user-1', 'synced')
    `);
    const legacyLocalId = '0f0f0f0f-0000-4000-8000-000000000001';
    const payload = {
      id: legacyLocalId,
      user_id: 'user-1',
      child_id: 'child-m',
      programme_id: 'programme-1',
      letter: 'a',
      language: 'isiXhosa',
      source: 'taught',
      deleted_at: null,
    };
    await enqueue(db, 'letter_mastery', legacyLocalId, 'update', payload);
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll();

    const expectedId = letterMasteryDomainId({
      userId: 'user-1', childId: 'child-m', programmeId: 'programme-1',
      letter: 'a', language: 'isiXhosa', source: 'taught',
    });
    expect(calls.filter((call) => call.tableName === 'letter_mastery'))
      .toEqual([expect.objectContaining({ type: 'update', column: 'id', value: expectedId })]);
  });

  test('updates for UPDATE-by-id tables are never batched with inserts', async () => {
    const child = await seedHeadOfficeChild(db, 'child-own-1');
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-new-1', 'Zola', 'Ndlovu', 'user-1', 'pending')
    `);
    await enqueue(db, 'children', 'child-new-1', 'insert', {
      id: 'child-new-1', first_name: 'Zola', last_name: 'Ndlovu', created_by: 'user-1',
    });
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll();

    const childCalls = calls.filter((call) => call.tableName === 'children');
    expect(childCalls.map((call) => call.type).sort()).toEqual(['update', 'upsert']);
    const upsertCall = childCalls.find((call) => call.type === 'upsert');
    const upserted = Array.isArray(upsertCall.payload) ? upsertCall.payload : [upsertCall.payload];
    expect(upserted.map((row) => row.id)).toEqual(['child-new-1']);
  });

  test('a zero-row edit stays retriable while a class-mediated membership is pending, then uploads automatically', async () => {
    const child = await seedHeadOfficeChild(db);
    await seedClassMediatedGrant({ membershipStatus: 'pending', assignmentStatus: 'synced' });
    await enqueue(db, 'children', child.id, 'update', child);
    let acknowledge = false;
    const { supabaseClient } = createSupabaseMock({
      updateResults: {
        children: ({ value }) => ({ data: acknowledge ? [{ id: value }] : [], error: null }),
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'children' });
    expect((await db.getFirstAsync('select status from sync_outbox where record_id = ?', child.id)).status).toBe('failed');

    // The membership lands, and the edit's backoff expires.
    await db.runAsync("update child_class_memberships set sync_status = 'synced' where id = 'ccm-1'");
    await db.runAsync('update sync_outbox set next_retry_at = null where record_id = ?', child.id);
    acknowledge = true;
    const second = await engine.syncAll({ tableName: 'children' });

    expect(second.totalSynced).toBe(1);
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox where record_id = ?', child.id)).toEqual({ count: 0 });
  });

  test('a zero-row edit stays retriable while a class assignment is pending (either half counts)', async () => {
    const child = await seedHeadOfficeChild(db);
    await seedClassMediatedGrant({ membershipStatus: 'synced', assignmentStatus: 'pending' });
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient } = createSupabaseMock({ updateResults: { children: { data: [], error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'children' });

    expect((await db.getFirstAsync('select status from sync_outbox where record_id = ?', child.id)).status).toBe('failed');
  });

  test('a terminal membership gives no evidence, so the edit becomes terminal', async () => {
    const child = await seedHeadOfficeChild(db);
    await seedClassMediatedGrant({ membershipStatus: 'terminal', assignmentStatus: 'synced' });
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient } = createSupabaseMock({ updateResults: { children: { data: [], error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'children' });

    expect((await db.getFirstAsync('select status from sync_outbox where record_id = ?', child.id)).status).toBe('terminal');
  });

  test('a class edit stays retriable while its own class assignment is pending (own id as subject)', async () => {
    await db.runAsync(`
      insert into classes (id, name, school_id, grade, created_by, sync_status)
      values ('class-2', 'Grade 2', 'school-1', '2', ?, 'pending')
    `, HEAD_OFFICE);
    await db.runAsync(`
      insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by, sync_status)
      values ('cea-class-2', 'class-2', 'user-1', 'programme-1', ?, 'pending')
    `, HEAD_OFFICE);
    await enqueue(db, 'classes', 'class-2', 'update', { id: 'class-2', name: 'Grade 2B', created_by: HEAD_OFFICE });
    const { supabaseClient } = createSupabaseMock({ updateResults: { classes: { data: [], error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'classes' });

    expect((await db.getFirstAsync("select status from sync_outbox where record_id = 'class-2'")).status).toBe('failed');
  });

  test('a readable letter_mastery row stays retriable while the child assignment is pending', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-lm', 'Thandi', 'Mbeki', ?, 'synced')
    `, HEAD_OFFICE);
    await db.runAsync(`
      insert into child_ea_assignments (id, child_id, user_id, created_by, sync_status)
      values ('cea-lm', 'child-lm', 'user-1', ?, 'pending')
    `, HEAD_OFFICE);
    const payload = {
      id: 'lm-1', user_id: 'user-1', child_id: 'child-lm', programme_id: 'programme-1',
      letter: 'b', language: 'isiXhosa', source: 'taught', deleted_at: null,
    };
    await enqueue(db, 'letter_mastery', 'lm-1', 'update', payload);
    const { supabaseClient } = createSupabaseMock({ updateResults: { letter_mastery: { data: [], error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'letter_mastery' });

    expect((await db.getFirstAsync("select status from sync_outbox where record_id = 'lm-1'")).status).toBe('failed');
  });

  test('an edit after the assignment ended on the server, with nothing pending, is terminal with a readable reason', async () => {
    const child = await seedHeadOfficeChild(db);
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient } = createSupabaseMock({ updateResults: { children: { data: [], error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll({ tableName: 'children' });

    expect(result.failedRecords).toEqual([expect.objectContaining({
      id: child.id,
      reason: expect.stringContaining('did not acknowledge exactly one updated row'),
    })]);
  });
});
