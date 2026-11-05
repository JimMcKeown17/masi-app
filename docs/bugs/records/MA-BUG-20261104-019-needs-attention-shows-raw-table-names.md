---
record_version: 1
id: MA-BUG-20261104-019
title: "Needs attention lists items by raw database table names"
classification: product_defect
subsystem: sync-status-ui

severity_score: 3
severity_band: S3
severity_components:
  user_impact: 1
  data_security_privacy: 0
  scope: 2
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: CONFIRMED
delivery_state: FIX_APPROVED
verification_state: NOT_TESTED

root_cause_confidence_pct: 95
confidence_basis: "The display-name map is keyed by legacy upper-case names, outbox table names are lower-case snake_case, and the lookup falls back to the raw name; read in source on main and at f002e08, and an existing screen test confirms the map is only exercised with the upper-case key."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T01:00:00Z
first_observed_at: 2026-11-05T00:50:00Z
last_observed_at: 2026-11-05T00:50:00Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "every build with the SQLite outbox (including 1.5.0); no field cohort yet"

environment: "Code trace of main at 8b79eae5 and the 1.5.0 pilot source (git show f002e08), plus a jest run of __tests__/syncStatusScreen.test.js (22 passed, Node 20) on 2026-11-05; no device and no executed reproduction of the on-screen text"
affected_releases:
  - 1.5.0 pilot builds (embedded f002e08)
  - main at 8b79eae5
affected_devices: []
affected_os_versions: []
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths:
  - src/screens/main/SyncStatusScreen.js
  - src/db/repositories/syncOutboxRepository.js
  - src/db/repositories/domainRepositoryUtils.js
  - __tests__/syncStatusScreen.test.js
github_issues: []

data_safety_status: "no data risk; a presentation problem that hides what is stuck"
workaround_status: "none needed to keep working; the EA can still press Retry, but cannot tell which child or lesson the item is"
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-019 — Needs attention lists items by raw database table names

## User-visible symptom

No field report; found by Claude while tracing the Needs attention list.

When something is stuck, the Needs attention card on the Sync status screen lists it under a
database name such as "session_attendees" or "child_ea_assignments", followed by "ID: abc12345..."
and the server's error text. It does not say which child or which lesson date it belongs to,
so an EA or a supervisor reading it cannot tell what is stuck or whether it matters.

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** Understanding and acting on items that need attention (the Sync status screen).
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** Any EA who has an item under Needs attention.
- **Workaround:** The EA can send the screen or a diagnostics bundle to Head Office; nothing on screen explains the item.

## Data-safety assessment

- **UI visibility:** The item is listed, but under a raw table name.
- **Durable local SQLite rows:** Unaffected.
- **Backend rows and relationships:** Unaffected.
- **sync_outbox status, error_class/error_code:** Unaffected; `toFailedItem` returns `table: row.table_name` (`syncOutboxRepository.js:23-26`).
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

Do not equate "not visible in the UI" with "deleted." Record local durability,
backend state, relationship rows, and convergence evidence separately.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, code trace | None (no field user) | 2026-11-05T00:50:00Z | 2026-11-05T01:00:00Z | Code trace of main at 8b79eae5 and the 1.5.0 pilot source (git show f002e08), plus a jest run of __tests__/syncStatusScreen.test.js (22 passed, Node 20) on 2026-11-05; no device and no executed reproduction of the on-screen text | None | None | Source: `SyncStatusScreen.js` lines 27-34, 104, 205; `syncOutboxRepository.js` lines 23-32; test run 22 passed; no repro files |

## Reproduction

### Reporter steps

1. Get a row into `terminal` (any refused upload) for a table such as `session_attendees`.
2. Open the Sync status screen.

### Expected

A plain-words item that names the child and the lesson date.

### Actual

By code trace: the card title is `TABLE_DISPLAY_NAMES[item.table] || item.table`, and `TABLE_DISPLAY_NAMES` has no lower-case snake_case keys, so the title is the raw `item.table`.

### Closest E2E reproduction

Not attempted on a device. Code-trace only for the on-screen text. The existing test `__tests__/syncStatusScreen.test.js` renders the screen (run 2026-11-05, 22 passed) but its fixtures use the table `assessment_items` and `sessions`, and the only assertion about a display name feeds the upper-case key `SESSIONS` and expects "Retrying Sessions...", so it never checks a real table name.

## Observed facts

- `src/screens/main/SyncStatusScreen.js:27-34`: `TABLE_DISPLAY_NAMES` has the keys `TIME_ENTRIES`, `SESSIONS`, `CHILDREN`, `STAFF_CHILDREN`, `GROUPS`, `CHILDREN_GROUPS` (legacy AsyncStorage-era names). `STAFF_CHILDREN` and `CHILDREN_GROUPS` no longer name any table.
- The lookup `TABLE_DISPLAY_NAMES[table] || table` appears at line 104 (the Retry toast) and lines 204-206 (the card title). Each item also shows `ID: {item.id.substring(0, 8)}...` and `item.reason` (the raw `last_error`).
- Outbox table names are the repository table names: `enqueueDomainOutbox(db, tableName, ...)` in `src/db/repositories/domainRepositoryUtils.js:85` stores them in `sync_outbox.table_name`; repositories use lower-case snake_case such as `child_group_memberships`, `child_ea_assignments`, `session_attendees`, `assessment_items`, `skill_mastery`, `time_entries`, `children`, `sessions`, `groups`. `toFailedItem` (`syncOutboxRepository.js:23-32`) passes `row.table_name` through unchanged.
- So only the legacy keys that happen to be upper-case would match, and no outbox row has an upper-case table name. Even `sessions` and `children` (lower-case) miss the map and show raw.
- `__tests__/syncStatusScreen.test.js`: fixture default `table: 'assessment_items'` (line 53); the Retry test uses `table: 'SESSIONS'` (line 181) and expects "Retrying Sessions..." (line 192). The test therefore encodes the wrong casing.
- The 1.5.0 pilot has the same map and lookups (`git show f002e08:src/screens/main/SyncStatusScreen.js` lines 27, 104, 205).

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| Display names were never migrated from the AsyncStorage-era keys when the outbox arrived | Key casing and obsolete names; test uses the legacy key | Not rendered on a device in this run | 95% | Render the screen with a lower-case table in a test and see the raw name |

## Root cause

The Sync status screen predates the SQLite outbox. Its name map is keyed by the old upper-case store names, while the outbox now stores each repository's lower-case snake_case table name. Every lookup misses and falls back to the raw table name. The item also has no field that says whose child or which lesson it concerns, so a good label would need more than a rename.

## Suggested fix

Approved (fix step 7, OTA): list needs-attention items in plain words that name the child and the lesson date, and fix the key casing so the map matches real table names. The same change feeds the sign-out sheet (MA-BUG-20261104-020) and the "remove from this phone" exit. No server change; 1.5.0 phones show the raw names until the OTA reaches them.

## Verification plan

- [ ] Render the Sync status screen with a lower-case table such as `session_attendees` and confirm the plain-words item replaces the raw name.
- [ ] Add a regression test that fails today: every table the outbox can hold has a display name, and no item title equals a raw table name.
- [ ] Change the existing `SESSIONS` test fixture to the real lower-case name.
- [ ] Verify the targeted correction locally.
- [ ] Check the Needs attention card on a physical device with a real refused item.
- [ ] Identify the exact release or OTA containing the fix.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | code trace of the cited source paths, no repro files; docs/bugs/evidence/MA-BUG-20261104-001/ not used |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |

## Open questions

- Which tables need a child and a lesson date in the label (sessions, session_attendees, assessments, mastery), and which are better left as "a change to your account"?
- Should the item still show the shortened id for support, or move it to the diagnostics bundle?
