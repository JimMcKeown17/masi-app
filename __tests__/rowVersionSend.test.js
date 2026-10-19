import { bindTestActor } from '../test-support/actorTestUtils';
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';

const liveTestSession = async () => ({ data: { session: { user: { id: 'user-1' } } } });
const CHILD_ID = '10000000-0000-4000-8000-000000000001';
const SIBLING_ID = '10000000-0000-4000-8000-000000000002';
const ARCHIVED_AT = '2026-10-18T08:00:00.000Z';
const REPLACEMENT_ARCHIVED_AT = '2026-10-18T09:00:00.000Z';
const childPayload = (id = CHILD_ID) => ({
  id, first_name: 'Original', last_name: 'Child', created_by: 'user-1',
});

// A synthetic server enforcing the version rule; PostgreSQL is a separate gate.
const createVersionedServer = (initialRows = [], { firstUpdateError = null } = {}) => {
  const rows = new Map(initialRows.map(row => [row.id, row]));
  let updateError = firstUpdateError;
  const accept = (id, patch) => {
    const existing = rows.get(id);
    if (patch.row_version < (existing?.row_version ?? 1)) {
      return { error: { code: 'MV001', message: 'stale_version' } };
    }
    rows.set(id, { ...existing, ...patch, id });
    return { data: [{ id }], error: null };
  };
  return {
    rows,
    ...createSupabaseMock({
      upsertResults: { children: ({ payload }) => accept(payload.id, payload) },
      updateResults: { children: ({ value, payload }) => {
        if (updateError) {
          const error = updateError;
          updateError = null;
          return { error };
        }
        return rows.has(value) ? accept(value, payload) : { data: [], error: null };
      } },
    }),
  };
};

describe('row versions at upload claim', () => {
  let db;
  let children;
  let outbox;

  const readChild = (id = CHILD_ID) => db.getFirstAsync('select * from children where id = ?', id);
  const seedChild = async (id = CHILD_ID) => {
    await db.runAsync(`insert into children (id, first_name, last_name, created_by, sync_status)
      values (?, 'Original', 'Child', 'user-1', 'pending')`, id);
  };
  const enqueue = (operation, payload = childPayload(), tableName = 'children', id) => outbox.enqueue({
    tableName, recordId: payload.id, operation, payload, ...(id ? { id } : {}),
  });
  const makeEngine = (supabaseClient, repository = outbox) => createOutboxSyncEngine({
    database: db, supabaseClient, outboxRepository: repository,
    enqueueRequest: task => task(), getAuthSession: liveTestSession,
  });

  beforeEach(async () => {
    db = bindTestActor(createBetterSqliteTestDatabase(), 'user-1');
    await runMigrations(db);
    children = createChildrenRepository({ database: db });
    outbox = createSyncOutboxRepository({ database: db });
  });

  afterEach(async () => { await db.closeAsync(); });

  test('claim stamps once per send, including a forced retry', async () => {
    await seedChild();
    await children.updateChild(CHILD_ID, { first_name: 'Edited' });
    let fail = true;
    const { supabaseClient, calls } = createSupabaseMock({ updateResults: {
      children: ({ value }) => fail
        ? { error: { message: 'response lost' } }
        : { data: [{ id: value }], error: null },
    } });
    const engine = makeEngine(supabaseClient);
    expect((await engine.syncAll()).totalFailed).toBe(1);
    expect(calls[0].payload.row_version).toBe(2);
    expect(await readChild()).toMatchObject({ row_version: 2, sync_status: 'failed' });
    expect((await outbox.getReadyRecords({ includeBackedOff: true }))[0].payload.row_version).toBe(2);
    fail = false;
    expect((await engine.syncAll({ force: true })).totalSynced).toBe(1);
    expect(calls.map(call => call.payload.row_version)).toEqual([2, 3]);
    expect(await readChild()).toMatchObject({ row_version: 3, sync_status: 'synced' });
  });

  test('batch claim stamps every row', async () => {
    for (const id of [CHILD_ID, SIBLING_ID]) {
      await seedChild(id);
      await enqueue('insert', childPayload(id));
    }
    const { supabaseClient, calls } = createSupabaseMock();
    expect((await makeEngine(supabaseClient).syncAll()).totalSynced).toBe(2);
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toEqual([
      { ...childPayload(), row_version: 2 }, { ...childPayload(SIBLING_ID), row_version: 2 },
    ]);
    for (const id of [CHILD_ID, SIBLING_ID]) {
      expect(await readChild(id)).toMatchObject({ row_version: 2, sync_status: 'synced' });
    }
  });

  test.each(['single', 'batch'])('insert success applies the sent content: %s', async mode => {
    const ids = mode === 'batch' ? [CHILD_ID, SIBLING_ID] : [CHILD_ID];
    for (const id of ids) {
      await seedChild(id);
      await enqueue('insert', {
        ...childPayload(id), first_name: 'Recovered', age: 8, updated_at: ARCHIVED_AT,
        history_reference: 1, server_updated_at: ARCHIVED_AT, sync_status: 'terminal',
      });
    }
    const { supabaseClient, calls } = createSupabaseMock();
    expect(await makeEngine(supabaseClient).syncAll()).toMatchObject({ totalSynced: ids.length, totalFailed: 0 });
    expect(calls).toHaveLength(1);
    expect(Array.isArray(calls[0].payload)).toBe(mode === 'batch');
    for (const id of ids) {
      expect(await readChild(id)).toMatchObject({
        first_name: 'Recovered', age: 8, updated_at: ARCHIVED_AT, row_version: 2, sync_status: 'synced',
        history_reference: 0, server_updated_at: null,
      });
    }
    expect(await outbox.countUnsent()).toMatchObject({ total: 0 });
  });

  test.each(['single', 'batch'])('newer queued edit is not overwritten: %s', async mode => {
    const ids = mode === 'batch' ? [CHILD_ID, SIBLING_ID] : [CHILD_ID];
    for (const id of ids) await children.saveChildRecord(childPayload(id));
    const { supabaseClient, calls } = createSupabaseMock({ upsertResults: {
      children: async () => {
        await children.updateChild(CHILD_ID, { first_name: 'Newer edit' });
        return { error: null };
      },
    } });
    const engine = makeEngine(supabaseClient);
    expect(await engine.syncAll()).toMatchObject({ totalSynced: ids.length, totalFailed: 0 });
    expect(calls).toHaveLength(1);
    expect(Array.isArray(calls[0].payload)).toBe(mode === 'batch');
    expect(await outbox.getById(`children:${CHILD_ID}:insert`)).toBeNull();
    expect(await outbox.getById(`children:${CHILD_ID}:update`)).toMatchObject({
      status: 'pending', payload: { first_name: 'Newer edit' },
    });
    expect(await readChild()).toMatchObject({ first_name: 'Newer edit', row_version: 2, sync_status: 'pending' });
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(calls[1].payload).toMatchObject({ first_name: 'Newer edit', row_version: 3 });
    expect(await readChild()).toMatchObject({ first_name: 'Newer edit', row_version: 3, sync_status: 'synced' });
    expect(await outbox.countUnsent()).toMatchObject({ total: 0 });
  });

  test.each(['archive', 'restore'])('%s success applies only lifecycle columns', async operation => {
    await children.saveChildRecord({
      ...childPayload(), archived_at: ARCHIVED_AT, archive_reason: 'Keep reason', sync_status: 'synced',
    });
    const archivedAt = operation === 'archive' ? REPLACEMENT_ARCHIVED_AT : null;
    await enqueue(operation, {
      ...childPayload(), first_name: 'Stale name', created_by: 'other-user',
      archived_at: archivedAt, archived_by_user_id: 'user-1',
    });
    const { supabaseClient, calls } = createSupabaseMock();
    expect(await makeEngine(supabaseClient).syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(calls[0].payload).toEqual({ archived_at: archivedAt, archived_by_user_id: 'user-1', row_version: 2 });
    expect(await readChild()).toMatchObject({
      first_name: 'Original', created_by: 'user-1', archived_at: archivedAt,
      archived_by_user_id: 'user-1', archive_reason: 'Keep reason', row_version: 2, sync_status: 'synced',
    });
    expect(await outbox.countUnsent()).toMatchObject({ total: 0 });
  });

  test('update success applies only the accepted patch', async () => {
    await children.saveChildRecord({
      ...childPayload(), archived_at: ARCHIVED_AT, archived_by_user_id: 'user-1',
      archive_reason: 'Keep reason', sync_status: 'synced',
    });
    const before = await readChild();
    await enqueue('update', {
      ...childPayload(), first_name: 'Corrected', created_by: 'other-user', created_at: '2000-01-01T00:00:00.000Z',
      updated_at: REPLACEMENT_ARCHIVED_AT,
      archived_at: null, archived_by_user_id: null, archive_reason: null,
      history_reference: 1, server_updated_at: ARCHIVED_AT,
    });
    const { supabaseClient, calls } = createSupabaseMock();
    expect(await makeEngine(supabaseClient).syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(calls[0].payload).toEqual({
      first_name: 'Corrected', last_name: 'Child', updated_at: REPLACEMENT_ARCHIVED_AT, row_version: 2,
    });
    expect(await readChild()).toMatchObject({
      first_name: 'Corrected', created_by: before.created_by, created_at: before.created_at,
      archived_at: ARCHIVED_AT, archived_by_user_id: 'user-1', archive_reason: 'Keep reason',
      updated_at: REPLACEMENT_ARCHIVED_AT,
      history_reference: 0, server_updated_at: null, row_version: 2, sync_status: 'synced',
    });
    expect(await outbox.countUnsent()).toMatchObject({ total: 0 });
  });

  test.each(['insert', 'update', 'archive', 'restore'])('each operation carries row_version: %s', async operation => {
    await seedChild();
    const archivedAt = operation === 'archive' ? ARCHIVED_AT : null;
    await enqueue(operation, { ...childPayload(), archived_at: archivedAt });
    const { supabaseClient, calls } = createSupabaseMock();
    expect((await makeEngine(supabaseClient).syncAll()).totalSynced).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].payload.row_version).toBe(2);
    if (operation === 'archive' || operation === 'restore') {
      expect(calls[0].payload).toEqual({ archived_at: archivedAt, row_version: 2 });
    }
    expect(await readChild()).toMatchObject({ row_version: 2, sync_status: 'synced' });
  });

  test('immutable insert is not stamped, but its later archive carries version 2', async () => {
    await seedChild();
    await children.saveStaffChild({
      id: 'assignment-1', child_id: CHILD_ID, user_id: 'user-1', created_by: 'user-1',
      assigned_at: '2026-10-18T07:00:00.000Z',
    });
    const assignment = await db.getFirstAsync('select * from child_ea_assignments');
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = makeEngine(supabaseClient);
    expect((await engine.syncAll()).totalSynced).toBe(1);
    expect(calls[0].options.ignoreDuplicates).toBe(true);
    expect(calls[0].payload).not.toHaveProperty('row_version');
    expect(await db.getFirstAsync('select row_version from child_ea_assignments')).toEqual({ row_version: 1 });
    await enqueue('archive', { id: assignment.id, unassigned_at: ARCHIVED_AT }, 'child_ea_assignments');
    expect((await engine.syncAll()).totalSynced).toBe(1);
    expect(calls[1].payload).toEqual({ unassigned_at: ARCHIVED_AT, row_version: 2 });
    expect(await db.getFirstAsync('select row_version from child_ea_assignments')).toEqual({ row_version: 2 });
  });

  test('hard_delete is not stamped', async () => {
    await seedChild();
    const id = await enqueue('hard_delete');
    const [claimed] = await outbox.markInFlightAndGet([id]);
    expect(claimed.payload).not.toHaveProperty('row_version');
    expect((await readChild()).row_version).toBe(1);
    await outbox.markReady(id);
    const { supabaseClient, calls } = createSupabaseMock();
    expect((await makeEngine(supabaseClient).syncAll()).totalSynced).toBe(1);
    expect(calls).toEqual([{ type: 'rpc', functionName: 'delete_child_if_no_history', args: { p_child_id: CHILD_ID } }]);
    expect((await readChild()).row_version).toBe(1);
  });

  test('a missing local row is claimed without a version', async () => {
    const id = await enqueue('insert');
    expect((await outbox.markInFlightAndGet([id]))[0]).toMatchObject({ status: 'in_flight', payload: childPayload() });
    expect((await outbox.getById(id)).payload).not.toHaveProperty('row_version');
  });

  test.each(['markInFlight', 'markInFlightAndGet'])('%s rolls back claim and version if payload stamping fails', async method => {
    await seedChild();
    const id = await enqueue('update');
    await db.execAsync(`create trigger refuse_payload_stamp before update of payload on sync_outbox
      begin select raise(abort, 'payload stamp refused'); end`);
    await expect(outbox[method]([id])).rejects.toMatchObject({
      code: 'SQLITE_CONSTRAINT_TRIGGER', message: 'payload stamp refused',
    });
    expect((await readChild()).row_version).toBe(1);
    expect(await outbox.getById(id)).toMatchObject({ status: 'pending', payload: childPayload() });
  });

  describe.each(['after claim', 'request start'])('claim snapshot: replacement at %s', timing => {
    test.each(['edit', 'lifecycle', 'batch fallback edit', 'batch fallback lifecycle'])('%s keeps the claimed content and sends the replacement next', async scenario => {
      const fallback = scenario.startsWith('batch fallback');
      const lifecycle = scenario.endsWith('lifecycle');
      await seedChild();
      let slotId;
      if (fallback) {
        slotId = await enqueue('insert');
        await seedChild(SIBLING_ID);
        await enqueue('insert', childPayload(SIBLING_ID));
      } else if (lifecycle) {
        await children.archiveChild(CHILD_ID, { archivedAt: ARCHIVED_AT });
        slotId = (await outbox.getReadyRecords())[0].id;
      } else {
        await children.updateChild(CHILD_ID, { first_name: 'Claimed' });
        slotId = (await outbox.getReadyRecords())[0].id;
      }
      const replace = jest.fn(async () => {
        if (lifecycle) {
          await children.archiveChild(CHILD_ID, { archivedAt: REPLACEMENT_ARCHIVED_AT });
          if (fallback) {
            // The outstanding INSERT also gets a new lifecycle snapshot before acknowledgement.
            await children.saveChildRecord({ ...childPayload(), archived_at: REPLACEMENT_ARCHIVED_AT });
          }
        } else if (fallback) {
          await children.saveChildRecord({ ...childPayload(), first_name: 'Replacement' });
        } else {
          await children.updateChild(CHILD_ID, { first_name: 'Replacement' });
        }
      });
      const replaceOnce = async () => { if (replace.mock.calls.length === 0) await replace(); };
      // Both public claim APIs cross this barrier after the transaction commits. The old
      // two-call single-send path would then getById and accidentally send the replacement.
      const wrapped = { ...outbox };
      for (const method of ['markInFlight', 'markInFlightAndGet']) {
        wrapped[method] = async ids => {
          const claimed = await outbox[method](ids);
          if (timing === 'after claim' && ids.length === 1 && ids[0] === slotId) await replaceOnce();
          return claimed;
        };
      }
      const onRequest = async ({ payload, value }) => {
        if (Array.isArray(payload)) return { error: { message: 'batch refused' } };
        if ((value || payload.id) === CHILD_ID && timing === 'request start') await replaceOnce();
        return { data: [{ id: value || payload.id }], error: null };
      };
      const { supabaseClient, calls } = createSupabaseMock({
        upsertResults: { children: onRequest }, updateResults: { children: onRequest },
      });
      const engine = makeEngine(supabaseClient, wrapped);
      const first = await engine.syncAll();
      expect(first.totalFailed).toBe(0);
      expect(replace).toHaveBeenCalledTimes(1);
      const targetCalls = () => calls.filter(call => !Array.isArray(call.payload)
        && (call.value || call.payload.id) === CHILD_ID);
      const claimedVersion = fallback ? 3 : 2;
      expect(targetCalls()).toHaveLength(1);
      expect(targetCalls()[0].payload).toMatchObject(lifecycle && !fallback
        ? { archived_at: ARCHIVED_AT, row_version: claimedVersion }
        : { first_name: fallback ? 'Original' : 'Claimed', row_version: claimedVersion });
      if (fallback && lifecycle) expect(targetCalls()[0].payload.archived_at).toBeUndefined();
      expect(await outbox.getById(slotId)).toMatchObject({ status: 'pending' });
      expect(await readChild()).toMatchObject({ row_version: claimedVersion, sync_status: 'pending' });

      expect((await engine.syncAll()).totalFailed).toBe(0);
      expect(targetCalls()[1].payload).toMatchObject(lifecycle
        ? { archived_at: REPLACEMENT_ARCHIVED_AT, row_version: claimedVersion + 1 }
        : { first_name: 'Replacement', row_version: claimedVersion + 1 });
      expect(await outbox.getById(slotId)).toBeNull();
      expect(await db.getAllAsync('select id, status, last_error from sync_outbox')).toEqual([]);
      expect(await outbox.countUnsent()).toMatchObject({ total: 0 });
      expect(await readChild()).toMatchObject({ sync_status: 'synced' });
    });
  });

  test('create then edit before first upload sends insert v2 before edit v3 and both are accepted', async () => {
    await children.saveChildRecord(childPayload());
    await children.updateChild(CHILD_ID, { first_name: 'Edited' });
    const server = createVersionedServer();
    const result = await makeEngine(server.supabaseClient).syncAll();
    expect(result.totalSynced).toBe(2);
    expect(result.totalTerminal).toBe(0);
    expect(server.calls.map(call => [call.type, call.payload.row_version])).toEqual([['upsert', 2], ['update', 3]]);
    expect(server.rows.get(CHILD_ID)).toMatchObject({ first_name: 'Edited', row_version: 3 });
    expect(await outbox.countUnsent()).toMatchObject({ total: 0 });
  });

  test.each(['MV001', '42501'])('terminal recovery keeps the recovered edit after %s', async code => {
    const localVersion = code === '42501' ? 7 : 1;
    await children.saveChildRecord({ ...childPayload(), row_version: localVersion, sync_status: 'synced' });
    await children.updateChild(CHILD_ID, { first_name: 'Corrected' });
    const server = createVersionedServer([{ ...childPayload(), row_version: 7 }], {
      firstUpdateError: code === '42501' ? { code, message: 'row-level security policy denied update' } : null,
    });
    const engine = makeEngine(server.supabaseClient);

    expect(await engine.syncAll()).toMatchObject({ totalSynced: 0, totalTerminal: 1 });
    expect(await readChild()).toMatchObject({ first_name: 'Corrected', row_version: localVersion + 1, sync_status: 'terminal' });
    expect(await children.saveServerChildRows([{ ...server.rows.get(CHILD_ID), sync_status: 'synced' }]))
      .toMatchObject({ applied: 1, failed: 0 });
    expect(await readChild()).toMatchObject({ first_name: 'Original', row_version: 7, sync_status: 'synced' });
    expect((await outbox.getTerminalRecords())[0].payload.first_name).toBe('Corrected');

    expect(await engine.syncAll({ force: true })).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(server.calls[1].payload).toMatchObject({ first_name: 'Corrected', row_version: 8 });
    expect(server.rows.get(CHILD_ID)).toMatchObject({ first_name: 'Corrected', row_version: 8 });
    expect(await readChild()).toMatchObject({ first_name: 'Corrected', row_version: 8, sync_status: 'synced' });

    await children.updateChild(CHILD_ID, { age: 8 });
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(server.calls[2].payload).toMatchObject({ first_name: 'Corrected', age: 8, row_version: 9 });
    expect(server.rows.get(CHILD_ID)).toMatchObject({ first_name: 'Corrected', age: 8, row_version: 9 });
    expect(await outbox.countUnsent()).toMatchObject({ total: 0 });
  });

  test('a forced terminal retry is protected from an overlapping pull', async () => {
    await seedChild();
    await children.updateChild(CHILD_ID, { first_name: 'Claimed' });
    await db.runAsync("update children set row_version = 7, sync_status = 'terminal' where id = ?", CHILD_ID);
    await db.runAsync("update sync_outbox set status = 'terminal'");
    const pull = jest.fn(async () => {
      await children.saveServerChildRows([{ ...childPayload(), first_name: 'Old pull', row_version: 4, sync_status: 'synced' }]);
    });
    const wrapped = { ...outbox };
    for (const method of ['markInFlight', 'markInFlightAndGet']) {
      wrapped[method] = async ids => {
        const claimed = await outbox[method](ids);
        if (pull.mock.calls.length === 0) await pull();
        return claimed;
      };
    }
    const server = createVersionedServer([{ ...childPayload(), row_version: 7 }]);
    const engine = makeEngine(server.supabaseClient, wrapped);
    expect((await engine.syncAll()).totalSynced).toBe(0);
    expect(pull).not.toHaveBeenCalled();
    expect((await engine.syncAll({ force: true })).totalSynced).toBe(1);
    expect(pull).toHaveBeenCalledTimes(1);
    expect(server.calls[0].payload).toMatchObject({ first_name: 'Claimed', row_version: 8 });
    expect(await readChild()).toMatchObject({ first_name: 'Claimed', row_version: 8, sync_status: 'synced' });
    await children.updateChild(CHILD_ID, { first_name: 'Next edit' });
    expect((await engine.syncAll()).totalSynced).toBe(1);
    expect(server.calls[1].payload).toMatchObject({ first_name: 'Next edit', row_version: 9 });
    expect(server.rows.get(CHILD_ID)).toMatchObject({ first_name: 'Next edit', row_version: 9 });
    expect(await outbox.countUnsent()).toMatchObject({ total: 0 });
  });

  test.each(['time_entries', 'sessions', 'letter_mastery'])('unversioned tables send no row_version: %s', async tableName => {
    await enqueue('insert', {
      id: CHILD_ID, user_id: 'user-1', child_id: CHILD_ID, programme_id: 'programme-1', row_version: 99,
      letter: 'a', language: 'isiXhosa', source: 'taught',
    }, tableName);
    const { supabaseClient, calls } = createSupabaseMock();
    expect((await makeEngine(supabaseClient).syncAll()).totalSynced).toBe(1);
    expect(calls[0].payload).not.toHaveProperty('row_version');
  });
});
