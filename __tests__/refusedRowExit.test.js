jest.mock('expo-file-system/next', () => {
  class File { constructor(...p) { this.uri = p.map(x => x.uri ?? x).join('/'); } get exists() { return false; } create() {} write() {} delete() {} }
  class Directory { constructor(...p) { this.uri = p.map(x => x.uri ?? x).join('/'); } create() {} list() { return []; } }
  return { File, Directory, Paths: { document: 'file:///documents', availableDiskSpace: 123, totalDiskSpace: 456 } };
});
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(async () => ({ type: 'wifi', isConnected: true })) }));
jest.mock('../src/utils/runtimeDiagnostics', () => ({ getRuntimeDiagnostics: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { observeStandingConditions } from '../src/services/supportIncidents';
import { deliveredReceiptKey } from '../src/db/repositories/supportIncidentRepository';
import { INSTALL_ID_KEY, resetInstallIdForTests } from '../src/services/installId';
import { getRuntimeDiagnostics } from '../src/utils/runtimeDiagnostics';

// Lifecycle safety O1 item 2: a refused row leaves the phone only once the office holds a
// delivered upload_terminal receipt of its exact current revision, untruncated. Refused archives
// and edits then clear by themselves; refused history offers the EA the exit.
const runtime = (deviceName = 'phone') => ({
  application: { version: '1.5.0', build: '60' }, update: { id: 'ota-1' },
  backend: { projectId: 'segygjzpujphwvrubusm' }, device: { deviceName },
});
const DENIED = { error: { code: '42501', message: 'new row violates row-level security policy' } };
const NOT_APPLIED = { data: [], error: null };

let h;
let server;
let calls;
let supabaseClient;
let engine;

const reports = () => calls.filter(call => call.type === 'rpc' && call.functionName === 'report_mobile_support_incident_v2');
const outboxRow = id => h.getReader().then(db => db.getFirstAsync('select * from sync_outbox where id = ?', id));
const incidents = () => h.getReader().then(db => db.getAllAsync('select * from support_incident_queue order by created_at, id'));
const itemFor = async id => (await engine.getSyncStatus()).needsAttentionItems.find(item => item.outboxId === id);
// One pass uploads, the status refresh records the receipt, the next pass delivers it.
const syncAndReport = async (options) => {
  await engine.syncAll(options);
  await engine.getSyncStatus();
  await engine.syncAll();
};

beforeEach(async () => {
  h = getDefaultTestHandle();
  getRuntimeDiagnostics.mockReturnValue(runtime());
  resetInstallIdForTests();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(INSTALL_ID_KEY, 'install-1');
  // No automatic diagnostic bundle: receipts go straight to the office.
  await h.services.repositories.localState.set('support_auto_bundle_last_at', '2099-01-01T00:00:00.000Z');
  server = { time_entries: DENIED, children: DENIED, classesUpdate: NOT_APPLIED, childrenUpdate: null };
  ({ supabaseClient, calls } = createSupabaseMock({
    upsertResults: { time_entries: () => server.time_entries, children: () => server.children },
    updateResults: {
      classes: ({ value }) => server.classesUpdate || { data: [{ id: value }], error: null },
      children: ({ value }) => server.childrenUpdate || { data: [{ id: value }], error: null },
    },
    rpcResults: { report_mobile_support_incident_v2: { data: { status: 'inserted' }, error: null } },
  }));
  engine = createOutboxSyncEngine({
    database: h, supabaseClient,
    outboxRepository: h.services.repositories.syncOutbox,
    stateRepository: h.services.repositories.syncState,
    supportIncidentRepository: h.services.repositories.supportIncidents,
    observeStandingConditions: () => observeStandingConditions(h),
    enqueueRequest: task => task(),
    getAuthSession: async () => ({ data: { session: { user: { id: h.userId } } } }),
  });
});
afterEach(() => {
  jest.useRealTimers();
  resetInstallIdForTests();
});

const ENTRY_ID = '20000000-0000-4000-8000-000000000001';
const ENTRY_OUTBOX = `time_entries:${ENTRY_ID}:insert`;
const refuseTimeEntry = async () => {
  await h.services.repositories.timeEntries.saveTimeEntry({
    id: ENTRY_ID, user_id: h.userId, sign_in_time: '2026-11-04T07:00:00.000Z', sync_status: 'pending',
  });
  await engine.syncAll();
  expect(await outboxRow(ENTRY_OUTBOX)).toMatchObject({ status: 'terminal', error_code: '42501' });
};
const onlyDateFaked = () => jest.useFakeTimers({ doNotFake: [
  'nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
  'setTimeout', 'clearTimeout', 'hrtime', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback',
] });

test('happy path: once delivered, the EA removes refused history and the receipt is untouched', async () => {
  await refuseTimeEntry();
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'waiting', canRemove: false, clearsItself: false });
  expect(await engine.removeDeliveredItem(ENTRY_OUTBOX)).toMatchObject({ removed: false, delivery: 'waiting' });

  await engine.syncAll();
  expect(reports()).toHaveLength(1);
  expect(reports()[0].args.p_envelope.payload).toMatchObject({ outboxId: ENTRY_OUTBOX, table: 'time_entries' });
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'delivered', canRemove: true, canRetry: true });
  const [incident] = await incidents();
  expect(await h.services.repositories.localState.get(deliveredReceiptKey(incident.id)))
    .toMatchObject({ report_generation: 1, outboxId: ENTRY_OUTBOX, cut: false });

  expect(await engine.removeDeliveredItem(ENTRY_OUTBOX)).toEqual({ removed: true });
  expect(await outboxRow(ENTRY_OUTBOX)).toBeNull();
  expect(await incidents()).toEqual([incident]);
  expect((await engine.getSyncStatus()).needsAttentionItems).toEqual([]);
  // The local record stays on the phone; only the stuck upload left.
  expect(await (await h.getReader()).getFirstAsync('select id from time_entries where id = ?', ENTRY_ID)).toEqual({ id: ENTRY_ID });
});

test.each([
  ['an archive refused as not applied', async () => {
    await h.withTransaction(async txn => {
      await txn.runAsync(`insert into schools (id, name, sync_status) values ('school-1', 'Masi Primary', 'synced')`);
      await txn.runAsync(`insert into classes (id, school_id, name, grade, archived_at, sync_status)
        values ('class-1', 'school-1', 'Grade 1A', '1', '2026-11-04T08:00:00.000Z', 'pending')`);
    });
    await h.services.repositories.syncOutbox.enqueue({ tableName: 'classes', recordId: 'class-1', operation: 'archive',
      payload: { id: 'class-1', archived_at: '2026-11-04T08:00:00.000Z' } });
    return { id: 'classes:class-1:archive', code: 'ARCHIVE_NOT_APPLIED' };
  }],
  ['an edit refused as out of date', async () => {
    await h.withTransaction(txn => txn.runAsync(`insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-1', 'Stale', 'Edit', ?, 'pending')`, h.userId));
    await h.services.repositories.syncOutbox.enqueue({ tableName: 'children', recordId: 'child-1', operation: 'update',
      payload: { id: 'child-1', first_name: 'Stale' } });
    server.childrenUpdate = { error: { code: 'MV001', message: 'stale_version' } };
    return { id: 'children:child-1:update', code: 'MV001' };
  }],
])('%s clears by itself once its receipt is delivered, and never before', async (_name, seed) => {
  const { id, code } = await seed();
  await engine.syncAll();
  expect(await outboxRow(id)).toMatchObject({ status: 'terminal', error_code: code });
  // No receipt yet: a forced pass neither re-sends nor clears it.
  await engine.syncAll({ force: true });
  expect(await outboxRow(id)).toMatchObject({ status: 'terminal' });
  expect(await itemFor(id)).toMatchObject({ clearsItself: true, canRemove: false, canRetry: false, delivery: 'waiting' });
  // A receipt that fails to send clears nothing either.
  supabaseClient.rpc.mockImplementationOnce(async () => ({ data: null, error: { code: '08006', message: 'Network request failed' } }));
  await engine.syncAll();
  expect(await outboxRow(id)).toMatchObject({ status: 'terminal' });
  expect(await engine.removeDeliveredItem(id)).toMatchObject({ removed: false });

  await h.withTransaction(txn => txn.runAsync('update support_incident_queue set next_attempt_at = null'));
  await engine.syncAll();
  expect(reports()).toHaveLength(1);
  expect(await outboxRow(id)).toBeNull();
  const [incident] = await incidents();
  expect(incident).toMatchObject({ kind: 'upload_terminal', status: 'sent', report_generation: 1 });
  expect(calls.filter(call => call.type === 'update')).toHaveLength(1);
});

const enlargeEntry = (bytes) => h.withTransaction(txn => txn.runAsync(
  "update sync_outbox set payload = json_set(payload, '$.sign_in_location_status', ?) where id = ?", 'x'.repeat(bytes), ENTRY_OUTBOX));

test('an oversized payload truncated on send never gets the exit', async () => {
  await h.services.repositories.timeEntries.saveTimeEntry({
    id: ENTRY_ID, user_id: h.userId, sign_in_time: '2026-11-04T07:00:00.000Z', sync_status: 'pending',
  });
  await enlargeEntry(70000);
  await syncAndReport();
  expect(reports()).toHaveLength(1);
  expect(JSON.stringify(reports()[0].args.p_envelope.payload.wirePayload)).toContain('Truncated');
  const [incident] = await incidents();
  expect(await h.services.repositories.localState.get(deliveredReceiptKey(incident.id))).toMatchObject({ cut: true });
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'support', canRemove: false });
  expect(await engine.removeDeliveredItem(ENTRY_OUTBOX)).toMatchObject({ removed: false, delivery: 'support' });
  await engine.syncAll();
  expect(await outboxRow(ENTRY_OUTBOX)).toMatchObject({ status: 'terminal' });
  expect(reports()).toHaveLength(1);
});

test('a send cut only by large delivery metadata stays cut after the metadata shrinks', async () => {
  await h.services.repositories.timeEntries.saveTimeEntry({
    id: ENTRY_ID, user_id: h.userId, sign_in_time: '2026-11-04T07:00:00.000Z', sync_status: 'pending',
  });
  await enlargeEntry(30000);
  await engine.syncAll();
  await engine.getSyncStatus();
  // At send time the delivery block is large, so the wire payload is cut to fit.
  getRuntimeDiagnostics.mockReturnValue(runtime('d'.repeat(30000)));
  await engine.syncAll();
  getRuntimeDiagnostics.mockReturnValue(runtime());
  expect(reports()).toHaveLength(1);
  expect(JSON.stringify(reports()[0].args.p_envelope.payload.wirePayload)).toContain('Truncated');
  // A fresh bound of the same payload would now fit uncut; the accepted send decides.
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'support', canRemove: false });
  expect(await engine.removeDeliveredItem(ENTRY_OUTBOX)).toMatchObject({ removed: false });
  expect(await outboxRow(ENTRY_OUTBOX)).toMatchObject({ status: 'terminal' });
});

test('a receipt sent before this update has no proof: it is sent once more, then the exit opens', async () => {
  await refuseTimeEntry();
  await syncAndReport();
  const [incident] = await incidents();
  // A send by the previous bundle wrote no proof.
  await h.services.repositories.localState.remove(deliveredReceiptKey(incident.id));
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'waiting', canRemove: false });
  expect((await incidents())[0]).toMatchObject({ status: 'pending', report_generation: 2 });
  await engine.syncAll();
  expect(reports()).toHaveLength(2);
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'delivered', canRemove: true });
  // Once: later refreshes and passes do not send it again.
  await engine.syncAll();
  await engine.getSyncStatus();
  await engine.syncAll();
  expect(reports()).toHaveLength(2);
  expect(await engine.removeDeliveredItem(ENTRY_OUTBOX)).toEqual({ removed: true });
});

test('a receipt recorded by the previous bundle (no outbox id) and sent after the update is sent again', async () => {
  await refuseTimeEntry();
  await engine.getSyncStatus();
  // The receipt was recorded before this update, so its payload names no outbox row.
  await h.withTransaction(txn => txn.runAsync("update support_incident_queue set payload = json_remove(payload, '$.outboxId')"));
  await engine.syncAll();
  expect(reports()).toHaveLength(1);
  expect(reports()[0].args.p_envelope.payload.outboxId).toBeUndefined();
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'waiting', canRemove: false });
  await engine.syncAll();
  expect(reports()).toHaveLength(2);
  expect(reports()[1].args.p_envelope.payload.outboxId).toBe(ENTRY_OUTBOX);
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'delivered', canRemove: true });
});

test('a second refused revision under an already-sent receipt gets no exit until it is re-sent', async () => {
  onlyDateFaked();
  const start = Date.parse('2026-11-04T10:00:00.000Z');
  jest.setSystemTime(start);
  await refuseTimeEntry();
  await syncAndReport();
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'delivered' });

  // The EA clocks out: the same refused insert is queued again with new content.
  jest.setSystemTime(start + 60000);
  await h.services.repositories.timeEntries.updateTimeEntry(ENTRY_ID, { sign_out_time: '2026-11-04T15:00:00.000Z' });
  await engine.syncAll();
  const resent = await outboxRow(ENTRY_OUTBOX);
  expect(resent).toMatchObject({ status: 'terminal', error_code: '42501' });
  expect(JSON.parse(resent.payload)).toMatchObject({ sign_out_time: '2026-11-04T15:00:00.000Z' });
  expect(await incidents()).toHaveLength(1);
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'waiting', canRemove: false });
  expect(await engine.removeDeliveredItem(ENTRY_OUTBOX)).toMatchObject({ removed: false });
  await engine.syncAll();
  expect(reports()).toHaveLength(1);

  // The daily re-send delivers the new revision; then the exit opens.
  jest.setSystemTime(start + 24 * 3600000 + 1000);
  await engine.getSyncStatus();
  await engine.syncAll();
  expect(reports()).toHaveLength(2);
  expect(reports()[1].args.p_envelope.payload.wirePayload).toMatchObject({ sign_out_time: '2026-11-04T15:00:00.000Z' });
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'delivered', canRemove: true });
});

test('a payload changed after its receipt was sent gets no exit', async () => {
  await refuseTimeEntry();
  await syncAndReport();
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'delivered' });
  // Same row, same updated_at, different content: the digest alone must refuse the exit.
  await h.withTransaction(txn => txn.runAsync(
    "update sync_outbox set payload = json_set(payload, '$.sign_in_time', '2026-11-04T06:00:00.000Z') where id = ?", ENTRY_OUTBOX));
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'waiting', canRemove: false });
  expect(await engine.removeDeliveredItem(ENTRY_OUTBOX)).toMatchObject({ removed: false });
  // Back to the delivered content: the exit is offered again.
  await h.withTransaction(txn => txn.runAsync(
    "update sync_outbox set payload = json_set(payload, '$.sign_in_time', '2026-11-04T07:00:00.000Z') where id = ?", ENTRY_OUTBOX));
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'delivered' });
});

// The proof matches content, not timestamps: EAs pull to refresh constantly, and each forced
// re-send that is refused again gives the row a new updated_at with the same content.
test('a forced re-send refused again keeps the exit: the content the office holds is unchanged', async () => {
  await refuseTimeEntry();
  await syncAndReport();
  const before = await outboxRow(ENTRY_OUTBOX);
  await engine.syncAll({ force: true });
  const after = await outboxRow(ENTRY_OUTBOX);
  expect(after).toMatchObject({ status: 'terminal', error_code: '42501' });
  expect(after.updated_at).not.toBe(before.updated_at);
  expect(after.payload).toBe(before.payload);
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'delivered', canRemove: true });
  expect(reports()).toHaveLength(1);
  expect(await engine.removeDeliveredItem(ENTRY_OUTBOX)).toEqual({ removed: true });
});

// Home's dismissal is keyed by each item's content digest, which a re-refusal does not change.
test('an item\'s content digest is stable across a forced re-send and follows a content change', async () => {
  await refuseTimeEntry();
  const first = (await itemFor(ENTRY_OUTBOX)).contentDigest;
  expect(first).toEqual(expect.any(String));
  await engine.syncAll({ force: true });
  expect((await itemFor(ENTRY_OUTBOX)).contentDigest).toBe(first);
  await h.withTransaction(txn => txn.runAsync(
    "update sync_outbox set payload = json_set(payload, '$.sign_in_time', '2026-11-04T06:00:00.000Z') where id = ?", ENTRY_OUTBOX));
  expect((await itemFor(ENTRY_OUTBOX)).contentDigest).not.toBe(first);
});

test('a refused child insert keeps the exit across a forced re-send that stamps a new row version', async () => {
  const CHILD_ID = '30000000-0000-4000-8000-000000000001';
  const CHILD_OUTBOX = `children:${CHILD_ID}:insert`;
  await h.withTransaction(txn => txn.runAsync(`insert into children (id, first_name, last_name, created_by, sync_status)
    values (?, 'Thandi', 'Mbeki', ?, 'pending')`, CHILD_ID, h.userId));
  await h.services.repositories.syncOutbox.enqueue({ tableName: 'children', recordId: CHILD_ID, operation: 'insert',
    payload: { id: CHILD_ID, first_name: 'Thandi', last_name: 'Mbeki', created_by: h.userId } });
  await syncAndReport();
  expect(await itemFor(CHILD_OUTBOX)).toMatchObject({ delivery: 'delivered', canRemove: true });
  const sentVersion = JSON.parse((await outboxRow(CHILD_OUTBOX)).payload).row_version;
  await engine.syncAll({ force: true });
  expect(JSON.parse((await outboxRow(CHILD_OUTBOX)).payload)).toMatchObject({ first_name: 'Thandi', row_version: sentVersion + 1 });
  expect(await itemFor(CHILD_OUTBOX)).toMatchObject({ delivery: 'delivered', canRemove: true });
  // A content change is still a new revision.
  await h.withTransaction(txn => txn.runAsync(
    "update sync_outbox set payload = json_set(payload, '$.first_name', 'Thandiwe') where id = ?", CHILD_OUTBOX));
  expect(await itemFor(CHILD_OUTBOX)).toMatchObject({ delivery: 'waiting', canRemove: false });
});

test('a cut copy stays a support case while the row is unchanged, across forced re-sends', async () => {
  await h.services.repositories.timeEntries.saveTimeEntry({
    id: ENTRY_ID, user_id: h.userId, sign_in_time: '2026-11-04T07:00:00.000Z', sync_status: 'pending',
  });
  await enlargeEntry(70000);
  await syncAndReport();
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'support', canRemove: false });
  await engine.syncAll({ force: true });
  expect(await outboxRow(ENTRY_OUTBOX)).toMatchObject({ status: 'terminal' });
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'support', canRemove: false });
  expect(await engine.removeDeliveredItem(ENTRY_OUTBOX)).toMatchObject({ removed: false, delivery: 'support' });
});

test('a last-seen refresh after delivery keeps the exit while the row is unchanged', async () => {
  onlyDateFaked();
  const start = Date.parse('2026-11-04T10:00:00.000Z');
  jest.setSystemTime(start);
  await refuseTimeEntry();
  await syncAndReport();
  jest.setSystemTime(start + 16 * 60000);
  expect(await itemFor(ENTRY_OUTBOX)).toMatchObject({ delivery: 'delivered', canRemove: true });
  expect((await incidents())[0]).toMatchObject({ status: 'sent', has_unsent_changes: 1 });
  expect(await engine.removeDeliveredItem(ENTRY_OUTBOX)).toEqual({ removed: true });
});

test('a proof is cleaned up once its row has left by a successful upload', async () => {
  await refuseTimeEntry();
  await syncAndReport();
  const [incident] = await incidents();
  server.time_entries = { error: null };
  await engine.syncAll({ force: true });
  expect(await outboxRow(ENTRY_OUTBOX)).toBeNull();
  expect(await h.services.repositories.localState.get(deliveredReceiptKey(incident.id))).toBeNull();
});
