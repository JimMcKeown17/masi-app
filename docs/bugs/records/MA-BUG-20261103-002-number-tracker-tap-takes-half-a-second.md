---
record_version: 1
id: MA-BUG-20261103-002
title: A Number tracker tap takes about half a second to change the tile on the A03s
classification: product_defect
subsystem: numeracy Number tracker (NumberTrackerPanel, tickStepNow)

severity_score: 2
severity_band: S3
severity_components:
  user_impact: 2
  data_security_privacy: 0
  scope: 0
  recoverability: 0
severity_override: none
priority: P2

diagnosis_state: HYPOTHESIS
delivery_state: IN_PROGRESS
verification_state: NOT_TESTED

root_cause_confidence_pct: 40
confidence_basis: Timing measured on video; the code path awaits the full write transaction before it updates the tile and locks the grid meanwhile, which fits, but write time and render time were not separated.

created_at_utc: 2026-11-03T20:05:00Z
updated_at_utc: 2026-11-03T21:10:00Z
first_observed_at: 2026-11-03T19:36:00Z
last_observed_at: 2026-11-03T19:38:00Z

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
  - device-gate-W/2026-11-03/number-tracker-tap-latency
support_incident_keys: []
support_incident_signatures: []
evidence_paths:
  - docs/bugs/evidence/MA-BUG-20261103-002/a03-number-tracker-four-taps-show-touches.mp4
github_issues:
  - "#147"

data_safety_status: No data risk observed; each tap was written and synced (server rows checked).
workaround_status: Wait for each tile to change before tapping the next one.
owner: Claude (fix on PR #145)
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261103-002 — A Number tracker tap takes about half a second to change the tile on the A03s

## User-visible symptom

Claude, running device gate W6 on the A03s: tapping a step tile on a child's Number tracker changes it
only after a visible pause. The gate's target is a tick or untick "at once", under 300 ms by eye.
Measured from finger down to the tile changing colour, the four taps took:

| Tap | Time |
| --- | ---: |
| Untick | 467 ms |
| Tick | 466 ms |
| Untick | 817 ms |
| Tick | 550 ms |

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** Ticking steps on the Number tracker. An EA updating six children taps
  many tiles in a row.
- **Known affected users:** One test EA during the device gate.
- **Relevant exposed population:** Numeracy EAs on low-end Android phones. The screens are not merged or
  released.
- **Workaround:** Wait for each tile to change. While a write runs, the grid is read-only
  (`updatingStep`), so a quick second tap is ignored without any sign.

## Data-safety assessment

- **UI visibility:** The tile changes late. Each change was eventually shown correctly.
- **Durable local SQLite rows:** Written; the Home sync chip counted them as pending while offline.
- **Backend rows and relationships:** `skill_mastery` rows for each tap arrived on staging (read-only
  query, 2026-11-03 ~19:45Z).
- **sync_outbox status, error_class/error_code:** No failures seen; the phone reported "All saved and
  synced".
- **Incident queue evidence:** None expected.
- **Eventual convergence evidence:** Converged.
- **Duplication, misattribution, or cross-account risk:** None seen.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude device gate W observation (screenrecord with show_touches, frames sampled with AVFoundation) | test EA Thandi Numeracy (`116abb34-…`) | 2026-11-03T19:36–19:38Z | 2026-11-03T19:38Z | 1.5.0 preview vc57, sqlite-staging | Galaxy A03s, Android 13, 360 dp | Online | `a03-number-tracker-four-taps-show-touches.mp4` (sha256 `15a768a5936f11fe97cb420945c6867fd931a223713607233f774412025ec1b4`) |

## Reproduction

### Reporter steps

1. Open Children → class → the "123" Number tracker button for a child.
2. Tap a tile, such as Count objects "5", four times at ~1.6 s intervals.

### Expected

Each tile changes within ~300 ms.

### Actual

Each tile changed after 466–817 ms.

### Closest E2E reproduction

Reproduced on the device above. With "show touches" on, the touch dot marks the finger-down frame and a
sample of the tile pixel marks the change frame.

## Observed facts

- `NumberTrackerPanel.onTap` sets `updatingStep`, which makes the grid read-only. It then awaits
  `tickStepNow` and only afterwards calls `setTicks`, then starts a background `loadData`.
- `tickStepNow` runs one transaction: `hasActiveProgrammeAssignment`, `getProgrammeById`, then
  `setSkillMastery`. `setSkillMastery` reads the owed outbox slot, writes the row and writes the outbox
  row.
- `LetterMasteryPanel.handleCellTap` uses the same pattern (await the write, then update). No A03
  latency baseline exists for it.
- The preview build is a release build, so this is not debug-mode slowness.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The tile waits for the whole SQLite write transaction (programme checks, owed-slot read, row and outbox writes) | Code path; no visible change until the write resolves | Not timed separately | 40% | Time `tickStepNow` on the A03s (a temporary log, or a Share logs timing line) |
| Re-rendering the 37-tile grid twice (lock, then unlock) is slow on the A03s | Every tap re-renders the grid twice | Re-renders usually take tens of ms | 20% | React profiler or timing around `setUpdatingStep` |
| The letter tracker has the same delay (shared pattern, not a numeracy regression) | Same code shape | Unmeasured | 30% | Time a letter tile tap on the A03s |

## Root cause

Not established. The tap waits for the database write before it repaints. Which part dominates is
unknown.

## Suggested fix

Show the new tile state at once (optimistic), keep the guarded write as it is, and roll the tile back
with the existing "Step update was not saved" note if the write fails. Queue or allow taps on other
tiles instead of locking the whole grid. Measure first: if the transaction itself is slow, the same
change speeds up Wrap up chips and the letter tracker.

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
| 2026-11-03T19:38:00Z | Claude | Measured in device gate W6 on the A03s | Video, frame sampling |
| 2026-11-03T20:05:00Z | Claude | Report recorded | `/bug-user` intake; fix not started (needs Jim's go) |
| 2026-11-03T21:10:00Z | Jim / Claude | Fix approved by Jim; Codex building it on `feat/numeracy-screens` (optimistic tile change, writes serialised in tap order, rollback from SQLite on failure, only the tapped row re-renders). | Issue #147 |

## Open questions

- How long does `tickStepNow` take on the A03s, compared with the repaint?
