---
record_version: 1
id: MA-BUG-20261030-002
title: Report a problem hides "Remove screenshot" while the keyboard is open
classification: product_defect
subsystem: profile-support-tools

severity_score: 1
severity_band: S3
severity_components:
  user_impact: 1
  data_security_privacy: 0
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: HYPOTHESIS
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 30
confidence_basis: Plausible code path only; the sheet's scroll area is its only shrinkable region and the keyboard takes most of the screen.

created_at_utc: 2026-10-30T23:30:00Z
updated_at_utc: 2026-10-31T02:06:37Z
first_observed_at: 2026-10-30T16:47:00Z
last_observed_at: 2026-10-30T16:47:00Z

known_occurrences: 1
known_affected_users: 1
affected_user_ids:
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0
exposure_denominator: unknown
exposure_window: 2026-10-30 A03s device gates only

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - 1.5.0 (55)
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
  - docs/bugs/evidence/MA-BUG-20261030-002/a03s-report-problem-keyboard-open.png
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/124

data_safety_status: no data risk
workaround_status: close the keyboard, then tap Remove screenshot
owner: unassigned
duplicate_of: none
possible_duplicate_of:
  - MA-BUG-20261030-001
---

# MA-BUG-20261030-002 — Report a problem hides "Remove screenshot" while the keyboard is open

## User-visible symptom

With a screenshot attached and the keyboard open, the sheet shows "Screenshot
attached." and "Replace screenshot", but "Remove screenshot" sits below the
footer divider and is not visible. Nothing tells the EA it is there.

## Operational impact

- **Can the user continue?** Yes. Closing the keyboard shows the button.
- **Core workflow affected:** Report a problem (optional screenshot step).
- **Known affected users:** One test account.
- **Relevant exposed population:** Android phones with small screens; iOS unknown.
- **Workaround:** Close the keyboard first.

## Data-safety assessment

- **UI visibility:** Control hidden; no data affected.
- **Durable local SQLite rows:** Not involved.
- **Backend rows and relationships:** Not involved.
- **sync_outbox status, error_class/error_code:** Not involved.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None. An EA who cannot
  find Remove could send a screenshot they meant to drop; the screenshot is one
  they picked themselves.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | A03s device gates (Claude) | test+b@masinyusane.org | 2026-10-30T16:47:00Z | 2026-10-30T16:47:00Z | 1.5.0 (55), sqlite-staging | Galaxy A03s, Android 13 | Wi-Fi | `a03s-report-problem-keyboard-open.png` SHA-256 `3116b76af929111c1cd932c7284e642e3aafb2631f93322a243092e1ab3f3734` |

## Reproduction

### Reporter steps

1. Profile → Support tools → Report a problem.
2. Attach a screenshot, then tap the text field.

### Expected

Every action for the attachment is visible, or the content shows that it scrolls.

### Actual

"Remove screenshot" is below the visible scroll area, behind the footer.

### Closest E2E reproduction

The A03s observation above.

## Observed facts

- `ReportProblemSheet` renders the attachment block (caption, Replace, Remove)
  inside the shared `BottomSheet` scroll area, with Send and Cancel in the
  pinned footer.
- With the keyboard open the sheet's visible scroll area ends just below
  "Replace screenshot".

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The scroll area is correctly sized and Remove is simply below the fold, with no scroll cue | Content order; keyboard height on a 360 dp screen | Not yet checked whether the area scrolls | 30% | Scroll the sheet body with the keyboard open |
| Keyboard avoidance mis-sizes the sheet while the keyboard is open | Shares the keyboard path with MA-BUG-20261030-001 | 001 concerns the closed state | 15% | Recheck after the 001 fix |

## Root cause

The hidden-control mechanism remains a hypothesis. Separate stacked actions consumed an extra button row; the matched row removes that symptom on paper. Keyboard-open visibility still needs the A03s check.

## Suggested fix

Implemented one flex row with matched tertiary Replace/Remove buttons, icons and explicit screenshot accessibility labels. Picker/sending guards remain covered by local behavior tests.

## Verification plan

- [x] Local public-interface regression tests passed (see first-sweep build-log entry for exact counts).
- [ ] A03s and iPhone acceptance checks (2026-10-31).

- [ ] Reproduce on the A03s after the MA-BUG-20261030-001 fix lands.
- [x] Decide the layout with Jim before changing it.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-30T16:47:00Z | Claude | Observed during A03s gate 3 | Screenshot |
| 2026-10-30T23:30:00Z | Claude | Report recorded | First registry sweep |
| 2026-10-31T02:06:37Z | Codex | Fixed in code; locally tested | Issue #124; RED → GREEN evidence in build log; device checks pending |

## Open questions

- Does the sheet body scroll to reveal Remove while the keyboard is open?
