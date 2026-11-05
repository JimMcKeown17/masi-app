---
record_version: 1
id: MA-BUG-20261104-007
title: "A phone clock running fast makes later end dates fail with a date-order error"
classification: product_defect
subsystem: lifecycle-authority

severity_score: 5
severity_band: S2
severity_components:
  user_impact: 2
  data_security_privacy: 1
  scope: 1
  recoverability: 1
severity_override: none
priority: P2

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 85
confidence_basis: "Executed in disposable PostgreSQL 17 with all 41 migrations: rows created with a clock two days fast were accepted, and every later end stamped with a corrected clock was refused with 23514 on six tables; a Head Office end at server now failed the same way and passed only at a time after the start. The CHECK constraints and the 1.5.0 classifier are read in source."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T09:00:00Z
first_observed_at: 2026-11-04T19:49:55Z
last_observed_at: 2026-11-04T19:49:55Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "every build since the date-order CHECK constraints (20260521115412, 20260521144901); no field cohort has run the app"

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
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/L3.clock_skew.sql
  - docs/bugs/evidence/MA-BUG-20261104-001/SHA256SUMS.txt
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/153

data_safety_status: "Durable data preserved on the phone; the end of a child, class, group or enrolment never reaches the server, so the server keeps showing the EA as holding it. Never seen in the field."
workaround_status: "Turn automatic date and time ON for pilot phones (interim rule). After a skewed row exists, Head Office can end it at a time after its start, but only by hand."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-007 — A phone clock running fast makes later end dates fail with a date-order error

## User-visible symptom

No field report; reproduced by Claude. An EA whose phone clock ran two days fast when
they added a child, class or group, and who later removes it after the clock is
corrected, sees the removal work on the phone. The office never sees it end. The item
sits in "needs attention" (assignments, immediately) or retries for a while and then
lands there (enrolments and memberships). Nothing explains in plain words that the
phone's date was the cause.

## Operational impact

- **Can the user continue?** Yes. Other work syncs; the failed end is stuck.
- **Core workflow affected:** Ending a child's, class's or group's access (leave, archive, handover); the server keeps counting the EA as holding it.
- **Known affected users:** 0. No field cohort has run the app.
- **Relevant exposed population:** EAs whose phone clock was wrong when a row was created (for example a phone with automatic date and time off). Count unknown.
- **Workaround:** Automatic date and time ON for pilot phones. Head Office can end an affected row at a time after its start.

## Data-safety assessment

- **UI visibility:** The phone shows the child, class or group as ended; the server still shows it active.
- **Durable local SQLite rows:** The ended row stays on the phone with its failed or terminal outbox item.
- **Backend rows and relationships:** Server rows keep the future `assigned_at` / `enrolled_at` / `joined_at` and no end. Head Office's own end at server now also fails until after the start (see Observed facts).
- **sync_outbox status, error_class/error_code:** `terminal` / 23514 immediately on the three assignment tables; `failed` with backoff on enrolments and memberships for attempts 1-7, then `terminal` at attempt 8 with a `deterministic:` reason.
- **Incident queue evidence:** Not exercised here; terminal items raise the usual upload incident.
- **Eventual convergence evidence:** None; the end never converges until its start is corrected.
- **Duplication, misattribution, or cross-account risk:** The EA keeps server-side write authority for something they ended; any history made afterwards is attributed as if they still held it.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, executed reproduction L3.clock_skew | None (no field report) | 2026-11-04T19:49:55Z | 2026-11-05T01:00:00Z | Disposable PostgreSQL 17, 41 migrations at main 8b79eae5; same server for 1.5.0 pilot builds | None | None | `repro-server-lifecycle-semantics/results.json` (sha256 6d99c2ffdacb49248fddd5f913a1eb9868ba8819329b98e5bffc2e13694e2e80); `sql/L3.clock_skew.sql` (sha256 04aa875da54e) |

## Reproduction

### Reporter steps

1. On a phone whose clock is two days fast, add a child to the EA's list, enrol it, add it to a class and a group, and create the class and group assignments. The phone stamps the start times from its own clock.
2. Let the phone sync. The server accepts every row.
3. Correct the phone's clock. End each of the six relationships.

### Expected

Each end is accepted. The end time is no earlier than the start.

### Actual

Every end is refused with 23514.

### Closest E2E reproduction

PostgreSQL 17 with all 41 migrations; the six inserts use a start time of server now plus two days, and the ends use `now()`. Server now in the run was 2026-11-04T19:49:54Z. Not driven from a physical phone.

## Observed facts

- Inserts with `assigned_at` / `enrolled_at` / `joined_at` two days ahead were all accepted as the EA (child assignment, enrolment, class assignment, class membership, group, group assignment, group membership): the server does not bound a start time at all.
- Ends at corrected `now()` were then refused with SQLSTATE 23514, one per table:
  - `child_programme_enrollments`: `child_programme_enrollment_dates_chk`
  - `child_class_memberships`: `child_class_membership_dates_chk`
  - `child_group_memberships`: `child_group_membership_dates_chk`
  - `group_ea_assignments`: `group_ea_assignments_dates_chk`
  - `class_ea_assignments`: `class_ea_assignments_dates_chk`
  - `child_ea_assignments`: `child_ea_assignment_dates_chk`
- Head Office has the same problem: the superuser's end of the child assignment at `now()` failed with 23514 and `Failing row contains (... 2026-11-06 19:49:54.75856+00, 2026-11-04 19:49:54.75856+00 ...)`; ending it at `now()+3d` (after `assigned_at`) passed.
- Constraints: `unassigned_at is null or unassigned_at >= assigned_at` (`supabase/migrations/20260521115412_masi_clean_base_schema.sql` 135-137); `ended_at >= enrolled_at` (149-151); `removed_at >= joined_at` (173-175); `exited_at >= enrolled_at` (`20260521144901_masi_zazi_alignment_schema.sql` 122-124); `class_ea_assignments_dates_chk` (53) and `group_ea_assignments_dates_chk` (69) in the same file.
- Classifier (identical at `f002e08` and on main): `src/services/offlineSync.js` 482-488 makes 23514 immediately terminal on `child_ea_assignments`, `class_ea_assignments` and `group_ea_assignments` (`IMMUTABLE_ASSIGNMENT_TABLES`, `src/db/repositories/rowVersion.js` 15-19). On every other table 23514 is in `DETERMINISTIC_ERROR_CODES` (466): attempts 1-7 back off, attempt 8 becomes terminal with a `deterministic:` reason (1256-1275). So enrolments and the two membership tables get eight attempts; the three assignment tables get one.
- The phone stamps starts and ends from its own clock (for example `new Date().toISOString()` at `src/db/repositories/childrenRepository.js` 682 and 715).
- Files: `results.json` sha256 6d99c2ffdacb49248fddd5f913a1eb9868ba8819329b98e5bffc2e13694e2e80; `sql/L3.clock_skew.sql` sha256 04aa875da54e.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The server trusts phone-supplied start times and then enforces end >= start against a later correct clock | L3 reproduction; constraints and inserts read | None found | 85% | After the fix, repeat L3: first ends pass and are clamped |
| Real phones will hit this | Not shown: needs a phone with automatic time off | Pilot phones are managed | 40% | Ask Jim whether any pilot phone has manual time; add a clock-offset step to the device gate |

## Root cause

The start columns come from the phone and the server accepts any value, including the
future. The date-order CHECK constraints then compare the end with that start. When the
end is stamped by a corrected clock, or by Head Office at server now, it is earlier than
the start and the whole UPDATE is refused. The phone cannot satisfy the constraint by
re-sending the same payload, which is why 1.5.0 makes it terminal on assignment tables
and gives it only eight attempts elsewhere. Nothing repairs the start or accepts the end.

## Suggested fix

Approved plan (Jim, 2026-11-04). Step 3, the end-once guard, also clamps the end:
`end := greatest(end, start)`, and the first end is clamped to server now at most, so
a future-dated start cannot make an end invalid and a skewed phone cannot send an end
in the future. The guard never raises and still returns the row, so 1.5.0 sees success.
Step 1 first writes the 1.5.0 wire shapes for L3 as red cases. Interim rule until then:
automatic date and time ON for pilot phones.

## Verification plan

- [ ] Reproduce the original workflow on the closest faithful environment: L3.clock_skew in the frozen 1.5.0 Postgres harness, red first.
- [ ] Add a regression test that fails for the mechanism: for each of the six tables, an end earlier than the start is accepted and stored as the start; an end after server now is stored as server now.
- [ ] Verify Head Office ends at server now on a future-dated row also succeed.
- [ ] Verify the targeted correction locally.
- [ ] Device check on a pilot phone with the clock set two days ahead (manual time), then corrected: the end reaches the server with no needs-attention item.
- [ ] Identify the exact migration and release containing the fix.
- [ ] Field sweep after the November 2026 retest for terminal 23514 items.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | L3.clock_skew, `docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/` |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #153; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-safety-server |
| 2026-11-05T09:00:00Z | Claude | Fixed in code, locally tested (not merged, not applied, not released) | feat/lifecycle-safety-server: lifecycle-compat harness 77/77 on disposable PG17 (red 13/68 before), all 14 PG harnesses green. Independent adversarial reviews of the server batch and the combined OTA; their findings fixed. Next: staging apply + two-phone 1.5.0 check (#157), OTA gate (#158) |

## Open questions

- Do any pilot phones run with manual date and time? That decides whether the interim rule needs enforcing or only stating.
- The clamp also changes `children`, `classes` and `groups` archive times; L3 did not exercise those tables, so the guard's test list should add them.
