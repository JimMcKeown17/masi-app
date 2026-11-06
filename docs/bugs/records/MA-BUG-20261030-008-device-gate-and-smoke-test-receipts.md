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
confidence_basis: Every receipt matches a dated, logged test action (build log 2026-10-17 D1 gates, 2026-10-29 hosted smoke, 2026-10-30 A03s gates, 2026-10-31 A03s checks and EGMA gate, 2026-11-05 pilot release checks and phone-health-check runs) by test accounts.

created_at_utc: 2026-10-30T23:30:00Z
updated_at_utc: 2026-11-06T20:12:22Z
first_observed_at: 2026-10-17T13:03:08Z
last_observed_at: 2026-11-05T22:18:06Z

known_occurrences: 18
known_affected_users: 0
affected_user_ids: []
exposure_denominator: not applicable
exposure_window: 2026-10-17 to 2026-11-05

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - 1.3.0 (8)
  - 1.3.0 (10)
  - 1.4.0 (hosted smoke, no build)
  - 1.5.0 (55)
  - 1.5.0 (1) (.kbtest debug app on Metro)
  - sqlite-critical-hardening build 1 (.kbtest debug app on Metro, EGMA branch)
  - 1.5.0 (28) iOS
  - 1.5.0 (58)
  - 1.5.0+6 (58)
affected_devices:
  - Samsung Galaxy A03s (SM-A037U)
  - Jim's iPhone
  - iPhone 17 (iPhone18,3)
affected_os_versions:
  - Android 13 (API 33)
  - iOS (version not recorded)
  - iOS 26.6.2
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids:
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/ea_report/a0c0c281-bc0b-4060-b2c8-da8feefbea5e:b9fcea6d-9b3b-5b81-9bbc-948691283512
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/ea_report/a0c0c281-bc0b-4060-b2c8-da8feefbea5e:3637b140-b494-5162-8cf1-b0bdf409460b
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/ea_report/a0c0c281-bc0b-4060-b2c8-da8feefbea5e:c0293ddf-1220-5f0d-99d7-6cfb535ddb85
  - 116abb34-7097-47f1-829f-0bd8e27f4ed9/ea_report/4b4980a6-41c9-41ad-a338-359126e53da8:a5057e02-0d48-51fc-b648-3542bcad69a7
support_incident_keys:
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/left_behind_unsent_work/9b24f00f-c03c-4aac-8b6f-619080d88665:f2e176b6-7493-53f6-977b-4c5652d2bd94
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/left_behind_unsent_work/1cf6fb1a-4662-4b77-bf88-c3519f61d694:3aaa4a9c-dec6-5942-9c39-fd70f7d65be9
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/left_behind_unsent_work/32ae34af-3b4f-431e-a7a0-87bb4ae82d49:smoke-9c995d9b-8025-4592-916c-f2b97586b0d2
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/diagnostics_sent/32ae34af-3b4f-431e-a7a0-87bb4ae82d49:762ed44c-222c-4606-a1a9-803b8f04ab23
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/diagnostics_sent/a0c0c281-bc0b-4060-b2c8-da8feefbea5e:fed3278c-14cc-5f9f-a961-c09efec42c7d
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/diagnostics_sent/a0c0c281-bc0b-4060-b2c8-da8feefbea5e:3310e4c9-f380-5a5e-8ffc-96f08a5bd0f1
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0/upload_terminal/a0c0c281-bc0b-4060-b2c8-da8feefbea5e:e0f50477-12c9-58e5-9e19-8897b50f79c4
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/diagnostics_sent/6165cf6b-e300-4bf2-bb15-e7a93354a355:d5b42912-6c62-5587-9629-4ff78441df02
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/upload_terminal/6165cf6b-e300-4bf2-bb15-e7a93354a355:8a5fe115-deb9-5376-a24a-d04342054dd5
  - 116abb34-7097-47f1-829f-0bd8e27f4ed9/left_behind_unsent_work/6165cf6b-e300-4bf2-bb15-e7a93354a355:3216437d-bd32-5fac-bea7-e63e7ec41803
  - 116abb34-7097-47f1-829f-0bd8e27f4ed9/diagnostics_sent/4b4980a6-41c9-41ad-a338-359126e53da8:443d1a5b-7d3d-5850-a49b-f90c3386fe1a
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/diagnostics_sent/fec85bb2-ff13-41ed-b149-9b45c2f52e9c:680122a9-10a4-5293-9f82-ee6003937c73
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/diagnostics_sent/fec85bb2-ff13-41ed-b149-9b45c2f52e9c:ab7ea36d-e316-5a77-b1eb-3fa325f7b5e5
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/diagnostics_sent/fec85bb2-ff13-41ed-b149-9b45c2f52e9c:335fd303-4669-5f2c-b514-bd54da01ad3f
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
- **Incident queue evidence:** Eighteen receipts, listed below.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

Accounts: `0d7e80de-df70-4d9a-a569-d8a4cdeba6a0` is test+b@masinyusane.org
(TestB); `1b1953c3-063e-4d89-8b07-5e55c970cfef` is test@masinyusane.org (Test);
`116abb34-7097-47f1-829f-0bd8e27f4ed9` is test+numeracy@masinyusane.org (the numeracy test account).

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
| R11 | `dg:84ffdae1` (receipt `6049e8f2`), 2026-10-31 A03s checks: release identity (005) | Test | 2026-10-31T09:50:54.657Z | 2026-10-31T09:50:57Z | 1.5.0 (1), `.kbtest` debug app on Metro | Galaxy A03s, Android 13 | Wi-Fi | Bundle; build log 2026-10-31 A03s device checks |
| R12 | `ut:0123d1be` (receipt `d96747fb`), 2026-10-31 gate 5 repeated: forced stale edit (MV001) of a test child | Test | 2026-10-31T09:54:44.869Z | 2026-10-31T09:54:57Z | 1.5.0 (1), `.kbtest` debug app | Galaxy A03s, Android 13 | Wi-Fi | Bundle; MA-BUG-20261030-004 timeline 2026-10-31 |
| R13 | `lb:d76b594e` (receipt `ada8a230`), numeracy tester signed in on the same `.kbtest` install during the 2026-10-31 EGMA gate; stranded: Test, `children` 1, oldest 4 h | Numeracy test account | 2026-10-31T14:50:57.014Z | 2026-10-31T14:51:55Z | sqlite-critical-hardening build 1, `.kbtest` debug app on Metro (EGMA branch) | Galaxy A03s, Android 13 | Wi-Fi at delivery | Payload only; build log 2026-10-31 EGMA A03 gate |
| R14 | `er:41d4ddb2` (receipt `c06d09b7`), pilot release check: report with a screenshot | Numeracy test account | 2026-11-05T15:17:31.821Z | 2026-11-05T15:17:33Z | 1.5.0 (28), commit `8b79eae5` | iPhone 17, iOS 26.6.2 | Wi-Fi | Bundle and 1206×2622 PNG, not committed |
| R15 | `dg:fa285792` (receipt `cdb020e4`), pilot release check: release identity (005), iPhone | Numeracy test account | 2026-11-05T15:26:02.485Z | 2026-11-05T15:26:03Z | 1.5.0 (28) | iPhone 17, iOS 26.6.2 | Wi-Fi at delivery | Bundle; build log 2026-11-05 first-sweep fixes |
| R16 | `dg:ea023605` (receipt `90a17f75`), pilot release check: release identity (005), Android | Test | 2026-11-05T15:32:05.082Z | 2026-11-05T15:32:06Z | 1.5.0 (58), Play internal testing | Galaxy A03s, Android 13 | Wi-Fi at delivery | Bundle; build log 2026-11-05 first-sweep fixes |
| R17 | `dg:7681d755` (receipt `afc5169d`), `phone-health-check` run | Test | 2026-11-05T21:45:42.977Z | 2026-11-05T21:45:44Z | 1.5.0+6 (58) | Galaxy A03s, Android 13 | Wi-Fi at delivery | Bundle; cited by MA-BUG-20261105-010 |
| R18 | `dg:e4a20754` (receipt `58f09b75`), `phone-health-check` test-agent run | Test | 2026-11-05T22:18:06.053Z | 2026-11-05T22:18:08Z | 1.5.0+6 (58) | Galaxy A03s, Android 13 | Wi-Fi at delivery | Bundle; cited by MA-BUG-20261105-009 |

Observed times are each receipt's `first_seen_at`. Schema 1 receipts (R1–R3)
carry none.

EA report text, preserved verbatim:

- R6: "A03s gate 2: online report without a screenshot. The week strip showed 0
  for Monday." (Filler text written for the gate; not an observation.)
- R7: "A03s gate 3: report with a screenshot of Profile."
- R8: "A03s gate 4: offline report, no Wi-Fi."
- R14: "This is just a test"

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
- The same rule applies to R11, R12 and R14–R18: MA-BUG-20261030-004 cites R12 as its device
  check, MA-BUG-20261030-005 cites R11, R15 and R16, and MA-BUG-20261105-009 and -010 cite R18
  and R17. R12 shows the fix working (its `lastError` carries the server detail), so it is not an
  occurrence of 004's defect. `--resolve ut:0123d1be` on 2026-11-06: present, `row_version` 10,
  `updated_at` 2026-10-31T09:53:54Z (the server copy the gate raised).
- R13 is a by-product of a gate, not a deliberate action. Its stranded `children` row is
  consistent with R12's deliberately stale edit, which the build log says stayed refused on the
  `.kbtest` app: same install, refused rows count as unsent (`UNSENT_STATUSES` includes
  `terminal`), and 14:50:57 is about 4 h 56 min after R12's refusal was observed (the offline edit
  came a little earlier), which the payload floors to 4 hours.
  The receipt's key hides the row id, so this is consistent, not proven. The left-behind lane
  worked as designed.
- R14's bundle (SHA-256 `507430a01614555ab80daaad7337703f78b1d02d21143f9fcce22a9f910dff7c`) shows
  0 failed or refused outbox rows. Its 325 log lines hold 10 WARN and 6 ERROR entries, all
  `AuthUnavailableError` at two cold starts (2026-11-04T01:37:11Z and 2026-11-05T15:15:28Z): the
  history walks stop in 1-7 ms as `failureKind=query`, then complete about 3-6 s later once the
  login arrives. That is the classification step of MA-BUG-20261106-001 (safe excerpt in
  `docs/bugs/evidence/MA-BUG-20261106-001/er-41d4ddb2-bundle-log-excerpt.txt`), not a fault in
  this report; nothing in the capture session (15:16:17Z on) is a warning or error. Its screenshot
  (SHA-256 `459deebf0c7bd6d8d97417f0eb37c6fe63670016c8c0d411bf3d28b3bdbf67a1`) shows the Maths
  assessment "1 · Count aloud", item 1 of 5, opened from TestFlight at 10:17 local time, with
  nothing wrong on screen. Both stay in gitignored
  `docs/bugs/user-submissions-bundles/er:41d4ddb2/`; the screenshot names a test child, so it is
  not committed.
- Sweep of 2026-11-06, snapshot `2026-11-06T19:42:48.650568+00:00`: R11–R18 claimed here.

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
| 2026-11-06T20:10:00Z | Claude | R11–R18 added from the 2026-11-06 full sweep | Eight test conditions claimed by exact key; `er:41d4ddb2` fetched and inspected |

## Open questions

- Should test accounts be excluded or labelled in the reader once real EAs
  start reporting? Today the sweep shows them like anyone else. By the 2026-11-06
  sweep, 18 of 23 conditions were test receipts claimed here.
