---
record_version: 1
id: MA-BUG-20261104-018
title: "A refused out-of-date edit overwrites Head Office's newer version after a download and Sync now"
classification: product_defect
subsystem: sync-outbox

severity_score: 6
severity_band: S2
severity_components:
  user_impact: 2
  data_security_privacy: 2
  scope: 1
  recoverability: 1
severity_override: none
priority: P2

diagnosis_state: CONFIRMED
delivery_state: RELEASED
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 90
confidence_basis: "The designed override is asserted by a passing test (__tests__/rowVersionSend.test.js, terminal recovery after MV001) and documented in the contract map; the server refusal is reproduced in Postgres 17 (L2 bumped-version cases); the full phone chain against Postgres was not replayed."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T15:44:00Z
first_observed_at: 2026-11-04T19:49:55Z
last_observed_at: 2026-11-04T19:49:55Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "since the upload contract (row_version, migration 20261018180000) shipped; no field cohort yet"

environment: "Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5 (L2 server refusal) plus a jest run of __tests__/rowVersionSend.test.js (real SQLite, fake versioned server) on 2026-11-05; code trace of the forced-pass callers; not production"
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
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/results.json
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/L2.child_ea.HO_bumps_version.sql
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/L2.group_ea.restore_HO_bumps_version.sql
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/L2.child_ea.HO_no_version.sql
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/L2.group_ea.HO_no_version.sql
  - __tests__/rowVersionSend.test.js
  - documentation/rls-sync-contract-map.md
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/155

data_safety_status: "a Head Office correction can be silently replaced by an older EA edit; the replaced values are not recoverable from the row itself, and the EA is never told"
workaround_status: "none for the EA; Head Office can re-apply the correction if it notices; the overwritten value is not logged on the row"
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-018 — A refused out-of-date edit overwrites Head Office's newer version after a download and Sync now

## User-visible symptom

No field report; reproduced by Claude.

An EA edits a child's details (or ends or restores an assignment) on the phone, offline.
Meanwhile Head Office changes the same record. When the phone uploads, the server refuses
the edit as out of date and it sits under Needs attention. The EA then does something
ordinary: pulls to refresh, taps Sync now in the header, or signs out. The phone downloads
Head Office's version, then sends the EA's old edit again on top of it. Head Office's newer
change is replaced, and nothing on the phone says so.

## Operational impact

- **Can the user continue?** Yes. All the screens work.
- **Core workflow affected:** Child record edits and assignment lifecycle changes made by Head Office while an EA's edit is waiting; any table that uses the row_version guard.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** EAs with a refused edit sitting terminal, who then run any forced pass.
- **Workaround:** None for the EA. Head Office would have to notice and re-apply.

## Data-safety assessment

- **UI visibility:** The EA sees the Needs attention item clear and a normal "synced" state. Head Office sees the older values come back.
- **Durable local SQLite rows:** The terminal outbox payload keeps the EA's edit (`first_name: 'Corrected'` in the test) after the pull replaced the displayed row with the server's version.
- **Backend rows and relationships:** After the forced pass the server row carries the EA's edit at a higher row_version (test: `{ first_name: 'Corrected', row_version: 8 }` over the server's version 7).
- **sync_outbox status, error_class/error_code:** The refused row is `terminal` with reason `Server has a newer version of this record (stale_version)` (`MV001`); a forced pass re-claims it, bumps `row_version` by one, and sends it.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Converges on the EA's older edit, not on Head Office's newer one.
- **Duplication, misattribution, or cross-account risk:** Misattribution of a stale value as the latest; no cross-account access.

Do not equate "not visible in the UI" with "deleted." Record local durability,
backend state, relationship rows, and convergence evidence separately.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, executed reproduction plus code trace and test run | None (no field user) | 2026-11-04T19:49:55Z | 2026-11-05T01:00:00Z | Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5 (L2 server refusal) plus a jest run of __tests__/rowVersionSend.test.js (real SQLite, fake versioned server) on 2026-11-05; code trace of the forced-pass callers; not production | None | None | L2.child_ea.HO_bumps_version and L2.group_ea.restore_HO_bumps_version in `results.json` (sha256 6d99c2ffdacb49248fddd5…); `__tests__/rowVersionSend.test.js` lines 365-391; contract map lines ~212, ~991, ~1078 |

## Reproduction

### Reporter steps

1. A synced record sits at row_version 1 on the phone; Head Office raises it to 5 on the server (L2.child_ea.HO_bumps_version).
2. The EA's queued edit arrives with row_version 2.
3. The EA pulls to refresh, taps Sync now, or signs out.

### Expected

The server's newer version wins. The EA's edit is shown to the EA or discarded; Head Office's change stays.

### Actual

Step 2: the server refuses with `MV001`, message `stale_version`, detail `incoming row_version=2 stored row_version=5`; the stored row is unchanged (row_version 5). The row goes terminal on the phone. Step 3: a forced pass pulls (the displayed row becomes the server's), then re-sends the terminal edit with the refreshed version, which the server accepts. The test run records this as the intended outcome: the server row ends as the EA's edit at row_version 8 over version 7.

### Closest E2E reproduction

Two halves, not yet joined. The server refusal is executed in Postgres 17 (L2). The phone chain is executed by `__tests__/rowVersionSend.test.js` ("terminal recovery keeps the recovered edit after MV001", run 2026-11-05: 2 passed) against a fake versioned server. The phone's wire requests were not replayed into Postgres for this scenario.

## Observed facts

- L2.child_ea.HO_bumps_version (observed 2026-11-04T19:49:55Z): Head Office ends the assignment with row_version 5 (rows affected 1); the EA's archive with row_version 2 fails `MV001` / `stale_version`; final row `row_version: 5`, `unassigned_at: 2026-11-03T07:00:00+00:00`. L2.group_ea.restore_HO_bumps_version gives the same refusal for a restore.
- Contrast, L2.child_ea.HO_no_version and L2.group_ea.HO_no_version: when Head Office ends an assignment without bumping row_version, it stays 1, and the EA's later archive with row_version 2 is accepted (rows affected 1), replacing `unassigned_at` with the EA's value (`2026-10-30T05:00:00+00:00`, was `2026-11-03T07:00:00+00:00`) and clearing `handover_reason` (was "HO handover" for group_ea). So the guard only protects when Head Office also bumps the version; whether Head Office writes do is not established here.
- `__tests__/rowVersionSend.test.js:365-391` test.each(['MV001', '42501']): after a terminal refusal the phone keeps `first_name: 'Corrected'` as `terminal`; `saveServerChildRows` replaces the row with the server's `Original` at row_version 7; `getTerminalRecords()[0].payload.first_name` is still `Corrected`; then `engine.syncAll({ force: true })` returns `totalSynced: 1`, the request carries `row_version: 8`, and the server row becomes `Corrected` at 8. The test treats this as correct ("terminal recovery keeps the recovered edit").
- The code that does it: `syncOutboxRepository.js:~97-110` includes `terminal` rows when `includeTerminal`; `updateInFlight` (`:~172-200`) bumps `row_version` by one on claim and sets the domain row `terminal` to `pending`; `offlineSync.js:1693` passes `includeTerminal: force` (line 1654 at f002e08).
- Contract map: `documentation/rls-sync-contract-map.md` ~212 ("Force Sync Now includes terminal rows"), ~991 (`MV001` is terminal, "Force Sync Now can retry terminal work"; "A refusal can converge through a subsequent pull"), ~1078 and ~1091-1093 (terminal rows retried by forced Sync Now). This is documented behaviour, not an accident.
- Routine forced callers (all pass `force: true`): `ChildrenListScreen.js:179` (pull-to-refresh), `ChildrenListScreen.js:267`, `TimeEntriesListScreen.js:95`, `SyncStatusScreen.js:108,186`, `useSignOutFlow.js:85` (sign-out), `OfflineContext.js:142`. The 1.5.0 pilot's `rowVersionSend.test.js` has the same test (line 365) and its `offlineSync.js:1654` passes `includeTerminal: force`, so 1.5.0 behaves the same.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The forced-pass override of a terminal `MV001` row defeats `row_version`: a routine gesture re-sends a stale edit with a refreshed version | The passing test asserts it; L2 shows the server refusal; callers are routine gestures; contract map documents it | The end-to-end wire chain was not replayed into Postgres; whether Head Office writes always bump `row_version` is unknown | 90% | Add the step 1 harness case (refuse, pull, forced pass) and confirm the server keeps Head Office's value after step 7 |

## Root cause

`row_version` is meant to stop an old edit overwriting a newer server row: the server raises `MV001` when the incoming version is lower than the stored one (`supabase/migrations/20261018180000_upload_contract_row_version.sql:36`). The phone classes `MV001` as terminal, correctly stopping ordinary passes.

But forced passes (pull-to-refresh, header Sync, Sync now, sign-out) deliberately include terminal rows. A forced pass claims the terminal row, bumps its `row_version` by one from the local row (which a pull has just replaced with the server's higher version), and sends the old payload. The incoming version is now higher than the stored one, so the guard passes it. The refusal is therefore defeated by the very gestures that fix other stuck rows, and the EA is not asked. The behaviour was a deliberate design ("terminal recovery keeps the recovered edit"), so the defect is the design decision, not a coding slip.

## Suggested fix

Approved (fix step 7, OTA, with Jim's decision to reverse the override): the server wins. When a refused edit's delivered `upload_terminal` receipt exists, the edit is kept in that receipt and the outbox row is dropped, so the phone resolves to server truth; forced passes then re-send only history and hard deletes, not refused edits. A plain-words "The office has a copy - remove from this phone" exit covers items the EA wants gone. The test at `rowVersionSend.test.js` ("terminal recovery keeps the recovered edit") and the contract map sections cited above change in the same branch (anti-drift rule).

1.5.0 compatibility: phones still on 1.5.0 keep the override until the OTA; the server's `MV001` guard is unchanged. Step 3's end-once guard and step 4 do not address this.

## Verification plan

- [ ] Reproduce the chain end to end: refused edit, pull, forced pass, on a 1.5.0 pilot build with Head Office changing the same record, and note whose value the server keeps.
- [ ] Add the CI harness case (step 1): replay the real wire request after the forced pass into Postgres; red on 1.5.0 behaviour, green after step 7.
- [ ] Rewrite the `rowVersionSend.test.js` case so a forced pass after `MV001` leaves the server value and drops the outbox row once the receipt is delivered.
- [ ] Update `documentation/rls-sync-contract-map.md` in the same branch.
- [ ] Two-phone 1.5.0 device check and an OTA device check.
- [ ] Confirm the delivered `upload_terminal` receipt carries the discarded edit.
- [ ] Field sweep: no `MV001` row re-sent after a refresh in receipts.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | L2.child_ea.HO_bumps_version, L2.group_ea.restore_HO_bumps_version, L2.child_ea.HO_no_version, L2.group_ea.HO_no_version; rowVersionSend.test.js terminal recovery; docs/bugs/evidence/MA-BUG-20261104-001/ |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #155; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-ota-stuck-items |
| 2026-11-05T09:00:00Z | Claude | Fixed in code, locally tested (not merged, not applied, not released) | feat/lifecycle-ota: real-SQLite regressions red-first; combined tree tmp/lifecycle-integration 3e487fda unit 8,355/8,355, integration 1,555/1,555. Independent adversarial reviews of the server batch and the combined OTA; their findings fixed. Next: staging apply + two-phone 1.5.0 check (#157), OTA gate (#158) |
| 2026-11-05T15:44:00Z | Claude | Released | App update published to channel `preview`, runtime 1.5.0, update group `8addaae6` from `feat/lifecycle-ota` fd053cfc (PR #163). Not merged yet. Phones run the update from their second launch after it downloads. The device, uptake and field checks are still open (#157, #158, #159) |

## Open questions

- Do Head Office tools always bump `row_version` when they edit? L2 "HO_no_version" shows an unbumped Head Office edit is overwritten with no refusal at all; that is a separate server gap not covered by this record.
- Which tables use the guard on edits (children, assignments, others)? The test covers `children`.
