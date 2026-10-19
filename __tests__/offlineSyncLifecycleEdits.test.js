jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {} }));

import { runMigrations } from '../src/db/migrations';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { childProgrammeEnrollmentDomainId } from '../src/db/repositories/domainRepositoryUtils';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const ARCHIVED_AT = '2026-10-15T12:00:00.000Z';
const liveTestSession = async () => ({ data: { session: { user: { id: 'user-1' } } } });

describe('ordinary edits preserve server lifecycle state', () => {
  let db;
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
  });
  afterEach(async () => { await db.closeAsync(); });

  test.each(['failed', 'terminal'])('hard_delete waits for a retained insert after an in-flight %s result and retry', async (status) => {
    const repository = createChildrenRepository({ database: db });
    const outbox = createSyncOutboxRepository({ database: db });
    await repository.saveChildRecord({ id: 'child-1', first_name: 'Test', last_name: 'Child', created_by: 'user-1' });
    const [insert] = await db.getAllAsync('select id from sync_outbox');
    await outbox.markInFlight([insert.id]);
    await repository.deleteIfNoHistory('child-1');
    // The retained request fails after local deletion; it may have committed remotely.
    await db.runAsync("update sync_outbox set status = ?, next_retry_at = '2099-01-01T00:00:00.000Z' where id = ?", status, insert.id);
    const serverChildren = new Map();
    const { supabaseClient } = createSupabaseMock({ upsertResults: {
      children: ({ payload }) => {
        for (const row of Array.isArray(payload) ? payload : [payload]) serverChildren.set(row.id, row);
        return { error: null };
      },
    } });
    supabaseClient.rpc = jest.fn(async (name, args) => {
      expect(name).toBe('delete_child_if_no_history');
      serverChildren.delete(args.p_child_id);
      return { data: true, error: null };
    });
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(), database: db, supabaseClient, getAuthSession: liveTestSession });

    await engine.syncAll();
    expect(supabaseClient.rpc).not.toHaveBeenCalled();
    for (let pass = 0; pass < 3; pass += 1) await engine.syncAll({ force: true });

    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
    expect(serverChildren.size).toBe(0);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });

  test('archive while an edit is in flight survives its lost response and stale retry', async () => {
    const repository = createGroupsRepository({ database: db });
    const serverGroup = { id: 'group-1', name: 'Original', programme_id: 'programme-a', created_by: 'user-1', archived_at: null };
    await repository.saveGroup({ ...serverGroup, synced: true });
    await repository.updateGroup(serverGroup.id, { name: 'Edited' });
    let signalStarted;
    let release;
    const started = new Promise(resolve => { signalStarted = resolve; });
    const released = new Promise(resolve => { release = resolve; });
    let first = true;
    const { supabaseClient } = createSupabaseMock({ updateResults: { groups: async ({ payload, value }) => {
      if (first) {
        first = false;
        signalStarted();
        await released;
        Object.assign(serverGroup, payload);
        return { error: { message: 'Network response lost after commit' } };
      }
      Object.assign(serverGroup, payload);
      return { data: [{ id: value }], error: null };
    } } });
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(), database: db, supabaseClient, getAuthSession: liveTestSession });
    const syncing = engine.syncAll();
    await started;
    try {
      expect(await db.getFirstAsync("select status from sync_outbox where operation = 'update'")).toEqual({ status: 'in_flight' });
      await repository.archiveGroup(serverGroup.id, { actorUserId: 'user-1', archivedAt: ARCHIVED_AT });
    } finally {
      release();
      await syncing;
    }

    await engine.syncAll({ force: true });

    expect(serverGroup).toEqual(expect.objectContaining({ name: 'Edited', archived_at: ARCHIVED_AT }));
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });

  test('mastery deletion and reactivation still carry deleted_at through their respective operations', async () => {
    await createChildrenRepository({ database: db }).saveChildRecord({ id: 'child-1', first_name: 'Test', last_name: 'Child', created_by: 'user-1', synced: true });
    const repository = createMasteryRepository({ database: db });
    const id = await repository.saveLetterMasteryRecord({ user_id: 'user-1', child_id: 'child-1', programme_id: 'programme-a', letter: 'a', language: 'isiXhosa', source: 'taught', synced: true });
    const serverMastery = { id, deleted_at: null };
    const { supabaseClient, calls } = createSupabaseMock({ updateResults: { letter_mastery: ({ payload, value }) => {
      Object.assign(serverMastery, payload);
      return { data: [{ id: value }], error: null };
    } } });
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(), database: db, supabaseClient, getAuthSession: liveTestSession });

    await repository.updateLetterMasteryRecord(id, { _deleted: true, deleted_at: ARCHIVED_AT });
    expect(await db.getFirstAsync('select operation from sync_outbox')).toEqual({ operation: 'archive' });
    await engine.syncAll();
    expect(serverMastery.deleted_at).toBe(ARCHIVED_AT);
    await repository.updateLetterMasteryRecord(id, { _deleted: false, deleted_at: null });
    expect(await db.getFirstAsync('select operation from sync_outbox')).toEqual({ operation: 'update' });
    await engine.syncAll();

    expect(serverMastery.deleted_at).toBeNull();
    expect(calls.filter(call => call.tableName === 'letter_mastery').map(call => call.payload.deleted_at)).toEqual([ARCHIVED_AT, null]);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });

  test('enrollment edits cannot batch stale ended_at over an archive, even beside an insert', async () => {
    await db.runAsync("insert into children (id, first_name, last_name, created_by, sync_status) values ('child-1', 'Test', 'Child', 'user-1', 'synced')");
    const outbox = createSyncOutboxRepository({ database: db });
    const rows = new Map();
    for (const programmeId of ['programme-a', 'programme-b']) {
      const id = childProgrammeEnrollmentDomainId({ childId: 'child-1', programmeId });
      const row = { id, child_id: 'child-1', programme_id: programmeId, created_by: 'user-1', ended_at: null, enrolled_at: '2026-10-01T12:00:00.000Z' };
      await db.runAsync('insert into child_programme_enrollments (id, child_id, programme_id, created_by, sync_status) values (?, ?, ?, ?, ?)', id, row.child_id, programmeId, 'user-1', 'pending');
      rows.set(id, { ...row });
      await outbox.enqueue({ tableName: 'child_programme_enrollments', recordId: id, operation: programmeId === 'programme-a' ? 'update' : 'insert', payload: row });
      if (programmeId === 'programme-a') {
        await outbox.enqueue({ tableName: 'child_programme_enrollments', recordId: id, operation: 'archive', payload: { id, ended_at: ARCHIVED_AT } });
      }
    }
    const { supabaseClient, calls } = createSupabaseMock({
      updateResults: { child_programme_enrollments: ({ value, payload }) => {
        Object.assign(rows.get(value), payload);
        return { data: [{ id: value }], error: null };
      } },
      upsertResults: { child_programme_enrollments: ({ payload }) => {
        for (const row of Array.isArray(payload) ? payload : [payload]) Object.assign(rows.get(row.id), row);
        return { error: null };
      } },
    });
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(), database: db, supabaseClient, getAuthSession: liveTestSession });

    await engine.syncAll();

    const archivedId = childProgrammeEnrollmentDomainId({ childId: 'child-1', programmeId: 'programme-a' });
    expect(rows.get(archivedId).ended_at).toBe(ARCHIVED_AT);
    const upserts = calls.filter(call => call.type === 'upsert').flatMap(call => Array.isArray(call.payload) ? call.payload : [call.payload]);
    expect(upserts.map(row => row.id)).not.toContain(archivedId);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });

  test('edit then archive converges with the group archived and the outbox empty', async () => {
    const repository = createGroupsRepository({ database: db });
    const serverGroup = {
      id: 'group-1', name: 'Original', programme_id: 'programme-a',
      class_id: 'class-1', created_by: 'user-1', archived_at: null,
    };
    await repository.saveGroup({ ...serverGroup, synced: true });
    await repository.updateGroup(serverGroup.id, { name: 'Edited' });
    await repository.archiveGroup(serverGroup.id, { actorUserId: 'user-1', archivedAt: ARCHIVED_AT });
    const { supabaseClient, calls } = createSupabaseMock({ updateResults: {
      groups: ({ payload, value }) => {
        Object.assign(serverGroup, payload);
        return { data: [{ id: value }], error: null };
      },
    } });
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(), database: db, supabaseClient, getAuthSession: liveTestSession });

    await engine.syncAll();

    expect(calls.filter(call => call.tableName === 'groups').map(call => call.payload)).toEqual([
      { archived_at: ARCHIVED_AT, row_version: 2 },
      expect.objectContaining({ name: 'Edited', row_version: 3 }),
    ]);
    expect(serverGroup).toEqual(expect.objectContaining({ name: 'Edited', archived_at: ARCHIVED_AT }));
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });
});
