---
record_version: 1
id: MA-BUG-20261104-004
title: "After the new academic year is switched on, earlier-year work from an EA who no longer holds the child is refused"
classification: product_defect
subsystem: sync-authorization

severity_score: 8
severity_band: S1
severity_components:
  user_impact: 3
  data_security_privacy: 2
  scope: 2
  recoverability: 1
severity_override: none
priority: P2

diagnosis_state: CONFIRMED
delivery_state: IN_PROGRESS
verification_state: NOT_TESTED

root_cause_confidence_pct: 85
confidence_basis: "Controlled Postgres 17 pair: S6a (year flip alone, current access kept) accepts all earlier-year work, S6b (same flip, only past grants remain) refuses the run and the assessment that the same grants allowed without the flip (S2); the active-year clause in user_held_grant_on is the only difference. The approved fix is not yet tested."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T02:30:00Z
first_observed_at: 2026-11-04T19:51:09Z
last_observed_at: 2026-11-04T19:51:09Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres before the November 2026 EA retest"
exposure_window: "from the moment the next academic year is set active (planned January 2027, school holidays when phones sit unsynced) until the fix; no field cohort has run these builds yet"

environment: "Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5; fixture year 2027 runs 2027-01-15 to 2027-12-15 and is activated after 2026 is deactivated. Synthetic fixture data only."
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
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-refusals/
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/153

data_safety_status: "Nothing lost on the phone while rows stay terminal there; the office copy would lack the refused assessments and runs (and, as in the sibling records, attendance and ticks). Never observed in the field."
workaround_status: "Interim rule: do not activate the 2027 academic year until the fix is live. Past that point there is no safe repair from the phone."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-004 — After the new academic year is switched on, earlier-year work from an EA who no longer holds the child is refused

## User-visible symptom

No field report; reproduced by Claude. Over the December holidays an EA's phone sits unsynced with the last
term's assessments and runs. In January Head Office switches the app to the new school year. The EA opens the
app, it syncs, and last term's assessments and runs for children the EA no longer teaches are refused. Home
shows items needing attention that sync does not clear. EAs who still teach the same children are unaffected.

## Operational impact

- **Can the user continue?** Yes; new-year work syncs.
- **Core workflow affected:** Assessment and run results from the previous year.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** EAs whose phones still hold previous-year work at rollover and who have since lost the child (end-of-year handovers make this common).
- **Workaround:** Do not activate 2027 before the fix.

## Data-safety assessment

- **UI visibility:** The phone still shows the results locally; the office never receives them.
- **Durable local SQLite rows:** Expected kept as `terminal` (not executed through the engine for this record).
- **Backend rows and relationships:** S6b: the session lands (1 session), 0 attendees, 0 runs, 0 assessments, 0 letter ticks, 0 maths ticks.
- **sync_outbox status, error_class/error_code:** Server answers 42501; not executed through the engine.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** None for a closed year.
- **Duplication, misattribution, or cross-account risk:** None seen.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Executed server scenarios S6a, S6b | None (Claude) | 2026-11-04T19:51:09Z | 2026-11-05T01:00:00Z | Disposable PG17, 41 migrations at main 8b79eae5 | None | None | `repro-server-refusals/results.json` (c8083d01159f); raw `S6a.out` c8d971a04e58, `S6b.out` a57e4d4b504a, `S2.out` 7b1cfc09ec5e (same grants, no flip); `S0.out` 2ceea8e69299 |

## Reproduction

### Reporter steps

1. Work dated 2026-10-28 (session, attendee, run, assessment, ticks) is queued on EA A's phone.
2. Head Office ends A's access to child C (direct assignment, class and group membership).
3. Head Office deactivates the 2026 academic year and activates 2027.
4. A's phone uploads.

### Expected

The run and assessment land: A held C on 2026-10-28.

### Actual

Run refused 42501 "No authority to start run"; assessment refused 42501 "No authority to submit assessment". With step 3 skipped (S2), both land.

### Closest E2E reproduction

Server-side only: 1.5.0 payload shapes as `authenticated` in Postgres 17. Not run through the sync engine.

## Observed facts

- S6a (flip only; A still assigned to C): session, attendee, run, assessment, letter tick and maths tick all accepted; `active_year` is `2027` after the flip. So the flip alone is harmless while current access remains (the current-access arm of the RPCs carries the work).
- S6b (past grants only, then the flip): session accepted (it uses the held-group rule, which has no year bound); attendee refused 42501 (same as MA-BUG-20261104-001/002); run "No authority to start run"; assessment "No authority to submit assessment"; both ticks refused 42501 "Active child delivery assignment required".
- Compare S2 (same ended grants, year not flipped): the run and assessment land. The only difference in S6b is the year flip, which isolates the year clause as the cause of the run/assessment refusals. The attendee and tick refusals are not new; they are the subject of MA-BUG-20261104-001/002.
- The clause: `private.user_held_grant_on` begins with `p_day <= today (SAST)` and requires `exists (select 1 from public.academic_years ay where ay.is_active and p_day between ay.starts_on and ay.ends_on)` (`20261023120000_whole_class_assessment_access.sql:8-23`, year test at :21-22). A work date in a closed year, or any date when no year is active, makes the helper false.
- `submit_assessment` (:213-219) and `save_battery_run` (:359-366) call the helper as their only route for an EA who no longer holds the child.
- The existing harness pins assert today's behaviour and must change with the fix: `scripts/assessment-results-postgres-harness.cjs:526-527` (`class-outside-active-year` and `class-no-active-year`, both `denied: true`).
- The same helper exists unchanged for every client version; 1.5.0 has no handling because the refusal is returned as 42501 and classified terminal (`offlineSync.js:468-499`, f002e08 :488).

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The active-year clause refuses earlier-year work once only held grants remain | S6a vs S6b vs S2 | Fix not yet applied | 85% | Red-first harness case (step 1); green after the clause is dropped |
| A date or timezone effect, not the year, causes it | None | S2 uses the same date and lands | 5% | None needed |

## Root cause

The held-on-the-day rule that lets assessments and runs survive a lost grant is itself bounded by the *currently active* academic year. Work dated in a year that has since been deactivated, or recorded when no year is active, fails the clause, so the RPCs fall back to current access, which a handover has already removed. The refusal is permanent because the year does not reopen.

## Suggested fix

Approved by Jim on 2026-11-04.

- Step 4, held-on-the-day history authority: extend `private.user_held_grant_on` and drop the active-year bound (decision: drop the active-year bound); the grant intervals themselves remain the test. Server-only, so 1.5.0 phones need no update.
- Step 1: S6a/S6b as red-first cases; rewrite the two harness pins at `assessment-results-postgres-harness.cjs:526-527` to expect acceptance.
- Interim: do not activate the 2027 year before the fix is live.

## Verification plan

- [ ] Reproduce S6b on staging with 1.5.0 payloads before the fix.
- [ ] Add S6b to the frozen 1.5.0 harness; it must fail before step 4. Update the two pins.
- [ ] Verify step 4: earlier-year assessments and runs land for an EA whose grant covered the day; still refused for a child the EA never held and for future dates.
- [ ] Two-phone 1.5.0 device check (A03s): queue assessments, hand over the child, flip the year on staging, reconnect.
- [ ] Verify backend convergence.
- [ ] Identify the migration containing the fix.
- [ ] Field sweep after the 2027 rollover.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | S6a, S6b (contrast S2); docs/bugs/evidence/MA-BUG-20261104-001/ |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #153; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-safety-server |

## Open questions

- Priority is P2 (rollover is January 2027); should it rise if any EA handover is planned before then? The interim rule covers the flip, not handovers in the November retest.
- No client chain was run for this trigger; the local terminal state is inferred from the shared classifier.
