---
record_version: 1
id: MA-BUG-YYYYMMDD-NNN
title: Replace with a short user-visible description
classification: unknown
subsystem: unknown

severity_score: 0
severity_band: S4
severity_components:
  user_impact: 0
  data_security_privacy: 0
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: UNTRIAGED
delivery_state: NO_FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 0
confidence_basis: No causal hypothesis yet.

created_at_utc: YYYY-MM-DDTHH:MM:SSZ
updated_at_utc: YYYY-MM-DDTHH:MM:SSZ
first_observed_at: unknown
last_observed_at: unknown

known_occurrences: 1
known_affected_users: unknown
affected_user_ids: []
exposure_denominator: unknown
exposure_window: unknown

environment: unknown
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

data_safety_status: unknown
workaround_status: unknown
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-YYYYMMDD-NNN — Replace with title

## User-visible symptom

State what the reporter experienced. Preserve a short verbatim report when
available and keep interpretation out of this section.

## Operational impact

- **Can the user continue?** Unknown.
- **Core workflow affected:** Unknown.
- **Known affected users:** Unknown.
- **Relevant exposed population:** Unknown.
- **Workaround:** Unknown.

## Data-safety assessment

- **UI visibility:** Unknown.
- **Durable local SQLite rows:** Unknown.
- **Backend rows and relationships:** Unknown.
- **sync_outbox status, error_class/error_code:** Unknown.
- **Incident queue evidence:** Unknown.
- **Eventual convergence evidence:** Unknown.
- **Duplication, misattribution, or cross-account risk:** Unknown.

Do not equate "not visible in the UI" with "deleted." Record local durability,
backend state, relationship rows, and convergence evidence separately.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Unknown | Unknown | Unknown | YYYY-MM-DDTHH:MM:SSZ | Unknown | Unknown | Unknown | None |

## Reproduction

### Reporter steps

1. Unknown.

### Expected

Unknown.

### Actual

Unknown.

### Closest E2E reproduction

Not attempted.

## Observed facts

- Record only direct observations or verified source, event, device, local-data,
  or backend evidence.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| No causal hypothesis yet | None | None | 0% | Inspect the supplied evidence |

## Root cause

Unknown. When established, describe the complete causal chain rather than only
the line or native function that emitted the error.

## Suggested fix

No fix proposed. Keep proposed direction separate from approval and
implementation state.

## Verification plan

- [ ] Reproduce the original end-user workflow on the affected release or
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
| YYYY-MM-DDTHH:MM:SSZ | Codex | Report recorded | Initial intake |

## Open questions

- What single missing fact would most change severity, priority, or the leading
  causal hypothesis?
