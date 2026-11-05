---
record_version: 1
id: MA-BUG-20261105-003
title: A download that ends a row the office removed can fail on a row the phone made while its clock was fast
classification: product_defect
subsystem: pull-reconcile

severity_score: 3
severity_band: S3
severity_components:
  user_impact: 2
  data_security_privacy: 1
  scope: 0
  recoverability: 0
severity_override: none
priority: P2

diagnosis_state: PROBABLE
delivery_state: NO_FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 65
confidence_basis: The unclamped end stamps and the CHECKs are read directly in the code and the failure path is traced; no run on SQLite or a phone has reproduced it.

created_at_utc: 2026-11-05T17:25:14Z
updated_at_utc: 2026-11-05T17:25:14Z
first_observed_at: unknown
last_observed_at: unknown

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: EAs whose phone clock was ahead when a row was made, and whom the office later removed; unknown
exposure_window: every build with pull reconcile (main a8f5db2a)

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - main a8f5db2a
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
github_issues: []

data_safety_status: unknown; durable rows are kept, but a removal may not show on the phone until real time passes the row's start
workaround_status: turn automatic date and time on; the removal applies once the clock passes the row's start (hypothesis)
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261105-003 — A download that ends a row the office removed can fail on a row the phone made while its clock was fast

## User-visible symptom

None reported. Found by Claude while checking MA-BUG-20261105-002 for the download side of the same cause. Hypothesised symptom: after the office removes an EA from a child, class or group, the phone keeps showing it.

## Operational impact

- **Can the user continue?** Yes (hypothesis).
- **Core workflow affected:** Seeing removals made by the office.
- **Known affected users:** 0.
- **Relevant exposed population:** As in 002, plus an office removal of that same row.
- **Workaround:** Automatic date and time on.

## Data-safety assessment

- **UI visibility:** Hypothesis: the removed item stays listed.
- **Durable local SQLite rows:** Hypothesis: kept; the server rows are saved by the per-row retry.
- **Backend rows and relationships:** Server has the row ended; server guards still refuse the EA's writes.
- **sync_outbox status, error_class/error_code:** Not involved.
- **Incident queue evidence:** None checked (no live access in this intake).
- **Eventual convergence evidence:** Hypothesis: converges once real time passes the row's start.
- **Duplication, misattribution, or cross-account risk:** A stale visible child, not a leak.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, code reading | Claude | 2026-11-05 | 2026-11-05T17:25:14Z | main `a8f5db2a` | none | n/a | File and line references below |

## Reproduction

### Reporter steps

1. Make a child's assignment (or class or group membership) while the phone clock is ahead; let it sync.
2. Put the clock right. The office removes the EA.
3. Pull on the phone.

### Expected

The removal applies locally.

### Actual

Not run. Traced from code below.

### Closest E2E reproduction

Not attempted.

## Observed facts

Observed in code (main `a8f5db2a`):

- Pull reconcile ends rows absent from the download at `pulledAt = new Date().toISOString()` (`src/context/ChildrenContext.js:199`, `src/context/ClassesContext.js:283`), with no lower bound at the row's start:
  - `src/db/repositories/childrenRepository.js:163-169` (`child_ea_assignments.unassigned_at`; CHECK `src/db/migrations.js:293`)
  - `childrenRepository.js:229-236` (`child_programme_enrollments.ended_at`; CHECK :310)
  - `childrenRepository.js:284-290` and `:328-334` (`child_class_memberships.exited_at`; CHECK :386)
  - `src/db/repositories/groupsRepository.js:225-231` (`child_group_memberships.removed_at`; CHECK :443)
  - `src/db/repositories/classEaAssignmentsRepository.js:82-90` and `groupEaAssignmentsRepository.js:80-88` (`unassigned_at`; CHECKs :329 and :425)
- The brief named `classesRepository.js:268-270`; that is the EA's own Delete class path (`exited_at`, not a download), and the class download reconcile lives in `classEaAssignmentsRepository.js`.
- `runBatchWithPerRowFallback` (`src/db/repositories/repositoryRuntime.js:79-141`) runs the row saves and the reconcile in one transaction. A throw from the reconcile rolls the whole batch back, then each row is retried alone without reconcile (`reconcileCompleted: false`).
- `ChildrenContext.js:342-351` and `ClassesContext.js:286-296` stamp the pull complete only if every reconcile result has `reconcileCompleted === true`.

Not observed (hypothesis): that a CHECK failure occurs in practice. If it does, the failure does not drop the whole pull for good: server rows are still saved by the retry, but the removal is skipped and the pull is never stamped complete, so every pull repeats it until `pulledAt` passes the row's start. Whether the row stays visible depends on the screen's query; unverified.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| A fast-clock row makes the reconcile UPDATE throw the CHECK | Unclamped stamp; same mechanism as 002 | Not run | 65% | Real-SQLite test with a row starting 6h ahead and a reconcile pull |
| The row stays visible until real time passes its start | Fallback skips reconcile | Not run | 50% | Same test, then read the screen query |

## Root cause

Unestablished (related to MA-BUG-20261104-007, which is not a duplicate). Probable: the same unclamped-stamp cause as MA-BUG-20261105-002, on the download side. MA-BUG-20261104-007 (on branch `bugs/archive-lifecycle-records`, not yet on main) covers only the server side of fast-clock end dates.

## Suggested fix

No fix proposed.

## Verification plan

- [ ] Reproduce with a real-SQLite test that runs a reconcile over a row starting ahead of `pulledAt`.
- [ ] Add a regression test for the demonstrated mechanism.
- [ ] Run on a phone with a skewed row.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T17:25:14Z | Claude | Report recorded | Code read only |

## Open questions

- Does the retry-without-reconcile path leave the removed item visible on My Children and class lists?
