---
record_version: 1
id: MA-BUG-20261031-001
title: The child and class forms stop 90 dp above the open keyboard (Android and iPhone)
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

diagnosis_state: PROBABLE
delivery_state: FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 90
confidence_basis: The empty band between the Edit child form and the keyboard is exactly the screen's keyboardVerticalOffset of 90 on both platforms - 157 px = 90 dp on the A03s (scale 1.75) and 270 px = 90 pt on an iPhone 17 (scale 3). React Native 0.81.5 subtracts that offset from the keyboard's screenY, so on both platforms it is pure excess. Not yet confirmed by changing the offset.

created_at_utc: 2026-10-31T10:05:00Z
updated_at_utc: 2026-11-05T15:33:41Z
first_observed_at: 2026-10-31T09:48:00Z
last_observed_at: 2026-11-05T15:18:00Z

known_occurrences: 2
known_affected_users: 2
affected_user_ids:
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef
  - 116abb34-7097-47f1-829f-0bd8e27f4ed9
exposure_denominator: unknown
exposure_window: 2026-10-31 A03s device checks; 2026-11-05 iPhone check on pilot build 28

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - main 4bc23d1 and later (debug build on Metro)
  - 1.5.0 pilot iOS 28 (`8b79eae5`)
affected_devices:
  - Samsung Galaxy A03s (SM-A037U)
  - iPhone 17 (iPhone18,3)
affected_os_versions:
  - Android 13 (API 33)
  - iOS 26.6.2
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths:
  - docs/bugs/evidence/MA-BUG-20261031-001/a03s-edit-child-keyboard-open-band.png
  - docs/bugs/evidence/MA-BUG-20261031-001/iphone17-edit-child-keyboard-open-band.png
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/129

data_safety_status: no data risk
workaround_status: scroll the form
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261031-001 — The child and class forms stop 90 dp above the open keyboard (Android and iPhone)

## User-visible symptom

With the keyboard open on Edit child, the form ends well above the keyboard and
an empty beige band (about a finger's width) separates them. On a small phone
that band hides one more field the EA could otherwise see while typing.

## Operational impact

- **Can the user continue?** Yes; the form scrolls.
- **Core workflow affected:** Adding and editing children and classes, slightly.
- **Known affected users:** Two test accounts.
- **Relevant exposed population:** Android and iPhone; seen on both.
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
| R2 | iPhone check on pilot build 28 (Jim) | test+numeracy@masinyusane.org | 2026-11-05T15:18:00Z | 2026-11-05T15:20:00Z | 1.5.0 (28) `8b79eae5`, sqlite-staging | iPhone 17, iOS 26.6.2 | Wi-Fi | `iphone17-edit-child-keyboard-open-band.png` (names blanked) SHA-256 `8c9e5b7f57a978ce977fe7b023b0d0b625cad57c800117fa26dcba20ddd5196a` |

## Reproduction

### Reporter steps

1. Children → a class → the edit icon on a child.
2. Tap Age.

### Expected

The form's scroll area ends where the keyboard (its suggestion strip) begins.

### Actual

A03s: the scroll area ends at y = 782 px; the keyboard strip begins at y = 939 px. The
157 px band is 90 dp at the A03s scale of 1.75.

iPhone 17, build 28: the form card is cut at y = 1428 px and the keyboard begins at
y = 1698 px. The 270 px band is 90 pt at scale 3.

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
| The 90 offset is pure excess on both platforms: the view's frame and the keyboard's screenY already share an origin | Band equals the offset exactly on the A03s (90 dp) and the iPhone 17 (90 pt) | Untested by changing the offset | 90% | Set the offset to 0 and remeasure on both phones |
| On iOS the offset is roughly the status bar + header height and is needed | Notched iPhones have ≈91 pt of status bar + header | Refuted 2026-11-05: the iPhone shows the same 90 pt of empty space, so the offset is not absorbed there | 5% | None |

## Root cause

Probable: a stale `keyboardVerticalOffset={90}` that is excess on both platforms. Confirm by setting it to 0.

## Suggested fix

Remove the hard-coded offset (use 0) on all four screens, in one shared place,
then check both phones. The iPhone result rules out keeping it for iOS.

## Verification plan

- [ ] Set the offset to 0 and remeasure the band on the A03s.
- [x] iPhone with the keyboard up, current offset (2026-11-05, Edit child: 90 pt band).
- [ ] With the fix: check the four screens on the iPhone (no band, focused field visible).
- [ ] Regression test through the app `KeyboardAvoidingView` for the chosen offset.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-31T09:48:00Z | Claude | Observed during the PR #128 A03s checks | Screenshot above |
| 2026-10-31T10:05:00Z | Claude | Report recorded | Band measured at 157 px = 90 dp; not fixed in #128 (out of scope, iOS unchecked) |
| 2026-11-05T15:33:41Z | Claude | iPhone evidence added; PROBABLE | Jim's iPhone 17 screenshot (build 28) shows the same band: 270 px = 90 pt. The iOS-needs-the-offset hypothesis is refuted; fix = offset 0 on both platforms |

## Open questions

- With the offset at 0, does the focused field stay visible above the keyboard on both phones, including the lower fields of the class forms?
