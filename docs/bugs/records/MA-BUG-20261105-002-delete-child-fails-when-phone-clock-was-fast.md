---
record_version: 1
id: MA-BUG-20261105-002
title: Delete child fails with an error when the phone's clock was fast when the child's rows were made
classification: product_defect
subsystem: lifecycle-delete-child

severity_score: 2
severity_band: S3
severity_components:
  user_impact: 2
  data_security_privacy: 0
  scope: 0
  recoverability: 0
severity_override: none
priority: P2

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 90
confidence_basis: A real-SQLite test with the EA's assignment and group membership starting 6 hours ahead fails with the local CHECK before the fix and passes after (9107d37c); not seen on a phone.

created_at_utc: 2026-11-05T17:25:14Z
updated_at_utc: 2026-11-05T17:25:14Z
first_observed_at: 2026-11-05
last_observed_at: 2026-11-05

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: EAs whose phone clock was ahead when a child's rows were made; unknown
exposure_window: lifecycle update fd053cfc (published to 1.5.0 pilot phones)

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - 1.5.0 lifecycle update fd053cfc
affected_devices: []
affected_os_versions: []
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths: []
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/156
  - https://github.com/JimMcKeown17/masi-app/issues/163

data_safety_status: nothing changes when it fails (single transaction); no data lost
workaround_status: wait until the phone's real time passes the row's start, or set automatic date and time on
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261105-002 — Delete child fails with an error when the phone's clock was fast when the child's rows were made

## User-visible symptom

Found by Claude while testing the lifecycle update; no EA report. The EA taps Delete child, sees an error, and the child stays exactly as it was.

## Operational impact

- **Can the user continue?** Yes; the child stays and can be used.
- **Core workflow affected:** Removing a child.
- **Known affected users:** 0 reported.
- **Relevant exposed population:** EAs whose phone clock ran ahead when the child's assignment or group rows were made (a phone with automatic date and time off).
- **Workaround:** Wait until real time passes the row's start; turn automatic date and time on.

## Data-safety assessment

- **UI visibility:** The child stays listed; an error shows.
- **Durable local SQLite rows:** Unchanged (the write is one transaction that rolls back).
- **Backend rows and relationships:** Not reached.
- **sync_outbox status, error_class/error_code:** No outbox row is written.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude's test and review of the lifecycle work | Claude | 2026-11-05 | 2026-11-05T17:25:14Z | `fd053cfc` (published lifecycle update) | real-SQLite test | n/a | `__tests__/headOfficeRestore.integration.test.js` in 9107d37c |

## Reproduction

### Reporter steps

1. Make a child (and its assignment and group membership) while the phone clock is hours ahead.
2. Put the clock right. Tap Delete child.

### Expected

The child leaves at once.

### Actual

Delete child errors and nothing changes.

### Closest E2E reproduction

Real-SQLite test (not a phone): the EA's assignment and group membership start 6 hours ahead. Before the fix: `SqliteError: CHECK constraint failed: unassigned_at is null or unassigned_at >= assigned_at`.

## Observed facts

- At `fd053cfc`, `src/db/repositories/childrenRepository.js` `removeChild` (line ~1006) ends `child_ea_assignments.unassigned_at` and `child_group_memberships.removed_at` at `removedAt = new Date().toISOString()` with no lower bound.
- Local CHECKs in `src/db/migrations.js`: `unassigned_at >= assigned_at` (~293, 329, 425) and `removed_at >= joined_at` (~443).
- Fixed in `feat/lifecycle-ota` at `9107d37c` (each end is `max(tap time, the row's start)`, lines ~1028 and ~1033). The same-cause stamp for a refused row is fixed in `e149a250`, which was never released.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| An unclamped end stamp before the row's start trips the CHECK | Test red then green | Not seen on a phone | 90% | None needed |

## Root cause

`removeChild` stamps the end of the EA's own rows at the tap time. A row made while the clock ran ahead starts later than that, so the update violates the local date-order CHECK and the whole delete is refused.

## Suggested fix

Done in `9107d37c`: end each row at the later of the tap time and the row's start (the server guard's rule 1).

## Verification plan

- [x] Add a regression test that fails for the mechanism (9107d37c).
- [x] Verify the correction locally.
- [ ] Run Delete child on a phone with a skewed row.
- [ ] Identify the release that contains it (`feat/lifecycle-ota`, OTA pending).

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T16:41:58Z | Claude | Fix committed | 9107d37c |
| 2026-11-05T17:25:14Z | Claude | Report recorded | Code read at fd053cfc |

## Open questions

- Is the rule "the later of tap time and row start" also right for rows made by Head Office on the server's clock?
