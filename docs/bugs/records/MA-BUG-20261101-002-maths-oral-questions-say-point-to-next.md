---
record_version: 1
id: MA-BUG-20261101-002
title: "Maths Questions with no Number Card tell the EA to \"point to the next one\""
classification: product_defect
subsystem: egma-content-instructions

severity_score: 1
severity_band: S3
severity_components:
  user_impact: 1
  data_security_privacy: 0
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 90
confidence_basis: "The shared no-answer sentence was written for Number Card Questions and copied onto every Question; the fixed wording is pinned by a content test, but the new text was not looked at on a screen."

created_at_utc: 2026-11-01T12:40:00Z
updated_at_utc: 2026-11-01T12:40:00Z
first_observed_at: 2026-10-31T14:55:00Z
last_observed_at: 2026-10-31T15:03:34Z

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
  - docs/bugs/evidence/MA-BUG-20261101-002/a03s-add-with-counters-intro.png
  - docs/bugs/evidence/MA-BUG-20261101-002/a03s-before-and-after-intro.png
github_issues: []

data_safety_status: no data risk; wording only
workaround_status: none needed; the EA moves on to the next item
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261101-002 — Maths Questions with no Number Card tell the EA to "point to the next one"

## User-visible symptom

Questions with no card, such as "Before and after" (oral) and "Add with counters", ended: "After about 5 seconds with no answer, say "Go on", mark the item wrong and point to the next one." There is nothing to point at.

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** Maths assessment (numeracy EAs only).
- **Known affected users:** One staging tester in a device gate. No EA ever saw it.
- **Relevant exposed population:** None in the field; the fault never reached main.
- **Workaround:** None needed; the EA moves on to the next item.

Minor confusion for the EA reading the instructions.

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
| R1 | Claude, maths assessment A03 device gate | test+numeracy@masinyusane.org (`116abb34…`) | 2026-10-31T14:55:00Z | 2026-11-01T12:40:00Z | `.kbtest` debug app on Metro, `feat/egma-maths-assessment` `c27df51e`, sqlite-staging | Galaxy A03s, Android 13, 360 dp | Wi-Fi | `a03s-add-with-counters-intro.png`; `a03s-before-and-after-intro.png` |

## Reproduction

### Reporter steps

1. Sign in as a numeracy EA on a build from `feat/egma-maths-assessment` before `61f2a0e5`.
2. Start the Maths assessment for a child and work through the Questions at 360 dp.

### Expected

The screen reads plainly and correctly for an EA working in Question order (the corrected behaviour is under Suggested fix).

### Actual

Questions with no card, such as "Before and after" (oral) and "Add with counters", ended: "After about 5 seconds with no answer, say "Go on", mark the item wrong and point to the next one." There is nothing to point at.

### Closest E2E reproduction

The device gate itself (R1): the real tester account on the Galaxy A03s at 360 dp.

## Observed facts

- Seen in the maths assessment's A03 device gate on 2026-10-31 (Samsung Galaxy A03s SM-A037U,
  Android 13, 360 dp via `wm density 320`, default text size). The phone ran
  `feat/egma-maths-assessment` at `c27df51e` through the installed `.kbtest` debug app and Metro.
- The same code was in EAS preview build versionCode 56 (`da780968`, built from `c27df51e`),
  which was installed only on an emulator. No EA or tester outside this check used it.
- Fixed in branch commit `61f2a0e5` before merge; merged to main in PR #133 (`072d394e`).
- Seen on Count aloud (14:55Z), Before and after (15:02Z) and Add with counters (15:03Z) intros; listed in the fix list at 15:17:27Z.
- Affected Questions: Finger flash, Count out counters, Before and after, Add with counters, Take away with counters, Make 5 and 10 (and Count aloud; see MA-BUG-20261101-003).

Evidence files (copies of the session screenshots; the child shown is a fictional staging test child):

- `docs/bugs/evidence/MA-BUG-20261101-002/a03s-add-with-counters-intro.png` — SHA-256 `8c6a69341b8e773c1fc2859499ee51d398308fdb8ce7d4a3ff1d9af4a0a7c8f4`
- `docs/bugs/evidence/MA-BUG-20261101-002/a03s-before-and-after-intro.png` — SHA-256 `4778c1c612ea6e8a7d0eb810790cd1379ef4e224a4b4abd63dcd27ab120ac0f2`

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| One no-answer sentence, written for Questions where the EA points at a Number Card item, was appended to every Question's instructions. | Screens in R1; the fix removed the symptom | None | 90% | Recheck on the A03 with the next build that contains `072d394e` |

## Root cause

One no-answer sentence, written for Questions where the EA points at a Number Card item, was appended to every Question's instructions.

## Suggested fix

Done under Jim's go to check on the A03 and continue (2026-10-31). Questions with no card now end "…mark the item wrong and go to the next one."; Number Card Questions keep "point to the next one". Test: "spoken instructions use steps and match the materials in use" (`content/egma/verify.cjs`).

## Verification plan

- [x] Reproduce the original end-user workflow on the affected release or
      closest faithful environment. (R1, the A03 device gate.)
- [x] Add or identify a regression test that fails for the demonstrated causal
      mechanism.
- [x] Verify the targeted correction locally. Covered by the content test only; the new wording was not separately looked at on a phone.
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
