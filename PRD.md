# Masi App Product Requirements

**Document role:** current product, domain, and architecture requirements.

**Updated:** 2026-07-23

This file is not a progress ledger. Use:

| Question | Source |
|---|---|
| What is still open? | [`documentation/ROADMAP.md`](documentation/ROADMAP.md) |
| What was built and verified? | [`documentation/build-log.md`](documentation/build-log.md) |
| What needs physical-device proof? | [`documentation/device-gates-sqlite-backend-2026-07.md`](documentation/device-gates-sqlite-backend-2026-07.md) |
| What product decisions are unresolved? | [`documentation/open-decisions-backlog.md`](documentation/open-decisions-backlog.md) |
| What is the current RLS/sync contract? | [`documentation/rls-sync-contract-map.md`](documentation/rls-sync-contract-map.md) |

## 1. Product purpose

Masi App is an offline-first React Native application for Masinyusane field staff. It supports
daily work with children, time tracking, classes and groups, literacy sessions, assessments,
letter mastery, and field support diagnostics.

The product must remain usable when a staff member has no connectivity for days. A successful local
save is therefore a real commit, not a temporary UI state. Supabase provides authentication,
cross-device continuity, Head Office access, and durable server history once synchronization
completes.

## 2. Product principles

- **Offline-first:** every field-critical write commits to local SQLite before network work.
- **Truthful status:** the UI must distinguish locally saved, waiting, retrying, terminal, outbound
  complete, and inbound-history-complete states.
- **One operational vocabulary:** Programme, class, group, session, assessment, and EA mean what
  [`CONTEXT.md`](CONTEXT.md) defines.
- **History is evidence:** sessions, assessments, assignments, memberships, and changes are ended or
  ignored with audit metadata, not casually hard-deleted.
- **Field reliability over novelty:** low-end Android, poor GPS, weak connectivity, process death,
  and delayed updates are normal operating conditions.
- **Simple interfaces:** large tap targets, clear next actions, minimal hidden state, and explicit
  recovery paths.
- **Privacy by default:** the app handles child, staff, attendance, assessment, and location data.
  Cloud telemetry must be allowlisted and local support exports must warn before sharing PII.

## 3. Users and domain

### 3.1 Field user

The primary user is an Education Assistant or coach. The user:

- signs in with a Head Office-provisioned account;
- works under one active Programme assignment at a time;
- clocks in and out;
- sees the classes, children, and groups authorized for that Programme;
- records sessions and assessments offline;
- reviews locally available history and progress;
- monitors sync and shares diagnostics when support is needed.

### 3.2 Programme is not job title

Job title is an HR/profile label. Programme is the operational scope for class assignments,
children, groups, sessions, assessments, and reporting.

- An EA has an active `staff_programme_assignment`.
- A child may have more than one concurrent Programme enrollment.
- User-facing reads are active-Programme-scoped by default.
- Sessions, assessments, letter mastery, groups, and assignments retain `programme_id`.

### 3.3 Class, group, and session

- A class is the broader school roster and assessment scope.
- A group is the delivery unit within a class.
- One completed session represents one group block of work.
- The current app still has a transitional child-oriented capture contract. The required
  group-centred end state is specified in
  [`documentation/group-session-workflow.md`](documentation/group-session-workflow.md).
- Session attendees are a historical snapshot. Later group membership changes must not rewrite
  who attended an earlier session.

### 3.4 Assessment

- Field assessment is capture performed by an EA in the mobile app.
- In-app assessment is an instrument delivered through the app.
- Assessment results keep the raw item evidence needed to explain and recompute summaries.
- Assessment Windows are first-class in the data model, but the current UI does not yet implement
  formal Window selection. Until it does, Home and Assess use complete locally available
  active-roster lifetime coverage.

## 4. Technology and current architecture

### 4.1 Stack

- React Native 0.81 with Expo SDK 54
- JavaScript application code
- React Navigation
- React Native Paper plus `react-native-svg`
- Expo SQLite for domain data, local state, and sync state
- AsyncStorage only for Supabase Auth session storage and app logs
- Supabase Auth and PostgreSQL
- Sentry React Native for allowlisted operational telemetry
- Jest plus `better-sqlite3` integration tests

The repository currently uses npm and `package-lock.json`. Package-manager migration is separate
work.

### 4.2 Backend identity

New work targets `masi-app-sqlite`, project ref `segygjzpujphwvrubusm`. The legacy pre-SQLite
backend is not the default and must not be used for forward mobile work without an explicit legacy
maintenance request.

The app fails fast when the selected backend target and supplied URL do not match. EAS preview and
production profiles carry the public target values through Expo config rather than relying on
`.env.local`.

### 4.3 Local persistence

The current SQLite schema is defined by `src/db/migrations.js`. It includes:

- reference and scope: `schools`, `job_titles`, `programmes`,
  `staff_programme_assignments`, `academic_years`, `assessment_windows`,
  `assessment_tools`;
- roster and assignment: `teachers`, `classes`, `children`, `child_ea_assignments`,
  `child_programme_enrollments`, `class_ea_assignments`, `child_class_memberships`;
- grouping: `groups`, `group_ea_assignments`, `grouping_versions`,
  `class_grouping_state`, `child_group_memberships`;
- work records: `time_entries`, `sessions`, `session_attendees`, `assessments`,
  `assessment_items`, `letter_mastery`;
- device and sync: `local_state`, `sync_state`, `sync_outbox`, `schema_migrations`.

`documentation/DATABASE_SCHEMA_GUIDE.md` is a relational-modelling primer, not a current schema
reference. The RLS and synchronization behavior is authoritative only in
`documentation/rls-sync-contract-map.md`, current repository code, canonical Supabase migrations,
and live schema verification.

### 4.4 Write contract

A user-facing write:

1. validates the domain action;
2. writes normalized domain rows to SQLite;
3. enqueues or refreshes the durable `sync_outbox` operation in the same SQLite transaction;
4. publishes UI state from SQLite;
5. pushes ready work to Supabase in dependency order when online.

No domain feature may reintroduce AsyncStorage records with `synced: false` or table scanning as the
sync mechanism.

### 4.5 Read contract

React state is a function of SQLite.

- Server pulls persist rows transactionally through typed repositories.
- Server-authoritative removals are reconciled into SQLite only from verified complete scopes.
- Reconcile never ends pending, failed, or terminal local work.
- Errored or truncated scopes cannot authorize absence-based removal.
- A mass-end circuit breaker requires human confirmation.
- UI state is republished from a fresh SQLite read after persistence.

There is no in-memory three-way merge.

## 5. Navigation and core surfaces

The locked bottom navigation has five visual slots:

1. Home
2. Children
3. centre Record command
4. Insights
5. Assess

The centre Record item is an action, not a selected destination. Profile and Sync Status are reached
through stack navigation. The tab bar remains visible through child, class, results, assessment, and
insight flows where specified by the locked navigation contract.

## 6. Functional requirements

### 6.1 Authentication and profile

- Email/password sign-in and password reset.
- Publish a refreshable persisted same-user session quickly enough for offline cold start.
- Reject stale auth events from an older session attempt.
- Keep job title, school, Programme assignment, release identity, and backend identity visible.
- Allow password change and explicit sign-out.
- Never let one EA's pending outbox work push under another EA's session.
- Zero-class onboarding must distinguish confirmed empty, unconfirmed empty, available data, and no
  active Programme assignment.

Pilot provisioning uses `scripts/createTesters.js` for explicit zero-class testers on the exact
SQLite backend. The generic legacy loader is disabled.

### 6.2 Home

Home is the primary daily-use surface. It must show:

- identity, Programme, and school;
- full sync status, not only a green/grey icon;
- clocked-in or clocked-out state with elapsed time and safe actions;
- the locked sessions-today half gauge;
- a short "who to see next" list;
- Monday-to-Friday session activity;
- active-roster assessment coverage;
- recent sessions;
- correct zero-class onboarding routing.

All Home domain data comes from SQLite. Network activity may refresh SQLite, but must not be a
render-time dependency.

### 6.3 Time tracking

- Clock in and out with approximate geolocation when available.
- Prevent overlapping open time entries at the repository boundary.
- Use one shared time-tracking state across screens.
- A GPS request must resolve or fall back within about ten seconds.
- Permanent permission denial offers a path to device Settings.
- Record-without-hours remains an explicit escape hatch for session capture.
- Attribute work-day grouping to the South African Programme day.

### 6.4 Classes, children, and onboarding

- Show active-Programme classes and children authorized for the EA.
- Search and filter the roster.
- Create and edit local classes and children offline.
- A confirmed zero-class EA enters guided class then child onboarding.
- Offline creation after an unconfirmed zero requires explicit duplicate-risk acknowledgement.
- Class creation starts a durable incomplete child-onboarding step.
- At least one child is required; fewer than ten requires confirmation; adding more remains possible.
- A child row opens Child Results while explicit letter-tracker and edit actions remain available.
- Head Office and local creation paths must converge without duplicate active relationships.

### 6.5 Groups

Current group management supports normalized groups and memberships. The target group-centred
workflow must additionally provide group cards, Group Detail, durable group identity on sessions,
group-first capture, and historical membership correctness. See the dedicated active specification.

### 6.6 Literacy sessions

The current Literacy form records:

- South African Programme session date;
- selected children and the resolved roster source;
- letters focused on, in the paper-tracker teaching order;
- one session reading level;
- optional per-child current reading levels;
- comments;
- current letter-mastery changes.

The same transaction persists:

- the session;
- its attendee rows;
- the historical per-session reading-level snapshot;
- changed durable `children.reading_level` values for final attendees only;
- letter-mastery changes for final attendees only;
- all corresponding outbox operations.

Submitted history is currently view-only. Saved-session editing may not ship until attendee removal
is correct.

### 6.7 Assessments

- Select an authorized child and infer language from normalized class data when possible.
- Support grid and sequential EGRA capture modes.
- Preserve wall-clock-accurate timing, background pause/resume, hard stop, and last-attempted
  confirmation.
- Store parent assessment and item evidence atomically before navigation.
- Show complete locally available Assessment History for the signed-in EA and Programme.
- Show raw correct count as the hero result and configured score-band meaning where available.
- Keep unknown or unconfigured score bands neutral rather than inventing thresholds.
- Retain direct paths to assessment, result detail, and letter mastery.

Inbound history hydration remains required before a fresh installation is a complete recovery
surface.

### 6.8 Letter mastery

- Use the curriculum letter order in `src/constants/literacyConstants.js`.
- Distinguish assessment-derived evidence from EA-taught/mastered state.
- Preserve deterministic logical identity and soft-delete/reactivation behavior.
- Keep the child screen and session tracker on one shared mastery-state contract.

### 6.9 Insights

Insights provides:

- Letter Mastery ranking
- Assessment Scores ranking
- Session Count ranking

Ranking semantics must name their population, time window, assessment type, grade, language, and
configured threshold source. Missing pedagogy thresholds render as unknown, not as guessed meaning.

### 6.10 Sync Status

The user must be able to understand:

- online/offline state;
- ready and backed-off waiting work;
- in-flight work;
- retryable failures;
- terminal needs-attention work;
- last attempted and last successful sync;
- per-record failure context;
- safe manual retry.

The product must not claim complete local history merely because the outbound queue is empty.

### 6.11 Support and observability

Profile support tools must:

- export rolling local logs;
- export SQLite-aware support diagnostics with schema, counts, sync state, release, device, Expo
  Update, backend, and representative failed/terminal operations;
- warn that exports can contain sensitive child/session/assessment data;
- provide a safe handled-error Sentry verification action;
- preserve local evidence when cloud telemetry is unavailable.

Initial Sentry posture:

- no Session Replay;
- no screenshots or view hierarchy;
- no default PII or staff email identity;
- no automatic cloud forwarding of arbitrary console-log arguments;
- structured, rate-limited crash, hang, sync, reconcile, and bootstrap signals only.

## 7. Product workstreams not yet complete

### 7.1 Additional session forms

Numeracy Coach, ZZ Coach, and Yeboneer requirements have not been gathered or implemented. Each form
needs its own domain specification and persistence contract. Do not clone the Literacy form and
rename fields.

### 7.2 Group-centred sessions

The active specification is
[`documentation/group-session-workflow.md`](documentation/group-session-workflow.md). This is a
cross-layer architecture change, not a UI-only port.

### 7.3 WelaPLUS

The active PRD is
[`documentation/wela-plus-battery-prd-2026.md`](documentation/wela-plus-battery-prd-2026.md).
Question components exist only on the unmerged `feature/wela-plus-battery-merge` branch. Host
schema, sync, Run lifecycle, package publication, content, calibration, and field validation remain
open.

### 7.4 Head Office importer

The old seed and bulk-import plans are archived because they target retired tables. The future
canonical importer:

- begins with read-only discovery of the real Airtable/Postgres source model;
- is idempotent and rerunnable;
- uses the app's deterministic active-pair ID functions;
- preserves class-membership history;
- validates zero identity mismatches after import;
- produces dry-run, reconciliation, and operator-audit evidence.

Detailed constraints live in `documentation/ROADMAP.md`.

## 8. Later product opportunities

These are product opportunities, not committed implementation order:

- push notifications and a durable in-app message inbox;
- coach alerts produced by data-team jobs;
- delegated admin/provisioning portal;
- advanced analytics and reporting;
- session photos where the domain need is clear;
- multi-language UI;
- curriculum integration;
- offline map context;
- dark mode;
- motivation and recognition features that respect low-end-device and reduced-motion constraints.

National-scale architecture, cost, operations, POPIA, and government-readiness considerations are
covered in
[`documentation/national-scale-readiness-250k-users-2026-07-15.md`](documentation/national-scale-readiness-250k-users-2026-07-15.md).

## 9. Historical phase vocabulary

Older plans and build-log entries use these phase numbers:

| Phase | Scope | Coarse status |
|---|---|---|
| 0 | Project setup | Complete |
| 1 | Authentication and foundation | Complete |
| 2 | Time tracking | Complete |
| 3 | Children and groups management | Complete for the current child-oriented model |
| 4 | Literacy session recording | Complete for the current model |
| 5 | Additional session forms | Not started |
| 6 | Offline sync refinement | Superseded by the SQLite/outbox architecture |
| 7 | Polish and production preparation | Partial; see the roadmap |
| 8 | EGRA Letter Sound Assessment | Complete for current capture, with open hydration/draft work |
| 9 | Letter Tracker | Complete |
| 10 | Earlier dashboard redesign | Superseded by the locked 2026-07-22 Home/navigation design |

Since Phase 10, implementation has been organized through the SQLite cutover, June Top-10 tranche,
July improvements, sync hardening sprints, design foundation, pilot onboarding/observability, and
the locked Home/navigation work. The build log is authoritative for all of them.

## 10. Documentation contract

- Present-tense product and architecture requirements belong here, in `CONTEXT.md`, or in a focused
  active specification.
- Current open work belongs only in `documentation/ROADMAP.md`.
- Verification, decisions, defects, and dead ends belong in `documentation/build-log.md`.
- Physical checks belong in the device-gate checklist.
- Table-by-table sync/RLS behavior belongs in the contract map.
- Completed and superseded plans belong in `documentation/archive/`, after surviving work is
  rescued.
