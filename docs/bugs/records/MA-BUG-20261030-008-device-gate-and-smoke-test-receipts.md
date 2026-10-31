---
record_version: 1
id: MA-BUG-20261030-008
title: Device-gate and smoke-test receipts (deliberate, not a bug)
classification: not_a_bug
subsystem: field-diagnostics

severity_score: 0
severity_band: S4
severity_components:
  user_impact: 0
  data_security_privacy: 0
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: CONFIRMED
delivery_state: NO_PRODUCT_CHANGE
verification_state: NOT_TESTED

root_cause_confidence_pct: 95
confidence_basis: Every receipt matches a dated, logged test action (build log 2026-10-17 D1 gates, 2026-10-29 hosted smoke, 2026-10-30 A03s gates) by the same test accounts.

created_at_utc: 2026-10-30T23:30:00Z
updated_at_utc: 2026-10-30T23:30:00Z
first_observed_at: 2026-10-17T13:03:08Z
last_observed_at: 2026-10-30T16:57:44Z

known_occurrences: 10
known_affected_users: 0
affected_user_ids: []
exposure_denominator: not applicable
exposure_window: 2026-10-17 to 2026-10-30

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - 1.3.0 (8)
  - 1.3.0 (10)
  - 1.4.0 (hosted smoke, no build)
  - 1.5.0 (55)
affected_devices:
  - Samsung Galaxy A03s (SM-A037U)
  - Jim's iPhone
affected_os_versions:
  - Android 13 (API 33)
  - iOS (version not recorded)
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids:
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/ea_report/a0c0c281-bc0b-4060-b2c8-da8feefbea5e:b9fcea6d-9b3b-5b81-9bbc-948691283512
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/ea_report/a0c0c281-bc0b-4060-b2c8-da8feefbea5e:3637b140-b494-5162-8cf1-b0bdf409460b
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/ea_report/a0c0c281-bc0b-4060-b2c8-da8feefbea5e:c0293ddf-1220-5f0d-99d7-6cfb535ddb85
support_incident_keys:
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/left_behind_unsent_work/9b24f00f-c03c-4aac-8b6f-619080d88665:f2e176b6-7493-53f6-977b-4c5652d2bd94
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/left_behind_unsent_work/1cf6fb1a-4662-4b77-bf88-c3519f61d694:3aaa4a9c-dec6-5942-9c39-fd70f7d65be9
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/left_behind_unsent_work/32ae34af-3b4f-431e-a7a0-87bb4ae82d49:smoke-9c995d9b-8025-4592-916c-f2b97586b0d2
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/diagnostics_sent/32ae34af-3b4f-431e-a7a0-87bb4ae82d49:762ed44c-222c-4606-a1a9-803b8f04ab23
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/diagnostics_sent/a0c0c281-bc0b-4060-b2c8-da8feefbea5e:fed3278c-14cc-5f9f-a961-c09efec42c7d
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/diagnostics_sent/a0c0c281-bc0b-4060-b2c8-da8feefbea5e:3310e4c9-f380-5a5e-8ffc-96f08a5bd0f1
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/upload_terminal/a0c0c281-bc0b-4060-b2c8-da8feefbea5e:e0f50477-12c9-58e5-9e19-8897b50f79c4
support_incident_signatures: []
evidence_paths: []
github_issues: []

data_safety_status: no field data; test accounts on the staging backend
workaround_status: not applicable
owner: claude
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261030-008 — Device-gate and smoke-test receipts (deliberate, not a bug)

## User-visible symptom

None. These receipts were produced on purpose while proving the support
incident lane. This record claims them so a sweep does not list them as
unrecorded. Matching here says nothing about future receipts: only these exact
condition keys are claimed, and no signature.

## Operational impact

- **Can the user continue?** Not applicable.
- **Core workflow affected:** None.
- **Known affected users:** None; test accounts only.
- **Relevant exposed population:** Not applicable.
- **Workaround:** Not applicable.

## Data-safety assessment

- **UI visibility:** Not applicable.
- **Durable local SQLite rows:** The 2026-10-17 left-behind shifts uploaded
  exactly once after Test signed back in (build log, 2026-10-17 device rows).
- **Backend rows and relationships:** Test child "Tootie monshy"
  (`6ea13ec4-e8d9-49eb-9927-8957c7c44f96`) keeps `preferred_name = 'HO edit (A03 gate 5)'`
  and `row_version = 10` from gate 5.
- **sync_outbox status, error_class/error_code:** The gate 5 edit stays terminal
  (`MV001`) on the A03s, by design.
- **Incident queue evidence:** Ten receipts, listed below.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

Accounts: `0d7e80de-df70-4d9a-a569-d8a4cdeba6a0` is test+b@masinyusane.org
(TestB); `1b1953c3-063e-4d89-8b07-5e55c970cfef` is test@masinyusane.org (Test).

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | `lb:12eea56a`, D1 sign-out gate | TestB (stranded: Test, 1 time entry) | unknown | 2026-10-17T13:03:08Z | 1.3.0 (8) | Galaxy A03s | Wi-Fi | Build log 2026-10-17 |
| R2 | `lb:c4cf28bd`, D1 sign-out gate | TestB (stranded: Test, 1 time entry) | unknown | 2026-10-17T14:40:22Z | 1.3.0 (10) | Jim's iPhone | Wi-Fi | Build log 2026-10-17 |
| R3 | `lb:60ffecd9`, hosted smoke (`smoke: true`) | Test | unknown | 2026-10-29T18:21:57Z | 1.4.0, no build | none (SQL smoke) | n/a | Build log 2026-10-29 |
| R4 | `dg:92c460ce`, hosted smoke (`smoke: true`), with bundle | Test | 2026-10-29T18:21:59.019Z | 2026-10-29T18:21:59Z | 1.4.0, no build | none (SQL smoke) | n/a | Build log 2026-10-29 |
| R5 | `dg:9be72255`, gate 1 Send diagnostics | TestB | 2026-10-30T16:45:05.837Z | 2026-10-30T16:45:07Z | 1.5.0 (55) | Galaxy A03s, Android 13 | Wi-Fi | 46 KB bundle |
| R6 | `er:ddb36337`, gate 2 report without screenshot | TestB | 2026-10-30T16:46:42.260Z | 2026-10-30T16:46:43Z | 1.5.0 (55) | Galaxy A03s, Android 13 | Wi-Fi | Bundle |
| R7 | `er:d825982c`, gate 3 report with screenshot | TestB | 2026-10-30T16:48:50.093Z | 2026-10-30T16:48:52Z | 1.5.0 (55) | Galaxy A03s, Android 13 | Wi-Fi | Bundle and 720×1600 JPEG |
| R8 | `er:eee0a7ed`, gate 4 offline report | TestB | 2026-10-30T16:50:56.819Z | 2026-10-30T16:52:28Z | 1.5.0 (55) | Galaxy A03s, Android 13 | offline, then Wi-Fi | Bundle |
| R9 | `dg:dfc2798d`, gate 4 offline diagnostics | TestB | 2026-10-30T16:51:19.861Z | 2026-10-30T16:52:32Z | 1.5.0 (55) | Galaxy A03s, Android 13 | offline, then Wi-Fi | Bundle |
| R10 | `ut:d59e852f`, gate 5 forced stale edit (MV001) | TestB | 2026-10-30T16:57:26.442Z | 2026-10-30T16:57:44Z | 1.5.0 (55) | Galaxy A03s, Android 13 | Wi-Fi | Bundle with wire payload |

Observed times are each receipt's `first_seen_at`. Schema 1 receipts (R1–R3)
carry none.

EA report text, preserved verbatim:

- R6: "A03s gate 2: online report without a screenshot. The week strip showed 0
  for Monday." (Filler text written for the gate; not an observation.)
- R7: "A03s gate 3: report with a screenshot of Profile."
- R8: "A03s gate 4: offline report, no Wi-Fi."

## Reproduction

### Reporter steps

1. See the build log entries for 2026-10-17 (D1), 2026-10-29 (hosted smoke)
   and 2026-10-30 (A03s gates).

### Expected

Each test produces one receipt.

### Actual

Each test produced one receipt.

### Closest E2E reproduction

These are the E2E runs.

## Observed facts

- First full sweep, snapshot `2026-10-30T23:08:55.076884+00:00`: 10 receipts,
  10 conditions, all from the two test accounts.
- R10 is the evidence behind MA-BUG-20261030-004 (detail dropped) and
  MA-BUG-20261030-005 (stale release identity). Those records cite it; this
  record owns its key because the receipt itself was deliberate.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| Deliberate test receipts | Build log entries match each time and account | None | 95% | Not needed |

## Root cause

Not a defect: deliberate test actions.

## Suggested fix

None.

## Verification plan

- [ ] None required.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-30T23:08:55Z | Claude | First full sweep | 10 receipts, 10 unrecorded |
| 2026-10-30T23:30:00Z | Claude | Report recorded | All ten conditions claimed by exact key |

## Open questions

- Should test accounts be excluded or labelled in the reader once real EAs
  start reporting? Today the sweep shows them like anyone else.
