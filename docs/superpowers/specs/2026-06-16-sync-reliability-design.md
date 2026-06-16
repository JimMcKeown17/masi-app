# Design: Sync Reliability Slice (Items 1 + 2)

**Date:** 2026-06-16
**Branch:** `fix/sync-reliability-writer-batch`
**Source:** [`documentation/top-10-improvements-2026-06.md`](../../../documentation/top-10-improvements-2026-06.md) items 1 and 2.
**Companion handoff:** `zazi-izandi-app/documentation/sqlite-lock-storm-handoff-for-masi.md`
**Contract map to update:** [`documentation/rls-sync-contract-map.md`](../../../documentation/rls-sync-contract-map.md)
**Status:** Design — pending adversarial review + user approval before `writing-plans`.

---

## Problem Statement

Masi's offline sync engine has a latent, field-breaking reliability bug and three convergence traps. None have fired in the field yet only because `masi-app-sqlite` has no field users (the deployed app is still on the legacy backend), which is exactly why this is the moment to fix them — before go-live, with no backwards-compatibility constraint against a deployed SQLite build.

**The lock-storm (item 1).** `expo-sqlite`'s `withExclusiveTransactionAsync` opens a **new native connection per transaction** (`node_modules/expo-sqlite/src/SQLiteDatabase.ts:167,733`; Masi calls it at `src/db/client.js:50-58`). WAL allows exactly one writer. The outbox finalizes records per-record (`finalizeSuccess`/`finalizeRetriableFailure`/`finalizeTerminalFailure`, each a transaction — `src/services/offlineSync.js:434-521`), and the batch path finalizes N successes via `Promise.all` (`offlineSync.js:668-675`). A large backlog (assessments + many `assessment_items`, `letter_mastery` rows) therefore spawns hundreds of throwaway connections fighting one writer lock. A JS `databaseQueue` (`client.js:38-48`) currently serializes transactions, downgrading the failure from a guaranteed `database is locked` crash into connection-churn + queue-starvation of user writes — but the companion app hit the hard failure in the field and wrote an explicit handoff warning Masi is *more* exposed.

**The pragma leak (item 1, correctness).** `CONNECTION_PRAGMAS` (`foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`) are applied only to the main connection (`client.js:13-19`). Every throwaway transaction connection therefore runs with **FK enforcement OFF** (despite 43 FK references in `src/db/migrations.js`, vs 2 in the companion app) and **`busy_timeout=0`** (fails instantly on contention instead of waiting). The migration path has the same leak via its own `runInTransaction` (`migrations.js:576-582`).

**The convergence traps (item 2).**
1. Retry backoff is `5000·3ⁿ` uncapped (`offlineSync.js:240-242`): ~3.4 days after 10 failures. Manual "Sync Now" does not bypass `next_retry_at`, and `retryFailedItem` resets status but not `retry_count` (`offlineSync.js:~800-820`).
2. `syncAll`'s loop has no per-record `try/catch` (`offlineSync.js:721-774`): a *thrown* error (vs a returned Supabase error) aborts the rest of the pass and can permanently poison the queue.
3. Dependency skipping is table-level (`failedTables` — `offlineSync.js:700,724-740`): one child failing retriably blocks every dependent record for *all* children that pass.

## Goals / Non-Goals

**Goals:** eliminate the connection storm at the root; apply pragmas to every write; enforce FK locally (fail-fast on orphan rows); make sync converge (bounded backoff, no poisoning, record-scoped dependencies); preserve the existing `(id, updated_at, status='in_flight')` CAS finalize that protects against the edit-during-flight data-loss bug.

**Non-goals (this slice):** top-10 items 3–10; porting the companion's device-faithful `expoSQLiteRealEngine` test engine (flagged as the enabling follow-up); the schema-drift contract test (adjacent, separate slice).

---

## Section A — Connection model & structure

The deep module is `src/db/client.js`. Its public interface stays tiny (`getDatabase`, `withTransaction`, `resetDatabaseConnectionForTests`); all connection management hides behind it, so the sync engine and repositories never learn there are now two connections.

### Two connections, correct pragmas

| Connection | Lifetime | Pragmas | Used for |
|---|---|---|---|
| **Reader** (existing `databasePromise`) | lazy, app-lifetime | `busy_timeout=5000` | all unqueued `getAllAsync`/`getFirstAsync` reads |
| **Writer** (new `writerPromise`) | lazy, app-lifetime | `foreign_keys=ON` (post-migration), `busy_timeout=5000` | every `withTransaction`, serialized by `databaseQueue` |

`journal_mode=WAL` is database-level (persists in the file), set once on first open. `foreign_keys` and `busy_timeout` are **per-connection**, which is why a *persistent* writer fixes the leak permanently. WAL's one-writer/many-readers model makes this safe: readers on the main connection always see the last *committed* snapshot, never a half-written transaction — isolation is free.

### Writer lifecycle (handles the migration FK posture)

The writer has a three-phase lifecycle that satisfies two contradictory requirements (migrations need FK **off**; runtime wants FK **on**) on one connection. `PRAGMA foreign_keys` is a no-op inside a transaction, so it is toggled only between transactions:

```
open writer  →  PRAGMA foreign_keys = OFF  →  run migrations (manual BEGIN/COMMIT)  →  PRAGMA foreign_keys = ON  →  serve runtime writes
```

Invariants (constrain the plan; exact placement of the migration step is an implementation detail):
- Migrations run **once**, with FK **off**, using manual `BEGIN/COMMIT` — **no `withExclusiveTransactionAsync`** anywhere in the migration path (`migrations.js:576-582` is rewritten).
- Migrations complete before any read or write is served (no query observes a pre-migration schema).
- The writer enforces `foreign_keys=ON` for all post-migration domain/sync writes.

### `withTransaction` rewrite

```
withTransaction(task) → withDatabaseAccess(async () => {     // existing queue = the writer's mutex
  if (transactionDepth > 0) throw new Error('withTransaction is not re-entrant; thread the txn handle down');
  const db = await getWriter();
  await db.execAsync('BEGIN IMMEDIATE');                      // take the write lock upfront — no upgrade deadlock
  try   { const r = await task(db); await db.execAsync('COMMIT'); return r; }
  catch { await db.execAsync('ROLLBACK'); throw; }
})
```

- `BEGIN IMMEDIATE` acquires the write lock at the start, avoiding deferred-to-immediate upgrade deadlocks.
- **Re-entrancy guard:** Masi threads an existing txn downward (`repositoryRuntime.js:18` — `withTransaction(txn => task(txn || db))`) rather than nesting; SQLite forbids nested `BEGIN`. The guard throws a *clear* error instead of SQLite's opaque one if a caller ever re-enters.
- `resetDatabaseConnectionForTests` closes and nulls **both** connections.

### Path scope (verified)

The production engine is created **without** an injected `database` (`offlineSync.js:832-837`), so finalize takes the `withTransaction` branch (`repositoryRuntime.js:17-18`) — the writer fix covers the production sync path. The injected-`database` `runWithTransaction` branch (`sqliteRepositoryUtils.js:94-103`) is the **test-adapter path** (better-sqlite3, single-connection, synchronous) and stays connection-agnostic by design.

### What does not change

`databaseQueue` (it becomes the writer's serialization point), the CAS finalize semantics (Section B), `PUSH_ORDER`, `TABLE_CONFIGS`, the outbox schema. **No migration** — pure client-side connection plumbing.

---

## Section B — The two sync behaviors

### B1 · CAS-preserving bulk finalize (item 1)

Today `processBatch` finalizes with `Promise.all(inFlightRecords.map(finalizeSuccess))` — N transactions (`offlineSync.js:668-675`). New `finalizeManySuccess(records)` opens **one `withTransaction` per chunk of ≤200** and runs the *existing* per-row CAS delete + `setDomainSyncResult` + `restorePendingAfterStaleFinalize` fallback **inside** it. Same predicate (`WHERE id=? AND updated_at=? AND status='in_flight'`), same fallback — only the transaction boundary moves (per Codex's review: the win is one transaction/connection, **not** one SQL statement; do **not** copy the companion's plain `DELETE … WHERE id IN (…)`, which dropped the CAS).

**Why both the writer *and* batching are needed — they fix different costs:**
- The persistent writer collapses the **connection** storm (1 connection, ever).
- But N separate `BEGIN/COMMIT`s on that one connection are still N WAL commits/fsyncs, each briefly holding the writer mutex and interleaving with the user's "Finish Session" write. Batching into one transaction per ≤200 rows turns N fsyncs into ⌈N/200⌉ and shrinks the user-write starvation window.

`markInFlight(ids)` already issues a single chunked `UPDATE` (`syncOutboxRepository.js:82`), so the in-flight half is effectively done. `chunkArray(arr, 200)` + `sqlPlaceholders(n)` are added to `sqliteRepositoryUtils.js` (ported from the companion; dependency-free) and used to **bound transaction size**, not to build an IN-clause.

The batch-failure fallback (`Promise.all(outboxRecords.map(processRecord))` — `offlineSync.js:657,665`) no longer storms once all transactions serialize through the one writer, but is changed to sequential for clarity and to route successes through `finalizeManySuccess`.

### B2 · Batched server upserts (item 1)

Extend `BATCHABLE_UPSERT_TABLES` (currently only `assessment_items` — `offlineSync.js:196`) to the plain `onConflict:'id'` tables: **`letter_mastery`, `session_attendees`, `sessions`, `time_entries`**. The immutable-assignment tables stay out (they need `ignoreDuplicates` per the AGENTS.md contract). A group session marking 3 letters × 10 children drops from ~41 sequential HTTP round-trips to a handful. The existing `canBatchRecord`/`processBatch` contiguous-run grouping and per-record fallback already handle this; it is mostly a config change plus tests. **Update `rls-sync-contract-map.md`** for the changed operation shape.

### B3 · Convergence fixes (item 2)

| Fix | Change | Decision |
|---|---|---|
| Backoff cap | `nextRetryTimestamp` uses `Math.min(5000·3ⁿ, 15·60·1000)` | Worst case 1 retry / 15 min (was 3.4 days) |
| Manual retry resets count | `retryFailedItem` also sets `retry_count = 0` | Already writes that row |
| "Sync Now" bypass | thread a `force` flag `syncNow → syncAll → getReadyRecords` to include backed-off (`failed`, `next_retry_at` in future) rows | A deliberate tap on Wi-Fi drains everything |
| Per-record error guard | wrap the loop body (`processRecord`/`processBatch`) in `try/catch` → `finalizeRetriableFailure` + record + `continue`; top-level `finally` always writes sync meta | One *thrown* error no longer poisons the whole pass |
| Dependency skip scope | **record-scoped**: skip a dependent only if *its* parent id failed (parent ids already inspected in `dependenciesForRecord` — `offlineSync.js:212-224`) | Correct fix over the cheaper "terminal-only-blocks" interim; the data is already there |

---

## Section C — Error handling, FK rollout, testing, acceptance

### C1 · Local FK error classification

FK enforcement primarily affects **domain-write (capture) paths**, not sync finalize:
- **Capture time:** a mis-ordered write (e.g. `session_attendees` before its `sessions` row in `literacySessionPersistence.js:50-107`) now throws `SQLITE_CONSTRAINT_FOREIGNKEY` locally — the fail-fast we want. The write-ordering audit (C2) ensures legitimate captures never hit this.
- **Sync finalize:** operates on updates/deletes of *existing* rows, so it introduces no new FK violations.
- **Safety net:** the per-record error guard (B3) catches any unexpected local throw during a sync write as a retriable failure (bounded by the 15-min cap, surfaced on SyncStatusScreen). We deliberately do **not** add bespoke local-FK terminal classification in this slice (YAGNI); revisit only if the audit shows a real sync-path FK case.

### C2 · FK migration-order audit (explicit work item)

SQLite checks FKs at statement time (immediate, not deferred), so within a transaction parents must be inserted before children. Audit and verify each multi-step domain write path:
- `literacySessionPersistence` — `sessions` → `session_attendees` → `letter_mastery`.
- assessment save — `assessments` → `assessment_items`.
- child/membership — `children` → `child_*_memberships` / `child_ea_assignments`.
- class — `classes` → `*_ea_assignments`.
- lookup/seed prerequisites — `ensureSchoolExists`/`ensureChildExists` in `storage.js` must satisfy referenced rows first.

Deliverable: a checklist of verified paths + tests (positive: correct order commits; **negative: child-before-parent fails with an FK error**, proving enforcement is actually on).

### C3 · Testing strategy (TDD red-green-refactor; existing Jest + 13 file-backed SQLite integration tiers)

**Connection / transaction semantics (better-sqlite3 adapter):**
- `withTransaction` returns the task value; commits on success; **rolls back on throw** (insert + throw → row absent).
- **Serialization:** two concurrent `withTransaction` calls do not interleave.
- **Re-entrancy guard:** nested `withTransaction` throws the clear error.
- `resetDatabaseConnectionForTests` closes both connections.
- **Pragma assertion:** `PRAGMA foreign_keys` / `busy_timeout` read inside a `withTransaction` callback return the writer's values — *this is the test that would have caught today's leak.*

**Bulk finalize / storm regression:**
- N outbox rows finalize in ⌈N/200⌉ transactions (spy on `withTransaction`/count `BEGIN`s) — proves the storm fix.
- CAS preserved: simulate an `updated_at` change mid-flight → that row is **restored to pending, not deleted** (edit-during-flight guard).

**Behavioral:**
- Batched upserts: new tables batch one server call per contiguous run; per-record fallback on batch failure still works.
- Backoff cap unit test; `retryFailedItem` resets `retry_count`; `force` flag includes backed-off rows.
- Per-record guard: outbox `[throwing record, healthy record]` → healthy syncs, throwing ends `failed` with `last_error`, pass completes, sync meta updated.
- Record-scoped dependency skip: `[failing child A, healthy child B + assessment(B)]` → assessment(B) syncs in the same pass.
- FK: positive + negative ordering tests (C2).

**Coverage boundary (stated honestly):** better-sqlite3 is single-connection and synchronous, so unit tests exercise *transaction semantics* but **not** the two-connection isolation (reader snapshot during a writer transaction; FK/busy_timeout living on a *separate* writer). That behavior is validated by the device/emulator stress pass (AC #10). Porting the companion's `expoSQLiteRealEngine` (top-10 testing finding #4) would let two-connection behavior be tested off-device and is the recommended follow-up.

### C4 · Acceptance criteria

1. Persistent writer connection: `foreign_keys=ON` (post-migration) + `busy_timeout=5000`, verified by a pragma-inside-transaction test.
2. **No `withExclusiveTransactionAsync` remains in any app or migration write path**; migrations use manual `BEGIN/COMMIT` with FK off during migration, on after.
3. Bulk finalize preserves the `(id, updated_at, status='in_flight')` CAS + restore-on-stale fallback; a sync pass of N records uses O(N/chunk) transactions (regression test).
4. Batched upserts extended to `letter_mastery`/`session_attendees`/`sessions`/`time_entries`; `rls-sync-contract-map.md` updated.
5. Backoff capped at 15 min; manual "Sync Now" bypasses backoff; `retryFailedItem` resets `retry_count`.
6. Per-record error guard: a thrown error fails only that record, the pass continues, sync meta is always written.
7. Record-scoped dependency skipping.
8. FK migration-order audit complete with positive + negative tests.
9. Re-entrancy guard on `withTransaction` with a clear error + test.
10. At least one device/emulator stress pass during heavy sync (large backlog) confirming no `database is locked` and that user writes (Finish Session) do not starve.

### C5 · Risks & mitigations

| Risk | Mitigation |
|---|---|
| FK-on surfaces latent write-ordering bugs | Audit + positive/negative tests; staff off the SQLite build → no field impact; finding them now is the point |
| Two-connection behavior under-tested in Jest (single-conn adapter) | Explicit device stress pass (AC #10); flag `expoSQLiteRealEngine` port as follow-up |
| A read path that secretly writes would now contend with the writer | Audit confirms reader paths are read-only |
| Larger batches re-process more rows on a failed batch | Per-record fallback already exists; bounded by chunk size (≤200) |
| Migration step coupled to writer init could deadlock if it self-re-enters `withTransaction` | Migrations use manual `BEGIN/COMMIT` directly on the writer handle, not `withTransaction` |

### C6 · Suggested sequencing (independently shippable commits)

1. Connection model + writer lifecycle + re-entrancy guard + pragma/rollback/serialization tests (Section A). *Foundational; lands first.*
2. CAS-preserving bulk finalize + storm regression test (B1).
3. FK migration-order audit + positive/negative tests (C2) — pairs with step 1 turning FK on.
4. Convergence fixes (B3) — independent, small.
5. Batched upserts (B2) + contract-map update — after B1 so larger batches don't worsen finalize.
6. Device/emulator stress pass (AC #10) — gate before merge.
