---
record_version: 1
id: MA-BUG-20261105-009
title: After a quick test, Done leaves the finished test underneath, so Android Back reopens Assessment Complete
classification: product_defect
subsystem: navigation

severity_score: 5
severity_band: S2
severity_components:
  user_impact: 2
  data_security_privacy: 1
  scope: 2
  recoverability: 0
severity_override: none
priority: P2

diagnosis_state: PROBABLE
delivery_state: NO_FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 70
confidence_basis: Reproduced end to end on the A03s; the Done handler calls navigate('MainTabs'), which in React Navigation 7 pushes a new route instead of going back, while the session and battery summaries use popTo; no targeted intervention tried yet.

created_at_utc: 2026-11-05T22:35:00Z
updated_at_utc: 2026-11-05T22:35:00Z
first_observed_at: 2026-11-05T22:18:00Z
last_observed_at: 2026-11-05T22:22:30Z

known_occurrences: 2
known_affected_users: 1 (test)
affected_user_ids:
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef
exposure_denominator: unknown
exposure_window: unknown

environment: sqlite-staging (segygjzpujphwvrubusm), pilot preview channel
affected_releases:
  - 1.5.0+6 (Android build 58, update 01a1ad71, source ab9e16f)
affected_devices:
  - Samsung Galaxy A03s (SM-A037U)
affected_os_versions:
  - Android 13
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths:
  - docs/bugs/user-submissions-walkthrough/MA-BUG-20261105-009/ (private, gitignored; hashes below)
github_issues: []

data_safety_status: No data lost; a stale result screen invites an unintended repeat test
workaround_status: Tap Done or a tab instead of Android Back; restarting the app clears the stack
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261105-009 — After a quick test, Done leaves the finished test underneath, so Android Back reopens Assessment Complete

## User-visible symptom

After finishing a Letter Sounds quick test and tapping **Done**, the EA lands on the Assessments tab
as expected. Pressing Android Back goes to Home, and pressing it again reopens **Assessment Complete**
for the child just tested (with **Try again** and **Done**), instead of leaving the app. Pressing Back
once more shows **Select child** from the same test.

A test agent running the new `phone-health-check` walkthrough saw it first: "the back stack from
Home (or Profile) re-surfaces a finished assessment result."

## Operational impact

- **Can the user continue?** Yes. Done, a tab, or an app restart recovers.
- **Core workflow affected:** Quick assessments (Letter Sounds; likely Word Reading, which shares the
  results screen).
- **Known affected users:** 1 (test EA).
- **Relevant exposed population:** Every EA who runs a quick test and then uses Android Back
  (unknown count).
- **Workaround:** Use the on-screen buttons and tabs instead of Android Back after a test.

## Data-safety assessment

- **UI visibility:** The finished test's screens stay mounted under the tabs, one set per test.
- **Durable local SQLite rows:** Not affected; the assessment saved before the results screen.
- **Backend rows and relationships:** The two tests in this record synced normally (`assessments`
  rows with 100 `assessment_items`, `stopped_reason` `ea_ended`).
- **sync_outbox status, error_class/error_code:** `sync_outbox` 0 in the diagnostics bundle taken
  during the same run (`dg:e4a20754`).
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Converged.
- **Duplication, misattribution, or cross-account risk:** An EA who meets the stale result screen and
  taps **Try again** starts a second test for that child without meaning to. Not observed.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | `phone-health-check` test agent | Test EA | 2026-11-06 00:18 SAST (2026-11-05T22:18Z) | 2026-11-05T22:20:00Z | 1.5.0+6, sqlite-staging | Galaxy A03s, Android 13 | Wi-Fi | `agent-41-home-final.png` |
| R2 | Claude, E2E reproduction | Test EA | 2026-11-06 00:21–00:22 SAST | 2026-11-05T22:23:00Z | 1.5.0+6, sqlite-staging | Galaxy A03s, Android 13 | Wi-Fi | `01-results.png` to `05-after-third-back.png` |

Private screenshots (SHA-256), under `docs/bugs/user-submissions-walkthrough/MA-BUG-20261105-009/`:

- `01-results.png` 4a4082629fd2839d78949c2ab9f3d2f2e304e9902648891dd1c27d47501df9c7
- `02-after-done.png` 64b059a572136c7067bb557a7167f32794c1e51ad36506e6f89563fe1b3fd90f
- `03-after-back.png` 99524ca91702be25e3a790321abff61f8db24973ddce5d7c0a1cf2d66bec47e3
- `04-after-second-back.png` 202162626daf20ec983b5c33c6cbaf7dfab8a98dc921c13cffaf5b3c22f3d696
- `05-after-third-back.png` 7197886a25207bd0d9a0336504f95ab49db8744ebad3dd2a8fecf37f7dc57ba1
- `agent-41-home-final.png` cc054f6d26501a9f5dbc90920758ab050c933f7619c85048250f601e7ddcfacf

They show test children's names, so they stay out of Git.

## Reproduction

### Reporter steps

1. Assess tab → Letter Sounds → pick a child → Start → mark one letter → End test → End test.
2. On Assessment Complete, tap **Done**.
3. Press Android Back twice.

### Expected

Done returns to the Assessments tab with the test's screens gone. Back from Home leaves the app.

### Actual

Back → Home; Back → Assessment Complete for that child; Back → Select child.

### Closest E2E reproduction

Reproduced on the A03s with the pilot install (1.5.0+6) at 2026-11-05T22:21–22:22Z, signed in as the
Test EA, online. `am force-stop` + relaunch cleared the stack.

## Observed facts

- `AssessmentResultsScreen.handleDone` calls `navigation.navigate('MainTabs', { screen: 'Assessments' })`
  (`src/screens/assessments/AssessmentResultsScreen.js:63-64`).
- The app uses `@react-navigation/native` 7.x and `native-stack` 7.x (`package.json`).
- Other completion screens return with `popTo`: `SessionCompleteScreen.js:63`,
  `BatteryRunSummaryScreen.js:100`, and the ALREADY_SAVED paths of both wrap-up screens.
- After Done the Assessments tab is shown, and the earlier result and child picker are still in the
  root stack (R2 screenshots).

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| `navigate('MainTabs')` pushes a second MainTabs on React Navigation 7 instead of returning to the existing one, leaving SelectChild and AssessmentResults underneath | Exact reproduction; v7 removed navigate's go-back behaviour; sibling screens use `popTo` | None found | 70% | Change Done to `popTo('MainTabs', { screen: 'Assessments' })` and repeat R2's Back presses |

## Root cause

Probable: React Navigation 7's `navigate` no longer returns to a route already in the stack. Done
therefore pushes a new MainTabs on top of the finished test's SelectChild → StandaloneTest-replaced
AssessmentResults routes. Android Back pops the new tabs and reveals the old result. Each quick test
adds one more set of routes.

## Suggested fix

Use `popTo('MainTabs', { screen: 'Assessments' })` in `handleDone`, matching the session and battery
summaries, and audit other `navigate('MainTabs', …)` calls from root-stack screens. Not approved.

## Verification plan

- [x] Reproduce the original end-user workflow on the affected release or
      closest faithful environment.
- [ ] Add or identify a regression test that fails for the demonstrated causal
      mechanism.
- [ ] Verify the targeted correction locally.
- [ ] Run the closest representative E2E flow on a physical device when the
      bug is device-, lifecycle-, SQLite-, or network-sensitive.
- [ ] Verify local durability and backend convergence for data/sync incidents.
- [ ] Identify the exact release/build containing the fix.
- [ ] Obtain field confirmation or record an explicit observation window with
      sufficient exposure and no recurrence.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T22:18:00Z | Test agent (Claude Sonnet) | Seen during the first `phone-health-check` test run | `agent-41-home-final.png` |
| 2026-11-05T22:22:30Z | Claude | Reproduced end to end; code path read | R2 screenshots; `AssessmentResultsScreen.js:63-64` |
| 2026-11-05T22:35:00Z | Claude | Report recorded | Initial intake (`/bug-user`, RECORD_AND_TRIAGE) |

## Open questions

- Does the same happen after Word Reading and on iPhone (swipe-back)?
- Do any other root-stack screens call `navigate('MainTabs', …)` after a flow finishes?
