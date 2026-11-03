---
record_version: 1
id: MA-BUG-20261103-001
title: On Android, the last line of How to teach it stays under the navigation bar
classification: product_defect
subsystem: numeracy lesson screens (How to teach it)

severity_score: 1
severity_band: S3
severity_components:
  user_impact: 1
  data_security_privacy: 0
  scope: 0
  recoverability: 0
severity_override: none
priority: P2

diagnosis_state: PROBABLE
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 75
confidence_basis: Reproduced on the A03s; the screen's ScrollView pads its content with spacing.lg only and has no footer or bottom inset, while Android runs edge-to-edge (edgeToEdgeEnabled true), so the last line can sit under the navigation bar.

created_at_utc: 2026-11-03T20:05:00Z
updated_at_utc: 2026-11-03T21:10:00Z
first_observed_at: 2026-11-03T19:33:00Z
last_observed_at: 2026-11-03T19:33:00Z

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
  - device-gate-W/2026-11-03/how-to-teach-it-bottom-inset
support_incident_keys: []
support_incident_signatures: []
evidence_paths:
  - docs/bugs/evidence/MA-BUG-20261103-001/a03-how-to-teach-it-scrolled-to-end.png
github_issues:
  - "#146"

data_safety_status: No data risk; display only.
workaround_status: None on the screen; the hidden line is the activity's "You need" list.
owner: Claude (fix on PR #145)
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261103-001 — On Android, the last line of How to teach it stays under the navigation bar

## User-visible symptom

Claude, running device gate W on the A03s: on How to teach it for "Count objects · up to 5", scrolling
to the end leaves the last line, "You need: Counters (8 for each child); number cards 1 to 5", partly
behind the Android navigation bar. The page cannot be scrolled further to bring it clear.

## Operational impact

- **Can the user continue?** Yes. The EA can still read the steps, but the materials list ("You need")
  is cut off. That is the line an EA needs before the lesson starts.
- **Core workflow affected:** Teaching a numeracy lesson (How to teach it).
- **Known affected users:** One test EA during the device gate.
- **Relevant exposed population:** Every Android EA on a numeracy programme, on any activity whose
  page is long enough to scroll. The new screens are not merged or released.
- **Workaround:** None on the screen.

## Data-safety assessment

- **UI visibility:** The last content line is hidden behind the system navigation bar.
- **Durable local SQLite rows:** Not affected.
- **Backend rows and relationships:** Not affected.
- **sync_outbox status, error_class/error_code:** Not affected.
- **Incident queue evidence:** None expected.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude device gate W observation | test EA Thandi Numeracy (`116abb34-…`) | 2026-11-03T19:33Z (A03 clock 09:33) | 2026-11-03T19:33Z | 1.5.0 preview vc57, sqlite-staging | Galaxy A03s, Android 13, 360 dp | Online | `a03-how-to-teach-it-scrolled-to-end.png` (sha256 `1d353b5a58c27138968aed444a3f243a010553ee370f514f5eaac6bc6aa6030f`) |

## Reproduction

### Reporter steps

1. Sign in as a numeracy EA with a group, then tap Record → Start lesson.
2. Tap the "Count objects · up to 5" activity card to open How to teach it.
3. Scroll to the end.

### Expected

The last line clears the navigation bar with the screen's normal bottom margin.

### Actual

The last line ("…number cards 1 to 5") sits under the navigation bar.

### Closest E2E reproduction

Reproduced on the device above with the preview build.

## Observed facts

- `src/screens/numeracy/HowToTeachScreen.js` renders a `ScrollView` with
  `contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}`. It has no sticky footer and no
  safe-area bottom inset.
- `app.config.js` sets `edgeToEdgeEnabled: true`, so app content draws behind the navigation bar.
- The other lesson screens end in a `StickyActionFooter`, which sits above the navigation bar. How to
  teach it is the only lesson screen without one.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| No bottom safe-area inset on an edge-to-edge screen | Code above; reproduced | None yet | 75% | Add `insets.bottom` to the content padding and recheck on the A03s |

## Root cause

Probable: under edge-to-edge, a scrolling screen must add the bottom safe-area inset itself. How to
teach it adds only `spacing.lg`, which is smaller than the navigation bar.

## Suggested fix

Pad the How to teach it content by `spacing.lg + insets.bottom` (`useSafeAreaInsets`), the same way
other footerless scrolling screens do. Also check for a shared helper before adding a new one.

## Verification plan

- [x] Reproduce the original end-user workflow on the affected release or
      closest faithful environment.
- [x] Add or identify a regression test that fails for the demonstrated causal
      mechanism.
- [x] Verify the targeted correction locally.
- [ ] Run the closest representative E2E flow on a physical device when the
      bug is device-, lifecycle-, SQLite-, or network-sensitive.
- [ ] Verify local durability and backend convergence for data/sync incidents. (Not applicable.)
- [ ] Identify the exact release/build containing the fix.
- [ ] Obtain field confirmation or record an explicit observation window with
      sufficient exposure and no recurrence.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-03T19:33:00Z | Claude | Observed in device gate W on the A03s | Screenshot |
| 2026-11-03T20:05:00Z | Claude | Report recorded | `/bug-user` intake; fix not started (needs Jim's go) |
| 2026-11-03T21:10:00Z | Jim / Claude | Fix approved by Jim. Fixed in code on `feat/numeracy-screens` commit `ec4569dd` (scroll content padded with `useScrollBottomPadding()`); new test pins `paddingBottom` = bottom inset + `spacing.lg`. Waits for the A03s recheck on the next build. | Issue #146 |

## Open questions

- Does the iPhone show the same gap above the home indicator? Jim's iPhone check of How to teach it
  will tell.
