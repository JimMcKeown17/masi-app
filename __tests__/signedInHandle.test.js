global.__MASI_NO_DEFAULT_HANDLE__ = true;

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import {
  requestOpen, requestClose, whenDisposed, getCurrentHandle, requireCurrentHandle, getConnectionActor,
  resetHandleRegistryForTests,
  readUnderFileFence,
} from '../src/session/signedInHandle';
import { StaleActorError, NoSignedInEAError, FileOwnerMismatchError } from '../src/session/staleActor';
import { databaseNameForUser } from '../src/db/client';
import { createPathDatabaseOpener } from '../test-support/actorTestUtils';
import { CURRENT_SCHEMA_VERSION, SchemaTooNewError, isSchemaTooNewError, runMigrations } from '../src/db/migrations';
import { discoverAndQueueIncidents } from '../src/session/fileDiscovery';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const deferred = () => { let resolve; let reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

let dir;
let openDatabase;
let opened;
let connections;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-handle-'));
  opened = [];
  connections = [];
  const base = createPathDatabaseOpener(dir);
  openDatabase = async (name, options) => { opened.push(name); const db = await base(name, options); connections.push(db); return db; };
});
afterEach(async () => {
  const current = getCurrentHandle();
  await requestClose({ reason: 'test' });
  if (current) await whenDisposed(current.fileName).catch(() => {});
  await Promise.all(opened.map((name) => whenDisposed(name).catch(() => {})));
  await resetHandleRegistryForTests();
  for (const db of connections) { if (db.raw.open) db.raw.close(); }
  fs.rmSync(dir, { recursive: true, force: true });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const seedDiscoveryFile = async (userId) => {
  const db = await openDatabase(databaseNameForUser(userId));
  try {
    await runMigrations(db);
    await db.runAsync("insert into local_state (key, value) values ('file_owner_user_id', ?)", userId);
    await db.runAsync(`insert into sync_outbox
      (id, table_name, record_id, operation, owner_user_id, status, created_at, updated_at)
      values ('children:fixture:insert', 'children', 'fixture', 'insert', ?, 'pending', ?, ?)`,
    userId, '2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z');
  } finally { await db.closeAsync(); }
};

test('a newer schema fails handle open with its typed error and leaves the file untouched', async () => {
  await seedDiscoveryFile(A);
  const fileName = databaseNameForUser(A);
  const fileVersion = CURRENT_SCHEMA_VERSION + 86;
  const seed = await openDatabase(fileName);
  await seed.execAsync(`PRAGMA user_version = ${fileVersion}`);
  await seed.closeAsync();
  const digest = () => createHash('sha256').update(fs.readFileSync(path.join(dir, fileName))).digest('hex');
  const before = digest();
  const openedBefore = opened.length;
  const discover = jest.fn();
  let caught;
  try { await requestOpen({ userId: A, openDatabase, discover }); } catch (error) { caught = error; }

  expect(caught).toBeInstanceOf(SchemaTooNewError);
  expect(caught).toMatchObject({ code: 'SCHEMA_TOO_NEW', fileVersion, appVersion: CURRENT_SCHEMA_VERSION });
  expect(isSchemaTooNewError(caught)).toBe(true);
  expect(getCurrentHandle()).toBeNull();
  expect(discover).not.toHaveBeenCalled();
  expect(opened.slice(openedBefore)).toEqual([fileName]);
  expect(connections[connections.length - 1].isOpen).toBe(false);
  expect(digest()).toBe(before);
  expect((await requestOpen({ userId: B, openDatabase })).userId).toBe(B);
});

const readDiscoveryQueue = async (userId) => {
  const db = await openDatabase(databaseNameForUser(userId), { useNewConnection: true });
  try {
    await db.execAsync('PRAGMA query_only = ON');
    return await db.getAllAsync('select * from support_incident_queue');
  } finally { await db.closeAsync(); }
};

// Same native-call gate used by the existing stalled-disposal tests below.
const stallDiscoverySourceDisposal = async () => {
  const nativeGate = deferred();
  const entered = deferred();
  const holding = async (name, options) => {
    const db = await openDatabase(name, options);
    const run = db.runAsync.bind(db);
    db.runAsync = async (sql, ...params) => {
      if (String(sql).includes("'held'")) { entered.resolve(); await nativeGate.promise; }
      return run(sql, ...params);
    };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: holding });
  a.withTransaction(txn => txn.runAsync("insert into local_state (key, value, updated_at) values ('held', '1', 'now')")).catch(() => {});
  await entered.promise;
  await requestClose({ reason: 'discovery fence test' });
  return { a, nativeGate };
};

test('discovery cancellation closes its active read, skips the next file and fences a same-file sign-in', async () => {
  await seedDiscoveryFile(A);
  await seedDiscoveryFile(C);
  const entered = deferred();
  const release = deferred();
  const reads = [];
  const readOpener = jest.fn(async (name, options) => {
    if (name === databaseNameForUser(A)) { entered.resolve(); await release.promise; }
    const db = await openDatabase(name, options);
    reads.push({ name, close: jest.spyOn(db, 'closeAsync') });
    return db;
  });
  const b = await requestOpen({ userId: B, openDatabase, discover: ({ handle }) => discoverAndQueueIncidents({
    handle, listNames: () => [databaseNameForUser(A), databaseNameForUser(C)], openDatabase: readOpener,
  }) });
  await entered.promise;
  let openedA = null;
  const openingA = requestOpen({ userId: A, openDatabase }).then(handle => { openedA = handle; return handle; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    expect(openedA).toBeNull();
    expect(b.isOpen()).toBe(false);
  } finally { release.resolve(); }
  const a = await openingA;
  await b.discovery;
  expect(a.isCurrent()).toBe(true);
  expect(readOpener.mock.calls.map(([name]) => name)).toEqual([databaseNameForUser(A)]);
  expect(reads).toHaveLength(1);
  reads.forEach(({ close }) => expect(close).toHaveBeenCalledTimes(1));
  expect(await readDiscoveryQueue(B)).toEqual([]);
});

test('discovery waits for a pending disposal before opening that file read-only', async () => {
  await seedDiscoveryFile(A);
  const { a, nativeGate } = await stallDiscoverySourceDisposal();
  const events = [];
  const disposed = whenDisposed(a.fileName).then(() => { events.push('disposed'); });
  const readOpener = jest.fn(async (name, options) => {
    events.push('read');
    return openDatabase(name, options);
  });
  const b = await requestOpen({ userId: B, openDatabase, discover: ({ handle }) => discoverAndQueueIncidents({
    handle, listNames: () => [a.fileName], openDatabase: readOpener,
  }) });
  try {
    await new Promise(resolve => setImmediate(resolve));
    expect(b.isCurrent()).toBe(true);
    expect(readOpener).not.toHaveBeenCalled();
  } finally { nativeGate.resolve(); }
  await disposed;
  await b.discovery;
  expect(events).toEqual(['disposed', 'read']);
  expect(readOpener).toHaveBeenCalledWith(a.fileName, { useNewConnection: true });
  expect(await b.repositories.supportIncidents.listPending()).toHaveLength(1);
});

test('sign-out while discovery waits at the fence skips its read and releases the next same-file open', async () => {
  await seedDiscoveryFile(A);
  const { a, nativeGate } = await stallDiscoverySourceDisposal();
  const readOpener = jest.fn(openDatabase);
  const b = await requestOpen({ userId: B, openDatabase, discover: ({ handle }) => discoverAndQueueIncidents({
    handle, listNames: () => [a.fileName], openDatabase: readOpener,
  }) });
  let openingA;
  try {
    await new Promise(resolve => setImmediate(resolve));
    expect(readOpener).not.toHaveBeenCalled();
    await requestClose({ reason: 'sign-out during discovery fence wait' });
    let reopened = false;
    openingA = requestOpen({ userId: A, openDatabase }).then(handle => { reopened = true; return handle; });
    await new Promise(resolve => setImmediate(resolve));
    expect(reopened).toBe(false);
  } finally { nativeGate.resolve(); }
  const freshA = await openingA;
  await b.discovery;
  expect(freshA.isCurrent()).toBe(true);
  expect(readOpener).not.toHaveBeenCalled();
  expect(await readDiscoveryQueue(B)).toEqual([]);
});

test('late recovery disposal cannot release a discovery read or publish a same-file reopen', async () => {
  const recoveryEntered = deferred();
  const releaseRecovery = deferred();
  const discoveryReserved = deferred();
  const readEntered = deferred();
  const releaseRead = deferred();
  let writerOpens = 0;
  let failRollback = true;
  const flaky = async (name, options) => {
    if (!options?.useNewConnection && ++writerOpens === 2) {
      recoveryEntered.resolve();
      await releaseRecovery.promise;
    }
    const db = await openDatabase(name, options);
    const exec = db.execAsync.bind(db);
    db.execAsync = async (sql) => {
      if (failRollback && sql === 'ROLLBACK') {
        failRollback = false;
        throw new Error('rollback failed');
      }
      return exec(sql);
    };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: flaky });
  await expect(a.withTransaction(async () => { throw new Error('original'); })).rejects.toThrow('original');
  const recovering = a.withTransaction(async () => {});
  const recovered = recovering.then(() => null, error => error);
  await recoveryEntered.promise;

  let readDb;
  const readOpener = jest.fn(async (name, options) => {
    const db = await openDatabase(name, options);
    readDb = db;
    const getAll = db.getAllAsync.bind(db);
    db.getAllAsync = async (...args) => {
      readEntered.resolve();
      await releaseRead.promise;
      return getAll(...args);
    };
    return db;
  });
  let openingA;
  let b;
  let fenced;
  try {
    b = await requestOpen({ userId: B, openDatabase, discover: ({ handle }) => discoverAndQueueIncidents({
      handle, listNames: () => { discoveryReserved.resolve(); return [a.fileName]; }, openDatabase: readOpener,
    }) });
    await discoveryReserved.promise;
    expect(b.isCurrent()).toBe(true);
    expect(readOpener).not.toHaveBeenCalled();

    releaseRecovery.resolve();
    expect(await recovered).toBeInstanceOf(StaleActorError);
    await readEntered.promise;
    // The revoked recovery bundle has physically closed, but B still holds A's raw read.
    expect(a.isConnectionClosed()).toBe(true);
    expect(readDb.isOpen).toBe(true);
    let disposed = false;
    fenced = whenDisposed(a.fileName).then(() => { disposed = true; });
    let reopened = null;
    openingA = requestOpen({ userId: A, openDatabase }).then(handle => { reopened = handle; return handle; });
    await new Promise(resolve => setImmediate(resolve));

    expect({ disposed, reopened: reopened !== null }).toEqual({ disposed: false, reopened: false });
    expect(getCurrentHandle()).toBeNull();
    expect(b.isOpen()).toBe(false);
  } finally {
    releaseRecovery.resolve();
    releaseRead.resolve();
    await recovered;
    await b?.discovery;
    await fenced;
    await openingA;
  }
  const freshA = await openingA;
  expect(readDb.isOpen).toBe(false);
  expect(freshA.isCurrent()).toBe(true);
});

test('successive file reads wait only for readers reserved before each call', async () => {
  const firstEntered = deferred();
  const releaseFirst = deferred();
  const first = readUnderFileFence(databaseNameForUser(A), async () => {
    firstEntered.resolve();
    await releaseFirst.promise;
  });
  await firstEntered.promise;
  const secondTask = jest.fn(async () => {});
  const second = readUnderFileFence(databaseNameForUser(A), secondTask);
  expect(secondTask).not.toHaveBeenCalled();
  releaseFirst.resolve();
  await first;
  await second;
  expect(secondTask).toHaveBeenCalledTimes(1);
  await whenDisposed(databaseNameForUser(A));
});

test('bootstrap cleanup failure fences discovery even without a disposal promise', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const failing = async (name, options) => {
    const db = await openDatabase(name, options);
    // Exercise openConfiguredConnections' half-open-bootstrap cleanup path.
    db.execAsync = async () => { throw new Error('bootstrap failed'); };
    db.closeAsync = async () => { throw new Error('close failed'); };
    return db;
  };
  await expect(requestOpen({ userId: A, openDatabase: failing })).rejects.toMatchObject({
    message: 'bootstrap failed', connectionDisposalFailed: true,
  });
  await expect(whenDisposed(databaseNameForUser(A))).resolves.toBeUndefined();
  const task = jest.fn();
  await expect(readUnderFileFence(databaseNameForUser(A), task)).rejects.toMatchObject({
    name: 'HandleDisposeFailedError', code: 'HANDLE_DISPOSE_FAILED',
  });
  expect(task).not.toHaveBeenCalled();
  const readOpener = jest.fn(openDatabase);
  const b = await requestOpen({ userId: B, openDatabase, discover: ({ handle }) => discoverAndQueueIncidents({
    handle, listNames: () => [databaseNameForUser(A)], openDatabase: readOpener,
  }) });
  await b.discovery;
  expect(readOpener).not.toHaveBeenCalled();
  expect(await b.repositories.supportIncidents.listPending()).toEqual([]);
  await expect(requestOpen({ userId: A, openDatabase })).rejects.toMatchObject({ code: 'HANDLE_DISPOSE_FAILED' });
});

test('T1: A opens masi-A.db, B opens masi-B.db, and closing leaves no current handle', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  expect(a.fileName).toBe(databaseNameForUser(A));
  expect(getCurrentHandle()).toBe(a);
  const b = await requestOpen({ userId: B, openDatabase });
  expect(a.state).toBe('closed');
  expect(b.fileName).toBe(`masi-${B}.db`);
  await requestClose({ reason: 'test' });
  expect(getCurrentHandle()).toBeNull();
  expect(() => requireCurrentHandle()).toThrow(NoSignedInEAError);
  expect(opened).not.toContain('masi.db');
});

test('the raw writer and every transaction facade are registered with the EA as their actor', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  expect(getConnectionActor(connections[0])).toBe(A);
  const { runWithTransaction } = require('../src/db/repositories/sqliteRepositoryUtils');
  const nestedTask = jest.fn();
  for (let i = 0; i < 2; i += 1) {
    await a.withTransaction(async (txn) => {
      expect(getConnectionActor(txn)).toBe(A);
      await expect(runWithTransaction(txn, nestedTask)).rejects.toThrow();
    });
  }
  expect(nestedTask).not.toHaveBeenCalled();
});

test.each(['COMMIT', 'ROLLBACK'])('a settled task closes its facade before %s and keeps it closed afterward', async (control) => {
  const a = await requestOpen({ userId: A, openDatabase });
  const reader = await a.getReader();
  const writer = connections[0];
  const exec = writer.execAsync.bind(writer);
  const entered = deferred();
  const release = deferred();
  jest.spyOn(writer, 'execAsync').mockImplementation(async (sql) => {
    if (sql === control) { entered.resolve(); await release.promise; }
    return exec(sql);
  });
  const nativeMethods = ['runAsync', 'getFirstAsync', 'getAllAsync'];
  const nativeSpies = nativeMethods.map((method) => jest.spyOn(writer, method));
  const taskError = new Error('task failed');
  let captured;
  const write = a.withTransaction(async (txn) => {
    captured = txn;
    if (control === 'ROLLBACK') throw taskError;
    return 'done';
  });
  const settled = write.then((value) => ({ value }), (error) => ({ error }));
  await entered.promise;
  const duringControl = Promise.all(nativeMethods.map((method, i) => captured[method](
    `insert into local_state (key, value) values ('late-${i}', 'x') returning key`
  ).then(() => null, (error) => error)));
  release.resolve();
  expect(await settled).toEqual(control === 'COMMIT' ? { value: 'done' } : { error: taskError });
  const afterControl = await captured.runAsync(
    "insert into local_state (key, value) values ('late-after', 'x')"
  ).then(() => null, (error) => error);
  for (const error of [...await duringControl, afterControl]) {
    expect(error?.constructor).toBe(Error);
    expect(error.message).toBe('Transaction facade used after its transaction ended');
  }
  for (const spy of nativeSpies) expect(spy).not.toHaveBeenCalled();
  expect(await reader.getAllAsync("select key from local_state where key like 'late-%'")).toEqual([]);
});

test('a captured facade cannot write inside a later transaction that rolls back', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  const reader = await a.getReader();
  let captured;
  await a.withTransaction(async (txn) => { captured = txn; });
  const nativeWrite = jest.spyOn(connections[0], 'runAsync');
  const taskError = new Error('second task failed');
  let refused;
  let visibleInside;
  await expect(a.withTransaction(async (txn) => {
    refused = await captured.runAsync(
      "insert into local_state (key, value) values ('stray', 'x')"
    ).then(() => null, (error) => error);
    visibleInside = await txn.getFirstAsync("select key from local_state where key = 'stray'");
    await txn.runAsync("insert into local_state (key, value) values ('second', 'x')");
    throw taskError;
  })).rejects.toBe(taskError);
  expect(refused?.constructor).toBe(Error);
  expect(refused.message).toBe('Transaction facade used after its transaction ended');
  expect(visibleInside).toBeNull();
  expect(nativeWrite).toHaveBeenCalledTimes(1);
  expect(nativeWrite).toHaveBeenCalledWith("insert into local_state (key, value) values ('second', 'x')");
  expect(await reader.getAllAsync("select key from local_state where key in ('stray', 'second')")).toEqual([]);
});

test('statements enqueued without awaiting during the task commit with that transaction', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  const reader = await a.getReader();
  const writer = connections[0];
  const run = writer.runAsync.bind(writer);
  const entered = deferred();
  const release = deferred();
  const nativeWrite = jest.spyOn(writer, 'runAsync').mockImplementation(async (sql, ...params) => {
    if (sql.includes("'unawaited-first'")) { entered.resolve(); await release.promise; }
    expect(writer.raw.inTransaction).toBe(true);
    return run(sql, ...params);
  });
  let first;
  let second;
  const write = a.withTransaction((txn) => {
    first = txn.runAsync("insert into local_state (key, value) values ('unawaited-first', '1')");
    second = txn.runAsync("insert into local_state (key, value) values ('unawaited-second', '2')");
    first.catch(() => {});
    second.catch(() => {});
  });
  await entered.promise;
  expect(await reader.getAllAsync("select key from local_state where key like 'unawaited-%'")).toEqual([]);
  release.resolve();
  await write;
  await Promise.all([first, second]);
  nativeWrite.mockRestore();
  expect(await reader.getAllAsync("select key from local_state where key like 'unawaited-%' order by key"))
    .toEqual([{ key: 'unawaited-first' }, { key: 'unawaited-second' }]);
});

test('T4: a transaction that has begun, with sign-out before COMMIT, rolls back', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  const begun = deferred();
  const release = deferred();
  const write = a.withTransaction(async (txn) => {
    await txn.runAsync("insert into local_state (key, value, updated_at) values ('probe', '1', 'now')");
    begun.resolve();
    await release.promise;
  });
  await begun.promise;
  const closing = requestClose({ reason: 'test' });
  await closing;
  release.resolve();
  let caught = null;
  try { await write; } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(StaleActorError);
  await closing;
  const again = await requestOpen({ userId: A, openDatabase });
  const reader = await again.getReader();
  expect(await reader.getFirstAsync("select value from local_state where key = 'probe'")).toBeNull();
});

test('T4: a transaction started after sign-out is refused', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  await requestClose({ reason: 'test' });
  let caught = null;
  try { await a.withTransaction(async () => {}); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(StaleActorError);
});

test('ruling 8: a JavaScript-suspended transaction does not block disposal and never commits', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  const begun = deferred();
  const resume = deferred();
  const write = a.withTransaction(async (txn) => {
    await txn.runAsync("insert into local_state (key, value, updated_at) values ('hung', '1', 'now')");
    begun.resolve();
    await resume.promise;
    await txn.runAsync("insert into local_state (key, value, updated_at) values ('after', '1', 'now')");
  });
  await begun.promise;
  await requestClose({ reason: 'test' });          // resolves: no native call is in flight
  await whenDisposed(a.fileName);                 // JavaScript suspension cannot hold disposal
  expect(a.isConnectionClosed()).toBe(true);
  resume.resolve();
  let caught = null;
  try { await write; } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(StaleActorError);    // the gate refused the resumed call
  const again = await requestOpen({ userId: A, openDatabase });
  const reader = await again.getReader();
  expect(await reader.getFirstAsync("select key from local_state where key in ('hung', 'after')")).toBeNull();
});

test('ruling 8: disposal waits for an in-flight native call, and the watchdog reports without disposing', async () => {
  // Hold one native call in flight: the opener wraps runAsync so a chosen statement awaits a gate
  // BEFORE reaching SQLite (this models a call still executing on the native queue).
  const nativeGate = deferred();
  const entered = deferred();
  const holding = async (name, options) => {
    const db = await openDatabase(name, options);
    const run = db.runAsync.bind(db);
    db.runAsync = async (sql, ...params) => {
      if (String(sql).includes("'held'")) { entered.resolve(); await nativeGate.promise; }
      return run(sql, ...params);
    };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: holding });
  const write = a.withTransaction((txn) => txn.runAsync("insert into local_state (key, value, updated_at) values ('held', '1', 'now')"));
  write.catch(() => {});
  await entered.promise;
  const report = jest.spyOn(require('../src/services/observability'), 'captureOperationalError').mockImplementation(() => {});
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  await requestClose({ reason: 'test' });            // revocation resolves at once
  let disposed = false;
  whenDisposed(a.fileName).then(() => { disposed = true; });
  await jest.advanceTimersByTimeAsync(5_000);
  jest.useRealTimers();
  expect(report).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ category: 'handle_close_stalled' }));
  expect(disposed).toBe(false);
  expect(a.isConnectionClosed()).toBe(false);       // never disposed early
  nativeGate.resolve();
  await whenDisposed(a.fileName);
  expect(a.isConnectionClosed()).toBe(true);
  report.mockRestore();
});

test('ruling 8: a transaction resuming during disposal cannot run ROLLBACK while the writer closes', async () => {
  // Instrument the raw connections: record every native call and whether a close was in progress.
  const log = [];
  const releaseReaderClose = deferred();
  const readerCloseEntered = deferred();
  const instrumented = async (name, options) => {
    const db = await openDatabase(name, options);
    const isReader = Boolean(options?.useNewConnection);
    const connection = isReader ? 'reader' : 'writer';
    let closingThis = false;
    for (const method of ['execAsync', 'runAsync', 'getFirstAsync', 'getAllAsync']) {
      const original = db[method].bind(db);
      db[method] = async (...args) => { log.push({ connection, method, sql: String(args[0]), duringClose: closingThis }); return original(...args); };
    }
    const close = db.closeAsync.bind(db);
    db.closeAsync = async () => {
      closingThis = true;
      if (isReader) { readerCloseEntered.resolve(); await releaseReaderClose.promise; }
      return close();
    };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: instrumented });
  const begun = deferred();
  const resume = deferred();
  const write = a.withTransaction(async (txn) => {
    await txn.runAsync("insert into local_state (key, value, updated_at) values ('late', '1', 'now')");
    begun.resolve();
    await resume.promise;
    await txn.runAsync("insert into local_state (key, value, updated_at) values ('later', '1', 'now')");
  });
  await begun.promise;
  await requestClose({ reason: 'test' });
  await readerCloseEntered.promise;
  log.length = 0;
  resume.resolve();                                   // resumes while the reader close is held
  let caught = null;
  try { await write; } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(StaleActorError);
  releaseReaderClose.resolve();
  await whenDisposed(a.fileName);
  // No native call reaches a connection while that same connection is closing; only disposal's
  // own ROLLBACK runs on the writer (the reader may be closing at the same time; that is allowed).
  expect(log.filter((entry) => entry.duringClose)).toEqual([]);
  expect(log.filter((entry) => /^\s*ROLLBACK/i.test(entry.sql)).length).toBeLessThanOrEqual(1);
  const again = await requestOpen({ userId: A, openDatabase });
  const reader = await again.getReader();
  expect(await reader.getFirstAsync("select key from local_state where key in ('late', 'later')")).toBeNull();
});

test('ruling 8: the facade exposes only the production methods and refuses caller transaction control', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  const reader = await a.getReader();
  expect(Object.keys(reader).sort()).toEqual(['getAllAsync', 'getFirstAsync', 'runAsync']);
  await a.withTransaction(async (txn) => {
    const refused = [
      'BEGIN', ' commit', '/* x */ ROLLBACK', 'savepoint s1', 'RELEASE s1', 'END', '; BEGIN',
      "select 1; COMMIT", "insert into local_state (key, value, updated_at) values ('x','1','n'); COMMIT; BEGIN IMMEDIATE",
      'PRAGMA query_only = OFF', "ATTACH DATABASE 'other.db' AS other", 'VACUUM',
      "insert or rollback into local_state (key, value, updated_at) values ('k','1','n')",
      "UPDATE /* c */ OR\n ROLLBACK local_state set value = '2' where key = 'k'",
      "with x as (select 1) insert or rollback into local_state (key, value, updated_at) select 'k','1','n' from x",
    ];
    for (const sql of refused) {
      let caught = null;
      try { await txn.runAsync(sql); } catch (error) { caught = error; }
      expect(caught).not.toBeNull();
    }
    await txn.runAsync('PRAGMA defer_foreign_keys = ON');             // allowlisted
    const result = await txn.runAsync("insert into local_state (key, value, updated_at) values ('plain', '1', 'n')");
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.keys(result).sort()).toEqual(['changes', 'lastInsertRowId']);
    expect(Object.getOwnPropertySymbols(result)).toEqual([]);
  });
  expect(await reader.getFirstAsync('PRAGMA user_version')).toEqual(expect.objectContaining({ user_version: expect.any(Number) }));
  const { runWithTransaction } = require('../src/db/repositories/sqliteRepositoryUtils');
  let caught = null;
  try { await runWithTransaction(reader, async () => {}); } catch (error) { caught = error; }
  expect(caught).not.toBeNull();
});

test('ruling 8: a refused OR ROLLBACK leaves the transaction intact and later work is undone on revocation', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  await a.withTransaction(async (txn) => {
    await txn.runAsync("insert into local_state (key, value, updated_at) values ('dup', '1', 'n')");
  });
  const begun = deferred();
  const release = deferred();
  const write = a.withTransaction(async (txn) => {
    await txn.runAsync("insert into local_state (key, value, updated_at) values ('first', '1', 'n')");
    await txn.runAsync("insert or rollback into local_state (key, value, updated_at) values ('dup', '2', 'n')").catch(() => {});
    await txn.runAsync("insert into local_state (key, value, updated_at) values ('second', '1', 'n')");
    begun.resolve();
    await release.promise;
  });
  await begun.promise;
  await requestClose({ reason: 'test' });
  release.resolve();
  await write.catch(() => {});
  await whenDisposed(a.fileName);
  const again = await requestOpen({ userId: A, openDatabase });
  const reader = await again.getReader();
  expect(await reader.getAllAsync("select key from local_state where key in ('first', 'second')")).toEqual([]);
});

test('ruling 8: both sides of the COMMIT boundary are durable as defined', async () => {
  // An already-running COMMIT finishes and survives reopening.
  let armed = false;
  const commitEntered = deferred();
  const commitRelease = deferred();
  const holdingCommit = async (name, options) => {
    const db = await openDatabase(name, options);
    const exec = db.execAsync.bind(db);
    db.execAsync = async (sql) => {
      if (armed && /^\s*COMMIT/i.test(String(sql))) { commitEntered.resolve(); await commitRelease.promise; }
      return exec(sql);
    };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: holdingCommit });
  armed = true;
  const committed = a.withTransaction((txn) => txn.runAsync("insert into local_state (key, value, updated_at) values ('kept', '1', 'n')"));
  await commitEntered.promise;
  await requestClose({ reason: 'test' });
  commitRelease.resolve();
  await committed;
  await whenDisposed(a.fileName);
  // A COMMIT not yet started when the seal lands is refused and its changes are gone.
  const second = await requestOpen({ userId: A, openDatabase });
  const begun = deferred();
  const release = deferred();
  const refused = second.withTransaction(async (txn) => {
    await txn.runAsync("insert into local_state (key, value, updated_at) values ('dropped', '1', 'n')");
    begun.resolve();
    await release.promise;
  });
  await begun.promise;
  await requestClose({ reason: 'test' });
  release.resolve();
  let caught = null;
  try { await refused; } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(StaleActorError);
  await whenDisposed(second.fileName);
  const third = await requestOpen({ userId: A, openDatabase });
  const reader = await third.getReader();
  expect(await reader.getFirstAsync("select key from local_state where key = 'kept'")).toEqual({ key: 'kept' });
  expect(await reader.getFirstAsync("select key from local_state where key = 'dropped'")).toBeNull();
});

// Statement-policy refusals must happen before any native call: spy on the raw connection.
test('ruling 8: refused SQL never reaches the native connection', async () => {
  const calls = [];
  const spying = async (name, options) => {
    const db = await openDatabase(name, options);
    const run = db.runAsync.bind(db);
    db.runAsync = async (sql, ...params) => { calls.push(String(sql)); return run(sql, ...params); };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: spying });
  calls.length = 0;
  await a.withTransaction(async (txn) => { await txn.runAsync('select 1; COMMIT').catch(() => {}); });
  expect(calls.some((sql) => /COMMIT/.test(sql) && /select 1/.test(sql))).toBe(false);
});

// Barriers inside the handle's own transaction control: disposal never overlaps them.
for (const control of ['BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK']) {
  test(`ruling 8: disposal waits for an in-progress ${control} and never overlaps it`, async () => {
    let armed = false;
    const entered = deferred();
    const release = deferred();
    // Overlap is measured PER RAW CONNECTION: the reader may close while the writer is busy.
    const overlaps = [];
    const afterClose = [];
    const instrumented = async (name, options) => {
      const db = await openDatabase(name, options);
      const connection = options?.useNewConnection ? 'reader' : 'writer';
      let active = 0;
      let closed = false;
      for (const method of ['execAsync', 'runAsync', 'getFirstAsync', 'getAllAsync', 'closeAsync']) {
        const original = db[method].bind(db);
        db[method] = async (...args) => {
          if (closed) afterClose.push({ connection, method });
          if (active > 0) overlaps.push({ connection, method });
          active += 1;
          try {
            if (armed && method === 'execAsync' && String(args[0]).trim().toUpperCase().startsWith(control)) { entered.resolve(); await release.promise; }
            return await original(...args);
          } finally {
            active -= 1;
            if (method === 'closeAsync') closed = true;
          }
        };
      }
      return db;
    };
    const a = await requestOpen({ userId: A, openDatabase: instrumented });
    armed = true;
    const work = a.withTransaction(async (txn) => {
      await txn.runAsync("insert into local_state (key, value, updated_at) values ('c', '1', 'n')");
      if (control === 'ROLLBACK') throw new Error('force the error-path rollback');
    });
    work.catch(() => {});
    await entered.promise;
    await requestClose({ reason: 'test' });
    release.resolve();
    await work.catch(() => {});
    await whenDisposed(a.fileName);
    expect(overlaps).toEqual([]);          // no connection ever runs two native calls at once
    expect(afterClose).toEqual([]);        // no native call reaches a connection after its close
  });
}

test('ruling 8: SQLite auto-rollback and a failing last_active_at write still close both connections', async () => {
  const closed = [];
  const failing = async (name, options) => {
    const db = await openDatabase(name, options);
    const exec = db.execAsync.bind(db);
    const run = db.runAsync.bind(db);
    db.execAsync = async (sql) => {
      if (/^\s*ROLLBACK/i.test(String(sql))) throw new Error('cannot rollback - no transaction is active');
      return exec(sql);
    };
    db.runAsync = async (sql, ...params) => {
      if (String(sql).includes('last_active_at')) throw new Error('database or disk is full');
      return run(sql, ...params);
    };
    const close = db.closeAsync.bind(db);
    db.closeAsync = async () => { closed.push(options?.useNewConnection ? 'reader' : 'writer'); return close(); };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: failing });
  await requestClose({ reason: 'test' });
  await whenDisposed(a.fileName);
  expect(closed.sort()).toEqual(['reader', 'writer']);
  const again = await requestOpen({ userId: A, openDatabase });   // not fenced: both closes succeeded
  expect(again.isOpen()).toBe(true);
});

test('Review focus 2: a parked same-file reopen is superseded by sign-out and by B', async () => {
  const nativeGate = deferred();
  const entered = deferred();
  const holding = async (name, options) => {
    const db = await openDatabase(name, options);
    const run = db.runAsync.bind(db);
    db.runAsync = async (sql, ...params) => {
      if (String(sql).includes("'held'")) { entered.resolve(); await nativeGate.promise; }
      return run(sql, ...params);
    };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: holding });
  a.withTransaction((txn) => txn.runAsync("insert into local_state (key, value, updated_at) values ('held', '1', 'n')")).catch(() => {});
  await entered.promise;
  await requestClose({ reason: 'test' });
  const parked = requestOpen({ userId: A, openDatabase });          // parks on A's disposal
  await new Promise((resolve) => setImmediate(resolve));
  await requestClose({ reason: 'test' });                           // must not wait for A's disposal
  const b = await requestOpen({ userId: B, openDatabase });         // must not wait either
  expect(await parked).toBeNull();
  expect(getCurrentHandle()).toBe(b);
  nativeGate.resolve();
  await whenDisposed(a.fileName);
  expect(getCurrentHandle()).toBe(b);
});

test('Review focus 2: B opens while A\'s disposal is stalled, and A\'s late disposal leaves B published', async () => {
  const nativeGate = deferred();
  const entered = deferred();
  const holding = async (name, options) => {
    const db = await openDatabase(name, options);
    const run = db.runAsync.bind(db);
    db.runAsync = async (sql, ...params) => {
      if (String(sql).includes("'held'")) { entered.resolve(); await nativeGate.promise; }
      return run(sql, ...params);
    };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: holding });
  a.withTransaction((txn) => txn.runAsync("insert into local_state (key, value, updated_at) values ('held', '1', 'now')")).catch(() => {});
  await entered.promise;
  await requestClose({ reason: 'test' });
  const b = await requestOpen({ userId: B, openDatabase });   // not blocked by A's pending disposal
  expect(getCurrentHandle()).toBe(b);
  nativeGate.resolve();
  await whenDisposed(a.fileName);
  expect(getCurrentHandle()).toBe(b);
  expect(b.isOpen()).toBe(true);
});

test('ruling 8: a failed closeAsync blocks a same-file reopen but not another EA', async () => {
  const failingClose = async (name, options) => {
    const db = await openDatabase(name, options);
    if (name.includes(A)) db.closeAsync = async () => { throw new Error('close failed'); };
    return db;
  };
  await requestOpen({ userId: A, openDatabase: failingClose });
  await requestClose({ reason: 'test' });
  let caught = null;
  try { await requestOpen({ userId: A, openDatabase }); } catch (error) { caught = error; }
  expect(caught?.name).toBe('HandleDisposeFailedError');
  const b = await requestOpen({ userId: B, openDatabase });
  expect(b.userId).toBe(B);
});

test('T10: sign-out writes last_active_at and the file survives', async () => {
  await requestOpen({ userId: A, openDatabase });
  await requestClose({ reason: 'test' });
  expect(fs.existsSync(path.join(dir, `masi-${A}.db`))).toBe(true);
  const again = await requestOpen({ userId: A, openDatabase });
  const reader = await again.getReader();
  const row = await reader.getFirstAsync("select value from local_state where key = 'last_active_at'");
  expect(Date.parse(row.value)).not.toBeNaN();
});

test('ruling 4: a file whose owner marker names another EA refuses to open and publishes nothing', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  await a.withTransaction(async (txn) => {
    await txn.runAsync("update local_state set value = ? where key = 'file_owner_user_id'", B);
  });
  await requestClose({ reason: 'test' });
  let caught = null;
  try { await requestOpen({ userId: A, openDatabase }); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(FileOwnerMismatchError);
  expect(getCurrentHandle()).toBeNull();
});

test('a migration failure publishes no handle', async () => {
  const failing = async (name, options) => {
    const db = await openDatabase(name, options);
    const exec = db.execAsync.bind(db);
    db.execAsync = async (sql) => { if (/create table/i.test(sql)) throw new Error('disk full'); return exec(sql); };
    return db;
  };
  let caught = null;
  try { await requestOpen({ userId: '33333333-3333-4333-8333-333333333333', openDatabase: failing }); } catch (error) { caught = error; }
  expect(caught?.message).toMatch('disk full');
  expect(getCurrentHandle()).toBeNull();
});

// Each coordinator test proves the open has ENTERED its work (a barrier inside the opener)
// before the competing request is made, so the final pre-publish generation check is exercised.
const blockingOpener = (matchUserId) => {
  const entered = deferred();
  const release = deferred();
  const opener = async (name, options) => {
    const db = await openDatabase(name, options);
    if (name.includes(matchUserId)) { entered.resolve(); await release.promise; }
    return db;
  };
  return { opener, entered, release };
};

test('Review focus 2: sign-out after A has entered opening means A is never published', async () => {
  const { opener, entered, release } = blockingOpener(A);
  const opening = requestOpen({ userId: A, openDatabase: opener });
  await entered.promise;
  const closing = requestClose({ reason: 'test' });
  release.resolve();
  expect(await opening).toBeNull();
  await closing;
  expect(getCurrentHandle()).toBeNull();
});

test('Review focus 2: overlapping A then B, with A inside its open, publishes only B', async () => {
  const { opener, entered, release } = blockingOpener(A);
  const openingA = requestOpen({ userId: A, openDatabase: opener });
  await entered.promise;
  const openingB = requestOpen({ userId: B, openDatabase });
  release.resolve();
  expect(await openingA).toBeNull();
  const b = await openingB;
  expect(getCurrentHandle()).toBe(b);
});

test('Review focus 2: A → B → A while the first A open is blocked publishes the second A only', async () => {
  const { opener, entered, release } = blockingOpener(A);
  const firstA = requestOpen({ userId: A, openDatabase: opener });
  await entered.promise;
  const openingB = requestOpen({ userId: B, openDatabase });
  const secondA = requestOpen({ userId: A, openDatabase });
  release.resolve();
  expect(await firstA).toBeNull();
  expect(await openingB).toBeNull();
  const a = await secondA;
  expect(getCurrentHandle()).toBe(a);
});

test('Review focus 2: a duplicate same-user open joins only a transition that has not been superseded', async () => {
  const [first, second] = await Promise.all([
    requestOpen({ userId: A, openDatabase }),
    requestOpen({ userId: A, openDatabase }),
  ]);
  expect(second).toBe(first);
  expect(opened.filter((name) => name === `masi-${A}.db`).length).toBe(2); // one writer + one reader
  // A superseded A open is not joined: A (blocked), close, A again → the last A is a new handle.
  await requestClose({ reason: 'test' });
  const { opener, entered, release } = blockingOpener(A);
  const blocked = requestOpen({ userId: A, openDatabase: opener });
  await entered.promise;
  const closing = requestClose({ reason: 'test' });
  const fresh = requestOpen({ userId: A, openDatabase });
  release.resolve();
  expect(await blocked).toBeNull();
  await closing;
  expect((await fresh).isCurrent()).toBe(true);
});

test('Review focus 2: a same-file reopen waits for physical disposal of the previous handle', async () => {
  const nativeGate = deferred();
  const entered = deferred();
  const holding = async (name, options) => {
    const db = await openDatabase(name, options);
    const run = db.runAsync.bind(db);
    db.runAsync = async (sql, ...params) => {
      if (String(sql).includes("'held'")) { entered.resolve(); await nativeGate.promise; }
      return run(sql, ...params);
    };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: holding });
  a.withTransaction((txn) => txn.runAsync("insert into local_state (key, value, updated_at) values ('held', '1', 'now')")).catch(() => {});
  await entered.promise;
  const closing = requestClose({ reason: 'test' });
  let reopened = null;
  const reopening = requestOpen({ userId: A, openDatabase }).then((handle) => { reopened = handle; return handle; });
  await new Promise((resolve) => setImmediate(resolve));
  expect(reopened).toBeNull();                    // still waiting for A's native call
  nativeGate.resolve();
  await closing;
  const second = await reopening;
  expect(second.epoch).toBeGreaterThan(a.epoch);
});

test('a failed rollback retires both connections and the next transaction reopens the same file', async () => {
  let failOnce = true;
  const flaky = async (name, options) => {
    const db = await openDatabase(name, options);
    const exec = db.execAsync.bind(db);
    db.execAsync = async (sql) => {
      if (failOnce && /^ROLLBACK/i.test(sql)) { failOnce = false; throw new Error('rollback failed once'); }
      return exec(sql);
    };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: flaky });
  let oldWriter;
  const oldReader = await a.getReader();
  await expect(a.withTransaction(async (txn) => {
    oldWriter = txn;
    await txn.runAsync("insert into local_state (key, value) values ('rolled-back', 'x')");
    throw new Error('original task failure');
  })).rejects.toThrow('original task failure');
  await a.withTransaction((txn) => txn.runAsync("insert into local_state (key, value) values ('recovered', 'y')"));
  expect(connections).toHaveLength(4);
  expect(connections.slice(0, 2).map((db) => db.isOpen)).toEqual([false, false]);
  expect(new Set(opened)).toEqual(new Set([a.fileName]));
  expect(await (await a.getReader()).getAllAsync("select key from local_state where key in ('rolled-back', 'recovered')"))
    .toEqual([{ key: 'recovered' }]);
  await expect(oldWriter.runAsync('select 1')).rejects.toThrow('Transaction facade used after its transaction ended');
  await expect(oldReader.getAllAsync('select 1')).rejects.toBeInstanceOf(StaleActorError);
});

test('a non-trivial disposal rollback failure closes both sides but fences the file', async () => {
  const failing = async (name, options) => {
    const db = await openDatabase(name, options);
    const exec = db.execAsync.bind(db);
    db.execAsync = async (sql) => {
      if (/^ROLLBACK/i.test(sql)) throw new Error('disk I/O error');
      return exec(sql);
    };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: failing });
  await requestClose({ reason: 'test' });
  await expect(whenDisposed(a.fileName)).rejects.toMatchObject({ code: 'HANDLE_DISPOSE_FAILED' });
  expect(connections.map((db) => db.isOpen)).toEqual([false, false]);
  await expect(requestOpen({ userId: A, openDatabase })).rejects.toMatchObject({ code: 'HANDLE_DISPOSE_FAILED' });
  expect((await requestOpen({ userId: B, openDatabase })).isOpen()).toBe(true);
});

test('a startup repair failure closes the unpublished handle and permits a clean retry', async () => {
  const failing = async (name, options) => {
    const db = await openDatabase(name, options);
    const run = db.runAsync.bind(db);
    db.runAsync = async (sql, ...params) => {
      if (params.includes('startup_repair_version')) throw new Error('repair marker failed');
      return run(sql, ...params);
    };
    return db;
  };
  await expect(requestOpen({ userId: A, openDatabase: failing })).rejects.toThrow('repair marker failed');
  expect(getCurrentHandle()).toBeNull();
  await whenDisposed(databaseNameForUser(A));
  expect(connections.map((db) => db.isOpen)).toEqual([false, false]);
  const a = await requestOpen({ userId: A, openDatabase });
  expect(await (await a.getReader()).getFirstAsync("select value from local_state where key = 'startup_repair_version'"))
    .toEqual({ value: '1' });
});

test('open adopts legacy work and quarantines foreign work before recovering the file owner’s in-flight rows', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  await a.withTransaction(async (txn) => {
    for (const [id, owner, status] of [['a', A, 'in_flight'], ['b', B, 'in_flight'], ['null', null, 'in_flight'], ['pending', A, 'pending']]) {
      await txn.runAsync(`insert into sync_outbox
        (id, table_name, record_id, operation, status, owner_user_id, retry_count, next_retry_at, created_at, updated_at)
        values (?, 'children', ?, 'insert', ?, ?, 3, 'later', 'then', 'then')`, id, id, status, owner ?? A);
      // Simulate the legacy NULL row preserved by the v12 migration.
      if (owner === null) await txn.runAsync('update sync_outbox set owner_user_id = null where id = ?', id);
    }
  });
  await requestClose({ reason: 'test' });
  const again = await requestOpen({ userId: A, openDatabase });
  const rows = await (await again.getReader()).getAllAsync('select id, owner_user_id, status, retry_count, next_retry_at, last_error from sync_outbox order by id');
  expect(rows).toEqual(['a', 'b', 'null', 'pending'].map((id) => ({
    id, owner_user_id: id === 'b' ? B : A,
    status: id === 'b' ? 'terminal' : 'pending', retry_count: 3,
    next_retry_at: id === 'b' ? null : 'later',
    last_error: id === 'b' ? 'foreign_owner'
      : id === 'pending' ? null : 'Upload interrupted; server outcome unknown',
  })));
});

test('closing seals queued native reads and queued whole transactions without executing them', async () => {
  const entered = deferred();
  const release = deferred();
  const rawQueries = [];
  const holding = async (name, options) => {
    const db = await openDatabase(name, options);
    const read = db.getFirstAsync.bind(db);
    db.getFirstAsync = async (sql, ...params) => {
      rawQueries.push(sql);
      if (sql === 'select 123 as held') { entered.resolve(); await release.promise; }
      return read(sql, ...params);
    };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: holding });
  const reader = await a.getReader();
  const read = reader.getFirstAsync('select 123 as held');
  await entered.promise;
  const queued = reader.getFirstAsync('select 456 as refused');
  queued.catch(() => {});
  const begun = deferred();
  const finish = deferred();
  const first = a.withTransaction(async () => { begun.resolve(); await finish.promise; });
  first.catch(() => {});
  await begun.promise;
  const ran = jest.fn();
  const second = a.withTransaction(ran);
  second.catch(() => {});
  await requestClose({ reason: 'test' });
  release.resolve();
  finish.resolve();
  await expect(read).resolves.toEqual({ held: 123 });
  await expect(queued).rejects.toBeInstanceOf(StaleActorError);
  await expect(first).rejects.toBeInstanceOf(StaleActorError);
  await expect(second).rejects.toBeInstanceOf(StaleActorError);
  expect(ran).not.toHaveBeenCalled();
  expect(rawQueries).not.toContain('select 456 as refused');
  await whenDisposed(a.fileName);
});

test('facades accept quoted SQL punctuation and comments, and the reader remains read-only', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  await a.withTransaction((txn) => txn.runAsync(
    "/* lead */ insert into local_state (key, value) values ('quoted', 'a; OR ROLLBACK ''b'''); -- tail"
  ));
  const reader = await a.getReader();
  expect(await reader.getFirstAsync("select value from local_state where key = 'quoted'; /* tail */"))
    .toEqual({ value: "a; OR ROLLBACK 'b'" });
  await expect(reader.runAsync("insert into local_state (key, value) values ('reader-write', 'x')"))
    .rejects.toMatchObject({ code: 'SQLITE_READONLY', message: expect.stringMatching(/readonly/i) });
  expect(await reader.getFirstAsync("select key from local_state where key = 'reader-write'"))
    .toBeNull();
});

test('a failed BEGIN is rolled back before the next transaction can run', async () => {
  let failNextBegin = false;
  const beginFailure = async (name, options) => {
    const db = await openDatabase(name, options);
    const exec = db.execAsync.bind(db);
    db.execAsync = async (sql) => {
      await exec(sql);
      if (failNextBegin && sql === 'BEGIN IMMEDIATE') {
        failNextBegin = false;
        throw new Error('native BEGIN result failed');
      }
    };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: beginFailure });
  failNextBegin = true;
  const ran = jest.fn();
  await expect(a.withTransaction(ran)).rejects.toThrow('native BEGIN result failed');
  expect(ran).not.toHaveBeenCalled();
  await expect(a.withTransaction(async () => 'next')).resolves.toBe('next');
});

test('subscribers see published handles and revocations, never a superseded provisional handle', async () => {
  const { subscribeToHandle, setLatestAuthSession, getLatestAuthSession } = require('../src/session/signedInHandle');
  const events = [];
  const unsubscribe = subscribeToHandle((handle) => events.push(handle));
  const { opener, entered, release } = blockingOpener(A);
  const first = requestOpen({ userId: A, openDatabase: opener });
  await entered.promise;
  const second = requestOpen({ userId: B, openDatabase });
  release.resolve();
  expect(await first).toBeNull();
  const b = await second;
  expect(events).toHaveLength(1);
  expect(events[0]).toBe(b);
  const closed = jest.fn();
  b.onClose(closed);
  setLatestAuthSession({ user: { id: B } });
  expect(getLatestAuthSession()).toEqual({ user: { id: B } });
  const beforeClose = b.epoch;
  await requestClose({ reason: 'test' });
  expect(events.map((handle) => handle?.userId ?? null)).toEqual([B, null]);
  expect(closed).toHaveBeenCalledTimes(1);
  expect(b.abortSignal.aborted).toBe(true);
  expect(b.epoch).toBeGreaterThan(beforeClose);
  unsubscribe();
  await requestOpen({ userId: A, openDatabase });
  expect(events.map((handle) => handle?.userId ?? null)).toEqual([B, null]);
  setLatestAuthSession(null);
  expect(getLatestAuthSession()).toBeNull();
});

test('sign-out during a failed recovery open still disposes safely and permits a later reopen', async () => {
  const entered = deferred();
  const release = deferred();
  let writerOpens = 0;
  let failRollback = true;
  const flaky = async (name, options) => {
    if (!options?.useNewConnection && ++writerOpens === 2) {
      entered.resolve();
      await release.promise;
      throw new Error('recovery open failed');
    }
    const db = await openDatabase(name, options);
    const exec = db.execAsync.bind(db);
    db.execAsync = async (sql) => {
      if (failRollback && sql === 'ROLLBACK') { failRollback = false; throw new Error('rollback failed'); }
      return exec(sql);
    };
    return db;
  };
  const a = await requestOpen({ userId: A, openDatabase: flaky });
  await expect(a.withTransaction(async () => { throw new Error('original'); })).rejects.toThrow('original');
  const recovering = a.withTransaction(async () => {});
  recovering.catch(() => {});
  await entered.promise;
  await requestClose({ reason: 'test' });
  const b = await requestOpen({ userId: B, openDatabase });
  release.resolve();
  await expect(recovering).rejects.toThrow('recovery open failed');
  await expect(whenDisposed(a.fileName)).resolves.toBeUndefined();
  expect(b.isCurrent()).toBe(true);
  const again = await requestOpen({ userId: A, openDatabase });
  expect(again.isCurrent()).toBe(true);
});
