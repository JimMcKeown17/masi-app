# Group-Centred Session Workflow

**Status (2026-10-22):** Literacy capture and durable resume are realised by lesson-plan C2–C3
on `feat/lesson-flow`. Group Detail, wider group editing and physical-device acceptance remain open.

**Extracted 2026-07-23 from:** the completed and mostly stale
[`Zazi iZandi to Masi feature-port roadmap`](./archive/zazi-izandi-feature-port-roadmap.md).

## Why this specification exists

Masi's operational unit is a group block. Literacy capture now starts with **Who are you teaching?**,
continues on the **Lesson** screen and saves from **Wrap up**. B2 persists and syncs the chosen
`sessions.group_id` on the session and every attendee, with server authorization by a held or
historically held assignment in the group's Programme. C2–C3 writes the fixed lesson class and
`activities.lesson` alongside that identity (`src/lessonPlan/lessonRecord.js:19`).

This work is not a navigation reskin. It crosses access grants, group identity, RLS, local
persistence, sync payloads, session lifecycle, and reporting. The dependency order is load-bearing.

## Locked domain rules

- One completed session represents one group block of work.
- EAs need whole-class visibility for control-group assessment and replacing a child who leaves a
  delivery group. Assessment scope can therefore be wider than delivery scope. The access model that
  makes this coexist with assignment-scoped delivery is settled in
  [ADR-0005](../docs/adr/0005-assessment-delivery-scope-two-tier-access.md): class assignment =
  assessment scope, delivery assignment = delivery scope, group assignment = composition-edit scope;
  assessment history follows class scope (current year), session history follows delivery scope.
- Group membership and class membership retain history. Head Office does not hard-delete captured
  records merely to change the current operational view.
- The latest letters shown for a group come from that group's latest literacy session, not from a
  temporary per-child summary.
- Programme remains a first-class scope. Group, session, assignment, and reporting behavior must
  not silently fall back to job title.
- **The group-first shell is driven by programme *delivery mode*, not job title.** Every session
  carries a `group_id` *uniformly* — whole-class programmes use their synthetic one-row-per-class
  group (ADR-0002) — so the **data spine is universal**. The **capture UX adapts** to delivery mode:
  multi-group programmes (Core Literacy pairs, Numeracy/Zazi bands) show a group picker; whole-class
  programmes (1000 Stories, whole-class Yebo) auto-select the single synthetic group with no picker.
  Group size is configurable per programme, never hardcoded to 2 (Masi is already experimenting with
  4). This is what lets a new programme slot in by *configuration* (the future per-programme grouping
  matrix) rather than a new capture screen — maximum flexibility with one shell.

## Prerequisites

The group-first UI uses these contracts; the dated B2 steps below retain their original evidence
scope. Later hosted/device evidence is in the build log, not inferred from these local checks:

1. **Done — session-group grant evidence (B2 Task 5, 2026-10-21).**
   Existing `GRANT_SUBJECTS` already represents class/group-membership-mediated child grants.
   [B2](../docs/superpowers/plans/2026-10-20-lesson-plan-b2-session-group.md) adds the session and
   attendee held-group evidence: this EA's owed assignment insert counts even when it has ended.
   Archive-only, terminal and other-EA inserts do not count; other grants remain active-only.
2. **Deferred (lesson-plan C16).** Collision-proof identity and lifecycle rules for
   `grouping_versions`, `groups.display_number`, and `child_group_memberships` remain outside B2.
3. **Done for the session-group server contract (B2 Task 1).** Non-null groups require a held or
   historically held assignment and the group's own Programme, with completed-state and child
   guards retained. History visibility and deleted-group writes are covered by the B2 contract.
   [ADR-0005](../docs/adr/0005-assessment-delivery-scope-two-tier-access.md) retains the wider access model.
   Hosted application remains an approved release gate.
4. **Done — schema, history, producer, payload and dependency/evidence contract (B2 Tasks 1–5, 2026-10-21).** The contract map, canonical
   server/local migrations, repository guards, equal attendee group ids, allowlists and local
   behavior tests implement the session-group write contract. Sessions wait for their own failed
   group, not unrelated groups; the deleted-group assignment-backoff scenario converges in ordinary
   passes without terminal rows or manual retry. Task 6's lost-response retry fix remains a separate
   release prerequisite, and hosted/device gates still apply before B2 merges and the UI ships.

## Product requirements

### 1. Class detail becomes group-aware

- Provide a compact Children/Groups switch without hiding child-level escape hatches.
- Group cards show group number/name, child count, sessions this week, the current teaching focus,
  and the most recent session summary.
- Child replacement remains possible from the wider class roster.
- Auto-grouping is a separate future product feature. It is not part of this workflow.

### 2. Group detail becomes the operational hub

- Show current members and the group's latest literacy-session letters.
- Make the next action obvious: record a session for this group.
- Keep access to child results, assessment, letter mastery, and edit paths.
- Empty, stale, pending, and failed sync states must be explicit.

### 3. Session capture becomes group-first

- The user chooses one group block before entering literacy capture.
- The attendee set starts from group members on the visible delivery roster but can record
  differences without rewriting historical membership.
- The local session and server session both persist the same non-null `group_id`.
- `session_attendees` remains the historical attendee snapshot.
- The server must never strip group context from a successfully synced session.

### 4. In-progress sessions become durable

**2026-10-22 implementation:** [Lesson-plan spec §7.2](../docs/superpowers/specs/2026-10-20-lesson-plan-design.md#72-lesson-drafts-local-only)
uses local `lesson_drafts` (v17), one per EA. `sessions.state` stays completed. The old Record form
is retired. One handle-owned controller serialises all edits from Lesson and Wrap up; the screens
attach to its view rather than reloading a stale JSON copy (`src/session/handleServices.js:99`,
`src/services/lessonDraftController.js:76`).

- Opening writes nothing; first change or Wrap up creates the draft. An untouched lesson takes
  its date from its first change (`src/hooks/useLessonDraft.js:15`, `:154`).
- Home offers **Lesson in progress · {names} · Resume** first, without dismissal or another
  clock-in check. "+ Record" resumes after its usual gates (`src/utils/homeAttention.js:21`,
  `src/screens/lessons/LessonPickerScreen.js:48`).
- Leaving a persisted lesson asks **Leave lesson** / **Keep teaching** and keeps it. **Discard
  lesson** has its own confirmation (`src/screens/lessons/LessonScreen.js:52`, `:126`).
- Save drains queued edits, refuses new edits and rechecks programme/child authority inside the
  same transaction that writes the session, attendees, changed levels, tracker corrections and
  outbox work, then deletes the draft. Rollback keeps the same session id
  (`src/services/lessonDraftController.js:151`, `src/services/lessonSave.js:32`).
- Persisted context and dated advice survive resume. Phone force-quit, upgrade, offline restart
  and native navigation proof remain [device gates V](./device-gates-sqlite-backend-2026-07.md#v-lesson-flow-c2c3-2026-10).

### 5. Settled capture decisions and remaining scope

- **No session timer** in v1; lesson-open and save times are not teaching duration.
- **Attendance toggles in capture**, starting from visible group members, with **+ Add a child**
  for today. `visibleRosterChildren` is shared by ChildrenContext, lesson start and Add a child
  (`src/utils/childVisibility.js:3`, `src/hooks/useLessonDraft.js:39`).
- **Past dates through Wrap up's Date picker.** When date differs from advice `made_on`, save
  keeps the taught record and omits that advice (`src/screens/lessons/LessonWrapUpScreen.js:219`,
  `src/lessonPlan/lessonRecord.js:10`).
- Head Office change copy and the wider composition editor remain separate work. The ADR
  **"advice from the children, record with the group"** remains open: draft with Jim through
  `grill-with-docs` before the PR merges (spec §11).

P1–P12 are recorded in the build-log Decision Register; Jim's wording/decision pass remains open
in [`open-decisions-backlog.md`](./open-decisions-backlog.md).

## Deliberate non-goals

- No Zazi branding or yellow semantics.
- No automatic grouping algorithm.
- No group UI that writes only local `group_id` while the server discards it.
- No temporary child-first "last session letters" feature that will be deleted by this rebuild.
- No hard deletion of historical sessions, assessments, or membership history.

## Definition of done

- The group identity, grant, RLS, persistence, payload, ordering, and reconcile contracts are
  documented and behavior-tested.
- A session captured for a group on device A hydrates with the same group and attendees on device B.
- Force-quit recovery resumes an in-progress session without losing or duplicating work.
- Group cards and Group Detail derive their summaries from SQLite, not ad-hoc in-memory merge state.
- Low-end Android device gates cover roster scrolling, draft resume, capture responsiveness, and
  sync-state truthfulness.
- The build log records focused RED/GREEN evidence, full gates, migration deployment, live RLS
  probes, and physical-device results.
