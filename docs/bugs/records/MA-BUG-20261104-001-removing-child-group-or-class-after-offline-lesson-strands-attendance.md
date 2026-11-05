---
record_version: 1
id: MA-BUG-20261104-001
title: "Removing a child, group or class after an offline lesson: the attendance and ticks are refused for good"
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
delivery_state: IN_PROGRESS
verification_state: NOT_TESTED

root_cause_confidence_pct: 85
confidence_basis: "Controlled reproductions in disposable PostgreSQL 17 (S1 refused, S1-control with history first lands everything) and in real SQLite through the production repositories and sync engine, whose recorded wire requests were replayed into the same Postgres with identical outcomes; the approved fix itself is not yet tested."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T02:30:00Z
first_observed_at: 2026-11-04T19:50:52Z
last_observed_at: 2026-11-04T19:51:09Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "every build that sends an archive before the lesson history; no field cohort has run these builds yet"

environment: "Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5 (server scenarios), and real SQLite (better-sqlite3, Node 20) through the production repositories and sync engine with the recorded PostgREST requests replayed into that Postgres (client chains). Synthetic fixture data only."
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
  - https://github.com/JimMcKeown17/masi-app/issues/156

data_safety_status: "Nothing lost on the phone: refused rows stay terminal in the local outbox and the local lesson still shows the child. The office copy permanently lacks the refused attendance and ticks. Never observed in the field."
workaround_status: "Before the removal only: let the phone finish syncing (history first lands everything, S1-control and C5c) before removing a child, group or class. After the refusal there is none from the phone; Sync now and Retry are refused again."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-001 — Removing a child, group or class after an offline lesson: the attendance and ticks are refused for good

## User-visible symptom

No field report; reproduced by Claude. An EA teaches a lesson with no signal, ticks a letter for a child, then
removes that child from the phone ("Delete child"), or archives the group or class the child was in. When the
phone next syncs, the lesson reaches the office but the removed child is not in it, and the tick never arrives.
Home says "2 items need attention". Sync now and Retry do nothing: the same two items come back.

## Operational impact

- **Can the user continue?** Yes. Other lessons and children sync normally.
- **Core workflow affected:** Attendance and letter ticks for the lesson that preceded the removal.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** Any EA who removes a child, group or class while lessons or ticks are still unsent. Offline gaps are routine in the field.
- **Workaround:** Let the phone finish syncing before removing anything. No safe repair from the phone afterwards.

## Data-safety assessment

- **UI visibility:** The phone still shows both children in the lesson (C2 local session children `D`, `C`); the office shows only the child whose access survived.
- **Durable local SQLite rows:** Kept. The attendee and `letter_mastery` rows are `sync_status = terminal` (C1 `localDomainStatus`).
- **Backend rows and relationships:** C1: session present, `attendees: []`, `letterMastery: []`. S1: 2 sessions, 0 attendees, 0 letter ticks, 0 maths ticks; the assessment and the run for the same child did land (held-on-the-day arm).
- **sync_outbox status, error_class/error_code:** `terminal` / `terminal` / `42501`, `retry_count` 0, `last_error` prefixed `42501-authenticated:`.
- **Incident queue evidence:** C1 queued two `upload_terminal` incidents (status pending).
- **Eventual convergence evidence:** None. Forced pass and Retry re-send both rows and are refused again (C1 requests #9-#10, #12-#13).
- **Duplication, misattribution, or cross-account risk:** None seen; the harm is missing attendance and ticks for a child whose access the EA held when the work happened.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Executed server scenarios S1, S1b, S1-control, S3, S7 | None (Claude) | 2026-11-04T19:51:09Z | 2026-11-05T01:00:00Z | Disposable PG17, 41 migrations at main 8b79eae5 | None | None | `repro-server-refusals/results.json` (c8083d01159f); raw `S1.out` 6e53abd27eb7, `S1b.out` f8f58a6b1f70, `S1-control.out` 608501c74b7f, `S3.out` c7cdfb28bc6d, `S7.out` 834d95d622bf; `effective-write-policies.txt` cc930bb685d8 |
| R2 | Executed client chains C1, C2, C5a-d | None (Claude) | 2026-11-04T19:50:52Z | 2026-11-05T01:00:00Z | Real SQLite at 8b79eae5, transport recorded and replayed into PG17 | None | Offline then reconnect (simulated) | `repro-client-archive-chain/observations.json` (256db1749b21); `wire-C1.json` 297fe6f5ec4f, `wire-C2.json` 0ceb7c0513e1, `wire-C5b.json` 3865bfcd8b06; `pg-replay-output.json` 55ad15e942de |

## Reproduction

### Reporter steps

1. Offline: record a group or class lesson that includes child C, and tick a letter for C (outbox: `sessions:insert`, `session_attendees:insert`, `letter_mastery:update`).
2. Still offline: Delete child C. The child has history, so the phone archives instead of deleting (C1 `deletedNoHistory: false`) and queues five archive rows.
3. Reconnect and sync once.

### Expected

The lesson, C's attendance and C's tick all reach the office; the archive applies afterwards.

### Actual

The five archive rows go first and succeed. The session lands, then C's attendee is refused 42501 and C's tick is refused 42501. Both go terminal.

### Closest E2E reproduction

C1 and C2 drive the production repositories and `offlineSync` over real SQLite; every recorded request was replayed into PostgreSQL 17 with all migrations and agreed with the fake server (C1 13/13, C2 11/11). Not yet run on a phone against `masi-app-sqlite`.

## Observed facts

- Push order, identical in 1.5.0 (`git show f002e08:src/services/offlineSync.js`, `ARCHIVE_PUSH_ORDER` :195-206, `sortByPushOrder` :1025): lifecycle (`archive`/`restore`) rows rank 0-7 and `child_ea_assignments` archive is last at 7; history tables rank by `PUSH_ORDER` index (sessions 12, session_attendees 13, then runs, assessments, letter ticks). On main the same code is `offlineSync.js:202-213` and `:1056-1071`.
- C1 pass 1 (`pushOrderPass1`): children, enrolments, class and group memberships and the child assignment PATCHed 200 (#1-#5); sessions 201 (#6); `session_attendees` 403 42501 "new row violates row-level security policy for table "session_attendees"" (#7); `set_letter_mastery` 403 42501 "Active child delivery assignment required" (#8). Totals: 6 synced, 2 terminal, 0 retriable.
- C2 (group lesson with C and healthy D, Delete C): 8 synced, 2 terminal. The two-row attendee batch is refused (#7), the engine falls back to singles: D lands (#8), C refused (#9); D's tick lands, C's refused.
- S1 (server, same order): archive rows accepted (`rows_affected` 1 each); sessions accepted; attendee refused 42501; run and assessment accepted; letter and maths ticks refused 42501. `ea_a_authority_after`: `write_for_child` C false, `delivers_to_child` C false.
- S1b: making the EA the child's creator changes nothing (attendee and ticks still refused); the `children` creator arm does not reach `current_user_can_write_for_child`.
- S1-control: the same payloads with history before the archive: all accepted, then the five archive rows accepted. Isolates the cause to ordering plus the loss of current access.
- S3 (archive group G, group-only child D): the session lands; the batch `[C, D]` is refused; singles: C lands (C still has a direct assignment), D refused; D's run and assessment land.
- S7 (archive class K, class-only child E): same shape; batch `[C, E]` refused; C lands, E refused; E's run and assessment land. E's letter tick is refused but S0 shows that is the baseline for a child with no direct assignment (see MA-BUG-20261104-002), so only the attendee refusal is attributable to the archive here.
- Why the engine gives up at once: `classifyError` (`offlineSync.js:468-499`) makes 42501 terminal unless `computeEvidencePending` (:401-453) finds a local pending *active* grant; `hasPendingActiveAssignment` (:335-345) requires `unassigned_at is null`, and the archived assignment is ended, so there is no evidence and the code is terminal on the first refusal. The classifier is byte-for-byte the same at f002e08 (:488).
- `archiveChild` (`childrenRepository.js:930-976`) ends the child's assignment, enrolment, class membership and group membership in the same transaction and queues an archive for each; unchanged at f002e08 (`git diff f002e08 HEAD` on the file shows only the added `skill_mastery` probe).
- Server rule: `private.current_user_can_write_for_child` (`20260521144901_masi_zazi_alignment_schema.sql:483-517`) is true only while a direct assignment, or a class/group assignment plus an active membership, is open. The attendee INSERT policy (:966-977) and UPDATE policy (:979-988) both require it. The effective `can_modify_session_attendee` is the later definition at :578-592 (it calls `current_user_can_write_for_child`); the `20260521142324` version (direct assignment only) is superseded (`effective-helper-functions.txt` 888112be61d0).
- Ticks: `set_letter_mastery` requires `current_user_delivers_to_child` (`20261021160000_letter_mastery_current_state.sql:22-35`, checked at :201), a direct, open `child_ea_assignments` row only; `set_skill_mastery` does the same (`20261101120000`:103).
- Assessments and runs land because `submit_assessment` and `save_battery_run` already accept `user_held_grant_on(child, day)` (`20261023120000_whole_class_assessment_access.sql:8-58`, used at :213 and :359). Attendance and ticks have no such arm.
- Client reorder probes: C5a (adding the history tables to `ARCHIVE_TABLE_DEPENDENCIES`, `offlineSync.js:88-112`) changes nothing (8 synced, 2 terminal, same requests). C5b (a patched engine copy moving the child-assignment archive after history) works in one pass (10 synced, 0 terminal; attendees C and D, ticks C and D, assignment ended last at #9; Postgres replay agrees 9/9). C5c (history first via the public `tableName` filter, then a full pass) works. C5d (C5b plus one transient 503 on the attendee upload) fails: pass 2 sends the assignment archive because the attendee rows are in backoff, and pass 3 gets 42501 for C (D lands).

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The server judges attendance and ticks by current access, and the phone sends the access-ending archive first, so the history is refused | S1 refused vs S1-control lands; C1/C2 reproduce through the real engine; Postgres replay agrees | Fix not yet applied | 85% | Red-first harness case replaying 1.5.0 wire shapes (fix step 1), green after step 4 |
| A creator or other arm of the policy would rescue the rows | None | S1b: still refused | 5% | None needed |
| The ordering is a one-line client bug | C5b works within a pass | C5a changes nothing; C5d breaks across passes (backoff) | 5% | None needed |

## Root cause

Attendance and letter/maths ticks are authorised against the EA's access *at upload time*, but the work happened earlier. When an EA removes a child (or archives a group or class), the phone queues the access-ending rows and the engine uploads them first (lifecycle rank 0-7 before history rank 12+). By the time the attendee and tick reach the server, `current_user_can_write_for_child` and `current_user_delivers_to_child` are false, so the server answers 42501. The 1.5.0 classifier treats that as a genuine rejection, so the rows go terminal and stay there. Assessments and runs survive only because they already use the held-on-the-day rule. The same mechanism applies when Head Office ends the access instead (MA-BUG-20261104-002).

A client-side reorder is not the fix: it works within one pass (C5b) but not across passes, because a transient failure puts the history in backoff while the archive goes through (C5a, C5d), and old 1.5.0 phones keep their order regardless.

## Suggested fix

Approved by Jim on 2026-11-04. Plan steps:

- Step 4, held-on-the-day history authority: accept attendance and letter/maths ticks when the EA held the child on the work's SAST day, extending `private.user_held_grant_on`. Decision: late ticks count if the EA delivered to the child when the tick was made. Server-only, so 1.5.0 phones are fixed without an update.
- Step 5 and step 8 (Delete child through the server): `delete_child_if_no_history` becomes actor-scoped, never hard-deletes and always returns true (leave or archive); the phone's Delete child goes through it. Decision: Delete child is "leave" when someone else still holds the child.
- Step 1, compatibility gate: write the cases red first (S1, S3, S7 and C1/C2 replayed with 1.5.0's own classifier) so they turn green with step 4.

## Verification plan

- [ ] Reproduce on 1.5.0 pilot builds against staging: offline lesson and tick, Delete child, sync; confirm the refusal first.
- [ ] Add the frozen 1.5.0 wire-shape cases (S1, S3, S7, C1, C2) to the Postgres harness; they must fail before step 4.
- [ ] Verify step 4 locally: S1, S3, S7 land attendance and ticks; S1-control still lands; ticks outside any held day are still refused.
- [ ] Two-phone 1.5.0 device check on the A03s: lesson plus tick offline, Delete child, reconnect; the office shows the attendance and tick.
- [ ] Verify local durability and backend convergence: no terminal rows, attendee and tick rows on the server.
- [ ] Identify the migration and (for steps 5/8) the build containing the fix.
- [ ] Field sweep during the November retest: `/bug-sync` and the daily invariant query find no 42501 attendee or tick receipts.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | S1, S1b, S1-control, S3, S7; C1, C2, C5a-d; docs/bugs/evidence/MA-BUG-20261104-001/ |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #153, #156; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-safety-server, feat/lifecycle-ota-removal |

## Open questions

- Does the office dashboard show a session with zero attendees as a lesson that happened? (Affects how visible the loss is before the fix.)
- The client chains ran in a simulated offline gap, not on a phone; the A03s check above is the first device proof.
