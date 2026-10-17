jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { runMigrations } from '../src/db/migrations';
import {
  __reset as resetExpoSQLiteMock,
  __setDatabaseFactory,
} from 'expo-sqlite';
import { resetDatabaseConnectionForTests } from '../src/db/client';
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

  test('a refused group membership insert cannot count itself as pending authorization evidence', async () => {
    const child = await seedHeadOfficeChild(db);
    await db.runAsync(`
      insert into groups (id, name, programme_id, created_by, sync_status)
      values ('group-self-evidence', 'Self Evidence Group', 'programme-1', 'head-office-1', 'synced')
    `);
    await db.runAsync(`
      insert into group_ea_assignments (
        id, group_id, ea_user_id, programme_id, created_by, sync_status
      ) values (
        'gea-self-evidence', 'group-self-evidence', 'user-1', 'programme-1', 'head-office-1', 'synced'
      )
    `);
    await db.runAsync(`
      insert into child_group_memberships (id, child_id, group_id, created_by, sync_status)
      values ('cgm-self-evidence', ?, 'group-self-evidence', 'user-1', 'pending')
    `, child.id);
    await enqueue(db, 'child_group_memberships', 'cgm-self-evidence', 'insert', {
      id: 'cgm-self-evidence',
      child_id: child.id,
      group_id: 'group-self-evidence',
      grouping_version_id: null,
      created_by: 'user-1',
    });
    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        child_group_memberships: {
          error: { code: '42501', message: 'new row violates row-level security policy' },
        },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll({ tableName: 'child_group_memberships' });

    expect(result.totalTerminal).toBe(1);
    expect(await db.getFirstAsync(`
      select status, last_error from sync_outbox where record_id = 'cgm-self-evidence'
    `)).toEqual(expect.objectContaining({
      status: 'terminal',
      last_error: expect.stringContaining('42501-authenticated:'),
    }));
    expect(await db.getFirstAsync(`
      select sync_status, last_sync_error from child_group_memberships
      where id = 'cgm-self-evidence'
    `)).toEqual(expect.objectContaining({
      sync_status: 'terminal',
      last_sync_error: expect.stringContaining('42501-authenticated:'),
    }));
  });

  test('a different pending class membership still authorizes retry for a refused group membership', async () => {
    const child = await seedHeadOfficeChild(db);
    await db.runAsync(`
      insert into groups (id, name, programme_id, created_by, sync_status)
      values ('group-independent-class', 'Group With Class Evidence', 'programme-1', 'head-office-1', 'synced')
    `);
    await db.runAsync(`
      insert into group_ea_assignments (
        id, group_id, ea_user_id, programme_id, created_by, sync_status
      ) values (
        'gea-independent-class', 'group-independent-class', 'user-1', 'programme-1', 'head-office-1', 'synced'
      )
    `);
    await db.runAsync(`
      insert into child_group_memberships (id, child_id, group_id, created_by, sync_status)
      values ('cgm-independent-class', ?, 'group-independent-class', 'user-1', 'pending')
    `, child.id);
    await db.runAsync(`
      insert into classes (id, name, school_id, grade, created_by, sync_status)
      values ('class-independent', 'Independent Class', 'school-1', '1', 'head-office-1', 'synced')
    `);
    await db.runAsync(`
      insert into class_ea_assignments (
        id, class_id, ea_user_id, programme_id, created_by, sync_status
      ) values (
        'cea-independent', 'class-independent', 'user-1', 'programme-1', 'head-office-1', 'synced'
      )
    `);
    await db.runAsync(`
      insert into child_class_memberships (
        id, child_id, class_id, academic_year_id, created_by, sync_status
      ) values (
        'ccm-independent', ?, 'class-independent', 'academic-year-2026', 'user-1', 'pending'
      )
    `, child.id);
    await enqueue(db, 'child_group_memberships', 'cgm-independent-class', 'insert', {
      id: 'cgm-independent-class',
      child_id: child.id,
      group_id: 'group-independent-class',
      grouping_version_id: null,
      created_by: 'user-1',
    });
    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        child_group_memberships: {
          error: { code: '42501', message: 'new row violates row-level security policy' },
        },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll({ tableName: 'child_group_memberships' });

    expect(result.totalRetriable).toBe(1);
    expect(await db.getFirstAsync(`
      select status from sync_outbox where record_id = 'cgm-independent-class'
    `)).toEqual({ status: 'failed' });
    expect(await db.getFirstAsync(`
      select sync_status from child_group_memberships where id = 'cgm-independent-class'
    `)).toEqual({ sync_status: 'failed' });
  });

  test('a refused class membership insert cannot count itself as pending authorization evidence', async () => {
    const child = await seedHeadOfficeChild(db);
    await db.runAsync(`
      insert into classes (id, name, school_id, grade, created_by, sync_status)
      values ('class-self-evidence', 'Self Evidence Class', 'school-1', '1', 'head-office-1', 'synced')
    `);
    await db.runAsync(`
      insert into class_ea_assignments (
        id, class_id, ea_user_id, programme_id, created_by, sync_status
      ) values (
        'cea-self-evidence', 'class-self-evidence', 'user-1', 'programme-1', 'head-office-1', 'synced'
      )
    `);
    await db.runAsync(`
      insert into child_class_memberships (
        id, child_id, class_id, academic_year_id, created_by, sync_status
      ) values (
        'ccm-self-evidence', ?, 'class-self-evidence', 'academic-year-2026', 'user-1', 'pending'
      )
    `, child.id);
    await enqueue(db, 'child_class_memberships', 'ccm-self-evidence', 'insert', {
      id: 'ccm-self-evidence',
      child_id: child.id,
      class_id: 'class-self-evidence',
      academic_year_id: 'academic-year-2026',
      created_by: 'user-1',
    });
    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        child_class_memberships: {
          error: { code: '42501', message: 'new row violates row-level security policy' },
        },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll({ tableName: 'child_class_memberships' });

    expect(result.totalTerminal).toBe(1);
    expect(await db.getFirstAsync(`
      select status, last_error from sync_outbox where record_id = 'ccm-self-evidence'
    `)).toEqual(expect.objectContaining({
      status: 'terminal',
      last_error: expect.stringContaining('42501-authenticated:'),
    }));
    expect(await db.getFirstAsync(`
      select sync_status from child_class_memberships where id = 'ccm-self-evidence'
    `)).toEqual({ sync_status: 'terminal' });
  });

  test('a different pending group membership still authorizes retry for a refused class membership', async () => {
    const child = await seedHeadOfficeChild(db);
    await db.runAsync(`
      insert into classes (id, name, school_id, grade, created_by, sync_status)
      values ('class-independent-group', 'Class With Group Evidence', 'school-1', '1', 'head-office-1', 'synced')
    `);
    await db.runAsync(`
      insert into class_ea_assignments (
        id, class_id, ea_user_id, programme_id, created_by, sync_status
      ) values (
        'cea-independent-group', 'class-independent-group', 'user-1', 'programme-1', 'head-office-1', 'synced'
      )
    `);
    await db.runAsync(`
      insert into child_class_memberships (
        id, child_id, class_id, academic_year_id, created_by, sync_status
      ) values (
        'ccm-independent-group', ?, 'class-independent-group', 'academic-year-2026', 'user-1', 'pending'
      )
    `, child.id);
    await db.runAsync(`
      insert into groups (id, name, programme_id, created_by, sync_status)
      values ('group-independent', 'Independent Group', 'programme-1', 'head-office-1', 'synced')
    `);
    await db.runAsync(`
      insert into group_ea_assignments (
        id, group_id, ea_user_id, programme_id, created_by, sync_status
      ) values (
        'gea-independent', 'group-independent', 'user-1', 'programme-1', 'head-office-1', 'synced'
      )
    `);
    await db.runAsync(`
      insert into child_group_memberships (id, child_id, group_id, created_by, sync_status)
      values ('cgm-independent', ?, 'group-independent', 'user-1', 'pending')
    `, child.id);
    await enqueue(db, 'child_class_memberships', 'ccm-independent-group', 'insert', {
      id: 'ccm-independent-group',
      child_id: child.id,
      class_id: 'class-independent-group',
      academic_year_id: 'academic-year-2026',
      created_by: 'user-1',
    });
    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        child_class_memberships: {
          error: { code: '42501', message: 'new row violates row-level security policy' },
        },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll({ tableName: 'child_class_memberships' });

    expect(result.totalRetriable).toBe(1);
    expect(await db.getFirstAsync(`
      select status from sync_outbox where record_id = 'ccm-independent-group'
    `)).toEqual({ status: 'failed' });
    expect(await db.getFirstAsync(`
      select sync_status from child_class_memberships where id = 'ccm-independent-group'
    `)).toEqual({ sync_status: 'failed' });
  });

  test('an update waits while its own insert is unacknowledged, then goes as UPDATE', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-offline-1', 'Sipho', 'Khumalo', 'user-1', 'pending')
    `);
    await enqueue(db, 'children', 'child-offline-1', 'insert', {
      id: 'child-offline-1', first_name: 'Sipho', last_name: 'Khumalo', created_by: 'user-1',
    });
    await enqueue(db, 'children', 'child-offline-1', 'update', {
      id: 'child-offline-1', first_name: 'Sipho', last_name: 'Khumalo', reading_level: 'words', created_by: 'user-1',
    });
    let insertSucceeds = false;
    const { supabaseClient, calls } = createSupabaseMock({
      upsertResults: {
        children: () => (insertSucceeds ? { error: null } : { error: { message: 'Network request failed' } }),
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'children' });
    expect(calls.filter((call) => call.type === 'update')).toHaveLength(0);

    insertSucceeds = true;
    // Whether the update follows in the same pass or the next one is an engine detail; the
    // contract is that it is sent once, only after the insert succeeded.
    for (let pass = 0; pass < 2; pass += 1) {
      await db.runAsync("update sync_outbox set next_retry_at = null where record_id = 'child-offline-1'");
      await engine.syncAll({ tableName: 'children' });
    }

    const updateIndex = calls.findIndex((call) => call.type === 'update');
    const successfulInsertIndex = calls.reduce(
      (last, call, index) => (call.type === 'upsert' ? index : last),
      -1,
    );
    expect(calls.filter((call) => call.type === 'update').map((call) => call.value)).toEqual(['child-offline-1']);
    expect(updateIndex).toBeGreaterThan(successfulInsertIndex);
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });
});

describe('production-style evidence resolution without an injected engine database', () => {
  let db;

  beforeEach(async () => {
    await resetDatabaseConnectionForTests();
    resetExpoSQLiteMock();
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    __setDatabaseFactory(async () => db);
    await db.runAsync("insert into programmes (id, code, name, sync_status) values ('programme-1', 'lit', 'Literacy', 'synced')");
  });

  afterEach(async () => {
    await resetDatabaseConnectionForTests();
    resetExpoSQLiteMock();
  });

  test('a zero-row child update with no evidence becomes terminal with a readable reason', async () => {
    const child = await seedHeadOfficeChild(db);
    const outboxRepository = createSyncOutboxRepository({ database: db });
    await outboxRepository.enqueue({
      tableName: 'children',
      recordId: child.id,
      operation: 'update',
      payload: child,
    });
    const { supabaseClient } = createSupabaseMock({
      updateResults: { children: { data: [], error: null } },
    });
    const engine = createOutboxSyncEngine({
      getAuthSession: liveTestSession,
      outboxRepository,
      supabaseClient,
    });

    const result = await engine.syncAll({ tableName: 'children' });

    expect(result.totalTerminal).toBe(1);
    expect(result.failedRecords).toEqual([expect.objectContaining({
      id: child.id,
      reason: expect.stringContaining('did not acknowledge exactly one updated row'),
    })]);
    expect(await db.getFirstAsync(
      'select status, last_error from sync_outbox where record_id = ?',
      child.id,
    )).toEqual(expect.objectContaining({
      status: 'terminal',
      last_error: expect.stringContaining('did not acknowledge exactly one updated row'),
    }));
  });

  test('a zero-row child update stays failed while its child assignment is pending', async () => {
    const child = await seedHeadOfficeChild(db);
    await db.runAsync(`
      insert into child_ea_assignments (id, child_id, user_id, created_by, sync_status)
      values ('cea-production-style', ?, 'user-1', 'user-1', 'pending')
    `, child.id);
    const outboxRepository = createSyncOutboxRepository({ database: db });
    await outboxRepository.enqueue({
      tableName: 'children',
      recordId: child.id,
      operation: 'update',
      payload: child,
    });
    const { supabaseClient } = createSupabaseMock({
      updateResults: { children: { data: [], error: null } },
    });
    const engine = createOutboxSyncEngine({
      getAuthSession: liveTestSession,
      outboxRepository,
      supabaseClient,
    });

    const result = await engine.syncAll({ tableName: 'children' });

    expect(result.totalRetriable).toBe(1);
    expect(await db.getFirstAsync(
      'select status, last_error from sync_outbox where record_id = ?',
      child.id,
    )).toEqual(expect.objectContaining({
      status: 'failed',
      last_error: expect.stringContaining('did not acknowledge exactly one updated row'),
    }));
    expect(await db.getFirstAsync(
      'select sync_status, last_sync_error from children where id = ?',
      child.id,
    )).toEqual(expect.objectContaining({
      sync_status: 'failed',
      last_sync_error: expect.stringContaining('did not acknowledge exactly one updated row'),
    }));
  });

  test('a 42501 membership insert with no evidence becomes terminal with the authenticated marker', async () => {
    const child = await seedHeadOfficeChild(db);
    await db.runAsync(`
      insert into groups (id, name, programme_id, created_by, sync_status)
      values ('group-production-style', 'Group 1', 'programme-1', 'head-office-1', 'synced')
    `);
    await db.runAsync(`
      insert into child_group_memberships (
        id, child_id, group_id, created_by, sync_status
      ) values (
        'cgm-production-style', ?, 'group-production-style', 'user-1', 'pending'
      )
    `, child.id);
    const outboxRepository = createSyncOutboxRepository({ database: db });
    await outboxRepository.enqueue({
      tableName: 'child_group_memberships',
      recordId: 'cgm-production-style',
      operation: 'insert',
      payload: {
        id: 'cgm-production-style',
        child_id: child.id,
        group_id: 'group-production-style',
        grouping_version_id: null,
        created_by: 'user-1',
      },
    });
    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        child_group_memberships: {
          error: { code: '42501', message: 'new row violates row-level security policy' },
        },
      },
    });
    const engine = createOutboxSyncEngine({
      getAuthSession: liveTestSession,
      outboxRepository,
      supabaseClient,
    });

    const result = await engine.syncAll({ tableName: 'child_group_memberships' });

    expect(result.totalTerminal).toBe(1);
    expect(await db.getFirstAsync(`
      select status, last_error from sync_outbox
      where table_name = 'child_group_memberships' and record_id = 'cgm-production-style'
    `)).toEqual(expect.objectContaining({
      status: 'terminal',
      last_error: expect.stringContaining('42501-authenticated:'),
    }));
    expect(await db.getFirstAsync(`
      select sync_status, last_sync_error from child_group_memberships
      where id = 'cgm-production-style'
    `)).toEqual(expect.objectContaining({
      sync_status: 'terminal',
      last_sync_error: expect.stringContaining('42501-authenticated:'),
    }));
  });
});
