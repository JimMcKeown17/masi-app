---
record_version: 1
id: MA-BUG-20261105-010
title: A group with no children shows in the lesson picker as a row with no name, only "Not seen yet"
classification: product_defect
subsystem: lesson-picker

severity_score: 1
severity_band: S3
severity_components:
  user_impact: 1
  data_security_privacy: 0
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: PROBABLE
delivery_state: NO_FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 80
confidence_basis: The picker titles each group row by joining its members' first names, includes groups with no members, and the server shows the Test EA has exactly two active groups with zero live members; not yet reproduced by emptying a fresh group.

created_at_utc: 2026-11-05T22:35:00Z
updated_at_utc: 2026-11-05T22:35:00Z
first_observed_at: 2026-11-05T21:34:00Z
last_observed_at: 2026-11-05T22:10:00Z

known_occurrences: 2
known_affected_users: 1 (test)
affected_user_ids:
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef
exposure_denominator: unknown
exposure_window: unknown

environment: sqlite-staging (segygjzpujphwvrubusm), pilot preview channel
affected_releases:
  - 1.5.0+6 (Android build 58, update 01a1ad71, source ab9e16f)
affected_devices:
  - Samsung Galaxy A03s (SM-A037U)
affected_os_versions:
  - Android 13
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths:
  - docs/bugs/user-submissions-walkthrough/MA-BUG-20261105-010/ (private, gitignored; hash below)
github_issues: []

data_safety_status: No data risk
workaround_status: Ignore the blank rows; Head Office could archive the empty groups
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261105-010 — A group with no children shows in the lesson picker as a row with no name, only "Not seen yet"

## User-visible symptom

Record → **Who are you teaching?** → **Other groups** lists two rows with a coloured dot, no name and
the subtitle "Not seen yet", between named rows such as "Nola" and "Asanda".

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** Choosing a group to teach (cosmetic confusion).
- **Known affected users:** 1 (test EA).
- **Relevant exposed population:** EAs who still hold a group after all its children were removed
  (unknown).
- **Workaround:** Ignore the rows.

## Data-safety assessment

- **UI visibility:** Two nameless rows.
- **Durable local SQLite rows:** Not inspected; the phone's `groups` count (10) matches the server's
  10 active assigned groups.
- **Backend rows and relationships:** Test EA groups `f1c57ce4-3851-45b4-bf42-7c35e5f951c4`
  ("Group 2", created 2026-05-25) and `bf42db50-deda-42e7-b731-fad9dd775d39` ("Group 4", created
  2026-05-26) are actively assigned (`group_ea_assignments.unassigned_at` null), not archived, and
  have no `child_group_memberships` with `removed_at` null for a non-archived child.
- **sync_outbox status, error_class/error_code:** 0 rows (bundle `dg:7681d755`).
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Phone and server agree.
- **Duplication, misattribution, or cross-account risk:** None seen. What tapping a nameless row does
  is untested.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, manual walkthrough | Test EA | 2026-11-05 23:34 SAST | 2026-11-05T21:40:00Z | 1.5.0+6, sqlite-staging | Galaxy A03s, Android 13 | Wi-Fi | `23-picker.png` |
| R2 | `phone-health-check` test agent + `device:server-check` FLAG `empty_active_groups` | Test EA | 2026-11-06 00:10 SAST | 2026-11-05T22:20:00Z | 1.5.0+6, sqlite-staging | Galaxy A03s, Android 13 | Wi-Fi | server-check output |

Private screenshot (SHA-256), under `docs/bugs/user-submissions-walkthrough/MA-BUG-20261105-010/`:
`23-picker.png` 26b487769b88cd421a638c792b4800fa76842d644fa4910ac694edf96be4b3d7. It shows test
children's names, so it stays out of Git.

## Reproduction

### Reporter steps

1. Sign in as an EA who holds a group with no children left in it.
2. Tap Record.

### Expected

Empty groups are left out, or shown with their group name and a "No children" note.

### Actual

A row with no title and "Not seen yet".

### Closest E2E reproduction

Seen twice on the A03s as the Test EA. Not yet reproduced by emptying a fresh group.

## Observed facts

- `GroupLessonRow` titles a row with `row.members.map(child => child.firstName).join(' & ')`
  (`src/components/lessons/GroupLessonRow.js:9`); `UpNextCard` does the same.
- `loadPickerRanking` maps every group passed in to a row, with `members` from
  `getChildrenInGroup`, including groups whose member list is empty
  (`src/lessonPlan/inputs/lessonInputs.js:106-130`).
- `device:server-check` reports exactly these two group ids under `empty_active_groups`.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| Groups with zero members reach the picker and get an empty member-name title | Code path above; the server's two empty groups match the two blank rows | Not reproduced on a fresh group | 80% | Remove the last child from a test group and open Record |

## Root cause

Probable: the picker builds a row for every assigned, unarchived group and names it from its current
members. Removing a group's last child (or archiving it) leaves the group active, so it renders with
an empty title. The two groups date from May 2026 test data.

## Suggested fix

Leave groups with no members out of the picker (or show the group name with "No children yet"), and
decide whether removing a group's last child should end the EA's group assignment. Not approved.

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
| 2026-11-05T21:34:00Z | Claude | Seen during a manual walkthrough | `23-picker.png` |
| 2026-11-05T21:52:00Z | Claude | Server check: two active groups with zero live members | read-only SQL |
| 2026-11-05T22:35:00Z | Claude | Report recorded | Initial intake (`/bug-user`, RECORD_AND_TRIAGE) |

## Open questions

- What does tapping a nameless row do (a lesson with nobody in it)?
- Should removing a group's last child end the group for that EA?
