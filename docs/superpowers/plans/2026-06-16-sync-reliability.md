# Sync Reliability Slice (Items 1 + 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the SQLite connection storm and pragma leak at the root (dedicated writer connection + read-only reader + CAS-preserving bulk finalize), and make the outbox sync converge (bounded backoff, manual-sync bypass, per-record/per-batch error guard), without touching dependency-skip (descoped).

**Architecture:** Replace `expo-sqlite`'s per-transaction `withExclusiveTransactionAsync` (which opens a throwaway connection per call) with two persistent connections: a **writer** (FK on post-migration, `busy_timeout`, used by every `withTransaction` via `BEGIN IMMEDIATE`, serialized by the existing `databaseQueue`) and a **reader** (`query_only=ON`, `busy_timeout`, all unqueued reads). All writes funnel through the writer; the reader's `query_only` makes any stray write throw. Bulk-finalize all outcomes one transaction per ≤200-row chunk, preserving the existing `(id, updated_at, status='in_flight')` CAS.

**Tech Stack:** React Native / Expo, `expo-sqlite` (WAL), Jest + `better-sqlite3` file-backed integration tier, Supabase (`@supabase/supabase-js`).

**Spec:** [`docs/superpowers/specs/2026-06-16-sync-reliability-design.md`](../specs/2026-06-16-sync-reliability-design.md)

---

## Pre-flight

- [ ] **Confirm branch.** Run: `git branch --show-current` → expect `fix/sync-reliability-writer-batch`. If not, `git checkout fix/sync-reliability-writer-batch`.
- [ ] **Confirm Node 20 for native better-sqlite3** (per AGENTS.md memory): prefix Jest/integration commands with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH` if the shell default is v22. All `npm test` / `npm run test:integration` commands below assume this.
- [ ] **Baseline green.** Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration` and `... npm test`. Expected: all pass (establishes the pre-change baseline).

---

## File Structure

**Modified:**
- `src/db/client.js` — reader/writer connections, pragmas, `withTransaction` rewrite, re-entrancy guard, `getWriter`, lifecycle. *Deep module — public interface unchanged (`getDatabase`, `withTransaction`, `withDatabaseAccess`, `resetDatabaseConnectionForTests`) plus new `getWriter`.*
- `src/db/migrations.js` — `runInTransaction` uses manual `BEGIN/COMMIT` (no `withExclusiveTransactionAsync`); migrations run FK-off.
- `src/db/repositories/repositoryRuntime.js` — `resolveDatabase` no longer runs migrations on the production reader; `runRepositoryTransaction` routes through the writer.
- `src/db/repositories/sqliteRepositoryUtils.js` — add `chunkArray`, `sqlPlaceholders`.
- `src/db/repositories/localStateRepository.js` — `set`/`remove`/`clear` route through `withTransaction`.
- `src/utils/storage.js` — all write methods route through `withTransaction`; `clearDomainData` becomes one transaction.
- `src/services/offlineSync.js` — `finalizeMany*`, batch failure semantics, backoff cap, `force` bypass, per-record error guard, `INTENTIONALLY_UNSYNCED`/`LOCAL_ONLY_COLUMNS`, extend `BATCHABLE_UPSERT_TABLES`, `retryFailedItem` resets `retry_count`.
- `src/db/repositories/syncOutboxRepository.js` — `getReadyRecords` accepts `includeBackedOff`.
- `src/context/OfflineContext.js` — `syncNow({ force })` threads the bypass.
- `src/screens/main/SyncStatusScreen.js` — "Sync Now" passes `{ force: true }`.
- `documentation/rls-sync-contract-map.md` — batched-upsert operation shape.

**Created (tests):**
- `__tests__/clientWriterConnection.test.js`
- `__tests__/clientReadOnlyReader.test.js`
- `__tests__/migrationsForeignKeysOff.test.js`
- `__tests__/foreignKeyEnforcement.test.js`
- `__tests__/bulkFinalize.test.js`
- `__tests__/batchFailureSemantics.test.js`
- `__tests__/retryBackoff.test.js`
- `__tests__/syncErrorGuard.test.js`
- `__tests__/syncContractCompleteness.test.js`

---

## Phase 1 — Foundation: helpers, writer connection, migrations, write-path audit

### Task 1: `chunkArray` + `sqlPlaceholders` helpers

**Files:**
- Modify: `src/db/repositories/sqliteRepositoryUtils.js`
- Test: `__tests__/sqliteRepositoryUtils.helpers.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `__tests__/sqliteRepositoryUtils.helpers.test.js`:
```javascript
import { chunkArray, sqlPlaceholders } from '../src/db/repositories/sqliteRepositoryUtils';

describe('chunkArray', () => {
  it('splits into chunks of the given size', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('returns [] for an empty array', () => {
    expect(chunkArray([], 200)).toEqual([]);
  });
  it('defaults to a 200 chunk size', () => {
    const arr = Array.from({ length: 201 }, (_, i) => i);
    const chunks = chunkArray(arr);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(200);
    expect(chunks[1]).toHaveLength(1);
  });
});

describe('sqlPlaceholders', () => {
  it('produces N comma-separated ? marks', () => {
    expect(sqlPlaceholders(3)).toBe('?, ?, ?');
  });
  it('returns an empty string for 0', () => {
    expect(sqlPlaceholders(0)).toBe('');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest sqliteRepositoryUtils.helpers --testPathIgnorePatterns=/node_modules/ /.claude/`
Expected: FAIL — `chunkArray is not a function`.

- [ ] **Step 3: Implement**

In `src/db/repositories/sqliteRepositoryUtils.js`, after the `timestamp` export (line 3), add:
```javascript
export const chunkArray = (items, size = 200) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export const sqlPlaceholders = (count) => Array.from({ length: count }, () => '?').join(', ');
```

- [ ] **Step 4: Run it, verify pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest sqliteRepositoryUtils.helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/sqliteRepositoryUtils.js __tests__/sqliteRepositoryUtils.helpers.test.js
git commit -m "feat(db): add chunkArray + sqlPlaceholders helpers"
```

---

### Task 2: Migrations run with FK off via manual BEGIN/COMMIT

> Do this **before** the writer rewrite (Task 3) so the writer can call the new migration runner.

**Files:**
- Modify: `src/db/migrations.js:576-582` (the `runInTransaction` helper)
- Test: `__tests__/migrationsForeignKeysOff.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `__tests__/migrationsForeignKeysOff.test.js`:
```javascript
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';

it('runs migrations without withExclusiveTransactionAsync and leaves a usable schema', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  // Force the manual-BEGIN path: remove the exclusive-transaction API the old code used.
  delete db.withExclusiveTransactionAsync;

  await runMigrations(db);

  // Schema exists and is queryable (proves migrations committed via manual BEGIN/COMMIT).
  const row = await db.getFirstAsync('PRAGMA user_version');
  expect(row.user_version).toBeGreaterThan(0);
  const tables = await db.getAllAsync(
    "select name from sqlite_master where type='table' and name='sync_outbox'"
  );
  expect(tables).toHaveLength(1);
});

it('leaves foreign_keys ON after migrations so injected DBs enforce FK like production', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);
  const fk = await db.getFirstAsync('PRAGMA foreign_keys');
  expect(fk.foreign_keys).toBe(1);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest migrationsForeignKeysOff`
Expected: FAIL — current `runInTransaction` calls `db.withTransactionAsync` which the adapter does not implement (`withTransactionAsync is not a function`), or the migration does not complete.

- [ ] **Step 3: Implement**

In `src/db/migrations.js`, replace `runInTransaction` (lines 576-582):
```javascript
const runInTransaction = async (db, task) => {
  // Manual transaction control on the supplied connection — no withExclusiveTransactionAsync
  // (which opens a throwaway connection without our pragmas). Migrations run with
  // foreign_keys OFF (set by the caller, between transactions, since PRAGMA foreign_keys
  // is a no-op inside a transaction).
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    const result = await task(db);
    await db.execAsync('COMMIT');
    return result;
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
};
```

Also, in `runMigrationsNow` (line 584), set FK **off for the migration duration and back ON afterward** via `try/finally`. This makes `runMigrationsNow` the single owner of the FK posture, so **every** caller — the production writer *and* injected test DBs (via `resolveDatabase(database)` → `runMigrations(database)`) — ends with FK enforcement ON. Without the `finally`, injected integration DBs would run FK-*off*, hiding the exact ordering bugs this slice exists to expose (Codex plan review, finding 2). Replace the body opening (lines 584-588), removing the `configureDatabaseConnection(db)` call:
```javascript
async function runMigrationsNow(database) {
  const db = database || await getDatabase();
  await db.execAsync('PRAGMA foreign_keys = OFF'); // a no-op inside a txn; set between txns
  try {
    let userVersion = await getUserVersion(db);
    // ... unchanged migration loop ...
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON'); // runtime posture for ALL callers
  }
}
```
Remove the now-unused `configureDatabaseConnection` import from `migrations.js` if no longer referenced. (Since `runMigrations` now leaves FK ON, the explicit `PRAGMA foreign_keys = ON` in `client.js` writer-init is redundant but harmless — keep it as a defensive assertion of the writer's posture.)

- [ ] **Step 4: Run it, verify pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest migrationsForeignKeysOff`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations.js __tests__/migrationsForeignKeysOff.test.js
git commit -m "refactor(db): migrations use manual BEGIN/COMMIT with FK off (no exclusive-txn connection)"
```

---

### Task 3: Dedicated writer + read-only reader in `client.js`

**Files:**
- Modify: `src/db/client.js` (whole file)
- Modify: `src/db/repositories/repositoryRuntime.js`
- Test: `__tests__/clientWriterConnection.test.js` (create)

- [ ] **Step 1: Write the failing test** (transaction semantics + re-entrancy)

Create `__tests__/clientWriterConnection.test.js`:
```javascript
const fakeConn = () => {
  const calls = [];
  return {
    calls,
    execAsync: jest.fn(async (sql) => { calls.push(sql); }),
    runAsync: jest.fn(async () => ({ changes: 0 })),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
    closeAsync: jest.fn(async () => {}),
  };
};

const writer = fakeConn();
const reader = fakeConn();
let openCount = 0;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => (openCount++ === 0 ? writer : reader)),
}));
jest.mock('../src/db/migrations', () => ({ runMigrations: jest.fn(async () => {}) }));

import {
  withTransaction,
  getWriter,
  getDatabase,
  resetDatabaseConnectionForTests,
} from '../src/db/client';

beforeEach(() => {
  openCount = 0;
  writer.calls.length = 0;
  reader.calls.length = 0;
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

// Non-re-entrancy is a CONTRACT (no runtime guard — see client.js comment). We do NOT add a
// nested-call test: nesting deadlocks by design and such a test would hang. Instead we prove
// the PRIMARY defense — the threading discipline — with a positive test: a multi-write task
// commits in exactly ONE transaction (so domain saves thread the handle, never nest).
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
```

- [ ] **Step 2: Run it, verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest clientWriterConnection`
Expected: FAIL — `getWriter` is not exported / re-entrancy not guarded / writer/reader not split.

- [ ] **Step 3: Implement — rewrite `src/db/client.js`**

```javascript
import { openDatabaseAsync } from 'expo-sqlite';
import { runMigrations } from './migrations';

export const DATABASE_NAME = 'masi.db';

// journal_mode is database-level (set once). foreign_keys + busy_timeout + query_only
// are PER-CONNECTION, which is why a persistent writer/reader fixes the historical leak.
const WRITER_PRE_MIGRATION_PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA busy_timeout = 5000',
  'PRAGMA foreign_keys = OFF', // migrations need FK off; flipped ON after they run
];
const READER_PRAGMAS = [
  'PRAGMA busy_timeout = 5000',
  'PRAGMA query_only = ON', // any stray write on the reader throws — see write-path audit
];

let initPromise = null;
let writerConnection = null;
let readerConnection = null;
let databaseQueue = Promise.resolve();

const applyPragmas = async (db, pragmas) => {
  for (const pragma of pragmas) {
    await db.execAsync(pragma);
  }
};

// Single bootstrap: open the writer, migrate it (FK off), flip FK on, then open the
// read-only reader. Both getDatabase()/getWriter() await this, so no query ever sees a
// pre-migration schema. Migrations run directly on the writer (NOT via the queued
// runMigrations no-arg path) to avoid re-entering this initializer.
const initialize = async () => {
  if (!initPromise) {
    initPromise = (async () => {
      const writer = await openDatabaseAsync(DATABASE_NAME);
      await applyPragmas(writer, WRITER_PRE_MIGRATION_PRAGMAS);
      await runMigrations(writer);
      await writer.execAsync('PRAGMA foreign_keys = ON');
      writerConnection = writer;

      const reader = await openDatabaseAsync(DATABASE_NAME, { useNewConnection: true });
      await applyPragmas(reader, READER_PRAGMAS);
      readerConnection = reader;

      return { writerConnection, readerConnection };
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
};

export async function initializeDatabase() {
  await initialize();
  return writerConnection;
}

// Reads use the read-only reader connection.
export async function getDatabase() {
  await initialize();
  return readerConnection;
}

// Writes use the writer connection.
export async function getWriter() {
  await initialize();
  return writerConnection;
}

// Serialize all writer access on the queue (the writer's mutex).
export async function withDatabaseAccess(task) {
  const runTask = async () => {
    const writer = await getWriter();
    return task(writer);
  };
  const queuedTask = databaseQueue.then(runTask, runTask);
  databaseQueue = queuedTask.catch(() => {});
  return queuedTask;
}

// Non-re-entrant BY CONTRACT: callers thread the txn handle down (the codebase already does
// this for domain saves) and must NOT call withTransaction inside a transaction. Nesting
// would deadlock on the serial queue — a loud, NON-corrupting dev-time failure that the
// positive one-transaction test (below) guards against.
//
// We deliberately add NO runtime nesting guard:
//   - A synchronous depth check would either sit behind the queue (too late to prevent the
//     deadlock) or, if moved before the enqueue, FALSE-REJECT legitimate concurrent writers
//     (the queue exists to serialize them, not reject them). Distinguishing nested from
//     concurrent needs async-context tracking that Hermes lacks.
//   - A watchdog timeout is WORSE than the hang it would replace: a promise cannot be
//     cancelled, so rolling back on timeout releases the queue and lets the abandoned
//     nested work COMMIT after the caller already saw a failure (partial-commit corruption).
export async function withTransaction(task) {
  return withDatabaseAccess(async (db) => {
    await db.execAsync('BEGIN IMMEDIATE');
    try {
      const result = await task(db);
      await db.execAsync('COMMIT');
      return result;
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  });
}

export async function resetDatabaseConnectionForTests() {
  for (const conn of [writerConnection, readerConnection]) {
    if (conn && typeof conn.closeAsync === 'function') {
      try { await conn.closeAsync(); } catch (_) { /* ignore */ }
    }
  }
  initPromise = null;
  writerConnection = null;
  readerConnection = null;
  databaseQueue = Promise.resolve();
}
```

> Note: `configureDatabaseConnection` is no longer exported from `client.js`. Grep for other importers — `grep -rn "configureDatabaseConnection" src` — and remove/adjust them (migrations.js handled in Task 2).

- [ ] **Step 4: Update `repositoryRuntime.js`** so production reads don't re-run migrations on the read-only reader, and transactions use the writer

Replace `src/db/repositories/repositoryRuntime.js`:
```javascript
import { getDatabase, withTransaction } from '../client';
import { runMigrations } from '../migrations';
import { runWithTransaction } from './sqliteRepositoryUtils';

export const resolveDatabase = async (database) => {
  if (database) {
    // Test / injected-db path: migrate the supplied connection.
    await runMigrations(database);
    return database;
  }
  // Production: client.initialize() already ran migrations on the writer during bootstrap;
  // getDatabase() returns the read-only reader. Do NOT run migrations here (the reader is
  // query_only and would throw).
  return getDatabase();
};

export const runRepositoryTransaction = async (database, task) => {
  if (database) {
    const db = await resolveDatabase(database);
    return runWithTransaction(db, task);
  }
  // Production writes go through the persistent writer.
  return withTransaction(async (txn) => task(txn));
};
```

- [ ] **Step 5: Run it, verify pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest clientWriterConnection`
Expected: PASS.

- [ ] **Step 6: DO NOT COMMIT YET**

The clientWriterConnection unit test passes now, but committing here would leave the `query_only` reader live while `localStateRepository`/`storage` still write on the reader handle — a broken intermediate state (the spec requires the split and the write-path audit to land **together**). Proceed directly to Task 4; **Tasks 3 and 4 are one atomic commit** made at the end of Task 4.

---

### Task 4: Write-path audit — route every write through the writer (SAME ATOMIC COMMIT AS TASK 3)

> **Atomicity:** This task shares one commit with Task 3 — the connection split is unsafe without it. Do not run a partial commit.
> The `query_only=ON` reader makes any missed write throw. This task: (a) refactor the known offenders, (b) run the **full** suite to flush out the rest, (c) fix each until green. Treat a green suite + the guard test as proof of exhaustiveness.

**Files:**
- Modify: `src/db/repositories/localStateRepository.js`
- Modify: `src/utils/storage.js` (`ensureSchoolExists`, `ensureClassExists`, `clearDomainData`, `markAsSynced`, `markAsUnsynced`, `setSyncError`, and any other method writing on a resolved handle)
- Test: `__tests__/clientReadOnlyReader.test.js` (create)

- [ ] **Step 1: Write the failing guard test**

Create `__tests__/clientReadOnlyReader.test.js`:
```javascript
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import BetterSqlite3 from 'better-sqlite3';

// PRAGMA query_only semantics: better-sqlite3 honors it on its single connection,
// so we can prove the MECHANISM (a write on a query_only handle throws) here. The
// two-connection isolation is device-verified (spec AC #10).
it('a write on a query_only connection throws (proves reader enforcement)', () => {
  const db = new BetterSqlite3(':memory:');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
  db.exec('PRAGMA query_only = ON');
  expect(() => db.prepare('INSERT INTO t (id) VALUES (1)').run()).toThrow(/readonly|query_only|attempt to write/i);
});
```

- [ ] **Step 2: Run it, verify it fails or passes**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest clientReadOnlyReader`
Expected: PASS immediately (this asserts SQLite's documented behavior — it is the *premise* the audit relies on). If it FAILS, the SQLite build does not honor `query_only`; stop and escalate (the whole reader-enforcement approach depends on it).

- [ ] **Step 3: Refactor `localStateRepository.js`** to write through the writer

Replace `set`, `remove`, `clear` in `src/db/repositories/localStateRepository.js`:
```javascript
import { resolveDatabase } from './repositoryRuntime';
import { runRepositoryTransaction } from './repositoryRuntime';
import { decodeJson, encodeJson, timestamp } from './sqliteRepositoryUtils';

export const createLocalStateRepository = ({ database } = {}) => {
  const get = async (key, fallback = null) => {
    const db = await resolveDatabase(database); // read — stays on the reader
    const row = await db.getFirstAsync('select value from local_state where key = ?', key);
    return row ? decodeJson(row.value, fallback) : fallback;
  };

  const set = async (key, value) => {
    const now = timestamp();
    await runRepositoryTransaction(database, async (txn) => {
      await txn.runAsync(
        `insert into local_state (key, value, updated_at)
         values (?, ?, ?)
         on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`,
        key, encodeJson(value), now
      );
    });
    return true;
  };

  const remove = async (key) => {
    await runRepositoryTransaction(database, async (txn) => {
      await txn.runAsync('delete from local_state where key = ?', key);
    });
    return true;
  };

  const clear = async () => {
    await runRepositoryTransaction(database, async (txn) => {
      await txn.runAsync('delete from local_state');
    });
    return true;
  };

  return { get, set, remove, clear };
};

export const localStateRepository = createLocalStateRepository();
```

- [ ] **Step 4: Refactor `storage.js` write methods** to use `runRepositoryTransaction`/`withTransaction`

Pattern for each write method (apply to `ensureSchoolExists`, `ensureClassExists`, `markAsSynced`, `markAsUnsynced`, `setSyncError`, and any `save*`/`update*`/`delete*`/`archive*` that calls `upsertRecord(db, …)` or `db.runAsync(…)` directly on a `resolveDatabase()` handle): wrap the write in `runRepositoryTransaction(undefined, async (txn) => { … upsertRecord(txn, …) / txn.runAsync(…) … })`.

`clearDomainData` (lines 527-547) becomes one transaction:
```javascript
async clearDomainData() {
  await runRepositoryTransaction(undefined, async (txn) => {
    await txn.execAsync('PRAGMA defer_foreign_keys = ON'); // allow any order within this txn
    for (const table of [
      'assessment_items', 'assessments', 'session_attendees', 'sessions', 'letter_mastery',
      'child_group_memberships', 'group_ea_assignments', 'groups', 'child_class_memberships',
      'class_grouping_state', 'grouping_versions', 'class_ea_assignments',
      'child_programme_enrollments', 'child_ea_assignments', 'children', 'classes',
      'time_entries', 'sync_outbox',
    ]) {
      await txn.runAsync(`delete from ${table}`);
    }
  });
}
```
> Add `import { runRepositoryTransaction } from '../db/repositories/repositoryRuntime';` to `storage.js` if not present.

- [ ] **Step 5a: Scan for the resolve-then-pass antipattern**

Some writes resolve a db and pass it *as the injected arg*: `const db = await resolveDatabase(database); … runRepositoryTransaction(db, …)`. After the split, that routes writes to the **reader** (a missed case the `query_only` suite may not hit if the path isn't exercised by tests — e.g. `retryFailedItem`, fixed in Task 8). Grep and fix each to pass the `database` closure directly:
Run: `grep -rn "resolveDatabase(database)" src && grep -rn "runRepositoryTransaction(db\b\|runWithTransaction(db\b" src`
For each hit, confirm the db passed onward is the *closure* `database` (undefined→writer in prod), not a resolved reader handle.

- [ ] **Step 5b: Flush out remaining offenders — run the full integration + unit suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration` then `... npm test`
Expected: any remaining write-on-reader path now throws a `query_only`/readonly error in tests. For each failure, locate the offending `resolveDatabase()`/`getDatabase()` + write, wrap it in `runRepositoryTransaction`, re-run. Iterate until green. Keep a running list of every file/method changed in the commit body.

- [ ] **Step 6: Commit (the single atomic commit for Tasks 3 + 4)**

Only now, with the full suite green, commit the connection split and the write-path audit together:
```bash
git add src/db/client.js src/db/repositories/repositoryRuntime.js __tests__/clientWriterConnection.test.js \
        src/db/repositories/localStateRepository.js src/utils/storage.js __tests__/clientReadOnlyReader.test.js \
        <any other files touched while flushing out write-on-reader paths>
git commit -m "feat(db): dedicated writer + read-only reader; all writes via writer

Connection split (writer: FK-on post-migration + busy_timeout; reader:
query_only + busy_timeout) lands ATOMICALLY with the write-path audit, since
the query_only reader is unsafe until every write moves to the writer. Audited
sites moved off the reader handle: localStateRepository set/remove/clear,
storage ensureSchoolExists/ensureClassExists/markAsSynced/markAsUnsynced/
setSyncError, clearDomainData (now one transaction). withTransaction is
non-re-entrant by contract with a watchdog timeout (no synchronous depth guard)."
```

---

### Task 5: FK migration-order audit (positive + negative tests)

**Files:**
- Test: `__tests__/foreignKeyEnforcement.test.js` (create)
- Modify (only if the audit finds a mis-ordered write): the offending repository/persistence file.

- [ ] **Step 1: Write the tests**

Create `__tests__/foreignKeyEnforcement.test.js`:
```javascript
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';

const migrated = async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db); // runMigrations now leaves foreign_keys ON (Task 2) — no manual flip needed
  return db;
};

it('NEGATIVE: inserting a child row before its parent fails with an FK error', async () => {
  const db = await migrated();
  await expect(
    db.runAsync(
      `insert into session_attendees (id, session_id, child_id, created_at, updated_at)
       values ('att1', 'no-such-session', 'no-such-child', '2026-06-16', '2026-06-16')`
    )
  ).rejects.toThrow(/FOREIGN KEY/i);
});

it('POSITIVE: parent-before-child insert order commits', async () => {
  const db = await migrated();
  // Insert in dependency order (schools/classes/children/sessions before attendees).
  // Use the repositories' own save paths here in the real implementation; this asserts
  // the ordering the audit guarantees. (Fill in with the seed helper used by sibling
  // integration tests: seedCoreData from test-support/sqliteRepositoryTestUtils.)
  // Example minimal chain:
  await db.runAsync(`insert into schools (id, name, created_at, updated_at) values ('s1','S','2026-06-16','2026-06-16')`);
  await db.runAsync(`insert into classes (id, school_id, name, created_at, updated_at) values ('c1','s1','C','2026-06-16','2026-06-16')`);
  // ... (use seedCoreData for the full chain) ...
  const rows = await db.getAllAsync(`select id from classes where id = 'c1'`);
  expect(rows).toHaveLength(1);
});
```
> If `schools`/`classes` columns differ, mirror `test-support/sqliteRepositoryTestUtils.seedCoreData`’s exact inserts (read it first).

- [ ] **Step 2: Run it**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest foreignKeyEnforcement`
Expected: the NEGATIVE test PASSES (FK is enforced). If it FAILS (insert succeeds), FK enforcement is not actually on — revisit Task 3’s `PRAGMA foreign_keys = ON`.

- [ ] **Step 3: Audit the real write paths**

Read each multi-step domain write and confirm parent-before-child order:
- `src/services/literacySessionPersistence.js` — `sessions` → `session_attendees` → `letter_mastery`.
- `src/db/repositories/assessmentsRepository.js` — `assessments` → `assessment_items`.
- `src/db/repositories/childrenRepository.js` — `children` → memberships/assignments.
- `src/db/repositories/classesRepository.js` — `classes` → assignments.
For any path that writes a child before its parent inside one transaction, reorder the inserts. (Most are already parent-first; record findings in the commit body.) If a path legitimately needs out-of-order writes, use `PRAGMA defer_foreign_keys = ON` at the top of that transaction.

- [ ] **Step 4: Run full integration suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`
Expected: PASS (FK-on did not break any legitimate write path; if it did, fix ordering).

- [ ] **Step 5: Commit**

```bash
git add __tests__/foreignKeyEnforcement.test.js
git commit -m "test(db): FK enforcement positive/negative + migration-order audit"
```

---

## Phase 2 — Bulk finalize & batch failure semantics

### Task 6: CAS-preserving bulk finalize for all outcomes

**Files:**
- Modify: `src/services/offlineSync.js` (add `finalizeManySuccess`/`finalizeManyRetriableFailure`/`finalizeManyTerminalFailure`; rewrite `processBatch` finalize)
- Test: `__tests__/bulkFinalize.test.js` (create)

- [ ] **Step 1: Write the failing test** (one transaction per chunk + CAS preserved)

Create `__tests__/bulkFinalize.test.js`:
```javascript
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';

// Helper: a supabase mock whose upsert always succeeds.
const okSupabase = () => ({ from: () => ({ upsert: async () => ({ data: [{}], error: null }) }) });

it('finalizes a 250-row success batch in 2 transactions (chunk size 200), CAS preserved', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);
  const outbox = createSyncOutboxRepository({ database: db });

  // enqueue 250 letter_mastery inserts (helper enqueues via the outbox repo)
  // ... seed 250 outbox rows for one batchable table ...

  let beginCount = 0;
  const origExec = db.execAsync.bind(db);
  db.execAsync = async (sql) => { if (/BEGIN/i.test(sql)) beginCount += 1; return origExec(sql); };

  const engine = createOutboxSyncEngine({ database: db, supabaseClient: okSupabase() });
  await engine.syncAll();

  // 250 rows / 200 chunk = 2 finalize transactions (plus markInFlight transactions).
  // Assert finalize specifically did NOT open ~250 transactions.
  expect(beginCount).toBeLessThan(20);
  const remaining = await db.getAllAsync('select id from sync_outbox');
  expect(remaining).toHaveLength(0);
});
```
> Fill the seeding with the same enqueue helper sibling tests use (read `__tests__/offlineSyncOutbox.test.js` for the enqueue pattern). The assertion that matters: finalize is O(chunks), not O(N).

- [ ] **Step 2: Run it, verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest bulkFinalize`
Expected: FAIL — `beginCount` ~250 (per-record finalize today).

- [ ] **Step 3: Implement the chunked finalizers**

In `src/services/offlineSync.js`, add bulk finalizers next to the existing per-row ones (after line 537). Each opens ONE `runRepositoryTransaction` per chunk and runs the existing per-row CAS logic inside it:
```javascript
const finalizeManySuccess = async ({ database, records, tableName }) => {
  for (const chunk of chunkArray(records, 200)) {
    await runRepositoryTransaction(database, async (txn) => {
      for (const outboxRecord of chunk) {
        const deleteResult = await txn.runAsync(
          `delete from sync_outbox where id = ? and updated_at = ? and status = 'in_flight'`,
          outboxRecord.id, outboxRecord.updated_at
        );
        if ((deleteResult?.changes || 0) === 0) {
          await restorePendingAfterStaleFinalize(txn, outboxRecord, tableName);
          continue;
        }
        if (outboxRecord.operation !== 'hard_delete') {
          const hasRemaining = await txn.getFirstAsync(
            `select id from sync_outbox where table_name = ? and record_id = ? limit 1`,
            tableName, outboxRecord.record_id
          );
          await setDomainSyncResult(txn, tableName, outboxRecord.record_id, {
            syncStatus: hasRemaining ? 'pending' : 'synced',
            lastSyncError: null,
          });
        }
      }
    });
  }
};

const finalizeManyRetriableFailure = async ({ database, records, tableName, reason }) => {
  for (const chunk of chunkArray(records, 200)) {
    await runRepositoryTransaction(database, async (txn) => {
      for (const outboxRecord of chunk) {
        const failureResult = await txn.runAsync(
          `update sync_outbox set status = 'failed', retry_count = retry_count + 1,
             last_error = ?, next_retry_at = ?, updated_at = ?
           where id = ? and updated_at = ? and status = 'in_flight'`,
          reason, nextRetryTimestamp(outboxRecord.retry_count || 0), timestamp(),
          outboxRecord.id, outboxRecord.updated_at
        );
        if ((failureResult?.changes || 0) === 0) {
          await restorePendingAfterStaleFinalize(txn, outboxRecord, tableName);
          continue;
        }
        await setDomainSyncResult(txn, tableName, outboxRecord.record_id, {
          syncStatus: 'failed', lastSyncError: reason,
        });
      }
    });
  }
};

const finalizeManyTerminalFailure = async ({ database, records, tableName, reason }) => {
  for (const chunk of chunkArray(records, 200)) {
    await runRepositoryTransaction(database, async (txn) => {
      for (const outboxRecord of chunk) {
        const failureResult = await txn.runAsync(
          `update sync_outbox set status = 'terminal', last_error = ?, next_retry_at = null, updated_at = ?
           where id = ? and updated_at = ? and status = 'in_flight'`,
          reason, timestamp(), outboxRecord.id, outboxRecord.updated_at
        );
        if ((failureResult?.changes || 0) === 0) {
          await restorePendingAfterStaleFinalize(txn, outboxRecord, tableName);
          continue;
        }
        await setDomainSyncResult(txn, tableName, outboxRecord.record_id, {
          syncStatus: 'terminal', lastSyncError: reason,
        });
      }
    });
  }
};
```
Add `import { chunkArray } from '../db/repositories/sqliteRepositoryUtils';` (or extend the existing import line from that module).

Replace the success-finalize block in `processBatch` (lines 668-675):
```javascript
    await finalizeManySuccess({ database, records: inFlightRecords, tableName: config.tableName });
    return outboxRecords.map(() => ({ success: true }));
```

- [ ] **Step 4: Run it, verify pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest bulkFinalize offlineSyncOutbox`
Expected: PASS (and the existing outbox suite stays green — CAS unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineSync.js __tests__/bulkFinalize.test.js
git commit -m "perf(sync): CAS-preserving bulk finalize (one txn per 200-row chunk) for all outcomes"
```

---

### Task 7: Batch failure semantics (B4)

**Files:**
- Modify: `src/services/offlineSync.js` (`processBatch` try/catch fan-out)
- Test: `__tests__/batchFailureSemantics.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `__tests__/batchFailureSemantics.test.js`:
```javascript
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';

// supabase mock whose batch upsert THROWS (not returns an error) — simulates a network throw.
const throwingSupabase = () => ({ from: () => ({ upsert: async () => { throw new Error('network down'); } }) });

it('a thrown batch error finalizes EVERY member as failed with last_error (none left in_flight)', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);
  // ... seed 3 letter_mastery outbox rows (a batchable table) ...
  const engine = createOutboxSyncEngine({ database: db, supabaseClient: throwingSupabase() });
  const result = await engine.syncAll();

  const rows = await db.getAllAsync(`select status, last_error from sync_outbox`);
  expect(rows.every((r) => r.status === 'failed')).toBe(true);
  expect(rows.every((r) => r.last_error && r.last_error.length > 0)).toBe(true);
  expect(rows.some((r) => r.status === 'in_flight')).toBe(false);
  expect(result.totalFailed).toBe(3);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest batchFailureSemantics`
Expected: FAIL — rows stuck `in_flight` (current code lets the throw escape).

- [ ] **Step 3: Implement** — wrap `processBatch` server-call + finalize in try/catch

Replace `processBatch` body from the `enqueueRequest` call onward (lines 660-677):
```javascript
    let serverResult;
    try {
      serverResult = await enqueueRequest(() => runBatchServerOperation(supabaseClient, config, inFlightRecords));
    } catch (error) {
      const reason = errorMessage(error) || 'Batch upload threw';
      await finalizeManyRetriableFailure({ database, records: inFlightRecords, tableName: config.tableName, reason });
      return outboxRecords.map((record) => ({ success: false, terminal: false, failedRecord: makeFailedRecord(record, reason) }));
    }

    if (!serverResult.success) {
      return Promise.all(outboxRecords.map(processRecord));
    }

    await finalizeManySuccess({ database, records: inFlightRecords, tableName: config.tableName });
    return outboxRecords.map(() => ({ success: true }));
```

- [ ] **Step 4: Run it, verify pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest batchFailureSemantics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineSync.js __tests__/batchFailureSemantics.test.js
git commit -m "fix(sync): batch upload throw finalizes all in-flight members as retriable (no storm, none stranded)"
```

---

## Phase 3 — Convergence: backoff, manual bypass, per-record guard

### Task 8: Backoff cap + `retryFailedItem` resets `retry_count` + manual "Sync Now" bypass

**Files:**
- Modify: `src/services/offlineSync.js` (`getRetryDelay`, `retryFailedItem`, `syncAll` signature)
- Modify: `src/db/repositories/syncOutboxRepository.js` (`getReadyRecords` `includeBackedOff`)
- Modify: `src/context/OfflineContext.js` (`syncNow({ force })`)
- Modify: `src/screens/main/SyncStatusScreen.js` ("Sync Now" passes `{ force: true }`)
- Test: `__tests__/retryBackoff.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `__tests__/retryBackoff.test.js`:
```javascript
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { __testables } from '../src/services/offlineSync'; // see Step 3 export note

it('caps the retry delay at 15 minutes', () => {
  const { getRetryDelay } = __testables;
  expect(getRetryDelay(0)).toBe(5000);
  expect(getRetryDelay(2)).toBe(45000);
  expect(getRetryDelay(20)).toBe(15 * 60 * 1000); // capped, not ~ days
});
```
Plus an integration test (same file) asserting `getReadyRecords({ includeBackedOff: true })` returns a `failed` row whose `next_retry_at` is in the future, while the default call excludes it. (Use the outbox repo against a better-sqlite3 db; seed one failed row with a future `next_retry_at`.)

- [ ] **Step 2: Run it, verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest retryBackoff`
Expected: FAIL — `__testables` not exported / delay not capped / `includeBackedOff` ignored.

- [ ] **Step 3: Implement**

In `src/services/offlineSync.js`:
```javascript
const MAX_RETRY_DELAY = 15 * 60 * 1000;
const getRetryDelay = (retryCountBeforeFailure) => (
  Math.min(BASE_RETRY_DELAY * Math.pow(3, Math.max(0, retryCountBeforeFailure)), MAX_RETRY_DELAY)
);
```
Export a testables hook at the bottom of the module (near the other exports):
```javascript
export const __testables = { getRetryDelay };
```
Fix `retryFailedItem` (lines 800-822) — **two changes**: (a) add `retry_count = 0` to the UPDATE; (b) **fix the transaction routing**. Today it does `const db = await resolveDatabase(database); … runRepositoryTransaction(db, …)`. After the connection split, in production `database` is `undefined` so `resolveDatabase()` returns the **query-only reader**, and passing that resolved `db` makes `runRepositoryTransaction` treat it as an injected connection → the UPDATE runs on the read-only reader and **throws**, defeating retry (Codex plan pass 3, finding 2). The finalize functions already do this correctly — they pass the `database` *closure* (undefined→writer). Mirror them:
```javascript
  const retryFailedItem = async (table, id) => {
    const tableName = normalizeTableName(table);
    // Route through the engine's `database` closure (undefined in prod → writer), NOT a
    // resolved reader handle. Resolving first and passing it would hit the query_only reader.
    await runRepositoryTransaction(database, async (txn) => {
      await txn.runAsync(`
        update sync_outbox
        set status = 'pending', next_retry_at = null, last_error = null,
            retry_count = 0, updated_at = ?
        where lower(table_name) = ? and record_id = ? and status in ('failed', 'terminal')
      `, timestamp(), tableName, id);
      const config = getConfig(tableName);
      if (config) {
        await setDomainSyncResult(txn, config.tableName, id, { syncStatus: 'pending', lastSyncError: null });
      }
    });
  };
```
Add an integration test (in `retryBackoff.test.js`, injected-db path) asserting a `failed` row with `retry_count = 3` becomes `pending` with `retry_count = 0` after `retryFailedItem`. The production reader/writer routing (that retry runs on the writer, not the query_only reader) is verified by the device pass (Task 12) and Task 3's `withTransaction` writer test — Jest's single-connection adapter can't model the split.
Thread `force` through `syncAll` (line 680) → `getReadyRecords`:
```javascript
  const syncAll = async ({ tableName = null, force = false } = {}) => {
    // ...
    const readyRecords = sortByPushOrder(
      await outboxRepository.getReadyRecords({ limit: 1000, includeBackedOff: force })
    );
```
In `src/db/repositories/syncOutboxRepository.js`, `getReadyRecords` (line 69):
```javascript
  const getReadyRecords = async ({ limit = 50, now = timestamp(), includeBackedOff = false } = {}) => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select * from sync_outbox
      where status in ('pending', 'failed')
        ${includeBackedOff ? '' : 'and (next_retry_at is null or next_retry_at <= ?)'}
      order by created_at, table_name, record_id
      limit ?
    `, ...(includeBackedOff ? [limit] : [now, limit]));
    return rows.map(toOutboxRecord);
  };
```
In `src/context/OfflineContext.js`, `syncNow` (line 61) accepts `{ force }` and passes it:
```javascript
  const syncNow = useCallback((options = {}) => {
    // ... unchanged guards ...
        const result = await syncAll({ force: options.force === true });
    // ...
  }, [refreshSyncStatus]);
```
In `src/screens/main/SyncStatusScreen.js`, the "Sync Now" button (line 136) and post-retry sync (line 64) pass force:
```javascript
        onPress={() => syncNow({ force: true })}
```
```javascript
    await syncNow({ force: true });
```

- [ ] **Step 4: Run it, verify pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest retryBackoff offlineSyncOutbox`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineSync.js src/db/repositories/syncOutboxRepository.js src/context/OfflineContext.js src/screens/main/SyncStatusScreen.js __tests__/retryBackoff.test.js
git commit -m "fix(sync): cap retry backoff at 15m, reset retry_count on manual retry, force-bypass on Sync Now"
```

---

### Task 9: Per-record error guard in `syncAll`

**Files:**
- Modify: `src/services/offlineSync.js` (`syncAll` loop try/catch + `finally`)
- Test: `__tests__/syncErrorGuard.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `__tests__/syncErrorGuard.test.js`:
```javascript
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

// Engine with one record whose payload-shaping throws, followed by a healthy record.
it('a thrown error fails only that record; the healthy record still syncs; meta is written', async () => {
  // ... seed [throwing record, healthy record]; build engine with a supabase mock that
  //     succeeds for the healthy table and a config that throws for the bad one ...
  const result = await engine.syncAll();
  expect(result.totalSynced).toBe(1);              // healthy synced
  expect(result.totalFailed).toBe(1);              // throwing failed (not aborted)
  // bad record ends 'failed' with last_error; sync meta lastSyncTime updated
});
```
> Use the sibling-test enqueue helpers; the key behaviors to assert are: healthy record synced, throwing record `failed` with `last_error`, `result` reflects both, no exception escapes `syncAll`.

- [ ] **Step 2: Run it, verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncErrorGuard`
Expected: FAIL — the throw aborts the pass; healthy record not synced.

- [ ] **Step 3: Implement** — guard the loop body and ensure meta always writes

In `src/services/offlineSync.js` `syncAll`, wrap the per-record/per-batch body (the section around lines 747-773) in try/catch, and move the `updateSyncMeta` into a `finally`:
```javascript
    try {
      for (let index = 0; index < filteredRecords.length; index += 1) {
        const outboxRecord = filteredRecords[index];
        const config = getConfig(outboxRecord.table_name);
        try {
          // ... existing dependency-skip + batch/processRecord logic, unchanged ...
        } catch (error) {
          const reason = errorMessage(error) || 'Unhandled sync error';
          await finalizeRetriableFailure({ database, outboxRecord, tableName: config?.tableName || outboxRecord.table_name, reason });
          applyRecordResult(outboxRecord, config, { success: false, terminal: false, failedRecord: makeFailedRecord(outboxRecord, reason) });
        }
      }
    } finally {
      result.durationMs = Date.now() - startedAt;
      const now = new Date().toISOString();
      await stateRepository.updateSyncMeta({
        lastSyncTime: now,
        ...(result.success ? { lastSuccessfulSyncTime: now } : {}),
      });
    }
    return result;
```
> Note: the batch path’s own throws are already handled inside `processBatch` (Task 7); this guard is the outer net for `processRecord` and any escape.

- [ ] **Step 4: Run it, verify pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncErrorGuard offlineSyncOutbox`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineSync.js __tests__/syncErrorGuard.test.js
git commit -m "fix(sync): per-record error guard so one thrown error can't poison the pass"
```

---

## Phase 4 — Sync-contract completeness, then batched upserts

### Task 10: `INTENTIONALLY_UNSYNCED` + `LOCAL_ONLY_COLUMNS` + completeness test

> Lands **before** Task 11 so the allowlist is proven complete before more tables are batched.

**Files:**
- Modify: `src/services/offlineSync.js` (add the two maps, export for the test)
- Test: `__tests__/syncContractCompleteness.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `__tests__/syncContractCompleteness.test.js`. Read the **actual migrated schema** via `PRAGMA table_info` (not regex over source) so the guard catches `ALTER TABLE ADD COLUMN` additions too — which is exactly how `sessions.group_id`/`state` arrive (Codex plan pass 3, finding 1):
```javascript
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { __contract } from '../src/services/offlineSync'; // { SERVER_COLUMNS, PUSH_ORDER, INTENTIONALLY_UNSYNCED, LOCAL_ONLY_COLUMNS }

let db;
beforeAll(async () => { db = createBetterSqliteTestDatabase(':memory:'); await runMigrations(db); });

const schemaColumns = async (table) => {
  const info = await db.getAllAsync(`PRAGMA table_info(${table})`);
  return info.map((c) => c.name); // includes CREATE-TABLE and ALTER-ADDED columns
};

it('every PUSH_ORDER table column is synced, intentionally-unsynced, or local-only (exactly one)', async () => {
  const { SERVER_COLUMNS, PUSH_ORDER, INTENTIONALLY_UNSYNCED, LOCAL_ONLY_COLUMNS } = __contract;
  for (const table of PUSH_ORDER) {
    const cols = await schemaColumns(table);
    expect(cols.length).toBeGreaterThan(0); // table must exist in the migrated schema
    for (const col of cols) {
      const inServer = (SERVER_COLUMNS[table] || []).includes(col);
      const inIntentional = Boolean((INTENTIONALLY_UNSYNCED[table] || {})[col]);
      const inLocalOnly = LOCAL_ONLY_COLUMNS.includes(col);
      const count = [inServer, inIntentional, inLocalOnly].filter(Boolean).length;
      expect({ table, col, count }).toEqual({ table, col, count: 1 });
    }
  }
});

it('sessions.group_id and sessions.state are documented as intentionally unsynced', () => {
  const { INTENTIONALLY_UNSYNCED } = __contract;
  expect(INTENTIONALLY_UNSYNCED.sessions?.group_id).toBeTruthy();
  expect(INTENTIONALLY_UNSYNCED.sessions?.state).toBeTruthy();
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncContractCompleteness`
Expected: FAIL — `__contract` not exported; and once exported, columns like `sync_status`, `group_id`, `state` are in none of the three sets.

- [ ] **Step 3: Implement the maps + export**

In `src/services/offlineSync.js`, near `SERVER_COLUMNS` / `LOCAL_ONLY_KEYS_TO_STRIP`:
```javascript
// Real server columns deliberately withheld from push (reserved strictly for that — NOT
// a catch-all). sessions.group_id/state are server-RLS-guarded out until the state-machine
// slice (supabase/migrations/20260529214500_masi_sessions_forward_prep_columns.sql).
const INTENTIONALLY_UNSYNCED = {
  sessions: {
    group_id: 'Forward-prep; server RLS pins group_id NULL until the state-machine slice (migration 20260529214500).',
    state: 'Forward-prep; server RLS pins state=completed until the state-machine slice (migration 20260529214500).',
  },
};

// Local-only bookkeeping columns the engine strips before push — never sent to the server.
const LOCAL_ONLY_COLUMNS = ['synced', 'sync_status', 'last_sync_error', 'server_updated_at'];
```
Add the export:
```javascript
export const __contract = { SERVER_COLUMNS, PUSH_ORDER, INTENTIONALLY_UNSYNCED, LOCAL_ONLY_COLUMNS };
```

- [ ] **Step 4: Run it, iterate to green**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncContractCompleteness`
Expected: For each remaining column the test flags, decide its bucket: a real synced column missing from `SERVER_COLUMNS` is a **bug to fix** (add it); a deliberate server-side hold goes in `INTENTIONALLY_UNSYNCED` with a reason; a local bookkeeping column goes in `LOCAL_ONLY_COLUMNS`. Iterate until green. (Because the test reads `PRAGMA table_info` from the migrated DB, it sees every real column including ALTER-added ones — there is no parser to misread.)

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineSync.js __tests__/syncContractCompleteness.test.js
git commit -m "test(sync): contract-completeness guard (SERVER_COLUMNS ∪ INTENTIONALLY_UNSYNCED ∪ LOCAL_ONLY_COLUMNS)"
```

---

### Task 11: Extend `BATCHABLE_UPSERT_TABLES` + contract-map update

**Files:**
- Modify: `src/services/offlineSync.js:196`
- Modify: `documentation/rls-sync-contract-map.md`
- Test: extend `__tests__/offlineSyncOutbox.test.js` (batching assertion for a newly-batched table)

- [ ] **Step 1: Write the failing test**

In `__tests__/offlineSyncOutbox.test.js`, add a test that enqueues several `letter_mastery` rows and asserts the supabase mock received **one** batched `upsert` call (array payload) for the contiguous run, not one per row. (Mirror the existing `assessment_items` batching test in that file.)

- [ ] **Step 2: Run it, verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest offlineSyncOutbox -t letter_mastery`
Expected: FAIL — `letter_mastery` currently uploads per-row.

- [ ] **Step 3: Implement**

In `src/services/offlineSync.js:196`:
```javascript
const BATCHABLE_UPSERT_TABLES = new Set([
  'assessment_items',
  'letter_mastery',
  'session_attendees',
  'time_entries',
]);
```
> `sessions` intentionally omitted — low-volume; not worth the batching surface.

Update `documentation/rls-sync-contract-map.md`: for `letter_mastery`, `session_attendees`, `time_entries`, change the sync-operation column to note "batched upsert (onConflict=id) with per-record fallback on batch failure."

- [ ] **Step 4: Run it, verify pass + full suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest offlineSyncOutbox` then `... npm run test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineSync.js documentation/rls-sync-contract-map.md __tests__/offlineSyncOutbox.test.js
git commit -m "perf(sync): batch letter_mastery/session_attendees/time_entries upserts; update contract map"
```

---

## Phase 5 — Verification

### Task 12: Full suite + device/emulator stress pass (AC #10)

- [ ] **Step 1: Full release gate**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:release`
Expected: all Jest suites + file-backed SQLite integration suites + SQLite staging guard pass.

- [ ] **Step 2: Add the new integration suites to the integration config**

In `jest.integration.config.js`, add to `testMatch`: `clientWriterConnection`, `clientReadOnlyReader`, `migrationsForeignKeysOff`, `foreignKeyEnforcement`, `bulkFinalize`, `batchFailureSemantics`, `syncErrorGuard`, `syncContractCompleteness` (those that use file-backed SQLite). Re-run `... npm run test:integration`.

- [ ] **Step 3: Device/emulator stress pass** (manual — the two-connection isolation Jest can't cover)

On an Android emulator against `masi-app-sqlite` with a seeded EA:
1. Go offline; capture a large backlog (≥10 sessions × multi-child + several assessments) so the outbox holds hundreds of rows incl. many `letter_mastery`/`assessment_items`.
2. Reconnect; trigger sync. **Observe:** no `database is locked`; the "Finish Session" / a foreground write completes promptly *during* the sync flush (no multi-second starvation).
3. Force-stop mid-sync, reopen, reconnect. **Observe:** in-flight rows recover, sync drains.
4. Tap "Sync Now" with a backed-off failed row present. **Observe:** it uploads immediately (force bypass).
5. On the Sync Status screen, tap the per-row **Retry** on a failed row. **Observe:** it succeeds (no `readonly`/`query_only` error) — proves `retryFailedItem` runs on the writer, not the query-only reader, on the production (no injected db) path.
6. Verify Supabase rows via `npm run sqlite:staging:query -- "select count(*) from letter_mastery;"` (and spot-check `sessions`, `session_attendees`).

- [ ] **Step 4: Record the device pass** in `documentation/sqlite-refactor-log.md` (date, scenarios, observations) per AGENTS.md.

- [ ] **Step 5: Finalize**

Run: `git log --oneline fix/sync-reliability-writer-batch ^main` to review the slice, then use `superpowers:finishing-a-development-branch` to decide merge/PR.

---

## Self-Review (completed by plan author)

**Spec coverage** — every AC maps to a task: AC1/2 → T2,T3; AC3 → T6; AC4 → T11; AC5 → T8; AC6/12 → T7,T9; AC7 (descope) → no task (correct); AC8 → T5; AC9 (watchdog) → T3; AC10 → T12; AC11 → T10; AC13 → T3+T4 (one atomic commit). ✅
**Atomicity (Codex pass on plan)** — Tasks 3 and 4 share a single commit; the `query_only` reader never lands before the write-path audit (no broken intermediate). ✅
**Re-entrancy (Codex passes on plan)** — `withTransaction` is non-re-entrant by contract with **no runtime guard**: a depth guard deadlocks behind the queue or false-rejects concurrent writers under Hermes, and a watchdog risks partial-commit corruption (rollback can't cancel the abandoned task). Nesting deadlocks by design (non-corrupting); the threading defense is verified by a positive one-transaction test. ✅
**FK posture (Codex pass on plan)** — `runMigrationsNow` restores `foreign_keys=ON` in a `finally`, so injected integration DBs enforce FK like production (asserted by a test); not just the production writer. ✅
**Placeholders** — test-seeding is delegated to the existing sibling-test enqueue/`seedCoreData` helpers (named, not invented); the FK/contract parsers are real. No "TBD"/"add error handling". The two audit tasks (T4, T5) are checklist-driven but enforced by concrete tests (`query_only` throw, FK negative test). ✅
**Type/name consistency** — `finalizeManySuccess`/`finalizeManyRetriableFailure`/`finalizeManyTerminalFailure`, `getWriter`, `__contract`, `__testables`, `includeBackedOff`, `force` are used consistently across tasks; `transactionDepth` and the watchdog `timeoutMs` fully removed. ✅
