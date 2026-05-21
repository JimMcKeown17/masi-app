# Plan 3 Review Brief — 2026-05-21

This brief captures findings from the Plan 3 review pass. Three issues are **critical** (would cause real sync bugs in Plan 4 or later) and must land as TDD-shaped corrective work before Plan 4 starts. Smaller code-smell and test-gap items follow.

Treat this as the same kind of brief as the Plan 1 and Plan 2 review findings — write a failing test first, implement the smallest fix, log decisions/bugs/verifications in `documentation/sqlite-refactor-log.md`, request another parallel review pass, then ask for user signoff before Plan 4.

---

## Critical Issue 1 — Deterministic relationship IDs lose history on handover/rejoin

### Problem

`childrenRepository.js:88-161` derives deterministic IDs for the three relationship rows it creates inside `save(child)`:

```javascript
// child_ea_assignments
id: `${child.id}:${actorUserId}`

// child_programme_enrollments
id: `${child.id}:${programmeId}`

// child_class_memberships
id: `${child.id}:${child.class_id}:${activeYear.id}`
```

These IDs are stable for "same EA creates same child twice" idempotency, which is good. But they break the "handover then rejoin" path:

1. EA-A creates Child-1 → row `{id: 'child-1:EA-A', unassigned_at: null}`
2. EA-A is unassigned for handover → row `{id: 'child-1:EA-A', unassigned_at: 'T1'}`
3. EA-A is later reassigned → repository calls `upsertDomainRecord` with `{id: 'child-1:EA-A', unassigned_at: null}` → **the upsert overwrites the historical row's `unassigned_at` back to null**

The handover history is silently erased. Same shape applies to `child_programme_enrollments` and `child_class_memberships`.

### Why this matters

Plan 2's partial unique indexes (`idx_*_active_unique`) already prevent two simultaneous active rows, so the schema invariant is safe at any single point in time. But the **history of past assignments** is lost. Year-over-year reporting, handover audit trails, and the "who worked with this child when" question all depend on those ended rows surviving.

### Fix shape

Generate a fresh UUID for new relationship rows. Use a pre-insert lookup against the active row index for idempotency:

```javascript
const existingActive = await txn.getFirstAsync(
  `select id from child_ea_assignments
   where user_id = ? and child_id = ? and unassigned_at is null`,
  actorUserId, child.id
);

if (existingActive) {
  // Idempotent re-save: no new row, no new outbox enqueue
} else {
  const assignmentId = randomUUID();  // fresh, not derived
  await upsertDomainRecord(txn, {...}, { id: assignmentId, ... });
  await enqueueDomainOutbox(txn, 'child_ea_assignments', assignmentId, 'insert', ...);
}
```

Repeat for `child_programme_enrollments` and `child_class_memberships`.

The outbox row IDs can stay deterministic (`outboxId(tableName, recordId, operation)`) — those are meant to dedupe enqueues, and the recordId being a fresh UUID keeps them unique per row.

### Failing test contract (write first)

In `__tests__/childrenRepository.test.js`:

```
test('re-assigning the same EA after handover preserves the historical assignment row', async () => {
  // 1. Save child with EA-A → one active assignment row
  // 2. End that assignment (deleteStaffChild)
  // 3. Save again with EA-A as actor → expect TWO assignment rows:
  //    - the original with unassigned_at set
  //    - a new one with unassigned_at null
  // 4. Assert their IDs are different
  // 5. Assert sync_outbox has insert rows for both assignment IDs
});
```

Add the symmetric test for `child_programme_enrollments` and `child_class_memberships`.

---

## Critical Issue 2 — `archiveChild` does not end `child_group_memberships`

### Problem

`childrenRepository.js:305-309` lists three relationship tables to end on archive:

```javascript
const relationshipUpdates = [
  ['child_ea_assignments', 'unassigned_at', 'child_id'],
  ['child_programme_enrollments', 'ended_at', 'child_id'],
  ['child_class_memberships', 'exited_at', 'child_id'],
];
// child_group_memberships is missing
```

But `deleteIfNoHistory` at line 338 explicitly checks `child_group_memberships` as a history table:

```javascript
"select 1 from child_group_memberships where child_id = ? limit 1",
```

So the contract is inconsistent: archiving a child does not remove them from active groups, while deleting a child requires them to not be in any group. The result is that archived children appear in active group rosters with `archived_at IS NOT NULL`.

### Fix shape

Add the row to the `relationshipUpdates` array:

```javascript
const relationshipUpdates = [
  ['child_ea_assignments', 'unassigned_at', 'child_id'],
  ['child_programme_enrollments', 'ended_at', 'child_id'],
  ['child_class_memberships', 'exited_at', 'child_id'],
  ['child_group_memberships', 'removed_at', 'child_id'],
];
```

Update the Plan 3 spec contract at `docs/superpowers/plans/2026-05-20-sqlite-3-repositories-and-storage-facade.md:24` to include `child_group_memberships` in the list of relationships ended on archive.

### Failing test contract (write first)

In `__tests__/childrenRepository.test.js`, extend the archive test:

```
test('archive ends active group memberships in the same transaction', async () => {
  // 1. seedCoreData, save child
  // 2. Insert an active child_group_memberships row pointing at child-1
  // 3. archiveChild(child-1)
  // 4. Assert child_group_memberships.removed_at is set to archivedAt
  // 5. Assert sync_outbox has an 'archive' row for that membership
});
```

---

## Critical Issue 3 — `deleteClass` / `deleteGroup` create sync orphans

### Problem

`classesRepository.js:66-69` and `groupsRepository.js:96-99` both implement local-only hard deletes with no outbox enqueue:

```javascript
const deleteClass = async (id, { transaction } = {}) => runWrite(transaction, async (txn) => {
  await txn.runAsync('delete from classes where id = ?', id);
  return true;
});
```

If the row was already synced, the server still has it. The sync engine has no signal to push the deletion. The class/group is effectively undeletable from the server through the mobile app.

### Why this matters

This breaks the "everything observable on the device is reflected on the server" invariant the sync engine depends on. Worse, because `classes` and `groups` are referenced by `class_ea_assignments`, `group_ea_assignments`, `sessions.class_id`, and `groups.class_id`, a local-only delete creates dangling FKs in the local DB if foreign keys were off (they are on, per migration 2.foreign_keys=ON), so the delete itself will fail at the local level for any class/group with dependents. Which means in practice `deleteClass` and `deleteGroup` only succeed for orphan rows — a quiet inconsistency with the documented behavior.

### Fix shape

Pick one of two approaches:

**Option A — make delete methods alias archive (simpler, recommended):**

```javascript
const deleteClass = async (id, options = {}) => archiveClass(id, options);
```

This preserves the storage facade's public API but routes through the archive path, which already enqueues outbox rows correctly.

**Option B — implement a proper hard-delete-if-no-history path:**

Mirror `childrenRepository.deleteIfNoHistory` semantics:
1. Check for dependent rows (assignments, memberships, sessions referencing this class/group)
2. If history exists, return false
3. If clean, delete locally AND enqueue `hard_delete` for sync if the row was previously synced

Option A is cleaner unless product specifically needs hard delete for classes/groups. The spec didn't ask for it.

Either way, update the Plan 3 spec contract to document the chosen semantics.

### Failing test contract (write first)

```
test('deleteClass on a synced class with dependents does not produce a sync orphan', async () => {
  // Synced class with an active class_ea_assignment
  // Call deleteClass(classId)
  // EITHER the class stays + archive flag is set (Option A)
  // OR the call returns false leaving the row intact (Option B)
  // Assert that sync_outbox has either an 'archive' row or no new orphan-producing row
});
```

---

## Smaller concerns (address opportunistically, not blocking)

### A — Repeated sync_status fallback ternary

The pattern
```javascript
sync_status: record.sync_status || (record.synced === true ? 'synced' : 'pending')
```
appears at least 12 times across repositories. The existing `syncStatusFromSynced` utility at `sqliteRepositoryUtils.js:20` already handles this, but is not used. Replace the inline ternary with a single utility call:

```javascript
sync_status: record.sync_status || syncStatusFromSynced(record.synced)
```

This eliminates a subtle inconsistency between `syncStatusFromSynced(synced === false ? 'pending' : 'synced')` (the utility default) and the inline `synced === true ? 'synced' : 'pending'` (which treats undefined as pending). The semantic difference may not bite in practice, but the duplication is real.

### B — `__legacySession` sidecar leaks local-only fields to the server

`sessionsRepository.js:42-51` packs `session_type_id`, `_pendingJobTitleResolve`, `pendingSessionTypeCode`, `pendingSessionTypeName` into a `__legacySession` sub-object inside the `activities` JSON column. The server's `sessions.activities` column is `text` and stores the whole JSON blob, so when Plan 4 syncs, this local-only data ends up in Supabase.

Recommend either:
- Stripping `__legacySession` from the payload before enqueuing the outbox row
- Documenting in the log that legacy session fields are intentionally pushed and the server schema accepts them as opaque JSON

### C — `LEGACY_PROGRAMME_ID` will sync to Supabase

`domainRepositoryUtils.js:9, 47-54` creates a programme with id `'local-legacy-programme'` if a user has no active programme assignment. This programme will be pushed to the server via the sync engine.

Recommend either:
- Marking this programme with `sync_status='terminal'` so it never pushes
- Adding a sync engine filter to skip programmes with this specific ID
- Removing the legacy fallback entirely and requiring an active assignment before any session/save (which would force a useful error)

### D — `saveChildRecord` enqueues outbox even when input is synced

`childrenRepository.js:183-194`: if a caller passes `{ sync_status: 'synced' }` (e.g., when restoring rows from a server pull), the method still calls `enqueueDomainOutbox` with operation `'insert'`. This would re-push already-synced rows.

Recommend: skip the outbox enqueue when `sync_status === 'synced'`:

```javascript
if (record.sync_status !== 'synced') {
  await enqueueDomainOutbox(txn, 'children', child.id, 'insert', record);
}
```

The same pattern likely needs review in every repository's "save existing" method.

### E — `getMyChildren` does not filter archived classes

`childrenRepository.js:262-286` joins through `child_class_memberships` but does not filter `classes.archived_at is null`. A child enrolled in an archived class will still appear in "My Children." Probably intentional (the child is still a child), but worth a comment if so, or a filter if not.

---

## Test gaps to close

In addition to the failing tests for the three critical issues, add:

- **`deleteIfNoHistory` synced→hard_delete enqueue path** — current test only covers `sync_status='pending'` rows; never exercises the synced-to-hard_delete enqueue branch at `childrenRepository.js:358-360`
- **`childrenRepository.save` throws when no active academic year** — current tests always seed an active 2026 year, never exercise the branch at `childrenRepository.js:139-141`
- **`childrenRepository.save` throws when actor has no active programme assignment** — covers the `resolveProgrammeId` error path at `domainRepositoryUtils.js:66`

---

## Acceptance criteria

- All three critical-issue failing tests added and made green via the smallest fix that satisfies the contract
- `npm test -- --runInBand` full suite stays green (currently 30/30 suites, 133/133 tests; will grow with the new tests)
- Spec entry at `docs/superpowers/plans/2026-05-20-sqlite-3-repositories-and-storage-facade.md:24` updated to include `child_group_memberships` in archive
- Decision register + bug register entries in `documentation/sqlite-refactor-log.md` for each of the three critical fixes
- Verification register entries for the new test runs and any `rg` scans that prove the duplicated `sync_status` ternary is gone (if Smaller Concern A is also addressed)
- `git diff --check` passes
- Parallel review pass requested
- User signoff before Plan 4

---

## Things explicitly out of scope for this brief

- Smaller concerns B–E are flagged for awareness but are not Plan 4 blockers. Address if convenient during the corrective TDD slice, otherwise carry forward as Plan 5 follow-ups.
- The storage facade's AsyncStorage sidecar pattern (`localStateRepository` payloads, `@sanitizer_state:` keys) is intentional Plan 3 scope; removing it is Plan 5 work, not this brief.
- The `getMyChildren` `select distinct` belt-and-braces filter at `childrenRepository.js:265` is over-defensive given Plan 2's partial unique indexes, but harmless. Leave for now.
