---
record_version: 1
id: MA-BUG-20261104-020
title: "The sign-out sheet says items will upload next time, even ones the server has refused"
classification: product_defect
subsystem: sign-out

severity_score: 3
severity_band: S3
severity_components:
  user_impact: 1
  data_security_privacy: 1
  scope: 1
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: CONFIRMED
delivery_state: FIX_APPROVED
verification_state: NOT_TESTED

root_cause_confidence_pct: 95
confidence_basis: "Read in source on main and at f002e08: the unsent count includes terminal rows and the sheet promises every counted item will upload next time; whether a refused item ever uploads depends on the cause, and the sheet does not distinguish."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T01:00:00Z
first_observed_at: 2026-11-05T00:50:00Z
last_observed_at: 2026-11-05T00:50:00Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "every build with the sign-out sheet (including 1.5.0); no field cohort yet"

environment: "Code trace of main at 8b79eae5 and the 1.5.0 pilot source (git show f002e08); no device and no executed reproduction of the sheet"
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
  - src/components/profile/SignOutSheets.js
  - src/hooks/useSignOutFlow.js
  - src/db/repositories/syncOutboxRepository.js
github_issues: []

data_safety_status: "no data lost by the sheet itself; the risk is false reassurance before the EA signs out with work the server has refused"
workaround_status: "the EA can open the Sync status screen before signing out and read the Needs attention list"
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-020 — The sign-out sheet says items will upload next time, even ones the server has refused

## User-visible symptom

No field report; found by Claude while tracing sign-out.

An EA taps Sign out with some work not yet delivered. The sheet says, for example,
"3 items haven't uploaded yet. If you sign out, they'll upload next time you sign in on this phone."
That count includes items the server has already refused. Those do not simply upload next time:
an ordinary sync skips them, and a later sign-in does not fix whatever the server objected to.
The EA is told everything is on its way when part of it is stuck.

## Operational impact

- **Can the user continue?** Yes. The EA can choose Try upload now, Sign out anyway or Cancel.
- **Core workflow affected:** The sign-out safety check for unsent work.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** EAs who sign out while any item is terminal.
- **Workaround:** Open Sync status first; or use Try upload now and see whether the count falls.

## Data-safety assessment

- **UI visibility:** The sheet shows one total with a promise that all of it will upload.
- **Durable local SQLite rows:** Preserved on the phone; sign-out does not delete them (per-EA database).
- **Backend rows and relationships:** The refused items are not on the server.
- **sync_outbox status, error_class/error_code:** Counted statuses are `pending`, `failed`, `in_flight` and `terminal` (`UNSENT_STATUSES`, `syncOutboxRepository.js:40`). Terminal rows carry their refusal code and are skipped by ordinary passes (`:~97-104`).
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** A terminal item converges only through a forced pass or a pull, not by signing in again.
- **Duplication, misattribution, or cross-account risk:** None; the per-EA database keeps the items with the EA who made them.

Do not equate "not visible in the UI" with "deleted." Record local durability,
backend state, relationship rows, and convergence evidence separately.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, code trace | None (no field user) | 2026-11-05T00:50:00Z | 2026-11-05T01:00:00Z | Code trace of main at 8b79eae5 and the 1.5.0 pilot source (git show f002e08); no device and no executed reproduction of the sheet | None | None | Source only: `SignOutSheets.js` lines 44-47; `useSignOutFlow.js` line 33; `syncOutboxRepository.js` lines 40-57 and 401-404; no repro files |

## Reproduction

### Reporter steps

1. Have one item stuck `terminal` (a refused upload) and none waiting.
2. Tap Sign out.

### Expected

The sheet separates "waiting to upload" from "needs attention" and does not promise the second group will upload.

### Actual

By code trace: `useSignOutFlow.goToUnsent` takes `total` from `countUnsent()`, which counts terminal rows, then shows "`N items haven't uploaded yet`" with "they'll upload next time you sign in on this phone".

### Closest E2E reproduction

Not attempted. Code-trace only. There is no executed run of the sheet in this batch.

## Observed facts

- `src/hooks/useSignOutFlow.js:33`: `({ total } = await countUnsent());` the sheet opens when `total` is nonzero. The 1.5.0 pilot has the same call (`git show f002e08:src/hooks/useSignOutFlow.js`, line 33).
- `src/db/repositories/syncOutboxRepository.js:40`: `UNSENT_STATUSES = ['pending', 'failed', 'in_flight', 'terminal']`, with a comment calling it "the one definition of unsent work"; `readUnsentSummary` (`:42-57`) counts those statuses by table; `countUnsent` (`:401-404`) returns `{ total, byTable }`. Same at f002e08 (line 40).
- `src/components/profile/SignOutSheets.js:44-47`: title "`${unsentCount} items haven't uploaded yet.`" and subtitle "If you sign out, they'll upload next time you sign in on this phone." (singular: "it'll"). Same text at f002e08 (line 47).
- The reassurance is accurate for pending and failed rows (ordinary passes retry them). For `terminal` rows, `getReadyRecords` excludes them unless `includeTerminal` (`syncOutboxRepository.js:~97-104`), and the cause is usually a server refusal. So a signed-out-then-in phone does not retry them on its own, with one exception: the auth-restore heal requeues unmarked RLS-terminal (`42501`) rows when a session returns (`documentation/rls-sync-contract-map.md`, Item 9). It does not cover other refusals, and was not executed here.
- Same sheet also offers Try upload now, which runs a forced pass (`useSignOutFlow.js:85`); a forced pass would include terminal rows, but the sheet does not say so, and see MA-BUG-20261104-018 for what a forced pass does to a refused edit.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The sheet reuses one "unsent" definition for both the warning and the promise, so terminal items are promised an upload | `UNSENT_STATUSES` includes terminal; sheet text is unconditional | Sheet not rendered in this run | 95% | Render the sheet with a terminal-only outbox and read the text |

## Root cause

The "unsent work" definition was written for the question "is anything not safely on the server?" (the left-behind report and the sign-out warning both read it). That is the right question for the warning, but the sheet reuses its count for a promise about the future. A terminal item is unsent but is not on its way; it needs the office or a decision. The count has no split between waiting and needs-attention, so the copy cannot be honest about both.

## Suggested fix

Approved (fix step 7, OTA): the sheet separates "waiting to upload" from "needs attention", promises an upload only for the first, and points the second at the Needs attention list (and the plain-words "The office has a copy - remove from this phone" exit once the receipt is delivered). The shared definition `UNSENT_STATUSES` stays for the warning; the split is a read over the same rows. No server change; 1.5.0 phones keep the old wording until the OTA.

## Verification plan

- [ ] Render the sheet with a terminal-only outbox, a pending-only outbox, and both; confirm the copy for each.
- [ ] Add a regression test that fails today: a terminal item must not appear in the "they'll upload" count.
- [ ] Verify the targeted correction locally.
- [ ] Check the sheet on a physical device with a refused item.
- [ ] Identify the exact release or OTA containing the fix.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | code trace of the cited source paths, no repro files |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |

## Open questions

- Should the sheet block sign-out for terminal items, or stay a warning? The approved plan separates the copy only.
- What should the sheet say for `in_flight` items left by an interrupted pass?
