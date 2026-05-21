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
- `childrenRepository.save(child)` inserts the child, active EA assignment, programme enrollment, active child-class membership when `class_id` is known, and all corresponding outbox rows in one transaction.
- If `class_id` is not known at child creation, the `child_class_memberships` write is deferred until class assignment, and that membership write happens in the same transaction as the `children.class_id` update.
- `childrenRepository.getMyChildren(userId)` returns only children assigned to the user, enrolled in the user's active programme, and joined through the child's active `child_class_memberships` row for current class context.
- `childrenRepository.deleteIfNoHistory(childId)` may hard-delete only no-history children and must route synced remote hard deletes through `delete_child_if_no_history(childId)`.
- `childrenRepository.archiveChild(childId)` sets `children.archived_at` and ends active `child_ea_assignments`, `child_programme_enrollments`, `child_class_memberships`, and `child_group_memberships` in one transaction with matching outbox rows.
- `classesRepository.archiveClass(classId)` ends active `class_ea_assignments` and updates related class/grouping state in the same transaction.
- `classesRepository.deleteClass(classId)` is a storage-facade compatibility alias for archive, not a local hard delete.
- `groupsRepository.archiveGroup(groupId)` sets `groups.archived_at` and ends active `group_ea_assignments` and `child_group_memberships` in one transaction.
- `groupsRepository.deleteGroup(groupId)` is a storage-facade compatibility alias for archive, not a local hard delete.

## Tasks

### Task 1: Shared Repository Utilities

**Files:**
- Create: `src/db/repositories/sqliteRepositoryUtils.js`
- Test: `__tests__/sqliteRepositoryUtils.test.js`

- [x] **Step 1: Add utility tests**

Cover:

- boolean conversion
- JSON encoding/decoding
- sync-status conversion to `synced`
- column allowlist filtering
- upsert by primary key

- [x] **Step 2: Implement utilities**

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
- `insertOutboxRecord`

### Task 2: Reference And Time Repositories

**Files:**
- Create: `src/db/repositories/localStateRepository.js`
- Create: `src/db/repositories/referenceDataRepository.js`
- Create: `src/db/repositories/timeEntriesRepository.js`
- Test: `__tests__/localStateRepository.test.js`
- Test: `__tests__/referenceDataRepository.test.js`
- Test: `__tests__/timeEntriesRepository.test.js`

- [x] **Step 1: Write tests first**

Contracts:

- reference table replacement is all-or-nothing per table
- failed server preload does not wipe existing cache
- active time entry survives repository reload
- time-entry update changes one row and preserves sync metadata

- [x] **Step 2: Implement repositories**

Keep current time tracking surface:

- `getTimeEntries`
- `saveTimeEntry`
- `updateTimeEntry`
- `getUnsyncedRecords('TIME_ENTRIES')`

Reference repositories must include:

- `academicYearsRepository` as pull-only reference data
- `assessmentWindowsRepository` as pull-only reference data
- `teachersRepository` as pull-only current teacher metadata

### Task 3: Domain Repositories

**Files:**
- Create: `src/db/repositories/classesRepository.js`
- Create: `src/db/repositories/childrenRepository.js`
- Create: `src/db/repositories/groupsRepository.js`
- Create: `src/db/repositories/sessionsRepository.js`
- Create: `src/db/repositories/assessmentsRepository.js`
- Create: `src/db/repositories/masteryRepository.js`
- Tests: matching repository tests under `__tests__/`

- [x] **Step 1: Write repository tests**

Required tests:

- class save/update/archive
- class archive ends active class EA assignments in the same transaction
- child save plus active EA/programme assignment in one transaction
- child save while the user has an active assignment to Programme A and the child has Class C produces exactly one `children` row, one `child_ea_assignments` row, one `child_programme_enrollments` row pointing to Programme A, one `child_class_memberships` row pointing to Class C and the active academic year, and the expected `sync_outbox` rows after `withTransaction` resolves
- child save rollback leaves no `children`, `child_ea_assignments`, `child_programme_enrollments`, `child_class_memberships`, or `sync_outbox` rows
- child archive ends active EA, programme, and class memberships in the same transaction
- child delete with no history removes only the child and active relationship rows; child delete with session/assessment/mastery/group or ended assignment history returns false and leaves rows intact
- `getMyChildren(User-1)` excludes a child enrolled only in Programme A when User-1's active `staff_programme_assignments` row points to Programme B
- class-level and group-level assignment repositories preserve `assigned_at`/`unassigned_at` history
- grouping version save enforces one active grouping version per class/year
- group save plus membership operations
- group archive ends active group EA assignments and child group memberships in the same transaction
- session save plus session attendees in one transaction
- assessment save plus assessment items in one transaction
- mastery unique natural key behavior

- [x] **Step 2: Implement repositories**

Use clean table names:

- `child_ea_assignments`
- `class_ea_assignments`
- `group_ea_assignments`
- `grouping_versions`
- `class_grouping_state`
- `child_class_memberships`
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
join child_class_memberships ccm
  on ccm.child_id = children.id
 and ccm.exited_at is null
```

Add repositories for:

- `classEaAssignmentsRepository`
- `groupEaAssignmentsRepository`
- `groupingVersionsRepository`
- `classGroupingStateRepository`
- `childClassMembershipsRepository`

### Task 4: Route Storage Facade

**Files:**
- Modify: `src/utils/storage.js`
- Test: existing storage/context tests

- [x] **Step 1: Replace internals with repository calls**

Keep named methods used by current contexts/screens. Do not preserve generic key-value domain writes.

- [x] **Step 2: Verify no new generic storage callers**

Run:

```bash
rg "storage\\.(getItem|setItem|removeItem)|STORAGE_KEYS" src __tests__ --glob '!src/utils/storage.js'
```

Result: existing context/screen/sanitizer callers remain and are logged for Plan 5 migration. No new generic domain storage callsites should be added.

### Review Gate

- [x] Run:

```bash
npm test -- --runInBand __tests__/localStateRepository.test.js __tests__/referenceDataRepository.test.js __tests__/timeEntriesRepository.test.js
npm test -- --runInBand __tests__/classesRepository.test.js __tests__/childrenRepository.test.js __tests__/groupsRepository.test.js
npm test -- --runInBand __tests__/sessionsRepository.test.js __tests__/assessmentsRepository.test.js __tests__/masteryRepository.test.js
npm test -- --runInBand
git diff --check
```

- [x] Update `documentation/sqlite-refactor-log.md`.
- [ ] Request a parallel code-review pass focused on transaction boundaries and normalized table contracts.
- [ ] Get user signoff before Plan 4.
