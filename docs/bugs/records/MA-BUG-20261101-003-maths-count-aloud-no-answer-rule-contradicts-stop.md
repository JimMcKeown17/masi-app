---
record_version: 1
id: MA-BUG-20261101-003
title: "Count aloud's no-answer rule contradicts \"Stop at the first mistake\""
classification: product_defect
subsystem: egma-content-instructions

severity_score: 3
severity_band: S3
severity_components:
  user_impact: 2
  data_security_privacy: 1
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: E2E_REPRO_CLOSED

root_cause_confidence_pct: 90
confidence_basis: "The shared no-answer sentence (\"mark the item wrong and point to the next one\") was appended to Count aloud, whose own rule is to stop at the first mistake; the rewritten text is pinned by a content test and was seen on the emulator."

created_at_utc: 2026-11-01T12:40:00Z
updated_at_utc: 2026-11-01T12:40:00Z
first_observed_at: 2026-10-31T14:55:00Z
last_observed_at: 2026-10-31T14:55:00Z

known_occurrences: 1
known_affected_users: 1
affected_user_ids:
  - 116abb34-7097-47f1-829f-0bd8e27f4ed9
exposure_denominator: no field exposure; one staging tester in a device gate
exposure_window: feat/egma-maths-assessment from its first build to 61f2a0e5 (2026-10-31); never on main

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - debug .kbtest build running feat/egma-maths-assessment c27df51e via Metro
  - EAS preview build versionCode 56 (from c27df51e; installed only on an emulator)
affected_devices:
  - Samsung Galaxy A03s (SM-A037U)
affected_os_versions:
  - Android 13 (API 33)
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths:
  - docs/bugs/evidence/MA-BUG-20261101-003/a03s-count-aloud-intro.png
github_issues: []

data_safety_status: no stored-data risk; two EAs could have scored the same child differently
workaround_status: none needed after the fix
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261101-003 — Count aloud's no-answer rule contradicts "Stop at the first mistake"

## User-visible symptom

Count aloud said: "Mark each checkpoint the child passes without a mistake. Stop at the first mistake. … After about 5 seconds with no answer, say "Go on", mark the item wrong and point to the next one." The last sentence tells the EA to carry on after a wrong step, while the rule above says stop. "Checkpoint" is also not a word EAs use.

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** Maths assessment (numeracy EAs only).
- **Known affected users:** One staging tester in a device gate. No EA ever saw it.
- **Relevant exposed population:** None in the field; the fault never reached main.
- **Workaround:** None needed after the fix.

An EA could not tell whether to stop or carry on after a pause, so EAs could score the same child differently. That is a data-quality risk for the early number results, though nothing stored was lost.

## Data-safety assessment

- **UI visibility:** Not applicable; the fault is in what the screen shows, not in stored data.
- **Durable local SQLite rows:** Not affected.
- **Backend rows and relationships:** Not affected. The run's 34 results read back correctly from staging (build log, 2026-10-31).
- **sync_outbox status, error_class/error_code:** Not involved.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, maths assessment A03 device gate | test+numeracy@masinyusane.org (`116abb34…`) | 2026-10-31T14:55:00Z | 2026-11-01T12:40:00Z | `.kbtest` debug app on Metro, `feat/egma-maths-assessment` `c27df51e`, sqlite-staging | Galaxy A03s, Android 13, 360 dp | Wi-Fi | `a03s-count-aloud-intro.png` |

## Reproduction

### Reporter steps

1. Sign in as a numeracy EA on a build from `feat/egma-maths-assessment` before `61f2a0e5`.
2. Start the Maths assessment for a child and work through the Questions at 360 dp.

### Expected

The screen reads plainly and correctly for an EA working in Question order (the corrected behaviour is under Suggested fix).

### Actual

Count aloud said: "Mark each checkpoint the child passes without a mistake. Stop at the first mistake. … After about 5 seconds with no answer, say "Go on", mark the item wrong and point to the next one." The last sentence tells the EA to carry on after a wrong step, while the rule above says stop. "Checkpoint" is also not a word EAs use.

### Closest E2E reproduction

The device gate itself (R1): the real tester account on the Galaxy A03s at 360 dp.

## Observed facts

- Seen in the maths assessment's A03 device gate on 2026-10-31 (Samsung Galaxy A03s SM-A037U,
  Android 13, 360 dp via `wm density 320`, default text size). The phone ran
  `feat/egma-maths-assessment` at `c27df51e` through the installed `.kbtest` debug app and Metro.
- The same code was in EAS preview build versionCode 56 (`da780968`, built from `c27df51e`),
  which was installed only on an emulator. No EA or tester outside this check used it.
- Fixed in branch commit `61f2a0e5` before merge; merged to main in PR #133 (`072d394e`).
- Count aloud intro at 14:55Z (screenshot); listed in the fix list at 15:17:27Z.
- The app's stop rule for Count aloud is `stop_at: 1` (it stopped after one mistake in the run: "Lwazi Mbeki made a mistake. The test has stopped.").
- "Lwazi Mbeki" is a fictional staging test child.

Evidence files (copies of the session screenshots; the child shown is a fictional staging test child):

- `docs/bugs/evidence/MA-BUG-20261101-003/a03s-count-aloud-intro.png` — SHA-256 `8856e3007efe7897088d0a15acf38dc591b9bfa666affc2975cdb38afaa41f68`

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The shared no-answer sentence (see MA-BUG-20261101-002) was appended to Count aloud too, where it contradicts the Question's own stop-at-first-mistake rule. | Screens in R1; the fix removed the symptom | None | 90% | Recheck on the A03 with the next build that contains `072d394e` |

## Root cause

The shared no-answer sentence (see MA-BUG-20261101-002) was appended to Count aloud too, where it contradicts the Question's own stop-at-first-mistake rule.

## Suggested fix

Done under Jim's go to check on the A03 and continue (2026-10-31). New text: "Say: "Count for me. Start at one." Mark each step the child reaches without a mistake. Stop at the first mistake. If the child stops for about 5 seconds, mark the next step wrong. …" Test: "spoken instructions use steps and match the materials in use".

## Verification plan

- [x] Reproduce the original end-user workflow on the affected release or
      closest faithful environment. (R1, the A03 device gate.)
- [x] Add or identify a regression test that fails for the demonstrated causal
      mechanism.
- [x] Verify the targeted correction locally. Re-checked on the emulator at 360 dp: Count aloud shows the new wording.
- [ ] Run the closest representative E2E flow on a physical device when the
      bug is device-, lifecycle-, SQLite-, or network-sensitive. (A03 recheck on the next build with `072d394e`.)
- [ ] Verify local durability and backend convergence for data/sync incidents. (Not a data bug.)
- [ ] Identify the exact release/build containing the fix.
- [ ] Obtain field confirmation or record an explicit observation window with
      sufficient exposure and no recurrence.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-31T14:55:00Z | Claude | Seen in the A03 device gate | R1 |
| 2026-10-31T15:17:27Z | Claude | Added to the device-gate fix list for Codex | Fix batch prompt |
| 2026-10-31 | Codex, reviewed by Claude | Fixed in branch commit `61f2a0e5` | Build log, Bug and Gap row of 2026-10-31 |
| 2026-10-31 | Claude | Merged to main in PR #133 (`072d394e`) | Jim's go to merge |
| 2026-11-01T12:40:00Z | Claude | Record created after the fact | Jim, 2026-11-01: device-gate finds get registry records too |

## Open questions

- None material. The A03 recheck on the next build will move verification to `DEVICE_VERIFIED`.
