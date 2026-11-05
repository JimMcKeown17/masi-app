---
record_version: 1
id: MA-BUG-20261104-003
title: "After a programme switch, the EA's queued sessions, runs and assessments are refused and ticks get the new programme"
classification: product_defect
subsystem: sync-authorization

severity_score: 7
severity_band: S1
severity_components:
  user_impact: 3
  data_security_privacy: 2
  scope: 1
  recoverability: 1
severity_override: none
priority: P1

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 85
confidence_basis: "Controlled Postgres 17 scenarios: S4 refuses all four kinds of literacy work after the literacy programme assignment ends, S4b isolates the check to the session, run and assessment (the attendee itself is not programme-checked), and the mastery rows are stamped numeracy; S5b shows a replay of an already-saved session is refused too. The approved fix is not yet tested."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T09:00:00Z
first_observed_at: 2026-11-04T19:51:09Z
last_observed_at: 2026-11-04T19:51:09Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres before the November 2026 EA retest"
exposure_window: "any time Head Office moves an EA between programmes while the EA's phone holds unsent work; no field cohort has run these builds yet"

environment: "Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5; the payloads mirror 1.5.0's wire shapes (session insert-or-ignore, attendee merge upsert, save_battery_run, submit_assessment, set_letter_mastery, set_skill_mastery). Synthetic fixture data only."
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

data_safety_status: "Nothing lost on the phone while the rows stay terminal there; the office copy lacks the refused sessions, runs and assessments, and the surviving ticks carry the wrong programme. Never observed in the field."
workaround_status: "None from the phone. Interim: Head Office switches an EA's programme only after that EA's phone shows everything synced (same drain-first practice as MA-BUG-20261104-002)."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-003 — After a programme switch, the EA's queued sessions, runs and assessments are refused and ticks get the new programme

## User-visible symptom

No field report; reproduced by Claude. An EA teaches literacy lessons and runs literacy assessments without signal.
Before the phone syncs, Head Office moves the EA from literacy to numeracy. On the next sync the old lessons,
the assessment and the run are refused and Home shows items needing attention that cannot be cleared. The letter ticks
that do arrive appear under numeracy, not literacy.

## Operational impact

- **Can the user continue?** Yes, on the new programme.
- **Core workflow affected:** Lessons, assessments and runs recorded before the switch; tick programme labels.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** EAs with unsent work when Head Office changes their programme. Numeracy is new, so switches are expected soon.
- **Workaround:** Drain first. None after the refusal.

## Data-safety assessment

- **UI visibility:** The phone keeps the lesson and results locally; the office never receives them.
- **Durable local SQLite rows:** Expected to be kept as `terminal` (the 1.5.0 classifier treats 42501 as terminal); client-side behaviour was not executed for this record, see Open questions.
- **Backend rows and relationships:** S4: 0 sessions, 0 attendees, 0 assessments, 0 runs; `letter_mastery` and `skill_mastery` rows exist but with `programme = numeracy` (correction ids `d7000000-...-601`, `e7000000-...-601`).
- **sync_outbox status, error_class/error_code:** Server answers 42501; not executed through the engine for this scenario.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** None; the refusal is deterministic for a closed programme assignment.
- **Duplication, misattribution, or cross-account risk:** Misattribution: ticks made under literacy are stored as numeracy.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Executed server scenarios S4, S4b, S5b | None (Claude) | 2026-11-04T19:51:09Z | 2026-11-05T01:00:00Z | Disposable PG17, 41 migrations at main 8b79eae5 | None | None | `repro-server-refusals/results.json` (c8083d01159f); raw `S4.out` 4f17d9543e03, `S4b.out` 799ae68f7153, `S5b.out` 7cdff8f1bb00; `S0.out` 2ceea8e69299 (control); `effective-write-policies.txt` cc930bb685d8 |

## Reproduction

### Reporter steps

1. Offline, EA A (literacy): work dated 2026-10-28 (a group session with child C, an attendee, a run, an assessment, a letter tick, a maths tick).
2. Head Office ends A's literacy `staff_programme_assignments` row and opens a numeracy one (2026-11-02).
3. A's phone uploads the queued work.

### Expected

All the literacy work is accepted as literacy: A held that programme on the day.

### Actual

Session, attendee, run and assessment are refused 42501. The two ticks are accepted and stored under numeracy.

### Closest E2E reproduction

Server-side only: the 1.5.0 payload shapes run as `authenticated` in Postgres 17 (S4, S4b, S5b). S0 (no lifecycle change) accepts every payload, so the refusals come from the switch, not from a bad payload.

## Observed facts

- S4 (switch before anything landed): session `INSERT` refused 42501 "new row violates row-level security policy for table "sessions""; attendee refused 42501 (no parent session); `save_battery_run` refused 42501 "No authority to start run"; `submit_assessment` refused 42501 "No authority to submit assessment"; `set_letter_mastery` and `set_skill_mastery` return `applied`. State after: 0 sessions, 0 attendees, 0 assessments, 0 runs, 1 letter row and 1 maths row both with `programme: numeracy`.
- S4b (the session landed before the switch; control for the attendee): the attendee lands. Run and assessment are still refused ("No authority to start run", "No authority to submit assessment"); ticks applied and stamped `numeracy`. So the attendee is not programme-checked; in S4 it failed only because its parent session was refused.
- S5b (lost-response replay after the switch): the first uploads landed (session, attendee, assessment); after the switch the replayed session insert-or-ignore is refused 42501 although the server already holds the row, while the attendee replay (`OK`) and the assessment replay (`already_present`) are accepted. That session replay would put a saved session into a false terminal state on a 1.5.0 phone.
- Session rule: `sessions_insert_active_programme` requires `staff_programme_assignments.ended_at is null` for the session's programme (`20260521120147_masi_rls_advisor_cleanup.sql:361-372`); no later migration redefines it (`effective-write-policies.txt`).
- Run and assessment rule: both RPCs require an open programme assignment for `v_in.programme_id` on top of the access check (`20261023120000_whole_class_assessment_access.sql:213-219` for `submit_assessment`, :359-366 for `save_battery_run`); the access half already uses held-on-the-day, the programme half does not.
- Tick programme: `set_letter_mastery` stamps `programme_id` from the EA's *current* open assignment at upload (`20261021160000_letter_mastery_current_state.sql:208-212`); `set_skill_mastery` does the same (`20261101120000_skill_mastery_current_state.sql:110-114`). Ticks are accepted because the tick RPCs do not require a programme match, only a direct assignment.
- The repo's contract map presently calls the refusal correct: `documentation/rls-sync-contract-map.md:1092` ("a `42501` that needs one stays terminal, which is correct: a real programme-assignment denial"). That sentence must change with the fix (same-branch documentation rule).
- Client: `staff_programme_assignments` is never pushed or tracked as pending local evidence, so the 1.5.0 classifier (`offlineSync.js:468-499`, same at f002e08 :488) has no way to treat the 42501 as retriable.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The programme check uses the EA's current programme assignment, so a switch strands earlier-programme work | S4, S4b, S5b; S0 control accepts the same payloads | Fix not yet applied | 85% | Red-first harness case (step 1), green after step 4 |
| The attendee is independently programme-checked | S4 refused | S4b: lands when its session exists | 5% | None needed |

## Root cause

Four write paths decide programme authority from the EA's open programme assignment at upload time: the `sessions` insert policy, `save_battery_run`, `submit_assessment`, and (for stamping) the two tick RPCs. When Head Office ends the literacy assignment and opens numeracy before the phone uploads, the session, run and assessment are refused 42501 and the 1.5.0 engine makes that terminal; the ticks are accepted but labelled with the new programme because the label is read from the current assignment instead of the work. Replays of an already-saved session are refused for the same reason (S5b).

## Suggested fix

Approved by Jim on 2026-11-04.

- Step 4, held-on-the-day history authority: the programme check becomes as-of the work's SAST day (the EA held that programme then), for the session insert policy, `save_battery_run` and `submit_assessment`. Decision: accept old-programme work after a switch, stamped with the old programme, so the ticks keep the programme the EA taught under.
- Step 1, compatibility gate: S4, S4b and S5b as red-first cases; also update the contract-map sentence at line 1092.
- 1.5.0 phones need no update: the change is server-side.

## Verification plan

- [ ] Reproduce S4/S4b/S5b on staging with 1.5.0 payloads before the fix.
- [ ] Add the frozen 1.5.0 cases to the harness; they must fail before step 4.
- [ ] Verify step 4: old-programme sessions, runs, assessments and ticks land and keep the old programme; work dated after the switch for the old programme is still refused.
- [ ] Two-phone 1.5.0 device check (A03s): offline literacy lesson, Head Office switches programme, reconnect.
- [ ] Verify backend convergence and stamped programme on the server.
- [ ] Identify the migration containing the fix; update `documentation/rls-sync-contract-map.md`.
- [ ] Field sweep via `/bug-sync` after the first real programme switch.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | S4, S4b, S5b; docs/bugs/evidence/MA-BUG-20261104-001/ |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #153; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-safety-server |
| 2026-11-05T09:00:00Z | Claude | Fixed in code, locally tested (not merged, not applied, not released) | feat/lifecycle-safety-server: lifecycle-compat harness 77/77 on disposable PG17 (red 13/68 before), all 14 PG harnesses green. Independent adversarial reviews of the server batch and the combined OTA; their findings fixed. Next: staging apply + two-phone 1.5.0 check (#157), OTA gate (#158) |

## Open questions

- No client chain was run for this trigger: the local outbox state (terminal, Home card) is inferred from the shared classifier, not observed. The step 1 harness case should run it through the engine.
- How should dashboards read a tick whose stored programme differs from the programme the child's session used? Out of scope for the fix, but worth a look before reporting v2.
