---
record_version: 1
id: MA-BUG-20261105-011
title: Work history hides the day's date and leaves a large empty gap above the entries
classification: product_defect
subsystem: time-tracking

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
delivery_state: NO_FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 40
confidence_basis: Reproduced on the A03s and the layout dump shows the date text absent and ~600 px between the Today badge and the first card; the zero-width SectionHeader mechanism fits the code but is untested.

created_at_utc: 2026-11-05T22:55:00Z
updated_at_utc: 2026-11-05T22:55:00Z
first_observed_at: 2026-11-05T22:39:00Z
last_observed_at: 2026-11-05T22:52:00Z

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
  - docs/bugs/user-submissions-walkthrough/MA-BUG-20261105-011/ (private, gitignored; hashes below)
github_issues: []

data_safety_status: No data risk
workaround_status: Scroll down to the entries
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261105-011 — Work history hides the day's date and leaves a large empty gap above the entries

## User-visible symptom

Home → the clock row → **Work history**. Under "Work History / Your completed time entries", only a
**Today** badge shows at the right. There is no date beside it, and about 600 px of empty screen sit
between the badge and the first time-entry card, so the entries start near the bottom of the screen.

## Operational impact

- **Can the user continue?** Yes, by scrolling.
- **Core workflow affected:** Checking hours worked.
- **Known affected users:** 1 (test EA).
- **Relevant exposed population:** Every EA who opens Work history, if the cause is layout (unknown).
- **Workaround:** Scroll.

## Data-safety assessment

- **UI visibility:** Entries are shown with correct times; the date heading is not visible.
- **Durable local SQLite rows:** Not affected.
- **Backend rows and relationships:** The two entries shown match `time_entries` on the server.
- **sync_outbox status, error_class/error_code:** Not relevant.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not relevant.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | `phone-design-review` test agent | Test EA | 2026-11-06 00:39 SAST | 2026-11-05T22:53:00Z | 1.5.0+6, sqlite-staging | Galaxy A03s, Android 13 | Wi-Fi | `agent-44-work-history.png` |
| R2 | Claude, E2E reproduction with layout dump | Test EA | 2026-11-06 00:52 SAST | 2026-11-05T22:53:00Z | 1.5.0+6, sqlite-staging | Galaxy A03s, Android 13 | Wi-Fi | `claude-00-work-history.png` |

Private screenshots (SHA-256), under `docs/bugs/user-submissions-walkthrough/MA-BUG-20261105-011/`:

- `agent-44-work-history.png` 68aa6d2e6fe2038bdce8383ab89f0f75c6e8589378b56b9b96181c2de201c5d4
- `claude-00-work-history.png` b6d832e80ce521c4e183adb1a3f743fdfd3ec2ba7325e907790ba70c123c0001

They show the phone's GPS coordinates, so they stay out of Git.

## Reproduction

### Reporter steps

1. Clock in and out at least once today.
2. Home → tap the clock row ("View work history").

### Expected

A date heading such as "Friday, 6 Nov 2026" with the Today badge, and the cards directly below.

### Actual

Only the Today badge; the first card starts about 600 px lower.

### Closest E2E reproduction

R2 on the A03s. The uiautomator layout shows the Today badge at y 308–336 and the first card's hours
text at y 942, with no node for the date text.

## Observed facts

- `renderSectionHeader` puts `<SectionHeader title={formatDateHeader(…)} />` and the Today badge in a
  row with `justifyContent: 'space-between'` (`src/screens/main/TimeEntriesListScreen.js:212-219`,
  styles `dateHeader`).
- `SectionHeader`'s title has `flex: 1` inside its own row, and the component's container sets no
  width or flex (`src/components/common/SectionHeader.js:17-19`).

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| SectionHeader collapses to zero width inside the space-between row, so its flex title wraps one character per line into a tall, invisible column | Date text absent from the dump; the gap is about one line height per character of a long date | Not tested | 40% | Give the SectionHeader `style={{ flex: 1 }}` in `dateHeader` and reopen Work history |

## Root cause

Unknown; see the leading hypothesis.

## Suggested fix

No fix proposed. The design review that found this also suggests dropping the duplicate
"Work History" title, the raw coordinates and "0.00 hours" rows; those are design changes, not this
bug.

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
| 2026-11-05T22:39:00Z | Test agent (Claude Sonnet) | Seen during the first `phone-design-review` test run | `agent-44-work-history.png` |
| 2026-11-05T22:52:00Z | Claude | Reproduced with a layout dump; code read | `claude-00-work-history.png` |
| 2026-11-05T22:55:00Z | Claude | Report recorded | Initial intake (`/bug-user`, RECORD_AND_TRIAGE) |

## Open questions

- Does it happen on iPhone, and with several days of entries?
