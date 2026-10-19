jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {} }));

import { PostgrestClient } from '@supabase/postgrest-js';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { createStatefulMembershipServer } from '../test-support/statefulMembershipServer';
import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { childEaAssignmentDomainId } from '../src/db/repositories/domainRepositoryUtils';
import { createOutboxSyncEngine } from '../src/services/offlineSync';

const CHILD_ID = '10000000-0000-4000-8000-000000000001';
const liveTestSession = async () => ({ data: { session: { user: { id: 'user-1' } } } });
const staleVersion = { code: 'MV001', message: 'stale_version' };

describe('row version refusals and lost responses', () => {
  let db;
  let children;
  let outbox;

  const makeEngine = supabaseClient => createOutboxSyncEngine({
    database: db, supabaseClient, outboxRepository: outbox,
    enqueueRequest: task => task(), getAuthSession: liveTestSession,
  });
  const readChild = () => db.getFirstAsync('select * from children where id = ?', CHILD_ID);
  const queueChildEdit = async () => {
    await children.updateChild(CHILD_ID, { first_name: 'Edited' });
    return (await outbox.getReadyRecords())[0].id;
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-18T08:00:00.000Z'));
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    children = createChildrenRepository({ database: db });
    outbox = createSyncOutboxRepository({ database: db });
    await children.saveChildRecord({
      id: CHILD_ID, first_name: 'Original', last_name: 'Child', created_by: 'user-1',
      sync_status: 'synced',
    });
  });

  afterEach(async () => {
    await db.closeAsync();
    jest.useRealTimers();
  });

  test('MV001 is terminal and an ordinary pass never retries or marks it synced', async () => {
    const id = await queueChildEdit();
    const { supabaseClient, calls } = createSupabaseMock({
      updateResults: { children: { error: staleVersion } },
    });
    const engine = makeEngine(supabaseClient);

    const result = await engine.syncAll();
    const refused = await outbox.getById(id);
    expect(refused).toMatchObject({
      status: 'terminal',
      last_error: expect.stringContaining('Server has a newer version of this record'),
    });
    expect(result).toMatchObject({ totalSynced: 0, totalTerminal: 1 });
    expect(await readChild()).toMatchObject({ sync_status: 'terminal', first_name: 'Edited' });
    expect((await engine.getSyncStatus()).needsAttentionItems).toEqual([
      expect.objectContaining({ reason: expect.stringContaining('Server has a newer version of this record') }),
    ]);

    jest.setSystemTime(new Date('2026-10-18T10:00:00.000Z'));
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 0, totalFailed: 0 });
    expect(calls).toHaveLength(1);
    expect(await outbox.getById(id)).toEqual(refused);
    expect((await readChild()).sync_status).toBe('terminal');
  });

  test('MV001 reaches error.code through postgrest-js', async () => {
    const id = await queueChildEdit();
    const fetch = jest.fn(async () => ({
      ok: false, status: 400, statusText: 'Bad Request',
      text: async () => '{"code":"MV001","message":"stale_version","details":null,"hint":null}',
    }));
    const client = new PostgrestClient('https://example.invalid/rest/v1', { fetch });

    expect(await makeEngine(client).syncAll()).toMatchObject({ totalSynced: 0, totalTerminal: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBe('PATCH');
    expect(await outbox.getById(id)).toMatchObject({
      status: 'terminal',
      last_error: 'Server has a newer version of this record (stale_version): stale_version',
    });
    expect((await readChild()).sync_status).toBe('terminal');
  });

  test.each(['offline', 'in flight'])('class move under a lost response: move %s', async timing => {
    await db.runAsync(`insert into classes (id, school_id, name, grade, academic_year_id, created_by)
      values ('class-2', 'school-1', 'Grade 1B', '1', 'year-2026', 'user-1')`);
    await children.updateChild(CHILD_ID, { class_id: 'class-1' });
    const membershipA = await db.getFirstAsync('select * from child_class_memberships');
    const slotA = `child_class_memberships:${membershipA.id}:insert`;
    const moveToB = async () => {
      jest.setSystemTime(new Date('2026-10-18T09:00:00.000Z'));
      await children.updateChild(CHILD_ID, { class_id: 'class-2' });
    };
    let moved = false;
    const server = createStatefulMembershipServer({ afterCommit: async ({ payload }) => {
      if (timing === 'in flight' && !moved && payload.id === membershipA.id) {
        expect(await outbox.getById(slotA)).toMatchObject({ status: 'in_flight' });
        expect(payload.exited_at).toBeUndefined();
        moved = true;
        await moveToB();
      }
    } });
    if (timing === 'offline') await moveToB();
    server.loseNextResponse(membershipA.id);
    const engine = makeEngine(server.supabaseClient);

    expect(await engine.syncAll()).toMatchObject({ totalRetriable: 1, totalTerminal: 0 });
    expect(server.rows.has(membershipA.id)).toBe(true);
    if (timing === 'in flight') {
      expect(moved).toBe(true);
      expect(await outbox.getById(slotA)).toMatchObject({ status: 'pending' });
      // The edit changed A's in-flight slot, so its first failure leaves it pending.
      // Lose the coalesced send's response too: B can then acknowledge before A's retry.
      server.loseNextResponse(membershipA.id);
      expect(await engine.syncAll()).toMatchObject({ totalRetriable: 1, totalTerminal: 0 });
    }

    const membershipB = await db.getFirstAsync(
      "select * from child_class_memberships where class_id = 'class-2'"
    );
    expect(server.rows.get(membershipB.id)).toMatchObject({ exited_at: null });
    expect(membershipB.sync_status).toBe('synced');
    expect(await outbox.getById(`child_class_memberships:${membershipB.id}:insert`)).toBeNull();
    expect(await outbox.getById(slotA)).toMatchObject({ status: 'failed' });

    jest.setSystemTime(new Date('2026-10-18T10:00:00.000Z'));
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(await outbox.countUnsent()).toMatchObject({ total: 0 });
    expect(await engine.getSyncStatus()).toMatchObject({ failedCount: 0, needsAttentionCount: 0 });
    expect(server.rows.get(membershipA.id)).toMatchObject({ exited_at: '2026-10-18T09:00:00.000Z' });
    expect(server.rows.get(membershipB.id)).toMatchObject({ class_id: 'class-2', exited_at: null });
    expect(await db.getAllAsync(
      'select class_id, exited_at, sync_status from child_class_memberships order by class_id'
    )).toEqual([
      { class_id: 'class-1', exited_at: '2026-10-18T09:00:00.000Z', sync_status: 'synced' },
      { class_id: 'class-2', exited_at: null, sync_status: 'synced' },
    ]);
    expect((await readChild()).class_id).toBe('class-2');
    expect(server.calls.filter(call => call.tableName === 'child_class_memberships' && call.type === 'upsert')
      .map(call => call.payload.id)).toEqual(timing === 'offline'
      ? [membershipA.id, membershipB.id, membershipA.id]
      : [membershipA.id, membershipA.id, membershipB.id, membershipA.id]);
  });

  test('ignored assignment insert converges after a lost response and an interleaved reconcile', async () => {
    const id = childEaAssignmentDomainId({ userId: 'user-1', childId: CHILD_ID });
    await children.saveStaffChild({ id, user_id: 'user-1', child_id: CHILD_ID, created_by: 'user-1' });
    const readAssignment = () => db.getFirstAsync('select * from child_ea_assignments where id = ?', id);
    let serverRow;
    let loseResponse = true;
    let ignored = 0;
    const { supabaseClient, calls } = createSupabaseMock({ upsertResults: {
      child_ea_assignments: ({ payload, options }) => {
        if (serverRow && options.ignoreDuplicates) ignored += 1;
        else serverRow = { row_version: 1, unassigned_at: null, ...payload };
        if (loseResponse) {
          loseResponse = false;
          throw new Error('Network request failed: response lost after commit');
        }
        return { error: null };
      },
    } });
    const engine = makeEngine(supabaseClient);

    expect(await engine.syncAll()).toMatchObject({ totalRetriable: 1, totalTerminal: 0 });
    const committed = { ...serverRow };
    expect(committed).toMatchObject({ id, row_version: 1, unassigned_at: null });
    expect(await readAssignment()).toMatchObject({ row_version: 1, sync_status: 'failed' });
    jest.setSystemTime(new Date('2026-10-18T09:00:00.000Z'));
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(ignored).toBe(1);
    expect(serverRow).toEqual(committed);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.options.ignoreDuplicates).toBe(true);
      expect(call.payload).not.toHaveProperty('row_version');
    }
    expect(await readAssignment()).toMatchObject({ row_version: 1, sync_status: 'synced' });

    // A removal acknowledgement read before the insert arrives after its retry succeeds.
    const pulledAt = '2026-10-18T08:00:00.000Z';
    expect(await children.saveServerStaffChildRows([], { reconcile: {
      acknowledgedIds: [], pulledAt, userId: 'user-1',
    } })).toMatchObject({ reconcileCompleted: true });
    expect(await readAssignment()).toMatchObject({ unassigned_at: pulledAt, sync_status: 'synced' });
    expect(await children.saveServerStaffChildRows([{ ...serverRow, sync_status: 'synced' }]))
      .toMatchObject({ applied: 1, failed: 0 });
    expect(await readAssignment()).toMatchObject({ unassigned_at: null, row_version: 1, sync_status: 'synced' });
    expect(await outbox.countUnsent()).toMatchObject({ total: 0 });
    expect(await engine.getSyncStatus()).toMatchObject({ failedCount: 0, needsAttentionCount: 0 });
  });
});
