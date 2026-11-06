---
record_version: 1
id: MA-BUG-20261106-002
title: A coach's new class reached the server without the coach's class assignment, so no one holds it
classification: unknown
subsystem: sync-upload-class-assignment

severity_score: 2
severity_band: S3
severity_components:
  user_impact: 0
  data_security_privacy: 1
  scope: 0
  recoverability: 1
severity_override: none
priority: P2

diagnosis_state: HYPOTHESIS
delivery_state: NO_FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 30
confidence_basis: Live rows show the class without any class_ea_assignments row; the push order and the class-save transaction make an interrupted or refused assignment upload plausible, but the phone's outbox has not been seen.

created_at_utc: 2026-11-06T20:10:00Z
updated_at_utc: 2026-11-06T20:12:22Z
first_observed_at: 2026-11-06T08:14:32.666Z
last_observed_at: 2026-11-06T20:11:08Z

known_occurrences: 1
known_affected_users: 1
affected_user_ids:
  - eb690000-9d90-4acb-8315-976c7fd42127
exposure_denominator: 74 classes created on 2026-11-06 (UTC) on masi-app-sqlite; 73 have a holder
exposure_window: 2026-11-06 (first day of real coach accounts on the retest backend)

environment: sqlite-staging (masi-app-sqlite), November 2026 retest; real coach field data
affected_releases:
  - unknown
affected_devices:
  - Android phone, model unknown (session user agent okhttp/4.12.0)
affected_os_versions:
  - unknown
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths:
  - scripts/lifecycle-invariants.sql
  - src/db/repositories/classesRepository.js
  - src/services/offlineSync.js
github_issues: []

data_safety_status: unknown; the class row is on the server, and its assignment has not arrived
workaround_status: unknown until the coach's phone is seen
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261106-002 — A coach's new class reached the server without the coach's class assignment, so no one holds it

## User-visible symptom

No one has reported a symptom. The daily lifecycle invariant check found it.

At 2026-11-06T19:27:12Z the `unheld_live_class` check returned class
`4935ff91-17c9-498d-8a53-69f76248bc12`: a live class with no `class_ea_assignments` row at all.
A real coach (`eb690000-9d90-4acb-8315-976c7fd42127`) created it at 08:14:32 UTC. On the
server, nobody holds the class and it has no children.

## Operational impact

- **Can the user continue?** Probably. The coach's phone has the class locally, and the creator
  can still read it (`classes_select_created_by`). Not confirmed on the phone.
- **Core workflow affected:** Class ownership on the server. Head Office reports and the
  assignment-scoped downloads do not attribute a class without a holder. If the coach signs in
  on another phone, or the app is reinstalled, the class may not appear in their class list.
- **Known affected users:** One coach.
- **Relevant exposed population:** Classes created by coaches on phones. 1 of 74 classes created
  on 2026-11-06 has no holder.
- **Workaround:** Unknown until the phone's outbox is seen.

## Data-safety assessment

- **UI visibility:** Unknown.
- **Durable local SQLite rows:** Unknown. When the phone saves a new class it writes the class and
  its assignment, and queues both uploads, in one transaction (`classesRepository.js` `saveClass`).
  So the assignment should be on the phone.
- **Backend rows and relationships:** `classes` row present: `created_at` = `updated_at` =
  2026-11-06 08:14:32.666+00, `row_version` 5, `archived_at` NULL. `class_ea_assignments` for
  the class: 0 rows. Children with this `class_id`: 0.
- **sync_outbox status, error_class/error_code:** Unknown; not seen.
- **Incident queue evidence:** No receipts from this coach.
- **Eventual convergence evidence:** None yet. Rechecked read-only at 2026-11-06T19:47Z and
  2026-11-06T20:11:08Z (the query's `now()`): still 0 assignment rows, 0 children,
  `row_version` 5.
- **Duplication, misattribution, or cross-account risk:** None seen.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Daily lifecycle invariant check, `unheld_live_class` | Coach `eb690000-9d90-4acb-8315-976c7fd42127` | 2026-11-06T08:14:32.666Z (class created) | 2026-11-06T19:27:12Z (check run) | unknown, sqlite-staging | Android (okhttp), model unknown | unknown | Read-only SQL below |

## Reproduction

### Reporter steps

1. Unknown. The coach signed in at 07:31 UTC and created the class at 08:14 UTC.

### Expected

The class and the coach's `class_ea_assignments` row both reach the server.

### Actual

Only the class row is on the server.

### Closest E2E reproduction

Not attempted.

## Observed facts

Read-only SQL on `segygjzpujphwvrubusm`, 2026-11-06 19:47 UTC:

- Class `4935ff91…`: `created_by` = the coach; `created_at` = `updated_at` =
  08:14:32.666+00 (millisecond precision, as a phone stamps it, not a server `now()`);
  `row_version` 5; not archived. 0 `class_ea_assignments` rows; 0 children.
- Classes created on 2026-11-06: 74. 73 have at least one assignment row. By `row_version`: 59 at
  2, 12 at 3, 1 at 4, 2 at 5.
- `row_version` is stamped by the phone (source at `origin/main` `ba148296`):
  `syncOutboxRepository.js` `updateInFlight` (lines 283-300) adds 1 each time a stamped operation
  is claimed for sending, and a `classes` insert is stamped. Only the restore of a refused claim
  rolls it back (lines 336-361). A local edit does not bump it by itself (its own `update` upload
  is stamped when claimed), and the server's `enforce_row_version` trigger only refuses a
  decrease. A new local class starts at 1 (the column default).
- Live schema, read 2026-11-06 20:08–20:11 UTC: the enabled `classes_set_updated_at` trigger sets
  `updated_at = now()` on every server UPDATE, and a `classes` insert is sent as an
  update-capable upsert (`offlineSync.js`: `classes` is not in `INSERT_OR_IGNORE_TABLES`). This
  class's `updated_at` still equals its millisecond `created_at`, so the server row has never been
  updated: it arrived in a single INSERT that carried `row_version` 5.
- The other classes created today (read 20:07 UTC): 58 of the 59 at `row_version` 2 have
  `updated_at` = `created_at` (one claim, one insert). All 12 at 3, the one at 4 (`f5bb86a4…`)
  and the other at 5 (`b99b7199…`) were updated on the server after creation (`updated_at` later
  than `created_at`), and all have a holder. This class is the only one created today above
  `row_version` 2 with no server update.
- Inference, not observed: the class insert was claimed for sending four times with no local
  edit, and the first three claims did not write the row (each send failed or was refused, or its
  pass stopped before sending); the fourth delivered it. The other classes above 2 can owe their
  versions to later updates, so they are no comparison for repeated sends.
- The coach: `staff_programme_assignments` row active since 2026-11-05 23:18:55, programme
  `9707ede3-14ab-4f56-bd5f-1179d034de1f`. No other rows: 0 class assignments, 0 child
  assignments, 0 children created, 0 time entries, 0 support receipts.
- `auth.users.last_sign_in_at` 2026-11-06 07:31:41. `auth.sessions`: one phone session (user
  agent `okhttp/4.12.0`) created 07:31:41, last refreshed 2026-11-06 12:05:56; one `node`
  session created 2026-11-05 23:29:51 that has never been refreshed (a script sign-in, which script
  is not verified).
  The phone was running and online at about 12:05 UTC, about four hours after the class arrived.
- Source (`origin/main` `ba148296`):
  - `classesRepository.js`: a local class save with no active programme throws ("classes.programme_id
    is required"), so a class cannot be saved without its assignment that way. Otherwise the
    assignment row and its `insert` outbox row are written in the same transaction as the class.
  - `offlineSync.js` `PUSH_ORDER`: `classes` is pushed second, `class_ea_assignments` seventh,
    so an upload pass can deliver the class and stop before the assignment.
  - A `42501`/`23503` refusal with no pending parent evidence, `23505` and `MV001` are terminal and
    would produce an `upload_terminal` receipt. Any other error code is retried with no receipt
    until the `upload_backlog_stale` check (oldest waiting row older than 24 hours, and a server
    response within 24 hours), so the earliest automatic signal is about 2026-11-07T08:14Z.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| H1. The upload pass stopped after the class and before the assignment (connection lost or app closed); the assignment waits in the phone's outbox | Push order; same-transaction save; no other uploads from the coach; `row_version` 5 on a never-updated row: three earlier claims did not write the class, so this phone's upload passes were failing or stopping after the class was saved | The phone was online with the app running at about 12:05 UTC, when a sync would normally send it | 25% | Recheck the class's assignment rows after the coach's next sync |
| H2. The assignment insert was refused and is retrying (non-terminal code), which sends no receipt for 24 hours | No receipt is expected yet; fits the 12:05 window; the class itself needed four claims, so sends from this phone were not landing on the first try | Nothing direct | 30% | An `upload_backlog_stale` receipt from this coach after 2026-11-07T08:14Z, or a Send diagnostics bundle |
| H3. The assignment insert was refused terminally and its receipt has not arrived | Fits the missing row | A terminal refusal is reported at the next sync status read and sent on the next drain; the phone was online at about 12:05 | 15% | An `upload_terminal` receipt from this coach |
| H4. The class was saved without an assignment because the phone had no active programme | First-day account | Source throws in that case; the coach has an active programme since 11-05 23:18 | 2% | None |
| H5. The class was written by something other than the coach's phone | None | Millisecond `created_at`, as a phone stamps it; `row_version` 5 on a single insert matches the phone's claim stamping, which a script or Head Office tool has no reason to write; not checked against Head Office tools | 5% | Ask Jim whether any script or dashboard created classes on 2026-11-06 |

## Root cause

Unknown.

## Suggested fix

No fix proposed. The sweep does not repair data; any repair uses the Head Office lifecycle script
with Jim's go-ahead.

## Verification plan

- [ ] Reproduce the original end-user workflow on the affected release or
      closest faithful environment.
- [ ] Add or identify a regression test that fails for the demonstrated causal
      mechanism.
- [ ] Verify the targeted correction locally.
- [ ] Run the closest representative E2E flow on a physical device when the
      bug is device-, lifecycle-, SQLite-, or network-sensitive.
- [ ] Verify local durability and backend convergence for data/sync incidents.
- [ ] Identify the exact release/build containing the fix.
- [ ] Obtain field confirmation or record an explicit observation window with
      sufficient exposure and no recurrence.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-06T08:14:32Z | Coach's phone | Class saved on the phone; it reached the server later, time unknown (inferred: on the fourth send claim) | `classes.created_at` (phone-stamped), `row_version` 5 |
| 2026-11-06T12:05:56Z | Coach's phone | Login refreshed (app running and online) | `auth.sessions.refreshed_at` |
| 2026-11-06T19:27:12Z | Claude | Daily invariant check: `unheld_live_class` hit | `scripts/lifecycle-invariants.sql` |
| 2026-11-06T19:47Z | Claude | Live rows rechecked read-only: still no assignment | SQL above |
| 2026-11-06T20:10:00Z | Claude | Recorded as a provisional lead | No database writes |
| 2026-11-06T20:11:08Z | Claude | Rechecked read-only: still no assignment, 0 children, `row_version` 5; live `classes` triggers listed | `now()` of the query; no database writes |

## Open questions

- What does the coach's outbox hold for `class_ea_assignments`? Next check: recheck the class
  after the coach next syncs (tomorrow's invariant run); if it is still unheld, ask the coach,
  through Jim, to send Profile → Support tools → Send diagnostics, and read the bundle's failed
  outbox rows.
