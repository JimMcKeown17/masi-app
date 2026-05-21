# Plan 4 Review Brief — 2026-05-21

This brief captures findings from the Plan 4 review pass. Three issues are **critical** (would cause real data loss, silent sync stalls, or lost user writes in field use) and must land as TDD-shaped corrective work before Plan 5 starts. Six smaller code-smell and gap items follow.

The Plan 4 implementation (commit `78ea21a`) is architecturally sound — the outbox model, dependency-ordered push, error classification, atomic finalization, and `OfflineContext` shared-promise pattern are all well-designed. The full suite is green at 33 suites / 156 tests. But three classes of bug live in seams that automated tests rarely catch by themselves: producer-side gaps (where the outbox row that the engine expects is never created), crash-state recovery (where rows are left in transient states across process boundaries), and concurrent-actor races (where two transactions touching the same outbox row interleave in destructive ways). All three exist here.

Treat this as the same kind of brief as Plan 1, 2, and 3 review findings — write a failing test first, implement the smallest fix, log decisions/bugs/verifications in `documentation/sqlite-refactor-log.md`, request another parallel review pass, then ask for user signoff before Plan 5.

---

## Critical Issue 1 — Time entries are never enqueued for sync

### Problem

`src/db/repositories/timeEntriesRepository.js:53-91` writes the `time_entries` domain row but does not enqueue a corresponding `sync_outbox` row. Every other domain repository — `classesRepository`, `childrenRepository`, `groupsRepository`, `sessionsRepository`, `assessmentsRepository`, `masteryRepository`, `classEaAssignmentsRepository`, `groupEaAssignmentsRepository`, `childClassMembershipsRepository`, `groupingVersionsRepository` — calls `enqueueDomainOutbox` from inside its write transaction. Only `time_entries` is missing.

Trace the real-app flow:

```
useTimeTracking.js:159   storage.saveTimeEntry(entry)
storage.js:304-307       savePayload('time_entries', entry.id, entry)  ← local_state sidecar only
                         timeEntriesRepository.saveTimeEntry(entry)    ← writes domain row, no outbox
```

`savePayload` writes the legacy view-model into the `local_state` table (the Plan 3 compatibility sidecar). It does not touch `sync_outbox`. `timeEntriesRepository.saveTimeEntry` does an `upsertRecord` against the `time_entries` table and returns. Neither call enqueues anything for the sync engine.

### Why this matters

`PUSH_ORDER[0] === 'time_entries'`. The engine puts time entries first in dependency order precisely because field staff clock-in/clock-out is the most time-sensitive data Masi collects. But the engine's `getReadyRecords()` reads exclusively from `sync_outbox` (`syncOutboxRepository.js:69-80`). If a row never lands in the outbox, the engine cannot see it.

Net effect: **every clock-in and clock-out a field worker makes after the SQLite cutover stays forever local.** They will accumulate as `sync_status='pending'` rows in the local `time_entries` table, be visible in the app's time-entry list, count toward `getDaysWorkedThisMonth`, and never reach Supabase. There is no error, no failed-item visibility, no retry — the data is simply outside the sync engine's universe.

The old AsyncStorage sync path scanned `getUnsyncedRecords('TIME_ENTRIES')` (the `sync_status != 'synced'` scan that Plan 4 deliberately abandoned). The Plan 4 engine replaced that scan with outbox processing but the corresponding write-side enqueue was never added for time entries.

### Why this matters more than it sounds

Time entries are also the simplest table in the schema: no FKs to children/classes/programmes, no archive semantics, no relationship rows. They should be the easiest thing to sync. The fact that the repository skipped enqueue suggests this was an oversight during Plan 3, not an active design decision. It's worth confirming this was not deliberate (e.g., "time_entries syncs through a separate path") before fixing — but every signal in the code says it's simply missing.

### Why the tests didn't catch it

`__tests__/offlineSyncOutbox.test.js:222-228` seeds the outbox row directly:

```javascript
await enqueue(db, 'time_entries', 'time-1', 'insert', {
  id: 'time-1', user_id: 'user-1', sign_in_time: '2026-05-21T08:00:00.000Z', ...
});
```

This pre-bootstraps what real-app flow would have to produce. The test verifies the engine handles time_entries when an outbox row exists, but it does not verify that the repository produces one. No test exercises `timeEntriesRepository.saveTimeEntry → syncAll → server upsert` end-to-end. The producer side is unverified.

This is a textbook example of why integration tests that start from the **public domain surface** (the repository's public method) catch more bugs than tests that start from an internal seam (the outbox row already present). The same pattern bit Plan 3 with the deterministic relationship IDs — tests asserted the engine processed the rows correctly, but didn't assert the repository created them correctly.

### Fix shape

```javascript
// src/db/repositories/timeEntriesRepository.js

import { enqueueDomainOutbox, shouldEnqueueOutbox } from './domainRepositoryUtils';
import { runRepositoryTransaction } from './repositoryRuntime';

const saveTimeEntry = async (entry, { transaction } = {}) => {
  const runWrite = (txn, task) => (txn ? task(txn) : runRepositoryTransaction(database, task));
  return runWrite(transaction, async (txn) => {
    const record = normalizeForWrite(entry);
    await upsertRecord(txn, {
      tableName: 'time_entries',
      columns: TIME_ENTRY_COLUMNS,
      booleanColumns: ['auto_clocked_out'],
      record,
    });
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'time_entries', entry.id, 'insert', record);
    }
    return true;
  });
};

const updateTimeEntry = async (id, updates, { transaction } = {}) => {
  return runWrite(transaction, async (txn) => {
    const existing = await txn.getFirstAsync('select * from time_entries where id = ?', id);
    if (!existing) return false;
    const next = normalizeForWrite({ ...mapTimeEntry(existing), ...updates, id, ... });
    if (updates.synced === undefined) next.sync_status = existing.sync_status;

    await upsertRecord(txn, { tableName: 'time_entries', columns: TIME_ENTRY_COLUMNS, booleanColumns: ['auto_clocked_out'], record: next });
    if (shouldEnqueueOutbox(next)) {
      await enqueueDomainOutbox(txn, 'time_entries', id, 'update', next);
    }
    return true;
  });
};
```

Critical: both the upsert and the enqueue must be inside the **same** transaction. This is the atomic contract Plan 3 established — a domain write and its outbox enqueue must either both commit or both roll back. Splitting them produces orphans in either direction.

### Failing test contracts (write first)

In `__tests__/timeEntriesRepository.test.js`:

```
test('saveTimeEntry enqueues a sync_outbox insert in the same transaction', async () => {
  await timeEntriesRepository.saveTimeEntry({
    id: 'time-1', user_id: 'user-1',
    sign_in_time: '2026-05-21T08:00:00.000Z',
  });
  const outbox = await db.getFirstAsync('select * from sync_outbox where record_id = ?', 'time-1');
  expect(outbox).toMatchObject({
    table_name: 'time_entries',
    operation: 'insert',
    status: 'pending',
  });
});

test('updateTimeEntry enqueues a sync_outbox update', async () => {
  await timeEntriesRepository.saveTimeEntry({ id: 'time-1', user_id: 'user-1', sign_in_time: '...' });
  await timeEntriesRepository.updateTimeEntry('time-1', { sign_out_time: '2026-05-21T17:00:00.000Z' });
  // Outbox row may have been re-enqueued or remain as 'insert'; either is acceptable. The contract is:
  // there must be an outbox row, and it must have the latest payload.
  const outbox = await db.getFirstAsync('select * from sync_outbox where record_id = ?', 'time-1');
  expect(outbox.status).toBe('pending');
  expect(JSON.parse(outbox.payload).sign_out_time).toBe('2026-05-21T17:00:00.000Z');
});

test('saveTimeEntry with sync_status="synced" does not re-enqueue an outbox row', async () => {
  await timeEntriesRepository.saveTimeEntry({
    id: 'time-1', user_id: 'user-1', sign_in_time: '...', sync_status: 'synced',
  });
  const outbox = await db.getFirstAsync('select * from sync_outbox where record_id = ?', 'time-1');
  expect(outbox).toBeNull();
});
```

In `__tests__/offlineSyncOutbox.test.js` (end-to-end producer→engine):

```
test('saveTimeEntry then syncAll pushes the time entry to the server', async () => {
  await timeEntriesRepository.saveTimeEntry({ id: 'time-1', user_id: 'user-1', sign_in_time: '...' });
  const { supabaseClient, calls } = createSupabaseMock();
  await createOutboxSyncEngine({ database: db, supabaseClient }).syncAll();
  expect(calls).toEqual([
    expect.objectContaining({ type: 'upsert', tableName: 'time_entries', payload: expect.objectContaining({ id: 'time-1' }) }),
  ]);
  expect(await db.getFirstAsync('select sync_status from time_entries where id = ?', 'time-1'))
    .toEqual({ sync_status: 'synced' });
  expect(await db.getFirstAsync('select count(*) as c from sync_outbox')).toEqual({ c: 0 });
});
```

---

## Critical Issue 2 — `in_flight` outbox rows are stuck forever after a crash

### Problem

`src/db/repositories/syncOutboxRepository.js:69-80`:

```javascript
const getReadyRecords = async ({ limit = 50, now = timestamp() } = {}) => {
  const rows = await db.getAllAsync(`
    select * from sync_outbox
    where status in ('pending', 'failed')
      and (next_retry_at is null or next_retry_at <= ?)
    order by created_at, table_name, record_id
    limit ?
  `, now, limit);
  return rows.map(toOutboxRecord);
};
```

`in_flight` is intentionally excluded. This prevents a running sync from picking up records it's currently processing — a sensible same-process protection. But there is no startup-recovery path or syncAll-start cleanup that resets stuck `in_flight` rows back to `pending`.

### Why this matters

`in_flight` is a process-lifetime concept, but the row persists across restarts. Any of these scenarios produces a stuck row:

1. **Hard process termination during the HTTP round-trip.** Between `outboxRepository.markInFlight([outboxRecord.id])` at `offlineSync.js:388` and the next finalize transaction (lines 392/405/415/425), the JS thread is awaiting a network response. If the OS force-kills the app — out-of-memory eviction on Android, watchdog timeout on iOS, the user swipe-killing during slow sync — the row remains marked `in_flight` with no in-memory state to recover it.
2. **iOS aggressive backgrounding.** iOS may suspend then terminate the JS thread when the app backgrounds during a sync. The next foreground launch is a fresh process — `activeSyncPromise.current` is `null`, `getReadyRecords` excludes the stuck row, and no recovery code resets it.
3. **Unhandled error inside `processRecord`.** `processRecord` itself doesn't wrap its body in try/catch (`offlineSync.js:374-433`). If `runServerOperation` or a finalize transaction throws synchronously, the `markInFlight` has already committed but the finalize never runs. The row is stuck.
4. **Crash inside a finalize transaction.** Even with `runRepositoryTransaction` wrapping the finalize, if the inner SQL fails halfway, the txn rolls back — leaving the row at `in_flight` (the `markInFlight` is committed in a separate prior txn).

### Why this is invisible

- `getSyncStatus` (`syncOutboxRepository.js:159-195`) counts `in_flight` separately as `inFlightCount`. It is **not** included in `unsyncedCount`. The user UI shows "0 unsynced" while data is stuck.
- The domain row's `sync_status` was untouched between `markInFlight` and `finalize*`, so it stays at `'pending'` (for fresh writes) or `'failed'` (for retries). The user sees the row's local sync indicator and assumes sync is making progress.
- The sync engine never errors. The outbox simply has no ready rows, so `syncAll` reports success with `totalSynced: 0`.

The only way the row recovers under the current design is if the same user happens to write to the same record again, and that user-write enqueues a re-pending of the same outbox id. Anything that's been written once and not re-touched is invisible forever.

### Why the tests don't catch it

The tests run sync paths end-to-end inside a single Jest process, so no row ever crosses a process boundary in the `in_flight` state. The `failed and terminal rows are visible while in-flight rows do not inflate unsynced count` test (`syncOutboxRepository.test.js:82-138`) deliberately verifies that in-flight rows are excluded from the unsynced count — which is the **correct in-process semantic**, just not the cross-restart one.

### Fix shape

The simplest fix is to reset stuck `in_flight` rows at the **start of every `syncAll` cycle**:

```javascript
// src/services/offlineSync.js, inside createOutboxSyncEngine

const syncAll = async ({ tableName = null } = {}) => {
  const startedAt = Date.now();
  const db = await resolveDatabase(database);

  // Recover from any in_flight rows left by a previous crashed cycle.
  // Safe because OfflineContext serializes syncAll through activeSyncPromise;
  // there is never more than one engine running at a time.
  await db.runAsync(
    `update sync_outbox set status = 'pending', updated_at = ? where status = 'in_flight'`,
    timestamp()
  );

  const readyRecords = sortByPushOrder(await outboxRepository.getReadyRecords({ limit: 1000 }));
  // ... rest unchanged
};
```

This is safe because:

- `OfflineContext.syncNow` enforces single-flight via `activeSyncPromise.current`. The next `syncAll` cannot start until the current one's promise resolves.
- The reset only runs *before* `getReadyRecords`, so any row currently marked `in_flight` is necessarily from a prior cycle that completed or crashed.
- The reset only changes `status` and `updated_at`; it does not touch `retry_count`, `last_error`, or `next_retry_at`, so retry history is preserved.

The alternative — startup recovery in `OfflineContext` initialization — is also fine but adds an extra surface. Cycle-start is simpler.

### A subtle wrinkle: this fix also helps Issue 3

The compare-and-set finalize from Issue 3 below relies on `updated_at` being a reliable "this row was untouched while I had it" marker. Resetting in_flight at cycle-start preserves that property: if a row is in_flight when a new cycle begins (which shouldn't happen post-recovery), the reset bumps its `updated_at`, so any finalize that completes from a prior cycle will naturally CAS-fail and leave the row pending.

### Failing test contract (write first)

```
test('syncAll recovers in_flight rows left from a previous crashed cycle', async () => {
  await db.runAsync(`
    insert into classes (id, school_id, name, grade, sync_status)
    values ('class-1', 'school-1', 'Grade 1A', '1', 'pending')
  `);
  const outbox = createSyncOutboxRepository({ database: db });
  await outbox.enqueue({
    tableName: 'classes',
    recordId: 'class-1',
    operation: 'insert',
    payload: { id: 'class-1', school_id: 'school-1', name: 'Grade 1A', grade: '1' },
  });

  // Simulate the prior cycle: marked in_flight but never finalized.
  await outbox.markInFlight(['classes:class-1:insert']);

  const { supabaseClient, calls } = createSupabaseMock();
  const engine = createOutboxSyncEngine({ database: db, supabaseClient });
  const result = await engine.syncAll();

  // The new cycle recovered the in_flight row and pushed it:
  expect(calls).toEqual([
    expect.objectContaining({ type: 'upsert', tableName: 'classes' }),
  ]);
  expect(result.totalSynced).toBe(1);
  expect(await db.getFirstAsync('select status from sync_outbox where id = ?', 'classes:class-1:insert'))
    .toBeNull();
});
```

---

## Critical Issue 3 — User writes during in-flight sync are silently lost

### Problem

A race exists between `outboxRepository.enqueue` (called by repositories on user writes) and `finalizeSuccess` (called by the sync engine after a server push succeeds). The race window is the duration of the HTTP round-trip in `runServerOperation`, which is the only stretch of the sync cycle that is **not inside a SQLite transaction**.

### The race trace

| T | Sync engine | User-driven repository write |
|---|-------------|------------------------------|
| T1 | `processRecord` calls `markInFlight(['children:child-1:insert'])`. Outbox row status changes from `pending` to `in_flight`, payload still P1. Transaction commits. | — |
| T2 | HTTP upsert to Supabase begins with payload P1. The JS thread is awaiting the network response. **No SQLite lock held.** | — |
| T3 | — | User edits child-1's `preferred_name`. `childrenRepository.updateChild` opens a transaction: writes the children row with new data (P2) and `sync_status='pending'`, then calls `enqueueDomainOutbox(txn, 'children', 'child-1', 'update', P2)`. Inside, `insertOutboxRecord` upserts the existing outbox row by id (`children:child-1:insert`), overwriting payload to P2 and status to `pending`. The post-upsert UPDATE in `enqueue` resets `retry_count=0, last_error=null, next_retry_at=null, status='pending', updated_at=now2`. Transaction commits. |
| T4 | HTTP returns success. `finalizeSuccess` transaction: sets `children.sync_status='synced'` (this overrides the user's `pending` from T3), **deletes the outbox row by id** (which currently holds P2). Transaction commits. | — |

### The result

- Children domain row holds the **new** data P2.
- Children domain row's `sync_status` is **`'synced'`**.
- Outbox row is **deleted**.
- Server has **only P1** — it never received P2.

The user's update is on the device. The local "synced" indicator is green. But the server never got it, and there is no outbox row to retry. **P2 is silently lost from sync forever.** The only way it would resurface is if the same user happened to edit child-1 again — but if they do, they would see "synced" on the field they just changed and may not write again.

### Why the 300ms debounce doesn't save us

`OfflineContext.triggerBackgroundSync` debounces sync triggers by 300ms (`OfflineContext.js:104-107`). This reduces but does not close the race window:

- The HTTP round-trip can easily exceed 300ms on cellular networks, especially in field conditions.
- The user's write transaction at T3 is itself non-blocking from the sync engine's perspective — the engine isn't paused. The 300ms only delays the *next* sync trigger, not the current one's completion.
- The race window is the entire HTTP duration, which under field conditions can be many seconds.

### Why this is invisible

- No error is ever raised. Both transactions commit cleanly.
- `sync_status='synced'` on the local row gives the user a green "synced" indicator.
- `syncAll`'s success count includes P1's "successful" push; the engine has no way to know it was the wrong payload.
- Subsequent syncs find nothing to push for this row (no outbox row).
- The only way the user discovers the loss is by checking the server-side data directly or noticing on a different device.

### Why the tests don't catch it

The tests run sync sequentially with no concurrent user writes. The repository tests don't exercise re-enqueue against an `in_flight` row. The integration tests don't simulate two transaction sources mid-sync.

This is a classic concurrency bug — it requires a multi-actor scenario, and automated tests rarely express those unless explicitly written.

### Fix shape — compare-and-set on the outbox row

The minimal correct fix: capture `outboxRecord.updated_at` before pushing, and only DELETE the row in `finalizeSuccess` if `updated_at` still matches. If the user dirtied the row during the in-flight window, `updated_at` has advanced — the CAS DELETE matches zero rows, and we instead leave the row in `pending` state for the next sync cycle.

```javascript
// src/services/offlineSync.js

const finalizeSuccess = async ({
  database,
  outboxRecord,
  tableName,
  outboxRepository,
}) => runRepositoryTransaction(database, async (txn) => {
  // CAS: only delete if the outbox row is still the one we pushed.
  const { changes } = await txn.runAsync(
    'delete from sync_outbox where id = ? and updated_at = ?',
    outboxRecord.id, outboxRecord.updated_at
  );

  if (changes > 0) {
    // The row was not touched during the in-flight window. Mark domain row synced.
    if (outboxRecord.operation !== 'hard_delete') {
      await setDomainSyncResult(txn, tableName, outboxRecord.record_id, {
        syncStatus: 'synced',
        lastSyncError: null,
      });
    }
  } else {
    // A user write re-enqueued this id during the in-flight window. The outbox
    // row now holds NEW data we never pushed. Leave it pending; the next sync
    // cycle will pick it up. Do NOT mark the domain row synced — the new data
    // is unsynced.
    await txn.runAsync(
      `update sync_outbox
       set status = 'pending', next_retry_at = null, updated_at = ?
       where id = ?`,
      timestamp(), outboxRecord.id
    );
    if (outboxRecord.operation !== 'hard_delete') {
      await setDomainSyncResult(txn, tableName, outboxRecord.record_id, {
        syncStatus: 'pending',
        lastSyncError: null,
      });
    }
  }
});
```

The same CAS pattern applies to `finalizeRetriableFailure` and `finalizeTerminalFailure` for completeness, but the safety property matters most for `finalizeSuccess` (which is the destructive path). For the failure paths, a user write during in-flight is actually a useful signal — the new write deserves a fresh retry budget anyway, and the failure status is stale. You can either:

- Apply the same CAS pattern to failure paths (skip the status update if `updated_at` changed; the next cycle will handle the new data).
- Or accept that retry/terminal updates may be overwritten by user writes (which is what happens today and is fine).

### Why CAS is the right pattern here

The alternative designs all have trade-offs:

- **Refuse to enqueue while in_flight.** Breaks idempotency — the user's write would need a retry mechanism in the repository layer, which leaks sync concerns into write code.
- **Use a sequence number per outbox row.** Adds a column and bookkeeping. Equivalent semantics to CAS-on-updated_at but more code.
- **Lock the outbox row in `markInFlight`.** SQLite does not support row-level locks — only transaction-level. A long-held transaction across the HTTP call would block all other writes for the duration of the network request, which is the opposite of what offline-first wants.

CAS on `updated_at` is the minimal change that preserves the existing transaction shape, requires no schema migration, and naturally encodes "was this row touched while I had it?"

### Failing test contract (write first)

```
test('finalizeSuccess does not delete an outbox row re-pending\'d during the in-flight window', async () => {
  // Seed: row in_flight with payload P1
  await db.runAsync(`
    insert into children (id, first_name, last_name, sync_status)
    values ('child-1', 'Old', 'Surname', 'pending')
  `);
  const outbox = createSyncOutboxRepository({ database: db });
  await outbox.enqueue({
    tableName: 'children',
    recordId: 'child-1',
    operation: 'insert',
    payload: { id: 'child-1', first_name: 'Old' },
  });

  // Capture the snapshot the engine would carry through an in-flight server call:
  const inFlight = await outbox.getById('children:child-1:insert');
  await outbox.markInFlight(['children:child-1:insert']);

  // Simulate user write during the in-flight window:
  await outbox.enqueue({
    tableName: 'children',
    recordId: 'child-1',
    operation: 'insert',
    payload: { id: 'child-1', first_name: 'New' },
  });

  // Now the engine's HTTP returns success and finalizeSuccess runs with the OLD snapshot:
  const { supabaseClient } = createSupabaseMock();
  const engine = createOutboxSyncEngine({ database: db, supabaseClient });
  // (Call finalizeSuccess directly via a test export, OR run syncAll with a mock that
  // ignores the marker and returns success on the existing in_flight row — engine choice.)
  await engine._testFinalizeSuccess({ outboxRecord: inFlight, tableName: 'children' });

  // The outbox row must still exist, holding the NEW payload:
  const row = await db.getFirstAsync('select status, payload from sync_outbox where id = ?', 'children:child-1:insert');
  expect(row).not.toBeNull();
  expect(row.status).toBe('pending');
  expect(JSON.parse(row.payload).first_name).toBe('New');

  // The domain row must NOT be marked synced — its new data hasn't reached the server:
  expect(await db.getFirstAsync('select sync_status from children where id = ?', 'child-1'))
    .toEqual({ sync_status: 'pending' });
});

test('finalizeSuccess deletes the outbox row and marks the domain synced when no user write intervened', async () => {
  // Same setup, but no intervening user write.
  // Assert outbox row is gone; domain row is sync_status='synced'.
});
```

(The `engine._testFinalizeSuccess` is one option; alternatively, expose `finalizeSuccess` as a module-level export under a `_testXxx` name like `_testBuildSyncPayload`, or test it via a mocked Supabase client that yields a deterministic delay in `runServerOperation`.)

---

## Smaller concerns (address opportunistically, not blocking)

### A — `pullReferenceData` is implemented and tested but never called by real-app code

`src/services/offlineSync.js:562` exports `pullReferenceData` for `academic_years`, `assessment_windows`, and `teachers`. The function is tested at `__tests__/offlineSyncOutbox.test.js:346`. But no production caller exists.

`fetchAndCacheSchools` is wired into `ClassesContext.js:58`. `pullReferenceData` is not wired anywhere outside tests.

The Plan 4 doc states "Pull order also includes reference caches for `academic_years`, `assessment_windows`, and `teachers` on first sign-in before classes, children, sessions, or assessments hydrate." Today, the function exists but doesn't run.

Recommend one of:
- Wire `pullReferenceData` into the post-sign-in flow now (the natural spot is wherever `fetchAndCacheSchools` is called, or in `OfflineContext` initialization).
- Or explicitly defer to Plan 5 with a decision-register entry stating that academic years, assessment windows, and teachers won't be present on first sign-in until then. The repositories already have safe fallbacks for empty caches (e.g., `childrenRepository.save` throws when no active academic year exists), so the deferral is observable but not silently broken.

### B — Production engine doesn't pass `safeDuplicateSuccessTables`

`src/services/offlineSync.js:549-552`:

```javascript
const defaultEngine = createOutboxSyncEngine({
  outboxRepository: syncOutboxRepository,
  stateRepository: syncStateRepository,
});
```

The test at `__tests__/offlineSyncOutbox.test.js:246` explicitly passes `safeDuplicateSuccessTables: ['time_entries']`. Production defaults to `[]`.

This is **probably correct** under the current upsert semantics. The upsert uses `onConflict: 'id'`, so a 23505 from this code path means a non-id unique constraint was violated — typically the active partial unique indexes (e.g., one active `child_ea_assignments` row per `(user_id, child_id)`, one active `grouping_versions` per `(class_id, academic_year_id)`). Those ARE real conflicts that should terminal-fail; the user has to resolve them.

But the test name implies an expectation that something will be configured for the safe-duplicate path. Either:
- Confirm the production `[]` is intentional and remove the test ambiguity (rename the test or add a comment in `defaultEngine` explaining why no tables are configured).
- Or identify any tables where 23505 genuinely is "we already had this" (rather than "a constraint was violated") and add them.

### C — Per-record dependency tracking marks the whole table failed even for archive operations

`src/services/offlineSync.js:481-488`: when any record in a table fails, `failedTables.add(tableKey)` marks the entire table as failed. Subsequent records in dependent tables are skipped regardless of which specific parent succeeded.

For `insert` operations this is correct — a child cannot be inserted before its class.

For `archive`/`update` operations on relationship/membership tables this is over-conservative. A `child_class_memberships` archive with payload `{ id, exited_at }` doesn't need its parent class to be created on the server — the class is already there. Same for `class_ea_assignments` archive, `group_ea_assignments` archive, `class_grouping_state` updates, etc.

Trade-off: false-skip is safer than false-success, and the affected rows will be retried on the next cycle (which begins after the parent failure is resolved). Acceptable for now. Worth noting in the design log so a future maintainer doesn't optimize this without thinking through the failure modes.

### D — `void db;` smell in `syncAll`

`src/services/offlineSync.js:498-499`:

```javascript
// Ensure migrations have run for injected test databases even if no rows were ready.
void db;
```

The intent is correct — `resolveDatabase` triggers migrations, and `syncAll` should ensure migrations have run even when no outbox rows exist (test scenario). But `void db;` is a side-effect-only workaround that exists purely to silence the unused-variable lint.

Cleaner shape:

```javascript
const syncAll = async ({ tableName = null } = {}) => {
  const startedAt = Date.now();
  await resolveDatabase(database);  // ensure migrations have run
  const readyRecords = sortByPushOrder(await outboxRepository.getReadyRecords({ limit: 1000 }));
  // ...
};
```

This also pairs naturally with the Issue 2 fix (which already needs the resolved db handle for the `in_flight` reset query).

### E — `outboxRecord.payload || { id: outboxRecord.record_id }` fallback in `runServerOperation`

`src/services/offlineSync.js:238`:

```javascript
const payload = buildSyncPayload(config.tableName, outboxRecord.payload || { id: outboxRecord.record_id });
```

For `hard_delete` this is correct — the delete only needs the id. For `insert`/`update`/`archive`/`restore`, a null payload would upsert `{ id }` to the server, creating an empty row with default columns.

In current code, repositories always pass a payload, so the fallback is defensive rather than necessary. But the fallback masks a class of repository bug — if an enqueue call accidentally passed `payload: null`, the engine would silently produce an empty server row.

Recommend either:
- Branch on `operation === 'hard_delete'` before the fallback, and throw a hard error if a non-delete operation has a null payload.
- Or assert at enqueue time in `syncOutboxRepository.enqueue` that `payload` is non-null for non-delete operations.

### F — `syncStateRepository.setPullState` is implemented but never called outside tests

`src/db/repositories/syncStateRepository.js:32-45` provides `setPullState` to record per-scope pull cursors. `pullReferenceData` does not call it — each invocation does a full replace from server without tracking when it last pulled.

This is fine for reference data because the pull is unconditional (full replace each time). But the unused `setPullState` API will look like a gap to future readers. Either:
- Document in the file or the design log that `setPullState` is reserved for Plan 5's domain table pulls (children, classes, etc.) which will use cursor-based incremental sync.
- Or remove `setPullState` from Plan 4 scope and add it in Plan 5 alongside its first caller. Carrying an unused API is a tiny but real maintenance cost.

---

## Test gaps to close

In addition to the failing tests for the three critical issues, the following are missing and worth adding:

- **`saveTimeEntry → syncAll → server upsert` end-to-end.** Already specified above as Issue 1's contract.
- **`in_flight` row recovery.** Already specified above as Issue 2's contract.
- **CAS finalize behavior.** Already specified above as Issue 3's contract.
- **`archive` operation through the engine.** Currently only `insert` and `hard_delete` are exercised in `__tests__/offlineSyncOutbox.test.js`. A test that enqueues an `archive` outbox row, runs syncAll, and asserts the server received an upsert with the `archived_at` column populated would close a gap.
- **`restore` operation through the engine.** Same as archive — never exercised end-to-end.
- **Domain row `sync_status='terminal'` after a terminal failure.** The test at `offlineSyncOutbox.test.js:138-207` verifies the outbox row's terminal state, and asserts the domain row's `sync_status` and `last_sync_error`. Confirming this stays in place after the fixes.
- **`OfflineContext` debounce + sync-restored coordination.** The existing tests cover debounce and shared-promise. A test verifying that "online restored + unsynced > 0" triggers exactly one syncNow (not multiple) would close the listener-coordination gap.

---

## Acceptance criteria

- All three critical-issue failing tests added and made green via the smallest fix that satisfies the contract.
- `npm test -- --runInBand` full suite stays green (currently 33/33 suites, 156/156 tests; will grow with the new tests).
- `time_entries` outbox enqueue is wired into both `saveTimeEntry` and `updateTimeEntry`, inside the same transaction as the domain upsert.
- `syncAll` recovers `in_flight` rows at cycle start.
- `finalizeSuccess` uses CAS on `updated_at` and does NOT mark the domain row synced when the outbox row was dirtied mid-flight.
- Decision register + bug register entries in `documentation/sqlite-refactor-log.md` for each of the three critical fixes.
- Verification register entries for the new test runs and any `rg` scans that prove the fixes are present (e.g., `rg "enqueueDomainOutbox.*time_entries" src/db/repositories/timeEntriesRepository.js`).
- `git diff --check` passes.
- Parallel review pass requested.
- User signoff before Plan 5.

---

## Things explicitly out of scope for this brief

- **Wiring `pullReferenceData` into post-sign-in flow.** Flagged as smaller concern A; can be addressed during the corrective TDD slice OR deferred to Plan 5 with an explicit decision-register entry. The brief does not mandate either.
- **Per-record dependency optimization for archive/update operations.** Flagged as smaller concern C. Acceptable as-is.
- **`syncStateRepository.setPullState` cleanup.** Flagged as smaller concern F. Either document or defer to Plan 5.
- **The `void db;` cleanup.** Flagged as smaller concern D. Naturally pairs with Issue 2's fix; addressing it there is fine.
- **The `safeDuplicateSuccessTables = []` decision.** Flagged as smaller concern B. Confirm intent and document; no code change required unless the user identifies a table that needs the safe-duplicate semantic.

---

## A note on the architectural pattern these issues reveal

All three critical issues sit at boundaries the test architecture cannot easily cross by itself:

- **Issue 1** is a *producer-consumer boundary*. Tests that start from the consumer's input (the outbox row) cannot reveal that the producer (the repository) never creates the input. The fix is to write tests that start from the **public domain surface** (the repository's `saveTimeEntry`) and assert all the downstream effects, not just the domain row.

- **Issue 2** is a *process-lifetime boundary*. The `in_flight` state is meaningful within a single process but meaningless across restarts. Tests that run end-to-end inside a single Jest process cannot cross this boundary. The fix is to write tests that **explicitly simulate** the cross-restart condition (manipulate the row to `in_flight`, then start a new sync cycle as if the prior one had crashed).

- **Issue 3** is a *concurrency boundary*. Tests that run sequentially cannot reveal interleaved transactions from independent actors. The fix is to write tests that **explicitly interleave** the actors (e.g., capture the in-flight snapshot, run a user-write transaction, then run the engine's finalize against the original snapshot).

These are the same patterns that bit Plan 3 (the deterministic-ID issue was a producer-consumer boundary in disguise) and that will bite future plans if not internalized. The general rule: when reviewing sync code, ask three questions per behavior — "What if the producer is wrong?", "What if the process crashes here?", "What if another actor wrote during this window?" If the test suite doesn't have a test for each of the three, that's where the next bug lives.
