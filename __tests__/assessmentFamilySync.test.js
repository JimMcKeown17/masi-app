jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { v4 as uuid } from 'uuid';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { createFamilySyncFixture, questionResult } from '../test-support/assessmentFamilySyncTestUtils';
import { toSubmitArgs } from '../src/services/assessmentFamilyPayload';
import { _testBuildSyncPayload, _testClassifyError, __contract, _testEvidenceMaps } from '../src/services/offlineSync';
import { LEGACY_PROGRAMME_ID, childEaAssignmentDomainId } from '../src/db/repositories/domainRepositoryUtils';
import { createReferenceDataRepository } from '../src/db/repositories/referenceDataRepository';
import { VERSIONED_TABLES } from '../src/db/repositories/rowVersion';

describe('one assessment family, one call, one acknowledgement through real SQLite', () => {
  let f, client;
  beforeEach(async () => {
    f = await createFamilySyncFixture();
    client = createSupabaseMock({
      rpcResults: {
        submit_assessment: { data: 'inserted', error: null },
        save_battery_run: { data: 'inserted', error: null },
      },
    }).supabaseClient;
  });
  afterEach(async () => { await f.db.closeAsync(); });
  const queued = id => f.outbox.getById(`assessments:${id}:insert`);
  const expectSynced = async (id, count) => {
    expect((await f.read(id)).sync_status).toBe('synced');
    const items = await f.items(id);
    expect(items).toHaveLength(count);
    expect(items.every(item => item.sync_status === 'synced' && item.last_sync_error === null)).toBe(true);
    expect(await queued(id)).toBeNull();
  };

  test('61 items use exactly one RPC with filtered immutable args, then all rows are acknowledged', async () => {
    const { id } = await f.save(61);
    const original = (await queued(id)).payload;
    const decorated = {
      ...original, updated_at: 'not sent', sync_status: 'pending', items_tested: ['old summary'],
      unknown: 'parent view model', row_version: 5,
      items: original.items.map(item => ({ ...item, updated_at: 'not sent', sync_status: 'pending', unknown: 'item view model' })),
    };
    const before = JSON.stringify(decorated);
    const args = toSubmitArgs(decorated);
    expect(JSON.stringify(decorated)).toBe(before);
    expect(_testBuildSyncPayload('assessments', decorated, 'insert')).toEqual(args);
    expect(args.p_assessment).toMatchObject({ id, total_items: 61, question_code: 'letter_sounds' });
    for (const key of ['updated_at', 'sync_status', 'items', 'items_tested', 'unknown', 'row_version']) {
      expect(args.p_assessment).not.toHaveProperty(key);
    }
    for (const item of args.p_items) {
      expect(typeof item.is_correct).toBe('boolean');
      for (const key of ['updated_at', 'sync_status', 'unknown']) expect(item).not.toHaveProperty(key);
    }
    await f.db.runAsync('update sync_outbox set payload = ? where record_id = ?', JSON.stringify(decorated), id);
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith('submit_assessment', args);
    expect(args.p_items).toHaveLength(61);
    expect(client.from).not.toHaveBeenCalled();
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
    await expectSynced(id, 61);
  });

  test('a failed item acknowledgement rolls back the already-deleted outbox and parent update', async () => {
    const { id } = await f.save(3);
    await f.db.execAsync(`create trigger fail_item_ack before update of sync_status on assessment_items
      when new.sync_status = 'synced'
      begin
        select case when exists (select 1 from sync_outbox where record_id = old.assessment_id)
          then raise(abort, 'outbox was not deleted first') end;
        select case when (select sync_status from assessments where id = old.assessment_id) <> 'synced'
          then raise(abort, 'parent was not updated first') end;
        select raise(abort, 'injected');
      end`);
    const engine = f.engine(client);
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 0, totalRetriable: 1 });
    expect(await queued(id)).toMatchObject({ last_error: 'injected' });
    expect((await f.read(id)).sync_status).not.toBe('synced');
    expect((await f.items(id)).every(item => item.sync_status !== 'synced')).toBe(true);
    await f.db.execAsync('drop trigger fail_item_ack');
    client.rpc.mockResolvedValue({ data: 'already_present', error: null });
    expect(await engine.syncAll({ force: true })).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    await expectSynced(id, 3);
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });

  test('already_present acknowledges the whole family', async () => {
    const { id } = await f.save(2);
    client.rpc.mockResolvedValue({ data: 'already_present', error: null });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1 });
    await expectSynced(id, 2);
  });

  test.each([
    ['MA001', 'terminal'], ['22023', 'terminal'], ['28000', 'failed'], ['23505', 'terminal'],
  ])('%s leaves the parent %s and every item unsynced', async (code, status) => {
    const { id } = await f.save();
    client.rpc.mockResolvedValue({ data: null, error: { code, message: `refused ${code}` } });
    const result = await f.engine(client, { safeDuplicateSuccessTables: ['assessments'] }).syncAll();
    expect(result).toMatchObject({ totalSynced: 0, totalTerminal: status === 'terminal' ? 1 : 0 });
    expect(await queued(id)).toMatchObject({ status });
    expect((await f.read(id)).sync_status).toBe(status);
    expect((await f.items(id)).every(item => item.sync_status !== 'synced')).toBe(true);
  });

  test.each(['assessments', 'battery_runs'])('unknown %s RPC responses fail terminally', async table => {
    const { id } = table === 'assessments' ? await f.save() : await f.start();
    client.rpc.mockResolvedValue({ data: 'unexpected', error: null });
    expect(_testClassifyError({ code: 'UNEXPECTED_RPC_RESULT' }, { tableName: table })).toMatchObject({ terminal: true });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 0, totalTerminal: 1 });
    expect(await f.outbox.getById(`${table}:${id}:insert`)).toMatchObject({
      status: 'terminal', last_error: expect.stringContaining('unexpected'),
    });
  });

  test('a malformed queued family is refused locally as terminal 22023 without a network request', async () => {
    const { id } = await f.save();
    const payload = (await queued(id)).payload;
    payload.items[0].is_correct = 1;
    expect(() => toSubmitArgs(payload)).toThrow(TypeError);
    await f.db.runAsync('update sync_outbox set payload = ? where record_id = ?', JSON.stringify(payload), id);
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 0, totalTerminal: 1 });
    expect(await queued(id)).toMatchObject({ status: 'terminal', last_error: expect.stringContaining('is_correct') });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  test.each(['assessments', 'battery_runs'])('the legacy programme guard refuses %s before any RPC', async table => {
    const { id } = table === 'assessments' ? await f.save() : await f.start();
    const slot = `${table}:${id}:insert`;
    const payload = (await f.outbox.getById(slot)).payload;
    payload.programme_id = LEGACY_PROGRAMME_ID;
    await f.db.runAsync('update sync_outbox set payload = ? where id = ?', JSON.stringify(payload), slot);
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 0, totalTerminal: 1 });
    expect(await f.outbox.getById(slot)).toMatchObject({
      status: 'terminal', last_error: 'Record is missing an active programme assignment and cannot be synced',
    });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  test('1,050 unrelated rows plus three families drain in bounded passes without splitting any family', async () => {
    await f.db.withExclusiveTransactionAsync(async txn => {
      for (let index = 0; index < 1050; index += 1) {
        const id = uuid();
        const payload = { id, user_id: f.userId, sign_in_time: '2026-10-20T08:00:00.000Z' };
        await txn.runAsync('insert into time_entries (id, user_id, sign_in_time) values (?, ?, ?)', id, f.userId, payload.sign_in_time);
        await f.outbox.enqueue({ tableName: 'time_entries', recordId: id, operation: 'insert', payload }, { transaction: txn });
      }
    });
    // Keep all 1,050 unrelated rows before the families in the ready window, even on fast clocks.
    await f.db.runAsync("update sync_outbox set created_at = '2026-01-01T00:00:00.000Z'");
    const counts = new Map();
    for (const count of [1, 61, 7]) counts.set((await f.save(count)).id, count);
    const engine = f.engine(client);
    let passes = 0;
    while ((await f.outbox.countUnsent()).total && passes < 5) {
      expect(await engine.syncAll()).toMatchObject({ totalFailed: 0 });
      passes += 1;
    }
    expect(passes).toBeGreaterThan(1);
    expect((await f.outbox.countUnsent()).total).toBe(0);
    const submits = client.rpc.mock.calls.filter(([name]) => name === 'submit_assessment');
    expect(submits).toHaveLength(3);
    for (const [, { p_assessment, p_items }] of submits) {
      expect(p_items).toHaveLength(counts.get(p_assessment.id));
      expect(p_assessment.total_items).toBe(p_items.length);
      await expectSynced(p_assessment.id, counts.get(p_assessment.id));
    }
  });

  test('30 denied families retain assignment evidence and one manual force:true pass drains all after recovery', async () => {
    const assignmentId = childEaAssignmentDomainId({ userId: f.userId, childId: f.childId });
    const payload = { id: assignmentId, user_id: f.userId, child_id: f.childId, assigned_at: '2026-01-15T00:00:00.000Z' };
    await f.db.runAsync('insert into child_ea_assignments (id, user_id, child_id, assigned_at) values (?, ?, ?, ?)',
      assignmentId, f.userId, f.childId, payload.assigned_at);
    await f.outbox.enqueue({ tableName: 'child_ea_assignments', recordId: assignmentId, operation: 'insert', payload });
    const ids = [];
    for (let index = 0; index < 30; index += 1) ids.push((await f.save(2)).id);
    let allowAssignment = false, assignmentOnServer = false;
    const server = createSupabaseMock({ upsertResults: {
      child_ea_assignments: () => {
        if (!allowAssignment) return { error: { code: 'NETWORK', message: 'offline assignment' } };
        assignmentOnServer = true;
        return { error: null };
      },
    } }).supabaseClient;
    server.rpc.mockImplementation(async name => {
      expect(name).toBe('submit_assessment');
      return assignmentOnServer
        ? { data: 'inserted', error: null }
        : { data: null, error: { code: '42501', message: 'assignment not on server' } };
    });
    const engine = f.engine(server);
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 0, totalTerminal: 0 });
    expect(server.rpc).toHaveBeenCalledTimes(30);
    for (const id of ids) expect(['pending', 'failed']).toContain((await queued(id)).status);
    expect(await f.db.getAllAsync("select * from sync_outbox where status = 'terminal'")).toEqual([]);
    allowAssignment = true;
    // OfflineContext/SyncStatusScreen's manual Sync button explicitly bypasses retry backoff.
    expect(await engine.syncAll({ force: true })).toMatchObject({ totalSynced: 31, totalFailed: 0 });
    for (const id of ids) await expectSynced(id, 2);
    expect((await f.outbox.countUnsent()).total).toBe(0);
  });

  test('a run uploads before both Questions and never sends local columns or a row version', async () => {
    const { id: runId } = await f.start();
    const first = await f.save(2, { batteryRunId: runId });
    const second = await f.save(3, { batteryRunId: runId, result: questionResult(3, { question_code: 'read_words' }) });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 3, totalFailed: 0 });
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(['save_battery_run', 'submit_assessment', 'submit_assessment']);
    const p_run = client.rpc.mock.calls[0][1].p_run;
    expect(p_run).toMatchObject({ id: runId, status: 'in_progress', programme_id: f.programmeId });
    for (const key of ['updated_at', 'started_here', 'sync_status', 'row_version']) expect(p_run).not.toHaveProperty(key);
    expect(VERSIONED_TABLES.has('battery_runs')).toBe(false);
    expect(_testEvidenceMaps.PARENT_FK_COLUMNS.battery_runs).toEqual({ children: 'child_id' });
    expect(__contract.PUSH_ORDER).not.toContain('assessment_items');
    await expectSynced(first.id, 2); await expectSynced(second.id, 3);
  });

  test.each(['unchanged', 'updated'])('%s acknowledges a run update and preserves stored started_at byte for byte', async response => {
    const { id } = await f.start();
    const storedStart = '2026-10-20T10:00:00.123000+02:00';
    await f.db.runAsync('update battery_runs set started_at = ? where id = ?', storedStart, id);
    const initial = await f.outbox.getById(`battery_runs:${id}:insert`);
    initial.payload.started_at = storedStart;
    initial.payload.started_here = 1;
    initial.payload.updated_at = 'must not be sent';
    initial.payload.row_version = 99;
    await f.db.runAsync('update sync_outbox set payload = ? where id = ?', JSON.stringify(initial.payload), initial.id);
    const engine = f.engine(client);
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 1 });
    await f.runs.finalizeRun(id);
    expect(await f.outbox.getById(`battery_runs:${id}:update`)).not.toBeNull();
    client.rpc.mockResolvedValue({ data: response, error: null });
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 1 });
    expect(client.rpc).toHaveBeenCalledTimes(2);
    for (const [name, { p_run }] of client.rpc.mock.calls) {
      expect(name).toBe('save_battery_run');
      expect(p_run.started_at).toBe(storedStart);
      for (const key of ['updated_at', 'started_here', 'row_version']) expect(p_run).not.toHaveProperty(key);
    }
    expect(await f.runs.getRunWithResults(id)).toMatchObject({ status: 'completed', sync_status: 'synced', started_at: storedStart });
    expect((await f.outbox.countUnsent()).total).toBe(0);
  });

  test('MA002 makes the run terminal', async () => {
    const { id } = await f.start();
    client.rpc.mockResolvedValue({ data: null, error: { code: 'MA002', message: 'conflicting terminal run' } });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalTerminal: 1, totalSynced: 0 });
    expect(await f.outbox.getById(`battery_runs:${id}:insert`)).toMatchObject({ status: 'terminal' });
    expect(await f.runs.getRunWithResults(id)).toMatchObject({ sync_status: 'terminal' });
  });

  test('canonical programme repair retargets both queued run and family RPC payloads', async () => {
    const { id: runId } = await f.start();
    const { id } = await f.save(2, { batteryRunId: runId });
    const canonicalId = uuid();
    const programmes = createReferenceDataRepository({ database: f.db, tableName: 'programmes' });
    await programmes.replaceFromServer([{ id: canonicalId, code: 'literacy', name: 'Literacy' }]);
    expect((await f.read(id)).programme_id).toBe(canonicalId);
    expect((await f.runs.getRunWithResults(runId)).programme_id).toBe(canonicalId);
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 2, totalFailed: 0 });
    expect(client.rpc.mock.calls[0][1].p_run.programme_id).toBe(canonicalId);
    expect(client.rpc.mock.calls[1][1].p_assessment.programme_id).toBe(canonicalId);
  });

  test.each([['NETWORK', 'failed'], ['MA002', 'terminal']])('a %s run blocks only its linked family, not a standalone family', async (code, status) => {
    const { id: runId } = await f.start();
    const linked = await f.save(2, { batteryRunId: runId });
    const standalone = await f.save(3);
    client.rpc.mockImplementation(async name => name === 'save_battery_run'
      ? { data: null, error: { code, message: 'run refused' } }
      : { data: 'inserted', error: null });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1 });
    expect(await f.outbox.getById(`battery_runs:${runId}:insert`)).toMatchObject({ status });
    expect(await queued(linked.id)).not.toBeNull();
    expect((await f.items(linked.id)).every(item => item.sync_status !== 'synced')).toBe(true);
    const submits = client.rpc.mock.calls.filter(([name]) => name === 'submit_assessment');
    expect(submits).toHaveLength(1);
    expect(submits[0][1].p_assessment.id).toBe(standalone.id);
    await expectSynced(standalone.id, 3);
  });

  test.each(['changed claim', 'another outbox row'])('a successful RPC cannot acknowledge items with %s remaining', async race => {
    const { id } = await f.save(2);
    client.rpc.mockImplementation(async () => {
      if (race === 'changed claim') {
        await f.db.runAsync("update sync_outbox set updated_at = '2099-01-01T00:00:00.000Z', status = 'pending' where record_id = ?", id);
      } else {
        const payload = (await queued(id)).payload;
        await f.outbox.enqueue({ tableName: 'assessments', recordId: id, operation: 'insert', payload, id: `assessments:${id}:another` });
      }
      return { data: 'inserted', error: null };
    });
    await f.engine(client).syncAll();
    expect((await f.read(id)).sync_status).toBe('pending');
    expect((await f.items(id)).every(item => item.sync_status !== 'synced')).toBe(true);
    expect((await f.outbox.countUnsent()).total).toBe(1);
  });
});
