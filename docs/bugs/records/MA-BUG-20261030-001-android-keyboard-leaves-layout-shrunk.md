---
record_version: 1
id: MA-BUG-20261030-001
title: On Android, layouts stay shrunk after the keyboard closes
classification: product_defect
subsystem: ui-keyboard-avoidance

severity_score: 4
severity_band: S2
severity_components:
  user_impact: 2
  data_security_privacy: 0
  scope: 2
  recoverability: 0
severity_override: none
priority: P2

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 90
confidence_basis: Real RN 0.81.5 component and keyboard emitter reproduce 72 dp padding residue and 162 dp height residue with offset 90; app wrapper restores the original layout. Emulator event measurements were supplied by the orchestrator; physical-device closure remains open.

created_at_utc: 2026-10-30T23:30:00Z
updated_at_utc: 2026-10-31T01:01:06Z
first_observed_at: 2026-10-30T16:49:00Z
last_observed_at: 2026-10-30T16:56:00Z

known_occurrences: 1
known_affected_users: 1
affected_user_ids:
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0
exposure_denominator: unknown
exposure_window: 2026-10-30 A03s device gates only; no field cohort runs the app
  (field retest November 2026)

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - 1.5.0 (55), embedded update 20cb17f0-c9bb-4eb2-9df2-35b33b695e5c
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
  - docs/bugs/evidence/MA-BUG-20261030-001/a03s-change-password-after-keyboard.png
  - docs/bugs/evidence/MA-BUG-20261030-001/a03s-report-problem-after-keyboard.png
  - docs/bugs/evidence/MA-BUG-20261030-001/a03s-edit-child-after-keyboard.png
github_issues: []

data_safety_status: no data risk; layout only
workaround_status: scroll to reach Save; close and reopen a sheet
owner: claude
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261030-001 — On Android, layouts stay shrunk after the keyboard closes

## User-visible symptom

Observed during the 1.5.0 (55) A03s device gates. After typing in a field and
closing the keyboard:

- **Change password** and **Report a problem** sheets stop short of the bottom
  of the screen. A strip of the dimmed Profile page shows between the sheet and
  the navigation bar ("Test crash reporting" is visible through it).
- **Edit child** keeps its scroll area short. About 200 px of empty page sits
  below the form and **Save changes** stays hidden until the EA scrolls.

## Operational impact

- **Can the user continue?** Yes. Scrolling reveals Save; the sheet still works.
- **Core workflow affected:** Editing a child, changing a password, reporting a
  problem. Likely also Add child, Create class, Edit class and Login, which use
  the same `KeyboardAvoidingView` pattern (not yet observed).
- **Known affected users:** One test account during device gates.
- **Relevant exposed population:** Every Android phone running these screens
  under edge-to-edge (SDK 54 default). iOS not observed.
- **Workaround:** Scroll; close and reopen the sheet.

## Data-safety assessment

- **UI visibility:** Layout only. No data hidden or changed.
- **Durable local SQLite rows:** Not involved.
- **Backend rows and relationships:** Not involved.
- **sync_outbox status, error_class/error_code:** Not involved.
- **Incident queue evidence:** None; a layout defect produces no receipt.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | A03s device gates (Claude, orchestrator) | test+b@masinyusane.org (`0d7e80de-df70-4d9a-a569-d8a4cdeba6a0`) | 2026-10-30T16:49:00Z–16:56:00Z | 2026-10-30T16:56:00Z | 1.5.0 (55), Play internal testing, sqlite-staging | Galaxy A03s, Android 13 | Wi-Fi | Three screenshots below |

Evidence (SHA-256):

- `a03s-change-password-after-keyboard.png` `97db502ccc91d87acb6027bdd6425d42c43783d40cc5b3776bffac37ebe3cdea`
- `a03s-report-problem-after-keyboard.png` `3200466f860fd5c93a087ee20f6551e941749503c171c751b305e1c74ab59f61`
- `a03s-edit-child-after-keyboard.png` `7ee969c8b29a409ee37c2b8c3fec659a72ab96e42879a1c495210d9b5c189d59`

## Reproduction

### Reporter steps

1. Profile → Change password. Tap a field; the keyboard opens.
2. Close the keyboard with the system Back gesture.
3. Separately: open a child → Edit, tap Last name, close the keyboard.

### Expected

The sheet returns to the bottom of the screen; Edit child's scroll area returns
to full height.

### Actual

The sheet sits about 130 px (65 dp) too high, with the page showing below it.
Edit child's scroll area stays about 200 px short.

### Closest E2E reproduction

The A03s observation above, on the Play build. The orchestrator supplied an Android 15 emulator probe: window height 914.29 dp,
hide screenY 842.2857 dp, a 72 dp difference (status 24 + navigation 48).
Local Jest tests replay these coordinates through RN's real keyboard emitter.
The fix has not been rechecked on a device in this implementation session.

## Observed facts

- `BottomSheet` wraps its panel in React Native's `KeyboardAvoidingView`
  (`behavior="padding"`). Edit child, Add child, Create class and Edit class use
  `behavior="height"` with `keyboardVerticalOffset={90}` on Android. Login uses
  `behavior="padding"`. Forgot password already disables it on Android.
- React Native 0.81.5 `KeyboardAvoidingView` handles Android `keyboardDidHide`
  with `_onKeyboardChange`, the same path as a show: it recomputes
  `frame.y + frame.height - endCoordinates.screenY` instead of resetting to zero
  (iOS uses a separate `_onKeyboardHide`).
- `ReactRootView.checkForKeyboardEvents` (API 30+) sends `keyboardDidHide` with
  `screenY = getWindowVisibleDisplayFrame().height()`, which excludes the status
  and navigation bars. Under edge-to-edge (`edgeToEdgeEnabled: true`) the view
  frame reaches the bottom of the screen, so the difference is never zero.
- Measured from the screenshots: the sheet's bottom sits at y=1470 px on a
  1600 px screen (130 px = 65 dp). The A03s status bar plus navigation bar is
  about 66 dp.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The Android hide event's `screenY` (visible-frame height) leaves `KeyboardAvoidingView` with a residual offset equal to the system bars, plus `keyboardVerticalOffset` on screens that set it | Source of both files; 65 dp measured vs ~66 dp predicted; Change password predates this release, so the cause is shared code | Physical-device fix closure remains open | 95% | Real RN tests reproduce and clear both residuals; recheck the fixed build on A03s |
| A sheet-specific layout bug in `BottomSheet` padding | The sheet changes its own bottom padding on keyboard show | Edit child is not a sheet and shows the same symptom | 10% | Same emulator check |

## Root cause

Confirmed locally: React Native trusts the Android hide event's coordinates, and under
edge-to-edge those coordinates describe the visible frame rather than the full
window, so `KeyboardAvoidingView` keeps padding (or a reduced height) after the
keyboard is gone.

## Suggested fix

One shared keyboard-avoiding component that trusts React Native's calculation
only while the keyboard is visible on Android, used by every screen and sheet
in place of the React Native import, with a guard test against direct imports.
Jim approved fixing this at its root on 2026-10-30.

## Verification plan

- [ ] Reproduce the original end-user workflow on the affected release or
      closest faithful environment.
- [x] Add or identify a regression test that fails for the demonstrated causal
      mechanism.
- [x] Verify the targeted correction locally.
- [ ] Run the closest representative E2E flow on a physical device when the
      bug is device-, lifecycle-, SQLite-, or network-sensitive.
- [ ] Verify local durability and backend convergence for data/sync incidents.
      (Not applicable: layout only.)
- [ ] Identify the exact release/build containing the fix.
- [ ] Obtain field confirmation or record an explicit observation window with
      sufficient exposure and no recurrence.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-30T16:56:00Z | Claude | Observed during A03s gates | Screenshots above |
| 2026-10-30T23:30:00Z | Claude | Report recorded | First registry sweep; source traced to React Native 0.81.5 |
| 2026-10-30T23:30:00Z | Jim | Fix approved | "Then your suggested steps 2 and 3 as well please" |
| 2026-10-31T01:01:06Z | Codex | Implemented on `fix/keyboard-residue` | Real RN RED → GREEN for padding/height; original flex restored; release and device gates open |

## Open questions

- Does iOS show any residue? The iOS path resets on `keyboardWillHide`, so it
  should not; the iPhone smoke on TestFlight 26 can confirm.

## Local implementation evidence (2026-10-30)

`src/components/common/KeyboardAvoidingView.js` keeps RN's component mounted,
uses event type for Android visibility (including floating shows with height 0
or 48), and ANDs visibility with the caller's enabled prop. All seven consumers
now use it; Forgot password retains its explicit iOS-only enabled setting.
Non-Android props pass through unchanged.

The first real-RN RED expected paddingBottom 0 and received 72 after show at
screenY 500 and hide at 842 in a 914 dp frame. Height mode with offset 90,
including the native reduced-frame layout, expected height 914 and received
752 (162 dp residue). An additional RED caught the naive disabled-height
wrapper retaining height 914 and flex 0 instead of the original flex 1.
The final wrapper omits height behavior while inactive to restore caller
layout exactly, without changing the rendered View/child identity. Both padding
and height tests cover a second keyboard cycle. Positive controls retain the
upstream residuals as passing assertions of the demonstrated mechanism.

Tests use RCTDeviceEventEmitter, the emitter behind RN's Keyboard module;
neither Keyboard nor RN's KeyboardAvoidingView is mocked. The import guard
first failed with all seven consumers and now permits only the app wrapper.
BottomSheet also has a real show/hide padding regression.

No release or physical-device verification was performed. Keep the A03s
Change password, Report a problem and Edit child workflows, Android floating
keyboard, and iOS smoke gates open.

Final Node 20 verification: focused 3 suites / 44 tests; related 21 suites /
281 tests; full `npm test -- --silent` 464 suites / 7,377 tests / 14 snapshots;
`npm run test:types` and `git diff --check` passed. All commands exited 0.
