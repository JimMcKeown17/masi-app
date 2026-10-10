jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { runMigrations } from '../src/db/migrations';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import {
  enqueueLifecycleOutbox,
  groupEaAssignmentDomainId,
} from '../src/db/repositories/domainRepositoryUtils';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';

const liveTestSession = async () => ({ data: { session: { user: { id: 'user-1' } } } });
const ASSIGNMENT = groupEaAssignmentDomainId({ groupId: 'group-1' });

const lifecycleRows = (db) => db.getAllAsync(`
  select operation, status from sync_outbox
  where table_name = 'group_ea_assignments' and record_id = ?
  order by created_at
`, ASSIGNMENT);

const createStatefulAssignmentSupabase = ({ loseFirstAssignmentInsertResponse = false } = {}) => {
  const calls = [];
  const assignments = new Map();
  let shouldLoseInsertResponse = loseFirstAssignmentInsertResponse;
  const supabaseClient = {
    from: (tableName) => ({
      upsert: async (payload, options = {}) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          calls.push({ type: 'upsert', tableName, id: row.id, payload: row, options });
          if (tableName === 'group_ea_assignments') {
            if (!assignments.has(row.id) || !options.ignoreDuplicates) {
              assignments.set(row.id, { ...row });
            }
          }
        }
        if (tableName === 'group_ea_assignments' && shouldLoseInsertResponse) {
          shouldLoseInsertResponse = false;
          return { error: { message: 'Network request failed after commit' } };
        }
        return { error: null };
      },
      update: (payload) => ({
        eq: (column, value) => ({
          select: async () => {
            calls.push({ type: 'update', tableName, id: value, payload, column });
            if (tableName !== 'group_ea_assignments') {
              return { data: [{ id: value }], error: null };
            }
            const existing = assignments.get(value);
            if (!existing) return { data: [], error: null };
            assignments.set(value, { ...existing, ...payload });
            return { data: [{ id: value }], error: null };
          },
        }),
      }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: async () => ({ data: true, error: null }),
  };
  return { assignments, calls, supabaseClient };
};

const createBlockingLifecycleSupabase = ({ firstUpdateSucceeds }) => {
  const assignments = new Map();
  const calls = [];
  let signalUpdateStarted;
  let releaseFirstUpdate;
  let shouldBlock = true;
  const firstUpdateStarted = new Promise((resolve) => { signalUpdateStarted = resolve; });
  const firstUpdateReleased = new Promise((resolve) => { releaseFirstUpdate = resolve; });
  const supabaseClient = {
    from: (tableName) => ({
      upsert: async (payload, options = {}) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          calls.push({ type: 'upsert', tableName, id: row.id, payload: row, options });
          if (tableName === 'group_ea_assignments') assignments.set(row.id, { ...row });
        }
        return { error: null };
      },
      update: (payload) => ({
        eq: (column, value) => ({
          select: async () => {
            calls.push({ type: 'update', tableName, id: value, payload, column });
            if (tableName === 'group_ea_assignments' && shouldBlock) {
              shouldBlock = false;
              signalUpdateStarted();
              await firstUpdateReleased;
              if (!firstUpdateSucceeds) {
                return { data: null, error: { message: 'Network request failed' } };
              }
            }
            if (tableName !== 'group_ea_assignments') {
              return { data: [{ id: value }], error: null };
            }
            const existing = assignments.get(value);
            if (!existing) return { data: [], error: null };
            assignments.set(value, { ...existing, ...payload });
            return { data: [{ id: value }], error: null };
          },
        }),
      }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: async () => ({ data: true, error: null }),
  };
  return {
    assignments,
    calls,
    firstUpdateStarted,
    releaseFirstUpdate,
    supabaseClient,
  };
};

describe('group assignment lifecycle (spec §6.5b)', () => {
  let db;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    await db.runAsync("insert into programmes (id, code, name, sync_status) values ('programme-1', 'lit', 'Literacy', 'synced')");
    await db.runAsync(`
      insert into groups (id, name, programme_id, created_by, sync_status)
      values ('group-1', 'Group 1', 'programme-1', 'head-office-1', 'synced')
    `);
    await db.runAsync(`
      insert into group_ea_assignments (id, group_id, ea_user_id, programme_id, assigned_at, created_by, unassigned_at, sync_status)
      values (?, 'group-1', 'user-1', 'programme-1', '2026-10-08T08:00:00.000Z', 'head-office-1', '2026-10-09T08:00:00.000Z', 'synced')
    `, ASSIGNMENT);
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('reactivation is sent as a lifecycle UPDATE that clears unassigned_at, not an ignored insert', async () => {
    await enqueueLifecycleOutbox(db, 'group_ea_assignments', ASSIGNMENT, 'restore', {
      id: ASSIGNMENT, unassigned_at: null, handover_reason: null,
    });
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.totalSynced).toBe(1);
    expect(calls).toEqual([expect.objectContaining({
      type: 'update',
      tableName: 'group_ea_assignments',
      column: 'id',
      value: ASSIGNMENT,
      payload: { unassigned_at: null, handover_reason: null },
    })]);
  });

  test('a restore the server does not acknowledge is terminal, never success', async () => {
    await enqueueLifecycleOutbox(db, 'group_ea_assignments', ASSIGNMENT, 'restore', {
      id: ASSIGNMENT, unassigned_at: null, handover_reason: null,
    });
    const { supabaseClient } = createSupabaseMock({
      updateResults: { group_ea_assignments: { data: [], error: null } },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.totalTerminal).toBe(1);
    expect(result.failedRecords[0].reason).toContain('did not acknowledge');
  });

  test('archive, restore, archive, restore offline leaves exactly one queued intent: the latest', async () => {
    for (const operation of ['archive', 'restore', 'archive', 'restore']) {
      await enqueueLifecycleOutbox(db, 'group_ea_assignments', ASSIGNMENT, operation, {
        id: ASSIGNMENT,
        unassigned_at: operation === 'archive' ? '2026-10-10T08:00:00.000Z' : null,
        handover_reason: null,
      });
    }
    expect(await lifecycleRows(db)).toEqual([{ operation: 'restore', status: 'pending' }]);
  });

  test('a new intent queued while the opposite one is in flight runs after it', async () => {
    await enqueueLifecycleOutbox(db, 'group_ea_assignments', ASSIGNMENT, 'archive', {
      id: ASSIGNMENT, unassigned_at: '2026-10-10T08:00:00.000Z',
    });
    await db.runAsync("update sync_outbox set status = 'in_flight' where operation = 'archive'");
    await enqueueLifecycleOutbox(db, 'group_ea_assignments', ASSIGNMENT, 'restore', {
      id: ASSIGNMENT, unassigned_at: null, handover_reason: null,
    });
    expect(await lifecycleRows(db)).toEqual([
      { operation: 'archive', status: 'in_flight' },
      { operation: 'restore', status: 'pending' },
    ]);
  });

  test('saveGroup reactivating an archived assignment queues a restore, not an insert', async () => {
    const deterministicId = groupEaAssignmentDomainId({ groupId: 'group-2' });
    await db.runAsync(`
      insert into staff_programme_assignments (id, user_id, programme_id, sync_status)
      values ('spa-1', 'user-1', 'programme-1', 'synced')
    `);
    await db.runAsync(`
      insert into groups (id, name, programme_id, created_by, sync_status)
      values ('group-2', 'Group 2', 'programme-1', 'user-1', 'synced')
    `);
    await db.runAsync(`
      insert into group_ea_assignments (id, group_id, ea_user_id, programme_id, assigned_at, created_by, unassigned_at, sync_status)
      values (?, 'group-2', 'user-1', 'programme-1', '2026-10-08T08:00:00.000Z', 'user-1', '2026-10-09T08:00:00.000Z', 'synced')
    `, deterministicId);

    await createGroupsRepository({ database: db }).saveGroup({
      id: 'group-2', name: 'Group 2', programme_id: 'programme-1', created_by: 'user-1', sync_status: 'pending',
    });

    const rows = await db.getAllAsync(`
      select operation from sync_outbox where table_name = 'group_ea_assignments' and record_id = ?
    `, deterministicId);
    expect(rows).toEqual([{ operation: 'restore' }]);
  });

  test('archive waits for its own pending assignment insert and lands after that insert', async () => {
    await db.runAsync(`
      insert into staff_programme_assignments (id, user_id, programme_id, sync_status)
      values ('spa-pending-archive', 'user-1', 'programme-1', 'synced')
    `);
    const repository = createGroupsRepository({ database: db });
    const groupId = 'group-pending-archive';
    const assignmentId = groupEaAssignmentDomainId({ groupId });
    await repository.saveGroup({
      id: groupId,
      name: 'Pending Archive Group',
      programme_id: 'programme-1',
      created_by: 'user-1',
      sync_status: 'pending',
    });
    await repository.archiveGroup(groupId, {
      actorUserId: 'user-1',
      archivedAt: '2026-10-11T09:00:00.000Z',
    });
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const first = await engine.syncAll({ tableName: 'group_ea_assignments' });

    expect(first.totalTerminal).toBe(0);
    expect(first.tableResults.group_ea_assignments).toEqual(expect.objectContaining({
      skipped: true,
      skippedDependency: 'group_ea_assignments',
      skippedDependencyRecordId: assignmentId,
    }));
    expect(calls.map((call) => call.type)).toEqual(['upsert']);
    expect(await db.getAllAsync(`
      select operation, status from sync_outbox
      where table_name = 'group_ea_assignments' and record_id = ?
      order by operation
    `, assignmentId)).toEqual([{ operation: 'archive', status: 'pending' }]);

    const second = await engine.syncAll({ tableName: 'group_ea_assignments' });

    expect(second.totalSynced).toBe(1);
    expect(calls.map((call) => call.type)).toEqual(['upsert', 'update']);
    expect(await db.getFirstAsync(`
      select unassigned_at, sync_status from group_ea_assignments where id = ?
    `, assignmentId)).toEqual({
      unassigned_at: '2026-10-11T09:00:00.000Z',
      sync_status: 'synced',
    });
    expect(await db.getFirstAsync(`
      select count(*) as count from sync_outbox
      where table_name = 'group_ea_assignments' and record_id = ?
    `, assignmentId)).toEqual({ count: 0 });
  });

  test('reactivation queues both restore and insert while the assignment insert is still owed', async () => {
    await db.runAsync(`
      insert into staff_programme_assignments (id, user_id, programme_id, sync_status)
      values ('spa-reactivate-owed', 'user-1', 'programme-1', 'synced')
    `);
    const repository = createGroupsRepository({ database: db });
    const groupId = 'group-reactivate-owed';
    const assignmentId = groupEaAssignmentDomainId({ groupId });
    await repository.saveGroup({
      id: groupId,
      name: 'Reactivate Owed Group',
      programme_id: 'programme-1',
      created_by: 'user-1',
      sync_status: 'pending',
    });
    await repository.archiveGroup(groupId, {
      actorUserId: 'user-1',
      archivedAt: '2026-10-11T10:00:00.000Z',
    });

    await repository.saveGroup({
      id: groupId,
      name: 'Reactivate Owed Group',
      programme_id: 'programme-1',
      created_by: 'user-1',
      archived_at: null,
      archived_by_user_id: null,
      archive_reason: null,
      sync_status: 'pending',
    });

    expect(await db.getAllAsync(`
      select operation, status from sync_outbox
      where table_name = 'group_ea_assignments' and record_id = ?
      order by operation
    `, assignmentId)).toEqual([
      { operation: 'insert', status: 'pending' },
      { operation: 'restore', status: 'pending' },
    ]);
    expect(await db.getFirstAsync(`
      select unassigned_at, sync_status from group_ea_assignments where id = ?
    `, assignmentId)).toEqual({ unassigned_at: null, sync_status: 'pending' });
  });

  test('a lost insert response, archive, and reactivation converge to one active assignment', async () => {
    await db.runAsync(`
      insert into staff_programme_assignments (id, user_id, programme_id, sync_status)
      values ('spa-lost-response', 'user-1', 'programme-1', 'synced')
    `);
    const repository = createGroupsRepository({ database: db });
    const groupId = 'group-lost-response';
    const assignmentId = groupEaAssignmentDomainId({ groupId });
    const server = createStatefulAssignmentSupabase({ loseFirstAssignmentInsertResponse: true });
    const engine = createOutboxSyncEngine({
      getAuthSession: liveTestSession,
      database: db,
      supabaseClient: server.supabaseClient,
    });

    await repository.saveGroup({
      id: groupId,
      name: 'Lost Response Group',
      programme_id: 'programme-1',
      created_by: 'user-1',
      sync_status: 'pending',
    });
    const first = await engine.syncAll();

    expect(first.totalRetriable).toBe(1);
    expect(server.assignments.get(assignmentId).unassigned_at ?? null).toBeNull();
    expect(await db.getFirstAsync(`
      select operation, status from sync_outbox
      where table_name = 'group_ea_assignments' and record_id = ?
    `, assignmentId)).toEqual({ operation: 'insert', status: 'failed' });

    await repository.archiveGroup(groupId, {
      actorUserId: 'user-1',
      archivedAt: '2026-10-11T11:00:00.000Z',
    });
    await db.runAsync(`
      update sync_outbox set next_retry_at = null
      where table_name = 'group_ea_assignments' and record_id = ?
    `, assignmentId);
    const insertRetryPass = await engine.syncAll();

    expect(insertRetryPass.totalTerminal).toBe(0);
    expect(server.calls.filter((call) => call.tableName === 'group_ea_assignments'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'upsert', id: assignmentId }),
      ]));
    expect(server.calls.filter((call) => (
      call.tableName === 'group_ea_assignments' && call.type === 'update'
    ))).toHaveLength(0);
    expect(server.assignments.get(assignmentId).unassigned_at ?? null).toBeNull();

    const archivePass = await engine.syncAll();

    expect(archivePass.totalSynced).toBe(1);
    expect(server.assignments.get(assignmentId).unassigned_at)
      .toBe('2026-10-11T11:00:00.000Z');

    await repository.saveGroup({
      id: groupId,
      name: 'Lost Response Group',
      programme_id: 'programme-1',
      created_by: 'user-1',
      archived_at: null,
      archived_by_user_id: null,
      archive_reason: null,
      sync_status: 'pending',
    });
    expect(await db.getAllAsync(`
      select operation from sync_outbox
      where table_name = 'group_ea_assignments' and record_id = ?
    `, assignmentId)).toEqual([{ operation: 'restore' }]);

    const restorePass = await engine.syncAll();

    expect(restorePass.totalTerminal).toBe(0);
    expect(server.assignments.get(assignmentId).unassigned_at).toBeNull();
    expect(await db.getFirstAsync(`
      select unassigned_at, sync_status from group_ea_assignments where id = ?
    `, assignmentId)).toEqual({ unassigned_at: null, sync_status: 'synced' });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
      .toEqual({ count: 0 });

    expect(server.calls.filter((call) => call.tableName === 'group_ea_assignments')
      .map((call) => call.type)).toEqual(['upsert', 'upsert', 'update', 'update']);
  });

  test('a failed in-flight archive is superseded by the newer restore and never retried', async () => {
    await db.runAsync(`
      insert into staff_programme_assignments (id, user_id, programme_id, sync_status)
      values ('spa-supersede-failure', 'user-1', 'programme-1', 'synced')
    `);
    await db.runAsync(`
      update group_ea_assignments
      set unassigned_at = null, sync_status = 'synced', last_sync_error = null
      where id = ?
    `, ASSIGNMENT);
    const repository = createGroupsRepository({ database: db });
    const server = createBlockingLifecycleSupabase({ firstUpdateSucceeds: false });
    server.assignments.set(ASSIGNMENT, { id: ASSIGNMENT, unassigned_at: null, handover_reason: null });
    const engine = createOutboxSyncEngine({
      getAuthSession: liveTestSession,
      database: db,
      supabaseClient: server.supabaseClient,
    });
    await repository.archiveGroup('group-1', {
      actorUserId: 'user-1',
      archivedAt: '2026-10-11T12:00:00.000Z',
    });

    const archivePassPromise = engine.syncAll({ tableName: 'group_ea_assignments' });
    await server.firstUpdateStarted;
    expect(await lifecycleRows(db)).toEqual([{ operation: 'archive', status: 'in_flight' }]);

    await repository.saveGroup({
      id: 'group-1',
      name: 'Group 1',
      programme_id: 'programme-1',
      created_by: 'user-1',
      archived_at: null,
      archived_by_user_id: null,
      archive_reason: null,
      sync_status: 'pending',
    });
    expect(await lifecycleRows(db)).toEqual([
      { operation: 'archive', status: 'in_flight' },
      { operation: 'restore', status: 'pending' },
    ]);

    server.releaseFirstUpdate();
    await archivePassPromise;

    expect(await lifecycleRows(db)).toEqual([{ operation: 'restore', status: 'pending' }]);
    expect(server.assignments.get(ASSIGNMENT).unassigned_at).toBeNull();

    await db.runAsync(`
      update sync_outbox set next_retry_at = null
      where table_name = 'group_ea_assignments' and record_id = ?
    `, ASSIGNMENT);
    const restorePass = await engine.syncAll({ tableName: 'group_ea_assignments' });

    expect(restorePass.totalSynced).toBe(1);
    expect(server.assignments.get(ASSIGNMENT).unassigned_at).toBeNull();
    expect(await db.getFirstAsync(`
      select unassigned_at, sync_status from group_ea_assignments where id = ?
    `, ASSIGNMENT)).toEqual({ unassigned_at: null, sync_status: 'synced' });
    expect(await lifecycleRows(db)).toEqual([]);

    await engine.syncAll({ tableName: 'group_ea_assignments' });
    const assignmentUpdates = server.calls.filter((call) => (
      call.tableName === 'group_ea_assignments' && call.type === 'update'
    ));
    expect(assignmentUpdates).toHaveLength(2);
    expect(assignmentUpdates.map((call) => call.payload.unassigned_at))
      .toEqual(['2026-10-11T12:00:00.000Z', null]);
  });

  test('a successful in-flight archive settles before the queued restore and finishes active', async () => {
    await db.runAsync(`
      insert into staff_programme_assignments (id, user_id, programme_id, sync_status)
      values ('spa-supersede-success', 'user-1', 'programme-1', 'synced')
    `);
    await db.runAsync(`
      update group_ea_assignments
      set unassigned_at = null, sync_status = 'synced', last_sync_error = null
      where id = ?
    `, ASSIGNMENT);
    const repository = createGroupsRepository({ database: db });
    const server = createBlockingLifecycleSupabase({ firstUpdateSucceeds: true });
    server.assignments.set(ASSIGNMENT, { id: ASSIGNMENT, unassigned_at: null, handover_reason: null });
    const engine = createOutboxSyncEngine({
      getAuthSession: liveTestSession,
      database: db,
      supabaseClient: server.supabaseClient,
    });
    await repository.archiveGroup('group-1', {
      actorUserId: 'user-1',
      archivedAt: '2026-10-11T13:00:00.000Z',
    });

    const archivePassPromise = engine.syncAll({ tableName: 'group_ea_assignments' });
    await server.firstUpdateStarted;
    await repository.saveGroup({
      id: 'group-1',
      name: 'Group 1',
      programme_id: 'programme-1',
      created_by: 'user-1',
      archived_at: null,
      archived_by_user_id: null,
      archive_reason: null,
      sync_status: 'pending',
    });

    server.releaseFirstUpdate();
    const archivePass = await archivePassPromise;

    expect(archivePass.totalSynced).toBe(1);
    expect(server.assignments.get(ASSIGNMENT).unassigned_at)
      .toBe('2026-10-11T13:00:00.000Z');
    expect(await lifecycleRows(db)).toEqual([{ operation: 'restore', status: 'pending' }]);
    expect(await db.getFirstAsync(`
      select unassigned_at, sync_status from group_ea_assignments where id = ?
    `, ASSIGNMENT)).toEqual({ unassigned_at: null, sync_status: 'pending' });

    const restorePass = await engine.syncAll({ tableName: 'group_ea_assignments' });

    expect(restorePass.totalSynced).toBe(1);
    expect(server.assignments.get(ASSIGNMENT).unassigned_at).toBeNull();
    expect(await db.getFirstAsync(`
      select unassigned_at, sync_status from group_ea_assignments where id = ?
    `, ASSIGNMENT)).toEqual({ unassigned_at: null, sync_status: 'synced' });
    expect(await lifecycleRows(db)).toEqual([]);
    expect(server.calls.filter((call) => (
      call.tableName === 'group_ea_assignments' && call.type === 'update'
    )).map((call) => call.payload.unassigned_at))
      .toEqual(['2026-10-11T13:00:00.000Z', null]);
  });
});
