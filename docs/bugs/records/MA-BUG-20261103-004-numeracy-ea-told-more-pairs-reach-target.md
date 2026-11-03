---
record_version: 1
id: MA-BUG-20261103-004
title: A numeracy EA is told "4 more pairs reach your target", but numeracy teaches groups
classification: product_defect
subsystem: Home and Session complete session-goal copy (sessionGoalPresentation)

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
delivery_state: FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 95
confidence_basis: The subtitle is a fixed literacy string in src/utils/sessionGoalPresentation.js ("N more pairs reach your target."), used for every EA regardless of programme; seen on Home and Session complete for a numeracy EA.

created_at_utc: 2026-11-03T20:05:00Z
updated_at_utc: 2026-11-03T20:05:00Z
first_observed_at: 2026-11-03T19:35:00Z
last_observed_at: 2026-11-03T19:44:00Z

known_occurrences: 2
known_affected_users: 1 (test)
affected_user_ids:
  - 116abb34-7097-47f1-829f-0bd8e27f4ed9
exposure_denominator: unknown
exposure_window: Device gate W, Android preview build 57, 2026-11-03

environment: sqlite-staging (masi-app-sqlite, segygjzpujphwvrubusm)
affected_releases:
  - 1.5.0 (Android preview versionCode 57, feat/numeracy-screens 6b0267a9, PR #145, unmerged)
affected_devices:
  - Samsung Galaxy A03s (SM-A037U), 360 dp via wm density 320, default text size
affected_os_versions:
  - Android 13
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids:
  - device-gate-W/2026-11-03/numeracy-pairs-target-copy
support_incident_keys: []
support_incident_signatures: []
evidence_paths:
  - docs/bugs/evidence/MA-BUG-20261103-004/a03-home-numeracy-pairs-target.png
  - docs/bugs/evidence/MA-BUG-20261103-004/a03-session-complete-numeracy-pairs-target.png
github_issues: []

data_safety_status: No data risk; wording only.
workaround_status: Not needed; the count itself is right.
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261103-004 — A numeracy EA is told "4 more pairs reach your target", but numeracy teaches groups

## User-visible symptom

Claude, running device gate W on the A03s as a numeracy EA: the Home gauge reads "1 of 5 sessions today
· 4 more pairs reach your target." and Session complete reads "2 of 5 sessions today · 3 more pairs
reach your target." Numeracy lessons are taught to groups of about six children, not pairs.

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** None blocked. The daily target message is misleading for numeracy EAs.
- **Known affected users:** One test EA during the device gate.
- **Relevant exposed population:** Every numeracy EA once the screens ship.
- **Workaround:** Not needed.

## Data-safety assessment

- **UI visibility:** Wording only.
- **Durable local SQLite rows:** Not affected.
- **Backend rows and relationships:** Not affected.
- **sync_outbox status, error_class/error_code:** Not affected.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude device gate W observation, Home | test EA Thandi Numeracy (`116abb34-…`) | 2026-11-03T19:35Z | 2026-11-03T19:35Z | 1.5.0 preview vc57, sqlite-staging | Galaxy A03s, Android 13, 360 dp | Online | `a03-home-numeracy-pairs-target.png` (sha256 `bcc384018a7a6566919fd885e7b03975bfb25e7828531fd431da12ab919ac639`) |
| R2 | Claude device gate W observation, Session complete | same | 2026-11-03T19:44Z | 2026-11-03T19:44Z | same | same | Offline | `a03-session-complete-numeracy-pairs-target.png` (sha256 `fad3623b394fe2de7262b63a7c9231809b61172289e7c3396a6905fcd0689d34`) |

## Reproduction

### Reporter steps

1. Sign in as a numeracy EA with fewer sessions today than the target.
2. Look at Home's session gauge, or save a lesson and read Session complete.

### Expected

Copy that fits group lessons, for example "4 more lessons reach your target."

### Actual

"4 more pairs reach your target."

### Closest E2E reproduction

Reproduced on the device above (both screens).

## Observed facts

- `src/utils/sessionGoalPresentation.js:53-58` returns `'One more pair reaches your target.'` or
  `remaining + ' more pairs reach your target.'` without reading the programme. It dates from the Bold
  Red Home work (#70/#81).

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The subtitle is a fixed literacy string | Code; both screens | None | 95% | — |

## Root cause

The session-goal subtitle was written for literacy pair sessions and never takes the programme into
account.

## Suggested fix

Jim chooses the wording. One option is "N more lessons reach your target." for every EA, which is true
for literacy too, so no programme branch is needed. Alternatively, pass the subject from the signed-in
EA's programme and keep "pairs" for literacy.

## Verification plan

- [x] Reproduce the original end-user workflow on the affected release or
      closest faithful environment.
- [ ] Add or identify a regression test that fails for the demonstrated causal
      mechanism.
- [ ] Verify the targeted correction locally.
- [ ] Run the closest representative E2E flow on a physical device when the
      bug is device-, lifecycle-, SQLite-, or network-sensitive.
- [ ] Verify local durability and backend convergence for data/sync incidents. (Not applicable.)
- [ ] Identify the exact release/build containing the fix.
- [ ] Obtain field confirmation or record an explicit observation window with
      sufficient exposure and no recurrence.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-03T19:35:00Z | Claude | Observed on Home in device gate W | Screenshot |
| 2026-11-03T19:44:00Z | Claude | Observed again on Session complete | Screenshot |
| 2026-11-03T20:05:00Z | Claude | Report recorded | `/bug-user` intake; wording is Jim's call |

## Open questions

- Which wording does Jim want: one phrase for everyone, or per subject?
