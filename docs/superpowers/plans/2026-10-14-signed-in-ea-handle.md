# Signed-In EA Handle Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repository the implementer for each task is **Codex through the plugin** (gpt-5.6-sol); Claude reviews every diff, reruns the tests, and commits.

**Goal:** Give every signed-in EA their own SQLite file, request queue, and data client behind one handle, so no EA's work can be uploaded under another EA's session (live defect 2) and every outbox row is owned by the EA who made the change (live defect 1, phone half).

**Architecture:** A new module, the signed-in EA handle (`src/session/signedInHandle.js`), owns `masi-<userId>.db` (writer, reader, write queue), an epoch, a per-handle request queue, and a Supabase data client whose `accessToken` callback and `fetch` both check the handle at send time. Production code reaches a domain database only through the handle: the repository runtime resolves the *current* handle, and background work (the sync engine, every pull, and their persistence) is built per handle and bound to it explicitly. The React tree under `AuthProvider` remounts by `userId:epoch`, the outbox owner is stamped from the transaction's connection, and an integrity scan quarantines any foreign-owned row.

**Tech Stack:** React Native / Expo SDK 54, expo-sqlite 16 (better-sqlite3 in tests via `test-support/`), supabase-js 2.100.1 / postgrest-js 2.100.1, Jest under Node 20.

**Spec:** [`docs/superpowers/specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md`](../specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md) §3, §4, §5, §6.1–§6.4, §9.1 tests T1–T11, T14–T16, T18–T20, T23. Plan 1 (`2026-10-10-upload-path-correctness.md`) shipped §6.5–§6.6. Plan 3 ships §7 (sign-out questions, incident envelope, file discovery reports).

## Global Constraints

- Run Jest under Node 20: prefix every Jest command with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Stay on npm; add no dependencies.
- No Supabase migration, no hosted apply, no write to `masi-app-sqlite` (`segygjzpujphwvrubusm`). Never touch the legacy backend `jcqrlwetutnpuchjoyyd`. Never run raw `supabase` CLI; never source `.env.local`.
- SQLite behaviour (triggers, file per EA, connection close, WAL companions) is tested against real SQLite: better-sqlite3 through `test-support/betterSqliteAdapter.js` for unit tests, `test-support/expoSQLiteRealEngine.js` (`npm run test:integration`) for multi-file and close/reopen behaviour.
- The domain file name is exactly `masi-<userId>.db`. The legacy file `masi.db` is never opened, renamed, or uploaded from by production code (spec §4.5).
- Provisional per-request timeout: `30_000` ms (spec §5.2; device check D4 sets the final value).
- Commit messages carry no agent co-author trailer. Never use bare `git stash`; use a WIP commit.
- Codex's sandbox cannot write the worktree's git admin directory: implementers leave changes uncommitted; the controller reviews and commits.
- Update `documentation/rls-sync-contract-map.md`, `CONTEXT.md`, `documentation/ROADMAP.md`, `documentation/build-log.md`, and `documentation/LEARNING.md` in this branch (anti-drift rule). Task 8 owns them; earlier tasks may add build-log rows only.

## Design rulings (refinements of the spec, decided while planning)

Each ruling names what it costs if wrong. Implementers follow them; reviewers check them.

1. **Binding of background work.** The spec (§4.2) reaches the database "through the current handle". About 150 repository calls in contexts, screens, and services take no database argument; the spec rejected threading an actor through them (approach B). The risk of a pure current-handle lookup is a stale continuation of EA A's work calling a repository *after* EA B's handle is published, writing A's data into B's file stamped with B's owner. The realistic sources are background flows that await the network and then persist: the sync engine, the roster/class/lookup/reference/history pulls. **Ruling:** those flows are constructed per handle (`handle.services`, Task 6) and pass the handle explicitly as `database` to repository factories, so after A's handle closes their writes are refused at admission with `StaleActorError`. User-initiated reads and writes from screens keep resolving the current handle. Residual risk, recorded in the contract map: a user-initiated continuation that awaits something outside the handle (location) for longer than a full sign-out plus another EA's sign-in. `TimeTrackingContext` and `literacySessionPersistence`, the two flows that await location, capture their handle and pass it explicitly. *Cost if wrong:* a stale user-initiated write lands in the next EA's file; a follow-up can ban repository singletons outside `src/db` with a static test.
2. **Missing token is not staleness.** §5.2 says `requireAccessToken` throws `StaleActorError` unless the handle is open and the session user matches. An open handle can legitimately lack a session (offline restore, refresh in progress). Marking that as stale would skip finalization and leave rows `in_flight` until the next open. **Ruling:** only a *closed* handle (or a handle that is no longer current) produces `StaleActorError`. An open handle with no session, or a session for a different user, refuses the request with `AuthUnavailableError`, which the queue surfaces as the existing codeless network error (`{ code: '', message: 'auth unavailable' }`), so the row is retriable and counted normally. T23 is unchanged. *Cost if wrong:* a refusal during a token gap counts as one retriable attempt.
3. **The owner comes from the connection.** `enqueueDomainOutbox(db, …)` receives the transaction connection. Each handle's writer is unique to one EA, so the handle registers `writer → userId` in a `WeakMap` at open (`registerConnectionActor`). Tests register an actor on their better-sqlite3 database with the same function. No actor → throw (§6.2). *Cost if wrong:* none known; the alternative (reading the file's owner marker per enqueue) adds a query per write.
4. **The file records its owner.** At first open the handle writes `local_state('file_owner_user_id', userId)`. A later open of `masi-<userId>.db` whose marker names someone else refuses to open with `FileOwnerMismatchError` (the signed-in tree shows the bootstrap error). *Cost if wrong:* a manually copied file cannot be opened; recovery is Export Database.
5. **Incidents wait for Plan 3.** §6.3's `foreign_owner_in_file` incident needs Plan 3's envelope. Plan 2 records the scan result in `local_state('integrity_scan_last')` as JSON counts by table, logs one `console.error`, and calls `captureOperationalError(…, { category: 'foreign_owner_in_file' })`. Plan 3 turns that into the incident. *Cost if wrong:* until Plan 3 lands, support learns of a foreign row through Sentry, not the incident table.
6. **The ADR is written directly.** The decision (one file per EA, deletion deferred with a privacy trigger) was made by Jim on 2026-10-08/09; Task 8 writes `docs/adr/0007-one-local-database-per-ea.md` from the spec rather than running an interview. *Cost if wrong:* none; the ADR records settled decisions.

## Review Focus

Inputs the spec implies but its test list does not pin. Each line names the task whose tests pin it.

1. **Cold start offline with a persisted session.** No network, a saved session for A: A's file opens, Home shows A's children, sync is skipped without errors, and no request is refused as stale. Pinned in Task 7 (T2) and Task 3 (ruling 2).
2. **The same EA signs out and back in (A → A).** A new epoch on the same file; rows left `in_flight` by the abort return to `pending` once and upload; the old handle's queued work is refused. Pinned in Task 6.
3. **Rapid alternation A → B → A within one minute.** Each EA's file opens; B never sees A's rows; A's left-behind work uploads exactly once when A returns. Pinned in Task 6 (integration).
4. **Opening fails** (migration throws, or the owner marker mismatches): no handle is published; the signed-in tree shows the bootstrap error with Retry and Export Logs, never an empty roster. Pinned in Task 2 and Task 7.
5. **A write transaction is executing when sign-out starts.** The close waits for it; the commit door rolls it back; nothing from it is visible after reopen. Pinned in Task 2 (T4).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/session/staleActor.js` (new) | `StaleActorError`, `AuthUnavailableError`, `FileOwnerMismatchError`, `NoSignedInEAError`, `isStaleActorError` |
| `src/session/handleRequestQueue.js` (new) | One serial queue per handle; tracks the running task; turns a stale-marked task into `StaleActorError` |
| `src/session/signedInHandle.js` (new) | Handle lifecycle (open, close, epoch), current-handle registry, file connections and write queue, transaction doors, connection→actor registry, latest auth session |
| `src/session/handleDataClient.js` (new) | Per-handle supabase-js data client: `accessToken` callback and fenced `fetch` with abort and timeout |
| `src/session/handleServices.js` (new) | Per-handle sync engine, pulls, reference-data barrier, history state; built once per handle |
| `src/context/SignedInEAContext.js` (new) | `SignedInEAProvider`, `useSignedInEA()` |
| `src/db/client.js` | Loses module-level connections; `getDatabase`/`withTransaction`/`getWriter`/`withDatabaseAccess` delegate to the current handle; exports `DATABASE_FILE_PREFIX`, `databaseNameForUser`, `LEGACY_DATABASE_NAME`, and `openConfiguredConnections` |
| `src/db/repositories/repositoryRuntime.js` | Accepts a handle as `database` |
| `src/db/migrations.js` | Migration 11 (owner trigger); `appMigrationQueue` removed (migrations always receive a connection) |
| `src/db/repositories/domainRepositoryUtils.js`, `syncOutboxRepository.js` | Owner stamped from the connection; null-owner wildcard removed; file-wide unsent counts; integrity scan |
| `src/db/repositories/outboxOwnership.js` | Deleted (Task 5) |
| `src/services/supabaseRequestQueue.js` | Deleted (Task 6) |
| `src/services/offlineSync.js`, `preloadedChildData.js`, `sessionHistoryPull.js`, `sessionHistoryStatus.js`, `observability.js` | Server calls take the handle's client and queue; module state moves into the handle |
| `src/context/AuthContext.js` | Opens/closes the handle; feeds every auth event's session to the handle registry; profile load and reference pull move into the signed-in tree |
| `src/context/OfflineContext.js`, `ChildrenContext.js`, `ClassesContext.js`, `LookupsContext.js`, `TimeTrackingContext.js` | Use `useSignedInEA()`; background pulls and sync through `handle.services` |
| `App.js`, `src/components/bootstrap/DatabaseBootstrapGate.js` | Remount by key; the gate checks the engine loads |
| `test-support/actorTestUtils.js` (new) | `bindTestActor(db, userId)`, `openTestHandle(userId)` |

---

### Task 1: Stale-actor errors and the per-handle request queue

**Files:**
- Create: `src/session/staleActor.js`, `src/session/handleRequestQueue.js`
- Test: `__tests__/handleRequestQueue.test.js`

**Interfaces:**
- Produces: `class StaleActorError extends Error` (`name = 'StaleActorError'`, `code = 'STALE_ACTOR'`); `class AuthUnavailableError extends Error` (`code = ''`); `class FileOwnerMismatchError extends Error` (`code = 'FILE_OWNER_MISMATCH'`); `class NoSignedInEAError extends Error` (`code = 'NO_SIGNED_IN_EA'`); `isStaleActorError(error) → boolean`.
- Produces: `createHandleRequestQueue({ isOpen }) → { enqueue(task) → Promise, currentTask() → { markStale(), stale } | null, abortAll() }`. `enqueue` serializes tasks (a failed task never blocks the next). `currentTask()` returns the running task's token, or `null` outside a task.

- [ ] **Step 1: Write the failing tests**

```js
// __tests__/handleRequestQueue.test.js
import { createHandleRequestQueue } from '../src/session/handleRequestQueue';
import { StaleActorError, isStaleActorError } from '../src/session/staleActor';

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('handle request queue', () => {
  test('runs tasks one at a time in order', async () => {
    const queue = createHandleRequestQueue({ isOpen: () => true });
    const events = [];
    const first = deferred();
    const a = queue.enqueue(async () => { events.push('a:start'); await first.promise; events.push('a:end'); return 'a'; });
    const b = queue.enqueue(async () => { events.push('b:start'); return 'b'; });
    await Promise.resolve();
    expect(events).toEqual(['a:start']);
    first.resolve();
    await expect(a).resolves.toBe('a');
    await expect(b).resolves.toBe('b');
    expect(events).toEqual(['a:start', 'a:end', 'b:start']);
  });

  test('a rejected task does not block the next one', async () => {
    const queue = createHandleRequestQueue({ isOpen: () => true });
    const failed = queue.enqueue(async () => { throw new Error('boom'); });
    const next = queue.enqueue(async () => 'ok');
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });

  test('currentTask is null outside a task and set inside one', async () => {
    const queue = createHandleRequestQueue({ isOpen: () => true });
    expect(queue.currentTask()).toBeNull();
    let seen = null;
    await queue.enqueue(async () => { seen = queue.currentTask(); });
    expect(seen).not.toBeNull();
    expect(queue.currentTask()).toBeNull();
  });

  test('a stale-marked task rejects with StaleActorError whatever it returned', async () => {
    const queue = createHandleRequestQueue({ isOpen: () => true });
    const result = queue.enqueue(async () => {
      queue.currentTask().markStale();
      return { data: null, error: { code: '', message: 'TypeError: Network request failed' } };
    });
    let caught = null;
    try { await result; } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(StaleActorError);
    expect(isStaleActorError(caught)).toBe(true);
  });

  test('a task enqueued after the handle closed is refused without running', async () => {
    let open = true;
    const queue = createHandleRequestQueue({ isOpen: () => open });
    open = false;
    const ran = jest.fn();
    let caught = null;
    try { await queue.enqueue(async () => { ran(); }); } catch (error) { caught = error; }
    expect(ran).not.toHaveBeenCalled();
    expect(caught).toBeInstanceOf(StaleActorError);
  });

  test('a task waiting behind a running one is refused if the handle closes first', async () => {
    let open = true;
    const queue = createHandleRequestQueue({ isOpen: () => open });
    const gate = deferred();
    const first = queue.enqueue(async () => { await gate.promise; });
    const ran = jest.fn();
    const second = queue.enqueue(async () => { ran(); });
    open = false;
    gate.resolve();
    await first.catch(() => {});
    let caught = null;
    try { await second; } catch (error) { caught = error; }
    expect(ran).not.toHaveBeenCalled();
    expect(caught).toBeInstanceOf(StaleActorError);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/handleRequestQueue.test.js`
Expected: FAIL, "Cannot find module '../src/session/handleRequestQueue'".

- [ ] **Step 3: Implement**

```js
// src/session/staleActor.js
export class StaleActorError extends Error {
  constructor(message = 'Work belongs to a signed-out EA') {
    super(message);
    this.name = 'StaleActorError';
    this.code = 'STALE_ACTOR';
  }
}

// An open handle without a usable session (offline restore, refresh in flight). Reported to
// application code as the existing codeless network error so the row stays retriable.
export class AuthUnavailableError extends Error {
  constructor(message = 'auth unavailable') {
    super(message);
    this.name = 'AuthUnavailableError';
    this.code = '';
  }
}

export class FileOwnerMismatchError extends Error {
  constructor(expectedUserId, recordedUserId) {
    super(`Database file belongs to ${recordedUserId}, not ${expectedUserId}`);
    this.name = 'FileOwnerMismatchError';
    this.code = 'FILE_OWNER_MISMATCH';
  }
}

export class NoSignedInEAError extends Error {
  constructor(message = 'No EA is signed in') {
    super(message);
    this.name = 'NoSignedInEAError';
    this.code = 'NO_SIGNED_IN_EA';
  }
}

export const isStaleActorError = (error) => error instanceof StaleActorError
  || error?.name === 'StaleActorError';
```

```js
// src/session/handleRequestQueue.js
import { StaleActorError } from './staleActor';

// One serial queue per signed-in EA handle (spec §5.3). The running task's token lets the
// fenced fetch mark exactly the task that tried to send (spec §5.2): tasks run one at a time,
// so the refusal cannot be attributed to the wrong task.
export const createHandleRequestQueue = ({ isOpen }) => {
  let tail = Promise.resolve();
  let running = null;

  const enqueue = (task) => {
    const run = tail.catch(() => null).then(async () => {
      if (!isOpen()) throw new StaleActorError();
      const token = { stale: false, markStale() { this.stale = true; } };
      running = token;
      let outcome;
      try {
        outcome = { value: await task() };
      } catch (error) {
        outcome = { error };
      } finally {
        running = null;
      }
      if (token.stale) throw new StaleActorError();
      if ('error' in outcome) throw outcome.error;
      return outcome.value;
    });
    tail = run.catch(() => null);
    return run;
  };

  return {
    enqueue,
    currentTask: () => running,
  };
};
```

- [ ] **Step 4: Run to verify pass** (same command). Expected: 6 passed.

- [ ] **Step 5: Leave uncommitted; report.** Controller commits as `feat(session): add stale-actor errors and the per-handle request queue`.

---

### Task 2: The signed-in EA handle owns a per-EA file

**Files:**
- Create: `src/session/signedInHandle.js`, `test-support/actorTestUtils.js`
- Modify: `src/db/client.js`, `src/db/repositories/repositoryRuntime.js`, `src/db/migrations.js` (remove `appMigrationQueue` and the no-argument branch of `runMigrations`; `runMigrationsNow` requires a connection), `src/db/debugDump.js` (read through the current handle's reader), every test that imports `src/db/client` (14 files: `grep -rln "db/client" __tests__ test-support`)
- Test: `__tests__/signedInHandle.test.js`, `__tests__/integration/signedInHandleFiles.integration.js`

**Interfaces:**
- Consumes: Task 1 errors and `createHandleRequestQueue`.
- Produces (`src/session/signedInHandle.js`):
  - `openSignedInHandle({ userId, openDatabase = openDatabaseAsync }) → Promise<Handle>`. Closes any current handle first (awaiting its close), opens `masi-<userId>.db`, configures and migrates, checks or writes the owner marker, runs `resetInFlight` for the file (all rows, no owner filter), runs the startup repairs (`createStartupRepairRunner` with this handle as `database`), then publishes the handle as current and returns it. A failure closes whatever opened and rethrows; nothing is published.
  - `closeSignedInHandle({ reason }) → Promise<void>`: the §4.3 sequence on the current handle; a no-op when none.
  - `getCurrentHandle() → Handle | null`; `requireCurrentHandle() → Handle` (throws `NoSignedInEAError`); `subscribeToHandle(listener) → unsubscribe` (listener receives the current handle or `null`).
  - `setLatestAuthSession(session | null)`: stores the latest auth-client session; `getLatestAuthSession()`.
  - `registerConnectionActor(connection, userId)`, `getConnectionActor(connection) → string | null`.
  - `Handle` = `{ userId, epoch, state: 'open' | 'closed', fileName, getReader(), withTransaction(task), withDatabaseAccess(task), isOpen(), isCurrent(), enqueueRequest(task), requestQueue, abortSignal, onClose(listener) }`. `epoch` is a process-wide counter incremented by every open and every close.
- Produces (`src/db/client.js`): `DATABASE_FILE_PREFIX = 'masi-'`, `LEGACY_DATABASE_NAME = 'masi.db'`, `databaseNameForUser(userId) → 'masi-<userId>.db'` (throws unless `userId` matches `/^[0-9a-f-]{36}$/i`), `openConfiguredConnections({ name, openDatabase }) → { writer, reader }` (the existing PRAGMA + migration sequence moved out of `initialize`), and delegating `getDatabase()`, `getWriter()`, `withDatabaseAccess(task)`, `withTransaction(task)` that call `requireCurrentHandle()`. `initializeDatabase` and `resetDatabaseConnectionForTests` are removed; `DATABASE_NAME` is removed.
- Produces (`repositoryRuntime.js`): `isSignedInHandle(value) → boolean`; `resolveDatabase(database)` returns `database.getReader()` for a handle, the migrated raw connection for an injected test database, and `requireCurrentHandle().getReader()` otherwise; `runRepositoryTransaction(database, task)` uses `database.withTransaction(task)` for a handle, the existing `runWithTransaction` for a raw test database, and `requireCurrentHandle().withTransaction(task)` otherwise.
- Produces (`test-support/actorTestUtils.js`): `bindTestActor(db, userId)` (calls `registerConnectionActor`), `openTestHandle({ userId })` (opens a handle on the integration engine).

Transaction doors (spec §5.4), implemented in `Handle.withTransaction`:
- Admission: if the handle is not open, throw `StaleActorError` without touching the queue.
- The task runs on the handle's own serial write queue (moved from `client.js`'s `databaseQueue`).
- Commit: immediately before `COMMIT`, if the handle is no longer open, run `ROLLBACK` and throw `StaleActorError`.
- A failed `ROLLBACK` marks the handle's connections unusable; the next `withTransaction` closes and reopens both connections for the same file (the old `disposeConnections` behaviour, per handle).
- `withTransaction` keeps the non-re-entrant contract and its comment block.

Close sequence (spec §4.3), `closeSignedInHandle`:
1. `state = 'closed'`; `epoch` advances; the registry's current handle becomes `null` and subscribers are notified.
2. `abortController.abort()` (Task 3 attaches it to every request).
3. Await the write queue's tail (a transaction already executing reaches the commit door and rolls back).
4. Write `local_state('last_active_at', <ISO now>)` directly on the writer, outside the doors.
5. Close reader then writer. `onClose` listeners run after this.

- [ ] **Step 1: Write the failing unit tests** (`__tests__/signedInHandle.test.js`, using the better-sqlite3 adapter through an injected `openDatabase` that maps a name to a temp file).

```js
import path from 'path';
import os from 'os';
import fs from 'fs';
import { createBetterSqliteAdapter } from '../test-support/betterSqliteAdapter';
import {
  openSignedInHandle, closeSignedInHandle, getCurrentHandle, requireCurrentHandle,
  getConnectionActor,
} from '../src/session/signedInHandle';
import { StaleActorError, NoSignedInEAError, FileOwnerMismatchError } from '../src/session/staleActor';
import { databaseNameForUser } from '../src/db/client';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-handle-'));
const opened = [];
// Writer and reader of the same name share the file; matches expo-sqlite's useNewConnection.
const openDatabase = async (name) => {
  const db = createBetterSqliteAdapter(path.join(dir, name));
  opened.push(name);
  return db;
};

afterEach(async () => { await closeSignedInHandle({ reason: 'test' }); });

test('T1: opening A uses masi-A.db, opening B uses masi-B.db, and closing leaves no current handle', async () => {
  const a = await openSignedInHandle({ userId: A, openDatabase });
  expect(a.fileName).toBe(databaseNameForUser(A));
  expect(getCurrentHandle()).toBe(a);
  const b = await openSignedInHandle({ userId: B, openDatabase });
  expect(a.state).toBe('closed');
  expect(b.fileName).toBe(`masi-${B}.db`);
  await closeSignedInHandle({ reason: 'test' });
  expect(getCurrentHandle()).toBeNull();
  expect(() => requireCurrentHandle()).toThrow(NoSignedInEAError);
  expect(opened).not.toContain('masi.db');
});

test('the writer is registered with the EA as its actor', async () => {
  const a = await openSignedInHandle({ userId: A, openDatabase });
  await a.withTransaction(async (txn) => {
    expect(getConnectionActor(txn)).toBe(A);
  });
});

test('T4: a transaction admitted while open, with sign-out before COMMIT, rolls back', async () => {
  const a = await openSignedInHandle({ userId: A, openDatabase });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const write = a.withTransaction(async (txn) => {
    await txn.runAsync("insert into local_state (key, value, updated_at) values ('probe', '1', 'now')");
    await gate;
  });
  const closing = closeSignedInHandle({ reason: 'test' });
  release();
  let caught = null;
  try { await write; } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(StaleActorError);
  await closing;
  const again = await openSignedInHandle({ userId: A, openDatabase });
  const reader = await again.getReader();
  expect(await reader.getFirstAsync("select value from local_state where key = 'probe'")).toBeNull();
});

test('T4: a transaction started after sign-out is refused', async () => {
  const a = await openSignedInHandle({ userId: A, openDatabase });
  await closeSignedInHandle({ reason: 'test' });
  let caught = null;
  try { await a.withTransaction(async () => {}); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(StaleActorError);
});

test('T10: sign-out writes last_active_at and deletes nothing', async () => {
  const a = await openSignedInHandle({ userId: A, openDatabase });
  await closeSignedInHandle({ reason: 'test' });
  const again = await openSignedInHandle({ userId: A, openDatabase });
  const reader = await again.getReader();
  const row = await reader.getFirstAsync("select value from local_state where key = 'last_active_at'");
  expect(Date.parse(row.value)).not.toBeNaN();
  expect(fs.existsSync(path.join(dir, `masi-${A}.db`))).toBe(true);
});

test('ruling 4: a file whose owner marker names another EA refuses to open and publishes nothing', async () => {
  const a = await openSignedInHandle({ userId: A, openDatabase });
  await a.withTransaction(async (txn) => {
    await txn.runAsync("update local_state set value = ? where key = 'file_owner_user_id'", B);
  });
  await closeSignedInHandle({ reason: 'test' });
  let caught = null;
  try { await openSignedInHandle({ userId: A, openDatabase }); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(FileOwnerMismatchError);
  expect(getCurrentHandle()).toBeNull();
});

test('Review focus 4: a migration failure publishes no handle', async () => {
  const failing = async (name) => {
    const db = await openDatabase(name);
    const exec = db.execAsync.bind(db);
    db.execAsync = async (sql) => {
      if (/create table/i.test(sql)) throw new Error('disk full');
      return exec(sql);
    };
    return db;
  };
  let caught = null;
  try { await openSignedInHandle({ userId: '33333333-3333-4333-8333-333333333333', openDatabase: failing }); } catch (error) { caught = error; }
  expect(caught?.message).toMatch('disk full');
  expect(getCurrentHandle()).toBeNull();
});

test('Review focus 2: A then A again gets a new epoch on the same file', async () => {
  const first = await openSignedInHandle({ userId: A, openDatabase });
  const firstEpoch = first.epoch;
  await closeSignedInHandle({ reason: 'test' });
  const second = await openSignedInHandle({ userId: A, openDatabase });
  expect(second.fileName).toBe(first.fileName);
  expect(second.epoch).toBeGreaterThan(firstEpoch);
  expect(first.isCurrent()).toBe(false);
});
```

Note for the implementer: if `test-support/betterSqliteAdapter.js` does not expose a path-based constructor, add one (`createBetterSqliteAdapter(filePath)`) rather than writing a new adapter. Check the existing exports first.

- [ ] **Step 2: Write the failing integration test** (`__tests__/integration/signedInHandleFiles.integration.js`, real engine): open A, write a child row through `childrenRepository` (no `database` argument, so through the current handle), close, open B, read children through the repository and expect none; close B, open A again and expect the child; assert that `masi.db` was never opened by checking the engine registry, and that `-wal`/`-shm` companions of A's file are still present after B signs in (T10, T11's "never opened" half).

- [ ] **Step 3: Run both to verify failure**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/signedInHandle.test.js` and `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- __tests__/integration/signedInHandleFiles.integration.js`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement** `signedInHandle.js`, the `client.js` split, the `repositoryRuntime.js` handle branch, and the `migrations.js` change, as specified above. Keep `client.js`'s comments on PRAGMA scope, early connection registration, and the non-re-entrant contract; move them with the code.

- [ ] **Step 5: Migrate the existing tests that import `src/db/client`.** Each now opens a handle with `openTestHandle` (integration) or injects a database (unit) instead of `resetDatabaseConnectionForTests`. Do not weaken any assertion; list every changed test and why in the report.

- [ ] **Step 6: Run** the two new suites, then `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --silent` and `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --silent`. Expected: all pass. The app does not open a handle yet (Task 7 wires it), so production code paths that call repositories with no handle throw `NoSignedInEAError`; tests that exercised them must open a handle.

- [ ] **Step 7: Leave uncommitted; report.** Controller commits as `feat(session): give each signed-in EA their own database file`.

---

### Task 3: The per-handle data client fences every request

**Files:**
- Create: `src/session/handleDataClient.js`
- Modify: `src/session/signedInHandle.js` (create the data client and request queue at open; expose `handle.dataClient`, `handle.enqueueRequest`, `handle.requireAccessToken()`, `handle.fencedFetch`)
- Test: `__tests__/handleDataClient.test.js`

**Interfaces:**
- Consumes: Task 1, Task 2 (`getLatestAuthSession`, `handle.isOpen()`, `handle.isCurrent()`, `handle.requestQueue`).
- Produces: `createHandleDataClient({ handle, supabaseUrl, supabaseKey, fetchImpl = fetch, timeoutMs = 30_000 }) → SupabaseClient` built with `createClient(url, key, { accessToken: () => handle.requireAccessToken(), global: { fetch: handle.fencedFetch } })`.
- Produces on the handle:
  - `requireAccessToken() → Promise<string>`: if the handle is closed or not current, mark the running task stale (`requestQueue.currentTask()?.markStale()`) and throw `StaleActorError`. If no task is running, throw `StaleActorError` (requests are allowed only inside `enqueueRequest`). If the latest session is missing or belongs to another user, throw `AuthUnavailableError` (ruling 2). Otherwise return `session.access_token`. Never calls `getSession()`.
  - `fencedFetch(input, init)`: repeats the same checks at send time; attaches a signal that aborts on the handle's `AbortController` or after `timeoutMs`; a timeout or abort rejects with `new TypeError('Network request failed')` so postgrest-js returns its codeless error.

- [ ] **Step 1: Write the failing tests** through the **real** supabase-js 2.100.1 builders over a fake transport (T18, T23, plus ruling 2):

```js
import { openSignedInHandle, closeSignedInHandle, setLatestAuthSession } from '../src/session/signedInHandle';
import { isStaleActorError } from '../src/session/staleActor';
// openDatabase helper as in Task 2's test file (factor it into test-support/actorTestUtils.js).

const session = (userId, token) => ({ user: { id: userId }, access_token: token });

test('T18: a task paused mid-request is refused at its next send after A signs out and B signs in', async () => {
  const sent = [];
  let releaseSelect;
  const transport = jest.fn(async (url, init) => {
    sent.push({ url: String(url), method: init.method, auth: init.headers?.Authorization || new Headers(init.headers).get('Authorization') });
    if (String(url).includes('select=')) await new Promise((resolve) => { releaseSelect = resolve; });
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  setLatestAuthSession(session(A, 'token-A'));
  const a = await openSignedInHandle({ userId: A, openDatabase, fetchImpl: transport });
  const task = a.enqueueRequest(async () => {
    await a.dataClient.from('child_class_memberships').select('id').eq('child_id', 'c1');
    await a.dataClient.from('child_class_memberships').update({ unassigned_at: 'now' }).eq('id', 'm1');
    return a.dataClient.from('child_class_memberships').upsert({ id: 'm2' });
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await closeSignedInHandle({ reason: 'test' });
  setLatestAuthSession(session(B, 'token-B'));
  await openSignedInHandle({ userId: B, openDatabase, fetchImpl: transport });
  releaseSelect();
  let caught = null;
  try { await task; } catch (error) { caught = error; }
  expect(isStaleActorError(caught)).toBe(true);
  expect(sent.filter((request) => request.method !== 'GET')).toEqual([]);
  expect(sent.every((request) => !String(request.auth).includes('token-B'))).toBe(true);
});

test('T18: rpc is fenced the same way', async () => { /* same shape with a.dataClient.rpc('delete_child_if_no_history', { p_child_id: 'c1' }) issued after close */ });

test('T23: after TOKEN_REFRESHED the next request carries the new token', async () => {
  // open with token-1, setLatestAuthSession(session(A, 'token-2')), enqueue a select, assert Authorization 'Bearer token-2'
});

test('T23: a request made outside a queued task is refused', async () => {
  // await a.dataClient.from('children').select('id') directly; the transport is never called;
  // the SDK returns an error object; the transport mock has zero calls
});

test('ruling 2: an open handle with no session returns a retriable codeless error, not StaleActorError', async () => {
  // setLatestAuthSession(null); enqueue a select; expect the queue to RESOLVE with { error: { code: '' } }
  // (postgrest-js turns the rejected fetch into an error object) and not reject with StaleActorError
});

test('a request that exceeds the timeout resolves as a codeless error', async () => {
  // transport never resolves; createHandleDataClient timeoutMs: 20; expect { error: { code: '' } } within 200 ms
});
```

Write the four outlined tests out in full in the same style as the first; each asserts at the transport.

- [ ] **Step 2: Run to verify failure.** `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/handleDataClient.test.js` → FAIL.
- [ ] **Step 3: Implement** as specified. `openSignedInHandle` accepts `fetchImpl` and `timeoutMs` for tests; production uses the global `fetch` and the project URL and key from `src/services/supabaseClient.js` (export `supabaseUrl` and `supabaseAnonKey` from there).
- [ ] **Step 4: Run** the new suite and the full unit suite. Expected: pass.
- [ ] **Step 5: Leave uncommitted; report.** Controller commits as `feat(session): fence every data request at send time`.

---

### Task 4: The outbox owner is the EA who made the change

**Files:**
- Modify: `src/db/repositories/domainRepositoryUtils.js` (`enqueueDomainOutbox`, `enqueueLifecycleOutbox`), `src/db/repositories/syncOutboxRepository.js` (`enqueue`, `insertOutboxRecord`, `getReadyRecords`, `getPendingHardDeleteIds`, `resetInFlight`, `getSyncStatus`), `src/db/migrations.js` (migration 11), the assessments, sessions, and letter-mastery repositories (remove explicit `ownerUserId: record.user_id`), every test that passes `ownerUserId`/`ownerRow` or relies on `created_by` owner resolution
- Test: `__tests__/outboxOwnerStamping.test.js`

**Interfaces:**
- Consumes: Task 2 `getConnectionActor`, `bindTestActor`.
- Produces: `enqueueDomainOutbox(db, tableName, recordId, operation, payload, { outboxId })` (no owner options); `insertOutboxRecord` throws `Error('sync_outbox.owner_user_id is required')` when `getConnectionActor(db)` is null; `getReadyRecords({ ownerUserId })`, `getPendingHardDeleteIds({ ownerUserId })`, `resetInFlight({ ownerUserId })` use `owner_user_id = ?` (no null wildcard; when `ownerUserId` is omitted they are file-wide); `getSyncStatus()` takes no owner and counts file-wide; new `countUnsent() → { total, byTable }` counting `pending|failed|in_flight|terminal` (spec §7.2, used by Plan 3).
- Migration 11, name `sync_outbox_owner_required`:

```sql
create trigger if not exists sync_outbox_owner_required
before insert on sync_outbox
when new.owner_user_id is null
begin
  select raise(abort, 'sync_outbox.owner_user_id is required');
end;
```

- [ ] **Step 1: Write the failing tests**

```js
test('T6: an EA edit of a Head Office-created child is owned by the EA and is upload-ready for the EA', async () => {
  // db = better-sqlite3 test db; bindTestActor(db, EA)
  // seed a children row with created_by = HEAD_OFFICE and an active child_ea_assignments row for EA
  // childrenRepository (createChildrenRepository({ database: db })).updateChild(id, { reading_level: 'words' }, …)
  // expect outbox row owner_user_id === EA
  // expect (await outbox.getReadyRecords({ ownerUserId: EA })).map(r => r.record_id) toContain(id)
  // run a sync pass with the Plan 1 fake server and assert the request is update … eq('id') … select('id') without created_by
});

test('T7: inserting an outbox row with no actor throws in JavaScript', async () => {
  // db without bindTestActor; enqueueDomainOutbox(db, 'children', 'c1', 'insert', {}) rejects with 'owner_user_id is required'
});

test('T7: the trigger aborts a raw null-owner insert', async () => {
  // db.runAsync("insert into sync_outbox (id, table_name, record_id, operation, status, created_at, updated_at) values ('x','children','c1','insert','pending','t','t')")
  // rejects with /owner_user_id is required/
});

test('unsent counts are file-wide', async () => {
  // insert rows owned by EA and by OTHER directly (bindTestActor switched between inserts);
  // getSyncStatus() counts both; countUnsent().byTable reports both
});
```

Write each test out in full (fixtures as in `__tests__/offlineSyncUpdateById.test.js`).

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Remove `resolvePrimaryOwner` imports from `domainRepositoryUtils.js`. Keep `outboxOwnership.js` until Task 5 (the rescue heal still imports `resolveRecordOwners`).
- [ ] **Step 4: Migrate existing tests.** Tests that built outbox rows through repositories now `bindTestActor(db, <the user the test syncs as>)`. Tests asserting `owner_user_id = created_by` for a Head Office row are the bug this task fixes: change them to assert the actor, and say so in the report.
- [ ] **Step 5: Run** the new suite, then full unit and integration. Expected: pass.
- [ ] **Step 6: Leave uncommitted; report.** Controller commits as `fix(sync): stamp the outbox owner from the signed-in EA`.

---

### Task 5: Integrity scan and owner-based rescue heal

**Files:**
- Modify: `src/db/repositories/syncOutboxRepository.js` (`quarantineForeignOwners({ fileUserId, transaction }) → { total, byTable }`), `src/services/offlineSync.js` (`syncAll` runs the scan before `resetInFlight`; `requeueTerminalRlsFailures` compares `record.owner_user_id === userId` and never requeues `foreign_owner` rows), `src/session/signedInHandle.js` (scan at open, before publish)
- Delete: `src/db/repositories/outboxOwnership.js` and its tests
- Test: `__tests__/outboxIntegrityScan.test.js`

**Interfaces:**
- `quarantineForeignOwners` moves every row with status `pending|failed|in_flight` and `owner_user_id <> fileUserId` to `terminal` with `last_error = 'foreign_owner'` and the matching domain row's `sync_status = 'terminal'`; returns counts by table. Rows already `terminal` with another owner keep their status but get `last_error = 'foreign_owner'`.
- After a non-empty scan: write `local_state('integrity_scan_last', JSON.stringify({ at, total, byTable }))`, `console.error` once, and `captureOperationalError(new Error('foreign_owner_in_file'), { category: 'foreign_owner_in_file', context: { byTable } })` (ruling 5).

- [ ] **Step 1: Write the failing tests** (T8, T9):
  - T8 at open: create A's file, insert an outbox row owned by X (bind X as actor for that insert only), close, reopen as A: the row is `terminal` with `foreign_owner`, `countUnsent().total` still includes it, and `integrity_scan_last` records it.
  - T8 before a pass: insert a foreign row into an open handle's file, run `syncAll` with the fake server: the transport receives nothing for that row, and it ends `terminal`/`foreign_owner`.
  - T8 heal: `requeueTerminalRlsFailures(A)` leaves the `foreign_owner` row terminal.
  - T9: a Head Office-created child edited by A, quarantined by a 42501 terminal without the authenticated marker, is requeued by `requeueTerminalRlsFailures(A)` because `owner_user_id === A`.
- [ ] **Step 2: Run to verify failure.** Step 3: implement. Step 4: run new suite, full unit, integration.
- [ ] **Step 5: Leave uncommitted; report.** Controller commits as `feat(sync): quarantine foreign-owned outbox rows and heal by stamped owner`.

---

### Task 6: Per-handle services: sync engine, pulls, barriers, and history state

**Files:**
- Create: `src/session/handleServices.js`
- Modify: `src/services/offlineSync.js` (remove `defaultEngine`, the module-level `syncAll`/`getSyncStatus`/`requeueTerminalRlsFailures`/`retryFailedItem`/`syncTableByName` wrappers, `referenceDataReadyThisSession`, `referenceDataPromise`; `pullReferenceData`, `ensureReferenceData`, `fetchAndCacheSchools` require `{ supabaseClient, enqueueRequest, repositories }`; `processRecord`/`processBatch` treat `isStaleActorError` as "skip finalization, stop the pass"), `src/services/preloadedChildData.js`, `src/services/sessionHistoryPull.js` (`actorGeneration`/`inFlight` become per-handle state passed in), `src/services/sessionHistoryStatus.js` (state created per handle; `useSessionHistoryStatus` reads the current handle's store), `src/services/observability.js` (`reportedSyncIssueKeys` and `operationalErrorTimes` keys include the user id)
- Delete: `src/services/supabaseRequestQueue.js` and `enqueueSupabaseRequest`
- Test: `__tests__/handleServices.test.js`, `__tests__/integration/accountSwitch.integration.js`

**Interfaces:**
- Produces: `createHandleServices(handle) → { repositories, syncEngine, referenceDataReady(), pullReferenceData(), pullRoster({ userId }), pullClasses(), pullLookups(), sessionHistory: { start({ force }), getState(), store }, reportIssueKey(key) }`, created once inside `openSignedInHandle` and exposed as `handle.services`.
  - `repositories` = every `create*Repository({ database: handle })` the background paths use (children, classes, groups, group/class EA assignments, child class memberships, sessions, assessments, mastery, time entries, reference data, sync outbox, sync state, local state).
  - `syncEngine = createOutboxSyncEngine({ database: handle, supabaseClient: handle.dataClient, enqueueRequest: handle.enqueueRequest, getAuthSession: async () => ({ data: { session: getLatestAuthSession()?.user?.id === handle.userId ? getLatestAuthSession() : null } }) })`.
  - `referenceDataReady()` is a single-flight promise per handle (spec §5.1a). Roster, class, and history pulls await it before persisting.
- Engine rule: when a server call rejects with `StaleActorError`, the record is not finalized (no attempt count, no backoff, no status change) and the pass stops with `{ abortedStaleActor: true }`. Rows stay `in_flight`; `openSignedInHandle` already resets them at the next open (Task 2).

- [ ] **Step 1: Write the failing tests**
  - T3 (live defect 2): A's handle enqueues an upload whose server call is paused; A signs out; B signs in; the paused task resumes: the transport receives no request after the sign-out, the pass ends with `abortedStaleActor`, and A's outbox row (read by reopening A's file later) is `pending` with `retry_count` unchanged.
  - T5: sign-out during an in-flight upload aborts it at once; A reopens; `resetInFlight` returned the row to `pending`; the next pass sends it once; repeating an already-landed UPDATE, upsert, or lifecycle archive leaves the fake server row unchanged.
  - T15: switch with A's barrier fulfilled, and again with it pending; B's file empty; B's reference requests delayed, then failing: B's roster and history pulls do not persist before B's own `referenceDataReady()` resolves, and never observe A's.
  - T19: A's upload never resolves; A signs out; B signs in: B's reference pull and first upload start within 1 s, and A's request saw an abort signal at sign-out.
  - Review focus 3 (integration, real engine): A → B → A within one test: A works offline (creates a child), signs out with the upload unsent, B signs in and creates a child, A signs back in: B's file has only B's child; A's child uploads exactly once after A returns.
  - A static test: no file under `src/` imports `supabaseRequestQueue` or calls `enqueueSupabaseRequest`.
- [ ] **Step 2: Run to verify failure.** Step 3: implement. Step 4: run new suites, full unit, integration.
- [ ] **Step 5: Leave uncommitted; report.** Controller commits as `feat(session): run sync and pulls per signed-in EA`.

---

### Task 7: Remount the signed-in tree by key

**Files:**
- Create: `src/context/SignedInEAContext.js`
- Modify: `App.js`, `src/context/AuthContext.js`, `src/context/OfflineContext.js`, `ChildrenContext.js`, `ClassesContext.js`, `LookupsContext.js`, `TimeTrackingContext.js`, `src/services/literacySessionPersistence.js`, `src/components/bootstrap/DatabaseBootstrapGate.js`, `src/navigation/AppNavigator.js` (signed-in branch renders from the keyed tree), and the screen tests that render providers
- Test: `__tests__/signedInTree.test.js`, updates to `__tests__/App.plan5.test.js`

**Interfaces:**
- `AuthContext`:
  - Calls `setLatestAuthSession(nextSession)` first thing for **every** auth event, before any early return (so `TOKEN_REFRESHED` reaches the handle).
  - After a fresh sign-in or an offline restore (`restoreOfflineSession`), calls `openSignedInHandle({ userId })` and exposes `{ handle, handleStatus: 'opening' | 'open' | 'failed', handleError, retryOpenHandle }`.
  - `signOut` and every server-ended sign-out path (`SIGNED_OUT`, grace timeout) call `await closeSignedInHandle({ reason })` before clearing auth state. Plan 3 adds the questions in front of this.
  - `loadUserProfile` and the startup reference pull move into the signed-in tree (`SignedInEAProvider` effect); the profile request goes through `handle.enqueueRequest` and `handle.dataClient`.
- `App.js` renders, inside `PaperProvider` and `DatabaseBootstrapGate`:

```jsx
<AuthProvider>
  <AppRoot />
</AuthProvider>

// AppRoot
const { handle, handleStatus, handleError, retryOpenHandle } = useAuth();
if (handleStatus === 'failed') return <HandleOpenError error={handleError} onRetry={retryOpenHandle} />;
if (!handle) return <AppNavigator signedIn={false} />;
return (
  <SignedInEAProvider key={`${handle.userId}:${handle.epoch}`} handle={handle}>
    <OfflineProvider>
      <TimeTrackingProvider>
        <LookupsProvider>
          <ChildrenProvider>
            <ClassesProvider>
              <AppNavigator signedIn />
            </ClassesProvider>
          </ChildrenProvider>
        </LookupsProvider>
      </TimeTrackingProvider>
    </OfflineProvider>
  </SignedInEAProvider>
);
```

  While `handleStatus === 'opening'`, render the existing loading screen, never an empty state. `HandleOpenError` reuses `DatabaseBootstrapGate`'s failure UI (Retry, Export Logs), extracted into a shared component.
- `DatabaseBootstrapGate` checks that the engine loads (`openDatabaseAsync(':memory:')` then close) instead of `initializeDatabase()`.
- `OfflineContext` takes the actor from `useSignedInEA().handle.userId`; `currentUserIdRef` and its `onAuthStateChange` subscription are removed; sync, status, and the rescue heal go through `handle.services.syncEngine`; startup repairs are no longer run here (Task 2 runs them at open).
- `ChildrenContext`, `ClassesContext`, `LookupsContext` call `handle.services` for every pull and use `handle.services.repositories` for pull persistence (ruling 1).
- `TimeTrackingContext` and `literacySessionPersistence` capture `const handle = useSignedInEA().handle` (or a `handle` argument) at the start of a flow and pass `{ database: handle }` to the repositories they write through (ruling 1).

- [ ] **Step 1: Write the failing tests**
  - T1: render `App` with a mocked auth client; signed out: the login screen renders and no domain file is open (spy on the injected `openDatabase`: zero calls). Sign in as A: `masi-A.db` opens. Sign out, sign in as B: `masi-B.db` opens.
  - T2: offline restore of a persisted session for A (NetInfo offline, no auth session): A's file opens and the children screen shows the loading indicator, then A's children; it never renders the "no children" empty state in between.
  - T14: after a key change, no timer, interval, AppState or NetInfo listener from A's tree remains (spy on `setInterval`/`clearInterval`, `AppState.addEventListener(...).remove`, `NetInfo.addEventListener` unsubscribes; counts return to the signed-out baseline).
  - Review focus 4: `openSignedInHandle` rejects: the error screen with Retry renders; Retry calls it again.
- [ ] **Step 2: Run to verify failure.** Step 3: implement. Step 4: run new tests, full unit, integration.
- [ ] **Step 5: Leave uncommitted; report.** Controller commits as `feat(app): remount the signed-in tree per EA handle`.

---

### Task 8: Module-state allowlist and documentation

**Files:**
- Create: `__tests__/moduleStateAllowlist.test.js`, `docs/adr/0007-one-local-database-per-ea.md`
- Modify: `documentation/rls-sync-contract-map.md`, `CONTEXT.md`, `documentation/ROADMAP.md`, `documentation/build-log.md`, `documentation/LEARNING.md`, `AGENTS.md` (the "Offline Sync Strategy" paragraph names the handle)

- [ ] **Step 1: Write the failing allowlist test (T16).** It reads every `.js` file under `src/services`, `src/db`, and `src/session`, finds top-level `let`/`var` declarations and top-level `const x = new Map(`/`new Set(`, and fails for any not listed in an allowlist object in the test that maps `"<file>:<name>"` to its treatment string from spec §5.1a. Expected entries after Tasks 2–6: `src/services/observability.js:initialized`, `:enabled`, `:runtimeContext`, `:navigationIntegration` ("device-level"), `src/services/observability.js:reportedSyncIssueKeys`, `:operationalErrorTimes` ("keys include the actor"), `src/session/signedInHandle.js:currentHandle`, `:latestAuthSession`, `:epochCounter`, `:subscribers`, `:connectionActors` ("the handle registry"), and `src/db/migrations.js:explicitDatabaseMigrationQueues` ("per connection, WeakMap"). Add a deliberately unlisted `let` in a temp copy to show the failure, then remove it.
- [ ] **Step 2: Static test (T20).** No `.from(` or `.rpc(` on an import of `src/services/supabaseClient` anywhere under `src/` except `src/services/supabaseClient.js` and `src/context/AuthContext.js` auth calls (`supabase.auth.*`). Data calls go through `handle.dataClient`.
- [ ] **Step 3: Docs.**
  - Contract map: the owner rule (stamped from the connection, trigger, no null wildcard), the transaction doors, the per-handle client and queue, `StaleActorError` versus `AuthUnavailableError`, the integrity scan, ruling 1's residual risk.
  - `CONTEXT.md`: "Signed-in EA handle", "Unsent", "Left-behind work" (spec §3 wording).
  - ROADMAP priority 5 and §0 "Build one local database per EA": mark what Plan 2 delivered and what waits for Plan 3.
  - build-log: one Verification row with commands and counts; Decision rows for rulings 1–6.
  - LEARNING: "Why the fence sits on each request, not each task" (the postgrest-js codeless-error trap and the stale-task boundary).
  - ADR 0007 from spec §2, §4, §7.3 (ruling 6).
- [ ] **Step 4: Run** full unit and integration. **Step 5: Leave uncommitted; report.** Controller commits as `docs: record the signed-in EA handle contract`.

---

## Self-review

- **Spec coverage:** §4.1–§4.3 Task 2; §4.4 discovery and §4.5's incident are Plan 3 (they report through the envelope); §4.5's "never opened" Task 2; §5.1 Task 7; §5.1a Tasks 2, 6, 8; §5.2 Task 3 (and ruling 2); §5.3 Tasks 1, 6; §5.4 Task 2; §5.5 Tasks 2, 3, 6; §6.1–§6.2 Task 4; §6.3 Task 5 (incident via ruling 5); §6.4 Task 5. Tests: T1 Tasks 2, 7; T2 Task 7; T3 Task 6; T4 Task 2; T5 Task 6; T6, T7 Task 4; T8, T9 Task 5; T10 Task 2; T11 Task 2 (incident in Plan 3); T14 Task 7; T15 Task 6; T16 Task 8; T18 Task 3; T19 Task 6; T20 Task 8; T23 Task 3.
- **Out of this plan:** §7 (Plan 3), device checks D1–D6 (after Plan 3, with the build intended to ship), S2/S3 (Plan 3).
