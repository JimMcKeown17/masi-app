---
record_version: 1
id: MA-BUG-20261104-021
title: "A fallback sync pass can turn refused items back into \"waiting\""
classification: product_defect
subsystem: sync-outbox

severity_score: 3
severity_band: S3
severity_components:
  user_impact: 1
  data_security_privacy: 1
  scope: 1
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: PROBABLE
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 60
confidence_basis: "Code path traced on main and at f002e08: a forced pass claims terminal rows, and a deferred fallback record is reset with markReadyMany, which sets status pending with no status filter; the pass was not executed, so the budget and batch conditions that trigger it are unconfirmed."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T09:00:00Z
first_observed_at: 2026-11-05T00:50:00Z
last_observed_at: 2026-11-05T00:50:00Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "forced passes only; since the batch-fallback budget shipped; no field cohort yet"

environment: "Code trace of main at 8b79eae5 and the 1.5.0 pilot source (git show f002e08); not executed (no jest run, no replay)"
affected_releases:
  - 1.5.0 pilot builds (embedded f002e08)
  - main at 8b79eae5
affected_devices: []
affected_os_versions: []
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths:
  - src/services/offlineSync.js
  - src/db/repositories/syncOutboxRepository.js
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/155

data_safety_status: "no data lost; local rows and payloads are kept, but a refused item can silently change from needs attention to waiting, and its domain row can be re-stamped"
workaround_status: "none needed; a later pass sends the item again, and it returns to terminal if the server refuses it again"
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-021 — A fallback sync pass can turn refused items back into "waiting"

## User-visible symptom

No field report; found by Claude while tracing the sync engine.

After an EA presses Sync now (or pulls to refresh, or signs out) while many items are stuck
or a group upload fails as a whole, some items that were under Needs attention can move to
the quiet "waiting to upload" count instead, without anything having fixed them. The Needs
attention list gets shorter although the server's refusal has not changed.

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** The honesty of Needs attention versus waiting; retry of refused items.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** Phones with a large terminal backlog in a batchable table, during a forced pass.
- **Workaround:** None needed. The item is re-sent next pass; if the server refuses again it returns to terminal.

## Data-safety assessment

- **UI visibility:** The item moves from the Needs attention list into the waiting count (by status; not rendered here).
- **Durable local SQLite rows:** The payload is preserved. For edits and other stamped operations the claim also bumps the domain row's `row_version` and flips its `sync_status` from `terminal` to `pending` (`syncOutboxRepository.js:~190-200`), and the reset does not undo that.
- **Backend rows and relationships:** Unaffected by the reset itself.
- **sync_outbox status, error_class/error_code:** Status `terminal` becomes `in_flight` at the claim, then `pending` at the reset. `error_class`, `error_code`, `last_error` and `retry_count` are not touched by `markReady`/`markReadyMany`, so a `pending` row can still carry its old refusal code (traced, not observed).
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not observed. The next ordinary pass retries the row; whether that is harmless depends on the refusal (see MA-BUG-20261104-018 for a refused edit).
- **Duplication, misattribution, or cross-account risk:** None identified.

Do not equate "not visible in the UI" with "deleted." Record local durability,
backend state, relationship rows, and convergence evidence separately.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, code trace | None (no field user) | 2026-11-05T00:50:00Z | 2026-11-05T01:00:00Z | Code trace of main at 8b79eae5 and the 1.5.0 pilot source (git show f002e08); not executed (no jest run, no replay) | None | None | Source only: `offlineSync.js` lines 1313-1366, 1369-1426, 1073-1082, 1693; `syncOutboxRepository.js` lines 97-110, 171-200, 304-319; no repro files |

## Reproduction

### Reporter steps

1. Hold more than 25 terminal rows in one batchable table (for example inserts refused with `42501` or `23505`), so a forced batch has more records than the fallback budget.
2. Press Sync now (forced pass).
3. Cause the batch request to fail as a whole (a single refused row in the batch is enough, or a thrown request).

### Expected

Records the pass did not attempt keep their prior status; terminal rows stay terminal.

### Actual

By code trace: records beyond the fallback budget are reset with `markReadyMany`, which sets `status = 'pending'` for each id regardless of its prior status. Not executed.

### Closest E2E reproduction

Not attempted. Code-trace only. The conditions (budget of 25 records per pass, a failing batch of more than 25 forced-in terminal rows) are unusual and were not constructed.

## Observed facts

- Forced passes read terminal rows: `getReadyRecords({ includeTerminal: force })` (`offlineSync.js:1693`, line 1654 at f002e08; `syncOutboxRepository.js:~97-110`).
- Batching applies to inserts and non-by-id updates on upsert tables (`canBatchRecord`, `offlineSync.js:1073-1082`); `SYNC_BATCH_LIMITS` is `maxBatchRecords: 100`, `maxFallbackRecordsPerPass: 25`, `maxFallbackConcurrency: 5` (`:229-233`).
- `processBatch` (`offlineSync.js:1369`) first calls `markInFlightAndGet(ids)`, which sets every id `in_flight`, whatever its status was (`syncOutboxRepository.js:171-198`, `updateInFlight`). For stamped operations it also adds 1 to the domain row's `row_version`, sets the domain `sync_status` from `terminal` to `pending`, and rewrites the payload's `row_version`.
- If the batch request throws or returns `!success`, `processBatchFallback` (`:1313`) runs. It attempts `min(records, remaining budget)` records one by one; the rest are `deferredRecords`.
- `:1345-1355`: `outboxRepository.markReadyMany(deferredIds)`. `markReadyMany` (`syncOutboxRepository.js:304-319`) runs `update sync_outbox set status = 'pending', next_retry_at = null, updated_at = ? where id = ?` for each id, with no condition on the current status. A deferred terminal row was moved to `in_flight` by the claim, so by this point nothing records that it was terminal; the reset makes it `pending`.
- `markReady` (`:293-302`) and the per-record cleanup loop (`:1325-1340`, `:1357-1362`) do the same single-row reset.
- The processBatch catch path (`:1406-1426`): if something throws after the claim, `finalizeManyRetriableFailure` (`:1026-1054`) updates rows that are still `in_flight` with matching `updated_at` to `status = 'failed'`, `retry_count + 1`, a backoff `next_retry_at`, `error_class = 'retryable'`, `error_code = 'OTHER'` (unless `dispositionFor` supplies another). So a terminal row claimed by a forced batch that throws becomes `failed` (retriable, backing off), with its retry budget advanced. If the finalize itself fails, the last-resort per-id `markReady` makes it `pending`. Traced, not executed.
- Tests: no test in this run exercises a terminal row through the fallback deferral. Not searched exhaustively.
- Same code in the 1.5.0 pilot: `git show f002e08:src/db/repositories/syncOutboxRepository.js` has `markReadyMany` at line 304 and `UNSENT_STATUSES` at line 40; `git diff f002e08 -- src/db/repositories/syncOutboxRepository.js` is empty, and the diff of `offlineSync.js` does not touch `processBatchFallback` or `markReadyMany`.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| A forced batch demotes deferred or thrown terminal rows to pending or failed because the claim erases their terminal status and the reset has no status filter | Traced path from `includeTerminal` to `markInFlightAndGet` to `markReadyMany`; no filter in the SQL | Not executed; needs more than 25 forced-in terminal records or a thrown batch; the effect may be benign for the common refusal types | 60% | Real-SQLite probe: 30 terminal inserts in one batchable table, force a pass with a failing batch request, read statuses and `retry_count` |

## Root cause

Unconfirmed: the code path is traced but not executed. As traced, two things make a terminal row lose its status on a forced pass. First, the claim (`markInFlightAndGet`) overwrites the status with `in_flight`, for terminal rows too, and re-stamps the domain row. Second, the fallback's reset helpers (`markReadyMany`, `markReady`) and the thrown-batch finalize set `pending` or `failed` without remembering that the row was terminal. The reset helpers were written for rows that were `pending` or `failed` before the pass; a forced pass widened the claimed set to terminal rows without widening the reset. What could not be confirmed: how often a real forced pass has a failing batch with more records than the fallback budget, and whether the demoted rows' stale `error_code` changes any decision downstream.

## Suggested fix

Approved (fix step 7, hardening, OTA): `markReadyMany` never demotes terminal rows (and the single-row `markReady` and the thrown-batch finalize follow the same rule), so a forced pass that does not attempt a terminal row leaves it terminal. Step 7's other change, that forced passes re-send only history and hard deletes, also narrows the set of terminal rows a forced pass can claim. 1.5.0 phones keep the current behaviour until the OTA.

## Verification plan

- [ ] Reproduce with a real-SQLite probe: more terminal inserts than the fallback budget in one table, forced pass, failing batch request; record statuses and `retry_count` before and after.
- [ ] Add a regression test that fails for the demonstrated mechanism: a terminal row deferred by the fallback budget is still terminal after the pass.
- [ ] Cover the thrown-batch path (`finalizeManyRetriableFailure`) with the same fixture.
- [ ] Verify the targeted correction locally.
- [ ] Verify the domain row's `sync_status` and `row_version` after a deferred forced pass.
- [ ] Identify the exact OTA release containing the fix.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | code trace of the cited source paths, no repro files |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #155; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-ota-stuck-items |
| 2026-11-05T09:00:00Z | Claude | Fixed in code, locally tested (not merged, not applied, not released) | feat/lifecycle-ota: real-SQLite regressions red-first; combined tree tmp/lifecycle-integration 3e487fda unit 8,355/8,355, integration 1,555/1,555. Independent adversarial reviews of the server batch and the combined OTA; their findings fixed. Next: staging apply + two-phone 1.5.0 check (#157), OTA gate (#158) |

## Open questions

- Does the pass ever claim more than 25 terminal rows in one table in realistic use? If never, this stays a hardening item.
- Does `getSyncStatus` classify a `pending` row with a stale terminal `error_code` as waiting or as needs attention? Not traced.
