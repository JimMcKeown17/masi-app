---
record_version: 1
id: MA-BUG-20261030-004
title: Upload failures keep the server's message but drop its detail
classification: product_defect
subsystem: sync-upload-classification

severity_score: 2
severity_band: S3
severity_components:
  user_impact: 0
  data_security_privacy: 1
  scope: 1
  recoverability: 0
severity_override: none
priority: P2

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 95
confidence_basis: Hosted receipt shows only "stale_version"; the server raises MV001 with a detail carrying both versions, and offlineSync.errorMessage reads only error.message. A test that runs the real MV001 error shape through the sync engine with real SQLite stored only the message before the fix and the detail after it.

created_at_utc: 2026-10-30T23:30:00Z
updated_at_utc: 2026-10-31T02:06:37Z
first_observed_at: 2026-10-30T16:57:26Z
last_observed_at: 2026-10-30T16:57:26Z

known_occurrences: 1
known_affected_users: 1
affected_user_ids:
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0
exposure_denominator: unknown
exposure_window: 2026-10-30 A03s device gate 5 (deliberate stale edit)

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - 1.5.0 (55)
affected_devices:
  - Samsung Galaxy A03s (SM-A037U)
affected_os_versions:
  - Android 13 (API 33)
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths: []
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/126

data_safety_status: the server copy was kept correctly; only diagnostic detail is lost
workaround_status: read the stored row_version with --resolve or SQL
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261030-004 — Upload failures keep the server's message but drop its detail

## User-visible symptom

No EA-visible symptom. An operator reading a terminal upload receipt sees
`lastError: "Server has a newer version of this record (stale_version): stale_version"`
and cannot tell which versions collided without a separate database query.

## Operational impact

- **Can the user continue?** Yes; the EA sees "1 item needs attention" as designed.
- **Core workflow affected:** Operator diagnosis of rejected uploads.
- **Known affected users:** One test account (deliberate gate).
- **Relevant exposed population:** Every rejected upload whose server error
  carries a PostgreSQL `detail` or `hint` (MV001 at least).
- **Workaround:** `--resolve <handle>` or a read-only query for the stored row.

## Data-safety assessment

- **UI visibility:** Not affected.
- **Durable local SQLite rows:** The EA's edit stays local, terminal.
- **Backend rows and relationships:** Server copy kept (row_version 10).
- **sync_outbox status, error_class/error_code:** `terminal` / `MV001`, correct.
- **Incident queue evidence:** Receipt `ut:d59e852f` arrived 19 s after the failure.
- **Eventual convergence evidence:** Not applicable; the stale edit is meant to lose.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Receipt `ut:d59e852f`, A03s gate 5 | test+b@masinyusane.org | 2026-10-30T16:57:26Z | 2026-10-30T16:57:44Z | 1.5.0 (55), sqlite-staging | Galaxy A03s, Android 13 | Wi-Fi | Payload excerpt below |

Receipt payload excerpt (test child, test account):

```json
{ "table": "children", "operation": "update", "errorClass": "terminal",
  "errorCode": "MV001",
  "lastError": "Server has a newer version of this record (stale_version): stale_version",
  "wirePayload": { "row_version": 2, "last_name": "monshy MV" } }
```

## Reproduction

### Reporter steps

1. Offline, edit a child (local row_version 2).
2. On the server, raise that child's row_version to 10.
3. Reconnect.

### Expected

`lastError` carries the server's detail:
`children id=<id> incoming row_version=2 stored row_version=10`.

### Actual

Only the message `stale_version` is kept.

### Closest E2E reproduction

Exactly the steps above, A03s gate 5 on 2026-10-30.

## Observed facts

- `private.enforce_row_version()` raises `MV001` with `message = 'stale_version'`
  and `detail = '<table> id=<id> incoming row_version=<n> stored row_version=<m>'`
  (`supabase/migrations/20261018180000_upload_contract_row_version.sql`).
- `offlineSync.js` builds the stored reason from `errorMessage(error)`, which
  returns `error.message || error.code`, ignoring `error.details` and `error.hint`.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| `errorMessage` discards PostgREST `details`/`hint` | Source; receipt text | Not yet confirmed that supabase-js surfaces `details` for RPC/upsert errors here | 80% | Log the raw error object in a unit test with a real PostgREST error shape |

## Root cause

The recorded-failure formatter retained only message/code, dropping PostgREST details and hint before SQLite and terminalPayload. Real SQLite sync-path tests reproduce the MV001 loss.

## Suggested fix

Added a dedicated recordedFailure formatter; preserve message plus nonempty details/hint and bound persisted reasons to 2,048 UTF-8 bytes. Keep errorMessage for console/preflight. Code-based retry classification and legacy RLS-heal fallback are preserved.

## Verification plan

- [x] Local public-interface regression tests passed (see first-sweep build-log entry for exact counts).
- [ ] A03s and iPhone acceptance checks (2026-10-31).

- [x] Unit test with the real MV001 error shape.
- [ ] Repeat gate 5 on a device and read the receipt.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-30T16:57:44Z | Phone | Receipt received | `ut:d59e852f` |
| 2026-10-30T23:30:00Z | Claude | Report recorded | First registry sweep; source traced |
| 2026-10-31T02:06:37Z | Codex | Fixed in code; locally tested | Issue #126; RED → GREEN evidence in build log; device checks pending |

## Open questions

- Do other server errors (23503, 42501) also carry details worth keeping?
