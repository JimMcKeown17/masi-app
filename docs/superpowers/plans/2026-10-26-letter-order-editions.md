# Letter Order Editions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every class records the letter order edition it is taught from (`2026-10-23` for every Masi class), and every screen teaches from that one order.

**Architecture:** The books repo's letter order registry is vendored unchanged. The server owns
`classes.letter_order_edition`: a trigger sets it, and no client sends it. The phone stores the
server's value, and one resolver turns a class's edition and a language into a teaching order.
Packs carry the order they were built for, are linted against it, and are chosen by order id,
never by language. Mastery counts and validation keep a per-language 26-letter set, because
`letter_mastery` belongs to the child and the language, not the class.

**Tech Stack:** React Native 0.81, Expo 54, expo-sqlite, Jest + RNTL, Supabase Postgres 17, the
disposable PostgreSQL harness pattern in `scripts/*-postgres-harness.cjs`.

**Spec:** books repo `/Users/jimmckeown/Development/early-reader-books`, commit `9cd66f8`:
`docs/design/handoffs/2026-10-23-masi-app-letter-orders.md` (the handoff) and
`docs/design/2026-10-23-letter-order-versions.md` (the design note; it wins on disagreement). Read
both with `git -C <books> show 9cd66f8:<path>`. Branch: `feat/letter-orders`, stacked on
`feat/lesson-flow` (PR #97).

## Global Constraints

- Backend: `masi-app-sqlite` (`segygjzpujphwvrubusm`) only. Never query or change `jcqrlwetutnpuchjoyyd`.
  DDL only through `supabase/migrations/`. The hosted apply needs Jim's yes and runs through the
  `sqlite-staging-sql` helper from **this worktree**, the checkout that holds the reviewed
  migration (Task 9). The helper uses the invoking checkout's `supabase/` directory
  (`scripts/sqlite-staging.cjs:301`), and the main checkout is on another branch.
- The edition id is exactly `2026-10-23`. Four places must agree, and Task 2 pins them with a test:
  the server check constraint, the server trigger, the phone column default and
  `MASI_LETTER_ORDER_EDITIONS`.
- No `new_class_edition` schedule, on the server or the phone (handoff `9cd66f8`). It arrives with
  Masi's second edition, in the migration that widens the check constraint.
- The client never sends `letter_order_edition`. It goes in `INTENTIONALLY_UNSYNCED.classes`, never
  in `SERVER_COLUMNS.classes`.
- The registry is vendored byte for byte from books `9cd66f8:languages/letter-orders.json`,
  SHA-256 `33af38be2ceeb45051660ff790774e5aa55299fce8091c60ed055e166cfd2490`. Never edit it.
- The three preview word banks are copied byte for byte from books
  `6cd5e64:exports/app-preview/<file>` (the commit is the pin):
  `isixhosa-candidates-preview-v2.json` `7d12be70ad6061e4f243854c7375785ab287ff0c963cd43bfb728ad830b89366`,
  `english-candidates-preview-v1.json` `e430d4887104a04db6295bfd407891c3b0a4911c6ba99ab1d243684613364abd`,
  `afrikaans-candidates-preview-v1.json` `76d4aec38b0bd8748bd9bdfd9e9aaa0df3bbaae3c3671d0c4086977cbe800ba7`.
  They stay behind the existing preview gate.
- Release packs are append-only and hash-pinned. The v1 packs keep their bytes and stay bundled,
  and so does `isixhosa-candidates-preview-v1` (the handoff keeps it for saved drafts).
- Copy, exactly: `Update the app to teach this class's letters.` Existing empty states keep their
  copy: `No letter set for this class language.` and `No isiZulu letters yet.`
- Leave EGRA letter cards and all WelaPLUS and Full EGRA content untouched.
- Plain names in code, commits and docs ("letter order", "edition"), not slice codes.
- Node 20 for every Jest, tsc and harness run: prefix
  `PATH=/Users/jimmckeown/.nvm/versions/node/v20.19.4/bin:$PATH`. The repo uses npm; add no
  dependencies.
- Release order: the hosted migration is applied **before** any EAS build from this branch is
  installed. A phone that has run this branch (local schema 19) shows "This phone has data from a
  newer version of Masi…" on any build without schema 19, so the shared A03 and iPhone stay off this
  branch until the other session no longer needs older builds on them, or Jim accepts a data wipe.
- Lesson flow and letter orders reach field phones in the same build, so no field phone holds a
  lesson draft pinned to a v1 pack. Such a draft would still open, but could show the old order's
  stored suggestions. Test phones finish or discard open lessons before installing this branch
  (Task 9, Step 6).

## Review Focus

1. **A lesson on a preview build** (the `preview-content` profile Jim tests with). A new lesson
   gets the 2026-10-23 preview pack, and a resumed lesson keeps its matching preview pack. Both pack
   lookups hide preview packs unless `allowPreview` is passed, so a missed option silently falls
   back to the release pack. Test in Task 5.
2. **A class created on the phone and renamed before its first upload.** The rename uploads, no
   payload carries the edition, and after the next pull the class shows the server's edition. Test
   in Task 3.
3. **A server class row with `letter_order_edition` missing or `null`** (a pull before the hosted
   apply). It never writes `null` and keeps the stored edition. Test in Task 3.
4. **The tracker sheet opened in Wrap up before the lesson's order has loaded.** It shows its
   loading state, never "No letter set for this class language." Test in Task 6.
5. **A child whose `children.class_id` disagrees with their active class membership.** The mastery
   panel follows the membership's class (its edition and language). Test in Task 6.

---

### Task 1: Vendored registry and the resolver

**Files:**
- Create: `src/constants/contracts/letter-orders-v1.json` (copy of books `9cd66f8:languages/letter-orders.json`)
- Create: `src/utils/letterOrders.js`
- Test: `__tests__/letterOrders.test.js`

**Interfaces:**
- Consumes: `PACK_LANGUAGE_BY_CODE` (`src/lessonPlan/engine/constants.js`).
- Produces, from `src/utils/letterOrders.js`:
  - `LETTER_ORDER_REGISTRY`: the vendored JSON, deep-frozen.
  - `MASI_LETTER_ORDER_EDITIONS`: frozen `['2026-10-23']`, the editions a Masi class can hold.
  - `NEW_CLASS_LETTER_ORDER_EDITION`: `'2026-10-23'`.
  - `UPDATE_APP_LETTERS_MESSAGE`: `"Update the app to teach this class's letters."`
  - `class LetterOrderError extends Error`, with `code` `'UNKNOWN_EDITION' | 'MISSING_ORDER'`.
  - `createLetterOrderResolver(registry) => { getLetterOrder, resolveTeachingOrder }`: the internal
    construction seam, like `createPackRegistry`. The module exports the bundled instance's two
    functions.
  - `getLetterOrder(orderId: unknown) => Readonly<OrderEntry> | null`: an entry of `registry.orders`
    by `id`.
  - `resolveTeachingOrder(edition: string, languageCode: unknown) => Readonly<{ id: string, letters: string[] }> | null`
  - `getTeachingOrder(classRow: { letter_order_edition: string } | null, languageCode: unknown) => TeachingOrder`,
    where `TeachingOrder` is `{ kind: 'order', id, letters } | { kind: 'none' } | { kind: 'update' }`.

- [ ] **Step 1: Set up the worktree.** In `.claude/worktrees/letter-orders`, run `npm ci` under
  Node 20. The handoff's "check first" was run on 2026-10-26 against `04de20a`, and all nine
  comparisons matched:
  - each legacy constant (`ISIXHOSA_`, `ENGLISH_` and `AFRIKAANS_PEDAGOGICAL_ORDER`) equals its
    `*-order-legacy`;
  - each v1 pack's steps equal its mapped order, and preview v1's sounds equal the 2026-10-18 order's;
  - every order covers `a`–`z` once.

  Task 8 records this in the build log.

- [ ] **Step 2: Write the failing tests** in `__tests__/letterOrders.test.js`:

```js
test('the vendored registry is the books file, byte for byte', () => {
  const bytes = fs.readFileSync(path.join(__dirname, '../src/constants/contracts/letter-orders-v1.json'));
  // books 9cd66f8 (last registry change 94e662f)
  expect(sha256(bytes)).toBe('33af38be2ceeb45051660ff790774e5aa55299fce8091c60ed055e166cfd2490');
});
test.each([
  ['xh', 'isixhosa-order-2026-10-23', ['o', 'm', 'l', 'a']],
  ['en', 'english-order-2026-10-23', ['s', 'a', 'n', 'd']],
  ['af', 'afrikaans-order-2026-10-23', ['a', 'e', 'k', 'n']],
])('2026-10-23 %s starts %s', (code, id, first) => {
  const order = resolveTeachingOrder('2026-10-23', code);
  expect(order.id).toBe(id);
  expect(order.letters.slice(0, 4)).toEqual(first);
  expect([...order.letters].sort()).toEqual([...'abcdefghijklmnopqrstuvwxyz']);
  expect(Object.isFrozen(order.letters)).toBe(true);
});
test.each([null, undefined, 'zu', 'fr', 'isixhosa'])('language %p has no order', code => {
  expect(resolveTeachingOrder('2026-10-23', code)).toBeNull();
});
test('an unknown edition throws UNKNOWN_EDITION', () => {
  expect(() => resolveTeachingOrder('2099-01-01', 'xh')).toThrow(expect.objectContaining({ code: 'UNKNOWN_EDITION' }));
});
test('a known edition without the language throws MISSING_ORDER', () => {
  const { resolveTeachingOrder: resolve } = createLetterOrderResolver({ orders: [], editions: [{ id: 'e', orders: {} }] });
  expect(() => resolve('e', 'xh')).toThrow(expect.objectContaining({ code: 'MISSING_ORDER' }));
});
test('every Masi edition resolves for xh, en and af', () => {
  for (const edition of MASI_LETTER_ORDER_EDITIONS) for (const code of ['xh', 'en', 'af']) {
    expect(resolveTeachingOrder(edition, code)).not.toBeNull();
  }
});
test('getTeachingOrder: order, none and update', () => {
  const row = { letter_order_edition: '2026-10-23' };
  expect(getTeachingOrder(row, 'en')).toEqual({ kind: 'order', id: 'english-order-2026-10-23', letters: expect.any(Array) });
  expect(getTeachingOrder(null, 'en')).toEqual({ kind: 'none' });
  expect(getTeachingOrder(row, 'zu')).toEqual({ kind: 'none' });
  expect(getTeachingOrder({ letter_order_edition: '2099-01-01' }, 'en')).toEqual({ kind: 'update' });
  expect(() => getTeachingOrder({}, 'en')).toThrow(TypeError); // a class object without its edition is a bug
});
test('a language edit keeps the edition and follows the language', () => {
  const row = { letter_order_edition: '2026-10-23' };
  expect(getTeachingOrder(row, 'xh').id).toBe('isixhosa-order-2026-10-23');
  expect(getTeachingOrder(row, 'af').id).toBe('afrikaans-order-2026-10-23');
});
```

- [ ] **Step 3: Run them to verify they fail.** Run: `npm test -- __tests__/letterOrders.test.js`.
  Expected: FAIL, cannot find module `src/utils/letterOrders`.

- [ ] **Step 4: Implement.** Copy the registry with
  `git -C <books> show 9cd66f8:languages/letter-orders.json > src/constants/contracts/letter-orders-v1.json`.
  Write `src/utils/letterOrders.js`. `resolveTeachingOrder` finds the edition by `id` in
  `registry.editions` (an array), maps the code through `PACK_LANGUAGE_BY_CODE`, finds the order in
  `registry.orders` and returns `letter_steps.flat()`. It caches one frozen result per edition and
  code. `getTeachingOrder` throws `TypeError` when `letter_order_edition` is not a string, returns
  `none` for a missing class or unsupported language, maps `UNKNOWN_EDITION` to `update`, and
  rethrows anything else.

- [ ] **Step 5: Run the tests.** Expected: PASS.

- [ ] **Step 6: Commit.** `feat(letter-order): vendor the registry and resolve a class's teaching order`

### Task 2: Server column, check and trigger

**Files:**
- Create: `supabase/migrations/20261026120000_class_letter_order_edition.sql`
- Create: `scripts/letter-order-postgres-harness.cjs` (model: `scripts/ea-access-postgres-harness.cjs`)
- Modify: `package.json` (add `"verify:letter-order:postgres": "node scripts/letter-order-postgres-harness.cjs"`),
  `.github/workflows/tests.yml` (a step after `verify:session-group:postgres`),
  `documentation/rls-sync-contract-map.md` (the `classes` row)
- Test: `__tests__/letterOrderMigration.test.js`

**Interfaces:**
- Consumes: `MASI_LETTER_ORDER_EDITIONS`, `NEW_CLASS_LETTER_ORDER_EDITION` (Task 1).
- Produces: `public.classes.letter_order_edition text not null`, with no default, constraint
  `classes_letter_order_edition_known`, function `private.classes_letter_order_edition()` and trigger
  `classes_letter_order_edition` (`before insert or update`).

The migration, in order:
1. `set lock_timeout = '10s'; set statement_timeout = '60s';`
2. `alter table public.classes add column if not exists letter_order_edition text not null default '2026-10-23';`
   then `alter table public.classes alter column letter_order_edition drop default;`. Adding the
   column with a default fills existing rows without an UPDATE. `classes_set_updated_at` and
   `classes_enforce_row_version` fire on UPDATE, so an UPDATE would re-stamp every class.
3. `drop constraint if exists` + `add constraint classes_letter_order_edition_known check (letter_order_edition in ('2026-10-23'))`.
4. `private.classes_letter_order_edition()`, `language plpgsql`, `set search_path = ''`, security invoker:
   - On INSERT: when `current_user in ('anon', 'authenticated')` or the value is null, set `'2026-10-23'`.
     Otherwise keep the explicit value (service role or admin seeding).
   - On UPDATE: when `current_user in ('anon', 'authenticated')`, set
     `new.letter_order_edition := old.letter_order_edition`.
   - `revoke execute ... from public, anon, authenticated`. Then `drop trigger if exists` +
     `create trigger classes_letter_order_edition before insert or update on public.classes for each row ...`.

The check allows only `2026-10-23`, although the registry also lists `legacy`. That's my call: a
`legacy` class would have no isiXhosa release pack, which breaks the handoff's acceptance that every
edition a class can reach resolves to a release pack.

- [ ] **Step 1: Write the failing static test** `__tests__/letterOrderMigration.test.js`. It reads
  the migration file and asserts:
  - the check's quoted list equals `MASI_LETTER_ORDER_EDITIONS`;
  - every literal edition in the file equals `NEW_CLASS_LETTER_ORDER_EDITION`;
  - the file contains `drop default` after `add column`;
  - it has no `update public.classes` statement;
  - it has no `new_class_edition`.

- [ ] **Step 2: Run it to verify it fails.** Run `npm test -- __tests__/letterOrderMigration.test.js`. Expected: FAIL (file missing).

- [ ] **Step 3: Write the harness, then the migration.** The harness replays every migration
  before `20261026120000` into the disposable database, inserts fixture classes with known
  `updated_at` and `row_version`, applies the new migration, then replays it once more. Labelled
  cases, each recorded `passed` in the summary:
  - `existing-classes-backfilled`: every fixture class is `2026-10-23`, with `updated_at` and
    `row_version` unchanged.
  - `column-has-no-default`: `information_schema.columns.column_default` is null and
    `is_nullable` is `NO`.
  - `app-insert-gets-edition`: an `authenticated` insert (RLS-valid fixture EA, as in
    `session-group-postgres-harness.cjs`) without the column stores `2026-10-23`.
  - `app-insert-value-ignored`: an `authenticated` insert sending `legacy` stores `2026-10-23`.
  - `app-upsert-retry-idempotent`: a repeated `insert ... on conflict (id) do update set name = excluded.name`
    of an existing class succeeds and keeps the edition.
  - `app-update-cannot-change`: an `authenticated` `update ... set letter_order_edition = 'legacy'`
    leaves `2026-10-23`.
  - `admin-insert-explicit`: a `service_role` insert with `2026-10-23` keeps it, and one without the
    column gets it.
  - `check-rejects-unknown`: a `service_role` insert of `legacy` and of `bogus` fails `23514`.
  - `function-not-executable`: `anon` and `authenticated` lack EXECUTE on the function.
  - `migration-idempotent-replay`: the second apply succeeds and changes no value.

- [ ] **Step 4: Run the static test and the harness.** Run `npm test -- __tests__/letterOrderMigration.test.js`
  and `npm run verify:letter-order:postgres` (needs local PostgreSQL 17 on port 65433, as the other
  harnesses do). Expected: PASS, and a JSON summary with all 10 labels `passed`.

- [ ] **Step 5: Update the contract map's `classes` row.** `letter_order_edition` is server-owned.
  The trigger sets `2026-10-23` for app roles, and app roles can't change it. It is never in the
  push payload, and pulls take the server's value (Task 3).

- [ ] **Step 6: Commit.** `feat(letter-order): the server sets each class's letter order edition`

### Task 3: Phone storage, pull and upload

**Files:**
- Modify: `src/db/migrations.js` (version 19, `classes_letter_order_edition`)
- Modify: `jest.integration.config.js` (add `classLetterOrderMigration.test.js` and `classLetterOrderSync.test.js` to `testMatch`, an explicit list)
- Modify: `src/db/repositories/classesRepository.js` (`CLASS_COLUMNS`, `saveClass`, `updateClass`, new `getActiveClassForChild`)
- Modify: `src/services/offlineSync.js` (`INTENTIONALLY_UNSYNCED.classes`)
- Modify: `src/session/handleDataClient.js` (the header in `fencedFetch`)
- Modify: `documentation/rls-sync-contract-map.md`
- Test: `__tests__/classesRepository.test.js`, `__tests__/handleDataClient.test.js`,
  `__tests__/syncContractCompleteness.test.js`, `__tests__/sqliteFoundation.test.js`, new
  `__tests__/classLetterOrderMigration.test.js` and `__tests__/classLetterOrderSync.test.js` (both real SQLite)

**Interfaces:**
- Consumes: `NEW_CLASS_LETTER_ORDER_EDITION`, `MASI_LETTER_ORDER_EDITIONS` (Task 1).
- Produces:
  - Every class row read from SQLite carries `letter_order_edition` (string, never null).
  - `classesRepository.getActiveClassForChild(childId: string) => Promise<ClassRow | null>`: the
    class of the child's active `child_class_memberships` row (`exited_at is null`). It prefers the
    active academic year, then the newest `enrolled_at`, then `id`, exactly like the
    `assigned_memberships` ranking in `childrenRepository.getAssessableChildren`. It requires the class
    row to exist and not be archived.
  - Every data request carries `X-Masi-Letter-Order-Editions: 2026-10-23`
    (`MASI_LETTER_ORDER_EDITIONS.join(',')`), the editions this build can teach. Nothing reads it yet.
    Until something does, the release gate is the guard: field users get only builds that
    understand editions.

Phone rules:
- **Migration 19:** `alter table classes add column letter_order_edition text not null default '2026-10-23';`.
  The default stays permanently, with no local check constraint.
- **Server rows** (`saveClass` with `sync_status` `synced` or `terminal`, from the roster pull,
  `preloadedChildData` or `ClassesContext`):
  - A string edition is written, so the server wins.
  - When `serverPullWouldClobberPendingLocal` is true, run
    `update classes set letter_order_edition = ? where id = ?` with the server value, then return
    `false` as today.
  - A `null` or missing edition is removed from the record, so it never writes `null` and never
    overwrites.
- **Local writes:**
  - `saveClass` on the local path strips `letter_order_edition` from the record. A new class takes
    the column default; a re-save keeps the stored value.
  - `updateClass` strips it from the merged record, so `updates` can never change it.
- **Upload:** `INTENTIONALLY_UNSYNCED.classes.letter_order_edition` = `'Server-owned: the classes trigger sets it (migration 20261026120000); pulls take the server value.'`

- [ ] **Step 1: Write the failing tests.**
  - Migration test (real SQLite): a v18 database holding a class migrates to 19, and the class
    reads `letter_order_edition: '2026-10-23'`; a new insert without the column gets it.
  - `sqliteFoundation.test.js`: `CURRENT_SCHEMA_VERSION` is 19 (line 143), and the exact migration
    list (lines 586-605) ends with `{ version: 19, name: 'classes_letter_order_edition' }`.
  - `classesRepository`. Server rows in these tests carry `2099-01-01`, a value the column default
    cannot produce, so a missed write fails the test:
    - a synced server row with `2099-01-01` is stored;
    - a server row for a class with a pending local rename updates only the edition to `2099-01-01`,
      leaving the local name and `sync_status: 'pending'`;
    - a server row with `letter_order_edition: null`, and one without the key, leaves the stored value;
    - a local `saveClass` passing `letter_order_edition: 'bogus'` stores `2026-10-23`;
    - `updateClass(id, { name: 'X', letter_order_edition: 'bogus' })` keeps `2026-10-23`;
    - `updateClass(id, { home_language: 'English' })` keeps the edition;
    - `getActiveClassForChild` returns the active membership's class even when `children.class_id`
      names another class, ignores exited memberships, prefers the active year, and returns `null`
      with no active membership.
  - Upload: `_testBuildSyncPayload` for a classes `insert` and `update` whose record holds
    `letter_order_edition` produces payloads without the key.
  - `classLetterOrderSync.test.js` (Review Focus 2, real SQLite, the `offlineSyncOutbox.test.js`
    pattern: `createOutboxSyncEngine` with `createSupabaseMock`):
    - create a class with `classesRepository.saveClass` (local), then rename it with `updateClass`
      before any upload;
    - run `engine.syncAll({ tableName: 'classes' })`. Every transmitted `classes` payload lacks
      `letter_order_edition`, the last one carries the new name, the class's outbox rows are gone,
      and the class is `synced`;
    - save the pulled server row (the new name, edition `2099-01-01`) with `saveClass`. The class
      reads the new name and `2099-01-01`.
  - `handleDataClient`: a `dataClient.from('classes').upsert(...)` through `fencedFetch` sends
    `X-Masi-Letter-Order-Editions: 2026-10-23` alongside `Authorization`. This is the handoff's
    "a class insert through the outbox carries it": the outbox uploads with this same
    `dataClient`. Existing outbox tests mock the client and so would skip `fencedFetch`.

- [ ] **Step 2: Register the new tests and run them to verify they fail.** Add
  `'<rootDir>/__tests__/classLetterOrderMigration.test.js'` and
  `'<rootDir>/__tests__/classLetterOrderSync.test.js'` to `testMatch` in
  `jest.integration.config.js`; a file missing from that list never runs in the integration gate.
  Confirm with `npm run test:integration -- --listTests | grep classLetterOrder` (two lines).
  Then run `npm test -- __tests__/classesRepository.test.js __tests__/handleDataClient.test.js __tests__/sqliteFoundation.test.js`
  and `npm run test:integration -- __tests__/classLetterOrderMigration.test.js __tests__/classLetterOrderSync.test.js`.
  Expected: FAIL on the missing column, the missing method and the missing header, never "No tests found".

- [ ] **Step 3: Implement the rules above.**

- [ ] **Step 4: Run the tests, then the full suites.** Run the focused tests above, then
  `npm test` and `npm run test:integration`. Expected: PASS, including `syncContractCompleteness`
  and `syncContractServerSchema`.

- [ ] **Step 5: Update the contract map.** The `classes` row (pull, push, local rules) and the
  "Signed-in EA handle" section (the header).

- [ ] **Step 6: Commit.** `feat(letter-order): phones store the server's edition and never send it`

### Task 4: Packs carry their order, and new packs for 2026-10-23

**Files:**
- Create: `src/lessonPlan/packs/packLetterOrder.js`
- Create: `src/lessonPlan/packs/isixhosa-interim-letters-v2.json`, `english-interim-letters-v2.json`, `afrikaans-interim-letters-v2.json`
- Create (copies): `src/lessonPlan/packs/isixhosa-candidates-preview-v2.json`, `english-candidates-preview-v1.json`, `afrikaans-candidates-preview-v1.json`
- Modify: `src/lessonPlan/packs/lintMasiPack.js`, `src/lessonPlan/packs/index.js`, `src/lessonPlan/packs/contentDiagnostics.js`
- Modify: `documentation/content-packs.md`
- Test: `__tests__/lintMasiPack.test.js`, `__tests__/lessonPlanPacks.test.js`, `__tests__/contentDiagnostics.test.js`

**Interfaces:**
- Consumes: `getLetterOrder`, `resolveTeachingOrder`, `NEW_CLASS_LETTER_ORDER_EDITION`, `MASI_LETTER_ORDER_EDITIONS` (Task 1).
- Produces:
  - `LEGACY_PACK_LETTER_ORDERS`, frozen:
    - `isixhosa-interim-letters-v1` and `isixhosa-candidates-preview-v1` → `isixhosa-order-2026-10-18`;
    - `english-interim-letters-v1` → `english-order-legacy`;
    - `afrikaans-interim-letters-v1` → `afrikaans-order-legacy`.
  - `packLetterOrderId(pack) => string | null`: the pack's own `letter_order` when present, else
    the table's entry for its id, else `null`.
  - From `src/lessonPlan/packs/index.js`:
    - `getPackForOrder(orderId: unknown, options?) => pack | null`;
    - `getPackById` (unchanged);
    - `packLetterOrderId`;
    - `CURRENT_PACK_IDS` shaped `{ release: { [orderId]: packId }, preview: { [orderId]: packId } }`.
    - `getPack(languageCode, options)` survives this task with unchanged behaviour. It reads a
      private `LEGACY_LANGUAGE_PACK_IDS`, which is today's language-keyed `CURRENT_PACK_IDS` value
      (the v1 release packs and `isixhosa-candidates-preview-v1`). So no lesson changes in this
      task, and the full suite stays green. Task 5 switches lessons to `getPackForOrder` and
      deletes both.

`CURRENT_PACK_IDS`:
- release: `isixhosa-order-2026-10-23` → `isixhosa-interim-letters-v2`,
  `english-order-2026-10-23` → `english-interim-letters-v2`,
  `afrikaans-order-2026-10-23` → `afrikaans-interim-letters-v2`.
- preview: the same three order ids → `isixhosa-candidates-preview-v2`,
  `english-candidates-preview-v1`, `afrikaans-candidates-preview-v1`.

**New lint errors**, appended after the existing checks:
- `pack_letter_order`: `packLetterOrderId` is null or `getLetterOrder` returns null.
- `pack_letter_order_language`: the order's `language` differs from the pack's.
- `pack_letter_order_letters`: `letter_steps` sorted by `step`, mapped to `new_letters`, differ
  from `order.letter_steps`.
- `pack_letter_order_sounds`: `sound_steps` is non-empty, and sorted by `step` and flattened
  through `new_sounds`, it differs from `order.sound_steps`. Empty `sound_steps` passes, as a
  letters-only pack.

**The three v2 release packs** use the v1 files' format, with `"letter_order"` after `"channel"`:
- the `a`–`z` `sound_inventory`;
- 12 `letter_steps` equal to the 2026-10-23 order's steps;
- empty `blends`, `words` and `readers`, with no `size_exception`;
- empty `sound_steps`, `readers`, `word_bank` and `reader_details`.

- [ ] **Step 1: Write the failing tests.**
  - `lintMasiPack.test.js`: give `validPack()` `letter_order: 'isixhosa-order-2026-10-18'` (the
    shared vector sequence is that order) and keep `a valid pack passes`. Add one case per new
    error code:
    - letter order removed;
    - unknown id;
    - `english-order-legacy` on the isiXhosa pack;
    - step 2 letters swapped;
    - one sound replaced.

    Also: emptying `sound_steps` and `word_bank` still lints the order ok, and a pack with id
    `english-interim-letters-v1` and no field resolves through the table.
  - `lessonPlanPacks.test.js`:
    - `CURRENT_PACK_IDS` equals the two maps above;
    - each v2 release pack's order string equals `resolveTeachingOrder('2026-10-23', code).letters.join(' ')`;
    - `RELEASE_PACK_SHA256` gains the three v2 hashes;
    - a `PREVIEW_PACK_SHA256` provenance pin holds the three `6cd5e64` hashes from Global Constraints;
    - every `MASI_LETTER_ORDER_EDITIONS` × `xh`/`en`/`af` gets a release pack from `getPackForOrder`,
      whose `packLetterOrderId` equals the order id;
    - the four v1 ids still resolve with `getPackById`;
    - `getPackForOrder('english-order-legacy')` is `null`;
    - `getPackForOrder(<order>)` returns the preview pack only with `{ allowPreview: true }`.

    Delete the tests pinning the old language-keyed `CURRENT_PACK_IDS` and "every registry tracker
    order except isiXhosa's". Tests of `getPack` results stay until Task 5 deletes `getPack`.

- [ ] **Step 2: Run them to verify they fail.** Run `npm test -- __tests__/lintMasiPack.test.js __tests__/lessonPlanPacks.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Write the v2 files and compute their hashes with `shasum -a 256`.
  - Copy the previews with `git -C <books> show 6cd5e64:exports/app-preview/<file> > src/lessonPlan/packs/<file>`
    and check each hash against Global Constraints.
  - Add the static imports.
  - `createPackRegistry` throws at construction if any current id's `packLetterOrderId` differs
    from its key.
  - `contentDiagnostics.currentPacks` keys by `xh`/`en`/`af`, through
    `getPackForOrder(resolveTeachingOrder(NEW_CLASS_LETTER_ORDER_EDITION, code).id, { allowPreview })`.

- [ ] **Step 4: Run the tests.** Run the focused tests plus `npm test -- __tests__/contentDiagnostics.test.js __tests__/buildIsixhosaTestPack.test.js`,
  then the full `npm test`. Expected: PASS. The generator test still passes because its output id
  `isixhosa-candidates-preview-v1` is in the table.

- [ ] **Step 5: Update `documentation/content-packs.md`.**
  - Packs name their `letter_order`, and lint checks it.
  - Current packs are keyed by order id.
  - The v2 release table.
  - Preview packs now come from books `exports/app-preview/` and are copied unchanged. The
    isiXhosa generator only reproduces the 2026-10-18 preview v1 and refuses other orders.
  - Note that the books v2 previews have no readers, so developer builds lose "Molo, Lolo!" until books adds readers.

- [ ] **Step 6: Commit.** `feat(letter-order): packs name their order and new packs teach 2026-10-23`

### Task 5: The lesson flow reads the class's order

**Files:**
- Modify: `src/lessonPlan/inputs/lessonInputs.js`, `src/hooks/useLessonDraft.js`, `src/lessonPlan/packs/index.js` (delete the `getPack` shim)
- Modify: `src/components/lessons/LessonLettersSection.js`, `src/screens/lessons/LessonScreen.js`, `src/components/lessons/UpNextCard.js`, `src/components/lessons/GroupLessonRow.js`, `src/utils/lessonDates.js`
- Modify: `src/lessonPlan/engine/index.js` (the `alphabet` doc comment only; the engine and its vectors do not change)
- Test: `__tests__/lessonInputs.test.js`, `__tests__/useLessonDraft.test.js`, `__tests__/LessonScreen.test.js`, `__tests__/lessonPlanPacks.test.js`,
  `__tests__/lessonPlanEngine.realPacks.test.js`, `__tests__/lessonPlanPackIndex.test.js`

**Interfaces:**
- Consumes: `getTeachingOrder`, `UPDATE_APP_LETTERS_MESSAGE` (Task 1); `getPackForOrder`, `getPackById`, `packLetterOrderId` (Task 4); class rows with `letter_order_edition` (Task 3).

This task switches lessons from the v1 packs to the 2026-10-23 packs, so it also owns the existing
tests that switch breaks (Step 1, last group).
- Produces:
  - `lessonOrderAndPack({ lessonClass, languageCode, packId, allowPreview }) => { teachingOrder: TeachingOrder, pack: object | null }`
    in `lessonInputs.js`:
    - the candidate pack is `getPackById(packId, { allowPreview })` when `packId` is given, else
      `getPackForOrder(teachingOrder.id, { allowPreview })`. Both lookups hide preview packs
      unless `allowPreview` is passed, so leaving it out silently drops preview content (Review
      Focus 1);
    - `pack` is that candidate only when `teachingOrder.kind === 'order'` and
      `packLetterOrderId(candidate) === teachingOrder.id`, else `null`.

    Packs are chosen by order, never by language. A draft pinned to a pack of another order gets
    `pack: null`, so a 2026-10-23 class is never taught from a v1 pack. Its stored plan may still
    show that order's suggestions. Only test phones can hold such a draft, so the release step in
    Task 9 handles it rather than code (Jim, 2026-10-26).

    It replaces `packFor` (`lessonInputs.js:10-11`), and `allowPreview` keeps today's sources:
    `shapePickerModel`'s `allowPreview` parameter, and `isPreviewContentEnabled()` in
    `loadPickerLetters`, `loadLessonParticipants` and `useLessonDraft`.
  - `loadLessonParticipants({ ..., classId, languageCode, packId, participantChildIds })` loads
    the class with `repositories.classes.getClassById(classId)`, and returns
    `{ participants, lessonClass, teachingOrder, pack, packIndex, alphabet }`.
    `alphabet` is `teachingOrder.letters` when `kind === 'order'`, else `null`.
  - Picker rows (`shapePickerModel`, `loadPickerLetters`):
    - each group's engine input takes `pack` from `lessonOrderAndPack` with its own class and
      language, not one pack per language;
    - each row gains `lettersNeedUpdate: boolean`, true when the group's `teachingOrder.kind === 'update'`.
  - `useLessonDraft`:
    - at open and on `chooseClass`/`chooseLanguage`, the draft's `packId` is
      `lessonOrderAndPack(...).pack?.id ?? null`;
    - it drops its separate `getClassById` and uses `loaded.lessonClass`;
    - the returned object gains `teachingOrder: TeachingOrder | null` (null while loading).
  - `lessonRowDetail(seen, letters, { needsAppUpdate } = {})`: with `needsAppUpdate`, the detail
    is `joinDetail([seen, UPDATE_APP_LETTERS_MESSAGE])`.
  - `LessonLettersSection` gains a `needsAppUpdate` prop. When true, the section shows only
    `UPDATE_APP_LETTERS_MESSAGE` under its heading, before the isiZulu check.

- [ ] **Step 1: Write the failing tests.**
  - `lessonInputs.test.js`:
    - one 2026-10-23 class per language gives a first-lesson picker row of `o m l a` / `s a n d` / `a e k n`;
    - two groups in one class get the same order id (regrouping keeps the order);
    - a group whose `class_id` differs from its members' class uses the group's class;
    - a class with no `home_language` where the EA picked `en` resolves `english-order-2026-10-23`;
    - a `zu` class and a class with no language return `teachingOrder.kind === 'none'`, `pack: null`, `alphabet: null`;
    - a class row with edition `2099-01-01` returns `kind: 'update'` and sets the row's `lettersNeedUpdate`;
    - `alphabet` equals the class's order for a no-pack lesson.
    - `lessonOrderAndPack` on a 2026-10-23 isiXhosa class, as a `test.each` (Review Focus 1):

      | `packId` | `allowPreview` | `pack` |
      |---|---|---|
      | none (new lesson) | true | `isixhosa-candidates-preview-v2` |
      | none (new lesson) | false | `isixhosa-interim-letters-v2` |
      | `isixhosa-candidates-preview-v2` | true | that pack |
      | `isixhosa-candidates-preview-v2` | false | `null` |
      | `isixhosa-candidates-preview-v1` | true | `null` |
      | `isixhosa-interim-letters-v1` | false | `null` |

      An English 2026-10-23 class with `packId: 'english-interim-letters-v1'` also gives `pack: null`.

    Replace the test that pinned `PEDAGOGICAL_ORDERS.af` with one for `afrikaans-order-2026-10-23`.
  - `useLessonDraft.test.js`:
    - a new draft's `pack_id` is `isixhosa-interim-letters-v2` (release), or
      `isixhosa-candidates-preview-v2` when preview is enabled;
    - the hook exposes `teachingOrder`;
    - the existing test "a frozen version-1 draft keeps its stored review letters when resumed and
      saved" passes unchanged.
  - `LessonScreen.test.js`:
    - a lesson for an unknown-edition class shows `Update the app to teach this class's letters.`
      and no letter tiles;
    - a new preview lesson (bundled preview v2, which has no readers) shows
      `No books for isiXhosa yet.`
  - `lessonPlanPacks.test.js`: `getPack` is no longer exported.
  - Existing tests the switch breaks. Update each so it keeps what it checks:
    - `lessonInputs.test.js:276-283` ("lesson input uses a pinned pack…"): a new preview lesson now
      gets `isixhosa-candidates-preview-v2`, and the pinned-v1 lines move into the table above.
    - `lessonPlanEngine.realPacks.test.js` and `lessonPlanPackIndex.test.js` call `getPack`. Their
      engine fixture becomes `getPackById('isixhosa-candidates-preview-v1', { allowPreview: true })`.
      The engine ignores orders and v1 stays bundled, so these suites keep their reader and blend
      coverage. The release loop (`realPacks` lines 66-77) uses
      `getPackForOrder(resolveTeachingOrder(NEW_CLASS_LETTER_ORDER_EDITION, code).id, options)`.
    - `LessonScreen.test.js` `previewLesson()` (line 343) and the tests that use it (the blend
      tests at lines 356-477 and the two ECD tests at 493-507) run on preview v2. The children's mastered letters become the first five steps of
      `isixhosa-order-2026-10-23`, `o m l a k u e n i z s t`, in place of v1's `… i t s d`.
      Expected blend items and tier labels are re-derived from v2's content. Each test keeps its
      purpose: six suggested blends with hyphens, `+ more`, tier switching and the names of
      children ahead, a ticked blend staying visible, and Save recording the tier.
    - `LessonScreen.test.js` "the Read tick stores the book as printed" (lines 478-492) needs a
      reader, and v2 has none. It runs on a test-local pack: preview v2 plus reader `xh-int-v1-r01`
      (`Molo, Lolo!`) and its `reader_details`, copied from preview v1. That reader is on step 1
      and uses only `m o l a`, which is v2's step 1 too. Serve the pack for that test only, for
      example with `jest.spyOn` on the packs module's `getPackForOrder`. Its assertions stay.

- [ ] **Step 2: Run them to verify they fail.** Run `npm test -- __tests__/lessonInputs.test.js __tests__/useLessonDraft.test.js __tests__/LessonScreen.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement as specified,** then delete the shim and every `getPack(` call.

- [ ] **Step 4: Run the tests, then the full suite.** Run the focused tests, then `npm test`. Expected: PASS. The engine vector suites are unchanged.

- [ ] **Step 5: Commit.** `feat(letter-order): lessons teach and suggest from the class's order`

### Task 6: Trackers show the class's order, and counts use the 26-letter set

**Files:**
- Modify: `src/utils/assessmentRegistry.js`, `src/constants/egraConstants.js`, `src/utils/masteryState.js`, `src/db/repositories/masteryRepository.js`, `src/utils/dashboardStats.js`, `src/lessonPlan/inputs/knownLetters.js`
- Modify: `src/components/session/LetterTrackerBottomSheet.js`, `src/components/assessment/LetterMasteryPanel.js`, `src/screens/lessons/LessonWrapUpScreen.js`, `src/components/lessons/WrapUpChildRow.js`, and the panel's two screens if they stop passing `classItem`
- Test: `__tests__/LetterTrackerBottomSheet.test.js`, `__tests__/LetterMasteryPanel.test.js`, `__tests__/LessonWrapUpScreen.test.js`, `__tests__/masteryState.test.js`, `__tests__/masteryRepository.test.js`, `__tests__/assessmentRegistry.test.js`, `__tests__/letterMastery.storedItems.test.js`, `__tests__/dashboardStats.letterMastery.test.js`

**Interfaces:**
- Consumes: `getTeachingOrder`, `UPDATE_APP_LETTERS_MESSAGE` (Task 1); `getActiveClassForChild` (Task 3); `useLessonDraft().teachingOrder` (Task 5).
- Produces:
  - `TRACKER_LETTERS` in `assessmentRegistry.js`: frozen `{ en, xh, af }`, each the frozen
    alphabetical `a`–`z`. It is the per-language set used for mastery validation, evidence and
    counts.
  - `PEDAGOGICAL_ORDERS` and the three `*_PEDAGOGICAL_ORDER` arrays are deleted, along with the
    dead `PEDAGOGICAL_ORDERS` map in `egraConstants.js`.
  - `loadMasteryState(...)` returns `trackerLetters` in place of `pedagogicalOrder`.
    `countMastered({ ..., trackerLetters })` replaces the `pedagogicalOrder` parameter.
  - `LetterTrackerBottomSheet` gains a `teachingOrder: TeachingOrder | null` prop:
    - `null` shows its loading state (Review Focus 4);
    - `none` shows `No letter set for this class language.`;
    - `update` shows `UPDATE_APP_LETTERS_MESSAGE`;
    - `order` draws the grid in `teachingOrder.letters`.

    The `x/26` count uses `TRACKER_LETTERS`.
  - `LetterMasteryPanel`:
    - its loader also calls `getActiveClassForChild(child.id)`, and takes the language, the label
      and `getTeachingOrder(row, code)` from that class;
    - with no active membership it shows `No letter set for this class language.`;
    - with `update` it shows `UPDATE_APP_LETTERS_MESSAGE`;
    - the grid uses the order's letters.
  - Wrap up passes `teachingOrder={lesson.teachingOrder}` to the sheet. `WrapUpChildRow`'s
    `languageOrder` prop becomes `trackerLetters` (`TRACKER_LETTERS[languageCode]`).

- [ ] **Step 1: Write the failing tests.**
  - Sheet: grids for xh/en/af start `o m l a` / `s a n d` / `a e k n`. `null` shows loading.
    `none` and `update` show their copy without crashing. Replace the test that compared the grid to
    `PEDAGOGICAL_ORDERS.af`.
  - Panel:
    - a child whose `children.class_id` is an English class, but whose active membership is an
      isiXhosa class, shows the isiXhosa label and a grid starting `o m l a` (Review Focus 5);
    - a `zu` class and no active membership show `No letter set for this class language.`;
    - an unknown edition shows the update copy.
  - Wrap up: the tracker sheet opened for a child in an English lesson draws `s a n d …`.
  - Counts: `countMastered` and `getLetterMasteryRanking` totals are unchanged for existing
    fixtures. `setLetterMastery` still rejects `zu` and a letter outside `a`–`z`.
  - Rewrite the registry tests that pinned `PEDAGOGICAL_ORDERS` to pin `TRACKER_LETTERS`.

- [ ] **Step 2: Run them to verify they fail.** Run `npm test -- __tests__/LetterTrackerBottomSheet.test.js __tests__/LetterMasteryPanel.test.js __tests__/LessonWrapUpScreen.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** Then grep: no `PEDAGOGICAL_ORDER` remains anywhere in `src/`.

- [ ] **Step 4: Run the full unit and integration suites.** Expected: PASS.

- [ ] **Step 5: Commit.** `feat(letter-order): trackers draw the class's order; counts use the 26-letter set`

### Task 7: Session complete receipt

**Files:**
- Modify: `src/utils/sessionCompleteView.js`, `src/screens/lessons/LessonWrapUpScreen.js`, `src/constants/literacyConstants.js` (delete `LETTER_ORDER`)
- Test: `__tests__/sessionCompleteView.test.js`, `__tests__/SessionReceipt.test.js`, `__tests__/LetterToggleGrid.test.js`

**Interfaces:**
- Consumes: `useLessonDraft().teachingOrder` (Task 5).
- Produces:
  - `buildSessionCompleteParams({ ..., teachingOrder })`, where `teachingOrder` is `string[] | null`,
    sorts `letters` by position in `teachingOrder`. Letters not in it go last, in selection order.
  - `buildReceiptRows` shows `letters` in the order given and no longer sorts.
  - Wrap up passes `teachingOrder: lesson.teachingOrder?.kind === 'order' ? lesson.teachingOrder.letters : null`.

- [ ] **Step 1: Write the failing tests.**
  - Selected `['d', 's', 'n', 'a']` with the English 2026-10-23 order gives receipt letters
    `s a n d`; the isiXhosa order turns `['a', 'o']` into `o a`.
  - `null` keeps selection order.
  - `LetterToggleGrid.test.js` uses a local 26-letter fixture.

- [ ] **Step 2: Run them to verify they fail.** Run `npm test -- __tests__/sessionCompleteView.test.js __tests__/SessionReceipt.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement, delete `LETTER_ORDER`, and run the tests.** Expected: PASS.

- [ ] **Step 4: Commit.** `feat(letter-order): the receipt lists letters in the class's order`

### Task 8: Agreement, leftovers and documents

**Files:**
- Create: `__tests__/letterOrderAgreement.test.js` (integration, real SQLite), `__tests__/letterOrderLeftovers.test.js`
- Create: `docs/adr/0011-letter-order-edition-per-class-set-by-server.md`
- Modify: `jest.integration.config.js` (add `letterOrderAgreement.test.js` to `testMatch`)
- Modify: `CONTEXT.md`, `docs/superpowers/specs/2026-10-20-lesson-plan-design.md` (§4.2), `documentation/ROADMAP.md`, `documentation/build-log.md`

- [ ] **Step 1: Write the agreement test.** For one 2026-10-23 class per language, each with two
  children in a group, whose history is complete and empty (so the engine's first-lesson rule,
  `letters.js:86-94`, applies), let `order = resolveTeachingOrder('2026-10-23', code)` and
  `stepOne = getLetterOrder(order.id).letter_steps[0]`. Each surface is compared with the part of
  the order it shows:
  - the picker row's first-lesson suggestion equals `stepOne` (`o m l a`, `s a n d`, `a e k n`);
  - the lesson input's pack order (`teachingOrderFromPack(pack)`) and `alphabet` equal `order.letters`;
  - `useLessonDraft().teachingOrder.letters` (the order Wrap up gives the tracker sheet) equals `order.letters`;
  - the order the mastery panel's loader resolves through `getActiveClassForChild` equals `order.letters`;
  - the receipt for the selected letters `[...order.letters].reverse().slice(0, 5)` lists them in
    the order they appear in `order.letters`.

  Add `'<rootDir>/__tests__/letterOrderAgreement.test.js'` to `testMatch` in
  `jest.integration.config.js`, and confirm with
  `npm run test:integration -- --listTests | grep letterOrderAgreement` (one line).

- [ ] **Step 2: Write the leftovers test.** It scans `src/` and fails on:
  - `PEDAGOGICAL_ORDER`;
  - `LETTER_ORDER`;
  - `getPack(`;
  - any `CURRENT_PACK_IDS` key that isn't an order id in the registry.

- [ ] **Step 3: Run both.** Run `npm test -- __tests__/letterOrderLeftovers.test.js` and
  `npm run test:integration -- __tests__/letterOrderAgreement.test.js`. Expected: PASS (they pass at
  once, because Tasks 1–7 built the behaviour; they guard against regressions).

- [ ] **Step 4: Documents.**
  - **`CONTEXT.md`:** add **Letter order** (a language's teaching sequence in steps, from the
    registry) and **Letter order edition** (a set of orders, one per language; each class records
    one, set by the server, never changed). Update **Content pack** (chosen by the class's order,
    names its `letter_order`) and **Letter mastery** ("the language's 26 tracker letters" for
    "the pedagogical order").
  - **Spec §4.2:** a dated note that the teaching order is now per class edition and language
    (ADR-0011, this plan).
  - **ADR-0011:** the decision and its trade-offs, linking the books design note.
  - **ROADMAP:** two follow-ups:
    - Masi's edition schedule arrives with its second edition, in the migration that widens the
      check constraint;
    - the books v2 previews need readers.
  - **Build log:** the "check first" result, each task's gates, and the preview-hash correction.

- [ ] **Step 5: Commit.** `docs(letter-order): agreement guard, glossary, ADR and log`

### Task 9: Release gates and rollout

- [ ] **Step 1: Full gates under Node 20.** Run:
  - `npm test`;
  - `npm run test:integration`;
  - `npm run test:types`;
  - `node --test content/egra/verify.cjs`;
  - `npm run verify:letter-order:postgres` plus the existing PostgreSQL harnesses.

  Expected: all pass. Record the counts in the build log.
- [ ] **Step 2: Codex adversarial review** of `feat/lesson-flow...feat/letter-orders`
  (`--model gpt-6-astra`). Fix confirmed findings test-first, and re-review until a round finds
  nothing new above low.
- [ ] **Step 3: Prepare this worktree for the helper, then the read-only preflight.** In
  `.claude/worktrees/letter-orders`:
  - `ln -s /Users/jimmckeown/Development/masi-app/.env.local .env.local`. The symlink is temporary
    and gitignored. The helper reads only the staging values from it and never passes the file
    to the CLI.
  - `npm run sqlite:staging:check`. Expected: `project_ref=segygjzpujphwvrubusm`.
  - `npm run sqlite:staging:link`. This writes `supabase/.temp/`, which is gitignored.
  - `npm run sqlite:staging:migrations`. Every remote migration appears locally, and
    `20261026120000` is the only local one not yet applied.
  - `npm run sqlite:staging:query -- "select coalesce(home_language,'(none)') as language, count(*) filter (where archived_at is null) as active, count(*) as total from public.classes group by 1 order by 2 desc;"`,
    plus `select max(updated_at), sum(row_version) from public.classes;` for Step 4's comparison.

  Report the results to Jim.
- [ ] **Step 4: Hosted apply, only after Jim's yes.** Run `npm run sqlite:staging:dry-run`. It must
  list exactly `20261026120000_class_letter_order_edition.sql`; if anything else is pending, stop
  and report to Jim. Then run `npm run sqlite:staging:push` and verify read-only:
  - every class is `2026-10-23`;
  - `max(updated_at)` and `sum(row_version)` over `classes` are unchanged from before the apply;
  - the column has no default, and the constraint and trigger exist.

  Then remove the symlink with `rm .env.local`, which removes the link, not its target.
- [ ] **Step 5: EAS builds after the apply.** Android and iOS, both `preview-content` and `preview`.
- [ ] **Step 6: Device run,** on the A03 when the other session frees it, and on Jim's iPhone.
  - Before installing, finish or discard every open lesson on the phone (Home shows them), so no
    draft pinned to a v1 pack carries over.
  - Use one class per language, creating English and Afrikaans test classes on a test account if
    none exist. Screenshot each:
    - the picker's suggested letters (`o m l a` / `s a n d` / `a e k n`);
    - the Lesson screen;
    - the Wrap up tracker sheet;
    - the mastery panel (Children → class → child → Letter tracker);
    - the Session complete receipt.
  - Check 1.0× and 1.3× text.
  - Restore phone settings, and tell Jim when the phone is free.
- [ ] **Step 7: PR** stacked on #97. The body states what field builds teach. Merging waits for
  PR #97 to merge and for Jim.
