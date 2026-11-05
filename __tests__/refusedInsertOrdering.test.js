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
import { INSTALL_ID_KEY, resetInstallIdForTests } from '../src/services/installId';
import { getRuntimeDiagnostics } from '../src/utils/runtimeDiagnostics';

// Combined-OTA review (2026-11-05, HIGH; reviewer repro zzUnitX7). An edit or archive queued after
// its record's INSERT was refused must wait for that INSERT, in any status. It must never clear by
// the delivered-receipt rule while the INSERT is still queued: the INSERT could later land with the
// old content and overwrite the edit on the server and the phone. Its release is the INSERT
// landing (the edit is then sent) or the INSERT leaving through its exit (the edit is then sent,
// refused as not applied, and clears under the normal rule).
const FK = { error: { code: '23503', message: 'insert or update on table violates foreign key constraint' } };
const CHILD = '30000000-0000-4000-8000-000000000009';
const GROUP = '40000000-0000-4000-8000-000000000001';
const SCHOOL = '50000000-0000-4000-8000-000000000001';
const CLASS = '50000000-0000-4000-8000-000000000002';
const MEMBERSHIP = '60000000-0000-4000-8000-000000000001';

let h;
let calls;
let engine;
let server;

const outboxRows = () => h.getReader().then(db => db.getAllAsync('select id, status, error_code from sync_outbox order by id'));
const local = (table, id, columns = '*') => h.getReader().then(db => db.getFirstAsync(`select ${columns} from ${table} where id = ?`, id));
const sent = (type, table) => calls.filter(call => call.type === type && call.tableName === table);
// One pass uploads, the status refresh records receipts, the next pass delivers them.
const syncAndReport = async (options) => {
  await engine.syncAll(options);
  await engine.getSyncStatus();
  await engine.syncAll();
  await engine.getSyncStatus();
};
const item = async (outboxId) => (await engine.getSyncStatus()).needsAttentionItems.find(entry => entry.outboxId === outboxId);

beforeEach(async () => {
  h = getDefaultTestHandle();
  getRuntimeDiagnostics.mockReturnValue({ application: { version: '1.5.0', build: '60' }, update: { id: 'ota-1' },
    backend: { projectId: 'segygjzpujphwvrubusm' }, device: { deviceName: 'phone' } });
  resetInstallIdForTests();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(INSTALL_ID_KEY, 'install-1');
  await h.services.repositories.localState.set('support_auto_bundle_last_at', '2099-01-01T00:00:00.000Z');
  // A small stateful server: inserts land when allowed; an update by id applies only to a row it has.
  server = { refuseInserts: new Set(['children', 'groups', 'child_class_memberships']), rows: new Map() };
  const upsert = table => ({ payload }) => {
    if (server.refuseInserts.has(table)) return FK;
    for (const row of Array.isArray(payload) ? payload : [payload]) {
      server.rows.set(`${table}:${row.id}`, { ...server.rows.get(`${table}:${row.id}`), ...row });
    }
    return { error: null };
  };
  const update = table => ({ value, payload }) => {
    const key = `${table}:${value}`;
    if (!server.rows.has(key)) return { data: [], error: null };
    server.rows.set(key, { ...server.rows.get(key), ...payload });
    return { data: [{ id: value }], error: null };
  };
  const tables = ['children', 'groups', 'child_class_memberships', 'child_ea_assignments'];
  let supabaseClient;
  ({ supabaseClient, calls } = createSupabaseMock({
    upsertResults: Object.fromEntries(tables.map(table => [table, upsert(table)])),
    updateResults: Object.fromEntries(tables.map(table => [table, update(table)])),
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
afterEach(() => { resetInstallIdForTests(); });

const refuseChildInsert = async () => {
  await h.withTransaction(txn => txn.runAsync(`insert into children (id, first_name, last_name, created_by, sync_status)
    values (?, 'Thandi', 'Mbeki', ?, 'pending')`, CHILD, h.userId));
  await h.services.repositories.syncOutbox.enqueue({ tableName: 'children', recordId: CHILD, operation: 'insert',
    payload: { id: CHILD, first_name: 'Thandi', last_name: 'Mbeki', created_by: h.userId } });
  await engine.syncAll();
  expect(await outboxRows()).toEqual([{ id: `children:${CHILD}:insert`, status: 'terminal', error_code: '23503' }]);
};

test('X7: an edit made after its INSERT was refused waits, and lands after the INSERT does', async () => {
  await refuseChildInsert();
  await h.services.repositories.children.updateChild(CHILD, { first_name: 'Thandiwe' });
  await syncAndReport();
  await syncAndReport();
  // The edit was never sent, so it was never refused and never cleared.
  expect(sent('update', 'children')).toHaveLength(0);
  expect(await outboxRows()).toEqual([
    { id: `children:${CHILD}:insert`, status: 'terminal', error_code: '23503' },
    { id: `children:${CHILD}:update`, status: 'pending', error_code: null },
  ]);

  // Head Office fixes the cause; Sync now re-sends the refused INSERT, then the edit follows.
  server.refuseInserts.delete('children');
  await engine.syncAll({ force: true });
  await engine.syncAll();
  expect(sent('upsert', 'children').at(-1).payload.first_name).toBe('Thandi');
  expect(sent('update', 'children').map(call => call.payload.first_name)).toEqual(['Thandiwe']);
  expect(server.rows.get(`children:${CHILD}`)).toMatchObject({ first_name: 'Thandiwe' });
  expect(await local('children', CHILD, 'first_name, sync_status')).toEqual({ first_name: 'Thandiwe', sync_status: 'synced' });
  expect(await outboxRows()).toEqual([]);
});

test('the INSERT leaving through its exit releases the edit, which is refused and then clears', async () => {
  await refuseChildInsert();
  await h.services.repositories.children.updateChild(CHILD, { first_name: 'Thandiwe' });
  await syncAndReport();
  expect(await item(`children:${CHILD}:insert`)).toMatchObject({ delivery: 'delivered', canRemove: true });
  expect(await engine.removeDeliveredItem(`children:${CHILD}:insert`)).toEqual({ removed: true });

  await syncAndReport();
  await engine.syncAll();
  expect(sent('update', 'children').map(call => call.payload.first_name)).toEqual(['Thandiwe']);
  expect(await outboxRows()).toEqual([]);
  // The edit's receipt keeps the EA's intent; the local record stays.
  expect(await local('children', CHILD, 'first_name')).toEqual({ first_name: 'Thandiwe' });
});

test('a waiting edit holds nothing else: the child family is still sent and refused on its own', async () => {
  await refuseChildInsert();
  await h.services.repositories.children.updateChild(CHILD, { first_name: 'Thandiwe' });
  const assignment = { id: '70000000-0000-4000-8000-000000000001', user_id: h.userId, child_id: CHILD, created_by: h.userId };
  await h.services.repositories.syncOutbox.enqueue({ tableName: 'child_ea_assignments', recordId: assignment.id,
    operation: 'insert', payload: assignment });
  server.refuseInserts.add('child_ea_assignments');
  await engine.syncAll();
  await engine.syncAll();
  expect(sent('upsert', 'child_ea_assignments')).toHaveLength(1);
  expect(Object.fromEntries((await outboxRows()).map(row => [row.id, row.status]))).toEqual({
    [`children:${CHILD}:insert`]: 'terminal',
    [`children:${CHILD}:update`]: 'pending',
    [`child_ea_assignments:${assignment.id}:insert`]: 'terminal',
  });
});

test('an archive queued after a refused group INSERT never clears and lets the INSERT resurrect the group', async () => {
  await h.withTransaction(async txn => {
    await txn.runAsync("insert into programmes (id, code, name, sync_status) values ('programme-1', 'lit', 'Literacy', 'synced')");
    await txn.runAsync(`insert into groups (id, name, programme_id, created_by, sync_status)
      values (?, 'Group 1', 'programme-1', ?, 'pending')`, GROUP, h.userId);
  });
  await h.services.repositories.syncOutbox.enqueue({ tableName: 'groups', recordId: GROUP, operation: 'insert',
    payload: { id: GROUP, name: 'Group 1', programme_id: 'programme-1', created_by: h.userId } });
  await engine.syncAll();
  await h.withTransaction(txn => txn.runAsync(
    "update groups set archived_at = '2026-11-04T08:00:00.000Z', sync_status = 'pending' where id = ?", GROUP));
  await h.services.repositories.syncOutbox.enqueue({ tableName: 'groups', recordId: GROUP, operation: 'archive',
    payload: { id: GROUP, archived_at: '2026-11-04T08:00:00.000Z' } });
  await syncAndReport();
  await syncAndReport();
  expect(sent('update', 'groups')).toHaveLength(0);
  expect((await outboxRows()).find(row => row.id === `groups:${GROUP}:archive`)).toMatchObject({ status: 'pending' });

  server.refuseInserts.delete('groups');
  await engine.syncAll({ force: true });
  await engine.syncAll();
  expect(server.rows.get(`groups:${GROUP}`)).toMatchObject({ archived_at: '2026-11-04T08:00:00.000Z' });
  expect(await local('groups', GROUP, 'archived_at')).toEqual({ archived_at: '2026-11-04T08:00:00.000Z' });
  expect(await outboxRows()).toEqual([]);
});

test('a class-membership exit queued after its refused INSERT waits for it', async () => {
  await h.withTransaction(async txn => {
    await txn.runAsync("insert into schools (id, name, sync_status) values (?, 'Masi Primary', 'synced')", SCHOOL);
    await txn.runAsync("insert into classes (id, school_id, name, grade, sync_status) values (?, ?, 'Grade 1A', '1', 'synced')", CLASS, SCHOOL);
    await txn.runAsync(`insert into children (id, first_name, last_name, created_by, sync_status)
      values (?, 'Thandi', 'Mbeki', ?, 'synced')`, CHILD, h.userId);
    await txn.runAsync(`insert into academic_years (id, label, starts_on, ends_on, is_active, sync_status)
      values ('year-2026', '2026', '2026-01-15', '2026-12-15', 1, 'synced')`);
    await txn.runAsync(`insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, created_by, sync_status)
      values (?, ?, ?, 'year-2026', '2026-11-01T08:00:00.000Z', ?, 'pending')`, MEMBERSHIP, CHILD, CLASS, h.userId);
  });
  await h.services.repositories.syncOutbox.enqueue({ tableName: 'child_class_memberships', recordId: MEMBERSHIP,
    operation: 'insert', payload: { id: MEMBERSHIP, child_id: CHILD, class_id: CLASS, academic_year_id: 'year-2026',
      enrolled_at: '2026-11-01T08:00:00.000Z', created_by: h.userId } });
  await engine.syncAll();
  await h.services.repositories.syncOutbox.enqueue({ tableName: 'child_class_memberships', recordId: MEMBERSHIP,
    operation: 'archive', payload: { id: MEMBERSHIP, exited_at: '2026-11-04T08:00:00.000Z' } });
  await syncAndReport();
  expect(sent('update', 'child_class_memberships')).toHaveLength(0);
  expect((await outboxRows()).find(row => row.id === `child_class_memberships:${MEMBERSHIP}:archive`)).toMatchObject({ status: 'pending' });

  server.refuseInserts.delete('child_class_memberships');
  await engine.syncAll({ force: true });
  await engine.syncAll();
  expect(server.rows.get(`child_class_memberships:${MEMBERSHIP}`)).toMatchObject({ exited_at: '2026-11-04T08:00:00.000Z' });
  expect(await outboxRows()).toEqual([]);
});

// A 1.5.0 phone sent the edit before this update: it is already refused as not applied.
test('an edit refused before this update because its INSERT was missing never clears, and is sent once the INSERT lands', async () => {
  await refuseChildInsert();
  await h.withTransaction(txn => txn.runAsync("update children set first_name = 'Thandiwe' where id = ?", CHILD));
  await h.services.repositories.syncOutbox.enqueue({ tableName: 'children', recordId: CHILD, operation: 'update',
    payload: { id: CHILD, first_name: 'Thandiwe', last_name: 'Mbeki', created_by: h.userId } });
  await h.services.repositories.syncOutbox.markTerminalFailure(`children:${CHILD}:update`, {
    errorMessage: 'children update did not acknowledge exactly one updated row', errorCode: 'UPDATE_NOT_APPLIED' });
  await syncAndReport();
  await syncAndReport();
  expect((await outboxRows()).find(row => row.id === `children:${CHILD}:update`)).toMatchObject({ status: 'terminal' });
  expect(await item(`children:${CHILD}:update`)).toMatchObject({ clearsItself: false, canRemove: false });

  server.refuseInserts.delete('children');
  await engine.syncAll({ force: true });
  await engine.syncAll();
  expect(server.rows.get(`children:${CHILD}`)).toMatchObject({ first_name: 'Thandiwe' });
  expect(await local('children', CHILD, 'first_name, sync_status')).toEqual({ first_name: 'Thandiwe', sync_status: 'synced' });
  expect(await outboxRows()).toEqual([]);
});
