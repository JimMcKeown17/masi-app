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
3. Dependency skipping is table-level (`failedTables` — `offlineSync.js:700,724-740`): one child failing retriably blocks every dependent record for *all* children that pass. *(Review found this is deeper than a latency issue and exposed a pre-existing cross-pass orphan→terminal bug — both descoped to a dedicated follow-up slice; see B3.)*

## Goals / Non-Goals

**Goals:** eliminate the connection storm at the root; apply pragmas to every write; enforce FK locally (fail-fast on orphan rows); make sync converge (bounded backoff, no queue poisoning from thrown errors); preserve the existing `(id, updated_at, status='in_flight')` CAS finalize that protects against the edit-during-flight data-loss bug.

**Non-goals (this slice):** top-10 items 3–10; porting the companion's device-faithful `expoSQLiteRealEngine` test engine (flagged as the enabling follow-up); wiring `sessions.group_id` / `sessions.state` into sync (server-guarded out by design — see B2; lands with the future state-machine slice); **the dependency-skip redesign and the cross-pass orphan→terminal correctness fix** (descoped after review to a dedicated `dependency-ordering-and-orphan-prevention` slice — see B3). A **scoped** sync-contract completeness test (covering the tables this slice touches) **is** in scope — see B2/C3.

---

## Section A — Connection model & structure

The deep module is `src/db/client.js`. Its public interface stays tiny (`getDatabase`, `withTransaction`, `resetDatabaseConnectionForTests`); all connection management hides behind it, so the sync engine and repositories never learn there are now two connections.

### Two connections, correct pragmas

| Connection | Lifetime | Pragmas | Used for |
|---|---|---|---|
| **Reader** (existing `databasePromise`) | lazy, app-lifetime | `busy_timeout=5000`, **`query_only=ON`** | all unqueued `getAllAsync`/`getFirstAsync` reads |
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

### All writes go through the writer (enforced, not just audited)

The two-connection model is only sound if **every** write goes through the writer. A Codex pass caught that the live code violates this today: `storage.ensureSchoolExists`/`ensureClassExists` (`storage.js:42-64`) call `upsertRecord(db, …)` on a `resolveDatabase()` (reader) handle, and `storage.clearDomainData` (`storage.js:527-547`) runs 18 autocommit `db.runAsync('delete …')` directly on the reader. `upsertRecord` executes a raw `INSERT…ON CONFLICT` on whatever connection it is handed (`sqliteRepositoryUtils.js`). Under a naïve split these keep writing on the reader — two connections contending for the WAL write lock (the storm reborn) and running with FK **off** (inconsistent enforcement). This is a **first-class requirement of the slice**, not an audited-away risk:

- **Enforce read-only at the engine:** `PRAGMA query_only = ON` on the reader makes any stray write **throw immediately**, surfacing every offending path in dev/tests instead of silently writing on the wrong connection — and keeping future code honest.
- **Exhaustive write-path audit — driven by "every write," not "the files I grepped."** Beyond the domain-write sites, this **must** include `localStateRepository.set/remove/clear` (`localStateRepository.js:15-39` — direct `db.runAsync` on a resolved handle, used by `storage` for user profile, cached payloads, and sync queue/meta) and `stateRepository.updateSyncMeta`. These run *during* sync and frequently; if the audit scopes to domain files only, they start throwing the moment the reader is `query_only` (Codex pass 3 — user-visible profile/cache/sync-state failures). Classify each `resolveDatabase()`/`getDatabase()` site as read (stays) or write (moves to `withTransaction`); the `query_only` reader is what guarantees the audit was exhaustive (any miss throws in tests).
- **`clearDomainData` becomes one writer transaction** (atomic wipe) rather than 18 autocommit deletes; handle FK ordering with leaf-first deletes or `PRAGMA defer_foreign_keys=ON` inside the transaction.
- **Guard test:** assert a write attempted on the reader handle throws (`query_only`), and a static/grep check that no write helper (`upsertRecord`, `runAsync` INSERT/UPDATE/DELETE) runs outside a writer transaction.

This work lands **with** the connection split (sequencing step 1), because the split is unsafe without it.

### Path scope (verified)

The production engine is created **without** an injected `database` (`offlineSync.js:832-837`), so finalize takes the `withTransaction` branch (`repositoryRuntime.js:17-18`) — the writer fix covers the production sync path. The injected-`database` `runWithTransaction` branch (`sqliteRepositoryUtils.js:94-103`) is the **test-adapter path** (better-sqlite3, single-connection, synchronous) and stays connection-agnostic by design.

### What does not change

`databaseQueue` (it becomes the writer's serialization point), the CAS finalize semantics (Section B), `PUSH_ORDER`, `TABLE_CONFIGS`, the outbox schema. **No migration** — pure client-side connection plumbing.

---

## Section B — The two sync behaviors

### B1 · CAS-preserving bulk finalize (item 1) — all outcomes, not just success

Today `processBatch` finalizes with `Promise.all(inFlightRecords.map(finalizeSuccess))` — N transactions (`offlineSync.js:668-675`). New chunked finalizers open **one `withTransaction` per chunk of ≤200** and run the *existing* per-row CAS predicate + `setDomainSyncResult` + `restorePendingAfterStaleFinalize` fallback **inside** it. Same predicate (`WHERE id=? AND updated_at=? AND status='in_flight'`), same fallback — only the transaction boundary moves (per Codex pass 1: the win is one transaction/connection, **not** one SQL statement; do **not** copy the companion's plain `DELETE … WHERE id IN (…)`, which dropped the CAS).

**All three finalize outcomes get a chunked variant, not just success** (Codex pass 3): `finalizeManySuccess`, **`finalizeManyRetriableFailure(records, reason)`**, and `finalizeManyTerminalFailure(records, reason)`. The retriable variant is the load-bearing one: the batch *failure* path (B4) is exactly where a flaky network throws on a 200-row chunk, and finalizing those per-row would recreate the storm **on the degraded path where it's most likely**. Every bulk finalize path must be O(chunks) transactions, verified by a BEGIN-count regression test on *both* the success and thrown-failure paths.

**Why both the writer *and* batching are needed — they fix different costs:**
- The persistent writer collapses the **connection** storm (1 connection, ever).
- But N separate `BEGIN/COMMIT`s on that one connection are still N WAL commits/fsyncs, each briefly holding the writer mutex and interleaving with the user's "Finish Session" write. Batching into one transaction per ≤200 rows turns N fsyncs into ⌈N/200⌉ and shrinks the user-write starvation window.

`markInFlight(ids)` already issues a single chunked `UPDATE` (`syncOutboxRepository.js:82`), so the in-flight half is effectively done. `chunkArray(arr, 200)` + `sqlPlaceholders(n)` are added to `sqliteRepositoryUtils.js` (ported from the companion; dependency-free) and used to **bound transaction size**, not to build an IN-clause.

The batch-failure fallback (`Promise.all(outboxRecords.map(processRecord))` — `offlineSync.js:657,665`) no longer storms once all transactions serialize through the one writer, but is changed to sequential for clarity and to route successes through `finalizeManySuccess`.

### B2 · Batched server upserts (item 1) + sync-contract completeness guard

Extend `BATCHABLE_UPSERT_TABLES` (currently only `assessment_items` — `offlineSync.js:196`) to the plain `onConflict:'id'` tables: **`letter_mastery`, `session_attendees`, `time_entries`** (the high/medium-volume tables — a group session marking 3 letters × 10 children drops from ~41 sequential HTTP round-trips to a handful). `sessions` is **low-volume** (one row per group-block) so batching it buys little; include it only if trivially consistent. The immutable-assignment tables stay out (they need `ignoreDuplicates` per the AGENTS.md contract). The existing `canBatchRecord`/`processBatch` contiguous-run grouping and per-record fallback already handle this; it is mostly a config change plus tests. **Update `rls-sync-contract-map.md`** for the changed operation shape.

**The sync-contract completeness guard (resolves the review's "data drops silently" concern — with a corrected premise).** A Codex pass flagged that `SERVER_COLUMNS.sessions` (`offlineSync.js:56-58`) omits `sessions.group_id` and `sessions.state`. Verified: this is **deliberate, not a leak** — `supabase/migrations/20260529214500_masi_sessions_forward_prep_columns.sql` adds RLS policies `WITH CHECK (state = 'completed' AND group_id IS NULL)` that *reject* any client write setting those columns, and its comment states the client must not push them until a future state-machine slice (which "MUST drop both guard policies"). Batching `sessions` therefore introduces no data loss — the same allowlist applies to batched and single upserts. **But** the exclusion is undocumented in code and unprotected against future drift. So this slice adds:

- An `INTENTIONALLY_UNSYNCED` map (table → {column → reason}), seeded with `sessions.group_id` and `sessions.state`, each citing the forward-prep migration and the state-machine slice that will move them into `SERVER_COLUMNS`. **Reserved strictly for real server columns deliberately withheld from push** — not a dumping ground.
- A `LOCAL_ONLY_COLUMNS` set seeded from the existing stripped bookkeeping keys (`LOCAL_ONLY_KEYS_TO_STRIP` — `offlineSync.js:37`: `sync_status`, `last_sync_error`, `server_updated_at`, …, intersected with actual schema columns), because local synced tables carry bookkeeping columns the engine strips before push (Codex pass 3 — without this the test is noisy or forces bookkeeping fields into `INTENTIONALLY_UNSYNCED`).
- A **completeness test** (C3): for every table in `PUSH_ORDER`, every column in the local schema (parsed from `migrations.js`, reusing the pattern in `__tests__/sessionsForwardPrepSupabaseMigration.test.js:12`) must be in **`SERVER_COLUMNS` ∪ `INTENTIONALLY_UNSYNCED` ∪ `LOCAL_ONLY_COLUMNS`** — and a column may live in only one of the three. This converts a silent, tribal-knowledge exclusion into an explicit, test-enforced one, and is the right-scoped sliver of the top-10 item-8 schema-drift test. (Full server-side drift coverage stays out of scope.)

### B4 · Batch failure semantics (item 2, completes the per-record guard)

`processBatch` marks **all** member ids in-flight (`offlineSync.js:651`) before the server call. The B3 per-record guard ("fail *that record*") is therefore insufficient for a batch: a thrown error (fetch/queue/payload, not a returned Supabase error) after `markInFlight` would otherwise leave *every* member stranded in-flight until the next pass's `resetInFlight`. Explicit semantics:

- `processBatch` wraps the server call **and** finalize in its own `try/catch`. On any thrown error after `markInFlight`, it finalizes **every fetched in-flight member** via the chunked **`finalizeManyRetriableFailure`** (B1) — O(chunks), *not* per-row — with `last_error`, and **returns one result per input record**, so `applyRecordResult` (`offlineSync.js:702-719`) stays correct. (Per-row finalize here would re-create the storm on the failure path.)
- The syncAll-loop guard (B3) remains the outer net for `processRecord` and for any throw escaping `processBatch` itself.

### B3 · Convergence fixes (item 2)

| Fix | Change | Decision |
|---|---|---|
| Backoff cap | `nextRetryTimestamp` uses `Math.min(5000·3ⁿ, 15·60·1000)` | Worst case 1 retry / 15 min (was 3.4 days) |
| Manual retry resets count | `retryFailedItem` also sets `retry_count = 0` | Already writes that row |
| "Sync Now" bypass | thread a `force` flag `syncNow → syncAll → getReadyRecords` to include backed-off (`failed`, `next_retry_at` in future) rows | A deliberate tap on Wi-Fi drains everything |
| Per-record error guard | wrap the loop body (`processRecord`/`processBatch`) in `try/catch` → fail the affected record(s) via `finalizeRetriableFailure` + `continue`; top-level `finally` always writes sync meta. For batches, the fan-out is handled inside `processBatch` (B4) | One *thrown* error no longer poisons the whole pass |
| Dependency skip scope | **Descoped from this slice** — table-level skip stays as-is; see note | Five adversarial passes showed this is its own design problem, not a table row |

**Dependency skipping — DESCOPED to a dedicated follow-up slice (decision after 5 review passes).** This was originally item 2c, framed as a *convergence-latency* optimization (record-scope the skip so one failing child doesn't block every dependent table-wide for a pass). The adversarial loop produced three successive findings on it — (1) `dependenciesForRecord` returns table names, not parent ids, so record-scoping needs a new extractor; (2) same-pass transitivity must be preserved; (3) **a pre-existing cross-pass bug**: a dependent skipped in pass N stays `pending` (the skip branch writes no status — `offlineSync.js:726-740`), while its parent backs off and is excluded from `getReadyRecords` (`syncOutboxRepository.js:69-78`) in pass N+1, so the dependent pushes against an absent parent → FK `23503` → **terminal** (`offlineSync.js:256-262`). **Verified present in `main` today** — this is a latent data-integrity bug (healthy child data driven terminal), not one this slice introduces.

Why descope rather than patch a third time:
- It is the lowest-value item-2 fix (latency) but has become the highest-churn (3 of ~9 findings).
- The *correct* fix is not the in-pass tracking I was iterating but a **stateless rule**: block a dependent while any of its parents still has an unsynced `sync_outbox` row (cross-pass-correct and transitive by construction, since skipped parents retain their outbox rows). That is a materially different, larger design than a reliability-slice line item.
- The cross-pass bug is pre-existing, so leaving table-level skip untouched is **status-quo, not a regression** — the slice stays a strict net win.

**Carried into the follow-up slice** (`dependency-ordering-and-orphan-prevention`, to be specced separately): the recommended parent-outbox-status model above; the verified cross-pass orphan→terminal bug; and the multi-hop regression test. This slice leaves `dependenciesForRecord`/`failedTables` exactly as they are.

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
- **Reader is read-only:** a write attempted on the reader handle throws (`query_only=ON`); `localStateRepository.set/remove/clear` and `updateSyncMeta` still succeed under `query_only` (proving they moved to the writer); `clearDomainData` runs as a single writer transaction (assert one transaction, all tables empty after).

**Bulk finalize / storm regression:**
- N outbox rows finalize in ⌈N/200⌉ transactions (spy on `withTransaction`/count `BEGIN`s) — proves the storm fix.
- CAS preserved: simulate an `updated_at` change mid-flight → that row is **restored to pending, not deleted** (edit-during-flight guard).

**Behavioral:**
- Batched upserts: new tables batch one server call per contiguous run; per-record fallback on batch failure still works.
- **Sync-contract completeness (B2):** every local-schema column of every `PUSH_ORDER` table is in `SERVER_COLUMNS` or `INTENTIONALLY_UNSYNCED`; the test fails if a column is in neither. Asserting `sessions.group_id`/`sessions.state` are present in `INTENTIONALLY_UNSYNCED` (not silently absent) is the regression that protects the documented exclusion.
- **Batch failure fan-out (B4):** a thrown error mid-batch (after `markInFlight`) finalizes **every** member as `failed` with `last_error` (none left in-flight), and returns one result per input record; plus a healthy record *after* a throwing batch still syncs in the same pass.
- Backoff cap unit test; `retryFailedItem` resets `retry_count`; `force` flag includes backed-off rows.
- Per-record guard: outbox `[throwing record, healthy record]` → healthy syncs, throwing ends `failed` with `last_error`, pass completes, sync meta updated.
- FK: positive + negative ordering tests (C2).

*(Dependency-skip behavior is unchanged this slice — no new dependency tests here. The multi-hop / cross-pass orphan→terminal regression test moves to the dedicated follow-up slice with the fix.)*

**Coverage boundary (stated honestly):** better-sqlite3 is single-connection and synchronous, so unit tests exercise *transaction semantics* but **not** the two-connection isolation (reader snapshot during a writer transaction; FK/busy_timeout living on a *separate* writer). That behavior is validated by the device/emulator stress pass (AC #10). Porting the companion's `expoSQLiteRealEngine` (top-10 testing finding #4) would let two-connection behavior be tested off-device and is the recommended follow-up.

### C4 · Acceptance criteria

1. Persistent writer connection: `foreign_keys=ON` (post-migration) + `busy_timeout=5000`, verified by a pragma-inside-transaction test.
2. **No `withExclusiveTransactionAsync` remains in any app or migration write path**; migrations use manual `BEGIN/COMMIT` with FK off during migration, on after.
3. Bulk finalize preserves the `(id, updated_at, status='in_flight')` CAS + restore-on-stale fallback, for **all outcomes** (`finalizeManySuccess`/`finalizeManyRetriableFailure`/`finalizeManyTerminalFailure`); both a successful pass **and a thrown-batch-failure pass** of N records use O(N/chunk) transactions (BEGIN-count regression test on each).
4. Batched upserts extended to `letter_mastery`/`session_attendees`/`time_entries` (and `sessions` only if trivially consistent — low-volume); `rls-sync-contract-map.md` updated.
5. Backoff capped at 15 min; manual "Sync Now" bypasses backoff; `retryFailedItem` resets `retry_count`.
6. Per-record error guard: a thrown error fails only that record, the pass continues, sync meta is always written.
7. Dependency skipping is **left unchanged** this slice (table-level `failedTables`); the descope is documented and the pre-existing cross-pass orphan→terminal bug + recommended parent-outbox-status fix are captured for the dedicated follow-up slice (B3).
8. FK migration-order audit complete with positive + negative tests.
9. Re-entrancy guard on `withTransaction` with a clear error + test.
10. At least one device/emulator stress pass during heavy sync (large backlog) confirming no `database is locked` and that user writes (Finish Session) do not starve.
11. `INTENTIONALLY_UNSYNCED` map (seeded `sessions.group_id`/`sessions.state` + reasons) **and** `LOCAL_ONLY_COLUMNS` (seeded from `LOCAL_ONLY_KEYS_TO_STRIP`); completeness test asserts every `PUSH_ORDER` table's local columns are in `SERVER_COLUMNS` ∪ `INTENTIONALLY_UNSYNCED` ∪ `LOCAL_ONLY_COLUMNS`, each column in exactly one set.
12. `processBatch` batch-failure semantics: a throw after `markInFlight` finalizes every member via chunked `finalizeManyRetriableFailure` (O(chunks)) with `last_error` and returns one result per input record; covered by a mid-batch-throw test (incl. BEGIN count) and a healthy-later-record test.
13. **All writes go through the writer:** reader opened with `query_only=ON`; the write-path audit covers domain writes **plus `localStateRepository.set/remove/clear` and `updateSyncMeta`**, all routed through `withTransaction`; `clearDomainData` runs as one writer transaction; tests assert a reader-handle write throws **and** that local-state writes still succeed under `query_only`.

### C5 · Risks & mitigations

| Risk | Mitigation |
|---|---|
| FK-on surfaces latent write-ordering bugs | Audit + positive/negative tests; staff off the SQLite build → no field impact; finding them now is the point |
| Two-connection behavior under-tested in Jest (single-conn adapter) | Explicit device stress pass (AC #10); flag `expoSQLiteRealEngine` port as follow-up |
| Existing writes on the reader handle (`ensureSchoolExists`, `clearDomainData`, …) bypass the writer + FK | **Enforced** via `query_only=ON` on the reader (stray writes throw) + exhaustive write-path audit routing all writes through `withTransaction` (Section A) — first-class slice requirement, not just an audit |
| Larger batches re-process more rows on a failed batch | Per-record fallback already exists; bounded by chunk size (≤200) |
| Migration step coupled to writer init could deadlock if it self-re-enters `withTransaction` | Migrations use manual `BEGIN/COMMIT` directly on the writer handle, not `withTransaction` |

### C6 · Suggested sequencing (independently shippable commits)

1. Connection model + writer lifecycle + re-entrancy guard + **reader `query_only` + write-path audit/refactor (all writes → writer, `clearDomainData` → one transaction)** + pragma/rollback/serialization/read-only tests (Section A). *Foundational; the split is unsafe without the write-path audit, so they land together first.*
2. CAS-preserving bulk finalize + storm regression test (B1).
3. FK migration-order audit + positive/negative tests (C2) — pairs with step 1 turning FK on.
4. Convergence fixes — backoff cap + manual bypass + per-record guard (B3) — independent of the connection work. (Dependency-skip redesign descoped — see B3.)
5. `INTENTIONALLY_UNSYNCED` map + completeness test (B2 guard) — lands *before* extending `BATCHABLE_UPSERT_TABLES`, so the allowlist is proven complete first.
6. Batched upserts (B2) + `processBatch` failure semantics (B4) + contract-map update — after B1 (so larger batches don't worsen finalize) and after step 5.
7. Device/emulator stress pass (AC #10) — gate before merge.
