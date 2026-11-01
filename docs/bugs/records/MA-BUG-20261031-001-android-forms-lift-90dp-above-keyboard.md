---
record_version: 1
id: MA-BUG-20261031-001
title: On Android, the child and class forms stop 90 dp above the open keyboard
classification: product_defect
subsystem: ui-keyboard-avoidance

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
delivery_state: FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 70
confidence_basis: On the A03s the empty band between the Edit child form and the keyboard measures 157 px, exactly 90 dp at scale 1.75, which equals the screen's keyboardVerticalOffset of 90. React Native 0.81.5 subtracts that offset from the keyboard's screenY. Not yet shown on Android by changing the offset, and iOS behaviour with the same offset is unchecked.

created_at_utc: 2026-10-31T10:05:00Z
updated_at_utc: 2026-10-31T10:05:00Z
first_observed_at: 2026-10-31T09:48:00Z
last_observed_at: 2026-10-31T09:48:00Z

known_occurrences: 1
known_affected_users: 1
affected_user_ids:
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef
exposure_denominator: unknown
exposure_window: 2026-10-31 A03s device checks only

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - main 4bc23d1 and later (debug build on Metro); earlier releases untested
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
  - docs/bugs/evidence/MA-BUG-20261031-001/a03s-edit-child-keyboard-open-band.png
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/129

data_safety_status: no data risk
workaround_status: scroll the form
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261031-001 — On Android, the child and class forms stop 90 dp above the open keyboard

## User-visible symptom

With the keyboard open on Edit child, the form ends well above the keyboard and
an empty beige band (about a finger's width) separates them. On a small phone
that band hides one more field the EA could otherwise see while typing.

## Operational impact

- **Can the user continue?** Yes; the form scrolls.
- **Core workflow affected:** Adding and editing children and classes, slightly.
- **Known affected users:** One test account.
- **Relevant exposed population:** Android phones (assumed: layout rule).
- **Workaround:** Scroll.

## Data-safety assessment

- **UI visibility:** Cosmetic layout.
- **Durable local SQLite rows:** Not involved.
- **Backend rows and relationships:** Not involved.
- **sync_outbox status, error_class/error_code:** Not involved.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | A03s device checks for PR #128 (Claude) | test@masinyusane.org | 2026-10-31T09:48:00Z | 2026-10-31T09:48:00Z | `.kbtest` debug build on Metro, `fix/first-sweep-small-bugs` `2fa92cf`, sqlite-staging | Galaxy A03s, Android 13 | Wi-Fi | `a03s-edit-child-keyboard-open-band.png` (names blanked) SHA-256 `568bfba94a7903991c83de7e16643a36803a76c6a3f7e411adfa0c8dcdae9cd0` |

## Reproduction

### Reporter steps

1. Children → a class → the edit icon on a child.
2. Tap Age.

### Expected

The form's scroll area ends where the keyboard (its suggestion strip) begins.

### Actual

The scroll area ends at y = 782 px; the keyboard strip begins at y = 939 px. The
157 px band is 90 dp at the A03s scale of 1.75.

### Closest E2E reproduction

The A03s observation above.

## Observed facts

- `AddChildScreen`, `EditChildScreen`, `CreateClassScreen` and `EditClassScreen`
  pass `keyboardVerticalOffset={90}` with behaviour `height` on Android and
  `padding` on iOS. The value dates from the first Children screens.
- These screens render under the stack's `ScreenHeader` (header shown).
- React Native 0.81.5 `KeyboardAvoidingView` computes the overlap as
  `frame.y + frame.height - (screenY - keyboardVerticalOffset)`, with `frame`
  from `onLayout` (relative to the parent).
- After the keyboard closes, Edit child returns pixel-identical to its starting
  layout (MA-BUG-20261030-001 is fixed); this record is about the keyboard-open
  state only.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| On Android the keyboard's screenY and the view frame already share an origin, so the 90 dp offset is pure excess | Band equals the offset exactly | Untested by changing the offset | 70% | Set the offset to 0 on Android and remeasure on the A03s |
| On iOS the offset is roughly the status bar + header height and is needed | Notched iPhones have ≈91 dp of status bar + header | Not observed | 50% | Open the same form on an iPhone with the keyboard up |

## Root cause

Not yet confirmed. Likely a stale or platform-wrong `keyboardVerticalOffset`.

## Suggested fix

Derive the offset rather than hard-coding it: 0 on Android (if the first check
confirms), and the measured header height on iOS (`useHeaderHeight()` from
React Navigation), in one place shared by the four screens.

## Verification plan

- [ ] Change the Android offset and remeasure the band on the A03s.
- [ ] Check the four screens on an iPhone with the keyboard up.
- [ ] Regression test through the app `KeyboardAvoidingView` for the chosen offset.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-31T09:48:00Z | Claude | Observed during the PR #128 A03s checks | Screenshot above |
| 2026-10-31T10:05:00Z | Claude | Report recorded | Band measured at 157 px = 90 dp; not fixed in #128 (out of scope, iOS unchecked) |

## Open questions

- Does iOS need the 90 dp, or a measured header height?
