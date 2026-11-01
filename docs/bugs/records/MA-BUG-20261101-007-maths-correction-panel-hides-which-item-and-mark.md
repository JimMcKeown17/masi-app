---
record_version: 1
id: MA-BUG-20261101-007
title: "Maths correction panel says \"Change Item 5\" without the sum or its current mark"
classification: product_defect
subsystem: assessment-capture-correction-panel

severity_score: 2
severity_band: S3
severity_components:
  user_impact: 1
  data_security_privacy: 1
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: E2E_REPRO_CLOSED

root_cause_confidence_pct: 90
confidence_basis: "The panel took only a title from the capture, so it could not show the prompt or current choice; adding a detail line closed it on the emulator, pinned by component tests."

created_at_utc: 2026-11-01T12:40:00Z
updated_at_utc: 2026-11-01T12:40:00Z
first_observed_at: 2026-10-31T15:03:00Z
last_observed_at: 2026-10-31T15:04:00Z

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
  - docs/bugs/evidence/MA-BUG-20261101-007/a03s-correction-panel.png
github_issues: []

data_safety_status: no stored-data risk; an EA could change the wrong item's mark
workaround_status: scroll to check the item before changing it
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261101-007 — Maths correction panel says "Change Item 5" without the sum or its current mark

## User-visible symptom

Tapping a marked item on Add with counters opened a panel titled "Change Item 5" (capital I mid-sentence). The tapped "6 + 2" tile was half hidden behind the panel at 360 dp, and the panel did not say how the item was currently marked.

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** Maths assessment (numeracy EAs only).
- **Known affected users:** One staging tester in a device gate. No EA ever saw it.
- **Relevant exposed population:** None in the field; the fault never reached main.
- **Workaround:** Scroll to check the item before changing it.

An EA could not confirm which sum they were changing or what it was marked as, so they could change the wrong item's mark.

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
| R1 | Claude, maths assessment A03 device gate | test+numeracy@masinyusane.org (`116abb34…`) | 2026-10-31T15:03:00Z | 2026-11-01T12:40:00Z | `.kbtest` debug app on Metro, `feat/egma-maths-assessment` `c27df51e`, sqlite-staging | Galaxy A03s, Android 13, 360 dp | Wi-Fi | `a03s-correction-panel.png` |

## Reproduction

### Reporter steps

1. Sign in as a numeracy EA on a build from `feat/egma-maths-assessment` before `61f2a0e5`.
2. Start the Maths assessment for a child and work through the Questions at 360 dp.

### Expected

The screen reads plainly and correctly for an EA working in Question order (the corrected behaviour is under Suggested fix).

### Actual

Tapping a marked item on Add with counters opened a panel titled "Change Item 5" (capital I mid-sentence). The tapped "6 + 2" tile was half hidden behind the panel at 360 dp, and the panel did not say how the item was currently marked.

### Closest E2E reproduction

The device gate itself (R1): the real tester account on the Galaxy A03s at 360 dp.

## Observed facts

- Seen in the maths assessment's A03 device gate on 2026-10-31 (Samsung Galaxy A03s SM-A037U,
  Android 13, 360 dp via `wm density 320`, default text size). The phone ran
  `feat/egma-maths-assessment` at `c27df51e` through the installed `.kbtest` debug app and Metro.
- The same code was in EAS preview build versionCode 56 (`da780968`, built from `c27df51e`),
  which was installed only on an emulator. No EA or tester outside this check used it.
- Fixed in branch commit `61f2a0e5` before merge; merged to main in PR #133 (`072d394e`).
- Screenshot at 15:03Z; noted at 15:04:00Z.
- The panel lives in `src/assessment-questions/ui/ActionBar.tsx` (`correcting`), fed by `src/assessment-questions/progress/SequentialCapture.tsx`.

Evidence files (copies of the session screenshots; the child shown is a fictional staging test child):

- `docs/bugs/evidence/MA-BUG-20261101-007/a03s-correction-panel.png` — SHA-256 `d2f64bf8d36a4be4c64ed0d07b2f56d14fee8e10e1fbeea42e443287f48a07bf`

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| `SequentialCapture` passed the panel only a title built from the capitalised item noun; the panel had no slot for the prompt or the current choice. | Screens in R1; the fix removed the symptom | None | 90% | Recheck on the A03 with the next build that contains `072d394e` |

## Root cause

`SequentialCapture` passed the panel only a title built from the capitalised item noun; the panel had no slot for the prompt or the current choice.

## Suggested fix

Done under Jim's go to check on the A03 and continue (2026-10-31). Title is now "Change item 5" (sentence case), with a muted line under it: the prompt and its current mark, e.g. "6 + 2 · Marked: Just knew". Tests: "correction identifies the sum and current choice using the capture noun" (`SequentialCapture.choices.test.tsx`) and the updated ActionBar correcting test.

## Verification plan

- [x] Reproduce the original end-user workflow on the affected release or
      closest faithful environment. (R1, the A03 device gate.)
- [x] Add or identify a regression test that fails for the demonstrated causal
      mechanism.
- [x] Verify the targeted correction locally. Re-checked on the emulator at 360 dp: "Change item 2" with "3 + 2 · Marked: Incorrect" and "2 + 1 · Marked: Just knew".
- [ ] Run the closest representative E2E flow on a physical device when the
      bug is device-, lifecycle-, SQLite-, or network-sensitive. (A03 recheck on the next build with `072d394e`.)
- [ ] Verify local durability and backend convergence for data/sync incidents. (Not a data bug.)
- [ ] Identify the exact release/build containing the fix.
- [ ] Obtain field confirmation or record an explicit observation window with
      sufficient exposure and no recurrence.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-31T15:03:00Z | Claude | Seen in the A03 device gate | R1 |
| 2026-10-31T15:17:27Z | Claude | Added to the device-gate fix list for Codex | Fix batch prompt |
| 2026-10-31 | Codex, reviewed by Claude | Fixed in branch commit `61f2a0e5` | Build log, Bug and Gap row of 2026-10-31 |
| 2026-10-31 | Claude | Merged to main in PR #133 (`072d394e`) | Jim's go to merge |
| 2026-11-01T12:40:00Z | Claude | Record created after the fact | Jim, 2026-11-01: device-gate finds get registry records too |

## Open questions

- None material. The A03 recheck on the next build will move verification to `DEVICE_VERIFIED`.
