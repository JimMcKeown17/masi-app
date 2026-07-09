# Active-Pair Collision-Proofing Implementation Plan (issue #47)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the five "active-pair" sync tables collision-proof against their server partial-unique indexes so a device that mints a new id for a pair the server already holds active does not `23505` -> terminal-quarantine (ZZ Finding 4). Four tables (`child_ea_assignments`, `child_programme_enrollments`, `class_ea_assignments`, `group_ea_assignments`) get deterministic UUIDv5 ids keyed exactly on their server index columns (the `letter_mastery` triad: local mint + push-remap + deploy gate). `child_class_memberships` recurs by design and needs its distinct archived rows for audit history, so it gets reconcile-before-upsert instead.

**Architecture:** Nine tasks, one branch, one PR. The deterministic-id tables reuse the exact proven pattern: a per-table `*DomainId` helper (`domainRepositoryUtils.js`), a local mint in the repository create path (`existing?.id || domainId(...)`), and a force-remap on push (`buildSyncPayload`). Because `ignoreDuplicates` uses `onConflict: 'id'` (which does not cover the partial-unique index), a leftover pre-fix random-id active row still collides, so a one-time deploy gate (wipe pre-fix rows on the wipeable `masi-app-sqlite`) is mandatory before ship. `child_class_memberships` gets a new pre-push reconcile in `runServerOperation`: before an insert, read the server's active `(child_id, academic_year_id)` row; if a different membership already holds the pair, archive it first (device-move-wins, audit-preserving) then insert; conservative fallback to today's behavior on read failure.

**Scope calibration (from the grounding exploration, ratified with Jim 2026-07-09):** The multi-writer collision is currently LATENT: the Head-Office NextJS app is deferred to next year and the cohort seed script is not yet built (CONTEXT.md:161-163), so no second writer mints these pairs today. #47 is prevention-by-construction ahead of the go-live seed. `child_ea_assignments`, `child_programme_enrollments`, `class_ea_assignments`, `group_ea_assignments` do NOT recur in the mobile client (reassignment is server-side); `child_class_memberships` DOES recur (device class-move, tested by `__tests__/childClassReassignment.test.js`, issue #35) and its `deleteIfNoHistory` audit depends on distinct archived rows, which is why deterministic-pair-id is unsafe for it.

**Tech Stack:** React Native (Expo) + JavaScript, Jest + RTL, better-sqlite3. The high-fidelity real-server test pattern is `__tests__/letterMasterySync.test.js` (`createServerBackedSupabase(serverDb)` + `toPgError` translating real SQLite constraint violations into `23505`/`23503`), which is the correct harness for anything where a partial-unique-index conflict matters.

## Global Constraints

- Branch off main first: `git checkout -b fix/active-pair-collision-proofing` (repo rule: always branch). `main` now has #48 merged (`1e15269`).
- Node 20 per `.nvmrc`; prefix jest with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Commit messages: `type(scope): message (#47)`. Never add an agent name as co-author. Merges do not auto-close; the orchestrator closes #47 after merge.
- **`documentation/rls-sync-contract-map.md` MUST be updated** (Task 8): identity, conflict arbiter, and ordering per table; the ccm reconcile is sync-contract behavior. There is an existing "Known limit (issue #47 scope)" note in the Pull Merge Invariant section to resolve.
- **`documentation/sqlite-refactor-log.md` MUST get a dated entry** (Task 8).
- Deterministic ids MUST be keyed EXACTLY on the server partial-unique index columns (verified in Task order below), or the collision is not neutralized.
- No Supabase schema changes. The deploy gate (Task 9) is data cleanup on the wipeable `masi-app-sqlite`, run by Jim at cutover; agents do not run production DML.
- The working tree carries an unrelated modified `skills-lock.json` and untracked `docs/`/`.claude/` entries; never stage any of them. Stage only the files each task names.
- Never write an em dash in any authored doc, comment, or commit message.
- **Reviewer note:** treat git as read-only during concurrent reviews.
- **Codex build note:** Codex's sandbox cannot commit (`.git` is read-only); leave changes in the working tree, the orchestrator commits.

Server partial-unique indexes (the deterministic-id keys, verified against migrations):
- `child_ea_assignments` -> `(user_id, child_id) where unassigned_at is null` (`20260521115412:293-295`)
- `child_programme_enrollments` -> `(child_id, programme_id) where ended_at is null` (`20260521115412:297-299`)
- `class_ea_assignments` -> `(class_id, ea_user_id, programme_id) where unassigned_at is null` (`20260521144901:224-226`)
- `group_ea_assignments` -> `(group_id) where unassigned_at is null` (`20260521144901:228-230`)
- `child_class_memberships` -> `(child_id, academic_year_id) where exited_at is null` (`20260521144901:236-238`)

---

### Task 1: Per-table deterministic-id helpers

**Files:**
- Modify: `src/db/repositories/domainRepositoryUtils.js` (add four helpers beside `letterMasteryDomainId` at `:39-54`)
- Test: Create `__tests__/activePairDomainIds.test.js`

**Interfaces:**
- Produces: `childEaAssignmentDomainId({ userId, childId })`, `childProgrammeEnrollmentDomainId({ childId, programmeId })`, `classEaAssignmentDomainId({ classId, eaUserId, programmeId })`, `groupEaAssignmentDomainId({ groupId })` -> deterministic UUIDv5 (via `deterministicDomainId`), each namespaced by its table name and keyed exactly on the server index columns. Tasks 2-6 consume these.
- Consumes: `deterministicDomainId` (`:14-17`).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/activePairDomainIds.test.js`:

```javascript
const {
  childEaAssignmentDomainId,
  childProgrammeEnrollmentDomainId,
  classEaAssignmentDomainId,
  groupEaAssignmentDomainId,
  deterministicDomainId,
} = require('../src/db/repositories/domainRepositoryUtils');

describe('active-pair deterministic ids (#47)', () => {
  test('each is keyed exactly on its server index columns and is table-namespaced', () => {
    expect(childEaAssignmentDomainId({ userId: 'u1', childId: 'c1' }))
      .toBe(deterministicDomainId('child_ea_assignments', 'u1', 'c1'));
    expect(childProgrammeEnrollmentDomainId({ childId: 'c1', programmeId: 'p1' }))
      .toBe(deterministicDomainId('child_programme_enrollments', 'c1', 'p1'));
    expect(classEaAssignmentDomainId({ classId: 'cl1', eaUserId: 'u1', programmeId: 'p1' }))
      .toBe(deterministicDomainId('class_ea_assignments', 'cl1', 'u1', 'p1'));
    expect(groupEaAssignmentDomainId({ groupId: 'g1' }))
      .toBe(deterministicDomainId('group_ea_assignments', 'g1'));
  });

  test('group_ea id depends on group_id ALONE (matches the server index)', () => {
    // two different EAs on the same group derive the SAME id, so the second push is an
    // id-match (ignoreDuplicates no-op), never a partial-index 23505.
    expect(groupEaAssignmentDomainId({ groupId: 'g1' }))
      .toBe(groupEaAssignmentDomainId({ groupId: 'g1' }));
  });

  test('same pair -> same id across calls (idempotent)', () => {
    expect(childEaAssignmentDomainId({ userId: 'u1', childId: 'c1' }))
      .toBe(childEaAssignmentDomainId({ userId: 'u1', childId: 'c1' }));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/activePairDomainIds.test.js --verbose
```

Expected: FAIL (helpers undefined).

- [ ] **Step 3: Add the helpers**

In `src/db/repositories/domainRepositoryUtils.js`, after `letterMasteryDomainId` (`:54`):

```javascript
export const childEaAssignmentDomainId = ({ userId, childId }) => (
  deterministicDomainId('child_ea_assignments', userId, childId)
);

export const childProgrammeEnrollmentDomainId = ({ childId, programmeId }) => (
  deterministicDomainId('child_programme_enrollments', childId, programmeId)
);

export const classEaAssignmentDomainId = ({ classId, eaUserId, programmeId }) => (
  deterministicDomainId('class_ea_assignments', classId, eaUserId, programmeId)
);

export const groupEaAssignmentDomainId = ({ groupId }) => (
  deterministicDomainId('group_ea_assignments', groupId)
);
```

- [ ] **Step 4: Run to verify pass; commit**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/activePairDomainIds.test.js --verbose
git add src/db/repositories/domainRepositoryUtils.js __tests__/activePairDomainIds.test.js
git commit -m "feat(sync): deterministic-id helpers for the four active-pair tables (#47)"
```

---

### Task 2: Force the deterministic id on push for the four tables (`buildSyncPayload`)

**The change:** Mirror the `letter_mastery` push-remap (`offlineSync.js:517-530`) for the four tables so a pre-fix random-id local row still lands on the canonical server id, and every writer agrees on the id. This is the single most important collision-neutralizing edit.

**Files:**
- Modify: `src/services/offlineSync.js` (`buildSyncPayload`, after the `letter_mastery` block at `:530`; import the four helpers)
- Test: Modify `__tests__/offlineSyncOutbox.test.js` (assert the pushed payload id is the deterministic id per table)

**Interfaces:**
- Consumes: the four Task 1 helpers.
- Produces: for `child_ea_assignments`/`child_programme_enrollments`/`class_ea_assignments`/`group_ea_assignments`, `buildSyncPayload` overwrites `payload.id` with the table's deterministic id computed from the payload's index columns.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/offlineSyncOutbox.test.js` a test that captures the upsert payload via `createSupabaseMock` and asserts the pushed id equals the deterministic id, for each of the four tables. Example for one table (repeat for all four):

```javascript
  test('push remaps active-pair ids to the deterministic id (#47)', async () => {
    await seedReferences(db);
    // enqueue a child_ea_assignments insert with a RANDOM local id
    await db.runAsync(`insert into child_ea_assignments (id, user_id, child_id, created_by, sync_status) values ('random-1', 'user-1', 'child-1', 'user-1', 'pending')`);
    await enqueue(db, 'child_ea_assignments', 'random-1', 'insert', { id: 'random-1', user_id: 'user-1', child_id: 'child-1', created_by: 'user-1' });

    const { supabaseClient, calls } = createSupabaseMock({ upsertResults: { child_ea_assignments: { error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });
    await engine.syncAll({ tableName: 'child_ea_assignments' });

    const { childEaAssignmentDomainId } = require('../src/db/repositories/domainRepositoryUtils');
    const pushed = calls.upserts.find((c) => c.tableName === 'child_ea_assignments');
    expect(pushed.payload.id).toBe(childEaAssignmentDomainId({ userId: 'user-1', childId: 'child-1' }));
  });
```

(Confirm the `createSupabaseMock` `calls` shape exposes upsert payloads; if it does not, extend the mock to record `{ tableName, payload, options }` per upsert, mirroring how it already records for the batch/function cases.)

- [ ] **Step 2: Run to verify it fails**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/offlineSyncOutbox.test.js -t 'deterministic id' --verbose
```

Expected: FAIL (id still `random-1`).

- [ ] **Step 3: Add the remaps**

In `src/services/offlineSync.js`, import the helpers at the top with the other `domainRepositoryUtils` imports, then after the `letter_mastery` block (`:530`) add:

```javascript
  // Active-pair tables: identity IS the server partial-unique key. Force the deterministic id on
  // every push so a pre-fix random local id lands on the canonical server row and every writer
  // (device or future head-office seed) agrees on the id, turning a partial-index 23505 into an
  // idempotent id-match. Keyed EXACTLY on each server index's columns.
  //
  // REVIEW R1 (blocker): buildSyncPayload runs on EVERY operation with no op context, and archive
  // payloads are BARE ({ id, <end_col> } only, no key columns). Remapping a bare archive would
  // hash `undefined` into a fixed bogus id and mis-target the upsert (23502 loop + the real row
  // never archived). So gate each remap on ALL its key columns being present -- only full INSERT
  // payloads carry them. (Unlike letter_mastery, whose removals coalesce into full-column inserts.)
  if (tableName === 'child_ea_assignments' && payload.id && payload.user_id && payload.child_id) {
    payload.id = childEaAssignmentDomainId({ userId: payload.user_id, childId: payload.child_id });
  }
  if (tableName === 'child_programme_enrollments' && payload.id && payload.child_id && payload.programme_id) {
    payload.id = childProgrammeEnrollmentDomainId({ childId: payload.child_id, programmeId: payload.programme_id });
  }
  if (tableName === 'class_ea_assignments' && payload.id && payload.class_id && payload.ea_user_id && payload.programme_id) {
    payload.id = classEaAssignmentDomainId({ classId: payload.class_id, eaUserId: payload.ea_user_id, programmeId: payload.programme_id });
  }
  if (tableName === 'group_ea_assignments' && payload.id && payload.group_id) {
    payload.id = groupEaAssignmentDomainId({ groupId: payload.group_id });
  }
```

**REVIEW R1/R10 - amend the Task 2 test:** the mock records a flat `calls` array of `{ type, tableName, payload, options }`, so use `calls.filter(c => c.type === 'upsert' && c.tableName === 'child_ea_assignments')`, not `calls.upserts.find(...)`. And ADD a regression test proving an ARCHIVE push is NOT remapped: enqueue a bare `child_ea_assignments` archive `{ id: 'random-1', unassigned_at }`, sync it, and assert the pushed payload id is still `'random-1'` (the real row id), never the bogus `deterministicDomainId('child_ea_assignments', undefined)`.

- [ ] **Step 4: Run to verify pass; commit**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/offlineSyncOutbox.test.js -t 'deterministic id' --verbose
git add src/services/offlineSync.js __tests__/offlineSyncOutbox.test.js
git commit -m "feat(sync): force deterministic ids on push for the four active-pair tables (#47)"
```

---

### Task 3: `child_ea_assignments` local deterministic mint

**The change:** In the create-if-missing path (`childrenRepository.js:121-143`), mint `childEaAssignmentDomainId(...)` instead of `uuidv4()` for a NEW row (reuse an existing local row's id if present), so the local id matches the server id and pulls do not create duplicates.

**Files:**
- Modify: `src/db/repositories/childrenRepository.js` (`:121-143`, import the helper)
- Test: Modify `__tests__/childrenRepository.test.js` (or the suite that covers `save()`; if none targets child_ea creation, add one)

**Interfaces:**
- Consumes: `childEaAssignmentDomainId` (Task 1).

- [ ] **Step 1: Write the failing test**

Add a real-SQLite test asserting a newly created child's `child_ea_assignments` row has `id === childEaAssignmentDomainId({ userId, childId })`. Mirror the suite's existing `createMigratedDatabase`/`seedCoreData` setup. If the repository test suite for `save()` is `__tests__/childrenRepository.test.js`, add there; otherwise create `__tests__/childEaDeterministicId.test.js` on the `sqliteRepositoryTestUtils` pattern.

```javascript
  test('a new child self-assignment uses the deterministic child_ea id (#47)', async () => {
    // arrange: seed a user + programme; create a child via the repository save() path
    // act: read the child_ea_assignments row
    // assert:
    expect(assignment.id).toBe(childEaAssignmentDomainId({ userId: assignment.user_id, childId: assignment.child_id }));
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest <that file> --verbose
```

Expected: FAIL (id is a random uuid).

- [ ] **Step 3: Implement the mint**

In `src/db/repositories/childrenRepository.js`, in the create-if-missing branch (`:121-143`), replace the `uuidv4()` id (`:130`) with:

```javascript
      const assignmentId = existingAssignment?.id || childEaAssignmentDomainId({ userId: resolvedUserId, childId: id });
```

using the variables already in scope for the row's `user_id`/`child_id` (match the existing local variable names; the guard query already selects `where user_id = ? and child_id = ? and unassigned_at is null`, so `existingAssignment` is the active-row lookup). Use `assignmentId` where `uuidv4()` was used.

- [ ] **Step 4: Run to verify pass; commit**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest <that file> --verbose
git add src/db/repositories/childrenRepository.js __tests__/<that file>
git commit -m "feat(sync): deterministic local mint for child_ea_assignments (#47)"
```

---

### Task 4: `child_programme_enrollments` local deterministic mint

Same shape as Task 3, in `childrenRepository.js:145-167` (the `uuidv4()` at `:154`). Replace with:

```javascript
      const enrollmentId = existingEnrollment?.id || childProgrammeEnrollmentDomainId({ childId: id, programmeId: resolvedProgrammeId });
```

matching the guard query's `where child_id = ? and programme_id = ? and ended_at is null`. TDD: failing real-SQLite test asserting the enrollment id equals `childProgrammeEnrollmentDomainId({ childId, programmeId })`; implement; pass; commit `feat(sync): deterministic local mint for child_programme_enrollments (#47)`.

---

### Task 5: `class_ea_assignments` local deterministic mint

Same shape, in `classesRepository.js:107-132` (the `uuidv4()` at `:119`). Replace with:

```javascript
      const assignmentId = existingAssignment?.id || classEaAssignmentDomainId({ classId, eaUserId: resolvedEaUserId, programmeId: resolvedProgrammeId });
```

matching the guard query's `where class_id = ? and ea_user_id = ? and programme_id = ? and unassigned_at is null`. TDD: failing real-SQLite test asserting the class_ea id equals `classEaAssignmentDomainId(...)`; implement; pass; commit `feat(sync): deterministic local mint for class_ea_assignments (#47)`.

---

### Task 6: `group_ea_assignments` key narrowing to `group_id`

**The change:** `groupsRepository.js:99` already mints `deterministicDomainId('group_ea_assignments', groupId, ownerUserId, programmeId)` -- one column too many versus the server index (`group_id` alone). Narrow it to `groupEaAssignmentDomainId({ groupId })` so a device and a future head-office writer that pick DIFFERENT EAs for the same group derive the SAME id (an idempotent id-match under `ignoreDuplicates`), instead of two different ids that collide on the `group_id` partial index (which `onConflict: 'id'` cannot arbitrate). One-active-EA-per-group is the server invariant; group handover is not a device flow (confirmed: no such code path), so server-wins-on-conflict is correct.

**Files:**
- Modify: `src/db/repositories/groupsRepository.js` (`:99`, import the helper; drop the now-unneeded owner/programme args from the id derivation only)
- Test: Modify the groups repository test suite

- [ ] **Step 1: Write the failing test**

```javascript
  test('group_ea id is keyed on group_id alone (#47)', async () => {
    // create a group via saveGroup; read its group_ea_assignments row
    expect(assignment.id).toBe(groupEaAssignmentDomainId({ groupId: assignment.group_id }));
  });
```

- [ ] **Step 2-4:** Run (FAIL: id still keyed on 3 columns) -> replace `groupsRepository.js:99` id derivation with `groupEaAssignmentDomainId({ groupId })` -> run (PASS) -> commit `feat(sync): narrow group_ea_assignments deterministic id to group_id (#47)`.

Note for the implementer: keep the create-if-missing guard (`groupsRepository.js:89-96`) and the self-heal repair loops intact; only the id-derivation expression changes. Confirm the self-heal loops (`:393`, `:444`) that also create assignments derive the id the same way (route them through `groupEaAssignmentDomainId` too, so all three producers agree).

---

### Task 7: `child_class_memberships` reconcile-before-upsert

**The bug:** `child_class_memberships` recurs by design (device class-move archives-then-inserts) and its `deleteIfNoHistory` audit needs distinct archived rows, so deterministic-pair-id is unsafe. The collision fires when the SERVER holds an active `(child_id, academic_year_id)` row the device never archived (a seed/HO row the device did not pull, or a #42-manufactured divergence): the device's new-membership insert `23505`s on the `(child_id, academic_year_id)` partial index. Fix: before the insert reaches the server, read the server's active row for the pair; if a DIFFERENT membership already holds it, archive that server row first (device-move-wins, audit-preserving), then insert; conservative fallback (proceed to the normal upsert, letting #48 classify the result) on any read/reconcile error.

**Files:**
- Modify: `src/services/offlineSync.js` (`runServerOperation`, before the upsert at `:596`)
- Test: Modify `__tests__/childClassReassignment.test.js` (it already uses a real second-SQLite "server"), or add `__tests__/childClassMembershipReconcile.test.js` on the `createServerBackedSupabase` pattern from `letterMasterySync.test.js`.

**Interfaces:**
- Produces: a `reconcileChildClassMembership(supabaseClient, payload)` helper that, for a `child_class_memberships` insert, `select`s the server active row for `(child_id, academic_year_id)`; if present and `id !== payload.id`, archives it (`update ... set exited_at = now where id = <server row id>`) before returning so the subsequent insert lands cleanly. Returns without action if no conflicting row or if the server row is the same id. All wrapped in try/catch: on error, return a sentinel so `runServerOperation` proceeds to the normal upsert (conservative fallback), NOT a hard failure.

- [ ] **Step 1: Write the failing tests** (real second-SQLite server via `createServerBackedSupabase`)

```javascript
  test('reconcile: a device membership insert archives a conflicting server-active row, no 23505 (#47)', async () => {
    // server (2nd real SQLite db) already has an active (child-1, year-1) membership in class-A (seed-shaped, distinct id)
    // device enqueues a NEW active (child-1, year-1) membership in class-B (distinct id), no local archive of the server row
    // run syncAll; assert: the child-B membership lands active on the server, the server class-A row is now exited,
    //   the device outbox row is NOT terminal (no 23505 quarantine), and BOTH rows survive (audit history preserved)
  });

  test('reconcile: no conflicting server row -> plain insert (no extra archive)', async () => { /* ... */ });

  test('reconcile: server read fails -> conservative fallback to normal upsert (no throw, no data loss)', async () => { /* ... */ });
```

Model these on `letterMasterySync.test.js`'s `toPgError` so a real `UNIQUE constraint failed` surfaces as `23505` when reconcile is bypassed, proving the reconcile is what prevents it.

- [ ] **Step 2: Run to verify they fail**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/childClassMembershipReconcile.test.js --verbose
```

Expected: FAIL (the device insert 23505s / quarantines).

- [ ] **Step 3: Implement the reconcile**

In `src/services/offlineSync.js`, add above `runServerOperation`:

```javascript
// child_class_memberships recurs (class moves) and needs its distinct archived rows for audit
// history, so it cannot use a deterministic-pair id. Before an insert, reconcile against the
// server's active (child_id, academic_year_id) row: if a DIFFERENT membership already holds the
// pair (a seed/head-office row the device never archived), archive it first so the insert does
// not 23505 on the partial-unique index. Device-move-wins, audit-preserving. Local state is not
// enough here -- this is the one place a pre-push SERVER read is warranted. Conservative: any
// error falls through to the normal upsert (then #48 classifies the outcome).
const reconcileChildClassMembership = async (supabaseClient, payload) => {
  if (!payload?.child_id || !payload?.academic_year_id) return;
  try {
    const { data, error } = await supabaseClient
      .from('child_class_memberships')
      .select('id')
      .eq('child_id', payload.child_id)
      .eq('academic_year_id', payload.academic_year_id)
      .is('exited_at', null)
      .limit(1);
    if (error) return; // conservative fallback
    const serverRow = Array.isArray(data) ? data[0] : data;
    if (!serverRow || serverRow.id === payload.id) return;
    await supabaseClient
      .from('child_class_memberships')
      .update({ exited_at: new Date().toISOString() })
      .eq('id', serverRow.id);
  } catch (_) { /* conservative fallback: proceed to the normal upsert */ }
};
```

Then in `runServerOperation`, immediately before the upsert (`:596`), add:

```javascript
  if (config.tableName === 'child_class_memberships' && outboxRecord.operation === 'insert') {
    await reconcileChildClassMembership(supabaseClient, payload);
  }
```

- [ ] **Step 4: Run to verify pass; commit**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/childClassMembershipReconcile.test.js --verbose
git add src/services/offlineSync.js __tests__/childClassMembershipReconcile.test.js
git commit -m "feat(sync): reconcile-before-upsert for child_class_memberships (#47)"
```

---

### Task 8: Contract map + refactor log

**Files:**
- Modify: `documentation/rls-sync-contract-map.md`
- Modify: `documentation/sqlite-refactor-log.md`

- [ ] **Step 1: Update the per-table contract rows** for the five tables: identity (deterministic-key columns for the four; reconcile for ccm), conflict arbiter, and ordering. Add a Global Contract item (next number) stating: the four active-pair tables use a deterministic id keyed exactly on their server partial-unique index columns (local mint + push-remap), which requires the deploy gate; `child_class_memberships` uses reconcile-before-upsert (a pre-push server read that archives a conflicting server-active row before insert, device-move-wins, conservative fallback). Resolve the existing "Known limit (issue #47 scope)" note in the Pull Merge Invariant section (it is now addressed).

- [ ] **Step 2: Add the refactor-log row** (Verification Register table format) dated 2026-07-09 summarizing the mechanism per table, the deploy gate, the latent-multi-writer calibration, and the test gates.

- [ ] **Step 3: Commit** `docs(sync): contract map + log for active-pair collision-proofing (#47)`.

---

### Task 9: Full regression sweep + deploy-gate note

**Files:** none modified (verification + a note).

- [ ] **Step 1: Full unit + integration suites** (Node 20):

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration
```

Expected: green. Pay special attention to `__tests__/childClassReassignment.test.js` (the #35 recurrence coalescing must still pass with the reconcile in place) and any existing child_ea/class_ea/group_ea creation tests whose asserted ids were random uuids -> update those fixtures to the deterministic ids (confirm the new value is intended before changing).

- [ ] **Step 2: Record the DEPLOY GATE** (do NOT run it; Jim runs it at cutover) in the refactor log and PR body: before shipping the deterministic-id build, clean pre-fix random-id active rows for the four tables on `masi-app-sqlite` (wipeable dev data, no field users) so a leftover random-id active row does not `23505` against a deterministic-id push on the partial-unique index. Mirror the `letter_mastery` Task 0 gate (`docs/superpowers/plans/2026-06-04-letter-mastery-deterministic-id-root-fix.md`).

---

## Self-Review (completed at authoring time)

- **Spec coverage:** #47 AC "re-creating an active pair that already exists on the server syncs cleanly, per table" -> Tasks 2-6 (deterministic id) + Task 7 (ccm reconcile). "Cross-writer scenario resolves without terminal quarantine" -> deterministic-id idempotency (Tasks 2-6) + reconcile (Task 7). "Identity-immutability triggers never receive an identity-changing update from a retry" -> deterministic-id inserts use the existing `ignoreDuplicates` path (no update), preserved; the triggers fire on UPDATE only. "Moving a child to a different class in the same year exits the old membership before/with the new insert, in server-visible order" -> existing archive-before-insert ordering (unchanged) plus Task 7 reconcile for the server-side conflict. Contract map -> Task 8.
- **Placeholder scan:** Tasks 4/5/6 reference Task 3's fully-shown pattern by structure but give the exact file:line, the exact replacement expression, and the guard-query columns; the novel code (helpers, remap, reconcile) is shown in full. Repository-test seeds point at `sqliteRepositoryTestUtils` / the `letterMasterySync.test.js` server harness as the authority.
- **Type consistency:** helper signatures (`{ userId, childId }`, `{ childId, programmeId }`, `{ classId, eaUserId, programmeId }`, `{ groupId }`) match their Task 2 remap call sites and their Task 3-6 mint call sites; `reconcileChildClassMembership(supabaseClient, payload)` matches its `runServerOperation` call site.

## Adversarial review dispositions (one independent Opus review, verified against the tree 2026-07-09)

Verdict was **build-with-fixes**. These amend the tasks above and are BINDING; the builder must apply them.

- **R1 (blocker) - ACCEPTED, fixed inline in Task 2.** The push-remap ran on bare archive payloads and hashed `undefined` into a bogus fixed id, breaking every archive/unassignment. Verified: archive enqueues are `{ id, unassigned_at }` only (`childrenRepository.js:441`, `groupsRepository.js:302`, `classesRepository.js:193`). Fix: gate each remap on all key columns present (done). Add the archive-not-remapped regression test.
- **R2 (accuracy) - ACCEPTED.** Only the 3 immutable tables get `ignoreDuplicates` (`ON CONFLICT (id) DO NOTHING`); `child_programme_enrollments` pushes as `ON CONFLICT (id) DO UPDATE` (it is not in `IMMUTABLE_ASSIGNMENT_TABLES`). Still correct (a matched deterministic id updates the same logical row; no immutability trigger on cpe), but the prose in Architecture / Task 2 / Risk 4 saying "all four DO NOTHING" is wrong - reason per-table. cpe CAN reactivate an archived row via DO UPDATE; the 3 immutable tables CANNOT (ignoreDuplicates silently no-ops).
- **R3 (correctness/scope) - ACCEPTED, amends Task 7.** The ccm reconcile's archive-UPDATE is RLS-gated on the CONFLICTING row's class (`child_class_memberships_update_write_child_class`, `20260521144901:871-881`): it succeeds for a same-school move but is RLS-DENIED when HO assigned the child to a class the device cannot access (cross-school). The `try/catch` then swallows it -> conservative fallback -> the insert 23505s -> terminal. So the reconcile covers the same-school case; the cross-school HO case falls to #48's classification (terminal, since 23505 is not evidence-retriable). This boundary MUST be documented in the contract map (Task 8) and is acceptable given HO central reassignment is deferred. A complete fix would be a `SECURITY DEFINER` server RPC that atomically archives-old + inserts-new (bypasses the old-class RLS and gives atomicity) - but that is a Supabase schema change, out of this plan's scope; flag it as a follow-up, do not build it here.
- **R4 (test harness) - ACCEPTED, amends Task 7.** Neither `createServerBackedSupabase` (`letterMasterySync.test.js:65-92`, select only via `.maybeSingle()`, no `.update`) nor `createSupabaseMock` supports the reconcile's `.select().eq().eq().is().limit()` (awaited, expects `{data:[...]}`) or `.update().eq()` chains. Task 7 must EXTEND the chosen harness with an awaitable `.is().limit()` select returning `{ data }` and an `.update().eq()` that mutates the server db. Note in the test file that the harness runs NO RLS, so the reconcile test cannot exercise the R3 cross-school denial. (Existing ccm tests do not regress: the missing-method TypeError is swallowed by the reconcile's try/catch -> no-op.)
- **R5 (wrong claim) - ACCEPTED, corrects Risk 4 note.** `group_ea_assignments` is NOT pulled (`ChildrenContext.js:108-125` saveRows omits it; `preloadedChildData.js` only joins it as a filter). So the "on pull the device row is corrected" claim is false: when the server holds another EA's active group_ea (shared id `f(group_id)`), the device's insert `ignoreDuplicates`-no-ops server-side and its local row is marked synced but never reconciled. Harmless under the latent single-writer scope, but document it as a boundary, not a self-correction. (`class_ea_assignments` IS pulled and is keyed per-EA, so different EAs coexist - no divergence.)
- **R6 (hardening) - ACCEPTED (bounded).** Reactivation of an archived same-pair row would PK-collide/mis-no-op, but no mobile-client create-if-missing path reaches it today EXCEPT `repairGroupOwnershipForSync` (`groupsRepository.js:393,:444`) re-minting a group_ea for an archived-but-unsynced group: with the narrowed `f(group_id)` id it would `DO UPDATE` the archived row and enqueue a stray insert. Task 6 must confirm the repair loops do not re-mint over an archived row (guard on `unassigned_at is null` OR reuse the archived id). Document "reactivation is unsupported for the 3 immutable tables." Do not broaden create-if-missing lookups beyond this.
- **R7 (sound).** Deterministic keys match the server partial-unique indexes column-for-column; `SERVER_COLUMNS` carries every key column. No change.
- **R8 (sound).** Push-remap only mutates `payload.id`; finalize keys on `outboxRecord.record_id` (local id), so pre-fix rows finalize correctly (as letter_mastery does). No change.
- **R9 (correctness) - ACCEPTED, amends Tasks 8 and 9.** (a) The deploy gate must clean pre-fix LOCAL rows too (fresh install / wiped local DB), not only server rows - otherwise a pre-fix local row's insert remaps R->D while its bare archive stays keyed on the local id R, so the archive mis-targets. (b) The multi-writer neutralization is a CROSS-WRITER ID CONTRACT: the future HO seed MUST mint the identical UUIDv5 - same namespace `09dcf4b2-6c53-4c46-917f-33bc7f2df4d2`, same `` join, same per-table key columns (`domainRepositoryUtils.js:12-17`). This is the linchpin; capture it as a first-class artifact in the contract map (Task 8) AND as an explicit acceptance criterion, so the seed-script author reproduces it exactly.
- **R10/R11 (snippets) - ACCEPTED.** Task 2 test: `calls.filter(c => c.type === 'upsert' && ...)` (fixed with R1). Tasks 3-5 real var names: `actorUserId`, `programmeId`, `activeAssignment`, `child.id` / `classData.id` (not `resolvedUserId`/`existingAssignment`). Task 6: there is ONE group_ea mint site (`groupsRepository.js:99`); the self-heal loops call it, so changing `:99` alone suffices (still verify per R6).

## Open design risks (superseded by the dispositions above; kept for context)

1. **Archived-row / reactivation trap for the four deterministic tables.** A deterministic id equals the pair's id even for an archived (unassigned/ended) row. If any path ever re-creates an active row for a pair that has a local archived row (e.g. a pulled server-archived row), the new insert's id collides with the archived row's id on the PRIMARY key (local and server). The exploration found no such mobile-client path today, but the plan bakes in "archive is terminal for these pairs." Confirm no create-if-missing path can fire while an archived same-pair row exists locally, and decide whether the mint should reuse an archived row's id (reactivate) or that case is genuinely impossible.
2. **Pre-fix random-id server rows vs `ignoreDuplicates`.** `ignoreDuplicates` targets `onConflict: 'id'`, not the partial index, so the deploy gate (Task 9) is load-bearing, not optional. Verify the gate wording is unambiguous and that no old-build writer keeps minting random ids after cutover.
3. **Reconcile policy for ccm.** Device-move-wins (archive the server's conflicting row) assumes the EA's on-device class move should override a server/seed membership. Confirm this is the intended authority for go-live (HO central reassignment is deferred), and that archiving (not deleting) the server row preserves `deleteIfNoHistory` audit correctly.
4. **`group_ea` id keyed on `group_id` alone + immutability trigger.** If a device row (its EA) and a server row (another EA) share id `f(group_id)`, the device insert is `ignoreDuplicates` (no update -> no 23514) and the server row wins; on pull the device row is corrected. Verify the immutability trigger is never hit by this path and that the corrected pull does not itself violate a guard.
