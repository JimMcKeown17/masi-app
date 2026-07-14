# classifyError Hardening Implementation Plan (issue #48)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two classification gaps from the ZZ field-lessons review Finding 4: a `23514` identity-trigger rejection on an immutable-assignment table must land terminal with a readable reason instead of retrying forever (#48 part 1); and a `42501`/`23503` failure must be retriable while the record's required evidence is still pending locally and terminal otherwise (#48 part 2), where "required evidence" is the record's FK-parent (for `23503`) plus its RLS assignment-grant (for `42501`), all computed from local state only with no server calls in the per-record failure path.

**Architecture:** Seven tasks, one branch, one PR. `classifyError` (`src/services/offlineSync.js:269-287`) stays a pure synchronous decision function taking `(error, config, { parentEvidencePending })`, so it remains directly unit-testable via `_testClassifyError`. The async outbox/domain lookups that produce `parentEvidencePending` live in the processing loop, which has `database`/`outboxRepository` in scope. Part 1 adds a `23514` branch scoped to `IMMUTABLE_ASSIGNMENT_TABLES` returning an optional readable `reason` the loop composes into `last_error`. Part 2 adds two complementary evidence sources, reflecting the RLS grant shape (`write_for_X = <parent>.created_by OR active assignment`): **FK-parent evidence** (`PARENT_FK_COLUMNS` + `syncOutboxRepository.hasPendingRecord`) covers `23503` and the `created_by` half of `42501` grants; **assignment-grant evidence** (`GRANT_SUBJECTS` + a local domain-table query on `child_ea`/`class_ea`/`group_ea` `sync_status`) covers the assignment half of `42501` grants. For `23503` the loop checks FK-parent only; for `42501` it checks FK-parent OR grant. Both sources resolve their id/subject values from the outbox payload first and the record's own local domain row second, so archive/update payloads (which carry only `id` + a timestamp) still yield evidence.

**Why grant-evidence is in #48 (scope decision, ratified 2026-07-08):** #48 AC2 says "required **parent/assignment** evidence"; the dominant masi field race is a child-scoped `42501` whose granting `child_ea_assignment` has not synced yet, which FK-parent evidence alone would misclassify as terminal. This is complementary to (not overlapping with) #47's `23505` collision-proofing: #48 owns retry-vs-terminal *classification*; #47 owns *preventing* duplicate active rows. The grants are grounded in the verified `private.current_user_can_write_for_child/class/group` functions (migration `20260521144901`, lines 368-517). `staff_programme_assignments` is deliberately excluded from grant-evidence: it is head-office reference data, never pushed, so a `42501` from a missing programme assignment is a genuine terminal denial.

**Tech Stack:** React Native (Expo) + JavaScript, Jest + RTL, better-sqlite3 SQLite test engine (`test-support/betterSqliteAdapter.js`). Real-engine sync tests follow `__tests__/offlineSyncOutbox.test.js` (`createSupabaseMock` + `createBetterSqliteTestDatabase` + `createOutboxSyncEngine`).

## Global Constraints

- Branch off main first: `git checkout -b fix/classifyerror-hardening` (repo rule: always branch).
- Node 20 per `.nvmrc`; prefix jest with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH` if the shell defaults to 22.
- Commit messages: `type(scope): message (#48)` referencing the issue. Never add an agent name as co-author. Merges do not auto-close issues in this repo; the orchestrator closes #48 manually after merge.
- **`documentation/rls-sync-contract-map.md` MUST be updated** (Task 7): append the next Global Contract as numbered **list item 10** (the file keeps Global Contracts as a numbered list `1.`-`9.` under `## Global Contracts`, NOT `### Global Contract N` headers), and update the per-table Operation Semantics rows.
- **`documentation/sqlite-refactor-log.md` MUST get a dated entry** (Task 7).
- No Supabase schema changes; no local SQLite schema changes. New behavior lives in the sync engine, the outbox repository, and docs.
- The working tree carries an unrelated modified `skills-lock.json` and several untracked `docs/superpowers/plans/*.md` and `.claude/skills/` entries; never stage any of them. Stage only the files each task names.
- Never write an em dash in any authored doc, comment, or commit message. Exception: code blocks preserving existing source comments stay byte-identical.
- **Reviewer note:** treat git as read-only during concurrent reviews (no stash/checkout/restore).
- ZZ reference (read-only, cite do-not-copy): `documentation/zz-field-lessons-sync-review-2026-07-04.html` Finding 4.

---

### Task 1: `23514` on immutable-assignment tables is terminal with a readable reason (#48 part 1)

**The bug:** `classifyError` (`src/services/offlineSync.js:269-287`) has no `23514` branch, so an identity-immutability trigger rejection falls through to `return { terminal: false }` and retries on exponential backoff forever. The immutable-assignment tables (`child_ea_assignments`, `class_ea_assignments`, `group_ea_assignments`; the set `IMMUTABLE_ASSIGNMENT_TABLES` is at `offlineSync.js:217-221`) raise `23514` when an update-capable re-push carries drifted identity fields. The insert path already avoids this via `ignoreDuplicates` (`offlineSync.js:463-465`, proven at `offlineSyncOutbox.test.js:561-629`); this task covers the archive/update re-push path where `ignoreDuplicates` is `false`.

**Files:**
- Modify: `src/services/offlineSync.js` (`classifyError` at `:269-287`; the loop reason composition at `:761-762`)
- Test: Create `__tests__/classifyErrorHardening.test.js` (unit, via `_testClassifyError`)
- Test: Modify `__tests__/offlineSyncOutbox.test.js` (integration, one new test)

**Interfaces:**
- Produces: `classifyError(error, config)` returns `{ terminal: true, markAsSynced: false, reason: 'Immutable identity columns rejected the update (23514)' }` when `error.code === '23514'` and `normalizeTableName(config.tableName)` is in `IMMUTABLE_ASSIGNMENT_TABLES`; the loop prefixes `reason` onto `last_error`. Task 5 extends the signature with a third argument without changing this behavior.
- Consumes: `IMMUTABLE_ASSIGNMENT_TABLES` (`:217-221`), `normalizeTableName` (`:258`), `_testClassifyError` (`:1198`).

- [ ] **Step 1: Write the failing unit tests**

Create `__tests__/classifyErrorHardening.test.js`:

```javascript
const { _testClassifyError } = require('../src/services/offlineSync');

describe('classifyError — 23514 immutable-identity rejection (#48 part 1)', () => {
  test('23514 on an immutable-assignment table is terminal with a readable reason', () => {
    const result = _testClassifyError(
      { code: '23514', message: 'group_ea_assignments identity columns cannot be changed after insert' },
      { tableName: 'group_ea_assignments' }
    );
    expect(result.terminal).toBe(true);
    expect(result.markAsSynced).toBe(false);
    expect(result.reason).toMatch(/identity/i);
  });

  test('23514 on each immutable-assignment table is terminal', () => {
    for (const tableName of ['child_ea_assignments', 'class_ea_assignments', 'group_ea_assignments']) {
      expect(_testClassifyError({ code: '23514' }, { tableName }).terminal).toBe(true);
    }
  });

  test('23514 on a non-immutable table stays retryable (out of scope for #48)', () => {
    expect(_testClassifyError({ code: '23514' }, { tableName: 'sessions' }).terminal).toBe(false);
  });

  test('the 23514 reason never matches the RLS heal signature (regression guard for #44)', () => {
    const { reason } = _testClassifyError({ code: '23514' }, { tableName: 'child_ea_assignments' });
    expect(reason).not.toMatch(/row-level security|42501/i);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/classifyErrorHardening.test.js --verbose
```

Expected: FAIL — `23514` currently returns `{ terminal: false }` with no `reason`.

- [ ] **Step 3: Add the `23514` branch and the loop reason composition**

In `src/services/offlineSync.js`, read `tableName` in the config destructure and add the `23514` branch above `23505`:

```javascript
const classifyError = (error, { duplicateIsSuccess = false, tableName } = {}) => {
  const code = error?.code;

  // Identity-immutability triggers on the assignment tables raise 23514 when an
  // update-capable re-push carries drifted identity fields (e.g. a created_at/
  // assigned_at precision difference). The same payload can never satisfy the
  // trigger, so retrying on backoff would loop forever. Land it terminal with a
  // readable reason. The insert path already avoids this via ignoreDuplicates.
  if (code === '23514' && IMMUTABLE_ASSIGNMENT_TABLES.has(normalizeTableName(tableName))) {
    return {
      terminal: true,
      markAsSynced: false,
      reason: 'Immutable identity columns rejected the update (23514)',
    };
  }

  if (code === '23505') {
    return { terminal: true, markAsSynced: duplicateIsSuccess };
  }

  if (
    code === '23503'
    || code === '42501'
    || code === 'ARCHIVE_REQUIRED'
    || code === 'LOCAL_ONLY_REFERENCE'
    || code === 'MISSING_OUTBOX_PAYLOAD'
  ) {
    return { terminal: true, markAsSynced: false };
  }

  return { terminal: false, markAsSynced: false };
};
```

In the loop, compose the reason (find `:761-762`):

```javascript
      const classification = classifyError(serverResult.error, config);
      let reason = errorMessage(serverResult.error);
      if (classification.reason) {
        reason = `${classification.reason}: ${reason}`;
      }
```

- [ ] **Step 4: Run the unit tests to verify they pass**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/classifyErrorHardening.test.js --verbose
```

Expected: PASS (all four).

- [ ] **Step 5: Write the failing integration test**

In `__tests__/offlineSyncOutbox.test.js`, add (mirror the suite's `createSupabaseMock` + `createBetterSqliteTestDatabase` setup):

```javascript
  test('a 23514 identity-trigger rejection on an archive re-push is terminal, not infinite retry (#48)', async () => {
    await seedReferences(db);
    await db.runAsync(`insert into groups (id, name, programme_id, created_by, sync_status) values ('g-1', 'G', 'prog-1', 'user-1', 'synced')`);
    // archive operation => runServerOperation upserts with ignoreDuplicates:false, so the identity trigger fires
    await enqueue(db, 'group_ea_assignments', 'gea-1', 'archive', {
      id: 'gea-1', group_id: 'g-1', ea_user_id: 'user-1', programme_id: 'prog-1', created_by: 'user-1', unassigned_at: '2026-07-08T00:00:00.000Z',
    });

    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        group_ea_assignments: ({ options }) => (
          options.ignoreDuplicates === true
            ? { error: null }
            : { error: { code: '23514', message: 'group_ea_assignments identity columns cannot be changed after insert' } }
        ),
      },
    });

    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });
    await engine.syncAll();

    const outboxRow = await db.getFirstAsync(`select status, last_error from sync_outbox where table_name = 'group_ea_assignments' and record_id = 'gea-1'`);
    expect(outboxRow.status).toBe('terminal');
    expect(outboxRow.last_error).toMatch(/identity/i);
  });
```

(Fill `seedReferences`/`enqueue`/`liveTestSession` from the suite's existing helpers.)

- [ ] **Step 6: Run to verify it passes**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/offlineSyncOutbox.test.js -t '23514 identity-trigger' --verbose
```

Expected: PASS (Step 3 landed the change; this guards the wiring).

- [ ] **Step 7: Commit**

```bash
git add src/services/offlineSync.js __tests__/classifyErrorHardening.test.js __tests__/offlineSyncOutbox.test.js
git commit -m "feat(sync): classify 23514 identity rejections on immutable-assignment tables as terminal (#48)"
```

---

### Task 2: Evidence maps — `PARENT_FK_COLUMNS` and `GRANT_SUBJECTS` (#48 part 2 data)

**The need:** Part 2 must derive, from an outbox record, its FK-parent `{table, recordId}` pairs and its RLS assignment-grant `{grantTable, subjectColumn}` checks. `TABLE_DEPENDENCIES` (`offlineSync.js:170-206`) lists parent table names but not the payload column holding each id, and one edge is irregular (`class_grouping_state -> grouping_versions` via `active_grouping_version_id`). This task adds both maps and their drift guards. No behavior change yet.

**Files:**
- Modify: `src/services/offlineSync.js` (add both maps near `:206`; export `_testEvidenceMaps`)
- Test: Modify `__tests__/classifyErrorHardening.test.js`

**Interfaces:**
- Produces: `PARENT_FK_COLUMNS` (child table -> `{ parentTable: fkColumn }`) and `GRANT_SUBJECTS` (child table -> `[{ grantTable, subjectColumn }]`), plus `export const _testEvidenceMaps = { TABLE_DEPENDENCIES, PARENT_FK_COLUMNS, GRANT_SUBJECTS };`. Task 4 consumes both maps.

- [ ] **Step 1: Write the failing map tests**

Add to `__tests__/classifyErrorHardening.test.js`:

```javascript
const { _testEvidenceMaps } = require('../src/services/offlineSync');

describe('evidence maps (#48 part 2)', () => {
  test('PARENT_FK_COLUMNS covers every TABLE_DEPENDENCIES FK-parent (no drift)', () => {
    const { TABLE_DEPENDENCIES, PARENT_FK_COLUMNS } = _testEvidenceMaps;
    for (const [child, parents] of Object.entries(TABLE_DEPENDENCIES)) {
      for (const parent of parents) {
        expect(PARENT_FK_COLUMNS[child]?.[parent]).toBeDefined();
      }
    }
  });

  test('PARENT_FK_COLUMNS includes the pushed grouping-version FK edges', () => {
    const { PARENT_FK_COLUMNS } = _testEvidenceMaps;
    expect(PARENT_FK_COLUMNS.groups.grouping_versions).toBe('grouping_version_id');
    expect(PARENT_FK_COLUMNS.child_group_memberships.grouping_versions).toBe('grouping_version_id');
    expect(PARENT_FK_COLUMNS.class_grouping_state.grouping_versions).toBe('active_grouping_version_id');
  });

  test('no PARENT_FK_COLUMNS edge points at its own table (no self-cycle)', () => {
    const { PARENT_FK_COLUMNS } = _testEvidenceMaps;
    for (const [child, parents] of Object.entries(PARENT_FK_COLUMNS)) {
      expect(Object.keys(parents)).not.toContain(child);
    }
  });

  test('GRANT_SUBJECTS references only the three device-produced assignment tables', () => {
    const { GRANT_SUBJECTS } = _testEvidenceMaps;
    const allowed = new Set(['child_ea_assignments', 'class_ea_assignments', 'group_ea_assignments']);
    for (const grants of Object.values(GRANT_SUBJECTS)) {
      for (const { grantTable } of grants) expect(allowed.has(grantTable)).toBe(true);
    }
  });

  test('GRANT_SUBJECTS maps the child- and class-scoped grants', () => {
    const { GRANT_SUBJECTS } = _testEvidenceMaps;
    expect(GRANT_SUBJECTS.child_group_memberships).toEqual(expect.arrayContaining([
      { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
      { grantTable: 'group_ea_assignments', subjectColumn: 'group_id' },
    ]));
    expect(GRANT_SUBJECTS.grouping_versions).toEqual([{ grantTable: 'class_ea_assignments', subjectColumn: 'class_id' }]);
    expect(GRANT_SUBJECTS.groups).toBeUndefined(); // created_by + staff_programme_assignments only: no device assignment grant
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/classifyErrorHardening.test.js -t 'evidence maps' --verbose
```

Expected: FAIL — `_testEvidenceMaps` is undefined.

- [ ] **Step 3: Add the maps and the export**

In `src/services/offlineSync.js`, after `ARCHIVE_TABLE_DEPENDENCIES` (near `:206`):

```javascript
// The payload/domain column holding each FK-parent's id, per child table. Covers 23503
// and the "<parent>.created_by" half of 42501 write-grants. Explicit (not name-derived)
// because class_grouping_state references grouping_versions via active_grouping_version_id.
// A superset of TABLE_DEPENDENCIES (extra grouping-version edges); the drift test asserts
// coverage, not equality.
const PARENT_FK_COLUMNS = {
  children: { classes: 'class_id' },
  child_ea_assignments: { children: 'child_id' },
  child_programme_enrollments: { children: 'child_id' },
  child_class_memberships: { children: 'child_id', classes: 'class_id' },
  class_ea_assignments: { classes: 'class_id' },
  grouping_versions: { classes: 'class_id' },
  class_grouping_state: { classes: 'class_id', grouping_versions: 'active_grouping_version_id' },
  groups: { classes: 'class_id', grouping_versions: 'grouping_version_id' },
  group_ea_assignments: { groups: 'group_id' },
  child_group_memberships: { children: 'child_id', groups: 'group_id', grouping_versions: 'grouping_version_id' },
  sessions: { classes: 'class_id' },
  session_attendees: { sessions: 'session_id', children: 'child_id', groups: 'group_id' },
  assessments: { children: 'child_id' },
  assessment_items: { assessments: 'assessment_id' },
  letter_mastery: { children: 'child_id' },
};

// The active-assignment grant(s) each write needs, per RLS private.current_user_can_write_for_*
// (migration 20260521144901 lines 368-517). Only the assignment half is here; the created_by
// half is covered by PARENT_FK_COLUMNS. staff_programme_assignments is excluded (reference data,
// never pushed, so a 42501 from it is a genuine terminal denial). Used for 42501 only.
const GRANT_SUBJECTS = {
  child_class_memberships: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { grantTable: 'class_ea_assignments', subjectColumn: 'class_id' },
  ],
  child_programme_enrollments: [{ grantTable: 'child_ea_assignments', subjectColumn: 'child_id' }],
  child_group_memberships: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { grantTable: 'group_ea_assignments', subjectColumn: 'group_id' },
  ],
  session_attendees: [{ grantTable: 'child_ea_assignments', subjectColumn: 'child_id' }],
  assessments: [{ grantTable: 'child_ea_assignments', subjectColumn: 'child_id' }],
  letter_mastery: [{ grantTable: 'child_ea_assignments', subjectColumn: 'child_id' }],
  grouping_versions: [{ grantTable: 'class_ea_assignments', subjectColumn: 'class_id' }],
  class_grouping_state: [{ grantTable: 'class_ea_assignments', subjectColumn: 'class_id' }],
};

export const _testEvidenceMaps = { TABLE_DEPENDENCIES, PARENT_FK_COLUMNS, GRANT_SUBJECTS };
```

- [ ] **Step 4: Run to verify all pass**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/classifyErrorHardening.test.js -t 'evidence maps' --verbose
```

Expected: PASS. If the drift guard fails, a `TABLE_DEPENDENCIES` parent lacks a `PARENT_FK_COLUMNS` column — add the correct column verified against the payload allowlist (`offlineSync.js:80-130`) / migrations, never guessed.

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineSync.js __tests__/classifyErrorHardening.test.js
git commit -m "feat(sync): FK-parent and assignment-grant evidence maps for classification (#48)"
```

---

### Task 3: `syncOutboxRepository.hasPendingRecord` point-query

**The need:** FK-parent evidence asks "is a still-owed outbox row present for this specific parent (table, id)?" The repository has no point-query by `(table_name, record_id)`. "Still owed" = status in `('pending', 'failed', 'in_flight')`: a synced parent has no row (so the child's denial is genuine), a `terminal` parent is excluded (a doomed parent must not keep children retrying).

**Files:**
- Modify: `src/db/repositories/syncOutboxRepository.js` (add `hasPendingRecord`)
- Test: Modify `__tests__/syncOutboxRepository.test.js`

**Interfaces:**
- Produces: `syncOutboxRepository.hasPendingRecord({ tableName, recordId }) -> Promise<boolean>`. Task 4 consumes it via the injected `outboxRepository`.
- Consumes: `resolveDatabase` (already imported).

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/syncOutboxRepository.test.js` (mirror its real-SQLite setup; outbox id form is `table:recordId:operation`; `markTerminalFailure` takes `(id, { errorMessage })` per `syncOutboxRepository.js:172`):

```javascript
describe('hasPendingRecord — point-query for pending parent evidence (#48)', () => {
  test('true when a pending row exists for (table, id)', async () => {
    await repo.enqueue({ tableName: 'children', recordId: 'child-1', operation: 'insert', payload: { id: 'child-1' } });
    expect(await repo.hasPendingRecord({ tableName: 'children', recordId: 'child-1' })).toBe(true);
  });

  test('true when the row is in_flight', async () => {
    await repo.enqueue({ tableName: 'children', recordId: 'child-2', operation: 'insert', payload: { id: 'child-2' } });
    await repo.markInFlight(['children:child-2:insert']);
    expect(await repo.hasPendingRecord({ tableName: 'children', recordId: 'child-2' })).toBe(true);
  });

  test('false when no row exists (parent already synced -> row deleted)', async () => {
    expect(await repo.hasPendingRecord({ tableName: 'children', recordId: 'nope' })).toBe(false);
  });

  test('false when the only row is terminal (doomed parent must not keep children retrying)', async () => {
    await repo.enqueue({ tableName: 'children', recordId: 'child-3', operation: 'insert', payload: { id: 'child-3' } });
    await repo.markTerminalFailure('children:child-3:insert', { errorMessage: 'boom' });
    expect(await repo.hasPendingRecord({ tableName: 'children', recordId: 'child-3' })).toBe(false);
  });

  test('false for missing args', async () => {
    expect(await repo.hasPendingRecord({ tableName: 'children', recordId: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/syncOutboxRepository.test.js -t 'hasPendingRecord' --verbose
```

Expected: FAIL — `repo.hasPendingRecord is not a function`.

- [ ] **Step 3: Implement `hasPendingRecord`**

In `src/db/repositories/syncOutboxRepository.js`, add beside `getReadyRecords` and include it in the returned object literal:

```javascript
  const hasPendingRecord = async ({ tableName, recordId }) => {
    if (!tableName || !recordId) return false;
    const db = await resolveDatabase(database);
    // "Still owed" = not yet acknowledged. A synced row is deleted (no row); a terminal
    // row is doomed; neither counts as evidence a child should keep waiting on. Local only.
    const row = await db.getFirstAsync(`
      select id from sync_outbox
      where table_name = ? and record_id = ?
        and status in ('pending', 'failed', 'in_flight')
      limit 1
    `, tableName, recordId);
    return !!row;
  };
```

- [ ] **Step 4: Run to verify they pass**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/syncOutboxRepository.test.js -t 'hasPendingRecord' --verbose
```

Expected: PASS (all five).

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/syncOutboxRepository.js __tests__/syncOutboxRepository.test.js
git commit -m "feat(sync): outbox hasPendingRecord point-query for pending-parent classification (#48)"
```

---

### Task 4: `computeEvidencePending` — FK-parent + assignment-grant, domain-row aware (#48 part 2 engine)

**The need:** Combine both evidence sources into one boolean the loop passes to `classifyError`. FK-parent evidence checks the outbox; grant evidence checks the assignment domain tables' `sync_status`. Both resolve their id/subject from the payload first, then the record's own local domain row (archive/update payloads carry only `id` + a timestamp). `includeGrant` is true only for `42501`.

**Files:**
- Modify: `src/services/offlineSync.js` (add `makeFieldResolver`, `hasPendingActiveAssignment`, `computeEvidencePending`; export `_testComputeEvidencePending`)
- Test: Modify `__tests__/offlineSyncOutbox.test.js` (integration, real SQLite)

**Interfaces:**
- Produces: `computeEvidencePending({ database, outboxRepository, outboxRecord, includeGrant }) -> Promise<boolean>`. Task 5 calls it in the loop.
- Consumes: `PARENT_FK_COLUMNS`, `GRANT_SUBJECTS` (Task 2), `outboxRepository.hasPendingRecord` (Task 3), `normalizeTableName`, `quoteIdentifier` (both already in the module).

- [ ] **Step 1: Write the failing integration tests**

Add to `__tests__/offlineSyncOutbox.test.js` a block that constructs the real engine's helper via the test export and a real migrated db:

```javascript
const { _testComputeEvidencePending } = require('../src/services/offlineSync');

describe('computeEvidencePending (#48)', () => {
  test('FK-parent evidence: true when the parent has a pending outbox row', async () => {
    await seedReferences(db);
    await db.runAsync(`insert into assessments (id, child_id, user_id, programme_id, assessment_type, assessment_date, sync_status) values ('asmt-1', 'child-1', 'user-1', 'prog-1', 'egra', '2026-07-08', 'pending')`);
    await enqueue(db, 'assessments', 'asmt-1', 'insert', { id: 'asmt-1', child_id: 'child-1' });
    const outboxRepository = createSyncOutboxRepository({ database: db });
    const pending = await _testComputeEvidencePending({
      database: db, outboxRepository,
      outboxRecord: { table_name: 'assessment_items', record_id: 'ai-1', payload: { id: 'ai-1', assessment_id: 'asmt-1' } },
      includeGrant: false,
    });
    expect(pending).toBe(true);
  });

  test('grant evidence: true when the granting child_ea_assignment is unsynced (42501 only)', async () => {
    await seedReferences(db);
    // active child_ea_assignment for child-1, still pending locally
    await db.runAsync(`insert into child_ea_assignments (id, child_id, user_id, created_by, sync_status) values ('cea-1', 'child-1', 'user-1', 'user-1', 'pending')`);
    const outboxRepository = createSyncOutboxRepository({ database: db });
    const record = { table_name: 'session_attendees', record_id: 'sa-1', payload: { id: 'sa-1', child_id: 'child-1', session_id: 's-1' } };
    expect(await _testComputeEvidencePending({ database: db, outboxRepository, outboxRecord: record, includeGrant: true })).toBe(true);
    // includeGrant:false (the 23503 path) does NOT consult grant evidence:
    expect(await _testComputeEvidencePending({ database: db, outboxRepository, outboxRecord: record, includeGrant: false })).toBe(false);
  });

  test('domain-row fallback: an archive payload with only id still yields evidence', async () => {
    await seedReferences(db);
    await db.runAsync(`insert into child_ea_assignments (id, child_id, user_id, created_by, sync_status) values ('cea-2', 'child-2', 'user-1', 'user-1', 'pending')`);
    // the record's own domain row carries child_id even though the archive payload does not
    await db.runAsync(`insert into child_group_memberships (id, child_id, group_id, sync_status) values ('cgm-1', 'child-2', 'g-1', 'pending')`);
    const outboxRepository = createSyncOutboxRepository({ database: db });
    const record = { table_name: 'child_group_memberships', record_id: 'cgm-1', payload: { id: 'cgm-1', removed_at: '2026-07-08T00:00:00Z' } };
    expect(await _testComputeEvidencePending({ database: db, outboxRepository, outboxRecord: record, includeGrant: true })).toBe(true);
  });

  test('false when no parent and no grant is pending (genuine denial)', async () => {
    await seedReferences(db);
    await db.runAsync(`insert into child_ea_assignments (id, child_id, user_id, created_by, sync_status) values ('cea-3', 'child-3', 'user-1', 'user-1', 'synced')`);
    const outboxRepository = createSyncOutboxRepository({ database: db });
    const record = { table_name: 'session_attendees', record_id: 'sa-9', payload: { id: 'sa-9', child_id: 'child-3', session_id: 's-9' } };
    expect(await _testComputeEvidencePending({ database: db, outboxRepository, outboxRecord: record, includeGrant: true })).toBe(false);
  });
});
```

(Adjust seed column lists to the real schema via `src/db/migrations.js`; the point is that `assessments` requires `user_id`/`programme_id`/`assessment_type`/`assessment_date` and has no `created_by`.)

- [ ] **Step 2: Run to verify they fail**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/offlineSyncOutbox.test.js -t 'computeEvidencePending' --verbose
```

Expected: FAIL — `_testComputeEvidencePending` is undefined.

- [ ] **Step 3: Implement the helpers**

In `src/services/offlineSync.js`, near the evidence maps:

```javascript
// Resolve an FK/subject value from the outbox payload first, then the record's own local
// domain row (archive/update payloads carry only id + a timestamp). Local state only; the
// domain row is fetched at most once, lazily.
const makeFieldResolver = (database, outboxRecord) => {
  const payload = outboxRecord?.payload || {};
  let domainRow;
  let fetched = false;
  return async (column) => {
    if (payload[column] != null) return payload[column];
    if (!fetched) {
      fetched = true;
      try {
        domainRow = await database.getFirstAsync(
          `select * from ${quoteIdentifier(outboxRecord.table_name)} where id = ?`,
          outboxRecord.record_id,
        );
      } catch (_) { domainRow = null; }
    }
    return domainRow?.[column] ?? null;
  };
};

const hasPendingActiveAssignment = async (database, grantTable, subjectColumn, subjectValue) => {
  const row = await database.getFirstAsync(
    `select 1 as present from ${quoteIdentifier(grantTable)}
       where ${quoteIdentifier(subjectColumn)} = ?
         and unassigned_at is null
         and sync_status in ('pending', 'failed', 'in_flight')
       limit 1`,
    subjectValue,
  );
  return !!row;
};

// True when the record still has locally-pending evidence it legitimately needs: its FK
// parent (for 23503 and the created_by half of 42501 grants) or, when includeGrant is set
// (42501 only), an active assignment grant that has not synced. No server calls.
const computeEvidencePending = async ({ database, outboxRepository, outboxRecord, includeGrant }) => {
  const table = normalizeTableName(outboxRecord?.table_name);
  const getField = makeFieldResolver(database, outboxRecord);

  const fkColumns = PARENT_FK_COLUMNS[table] || {};
  for (const [parentTable, column] of Object.entries(fkColumns)) {
    const recordId = await getField(column);
    if (recordId && await outboxRepository.hasPendingRecord({ tableName: parentTable, recordId })) {
      return true;
    }
  }

  if (includeGrant) {
    const grants = GRANT_SUBJECTS[table] || [];
    for (const { grantTable, subjectColumn } of grants) {
      const subjectValue = await getField(subjectColumn);
      if (subjectValue && await hasPendingActiveAssignment(database, grantTable, subjectColumn, subjectValue)) {
        return true;
      }
    }
  }

  return false;
};

export const _testComputeEvidencePending = computeEvidencePending;
```

- [ ] **Step 4: Run to verify they pass**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/offlineSyncOutbox.test.js -t 'computeEvidencePending' --verbose
```

Expected: PASS (all four). Fix seed columns against the real schema if an insert throws.

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineSync.js __tests__/offlineSyncOutbox.test.js
git commit -m "feat(sync): computeEvidencePending combines FK-parent and assignment-grant evidence (#48)"
```

---

### Task 5: Wire evidence into `classifyError` and the loop (#48 part 2 behavior)

**The change:** `classifyError` gains `(error, config, { parentEvidencePending })`; for `23503`/`42501` it returns `{ terminal: !parentEvidencePending }`. The loop computes the flag before classifying: FK-parent only for `23503`, FK-parent OR grant for `42501`. This composes with the existing #43 no-session `42501` downgrade (`:764-776`): a `42501` already made retriable by pending evidence skips that block; an otherwise-terminal `42501` is still downgraded when no session exists, else stamped `AUTHENTICATED_DENIAL_MARKER`.

**Files:**
- Modify: `src/services/offlineSync.js` (`classifyError`; the loop at `:761`)
- Test: Modify `__tests__/classifyErrorHardening.test.js` (unit, four combos)
- Test: Modify `__tests__/offlineSyncOutbox.test.js` (integration; R5-correct arrangement + AC2 second pass)

**Interfaces:**
- Consumes: `computeEvidencePending` (Task 4), `getAuthSession`, `AUTHENTICATED_DENIAL_MARKER` (`:292`).
- Produces: `classifyError(error, config, { parentEvidencePending })` — `23503`/`42501` return `{ terminal: !parentEvidencePending, markAsSynced: false }`; all other branches unchanged; two-arg callers still work (`parentEvidencePending` defaults false).

- [ ] **Step 1: Write the failing unit tests (four combos of the pure classifier)**

Add to `__tests__/classifyErrorHardening.test.js`:

```javascript
describe('classifyError — evidence-pending downgrade for 42501/23503 (#48 part 2)', () => {
  test('23503 retriable when evidence pending, terminal otherwise', () => {
    expect(_testClassifyError({ code: '23503' }, { tableName: 'assessment_items' }, { parentEvidencePending: true }).terminal).toBe(false);
    expect(_testClassifyError({ code: '23503' }, { tableName: 'assessment_items' }, { parentEvidencePending: false }).terminal).toBe(true);
  });
  test('42501 retriable when evidence pending, terminal otherwise', () => {
    expect(_testClassifyError({ code: '42501' }, { tableName: 'session_attendees' }, { parentEvidencePending: true }).terminal).toBe(false);
    expect(_testClassifyError({ code: '42501' }, { tableName: 'session_attendees' }, { parentEvidencePending: false }).terminal).toBe(true);
  });
  test('context defaults to not-pending (back-compatible with two-arg callers)', () => {
    expect(_testClassifyError({ code: '23503' }, { tableName: 'assessment_items' }).terminal).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/classifyErrorHardening.test.js -t 'evidence-pending downgrade' --verbose
```

Expected: FAIL — the `parentEvidencePending: true` cases still return terminal.

- [ ] **Step 3: Extend `classifyError`**

```javascript
const classifyError = (
  error,
  { duplicateIsSuccess = false, tableName } = {},
  { parentEvidencePending = false } = {},
) => {
  const code = error?.code;

  if (code === '23514' && IMMUTABLE_ASSIGNMENT_TABLES.has(normalizeTableName(tableName))) {
    return { terminal: true, markAsSynced: false, reason: 'Immutable identity columns rejected the update (23514)' };
  }

  if (code === '23505') {
    return { terminal: true, markAsSynced: duplicateIsSuccess };
  }

  if (code === '23503' || code === '42501') {
    // A FK/RLS denial while the record's required evidence (FK parent for 23503; parent OR
    // assignment grant for 42501) is still pending locally is a cross-pass race, not a
    // genuine rejection: retry once the evidence lands. No pending evidence -> real denial.
    // The 42501 no-session downgrade still runs in the loop after this decision.
    return { terminal: !parentEvidencePending, markAsSynced: false };
  }

  if (
    code === 'ARCHIVE_REQUIRED'
    || code === 'LOCAL_ONLY_REFERENCE'
    || code === 'MISSING_OUTBOX_PAYLOAD'
  ) {
    return { terminal: true, markAsSynced: false };
  }

  return { terminal: false, markAsSynced: false };
};
```

- [ ] **Step 4: Wire the loop to compute and pass the flag**

Replace the classifier call site (`:761`, after Task 1 it reads the reason-compose block). Compute the flag only for the two codes:

```javascript
      const failureCode = serverResult.error?.code;
      const parentEvidencePending = (failureCode === '23503' || failureCode === '42501')
        ? await computeEvidencePending({
            database,
            outboxRepository,
            outboxRecord: inFlightRecord,
            includeGrant: failureCode === '42501',
          })
        : false;
      const classification = classifyError(serverResult.error, config, { parentEvidencePending });
      let reason = errorMessage(serverResult.error);
      if (classification.reason) {
        reason = `${classification.reason}: ${reason}`;
      }
      if (parentEvidencePending) {
        // Observability: a support log makes it visible which retriable rows are waiting on
        // still-pending local evidence rather than genuinely failing (ZZ trust-in-sync lesson).
        console.log(`Sync retry deferred: ${config.tableName}:${inFlightRecord.record_id} awaiting pending local evidence (${failureCode})`);
      }
```

Leave the existing `42501` no-session block (`:764-776`) unchanged.

- [ ] **Step 5: Run the unit tests to verify they pass**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/classifyErrorHardening.test.js --verbose
```

Expected: PASS (all classifier tests).

- [ ] **Step 6: Write the failing integration tests (R5-correct: single-table pass so the parent survives)**

In `__tests__/offlineSyncOutbox.test.js`. The key to genuinely exercising the pending path (per both reviewers) is to process ONLY the child table via `syncAll({ tableName })`, so the parent is never processed, its `pending` outbox row survives, and the child reaches the server with the parent still pending. `createSupabaseMock` returns `42501` for the child.

```javascript
  test('AC2: a 42501 stays retriable while its FK parent is pending, then succeeds after the parent syncs (#48)', async () => {
    await seedReferences(db);
    await db.runAsync(`insert into assessments (id, child_id, user_id, programme_id, assessment_type, assessment_date, sync_status) values ('asmt-1', 'child-1', 'user-1', 'prog-1', 'egra', '2026-07-08', 'pending')`);
    await enqueue(db, 'assessments', 'asmt-1', 'insert', { id: 'asmt-1', child_id: 'child-1', user_id: 'user-1', programme_id: 'prog-1' });
    await db.runAsync(`insert into assessment_items (id, assessment_id, sync_status) values ('ai-1', 'asmt-1', 'pending')`);
    await enqueue(db, 'assessment_items', 'ai-1', 'insert', { id: 'ai-1', assessment_id: 'asmt-1' });

    let denyItem = true;
    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        assessment_items: () => (denyItem ? { error: { code: '42501', message: 'row-level security' } } : { error: null }),
        assessments: { error: null },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    // Pass 1: process ONLY the child so the parent stays pending in the outbox.
    await engine.syncAll({ tableName: 'assessment_items' });
    let item = await db.getFirstAsync(`select status, last_error from sync_outbox where record_id = 'ai-1'`);
    expect(item.status).toBe('failed');                    // retriable, NOT terminal
    expect(item.last_error || '').not.toContain(AUTHENTICATED_DENIAL_MARKER);

    // Pass 2: parent syncs, item now accepted -> AC2 "succeeds on a later pass".
    denyItem = false;
    await engine.syncAll({ force: true });                 // force clears backoff; parent + item both go
    item = await db.getFirstAsync(`select id from sync_outbox where record_id = 'ai-1'`);
    expect(item).toBeFalsy();                              // synced rows are deleted
  });

  test('a 42501 with a live session and no pending evidence is terminal and marked (#48)', async () => {
    await seedReferences(db);
    await db.runAsync(`insert into assessments (id, child_id, user_id, programme_id, assessment_type, assessment_date, sync_status) values ('asmt-2', 'child-1', 'user-1', 'prog-1', 'egra', '2026-07-08', 'synced')`);
    await db.runAsync(`insert into child_ea_assignments (id, child_id, user_id, created_by, sync_status) values ('cea-2', 'child-1', 'user-1', 'user-1', 'synced')`);
    await db.runAsync(`insert into assessment_items (id, assessment_id, sync_status) values ('ai-2', 'asmt-2', 'pending')`);
    await enqueue(db, 'assessment_items', 'ai-2', 'insert', { id: 'ai-2', assessment_id: 'asmt-2' });

    const { supabaseClient } = createSupabaseMock({
      upsertResults: { assessment_items: { error: { code: '42501', message: 'row-level security' } } },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });
    await engine.syncAll({ tableName: 'assessment_items' });

    const item = await db.getFirstAsync(`select status, last_error from sync_outbox where record_id = 'ai-2'`);
    expect(item.status).toBe('terminal');
    expect(item.last_error).toContain(AUTHENTICATED_DENIAL_MARKER);
  });

  test('a 42501 stays retriable while the granting child_ea_assignment is unsynced (#48)', async () => {
    await seedReferences(db);
    await db.runAsync(`insert into assessments (id, child_id, user_id, programme_id, assessment_type, assessment_date, sync_status) values ('asmt-3', 'child-1', 'user-1', 'prog-1', 'egra', '2026-07-08', 'synced')`);
    // grant assignment still pending -> the 42501 is the grant race, retriable
    await db.runAsync(`insert into child_ea_assignments (id, child_id, user_id, created_by, sync_status) values ('cea-3', 'child-1', 'user-1', 'user-1', 'pending')`);
    await db.runAsync(`insert into assessment_items (id, assessment_id, sync_status) values ('ai-3', 'asmt-3', 'pending')`);
    // assessment_items has no child_id, so its grant comes via the FK parent assessment.
    // Use a child-scoped table (session_attendees) to exercise the grant path directly:
    await db.runAsync(`insert into session_attendees (id, session_id, child_id, sync_status) values ('sa-3', 's-1', 'child-1', 'pending')`);
    await enqueue(db, 'session_attendees', 'sa-3', 'insert', { id: 'sa-3', session_id: 's-1', child_id: 'child-1' });

    const { supabaseClient } = createSupabaseMock({
      upsertResults: { session_attendees: { error: { code: '42501', message: 'row-level security' } } },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });
    await engine.syncAll({ tableName: 'session_attendees' });

    const row = await db.getFirstAsync(`select status, last_error from sync_outbox where record_id = 'sa-3'`);
    expect(row.status).toBe('failed');
    expect(row.last_error || '').not.toContain(AUTHENTICATED_DENIAL_MARKER);
  });
```

(Seed `sessions`/`children`/etc. via the suite's `seedReferences`; adjust column lists to `src/db/migrations.js`.)

- [ ] **Step 7: Run to verify, iterate, pass**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/offlineSyncOutbox.test.js -t '42501|AC2' --verbose
```

Expected: PASS all three.

- [ ] **Step 8: Commit**

```bash
git add src/services/offlineSync.js __tests__/classifyErrorHardening.test.js __tests__/offlineSyncOutbox.test.js
git commit -m "feat(sync): retry 42501/23503 while required local evidence is pending, terminal otherwise (#48)"
```

---

### Task 6: Full regression sweep

**The need:** Part 2 changed the `42501`/`23503` terminal decision that #43's gate and #44's heal depend on. Prove nothing regressed.

**Files:** none (verification only).

- [ ] **Step 1: Run the sync-classification suites**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest \
  __tests__/classifyErrorHardening.test.js \
  __tests__/offlineSyncOutbox.test.js \
  __tests__/syncOutboxRepository.test.js \
  __tests__/requeueTerminalRlsFailures.test.js \
  __tests__/offlineSyncAuthGate.test.js \
  __tests__/letterMasterySync.test.js \
  --verbose
```

Expected: PASS. If a pre-existing test seeded a `42501` whose parent/grant happens to be pending and asserted terminal, it now (correctly) classifies retriable — update that fixture only after confirming the new outcome is intended; do not weaken an assertion blindly.

- [ ] **Step 2: Run the integration config**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration
```

Expected: the file-backed SQLite integration slice passes.

- [ ] **Step 3: Commit only if a fixture needed adjusting**

```bash
git add __tests__/<adjusted-file>.test.js
git commit -m "test(sync): align 42501 fixtures with evidence-pending classification (#48)"
```

---

### Task 7: Contract map + refactor log

**Files:**
- Modify: `documentation/rls-sync-contract-map.md`
- Modify: `documentation/sqlite-refactor-log.md`

- [ ] **Step 1: Add Global Contract list item 10**

Under `## Global Contracts`, append as numbered item `10.` (matching the file's list style, not a `###` header):

```markdown
10. **Error classification is local-state-only and never loops forever.** `23514` from the identity-immutability triggers on the immutable-assignment tables (`child_ea_assignments`, `class_ea_assignments`, `group_ea_assignments`) is terminal with the reason `Immutable identity columns rejected the update (23514)` (the insert path already avoids it via `ignoreDuplicates`; this covers archive/update re-pushes). `23503` is retriable while the FK parent is pending in the outbox (`hasPendingRecord`, status `pending`/`failed`/`in_flight`), terminal otherwise. `42501` is retriable while the FK parent OR the RLS assignment grant is pending locally, terminal otherwise: grant evidence is an active (`unassigned_at is null`), unsynced row in `child_ea_assignments`/`class_ea_assignments`/`group_ea_assignments` for the record's subject (`PARENT_FK_COLUMNS` + `GRANT_SUBJECTS`, grounded in `private.current_user_can_write_for_*`). All evidence resolves from the outbox payload then the local domain row; no server calls in the per-record failure path. The `42501` no-session downgrade (contract for #43) still applies to an otherwise-terminal `42501`.
   - Known limitations: `staff_programme_assignments` grants are not device-produced, so a `42501` requiring one stays terminal (correct). A parent/grant that heals via #44 after its child was already stamped terminal does not auto-rescue the child (identical to pre-#48 behavior); force "Sync Now" resurrects it. Non-immutable-table `23514` (generic CHECK violations, e.g. an age check) still retries; scoping it is a follow-up.
```

- [ ] **Step 2: Update the Operation Semantics table**

Update/add the `23514`, `23503`, `42501` rows to match item 10. Keep the table shape.

- [ ] **Step 3: Add the refactor-log entry**

Append to `documentation/sqlite-refactor-log.md`:

```markdown
## 2026-07-08 — classifyError hardening (#48)

- `23514` on immutable-assignment tables now terminal with a readable reason (was retried forever — ZZ Finding 4 "adjacent trap").
- `23503`/`42501` now retry while required local evidence is pending, terminal otherwise (ZZ F10). Evidence = FK parent (outbox `hasPendingRecord`) for both codes, plus, for `42501`, an unsynced active assignment grant (`child_ea`/`class_ea`/`group_ea` by subject id) grounded in the verified `current_user_can_write_for_*` RLS functions. Values resolve from payload then local domain row (fixes archive/update payloads that carry only id).
- New machinery: `PARENT_FK_COLUMNS`, `GRANT_SUBJECTS`, `syncOutboxRepository.hasPendingRecord`, `computeEvidencePending`. Classifier stays a pure sync function (3rd arg `{ parentEvidencePending }`); async lookups live in the loop.
- Scope (ratified with Jim 2026-07-08): grant-evidence is IN #48 (AC2 says parent/assignment). Separate from #47's 23505 collision-proofing. `staff_programme_assignments` excluded (reference data). Tests: `classifyErrorHardening.test.js` (new) + integration in `offlineSyncOutbox.test.js`/`syncOutboxRepository.test.js`. Full sync-reliability slice green.
```

- [ ] **Step 4: Commit**

```bash
git add documentation/rls-sync-contract-map.md documentation/sqlite-refactor-log.md
git commit -m "docs(sync): contract map + log for classifyError hardening (#48)"
```

---

## Adversarial review dispositions (two independent Opus reviews, both verified against the tree 2026-07-08)

- **R1 (blocker) — FK-parent-only misses `42501` assignment-grant races. ACCEPTED, folded.** Verified: `current_user_can_write_for_child/class/group` (migration `20260521144901:368-517`) grant via active `child_ea`/`class_ea`/`group_ea` assignments, not the FK parent. Fix: `GRANT_SUBJECTS` map + grant-evidence branch (Tasks 2, 4, 5), scope ratified with Jim. `groups` excluded after confirming its insert gates on `created_by` + `staff_programme_assignments` (no device assignment grant). `staff_programme_assignments` excluded as reference data.
- **R2 (should-fix/nice-to-have) — terminal-but-healable parent orphan. ACCEPTED as documented limitation.** Verified not a regression (identical to pre-#48). Folded as a known-limitation line in Global Contract 10 (Task 7); a cascade-rescue belongs with #44/#47, not the classifier.
- **R3 (nice-to-have) — test all four no-session x evidence combos. ACCEPTED.** The two new evidence-pending combos are covered by Task 5 unit + integration tests; the two no-parent combos are covered by existing `offlineSyncAuthGate.test.js`.
- **R4 (should-fix) — `PARENT_FK_COLUMNS` missing grouping-version edges. ACCEPTED.** Verified `grouping_version_id` is pushed for `groups` (`:113`) and `child_group_memberships` (`:122`). Added both `-> grouping_versions` edges (Task 2); drift guard relaxed to coverage (superset), not equality.
- **R5 (blocker) — Task 4 integration test could not exercise the pending path. ACCEPTED.** Verified `syncTableByName`/`syncAll({tableName})` exist (`:909,:1083`) and the `failedTables`/`skippedDependency` skip (`:1001`) would drop a same-pass-failing parent's child before classification. Fix: Task 5 Step 6 processes ONLY the child via `syncAll({ tableName })` so the parent stays pending; adds the AC2 second-pass "succeeds later" assertion.
- **R6 (nice-to-have) — cycle/retry-storm + observability. ACCEPTED.** No same-table edge (Task 2 guard); single-level lookup; backoff capped at 15 min. Added a support log line when a row defers on pending evidence (Task 5 Step 4).
- **R7 (sound) — `last_error`/#44 heal interaction. CONFIRMED SAFE, guarded.** The `23514` reason contains neither `42501` nor `row-level security`; a regression assertion is in Task 1 Step 1.
- **R8 (should-fix) — concrete defects. ACCEPTED.** `markTerminalFailure(id, { errorMessage })` (Task 3); `assessments` seeds use `user_id`/`programme_id`/`assessment_type`/`assessment_date`, no `created_by` (Tasks 4-5); domain-row fallback for archive/update payloads via `makeFieldResolver` (Task 4); Global Contract added as list item 10, not a `###` header (Task 7); `IMMUTABLE_ASSIGNMENT_TABLES` line ref corrected to `:217-221` (Task 1). Non-immutable-`23514` follow-up noted in the contract map limitations.

## Self-Review (completed at authoring time)

- **Spec coverage:** AC1 (23514 terminal, readable reason) -> Task 1. AC2 (42501/23503 retriable when evidence pending, succeeds later) -> Tasks 2-5 (Task 5 Step 6 proves the second pass). AC3 (42501 live session + no pending evidence stays terminal) -> Task 5 Step 6 (second test). AC4 (local state only) -> Tasks 3-4 (outbox + domain queries; classifier pure). Contract map -> Task 7.
- **Placeholder scan:** none; every code step carries complete code. Seed-column adjustments point at `src/db/migrations.js` as the authority.
- **Type consistency:** `classifyError(error, config, { parentEvidencePending })` matches its Task 5 call site; `computeEvidencePending({ database, outboxRepository, outboxRecord, includeGrant })` matches Task 4 export and Task 5 call; `hasPendingRecord({ tableName, recordId })` and `hasPendingActiveAssignment(database, grantTable, subjectColumn, subjectValue)` parameter names consistent across tasks; `_testClassifyError`, `_testEvidenceMaps`, `_testComputeEvidencePending` exported and consumed in the same tasks.
