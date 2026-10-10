# Upload-Path Correctness Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repository the implementer for each task is **Codex through the plugin** (gpt-5.6-sol); Claude reviews each task's diff and test output before the next task starts (AGENTS.md, "When Building").

**Goal:** Make every upload operation ask the server for exactly the permission it needs. Edits go as UPDATE by id, zero-row results are classified by real evidence, an edit never overtakes its own insert, and a reactivated group assignment actually reactivates on the server.

**Architecture:** All changes sit in the sync engine's server-operation layer (`src/services/offlineSync.js`), one outbox-repository query, and the group-assignment producer (`src/db/repositories/groupsRepository.js`). No schema change and no hosted change. A new migration-replay Postgres harness (S1) proves the server half before any app code changes.

**Tech Stack:** React Native / Expo app code in JavaScript; Jest with real SQLite through better-sqlite3 (`test-support/betterSqliteAdapter`); PostgreSQL 17 disposable harness driven by `psql`.

**Spec:** [`docs/superpowers/specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md`](../specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md), sections 1 (live defect 1, server half), 6.5, 6.5a, 6.5b, and 6.6; tests S1, T17, T21, and T22.

**Plan series:** This is Plan 1. Plan 2 (signed-in EA handle: per-EA files, per-handle data client and queue, fencing, module state, owner stamping, integrity scan; spec §4–§6.4) and Plan 3 (sign-out questions and the minimal incident envelope; spec §7) are written after this plan lands, against the code it leaves.

**What this plan does not fix on its own:** live defect 1 has two halves. This plan fixes the server half. The phone half (the outbox owner is derived from `created_by`, so the edit is never selected for upload) is fixed by Plan 2's owner stamping. A device test of "edit a Head Office-created child" will therefore still fail after this plan, and should only be run as a gate after Plan 2.

## Global Constraints

- Run Jest under Node 20: prefix every Jest command with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Stay on npm; add no dependencies.
- No migration, no hosted apply, and no write to `masi-app-sqlite` (`segygjzpujphwvrubusm`) without Jim's explicit yes. Never touch the legacy backend `jcqrlwetutnpuchjoyyd`.
- Never run raw `supabase` CLI commands from the repository root; never source `.env.local`.
- Commit messages carry no agent co-author trailer.
- Never use bare `git stash`; use a WIP commit to set work aside.
- SQLite behaviour is tested against real SQLite (better-sqlite3), not mocks.
- Update `documentation/rls-sync-contract-map.md` and `documentation/build-log.md` in this branch (anti-drift rule).

## Review Focus

These inputs are implied by the spec but easy to miss. Each line names the task whose tests pin it.

1. **Offline create, then edit of the same child before the first sync.** Both an `insert` and an `update` row are pending for one id. Expected: the update waits until the insert is acknowledged, then goes as UPDATE. It is never sent in the same upsert batch as the insert. Pinned in Task 4.
2. **Reading-level change for a child whose only write grant is through a class or group, while the membership is still pending.** Expected: the zero-row UPDATE stays retriable and uploads after the membership lands and its backoff expires, with no manual step. Pinned in Task 3.
3. **An edit after Head Office has ended the EA's assignment on the server, with nothing pending locally.** Expected: terminal `UPDATE_NOT_APPLIED` with a readable reason on the needs-attention card, never silent success. Pinned in Task 3.
4. **A pre-fix `letter_mastery` row whose local id is random.** Expected: the UPDATE targets the re-derived deterministic id, not the outbox `record_id`. Pinned in Task 2.
5. **Reactivate, archive, and reactivate a group assignment again while offline.** Expected: the server ends active, with at most one lifecycle row queued per assignment. Pinned in Task 5.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `scripts/upload-contract-postgres-harness.cjs` | S1: replays every migration into a disposable PostgreSQL and proves the upsert-versus-UPDATE contract per table | Create |
| `scripts/history-authorization-postgres-harness.cjs` | Existing harness; exports its psql helpers for reuse | Modify (exports only) |
| `package.json` | `verify:upload-contract:postgres` script | Modify |
| `.github/workflows/tests.yml` | Runs S1 in CI next to the history harness | Modify |
| `test-support/supabaseSyncMock.js` | The fake Supabase client used by sync tests, moved out of one test file so new test files share it | Create (moved) |
| `__tests__/offlineSyncOutbox.test.js` | Imports the moved fake; one existing test updated for the new batching rule | Modify |
| `__tests__/offlineSyncUpdateById.test.js` | Tests for Tasks 2–4 | Create |
| `__tests__/groupAssignmentLifecycle.test.js` | Tests for Task 5 | Create |
| `src/services/offlineSync.js` | UPDATE-by-id path, batching rule, evidence resolver, classification, same-record gate, `restore` lifecycle operation | Modify |
| `src/db/repositories/syncOutboxRepository.js` | `hasPendingOperation` query | Modify |
| `src/db/repositories/domainRepositoryUtils.js` | `enqueueLifecycleOutbox` helper | Modify |
| `src/db/repositories/groupsRepository.js` | Reactivation and archive cascade use lifecycle operations | Modify |
| `documentation/rls-sync-contract-map.md`, `documentation/build-log.md`, `documentation/ROADMAP.md`, `docs/agent-context/actor-lifecycle-and-upload-defects.md` | Contract and status | Modify |

---

### Task 0: Implementation worktree and branch

**Files:** none changed.

PR #60 (`feat/cap-004-session-history-hydration`) is still open and rewrites the Postgres harness that S1 builds on, so this branch starts from PR #60's head, not `main`. When PR #60 merges, rebase onto `main`.

- [ ] **Step 1: Create the worktree from PR #60's head and bring in the spec and plan**

Use the superpowers:using-git-worktrees skill. Then, from the new worktree:

```bash
git fetch origin
git switch -c feat/upload-path-correctness origin/feat/cap-004-session-history-hydration
git merge --no-ff origin/docs/zazi-foundations-review-20261008 -m "Merge the actor lifecycle spec and Plan 1 into the build branch"
```

If `documentation/build-log.md` conflicts, keep both sides' rows in commit order.

- [ ] **Step 2: Confirm a green baseline**

```bash
npm ci
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --silent
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --silent
```

Expected: all suites pass. Record the counts; Task 6 compares against them.

---

### Task 1: S1, the server proof in the migration-replay harness

**Files:**
- Create: `scripts/upload-contract-postgres-harness.cjs`
- Modify: `scripts/history-authorization-postgres-harness.cjs` (the `module.exports` block at the end of the file)
- Modify: `package.json` (`scripts`)
- Modify: `.github/workflows/tests.yml`

**Interfaces:**
- Consumes: `assertDisposableAdminTarget`, `buildDatabaseUrl`, `bootstrapSql`, `runPsql`, `expectSqlState`, `MIGRATIONS_DIR` from the history harness.
- Produces: `npm run verify:upload-contract:postgres`, which exits 0 and prints a JSON summary when every assertion holds.

This task proves facts about the current migrations. It passes without app changes, and that is the point: it gates the design before Tasks 2–5 build on it. If any assertion fails, **stop and report to Jim**; a legitimate edit would then need a policy change, which is outside this plan.

- [ ] **Step 1: Export the psql helpers from the history harness**

In `scripts/history-authorization-postgres-harness.cjs`, extend the existing `module.exports` object:

```js
module.exports = {
  DISPOSABLE_CONFIRMATION,
  DISPOSABLE_DATABASE_PREFIX,
  MIGRATIONS_DIR,
  PLAN_FIXTURE_SESSION_COUNT,
  assertDisposableAdminTarget,
  buildDatabaseUrl,
  buildPsqlEnv,
  bootstrapSql,
  collectPlanMetrics,
  expectSqlState,
  runPsql,
};
```

- [ ] **Step 2: Write the harness**

Create `scripts/upload-contract-postgres-harness.cjs`:

```js
#!/usr/bin/env node

// S1 (actor lifecycle spec §6.6): proves the upload contract against the real migrations.
// PostgreSQL checks INSERT WITH CHECK on every INSERT ... ON CONFLICT DO UPDATE row, even when
// it conflicts, so an upsert of a Head Office-created row fails for an editing EA, while a
// plain UPDATE by id passes the UPDATE policy. Each case runs in its own transaction and rolls
// back, so cases never affect each other.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MIGRATIONS_DIR,
  assertDisposableAdminTarget,
  bootstrapSql,
  buildDatabaseUrl,
  expectSqlState,
  runPsql,
} = require('./history-authorization-postgres-harness.cjs');

const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const HEAD_OFFICE = '11000000-0000-0000-0000-000000000001';
const ASSIGNED_EA = '11000000-0000-0000-0000-000000000002';
const UNASSIGNED_EA = '11000000-0000-0000-0000-000000000003';
const SCHOOL = '21000000-0000-0000-0000-000000000001';
const CLASS = '41000000-0000-0000-0000-000000000001';
const CHILD = '51000000-0000-0000-0000-000000000001';
const GROUP = '72100000-0000-0000-0000-000000000001';
const GROUP_ASSIGNMENT = '74100000-0000-0000-0000-000000000001';
const MASTERY = '75100000-0000-0000-0000-000000000001';
const TIME_ENTRY = '76100000-0000-0000-0000-000000000001';
const NEW_CHILD = '51000000-0000-0000-0000-000000000099';
const PROGRAMME = "(SELECT id FROM public.programmes WHERE code = 'literacy')";
const ACTIVE_YEAR = '(SELECT id FROM public.academic_years WHERE is_active)';

const fixtureSql = `
INSERT INTO auth.users (id) VALUES ('${HEAD_OFFICE}'), ('${ASSIGNED_EA}'), ('${UNASSIGNED_EA}');
INSERT INTO public.schools (id, name) VALUES ('${SCHOOL}', 'Upload contract harness school');
INSERT INTO public.users (id, first_name, last_name, school_id) VALUES
  ('${HEAD_OFFICE}', 'Head', 'Office', '${SCHOOL}'),
  ('${ASSIGNED_EA}', 'Assigned', 'EA', '${SCHOOL}'),
  ('${UNASSIGNED_EA}', 'Unassigned', 'EA', '${SCHOOL}');
INSERT INTO public.staff_programme_assignments (id, user_id, programme_id, school_id) VALUES
  ('31000000-0000-0000-0000-000000000002', '${ASSIGNED_EA}', ${PROGRAMME}, '${SCHOOL}'),
  ('31000000-0000-0000-0000-000000000003', '${UNASSIGNED_EA}', ${PROGRAMME}, '${SCHOOL}');
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by)
VALUES ('${CLASS}', '${SCHOOL}', 'Head Office class', '1', ${ACTIVE_YEAR}, '${HEAD_OFFICE}');
INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by)
VALUES ('71100000-0000-0000-0000-000000000001', '${CLASS}', '${ASSIGNED_EA}', ${PROGRAMME}, '${HEAD_OFFICE}');
INSERT INTO public.children (id, first_name, last_name, class_id, created_by, reading_level)
VALUES ('${CHILD}', 'Harness', 'Child', '${CLASS}', '${HEAD_OFFICE}', 'letters');
INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by)
VALUES ('71200000-0000-0000-0000-000000000001', '${ASSIGNED_EA}', '${CHILD}', '${HEAD_OFFICE}');
INSERT INTO public.groups (id, name, programme_id, class_id, created_by)
VALUES ('${GROUP}', 'Head Office group', ${PROGRAMME}, '${CLASS}', '${HEAD_OFFICE}');
INSERT INTO public.group_ea_assignments (
  id, group_id, ea_user_id, programme_id, created_by, unassigned_at, handover_reason
) VALUES (
  '${GROUP_ASSIGNMENT}', '${GROUP}', '${ASSIGNED_EA}', ${PROGRAMME}, '${HEAD_OFFICE}',
  pg_catalog.now(), 'harness archive'
);
INSERT INTO public.letter_mastery (id, user_id, child_id, programme_id, letter, language, source, deleted_at)
VALUES ('${MASTERY}', '${ASSIGNED_EA}', '${CHILD}', ${PROGRAMME}, 'a', 'isiXhosa', 'taught', pg_catalog.now());
INSERT INTO public.time_entries (id, user_id, sign_in_time, sign_in_lat, sign_in_lon)
VALUES ('${TIME_ENTRY}', '${ASSIGNED_EA}', pg_catalog.now(), -33.96, 25.6);
`;

// Runs one statement as an authenticated actor inside a transaction that always rolls back.
const asActor = (actorId, statement) => `
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actorId}';
${statement}
ROLLBACK;
`;

const returnedIds = (output) => output.split('\n').map((line) => line.trim()).filter(Boolean);

// PostgREST's upsert (Prefer: resolution=merge-duplicates) for the mobile payload shape.
const upsertSql = (table, columns, values) => `
INSERT INTO public.${table} (${columns.join(', ')})
VALUES (${values.join(', ')})
ON CONFLICT (id) DO UPDATE SET ${columns.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ')};
`;

// PostgREST's update(...).eq('id', ...).select('id').
const updateByIdSql = (table, assignments, id) => `
UPDATE public.${table} SET ${assignments} WHERE id = '${id}' RETURNING id;
`;

const CASES = [
  {
    table: 'children',
    headOfficeCreated: true,
    upsert: upsertSql(
      'children',
      ['id', 'first_name', 'last_name', 'class_id', 'created_by', 'reading_level'],
      [`'${CHILD}'`, "'Harness'", "'Child'", `'${CLASS}'`, `'${HEAD_OFFICE}'`, "'words'"],
    ),
    update: updateByIdSql('children', "reading_level = 'words'", CHILD),
    id: CHILD,
    impersonatingInsert: `INSERT INTO public.children (id, first_name, last_name, class_id, created_by)
      VALUES ('${NEW_CHILD}', 'Fake', 'Child', '${CLASS}', '${HEAD_OFFICE}');`,
  },
  {
    table: 'classes',
    headOfficeCreated: true,
    upsert: upsertSql(
      'classes',
      ['id', 'school_id', 'name', 'grade', 'academic_year_id', 'created_by'],
      [`'${CLASS}'`, `'${SCHOOL}'`, "'Renamed by EA'", "'1'", ACTIVE_YEAR, `'${HEAD_OFFICE}'`],
    ),
    update: updateByIdSql('classes', "name = 'Renamed by EA'", CLASS),
    id: CLASS,
    impersonatingInsert: `INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by)
      VALUES ('41000000-0000-0000-0000-000000000099', '${SCHOOL}', 'Fake', '1', ${ACTIVE_YEAR}, '${HEAD_OFFICE}');`,
  },
  {
    table: 'groups',
    headOfficeCreated: true,
    upsert: upsertSql(
      'groups',
      ['id', 'name', 'programme_id', 'class_id', 'created_by'],
      [`'${GROUP}'`, "'Renamed group'", PROGRAMME, `'${CLASS}'`, `'${HEAD_OFFICE}'`],
    ),
    update: updateByIdSql('groups', "name = 'Renamed group'", GROUP),
    id: GROUP,
    impersonatingInsert: `INSERT INTO public.groups (id, name, programme_id, class_id, created_by)
      VALUES ('72100000-0000-0000-0000-000000000099', 'Fake', ${PROGRAMME}, '${CLASS}', '${HEAD_OFFICE}');`,
  },
  {
    table: 'letter_mastery',
    headOfficeCreated: false,
    update: updateByIdSql('letter_mastery', 'deleted_at = NULL', MASTERY),
    id: MASTERY,
  },
  {
    table: 'time_entries',
    headOfficeCreated: false,
    update: updateByIdSql('time_entries', 'sign_out_time = pg_catalog.now()', TIME_ENTRY),
    id: TIME_ENTRY,
  },
  {
    table: 'group_ea_assignments (restore)',
    headOfficeCreated: false,
    update: updateByIdSql(
      'group_ea_assignments',
      'unassigned_at = NULL, handover_reason = NULL',
      GROUP_ASSIGNMENT,
    ),
    id: GROUP_ASSIGNMENT,
  },
];

const runCases = (databaseUrl) => {
  const summary = {};
  for (const testCase of CASES) {
    const label = testCase.table.replace(/\W+/g, '-');
    if (testCase.headOfficeCreated) {
      // 1. Red today: the upsert the app sends now is refused by the INSERT policy.
      expectSqlState({
        databaseUrl,
        sql: asActor(ASSIGNED_EA, testCase.upsert),
        label: `${label}-upsert-refused`,
        sqlState: '42501',
      });
      // 4. Impersonation: an EA cannot create a row in Head Office's name.
      expectSqlState({
        databaseUrl,
        sql: asActor(ASSIGNED_EA, testCase.impersonatingInsert),
        label: `${label}-impersonation-refused`,
        sqlState: '42501',
      });
    }
    // 2. Green with spec §6.5: UPDATE by id acknowledges exactly one row.
    assert.deepEqual(
      returnedIds(runPsql({ databaseUrl, sql: asActor(ASSIGNED_EA, testCase.update), label: `${label}-update` })),
      [testCase.id],
      `${testCase.table}: the assigned EA's UPDATE by id must acknowledge exactly one row`,
    );
    // 3. An unassigned EA's UPDATE affects zero rows (read by the app as UPDATE_NOT_APPLIED).
    assert.deepEqual(
      returnedIds(runPsql({ databaseUrl, sql: asActor(UNASSIGNED_EA, testCase.update), label: `${label}-unassigned` })),
      [],
      `${testCase.table}: an unassigned EA's UPDATE must affect zero rows`,
    );
    summary[testCase.table] = 'passed';
  }
  return summary;
};

const main = () => {
  const baseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const databaseName = baseName ? `${baseName}_upload` : baseName;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL,
    databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  });
  const adminDatabaseUrl = buildDatabaseUrl(adminUrl, 'postgres').href;
  const databaseUrl = buildDatabaseUrl(adminUrl, databaseName).href;
  const quotedDatabase = quoteIdentifier(databaseName);

  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-stale-database' });
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${quotedDatabase};`, label: 'create-database' });
  try {
    runPsql({ databaseUrl, sql: bootstrapSql, label: 'bootstrap' });
    for (const filename of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
      runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
    }
    runPsql({ databaseUrl, sql: fixtureSql, label: 'upload-contract-fixture' });
    process.stdout.write(`${JSON.stringify(runCases(databaseUrl))}\n`);
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
};

if (require.main === module) {
  main();
}

module.exports = { CASES, fixtureSql };
```

- [ ] **Step 3: Add the npm script**

In `package.json` `scripts`, next to `verify:history-authorization:postgres`:

```json
"verify:upload-contract:postgres": "node scripts/upload-contract-postgres-harness.cjs",
```

- [ ] **Step 4: Start a disposable local PostgreSQL 17 and run S1**

```bash
PGBIN=/opt/homebrew/opt/postgresql@17/bin
PGDATA_DIR=$(mktemp -d)/pgdata
$PGBIN/initdb -D "$PGDATA_DIR" -U postgres --auth=trust >/dev/null
$PGBIN/pg_ctl -D "$PGDATA_DIR" -o "-p 55432 -k /tmp" -l "$PGDATA_DIR.log" start
HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres \
HISTORY_RLS_DATABASE_NAME=masi_history_rls_local \
HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE \
npm run verify:upload-contract:postgres
```

Expected output: `{"children":"passed","classes":"passed","groups":"passed","letter_mastery":"passed","time_entries":"passed","group_ea_assignments (restore)":"passed"}`.

If the fixture fails on a NOT NULL or CHECK constraint, read the failing column from the error, add it to the fixture with a realistic value, and rerun. Fixture repairs are expected. **Any failure of a numbered assertion is a stop-and-report-to-Jim event.**

Leave the server running for Task 6, or stop it with `$PGBIN/pg_ctl -D "$PGDATA_DIR" stop`.

- [ ] **Step 5: Run S1 in CI**

In `.github/workflows/tests.yml`, after the step that runs `npm run verify:history-authorization:postgres`, add a step with the same three `HISTORY_RLS_*` environment variables:

```yaml
      - name: Upload contract PostgreSQL harness (S1)
        env:
          HISTORY_RLS_ADMIN_DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/postgres
          HISTORY_RLS_DATABASE_NAME: masi_history_rls_ci
          HISTORY_RLS_DISPOSABLE_CONFIRM: I_UNDERSTAND_THIS_IS_DISPOSABLE
        run: npm run verify:upload-contract:postgres
```

- [ ] **Step 6: Commit**

```bash
git add scripts/upload-contract-postgres-harness.cjs scripts/history-authorization-postgres-harness.cjs package.json .github/workflows/tests.yml
git commit -m "test(s1): prove upsert vs UPDATE-by-id against the replayed migrations"
```

---

### Task 2: Send edits as UPDATE by id

**Files:**
- Create: `test-support/supabaseSyncMock.js` (moved from `__tests__/offlineSyncOutbox.test.js:36-76`)
- Modify: `__tests__/offlineSyncOutbox.test.js` (import the moved helper; update the test at about line 1447)
- Create: `__tests__/offlineSyncUpdateById.test.js`
- Modify: `src/services/offlineSync.js` (constants near `BATCHABLE_UPSERT_TABLES` around line 290; `classifyError` around line 442; `runServerOperation` around lines 624-712; `canBatchRecord` around line 947)

**Interfaces:**
- Produces: `UPDATE_BY_ID_TABLES` (a `Set` of `'time_entries'`, `'classes'`, `'children'`, `'groups'`, `'letter_mastery'`), exported for tests as `_testUpdateByIdTables`. Also the server-result error code `'UPDATE_NOT_APPLIED'`, which `classifyError` treats like `42501`: terminal unless `parentEvidencePending`.

- [ ] **Step 1: Move the fake Supabase client into `test-support`**

Create `test-support/supabaseSyncMock.js` containing the `createSupabaseMock` function exactly as it is today in `__tests__/offlineSyncOutbox.test.js` (lines 36-76), exported:

```js
export const createSupabaseMock = ({ upsertResults = {}, updateResults = {}, rpcResults = {} } = {}) => {
  // ...body moved verbatim from __tests__/offlineSyncOutbox.test.js...
};
```

In `__tests__/offlineSyncOutbox.test.js`, delete the local definition and add:

```js
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
```

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/offlineSyncOutbox.test.js --silent`
Expected: PASS, with the same test count as before.

- [ ] **Step 2: Write the failing tests**

Create `__tests__/offlineSyncUpdateById.test.js`:

```js
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { runMigrations } from '../src/db/migrations';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { letterMasteryDomainId } from '../src/db/repositories/domainRepositoryUtils';

const HEAD_OFFICE = 'head-office-1';
const liveTestSession = async () => ({ data: { session: { user: { id: 'user-1' } } } });

const enqueue = async (db, tableName, recordId, operation, payload) => {
  const outbox = createSyncOutboxRepository({ database: db });
  await outbox.enqueue({ tableName, recordId, operation, payload });
};

const seedHeadOfficeChild = async (db, id = 'child-ho-1') => {
  await db.runAsync(`
    insert into children (id, first_name, last_name, reading_level, created_by, sync_status)
    values (?, 'Amahle', 'Dlamini', 'words', ?, 'pending')
  `, id, HEAD_OFFICE);
  return {
    id,
    first_name: 'Amahle',
    last_name: 'Dlamini',
    reading_level: 'words',
    created_by: HEAD_OFFICE,
    created_at: '2026-10-01T08:00:00.000Z',
    updated_at: '2026-10-10T08:00:00.000Z',
  };
};

describe('edits are sent as UPDATE by id (spec §6.5)', () => {
  let db;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    await db.runAsync("insert into programmes (id, code, name, sync_status) values ('programme-1', 'lit', 'Literacy', 'synced')");
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('a Head Office-created child edit is an UPDATE without provenance columns', async () => {
    const child = await seedHeadOfficeChild(db);
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.totalSynced).toBe(1);
    const childCalls = calls.filter((call) => call.tableName === 'children');
    expect(childCalls).toEqual([expect.objectContaining({ type: 'update', column: 'id', value: child.id })]);
    expect(childCalls[0].payload).toEqual(expect.objectContaining({ reading_level: 'words' }));
    for (const column of ['id', 'created_by', 'created_at', 'user_id', 'archived_by_user_id']) {
      expect(childCalls[0].payload).not.toHaveProperty(column);
    }
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test('zero acknowledged rows is UPDATE_NOT_APPLIED and terminal when nothing is pending', async () => {
    const child = await seedHeadOfficeChild(db);
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient } = createSupabaseMock({ updateResults: { children: { data: [], error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.totalTerminal).toBe(1);
    const row = await db.getFirstAsync("select status, last_error from sync_outbox where record_id = ?", child.id);
    expect(row.status).toBe('terminal');
    expect(row.last_error).toContain('did not acknowledge exactly one');
  });

  test('a letter_mastery update targets the re-derived deterministic id, not a legacy local id', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-m', 'Lebo', 'Mokoena', 'user-1', 'synced')
    `);
    const legacyLocalId = '0f0f0f0f-0000-4000-8000-000000000001';
    const payload = {
      id: legacyLocalId,
      user_id: 'user-1',
      child_id: 'child-m',
      programme_id: 'programme-1',
      letter: 'a',
      language: 'isiXhosa',
      source: 'taught',
      deleted_at: null,
    };
    await enqueue(db, 'letter_mastery', legacyLocalId, 'update', payload);
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll();

    const expectedId = letterMasteryDomainId({
      userId: 'user-1', childId: 'child-m', programmeId: 'programme-1',
      letter: 'a', language: 'isiXhosa', source: 'taught',
    });
    expect(calls.filter((call) => call.tableName === 'letter_mastery'))
      .toEqual([expect.objectContaining({ type: 'update', column: 'id', value: expectedId })]);
  });

  test('updates for UPDATE-by-id tables are never batched with inserts', async () => {
    const child = await seedHeadOfficeChild(db, 'child-own-1');
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-new-1', 'Zola', 'Ndlovu', 'user-1', 'pending')
    `);
    await enqueue(db, 'children', 'child-new-1', 'insert', {
      id: 'child-new-1', first_name: 'Zola', last_name: 'Ndlovu', created_by: 'user-1',
    });
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll();

    const childCalls = calls.filter((call) => call.tableName === 'children');
    expect(childCalls.map((call) => call.type).sort()).toEqual(['update', 'upsert']);
    const upsertCall = childCalls.find((call) => call.type === 'upsert');
    const upserted = Array.isArray(upsertCall.payload) ? upsertCall.payload : [upsertCall.payload];
    expect(upserted.map((row) => row.id)).toEqual(['child-new-1']);
  });
});
```

If `letterMasteryDomainId` is not exported from `domainRepositoryUtils.js` (Task 2 relies on the export that `offlineSync.js` already imports), import it from wherever `offlineSync.js` imports it.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/offlineSyncUpdateById.test.js`
Expected: FAIL. Calls have `type: 'upsert'` where `'update'` is expected, and the zero-row test reports success.

- [ ] **Step 4: Implement**

In `src/services/offlineSync.js`, after `IMMUTABLE_ASSIGNMENT_TABLES`:

```js
// Edits change a row the server already has. PostgreSQL checks INSERT WITH CHECK on every upsert
// row, even one that conflicts, so sending an edit as an upsert asks for insert permission that an
// EA editing a Head Office-created row does not have. These tables send `update` as UPDATE by id
// with an exact acknowledgement (actor lifecycle spec §6.5). class_grouping_state stays an upsert:
// its `update` means create-or-update and its INSERT policy is authorization-based.
const UPDATE_BY_ID_TABLES = new Set(['time_entries', 'classes', 'children', 'groups', 'letter_mastery']);
// Provenance and identity never change through an edit.
const UPDATE_PATCH_EXCLUDED_COLUMNS = new Set(['id', 'created_by', 'created_at', 'user_id', 'archived_by_user_id']);
export const _testUpdateByIdTables = UPDATE_BY_ID_TABLES;
```

In `classifyError`, change the `23503`/`42501` branch to include the new code:

```js
  if (code === '23503' || code === '42501' || code === 'UPDATE_NOT_APPLIED') {
    // A FK/RLS denial, or an UPDATE that matched no visible row, while required local evidence is
    // still pending is a cross-pass race. Without pending evidence, it is a genuine rejection.
    return { terminal: !parentEvidencePending, markAsSynced: false };
  }
```

In `runServerOperation`, immediately after the `archive` branch and before the `child_class_memberships` reconcile:

```js
  if (outboxRecord.operation === 'update' && UPDATE_BY_ID_TABLES.has(config.tableName)) {
    // buildSyncPayload has already re-derived deterministic ids (letter_mastery), so the server id
    // is the payload id, not the outbox record_id.
    const serverId = payload.id || outboxRecord.record_id;
    const patch = Object.fromEntries(
      Object.entries(payload).filter(([column]) => !UPDATE_PATCH_EXCLUDED_COLUMNS.has(column))
    );
    const { data, error } = await supabaseClient
      .from(config.tableName)
      .update(patch)
      .eq('id', serverId)
      .select('id');
    if (error) return { success: false, error };
    if (!Array.isArray(data) || data.length !== 1 || data[0]?.id !== serverId) {
      return {
        success: false,
        error: {
          code: 'UPDATE_NOT_APPLIED',
          message: `${config.tableName} update did not acknowledge exactly one updated row`,
        },
      };
    }
    return { success: true };
  }
```

Replace `canBatchRecord`:

```js
const canBatchRecord = (record, config) => (
  Boolean(config)
  && BATCHABLE_UPSERT_TABLES.has(config.tableName)
  && (
    record.operation === 'insert'
    || (record.operation === 'update' && !UPDATE_BY_ID_TABLES.has(config.tableName))
  )
  && (!IMMUTABLE_ASSIGNMENT_TABLES.has(config.tableName) || record.operation === 'insert')
  && record.payload != null
);
```

- [ ] **Step 5: Update the one existing test that encoded the old batching rule**

In `__tests__/offlineSyncOutbox.test.js`, the test `'batches ready child inserts and updates into one upsert'` (about line 1447) now expects one batched upsert for the insert and one UPDATE call per update. Rename it to `'batches child inserts and sends child updates as UPDATE by id'` and replace its call assertions with:

```js
    const childCalls = calls.filter(call => call.tableName === 'children');
    expect(childCalls.filter(call => call.type === 'upsert')).toHaveLength(1);
    expect(childCalls.filter(call => call.type === 'update').map(call => call.value).sort())
      .toEqual(['child-batch-2', 'child-batch-3']);
```

Keep its `result`, `sync_status`, and empty-outbox assertions unchanged.

- [ ] **Step 6: Run the sync suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/offlineSyncUpdateById.test.js __tests__/offlineSyncOutbox.test.js __tests__/classifyErrorHardening.test.js __tests__/offlineSync.stripping.test.js --silent`
Expected: PASS. If another existing test asserts that an `update` for one of the five tables is an upsert, change it to assert the UPDATE call, citing spec §6.5 in the test name. Do not weaken any other assertion.

- [ ] **Step 7: Commit**

```bash
git add test-support/supabaseSyncMock.js __tests__/offlineSyncOutbox.test.js __tests__/offlineSyncUpdateById.test.js src/services/offlineSync.js
git commit -m "fix(sync): send edits as UPDATE by id with an exact acknowledgement

Upserts always check the INSERT policy, so an EA's edit of a Head Office-created
child, class, or group was refused. Edits for time_entries, classes, children,
groups, and letter_mastery now go as UPDATE by id without provenance columns."
```

---

### Task 3: Classify zero-row updates by real authorization evidence

**Files:**
- Modify: `src/db/repositories/syncOutboxRepository.js` (add `hasPendingOperation` next to `hasPendingRecord`, about line 95, and return it from the repository)
- Modify: `src/services/offlineSync.js` (`GRANT_SUBJECTS` around lines 241-270; add `hasPendingMembershipMediatedGrant` after `hasPendingActiveAssignment` around line 399; `computeEvidencePending` around line 404; the evidence call in `processRecord` around line 1029)
- Modify: `__tests__/offlineSyncUpdateById.test.js`

**Interfaces:**
- Consumes: `UPDATE_NOT_APPLIED` from Task 2.
- Produces: `outboxRepository.hasPendingOperation({ tableName, recordId, operation }) => Promise<boolean>`, which is true when an outbox row with that exact operation has status `pending`, `failed`, or `in_flight`. Also `computeEvidencePending({ ..., includeGrant, includeOwnInsert })`.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/offlineSyncUpdateById.test.js`, inside the `describe` block:

```js
  const seedClassMediatedGrant = async ({ membershipStatus, assignmentStatus }) => {
    await db.runAsync(`
      insert into classes (id, name, school_id, created_by, sync_status)
      values ('class-1', 'Grade 1', null, ?, 'synced')
    `, HEAD_OFFICE);
    await db.runAsync(`
      insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by, sync_status)
      values ('cea-class-1', 'class-1', 'user-1', 'programme-1', ?, ?)
    `, HEAD_OFFICE, assignmentStatus);
    await db.runAsync(`
      insert into child_class_memberships (id, child_id, class_id, created_by, sync_status)
      values ('ccm-1', 'child-ho-1', 'class-1', 'user-1', ?)
    `, membershipStatus);
  };

  test('a zero-row edit stays retriable while a class-mediated membership is pending, then uploads automatically', async () => {
    const child = await seedHeadOfficeChild(db);
    await seedClassMediatedGrant({ membershipStatus: 'pending', assignmentStatus: 'synced' });
    await enqueue(db, 'children', child.id, 'update', child);
    let acknowledge = false;
    const { supabaseClient } = createSupabaseMock({
      updateResults: {
        children: ({ value }) => ({ data: acknowledge ? [{ id: value }] : [], error: null }),
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'children' });
    expect((await db.getFirstAsync('select status from sync_outbox where record_id = ?', child.id)).status).toBe('failed');

    // The membership lands, and the edit's backoff expires.
    await db.runAsync("update child_class_memberships set sync_status = 'synced' where id = 'ccm-1'");
    await db.runAsync('update sync_outbox set next_retry_at = null where record_id = ?', child.id);
    acknowledge = true;
    const second = await engine.syncAll({ tableName: 'children' });

    expect(second.totalSynced).toBe(1);
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox where record_id = ?', child.id)).toEqual({ count: 0 });
  });

  test('a zero-row edit stays retriable while a class assignment is pending (either half counts)', async () => {
    const child = await seedHeadOfficeChild(db);
    await seedClassMediatedGrant({ membershipStatus: 'synced', assignmentStatus: 'pending' });
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient } = createSupabaseMock({ updateResults: { children: { data: [], error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'children' });

    expect((await db.getFirstAsync('select status from sync_outbox where record_id = ?', child.id)).status).toBe('failed');
  });

  test('a terminal membership gives no evidence, so the edit becomes terminal', async () => {
    const child = await seedHeadOfficeChild(db);
    await seedClassMediatedGrant({ membershipStatus: 'terminal', assignmentStatus: 'synced' });
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient } = createSupabaseMock({ updateResults: { children: { data: [], error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'children' });

    expect((await db.getFirstAsync('select status from sync_outbox where record_id = ?', child.id)).status).toBe('terminal');
  });

  test('a class edit stays retriable while its own class assignment is pending (own id as subject)', async () => {
    await db.runAsync(`
      insert into classes (id, name, created_by, sync_status) values ('class-2', 'Grade 2', ?, 'pending')
    `, HEAD_OFFICE);
    await db.runAsync(`
      insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by, sync_status)
      values ('cea-class-2', 'class-2', 'user-1', 'programme-1', ?, 'pending')
    `, HEAD_OFFICE);
    await enqueue(db, 'classes', 'class-2', 'update', { id: 'class-2', name: 'Grade 2B', created_by: HEAD_OFFICE });
    const { supabaseClient } = createSupabaseMock({ updateResults: { classes: { data: [], error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'classes' });

    expect((await db.getFirstAsync("select status from sync_outbox where record_id = 'class-2'")).status).toBe('failed');
  });

  test('a readable letter_mastery row stays retriable while the child assignment is pending', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-lm', 'Thandi', 'Mbeki', ?, 'synced')
    `, HEAD_OFFICE);
    await db.runAsync(`
      insert into child_ea_assignments (id, child_id, user_id, created_by, sync_status)
      values ('cea-lm', 'child-lm', 'user-1', ?, 'pending')
    `, HEAD_OFFICE);
    const payload = {
      id: 'lm-1', user_id: 'user-1', child_id: 'child-lm', programme_id: 'programme-1',
      letter: 'b', language: 'isiXhosa', source: 'taught', deleted_at: null,
    };
    await enqueue(db, 'letter_mastery', 'lm-1', 'update', payload);
    const { supabaseClient } = createSupabaseMock({ updateResults: { letter_mastery: { data: [], error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'letter_mastery' });

    expect((await db.getFirstAsync("select status from sync_outbox where record_id = 'lm-1'")).status).toBe('failed');
  });

  test('an edit after the assignment ended on the server, with nothing pending, is terminal with a readable reason', async () => {
    const child = await seedHeadOfficeChild(db);
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient } = createSupabaseMock({ updateResults: { children: { data: [], error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll({ tableName: 'children' });

    expect(result.failedRecords).toEqual([expect.objectContaining({
      id: child.id,
      reason: expect.stringContaining('did not acknowledge exactly one updated row'),
    })]);
  });
```

If a column used in these inserts (for example `child_class_memberships.academic_year_id` or `classes.school_id`) is NOT NULL in `src/db/migrations.js`, add a realistic value to the insert. Do not change the assertions.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/offlineSyncUpdateById.test.js`
Expected: the "stays retriable" tests FAIL with `terminal` where `failed` is expected, because no evidence is computed for `UPDATE_NOT_APPLIED` and `GRANT_SUBJECTS` has no entry for `children` or `classes`.

- [ ] **Step 3: Add `hasPendingOperation` to the outbox repository**

In `src/db/repositories/syncOutboxRepository.js`, after `hasPendingRecord`:

```js
  // True while an outbox row for exactly this operation is still owed. Terminal rows do not count.
  const hasPendingOperation = async ({ tableName, recordId, operation }) => {
    if (!tableName || !recordId || !operation) return false;
    const db = await resolveDatabase(database);
    const row = await db.getFirstAsync(`
      select id from sync_outbox
      where table_name = ? and record_id = ? and operation = ?
        and status in ('pending', 'failed', 'in_flight')
      limit 1
    `, tableName, recordId, operation);
    return !!row;
  };
```

Add `hasPendingOperation` to the object the repository returns, next to `hasPendingRecord`.

- [ ] **Step 4: Extend the grant-evidence resolver**

In `src/services/offlineSync.js`, replace the `GRANT_SUBJECTS` comment and map with:

```js
// The grant(s) each write needs, matching private.current_user_can_write_for_child/class/group
// (migration 20260521144901 lines 368-517). The created_by half is covered by PARENT_FK_COLUMNS.
// Entry shapes:
//   { grantTable, subjectColumn, valueColumn? }: a direct active assignment whose subjectColumn
//     equals this record's valueColumn (default subjectColumn). valueColumn 'id' means the
//     record's own id is the subject (classes, groups, children).
//   { membershipMediatedChild: column }: the child in `column` is reachable through an active
//     class or group membership joined to an active class or group assignment. The server needs
//     both rows, so evidence is pending when either half is unacknowledged and not terminal.
// staff_programme_assignments is excluded (reference data, never pushed). Used for 42501 and
// UPDATE_NOT_APPLIED.
const GRANT_SUBJECTS = {
  classes: [{ grantTable: 'class_ea_assignments', subjectColumn: 'class_id', valueColumn: 'id' }],
  groups: [{ grantTable: 'group_ea_assignments', subjectColumn: 'group_id', valueColumn: 'id' }],
  children: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id', valueColumn: 'id' },
    { membershipMediatedChild: 'id' },
  ],
  child_class_memberships: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { grantTable: 'class_ea_assignments', subjectColumn: 'class_id' },
    { membershipMediatedChild: 'child_id' },
  ],
  child_programme_enrollments: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { membershipMediatedChild: 'child_id' },
  ],
  child_group_memberships: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { grantTable: 'group_ea_assignments', subjectColumn: 'group_id' },
    { membershipMediatedChild: 'child_id' },
  ],
  session_attendees: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { membershipMediatedChild: 'child_id' },
  ],
  assessments: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { membershipMediatedChild: 'child_id' },
  ],
  letter_mastery: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { membershipMediatedChild: 'child_id' },
  ],
  grouping_versions: [{ grantTable: 'class_ea_assignments', subjectColumn: 'class_id' }],
  class_grouping_state: [{ grantTable: 'class_ea_assignments', subjectColumn: 'class_id' }],
};
```

After `hasPendingActiveAssignment`, add:

```js
const UNACKNOWLEDGED_STATUSES = "('pending', 'failed', 'in_flight')";

// A child write granted through a class or group needs BOTH an active membership and an active
// assignment on the server. Evidence is pending when a local pair exists and either half has not
// been acknowledged. A terminal half contributes nothing.
const hasPendingMembershipMediatedGrant = async (database, childId) => {
  const row = await database.getFirstAsync(`
    select 1 as present
    from child_class_memberships ccm
    join class_ea_assignments cea
      on cea.class_id = ccm.class_id and cea.unassigned_at is null
    where ccm.child_id = ?
      and ccm.exited_at is null
      and (ccm.sync_status in ${UNACKNOWLEDGED_STATUSES} or cea.sync_status in ${UNACKNOWLEDGED_STATUSES})
      and ccm.sync_status != 'terminal'
      and cea.sync_status != 'terminal'
    union all
    select 1 as present
    from child_group_memberships cgm
    join group_ea_assignments gea
      on gea.group_id = cgm.group_id and gea.unassigned_at is null
    where cgm.child_id = ?
      and cgm.removed_at is null
      and (cgm.sync_status in ${UNACKNOWLEDGED_STATUSES} or gea.sync_status in ${UNACKNOWLEDGED_STATUSES})
      and cgm.sync_status != 'terminal'
      and gea.sync_status != 'terminal'
    limit 1
  `, childId, childId);
  return !!row;
};
```

Replace `computeEvidencePending`:

```js
const computeEvidencePending = async ({
  database,
  outboxRepository,
  outboxRecord,
  includeGrant,
  includeOwnInsert = false,
}) => {
  const table = normalizeTableName(outboxRecord?.table_name);
  const getField = makeFieldResolver(database, outboxRecord);

  if (includeOwnInsert && await outboxRepository.hasPendingOperation({
    tableName: table,
    recordId: outboxRecord.record_id,
    operation: 'insert',
  })) {
    return true;
  }

  const fkColumns = PARENT_FK_COLUMNS[table] || {};
  for (const [parentTable, column] of Object.entries(fkColumns)) {
    const recordId = await getField(column);
    if (recordId && await outboxRepository.hasPendingRecord({ tableName: parentTable, recordId })) {
      return true;
    }
  }

  if (includeGrant) {
    for (const grant of GRANT_SUBJECTS[table] || []) {
      if (grant.membershipMediatedChild) {
        const childId = await getField(grant.membershipMediatedChild);
        if (childId && await hasPendingMembershipMediatedGrant(database, childId)) return true;
        continue;
      }
      const subjectValue = await getField(grant.valueColumn || grant.subjectColumn);
      if (subjectValue && await hasPendingActiveAssignment(database, grant.grantTable, grant.subjectColumn, subjectValue)) {
        return true;
      }
    }
  }

  return false;
};
```

`makeFieldResolver` reads `payload.id`, then falls back to the domain row, so `getField('id')` resolves the record's own id.

In `processRecord`, replace the evidence computation (about lines 1028-1036):

```js
      const failureCode = serverResult.error?.code;
      const parentEvidencePending = ['23503', '42501', 'UPDATE_NOT_APPLIED'].includes(failureCode)
        ? await computeEvidencePending({
            database,
            outboxRepository,
            outboxRecord: inFlightRecord,
            includeGrant: failureCode !== '23503',
            includeOwnInsert: failureCode === 'UPDATE_NOT_APPLIED',
          })
        : false;
```

- [ ] **Step 5: Run the evidence and sync suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/offlineSyncUpdateById.test.js __tests__/offlineSyncOutbox.test.js __tests__/classifyErrorHardening.test.js --silent`
Expected: PASS. The `computeEvidencePending (#48)` tests and the evidence-map drift test in `offlineSyncOutbox.test.js` must still pass. If the drift test asserts an exact `GRANT_SUBJECTS` key set, update its expected set to include `classes`, `groups`, and `children`, and keep the coverage assertion.

- [ ] **Step 6: Commit**

```bash
git add src/db/repositories/syncOutboxRepository.js src/services/offlineSync.js __tests__/offlineSyncUpdateById.test.js __tests__/offlineSyncOutbox.test.js
git commit -m "fix(sync): classify zero-row updates by grant evidence

UPDATE_NOT_APPLIED reuses the 42501 evidence rules. The resolver now covers
own-id grants for classes, groups, and children, and class or group grants
reached through a membership, where either half pending counts."
```

---

### Task 4: An edit never overtakes its own insert

**Files:**
- Modify: `src/services/offlineSync.js` (`findBlockingDependency`, around line 1329)
- Modify: `__tests__/offlineSyncUpdateById.test.js`

**Interfaces:**
- Consumes: `outboxRepository.hasPendingOperation` (Task 3), `UPDATE_BY_ID_TABLES` (Task 2).

- [ ] **Step 1: Write the failing test**

Append inside the `describe` block:

```js
  test('an update waits while its own insert is unacknowledged, then goes as UPDATE', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-offline-1', 'Sipho', 'Khumalo', 'user-1', 'pending')
    `);
    await enqueue(db, 'children', 'child-offline-1', 'insert', {
      id: 'child-offline-1', first_name: 'Sipho', last_name: 'Khumalo', created_by: 'user-1',
    });
    await enqueue(db, 'children', 'child-offline-1', 'update', {
      id: 'child-offline-1', first_name: 'Sipho', last_name: 'Khumalo', reading_level: 'words', created_by: 'user-1',
    });
    let insertSucceeds = false;
    const { supabaseClient, calls } = createSupabaseMock({
      upsertResults: {
        children: () => (insertSucceeds ? { error: null } : { error: { message: 'Network request failed' } }),
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'children' });
    expect(calls.filter((call) => call.type === 'update')).toHaveLength(0);

    insertSucceeds = true;
    // Whether the update follows in the same pass or the next one is an engine detail; the
    // contract is that it is sent once, only after the insert succeeded.
    for (let pass = 0; pass < 2; pass += 1) {
      await db.runAsync("update sync_outbox set next_retry_at = null where record_id = 'child-offline-1'");
      await engine.syncAll({ tableName: 'children' });
    }

    const updateIndex = calls.findIndex((call) => call.type === 'update');
    const successfulInsertIndex = calls.reduce(
      (last, call, index) => (call.type === 'upsert' ? index : last),
      -1,
    );
    expect(calls.filter((call) => call.type === 'update').map((call) => call.value)).toEqual(['child-offline-1']);
    expect(updateIndex).toBeGreaterThan(successfulInsertIndex);
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/offlineSyncUpdateById.test.js -t "own insert"`
Expected: FAIL. An `update` call is sent in the first pass, before the insert has succeeded.

- [ ] **Step 3: Implement the gate**

At the top of `findBlockingDependency`, before the dependency loop:

```js
      // Same-record ordering (spec §6.5): an UPDATE-by-id edit must not run before its own insert
      // has been acknowledged, or it would match no row. A terminal insert does not block; the
      // update then reads as UPDATE_NOT_APPLIED with no pending evidence and becomes terminal.
      if (
        record.operation === 'update'
        && UPDATE_BY_ID_TABLES.has(tableNameForRecord)
        && await outboxRepository.hasPendingOperation({
          tableName: tableNameForRecord,
          recordId: record.record_id,
          operation: 'insert',
        })
      ) {
        return { tableName: tableNameForRecord, recordId: record.record_id };
      }
```

`outboxRepository` is in scope inside `createOutboxSyncEngine`. A returned blocker is reported as `deferred`, not failed, so retry counters do not move.

- [ ] **Step 4: Run the sync suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/offlineSyncUpdateById.test.js __tests__/offlineSyncOutbox.test.js __tests__/offlineSyncResultSemantics.test.js --silent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineSync.js __tests__/offlineSyncUpdateById.test.js
git commit -m "fix(sync): defer an edit until its own insert is acknowledged"
```

---

### Task 5: Group-assignment reactivation reaches the server

**Files:**
- Modify: `src/db/repositories/domainRepositoryUtils.js` (add `enqueueLifecycleOutbox` after `enqueueDomainOutbox`, about line 131)
- Modify: `src/db/repositories/groupsRepository.js` (reactivation at about lines 106-129; archive cascade at about lines 432-443)
- Modify: `src/services/offlineSync.js` (`pushOrderForRecord` around line 931; the `archive` branch of `runServerOperation` around line 675; `classifyError`)
- Create: `__tests__/groupAssignmentLifecycle.test.js`

**Interfaces:**
- Produces: `enqueueLifecycleOutbox(db, tableName, recordId, operation, payload, options) => Promise`. `operation` is `'archive'` or `'restore'`. It keeps at most one queued lifecycle row per record, always the latest intent.
- Produces: the outbox operation `'restore'`, already allowed by the SQLite CHECK at `src/db/migrations.js:42`. It is sent as a lifecycle UPDATE with the `ARCHIVE_SERVER_COLUMNS` allowlist and acknowledged exactly; zero rows is terminal `RESTORE_NOT_APPLIED`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/groupAssignmentLifecycle.test.js`:

```js
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { runMigrations } from '../src/db/migrations';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { enqueueLifecycleOutbox } from '../src/db/repositories/domainRepositoryUtils';

const liveTestSession = async () => ({ data: { session: { user: { id: 'user-1' } } } });
const ASSIGNMENT = 'gea-1';

const lifecycleRows = (db) => db.getAllAsync(`
  select operation, status from sync_outbox
  where table_name = 'group_ea_assignments' and record_id = ?
  order by created_at
`, ASSIGNMENT);

describe('group assignment lifecycle (spec §6.5b)', () => {
  let db;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    await db.runAsync("insert into programmes (id, code, name, sync_status) values ('programme-1', 'lit', 'Literacy', 'synced')");
    await db.runAsync(`
      insert into groups (id, name, programme_id, created_by, sync_status)
      values ('group-1', 'Group 1', 'programme-1', 'head-office-1', 'synced')
    `);
    await db.runAsync(`
      insert into group_ea_assignments (id, group_id, ea_user_id, programme_id, created_by, unassigned_at, sync_status)
      values (?, 'group-1', 'user-1', 'programme-1', 'head-office-1', '2026-10-09T08:00:00.000Z', 'synced')
    `, ASSIGNMENT);
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('reactivation is sent as a lifecycle UPDATE that clears unassigned_at, not an ignored insert', async () => {
    await enqueueLifecycleOutbox(db, 'group_ea_assignments', ASSIGNMENT, 'restore', {
      id: ASSIGNMENT, unassigned_at: null, handover_reason: null,
    });
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.totalSynced).toBe(1);
    expect(calls).toEqual([expect.objectContaining({
      type: 'update',
      tableName: 'group_ea_assignments',
      column: 'id',
      value: ASSIGNMENT,
      payload: { unassigned_at: null, handover_reason: null },
    })]);
  });

  test('a restore the server does not acknowledge is terminal, never success', async () => {
    await enqueueLifecycleOutbox(db, 'group_ea_assignments', ASSIGNMENT, 'restore', {
      id: ASSIGNMENT, unassigned_at: null, handover_reason: null,
    });
    const { supabaseClient } = createSupabaseMock({
      updateResults: { group_ea_assignments: { data: [], error: null } },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.totalTerminal).toBe(1);
    expect(result.failedRecords[0].reason).toContain('did not acknowledge');
  });

  test('archive, restore, archive, restore offline leaves exactly one queued intent: the latest', async () => {
    for (const operation of ['archive', 'restore', 'archive', 'restore']) {
      await enqueueLifecycleOutbox(db, 'group_ea_assignments', ASSIGNMENT, operation, {
        id: ASSIGNMENT,
        unassigned_at: operation === 'archive' ? '2026-10-10T08:00:00.000Z' : null,
        handover_reason: null,
      });
    }
    expect(await lifecycleRows(db)).toEqual([{ operation: 'restore', status: 'pending' }]);
  });

  test('a new intent queued while the opposite one is in flight runs after it', async () => {
    await enqueueLifecycleOutbox(db, 'group_ea_assignments', ASSIGNMENT, 'archive', {
      id: ASSIGNMENT, unassigned_at: '2026-10-10T08:00:00.000Z',
    });
    await db.runAsync("update sync_outbox set status = 'in_flight' where operation = 'archive'");
    await enqueueLifecycleOutbox(db, 'group_ea_assignments', ASSIGNMENT, 'restore', {
      id: ASSIGNMENT, unassigned_at: null, handover_reason: null,
    });
    expect(await lifecycleRows(db)).toEqual([
      { operation: 'archive', status: 'in_flight' },
      { operation: 'restore', status: 'pending' },
    ]);
  });
});
```

Add one test that goes through the public repository path. `saveGroup` calls `createMissingGroupAssignment`, which reactivates the archived deterministic assignment (`groupsRepository.js:269-300` and `:106-129`):

```js
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { groupEaAssignmentDomainId } from '../src/db/repositories/domainRepositoryUtils';

test('saveGroup reactivating an archived assignment queues a restore, not an insert', async () => {
  const deterministicId = groupEaAssignmentDomainId({ groupId: 'group-2' });
  await db.runAsync(`
    insert into staff_programme_assignments (id, user_id, programme_id, sync_status)
    values ('spa-1', 'user-1', 'programme-1', 'synced')
  `);
  await db.runAsync(`
    insert into groups (id, name, programme_id, created_by, sync_status)
    values ('group-2', 'Group 2', 'programme-1', 'user-1', 'synced')
  `);
  await db.runAsync(`
    insert into group_ea_assignments (id, group_id, ea_user_id, programme_id, created_by, unassigned_at, sync_status)
    values (?, 'group-2', 'user-1', 'programme-1', 'user-1', '2026-10-09T08:00:00.000Z', 'synced')
  `, deterministicId);

  await createGroupsRepository({ database: db }).saveGroup({
    id: 'group-2', name: 'Group 2', programme_id: 'programme-1', created_by: 'user-1', sync_status: 'pending',
  });

  const rows = await db.getAllAsync(`
    select operation from sync_outbox where table_name = 'group_ea_assignments' and record_id = ?
  `, deterministicId);
  expect(rows).toEqual([{ operation: 'restore' }]);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/groupAssignmentLifecycle.test.js`
Expected: FAIL. `enqueueLifecycleOutbox` is not exported.

- [ ] **Step 3: Add `enqueueLifecycleOutbox`**

In `src/db/repositories/domainRepositoryUtils.js`, after `enqueueDomainOutbox`:

```js
// Lifecycle intents (archive, restore) for one record collapse to the latest one. Queued rows
// the server has not taken are removed; a row already in flight is left alone, and the new row is
// created after it, so it is pushed after it. Re-applying an archive or a restore is idempotent.
export const enqueueLifecycleOutbox = async (db, tableName, recordId, operation, payload, options) => {
  if (operation !== 'archive' && operation !== 'restore') {
    throw new Error(`enqueueLifecycleOutbox: unsupported operation ${operation}`);
  }
  await db.runAsync(`
    delete from sync_outbox
    where table_name = ? and record_id = ?
      and operation in ('archive', 'restore')
      and status in ('pending', 'failed', 'terminal')
  `, tableName, recordId);
  return enqueueDomainOutbox(db, tableName, recordId, operation, payload, options);
};
```

- [ ] **Step 4: Send `restore` like an archive, and order it in the lifecycle phase**

In `src/services/offlineSync.js`:

```js
const pushOrderForRecord = (record) => {
  const isLifecycle = record.operation === 'archive' || record.operation === 'restore';
  if (isLifecycle && ARCHIVE_PUSH_ORDER[record.table_name] != null) {
    return ARCHIVE_PUSH_ORDER[record.table_name];
  }
  return TABLE_CONFIGS[record.table_name]?.order ?? Number.MAX_SAFE_INTEGER;
};
```

In `runServerOperation`, change the archive branch's condition and its not-applied code:

```js
  if (outboxRecord.operation === 'archive' || outboxRecord.operation === 'restore') {
    // ...existing archiveColumns / archivePatch / update(...).eq('id', record_id).select('id') body...
    if (!Array.isArray(data) || data.length !== 1 || data[0]?.id !== outboxRecord.record_id) {
      const notApplied = outboxRecord.operation === 'restore' ? 'RESTORE_NOT_APPLIED' : 'ARCHIVE_NOT_APPLIED';
      return {
        success: false,
        error: {
          code: notApplied,
          message: `${config.tableName} ${outboxRecord.operation} did not acknowledge exactly one updated row`,
        },
      };
    }
    return { success: true };
  }
```

In `classifyError`, add `RESTORE_NOT_APPLIED` to the terminal list next to `ARCHIVE_NOT_APPLIED`.

- [ ] **Step 5: Use lifecycle operations in the groups repository**

In `src/db/repositories/groupsRepository.js`, import `enqueueLifecycleOutbox` from `./domainRepositoryUtils`. In `createMissingGroupAssignment`, replace the reactivation enqueue (`enqueueDomainOutbox(txn, 'group_ea_assignments', assignment.id, 'insert', assignment)`, about line 127) with:

```js
    const insertStillOwed = await txn.getFirstAsync(`
      select 1 as owed from sync_outbox
      where table_name = 'group_ea_assignments' and record_id = ? and operation = 'insert'
        and status in ('pending', 'failed', 'in_flight')
      limit 1
    `, assignment.id);
    if (insertStillOwed) {
      // The server never received this assignment. Re-queue the insert with its active payload and
      // drop any queued lifecycle row; there is nothing on the server to archive or restore.
      await txn.runAsync(`
        delete from sync_outbox
        where table_name = 'group_ea_assignments' and record_id = ?
          and operation in ('archive', 'restore') and status in ('pending', 'failed', 'terminal')
      `, assignment.id);
      await enqueueDomainOutbox(txn, 'group_ea_assignments', assignment.id, 'insert', assignment);
    } else {
      // Inserts are sent insert-or-ignore, so an insert cannot reactivate the server row.
      await enqueueLifecycleOutbox(txn, 'group_ea_assignments', assignment.id, 'restore', {
        id: assignment.id,
        unassigned_at: null,
        handover_reason: null,
      });
    }
```

In `archiveGroup`'s assignment loop (about line 442), replace `enqueueDomainOutbox(txn, 'group_ea_assignments', row.id, 'archive', ...)` with:

```js
      await enqueueLifecycleOutbox(txn, 'group_ea_assignments', row.id, 'archive', { id: row.id, unassigned_at: archivedAt });
```

- [ ] **Step 6: Run the suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/groupAssignmentLifecycle.test.js __tests__/offlineSyncOutbox.test.js __tests__/groupsRepository*.test.js --silent`
Expected: PASS. If an existing groups test asserts the reactivation enqueued `insert`, change it to assert `restore`, citing spec §6.5b in the test name.

- [ ] **Step 7: Commit**

```bash
git add src/db/repositories/domainRepositoryUtils.js src/db/repositories/groupsRepository.js src/services/offlineSync.js __tests__/groupAssignmentLifecycle.test.js
git commit -m "fix(sync): reactivate group assignments with a lifecycle restore

Reactivation was queued as an insert, which the server ignores for an existing
assignment, so the row stayed archived while the phone recorded success."
```

---

### Task 6: Full verification and documentation

**Files:**
- Modify: `documentation/rls-sync-contract-map.md`
- Modify: `documentation/build-log.md`
- Modify: `documentation/ROADMAP.md`
- Modify: `docs/agent-context/actor-lifecycle-and-upload-defects.md`

- [ ] **Step 1: Run every gate**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --silent
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --silent
HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres \
HISTORY_RLS_DATABASE_NAME=masi_history_rls_local \
HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE \
npm run verify:history-authorization:postgres && \
HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres \
HISTORY_RLS_DATABASE_NAME=masi_history_rls_local \
HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE \
npm run verify:upload-contract:postgres
```

Expected: every suite passes; the counts are Task 0's baseline plus the new tests; both harnesses print their JSON summaries.

- [ ] **Step 2: Update the contract map**

In `documentation/rls-sync-contract-map.md`:

- **Operation Semantics table:** add a row for "Edit (`update`)" covering `time_entries`, `classes`, `children`, `groups`, and `letter_mastery`. Shape: `update(patch).eq('id', serverId).select('id')`, where `serverId` is the payload id after remap and `patch` excludes `id`, `created_by`, `created_at`, `user_id`, and `archived_by_user_id`. Rule: "Exercises the UPDATE policy only; PostgreSQL applies INSERT `WITH CHECK` to every upsert row, so edits never go as upserts. Zero rows is `UPDATE_NOT_APPLIED`, classified like `42501`." Note `class_grouping_state` as the upsert exception, with its reason.
- **Batched upsert row:** inserts only for the five tables above; also list the three assignment tables, which batch their inserts (fixes the drift the 2026-10-09 inventory found).
- **New row for `restore`:** a lifecycle UPDATE with the `ARCHIVE_SERVER_COLUMNS` allowlist; `RESTORE_NOT_APPLIED` is terminal; at most one queued lifecycle intent per record (`enqueueLifecycleOutbox`); pushed in the archive phase.
- **Error Classification (Item 10):** replace the "LIMITATION" sentence on membership-mediated grants with the new rule (either half of a membership-mediated grant pending counts; own-id subjects for classes, groups, and children), and add `UPDATE_NOT_APPLIED` and the same-record insert-before-update gate.
- **Known gap:** add that same-record ordering between an `archive` row and an `update` row for `letter_mastery` (toggle off, then on, then off offline) is not yet collapsed. It is owned by the upload-contract spec.

- [ ] **Step 3: Update the build log, roadmap, and briefing**

- `documentation/build-log.md` Verification Register: one row with the exact commands from Step 1 and their counts.
- Bug And Gap Register: update the 2026-10-09 rows for live defect 1 ("server half fixed in this branch; phone half pending Plan 2") and for the group-reactivation defect ("fixed").
- `documentation/ROADMAP.md` priority 5: mark the server half of live defect 1 and the reactivation defect as done in this branch; live defect 1's phone half and live defect 2 remain.
- `docs/agent-context/actor-lifecycle-and-upload-defects.md`: mark defect 3 fixed, mark defect 1's server half fixed, and note that "do not patch ad hoc" still applies to the phone half and defect 2 until Plan 2.

- [ ] **Step 4: Commit**

```bash
git add documentation/rls-sync-contract-map.md documentation/build-log.md documentation/ROADMAP.md docs/agent-context/actor-lifecycle-and-upload-defects.md
git commit -m "docs: record the upload-path contract and Plan 1 verification"
```

---

### Task 7: Hosted and device confirmation (only with Jim's yes)

**Files:** none changed, unless a check fails.

These checks touch the hosted test backend and a device build, so each one waits for Jim's explicit yes.

- [ ] **Step 1: Ask Jim before any hosted or EAS action**

Ask for approval of: (a) S3-lite, which runs the S1 UPDATE-by-id and impersonation cases against `segygjzpujphwvrubusm` with two disposable test accounts through the `sqlite-staging-sql` skill, with every write rolled back; (b) an EAS preview build of this branch for device checks.

- [ ] **Step 2: Device checks on the build (after the yes)**

On an iPhone and the Galaxy A03s:

1. Edit a child **the EA created**, then confirm the server row changed and Sync Status is clear. This is the regression check for the UPDATE path.
2. Clock out, then confirm the server `time_entries.sign_out_time`.
3. Remove and re-add the EA's group assignment, then confirm that the server row's `unassigned_at` is null.

Do **not** use "edit a Head Office-created child" as a pass/fail gate yet. Its phone half is fixed in Plan 2.

- [ ] **Step 3: Record results**

Add a Verification Register row with build ids, devices, and outcomes. Push the branch only with Jim's yes.
