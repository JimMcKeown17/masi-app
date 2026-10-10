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
const ASSIGNMENT = 'gea-1';

const lifecycleRows = (db) => db.getAllAsync(`
  select operation, status from sync_outbox
  where table_name = 'group_ea_assignments' and record_id = ?
  order by created_at
`, ASSIGNMENT);

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
});
