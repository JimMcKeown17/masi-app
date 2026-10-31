---
record_version: 1
id: MA-BUG-20261030-007
title: The Android photo picker asks for Done when attaching one screenshot
classification: device_or_os
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

diagnosis_state: CONFIRMED
delivery_state: NO_PRODUCT_CHANGE
verification_state: NOT_TESTED

root_cause_confidence_pct: 95
confidence_basis: The A03s routes the picker request to Google's system photo picker (com.google.android.photopicker). Opened from adb with a plain single-pick intent, with no app involved, it shows the same ✕ 1 / Preview / Done bar after one tap.

created_at_utc: 2026-10-30T23:30:00Z
updated_at_utc: 2026-10-31T02:05:00Z
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
evidence_paths: []
github_issues: []

data_safety_status: no data risk
workaround_status: tap Done after choosing the image
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261030-007 — The Android photo picker asks for Done when attaching one screenshot

## User-visible symptom

Choosing "Attach a screenshot" opens the Android photo picker. Tapping an image
ticks it and shows a bar with "✕ 1", "Preview" and "Done", instead of
returning to the app. The EA must also tap Done.

## Operational impact

- **Can the user continue?** Yes, after tapping Done.
- **Core workflow affected:** Report a problem (optional screenshot).
- **Known affected users:** One test account.
- **Relevant exposed population:** Android phones whose system picker behaves
  this way; unknown.
- **Workaround:** Tap Done.

## Data-safety assessment

- **UI visibility:** Extra step only.
- **Durable local SQLite rows:** Not involved.
- **Backend rows and relationships:** Not involved.
- **sync_outbox status, error_class/error_code:** Not involved.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | A03s device gates (Claude) | test+b@masinyusane.org | 2026-10-30T16:47:00Z | 2026-10-30T16:47:00Z | 1.5.0 (55), sqlite-staging | Galaxy A03s, Android 13 | Wi-Fi | Screenshot not committed (see below) |

The screenshot of the picker is deliberately not committed: its gallery
thumbnails show other apps' screens containing children's names, which may be
real learners.

## Reproduction

### Reporter steps

1. Profile → Support tools → Report a problem → Attach a screenshot.
2. Tap one image.

### Expected

The picker closes and returns the image.

### Actual

The image is ticked and a Done bar appears.

### Closest E2E reproduction

The A03s observation above.

## Observed facts

- 2026-10-31, A03s: `cmd package query-activities -a android.provider.action.PICK_IMAGES`
  resolves to `com.google.android.photopicker/com.android.photopicker.MainActivity`
  (the updatable system photo picker), ahead of the older MediaProvider picker.
- `adb shell am start -a android.provider.action.PICK_IMAGES -t 'image/*'` sends
  the plain single-pick intent, with no `EXTRA_PICK_IMAGES_MAX` and no app
  involved. Tapping one photo marked it "Selected" and showed "1 photos or videos
  selected", Preview and Done; the picker stayed open. The UI was read with
  uiautomator only; no screenshot was taken, because the gallery holds
  children's images.

- `src/utils/supportScreenshot.js` calls the picker with
  `allowsMultipleSelection: false`.
- expo-image-picker 17.0.11 `ImageLibraryContract.kt` builds a
  `PickVisualMedia` (single selection) intent when multiple selection is off.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The system photo picker version on this phone always confirms single picks with Done | App requests single selection; the system picker shows Done for a plain single-pick intent sent from adb | None | 95% | Not needed |
| The library requests multiple selection somewhere else | None | Source above; reproduced without the app | <5% | Not needed |

## Root cause

The phone's system photo picker asks for Done even for a single pick. Masi
requests a single image correctly.

## Suggested fix

No product change (Jim asked for the small bugs to be fixed, 2026-10-31; this one
is the operating system's). The only app-side alternative is expo-image-picker's
`legacy: true` (the older document picker), which would trade the privacy-scoped
system picker for a clunkier file browser; not worth it for one tap.

## Verification plan

- [x] Reproduce without the app (system picker, single-pick intent, A03s).

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-30T16:47:00Z | Claude | Observed during A03s gate 3 | Screenshot kept privately |
| 2026-10-30T23:30:00Z | Claude | Report recorded | First registry sweep |
| 2026-10-31T02:00:00Z | Claude | Reproduced without the app | adb single-pick intent to the system picker shows Done; no product change |

## Open questions

- None.
