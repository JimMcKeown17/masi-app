---
record_version: 1
id: MA-BUG-20261103-003
title: On Android, Wrap up's notes field stays hidden under the keyboard while the EA types
classification: product_defect
subsystem: lesson Wrap up screens (NumeracyWrapUpScreen; literacy LessonWrapUpScreen shares the setup)

severity_score: 2
severity_band: S3
severity_components:
  user_impact: 2
  data_security_privacy: 0
  scope: 0
  recoverability: 0
severity_override: none
priority: P2

diagnosis_state: PROBABLE
delivery_state: IN_PROGRESS
verification_state: NOT_TESTED

root_cause_confidence_pct: 60
confidence_basis: Reproduced on the A03s for numeracy; both Wrap up ScrollViews adjust for the keyboard only on iOS (automaticallyAdjustKeyboardInsets) and use no keyboard-avoiding wrapper, while Android runs edge-to-edge so the window does not resize. Literacy is unverified on device.

created_at_utc: 2026-11-03T20:05:00Z
updated_at_utc: 2026-11-03T21:10:00Z
first_observed_at: 2026-11-03T19:43:00Z
last_observed_at: 2026-11-03T19:43:00Z

known_occurrences: 1
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
  - device-gate-W/2026-11-03/wrap-up-notes-keyboard
support_incident_keys: []
support_incident_signatures: []
evidence_paths:
  - docs/bugs/evidence/MA-BUG-20261103-003/a03-wrap-up-notes-keyboard-open.png
github_issues:
  - "#148"

data_safety_status: No data risk; the typed text was kept and saved with the session.
workaround_status: Type, close the keyboard, then scroll down to read what was typed.
owner: Claude (fix on PR #145)
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261103-003 — On Android, Wrap up's notes field stays hidden under the keyboard while the EA types

## User-visible symptom

Claude, running device gate W5 on the A03s: on a numeracy Wrap up, tapping "Add session notes…" opens
the keyboard, but the page does not move the notes field into view. The screen shows the children's
chips while the field sits under the keyboard, so the EA types without seeing the text.

## Operational impact

- **Can the user continue?** Yes. The text is entered and saved (the notes "A03 gate offline lesson"
  reached staging).
- **Core workflow affected:** Writing session notes at Wrap up.
- **Known affected users:** One test EA during the device gate.
- **Relevant exposed population:** Android numeracy EAs. Very likely also every Android literacy EA,
  because the literacy Wrap up has the same scroll setup (not yet checked on a device). Literacy Wrap
  up is released.
- **Workaround:** Close the keyboard and scroll down to check the text.

## Data-safety assessment

- **UI visibility:** The field is hidden while the keyboard is open.
- **Durable local SQLite rows:** The session saved with its notes.
- **Backend rows and relationships:** `sessions.notes` = "A03 gate offline lesson" on staging.
- **sync_outbox status, error_class/error_code:** Synced; no failures.
- **Incident queue evidence:** None expected.
- **Eventual convergence evidence:** Converged.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude device gate W observation | test EA Thandi Numeracy (`116abb34-…`) | 2026-11-03T19:43Z | 2026-11-03T19:43Z | 1.5.0 preview vc57, sqlite-staging | Galaxy A03s, Android 13, 360 dp | Offline (Wi-Fi disabled for the gate) | `a03-wrap-up-notes-keyboard-open.png` (sha256 `b5aaddf15bb3aa7fc81bb1df50f6a6c9b7770e52c4887acda288f737d2766d4a`) |

## Reproduction

### Reporter steps

1. Start a numeracy lesson for a six-child group and tap Wrap up →.
2. Scroll down until the "NOTES (OPTIONAL)" field shows, then tap it.
3. Type.

### Expected

The page scrolls so the field and the text being typed sit just above the keyboard.

### Actual

The field stays under the keyboard. The UI dump put the field at y≈1,370–1,423 px, with the keyboard
top at about y≈900 px on a 1,600 px screen.

### Closest E2E reproduction

Reproduced on the device above (numeracy). Literacy not yet tried.

## Observed facts

- `NumeracyWrapUpScreen.js:158-159` and `LessonWrapUpScreen.js:201-202` both render
  `<ScrollView … keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>`,
  with `StickyActionFooter hideOnKeyboard`. Neither uses `src/components/common/KeyboardAvoidingView`.
- `app.config.js` sets `edgeToEdgeEnabled: true`. Under edge-to-edge the Android window does not shrink
  for the keyboard (see MA-BUG-20261030-001 for the related keyboard-event behaviour).

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| On Android, nothing moves the focused field above the keyboard (keyboard insets are iOS-only; edge-to-edge stops the window resizing) | Code; reproduced | Literacy not yet checked | 60% | Reproduce the same step on a literacy Wrap up on the A03s |

## Root cause

Probable: the Wrap up screens rely on iOS-only `automaticallyAdjustKeyboardInsets`. On edge-to-edge
Android, no layer moves the focused input above the keyboard.

## Suggested fix

One shared fix for both Wrap up screens, because they share the setup: wrap the scroll content in the
shared `KeyboardAvoidingView` (from MA-BUG-20261030-001) or apply the keyboard height as bottom inset
on Android. Then scroll the notes field into view on focus. Add a static guard so new scrolling forms
can't ship without it.

## Verification plan

- [x] Reproduce the original end-user workflow on the affected release or
      closest faithful environment.
- [ ] Add or identify a regression test that fails for the demonstrated causal
      mechanism.
- [ ] Verify the targeted correction locally.
- [ ] Run the closest representative E2E flow on a physical device when the
      bug is device-, lifecycle-, SQLite-, or network-sensitive. (Both Wrap up screens, A03s and iPhone.)
- [ ] Verify local durability and backend convergence for data/sync incidents. (Not applicable.)
- [ ] Identify the exact release/build containing the fix.
- [ ] Obtain field confirmation or record an explicit observation window with
      sufficient exposure and no recurrence.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-03T19:43:00Z | Claude | Observed in device gate W5 on the A03s | Screenshot and UI dump |
| 2026-11-03T20:05:00Z | Claude | Report recorded | `/bug-user` intake; fix not started (needs Jim's go) |
| 2026-11-03T21:10:00Z | Jim / Claude | Fix approved by Jim; Codex building one shared scroll component for both Wrap up screens on `feat/numeracy-screens`. | Issue #148 |

## Open questions

- Does the released literacy Wrap up show the same thing on the A03s? If so, this affects the November
  literacy retest.
