# Lesson Plan C1: Lesson Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Build path:** Codex (gpt-5.6-sol) builds each task; Claude reviews the diff and runs the tests (AGENTS.md). Codex usually cannot run git commit in its sandbox, so the orchestrator runs the commit steps.

**Refreshed:** 2026-10-20 against origin/main f27b347 (#90) and spec rev 2 (2bb103a).

**Goal:** A durable, local-only lesson draft (one per EA), a Home "Lesson in progress" card that
resumes it, and the session-history completeness predicate the lesson engine needs. All of it stays
inert until wave 2's Lesson screen creates drafts.

**Architecture:** An additive local SQLite table `lesson_drafts` in the EA's own file holds at most
one row. A constant `slot` column backs the repository's refusal of a second draft.
`createLessonDraftsRepository` has no singleton and is reached only through the signed-in EA handle
as `repositories.lessonDrafts`. When a draft is created, the repository mints its session id and
fixes its lesson context, including the lesson's language **code** (`xh`, `en`, …). It validates the
JSON fields this slice owns, and the save path can delete the draft inside its own transaction.
`src/services/pullCoverage.js` reads the CAP-004 cursor (read-only) to say whether a lesson's
children have complete current-year history. Home reads the draft on focus and shows a
first-priority attention card. Tapping it navigates to the reserved `Lesson` route with
`{ draftId }`.

**Tech Stack:** React Native 0.81.5 / Expo SDK 54, expo-sqlite 16 (better-sqlite3 12 in tests),
uuid 13, @react-navigation/native 7.1, Jest 29 (jest-expo 54) + @testing-library/react-native 13.

**Spec:** `docs/superpowers/specs/2026-10-20-lesson-plan-design.md`, rev 2 (`2bb103a`). Jim approved
rev 1 on 2026-10-20; rev 2 aligns it with the assessment-results design ("AR",
`docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md`, built in part by
#90) and awaits his confirmation. This plan builds §7.2 in full, C7, the Home card in §5.5, and the
history-completeness predicate in §7.3. The cross-plan names come from the wave-1 sheet, rev 2
(`plan-interfaces.md`, "From `c1-lesson-draft`"). Read the spec's §0.1, §5.5, §6, §7.2 and §7.3
before any task.

## Global Constraints

- **One lesson in progress per EA (C7).** A second `create()` is refused with the id of the draft in
  progress. It never overwrites that draft.
- **Local only (§7.2).** `lesson_drafts` is never synced. It has no `sync_status`,
  `last_sync_error` or `server_updated_at` column (otherwise `syncContractCompleteness.test.js:43-95`
  would demand it in `PUSH_ORDER`). No outbox row, no `SERVER_COLUMNS` entry, no Supabase
  migration, no RLS.
- **Per-EA file, handle only (ADR-0008).** The repository exports no singleton. Production reaches it
  only as `useSignedInEA().repositories.lessonDrafts` / `handle.repositories.lessonDrafts`.
  `__tests__/productionBindingStatic.test.js` must stay green.
- **Inert until C3.** This plan adds no production caller of `create`, `update` or `discard`. Wave
  2 creates the draft on the EA's first change, never when the screen opens (§7.2). Wave 2 also
  registers the `Lesson` route in the same change that first calls `create()`.
- **Lesson context is fixed at creation (§7.2, C14, C18).** `session_id`, `programme_id` and
  `group_id` are fixed when the draft is created. `class_id`, `language_code` and `pack_id` are
  fixed once `class_id` is set. `lesson_date` changes only through an explicit `update` (the Wrap up
  date, §5.3); the repository never rewrites it.
- **Languages are codes (spec §0.1; AR §6.1).** `language_code` and every tracker change's
  `languageCode` must be a key of `LANGUAGE_LABELS` (`src/utils/assessmentRegistry.js:5`: today
  `en`, `xh`, `zu`; AF adds `af`). A label (`isiXhosa`) or a pack's shared language name
  (`isixhosa`) is refused. C1 never resolves a language. Wave 2 passes
  `languageCodeForHomeLanguage(class.home_language)` (`:7-17`), and a `null` result stays `null`
  (the lesson then has no language, and its tracker shows #90's empty state).
- **Pending tracker change shape (AF, sheet):**
  `{ [childId]: { [letter]: { mastered: boolean, languageCode: string, madeAt: string /* ISO tap time */ } } }`,
  stored and returned unchanged. Every change's `languageCode` equals the draft's `language_code`
  (plan call). C18 saves marks in the lesson's language, and this pins that at the storage boundary,
  so a draft whose language is `null` holds no tracker changes.
- **Reading levels:** the draft holds only levels the EA changed, as `{ [childId]: level }`, where
  `level` is one of `READING_LEVELS` (`src/constants/literacyConstants.js:11-19`).
- **Save atomicity (§7.2):** `discard(id, { transaction })` runs inside the caller's transaction. A
  save that rolls back keeps the draft and its `session_id`.
- **Local schema version.** Main is at version 15 (`assessment_results`, #90). The new migration,
  named `lesson_drafts`, takes the **next free version at build time**, N. N is 16 unless B2 or
  another slice merges a local migration first. Tests find it by name and compare against
  `CURRENT_SCHEMA_VERSION`, never a literal number. The literal `user_version: 15` pins switch to
  `CURRENT_SCHEMA_VERSION` (Task 1). B2 makes the identical edits, which merge cleanly.
- **Survives** force-quit, process death, offline restart and app upgrade. The migration is
  additive.
- **Home (§5.5):** new item kind `lesson_in_progress`. It is the highest priority and counts toward
  `MAX_ATTENTION_ITEMS = 2` (`src/utils/homeAttention.js:8`). Copy, verbatim:
  - title `Lesson in progress`;
  - subtitle `<names> · Resume`, with U+00B7 and a space each side (`Amahle & Lulu · Resume`), or
    `Resume` when no name is known;
  - accessibility label `Lesson in progress with <spoken names>. Resume`, or
    `Lesson in progress. Resume`.
  - Route `Lesson`, params `{ draftId }`.
- **History is complete (§7.3) only when** the stored session walk has `complete === true`, has no
  `lastFailureAt`, its `windowStart` equals the active academic year's `starts_on`, and every present
  child is in its `rescanChildIds`. It reads only the CAP-004 session-history cursor. Completeness of
  letter evidence is AR Plan 3's `masteryInputsComplete` (spec §7.6, ask 3), not this slice.
- **Tests:** prefix every command with `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH"`.
  - Unit: `npx jest <file>`. (Plain `jest` also runs the real-SQLite suites, through
    `test-support/expoSQLiteMock`.)
  - Real SQLite: also list the file in `jest.integration.config.js` `testMatch` (an explicit list;
    the integration runner ignores unlisted files), then run
    `npm run test:integration -- <file>`.
  - Assert rejections with `rejects.toMatchObject(...)`, never `rejects.toThrow()` (it misreports
    in multi-file runs).
- **No new dependencies** (`uuid` is already a dependency). Stay on npm.
- **Design system:** no hex, `rgb(`, raw `fontSize`, `fontWeight` or literal `fontFamily` in the edited
  components (`__tests__/designSystemGuard.test.js`).
- **Commits:** the orchestrator stages the listed files and ends each message with the session's
  attribution trailer. Never `git stash`. Build-log rows appended by parallel slices conflict on
  rebase; resolve them by keeping both, in commit order.

## Review Focus

1. **The phone dies or the app is force-quit mid-lesson, then reopens offline.** The same draft
   returns, with the same `session_id`, context, language and tap times, and Home shows the card.
   Pinned in Task 3 (process death plus offline relaunch, real files) and Task 5 (card from a stored
   draft).
2. **A language arrives in the wrong spelling, or in another language than the lesson's.** Three
   spellings now coexist: codes (`xh`), Plan 1 confirmation labels (`isiXhosa`) and the shared pack
   file's name (`isixhosa`). The draft refuses anything that is not a registry code, and refuses a
   tracker change in a language other than the lesson's (C18). The error names the field, and the
   stored draft is unchanged. Pinned in Task 2.
3. **A save deletes the draft inside its transaction and then fails.** The draft is back with the
   same `session_id`, so the retry cannot create a second session. Pinned in Task 2 (rollback through
   `runRepositoryTransaction`).
4. **A second EA signs in on the same phone mid-lesson.** They never see or resume the first EA's
   lesson. The first EA gets it back on their next sign-in, and a stale repository refuses to write.
   Pinned in Task 3.
5. **Home meets an odd draft or a failed read.** The lesson's children have left My Children, every
   child is marked absent, or a draft column cannot be parsed: the card still shows and falls back to
   `Resume`. The draft read fails (a stale handle at sign-out, or SQLite busy): today's sessions card
   and the other attention cards still render, and Home never shows "Couldn’t load". Pinned in Task 2
   (corrupt JSON reads as the empty default) and Task 5 (`lessonInProgressFromDraft` cases and the
   failed-read screen test).

---

### Before Task 1: preflight (orchestrator, no commit)

- [ ] **Step 1:** If the worktree has no `node_modules` (true on 2026-10-20), run `npm ci`.
- [ ] **Step 2:** Run `npx jest` and `npm run test:integration` (both with the Node 20 prefix).
  Expected: PASS. Record the counts for the build log.
- [ ] **Step 3:** Read the last entry of `MIGRATIONS` in `src/db/migrations.js` (today
  `version: 15`, `assessment_results`, `:735-796`). The new migration takes the next number, N. If
  another wave-1 slice merged a local migration first, rebase and take the number after it.

---

### Task 1: Local schema `lesson_drafts`

**Files:**
- Modify: `src/db/migrations.js` (append to `MIGRATIONS` after `:796`)
- Create: `__tests__/lessonDraftsMigration.test.js`
- Modify: `jest.integration.config.js` (`testMatch`, after `:60`)
- Modify (version pins that would otherwise break):
  - `__tests__/sqliteFoundation.test.js:142` (`toBe(15)` → `toBe(N)`, the one deliberate tripwire),
    and add the ledger entry after `:646`;
  - `__tests__/timeEntryLocationMigration.test.js:28`, `__tests__/rowVersionLocal.test.js:50` and
    `:137`, `__tests__/outboxOwnerMigration.test.js:19`,
    `__tests__/migrations.assessmentResults.test.js:108`;
  - `__tests__/migrations.assessmentResults.test.js:115-117` (the test
    `'CURRENT_SCHEMA_VERSION is 15'`).
- Modify: `documentation/build-log.md`

**Interfaces:**
- Produces: the table below, through migration `{ version: N, name: 'lesson_drafts' }`. Task 2 is
  the only code that reads or writes it.

- [ ] **Step 1: Write the failing tests** in `__tests__/lessonDraftsMigration.test.js`. Use real
  better-sqlite3 and the `timeEntryLocationMigration.test.js:5-8` pattern, at the version just
  before this migration:
  - `const draftsMigration = () => MIGRATIONS.find((m) => m.name === 'lesson_drafts');`
  - `const BASE = (draftsMigration()?.version ?? CURRENT_SCHEMA_VERSION + 1) - 1;`
  - apply `MIGRATIONS.filter((m) => m.version <= BASE)`, then `PRAGMA user_version = ${BASE}`.

  Building from the previous version, not a literal 15, keeps the suite valid whichever slice merges
  its migration first (plan call). Seed one `programmes` row, one `sessions` row for it and one
  `sync_outbox` row. The outbox row needs `owner_user_id = 'ea'`, because the v12 trigger refuses a
  NULL owner.

```js
test('upgrading the previous version keeps every row and adds an empty lesson_drafts table', async () => {
  const sessions = await db.getAllAsync('select * from sessions order by id');
  const outbox = await db.getAllAsync('select * from sync_outbox order by id');
  await runMigrations(db);
  expect(draftsMigration().version).toBeGreaterThan(15); // found by name; later slices may add more
  expect(await db.getFirstAsync('pragma user_version')).toEqual({ user_version: CURRENT_SCHEMA_VERSION });
  expect(await db.getAllAsync('select * from sessions order by id')).toEqual(sessions);
  expect(await db.getAllAsync('select * from sync_outbox order by id')).toEqual(outbox);
  expect(await db.getFirstAsync('select count(*) as n from lesson_drafts')).toEqual({ n: 0 });
  expect(await db.getAllAsync('pragma foreign_key_check')).toEqual([]);
});

test('lesson_drafts is local only: exactly these columns and no sync bookkeeping', async () => {
  await runMigrations(db);
  const columns = (await db.getAllAsync('pragma table_info(lesson_drafts)')).map((c) => c.name);
  expect(columns).toEqual(['id', 'slot', 'session_id', 'programme_id', 'group_id', 'class_id',
    'language_code', 'pack_id', 'lesson_date', 'attendance', 'plan', 'plan_fixed_at', 'ticks',
    'tracker_changes', 'reading_level_changes', 'notes', 'created_at', 'updated_at']);
  expect(await db.getAllAsync('pragma foreign_key_list(lesson_drafts)')).toEqual([]);
});

test('the database refuses a second draft row', async () => {
  await runMigrations(db);
  const insert = (id, sessionId, slot = 1) => db.runAsync(`insert into lesson_drafts
    (id, slot, session_id, programme_id, group_id, lesson_date) values (?, ?, ?, 'p', 'g', '2026-10-19')`,
    id, slot, sessionId);
  await insert('d1', 's1');
  await expect(insert('d2', 's2')).rejects.toMatchObject({ message: expect.stringMatching(/UNIQUE constraint failed: lesson_drafts.slot/) });
  await expect(insert('d3', 's3', 2)).rejects.toMatchObject({ message: expect.stringMatching(/CHECK constraint failed/) });
});

test('relaunching runs no migration and leaves a stored draft untouched', async () => {
  await runMigrations(db);
  await db.runAsync(`insert into lesson_drafts (id, session_id, programme_id, group_id, lesson_date, notes)
    values ('d1', 's1', 'p', 'g', '2026-10-19', 'kept')`);
  const before = await db.getAllAsync('select * from lesson_drafts');
  await runMigrations(db);
  expect(await db.getAllAsync('select * from lesson_drafts')).toEqual(before);
});
```

- [ ] **Step 2: Run to verify it fails.** Add the file to `testMatch`, then run
  `npm run test:integration -- __tests__/lessonDraftsMigration.test.js` → FAIL
  (`no such table: lesson_drafts`, or `draftsMigration()` undefined).
- [ ] **Step 3: Implement the migration.** Append `{ version: N, name: 'lesson_drafts', sql }` with
  this SQL. Add a JS comment above it naming C7, and the v12 trigger (`:683-694`) as the precedent
  for a database backstop behind a code check.

```sql
create table if not exists lesson_drafts (
  id text primary key,
  slot integer not null default 1 unique check (slot = 1),
  session_id text not null unique,
  programme_id text not null,
  group_id text not null,
  class_id text,
  language_code text,
  pack_id text,
  lesson_date text not null,
  attendance text not null default '{}',
  plan text,
  plan_fixed_at text,
  ticks text not null default '{}',
  tracker_changes text not null default '{}',
  reading_level_changes text not null default '{}',
  notes text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

  The table deliberately has no foreign keys (plan call). A deleted or reconciled group, class or
  child must neither block that delete nor cascade away a lesson in progress. Wave 2's save decides
  what a missing group means (C19 and B2).
- [ ] **Step 4: Fix the version pins.**
  - In `timeEntryLocationMigration.test.js:28`, `rowVersionLocal.test.js:50,137`,
    `outboxOwnerMigration.test.js:19` and `migrations.assessmentResults.test.js:108`, replace
    `{ user_version: 15 }` with `{ user_version: CURRENT_SCHEMA_VERSION }`, importing it where it is
    not imported yet. These suites test their own migration's data, not the newest version.
    `migrations.assessmentResults.test.js:109-110` keeps checking the `assessment_results` ledger row.
  - Rename `migrations.assessmentResults.test.js:115-117` from `CURRENT_SCHEMA_VERSION is 15` to
    `assessment_results is local schema version 15`, asserting
    `MIGRATIONS.find(({ name }) => name === 'assessment_results').version` is `15` (plan call: one
    "newest version" tripwire, in `sqliteFoundation.test.js`). This edit is byte-identical to B2's
    (b2-session-group Task 2), so whichever lands second merges cleanly. The `sqliteFoundation`
    tripwire and ledger lines differ by design (N is 16 or 17); the second to land resolves them.
  - In `sqliteFoundation.test.js:142`, set the tripwire to N. Add
    `{ version: N, name: 'lesson_drafts' }` to the ledger after `:646`.
- [ ] **Step 5: Run.** Run the new suite, then `npx jest __tests__/sqliteFoundation.test.js
  __tests__/timeEntryLocationMigration.test.js __tests__/rowVersionLocal.test.js
  __tests__/outboxOwnerMigration.test.js __tests__/migrations.assessmentResults.test.js
  __tests__/syncContractCompleteness.test.js __tests__/productionBindingStatic.test.js`.
  Expected: PASS.
- [ ] **Step 6: Build log.** Add a Verification Register row: "C1 Task 1, local schema N
  `lesson_drafts` (local only, one-row slot)", with both commands and their counts.
- [ ] **Step 7: Commit** (the files above):
  `feat(db): local lesson_drafts table, one draft per EA file (C7)`.

---

### Task 2: `lessonDraftsRepository`

**Files:**
- Create: `src/db/repositories/lessonDraftsRepository.js`
- Create: `__tests__/lessonDraftsRepository.test.js`
- Modify: `jest.integration.config.js` (`testMatch`)
- Modify: `documentation/build-log.md`

**Interfaces:**
- Consumes:
  - the Task 1 table;
  - `resolveDatabase` and `runRepositoryTransaction` (`src/db/repositories/repositoryRuntime.js:22-33`);
  - `decodeJson`, `encodeJson`, `timestamp` (`src/db/repositories/sqliteRepositoryUtils.js:9, 47-60`);
  - `parseDateKey` (`src/utils/sessionDateFormat.js:17`);
  - `READING_LEVELS` (`src/constants/literacyConstants.js:11`);
  - `LANGUAGE_LABELS` (`src/utils/assessmentRegistry.js:5`);
  - `uuid` `v4`.
- Produces (wave 2's C2–C3, Task 3 and Task 5 rely on these exact names):

```js
export class LessonDraftExistsError extends Error {}    // name 'LessonDraftExistsError', code 'LESSON_DRAFT_EXISTS', draftId
export class LessonDraftNotFoundError extends Error {}  // name 'LessonDraftNotFoundError', code 'LESSON_DRAFT_NOT_FOUND', draftId
export class LessonDraftContextError extends Error {}   // name 'LessonDraftContextError', code 'LESSON_DRAFT_CONTEXT_FIXED', field
export const presentChildIds = (attendance) => string[]; // childIds minus absentChildIds, order kept
export const createLessonDraftsRepository = ({ database, idFactory = uuidv4 } = {}) => ({
  getActive: () => Promise<Draft | null>,
  create: (input) => Promise<Draft>,                      // LessonDraftExistsError | TypeError
  update: (id, patch) => Promise<Draft>,                  // LessonDraftNotFoundError | LessonDraftContextError | TypeError
  discard: (id, { transaction } = {}) => Promise<boolean>, // true when a row was deleted
});
// No `lessonDraftsRepository` singleton export.
```

  The `Draft` object (snake_case columns, JSON decoded, `slot` omitted):

| Field | Value |
|---|---|
| `id`, `session_id` | minted by `create` with `idFactory` (draft id first, then session id); fixed for the draft's life |
| `programme_id`, `group_id` | non-empty strings; fixed at creation |
| `class_id`, `pack_id` | non-empty string or `null`; when `class_id` is null, `language_code` and `pack_id` are null; all three fixed once `class_id` is set |
| `language_code` | a key of `LANGUAGE_LABELS`, or `null` until the EA picks the lesson's language (the class's language is unknown: AR's "null means ask"); while null, `pack_id` is null and `tracker_changes` is empty; fixed once set |
| `lesson_date` | `YYYY-MM-DD` accepted by `parseDateKey` |
| `attendance` | `{ childIds: string[], absentChildIds: string[], addedChildIds: string[] }`, ids distinct; absent and added ⊆ `childIds` |
| `plan` | a plain object (A3's plan, opaque here) or `null`; fixed once `plan_fixed_at` is set |
| `plan_fixed_at` | `null`, or an ISO time (the EA's first tick, C1); fixed once set |
| `ticks` | `{ letters: string[], blends: string[], books: { id: string, how: 'printed' \| 'app' }[] }`; any other keys wave 2 adds are kept unchanged |
| `tracker_changes` | the AF pending-change shape; each `languageCode` equals the draft's `language_code`; `madeAt` an ISO time |
| `reading_level_changes` | `{ [childId]: one of READING_LEVELS }` |
| `notes` | string or `null` |
| `created_at`, `updated_at` | ISO; `updated_at` is set by every `update` |

  The rules, all plan calls:
  - "An ISO time" is a string in `Date.prototype.toISOString()` form
    (`YYYY-MM-DDTHH:mm:ss.sssZ`) that `Date.parse` accepts.
  - `create(input)` requires `programme_id`, `group_id` and `lesson_date`. Every other field is
    optional and defaults to the empty shape above (`class_id`, `language_code`, `pack_id`, `plan`,
    `plan_fixed_at` and `notes` default to `null`). It refuses `id`, `session_id`, `created_at`,
    `updated_at` and unknown keys with a `TypeError`.
  - `update` replaces each JSON field it is given **whole**. A fixed field in a patch is accepted only
    when it equals the stored value; otherwise it throws `LessonDraftContextError`. While the stored
    `class_id` is null, one patch may set `class_id` together with `language_code` and `pack_id`
    (C18's one-time class pick for a mixed-class group). While the stored `language_code` is null
    and `class_id` is set, one patch may set `language_code` together with `pack_id` (the EA's
    one-time language pick for a class with no known language; plan call, following AR §9.1's
    "null means ask, never English").
  - Validation runs on the merged draft, so the language rule for `tracker_changes` holds whatever
    order the fields arrive in.
  - A shape violation throws a `TypeError` whose message names the field path
    (e.g. `tracker_changes.c1.m.madeAt`).
  - A column that cannot be decoded reads as its empty default, never as a throw.

- [ ] **Step 1 (tracer): write the failing tests** for create, read and the one-draft rule. Use
  `createMigratedDatabase(runMigrations)` (`test-support/sqliteRepositoryTestUtils.js:3`) and
  `idFactory: () => \`id-${++n}\``.

```js
const MONDAY_TAP = '2026-10-19T08:15:00.000Z';
const start = {
  programme_id: 'programme-a', group_id: 'group-1', class_id: 'class-1', language_code: 'xh',
  pack_id: 'isixhosa-interim-letters-v1', lesson_date: '2026-10-19',
  attendance: { childIds: ['c1', 'c2'], absentChildIds: [], addedChildIds: [] },
};

test('no lesson in progress reads as null', async () => {
  expect(await repo.getActive()).toBeNull();
});

test('create keeps the lesson context, mints the session id and fills empty defaults', async () => {
  const draft = await repo.create(start);
  expect(draft).toEqual({
    id: 'id-1', session_id: 'id-2', ...start,
    plan: null, plan_fixed_at: null, ticks: { letters: [], blends: [], books: [] },
    tracker_changes: {}, reading_level_changes: {}, notes: null,
    created_at: expect.any(String), updated_at: expect.any(String),
  });
  expect(await repo.getActive()).toEqual(draft);
});

test('a second lesson is refused and names the one in progress (C7)', async () => {
  const first = await repo.create(start);
  await expect(repo.create({ ...start, group_id: 'group-2' })).rejects.toMatchObject({
    name: 'LessonDraftExistsError', code: 'LESSON_DRAFT_EXISTS', draftId: first.id,
  });
  expect(await repo.getActive()).toEqual(first);
});

test('create refuses a caller-chosen session id, a missing context and a language that is not a code', async () => {
  for (const bad of [
    { ...start, session_id: 'mine' },
    { ...start, lesson_date: '19/10/2026' },
    { ...start, group_id: '' },
    { ...start, class_id: null },             // a language and pack without a class
    { ...start, language_code: 'isiXhosa' },  // a stored label
    { ...start, language_code: 'isixhosa' },  // the shared pack file's name
  ]) {
    await expect(repo.create(bad)).rejects.toMatchObject({ name: 'TypeError' });
  }
  expect(await repo.getActive()).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails.**
  `npm run test:integration -- __tests__/lessonDraftsRepository.test.js` (after adding it to
  `testMatch`) → FAIL (module not found).
- [ ] **Step 3: Implement** `createLessonDraftsRepository` with `getActive` and `create`, the three
  error classes and `presentChildIds`. `create` runs in `runRepositoryTransaction(database, …)`:
  select any row, throw `LessonDraftExistsError(existing.id)` if one exists, insert, then read back.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Write the failing tests for `update`.**

```js
test('update changes only what it is given and never the session id', async () => {
  const draft = await repo.create(start);
  const next = await repo.update(draft.id, { notes: 'Lulu tired', ticks: { letters: ['k'], blends: [], books: [] } });
  expect(next).toEqual({ ...draft, notes: 'Lulu tired', ticks: { letters: ['k'], blends: [], books: [] }, updated_at: expect.any(String) });
  expect(next.session_id).toBe(draft.session_id);
});

test('tracker changes keep the tap time and the lesson language exactly', async () => {
  const draft = await repo.create(start);
  const marks = { c1: { m: { mastered: true, languageCode: 'xh', madeAt: MONDAY_TAP } },
    c2: { o: { mastered: false, languageCode: 'xh', madeAt: MONDAY_TAP } } };
  await repo.update(draft.id, { tracker_changes: marks });
  expect((await repo.getActive()).tracker_changes).toEqual(marks);
  for (const bad of [
    { c1: { m: true } },
    { c1: { m: { mastered: true, languageCode: 'xh' } } },                          // no tap time
    { c1: { m: { mastered: true, languageCode: 'isiXhosa', madeAt: MONDAY_TAP } } }, // a label, not a code
    { c1: { m: { mastered: true, languageCode: 'en', madeAt: MONDAY_TAP } } },       // not the lesson's language (C18)
  ]) {
    await expect(repo.update(draft.id, { tracker_changes: bad })).rejects.toMatchObject({
      name: 'TypeError', message: expect.stringMatching(/tracker_changes\.c1\.m/) });
  }
  expect((await repo.getActive()).tracker_changes).toEqual(marks);
});

test('a class with no known language waits for one language pick, then fixes it', async () => {
  await expect(repo.create({ ...start, language_code: null })).rejects.toMatchObject({ name: 'TypeError' }); // a pack with no language
  const draft = await repo.create({ ...start, language_code: null, pack_id: null });
  expect(draft).toMatchObject({ class_id: 'class-1', language_code: null, pack_id: null });
  await expect(repo.update(draft.id, { tracker_changes: { c1: { m: { mastered: true, languageCode: 'en', madeAt: MONDAY_TAP } } } }))
    .rejects.toMatchObject({ name: 'TypeError' }); // no tracker changes before the pick
  const picked = await repo.update(draft.id, { language_code: 'en', pack_id: 'english-interim-letters-v1' });
  expect(picked).toMatchObject({ class_id: 'class-1', language_code: 'en', pack_id: 'english-interim-letters-v1' });
  await expect(repo.update(draft.id, { language_code: 'xh' }))
    .rejects.toMatchObject({ name: 'LessonDraftContextError', field: 'language_code' }); // fixed once picked
});

test('reading levels hold only the levels the EA changed', async () => {
  const draft = await repo.create(start);
  expect(draft.reading_level_changes).toEqual({});
  await repo.update(draft.id, { reading_level_changes: { c1: '3 Letter Blends' } });
  expect((await repo.getActive()).reading_level_changes).toEqual({ c1: '3 Letter Blends' });
  await expect(repo.update(draft.id, { reading_level_changes: { c2: 'Level 5' } }))
    .rejects.toMatchObject({ name: 'TypeError' });
});

test('the lesson context is fixed: class, language and pack once set; group, programme and session always', async () => {
  const draft = await repo.create(start);
  for (const [field, value] of [['class_id', 'class-2'], ['language_code', 'en'], ['pack_id', 'x'],
    ['group_id', 'group-2'], ['programme_id', 'p2'], ['session_id', 's2']]) {
    await expect(repo.update(draft.id, { [field]: value })).rejects.toMatchObject({
      name: 'LessonDraftContextError', field });
  }
  await expect(repo.update(draft.id, { class_id: 'class-1' })).resolves.toMatchObject({ class_id: 'class-1' }); // same value
  expect((await repo.update(draft.id, { lesson_date: '2026-10-16' })).lesson_date).toBe('2026-10-16'); // Wrap up date
});

test('a mixed-class group picks its class once (C18)', async () => {
  const draft = await repo.create({ ...start, class_id: null, language_code: null, pack_id: null });
  const picked = await repo.update(draft.id, { class_id: 'class-2', language_code: 'en', pack_id: 'english-interim-letters-v1' });
  expect(picked).toMatchObject({ class_id: 'class-2', language_code: 'en', pack_id: 'english-interim-letters-v1' });
  await expect(repo.update(draft.id, { class_id: 'class-1' })).rejects.toMatchObject({ name: 'LessonDraftContextError' });
});

test('the plan is fixed once the first tick fixes it', async () => {
  const draft = await repo.create(start);
  await repo.update(draft.id, { plan: { engine_version: 1, made_on: '2026-10-19' } });
  await repo.update(draft.id, { plan: { engine_version: 1, made_on: '2026-10-19', reason: 'ok' }, plan_fixed_at: MONDAY_TAP });
  await expect(repo.update(draft.id, { plan: { engine_version: 1, made_on: '2026-10-21' } }))
    .rejects.toMatchObject({ name: 'LessonDraftContextError', field: 'plan' });
  await expect(repo.update(draft.id, { plan_fixed_at: null }))
    .rejects.toMatchObject({ name: 'LessonDraftContextError', field: 'plan_fixed_at' });
});

test('attendance names only children on the lesson', async () => {
  const draft = await repo.create(start);
  const next = await repo.update(draft.id, { attendance: { childIds: ['c1', 'c2', 'c9'], absentChildIds: ['c2'], addedChildIds: ['c9'] } });
  expect(presentChildIds(next.attendance)).toEqual(['c1', 'c9']);
  await expect(repo.update(draft.id, { attendance: { childIds: ['c1'], absentChildIds: ['c2'], addedChildIds: [] } }))
    .rejects.toMatchObject({ name: 'TypeError' });
});

test('keys wave 2 adds inside ticks survive a round trip', async () => {
  const draft = await repo.create(start);
  const ticks = { letters: [], blends: ['ku'], books: [{ id: 'xh-int-v1-r03', how: 'app' }], blendTierShown: '3 Letter Blends' };
  await repo.update(draft.id, { ticks });
  expect((await repo.getActive()).ticks).toEqual(ticks);
});

test('a column that cannot be parsed reads as its empty default', async () => {
  const draft = await repo.create(start);
  await db.runAsync("update lesson_drafts set attendance = 'not json', ticks = '[' where id = ?", draft.id);
  expect(await repo.getActive()).toMatchObject({
    attendance: { childIds: [], absentChildIds: [], addedChildIds: [] }, ticks: { letters: [], blends: [], books: [] } });
});

test('updating a draft that no longer exists is refused', async () => {
  await expect(repo.update('gone', { notes: 'x' })).rejects.toMatchObject({ name: 'LessonDraftNotFoundError', draftId: 'gone' });
});
```

- [ ] **Step 6: Run** the suite → FAIL (`repo.update is not a function`).
- [ ] **Step 7: Implement `update`** to the rules above, inside one `runRepositoryTransaction`: read
  the row (or throw not found), check the fixed fields, validate the merged result, write only the
  patched columns plus `updated_at`, then read back.
- [ ] **Step 8: Run** → PASS.
- [ ] **Step 9: Write the failing tests for `discard`** (Review Focus 3):

```js
test('a save that discards the draft and then fails keeps the draft and its session id', async () => {
  const draft = await repo.create(start);
  await expect(runRepositoryTransaction(db, async (txn) => {
    expect(await repo.discard(draft.id, { transaction: txn })).toBe(true);
    throw new Error('save failed');
  })).rejects.toMatchObject({ message: 'save failed' });
  expect(await repo.getActive()).toEqual(draft);
});

test('a committed discard removes the draft and frees the slot', async () => {
  const draft = await repo.create(start);
  await runRepositoryTransaction(db, (txn) => repo.discard(draft.id, { transaction: txn }));
  expect(await repo.getActive()).toBeNull();
  expect(await repo.discard(draft.id)).toBe(false);
  expect((await repo.create(start)).session_id).not.toBe(draft.session_id);
});
```

- [ ] **Step 10: Run** → FAIL (`repo.discard is not a function`).
- [ ] **Step 11: Implement `discard`.** With `transaction`, run on it; otherwise run in its own
  transaction. Return `changes > 0`.
- [ ] **Step 12: Run** the suite, then `npx jest __tests__/productionBindingStatic.test.js` → PASS.
- [ ] **Step 13: Build log.** Add a Verification Register row, plus one Decision Register row:
  "Lesson draft context, language code and plan are fixed at the storage boundary (C14, C18);
  tracker changes must be in the lesson's language; the save path deletes the draft in its own
  transaction".
- [ ] **Step 14: Commit:**
  `feat(lesson): lesson drafts repository — one per EA, fixed context, transactional discard`.

---

### Task 3: On the handle, isolated per EA, durable across restarts

**Files:**
- Modify: `src/session/handleServices.js:31-50` (add `lessonDrafts` to the `repositories` object)
- Modify: `test-support/legacyHandleMocks.js:3-11`. Add `lessonDrafts: 'lessonDraftsRepository'` to
  `modules`. Under the default test handle, `useSignedInEA()` returns only the keys in this map
  (`jest.setup.js:41-53`). No singleton exists, so `repositoriesForTest` falls through to the
  handle's real repository.
- Modify: `__tests__/handleServices.test.js:245-251` (add `'lessonDrafts'` to the exact key list)
- Create: `__tests__/lessonDraftsDurability.test.js`
- Modify: `jest.integration.config.js` (`testMatch`)
- Docs:
  - `documentation/rls-sync-contract-map.md`: Table Contract Map row, after
    `support_incident_queue` (`:859`);
  - `CONTEXT.md`: the glossary under "Work capture" (after **Session**, `:101-102`) and the settled
    decisions at `:246-248`;
  - `documentation/ROADMAP.md:461-464, 491-494`;
  - `documentation/group-session-workflow.md:85-92`;
  - `documentation/LEARNING.md`;
  - `documentation/build-log.md`.

**Interfaces:**
- Consumes: `createLessonDraftsRepository` (Task 2).
- Produces: `handle.repositories.lessonDrafts` and `useSignedInEA().repositories.lessonDrafts`, both
  bound to the signed-in EA's file.

- [ ] **Step 1: Write the failing tests.**
  - Edit `handleServices.test.js`'s key list.
  - Create `lessonDraftsDurability.test.js` with `global.__MASI_NO_DEFAULT_HANDLE__ = true` and
    `createPathDatabaseOpener(dir)` (`test-support/actorTestUtils.js:13`) over a temp dir. Follow the
    `handleServices.test.js:1-63` pattern.
  - `open(userId, transport)` calls `setLatestAuthSession` and then
    `requestOpen({ userId, openDatabase, fetchImpl: transport })`.
  - `offline = jest.fn(async () => { throw new TypeError('Network request failed'); })`.
  - `start` and `MONDAY_TAP` as in Task 2.

```js
test('a lesson draft survives process death and an offline relaunch unchanged', async () => {
  const a = await open(A, offline);
  const draft = await a.repositories.lessonDrafts.create(start);
  const saved = await a.repositories.lessonDrafts.update(draft.id, {
    tracker_changes: { c1: { m: { mastered: true, languageCode: 'xh', madeAt: MONDAY_TAP } } },
    reading_level_changes: { c2: '2 Letter Blends' },
  });
  // Process death: nothing is closed; the committed row is already on disk.
  const raw = createBetterSqliteTestDatabase(path.join(dir, a.fileName));
  expect(await raw.getFirstAsync('select session_id, language_code, lesson_date from lesson_drafts'))
    .toEqual({ session_id: saved.session_id, language_code: 'xh', lesson_date: '2026-10-19' });
  await raw.closeAsync();
  await resetHandleRegistryForTests(); // force-quit: every in-memory registry is gone
  const relaunched = await open(A, offline);
  expect(await relaunched.repositories.lessonDrafts.getActive()).toEqual(saved);
});

test('another EA on the phone never sees the lesson, and its EA gets it back', async () => {
  const a = await open(A, offline);
  const draft = await a.repositories.lessonDrafts.create(start);
  await requestClose({ reason: 'switch' });
  const b = await open(B, offline);
  expect(await b.repositories.lessonDrafts.getActive()).toBeNull();
  await expect(a.repositories.lessonDrafts.update(draft.id, { notes: 'late' }))
    .rejects.toMatchObject({ name: 'StaleActorError' });
  await b.repositories.lessonDrafts.create({ ...start, group_id: 'group-b' }); // B's own file, own slot
  await requestClose({ reason: 'switch back' });
  const again = await open(A, offline);
  expect(await again.repositories.lessonDrafts.getActive()).toEqual(draft);
});
```

- [ ] **Step 2: Run to verify it fails.**
  `npm run test:integration -- __tests__/lessonDraftsDurability.test.js __tests__/handleServices.test.js`
  → FAIL (`lessonDrafts` undefined; key list mismatch).
- [ ] **Step 3: Implement:** `lessonDrafts: createLessonDraftsRepository(options)` in the
  `repositories` object (after `localState`, `:49`), plus the `legacyHandleMocks` entry.
- [ ] **Step 4: Run** both suites, then `npx jest`. The legacy mock map touches every screen suite.
  Expected: PASS.
- [ ] **Step 5: Standing docs** (they ship with the table becoming reachable):
  - **Contract map, new Table Contract Map row `lesson_drafts`.**
    - Local only, in the per-EA file; SQLite vN.
    - Producers: `handle.repositories.lessonDrafts` (`createLessonDraftsRepository`). C1 has no
      production caller; C2–C3 creates drafts on the first change and calls
      `discard(id, { transaction })` inside the session save.
    - Required: `programme_id`, `group_id`, `lesson_date`; the repository mints `session_id`. One row
      per file (`slot`). `language_code` and tracker `languageCode` are `LANGUAGE_LABELS` codes.
    - Sync: never synced or enqueued; no server table; no RLS.
    - Tests: the Task 1–3 suites.
  - **CONTEXT.md.**
    - After `:248`, add a dated note (2026-10-20, lesson-plan spec §7.2):
      - in-progress literacy lessons live in the local `lesson_drafts` table, one per EA;
      - `sessions.state` stays `'completed'`, and a draft becomes a `sessions` row only when saved;
      - this is the session side of the SQLite-backed draft lifecycle that `:248` and
        group-session-workflow §4 call for, not a second mechanism. Battery Runs keep their own
        `battery_runs.status` lifecycle (AR, SQLite v15), and mid-Question assessment drafts stay
        out of scope (ROADMAP "Assessment draft persistence").
    - Add the glossary term **Lesson in progress** after **Session**: the EA's one unsaved lesson
      draft. It keeps its class, language code, content pack, lesson date and session id until it
      is saved or discarded. _Avoid_: "session in progress" (`sessions.state` is unused).
  - **ROADMAP.**
    - `:461-464`: the lesson draft is the session side of the SQLite-backed draft lifecycle. It is
      inert until C3, and `LiteracySessionForm` stays draft-less until C3 replaces it.
    - `:491-494`: the storage refuses a second start, one per EA (C7, stricter than per group).
      The finish-or-discard ask ships with C2–C3. v1 has no session timer (spec §8). Leave the item
      open until C3.
  - **group-session-workflow.md §4 (`:85-92`).** Add a status line: the lesson-plan spec's §7.2
    meets §4 with a draft table instead of a state machine on `sessions.state`; the resume action
    is Home's "Lesson in progress" card.
  - **LEARNING.md.** Add a short section, "A lesson in progress is its own table, not a session
    state". It covers:
    - why an unsaved row in `sessions` would have to be skipped by every reader (sync, history, daily
      counts, RLS);
    - why the `slot` constraint backs the code check (the v12 owner trigger precedent);
    - why `discard` joins the caller's transaction;
    - why the draft stores language codes and pins each tracker change to the lesson's language.
  - **Build log.** Add a Verification Register row.
- [ ] **Step 6: Commit:**
  `feat(lesson): lesson drafts on the signed-in EA handle, durable and per-EA; docs`.

---

### Task 4: History completeness predicate (`pullCoverage.js`)

**Files:**
- Create: `src/services/pullCoverage.js`
- Create: `__tests__/pullCoverage.test.js`
- Modify: `jest.integration.config.js` (`testMatch`)
- Modify: `documentation/rls-sync-contract-map.md` (the "Session history hydration (CAP-004)"
  section, `:759-792`); `documentation/build-log.md`

**Interfaces:**
- Consumes:
  - `sessionHistoryScope(userId, programmeId)` (`src/services/sessionHistoryPull.js:23`);
  - the CAP-004 cursor fields `complete`, `lastFailureAt`, `windowStart` and `rescanChildIds`
    (`sessionHistoryPull.js:90-96, 168, 247, 268, 283`);
  - `createSyncStateRepository({ database }).getPullState(scope)` (returns `cursor` as a JSON
    string, `src/db/repositories/syncStateRepository.js:31-35`);
  - `getActiveProgrammeId(db, userId)` and `getActiveAcademicYear(db)`
    (`src/db/repositories/domainRepositoryUtils.js:232, 261`).
- Produces (wave 2's engine input builder calls `isSessionHistoryComplete`; AR Plan 3's
  `masteryInputsComplete`, spec §7.6 ask 3, may reuse `isCoverageWalkComplete` for its walks):

```js
// cursor: the parsed object or the raw JSON string from sync_state. Fails closed on anything malformed.
// windowStart: null skips the year check (a walk with no year bound, such as AR's mastery walk).
export const isCoverageWalkComplete = (cursor, { childIds = [], windowStart = null } = {}) => boolean;
// programmeId / academicYearStart default to the pull's own sources (sessionHistoryPull.js:84-85)
// when omitted. A missing programme, year or cursor → false. Empty childIds → the walk-level answer.
export const isSessionHistoryComplete = async ({ database, userId, programmeId, childIds = [], academicYearStart }) => Promise<boolean>;
```

- [ ] **Step 1: Write the failing pure tests.**

```js
const walked = { windowStart: '2026-01-15', complete: true, lastFailureAt: null, rescanChildIds: ['child-a', 'child-b'] };

test('a finished walk covering every present child of this year is complete', () => {
  expect(isCoverageWalkComplete(walked, { childIds: ['child-a', 'child-b'], windowStart: '2026-01-15' })).toBe(true);
  expect(isCoverageWalkComplete(JSON.stringify(walked), { childIds: ['child-a'] })).toBe(true);
});
test('an unfinished walk, a failure since the last success, last year, or an uncovered child is not', () => {
  expect(isCoverageWalkComplete({ ...walked, complete: false }, { childIds: ['child-a'] })).toBe(false);
  expect(isCoverageWalkComplete({ ...walked, lastFailureAt: '2026-10-20T07:00:00.000Z' }, { childIds: ['child-a'] })).toBe(false);
  expect(isCoverageWalkComplete(walked, { childIds: ['child-a'], windowStart: '2027-01-13' })).toBe(false);
  expect(isCoverageWalkComplete(walked, { childIds: ['child-a', 'child-c'] })).toBe(false);
});
test('anything malformed fails closed', () => {
  for (const bad of [null, undefined, '', 'not json', '[]', 42, { complete: true }]) {
    expect(isCoverageWalkComplete(bad, { childIds: ['child-a'] })).toBe(false);
  }
});
```

- [ ] **Step 2: Run** `npm run test:integration -- __tests__/pullCoverage.test.js` (after adding it
  to `testMatch`) → FAIL (module not found).
- [ ] **Step 3: Implement `isCoverageWalkComplete`.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Write the failing tests against cursors the real pull writes.** Use the mocks at the
  top of `sessionHistoryPull.test.js:1-3`. Seed with `createMigratedDatabase` and `seedCoreData`
  (`user-1`, `programme-a`, `class-1`, `year-2026` from `2026-01-15`).
  - A local `addDeliveryChild(childId)` helper, copied from `sessionHistoryPull.test.js:73-76`,
    inserts the `children` and `child_ea_assignments` rows. Use it for `child-a` and `child-b`.
  - Set `wall = Date.parse('2026-10-20T08:00:00.000Z')`.
  - Add `child-g` with a `children` row only. That is how a group-only member looks to the walk:
    the delivery arm follows `child_ea_assignments`, `sessionHistoryPull.js:103-107`.
  - `pull(client)` calls `runSessionHistoryPull({ userId: 'user-1', force: true, deps: { state:
    createSessionHistoryState(), database: db, client, enqueueRequest: (task) => task(), wallNow:
    () => wall, random: () => 0.5 } })`.
  - `emptyServer.rpc()` returns `{ abortSignal: () => Promise.resolve({ data: [], error: null }) }`.
  - `failingServer` returns `{ data: null, error: { message: 'boom', code: 'XX000' } }`.

```js
const complete = (childIds) => isSessionHistoryComplete({ database: db, userId: 'user-1', childIds });

test('before any walk, history is incomplete', async () => {
  expect(await complete(['child-a'])).toBe(false);
});
test('a finished walk makes its children complete, and only them', async () => {
  await pull(emptyServer);
  expect(await complete(['child-a', 'child-b'])).toBe(true);
  expect(await complete(['child-a', 'child-g'])).toBe(false); // uncovered child (group-only member)
});
test('a child newly assigned between walks is incomplete until the next walk', async () => {
  await pull(emptyServer);
  await addDeliveryChild('child-c');
  expect(await complete(['child-a', 'child-c'])).toBe(false);
  await pull(emptyServer);
  expect(await complete(['child-a', 'child-c'])).toBe(true);
});
test('a year rollover before the next pull makes last year’s walk incomplete', async () => {
  await pull(emptyServer);
  await db.runAsync('update academic_years set is_active = 0');
  await db.runAsync(`insert into academic_years (id, label, starts_on, ends_on, is_active)
    values ('year-2027', '2027', '2027-01-13', '2027-12-10', 1)`);
  expect(await complete(['child-a'])).toBe(false);
  expect(await isSessionHistoryComplete({ database: db, userId: 'user-1', childIds: ['child-a'], academicYearStart: '2026-01-15' })).toBe(true); // explicit year wins
  await pull(emptyServer);
  expect(await complete(['child-a'])).toBe(true);
});
test('a failure since the last success is incomplete until a page succeeds', async () => {
  await pull(emptyServer);
  await pull(failingServer);
  expect(await complete(['child-a'])).toBe(false);
  await pull(emptyServer);
  expect(await complete(['child-a'])).toBe(true);
});
test('another programme’s walk does not count', async () => {
  await pull(emptyServer);
  expect(await isSessionHistoryComplete({ database: db, userId: 'user-1', programmeId: 'programme-b', childIds: ['child-a'] })).toBe(false);
});
```

- [ ] **Step 6: Run** → FAIL (`isSessionHistoryComplete is not a function`).
- [ ] **Step 7: Implement `isSessionHistoryComplete`.** Resolve the programme and year when omitted,
  read the pull state for `sessionHistoryScope(userId, programmeId)` through the sync-state
  repository, then delegate to `isCoverageWalkComplete` with `windowStart: academicYearStart`.
- [ ] **Step 8: Run** the suite plus `npx jest __tests__/sessionHistoryPull.test.js
  __tests__/productionBindingStatic.test.js` → PASS.
- [ ] **Step 9: Contract map, CAP-004 section.**
  - Under "Readers" (`:784-785`), add `pullCoverage.isSessionHistoryComplete` (lesson plan §7.3),
    which reads the cursor read-only. `complete`, `lastFailureAt`, `windowStart` and
    `rescanChildIds` are now a contract: renaming one must update `pullCoverage.js` and its tests.
    AR Plan 3's walks may reuse `isCoverageWalkComplete` with the same fields.
  - Note that this is stricter than the Sync screen's "Up to date" (`describeHistoryState`,
    `src/utils/syncStatusPresenter.js:106-115`), which ignores the year and the children covered.
    AR §11.5 will widen that row to the session, assessment and mastery walks. This predicate still
    reads only the session walk.
  - Fix `:761-763` (spec §11): the scope keeps one row per EA and programme in the EA's **own** file
    (ADR-0008), not one shared by every EA; the user id in the key is kept for support exports.

  Skip any part B2 has already merged.
- [ ] **Step 10: Build log.** Add a Verification Register row with the commands and counts.
- [ ] **Step 11: Commit:**
  `feat(history): pullCoverage — per-lesson session-history completeness (§7.3)`.

---

### Task 5: Home "Lesson in progress" card

**Files:**
- Modify: `src/utils/homeAttention.js` (`deriveHomeAttentionItems` `:66-91`; new builder and helper)
- Modify: `src/components/home/AttentionArea.js:9` (`ICONS`)
- Modify: `src/screens/main/HomeScreen.js`. Three places: `loadStats` `:81-114`, `attentionItems`
  `:126-132` and `openItem` `:134`.
- Test: `__tests__/homeAttention.test.js`, `__tests__/AttentionArea.test.js`,
  `__tests__/HomeScreen.test.js`
- Modify: `documentation/rls-sync-contract-map.md` (Home attention paragraph `:916-918`);
  `documentation/build-log.md`

**Interfaces:**
- Consumes: `repositories.lessonDrafts.getActive()` and `presentChildIds` (Task 2), and
  `formatNameList` (`src/utils/childNames.js:1`).
- Produces:
  - `deriveHomeAttentionItems({ …, lessonInProgress = null })`, where
    `lessonInProgress: { draftId: string, childNames: string[] } | null`.
  - `lessonInProgressFromDraft(draft, children) → { draftId, childNames } | null`. The names are
    `first_name` of the draft's present children found in `children`, in attendance order; unknown
    ids are skipped.
  - Items may carry `params`.
  - For wave 2: register `Lesson` in `MainNavigator`'s stack (`src/navigation/AppNavigator.js:158`),
    taking `{ draftId }`. No `Lesson` route exists today.

- [ ] **Step 1: Write the failing tests** in `homeAttention.test.js` (its `base` and `notice()` are at
  `:6-21`):

```js
const lesson = { draftId: 'draft-1', childNames: ['Amahle', 'Lulu'] };

test('a lesson in progress comes first and offers Resume', () => {
  expect(deriveHomeAttentionItems({ ...base, lessonInProgress: lesson })).toEqual([{
    key: 'lesson_in_progress:draft-1', kind: 'lesson_in_progress', tone: 'neutral',
    title: 'Lesson in progress', subtitle: 'Amahle & Lulu · Resume',
    accessibilityLabel: 'Lesson in progress with Amahle and Lulu. Resume',
    route: 'Lesson', params: { draftId: 'draft-1' }, dismissible: false,
  }]);
});
test('the lesson card stays inside the two-item cap and pushes lower items out', () => {
  expect(deriveHomeAttentionItems({ ...base, lessonInProgress: lesson, needsAttentionCount: 2,
    autoClockOut: notice(), coverage: { assessed: 11, total: 12 } }).map((i) => i.kind))
    .toEqual(['lesson_in_progress', 'sync_attention']);
});
test('three names, or none known, still read naturally', () => {
  const [three] = deriveHomeAttentionItems({ ...base, lessonInProgress: { draftId: 'd', childNames: ['Amahle', 'Lulu', 'Sipho'] } });
  expect(three.subtitle).toBe('Amahle, Lulu & Sipho · Resume');
  const [none] = deriveHomeAttentionItems({ ...base, lessonInProgress: { draftId: 'd', childNames: [] } });
  expect(none).toMatchObject({ subtitle: 'Resume', accessibilityLabel: 'Lesson in progress. Resume' });
});
test('lessonInProgressFromDraft names the present children this phone knows', () => {
  const draft = { id: 'draft-1', attendance: { childIds: ['c1', 'c2', 'c3'], absentChildIds: ['c2'], addedChildIds: [] } };
  const children = [{ id: 'c1', first_name: 'Amahle' }, { id: 'c2', first_name: 'Lulu' }];
  expect(lessonInProgressFromDraft(draft, children)).toEqual({ draftId: 'draft-1', childNames: ['Amahle'] });
  expect(lessonInProgressFromDraft({ ...draft, attendance: { childIds: ['c2'], absentChildIds: ['c2'], addedChildIds: [] } }, children))
    .toEqual({ draftId: 'draft-1', childNames: [] }); // everyone absent: still a lesson in progress
  expect(lessonInProgressFromDraft(null, children)).toBeNull();
});
```

  In `AttentionArea.test.js`, add one test. A `lesson_in_progress` item renders Ionicons
  `play-circle-outline` at size 22 on the `canvas` tile and the `chevron-forward`. It has no
  `Dismiss: Lesson in progress` button, and pressing the card calls `onOpen(item)`.
- [ ] **Step 2: Run** `npx jest __tests__/homeAttention.test.js __tests__/AttentionArea.test.js` → FAIL.
- [ ] **Step 3: Implement.**
  - Put the builder first in `deriveHomeAttentionItems` (before sync attention).
  - Add `lesson_in_progress: 'play-circle-outline'` to `ICONS`. The glyph is in the bundled Ionicons
    map (checked 2026-10-20 in
    `node_modules/expo/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json`).
  - Tone `neutral` keeps the `canvas` tile. Not dismissible (plan call): dismissing would hide unsaved
    work, and discarding belongs to the Lesson screen behind a confirm.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Write the failing screen tests** in `HomeScreen.test.js`, inside a new
  `describe('lesson in progress')` nested in `describe('HomeScreen')`. Its `beforeEach` runs after
  the suite's own `beforeEach` (`:114-166`) and does two things:
  - creates a real draft in the default test handle:
    `draft = await getDefaultTestHandle().repositories.lessonDrafts.create({ programme_id: 'programme-1', group_id: 'group-1', class_id: 'class-1', language_code: 'xh', pack_id: 'isixhosa-interim-letters-v1', lesson_date: '2026-10-19', attendance: { childIds: ['c1', 'c2'], absentChildIds: [], addedChildIds: [] } })`;
  - sets `mockUseChildren` to `Amahle` (`c1`) and `Lulu` (`c2`).

```js
test('a lesson in progress shows first and resumes the Lesson screen with its draft', async () => {
  mockUseOffline.mockReturnValue({ isOnline: true, waitingCount: 0, needsAttentionCount: 2, syncStatus: { failedItems: [] } });
  const navigation = { navigate: jest.fn() };
  const screen = renderHome(navigation);
  const card = await screen.findByLabelText('Lesson in progress with Amahle and Lulu. Resume');
  const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
  const lessonAt = labels.indexOf('Lesson in progress with Amahle and Lulu. Resume');
  expect(lessonAt).toBeGreaterThan(-1);
  expect(lessonAt).toBeLessThan(labels.indexOf('2 items need attention. Open sync status to sort it out'));
  fireEvent.press(card);
  expect(navigation.navigate).toHaveBeenCalledWith('Lesson', { draftId: draft.id });
});

test('a lesson saved or discarded elsewhere leaves Home on the next foreground', async () => {
  let foreground;
  AppState.addEventListener.mockImplementation((event, handler) => { foreground = handler; return { remove: jest.fn() }; });
  const screen = renderHome();
  await screen.findByLabelText('Lesson in progress with Amahle and Lulu. Resume');
  await getDefaultTestHandle().repositories.lessonDrafts.discard(draft.id);
  await act(async () => { foreground('active'); });
  await waitFor(() => expect(screen.queryByText('Lesson in progress')).toBeNull());
});

test('a failed lesson-draft read keeps today’s sessions and the other cards', async () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(getDefaultTestHandle().repositories.lessonDrafts, 'getActive').mockRejectedValue(new Error('draft read failed'));
  mockUseOffline.mockReturnValue({ isOnline: true, waitingCount: 0, needsAttentionCount: 1, syncStatus: { failedItems: [] } });
  const screen = renderHome();
  expect(await screen.findByText('2 of 3 sessions today')).toBeTruthy();
  expect(screen.getByLabelText('1 item needs attention. Open sync status to sort it out')).toBeTruthy();
  expect(screen.queryByText('Couldn’t load today’s sessions')).toBeNull();
  await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error loading lesson in progress:', expect.objectContaining({ message: 'draft read failed' })));
});
```

  The existing `sync attention card opens Sync status` test (`:423-431`) stays unchanged. It pins
  the one-argument `navigate('SyncStatus')`.
- [ ] **Step 6: Run** `npx jest __tests__/HomeScreen.test.js` → FAIL.
- [ ] **Step 7: Implement in `HomeScreen.js`.**
  - Take `lessonDrafts` from `repositories` (`:38`), and keep `lessonDraft` state.
  - Inside `loadStats`, read `lessonDrafts.getActive()` **isolated from the statistics**. Its
    rejection never sets `statsFailed`, and a statistics failure never clears the card. Apply the
    result only when `seq === loadSeqRef.current`. On rejection, ignore `StaleActorError`
    (`isStaleActorError`, already imported at `:23`); otherwise log
    `console.error('Error loading lesson in progress:', error)` and keep the previous draft.
  - Add `lessonDrafts` to the `useCallback` dependencies (`:114`).
  - Pass `lessonInProgress: lessonInProgressFromDraft(lessonDraft, childrenList)` to
    `deriveHomeAttentionItems`.
  - Change `openItem` to call `navigation.navigate(item.route, item.params)` only when `item.params`
    exists, and `navigation.navigate(item.route)` otherwise. This mirrors
    `src/hooks/useSessionLaunchGuard.js:28-34`.
- [ ] **Step 8: Run** `npx jest __tests__/HomeScreen.test.js __tests__/homeAttention.test.js
  __tests__/AttentionArea.test.js __tests__/homeTypeRoles.test.js __tests__/designSystemGuard.test.js
  __tests__/productionBindingStatic.test.js` → PASS.
- [ ] **Step 9: Docs.**
  - Contract map, Home attention paragraph: `lesson_in_progress` is derived from `lesson_drafts`
    and has no `local_state` key. It is the highest priority and is not dismissible.
  - Build log: a Verification row, plus a Decision row recording three things:
    - the card is unreachable until C3, because there is no producer;
    - `Lesson` is reserved;
    - `openItem` passes params only when present.
- [ ] **Step 10: Commit:**
  `feat(home): Lesson in progress attention card, first priority, resumes by draft id (§5.5)`.

---

### Task 6: Gates (orchestrator and Jim)

- [ ] **Step 1: Suites.** Run `npx jest`, `npm run test:integration` and `npm run test:types` (all
  with the Node 20 prefix). Expected: PASS with no skipped suites. Record the counts in the build log.
- [ ] **Step 2: Review.** Run a Codex adversarial review of the branch diff against its base. Engage
  each finding. Repeat until approved, or until the remaining findings are rare timing cases,
  recorded as accepted risks.
- [ ] **Step 3: Device gate, app upgrade (needs Jim's yes for the EAS preview build).** Before the
  build, run `npm run test:release` (spec §10). Test on a Galaxy A03s (Android, 360dp,
  `wm density 320`) and on an iPhone. Install the current `main` build (SQLite v15, #90), sign in,
  record one session, then install this branch's build **over it** (not a fresh install). Pass when
  every one of these holds:
  - The app opens past the database gate, with no update screen and no error.
  - Home looks as it did before, with no new attention card, at text sizes 1.0x and 1.3x
    (screenshot compared with the previous build).
  - Session History still lists the earlier session.
  - Profile → Export Database shows:
    - `schemaVersion` = N;
    - `migrations` ending in `{ version: N, name: 'lesson_drafts' }`;
    - `tableCounts.lesson_drafts` = 0.
- [ ] **Step 4: Card gate, carried into the C2–C3 device gate.** C1 ships no producer, so the card
  can only appear once C3 creates drafts. Copy these criteria into the C2–C3 plan's gate. On the A03s
  at 1.0x and 1.3x and on an iPhone at 1.0x:
  - with a lesson started for Amahle & Lulu, Home's first card reads `Lesson in progress` /
    `Amahle & Lulu · Resume`;
  - the subtitle wraps to at most two lines and is never truncated; the chevron shows and there is no
    ✕;
  - TalkBack and VoiceOver read `Lesson in progress with Amahle and Lulu. Resume`;
  - a tap opens that lesson;
  - after swiping the app away and relaunching in airplane mode, the card and the lesson's ticks are
    back.
- [ ] **Step 5: Build log.** Add the gate results row and close the C1 entry.
