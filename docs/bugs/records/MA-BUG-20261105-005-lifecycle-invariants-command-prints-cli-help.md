---
record_version: 1
id: MA-BUG-20261105-005
title: The daily invariant check's documented command prints the command's help instead of running
classification: product_defect
subsystem: head-office-tooling

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
delivery_state: IN_PROGRESS
verification_state: NOT_TESTED

root_cause_confidence_pct: 85
confidence_basis: The staging run printed help, and the SQL starts with `--`, which the Supabase CLI reads as a flag; the fix is still in progress.

created_at_utc: 2026-11-05T17:25:14Z
updated_at_utc: 2026-11-05T17:25:14Z
first_observed_at: 2026-11-05
last_observed_at: 2026-11-05

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: the person running the daily sweep
exposure_window: since scripts/lifecycle-invariants.sql was written

environment: sqlite-staging (masi-app-sqlite)
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
github_issues:
  - https://github.com/JimMcKeown17/masi-app/pull/162

data_safety_status: no data risk; the query is read-only and did not run
workaround_status: pass the SQL without its leading comment lines
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261105-005 — The daily invariant check's documented command prints the command's help instead of running

## User-visible symptom

Observed on staging on 2026-11-05 by the orchestrating session. Running the command in the script's header printed the Supabase CLI help and ran no query.

## Operational impact

- **Can the user continue?** Yes, by removing the comments.
- **Core workflow affected:** The daily lifecycle invariant check in the `/bug-sync` sweep.
- **Known affected users:** 0 (operator tooling).
- **Relevant exposed population:** Whoever runs the check.
- **Workaround:** Strip the leading `--` comment lines before passing the SQL.

## Data-safety assessment

- **UI visibility:** Not applicable.
- **Durable local SQLite rows:** Not involved.
- **Backend rows and relationships:** None read or written; the query did not run.
- **sync_outbox status, error_class/error_code:** Not involved.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Orchestrating session run on staging | Claude | 2026-11-05 | 2026-11-05T17:25:14Z | `feat/lifecycle-ho-tools` `6f16c72c`, sqlite-staging | none | n/a | CLI help output (not saved) |

## Reproduction

### Reporter steps

1. `npm run sqlite:staging:query -- "$(cat scripts/lifecycle-invariants.sql)"`

### Expected

The query runs and prints one row per hit, or none.

### Actual

The CLI prints its help.

### Closest E2E reproduction

The run above.

## Observed facts

- The header of `scripts/lifecycle-invariants.sql` (on `feat/lifecycle-ho-tools`) documents the command above.
- The file's first characters are `--`, so the argument starts with `--` and the Supabase CLI parses it as a flag.
- Fix in progress on `feat/lifecycle-ho-tools`, PR #162.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| A leading `--` argument is parsed as a CLI flag | Help output; file starts with `--` | None | 85% | Run with the comments stripped |

## Root cause

The documented invocation passes SQL beginning with `--` as a bare argument.

## Suggested fix

In progress in PR #162.

## Verification plan

- [ ] Run the documented command on staging after the fix and read the result.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T17:25:14Z | Claude | Report recorded | Observed in the orchestrating session |

## Open questions

- None.
