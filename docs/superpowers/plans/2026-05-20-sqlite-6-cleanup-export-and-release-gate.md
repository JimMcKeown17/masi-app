# SQLite 6 Cleanup Export And Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the clean-slate SQLite migration with support export, documentation, automated release checks, and internal Android validation.

**Architecture:** Remove old domain storage paths, make support export reflect SQLite state, keep logs useful, and promote the new backend only after tests and device validation pass.

**Tech Stack:** SQLite debug dump, Expo Sharing/FileSystem, Jest, Android emulator/device, Supabase advisors.

---

## Tasks

### Task 1: SQLite Support Export

**Files:**
- Modify: `src/db/debugDump.js`
- Modify: `src/utils/debugExport.js`
- Test: `__tests__/debugExport.test.js`

- [ ] **Step 1: Add export tests**

Contracts:

- export identifies `database: sqlite`
- includes schema version
- includes table counts
- includes failed and terminal outbox rows
- includes sync state
- includes app version/build metadata
- logs export still works

- [ ] **Step 2: Implement export**

Keep AsyncStorage log export. Database export should no longer serialize all AsyncStorage keys as the primary database.

### Task 2: Remove Obsolete Domain Storage Surface

**Files:**
- Modify: `src/utils/storage.js`
- Modify: `package.json` only if dependency removal is safe after Auth/log review

- [ ] **Step 1: Remove generic facade**

Remove public `getItem`, `setItem`, `removeItem`, and `STORAGE_KEYS` unless a remaining app surface has a documented reason.

- [ ] **Step 2: Confirm allowed AsyncStorage paths**

Run:

```bash
rg "AsyncStorage" src
```

Expected allowed paths:

- `src/services/supabaseClient.js`
- `src/utils/logger.js`
- possibly `src/utils/debugExport.js` for logs metadata only

### Task 3: Documentation Updates

**Files:**
- Modify: `PRD.md`
- Modify: `documentation/LEARNING.md`
- Modify: `documentation/DATABASE_SCHEMA_GUIDE.md`
- Modify: `documentation/sqlite-refactor-log.md`
- Modify: `documentation/sqlite-staging-setup.md`

- [ ] **Step 1: Update architecture docs**

Document:

- clean-slate cutover
- SQLite repository layer
- sync outbox
- programme model
- support export
- backend promotion status

### Task 4: Automated Release Gate

**Files:**
- Modify: `package.json`
- Create or update: `jest.integration.config.js`

- [ ] **Step 1: Add release scripts**

Add:

```json
{
  "test:integration": "jest --config jest.integration.config.js",
  "test:release": "npm test && npm run test:integration && npm run sqlite:staging:check"
}
```

- [ ] **Step 2: Run gate**

Run:

```bash
npm run test:release
npm run sqlite:staging:migrations
npm run sqlite:staging:dry-run
npm run sqlite:staging:advisors
git diff --check
```

Expected:

- no test failures
- no unexpected pending migrations
- no Supabase security advisor warnings

### Task 5: Internal Android Validation

**Files:**
- Update: `documentation/sqlite-refactor-log.md`

- [ ] **Step 1: Emulator validation**

Run:

```bash
npm run sqlite:staging:android
```

Exercise:

- fresh sign-in
- first data hydration
- offline launch after cache exists
- clock in, kill app, reopen, clock out
- add child, group, session, assessment offline
- kill/reopen with pending outbox
- come online and sync
- export database and logs
- verify rows in Supabase

- [ ] **Step 2: Low-end Android validation**

Use at least one real Android device before testers receive the build. Collect support export after offline writes and after successful sync.

### Task 6: Cutover Communication Gate

**Files:**
- Update: `documentation/sqlite-refactor-log.md`

- [ ] **Step 1: Confirm internal validation passed**

Plan 6 Task 5 must be complete and recorded in `documentation/sqlite-refactor-log.md`.

- [ ] **Step 2: User notification gate**

The user confirms in `documentation/sqlite-refactor-log.md` that field staff have been notified at least one day before the new build is distributed.

- [ ] **Step 3: Distribute new build**

Only after internal validation and user notification are logged, push the new build through TestFlight, Play internal track, or OTA. Log the build version and timestamp.

### Review Gate

- [ ] Request final parallel code-review pass focused on release readiness, supportability, and data-loss risk.
- [ ] Update `documentation/sqlite-refactor-log.md` with every command and device check.
- [ ] Ask user for merge/build approval.
