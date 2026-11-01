---
record_version: 1
id: MA-BUG-20261101-001
title: "Maths Number Card pages run out of Question order"
classification: product_defect
subsystem: egma-content-number-card

severity_score: 2
severity_band: S3
severity_components:
  user_impact: 2
  data_security_privacy: 0
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: E2E_REPRO_CLOSED

root_cause_confidence_pct: 95
confidence_basis: "The pack set page numbers from spec §9 while the Question order came from spec §4.2; renumbering to Question order removed the jumps, and a content test now pins page order to pack order."

created_at_utc: 2026-11-01T12:40:00Z
updated_at_utc: 2026-11-01T12:40:00Z
first_observed_at: 2026-10-31T14:59:54Z
last_observed_at: 2026-10-31T14:59:54Z

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
evidence_paths: []
github_issues: []

data_safety_status: no data risk; each Question still named its correct page
workaround_status: follow the page number in each Question's instructions
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261101-001 — Maths Number Card pages run out of Question order

## User-visible symptom

Read numbers to 20 used Number Card page 1, but the next Number Card Question, Read big numbers, used page 3, and Which is more? used page 2. Addition 2 used page 8 and Subtraction 1 page 7. An EA working through the assessment in order flips 1 → 3 → 2 and 6 → 8 → 7.

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** Maths assessment (numeracy EAs only).
- **Known affected users:** One staging tester in a device gate. No EA ever saw it.
- **Relevant exposed population:** None in the field; the fault never reached main.
- **Workaround:** Follow the page number in each Question's instructions.

Slower and more confusing administration, with a child waiting, while the EA hunts for the page. Each Question named the right page, so scores were not affected.

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
| R1 | Claude, maths assessment A03 device gate | test+numeracy@masinyusane.org (`116abb34…`) | 2026-10-31T14:59:54Z | 2026-11-01T12:40:00Z | `.kbtest` debug app on Metro, `feat/egma-maths-assessment` `c27df51e`, sqlite-staging | Galaxy A03s, Android 13, 360 dp | Wi-Fi | Pack diff only |

## Reproduction

### Reporter steps

1. Sign in as a numeracy EA on a build from `feat/egma-maths-assessment` before `61f2a0e5`.
2. Start the Maths assessment for a child and work through the Questions at 360 dp.

### Expected

The screen reads plainly and correctly for an EA working in Question order (the corrected behaviour is under Suggested fix).

### Actual

Read numbers to 20 used Number Card page 1, but the next Number Card Question, Read big numbers, used page 3, and Which is more? used page 2. Addition 2 used page 8 and Subtraction 1 page 7. An EA working through the assessment in order flips 1 → 3 → 2 and 6 → 8 → 7.

### Closest E2E reproduction

The device gate itself (R1): the real tester account on the Galaxy A03s at 360 dp.

## Observed facts

- Seen in the maths assessment's A03 device gate on 2026-10-31 (Samsung Galaxy A03s SM-A037U,
  Android 13, 360 dp via `wm density 320`, default text size). The phone ran
  `feat/egma-maths-assessment` at `c27df51e` through the installed `.kbtest` debug app and Metro.
- The same code was in EAS preview build versionCode 56 (`da780968`, built from `c27df51e`),
  which was installed only on an emulator. No EA or tester outside this check used it.
- Fixed in branch commit `61f2a0e5` before merge; merged to main in PR #133 (`072d394e`).
- Claude noticed it at 14:59:54Z: "Question 5 uses Number Card page 3, while Question 4 used page 1."
- Spec §4.2 runs Read big numbers before Which is more? and Addition 2 before Subtraction 1; spec §9 numbered the pages the other way round. Each section was right alone; together they disagreed.
- No screenshot: the intro screen was not captured. Evidence is the pack diff (`numberCardPage` values in `content/egma/egma-assessments.json`, `c27df51e` → `61f2a0e5`).

Evidence files (copies of the session screenshots; the child shown is a fictional staging test child):

- No screenshot; see the pack diff named above.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The pack's `numberCardPage` values came from spec §9, which listed pages in a different order from the Question order in spec §4.2. Nothing checked that page order follows Question order. | Screens in R1; the fix removed the symptom | None | 95% | Recheck on the A03 with the next build that contains `072d394e` |

## Root cause

The pack's `numberCardPage` values came from spec §9, which listed pages in a different order from the Question order in spec §4.2. Nothing checked that page order follows Question order.

## Suggested fix

Done under Jim's go to check on the A03 and continue (2026-10-31). Pages renumbered to Question order (Read numbers 1, Read big numbers 2, Which is more? 3, Bigger number 4, Missing number 5, Addition 1 6, Addition 2 7, Subtraction 1 8, Subtraction 2 9); the instruction text and the generated Number Card updated; spec §9 updated. Guard tests in `content/egma/verify.cjs`: "number card pages follow pack order with no gaps" and "Number Card instruction pages match the page supplied".

## Verification plan

- [x] Reproduce the original end-user workflow on the affected release or
      closest faithful environment. (R1, the A03 device gate.)
- [x] Add or identify a regression test that fails for the demonstrated causal
      mechanism.
- [x] Verify the targeted correction locally. Re-checked on the emulator at 360 dp with the debug app on Metro: Number Card pages 2 and 3 now appear in Question order. The printed card is not yet checked (the timed pass with the printed Number Card is open on the ROADMAP).
- [ ] Run the closest representative E2E flow on a physical device when the
      bug is device-, lifecycle-, SQLite-, or network-sensitive. (A03 recheck on the next build with `072d394e`.)
- [ ] Verify local durability and backend convergence for data/sync incidents. (Not a data bug.)
- [ ] Identify the exact release/build containing the fix.
- [ ] Obtain field confirmation or record an explicit observation window with
      sufficient exposure and no recurrence.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-31T14:59:54Z | Claude | Seen in the A03 device gate | R1 |
| 2026-10-31T15:17:27Z | Claude | Added to the device-gate fix list for Codex | Fix batch prompt |
| 2026-10-31 | Codex, reviewed by Claude | Fixed in branch commit `61f2a0e5` | Build log, Bug and Gap row of 2026-10-31 |
| 2026-10-31 | Claude | Merged to main in PR #133 (`072d394e`) | Jim's go to merge |
| 2026-11-01T12:40:00Z | Claude | Record created after the fact | Jim, 2026-11-01: device-gate finds get registry records too |

## Open questions

- None material. The A03 recheck on the next build will move verification to `DEVICE_VERIFIED`.
