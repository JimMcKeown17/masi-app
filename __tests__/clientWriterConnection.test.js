// Uses the repo's configurable expo-sqlite mock (the same harness as sqliteFoundation.test.js)
// so __setDatabaseFactory controls what each openDatabaseAsync call returns. The first open is
// the writer, the second (useNewConnection: true) is the read-only reader.
//
// We do NOT jest.mock('../src/db/migrations'): jest.setup.js require()s src/db/client (which
// binds the real runMigrations) before this file's mocks register, so the module mock would not
// take effect. Instead the fake writer reports the schema is already current
// (PRAGMA user_version === CURRENT_SCHEMA_VERSION), so the REAL runMigrations runs and returns
// immediately without emitting any migration SQL or FK toggles of its own.
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { __reset as resetExpoSQLiteMock, __setDatabaseFactory } from 'expo-sqlite';
import { CURRENT_SCHEMA_VERSION } from '../src/db/migrations';
import {
  withTransaction,
  getWriter,
  getDatabase,
  resetDatabaseConnectionForTests,
} from '../src/db/client';

const fakeConn = () => {
  const calls = [];
  return {
    calls,
    execAsync: jest.fn(async (sql) => { calls.push(sql); }),
    runAsync: jest.fn(async () => ({ changes: 0 })),
    // Report schema already current so runMigrations is a no-op.
    getFirstAsync: jest.fn(async (sql) => (
      /user_version/i.test(sql) ? { user_version: CURRENT_SCHEMA_VERSION } : null
    )),
    getAllAsync: jest.fn(async () => []),
    closeAsync: jest.fn(async () => {}),
  };
};

let writer;
let reader;

beforeEach(async () => {
  await resetDatabaseConnectionForTests();
  resetExpoSQLiteMock();
  writer = fakeConn();
  reader = fakeConn();
  let openCount = 0;
  // First open -> writer; second open (reader, useNewConnection) -> reader.
  __setDatabaseFactory(async () => (openCount++ === 0 ? writer : reader));
});
afterEach(async () => { await resetDatabaseConnectionForTests(); });

it('commits via BEGIN IMMEDIATE/COMMIT on the writer and returns the task value', async () => {
  const result = await withTransaction(async (db) => {
    expect(db).toBe(writer);
    return 'ok';
  });
  expect(result).toBe('ok');
  expect(writer.calls).toEqual(expect.arrayContaining(['BEGIN IMMEDIATE', 'COMMIT']));
  expect(writer.calls).not.toContain('ROLLBACK');
});

it('rolls back when the task throws', async () => {
  await expect(withTransaction(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  expect(writer.calls).toContain('BEGIN IMMEDIATE');
  expect(writer.calls).toContain('ROLLBACK');
  expect(writer.calls).not.toContain('COMMIT');
});

// Non-re-entrancy is a CONTRACT (no runtime guard). We do NOT add a nested-call test (it would
// deadlock by design and hang). Instead we prove the threading discipline with a positive test:
// a multi-write task commits in exactly ONE transaction.
it('a task doing multiple writes on the threaded handle commits in ONE transaction', async () => {
  await withTransaction(async (db) => {
    await db.runAsync('insert into t (id) values (1)');
    await db.runAsync('insert into t (id) values (2)');
  });
  expect(writer.calls.filter((c) => c === 'BEGIN IMMEDIATE')).toHaveLength(1);
  expect(writer.calls.filter((c) => c === 'COMMIT')).toHaveLength(1);
});

it('serializes concurrent transactions (no interleave)', async () => {
  const order = [];
  const a = withTransaction(async () => { order.push('a-start'); await Promise.resolve(); order.push('a-end'); });
  const b = withTransaction(async () => { order.push('b-start'); order.push('b-end'); });
  await Promise.all([a, b]);
  expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
});

it('getDatabase returns the reader (second connection), getWriter returns the writer', async () => {
  const r = await getDatabase();
  const w = await getWriter();
  expect(w).toBe(writer);
  expect(r).toBe(reader);
});

// Preserves the pragma-application coverage that the old "configures lock-related pragmas" test
// had, in the new two-connection model.
it('applies writer pragmas (WAL, busy_timeout, FK on) to the writer and query_only to the reader', async () => {
  await getDatabase(); // triggers init (opens + configures both)
  expect(writer.calls).toEqual(expect.arrayContaining([
    'PRAGMA journal_mode = WAL',
    'PRAGMA busy_timeout = 5000',
    'PRAGMA foreign_keys = ON',
  ]));
  expect(reader.calls).toEqual(expect.arrayContaining([
    'PRAGMA busy_timeout = 5000',
    'PRAGMA query_only = ON',
  ]));
});

it('a ROLLBACK failure rethrows the original error (not the rollback error) and disposes the writer', async () => {
  // Writer whose ROLLBACK throws — simulates SQLite having already auto-rolled-back.
  writer.execAsync = jest.fn(async (sql) => {
    writer.calls.push(sql);
    if (sql === 'ROLLBACK') throw new Error('rollback boom');
  });
  let caught;
  try {
    await withTransaction(async () => { throw new Error('task boom'); });
  } catch (e) {
    caught = e;
  }
  expect(caught?.message).toBe('task boom');        // original error, NOT 'rollback boom'
  expect(writer.calls).toContain('BEGIN IMMEDIATE');
  expect(writer.calls).toContain('ROLLBACK');
  expect(writer.closeAsync).toHaveBeenCalled();      // disposed so the next access re-bootstraps
});

it('disposes a half-open bootstrap when the reader open fails, allowing a clean retry', async () => {
  // First open -> writer; second open (the reader) -> throws.
  let openCount = 0;
  __setDatabaseFactory(async () => {
    if (openCount++ === 0) return writer;
    throw new Error('reader open failed');
  });
  let caught;
  try {
    await getWriter();
  } catch (e) {
    caught = e;
  }
  expect(caught?.message).toMatch(/reader open failed/);
  expect(writer.closeAsync).toHaveBeenCalled();      // half-open writer closed (no leak)

  // initPromise was reset → a clean retry succeeds against a fresh factory.
  const writer2 = fakeConn();
  const reader2 = fakeConn();
  let open2 = 0;
  __setDatabaseFactory(async () => (open2++ === 0 ? writer2 : reader2));
  const w = await getWriter();
  expect(w).toBe(writer2);
});
