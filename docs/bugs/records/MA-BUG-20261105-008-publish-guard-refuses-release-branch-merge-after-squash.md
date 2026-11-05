---
record_version: 1
id: MA-BUG-20261105-008
title: The update publish guard would refuse a normal publish from main after a release branch's feature PR is squash-merged
classification: product_defect
subsystem: release-process

severity_score: 0
severity_band: S4
severity_components:
  user_impact: 0
  data_security_privacy: 0
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 90
confidence_basis: Reproduced with real git by simulating the PR #169 squash onto origin/main and running the guard against 1bddda8e (REFUSED), then the fix passed the same refs with the old script still refusing; a live dry run from main fc0bae37 passed only after the mitigation merge.

created_at_utc: 2026-11-05T21:00:00Z
updated_at_utc: 2026-11-05T21:00:00Z
first_observed_at: 2026-11-05T20:50:00Z
last_observed_at: 2026-11-05T20:50:00Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: not applicable (publisher tooling; no phone or data effect)
exposure_window: 2026-11-05T19:55:00Z (update 1.5.0+5 published) to the mitigation merge e312df77 at about 20:5x UTC

environment: scripts/ota-publish.cjs on main (PR #167, f4ba06bd), preview update channel, runtime 1.5.0
affected_releases:
  - 1.5.0+5 update group 3ec327af (commit 1bddda8e on release/ota-wrap-up-cards)
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
  - https://github.com/JimMcKeown17/masi-app/pull/167
  - https://github.com/JimMcKeown17/masi-app/issues/158

data_safety_status: no phone or data effect; the guard fails safe (it refuses, it never lets a rollback through)
workaround_status: merge the feature PR's head into the release branch so the branch-tip rule finds it (done as e312df77); the other way through would have been a false --allow-rollback label
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261105-008 — The update publish guard would refuse a normal publish from main after a release branch's feature PR is squash-merged

## User-visible symptom

Found by Claude in review, not reported by a field user, and not seen on a phone. The first normal `npm run ota:publish` from main after PR #169 merged would have been refused with: `REFUSED … merging it would change files that reach phones (1 file: src/components/lessons/WrapUpChildRow.js)`. The only way through was a false `--allow-rollback` label.

## Operational impact

- **Can the user continue?** Not applicable: no phone is involved. The publisher would be blocked from a normal publish.
- **Core workflow affected:** Publishing app updates (release process). No phone workflow.
- **Known affected users:** 0.
- **Relevant exposed population:** whoever runs `ota:publish` after a release branch's feature PR is squash-merged to main.
- **Workaround:** merge the feature PR's head into the release branch (done as e312df77). A false `--allow-rollback` label would also pass, but it records a wrong reason.

## Data-safety assessment

- **UI visibility:** Not affected.
- **Durable local SQLite rows:** Not affected.
- **Backend rows and relationships:** Not affected.
- **sync_outbox status, error_class/error_code:** Not applicable.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None. The guard errs on the side of refusing.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude review, reproduced with real git (simulated squash of PR #169 on origin/main) | Claude | 2026-11-05T20:50:00Z | 2026-11-05T21:00:00Z | scripts/ota-publish.cjs from PR #167; live update 1.5.0+5 | none (publisher machine) | n/a | Build-log section "`ota:publish` guard: phones run a merge commit on a release branch" on `fix/ota-guard-merge-commits` |

## Reproduction

### Reporter steps

1. Update `1.5.0+5` (group 3ec327af, about 19:55 UTC) runs commit 1bddda8e. That commit is a merge on `release/ota-wrap-up-cards` of 513dd664 (the release line) and 014a069a (feature `feat/wrap-up-child-cards`).
2. PR #169 adds a commit that edits a line in `src/components/lessons/WrapUpChildRow.js`, which 014a069a also changed (the "None yet" chip removal).
3. Simulate #169's squash onto main (commit-tree of 017c422a's tree on origin/main) and run the guard against 1bddda8e.

### Expected

The publish passes: main has every change the phones run.

### Actual

`REFUSED … merging it would change files that reach phones (1 file: src/components/lessons/WrapUpChildRow.js)`. The only ref containing 1bddda8e was the release branch, whose tip was 1bddda8e itself, so the branch-tip rule had nothing to match.

### Closest E2E reproduction

The simulation above with real git is the closest reproduction. It ran against the real refs, not a mock. After the mitigation (the other session merged #169's head into the release branch as e312df77, and #169 merged as fc0bae37), a live dry run from main fc0bae37 passed ("…has the changes of branch release/ota-wrap-up-cards (e312df7)…"; next release 1.5.0+6; nothing published).

## Observed facts

- The guard (scripts/ota-publish.cjs, merged in f4ba06bd, PR #167) accepts HEAD if it contains the commit phones run: in history, as the same changes (squash), along main's first-parent line, or through a branch tip that contains it.
- 1bddda8e is a merge commit of a feature branch into the release line. A squash of the feature PR onto main does not contain either parent, and its changes differ from the merge's by the later #169 edit to the same line.
- With refs as they were at publish time (scratch mirror), the old script refuses and the fix passes. Main without #169 and the #165 shape (a main that lacks changes phones run) stay refused.
- Fix tests: 134/134 for the script; unit 527 suites / 8,578 tests; integration 114 suites / 1,568 tests.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The guard treats a live merge commit as one opaque commit, so a later squash of its feature parent never matches | Simulation refused; fix that checks each parent passes the same refs | None | 90% | Publish for real after a release-branch merge and confirm the guard passes |

## Root cause

The guard compares HEAD with the single commit phones run. When that commit is a merge of a feature branch into a release branch, the squash of the feature PR onto main is a different commit with different changes (here, #169's later edit to a shared line). None of the guard's four rules matches, and the release branch tip is the live commit itself, so the branch-tip rule cannot help either. The guard therefore reports that publishing would change files that reach phones.

## Suggested fix

Branch `fix/ota-guard-merge-commits`, commit 26fecc40 (work order 12): a live merge commit that adds nothing of its own in files that reach phones passes when HEAD has both parents. Each parent gets the full check, with a depth cap of 2. Committed on the branch; not merged or released.

## Verification plan

- [x] Reproduce with real git against the real refs (simulated #169 squash): the old script refuses.
- [x] Add real-git tests for the merge-commit rule: 134/134; main without #169 and the #165 shape stay refused.
- [x] Verify the correction locally against the publish-time refs (scratch mirror): the old script refuses, the fix passes.
- [ ] Merge the fix to main (Jim).
- [ ] Run a live dry run from main after a release-branch squash and confirm it passes.
- [ ] Confirm a real publish after the fix.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T19:55:00Z | Another Claude session | `1.5.0+5` published from release branch merge commit 1bddda8e | Group 3ec327af |
| 2026-11-05T20:50:00Z | Claude | Simulated PR #169's squash onto main and ran the guard: REFUSED | Only the release branch contained 1bddda8e |
| 2026-11-05T20:55:00Z | Other Claude session | Merged #169's head into the release branch (e312df77) | Mitigation: the branch-tip rule now finds it |
| 2026-11-05T21:00:00Z | Jim (approval), Claude | #169 merged as fc0bae37; live dry run from main PASSED; report recorded | Next release 1.5.0+6; nothing published. Fix 26fecc40 committed on `fix/ota-guard-merge-commits` |

## Open questions

- Does the depth cap of 2 hold for every release-branch shape the team will use, such as a feature branch merged into a release branch that itself merges another release branch?
- Related: MA-BUG-20261105-006 (the rollback the guard was built to stop).
