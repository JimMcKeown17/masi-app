# SQLite 5 Context And Screen Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire app contexts and screens to the SQLite repositories and outbox-backed sync APIs.

**Architecture:** Contexts hydrate cache first, perform server pulls through serialized request paths, and never wipe visible cached lists on partial pull errors. Screens remain SQL-free and use context/storage facade APIs.

**Tech Stack:** React Context, React Native screens, SQLite repositories, Supabase client.

---

## Tasks

### Task 1: Auth And Startup Pull Discipline

**Files:**
- Modify: `src/context/AuthContext.js`
- Create: `src/services/supabaseRequestQueue.js`
- Test: `__tests__/AuthContext.test.js`
- Test: `__tests__/supabaseRequestQueue.test.js`

- [x] **Step 1: Add tests**

Contracts:

- Supabase database/profile reads do not run inside `onAuthStateChange`
- stale profile fetch cannot update state after sign-out
- queued Supabase preload operations execute one at a time

- [x] **Step 2: Implement deferred auth reads and request queue**

Keep Supabase Auth session storage in AsyncStorage.

### Task 2: Children And Classes Contexts

**Files:**
- Modify: `src/context/ChildrenContext.js`
- Modify: `src/context/ClassesContext.js`
- Test: `__tests__/ChildrenContext.test.js`
- Test: `__tests__/ClassesContext.test.js`

- [ ] **Step 1: Add tests for Zazi-derived bugs**

Contracts:

- ChildrenContext does not perform three full server pulls on mount
- partial server pull failure does not replace cached children/groups/classes with empty arrays
- group delete removes memberships through per-row adapter
- class delete does not double-write child updates
- child/class/group archive screens call repository archive methods, not hard delete, when there is any history
- archive flows remove records from active working lists by ending assignments/enrollments in the same local transaction
- My Children derives current class through active `child_class_memberships`, not only `children.class_id`
- Create Class automatically uses the active `academic_years` row for `classes.academic_year_id`
- class roster screens respect `class_grouping_state.class_list_status`

- [x] Initial slice: added tests for one bundled child-data preload, partial preload cache preservation, active academic year on class create, and no double-write child updates on class archive/delete.
- [x] Corrective slice: added tests for stale sign-out profile loads, repository-backed child delete/archive, removed group memberships, sign-out state clearing, and atomic clean-slate child creation.
- [x] Review-corrective slice: startup reference-data producer now runs before child providers can hydrate; successful pulls drop synced absent child/group/class rows while preserving dirty local work.
- [ ] Deferred follow-up: make `getChildrenInClass` derive class membership from active `child_class_memberships` instead of the `children.class_id` fast pointer.
- [ ] Deferred follow-up: implement `class_grouping_state.class_list_status` UI gating for roster/grouping screens.

- [x] **Step 2: Wire contexts**

Use cache-first repository reads. Use `triggerBackgroundSync()` after local writes.

- [x] Initial slice: AuthContext defers profile reads through a request queue; ChildrenContext uses bundled cache-first preload; ClassesContext uses active academic year and delegates class archive side effects to storage/repositories.
- [x] Cleanup slice: ChildrenContext and ClassesContext no longer call generic `storage.setItem`/`STORAGE_KEYS` cache writes; server pull rows are saved through typed repository-backed storage methods.
- [x] Corrective slice: ChildrenContext uses programme-scoped `getMyChildren`, clears on sign-out, filters removed memberships, and calls atomic `createChild`; ClassesContext scopes class reads/pulls by active programme and clears state on sign-out.

### Task 3: Sessions, Assessments, Time, And Rankings Screens

**Files:**
- Modify: `src/hooks/useTimeTracking.js`
- Modify: `src/screens/sessions/*.js`
- Modify: `src/screens/assessments/*.js`
- Modify: `src/screens/insights/*.js`
- Modify: `src/utils/dashboardStats.js`
- Test: matching screen/helper tests

- [x] **Step 0: Enumerate every screen-level storage caller**

Run:

```bash
rg "storage\\." src/screens src/hooks src/components
```

Save the output to `documentation/sqlite-refactor-log.md` before editing screens. Add every caller to the migration list. Do not infer from filenames; the grep output is the source of truth for this task.

- [x] **Step 1: Add behavior tests**

Contracts:

- session save writes attendees
- session queries default to the actor's active programme
- assessment save writes items
- assessment and letter-mastery queries default to the actor's active programme
- official-window assessments require an `assessment_window_id`; ad-hoc progress checks leave it null
- navigation after local save does not wait for network sync
- rankings use normalized session/assessment data correctly

- [x] Initial assessment slice: added tests for assessment history and assessment save repository paths.
- [x] Corrective slice: added tests for active-programme repository scoping, no active-programme write rejection, class programme scoping, tracker programme scoping, and stale legacy fallback removal.

- [x] **Step 2: Wire screens**

Remove dependence on `sessions.children_ids` and assessment arrays as storage source of truth. UI can still render derived summaries.

Default user-facing session, assessment, letter-mastery, dashboard, and ranking reads are programme-scoped through repository queries. Cross-programme history can be added later as an explicit view/toggle; it is not the default display path.

Create Group must read or create the active `grouping_versions` row for the class/year before writing `groups.grouping_version_id` or `child_group_memberships.grouping_version_id`.

- [x] Initial time-tracking slice: `useTimeTracking` now writes through `timeEntriesRepository` and triggers background sync after local writes; `TimeEntriesListScreen` reads completed work history from SQLite and no longer performs screen-owned Supabase/storage merges.
- [x] Initial session slice: `SessionHistoryScreen` now reads from `sessionsRepository`; `LiteracySessionForm` saves session + tracker changes through a transaction-backed persistence helper; `LetterTrackerBottomSheet` reads assessments/mastery from repositories.
- [x] Initial assessment/dashboard/ranking slice: assessment history/save, assessment child selection, child summary, letter tracker, tab stats, home stats, and ranking screens now call repositories directly; screen/hook/component `storage.` grep is clean.
- [x] Corrective slice: default user-facing session, assessment, mastery, group, class, dashboard, ranking, and tracker reads now pass the current user so repository results are active-programme-scoped.
- [x] Review-corrective slice: assessment and letter-tracker writes now surface local write failures and keep users on-screen with retry paths; history/work screens refresh on focus; Home days-worked reads user-scoped time entries.

### Task 4: Remove Generic Storage Calls

**Files:**
- Modify: `src/utils/storage.js`
- Modify: direct callers found by search

- [x] **Step 1: Search**

Run:

```bash
rg "storage\\.(getItem|setItem|removeItem)|STORAGE_KEYS" src __tests__ --glob '!src/utils/storage.js'
```

Expected: no results.

- [x] Verified no results outside `src/utils/storage.js`.

- [ ] **Step 2: Search AsyncStorage**

Run:

```bash
rg "AsyncStorage" src --glob '!src/services/supabaseClient.js' --glob '!src/utils/logger.js' --glob '!src/utils/debugExport.js'
```

Expected: only Auth, logger, and debug export paths remain.

Result: direct `AsyncStorage` is now centralized in `src/utils/storage.js` plus the Supabase auth storage boundary, logger, and debug export. Removing the remaining storage facade/profile fallback is deferred to Plan 6 so Plan 5 does not destabilize auth/session startup while screens and contexts are being migrated.

### Review Gate

- [ ] Run:

```bash
npm test -- --runInBand __tests__/AuthContext.test.js __tests__/ChildrenContext.test.js __tests__/ClassesContext.test.js
npm test -- --runInBand
git diff --check
```

- [ ] Run Android emulator flow:

```bash
npm run sqlite:staging:android
```

Exercise sign-in, class load, child load, group save, session save, assessment save, app kill/reopen.

Partial result: Android staging launches on `Medium_Phone_API_28` after `adb reverse tcp:8082 tcp:8082` and manual reload; unauthenticated sign-in screen renders against `masi-app-sqlite`. Full signed-in create/session/assessment flow is blocked until a staging test user is available.

Corrective review verification:

- `npm test -- --runInBand` passed 44 suites / 197 tests after the programme scoping, delete/archive, stale-auth, removed-membership, class archive, and child-create fixes.
- `git diff --check` passed.
- Android signed-in validation reached the Home screen against `masi-app-sqlite` after seeding a staging test profile and assignment.
- Supabase auth lock warnings observed during Android validation were fixed by aligning `@supabase/supabase-js` to Zazi's `2.100.1`, using a singleton Supabase client/AppState listener, relying on `INITIAL_SESSION` instead of duplicate `getSession()` startup, and queueing startup reference-data reads.
- Fresh Android logcat stayed quiet for 35 seconds after Metro restart: no Supabase auth lock warnings and no React Native errors.
- Final full suite after the Android auth-lock fix passed 44 suites / 199 tests; `git diff --check` passed.
- Review-corrective targeted suite passed 11 suites / 48 tests:

```bash
npm test -- --runInBand __tests__/offlineSyncOutbox.test.js __tests__/referenceDataRepository.test.js __tests__/AuthContext.test.js __tests__/ChildrenContext.test.js __tests__/ClassesContext.plan5.test.js __tests__/LetterAssessmentScreen.plan5.test.js __tests__/LetterTrackerScreen.plan5.test.js __tests__/timeEntriesRepository.test.js __tests__/SessionHistoryScreen.plan5.test.js __tests__/AssessmentHistoryScreen.plan5.test.js __tests__/TimeEntriesListScreen.plan5.test.js
```

- Android smoke found three device/server-contract gaps after the 11-suite review pass: mobile-created classes lacked a `class_ea_assignments` producer row, session/assessment child rows used composite local ids where Supabase requires UUIDs, and session parent upsert RLS needed direct owner SELECT visibility before attendees exist.
- Class producer fix: `classesRepository.saveClass` now creates/enqueues the same-transaction `class_ea_assignments` row and `ClassesContext.addClass` resolves the active programme before save; `__tests__/classesRepository.test.js` covers the contract.
- Sync contract fixes: `session_attendees` and `assessment_items` now use deterministic UUID ids, older composite payloads are sanitized before push, and `20260522103000_masi_session_upsert_visibility.sql` has been pushed to `masi-app-sqlite`.
- Reference data queue fix: `ReferenceDataRepository` now writes through `runRepositoryTransaction`; the regression test reproduced the Android `database is locked` class before the fix.
- Follow-up H1 fix: server-pulled child/class relationship rows are now persisted as synced local rows. `pullPreloadedChildData` returns child EA assignments, child programme enrollments, child class memberships, and referenced classes; `ClassesContext` persists pulled `class_ea_assignments`. These rows do not enqueue outbox work.
- Follow-up M1/L1/L2/V1 fixes: `staff_programme_assignments` uses scoped replace on authenticated pulls, deterministic session-attendee/assessment-item ids use shared helpers, successful server merges preserve terminal rows, and class archive now enqueues full child update payloads.
- Low-priority L3 test-quality cleanup from the follow-up brief is not broadened in this slice; the new coverage targets the actual producer/consumer and sync contracts rather than rewriting older mocked context tests.
- Expanded corrective suite passed 16 suites / 83 tests:

```bash
npm test -- --runInBand __tests__/offlineSyncOutbox.test.js __tests__/referenceDataRepository.test.js __tests__/offlineSync.stripping.test.js __tests__/sessionsRepository.test.js __tests__/assessmentsRepository.test.js __tests__/sqlitePlan1Migrations.test.js __tests__/AuthContext.test.js __tests__/ChildrenContext.test.js __tests__/ClassesContext.plan5.test.js __tests__/LetterAssessmentScreen.plan5.test.js __tests__/LetterTrackerScreen.plan5.test.js __tests__/timeEntriesRepository.test.js __tests__/SessionHistoryScreen.plan5.test.js __tests__/AssessmentHistoryScreen.plan5.test.js __tests__/TimeEntriesListScreen.plan5.test.js __tests__/classesRepository.test.js
```

- Follow-up corrective suite passed 8 suites / 56 tests:

```bash
npm test -- --runInBand __tests__/preloadedChildData.test.js __tests__/ChildrenContext.test.js __tests__/ClassesContext.plan5.test.js __tests__/childrenRepository.test.js __tests__/classesRepository.test.js __tests__/referenceDataRepository.test.js __tests__/offlineSync.stripping.test.js __tests__/offlineSyncOutbox.test.js
```

- Final full suite after the follow-up fixes passed 46 suites / 219 tests; `git diff --check` passed.
- Full signed-in Android create/session/assessment/kill-reopen smoke passed after the fixes: fresh post-fix session and assessment writes synced successfully, and app kill/reopen produced no `database is locked` or React Native errors. The emulator still has two failed sync items from pre-fix smoke rows, which are tracked as local residue rather than a fresh failure.

- [x] Update `documentation/sqlite-refactor-log.md`.
- [ ] Request a parallel code-review pass focused on context concurrency, cache preservation, and local-first UX.
- [ ] Get user signoff before Plan 6.
