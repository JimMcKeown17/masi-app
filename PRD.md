# Masi App Product Requirements

**Document role:** current product, domain, and architecture requirements.

**Updated:** 2026-10-29

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
  During the November 2026 field month, J4 authorizes this incident/bundle lane
  to capture raw record ids, wire payloads, server error text, exception messages
  and stacks, log tails, EA identity and full runtime/device detail including
  device name. Receipt and bundle API reads remain service-role only; explicitly
  authorized read-only operator psql access is separate. Local support exports
  still warn before sharing sensitive data; Git receives safe excerpts only.
  This exception does not broaden the independent Sentry capture rules (§6.11).

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

- A class assignment defines assessment scope: the whole class, including delivery and control
  children. An EA may assess a control child without creating a delivery assignment.
- Delivery scope remains the EA's delivery subset. My Children, ClassDetail, session/attendee
  pickers, groups, onboarding, daily targets and delivery rankings use that subset.
- Class scope does not authorize delivery edits, mastery confirmations or changes to another
  EA's group composition. See [ADR-0005](docs/adr/0005-assessment-delivery-scope-two-tier-access.md).
- A group is the delivery unit within a class.
- One completed session represents one group block of work.
- Literacy capture chooses a group, teaches on the Lesson screen, and saves through Wrap up.
  The wider group-centred requirements are specified in
  [`documentation/group-session-workflow.md`](documentation/group-session-workflow.md).
- Session attendees are a historical snapshot. Later group membership changes must not rewrite
  who attended an earlier session.

### 3.4 Assessment

- Field assessment is capture performed by an EA in the mobile app.
- In-app assessment is an instrument delivered through the app.
- Assessment results keep the raw item evidence needed to explain and recompute summaries.
- Assessment Windows are first-class in the data model, but the current UI does not yet implement
  formal Window selection. Home and Assess coverage uses non-skipped Letter results in the active
  academic year, from any recorder, over the assessable roster (delivery plus control children).

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
  `assessment_items`, `letter_mastery`, `skill_mastery`;
- device and sync: `local_state`, `sync_state`, `sync_outbox`, `schema_migrations`, and local-only
  `lesson_drafts` (v17; group-history references are v18).

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

- Email/password sign-in. Password reset is built but hidden from Log in until password recovery works end to end ([#78](https://github.com/JimMcKeown17/masi-app/issues/78)).
- Publish a refreshable persisted same-user session quickly enough for offline cold start.
- Reject stale auth events from an older session attempt.
- Keep job title, school, Programme assignment, release identity, and backend identity visible.
- Allow password change (a bottom sheet with inline errors; an outcome after the sheet closes arrives as a message) and explicit sign-out.
- Never let one EA's pending outbox work push under another EA's session.
- Zero-class onboarding must distinguish confirmed empty, unconfirmed empty, available data, and no
  active Programme assignment.

Pilot provisioning uses `scripts/createTesters.js` for explicit zero-class testers on the exact
SQLite backend. The generic legacy loader is disabled.

### 6.2 Home

Home is the primary daily-use surface (Bold Red Home, spec
`docs/superpowers/specs/2026-10-17-bold-red-home-design.md`). It shows:

- identity, Programme, and school;
- sync status as an icon button whose glyph and badge carry the state (full wording on the Sync
  status screen and in the button's accessibility label);
- clocked-in or clocked-out state with clock-in time and safe actions (clock-out is conditional on
  the time entry still being open);
- the sessions-today segmented half gauge (locked R3 colour rule);
- Monday-to-Friday session activity;
- an attention area that is blank by default and shows at most two cards: items needing sync
  attention, an automatic clock-out (for 24 hours after it is detected, dismissible), and children
  still to assess (dismissible until the next day);
- a **Lesson in progress** card first when a draft exists, with names, a chevron and **Resume**;
  it is not dismissible and opens the Lesson screen without a clock-in check;
- correct zero-class onboarding routing.

Home reloads its statistics on focus and when the app returns to the foreground. Session history
is reached from Insights. **Up next** is in the lesson picker. Attention priority and the two-card
cap come from `src/utils/homeAttention.js:101`; draft resume is wired in `src/screens/main/HomeScreen.js:91`.

All Home domain data comes from SQLite. Network activity may refresh SQLite, but must not be a
render-time dependency.

### 6.3 Time tracking

- Clock in and out with approximate geolocation when available.
- Prevent overlapping open time entries at the repository boundary.
- Use one shared time-tracking state across screens.
- GPS and a last-known fix no older than 15 minutes share a hard ten-second deadline.
- Missing location never blocks a manual clock action: save null coordinates and the reason
  (`timeout`, `denied`, `services_off`, or `unavailable`), or `fix` with coordinates, locally and
  on the server. NULL status means not recorded by older builds or automatic clock-out.
- Permission recovery offers Continue Without Location and one explicit retry or Open Settings.
  A successful Settings handoff writes nothing and asks the EA to return and tap again.
- Duplicate taps share an in-flight guard; clock-out re-resolves the active entry after capture.
- Clock-out after ten hours records the ten-hour automatic close and Home notice, with null
  sign-out location fields. Check before requesting location and again after capture; a manual
  close at or before ten hours retains its actual time and location outcome.
- Record-without-hours remains an explicit escape hatch for session capture.
- Attribute work-day grouping to the South African Programme day.

### 6.4 Classes, children, and onboarding

- Show active-Programme classes. My Children and ClassDetail show the EA's delivery children;
  the assessment roster also includes control children in the EA's assigned classes.
- Search and filter the roster.
- Create and edit local classes and children offline. Child edits, deletes and archives require
  an active delivery assignment or the child's creator; class-only assessment access is insufficient.
- A confirmed zero-class EA enters guided class then child onboarding.
- Offline creation after an unconfirmed zero requires explicit duplicate-risk acknowledgement.
- Class creation starts a durable incomplete child-onboarding step.
- At least one child is required; fewer than ten requires confirmation; adding more remains possible.
- A child row opens Child Results while explicit letter-tracker and edit actions remain available.
- Head Office and local creation paths must converge without duplicate active relationships.

### 6.5 Groups

Current group management supports normalized groups and memberships, durable session group identity,
and group-first literacy capture. The picker can make a group from ungrouped children or put an
ungrouped child in an existing group. Creation writes the group, assignment, memberships and outbox
work together (`src/db/repositories/groupsRepository.js:394`). Group Detail and the wider composition
editor remain separate work. See the dedicated active specification.

### 6.6 Literacy sessions

The Literacy route is **Who are you teaching? → Lesson → Wrap up → Session complete**.
"+ Record" retains the programme and clock-in gates; an existing draft opens directly after them.
The picker ranks groups with **Up next**, last-seen labels, suggested letters, and group-creation
actions. Missing programme or school-year inputs show an actionable notice instead of a spinner
(`src/screens/lessons/LessonPickerScreen.js:48`).

The Lesson screen starts with visible group members present. Attendance toggles and **+ Add a child**
change today's attendees only. Class/language choices are explicit when missing; the fixed lesson
class gives its language and ECD behaviour. Letters, blends and a printed book are tickable; ECD
hides pair reading. Release packs carry letters only; blends and a reader currently require the
isiXhosa developer pack on `preview-content` (`src/hooks/useLessonDraft.js:39`,
`src/components/lessons/LessonBlendSection.js:15`, `src/lessonPlan/inputs/lessonInputs.js:114`).

Opening writes nothing. The first change (or Wrap up) persists one draft per EA; the first content
tick fixes the advice. A later-day resume keeps the dated plan. Changing the session date so it
differs from the plan's `made_on` saves `plan: null, plan_reason: 'past_date'`. Leaving a persisted
lesson asks **Leave lesson** / **Keep teaching** and keeps it; deletion is a separate confirmed
**Discard lesson** action (`src/hooks/useLessonDraft.js:15`, `src/lessonPlan/lessonDraftState.js:31`,
`src/screens/lessons/LessonScreen.js:52`, `src/lessonPlan/lessonRecord.js:10`).

Wrap up records independent letter knowledge in the lesson language, changed reading levels, date
and notes. Empty letters/blends/books require confirmation; at least one child must be present.
Save holds Back while in flight, drains the shared controller, then atomically writes the session,
attendees, current-level snapshots, changed-only child levels, tracker corrections with original tap
times, all outbox work, and draft deletion. Authority is checked again inside the transaction.
A failed save keeps the draft and stable session id for retry
(`src/screens/lessons/LessonWrapUpScreen.js:78`, `src/services/lessonDraftController.js:151`,
`src/services/lessonSave.js:32`, `src/lessonPlan/lessonRecord.js:4`).

Native back swipe, force-quit recovery, A03s timing and server convergence remain device gates
[V1–V8](documentation/device-gates-sqlite-backend-2026-07.md#v-lesson-flow-c2c3-2026-10).

Submitted history is currently view-only. Saved-session editing may not ship until attendee removal
is correct.

### 6.7 Assessments

- Select from the class assessment roster: **"Your children"** then **"Rest of the class"**,
  with search across both sections and empty sections omitted. A control child needs an open
  membership in an active-Programme assigned class, not a delivery assignment or child Programme
  enrollment. Assessing never adds a child to delivery lists or counts.
- Language comes from the chosen membership's class `home_language`: English (`en`),
  isiXhosa (`xh`), Afrikaans (`af`) or isiZulu (`zu`) for the quick tests and Full EGRA; WelaPLUS
  2026.1 offers English and isiXhosa. When missing or unsupported, the EA picks from the languages
  that have an item set, with nothing preselected and never English by default.
- Step-by-step capture only; the stop rule comes from the item set (the whole first row wrong on
  the 2026.3 reading content). The position the EA reached is the last attempted item; there is
  no separate confirmation.
- Preserve wall-clock-accurate timing, background pause/resume and hard stop.
- Store parent assessment and item evidence atomically before navigation.
- Hydrate authorized current-academic-year class results, including co-EA results, for child
  results and assessment coverage. Assessment History's list retains its signed-in-EA recorder
  filter and active Programme; names use the assessable roster with a SQLite fallback for
  children outside that roster.
- Show raw correct count as the hero result and configured score-band meaning where available.
- Keep unknown or unconfigured score bands neutral rather than inventing thresholds.
- Retain direct paths to assessment, result detail, and letter mastery.

Inbound history hydration remains required before a fresh installation is a complete recovery
surface.

### 6.8 Letter mastery

- Use the curriculum letter order in `src/constants/literacyConstants.js`.
- Distinguish assessment-derived evidence from EA-taught/mastered state.
- Preserve deterministic logical identity and soft-delete/reactivation behavior.
- Keep the child screen and session tracker on one shared mastery-state contract. EA mastery
  confirmations require an active delivery assignment; control-child assessment results and
  trackers expose no confirmation controls.

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
- warn, in a confirmation sheet before export, that exports can contain sensitive child/session/assessment data;
- provide a safe handled-error Sentry verification action;
- preserve local evidence when cloud telemetry is unavailable.

The field-diagnostics contract adds **Report a problem** and **Send diagnostics**
rows beside Share actions. They use existing bottom sheets and record durably
before attempting sync. Report text is required and limited to 4,000 characters;
an optional screenshot is offered only after native-module preflight. The picker
contract retains the returned MIME type and original extension without forced
resizing/conversion. Confirmation is based on that exact incident generation:
"Sent. Thank you." or "Saved on your phone. It will send when you're online."
An online flag or a generic sync-pass success cannot prove delivery.

Automatic conditions are observed from committed SQLite state; caught app errors
and human actions record in their own transactions. Immutable receipts carry
observation provenance separately from delivery metadata. Capture/upload failures
must not alter domain upload outcomes. These C/F behaviors implement the approved
[Revision 4.1 contract](docs/superpowers/specs/2026-10-29-incident-lane-and-bug-registry-design.md),
with [binding plan rulings](docs/superpowers/plans/2026-10-29-field-diagnostics-plan.md),
and are merged with local unit/integration proof. Persisting conditions re-record
only on payload/release change or when `last_seen_at` is ≥15 minutes old; automatic
observer capture runs detached from status refresh, with its receipt gated while
`capturing`. A missing delivery-state row returns `unknown`, which cannot confirm
saved/sent. The controller's prior disposable PostgreSQL run passed all ten
harnesses, including 225 support-incident cases; local Storage policy-model proof
remains separate from hosted behavior. Hosted apply/read-back, native build,
device acceptance and first real sweeps remain open; see the
[standing contract map](documentation/rls-sync-contract-map.md#field-diagnostics-immutable-receipts-and-observed-incidents).

J4 applies to this private diagnostic lane for the field month. Receipts and
bundles are retained through the pilot with no purge job. EA clients cannot read
or list either. Service-role receipt SELECT and private Storage API reads are
separate from the explicitly authorized operator reader's read-only psql path,
which uses validated SQLite staging credentials and one complete SQL snapshot.
Never source dotenv files or assume migration files establish hosted state.

Initial Sentry posture (independent of the diagnostic lane):

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
The Question components under `src/assessment-questions/` are wired into the app: the Battery Run
host (PR #101), Full EGRA (#104), step-by-step marking (#107), and WelaPLUS 2026.1 on the shared
reading content with skip rules (#108). Host schema, sync and the Run lifecycle are built. Device
acceptance on the iPhone, package publication, printed materials, calibration and field validation
remain open (`documentation/ROADMAP.md` §8).

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
