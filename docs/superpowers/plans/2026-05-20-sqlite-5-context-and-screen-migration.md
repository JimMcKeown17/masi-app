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

- [ ] **Step 2: Wire contexts**

Use cache-first repository reads. Use `triggerBackgroundSync()` after local writes.

- [x] Initial slice: AuthContext defers profile reads through a request queue; ChildrenContext uses bundled cache-first preload; ClassesContext uses active academic year and delegates class archive side effects to storage/repositories.

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

- [ ] **Step 1: Add behavior tests**

Contracts:

- session save writes attendees
- session queries default to the actor's active programme
- assessment save writes items
- assessment and letter-mastery queries default to the actor's active programme
- official-window assessments require an `assessment_window_id`; ad-hoc progress checks leave it null
- navigation after local save does not wait for network sync
- rankings use normalized session/assessment data correctly

- [ ] **Step 2: Wire screens**

Remove dependence on `sessions.children_ids` and assessment arrays as storage source of truth. UI can still render derived summaries.

Default user-facing session, assessment, letter-mastery, dashboard, and ranking reads are programme-scoped through repository queries. Cross-programme history can be added later as an explicit view/toggle; it is not the default display path.

Create Group must read or create the active `grouping_versions` row for the class/year before writing `groups.grouping_version_id` or `child_group_memberships.grouping_version_id`.

### Task 4: Remove Generic Storage Calls

**Files:**
- Modify: `src/utils/storage.js`
- Modify: direct callers found by search

- [ ] **Step 1: Search**

Run:

```bash
rg "storage\\.(getItem|setItem|removeItem)|STORAGE_KEYS" src __tests__ --glob '!src/utils/storage.js'
```

Expected: no results.

- [ ] **Step 2: Search AsyncStorage**

Run:

```bash
rg "AsyncStorage" src --glob '!src/services/supabaseClient.js' --glob '!src/utils/logger.js' --glob '!src/utils/debugExport.js'
```

Expected: only Auth, logger, and debug export paths remain.

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

- [ ] Update `documentation/sqlite-refactor-log.md`.
- [ ] Request a parallel code-review pass focused on context concurrency, cache preservation, and local-first UX.
- [ ] Get user signoff before Plan 6.
