# SQLite 2 Foundation And Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SQLite, migration infrastructure, and the clean local/server schema without wiring app screens to it yet.

**Architecture:** Initialize `expo-sqlite` behind `src/db/client.js`, serialize write transactions, keep `PRAGMA user_version` outside transactions, and create the normalized clean-slate local schema.

**Tech Stack:** Expo SQLite, Jest, `better-sqlite3`, Supabase migrations.

---

## Tasks

### Task 1: Install SQLite Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Install packages**

Use npm for this refactor:

```bash
npx expo install expo-sqlite
npm install --save-dev better-sqlite3 dotenv
```

- [x] **Step 2: Verify package diff**

Run:

```bash
npm test -- --runInBand
git diff -- package.json package-lock.json
```

Expected: tests still pass before SQLite is used.

### Task 2: Add SQLite Client

**Files:**
- Create: `src/db/client.js`
- Create: `__tests__/sqliteFoundation.test.js`
- Create: `test-support/expoSQLiteMock.js`

- [x] **Step 1: Write failing transaction serialization test**

Test contract:

- open transaction A
- start transaction B
- prove B does not enter until A finishes

Run:

```bash
npm test -- --runInBand __tests__/sqliteFoundation.test.js
```

Expected: fails because `src/db/client.js` does not exist.

- [x] **Step 2: Implement client**

`src/db/client.js` exports:

- `DATABASE_NAME = 'masi.db'`
- `initializeDatabase`
- `getDatabase`
- `withTransaction`
- `resetDatabaseConnectionForTests`

`withTransaction` must queue app-level write transactions.

### Task 3: Add Migration Runner And Schema

**Files:**
- Create: `src/db/migrations.js`
- Update: `__tests__/sqliteFoundation.test.js`

- [x] **Step 1: Write migration tests**

Tests must prove:

- migrations are idempotent
- `PRAGMA user_version` changes after migration
- `PRAGMA user_version` is verified through the `better-sqlite3` integration harness, not only the Expo SQLite Jest mock
- transaction rollback works
- `sync_outbox` exists
- all clean-slate domain tables exist
- the local mirror includes the Zazi-alignment schema added in Plan 1: 25 server-backed tables total before local-only foundation tables

- [x] **Step 2: Implement migrations**

Local tables:

- `schema_migrations`
- `local_state`
- `sync_state`
- `sync_outbox`
- `schools`
- `job_titles`
- `programmes`
- `staff_programme_assignments`
- `assessment_tools`
- `academic_years`
- `assessment_windows`
- `teachers`
- `classes`
- `children`
- `child_ea_assignments`
- `child_programme_enrollments`
- `class_ea_assignments`
- `group_ea_assignments`
- `grouping_versions`
- `class_grouping_state`
- `child_class_memberships`
- `groups`
- `child_group_memberships`
- `time_entries`
- `sessions`
- `session_attendees`
- `assessments`
- `assessment_items`
- `letter_mastery`

Migration rule:

- migration SQL runs in a transaction
- migration history insert runs in that transaction
- `PRAGMA user_version = n` runs after commit

Mirror these server-column additions locally:

- `classes.academic_year_id`, `classes.teacher_id`, and archive metadata
- `children.archived_at`, `children.archived_by_user_id`, `children.archive_reason`; keep `hidden_at` only as a transition column
- `groups.grouping_version_id`, `groups.display_number`, and archive metadata
- `child_group_memberships.grouping_version_id`
- `assessments.assessment_window_id`, `assessment_purpose`, `grade_snapshot`, `teacher_name_snapshot`
- `session_attendees.grade_snapshot`
- `letter_mastery.deleted_at` with partial active uniqueness

### Task 4: Add Debug Dump Foundation

**Files:**
- Create: `src/db/debugDump.js`
- Update: `__tests__/sqliteFoundation.test.js`

- [x] **Step 1: Implement schema/table-count dump**

`debugDump` returns:

```javascript
{
  database: 'sqlite',
  schemaVersion: number,
  migrations: [],
  tableCounts: {},
  generatedAt: string
}
```

### Review Gate

- [x] Run:

```bash
npm test -- --runInBand __tests__/sqliteFoundation.test.js
npm test -- --runInBand
git diff --check
```

- [ ] Run one emulator launch against SQLite staging before repositories are added:

```bash
npm run sqlite:staging:android
```

Expected: app still launches and no SQLite initialization redbox appears.

Attempted on 2026-05-21. Sandbox run failed before Metro with `ERR_SOCKET_BAD_PORT`;
rerun outside the sandbox started Metro but exited because no Android device/emulator
was available. This gate remains open for a local emulator or real-device pass.

- [x] Update `documentation/sqlite-refactor-log.md`.
- [x] Request a parallel code-review pass focused on SQLite transaction semantics, real-SQLite PRAGMA behavior, and migration behavior.
- [ ] Get user signoff before Plan 3.
