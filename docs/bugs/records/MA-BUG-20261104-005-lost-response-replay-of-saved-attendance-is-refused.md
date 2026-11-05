---
record_version: 1
id: MA-BUG-20261104-005
title: "If the network drops the server's reply, re-sending attendance the server already saved fails as 'not allowed'"
classification: product_defect
subsystem: sync-authorization

severity_score: 6
severity_band: S2
severity_components:
  user_impact: 2
  data_security_privacy: 2
  scope: 1
  recoverability: 1
severity_override: none
priority: P1

diagnosis_state: CONFIRMED
delivery_state: RELEASED
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 80
confidence_basis: "Controlled Postgres 17 scenario S5 replays 1.5.0's attendee merge upsert for a row the server already holds and gets 42501 once access has ended, while the session, run, assessment and tick replays are acknowledged; variants without RETURNING and with insert-or-ignore are refused identically, which isolates the INSERT policy check. The real lost-response path through the sync engine was not executed."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T15:44:00Z
first_observed_at: 2026-11-04T19:51:09Z
last_observed_at: 2026-11-04T19:51:09Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres before the November 2026 EA retest"
exposure_window: "any upload whose reply is lost before the EA's access to the child ends; no field cohort has run these builds yet"

environment: "Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5; the replay is the recorded 1.5.0 wire shape sent a second time after Head Office ended the EA's access. Synthetic fixture data only."
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

data_safety_status: "The attendance row is on the server; the phone wrongly marks it terminal and tells the EA it needs attention. No data lost, but a false failure that is not self-clearing. Never observed in the field."
workaround_status: "None needed for the data (the office already has it); the phone keeps the false terminal row until fix step 7 resolves it to server truth."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-005 — If the network drops the server's reply, re-sending attendance the server already saved fails as 'not allowed'

## User-visible symptom

No field report; reproduced by Claude. An EA's attendance is saved by the office, but the reply is lost on a weak
connection, so the phone does not know and keeps the item queued. Before the next try, access to that child ends
(an EA-side removal or a Head Office handover). On the next sync the phone re-sends the attendance, is told "not
allowed", and shows "1 item needs attention", even though the office already has the record. Nothing the EA does
makes the warning go away.

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** None for data; the false warning blocks a clean "all synced" state and costs support time.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** EAs on weak connections who also lose access to a child soon after teaching. Narrower than the sibling records.
- **Workaround:** None needed for the data; the false warning remains.

## Data-safety assessment

- **UI visibility:** The phone shows the item needing attention; the office shows the attendance correctly.
- **Durable local SQLite rows:** Expected: the attendee row goes `terminal` locally (inferred from the shared classifier, not executed for this scenario).
- **Backend rows and relationships:** S5: the session, attendee, run, assessment, letter tick and maths tick are all present from the first upload (1 session, 1 attendee, 1 assessment, 1 run, 1 of each tick) and remain after the refused replay.
- **sync_outbox status, error_class/error_code:** Server answers 42501; expected `terminal` / `42501`.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** The server already has the row; the phone never learns it.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Executed server scenario S5 (with three non-client variants) | None (Claude) | 2026-11-04T19:51:09Z | 2026-11-05T01:00:00Z | Disposable PG17, 41 migrations at main 8b79eae5 | None | Reply lost (simulated by replaying the request) | `repro-server-refusals/results.json` (c8083d01159f); raw `S5.out` eed19824a8ec; `effective-write-policies.txt` cc930bb685d8; `effective-helper-functions.txt` 888112be61d0 |

## Reproduction

### Reporter steps

1. EA A uploads session, attendee, run, assessment and ticks for child C; the server saves all of it.
2. The reply is lost; the phone keeps the attendee queued.
3. Head Office ends A's direct assignment, class membership and group membership for C.
4. The phone re-sends the same attendee (merge upsert) and the other items.

### Expected

The server recognises the row it already holds and acknowledges it, as it does for the other items.

### Actual

Session insert-or-ignore: accepted, 0 rows. Run replay: `unchanged`. Assessment replay: `already_present`. Letter and maths tick replays: `applied`. Attendee merge upsert: refused 42501 "new row violates row-level security policy for table "session_attendees"".

### Closest E2E reproduction

Postgres replay of the recorded 1.5.0 request shapes. The lost-response timing was simulated by sending the request twice, not by dropping a reply in the sync engine.

## Observed facts

- 1.5.0 sends attendees as a merge upsert: `.upsert(payloads, { onConflict: 'id', ignoreDuplicates: false })` for `session_attendees` (`offlineSync.js` main :798/:815; f002e08 :767/:784), i.e. `INSERT ... ON CONFLICT (id) DO UPDATE`.
- S5 replay results are listed above; `write_for_child` for C is false after the end (`ea_a_authority_after`).
- Variants (not what the client sends, run to isolate the cause): attendee merge upsert *without* `RETURNING` is refused 42501, which rules out SELECT visibility as the cause; attendee insert-or-ignore is also refused 42501, which rules out the UPDATE arm as the sole cause.
- Policies: `session_attendees_insert_active_assignment` (INSERT, `20260521144901_masi_zazi_alignment_schema.sql:966-977`) requires `current_user_can_write_for_child(child_id)`; `session_attendees_update_own_session_active_assignment` (UPDATE, :979-988) requires `can_modify_session_attendee` and `current_user_can_write_for_child`. The effective `can_modify_session_attendee` is the later definition at :578-592 (any open direct, class or group path), not the direct-only `20260521142324` version, which it supersedes (`effective-helper-functions.txt`).
- PostgreSQL evaluates an INSERT policy's WITH CHECK against the proposed row before it looks for the conflict. The insert-or-ignore variant, which cannot reach the UPDATE arm, being refused is the direct evidence that the INSERT arm refuses first. The UPDATE arm would refuse next if reached.
- RPC replays are acknowledged because those functions confirm an existing receipt before testing authority (`submit_assessment` comment "A committed family is confirmed before checking current assignments", `20261023120000_whole_class_assessment_access.sql:209`; `set_letter_mastery` skips the access test when the correction id exists, `20261021160000_letter_mastery_current_state.sql:198-203`).
- Related, same mechanism for sessions after a programme switch: S5b in MA-BUG-20261104-003.
- 1.5.0 classification: 42501 with no local pending active grant is terminal (`offlineSync.js:468-499`, f002e08 :488).

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The attendee INSERT check (and then UPDATE check) judges an already-saved row by current access | S5; insert-or-ignore and no-RETURNING variants refused identically | Client-side lost-response path not executed | 80% | Run a dropped-reply chain through the sync engine (step 1 harness) |
| The refusal is the UPDATE policy only (brief's first hypothesis) | UPDATE USING also needs current access | Insert-or-ignore variant never reaches UPDATE and is still refused | 5% | None needed |
| SELECT-visibility on the conflicting row | Documented upsert gotcha | The no-RETURNING variant is refused too | 5% | None needed |

## Root cause

A replay of a row the server already holds is judged like a brand-new write. For attendees, the INSERT policy's WITH CHECK runs on the proposed row first and uses current access (`current_user_can_write_for_child`); once the EA's access has ended, it refuses. (The UPDATE policy, reached only if the INSERT check passed, uses the same test.) The sessions, runs, assessments and ticks avoid this only by confirming an existing record first or by their own tests; attendance has no such path. The 1.5.0 engine then classifies the 42501 as a genuine rejection and quarantines work the office already has.

## Suggested fix

Approved by Jim on 2026-11-04.

- Step 4, held-on-the-day history authority: both the attendee INSERT arm and the UPDATE arm move to "the EA held the child on the work's day", so a replay of an already-saved attendee passes. Server-only; fixes 1.5.0 phones.
- Step 7 (OTA): a refused row whose receipt shows the server has it resolves to server truth, so existing false-terminal rows clear.
- Step 1: S5 as a red-first case.

## Verification plan

- [ ] Reproduce S5 on staging with the 1.5.0 attendee request before the fix.
- [ ] Add S5 (and the lost-reply timing through the sync engine) to the frozen 1.5.0 harness; it must fail before step 4.
- [ ] Verify step 4: replayed attendee is acknowledged after access ends; a brand-new attendee for a child never held is still refused.
- [ ] Two-phone 1.5.0 device check (A03s): drop the reply (airplane mode at the right moment), end access, reconnect.
- [ ] Verify the phone has no terminal row and the server has exactly one attendee row.
- [ ] Identify the migration containing the fix.
- [ ] Field sweep: no `session_attendees` 42501 receipts for rows that exist on the server.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | S5 and its three variants; docs/bugs/evidence/MA-BUG-20261104-001/ |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #153; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-safety-server |
| 2026-11-05T09:00:00Z | Claude | Fixed in code, locally tested (not merged, not applied, not released) | feat/lifecycle-safety-server: lifecycle-compat harness 77/77 on disposable PG17 (red 13/68 before), all 14 PG harnesses green. Independent adversarial reviews of the server batch and the combined OTA; their findings fixed. Next: staging apply + two-phone 1.5.0 check (#157), OTA gate (#158) |
| 2026-11-05T15:44:00Z | Claude | Released | Server batch applied to staging `segygjzpujphwvrubusm` at 15:39 UTC from `feat/lifecycle-safety-server` 09fb332a (PR #161; before/after checks in its build log, b15fb722). Not merged yet. Phones run the update from their second launch after it downloads. The device, uptake and field checks are still open (#157, #158, #159) |

## Open questions

- The assignment named the UPDATE policy as the root cause; the evidence points to the INSERT policy refusing first (variants above). The approved fix covers both arms, so the plan is unchanged.
- `data_security_privacy: 2` was given centrally; because the data is on the server and only the phone's state is wrong, 1 may fit better. Kept at the given value.
- The dropped-reply timing has not been run through the sync engine; confidence is held at 80% for that reason.
