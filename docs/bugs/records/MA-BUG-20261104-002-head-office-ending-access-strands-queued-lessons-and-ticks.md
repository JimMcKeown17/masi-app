---
record_version: 1
id: MA-BUG-20261104-002
title: "When Head Office ends an EA's access to a child, the EA's queued lessons and ticks are refused for good"
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
priority: P1

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 85
confidence_basis: "Controlled Postgres 17 scenario (S2) refuses attendance and ticks after Head Office ends access, and three real-SQLite chains (C3a, C3b, C3c) through the production sync engine reproduce it with the recorded requests replayed into the same Postgres; the same payloads land when history goes first (MA-BUG-20261104-001 control). The approved fix is not yet tested."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T09:00:00Z
first_observed_at: 2026-11-04T19:50:52Z
last_observed_at: 2026-11-04T19:51:09Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "any time Head Office ends an EA's access to a child while that EA's phone still holds unsent work; no field cohort has run these builds yet"

environment: "Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5 (S2), and real SQLite (better-sqlite3, Node 20) through the production repositories and sync engine with recorded PostgREST requests replayed into that Postgres (C3a-c). Synthetic fixture data only."
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
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-client-archive-chain/
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/153

data_safety_status: "Nothing lost on the phone (refused rows stay terminal locally); the office copy permanently lacks the refused attendance and ticks. Never observed in the field."
workaround_status: "Interim drain-first rule: Head Office does not end or hand over an EA's child until that EA's phone shows everything synced. The rule lapses once held-on-the-day (fix step 4) is live. After a refusal there is no safe repair from the phone."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-002 — When Head Office ends an EA's access to a child, the EA's queued lessons and ticks are refused for good

## User-visible symptom

No field report; reproduced by Claude. An EA records a lesson and ticks letters while offline. Meanwhile Head Office
ends that EA's access to one of the children (a handover, or removing the child from the EA's class or group).
When the EA's phone syncs, the lesson arrives but the child is missing from it and that child's tick is gone.
Home shows "1 item needs attention" or "2 items need attention" and the items cannot be cleared by syncing again.
The EA did nothing wrong and cannot tell why.

## Operational impact

- **Can the user continue?** Yes; other children and lessons sync.
- **Core workflow affected:** Attendance and letter ticks recorded before Head Office changed access.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** EAs with unsent work at the moment of a handover or removal. Handovers are routine; offline lag is routine.
- **Workaround:** Drain first (above). No repair from the phone afterwards.

## Data-safety assessment

- **UI visibility:** The phone keeps showing the child in the lesson; the office does not (C3b/C3c `attendeesOnServer: ["D"]`).
- **Durable local SQLite rows:** Kept as `terminal`.
- **Backend rows and relationships:** S2: 2 sessions, 0 attendees, 0 letter ticks, 0 maths ticks; the assessment and run for the same child landed. C3a: both attendees landed, only the tick was refused.
- **sync_outbox status, error_class/error_code:** `terminal` / `terminal` / `42501` (`letter_mastery:update` and, in C3b/C3c, `session_attendees:insert`).
- **Incident queue evidence:** Not recorded for C3 (the chain logs the Home card and outbox only).
- **Eventual convergence evidence:** None; the forced pass re-sends and is refused again (C3a #5, C3b/C3c second pass).
- **Duplication, misattribution, or cross-account risk:** None seen.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Executed server scenario S2 | None (Claude) | 2026-11-04T19:51:09Z | 2026-11-05T01:00:00Z | Disposable PG17, 41 migrations at main 8b79eae5 | None | None | `repro-server-refusals/results.json` (c8083d01159f); raw `S2.out` 7b1cfc09ec5e; `effective-helper-functions.txt` 888112be61d0 |
| R2 | Executed client chains C3a, C3b, C3c | None (Claude) | 2026-11-04T19:50:52Z | 2026-11-05T01:00:00Z | Real SQLite at 8b79eae5, requests replayed into PG17 | None | Offline then reconnect (simulated) | `repro-client-archive-chain/observations.json` (256db1749b21); `wire-C3a.json` 7d45165c5830, `wire-C3b.json` 246d01b281aa, `wire-C3c.json` 72f7f35ef23c; `pg-replay-output.json` 55ad15e942de |

## Reproduction

### Reporter steps

1. Offline: record a lesson with children C and D and tick a letter for each.
2. Head Office ends the EA's access to C (in S2/C3b/C3c: direct assignment, class membership and group membership; in C3a: direct assignment only).
3. The EA's phone reconnects and syncs (with or without a pull first).

### Expected

The lesson, both attendees and both ticks arrive: the EA held C when the work was done.

### Actual

The session lands. C's attendee and C's tick are refused 42501. D's land.

### Closest E2E reproduction

C3a-c drive the production repositories and `offlineSync` over real SQLite with Head Office changes applied to the fake server; their wire requests replayed into PostgreSQL 17 agreed with the fake (C3a 5/5, C3b 8/8, C3c 8/8). Not yet run with a real Head Office change on a phone.

## Observed facts

- S2: Head Office ends C's `child_ea_assignments`, class membership and group membership (no child archive). Then the phone's uploads: sessions accepted (group and class); attendee refused 42501 "new row violates row-level security policy for table "session_attendees""; run and assessment accepted; `set_letter_mastery` and `set_skill_mastery` refused 42501 "Active child delivery assignment required". `write_for_child` C false.
- C3a (Head Office ends only the direct assignment; phone pulled with reconcile, so its local assignment is ended): the two-attendee batch lands 201 (C is still writable through the open class and group membership); `set_letter_mastery` for C is refused 42501; D's lands. Outcome: 1 item needs attention, `attendeesOnServer: ["D","C"]`. Ticks use `current_user_delivers_to_child`, which counts the direct assignment only (`20261021160000_letter_mastery_current_state.sql:22-35`, checked at :201; `20261101120000_skill_mastery_current_state.sql:103`), so ending just the direct assignment strands just the tick.
- C3b (all three ended, phone did not pull): batch refused, singles: D lands, C refused; C's tick refused; 2 items need attention. Local assignment still shows open (`ended: null`), yet the server refuses: the phone cannot know.
- C3c (all three ended, phone pulled and reconciled first): identical outcome to C3b. A pull cannot rescue the queued rows because the refusal is about the past work, not the phone's stale view.
- Attendee policies `session_attendees_insert_active_assignment` (:966-977) and `..._update_own_session_active_assignment` (:979-988) in `20260521144901_masi_zazi_alignment_schema.sql` both require `current_user_can_write_for_child` (:483-517: open direct assignment, or open class/group assignment plus open membership).
- Assessments and runs landed in S2 because `submit_assessment` and `save_battery_run` accept `user_held_grant_on` (`20261023120000_whole_class_assessment_access.sql:8-58`, used at :213 and :359); attendance and ticks do not.
- The 1.5.0 classifier is the same as main (`classifyError`, `offlineSync.js:468-499`; f002e08 :488): 42501 with no local pending *active* grant is terminal at once. The ended-by-Head-Office grant leaves no pending evidence, so there is no retry.
- The same mechanism drives MA-BUG-20261104-001 (the EA ends access themselves); this record is limited to Head Office ending access while the EA's work is queued.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| Attendance and ticks are judged by current access; a Head Office end before upload makes them permanently refused | S2; C3a-c; control with history first lands everything (S1-control in the sibling record) | Fix not yet applied | 85% | Red-first case replaying 1.5.0 shapes (step 1); green after step 4 |
| A fresh pull would repair the phone's view | None | C3b and C3c are identical | 5% | None needed |
| Only the tick (not the attendee) is affected when just the direct assignment ends | C3a | None | 90% | Covered by the same harness case |

## Root cause

The server authorises history by the EA's current access when the upload arrives, not by the access the EA held on the day of the work. Head Office ending the access (assignment, class membership or group membership) between the lesson and the upload makes `current_user_can_write_for_child` and `current_user_delivers_to_child` false, so the attendee and tick are refused 42501. The 1.5.0 engine classifies that as terminal on the first refusal and never retries it. Ticks are stricter than attendance because they require the direct assignment specifically, which is why ending only the direct assignment strands only the tick.

## Suggested fix

Approved by Jim on 2026-11-04.

- Step 4, held-on-the-day history authority: attendance and ticks are accepted when the EA held the child on the work's SAST day, extending `private.user_held_grant_on`. Decision: late ticks count if the EA delivered to the child when the tick was made. Server-only, so 1.5.0 phones benefit without an update.
- Step 1, compatibility gate: S2 and C3a-c as red-first cases judged by 1.5.0's own classifier.
- Until then, the drain-first rule above applies to Head Office lifecycle edits; step 6 (the three-command script and the daily check) later makes it routine.

## Verification plan

- [ ] Reproduce on a 1.5.0 pilot build against staging: queue a lesson and tick offline, end the EA's access to one child in Head Office, reconnect.
- [ ] Add S2 and C3a-c to the frozen 1.5.0 harness; they must fail before step 4.
- [ ] Verify step 4 locally: attendance and ticks land when the grant covered the work day; still refused for a child the EA never held.
- [ ] Two-phone 1.5.0 device check (A03s): EA phone offline with a lesson and tick, Head Office ends access, EA reconnects.
- [ ] Verify backend convergence: attendee and tick rows on the server; no terminal rows on the phone.
- [ ] Identify the migration containing the fix.
- [ ] Field sweep: the daily read-only invariant query and `/bug-sync` show no 42501 attendee or tick receipts after handovers.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | S2; C3a, C3b, C3c; docs/bugs/evidence/MA-BUG-20261104-001/ |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #153; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-safety-server |
| 2026-11-05T09:00:00Z | Claude | Fixed in code, locally tested (not merged, not applied, not released) | feat/lifecycle-safety-server: lifecycle-compat harness 77/77 on disposable PG17 (red 13/68 before), all 14 PG harnesses green. Independent adversarial reviews of the server batch and the combined OTA; their findings fixed. Next: staging apply + two-phone 1.5.0 check (#157), OTA gate (#158) |

## Open questions

- Does the pilot plan include a handover of a child between EAs inside the November retest window? If so the drain-first rule is needed from day one.
