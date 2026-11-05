---
record_version: 1
id: MA-BUG-20261105-007
title: The Add child screen test "stays on the form when local child save fails" failed once in a full test run
classification: product_defect
subsystem: test-reliability

severity_score: 0
severity_band: S4
severity_components:
  user_impact: 0
  data_security_privacy: 0
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: HYPOTHESIS
delivery_state: NO_FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 20
confidence_basis: One failure in one full run, then 10 of 10 passes alone and a clean full rerun; the failure message was not kept. The timing hypothesis comes from reading the test, not from a reproduction.

created_at_utc: 2026-11-05T19:10:00Z
updated_at_utc: 2026-11-05T19:10:00Z
first_observed_at: 2026-11-05
last_observed_at: 2026-11-05

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: every full `npx jest` run; no phone or EA is involved
exposure_window: unknown; one failure seen on 2026-11-05 during the work-order 9 fix round

environment: Jest unit suite on Node 20, full run (`npx jest`), on the `feat/app-release-card` work (PR #167)
affected_releases: []
affected_devices: []
affected_os_versions: []
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths: []
github_issues: []

data_safety_status: no data risk; the app is not involved, only a unit test
workaround_status: rerun the suite; the test passed in the clean rerun and 10 of 10 times alone
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261105-007 — The Add child screen test "stays on the form when local child save fails" failed once in a full test run

## User-visible symptom

During the work-order 9 fix round on 2026-11-05, one full `npx jest` run failed
`AddChildScreen › stays on the form when local child save fails`. The same test
passed 10 of 10 times when run alone and passed in the clean full rerun. No phone
behaviour is reported; this is a reliability problem in the test suite.

## Operational impact

- **Can the user continue?** Not applicable (no user). A developer sees a red full run and has to rerun it.
- **Core workflow affected:** Releasing and reviewing: a spurious red unit run costs trust in the suite.
- **Known affected users:** 0.
- **Relevant exposed population:** Anyone running the full unit suite.
- **Workaround:** Rerun; confirm the test alone.

## Data-safety assessment

- **UI visibility:** Not applicable.
- **Durable local SQLite rows:** Not applicable (the test mocks the save).
- **Backend rows and relationships:** Not applicable.
- **sync_outbox status, error_class/error_code:** Not applicable.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Full `npx jest` run during work-order 9 fix round | Claude (orchestrating session) | 2026-11-05 | 2026-11-05T19:10:00Z | `feat/app-release-card` (PR #167), Node 20 | none | n/a | Build log section "`ota:publish` rollback guard: review fixes" on `feat/app-release-card`; the failure text itself was not kept |

## Reproduction

### Reporter steps

1. Run the full unit suite: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest`.

### Expected

`__tests__/AddChildScreen.test.js` › "stays on the form when local child save fails" passes.

### Actual

It failed once. It passed 10 of 10 alone and in the clean rerun of the full suite.

### Closest E2E reproduction

Not attempted.

## Observed facts

- The test is in `__tests__/AddChildScreen.test.js` (the case starts at line 145 on `bugs/20261105-intake`).
- It makes the mocked save resolve `{ success: false }`, fills the two name fields, presses "Add child", waits with `waitFor(() => expect(mockAddChild).toHaveBeenCalled())`, and then asserts at once that `goBack` was not called and that `getByRole('alert')` has the text "Error adding child".
- The wait is on the mock having been called, not on the alert having appeared. The alert is shown only after the awaited save resolves and the screen's state updates.
- The build log section named in the evidence column does not, on `feat/app-release-card` `bfb305f7` or its `origin` copy, contain the failing run's output or the 10-of-10 counts. Those come from the orchestrator's account of the run; the failure message was not kept.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The assertion on the alert runs before the screen has re-rendered after the failed save; under full-suite load the gap between "mock called" and "state updated" widens | The wait is on the mock call, the alert assertion is synchronous; failure only under full-suite load | The failure message was not kept; 10 of 10 alone passes show the race is rare | 20% | Run the full suite repeatedly (or the file under `--runInBand` with CPU load) and keep the failure text |
| Another test in the same worker leaves state (mock, timer or toast) behind | Failure only in the full run | No evidence of which test or what state | 10% | Capture the failure text and the worker's preceding tests |

## Root cause

Unknown. No failure text was kept, so the mechanism is a hypothesis from reading the test.

## Suggested fix

No fix proposed. If the timing hypothesis holds, the direction would be to wait
for the alert itself (`findByRole` or `waitFor` on the alert text) instead of
asserting it right after waiting for the mock call. That is a direction, not a
decision.

## Verification plan

- [ ] Reproduce: run the full suite repeatedly and keep the failing output.
- [ ] Confirm the cause (race on the alert versus leaked state) from that output.
- [ ] After any change, run the file alone and the full suite several times with no failure.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T19:10:00Z | Claude | Report recorded | Orchestrator's account of the failed full run and the passing reruns; test read at `__tests__/AddChildScreen.test.js:145-157`. Severity 0 (no user impact), so S4, P3 |

## Open questions

- What did the failing assertion say? Keeping the output of the next failure answers whether this is the alert race or leaked state.
