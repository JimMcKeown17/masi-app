# SQLite 3 Repositories And Storage Facade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build repositories for every local table and route `src/utils/storage.js` through SQLite without changing UI behavior yet.

**Architecture:** Repositories own SQL and transactions; `storage.js` becomes a temporary named-method facade. No generic `getItem`, `setItem`, or `removeItem` calls should be added.

**Tech Stack:** SQLite repositories, Jest, React Native app storage facade.

---

## Mandatory Repository Contracts

- Parent row plus child rows are saved in one transaction.
- Domain write plus outbox enqueue happen in one transaction when sync is required.
- Delete/archive enqueue plus local mutation happen in one transaction.
- Repository methods accept an optional transaction object for nested writes.
- Repository outputs should be screen-ready, but local storage remains normalized.
- `childrenRepository.save(child)` inserts the child, active EA assignment, programme enrollment, and three outbox rows in one transaction.
- `childrenRepository.getMyChildren(userId)` returns only children assigned to the user and enrolled in the user's active programme.

## Tasks

### Task 1: Shared Repository Utilities

**Files:**
- Create: `src/db/repositories/sqliteRepositoryUtils.js`
- Test: `__tests__/sqliteRepositoryUtils.test.js`

- [ ] **Step 1: Add utility tests**

Cover:

- boolean conversion
- JSON encoding/decoding
- sync-status conversion to `synced`
- column allowlist filtering
- upsert by primary key

- [ ] **Step 2: Implement utilities**

Export:

- `timestamp`
- `toBoolean`
- `toSyncedFlag`
- `encodeJson`
- `decodeJson`
- `upsertRecord`
- `replaceAllRecords`
- `setRecordSyncStatus`
- `setRecordLastSyncError`

### Task 2: Reference And Time Repositories

**Files:**
- Create: `src/db/repositories/localStateRepository.js`
- Create: `src/db/repositories/referenceDataRepository.js`
- Create: `src/db/repositories/timeEntriesRepository.js`
- Test: `__tests__/localStateRepository.test.js`
- Test: `__tests__/referenceDataRepository.test.js`
- Test: `__tests__/timeEntriesRepository.test.js`

- [ ] **Step 1: Write tests first**

Contracts:

- reference table replacement is all-or-nothing per table
- failed server preload does not wipe existing cache
- active time entry survives repository reload
- time-entry update changes one row and preserves sync metadata

- [ ] **Step 2: Implement repositories**

Keep current time tracking surface:

- `getTimeEntries`
- `saveTimeEntry`
- `updateTimeEntry`
- `getUnsyncedRecords('TIME_ENTRIES')`

### Task 3: Domain Repositories

**Files:**
- Create: `src/db/repositories/classesRepository.js`
- Create: `src/db/repositories/childrenRepository.js`
- Create: `src/db/repositories/groupsRepository.js`
- Create: `src/db/repositories/sessionsRepository.js`
- Create: `src/db/repositories/assessmentsRepository.js`
- Create: `src/db/repositories/masteryRepository.js`
- Tests: matching repository tests under `__tests__/`

- [ ] **Step 1: Write repository tests**

Required tests:

- class save/update/archive
- child save plus active EA/programme assignment in one transaction
- child save while the user has an active assignment to Programme A produces exactly one `children` row, one `child_ea_assignments` row, one `child_programme_enrollments` row pointing to Programme A, and three `sync_outbox` rows after `withTransaction` resolves
- child save rollback leaves no `children`, `child_ea_assignments`, `child_programme_enrollments`, or `sync_outbox` rows
- `getMyChildren(User-1)` excludes a child enrolled only in Programme A when User-1's active `staff_programme_assignments` row points to Programme B
- group save plus membership operations
- session save plus session attendees in one transaction
- assessment save plus assessment items in one transaction
- mastery unique natural key behavior

- [ ] **Step 2: Implement repositories**

Use clean table names:

- `child_ea_assignments`
- `child_group_memberships`
- `session_attendees`
- `assessment_items`

Implement `childrenRepository.save(child)` so it derives the programme from the actor's active `staff_programme_assignments`, not from `job_titles` and not from the child's existing enrollment list.

Implement `childrenRepository.getMyChildren(userId)` with both joins:

```sql
join child_ea_assignments cea
  on cea.child_id = children.id
 and cea.user_id = :userId
 and cea.unassigned_at is null
join staff_programme_assignments spa
  on spa.user_id = :userId
 and spa.ended_at is null
join child_programme_enrollments cpe
  on cpe.child_id = children.id
 and cpe.programme_id = spa.programme_id
 and cpe.ended_at is null
```

### Task 4: Route Storage Facade

**Files:**
- Modify: `src/utils/storage.js`
- Test: existing storage/context tests

- [ ] **Step 1: Replace internals with repository calls**

Keep named methods used by current contexts/screens. Do not preserve generic key-value domain writes.

- [ ] **Step 2: Verify no new generic storage callers**

Run:

```bash
rg "storage\\.(getItem|setItem|removeItem)|STORAGE_KEYS" src __tests__ --glob '!src/utils/storage.js'
```

Expected: no results, or only results already scheduled for Plan 5 screen migration.

### Review Gate

- [ ] Run:

```bash
npm test -- --runInBand __tests__/localStateRepository.test.js __tests__/referenceDataRepository.test.js __tests__/timeEntriesRepository.test.js
npm test -- --runInBand __tests__/classesRepository.test.js __tests__/childrenRepository.test.js __tests__/groupsRepository.test.js
npm test -- --runInBand __tests__/sessionsRepository.test.js __tests__/assessmentsRepository.test.js __tests__/masteryRepository.test.js
npm test -- --runInBand
git diff --check
```

- [ ] Update `documentation/sqlite-refactor-log.md`.
- [ ] Request a parallel code-review pass focused on transaction boundaries and normalized table contracts.
- [ ] Get user signoff before Plan 4.
