jest.mock('@react-native-community/netinfo',()=>({fetch:jest.fn(async()=>({type:'wifi',isConnected:true}))}));
global.__MASI_NO_DEFAULT_HANDLE__ = true;

jest.mock('expo-file-system/next', () => ({
  Paths: {availableDiskSpace:123,totalDiskSpace:456},
  Directory: jest.fn(),
  File: class File {
    constructor(uri) { this.uri = uri; }
    get name() { return this.uri.split('/').pop(); }
  },
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { Directory, File } from 'expo-file-system/next';
import * as sqlite from '../test-support/expoSQLiteRealEngine';
import { CURRENT_SCHEMA_VERSION, runMigrations } from '../src/db/migrations';
import { databaseNameForUser, LEGACY_DATABASE_NAME } from '../src/db/client';
import { incidentRepeatKey } from '../src/db/repositories/supportIncidentRepository';
import { outboxRecordId } from '../src/db/repositories/syncOutboxRepository';
import { drainSupportIncidents } from '../src/services/supportIncidents';
import { requestOpen, requestClose, resetHandleRegistryForTests, getCurrentHandle } from '../src/session/signedInHandle';
import {
  listDatabaseNames, readOtherDatabase, discoverOtherDatabases,
  incidentsFromDiscovery, discoverAndQueueIncidents,
} from '../src/session/fileDiscovery';

const expoSQLite = require('expo-sqlite');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const A_FILE = databaseNameForUser(A);
const B_FILE = databaseNameForUser(B);
const C_FILE = databaseNameForUser(C);
const NOW = new Date('2026-10-17T00:00:00.000Z');
const FIRST = { id: 'children:old-child:update', table: 'children', createdAt: '2026-10-15T00:00:00.000Z' };
const SECOND = { id: 'time_entries:shift:update', table: 'time_entries', createdAt: '2026-10-16T00:00:00.000Z' };
const filePath = (name) => path.join(os.tmpdir(), 'masi-tests', `${name}-${process.pid}.db`);
const fileDigest = (name) => createHash('sha256').update(fs.readFileSync(filePath(name))).digest('hex');

// Re-seeding an episode is fixture setup only; discovery never gets a writing connection.
const seedFile = async (name, ownerId, rows, { replaceOutbox = false, seedDomain } = {}) => {
  const db = await sqlite.openDatabaseAsync(name);
  try {
    await runMigrations(db);
    if (name !== LEGACY_DATABASE_NAME) await db.runAsync(
      "insert or replace into local_state (key, value) values ('file_owner_user_id', ?)", ownerId
    );
    if (replaceOutbox) await db.runAsync('delete from sync_outbox');
    if (seedDomain) await seedDomain(db);
    for (const row of rows) await db.runAsync(`insert into sync_outbox
      (id, table_name, record_id, operation, status, owner_user_id, payload, created_at, updated_at)
      values (?, ?, ?, 'insert', ?, ?, ?, ?, ?)`, row.id, row.table, row.recordId || `r-${row.id}`,
    row.status || 'pending', ownerId, JSON.stringify(row.payload || {}), row.createdAt, row.createdAt);
  } finally { await db.closeAsync(); }
};
const openB = () => requestOpen({ userId: B, openDatabase: sqlite.openDatabaseAsync });
const discover = (handle, names = [A_FILE, B_FILE], options = {}) => discoverAndQueueIncidents({
  handle, listNames: () => names, openDatabase: sqlite.openDatabaseAsync, now: NOW, ...options,
});
const queued = async (handle) => (await handle.getReader()).getAllAsync('select * from support_incident_queue order by created_at, id');
const snapshot = async (name) => {
  const db = await sqlite.openDatabaseAsync(name, { useNewConnection: true });
  try {
    await db.execAsync('PRAGMA query_only = ON');
    return {
      outbox: await db.getAllAsync('select * from sync_outbox order by id'),
      local: await db.getAllAsync('select * from local_state order by key'),
      version: await db.getFirstAsync('PRAGMA user_version'),
    };
  } finally { await db.closeAsync(); }
};

beforeEach(async () => {
  await resetHandleRegistryForTests();
  await sqlite.__resetMockDatabases();
  expoSQLite.defaultDatabaseDirectory = undefined;
  Directory.mockReset().mockImplementation(() => ({ exists: false }));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await resetHandleRegistryForTests();
  await sqlite.__resetMockDatabases();
  expoSQLite.defaultDatabaseDirectory = undefined;
  jest.restoreAllMocks();
});

test('T11/T12: another EA file queues the exact counts, age and hashed oldest-row episode in B', async () => {
  await seedFile(A_FILE, A, [FIRST, SECOND]);
  const b = await openB();
  expect(await discover(b)).toEqual({ queued: 1 });
  const rows = await queued(b);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: 'left_behind_unsent_work', status: 'pending',
    repeat_key: incidentRepeatKey(A, FIRST.id, FIRST.createdAt),
  });
  expect(JSON.parse(rows[0].payload)).toEqual({
    strandedUserId: A, unsentByTable: { children: 1, time_entries: 1 }, oldestUnsentAgeHours: 48,
  });
});

test('the same episode queues once across repeated discovery', async () => {
  await seedFile(A_FILE, A, [FIRST]);
  const b = await openB();
  expect(await discover(b)).toEqual({ queued: 1 });
  expect(await discover(b)).toEqual({ queued: 0 });
  expect(await queued(b)).toHaveLength(1);
});

test('a seeded post-upload episode with a different oldest row reports again', async () => {
  await seedFile(A_FILE, A, [FIRST, SECOND]);
  const b = await openB();
  await discover(b);
  // Fixture transition: the first row has uploaded; a later edit now accompanies SECOND.
  await seedFile(A_FILE, A, [SECOND, { ...FIRST, id: 'children:new-child:update', createdAt: '2026-10-16T09:00:00.000Z' }], { replaceOutbox: true });
  expect(await discover(b)).toEqual({ queued: 1 });
  const rows = await queued(b);
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map(row => row.repeat_key))).toEqual(new Set([
    incidentRepeatKey(A, FIRST.id, FIRST.createdAt), incidentRepeatKey(A, SECOND.id, SECOND.createdAt),
  ]));
});

test('the same outbox id recreated after upload is a new episode when created_at changes', async () => {
  await seedFile(A_FILE, A, [FIRST]);
  const b = await openB();
  await discover(b);
  const later = { ...FIRST, createdAt: '2026-10-16T09:00:00.000Z' };
  await seedFile(A_FILE, A, [later], { replaceOutbox: true });
  expect(await discover(b)).toEqual({ queued: 1 });
  const rows = await queued(b);
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map(row => row.repeat_key))).toEqual(new Set([
    incidentRepeatKey(A, FIRST.id, FIRST.createdAt), incidentRepeatKey(A, FIRST.id, later.createdAt),
  ]));
});

test('legacy masi.db queues counts and age without strandedUserId', async () => {
  await seedFile(LEGACY_DATABASE_NAME, A, [FIRST]);
  const b = await openB();
  expect(await discover(b, [LEGACY_DATABASE_NAME])).toEqual({ queued: 1 });
  const rows = await queued(b);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ kind: 'legacy_shared_file_unsent', repeat_key: incidentRepeatKey('legacy', FIRST.id, FIRST.createdAt) });
  expect(JSON.parse(rows[0].payload)).toEqual({ unsentByTable: { children: 1 }, oldestUnsentAgeHours: 48 });
});

test('a readable file with no unsent rows queues nothing', async () => {
  await seedFile(A_FILE, A, []);
  const b = await openB();
  expect(await discover(b)).toEqual({ queued: 0 });
  expect(await queued(b)).toEqual([]);
});

test('the signed-in EA file is never opened by discovery even if it contains unsent work', async () => {
  await seedFile(B_FILE, B, [FIRST]);
  const b = await openB();
  const openDatabase = jest.fn(sqlite.openDatabaseAsync);
  expect(await discover(b, [B_FILE], { openDatabase })).toEqual({ queued: 0 });
  expect(openDatabase).not.toHaveBeenCalled();
});

test('an unreadable file is skipped and the next readable EA file is still reported', async () => {
  await seedFile(A_FILE, A, [FIRST]);
  const b = await openB();
  const openDatabase = jest.fn((name, options) => {
    if (name === C_FILE) return Promise.reject(new Error('file is not a database'));
    return sqlite.openDatabaseAsync(name, options);
  });
  expect(await discover(b, [C_FILE, A_FILE], { openDatabase })).toEqual({ queued: 1 });
  expect(openDatabase.mock.calls.map(([name]) => name)).toEqual([C_FILE, A_FILE]);
  expect(await queued(b)).toHaveLength(1);
  expect(console.warn).toHaveBeenCalledWith('[FileDiscovery] unreadable database file skipped:', C_FILE, 'file is not a database');
});

test('a newer schema is unreadable without table reads and discovery continues to the next file', async () => {
  await seedFile(C_FILE, C, [FIRST]);
  await seedFile(A_FILE, A, [SECOND]);
  const seed = await sqlite.openDatabaseAsync(C_FILE);
  await seed.execAsync(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 86}`);
  await seed.closeAsync();
  const before = fileDigest(C_FILE);
  let newer;
  const openDatabase = async (name, options) => {
    const db = await sqlite.openDatabaseAsync(name, options);
    if (name === C_FILE) newer = {
      first: jest.spyOn(db, 'getFirstAsync'), all: jest.spyOn(db, 'getAllAsync'),
      close: jest.spyOn(db, 'closeAsync'),
    };
    return db;
  };

  const files = await discoverOtherDatabases({
    signedInUserId: B, listNames: () => [C_FILE, A_FILE], openDatabase,
  });

  expect(files[0]).toEqual({ name: C_FILE, readable: false, kind: 'ea', strandedUserId: C });
  expect(files[1]).toMatchObject({ name: A_FILE, readable: true, unsent: { total: 1, byTable: { time_entries: 1 } } });
  expect(newer.first.mock.calls).toEqual([['PRAGMA user_version']]);
  expect(newer.all).not.toHaveBeenCalled();
  expect(newer.close).toHaveBeenCalledTimes(1);
  expect(fileDigest(C_FILE)).toBe(before);
});

test('T10: other EA and legacy reads are query-only, close every connection and preserve files and rows', async () => {
  await seedFile(A_FILE, A, [FIRST, SECOND]);
  await seedFile(LEGACY_DATABASE_NAME, A, [FIRST]);
  const names = [A_FILE, LEGACY_DATABASE_NAME];
  const before = await Promise.all(names.map(snapshot));
  const bytes = names.map(fileDigest);
  const b = await openB();
  const reads = [];
  const openDatabase = jest.fn(async (name, options) => {
    const db = await sqlite.openDatabaseAsync(name, options);
    reads.push({ db, exec: jest.spyOn(db, 'execAsync'), close: jest.spyOn(db, 'closeAsync') });
    return db;
  });
  expect(await discover(b, names, { openDatabase })).toEqual({ queued: 2 });
  expect(openDatabase.mock.calls).toEqual(names.map(name => [name, { useNewConnection: true }]));
  for (const { db, exec, close } of reads) {
    expect(exec.mock.calls).toEqual([['PRAGMA query_only = ON'], ['PRAGMA busy_timeout = 2000']]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(db.isOpen).toBe(false);
  }
  expect(await Promise.all(names.map(snapshot))).toEqual(before);
  names.forEach((name, index) => {
    expect(fs.existsSync(filePath(name))).toBe(true);
    expect(fileDigest(name)).toBe(bytes[index]);
  });
  expect(sqlite.deleteDatabaseAsync).not.toHaveBeenCalled();
});

test('non-database names and SQLite sidecars are ignored', async () => {
  const openDatabase = jest.fn();
  const names = [`${A_FILE}-wal`, `${A_FILE}-shm`, 'notes.txt', 'masi-notauuid.db'];
  expect(await discoverOtherDatabases({ signedInUserId: B, listNames: () => names, openDatabase })).toEqual([]);
  expect(openDatabase).not.toHaveBeenCalled();
});

test('T12: real discovery then RPC drain excludes child identity, name, private notes and outbox id', async () => {
  const id = outboxRecordId('children', 'c-secret-child-id', 'insert');
  await seedFile(A_FILE, A, [{ ...FIRST, id, recordId: 'c-secret-child-id', payload: { id: 'c-secret-child-id', first_name: 'Thandiwe', notes: 'private note' } }], {
    seedDomain: async db => {
      await db.runAsync("insert into children (id, first_name, last_name, created_by) values ('c-secret-child-id', 'Thandiwe', 'Fixture', ?)", A);
      await db.runAsync("insert into programmes (id, code, name) values ('lit', 'lit', 'Literacy')");
      await db.runAsync("insert into sessions (id, user_id, programme_id, session_date, notes) values ('private-session', ?, 'lit', '2026-10-15', 'private note')", A);
    },
  });
  const b = await openB();
  expect(await discover(b)).toEqual({ queued: 1 });
  const rows = await queued(b);
  const supabaseClient = { rpc: jest.fn(async () => ({ data: {status:'inserted'}, error: null })) };
  expect(await drainSupportIncidents({
    handle: b, repository: b.services.repositories.supportIncidents, supabaseClient, enqueueRequest: task => task(),
    envelope: { appVersion: '1.2.0', buildNumber: '7', updateId: null, backend: 'segygjzpujphwvrubusm', installId: 'i-1' },
  })).toEqual({ sent: 1, rejected: 0, failed: 0 });
  expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
  for (const serialized of [JSON.stringify(rows), JSON.stringify(supabaseClient.rpc.mock.calls)]) {
    for (const secret of ['c-secret-child-id', 'Thandiwe', 'private note', id]) expect(serialized).not.toContain(secret);
  }
});

test('requestOpen publishes before invoking discovery once, and discovery does not delay sign-in', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const discover = jest.fn(({ handle }) => {
    expect(getCurrentHandle()).toBe(handle);
    expect(handle.isCurrent()).toBe(true);
    return pending;
  });
  const b = await requestOpen({ userId: B, openDatabase: sqlite.openDatabaseAsync, discover });
  expect(discover).toHaveBeenCalledTimes(1);
  expect(discover).toHaveBeenCalledWith({ handle: b });
  let settled = false;
  expect(b.discovery).toBeInstanceOf(Promise);
  b.discovery.then(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  finish();
  await expect(b.discovery).resolves.toBeUndefined();
});

test('a discovery rejection never rejects sign-in or handle.discovery', async () => {
  const discover = jest.fn(async () => { throw new Error('discovery unavailable'); });
  const b = await requestOpen({ userId: B, openDatabase: sqlite.openDatabaseAsync, discover });
  await expect(b.discovery).resolves.toBeUndefined();
  expect(b.isCurrent()).toBe(true);
  expect(b.isOpen()).toBe(true);
  expect(console.error).toHaveBeenCalledWith('[SignedInHandle] file_discovery_failed', 'discovery unavailable');
});

test('real discovery queues incidents before the published handle.discovery settles', async () => {
  await seedFile(A_FILE, A, [FIRST]);
  const b = await requestOpen({ userId: B, openDatabase: sqlite.openDatabaseAsync,
    discover: ({ handle }) => discover(handle),
  });
  await expect(b.discovery).resolves.toBeUndefined();
  expect(await queued(b)).toHaveLength(1);
});

test('an inactive discovery admits no files and queues nothing', async () => {
  const b = await openB();
  await requestClose();
  const openDatabase = jest.fn();
  expect(await discover(b, [A_FILE], { openDatabase })).toEqual({ queued: 0 });
  expect(openDatabase).not.toHaveBeenCalled();
});

test('read failures after opening still close the raw connection and do not migrate an old schema', async () => {
  // Deliberately seed an old file with no outbox table.
  const db = await sqlite.openDatabaseAsync(A_FILE);
  await db.execAsync('create table old_fixture (id text); PRAGMA user_version = 1');
  await db.closeAsync();
  let reader;
  const openDatabase = async (name, options) => {
    reader = await sqlite.openDatabaseAsync(name, options);
    jest.spyOn(reader, 'closeAsync');
    return reader;
  };
  expect(await readOtherDatabase({ name: A_FILE, openDatabase })).toEqual({ name: A_FILE, readable: false });
  expect(reader.closeAsync).toHaveBeenCalledTimes(1);
  const check = await sqlite.openDatabaseAsync(A_FILE, { useNewConnection: true });
  await check.execAsync('PRAGMA query_only = ON');
  expect(await check.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 1 });
  expect(await check.getFirstAsync("select name from sqlite_master where name = 'sync_outbox'")).toBeNull();
  await check.closeAsync();
});

test('incident age is floored in hours and never negative', () => {
  const files = [{ kind: 'ea', strandedUserId: A, readable: true,
    unsent: { total: 1, byTable: { children: 1 }, oldestId: FIRST.id, oldestCreatedAt: '2026-10-17T00:30:00.000Z' } }];
  expect(incidentsFromDiscovery(files, NOW)[0].payload.oldestUnsentAgeHours).toBe(0);
  expect(incidentsFromDiscovery(files, new Date('2026-10-17T02:00:00.000Z'))[0].payload.oldestUnsentAgeHours).toBe(1);
});

test.each([undefined, null])('a missing SQLite directory (%s) makes listing a Jest-safe no-op', value => {
  expoSQLite.defaultDatabaseDirectory = value;
  expect(listDatabaseNames()).toEqual([]);
  expect(Directory).not.toHaveBeenCalled();
});

test.each(['/data/user/0/org.masi/files/SQLite', 'file:///data/user/0/org.masi/files/SQLite'])('lists SQLite native directory %s as a file URI and includes only Files', value => {
  expoSQLite.defaultDatabaseDirectory = value;
  Directory.mockImplementation(() => ({ exists: true, list: () => [new File(`file:///sqlite/${A_FILE}`), { name: 'subdirectory' }] }));
  expect(listDatabaseNames()).toEqual([A_FILE]);
  expect(Directory).toHaveBeenCalledWith('file:///data/user/0/org.masi/files/SQLite');
});

test('a missing directory or listing failure returns an empty list', () => {
  expoSQLite.defaultDatabaseDirectory = '/sqlite';
  expect(listDatabaseNames()).toEqual([]);
  Directory.mockImplementation(() => ({ exists: true, list: () => { throw new Error('unavailable'); } }));
  expect(listDatabaseNames()).toEqual([]);
  expect(console.warn).toHaveBeenCalledWith('[FileDiscovery] could not list database files:', 'unavailable');
});
