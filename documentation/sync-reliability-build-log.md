# Sync Reliability Slice — Build Log

> **Scope:** Top-10 Items 1 + 2 — eliminate the SQLite connection storm / pragma leak
> (dedicated writer + read-only reader + CAS-preserving bulk finalize) and make the outbox
> sync converge (bounded backoff, manual-sync bypass, per-record/per-batch error guard).
> **Dependency-skip redesign is descoped** to a later `dependency-ordering-and-orphan-prevention` slice.

**Branch:** `fix/sync-reliability-writer-batch`
**Spec:** [`docs/superpowers/specs/2026-06-16-sync-reliability-design.md`](../docs/superpowers/specs/2026-06-16-sync-reliability-design.md)
**Plan:** [`docs/superpowers/plans/2026-06-16-sync-reliability.md`](../docs/superpowers/plans/2026-06-16-sync-reliability.md) — 12 TDD tasks, 5 phases
**Execution mode:** subagent-driven-development (fresh implementer per task → spec review → code-quality review → `/codex:adversarial-review` → engage findings → commit).

---

## Why a fresh build log

`documentation/sqlite-refactor-log.md` is the historical clean-slate-refactor record and has gone stale.
This slice is well-bounded with its own spec + plan, so it gets a dedicated, readable log here.
The **final device/emulator pass** (Plan Task 12, Step 4) is *also* recorded in `sqlite-refactor-log.md`
per AGENTS.md, so the durable device-verification trail stays in the canonical place.

---

## Conventions

Each task entry records: **status**, **what changed**, **tests** (command + result), **Codex adversarial-review**
findings and how each was resolved (verified against code first, per the established review loop), and the **commit SHA(s)**.
All Jest/integration commands are prefixed with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`
(shell default is Node v22; `better-sqlite3` is built for Node 20 — recorded in memory).

---

## Pre-flight

### P0 — Scope the unit Jest config to the repo (exclude sibling worktrees)

- **Problem found:** the **unit** Jest config (`package.json` `jest` key, used by `npm test` and every
  `npx jest <name>`) had no `testPathIgnorePatterns` beyond the implicit `node_modules`. An in-repo git
  worktree, `.claude/worktrees/feature+wela-plus-battery`, contains **72 test files**, many sharing names
  with the root suite (`offlineSyncOutbox.test.js`, `assessmentsRepository.test.js`, `OfflineContext.test.js`, …).
  Bare `npm test` ran both copies; focused runs like `npx jest offlineSyncOutbox` (used by Plan Tasks 6/8/9/11)
  matched the worktree copy too — corrupting the green/red signal from a *different branch's* code.
  The **integration** config was already safe (explicit `<rootDir>/__tests__/<file>` `testMatch` allowlist).
- **Fix:** added `testPathIgnorePatterns` **and** `modulePathIgnorePatterns` to the unit config excluding
  `node_modules` + `.claude/worktrees` + `.codex/worktrees`. `testPathIgnorePatterns` stops worktree test
  *discovery*; `modulePathIgnorePatterns` removes the worktree from Jest's *module/haste map* (killing the
  `nonprofit-field-app` package.json haste collision). `jest.integration.config.js` inherits both via its
  `...packageJson.jest` spread, so no second edit was needed.
- **Verified:** `npx jest offlineSyncOutbox --listTests` → only the root copy, no collision warning;
  integration `--listTests` → exactly the 13 root allowlist files.
- **Status:** ✅ done
- **Commit:** `af2b7c0` — _test: scope jest to repo, exclude sibling worktrees_

### P1 — Baseline green

- Establish the pre-change baseline (`npm test` + `npm run test:integration`) so any later red is attributable
  to the task that caused it.
- **Result:**
  - **Integration:** ✅ 13 suites / 113 tests pass (`--runInBand`, file-backed SQLite — the reliable signal for db/sync work).
  - **Unit:** 371/373 pass. The 2 "failures" — `AssessmentHistoryScreen.plan5` and `SessionHistoryScreen.plan5` —
    are **pre-existing load-induced `waitFor` timeout flake** (16–17s under the 78-suite parallel run; **pass
    deterministically in isolation in ~1.3s**). Orthogonal to this slice (UI history screens, not the db/sync
    layer) and **not** caused by the P0 jest-scope change (which only *excludes* paths). Not fixed here (out of
    slice scope — they belong to the Plan-5 UI work). **At Task 12** the release-gate full run may flake on these
    two; if so, re-run them in isolation to confirm green before judging the gate.
- **Status:** ✅ baseline accepted (green modulo the 2 documented pre-existing UI flakes)

---

## Phase 1 — Foundation

### Task 1 — `chunkArray` + `sqlPlaceholders` helpers
**Status:** ✅ done

- **What changed:** added `chunkArray(items, size=200)` and `sqlPlaceholders(count)` to
  `src/db/repositories/sqliteRepositoryUtils.js` (used later by bulk finalize + batched upserts).
- **Tests:** `__tests__/sqliteRepositoryUtils.helpers.test.js` — TDD red→green; 15 tests green
  (`npx jest sqliteRepositoryUtils.helpers`).
- **Spec/quality review:** controller-verified from the committed diff (2 pure helpers — right-sized vs. a
  dedicated reviewer subagent): matches plan verbatim, defensive guards, edge cases covered, no unrelated
  files swept in.
- **Codex adversarial-review:** `[high]` — `chunkArray` with `size<=0` is a **non-terminating loop** (hang in
  sync finalization); `NaN`/`Infinity`/fractional also misbehave. **Verified real** against the code (current
  callers all pass hardcoded `200`, so no live trigger — but it's a shared exported helper and a hang in
  finalization is the exact field failure this slice prevents; also contradicts the slice's fail-loud ethos).
  **Resolved:** both helpers now throw `RangeError` on out-of-contract input (guard-first, since running the
  "red" would hang rather than fail). +9 validation tests.
- **Commits:** `468d863` (helpers) · `cf0199d` (Codex hardening).

### Task 2 — Migrations run FK-off via manual BEGIN/COMMIT
**Status:** ✅ done (Codex-converged)

- **What changed:**
  - `runInTransaction` (migrations.js) → manual `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` on the supplied
    connection (no more `withExclusiveTransactionAsync` throwaway connection).
  - `runMigrationsNow` reads `user_version` first; **only** toggles `foreign_keys` OFF→(migrate)→ON when
    migrations are pending. FK restored in `finally`.
  - Dropped `configureDatabaseConnection` from the migration path/import (Task 3 stops `client.js` exporting it).
- **Why FK handling changed:** migrations historically ran FK-off *by accident* (the throwaway exclusive-txn
  connection defaults FK off). Manual BEGIN/COMMIT runs on the same connection, so FK-off is now explicit;
  FK-on `finally` gives injected test DBs production-equivalent enforcement (Task 5 depends on it).
- **Tests:** `migrationsForeignKeysOff.test.js` (manual-BEGIN path + FK-on-after + no-FK-toggle-when-nothing-pending);
  `sqliteFoundation.test.js` realigned event-order + new rollback-masking test. Integration **13 suites / 114 tests**
  green; previously-racy `offlineSyncOutbox` stable **5/5** runs.
- **Codex adversarial-review (2 passes → converged):**
  - Pass 1 `[high]`: no-op `runMigrationsNow` toggled FK on every `resolveDatabase` access → transient FK-off
    window that could overlap a concurrent write (enforcement silently disabled) + restore no-ops if a txn is
    open. **Verified real** (current `resolveDatabase` runs migrations on every access). **Fixed:** read
    `user_version` first, skip FK toggle when nothing pending. *(The broader "production runs migrations every
    access" half is **deferred to Task 3**, which removes that call by design — `resolveDatabase` will stop
    migrating in production.)*
  - Pass 1 `[medium]`: bare `await ROLLBACK` in the catch could mask the original migration error (SQLite
    auto-rollback → "no transaction is active"). **Verified real. Fixed:** rollback wrapped in its own try/catch;
    original error always rethrown.
  - Pass 2: **approve** — fixes confirmed; Codex also probed a nested-`withExclusiveTransactionAsync` deadlock
    in the new adapter queue and confirmed the codebase never nests (handles are threaded), so it's safe.
- **Adapter fix (commit 846bc70):** `betterSqliteAdapter.withExclusiveTransactionAsync` now serializes concurrent
  calls via a promise queue, mirroring real expo-sqlite (new connection per exclusive txn + WAL serialization).
  Fix 1's microtask-timing change deterministically exposed a **single-connection test-adapter** limitation
  (concurrent `Promise.all` finalizes double-BEGIN → "cannot start a transaction within a transaction"). Not a
  production bug (prod serializes finalizes via the `databaseQueue`); the queue makes the adapter model reality.
- **⚠️ Follow-up for Task 3:** Test 1 (`app-level migrations wait behind an active queued write transaction`) uses
  a fully-migrated DB, so post-Fix-1 the no-op migration emits no events and its serialization assertion is
  weakened (the "migration ran after the write" marker is gone). Migration-vs-migration serialization is still
  covered by the "serializes concurrent migration runs" test. **Task 3 removes on-demand migration entirely**
  (`resolveDatabase` stops migrating; migrations run once at bootstrap), so this test's scenario becomes obsolete —
  revisit/retire it then.
- **Commits:** `cf12b95f` (manual BEGIN/COMMIT + FK lifecycle) · `697fc9b` (Codex fixes 1+2) · `846bc70` (adapter serialization).

### Task 3 + 4 — Dedicated writer + read-only reader; all writes via writer (ONE atomic commit)
**Status:** ✅ done — **Codex-converged** (code-quality reviewer + 3 Codex passes; final verdict `approve`)

- **What changed (commit `de9b77b`):**
  - `src/db/client.js` rewritten: persistent **writer** (WAL + busy_timeout + FK-on post-migration) and
    **reader** (`useNewConnection`, busy_timeout, `query_only=ON`). Single `initialize()` bootstrap migrates
    the writer, then opens the reader. `getDatabase()`→reader, `getWriter()`→writer. `withTransaction` does
    `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` on the writer, serialized by `databaseQueue`. **Non-re-entrant by
    contract** — NO watchdog, NO depth guard (both unsafe under Hermes; nesting deadlocks by design = loud,
    non-corrupting). `resetDatabaseConnectionForTests` is now async.
  - `repositoryRuntime.js`: `resolveDatabase` migrates only injected (test) DBs; production returns the reader
    (no migration on the query_only handle). `runRepositoryTransaction` routes production writes to the writer.
  - **Write-path audit** (I did the discovery up-front): every repository `resolveDatabase` site is a READ; the
    only write-on-resolved-handle offenders were `localStateRepository` (set/remove/clear) and 6 `storage.js`
    methods (`ensureSchoolExists`, `ensureClassExists`, `markAsSynced`, `markAsUnsynced`, `setSyncError`,
    `clearDomainData` → now one transaction with `defer_foreign_keys`). All routed through the writer.
    `ensureChildExists` needed no change (its write already delegates to the closure-routed repo).
- **Tests:** new `clientWriterConnection.test.js` (8 tests: BEGIN/COMMIT on writer, rollback, one-transaction,
  serialization, writer/reader distinction, pragmas, + 2 from review) and `clientReadOnlyReader.test.js`
  (proves `query_only`→throw via real better-sqlite3). Removed 3 superseded single-connection `sqliteFoundation`
  tests (serialized-writes → covered by clientWriterConnection serialization test; pragmas-on-open → covered by
  clientWriterConnection pragma test; on-demand-migration-waits → obsolete, migration serialization covered by
  the surviving "serializes concurrent migration runs" test). Rewrote 1 `referenceDataRepository` test to the
  single-writer model (same no-interleave invariant). `betterSqliteAdapter` no-ops `PRAGMA query_only` (the
  shared single test connection can't honor it without poisoning writes; `:memory:` can't share across two
  connections — enforcement proven by clientReadOnlyReader + device). jest setups `await` the now-async reset.
- **Review loop (this is where it paid off):**
  - **Code-quality reviewer (fresh subagent)** AND **Codex adversarial-review** *independently converged* on two
    findings: **[high]** `withTransaction`'s unguarded ROLLBACK masks the original error (and could poison the
    persistent writer — later queued `BEGIN IMMEDIATE` would throw); **[medium]** reader-init failure leaks the
    already-open writer connection. Note: Task 2 had *already* established the "guard the rollback" pattern in
    `runInTransaction` — `withTransaction` (specified from the older plan) hadn't gotten it. Classic fresh-eyes
    consistency catch.
  - The code-quality reviewer additionally flagged `retryFailedItem` still writing on the reader (plan deferred
    its fix to Task 8). I pulled the **routing** fix forward so the write-path audit is genuinely complete now.
- **Fixes (commit `0d4ef35`):** `withTransaction` wraps ROLLBACK in its own try/catch (rethrows original) and
  calls a new `disposeConnections()` on rollback failure so a poisoned writer re-bootstraps; `initialize()`
  disposes a half-open bootstrap; `retryFailedItem` routes through the `database` closure (writer in prod). +2
  tests (rollback-masking, partial-init-cleanup).
- **⚠️ Coverage gaps (by design, device-verified in Task 12):** the test harness uses ONE connection, so reader
  `query_only` enforcement and the true writer/reader isolation are NOT exercised by Jest — proven by the
  `clientReadOnlyReader` mechanism test + the Task 12 device pass (per-row Retry, production write-surface sweep).
- **➡️ Task 8 scope reduced:** `retryFailedItem` routing is DONE here; Task 8 now only adds `retry_count = 0`
  (plus its backoff cap + force-bypass work).
- **Codex convergence pass** then found a gap BOTH my fix and the two reviewers missed: `initialize()` assigned
  `writerConnection` only *after* writer pragmas/migrations succeeded, so a writer that opened but then failed
  its pragmas/migrations leaked its handle (`disposeConnections` saw `null`). **Fixed (commit `66ccb19`):** assign
  each connection to its module var immediately after `openDatabaseAsync`, before awaited config — so dispose
  always closes it. Added the missing writer-bootstrap-failure regression test.
- **Verification:** unit **399** pass, integration **111** pass (down from 114 — the 3 removed foundation tests).
  Independently re-run green; the 2 known UI flakes didn't surface.
- **Commits:** `de9b77b` (connection split + write-path audit) · `0d4ef35` (rollback guard + dispose + retry routing)
  · `66ccb19` (writer-bootstrap dispose, Codex convergence).

### Task 5 — FK migration-order audit (positive + negative)
**Status:** ✅ done

- **What changed:** new `__tests__/foreignKeyEnforcement.test.js` (test-only — the audit found no production
  mis-orders). NEGATIVE: an orphan `session_attendees` insert throws `FOREIGN KEY constraint failed` (proves
  enforcement is genuinely ON after `runMigrations`). POSITIVE: drives the **real** flows — `seedCoreData` →
  `childrenRepository.save` → `persistLiteracySession` (sessions→session_attendees→letter_mastery) →
  `assessmentsRepository.saveAssessment` (assessments→assessment_items) — and asserts they commit with FK on.
- **Audit:** all 4 write paths (literacySessionPersistence, assessments/children/classes repos) already write
  parent→child. No reorders, no `defer_foreign_keys` needed (consistent with the flows already passing FK-on in
  their sibling tests pre-slice).
- **Codex adversarial-review:** `[medium]` — the POSITIVE assertions were `length>0` (smoke test): `saveAssessment`
  always writes a `__summary__` item, so dropped per-letter rows would still pass. **Verified real. Fixed:**
  exact-count + linked-parent-ID assertions (1 session/attendee/assessment; both `letter_mastery` rows a,m under
  child-1; 3 `assessment_items` incl `__summary__`) — verified against the migrated schema, matched first try.
- **Tests:** `foreignKeyEnforcement` 2/2; integration 13 suites / 111 tests green.
- **Commits:** `edff21fb` (FK tests + audit) · `f9f0911` (Codex: exact-count strengthening).

## Phase 2 — Bulk finalize & batch failure semantics

### Task 6 — CAS-preserving bulk finalize (success)
**Status:** ✅ done — Codex `approve`

- **What changed:** added `finalizeManySuccess` (one `runRepositoryTransaction` per `chunkArray(records,200)` chunk,
  running the EXACT per-row CAS inside: delete `where id=? and updated_at=? and status='in_flight'` →
  `restorePendingAfterStaleFinalize` on 0 changes → `setDomainSyncResult` synced/pending by `hasRemainingOutbox`).
  `processBatch` now calls it instead of `Promise.all(inFlightRecords.map(finalizeSuccess))` (the per-record storm).
  Added `chunkArray` import.
- **YAGNI deviation from plan:** plan added all three bulk finalizers in Task 6; I added only `finalizeManySuccess`
  (the only one `processBatch` uses now). `finalizeManyRetriableFailure` lands in Task 7 (its throw-path). There is
  **no terminal-batch path** (batch failures are retriable or fall back to per-record `processRecord`), so a
  terminal bulk finalizer would be dead code — omitted.
- **Test:** `bulkFinalize.test.js` seeds 250 real `assessment_items` (+ parent assessment for FK), counts
  `withExclusiveTransactionAsync` opens (the correct transaction proxy for the injected-db path — `BEGIN` is issued
  on the underlying handle, not via the adapter's `execAsync`), asserts `< 20` (O(chunks): ~3-4 vs ~250 per-record),
  outbox drained, all items `synced`.
- **Codex:** `approve` — bulk finalizer mirrors per-row CAS; chunk boundaries don't change final state; test genuine.
  *Optional (not done):* a batch-path stale-finalize test (mutate one row mid-batch, assert it stays pending while
  siblings drain). Declined — that branch is byte-identical to the per-row `finalizeSuccess` stale-restore already
  covered by `offlineSyncOutbox`. Noted for possible future tightening.
- **Tests:** `bulkFinalize` + `offlineSyncOutbox` (26) + integration (13/111) green.
- **Commit:** `621c83e`.

### Task 7 — Batch failure semantics (B4)
**Status:** ✅ done — request-throw semantics closed; broader post-markInFlight invariant deferred to Task 9

- **What changed (commit `612dde3`):** added `finalizeManyRetriableFailure` (bulk, mirrors per-row
  `finalizeRetriableFailure` CAS, one txn/chunk); `processBatch` wraps the batch server call in try/catch — a
  THROWN batch upload now bulk-finalizes every in-flight member as retriable failed (last_error + backed-off
  next_retry_at) instead of stranding them `in_flight`.
- **Codex `[high]` (and fix, commit `d357ae3`):** the per-row FALLBACK (`if (!serverResult.success) →
  Promise.all(map(processRecord))`) could still strand rows: `processRecord`'s server call was unguarded, so a
  thrown per-row request (degraded network) rejected the `Promise.all` and left the `markInFlight`'d row
  `in_flight`. **Verified real** against the code (markInFlight at ~651, unguarded `await enqueueRequest` at ~658).
  **Fixed:** `processRecord` wraps its server call in try/catch → `finalizeRetriableFailure` (mirrors the
  batch-throw fix), so a thrown request finalizes retriable in BOTH the fallback and the direct per-record path.
  Complementary to Task 9's outer-loop guard (which catches errors outside the server op).
- **Tests:** `batchFailureSemantics` — (a) thrown batch → all 3 failed/none in_flight/totalFailed=3; (b) batch
  `{error}` → fallback → 3 per-row throws → all failed/none in_flight (4 upsert calls). `offlineSyncOutbox` (28) +
  integration (13/111) green.
- **Codex convergence `[high]` → deferred to Task 9 (not a punt — see below):** Codex escalated to the broader
  invariant: a throw from `getById` or the finalizers themselves (NOT the server request) after `markInFlight`
  can still strand a row `in_flight`, since only the server call is inside try/catch. **Verified real**, but:
  (a) **self-healing** — `syncAll` calls `resetInFlight()` at the start of every pass (`update sync_outbox set
  status='pending' where status='in_flight'`), so a stranded row is reset+retried next sync (no data loss);
  (b) these are rare local-SQLite exceptions; (c) it is **squarely Task 9's scope** ("per-record error guard").
  **Decision:** mark Task 7 done (its request-throw semantics ARE closed) and **upgrade Task 9** to adopt Codex's
  recommendation — a `processRecord`/`processBatch`-level outer guard that best-effort restores marked ids on ANY
  post-markInFlight throw (better than the originally-planned syncAll-loop guard, which can't cleanly restore a
  whole batch's ids). Self-healing means no interim ship risk.
- **Commits:** `612dde3` (batch-throw semantics) · `d357ae3` (per-row fallback throw, Codex).

## Phase 3 — Convergence

### Task 8 — Backoff cap + retry reset + manual "Sync Now" bypass
**Status:** ✅ done — Codex-converged (4 review passes; every manual sync affordance enumerated + forced)

- **What changed (commit `5e7aa89`):** `getRetryDelay` capped at 15m (was unbounded exponential) + `__testables`
  export; `retryFailedItem` resets `retry_count=0` (routing already fixed in T3+4); `getReadyRecords` gains
  `includeBackedOff` (drops the `next_retry_at` clause + shifts bound params when forced); `syncAll` threads
  `{force}` → `includeBackedOff`; `OfflineContext.syncNow({force})` chains a forced pass when a non-forced sync is
  in-flight; `SyncStatusScreen` Sync Now + post-retry pass `{force:true}`.
- **Tests:** `retryBackoff.test.js` (cap boundaries, includeBackedOff include/exclude, retry_count→0 reset);
  force-during-active-sync test added to `OfflineContext.test.js` (kept separate from the real-engine retryBackoff
  tests because it mocks `syncAll`). Full unit 412 / integration 111 green, zero flakes.
- **Codex `[medium]` ×2 (fix commit `578af40`):**
  - **Another manual Sync Now ignored backoff:** `ChildrenListScreen`'s "Sync Now" banner called `refreshSyncStatus`
    (non-forced). **Verified** (+ swept ALL `syncNow` callers). **Fixed** → `syncNow({force:true})`.
    (SyncStatusScreen already forced; `TimeEntriesListScreen` is an auto-sync-after-write, correctly left
    non-forced; `SyncIndicator` navigates — its dead `syncNow` destructure removed.)
  - **Forced reruns didn't coalesce:** every forced caller during an active sync appended its own `.then` pass →
    N rapid taps = N backoff-bypassing passes hammering Supabase. **Fixed:** a `pendingForcedSync` ref coalesces to
    at most ONE queued forced rerun per active pass (repeated taps share it). Coalescing test: 2 forced calls →
    same promise, `syncAll` called exactly twice.
  - *ChildrenListScreen screen-test skipped* (no existing test; heavy render) — one-line wiring is
    inspection-verifiable; the coalescing test is the substantive new coverage.
- **Codex convergence `[medium]` ×2 (fix commit `39ab2ed`):**
  - **TimeEntriesListScreen pull-to-refresh was a non-forced manual sync** — I'd misclassified it as auto-post-write
    during the sweep without reading it; it's a `RefreshControl` `onRefresh` handler (manual gesture). **Verified
    (read it) → fixed** to `syncNow({force:true})`. (`ChildrenListScreen.onRefresh` left as-is: it's a data reload,
    no `syncNow`, + has the dedicated forced banner.)
  - **Forced-behind-forced didn't coalesce** — the first coalescing handled forced-behind-NON-forced but a forced
    tap during an already-forced sync still queued a redundant 2nd backoff-bypassing pass. **Fixed** with an
    `activeSyncIsForced` ref: forced-behind-forced now JOINs the active pass. Truth table now complete (4 cases) +
    a forced-during-forced test (same promise, syncAll once).
- **Codex final convergence `[medium]` (fix commit `081586c`):** `ChildrenListScreen.onRefresh` called
  `refreshSyncStatus()` with default `autoTrigger:true`, which schedules a non-forced background sync — so the
  My-Children pull-to-refresh was *also* a manual gesture silently respecting backoff (I'd missed that
  `refreshSyncStatus` auto-triggers). **Fixed** → `syncNow({force:true})` then `refreshSyncStatus({autoTrigger:false})`.
  **⚠️ PRODUCT NOTE for Jim:** My-Children pull-to-refresh now *force-pushes* data (consistent with Work History).
  If you'd rather it be reload-only, the alternative is `refreshSyncStatus({autoTrigger:false})` with no `syncNow`.
- **Affordance audit (now complete):** manual sync = SyncStatusScreen (button + post-retry), ChildrenListScreen
  (banner + pull-to-refresh), TimeEntriesListScreen (pull-to-refresh) → ALL force. Auto/background = OfflineContext
  timer (non-forced, respects backoff), TimeEntries post-write n/a. SyncIndicator navigates.
- **Commits:** `5e7aa89` (backoff/force) · `578af40` (Codex: ChildrenListScreen banner + initial coalescing) ·
  `39ab2ed` (Codex: pull-to-refresh force + forced-behind-forced join) · `081586c` (Codex: My-Children
  pull-to-refresh force).

### Task 9 — Per-record error guard in `syncAll` (+ Codex Task-7 self-cleaning)
**Status:** ✅ done — Codex-converged (3 fix rounds on subtle batch-fallback concurrency; final verdict `approve`)

- **What changed (commit `2fe732c`):** the per-record error guard, expanded to adopt Codex's Task-7 convergence
  recommendation (function-level self-cleaning):
  - `processRecord` + `processBatch` each wrap their WHOLE post-`markInFlight` body in ONE try/catch (replacing the
    Task-7 inner server-op catch), tracking `inFlightRecord(s)` in outer scope. On ANY throw (getById, request, or a
    finalize) they best-effort finalize-retriable with **`inFlightRecord(s) || original`** — CAS **hits** →
    failed+backoff (real attempt); CAS **misses** (changed `updated_at`) → `restorePendingAfterStaleFinalize` →
    pending (never-attempted). Best-effort wrapped (if the finalize itself throws, `resetInFlight` recovers next
    pass). Net: no `markInFlight`'d row is stranded `in_flight`.
  - `syncAll` wraps each loop iteration in a backstop try/catch (a throw in config/dependency/dispatch/applyResult
    fails only that record; healthy records still sync) and moves `updateSyncMeta` into a `finally` (meta always
    writes). The dependency-skip `continue` and batch `continue`/`index += len-1` control flow is preserved
    (confirmed: batch-ordering + dependency-skip tests stayed green).
- **Tests:** `syncErrorGuard.test.js` (3 cases): one record errors → only it fails + healthy syncs + meta written;
  injected `getById` throw after markInFlight → row NOT left `in_flight` + pass completes; loop-body throw → meta
  still written. Existing batchFailureSemantics/offlineSyncOutbox/bulkFinalize stayed green (unified catch didn't
  change their behavior). Unit 417 / integration 111 green.
- **Codex review `[high]`+`[medium]` (fix commit `99d638e`):**
  - `[high]` the catch swallowed a recovery-finalize failure → row could stay `in_flight` within the pass while
    meta still updated. **Fixed:** layered recovery — if `finalizeRetriableFailure`/`finalizeManyRetriableFailure`
    throws, fall back to `markReady` (plain outbox-only `status='pending'` UPDATE, far less likely to fail than the
    full CAS+domain finalize) before swallowing.
  - `[medium]` both batch fallbacks were `return Promise.all(...)` (NOT awaited) — a fallback `processRecord`
    rejection (e.g. `markInFlight` throwing *before* its own try) escaped `processBatch`'s catch, bubbled to
    `syncAll` without advancing `index` → **double-process** risk. **Fixed:** `return await Promise.all(...)` so
    `processBatch`'s catch owns fallback failures. Test A proves no `in_flight` + no double-process.
  - *Test B (markReady fallback) skipped* — the domain UPDATE and `markReady` UPDATE share one connection/txn, so a
    `runAsync` proxy can't fail one without the other; inspection + Task-12 device verified.
- **Codex convergence `[high]` (fix commit `afcd84d`):** the `await Promise.all` fallback was still **fail-fast** —
  it rejected on the FIRST fallback `processRecord` rejection without waiting for siblings, so `processBatch`'s
  catch could whole-batch-finalize while a sibling's upload was still in flight → a successfully-sent row reverted
  to pending (**double-send**). **Fixed:** new `processBatchFallback` uses `Promise.allSettled` (waits for every
  record to settle), returns each record's own result, and cleans up ONLY a rejected record's id (`markReady`) —
  no whole-batch finalize after fallback begins. Race test: deferred sibling upload + one `markInFlight` throw →
  sibling ends `synced` (not reverted), thrower pending/failed, none `in_flight`, sibling not re-sent next pass.
- **Commits:** `2fe732c` (guard + self-cleaning) · `99d638e` (Codex: layered recovery + awaited fallback) ·
  `afcd84d` (Codex convergence: allSettled fallback, no double-send).

## Phase 4 — Sync-contract completeness, then batched upserts

### Task 10 — `INTENTIONALLY_UNSYNCED` + `LOCAL_ONLY_COLUMNS` + completeness test
_status: pending_

### Task 11 — Extend `BATCHABLE_UPSERT_TABLES` + contract-map update
_status: pending_

## Phase 5 — Verification

### Task 12 — Full suite + device/emulator stress pass (AC #10)
_status: pending_
