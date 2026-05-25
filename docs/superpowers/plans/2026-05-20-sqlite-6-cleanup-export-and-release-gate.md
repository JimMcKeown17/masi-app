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

- [x] **Step 1: Add export tests**

Contracts:

- export identifies `database: sqlite`
- includes schema version
- includes table counts
- includes failed and terminal outbox rows
- includes sync state
- includes app version/build metadata
- logs export still works

- [x] **Step 2: Implement export**

Keep AsyncStorage log export. Database export should no longer serialize all AsyncStorage keys as the primary database.

Status: `exportDatabase()` now shares SQLite diagnostics from `debugDump()` and `exportLogs()` still shares logger output.

### Task 2: Remove Obsolete Domain Storage Surface

**Files:**
- Modify: `src/utils/storage.js`
- Modify: `package.json` only if dependency removal is safe after Auth/log review

- [x] **Step 1: Remove generic facade**

Remove public `getItem`, `setItem`, `removeItem`, and `STORAGE_KEYS` unless a remaining app surface has a documented reason.

- [x] **Step 2: Confirm allowed AsyncStorage paths**

Run:

```bash
rg "AsyncStorage" src
```

Expected allowed paths:

- `src/services/supabaseClient.js`
- `src/utils/logger.js`
- possibly `src/utils/debugExport.js` for logs metadata only

Status: `rg "AsyncStorage" src` now reports only `src/services/supabaseClient.js` and `src/utils/logger.js`.

- [x] **Step 3: Remove transition columns only after repository reads have moved**

Backend cleanup candidates after the SQLite app is verified:

- drop `classes.academic_year` only after all reads use `classes.academic_year_id`
- drop `children.hidden_at` only after repositories and screens use `children.archived_at`
- keep `classes.teacher` until teacher backfill is complete and screens read `classes.teacher_id`

Status: no backend drop migration in this slice. `children.hidden_at`, `classes.academic_year`, and `classes.teacher` are intentionally retained until the remaining read/backfill contracts are complete.

### Task 3: Documentation Updates

**Files:**
- Modify: `PRD.md`
- Modify: `documentation/LEARNING.md`
- Modify: `documentation/DATABASE_SCHEMA_GUIDE.md`
- Modify: `documentation/sqlite-refactor-log.md`
- Modify: `documentation/sqlite-staging-setup.md`

- [x] **Step 1: Update architecture docs**

Document:

- clean-slate cutover
- SQLite repository layer
- sync outbox
- programme model
- academic years, assessment windows, child class memberships, teachers, assignment levels, and grouping versions
- support export
- backend promotion status

Status: Updated `PRD.md`, `documentation/LEARNING.md`, `documentation/DATABASE_SCHEMA_GUIDE.md`, `documentation/sqlite-staging-setup.md`, and `documentation/sqlite-refactor-log.md`.

### Task 4: Automated Release Gate

**Files:**
- Modify: `package.json`
- Create or update: `jest.integration.config.js`

- [x] **Step 1: Add release scripts**

Add:

```json
{
  "test:integration": "jest --runInBand --config jest.integration.config.js",
  "test:release": "npm test && npm run test:integration && npm run sqlite:staging:check"
}
```

Status: Added `test:integration`, `test:release`, `jest.integration.config.js`, `jest.integration.setup.js`, and `__tests__/releaseGateConfig.test.js`. The integration gate uses a file-backed better-sqlite runtime and runs in band, so it changes a meaningful SQLite variable instead of rerunning a strict subset under the same setup.

- [x] **Step 2: Run gate**

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

Status: tests, migration history, dry run, and whitespace passed. Advisors returned the intentional `multiple_permissive_policies` warnings plus one hosted Auth setting warning: `auth_leaked_password_protection`. This is recorded in the refactor log as a project-setting item to resolve or consciously accept before external field cutover.

### Task 5: Internal Android Validation

**Files:**
- Update: `documentation/sqlite-refactor-log.md`

- [x] **Step 1: Emulator core-path validation**

Run:

```bash
npm run sqlite:staging:android
```

Exercise target:

- fresh sign-in
- first data hydration
- offline launch after cache exists
- clock in, kill app, reopen, clock out
- add child, group, session, assessment offline
- kill/reopen with pending outbox
- come online and sync
- export database and logs
- verify rows in Supabase

Status: deeper Plan 6 emulator validation passed for the core SQLite/outbox path, not every item in the full exercise target. A fresh Expo Go install signed in against `masi-app-sqlite`, hydrated reference/user data, rendered from cache after offline force-stop/reopen, saved an assessment offline, saved a session offline, survived force-stop/reopen with six pending outbox rows, reconnected, synced six rows successfully, and verified the new rows in Supabase. Redacted evidence is in `documentation/android-validation/2026-05-22-plan6-emulator/`.

Limitations: the Android emulator could not complete clock-in/out because Expo Location returned current-location unavailable even after emulator location injection. This must be covered on a physical device. This pass also did not create a new child/group manually; repository and screen tests cover those write paths, but a physical-device exploratory pass should include them if time allows.

Follow-up status: a final emulator retry confirmed Android itself had a mock fused/GPS location, but Expo Location still returned current-location unavailable. `time_entries` row-count verification against `masi-app-sqlite` showed no new synced row from the failed attempt. Treat clock-in/out as a physical-device validation item.

Packaged-build status: the first preview APK was not used because `eas.json` did not yet explicitly pin the preview profile to SQLite staging. The preview profile now sets `EXPO_PUBLIC_SUPABASE_TARGET=sqlite-staging` plus the SQLite staging project id, URL, and publishable key, and `releaseGateConfig.test.js` asserts that pin. Corrected preview APK build `07d1c674-b06e-4d03-a611-4bf17c182a7b` completed, installed on the emulator, and launched to the packaged `org.masinyusane.masi` sign-in screen. Manual sign-in/offline-write verification is user-owned.

- [ ] **Step 2: Physical-device validation**

Use at least one real Android device before testers receive the build if possible. The user's planned iPhone/Expo Go test should also cover sign-in, clock-in/out, and the same offline-write/restart/sync path. Collect support export after offline writes and after successful sync.

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
