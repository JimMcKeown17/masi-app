---
record_version: 1
id: MA-BUG-20261104-010
title: "Head Office re-assigning a child or class to the EA who had it before silently does nothing"
classification: product_defect
subsystem: lifecycle-authority

severity_score: 4
severity_band: S2
severity_components:
  user_impact: 2
  data_security_privacy: 1
  scope: 1
  recoverability: 0
severity_override: none
priority: P2

diagnosis_state: CONFIRMED
delivery_state: IN_PROGRESS
verification_state: NOT_TESTED

root_cause_confidence_pct: 85
confidence_basis: "Executed in disposable PostgreSQL 17 with all 41 migrations: an insert-or-ignore of the deterministic assignment id after an end returned 0 rows and left the row ended with no error, for child and class assignments and for a phone replay after a Head Office end, while an insert with a different id for the same pair was accepted. The deterministic-id rule and insert-or-ignore are read in the contract map and the sync engine."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T02:30:00Z
first_observed_at: 2026-11-04T19:49:55Z
last_observed_at: 2026-11-04T19:49:55Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "every build since deterministic assignment ids and insert-or-ignore (issue #47 and the immutable assignment inserts); no field cohort has run the app"

environment: "Disposable PostgreSQL 17 (postgres:17-alpine) with all 41 supabase/migrations at main 8b79eae5, driven by repro-server-lifecycle-semantics/lifecycle-harness.cjs; never run against hosted Supabase"
affected_releases:
  - 1.5.0 pilot builds (embedded f002e08)
  - main at 8b79eae5 (server rules)
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
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/L7.child_ea_reassign_after_end.sql
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/L7.class_ea_reassign_after_end.sql
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/L7.HO_ended_then_phone_resends_insert.sql
  - docs/bugs/evidence/MA-BUG-20261104-001/SHA256SUMS.txt
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/154

data_safety_status: "No data lost: the earlier ended row stays correct history, but a new grant of access silently fails, so the EA stays without access Head Office thinks it gave. Never seen in the field."
workaround_status: "Insert the assignment with a different id by hand, or clear the end in place on the deterministic row (what the planned Head Office script does). Nothing in the app warns."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-010 — Head Office re-assigning a child or class to the EA who had it before silently does nothing

## User-visible symptom

No field report; reproduced by Claude. Head Office takes a child or class off an EA
(or the EA leaves it), then later puts it back with the normal "assign" insert. Head
Office sees the request succeed. The EA still cannot see or work with the child or
class, and nothing reports why.

## Operational impact

- **Can the user continue?** The EA can continue with other children; the re-assigned one stays unavailable.
- **Core workflow affected:** Handover back to a previous EA (a covering EA returns, a child moves back to a class teacher).
- **Known affected users:** 0. No field cohort has run the app.
- **Relevant exposed population:** Any pair of EA and child, or class, programme and EA, where access was ended once and is granted again (handover swings during the November 2026 retest).
- **Workaround:** Insert with a different id or clear the end in place; both are manual and unannounced.

## Data-safety assessment

- **UI visibility:** The EA does not see the child or class; Head Office sees nothing wrong.
- **Durable local SQLite rows:** Not exercised here.
- **Backend rows and relationships:** The old row stays ended; no active assignment exists after the re-assign (empty result for EA_A to C_L7).
- **sync_outbox status, error_class/error_code:** A phone-sent re-insert is acknowledged as success (insert-or-ignore returns no error), so no needs-attention item appears.
- **Incident queue evidence:** None; success is silent.
- **Eventual convergence evidence:** None; the pair never becomes active.
- **Duplication, misattribution, or cross-account risk:** None; the risk is missing access, not extra access.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, executed reproduction L7.* | None (no field report) | 2026-11-04T19:49:55Z | 2026-11-05T01:00:00Z | Disposable PostgreSQL 17, 41 migrations at main 8b79eae5; same server for 1.5.0 pilot builds | None | None | `repro-server-lifecycle-semantics/results.json` (sha256 6d99c2ffdacb49248fddd5f913a1eb9868ba8819329b98e5bffc2e13694e2e80) and the `sql/` files listed in Observed facts |

## Reproduction

### Reporter steps

1. An EA's assignment to a child (or class) exists and is ended, by the EA or by Head Office.
2. The same pair is granted again by sending the assignment insert (insert-or-ignore on `id`).

### Expected

An active assignment exists for the pair, or the request reports that it did not apply.

### Actual

The insert returns no rows and no error; the ended row is untouched; there is still no active assignment.

### Closest E2E reproduction

PostgreSQL 17 with all 41 migrations; the insert is `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING id`, the shape the sync engine uses for the three assignment tables. Not driven from a phone or a real Head Office tool.

## Observed facts

- `L7.child_ea_reassign_after_end` (`sql/L7.child_ea_reassign_after_end.sql` sha256 858e925c0737): EA_A inserted the assignment for child C_L7 (id `75ef5e60-8ebf-5380-97f9-2d0af1d91184`), 1 row; archived it (`unassigned_at` 2026-10-15T06:00Z), 1 row; re-sent the insert with the same id and a new `assigned_at`, 0 rows returned. The row afterwards still has `assigned_at` 2026-10-01T06:00Z and `unassigned_at` 2026-10-15T06:00Z, `row_version` 2. The query for active assignments from EA_A to C_L7 returned an empty result.
- The same file's batched form (two rows, ignore duplicates) returned only the other row's id (`64868c8c-...`); the first, ended row was ignored.
- Contrast in the same run: an insert for the same pair with a different id (`65000000-0000-0000-0000-000000000077`) was accepted, 1 row. So the server allows a new active row; the deterministic id is what blocks it.
- `L7.class_ea_reassign_after_end` (`sql/L7.class_ea_reassign_after_end.sql` sha256 995befc95185): the same for class assignment `f7d4c787-0457-5e47-a121-0056036ab0f5`; re-insert 0 rows, row stays ended at 2026-10-15T06:00Z, `row_version` 2.
- `L7.HO_ended_then_phone_resends_insert` (`sql/L7.HO_ended_then_phone_resends_insert.sql` sha256 463947730dab): Head Office ended EA_A's assignment to C_EA (`unassigned_at` 2026-11-03T07:00Z); the phone's later replay of its original insert (a lost-acknowledgement retry) returned 0 rows and the end stayed. This is the correct outcome for a replay, and shows that the server cannot tell a replay from a real re-assignment.
- Cause in code: the assignment id is a UUIDv5 keyed exactly on the active-pair columns (`child_ea_assignments (user_id, child_id)`, `class_ea_assignments (class_id, ea_user_id, programme_id)`; `documentation/rls-sync-contract-map.md` Item 11, line 222), and the engine sends assignment inserts as insert-or-ignore on `id` (`src/services/offlineSync.js` 227 and the "Immutable assignment insert push" row of the contract map, line 240). For groups the phone works around this by reactivating the existing deterministic row and sending a `restore` (`src/db/repositories/groupsRepository.js` 93-157, identical at `f002e08`), which MA-BUG-20261104-006 shows the server accepts without checking who ended it; no equivalent for child or class assignments was checked.
- Not verified: whether any Head Office tool today inserts assignments with the deterministic id. The contract map says the head-office seed derives the same id (line 222), but the tool is "future" there; the record treats the Head Office path as the planned script.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| Deterministic ids plus insert-or-ignore make a re-insert after an end a permanent no-op | L7.* reproductions; contrast insert with a different id | None found | 85% | After the script ships, re-run L7 with the "reopen" command: active row exists, gap printed |
| Letting inserts reopen would be simpler | Would make L7 green | It would also let a replayed insert undo a Head Office end (L7.HO_ended_then_phone_resends_insert) | 85% | Keep inserts ignore-only; reopen explicitly |

## Root cause

The deterministic id gives one row per pair, forever. Insert-or-ignore on that id is
what protects against replays and identity drift (and is required by the immutable
identity triggers), so a second grant for the same pair can only change the existing
row, never add one. The server has no way to distinguish a lost-ack replay from a
deliberate re-assign, and nothing converts a re-assign into an update of the ended
row, so the request does nothing and reports nothing.

## Suggested fix

Approved plan (Jim, 2026-11-04). Step 6, the Head Office lifecycle script: its `reopen`
command clears the end in place on the deterministic row (`unassigned_at` and
`handover_reason` to null) and prints the gap it spans, so the history that was authorised
by the earlier hold stays valid and the gap is visible. Deterministic ids stay the
identity rule (contract map Item 11); inserts stay insert-or-ignore. Step 3 makes this
the only way to un-end: the end-once guard blocks EA writes from clearing an end, so
the script (service role) is the single reopen path. The daily invariant check in
`/bug-sync` flags any pair with a requested assignment but no active row.

## Verification plan

- [ ] Reproduce the original workflow on the closest faithful environment: L7.* in the frozen Postgres harness.
- [ ] Add a regression test that fails for the mechanism: after "reopen" on a child assignment and a class assignment, an active row exists for the pair and the printed gap matches the earlier end and the reopen time.
- [ ] Verify a lost-ack insert replay after "reopen" still returns no rows and does not close or duplicate the row.
- [ ] Verify the targeted correction locally.
- [ ] Two-phone check on 1.5.0: Head Office reopens a child for a returning EA; the EA's phone pulls and shows the child with no error.
- [ ] Identify the exact script version and runbook entry.
- [ ] Field check at the November 2026 retest: any handover back uses `reopen`.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | L7.*, `docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/` |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #154; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-ho-tools |

## Open questions

- Do history rows made during the gap (when the EA held nothing) need a Head Office decision, or is printing the gap enough? The held-on-the-day rule (step 4) accepts work only for days the EA held the child.
- Group assignments use the same deterministic rule (`group_id` only) but L7 did not run them; the script's `reopen` should cover all three tables and the test list should add the group case.
