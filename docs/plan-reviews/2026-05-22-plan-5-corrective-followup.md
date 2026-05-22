# Plan 5 Corrective Follow-up Brief

**Date:** 2026-05-22
**Reviewer:** Claude (mentor/review pass)
**Branch:** `plan-5/context-screen-migration` (corrective work uncommitted on top of `a11a615`)
**Predecessor:** `docs/plan-reviews/2026-05-21-plan-5-review-brief.md`
**Suite state:** 45 suites / 213 tests passing; `git diff --check` clean.

> **Context.** The 2026-05-21 corrective round is verified good: Critical 1's primary
> flow (startup `pullReferenceData` + `staff_programme_assignments`), High 1
> (`mergeServerRows`), and High 2 (unguarded write handlers) are genuinely fixed,
> and the signed-in Android write→sync→kill/reopen smoke was run and surfaced three
> real bugs that were correctly fixed. This follow-up covers the residuals that the
> verification pass surfaced. TDD-shaped: write the failing tests first.

---

## Verdict on the residuals

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| H1 | HIGH | Server-assigned children/classes invisible offline (junction tables not hydrated) | Open |
| M1 | MEDIUM | `replaceFromServer` upsert-all can't propagate hard-deletes / can violate the active-unique index | Open |
| L1 | LOW | `ensureServerUuid` summary-item key (4 parts) ≠ repository key (3 parts) | Open |
| L2 | LOW | `mergeServerRows` drops `terminal` rows | Open |
| L3 | LOW | Plan 5 context/App test tautologies (carried from brief M5) | Open |
| V1 | VERIFY | Partial `children` payload in `archiveClass` outbox enqueue | Unverified |

---

## H1 — Server-assigned children and classes are invisible offline (junction tables not hydrated)

### Problem

This is the residual head of Critical 1. The programme-scoped cache-first reads
INNER-JOIN several junction tables:

- `childrenRepository.getMyChildren` (`childrenRepository.js:303-325`) inner-joins
  `child_ea_assignments`, `staff_programme_assignments`, `child_programme_enrollments`,
  `child_class_memberships`, **and** `classes`.
- `classesRepository.getClasses` (userId branch) inner-joins `class_ea_assignments`.

The corrective round hydrates `staff_programme_assignments` (good). The other
junction tables are **still never written to local SQLite for server-assigned data**:

- `pullPreloadedChildData` (`preloadedChildData.js`) joins `child_ea_assignments!inner`
  and `child_programme_enrollments!inner` only to *filter*, then `stripJoins(...)`
  **discards** them. It never returns `child_class_memberships` at all.
- `loadPreloadedChildData` saves child rows via `storage.saveChild` →
  `childrenRepository.saveChildRecord` — a plain `children`-only upsert, no junctions.
- `ClassesContext.loadClasses` selects `classes` with `class_ea_assignments!inner(...)`
  then `data.map(({ class_ea_assignments, ...classItem }) => ...)` **discards** the
  join. `saveClass` only creates a `class_ea_assignments` row for *device-created*
  classes (`shouldEnqueueOutbox(record)` is false for pulled synced classes).

### Why this matters

A child handed over to an EA, or an admin-pre-created class an EA is assigned to
(decision register entry 46 explicitly supports admin-precreated classes), behaves like this:

- **Online:** shows correctly — `pullPreloadedChildData` / `loadClasses` return it
  and it lands in the in-memory list.
- **Offline / after kill-reopen:** disappears — the cache-first read
  (`getMyChildren` / `getClasses`) cannot satisfy its inner joins because the
  junction rows are not local. It reappears once connectivity returns.

For an offline-first field app this defeats offline-first for any data the EA did
not create on this device. It is degraded-offline, not data loss, but it will bite
on every handover and on every admin-created class.

### Why the tests / device smoke didn't catch it

- Repository tests hand-insert the junction rows as fixtures, so `getMyChildren`
  always has them.
- The Android smoke created data *on the device* (which does write junctions via
  the atomic `createChild` / the new `saveClass` producer) and tested while online.
  It never exercised "a child/class assigned server-side, viewed offline."

### Fix shape

Persist the junction rows the server already returns instead of discarding them.

- `pullPreloadedChildData` should return the full `child_ea_assignments`,
  `child_programme_enrollments`, and `child_class_memberships` rows for the user /
  pulled children (plus the `classes` rows those memberships reference, since
  `getMyChildren` also inner-joins `classes`).
- `loadPreloadedChildData` should persist them through typed repository upserts
  with `sync_status: 'synced'` so they do **not** enqueue outbox rows
  (`shouldEnqueueOutbox` already skips `synced`). Repos may need plain
  synced-upsert methods for `child_programme_enrollments` and
  `child_class_memberships` (a `saveX Record`-style upsert, not the atomic creators
  that call `resolveProgrammeId` / generate outbox rows).
- `ClassesContext.loadClasses` should persist the `class_ea_assignments` join rows
  it currently destructures away.
- Idempotency: device-created junctions already have stable UUID ids that were
  pushed to the server, so re-pulling and upserting them by `id` is a safe no-op
  beyond confirming `sync_status: 'synced'`.

### Failing-test contracts (red first)

- `getMyChildren returns a child whose junction rows came from the server pull, not
  on-device creation` — seed a `children` row + the four junction rows the way the
  pull would persist them; assert `getMyChildren(userId)` returns the child. Before
  the fix, with only the `children` row persisted, it returns `[]`.
- `pullPreloadedChildData returns child_ea_assignments, child_programme_enrollments,
  and child_class_memberships rows for the user`.
- `loadPreloadedChildData persists pulled junction rows so getMyChildren resolves a
  handover child offline` — integration: run the pull, then a fresh `getMyChildren`
  (simulating a cold start with no network) returns the handover child.
- `loadClasses persists class_ea_assignments so getClasses returns an admin-assigned
  class from local cache with no network`.
- `pulled junction rows are saved synced and do not enqueue sync_outbox rows` —
  assert `sync_outbox` is empty for those `(table, record_id)` after a pull.

---

## M1 — `replaceFromServer` upsert-all cannot propagate hard-deletes and can violate the active-unique index

### Problem

The corrective round changed `referenceDataRepository.replaceAll` /
`replaceFromServer` from delete-all-then-insert to per-row `upsertRecord` inside
`runRepositoryTransaction`. That move was correct for the `database is locked` fix
and for FK safety (deleting `academic_years` / `programmes` / `schools` would break
inbound FKs from `classes` / `children`). But upsert-per-row never deletes, so:

1. A row hard-deleted on the server is never removed locally.
2. For `staff_programme_assignments` specifically: the local partial unique index
   `idx_staff_programme_assignments_active_unique on staff_programme_assignments(user_id)
   where ended_at is null` (`migrations.js:108-109`) allows one active row per user.
   If the server's active assignment has a new `id` and the local DB still holds a
   *different* active assignment row (old one hard-deleted server-side rather than
   `ended_at`-stamped), upserting the new row produces two active rows for the user
   → unique-index violation → `pullReferenceData` throws. It is caught in
   `hydrateAuthenticatedUser`, so startup continues, but the pull aborts and the EA
   is left on stale local assignment data.

Proper reassignment via `ended_at` is safe (the ended row is still returned by the
`.eq('user_id')` pull and upserts to its ended state). The failure mode is a
server-side hard delete of an active row — a misuse, but one the old
delete-then-insert handled and the new code does not.

### Fix shape

Use a per-table strategy in `replaceFromServer`:

- For **user-scoped tables with no inbound FKs** (`staff_programme_assignments`):
  do a scoped true replace inside the transaction — `delete from
  staff_programme_assignments where user_id = ?` then insert the pulled set. This
  propagates removals and cannot collide with the active-unique index.
- For **reference tables other code FK-references** (`academic_years`,
  `programmes`, `schools`, `job_titles`, `teachers`): keep the upsert (a delete
  would break local FKs). Accept that hard-deletes of these do not propagate —
  low impact for reference data.
- For `assessment_windows`: keep the existing natural-key upsert
  (`conflictColumns`, `updatePrimaryKeyOnConflict`).

### Failing-test contracts

- `replaceFromServer removes a staff_programme_assignment the server no longer
  returns` — seed two local rows, pull a set containing only one, assert the other
  is gone.
- `replaceFromServer does not throw when the server's active assignment differs
  from a stale local active assignment` — seed local active row `a1`; pull `[b1]`
  (active, different id); assert no unique-index error and `getActiveProgrammeId`
  returns `b1`'s programme.
- `replaceFromServer for academic_years does not delete a row referenced by a local
  class` — keep upsert behavior for FK-referenced tables; assert no FK breakage.

---

## L1 — `ensureServerUuid` summary-item key does not match the repository key

### Problem

`assessmentsRepository` builds the summary item id from **3** parts:
`deterministicDomainId('assessment_items', assessment.id, SUMMARY_ITEM_KEY)`.
The safety-net fallback in `offlineSync.buildSyncPayload` builds it from **4**:
`ensureServerUuid(payload.id, 'assessment_items', assessment_id, position ?? item_key, 'summary')`.

For correct/incorrect items both sides use 4 matching parts. For the **summary**
row they diverge. `ensureServerUuid` only recomputes when `payload.id` fails
`uuidValidate` — i.e. only for pre-fix composite-id rows being re-pushed. When that
happens the summary row is pushed under a different UUID than the repository would
mint for the same assessment, so a later re-save can create a duplicate summary row
server-side.

### Fix shape

Make the two key constructions identical. Best: extract one shared helper
(e.g. `assessmentItemDomainId(assessmentId, item)`) used by both
`assessmentsRepository` and `buildSyncPayload`, so they cannot drift again. The
session-attendee key (`'session_attendees', session_id, child_id`) already matches
on both sides — apply the same shared-helper treatment for symmetry.

### Failing-test contract

- `the outbox payload id for an assessment summary item equals the id
  assessmentsRepository generates for it` — save an assessment, read the summary
  `assessment_items` row's id, build its sync payload, assert the payload id is
  unchanged (already a valid UUID) and equals the repository id.

---

## L2 — `mergeServerRows` drops `terminal` rows

### Problem

`mergeServerRows` (in both `ChildrenContext.js` and `ClassesContext.js`) keeps a
local row absent from the server set only when
`row.synced === false || sync_status === 'pending' | 'failed' | 'in_flight'`.
`sync_status === 'terminal'` is missing, so a domain row whose sync terminally
failed is dropped from the visible list — contradicting the decision that terminal
items should "stay visible as unsyncable."

### Fix shape

Use a "keep if not synced" predicate rather than an allow-list of unsynced statuses:

```js
const isUnsyncedLocalRow = (row) => (
  row.synced === false || (row.sync_status && row.sync_status !== 'synced')
);
```

Apply in both contexts (ideally extract the one shared `mergeServerRows`).

### Failing-test contract

- `mergeServerRows keeps a terminal local row absent from a successful server pull`
  — cached `[{id:'t', sync_status:'terminal'}]`, server `[]` → result still
  contains `t`.

---

## L3 — Plan 5 context/App test tautologies (carried from 2026-05-21 brief M5)

The corrective round added one genuinely strong test
(`ChildrenContext.test.js :: successful preload drops synced absent rows`) but did
not address the tautologies the test-quality audit flagged:

- `ChildrenContext.hiddenChildren.test.js` — the inline-logic describe blocks test
  copies of `visibleChildren` / `getChildrenInGroup` / `mergeServerRows` defined in
  the test file; the inline `filterVisible` copy is already out of sync with the
  real `visibleChildren` (which also filters `archived_at`).
- `App.plan5.test.js :: renders without legacy bootstrap imports` — mocks every
  provider; nothing asserts the absence of a legacy bootstrap import.
- `ChildrenContext.test.js` / `ClassesContext.plan5.test.js` `deleteChild` /
  `addClass` assertions are mock-choreography over a fully-mocked `storage` facade.

### Fix shape

Delete the inline-logic describe blocks; mount `ChildrenProvider` / `ClassesProvider`
over the real `better-sqlite3` test runtime (the infra exists and the strong
repository tests already use it) so the assertions verify real DB state. Either make
`App.plan5.test.js` assert real behavior or delete it.

---

## V1 — Verify: partial `children` payload in `archiveClass`

`classesRepository.archiveClass` enqueues `children` `update` outbox rows with a
3-field partial payload `{ id, class_id: null, updated_at }`, unlike every other
`update` row which carries the full record. Confirm the sync engine's upsert
tolerates a partial `children` payload against the `ON CONFLICT` INSERT arm vs. the
table's NOT NULL columns — exercise a class-archive sync end-to-end (this path was
not part of the signed-in device smoke). If a partial upsert fails, enqueue the full
child record instead.

---

## Acceptance criteria

1. H1: a handover child and an admin-assigned class resolve from local cache with
   no network (cold-start path), with the failing-test contracts going red→green.
2. M1: `staff_programme_assignments` removals propagate and the active-unique-index
   collision case no longer throws.
3. L1, L2 fixed; L3 tautologies removed/rewritten against real SQLite; V1 verified
   (and fixed if the partial upsert fails).
4. `npm test -- --runInBand` green; `git diff --check` clean.
5. Re-run the signed-in Android smoke for the offline path: pull data online, go
   offline, kill/reopen, confirm previously-pulled children/classes still render.
6. `documentation/sqlite-refactor-log.md` updated with Decision / Bug-Gap /
   Verification entries for each fix.

## Out of scope

- M1/M2 from the 2026-05-21 brief (`getChildrenInClass` source of truth,
  `class_grouping_state.class_list_status`) — already explicitly deferred in the
  plan doc; not re-opened here.
- Full storage-facade / profile-facade removal — Plan 6 (decision 73).
