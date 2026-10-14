# Signed-In EA Handle Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repository the implementer for each task is **Codex through the plugin** (gpt-5.6-sol); Claude reviews every diff, reruns the tests, and commits.

**Revision 2 (2026-10-14)** after a Codex adversarial review of revision 1 (verdict needs-attention, four high and two medium findings, all verified and adopted; see "Review history" at the end).

**Goal:** Give every signed-in EA their own SQLite file, request queue, and data client behind one handle, so no EA's work can be uploaded under another EA's session (live defect 2), written into another EA's file, or owned by anyone but the EA who made the change (live defect 1, phone half).

**Architecture:** A new module, the signed-in EA handle (`src/session/signedInHandle.js`), owns `masi-<userId>.db` (writer, reader, write queue), an epoch, a per-handle request queue, a Supabase data client whose `accessToken` callback and `fetch` check the handle at send time, and a set of repositories and services bound to itself. A lifecycle coordinator serializes every open and close. Production code never resolves an ambient database: every caller under `src/` gets handle-bound repositories and services from `useSignedInEA()` or an explicit `handle` argument, enforced by a static test, so a stale continuation of EA A's work can only reach A's closed handle. The React tree under `AuthProvider` remounts by `userId:epoch`, the outbox owner is stamped from the transaction's connection, and an integrity scan quarantines any foreign-owned row.

**Tech Stack:** React Native / Expo SDK 54, expo-sqlite 16 (better-sqlite3 in tests via `test-support/`), supabase-js 2.100.1 / postgrest-js 2.100.1, Jest under Node 20.

**Spec:** [`docs/superpowers/specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md`](../specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md) §3, §4, §5, §6.1–§6.4, §9.1 tests T1–T11, T14–T16, T18–T20, T23. Plan 1 (`2026-10-10-upload-path-correctness.md`) shipped §6.5–§6.6. Plan 3 ships §7 (sign-out questions, incident envelope, file discovery reports).

## Global Constraints

- Run Jest under Node 20: prefix every Jest command with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Stay on npm; add no dependencies.
- No Supabase migration, no hosted apply, no write to `masi-app-sqlite` (`segygjzpujphwvrubusm`). Never touch the legacy backend `jcqrlwetutnpuchjoyyd`. Never run raw `supabase` CLI; never source `.env.local`.
- SQLite behaviour is tested against real SQLite: better-sqlite3 through `test-support/betterSqliteAdapter.js` for unit tests, `test-support/expoSQLiteRealEngine.js` (`npm run test:integration`) for multi-file and close/reopen behaviour. **Every new integration suite is added to the `testMatch` allowlist in `jest.integration.config.js`**, and an integration GREEN counts only if `npx jest --config jest.integration.config.js --listTests` lists it.
- The domain file name is exactly `masi-<userId>.db`. After the cutover (Task 5) production code never opens, renames, or uploads from the legacy file `masi.db` (spec §4.5).
- Provisional per-request timeout: `30_000` ms (spec §5.2; device check D4 sets the final value). Close waits at most `5_000` ms for an executing transaction (ruling 8).
- Every task leaves `npm test` and `npm run test:integration` green. Until Task 5 the new handle exists alongside the legacy entry points; Task 5 migrates every consumer and removes the legacy entry points in one cutover.
- Commit messages carry no agent co-author trailer. Never use bare `git stash`; use a WIP commit.
- Codex's sandbox cannot write the worktree's git admin directory: implementers leave changes uncommitted; the controller reviews and commits.
- Update `documentation/rls-sync-contract-map.md`, `CONTEXT.md`, `documentation/ROADMAP.md`, `documentation/build-log.md`, `documentation/LEARNING.md`, and `AGENTS.md` in this branch (anti-drift rule). Task 8 owns them; earlier tasks may add build-log rows only.

## Design rulings (refinements of the spec, decided while planning)

Each ruling names what it costs if wrong. Implementers follow them; reviewers check them.

1. **No ambient database in production.** The spec (§4.2) reaches the database "through the current handle". Revision 1 bound only background flows and let user actions resolve the current handle; Codex reproduced the failure: `ClassesContext.addClass` awaits reference reads, and when its continuation resumed after a switch it wrote A's class into B's file with owner B. A remount does not cancel a captured callback. **Ruling:** every production consumer under `src/` (contexts, screens, components, hooks, services, utils) gets repositories and services that are **bound to one handle**: React code through `useSignedInEA()` (`{ handle, repositories, services }`), non-React services and utils through an explicit `handle` or `repositories` argument. A bound repository's writes after its handle closes are refused at admission with `StaleActorError`, so a resumed stale callback reaches neither file. The static test in Task 5 fails if any file under `src/` outside `src/db/` and `src/session/` imports a repository singleton or calls `resolveDatabase`/`runRepositoryTransaction` without a database. The repository singletons stay exported only for tests; their ambient resolution goes to the current handle, which `jest.setup.js` and `jest.integration.setup.js` open for a fixed test actor. This is stronger than §4.2 and is not the rejected approach B: the binding happens once per tree and per service, not per call site with an actor argument. *Cost if wrong:* larger diff in Task 5 (29 `src/` files); no behaviour cost.
2. **Missing token is not staleness.** Only a *closed* handle (or one that is no longer current) produces `StaleActorError`. An open handle with no session, or a session for a different user, refuses the request with `AuthUnavailableError`, which the queue surfaces as the existing codeless network error (`{ code: '', message: 'auth unavailable' }`), so the row is retriable and counted normally (an open handle without a session is normal during offline restore or a refresh; treating it as stale would strand rows `in_flight` until the next open). T23 is unchanged. *Cost if wrong:* a refusal during a token gap counts as one retriable attempt.
3. **The owner comes from the connection.** Each handle's writer belongs to one EA, so the handle registers `writer → userId` in a `WeakMap` at open (`registerConnectionActor`); `enqueueDomainOutbox(db, …)` reads it. No actor → throw (§6.2). Tests register an actor on their better-sqlite3 database with `bindTestActor`. *Cost if wrong:* none known.
4. **The file records its owner.** At first open the handle writes `local_state('file_owner_user_id', userId)`. A later open whose marker names someone else fails with `FileOwnerMismatchError` and publishes nothing. *Cost if wrong:* a manually copied file cannot be opened; recovery is Export Database.
5. **Incidents wait for Plan 3.** §6.3's `foreign_owner_in_file` incident needs Plan 3's envelope. Plan 2 records the scan result in `local_state('integrity_scan_last')` (JSON counts by table), logs one `console.error`, and calls `captureOperationalError(…, { category: 'foreign_owner_in_file' })`. *Cost if wrong:* until Plan 3, support learns of a foreign row through Sentry, not the incident table.
6. **The ADR is written directly** from spec §2, §4, §7.3 (Jim decided one file per EA on 2026-10-08 and deferred deletion on 2026-10-09). *Cost if wrong:* none.
7. **One lifecycle coordinator serializes opens and closes.** Revision 1 let a sign-out during A's migrations close nothing and then publish A afterwards, let overlapping opens publish out of order, and let a reopen of A race A's still-draining close. **Ruling:** `signedInHandle.js` holds a single coordinator: a monotonically increasing `generation`, the in-progress transition promise, and the latest requested state (`{ userId } | signedOut`). `requestOpen({ userId })` and `requestClose({ reason })` bump the generation at call time and chain after the in-progress transition. An open re-checks its generation immediately before publishing; a superseded open closes its own connections and resolves `null`. A same-user `requestOpen` while that user's handle is current or opening joins it instead of reopening. A close always completes the previous close (including the writer drain and connection close) before any later open starts. *Cost if wrong:* none; it only orders transitions.
8. **Close has a bounded drain.** Close aborts requests first, then waits up to `5_000` ms for the write queue's tail. If a transaction is still running after that (it is awaiting something the abort does not cancel), the handle closes the connections anyway; SQLite rolls back the open transaction when its connection closes, and the transaction's commit door also refuses. The timeout is logged. *Cost if wrong:* a transaction that would have committed within a longer wait is rolled back; the EA's action reports a failure and can be repeated.
9. **Stale cancellation is a whole-pass rule.** When any server call in a sync pass rejects with `StaleActorError`, or any repository call refuses with it, the pass stops: no record is finalized, no batch fallback runs, the outer `catch` does not finalize a retriable failure, and the `finally` block does not call `updateSyncMeta` (it would be refused anyway). The pass resolves `{ abortedStaleActor: true }` and reports nothing to observability. Pulls follow the same rule: they stop without writing failure markers. *Cost if wrong:* none; the handle is closed, so nothing could be written.
10. **Device-level settings move to AsyncStorage; the profile cache stays per EA.** `deviceSettings` stores the user profile cache and the capture mode in SQLite `local_state` today. With one file per EA the profile cache belongs in that EA's file (read inside the signed-in tree; sign-out no longer clears it, because the next EA has a different file). The capture mode is a device preference, so it moves to AsyncStorage key `masi:device:captureMode` (spec §4.1 already lists `deviceSettings` under AsyncStorage). No data migration: pre-live, the default applies once. *Cost if wrong:* a test phone shows the default capture mode once.
11. **Uncertain server outcomes are not solved here.** An aborted or timed-out request can still commit on the server *after* a newer acknowledged mutation, because uploads are unconditional UPDATE-by-id and update-capable upserts (`offlineSync.js` ~793–828); for example an old time-entry upsert could restore `sign_out_time = null` after a newer clock-out. Identical replay being harmless (T5) does not prove ordering. Spec §5.5 and §12 already assign uncertain-outcome recovery and server ordering to the upload-contract spec. **Ruling:** T5 asserts only idempotent replay; Task 8 makes "server-enforced ordering or equivalent uncertain-outcome protection" an explicit **field-release prerequisite** in ROADMAP priority 5 and the contract map. *Cost if wrong:* none here; the risk is named, not hidden.

## Review Focus

Inputs the spec implies but its test list does not pin. Each line names the task whose tests pin it.

1. **A stale user action resumes after a switch** (`ClassesContext.addClass` awaiting a read; `GroupPickerBottomSheet`'s remove-then-add chain): neither A's file nor B's receives the write. Pinned in Task 5.
2. **Sign-out while A's handle is still opening** (during migrations or startup repairs), **overlapping A/B opens**, **duplicate same-user auth events**, and **A reopening while A's close drains**: the latest requested state wins, no handle publishes after a sign-out, and one file never has two writers. Pinned in Task 2.
3. **Cold start offline with a persisted session**: A's file opens, Home shows A's children, sync is skipped without errors, and no request is refused as stale. Pinned in Task 5 (T2) and Task 3 (ruling 2).
4. **Rapid alternation A → B → A**: each EA's file opens; B never sees A's rows; A's left-behind work uploads exactly once when A returns. Pinned in Task 4 (integration).
5. **Sync Status → Retry after the cutover** goes through the handle-bound engine. Pinned in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/session/staleActor.js` (new) | `StaleActorError`, `AuthUnavailableError`, `FileOwnerMismatchError`, `NoSignedInEAError`, `isStaleActorError` |
| `src/session/handleRequestQueue.js` (new) | One serial queue per handle; tracks the running task; turns a stale-marked task into `StaleActorError` |
| `src/session/signedInHandle.js` (new) | Lifecycle coordinator (`requestOpen`, `requestClose`, generation), current-handle registry, file connections and write queue, transaction doors, connection→actor registry, latest auth session |
| `src/session/handleDataClient.js` (new) | Per-handle supabase-js data client: `accessToken` callback and fenced `fetch` with abort and timeout |
| `src/session/handleServices.js` (new) | Per-handle bound repositories, sync engine, pulls, reference-data barrier, history state |
| `src/context/SignedInEAContext.js` (new) | `SignedInEAProvider`, `useSignedInEA()` |
| `src/db/client.js` | Exports `DATABASE_FILE_PREFIX`, `LEGACY_DATABASE_NAME`, `databaseNameForUser`, `openConfiguredConnections`; the legacy module-level connection is removed in Task 5 |
| `src/db/repositories/repositoryRuntime.js` | Accepts a handle as `database`; ambient resolution goes to the current handle (tests only after Task 5) |
| `src/db/migrations.js` | Migration 11 (owner trigger) in Task 6; `appMigrationQueue` removed in Task 5 |
| `src/db/repositories/domainRepositoryUtils.js`, `syncOutboxRepository.js` | Owner stamped from the connection; no null-owner wildcard; file-wide unsent counts; integrity scan |
| `src/db/repositories/outboxOwnership.js` | Deleted (Task 7) |
| `src/services/supabaseRequestQueue.js` | Deleted (Task 5) |
| `src/services/deviceSettings.js` | Capture mode in AsyncStorage; profile cache through bound repositories (Task 5) |
| `src/services/offlineSync.js`, `preloadedChildData.js`, `sessionHistoryPull.js`, `sessionHistoryStatus.js`, `observability.js`, `startupRepairs.js` | Take a handle's client, queue, and repositories; module state moves into the handle |
| `src/context/*.js`, the 13 screens/components/hooks and 6 services/utils that import repositories, `src/screens/main/SyncStatusScreen.js` | Bound through `useSignedInEA()` or an explicit handle (Task 5) |
| `App.js`, `src/components/bootstrap/DatabaseBootstrapGate.js` | Remount by key; the gate checks that the SQLite engine loads |
| `jest.setup.js`, `jest.integration.setup.js`, `jest.integration.config.js` | Open and close a default test handle per test; register new integration suites |
| `test-support/actorTestUtils.js` (new) | `TEST_ACTOR_ID`, `bindTestActor(db, userId)`, `openTestHandle({ userId })`, the path-based better-sqlite3 opener |

---

### Task 1: Stale-actor errors and the per-handle request queue

**Files:**
- Create: `src/session/staleActor.js`, `src/session/handleRequestQueue.js`
- Test: `__tests__/handleRequestQueue.test.js`

**Interfaces:**
- Produces: `class StaleActorError extends Error` (`name = 'StaleActorError'`, `code = 'STALE_ACTOR'`); `class AuthUnavailableError extends Error` (`code = ''`); `class FileOwnerMismatchError extends Error` (`code = 'FILE_OWNER_MISMATCH'`); `class NoSignedInEAError extends Error` (`code = 'NO_SIGNED_IN_EA'`); `isStaleActorError(error) → boolean`.
- Produces: `createHandleRequestQueue({ isOpen }) → { enqueue(task) → Promise, currentTask() → { markStale(), stale } | null }`. `enqueue` serializes tasks (a failed task never blocks the next). `currentTask()` returns the running task's token, or `null` outside a task.

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

### Task 2: The signed-in EA handle, its file, and the lifecycle coordinator

This task is **additive**: the legacy `client.js` connection, `initializeDatabase`, and `resetDatabaseConnectionForTests` keep working until Task 5. Nothing in the app opens a handle yet.

**Files:**
- Create: `src/session/signedInHandle.js`, `test-support/actorTestUtils.js`
- Modify: `src/db/client.js` (extract `openConfiguredConnections`; add `databaseNameForUser`, `DATABASE_FILE_PREFIX`, `LEGACY_DATABASE_NAME`; keep the legacy exports), `src/db/repositories/repositoryRuntime.js` (handle branch), `jest.integration.config.js` (register the new suite)
- Test: `__tests__/signedInHandle.test.js`, `__tests__/integration/signedInHandleFiles.integration.js`

**Interfaces:**
- Consumes: Task 1 errors and `createHandleRequestQueue`.
- Produces (`src/session/signedInHandle.js`):
  - `requestOpen({ userId, openDatabase = openDatabaseAsync, fetchImpl, timeoutMs }) → Promise<Handle | null>` (ruling 7). Sequence after waiting for any in-progress transition: if this request's generation is stale, resolve `null`; if `userId`'s handle is current and open, resolve it; otherwise close the current handle (full close), open `masi-<userId>.db` with `openConfiguredConnections`, check or write the owner marker (ruling 4), reset `in_flight` outbox rows to `pending` for the whole file (`resetInFlight()` with no owner), run the startup repairs with this handle as `database`, register the writer's actor (ruling 3), **re-check the generation**, then publish. A superseded open closes its connections and resolves `null`. Any failure closes whatever opened, publishes nothing, and rejects.
  - `requestClose({ reason }) → Promise<void>`: bumps the generation at call time (so an in-progress open will not publish), waits for the in-progress transition, then runs the close sequence on the current handle, if any.
  - `getCurrentHandle() → Handle | null`; `requireCurrentHandle() → Handle` (throws `NoSignedInEAError`); `subscribeToHandle(listener) → unsubscribe`.
  - `setLatestAuthSession(session | null)`, `getLatestAuthSession()`.
  - `registerConnectionActor(connection, userId)`, `getConnectionActor(connection) → string | null`.
  - `Handle` = `{ userId, epoch, state: 'open' | 'closed', fileName, getReader(), withTransaction(task), withDatabaseAccess(task), isOpen(), isCurrent(), enqueueRequest(task), requestQueue, abortSignal, onClose(listener) }`. `epoch` comes from a process-wide counter advanced by every publish and every close.
- Produces (`src/db/client.js`): `DATABASE_FILE_PREFIX = 'masi-'`, `LEGACY_DATABASE_NAME = 'masi.db'`, `databaseNameForUser(userId) → 'masi-<userId>.db'` (throws unless `userId` matches `/^[0-9a-f-]{36}$/i`), `openConfiguredConnections({ name, openDatabase }) → { writer, reader }` (the existing PRAGMA → migrate → foreign-keys-on → reader sequence, with its early-registration and failure-disposal comments).
- Produces (`repositoryRuntime.js`): `isSignedInHandle(value)`; `resolveDatabase(database)` → `database.getReader()` for a handle; `runRepositoryTransaction(database, task)` → `database.withTransaction(task)` for a handle. The raw-database (test) and no-database (legacy, until Task 5) branches are unchanged in this task.
- Produces (`test-support/actorTestUtils.js`): `TEST_ACTOR_ID = '00000000-0000-4000-8000-0000000000aa'`, `bindTestActor(db, userId)`, `openTestHandle({ userId, openDatabase })`, `createPathDatabaseOpener(dir)` (maps a name to a better-sqlite3 file in `dir`; writer and reader of one name share the file). Extend `test-support/betterSqliteAdapter.js` with a path-based constructor if it has none; do not write a second adapter.

Transaction doors (spec §5.4) in `Handle.withTransaction`: admission refuses with `StaleActorError` when the handle is not open; the task runs on the handle's own serial write queue; immediately before `COMMIT`, a closed handle triggers `ROLLBACK` and `StaleActorError`; a failed `ROLLBACK` marks the connections unusable and the next transaction reopens them for the same file. Keep `client.js`'s non-re-entrant contract comment with the code.

Close sequence (spec §4.3, rulings 7–8): `state = 'closed'`, epoch advances, current handle becomes `null`, subscribers notified → `abortController.abort()` → wait up to `5_000` ms for the write queue's tail → write `local_state('last_active_at', <ISO now>)` directly on the writer (skipped, with a log line, if the drain timed out) → close reader, then writer → `onClose` listeners.

- [ ] **Step 1: Write the failing unit tests** (`__tests__/signedInHandle.test.js`, better-sqlite3 files under a temp directory through `createPathDatabaseOpener`). Use a `deferred()` helper and **explicit barriers**: a test that needs "a transaction has begun" waits on a promise resolved inside the transaction task, never on `setTimeout(0)`.

```js
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  requestOpen, requestClose, getCurrentHandle, requireCurrentHandle, getConnectionActor,
} from '../src/session/signedInHandle';
import { StaleActorError, NoSignedInEAError, FileOwnerMismatchError } from '../src/session/staleActor';
import { databaseNameForUser } from '../src/db/client';
import { createPathDatabaseOpener } from '../test-support/actorTestUtils';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const deferred = () => { let resolve; let reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

let dir;
let openDatabase;
let opened;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-handle-'));
  opened = [];
  const base = createPathDatabaseOpener(dir);
  openDatabase = async (name, options) => { opened.push(name); return base(name, options); };
});
afterEach(async () => { await requestClose({ reason: 'test' }); });

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

test('the writer is registered with the EA as its actor', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  await a.withTransaction(async (txn) => { expect(getConnectionActor(txn)).toBe(A); });
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

test('ruling 8: a transaction that never settles cannot hold the close for more than the bound', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  try {
    const a = await requestOpen({ userId: A, openDatabase });
    const begun = deferred();
    const write = a.withTransaction(async (txn) => {
      await txn.runAsync("insert into local_state (key, value, updated_at) values ('hung', '1', 'now')");
      begun.resolve();
      await new Promise(() => {});
    });
    write.catch(() => {});
    await begun.promise;
    const closing = requestClose({ reason: 'test' });
    await jest.advanceTimersByTimeAsync(5_000);
    await closing;
    expect(a.state).toBe('closed');
  } finally {
    jest.useRealTimers();
  }
  const again = await requestOpen({ userId: A, openDatabase });
  const reader = await again.getReader();
  expect(await reader.getFirstAsync("select value from local_state where key = 'hung'")).toBeNull();
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

test('Review focus 2: sign-out during A\'s open means A is never published', async () => {
  const gate = deferred();
  const slow = async (name, options) => { const db = await openDatabase(name, options); await gate.promise; return db; };
  const opening = requestOpen({ userId: A, openDatabase: slow });
  const closing = requestClose({ reason: 'test' });
  gate.resolve();
  expect(await opening).toBeNull();
  await closing;
  expect(getCurrentHandle()).toBeNull();
});

test('Review focus 2: overlapping A then B opens publish B, never A after B', async () => {
  const gate = deferred();
  const slow = async (name, options) => { const db = await openDatabase(name, options); if (name.includes(A)) await gate.promise; return db; };
  const openingA = requestOpen({ userId: A, openDatabase: slow });
  const openingB = requestOpen({ userId: B, openDatabase: slow });
  gate.resolve();
  expect(await openingA).toBeNull();
  const b = await openingB;
  expect(getCurrentHandle()).toBe(b);
});

test('Review focus 2: a duplicate same-user open joins the current handle', async () => {
  const [first, second] = await Promise.all([
    requestOpen({ userId: A, openDatabase }),
    requestOpen({ userId: A, openDatabase }),
  ]);
  expect(second).toBe(first);
  expect(opened.filter((name) => name === `masi-${A}.db`).length).toBe(2); // one writer + one reader
});

test('Review focus 2: A reopening while A\'s close drains waits for the drain, then gets a new epoch', async () => {
  const a = await requestOpen({ userId: A, openDatabase });
  const begun = deferred();
  const release = deferred();
  const write = a.withTransaction(async () => { begun.resolve(); await release.promise; });
  write.catch(() => {});
  await begun.promise;
  const closing = requestClose({ reason: 'test' });
  const reopening = requestOpen({ userId: A, openDatabase });
  let reopened = null;
  reopening.then((handle) => { reopened = handle; });
  await Promise.resolve();
  expect(reopened).toBeNull();
  release.resolve();
  await closing;
  const second = await reopening;
  expect(second.epoch).toBeGreaterThan(a.epoch);
  expect(a.isCurrent()).toBe(false);
});
```

- [ ] **Step 2: Write the failing integration test** (`__tests__/integration/signedInHandleFiles.integration.js`, real engine, added to `jest.integration.config.js` `testMatch`). Through the real engine: open A, create a child through a repository bound to A's handle (`createChildrenRepository({ database: a })`), close, open B and read children through B's bound repository (none), close B, reopen A and read the child and its unsent outbox row. Assert that the engine never opened `masi.db`, that both connections of each closed handle report closed (`isOpen` false on the adapter), and that no application code deleted A's file (it exists after B signs in). Do **not** assert that `-wal`/`-shm` files survive: a clean close checkpoints and removes them ([SQLite WAL](https://www.sqlite.org/wal.html)); the durable property is that committed rows and unsent work survive reopening.

- [ ] **Step 3: Run both to verify failure.** `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/signedInHandle.test.js`; `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest --config jest.integration.config.js --listTests | grep signedInHandleFiles` (must list it) and `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --silent`. Expected: FAIL, module not found.

- [ ] **Step 4: Implement** as specified.

- [ ] **Step 5: Run** the new suites, then the full unit and integration suites. Expected: all pass, with the legacy path untouched.

- [ ] **Step 6: Leave uncommitted; report.** Controller commits as `feat(session): add the signed-in EA handle and its lifecycle coordinator`.

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
import { requestOpen, requestClose, setLatestAuthSession } from '../src/session/signedInHandle';
import { isStaleActorError } from '../src/session/staleActor';
// openDatabase helper as in Task 2's test file (use createPathDatabaseOpener from test-support/actorTestUtils.js).

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
  const a = await requestOpen({ userId: A, openDatabase, fetchImpl: transport });
  const task = a.enqueueRequest(async () => {
    await a.dataClient.from('child_class_memberships').select('id').eq('child_id', 'c1');
    await a.dataClient.from('child_class_memberships').update({ unassigned_at: 'now' }).eq('id', 'm1');
    return a.dataClient.from('child_class_memberships').upsert({ id: 'm2' });
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await requestClose({ reason: 'test' });
  setLatestAuthSession(session(B, 'token-B'));
  await requestOpen({ userId: B, openDatabase, fetchImpl: transport });
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
- [ ] **Step 3: Implement** as specified. `requestOpen` accepts `fetchImpl` and `timeoutMs` for tests (Task 2 already threads them); production uses the global `fetch` and the project URL and key from `src/services/supabaseClient.js` (export `supabaseUrl` and `supabaseAnonKey` from there).
- [ ] **Step 4: Run** the new suite and the full unit suite. Expected: pass.
- [ ] **Step 5: Leave uncommitted; report.** Controller commits as `feat(session): fence every data request at send time`.

---

### Task 4: Handle-bound services: repositories, sync engine, pulls, barriers, history state

Additive: the module-level `defaultEngine`, `syncAll`, `ensureReferenceData`, and `enqueueSupabaseRequest` keep working until Task 5.

**Files:**
- Create: `src/session/handleServices.js`
- Modify: `src/session/signedInHandle.js` (build `handle.services` at open, before publish), `src/services/offlineSync.js` (whole-pass stale rule, ruling 9; `pullReferenceData`/`ensureReferenceData`/`fetchAndCacheSchools` accept `{ supabaseClient, enqueueRequest, repositories, barrier }`), `src/services/preloadedChildData.js`, `src/services/sessionHistoryPull.js` (`actorGeneration`/`inFlight` passed in as a per-handle state object), `src/services/sessionHistoryStatus.js` (`createSessionHistoryStore()`; the module-level store stays as the legacy default until Task 5), `src/services/observability.js` (`reportedSyncIssueKeys`/`operationalErrorTimes` keys include the user id), `src/services/startupRepairs.js` (runner accepts `database`), `jest.integration.config.js`
- Test: `__tests__/handleServices.test.js`, `__tests__/integration/accountSwitch.integration.js`

**Interfaces:**
- Produces: `createHandleServices(handle) → { repositories, syncEngine, referenceDataReady(), pullReferenceData(), pullRoster(), pullClasses(), pullLookups(), fetchAndCacheSchools(), sessionHistory: { start({ force }), store }, deviceProfile: { get(), save(profile) } }`, exposed as `handle.services`.
  - `repositories`: every `create*Repository({ database: handle })` used anywhere under `src/` (children, classes, groups, class/group EA assignments, child class memberships, class onboarding, class grouping state, grouping versions, sessions, assessments, mastery, time entries, reference data (schools, job titles, programmes, staff programme assignments, assessment tools, academic years, assessment windows, teachers), sync outbox, sync state, local state). Also exposed as `handle.repositories`.
  - `syncEngine = createOutboxSyncEngine({ database: handle, supabaseClient: handle.dataClient, enqueueRequest: handle.enqueueRequest, outboxRepository: repositories.syncOutbox, stateRepository: repositories.syncState, getAuthSession: async () => { const s = getLatestAuthSession(); return { data: { session: s?.user?.id === handle.userId ? s : null } }; } })`.
  - `referenceDataReady()`: a single-flight promise per handle (spec §5.1a). `pullRoster`, `pullClasses`, and `sessionHistory.start` await it before persisting.
- Engine (ruling 9): `processRecord`, `processBatch`, `processBatchFallback`, the per-record outer `catch` in `syncAll`, and the `finally` that calls `updateSyncMeta` all check `isStaleActorError`. On a stale refusal: no finalization of any record, no batch fallback, no `updateSyncMeta`, and `syncAll` resolves `{ success: false, abortedStaleActor: true, totalSynced, … }` without calling observability.

- [ ] **Step 1: Write the failing tests**
  - **T3 (live defect 2):** A's handle starts a pass whose server call is paused at the fake transport; `requestClose`; `requestOpen` B; release the transport. The transport receives nothing after the close; `syncAll` resolves `abortedStaleActor`; reopening A shows the row `pending` with `retry_count` and `next_retry_at` unchanged and no `last_sync_attempt_at`/meta write from the aborted pass.
  - **T5:** sign-out during an in-flight upload aborts it at once (the transport saw the abort signal); A reopens; the row is `pending`; the next pass sends it once; repeating an already-landed UPDATE, upsert, or lifecycle archive leaves the fake server row unchanged. The test name and a comment state that this proves idempotent replay only (ruling 11).
  - **T15:** switch with A's barrier fulfilled, and again with it pending; B's file empty; B's reference requests delayed, then failing: B's roster and history pulls do not persist before B's own `referenceDataReady()` resolves and never observe A's.
  - **T19:** A's upload never resolves; `requestClose`; `requestOpen` B: B's reference pull and first upload reach the transport within 1 s, and A's request saw an abort.
  - **Review focus 4 (integration, real engine, registered in `testMatch`):** A creates a child offline and closes with the upload unsent; B opens and creates a child; A reopens: B's file has only B's child; A's child uploads exactly once after A returns.
  - **Whole-pass rule:** a pass where the first record is refused stale and a second record is ready: the second is never sent, and neither row's status changes.
- [ ] **Step 2: Run to verify failure** (unit and integration; confirm `--listTests` includes the new suite).
- [ ] **Step 3: Implement.** Step 4: run the new suites, then full unit and integration.
- [ ] **Step 5: Leave uncommitted; report.** Controller commits as `feat(session): build sync and pulls per signed-in EA`.

---

### Task 5: Cutover: remount by key, bind every consumer, remove the legacy entry points

One task, because removing the legacy entry points and migrating their consumers cannot be split without a red suite.

**Files:**
- Create: `src/context/SignedInEAContext.js`, `src/components/bootstrap/HandleOpenError.js` (the failure UI extracted from `DatabaseBootstrapGate`)
- Modify:
  - `App.js`, `src/context/AuthContext.js`, `src/components/bootstrap/DatabaseBootstrapGate.js`, `src/navigation/AppNavigator.js`
  - Contexts: `OfflineContext.js`, `ChildrenContext.js`, `ClassesContext.js`, `LookupsContext.js`, `TimeTrackingContext.js`
  - Screens, components, hooks: `src/components/assessment/LetterMasteryPanel.js`, `src/components/children/GroupPickerBottomSheet.js`, `src/hooks/useAssessmentSession.js`, `src/screens/assessments/AssessmentChildSelectScreen.js`, `AssessmentHistoryScreen.js`, `ChildResultsScreen.js`, `src/screens/insights/AssessmentRankingScreen.js`, `LetterMasteryRankingScreen.js`, `SessionCountRankingScreen.js`, `src/screens/main/AssessmentsScreen.js`, `ChildrenListScreen.js`, `HomeScreen.js`, `SessionsScreen.js`, `TimeEntriesListScreen.js`, `SyncStatusScreen.js`, `ProfileScreen.js`, `src/screens/sessions/SessionHistoryScreen.js`, and any other file the static test finds
  - Services and utils: `activeProgrammeGate.js`, `deviceSettings.js` (ruling 10), `literacySessionPersistence.js`, `sessionsTodayGoal.js`, `src/utils/masteryState.js`, `src/utils/timeEntryStatus.js` take a `handle` or `repositories` argument
  - `src/services/offlineSync.js` (delete `defaultEngine` and its five module-level wrappers, the module-level reference barrier), `src/services/sessionHistoryStatus.js` (the hook reads the current handle's store), `src/db/client.js` (delete the module-level connections, `initializeDatabase`, `getDatabase`, `getWriter`, `withDatabaseAccess`, `withTransaction`, `resetDatabaseConnectionForTests`, `DATABASE_NAME`), `src/db/repositories/repositoryRuntime.js` (ambient branch → `requireCurrentHandle()`), `src/db/migrations.js` (delete `appMigrationQueue` and the no-argument branch), `src/db/debugDump.js` (export reads through the current handle's reader)
  - Delete: `src/services/supabaseRequestQueue.js`
  - Test harness: `jest.setup.js` and `jest.integration.setup.js` replace `resetDatabaseConnectionForTests` with opening a handle for `TEST_ACTOR_ID` before each test and `requestClose` after it; every test that imported the deleted APIs
- Test: `__tests__/signedInTree.test.js`, `__tests__/staleUserAction.test.js`, `__tests__/productionBindingStatic.test.js`, updates to `__tests__/App.plan5.test.js` and `SyncStatusScreen` tests

**Interfaces:**
- `AuthContext`:
  - Calls `setLatestAuthSession(nextSession ?? null)` first thing for **every** auth event, before any early return (so `TOKEN_REFRESHED` reaches the handle).
  - After a fresh sign-in or an offline restore, calls `requestOpen({ userId })`; exposes `{ handle, handleStatus: 'opening' | 'open' | 'failed' | 'signed_out', handleError, retryOpenHandle }` driven by `subscribeToHandle` and the request's result.
  - `signOut` and every server-ended sign-out path (`SIGNED_OUT`, grace timeout) call `await requestClose({ reason })` before clearing auth state. `deviceSettings.clearUserProfile()` is no longer called at sign-out (ruling 10). Plan 3 adds the questions in front of this.
  - `loadUserProfile` and the startup reference pull move into `SignedInEAProvider`; the profile request uses `handle.enqueueRequest` and `handle.dataClient`, and the cache uses `handle.services.deviceProfile`.
- `App.js`, inside `PaperProvider` and `DatabaseBootstrapGate`:

```jsx
<AuthProvider>
  <AppRoot />
</AuthProvider>

// AppRoot
const { user, handle, handleStatus, handleError, retryOpenHandle } = useAuth();
if (handleStatus === 'failed') return <HandleOpenError error={handleError} onRetry={retryOpenHandle} />;
if (user && !handle) return <LoadingScreen />;
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

  `LoadingScreen` is the existing loading UI, never an empty state.
- `useSignedInEA() → { handle, repositories, services }`; throws outside the provider.
- `DatabaseBootstrapGate` checks that the engine loads (`openDatabaseAsync(':memory:')`, then close) instead of `initializeDatabase()`.
- `OfflineContext` takes the actor from `handle.userId`; its `currentUserIdRef`, its own `onAuthStateChange` subscription, and its startup-repair run are removed (Task 2 runs repairs at open); sync, status, Retry, and the rescue heal use `services.syncEngine`. Run the rescue heal once after the handle opens and again on `TOKEN_REFRESHED`/`SIGNED_IN` for the same user (subscribe through `AuthContext`, not the Supabase client).
- `SyncStatusScreen` Retry calls `services.syncEngine.retryFailedItem(table, id)`.

- [ ] **Step 1: Write the failing tests**
  - **Review focus 1 (finding 1 regression):** render `ClassesProvider` under A's handle; call `addClass` with a reference read that waits on a test-controlled promise; `requestClose`; `requestOpen` B; resolve the read. Neither A's file nor B's has the class; the callback rejects with `StaleActorError`. Repeat for `GroupPickerBottomSheet`'s remove-then-add chain, pausing between the two writes.
  - **T1:** render `App` with a mocked auth client; signed out: login screen, zero `openDatabase` calls. Sign in as A: `masi-A.db` opens. Sign out, sign in as B: `masi-B.db` opens.
  - **T2:** offline restore of a persisted session for A (NetInfo offline, no auth session): the loading screen renders, then A's children; the "no children" empty state never renders in between; sync is skipped without errors.
  - **T14:** after a key change, every timer, interval, AppState and NetInfo listener from A's tree has been removed (counts return to the signed-out baseline).
  - **Opening fails:** `requestOpen` rejects: `HandleOpenError` with Retry renders; Retry calls it again.
  - **Review focus 5:** Sync Status → Retry on a failed row sets it `pending` through A's bound engine (assert the row in A's file).
  - **Static binding test (ruling 1):** every `.js` file under `src/` outside `src/db/` and `src/session/`: no import of a repository singleton (any export of `src/db/repositories/*` whose name ends in `Repository` and is not a `create*` factory), no `resolveDatabase(`/`runRepositoryTransaction(` call, no import of `src/db/client`'s connection functions, no import of `supabaseRequestQueue`. Show the failure with a temp file, then remove it.
- [ ] **Step 2: Run to verify failure.** Step 3: implement. Step 4: run the new tests, full unit, full integration (with `--listTests` checked).
- [ ] **Step 5: Leave uncommitted; report** (list every consumer migrated and every test changed, with reasons). Controller commits as `feat(app): bind every consumer to the signed-in EA handle`.

---

### Task 6: The outbox owner is the EA who made the change

**Files:**
- Modify: `src/db/repositories/domainRepositoryUtils.js` (`enqueueDomainOutbox`, `enqueueLifecycleOutbox`), `src/db/repositories/syncOutboxRepository.js` (`enqueue`, `insertOutboxRecord`, `getReadyRecords`, `getPendingHardDeleteIds`, `resetInFlight`, `getSyncStatus`, new `countUnsent`), `src/db/migrations.js` (migration 11), the assessments, sessions, and letter-mastery repositories (remove explicit `ownerUserId: record.user_id`), `jest.setup.js`/`jest.integration.setup.js` (the default test handle's actor is `TEST_ACTOR_ID`), every test that passes `ownerUserId`/`ownerRow` or relies on `created_by` owner resolution
- Test: `__tests__/outboxOwnerStamping.test.js`

**Interfaces:**
- `enqueueDomainOutbox(db, tableName, recordId, operation, payload, { outboxId })` (no owner options); `insertOutboxRecord` throws `Error('sync_outbox.owner_user_id is required')` when `getConnectionActor(db)` is null; `getReadyRecords({ ownerUserId })`, `getPendingHardDeleteIds({ ownerUserId })`, `resetInFlight({ ownerUserId })` use `owner_user_id = ?` with no null wildcard (file-wide when `ownerUserId` is omitted); `getSyncStatus()` counts file-wide; `countUnsent() → { total, byTable }` over `pending|failed|in_flight|terminal` (spec §7.2).
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
  - **T6:** with `bindTestActor(db, EA)`, an EA's `updateChild` on a Head Office-created child (`created_by = HEAD_OFFICE`, active `child_ea_assignments` for EA) queues an outbox row owned by EA; `getReadyRecords({ ownerUserId: EA })` returns it; a pass with Plan 1's fake server sends `update … eq('id') … select('id')` without `created_by`.
  - **T7:** with no actor bound, `enqueueDomainOutbox` rejects with `owner_user_id is required`; a raw insert into `sync_outbox` with a null owner is aborted by the trigger.
  - **File-wide counts:** rows owned by EA and by another user both count in `getSyncStatus()` and `countUnsent()`.
- [ ] **Step 2: Run to verify failure.** Step 3: implement (remove the `resolvePrimaryOwner` import; keep `outboxOwnership.js` until Task 7). Step 4: migrate existing tests: tests that asserted `owner_user_id = created_by` for a Head Office row encoded the defect and now assert the actor; say so in the report. Run new, full unit, integration.
- [ ] **Step 5: Leave uncommitted; report.** Controller commits as `fix(sync): stamp the outbox owner from the signed-in EA`.

---

### Task 7: Integrity scan and owner-based rescue heal

**Files:**
- Modify: `src/db/repositories/syncOutboxRepository.js` (`quarantineForeignOwners({ fileUserId, transaction }) → { total, byTable }`), `src/services/offlineSync.js` (`syncAll` runs the scan before `resetInFlight`; `requeueTerminalRlsFailures` compares `record.owner_user_id === userId` and never requeues `foreign_owner`), `src/session/signedInHandle.js` (scan at open, before publish)
- Delete: `src/db/repositories/outboxOwnership.js` and its tests
- Test: `__tests__/outboxIntegrityScan.test.js`

**Interfaces:**
- `quarantineForeignOwners` moves every `pending|failed|in_flight` row with `owner_user_id <> fileUserId` to `terminal` with `last_error = 'foreign_owner'`, sets the matching domain row's `sync_status = 'terminal'`, and labels already-terminal foreign rows `foreign_owner`. After a non-empty scan: `local_state('integrity_scan_last', JSON.stringify({ at, total, byTable }))`, one `console.error`, and `captureOperationalError(new Error('foreign_owner_in_file'), { category: 'foreign_owner_in_file', context: { byTable } })` (ruling 5).

- [ ] **Step 1: Write the failing tests** (T8, T9): a foreign row in A's file becomes `terminal`/`foreign_owner` at open, is still counted by `countUnsent`, and is recorded in `integrity_scan_last`; a foreign row inserted into an open file is quarantined before the next pass and never reaches the transport; the rescue heal leaves it terminal; a Head Office-created child edited by A and quarantined by an unmarked 42501 is requeued by `requeueTerminalRlsFailures(A)` because `owner_user_id === A`.
- [ ] **Step 2: Run to verify failure.** Step 3: implement. Step 4: run new, full unit, integration.
- [ ] **Step 5: Leave uncommitted; report.** Controller commits as `feat(sync): quarantine foreign-owned outbox rows and heal by stamped owner`.

---

### Task 8: Module-state allowlist, shared-client static test, and documentation

**Files:**
- Create: `__tests__/moduleStateAllowlist.test.js`, `__tests__/sharedClientStatic.test.js`, `docs/adr/0007-one-local-database-per-ea.md`
- Modify: `documentation/rls-sync-contract-map.md`, `CONTEXT.md`, `documentation/ROADMAP.md`, `documentation/build-log.md`, `documentation/LEARNING.md`, `AGENTS.md`

- [ ] **Step 1: T16.** The test reads every `.js` file under `src/services`, `src/db`, and `src/session`, finds top-level `let`/`var` and top-level `const x = new Map(`/`new Set(`/`new WeakMap(`, and fails for any not listed in its allowlist mapping `"<file>:<name>"` to a treatment string from spec §5.1a. Expected entries: `src/services/observability.js` `initialized`, `enabled`, `runtimeContext`, `navigationIntegration` ("device-level"), `reportedSyncIssueKeys`, `operationalErrorTimes` ("keys include the actor"); `src/session/signedInHandle.js` coordinator and registry state ("the handle registry"); `src/db/migrations.js` `explicitDatabaseMigrationQueues` ("per connection"). Show the failure with a temp file, then remove it.
- [ ] **Step 2: T20.** No `.from(` or `.rpc(` on the shared client exported by `src/services/supabaseClient.js` anywhere under `src/`; only `supabase.auth.*` is allowed, and only in `src/services/supabaseClient.js`, `src/services/persistedAuthSession.js`, and `src/context/AuthContext.js`.
- [ ] **Step 3: Docs.**
  - Contract map: the owner rule (connection actor, trigger, no null wildcard), the transaction doors and bounded drain, the per-handle client and queue, `StaleActorError` versus `AuthUnavailableError`, the whole-pass stale rule, the integrity scan, and ruling 11's release prerequisite.
  - `CONTEXT.md`: "Signed-in EA handle", "Unsent", "Left-behind work" (spec §3 wording).
  - ROADMAP priority 5 and §0 "Build one local database per EA": what Plan 2 delivered, what waits for Plan 3, and **ruling 11 as a field-release prerequisite** owned by the upload-contract spec.
  - build-log: Verification row (commands, counts) and Decision rows for rulings 1–11.
  - LEARNING: "Why the fence sits on each request, and the binding on each tree" (the postgrest-js codeless-error trap, the stale-task boundary, and the `addClass` continuation that remounting did not cancel).
  - ADR 0007 (ruling 6). AGENTS.md "Offline Sync Strategy": production code reaches SQLite only through a handle-bound repository.
- [ ] **Step 4: Run** full unit and integration. **Step 5: Leave uncommitted; report.** Controller commits as `docs: record the signed-in EA handle contract`.

---

## Self-review

- **Spec coverage:** §4.1–§4.3 Task 2; §4.4 discovery and §4.5's incident are Plan 3; §4.5 "never opened" Tasks 2 and 5; §5.1 Task 5; §5.1a Tasks 2, 4, 5, 8; §5.2 Task 3 (ruling 2); §5.3 Tasks 1, 4; §5.4 Task 2 (ruling 8); §5.5 Tasks 2–4 (ruling 11); §6.1–§6.2 Task 6; §6.3 Task 7 (ruling 5); §6.4 Task 7. Tests: T1 Tasks 2, 5; T2 Task 5; T3 Task 4; T4 Task 2; T5 Task 4; T6, T7 Task 6; T8, T9 Task 7; T10 Task 2; T11 Task 2 (incident in Plan 3); T14 Task 5; T15 Task 4; T16 Task 8; T18 Task 3; T19 Task 4; T20 Task 8; T23 Task 3.
- **Intermediate states:** Tasks 1–4 are additive; Task 5 is the single cutover; Tasks 6–8 build on the bound runtime. Every task ends with green unit and integration suites.
- **Out of this plan:** §7 (Plan 3), device checks D1–D6 (after Plan 3, on the build intended to ship), S2/S3 (Plan 3), uncertain-outcome ordering (upload-contract spec, ruling 11).

## Review history

- **Codex adversarial review of revision 1 (2026-10-14), needs-attention, all findings verified and adopted:**
  1. (high) Ambient current-handle resolution let a stale user action (`ClassesContext.addClass`) write into the next EA's file with the wrong owner; Codex reproduced it. → Ruling 1 rewritten: no ambient database in production; static test; regression in Task 5.
  2. (high) Opens and closes had no concurrency contract. → Ruling 7 and the coordinator tests in Task 2.
  3. (high) Identical replay does not prove a late older commit cannot overwrite a newer one. → Ruling 11; T5 narrowed; release prerequisite in Task 8.
  4. (high) Task order deleted APIs before migrating consumers; `SyncStatusScreen` Retry was missing. → Tasks 2–4 additive, Task 5 the single cutover including `SyncStatusScreen`.
  5. (medium) Root jest setup files and the integration `testMatch` allowlist were missed. → Global Constraints and Tasks 2, 4, 5.
  6. (medium) Asserting surviving WAL sidecars contradicts clean shutdown. → Task 2's integration test asserts durable rows and closed connections instead.
  Also adopted from Codex's next steps: explicit barriers in T4 (Task 2) and the whole-pass stale rule (ruling 9). Found while revising: `deviceSettings` keeps the profile cache and capture mode in SQLite (ruling 10), and close needs a bounded drain (ruling 8).
