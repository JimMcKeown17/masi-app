# SQLite 4 Sync Engine Outbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AsyncStorage-style `synced:false` scanning with durable SQLite outbox sync.

**Architecture:** Domain repositories enqueue sync operations in SQLite. `offlineSync.js` processes ready outbox rows in dependency order, updates domain row sync state and outbox state atomically, and leaves terminal failures visible.

**Tech Stack:** SQLite `sync_outbox`, Supabase client, Jest sync tests.

---

## Tasks

### Task 1: Sync State And Outbox Repositories

**Files:**
- Create: `src/db/repositories/syncStateRepository.js`
- Create: `src/db/repositories/syncOutboxRepository.js`
- Test: `__tests__/syncOutboxRepository.test.js`

- [ ] **Step 1: Write outbox tests**

Contracts:

- enqueue is idempotent by table and record
- retry attempts persist across restart
- `next_retry_at` controls readiness
- failed and terminal rows appear in failed item output
- `in_flight` rows do not inflate visible unsynced counts by themselves

- [ ] **Step 2: Implement repositories**

Operations:

- `insert`
- `update`
- `archive`
- `hard_delete`
- `restore`

Statuses:

- `pending`
- `in_flight`
- `failed`
- `terminal`

### Task 2: Rewrite Offline Sync

**Files:**
- Modify: `src/services/offlineSync.js`
- Test: `__tests__/offlineSyncOutbox.test.js`

- [ ] **Step 0: Delete obsolete orphan repair**

Delete `repairOrphanedJunctions` from `src/services/offlineSync.js`. It was a one-time repair path for historical AsyncStorage/junction bugs and is not applicable to the clean-slate SQLite backend.

- [ ] **Step 1: Write sync behavior tests**

Required tests:

- parent-before-child order
- dependency skip when parent fails
- `23505` equivalent success only when configured as safe
- `23503` terminal failure remains failed
- `42501` terminal failure remains failed
- network error schedules retry without sleeping the whole sync loop
- successful finalization marks domain row synced and deletes outbox row in one transaction

- [ ] **Step 2: Implement outbox processing**

Push order:

1. `TIME_ENTRIES`
2. `CLASSES`
3. `CHILDREN`
4. `CHILD_EA_ASSIGNMENTS`
5. `CHILD_PROGRAMME_ENROLLMENTS`
6. `GROUPS`
7. `CHILD_GROUP_MEMBERSHIPS`
8. `SESSIONS`
9. `SESSION_ATTENDEES`
10. `ASSESSMENTS`
11. `ASSESSMENT_ITEMS`
12. `LETTER_MASTERY`

### Task 3: Offline Context API

**Files:**
- Modify: `src/context/OfflineContext.js`
- Test: `__tests__/OfflineContext.test.js`

- [ ] **Step 1: Add tests**

Contracts:

- `triggerBackgroundSync()` is debounced and non-blocking
- `syncNow()` waits for the active sync
- concurrent manual sync calls share one in-flight promise
- write paths can refresh local status without waiting for network upload

- [ ] **Step 2: Implement API**

Expose:

- `triggerBackgroundSync`
- `syncNow`
- `refreshSyncStatus`
- `syncStatus`
- `unsyncedCount`
- `lastSyncResult`

### Review Gate

- [ ] Run:

```bash
npm test -- --runInBand __tests__/syncOutboxRepository.test.js __tests__/offlineSyncOutbox.test.js __tests__/OfflineContext.test.js
npm test -- --runInBand
git diff --check
```

- [ ] Run emulator smoke test with one forced offline write and restart.
- [ ] Update `documentation/sqlite-refactor-log.md`.
- [ ] Request a parallel code-review pass focused on failure semantics and atomic finalization.
- [ ] Get user signoff before Plan 5.
