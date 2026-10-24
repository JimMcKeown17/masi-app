# Whole-Class Assessment Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An EA can assess every child in a class they hold a class assignment for, delivery and
control children alike. Their phone keeps that roster fresh, and an offline result survives a
handover.

**Architecture:**
- **Server:** one additive migration. It adds two acknowledgment keys and a date-aware grant
  helper, and `submit_assessment`/`save_battery_run` use the helper.
- **Phone:**
  - a class-roster pull scope;
  - a class-scoped membership reconcile pass;
  - a superseded-membership rule;
  - a separate `getAssessableChildren` read model with a `useAssessableChildren` hook.
- **Screens:** assessment surfaces switch to the new roster, and delivery surfaces stay on
  `getMyChildren`.

**Tech Stack:**
- Supabase Postgres migrations;
- disposable-Postgres harnesses (`scripts/*-postgres-harness.cjs`, run in CI);
- React Native and expo-sqlite, with real SQLite in Jest via `test-support/expoSQLiteMock`.

**Spec:** `docs/superpowers/specs/2026-10-23-whole-class-assessment-access-design.md` (rev 3).
Decisions W1–W4 are Jim's. Read §5 in full before any task.

## Global Constraints

- **Migrations.** One new file under `supabase/migrations/`. It must be additive and idempotent
  (`create or replace`, no drops) and must not change `schema_version` (still 1). It must not be
  applied to any hosted project inside a task. Applying it to staging is Task 9 and needs Jim's
  go.
- **Supabase commands.** Never run raw `supabase` commands from the repository root. Use only
  the `sqlite:staging:*` helper for staging.
- **Delivery-scope consumers keep `getMyChildren`/`useChildren`.** That is My Children, the
  session and attendee pickers, `ChildSelector`, `GroupPickerBottomSheet`, ClassDetail,
  onboarding, EditChild, daily targets, `SessionCountRankingScreen` and
  `LetterMasteryRankingScreen`. A scope test pins this (Task 7).
- **Reconcile safety rails are load-bearing** (AGENTS.md):
  - end only `synced` rows;
  - never reconcile from an errored or incomplete scope;
  - the mass-end breaker applies to every new pass.
- **Real-SQLite tests are required** for pull, reconcile and read-model work. Assert rejections
  with try/catch on `error.code`.
- **Run tests under Node 20:**
  `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- **npm only.** No new dependencies.
- **`documentation/rls-sync-contract-map.md` changes in the same task** as any pull, reconcile,
  RLS or RPC change.

## Review Focus

1. **A control child moves class mid-year with the EA** (A → B), with responses in either order.
   The new membership must land, and the child stays assessable. Test: Task 2.
2. **Head Office ends many delivery memberships at once** inside a large class. The delivery
   breaker must still hold, and the class pass ends none of them. Test: Task 4.
3. **An old server returns no new acknowledgment keys, or the roster scope is incomplete.**
   Nothing may be ended. Test: Task 4.
4. **An EA's phone is offline across a handover**, then syncs a result dated before the handover.
   The upload is accepted. Test: Task 1 (server) and Task 8 (sync).
5. **A control child appears in a delivery surface**, such as a session attendee picker or the
   daily target. It must not. Test: Task 7.

---

### Task 1: Server — roster acknowledgment keys and late-upload grace

**Files:**
- Create: `supabase/migrations/20261023120000_whole_class_assessment_access.sql`
- Modify: `scripts/assessment-results-postgres-harness.cjs`, which gains the grace cases
- Modify: `scripts/rls-visibility-probe.cjs:68-96`, which gains the new keys and a class-only seed
- Modify: `documentation/rls-sync-contract-map.md`: the reconcile acknowledgment table, the
  `submit_assessment`/`save_battery_run` authority rows, and the grace rule

**Interfaces:**
- Produces:
  - `get_reconcile_acknowledgments()` additionally returns `roster_class_ids uuid[]` and
    `roster_membership_ids uuid[]`, both `[]` when empty, per spec §5.2;
  - `private.user_held_grant_on(p_child uuid, p_day date) returns boolean`, per spec §5.4
    exactly. It is SECURITY DEFINER with `set search_path = ''`, and is revoked from public;
  - `submit_assessment` and `save_battery_run` accept a new family or run when
    `current_user_can_write_for_child(child) OR private.user_held_grant_on(child, d)`, with the
    open programme check unchanged. For a run, `d` is
    `(started_at at time zone 'Africa/Johannesburg')::date`.

- [ ] **Step 1: Write the failing harness cases** in `assessment-results-postgres-harness.cjs`:
  - a class-only EA (a class assignment plus an open membership, no delivery row) can submit an
    assessment and save a run for a control child;
  - after the class assignment ends, a result dated inside the old window is accepted and one
    dated the day after the end is refused (42501);
  - a class assignment and a membership that never overlapped on that day are refused;
  - a grant created at 08:00 SAST covers that day;
  - a grant ending at 23:30 UTC (01:30 SAST next day) covers the next SAST day;
  - a future date is refused, and so is a date outside the active academic year;
  - with no open programme assignment, the result is refused;
  - a committed-family retry after the grant ended still returns `already_present`;
  - the group arm uses `joined_at`/`removed_at`;
  - `get_reconcile_acknowledgments` returns only the caller's active-programme class ids and
    every open membership in them, including another EA's delivery children in a shared class.
- [ ] **Step 2: Run the harness and confirm it fails**
  - Run against a local disposable Postgres 17, with the same three variables CI sets
    (`.github/workflows/tests.yml`; the checks are in
    `history-authorization-postgres-harness.cjs:57-71`):
    `export HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres HISTORY_RLS_DATABASE_NAME=masi_history_rls_whole_class HISTORY_RLS_DISPOSABLE_CONFIRM=<the DISPOSABLE_CONFIRMATION value in that file>`,
    then `npm run verify:assessment-results:postgres`.
  - Keep these exports for Step 4 too.
  - RED must fail on a new behavioural assertion, not on setup.
  - Expected: the new cases FAIL.
- [ ] **Step 3: Write the migration**
  - Redefine both RPCs with `create or replace`, copying their latest bodies from
    `20261021120000_assessment_results_contract.sql`.
  - Change only the authority expression.
- [ ] **Step 4: Run the harnesses and the probe's offline checks**
  - Run: `npm run verify:assessment-results:postgres && npm run verify:assessment-history:postgres && npm run verify:upload-contract:postgres`
  - Expected: PASS.
  - `rls:probe` is credential-driven against a hosted project. Here, run only its unit test
    (`npx jest __tests__/rlsVisibilityProbe*`). Its hosted run belongs to Task 9's staging gate.
  - Re-run the migration twice on the disposable database to prove it is idempotent.
  - Keep the RPCs' existing signatures, SECURITY DEFINER settings, `search_path` and
    authenticated-only execute grants, and keep the harness's grant assertions.
- [ ] **Step 5: Commit** with the message `feat(access): roster acknowledgment keys and date-aware upload grace`.

### Task 2: Roster memberships converge from server rows

**Files:**
- Create: `src/db/repositories/rosterMembershipPersist.js`, with
  `persistRosterMemberships(txn, rows, { childrenRepository })`
- Test: `__tests__/rosterMembershipPersist.test.js` (new, real SQLite)

**Interfaces:**
- Produces: `persistRosterMemberships(txn, rows) → { saved: number, skipped: Array<{ id, reason }> }`.
  - It saves the closed rows (`exited_at` not null) first, then the open rows, each through
    `saveChildClassMembership`, which keeps the per-id version guard.
  - Before saving an open row, it checks for another open local row with the same
    `(child_id, academic_year_id)`. If one exists, it skips the incoming row with reason
    `'conflicting_open_membership'` and logs `console.warn`.
  - It never writes an inferred `exited_at` and never enqueues outbox rows.
  - Spec §5.1 rev 4.

- [ ] **Step 1: Write the failing tests**
  - A → B in one year, with B's open row plus A's closed row in one batch: A is closed with its
    server `exited_at`, and B is saved.
  - The same rows split across two batches. B first: B is skipped as
    `conflicting_open_membership` and A is then closed. Replaying the complete server batch
    lands B (eventual convergence, design §5.1). Closed A first: B lands in the same call.
  - A stale older open A (lower `row_version`) arriving after the closed A is rejected by the
    guard.
  - Equal `enrolled_at` values.
  - A replacement whose `enrolled_at` is earlier than A's.
  - A pending local A: B is skipped as `conflicting_open_membership`, and A is unchanged.
  - No outbox rows are written.
- [ ] **Step 2: Run and confirm they fail**
  - Run: `npx jest __tests__/rosterMembershipPersist.test.js`
  - Expected: FAIL. The module doesn't exist yet.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run the tests**
  - Run: `npx jest __tests__/rosterMembershipPersist.test.js __tests__/childrenRepository*.test.js`
  - Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(roster): converge class memberships from server rows, closed before open`.

### Task 3: Class-roster pull scope

**Files:**
- Modify: `src/services/preloadedChildData.js`, adding the `classRoster` scope and its persist
  order
- Modify: `src/context/ChildrenContext.js` (the `performPullFromServer` inline path, and a new
  `rosterVersion` in the context value)
- Modify: `documentation/rls-sync-contract-map.md` (the children and memberships pull rows)
- Test: `__tests__/classRosterPull.test.js` (new, real SQLite with a fake supabase client in the
  style of the existing preloaded-data tests)

**Interfaces:**
- Consumes: nothing persisted. The scope is **self-contained**, so it never races
  `ClassesContext` (`ClassesContext.js:329-350`) or the children-before-classes manual refresh
  (`ChildrenListScreen.js:171-173`).
- Produces a scope named `classRoster` with `{ ok, rows: { classEaAssignments, classes, children, memberships }, complete }`,
  built in one pass from four queries:
  1. **Class assignments:** the EA's own active, active-programme `class_ea_assignments`, with
     their classes (`select('*, classes(*)')`, as `preloadedChildData.js:439-444` does).
  2. **Roster memberships:** every **open** membership, in **any** academic year, in those
     classes. These establish roster access, including an open prior-year membership (design C3).
  3. **Children:** the full rows for those memberships' children.
  4. **Move memberships:** every **active-year** membership, open or closed, of those children,
     with `classes(*)`. These are needed for move convergence (Task 2).

  Rules for the result:
  - The parent class of every membership comes from its `classes(*)` join. If a closed
    membership's class is neither returned nor already local, that membership is dropped from
    `rows` and is **not** an incomplete scope. It is a historical row with nothing local to
    close. If an open roster membership's class is missing, the scope is incomplete.
  - `complete` is false if any query errors or returns `PULL_SCOPE_COMPLETENESS_LIMIT` rows.
  - `.in()` lists are chunked at 200.
  - Persist order: class assignments (via `classEaAssignmentsRepository`, idempotent with
    `ClassesContext`), then classes, then children (via `saveServerChildRow`, full row), then
    memberships (via Task 2's `persistRosterMemberships`).
  - `ChildrenContext` exposes `rosterVersion: number`, incremented after a persist.
  - It runs on sign-in, on every pull, and after `ClassesContext` persists a changed assignment
    set. `ClassesContext` gains an `assignmentsVersion: number` in its value
    (`ClassesContext.js:586-604`), and `ChildrenContext` triggers a roster pull when that
    version changes.

- [ ] **Step 1: Write the failing tests**
  - Both pull paths persist the class's control children and their open memberships.
  - Order: a membership whose class row lands first never fails its foreign key.
  - No outbox rows are written.
  - A history-reference stub is promoted to a full row.
  - An errored query gives `complete: false`, and persisted rows are kept.
  - A class the EA doesn't hold is never queried.
  - **Fresh phone:** with no local class assignments, the roster still downloads (self-contained).
  - **New class:** a newly granted class appears after `assignmentsVersion` changes.
  - **Pull order:** both completion orders of the `ClassesContext` and `ChildrenContext` pulls
    give the same result, tested through the real providers.
  - **Prior year:** a control child whose only open membership is prior-year is persisted and
    is assessable (pull → read model).
  - **Move on a fresh phone:** A → B with only B held and cached locally lands B and drops closed
    A without failing.
  - The scope is derived from `class_ea_assignments`, not from the `classes` table.
- [ ] **Step 2: Run and confirm they fail**
  - Run: `npx jest __tests__/classRosterPull.test.js`
  - Expected: FAIL.
- [ ] **Step 3: Implement the scope** once, as a shared helper called from both live paths.
  Do not modify the dead `handleServices.pullRoster`.
- [ ] **Step 4: Run the tests**
  - Run: `npx jest __tests__/classRosterPull.test.js __tests__/preloadedChildData*.test.js __tests__/ChildrenContext*.test.js`
  - Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(roster): pull the class roster for every held class`.

### Task 4: Class-scoped membership reconcile

**Files:**
- Modify: `src/db/repositories/childrenRepository.js`, adding `buildClassRosterMembershipReconcile`
- Modify: `src/services/preloadedChildData.js:124-138` (`pullReconcileAcknowledgments`).
  - It decodes optional `roster_class_ids` → `rosterClassIds` and `roster_membership_ids` →
    `rosterMembershipIds`.
  - An absent key decodes to `undefined` (old server, skip the pass), and `[]` to `[]`
    (authoritative empty).
  - Do **not** add them to the mandatory key list.
- Modify: `src/services/preloadedChildData.js` and `src/context/ChildrenContext.js`, to call it
  in the same transaction as the delivery pass, from the same acknowledgment snapshot
- Modify: `documentation/rls-sync-contract-map.md` ("Pull Persistence & Reconcile")
- Test: `__tests__/classRosterReconcile.test.js` (new, real SQLite)

**Interfaces:**
- Consumes:
  - the acknowledgment's `roster_class_ids` and `roster_membership_ids` (Task 1);
  - the delivery pass's `acknowledgedChildIds`;
  - `classRoster.complete` (Task 3).
- Produces: `buildClassRosterMembershipReconcile({ rosterClassIds, rosterMembershipIds, deliveryChildIds, pulledAt })`,
  with breaker scope `'classRosterMemberships'`. It ends rows matching
  `class_id in rosterClassIds`, `child_id not in deliveryChildIds`, `exited_at is null`,
  `sync_status = 'synced'` and `id not in rosterMembershipIds`. It is skipped entirely when
  either key is absent or the scope is incomplete.

- [ ] **Step 1: Write the failing tests:**
  - **Departed control child:** the last control child leaves a still-held class, and its
    membership is ended.
  - **Lost class:** a class no longer in `roster_class_ids` ends nothing.
  - **Safety rails:** pending, failed and terminal rows are never ended.
  - **Breaker:**
    - 12 delivery memberships end inside a 40-child class. The delivery breaker trips, and the
      class pass ends 0 of those 12. Run in both orders.
    - A year-end mass exit of control children trips the `classRosterMemberships` breaker.
  - **Missing or incomplete input:** absent keys, or an incomplete scope, end nothing.
  - **Wire to reconcile:** start from a raw server JSON snapshot and pass it through the decoder
    into **both** persistence paths:
    - an old-server snapshot without the keys skips the class pass;
    - `[]` keys reconcile against an empty roster.
  - **Shared class:** in a co-EA class, another EA's delivery child's membership is kept while
    it is open on the server.
- [ ] **Step 2: Run and confirm they fail**
  - Run: `npx jest __tests__/classRosterReconcile.test.js`
  - Expected: FAIL.
- [ ] **Step 3: Implement it** with `runReconcileWithMassEndBreaker`. Register the new scope
  wherever the existing authorised and needs-attention scope lists are declared
  (`ChildrenContext.js:13-19`, `repositoryRuntime.js:39-75`).
- [ ] **Step 4: Run the tests**
  - Run: `npx jest __tests__/classRosterReconcile.test.js __tests__/*reconcile*.test.js && npm test`
  - Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(roster): reconcile class-roster memberships by class`.

### Task 5: Assessable-children read model

**Files:**
- Modify: `src/db/repositories/childrenRepository.js`, adding `getAssessableChildren(userId)`
- Create: `src/hooks/useAssessableChildren.js`
- Test: `__tests__/assessableChildren.test.js` (new, real SQLite); `__tests__/useAssessableChildren.test.js`

**Interfaces:**
- Produces:
  - `getAssessableChildren(userId) → Array<child & { is_delivery: boolean, class_id, grade, home_language, membership_id: string|null }>`,
    implemented per spec §5.3, with the membership choice ordered by active year, then
    `enrolled_at` desc, then `id`;
  - `useAssessableChildren() → { yourChildren, restOfClass, all, loading }`. It reloads on
    `ChildrenContext.rosterVersion`, on the `ClassesContext` assignments version, and on focus.
    Each list is sorted by first name.

- [ ] **Step 1: Write the failing tests:**
  - **Union and flags:**
    - delivery ∪ class, with no duplicates;
    - `is_delivery` is true for a child in both;
    - a class child with no delivery row has `is_delivery: false`.
  - **Exclusions:**
    - an archived class's children are excluded;
    - a `history_reference = 1` child is excluded;
    - a child in a class whose assignment ended is excluded, unless the delivery arm includes
      them.
  - **Metadata:**
    - a child with two open memberships in different years takes the active-year membership's
      grade and language;
    - a tie on `enrolled_at` resolves by id;
    - a delivery child with no membership in an assigned class falls back to `children.class_id`.
- [ ] **Step 2: Run and confirm they fail**
  - Run: `npx jest __tests__/assessableChildren.test.js __tests__/useAssessableChildren.test.js`
  - Expected: FAIL.
- [ ] **Step 3: Implement both.**
- [ ] **Step 4: Run the tests**
  - Run: the same command.
  - Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(roster): assessable-children read model and hook`.

### Task 6: Guards for non-delivery children

**Files:**
- Modify: `src/db/repositories/classesRepository.js:219-257` (`archiveClass` cascade)
- Modify: `src/db/repositories/childrenRepository.js`: `archiveChild` (`:769-810`),
  `deleteIfNoHistory` (`:816-874`) and `updateChild`. Each gets a transactional,
  actor-scoped check that the child has an active local delivery row or `created_by = me`.
- Modify: `src/context/ChildrenContext.js:507-533` (`deleteChild`). It keeps its
  `{ success: false, error }` result contract, and maps the repository code into `error.code`.
- Modify: `src/db/repositories/masteryRepository.js:96-135` (`setLetterMastery`)
- Modify: `src/components/assessment/LetterMasteryPanel.js`, so confirm taps are hidden when
  `isDelivery` is false
- Modify: `__tests__/masteryRepository.test.js` and every other direct `setLetterMastery`
  fixture (`rg setLetterMastery __tests__`). Seed real delivery assignments for the authorised
  success cases, and keep explicit unauthorised cases.
- Test: `__tests__/nonDeliveryGuards.test.js` (new, real SQLite); extend `LetterMasteryPanel` tests

**Interfaces:**
- Produces:
  - `archiveClass` touches only children with an active local delivery row or
    `created_by = me`;
  - `archiveChild`, `deleteIfNoHistory` and `updateChild` throw
    `error.code = 'NOT_DELIVERY_CHILD'`, with zero domain or outbox changes. `deleteChild`
    returns `{ success: false, error }` with that code;
  - `setLetterMastery` throws `error.code = 'NOT_DELIVERY_CHILD'` for a child with no active
    local `child_ea_assignments` row;
  - `LetterMasteryPanel` takes an `isDelivery` prop (default `true`).

- [ ] **Step 1: Write the failing tests**
  - Archiving a class leaves control children's `class_id` and memberships untouched, and
    enqueues no outbox rows for them.
  - `deleteChild` and `setLetterMastery` refuse a control child.
  - The panel shows no confirm control when `isDelivery={false}`.
- [ ] **Step 2: Run and confirm they fail.**
- [ ] **Step 3: Implement the guards.**
- [ ] **Step 4: Run the tests**
  - Run: `npx jest __tests__/nonDeliveryGuards.test.js __tests__/LetterMasteryPanel*.test.js __tests__/classesRepository*.test.js __tests__/masteryRepository.test.js && npm test`
  - Expected: PASS.
- [ ] **Step 5: Commit** with the message `fix(roster): guard shared control-child records from delivery-only writes`.

### Task 7: Assessment surfaces switch to the assessable roster

**Files (spec §5.6):**
- Modify: `src/screens/assessments/AssessmentChildSelectScreen.js`, adding two sections:
  "Your children" and "Rest of the class". Language comes from the child's `home_language`
  (5.3), not from `ClassesContext`.
- Modify: `src/screens/main/AssessmentsScreen.js` (stats)
- Modify: `src/screens/main/HomeScreen.js:46`, for assessment coverage and the assessment-due
  card only
- Modify: `src/screens/main/ChildrenListScreen.js:62-66, 115`
- Modify: `src/utils/dashboardStats.js:325-330`. `getChildrenTabStats(deliveryChildren,
  assessableChildren, classes, assessments, academicYear)`: the delivery list gives the child
  count, the assessable list gives coverage.
- Modify: `src/screens/insights/AssessmentRankingScreen.js:58, 87-91`
- Modify every direct `getChildrenTabStats` caller in the same task:
  `__tests__/readers.mixedResults.test.js:94, 156` and
  `__tests__/dashboardStats.hiddenChildren.test.js:107, 117, 125`. Add a direct test with
  different delivery and assessable populations that pins child count, class count and
  unassessed count independently.
- Modify: `src/screens/assessments/AssessmentHistoryScreen.js:48`, which uses the assessable
  roster for names and keeps the `getChildNamesByIds` fallback
- Modify: `ChildResultsScreen`/`LetterTrackerScreen`, so they pass
  `isDelivery` to `LetterMasteryPanel`
- Test: `__tests__/assessmentScope.test.js` (new). Extend the existing tests for each changed
  screen.

**Interfaces:**
- Consumes: `useAssessableChildren` (Task 5).

- [ ] **Step 1: Write the failing scope test.** Seed one delivery child and one control child in
  the same class, then check both sides.
  - **The control child appears in:**
    - AssessmentChildSelect, under "Rest of the class";
    - the Assessments tab and Home coverage denominators;
    - "Unassessed";
    - the ranking "not assessed" list.
  - **The control child is absent from:**
    - My Children;
    - `ChildSelector` and the session attendee picker;
    - `GroupPickerBottomSheet`;
    - daily targets and `getSessionsTabStats`;
    - `SessionCountRankingScreen`;
    - `LetterMasteryRankingScreen`;
    - ClassDetail.
  - Search in the picker filters both sections. A section with no children is not shown.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Switch each listed surface.**
- [ ] **Step 4: Run the tests**
  - Run: `npx jest __tests__/assessmentScope.test.js && npm test`
  - Expected: PASS. Each existing screen test is updated only where its population
    intentionally changed, and each such change is listed in the report.
- [ ] **Step 5: Commit** with the message `feat(assess): assessment surfaces use the whole-class roster`.

### Task 8: Sync behaviour for control-child uploads

**Files:**
- Test: `__tests__/controlChildSync.test.js` (new). It uses the real outbox and classifier with a
  fake RPC.
- Modify: `src/services/offlineSync.js`, but only if a test exposes a gap.

**Interfaces:**
- Consumes: the `GRANT_SUBJECTS` `membershipMediatedChild` arm (`offlineSync.js:172-211, 384-417`).

- [ ] **Step 1: Write the tests:**
  - A control child's assessment whose class assignment is pending locally gets a 42501, is
    retried, and is not terminal.
  - Once the assignment syncs, the upload succeeds.
  - A server 42501 for a result dated outside every window goes terminal with the existing
    marker.
  - A battery run for a control child behaves the same.
  - A control child's result is never blocked by a missing local delivery row.
- [ ] **Step 2: Run them**
  - Run: `npx jest __tests__/controlChildSync.test.js`
  - Expected: PASS. A failure is a real gap; fix it in `offlineSync.js` under TDD.
- [ ] **Step 3: Commit** with the message `test(sync): control-child assessment upload classification`.

### Task 9: Docs, staging apply, device gate (controller)

- [ ] **Docs.** Update the following, then run
  `git grep -n "only the EA's assigned children" -- CONTEXT.md PRD.md documentation` and expect
  no stale claims:
  - `CONTEXT.md`: add "Control child", and update the ClassDetail note around line 305;
  - ADR-0005: a dated implementation-status note;
  - `documentation/ROADMAP.md`: tick the whole-class visibility item;
  - `PRD.md` access sections;
  - `documentation/build-log.md`;
  - the memory note about `GRANT_SUBJECTS`.
- [ ] **Staging apply (only after Jim's go):**
  - apply the migration with the `sqlite:staging:*` helper;
  - verify `get_reconcile_acknowledgments` returns the new keys;
  - verify that a class-only seed EA can submit (`sqlite-staging-sql` skill, read-only checks).
- [ ] **Device gate, A03 and iPhone:**
  - sign in as a class-assigned EA and see "Rest of the class";
  - assess a control child with the letter test and WelaPLUS (after Plan 3), then sync;
  - verify the rows in staging;
  - end the child's membership in staging, pull, and see the child leave the picker.
