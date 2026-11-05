---
record_version: 1
id: MA-BUG-20261105-001
title: The Profile footer's update line is a long code, so Jim cannot tell which version his phone is on
classification: product_defect
subsystem: profile-release-identity

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
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 90
confidence_basis: The footer prints the raw update id (formatReleaseLines in AppReleaseInfo.js at fd053cfc); the phone was on the new update, so only the label was unreadable. PR #167 replaces it with a card and numbered updates and is locally tested, not yet seen on a phone.

created_at_utc: 2026-11-05T17:25:14Z
updated_at_utc: 2026-11-05T17:25:14Z
first_observed_at: 2026-11-05
last_observed_at: 2026-11-05

known_occurrences: 1
known_affected_users: 1
affected_user_ids: []
exposure_denominator: every phone shows the footer; only one person has said it is unreadable
exposure_window: since the footer showed `Update <id>` (1.5.0 pilot builds)

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - 1.5.0 (28)
affected_devices:
  - iPhone 17
affected_os_versions:
  - iOS 26.6.2
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths: []
github_issues:
  - https://github.com/JimMcKeown17/masi-app/pull/167

data_safety_status: no data risk; the screen only labels the release
workaround_status: compare the update id's first eight characters with the published update group by hand
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261105-001 — The Profile footer's update line is a long code, so Jim cannot tell which version his phone is on

## User-visible symptom

Jim, on an iPhone 17 (iOS 26.6.2) running 1.5.0 build 28, on 2026-11-05:

> even now, I don't know if I'm on the correct version despite opening and closing then reopening. That update string at the bottom is indecipherable.

The Profile footer showed `Update 01a1ac5f-70ce-7236-a7d8-964d2a51640c`, a 36-character code, in the same line as the device and system.

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** None; telling the app version apart (support and testing).
- **Known affected users:** 1 (Jim).
- **Relevant exposed population:** Anyone who reads the Profile footer, including EAs who report a problem and Jim when checking an update landed.
- **Workaround:** Compare the first eight characters of the code with the published update group.

## Data-safety assessment

- **UI visibility:** The footer shows the code; the code was right.
- **Durable local SQLite rows:** Not involved.
- **Backend rows and relationships:** Not involved.
- **sync_outbox status, error_class/error_code:** Not involved.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None known.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Message from Jim with two screenshots | Jim | 2026-11-05 (local time unknown) | 2026-11-05T17:00:00Z | 1.5.0 (28), sqlite-staging, update group 8addaae6 | iPhone 17, iOS 26.6.2 | unknown | Two screenshots held privately by Jim (Downloads, 11.00.18 and 11.01.21); not copied |

Screenshot description only (the Zazi iZandi one shows another person's name and email, so neither file is copied): the first shows the Masi Profile footer with the `Update` code; the second shows the Zazi iZandi app's equivalent footer, where the release reads more clearly.

## Reproduction

### Reporter steps

1. Open the app on an update-launched build, open Profile, scroll to the footer.
2. Close and reopen the app, check the footer again.

### Expected

The footer says plainly which version and which update the phone is on.

### Actual

It shows `Update` followed by the full update id. Opening and closing again shows the same code, so the person cannot tell whether the new update arrived.

### Closest E2E reproduction

Jim's own phone. Not repeated by Claude.

## Observed facts

- `src/components/profile/AppReleaseInfo.js` at `fd053cfc`, `formatReleaseLines`, prints `Update ${update.id || 'Embedded'}` as the third line segment (the raw id).
- Jim's phone was in fact on the new update: the id is the iOS update id of group `8addaae6`.
- The footer also joins device, system and update on one line, so the code wraps on a narrow phone.
- PR #167 (`feat/app-release-card`, head `e9a4360d`) replaces the line with an App release card and numbered updates (`1.5.0+N`, from `npm run ota:publish`; `1.5.0+?` when published without it).

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The raw update id, with no number, is the whole cause | Code at fd053cfc; the phone's id matched the new group | None | 90% | Jim opens the card from PR #167 on a phone |

## Root cause

The footer exposes the machine id of the update instead of a version a person can compare. Nothing is wrong with which update the phone runs.

## Suggested fix

PR #167: App release card with the version, a numbered update (`1.5.0+N`), when it was published, and the short code.

## Verification plan

- [x] Reproduce the original footer on the affected release (Jim's screenshots).
- [x] Verify the targeted correction locally (PR #167 tests).
- [ ] Jim reads the card on the iPhone after the next update.
- [ ] Identify the exact release or update that contains it.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T17:00:00Z | Jim | Reports the unreadable update line | Message with two screenshots |
| 2026-11-05T17:25:14Z | Claude | Report recorded | Code read at fd053cfc; PR #167 linked |

## Open questions

- Does the card from PR #167 answer "am I on the new one" at a glance on the iPhone?
