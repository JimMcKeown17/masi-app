global.__MASI_NO_DEFAULT_HANDLE__ = true;

import * as sqlite from '../test-support/expoSQLiteRealEngine';
import { runMigrations, MIGRATIONS } from '../src/db/migrations';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { incidentRepeatKey } from '../src/db/repositories/supportIncidentRepository';
import {
  requestOpen, requestClose, whenDisposed, getCurrentHandle,
  resetHandleRegistryForTests, setLatestAuthSession, subscribeToHandle,
} from '../src/session/signedInHandle';
import { AUTHENTICATED_DENIAL_MARKER } from '../src/services/offlineSync';
import * as observability from '../src/services/observability';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const FILE = `masi-${A}.db`;
let db;
let report;
let log;

beforeEach(async () => {
  await resetHandleRegistryForTests();
  await sqlite.__resetMockDatabases();
  db = await sqlite.openDatabaseAsync(FILE);
  await runMigrations(db);
  report = jest.spyOn(observability, 'captureOperationalError').mockImplementation(() => {});
  log = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await resetHandleRegistryForTests();
  await sqlite.__resetMockDatabases();
  jest.restoreAllMocks();
});

const seed = async ({ id = 'child', recordId = id, owner = B, status = 'pending', error = null } = {}) => {
  await db.runAsync(`insert into children (id, first_name, last_name, created_by, sync_status)
    values (?, 'Test', 'Child', ?, ?)`, recordId, B, status === 'in_flight' ? 'pending' : status);
  await db.runAsync(`insert into sync_outbox
    (id, table_name, record_id, operation, owner_user_id, status, last_error, payload)
    values (?, 'children', ?, 'update', ?, ?, ?, ?)`,
  id, recordId, owner, status, error, JSON.stringify({ id: recordId, created_by: B, reading_level: 'words' }));
};
const incidents = () => db.getAllAsync('select * from support_incident_queue order by created_at, id');
const open = async (fetchImpl = jest.fn()) => {
  setLatestAuthSession({ user: { id: A }, access_token: 'test-token' });
  return requestOpen({ userId: A, openDatabase: sqlite.openDatabaseAsync, fetchImpl });
};

test('open queues one counts-only foreign-owner incident keyed by the foreign outbox set', async () => {
  await seed({ id: 'foreign-outbox-1' });
  await open();
  const rows = await incidents();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: 'foreign_owner_in_file', status: 'pending',
    repeat_key: incidentRepeatKey('foreign', 'foreign-outbox-1'),
  });
  expect(rows[0].repeat_key).not.toContain('foreign-outbox-1');
  expect(JSON.parse(rows[0].payload)).toEqual({ foreignTotal: 1, foreignByTable: { children: 1 } });
});

test('the same terminal foreign set deduplicates before every pass, even after its incident was sent', async () => {
  const fetchImpl = jest.fn(async () => new Response('true', {
    status: 200, headers: { 'content-type': 'application/json' },
  }));
  await seed({ id: 'foreign-outbox-1', status: 'in_flight' });
  const handle = await open(fetchImpl);
  const before = await incidents();
  expect(before).toHaveLength(1);
  for (const force of [false, true]) {
    expect(await handle.services.syncEngine.syncAll({ force })).toMatchObject({ success: true, totalSynced: 0 });
    const rows = await incidents();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: before[0].id, repeat_key: before[0].repeat_key, status: 'sent' });
    expect(await handle.repositories.syncOutbox.getById('foreign-outbox-1'))
      .toMatchObject({ status: 'terminal', last_error: 'foreign_owner' });
  }
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(new URL(fetchImpl.mock.calls[0][0]).pathname).toBe('/rest/v1/rpc/report_mobile_support_incident');
});

test('foreign incident payload and repeat key hide outbox id, record id and the foreign EA id', async () => {
  const id = 'children:private-child:update';
  const recordId = 'private-child';
  await seed({ id, recordId });
  await open();
  const rows = await incidents();
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0].payload)).toEqual({ foreignTotal: 1, foreignByTable: { children: 1 } });
  for (const value of [rows[0].payload, rows[0].repeat_key]) {
    for (const secret of [id, recordId, B]) expect(value).not.toContain(secret);
  }
});

test('a file containing only its own EA work queues no foreign-owner incident', async () => {
  await seed({ owner: A });
  const handle = await open();
  await handle.repositories.syncOutbox.quarantineForeignOwners({ fileUserId: A });
  expect(await incidents()).toEqual([]);
  expect(await handle.repositories.syncOutbox.getById('child')).toMatchObject({ owner_user_id: A, status: 'pending' });
});

test('a grown foreign set queues a new incident even when its smallest outbox id is unchanged', async () => {
  await seed({ id: 'foreign-outbox-1' });
  const handle = await open();
  const before = await incidents();
  expect(before).toHaveLength(1);
  await seed({ id: 'foreign-outbox-2' });
  await handle.repositories.syncOutbox.quarantineForeignOwners({ fileUserId: A });
  const rows = await incidents();
  expect(rows).toHaveLength(2);
  expect(rows).toContainEqual(before[0]);
  const grown = rows.find(row => row.id !== before[0].id);
  expect(grown).toMatchObject({
    kind: 'foreign_owner_in_file', status: 'pending',
    repeat_key: incidentRepeatKey('foreign', 'foreign-outbox-1', 'foreign-outbox-2'),
  });
  expect(JSON.parse(grown.payload)).toEqual({ foreignTotal: 2, foreignByTable: { children: 2 } });
});

test('the foreign-set repeat key sorts all outbox ids independently of insertion order', async () => {
  await seed({ id: 'z-foreign' });
  await seed({ id: 'a-foreign' });
  await open();
  const rows = await incidents();
  expect(rows).toHaveLength(1);
  expect(rows[0].repeat_key).toBe(incidentRepeatKey('foreign', 'a-foreign', 'z-foreign'));
});

test('T8: open quarantines a foreign row before publication and retains file-wide unsent evidence', async () => {
  await seed();
  const published = [];
  const unsubscribe = subscribeToHandle(handle => {
    if (handle) published.push(handle.repositories.syncOutbox.getById('child'));
  });
  const handle = await open();
  unsubscribe();
  const outbox = handle.repositories.syncOutbox;
  expect(await outbox.getById('child')).toMatchObject({ status: 'terminal', last_error: 'foreign_owner', owner_user_id: B });
  expect(await Promise.all(published)).toEqual([expect.objectContaining({ status: 'terminal', last_error: 'foreign_owner' })]);
  expect(await db.getFirstAsync("select sync_status from children where id = 'child'"))
    .toEqual({ sync_status: 'terminal' });
  expect(await outbox.countUnsent()).toEqual({ total: 1, byTable: { children: 1 } });
  expect(await handle.repositories.localState.get('integrity_scan_last')).toEqual({
    at: expect.any(String), total: 1, byTable: { children: 1 }, adoptedLegacy: 0,
  });
  expect(log).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith(new Error('foreign_owner_in_file'), {
    category: 'foreign_owner_in_file', context: { byTable: { children: 1 } }, userId: A,
  });
});

const seedLegacyFile = async () => {
  await sqlite.__resetMockDatabases();
  db = await sqlite.openDatabaseAsync(FILE);
  for (const migration of MIGRATIONS.filter(item => item.version <= 11)) await db.execAsync(migration.sql);
  await db.execAsync('PRAGMA user_version = 11');
};

test('legacy NULL owners in all four unsent states are adopted separately from non-NULL foreign owners', async () => {
  await seedLegacyFile();
  const statuses = ['pending', 'failed', 'in_flight', 'terminal'];
  for (const status of statuses) {
    await seed({ id: `legacy-${status}`, owner: null, status, error: 'original error' });
    await seed({ id: `foreign-${status}`, owner: B, status, error: '42501' });
  }
  await seed({ id: 'owned', owner: A });
  await runMigrations(db);
  const outbox = createSyncOutboxRepository({ database: db });
  expect(await outbox.quarantineForeignOwners({ fileUserId: A })).toEqual({
    total: 4, byTable: { children: 4 }, adoptedLegacy: 4,
  });
  for (const status of statuses) {
    expect(await outbox.getById(`legacy-${status}`)).toMatchObject({ owner_user_id: A, status, last_error: 'original error' });
    expect(await outbox.getById(`foreign-${status}`)).toMatchObject({ owner_user_id: B, status: 'terminal', last_error: 'foreign_owner' });
  }
  expect(await outbox.getById('owned')).toMatchObject({ owner_user_id: A, status: 'pending' });
  expect(JSON.parse((await db.getFirstAsync("select value from local_state where key = 'integrity_scan_last'")).value))
    .toEqual({ at: expect.any(String), total: 4, byTable: { children: 4 }, adoptedLegacy: 4 });
  expect(await outbox.countUnsent()).toEqual({ total: 9, byTable: { children: 9 } });
  const queued = await incidents();
  expect(queued).toHaveLength(1);
  expect(JSON.parse(queued[0].payload)).toEqual({ foreignTotal: 4, foreignByTable: { children: 4 } });
  expect(log).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith(new Error('foreign_owner_in_file'), {
    category: 'foreign_owner_in_file', context: { byTable: { children: 4 } }, userId: A,
  });
});

test('T8: each upload pass quarantines an injected foreign row before reset and transports only its incident, including forced passes', async () => {
  const fetchImpl = jest.fn(async () => new Response('true', { status: 200, headers: { 'content-type': 'application/json' } }));
  const handle = await open(fetchImpl);
  expect(log).not.toHaveBeenCalled();
  for (const force of [false, true]) {
    const id = force ? 'forced' : 'automatic';
    await seed({ id, status: 'in_flight' });
    const resetInFlight = handle.repositories.syncOutbox.resetInFlight;
    let beforeReset;
    const reset = jest.spyOn(handle.repositories.syncOutbox, 'resetInFlight').mockImplementation(async options => {
      beforeReset = await handle.repositories.syncOutbox.getById(id);
      return resetInFlight(options);
    });
    expect(await handle.services.syncEngine.syncAll({ force })).toMatchObject({ success: true, totalSynced: 0 });
    expect(reset).toHaveBeenCalled();
    expect(beforeReset).toMatchObject({ status: 'terminal', last_error: 'foreign_owner' });
    reset.mockRestore();
    expect(await handle.repositories.syncOutbox.getById(id)).toMatchObject({ status: 'terminal', last_error: 'foreign_owner' });
  }
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/rest/v1/rpc/report_mobile_support_incident', '/rest/v1/rpc/report_mobile_support_incident',
  ]);
  expect(fetchImpl.mock.calls.map(([, options]) => JSON.parse(options.body).p_payload.foreignTotal)).toEqual([1, 2]);
  expect(await handle.services.syncEngine.requeueTerminalRlsFailures(A)).toBe(0);
  expect(await handle.repositories.syncOutbox.countUnsent()).toEqual({ total: 2, byTable: { children: 2 } });
});

test('open adopts a legacy in-flight row before recovery; adoption-only and empty scans report no foreign incident', async () => {
  await seedLegacyFile();
  await seed({ owner: null, status: 'in_flight' });
  const handle = await open();
  const outbox = handle.repositories.syncOutbox;
  expect(await outbox.getById('child')).toMatchObject({ owner_user_id: A, status: 'pending', last_error: null });
  expect((await outbox.getReadyRecords({ ownerUserId: A })).map(row => row.id)).toEqual(['child']);
  const summary = await handle.repositories.localState.get('integrity_scan_last');
  expect(summary).toEqual({ at: expect.any(String), total: 0, byTable: {}, adoptedLegacy: 1 });
  expect(await outbox.quarantineForeignOwners({ fileUserId: A })).toEqual({ total: 0, byTable: {}, adoptedLegacy: 0 });
  expect(await handle.repositories.localState.get('integrity_scan_last')).toEqual(summary);
  expect(await incidents()).toEqual([]);
  expect(report).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

test('multiple tables and absent hard-delete domain rows are counted and stay quarantined across reopen', async () => {
  await seed({ status: 'in_flight' });
  await db.runAsync(`insert into sync_outbox (id, table_name, record_id, operation, owner_user_id, status)
    values ('deleted', 'classes', 'gone', 'hard_delete', ?, 'terminal')`, B);
  // A wrong ordering would try to recover the foreign in-flight row before quarantine.
  await db.execAsync(`create trigger forbid_foreign_reset before update on sync_outbox
    when old.owner_user_id = '${B}' and old.status = 'in_flight' and new.status = 'pending'
    begin select raise(abort, 'foreign reset before scan'); end;`);
  let handle = await open();
  expect(await handle.repositories.localState.get('integrity_scan_last')).toEqual({
    at: expect.any(String), total: 2, byTable: { children: 1, classes: 1 }, adoptedLegacy: 0,
  });
  await requestClose({ reason: 'reopen' });
  await whenDisposed(FILE);
  handle = await open();
  expect(await handle.repositories.syncOutbox.quarantineForeignOwners({ fileUserId: A })).toEqual({
    total: 2, byTable: { children: 1, classes: 1 }, adoptedLegacy: 0,
  });
  expect(await handle.repositories.syncOutbox.getById('deleted')).toMatchObject({ status: 'terminal', last_error: 'foreign_owner' });
  expect(await handle.repositories.syncOutbox.countUnsent()).toEqual({ total: 2, byTable: { children: 1, classes: 1 } });
  const queued = await handle.repositories.supportIncidents.listPending();
  expect(queued).toHaveLength(1);
  expect(queued[0].repeatKey).toBe(incidentRepeatKey('foreign', 'child', 'deleted'));
  expect(queued[0].payload).toEqual({ foreignTotal: 2, foreignByTable: { children: 1, classes: 1 } });
});

test('adoption, quarantine, domain status and scan evidence roll back together when evidence cannot be written', async () => {
  await seedLegacyFile();
  await seed({ id: 'legacy', owner: null });
  await seed({ id: 'foreign', status: 'failed', error: '42501' });
  await runMigrations(db);
  await db.execAsync(`create trigger fail_integrity_evidence before insert on local_state
    when new.key = 'integrity_scan_last' begin select raise(abort, 'evidence write failed'); end;`);
  const outbox = createSyncOutboxRepository({ database: db });
  await expect(outbox.quarantineForeignOwners({ fileUserId: A })).rejects.toMatchObject({ message: 'evidence write failed' });
  expect(await outbox.getById('legacy')).toMatchObject({ owner_user_id: null, status: 'pending' });
  expect(await outbox.getById('foreign')).toMatchObject({ owner_user_id: B, status: 'failed', last_error: '42501' });
  expect(await db.getFirstAsync("select sync_status from children where id = 'foreign'")).toEqual({ sync_status: 'failed' });
  expect(await db.getFirstAsync("select value from local_state where key = 'integrity_scan_last'")).toBeNull();
  expect(await incidents()).toEqual([]);
  expect(report).not.toHaveBeenCalled();
  await expect(open()).rejects.toMatchObject({ message: 'evidence write failed' });
  expect(getCurrentHandle()).toBeNull();
});

test('an incident insert failure rolls back adoption, quarantine and scan evidence in the same transaction', async () => {
  await seedLegacyFile();
  await seed({ id: 'legacy', owner: null });
  await seed({ id: 'foreign', status: 'failed', error: '42501' });
  await runMigrations(db);
  await db.execAsync(`create trigger fail_incident_insert before insert on support_incident_queue
    begin select raise(abort, 'incident insert failed'); end;`);
  const outbox = createSyncOutboxRepository({ database: db });
  await expect(outbox.quarantineForeignOwners({ fileUserId: A })).rejects.toMatchObject({ message: 'incident insert failed' });
  expect(await outbox.getById('legacy')).toMatchObject({ owner_user_id: null, status: 'pending' });
  expect(await outbox.getById('foreign')).toMatchObject({ owner_user_id: B, status: 'failed', last_error: '42501' });
  expect(await db.getFirstAsync("select sync_status from children where id = 'foreign'")).toEqual({ sync_status: 'failed' });
  expect(await db.getFirstAsync("select value from local_state where key = 'integrity_scan_last'")).toBeNull();
  expect(await incidents()).toEqual([]);
  expect(report).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

test('a failed pass scan prevents recovery and transport and does not mark a successful pass', async () => {
  const fetchImpl = jest.fn();
  const handle = await open(fetchImpl);
  await seed({ status: 'in_flight' });
  const reset = jest.spyOn(handle.repositories.syncOutbox, 'resetInFlight');
  await db.execAsync(`create trigger fail_integrity_evidence before insert on local_state
    when new.key = 'integrity_scan_last' begin select raise(abort, 'evidence write failed'); end;`);
  expect(await handle.services.syncEngine.syncAll()).toMatchObject({
    success: false, totalSynced: 0, preflightErrors: [{ step: 'integrityScan', error: 'evidence write failed' }],
  });
  expect(reset).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(await handle.repositories.syncOutbox.getById('child')).toMatchObject({ status: 'in_flight', last_error: null });
  expect((await handle.repositories.syncState.getSyncMeta()).lastSuccessfulSyncTime).toBeNull();
});

test('a pass uses the stored file owner even if the live session names a different EA', async () => {
  const fetchImpl = jest.fn();
  const handle = await open(fetchImpl);
  await seed({ owner: B });
  setLatestAuthSession({ user: { id: B }, access_token: 'other-token' });
  await handle.services.syncEngine.syncAll();
  expect(await handle.repositories.syncOutbox.getById('child')).toMatchObject({ owner_user_id: B, status: 'terminal', last_error: 'foreign_owner' });
  expect(report).toHaveBeenCalledWith(new Error('foreign_owner_in_file'), {
    category: 'foreign_owner_in_file', context: { byTable: { children: 1 } }, userId: A,
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('rescue uses only stamped ownership and never heals foreign_owner or an authenticated denial', async () => {
  const handle = await open();
  for (const [id, owner, error] of [
    ['foreign', B, '42501'],
    ['quarantined', A, 'foreign_owner'],
    ['denied', A, `${AUTHENTICATED_DENIAL_MARKER} 42501`],
  ]) await seed({ id, owner, status: 'terminal', error });
  // Provenance agrees with A for the foreign row: it still must not grant healing.
  await db.runAsync("update children set created_by = ? where id = 'foreign'", A);
  expect(await handle.services.syncEngine.requeueTerminalRlsFailures(A)).toBe(0);
  expect((await handle.repositories.syncOutbox.getTerminalRecords()).map(row => row.id).sort())
    .toEqual(['denied', 'foreign', 'quarantined']);
});

test('telemetry failures do not prevent durable quarantine or publication', async () => {
  await seed();
  log.mockImplementation(() => { throw new Error('logger unavailable'); });
  report.mockImplementation(() => { throw new Error('telemetry unavailable'); });
  const handle = await open();
  expect(getCurrentHandle()).toBe(handle);
  expect(await handle.repositories.syncOutbox.getById('child')).toMatchObject({ status: 'terminal', last_error: 'foreign_owner' });
});

test('a legacy row discovered after open is adopted before reset and uploaded as the file owner', async () => {
  const fetchImpl = jest.fn(async () => new Response(JSON.stringify([{ id: 'legacy-upload' }]), {
    status: 200, headers: { 'content-type': 'application/json' },
  }));
  const handle = await open(fetchImpl);
  await seed({ id: 'legacy-upload', owner: A, status: 'in_flight' });
  // Model a pre-v12 row discovered in an already-open file without disabling its insert trigger.
  await db.runAsync("update sync_outbox set owner_user_id = null where id = 'legacy-upload'");
  expect(await handle.services.syncEngine.syncAll()).toMatchObject({ success: true, totalSynced: 1 });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(await handle.repositories.syncOutbox.countUnsent()).toEqual({ total: 0, byTable: {} });
  expect(await handle.repositories.localState.get('integrity_scan_last')).toEqual({
    at: expect.any(String), total: 0, byTable: {}, adoptedLegacy: 1,
  });
  expect(report).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

test('T9: an EA edit to a Head Office child heals an unmarked 42501 by its stamped owner', async () => {
  const handle = await open();
  await db.runAsync("insert into programmes (id, code, name) values ('literacy', 'lit', 'Literacy')");
  await db.runAsync(`insert into children (id, first_name, last_name, created_by, sync_status)
    values ('office-child', 'Test', 'Child', ?, 'synced')`, B);
  await handle.repositories.children.updateChild('office-child', { reading_level: 'words' });
  const [edit] = await handle.repositories.syncOutbox.getReadyRecords();
  expect(edit).toMatchObject({ owner_user_id: A, operation: 'update', payload: { created_by: B } });
  await handle.repositories.syncOutbox.markTerminalFailure(edit.id, { errorMessage: '42501: row-level security' });
  await db.runAsync("update children set sync_status = 'terminal', last_sync_error = '42501' where id = 'office-child'");
  expect(await handle.services.syncEngine.requeueTerminalRlsFailures(A)).toBe(1);
  expect(await handle.repositories.syncOutbox.getById(edit.id)).toMatchObject({
    status: 'pending', owner_user_id: A, retry_count: 0, next_retry_at: null, last_error: null,
  });
  expect(await db.getFirstAsync("select sync_status, last_sync_error, created_by, reading_level from children where id = 'office-child'"))
    .toEqual({ sync_status: 'pending', last_sync_error: null, created_by: B, reading_level: 'words' });
});
