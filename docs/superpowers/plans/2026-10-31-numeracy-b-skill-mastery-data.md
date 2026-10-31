# Numeracy Track B: `skill_mastery` Data and Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store an EA's numeracy ticks as one current record per child and step key, on the phone and the server, synced through a receipt-backed correction RPC and pulled back through a history page. This copies `letter_mastery` with `(letter, language)` replaced by `step_key`.

**Architecture:** This is a parallel copy of the hardened letter mastery contract. It adds SQLite v21 `skill_mastery`; server `public.skill_mastery` with append-only `skill_mastery_corrections`; `set_skill_mastery` as the only write path; `get_skill_mastery_page` behind a new `history_pull_rollout` switch, `skill_mastery`; and a phone repository reached only through the signed-in EA handle. The literacy files keep their current behaviour. The shared engine (`offlineSync.js`, history store, handover, diagnostics) learns one more correction table at each place where it names `letter_mastery` today.

**Tech Stack:** Expo SQLite (`better-sqlite3` in tests), Supabase PostgreSQL 17 (plpgsql, RLS), Jest, Node `node:test` content checks, the disposable-PostgreSQL harness scripts.

**Spec:** `docs/superpowers/specs/2026-10-31-numeracy-tracker-and-lessons-design.md` (§5.3, §8.1, §10, §11, §13 "Data"). It lives on commit `691855b` in `/Users/jimmckeown/Development/masi-app-numeracy`. Read it from there if that docs commit has not reached `origin/main`.

**Track D consumes this plan.** The screens track (Number tracker, Wrap up and numeracy save) is planned after `feat/egma-maths-assessment` merges. It uses only the **Produces** blocks of Tasks 2–5, so do not rename anything in them.

## Global Constraints

- Branch `feat/numeracy-skill-mastery` off `origin/main` (at or after `f373f0b`, #131). The worktree at `/Users/jimmckeown/Development/masi-app-numeracy` is based on `4bc23d1`, so it lacks #131's reporting migration and harness. Do not build on it.
- Run every Jest command on Node 20, prefixing `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- TDD in vertical slices. Any SQLite behaviour is proven on real SQLite (`createMigratedDatabase(runMigrations)` / `createBetterSqliteTestDatabase`), never on mocks.
- Codex builds each task (`--model gpt-6.1-sol --effort high`) and Claude reviews the diff and tests. Codex's sandbox cannot commit, so each commit step is done by the orchestrator, as written.
- **Do not edit** `src/db/repositories/masteryRepository.js`, `src/services/letterMasteryCorrection.js`, `supabase/migrations/20261021160000_letter_mastery_current_state.sql` or `20261022120000_assessment_history_pull.sql`. Duplication is the decision (ADR 0013). Unifying the two tables is a roadmap item.
- Step key shape, identical everywhere: `^[a-z_]+\.[0-9a-z]+$`. **The server checks only this shape, never the curriculum.** An old phone must still be able to send a key that a newer edition retired.
- Only `setSkillMastery` checks keys against the curriculum: `listStepKeys(getCurriculum())` from `content/numeracy-curriculum` (Track A). History pages and acknowledgements accept any well-formed key.
- Deterministic id: UUID v5 of `['skill_mastery', lower(child_id), step_key].join('\u001f')` in the **new** namespace `20002406-1d97-4087-b350-a8d41515dd39`. The phone (`SKILL_MASTERY_ID_NAMESPACE`) and `private.skill_mastery_id` use the same literal.
- Server migration file: `supabase/migrations/20261101120000_skill_mastery_current_state.sql`. Use `SET` / `RESET` for timeouts, never `SET LOCAL` (the CLI runs outside a transaction). Keep `create table public.skill_mastery (...)` at top level so `syncContractServerSchema.test.js` can parse its columns. The file must be safe to re-apply.
- Every new SQL function runs `revoke execute ... from public, anon` (private helpers also revoke from `authenticated, authenticator, service_role`). `npm run verify:reporting:postgres` fails if `masi_reporting_reader` can execute anything new.
- SQLite migration version **21** (`skill_mastery`). The EGMA branch adds no SQLite migration.
- No module-level repository singleton. `productionBindingStatic.test.js` enforces this.
- No EA-facing copy is added in this track.
- **DDL rule.** Nothing is applied to `masi-app-sqlite` without Task 7's explicit Jim gate. **The branch must not merge to `main` before Task 7 has applied the server migration.** `main` ships preview OTAs, and every phone, including literacy EAs', would call `get_skill_mastery_page`.
- Update `documentation/build-log.md` at the end of the plan (Task 6).

## Review Focus

1. **A key unknown to this phone's edition arrives in a history page.** For example, `add.25`, ticked on a phone with a newer edition. Expected: the page saves and `getSkillMastery` returns the row. Rejecting it would block the walk forever. Test: Task 5, `a well-formed step key outside the bundled edition is stored, not rejected`.
2. **A malformed key arrives from the server or a stale slot** (`Add.5`, `add`). Expected: the whole page rejects with `kind = 'query'` before any write, not as a SQLite CHECK error part-way through the transaction. Test: Task 5, `a malformed step key rejects the page whole`.
3. **The skill walk fails, for example because hosted lacks the RPC (`PGRST202`) or the switch is off (`MR001`).** Expected: only the `skill_mastery_pull:` cursor records the failure. Letter mastery completeness and the letter walk are unaffected, so a literacy EA's lesson flow never degrades. Test: Task 5, `a failing skill walk leaves letter mastery completeness and the letter cursor untouched`.
4. **A child with ticks but no other history goes through `deleteIfNoHistory`.** Expected: it returns `false` and nothing is deleted. Test: Task 4, `a child with a skill tick is not deleted as history-free`.
5. **A stuck tick is investigated from a support export.** Expected: the database export lists `skillMastery` rows, a terminal `skill_mastery` incident payload has `serverRecordId: null` (the wire payload has no `id`), and a failing skill walk raises `pull_failing` with `scopeFamily: 'skill_mastery_pull'`. Tests: Task 4, `the export lists skill ticks and a terminal tick has no server record id`; Task 5, `a skill walk failing for a day raises pull_failing`.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261101120000_skill_mastery_current_state.sql` (new) | Id function, table, receipts, RLS, `set_skill_mastery`, `get_skill_mastery_page`, rollout switch |
| `scripts/skill-mastery-postgres-harness.cjs` (new) | Disposable PG17 proof of the migration |
| `scripts/assessment-history-postgres-harness.cjs` | Rollout-row counts 3 → 4 |
| `package.json`, `.github/workflows/tests.yml` | `verify:skill-mastery:postgres` script and CI step |
| `docs/adr/0013-numeracy-ticks-in-a-parallel-skill-mastery-table.md` (new) | The decision |
| `src/db/domainId.js` | `SKILL_MASTERY_ID_NAMESPACE`, `skillMasteryDomainId` |
| `src/db/migrations.js` | v21 `skill_mastery` |
| `src/db/repositories/skillMasteryRepository.js` (new) | Write, read, correction times, acknowledgement, history merge, handover delete |
| `src/session/handleServices.js` | `repositories.skillMastery`, `assessmentHistory.skillMasteryCompletenessByChild` |
| `src/services/skillMasteryCorrection.js` (new) | RPC argument builder and reply parser |
| `src/services/offlineSync.js`, `syncPayload.js`, `syncServerColumns.js` | One more correction table |
| `src/db/debugDump.js`, `src/services/incidentPayloads.js`, `src/services/supportIncidents.js` | Diagnostics |
| `src/db/repositories/childrenRepository.js`, `referenceDataRepository.js` | Handover delete, no-history check, programme retarget |
| `src/services/assessmentHistoryPull.js`, `assessmentHistoryStatus.js`, `pullCoverage.js` | Skill walk, store, completeness |
| `src/screens/main/SyncStatusScreen.js` | Fold the skill cursor into the combined History state |
| `test-support/assessmentHistoryServer.js` | Fake `get_skill_mastery_page`, `skillMasteryRow` |
| `documentation/rls-sync-contract-map.md`, `CONTEXT.md`, `PRD.md`, `documentation/ROADMAP.md`, `documentation/build-log.md` | Same-branch docs |

New Jest files are also added to `jest.integration.config.js` `testMatch`, as their letter counterparts are.

---

### Task 1: Server table, correction RPC, history page and switch

**Files:**
- Create: `supabase/migrations/20261101120000_skill_mastery_current_state.sql`
- Create: `scripts/skill-mastery-postgres-harness.cjs`
- Create: `docs/adr/0013-numeracy-ticks-in-a-parallel-skill-mastery-table.md`
- Modify: `scripts/assessment-history-postgres-harness.cjs` (cases `rollout-seed` and `rollout-reapply-preserves-switches`)
- Modify: `package.json` (`"verify:skill-mastery:postgres": "node scripts/skill-mastery-postgres-harness.cjs"`), `.github/workflows/tests.yml` (a "Skill mastery PostgreSQL harness" step after "Letter mastery PostgreSQL harness", with the same env block)

**Interfaces:**
- Consumes: `private.current_user_delivers_to_child(uuid)`, `private.history_pull_enabled(text, uuid)`, `private.set_updated_at()`, `extensions.uuid_generate_v5`; harness helpers exported by `scripts/history-authorization-postgres-harness.cjs` (`MIGRATIONS_DIR, assertDisposableAdminTarget, bootstrapSql, buildDatabaseUrl, buildPsqlEnv, expectSqlState, runPsql`) and `overlappingCalls` from `scripts/assessment-results-postgres-harness.cjs`.
- Produces (server contract; Task 4 calls it, Task 5 pages it):
  - `private.skill_mastery_id(p_child_id uuid, p_step_key text) returns uuid`: immutable, `uuid_generate_v5('20002406-1d97-4087-b350-a8d41515dd39'::uuid, concat_ws(pg_catalog.chr(31), 'skill_mastery', p_child_id::text, p_step_key))`. No app-role EXECUTE.
  - `public.skill_mastery(id uuid pk, child_id uuid not null → children on delete cascade, step_key text not null, confirmed boolean not null, changed_at timestamptz not null, correction_id uuid not null, changed_by uuid not null → auth.users on delete restrict, programme_id uuid null → programmes on delete restrict, created_at, updated_at)`, with constraints `skill_mastery_child_step_key_key unique (child_id, step_key)` and `skill_mastery_step_key_chk check (step_key ~ '^[a-z_]+\.[0-9a-z]+$')`. Trigger `skill_mastery_set_updated_at` runs `before insert or update` and executes `private.set_updated_at()`. Indexes `skill_mastery_changed_by_idx (changed_by)`, `idx_skill_mastery_changed_by_updated (changed_by, updated_at, id)` and `idx_skill_mastery_child_updated (child_id, updated_at, id)`.
  - `public.skill_mastery_corrections`: the same columns as `letter_mastery_corrections`, with `step_key` in place of `letter, language`. It has `constraint skill_mastery_corrections_pkey primary key (correction_id)` and an index on `(child_id, step_key)`. RLS is on with no policies; only `service_role` gets privileges.
  - RLS on `public.skill_mastery`: INSERT/UPDATE/DELETE revoked from `anon, authenticated`. Policy `skill_mastery_select_writer_or_deliverer` grants `for select to authenticated using (changed_by = (select auth.uid()) or (select private.current_user_delivers_to_child(child_id)))`.
  - `public.set_skill_mastery(p_correction_id uuid, p_child_id uuid, p_step_key text, p_confirmed boolean, p_changed_at timestamptz) returns table (outcome text, confirmed boolean, changed_at timestamptz, correction_id uuid, changed_by uuid)`. It is volatile, security definer and `set search_path = ''`, and its body starts with `#variable_conflict use_column`. Only `authenticated` may execute it.
  - `public.get_skill_mastery_page(p_after_updated_at timestamptz default null, p_after_id uuid default null, p_page_size integer default 200, p_overlap_seconds integer default 0)` returns `id, child_id, step_key, confirmed, changed_at, correction_id, changed_by, programme_id, created_at, updated_at, child_first_name, child_last_name, child_preferred_name`. It is stable, security definer, empty search path, and only `authenticated` may execute it.
  - `private.history_pull_rollout.feature` accepts `'skill_mastery'`. An everyone row `('skill_mastery', enabled = true)` is seeded only if absent.

- [ ] **Step 1: Write the harness.** Model `scripts/skill-mastery-postgres-harness.cjs` on `scripts/letter-mastery-postgres-harness.cjs`: the same fixture shape (EA_A literacy, EA_B numeracy, FORMER, CLASS_ONLY, NO_PROGRAMME, UNRELATED), `asActor`, `sqlAssert` and `expectWinner`. Use database name suffix `_skill_mastery` and `NS = '20002406-1d97-4087-b350-a8d41515dd39'`. Leave out the rekey database, because this is a new table with no old shape. These are the named cases, each with its exact assertion:

```js
// call(c) = public.set_skill_mastery(id, child, step_key, confirmed, time)
'newer-applies'                  // applied; one row per (child, step_key); lm.id = private.skill_mastery_id(child,'add.5'); programme_id = caller's active programme
'older-superseded-returns-winner'// older correction → 'superseded' + the newer winner's four fields
'future-clamped'                 // p_changed_at = now()+1 day → receipt effective_at <= now(), requested_at keeps the future time
'fast-clock-lost-reply'          // a replay of the clamped correction returns the same effective_at
'same-id-concurrent'             // overlappingCalls on one correction id → one receipt, one effective_at
'same-key-concurrent'            // two ids on one key → the later (changed_at, correction_id) wins
'non-deliverers-denied'          // FORMER, CLASS_ONLY, UNRELATED → 42501 and no receipt
'no-programme-deliverer'         // NO_PROGRAMME applies with programme_id null
'replay-after-revocation'        // committed id replays after unassignment → applied/acknowledged, not 42501
'replay-mismatch'                // same id, any of child/step_key/confirmed/time changed, or another caller → MA001
'shape'                          // 22023 for each of: null step_key, 'Add.5', 'add', 'add.', '.5', 'a1.5', 'add.5.1', 'add.5_', 'add-5', 'add.5 '
'server-accepts-any-well-formed-key' // 'unknown_skill.99' and 'skip_count.2s' apply (server checks shape only)
'no-auth'                        // no jwt sub → 28000
'direct-writes-denied'           // INSERT/UPDATE/DELETE on skill_mastery as EA → 42501; skill_mastery_corrections SELECT/INSERT → 42501
'select-scope'                   // current deliverer reads; non-deliverer reads 0; last writer reads after revocation; former writer cannot read a successor's row
'grants'                         // has_function_privilege false for public/anon on set_/get_ functions, false for every app role on private.skill_mastery_id; true for authenticated on set_/get_
'server-stamp'                   // created_at/updated_at set by trigger; a losing replay leaves updated_at unchanged
'id-parity'                      // private.skill_mastery_id(CHILD,'add.5') = v5(['skill_mastery', CHILD, 'add.5'].join('\u001f'), NS)
'page-rollout-disabled'          // UPDATE everyone row enabled=false → get_skill_mastery_page raises MR001 'rollout_disabled'
'page-arguments'                 // page size 0 / 201, overlap -1 / 601, half-null cursor → 22023; guard order 28000 → MR001 → 22023
'page-arms'                      // owner arm (changed_by) and delivery arm both page; un-confirmed rows page; class-only and unrelated get none; former deliverer keeps last-written row until superseded
'rollout-seed'                   // exactly one everyone row for 'skill_mastery', enabled
'migration-reapply'              // re-running the file after disabling the switch and writing a correction changes neither the switch, its note, nor the current row
'letter-mastery-unchanged'       // set_letter_mastery still applies a 'k'/'xh' correction after this migration
```

- [ ] **Step 2: Run it RED.** Command (controller-local PG17; CI has its own port):

```bash
PGTZ=UTC HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:65433/postgres \
HISTORY_RLS_DATABASE_NAME=masi_history_rls_local HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE \
npm run verify:skill-mastery:postgres
```

Expected: FAIL at `newer-applies`, because `public.set_skill_mastery` does not exist. If Codex's sandbox cannot reach PostgreSQL, the orchestrator runs this step and Step 5.

- [ ] **Step 3: Write the migration.** Copy `set_letter_mastery`'s body and replace `p_letter, p_language` with `p_step_key`. The malformed check is `p_step_key !~ '^[a-z_]+\.[0-9a-z]+$'`, which raises `22023` with message `Malformed skill mastery correction`. Use the same receipt, the `MA001` replay check on five fields (caller, child, step_key, confirmed, requested_at), `on conflict on constraint skill_mastery_corrections_pkey do nothing`, `on conflict on constraint skill_mastery_child_step_key_key do update ... where (excluded.changed_at, excluded.correction_id) > (sm.changed_at, sm.correction_id)`, and the same applied/superseded/acknowledged return. `get_skill_mastery_page` copies `get_letter_mastery_page` against `public.skill_mastery`, with switch feature `'skill_mastery'`. For the rollout switch, run `alter table private.history_pull_rollout drop constraint if exists history_pull_rollout_feature_check, add constraint history_pull_rollout_feature_check check (feature in ('assessments','battery_runs','letter_mastery','skill_mastery'))`, then the seed `insert ... where not exists`. Every policy, trigger and constraint is created idempotently (`drop ... if exists` / `if not exists`). End with `notify pgrst, 'reload schema'; RESET statement_timeout; RESET lock_timeout;`.

- [ ] **Step 4: Update the assessment history harness.** In `rollout-seed`, assert `count(*) = 4` everyone rows, all enabled, and add `private.history_pull_enabled('skill_mastery', CLASS_ONLY)`. In `rollout-reapply-preserves-switches`, the count becomes `4`.

- [ ] **Step 5: Run GREEN.** Run `npm run verify:skill-mastery:postgres` (expect all named cases `passed`), then `npm run verify:letter-mastery:postgres`, `verify:assessment-history:postgres`, `verify:reporting:postgres`, `verify:history-authorization:postgres`, `verify:ea-access:postgres` and `verify:session-group:postgres`, each with the Step 2 env. Expected: every harness passes. If `reader-executable-functions` fails, a new function is missing its `revoke ... from public`.

- [ ] **Step 6: Write ADR 0013.** Use the front matter `status: accepted`, `date: <build date>` and the sections Context / Decision / Consequences, in the same shape as `docs/adr/0011-...`. It must state:
  - `letter_mastery` cannot hold a step key (the letter CHECK, the two-letter language code and the RPC regex). Generalising it would reopen a contract that just passed hardened review, during the November field retest.
  - The parallel table copies the contract exactly: deterministic id in a new namespace, receipts, the `(changed_at, correction_id)` winner, one outbox slot, history pull, no Programme or year bound.
  - A step key's meaning never changes. The server checks shape only; the phone checks the bundled curriculum.
  - Accepted risks A2 and A3 are inherited unchanged.
  - Consequences: duplicate code in the two repositories and RPCs. "Unify mastery tables" goes on the roadmap. Revisit trigger: a third mastery domain, or a change needed in both contracts at once.

- [ ] **Step 7: Orchestrator commits**

```bash
git add supabase/migrations/20261101120000_skill_mastery_current_state.sql scripts/skill-mastery-postgres-harness.cjs scripts/assessment-history-postgres-harness.cjs package.json .github/workflows/tests.yml docs/adr/0013-numeracy-ticks-in-a-parallel-skill-mastery-table.md
git commit -m "feat(numeracy): skill_mastery server table, correction RPC, history page and switch"
```

---

### Task 2: Phone schema v21 and deterministic id

**Files:**
- Modify: `src/db/domainId.js`
- Modify: `src/db/migrations.js` (append version 21 after `field_diagnostics`)
- Create: `__tests__/skillMasteryMigration.test.js`, `__tests__/skillMasteryIdParity.test.js`
- Modify: `__tests__/sqliteFoundation.test.js` (`CURRENT_SCHEMA_VERSION` 21, migration list `{ version: 21, name: 'skill_mastery' }`, expected tables add `'skill_mastery'`), `__tests__/fieldDiagnosticsMigration.test.js:43` (assert `{ user_version: CURRENT_SCHEMA_VERSION }`), `jest.integration.config.js`

**Interfaces:**
- Consumes: Task 1's `private.skill_mastery_id` SQL text (parity test reads the migration file).
- Produces:
  - `export const SKILL_MASTERY_ID_NAMESPACE = '20002406-1d97-4087-b350-a8d41515dd39'`
  - `export const skillMasteryDomainId = (childId: string, stepKey: string) => string`: `uuidv5(['skill_mastery', String(childId).toLowerCase(), stepKey].join('\u001f'), SKILL_MASTERY_ID_NAMESPACE)`
  - SQLite table `skill_mastery` and unique index `idx_skill_mastery_child_key (child_id, step_key)`

- [ ] **Step 1: Write the failing tests**

```js
// __tests__/skillMasteryIdParity.test.js — reads the Task 1 migration text
test('the server and phone share the skill mastery namespace and name expression', () => {
  expect(sql.match(/uuid_generate_v5\(\s*'([^']+)'::uuid/)[1]).toBe(SKILL_MASTERY_ID_NAMESPACE);
  expect(SKILL_MASTERY_ID_NAMESPACE).not.toBe(MASI_DOMAIN_ID_NAMESPACE);
  expect(sql).toMatch(/concat_ws\(pg_catalog\.chr\(31\), 'skill_mastery', p_child_id::text, p_step_key\)/);
  expect(sql).not.toMatch(/set local/i);
  expect(skillMasteryDomainId('ABC', 'add.5')).toBe(skillMasteryDomainId('abc', 'add.5'));
  expect(skillMasteryDomainId('abc', 'add.5')).not.toBe(skillMasteryDomainId('abc', 'add.10'));
});
test('set_skill_mastery pins column resolution and named conflict constraints', () => {
  // same three regex checks as letterMasteryIdParity.test.js, with skill_mastery_corrections_pkey,
  // skill_mastery_child_step_key_key, and no bare `on conflict (`
});

// __tests__/skillMasteryMigration.test.js — real SQLite
test('v21 creates skill_mastery with exactly the mirrored columns and its natural key', async () => {
  // PRAGMA table_info names, in order:
  // id, child_id, step_key, confirmed, changed_at, correction_id, changed_by, programme_id,
  // created_at, updated_at, sync_status, last_sync_error, server_updated_at, server_changed_at, server_correction_id
  // a second row with the same (child_id, step_key) → SQLITE_CONSTRAINT
});
test.each(['add.5', 'skip_count.2s', 'count_aloud.100'])('step key %s is accepted', ...);
test.each(['Add.5', 'add', 'add.', '.5', 'a1.5', 'add.5.1', 'add.5_', 'add-5', 'add.5 '])('step key %j is rejected by the CHECK', ...);
test('upgrading a populated v20 database adds the table and leaves letter_mastery rows untouched', ...);
test('deleting the child cascades its skill_mastery rows', ...);
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/skillMasteryIdParity.test.js __tests__/skillMasteryMigration.test.js`
Expected: FAIL (`skillMasteryDomainId` is not exported; no table `skill_mastery`).

- [ ] **Step 3: Implement.** Add the two exports to `src/db/domainId.js`. Add migration `{ version: 21, name: 'skill_mastery', sql }`, copying v16's table body with `letter, language` replaced by `step_key`. The CHECK cannot use a regex in SQLite, so use exactly:

```sql
step_key text not null check (
  step_key glob '[a-z_]*.[0-9a-z]*'
  and step_key not glob '*.*.*'
  and substr(step_key, 1, instr(step_key, '.') - 1) not glob '*[^a-z_]*'
  and substr(step_key, instr(step_key, '.') + 1) not glob '*[^0-9a-z]*'
),
```

Then add `create unique index idx_skill_mastery_child_key on skill_mastery(child_id, step_key);`. It needs no transform.

- [ ] **Step 4: Run the new tests and the version-pinned suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/skillMastery __tests__/sqliteFoundation.test.js __tests__/fieldDiagnosticsMigration.test.js __tests__/letterMasteryIdParity.test.js`
Expected: PASS.

- [ ] **Step 5: Orchestrator commits**

```bash
git add src/db/domainId.js src/db/migrations.js __tests__/skillMasteryMigration.test.js __tests__/skillMasteryIdParity.test.js __tests__/sqliteFoundation.test.js __tests__/fieldDiagnosticsMigration.test.js jest.integration.config.js
git commit -m "feat(numeracy): SQLite v21 skill_mastery and deterministic step-key id"
```

---

### Task 3: `skillMasteryRepository`: write, read, correction times, acknowledgement

**Precondition:** Track A (`feat/numeracy-curriculum-content`) has merged to `main`, and this branch is rebased onto it so that `content/numeracy-curriculum/index.js` exists. That is the one key-validation approach: there is no injectable validator. Tasks 1–2 do not need Track A and can be built first.

**Files:**
- Create: `src/db/repositories/skillMasteryRepository.js`
- Modify: `src/session/handleServices.js` (`skillMastery: createSkillMasteryRepository(options)` in `repositories`)
- Create: `__tests__/skillMasteryRepository.test.js`; modify `jest.integration.config.js`

**Interfaces:**
- Consumes: `skillMasteryDomainId` (Task 2); `getCurriculum(), listStepKeys(curriculum)` from `content/numeracy-curriculum`; `getConnectionActor` (`src/session/signedInHandle`); `resolveDatabase, runRepositoryTransaction` (`./repositoryRuntime`); `enqueueDomainOutbox, getActiveProgrammeId, mapDomainRow` (`./domainRepositoryUtils`); `chunkArray, sqlPlaceholders, upsertRecord` (`./sqliteRepositoryUtils`); `compareServerTimestamps` (`src/utils/serverTimestamps`).
- Produces (module exports):
  - `export const STEP_KEY_PATTERN = /^[a-z_]+\.[0-9a-z]+$/`
  - `export const applyCorrectionAcknowledgement = async (txn, { recordId, sentCorrectionId, result, outboxDeleted }) => 'none' | 'deleted' | 'ordering_only' | 'written'`. The same five-row table as the letter version, on `skill_mastery`.
  - `export const createSkillMasteryRepository = ({ database } = {}) => ({ setSkillMastery, getSkillMastery, getSkillCorrectionTimes, saveHistoryPage })`. `saveHistoryPage` is added in Task 5; until then the object has three keys.
  - `setSkillMastery({ childId, stepKey, confirmed, changedAt?, programmeId?, transaction? }) → Promise<SkillMasteryRow>`
  - `getSkillMastery({ childId?, childIds?, transaction? } = {}) → Promise<SkillMasteryRow[]>`. It rejects a `userId` or `programmeId` option with a `TypeError`, excludes `sync_status = 'terminal'` rows, and orders by `child_id, step_key` (re-sorted after chunking, as `getLetterMastery` does).
  - `getSkillCorrectionTimes({ childIds, transaction? }) → Promise<Record<childId, Record<stepKey, changedAt>>>`: the newest of the row's `changed_at` and any `skill_mastery` outbox payload's `changed_at`, as `getCorrectionTimes` does without `language`.
  - `SkillMasteryRow = { id, child_id, step_key, confirmed: boolean, changed_at, correction_id, changed_by, programme_id, created_at, updated_at, sync_status, last_sync_error, server_updated_at, server_changed_at, server_correction_id }`
  - Handle: `handle.services.repositories.skillMastery` (`useSignedInEA().repositories.skillMastery`)

- [ ] **Step 1: Write the failing tests.** Use the `masteryRepository.test.js` fixture: `createMigratedDatabase(runMigrations)`, `seedCoreData`, `child-1` and a synced delivery `child_ea_assignments` row for `user-1`. Use `key = { childId: 'child-1', stepKey: 'add.5' }`.

```js
test('setSkillMastery stores one pending record under the uuidv5 id and queues one update slot', async () => {
  const result = await change();                       // confirmed: true
  const id = skillMasteryDomainId('child-1', 'add.5');
  expect(result).toMatchObject({ id, step_key: 'add.5', confirmed: true, changed_by: 'user-1', programme_id: 'programme-a', sync_status: 'pending' });
  const [slot] = await readOutbox();
  expect(slot).toMatchObject({ id: `skill_mastery:${id}:update`, record_id: id, operation: 'update', owner_user_id: 'user-1' });
  expect(JSON.parse(slot.payload)).toEqual({ id, child_id: 'child-1', step_key: 'add.5', confirmed: true,
    changed_at: result.changed_at, correction_id: result.correction_id, changed_by: 'user-1', programme_id: 'programme-a' });
  expect(Object.keys(repository).sort()).toEqual(['getSkillCorrectionTimes', 'getSkillMastery', 'setSkillMastery']);
});
test('each change gets a new correction id and replaces the single slot');           // tick, untick, tick → 1 outbox row, last correction id
test('a step key outside the bundled curriculum is refused before any write');       // 'add.25', 'unknown.5', 'Add.5' → TypeError; no row, no slot
test('a child without active delivery is refused with NOT_DELIVERY_CHILD');           // unassigned_at set → error.code === 'NOT_DELIVERY_CHILD'
test('an older tap never replaces a newer owed correction');                          // TUE pending, then MON save → row and slot unchanged, returns the TUE row
test('a future tap is clamped to now');                                              // changedAt = now + 1 day → changed_at === NOW
test('getSkillMastery reads every EA and Programme, hides terminal rows, rejects user and programme filters');
test('getSkillCorrectionTimes takes the newer of row and owed payload per child and step');
test('applyCorrectionAcknowledgement: applied and superseded write the winner; superseded clears programme context');
test('applyCorrectionAcknowledgement: acknowledged deletes the row only when the CAS deleted the slot');
test('applyCorrectionAcknowledgement: a newer owed slot keeps content and takes only server ordering');
test('the signed-in handle exposes repositories.skillMastery bound to its EA');      // via test-support/defaultTestHandle
```

- [ ] **Step 2: Run to make sure it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/skillMasteryRepository.test.js`
Expected: FAIL (cannot resolve `skillMasteryRepository`).

- [ ] **Step 3: Implement.** Mirror `masteryRepository.js` line for line, with `(letter, language)` replaced by `step_key`. The write columns are `id, child_id, step_key, confirmed, changed_at, correction_id, changed_by, programme_id, created_at, updated_at, sync_status, last_sync_error`. Build `const KNOWN_STEP_KEYS = new Set(listStepKeys(getCurriculum()))` once at module scope, and have `setSkillMastery` throw `TypeError('stepKey must be a step in the bundled curriculum')` when the key is not in it. The delivery-anchored keyed read, the owed-slot ordering guard and the clamped `changed_at` are unchanged. The NOT_DELIVERY_CHILD message is `Skill mastery requires an active delivery assignment`, and `changed_by` falls back to the error `skill_mastery.changed_by requires the signed-in EA`. Export no singleton.

- [ ] **Step 4: Run to make sure it passes, plus the binding static test**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/skillMasteryRepository.test.js __tests__/productionBindingStatic.test.js __tests__/handleServices.test.js __tests__/masteryRepository.test.js`
Expected: PASS.

- [ ] **Step 5: Orchestrator commits**

```bash
git add src/db/repositories/skillMasteryRepository.js src/session/handleServices.js __tests__/skillMasteryRepository.test.js jest.integration.config.js
git commit -m "feat(numeracy): skillMasteryRepository writes one correction slot per tick"
```

---

### Task 4: Sync engine, server columns, diagnostics and child guards

**Files:**
- Create: `src/services/skillMasteryCorrection.js`
- Modify: `src/services/offlineSync.js` (`PUSH_ORDER`, `TABLE_DEPENDENCIES`, `PARENT_FK_COLUMNS`, `GRANT_SUBJECTS`, the 23505 `requiresRpcAcknowledgement` list, the payload `TypeError` → `22023` list, the RPC send branch at `:676`, `finalizeSuccess` at `:834-865`)
- Modify: `src/services/syncPayload.js`, `src/services/syncServerColumns.js`
- Modify: `src/db/debugDump.js` (`wireEvidence` and a `skillMastery` section after `letterMastery`), `src/services/incidentPayloads.js` (`terminalPayload`)
- Modify: `src/db/repositories/childrenRepository.js` (`deleteIfNoHistory` checks), `src/db/repositories/referenceDataRepository.js` (`foreignKeyRetargets` adds `{ tableName: 'skill_mastery', column: 'programme_id' }`)
- Create: `__tests__/skillMasteryCorrectionSync.test.js`; modify `__tests__/debugExport.test.js`, `__tests__/childrenRepository.test.js`, `jest.integration.config.js`

**Interfaces:**
- Consumes: Task 3's `applyCorrectionAcknowledgement` (imported as `applySkillCorrectionAcknowledgement`), `createSkillMasteryRepository`; Task 1's `set_skill_mastery`.
- Produces:
  - `toSetSkillMasteryArgs(payload) → { p_correction_id, p_child_id, p_step_key, p_confirmed, p_changed_at }`. It throws `TypeError` for an empty or missing string field, a non-boolean `confirmed` or an unparseable `changed_at`.
  - `export { parseSetLetterMasteryResult as parseSetSkillMasteryResult } from './letterMasteryCorrection'`. The reply shape is identical, so the parser is reused unchanged.
  - `SERVER_COLUMNS.skill_mastery = ['id', 'child_id', 'step_key', 'confirmed', 'changed_at', 'correction_id', 'changed_by', 'programme_id', 'created_at', 'updated_at']`
  - Sync result `tableResults.skill_mastery`, which Track D's tracker refresh watches as `useLetterMasterySyncRefresh` does.
  - `debugDump(...).skillMastery: Array<{ childId, stepKey, confirmed, changedAt, correctionId, changedBy, programmeId, syncStatus, serverChangedAt, serverCorrectionId }>`, bounded by the existing `masteryLimit`.

- [ ] **Step 1: Write the failing tests.** Use the `letterMasteryCorrectionSync.test.js` fixture: `createFamilySyncFixture({ withDelivery: true })`, `createSupabaseMock({ rpcResults: { set_skill_mastery: reply(winner()) } })` and step key `'add.5'`.

```js
test('one tick is one set_skill_mastery call with exactly its five arguments');      // rpc args keys === ['p_changed_at','p_child_id','p_confirmed','p_correction_id','p_step_key']
test('applied writes the returned record and the server ordering columns');         // server_changed_at keeps '2026-10-20T08:00:00.123456+00:00' unchanged
test('superseded shows the winner at once');
test('acknowledged deletes the local row');
test('a newer tick made while the call is in flight survives the acknowledgement');
test('two steps are two calls; skill_mastery is never batched or upserted');         // no .from('skill_mastery') call
test('42501 stays retriable while the child assignment is pending, then terminal with the authenticated marker');
test.each(['MA001', '22023', 'UNEXPECTED_RPC_RESULT'])('%s is terminal');            // reply { data: [{ outcome: 'bogus' }] } for UNEXPECTED
test('a malformed outbox payload becomes terminal 22023 without a request');
test('a 23505 never marks a tick synced without the acknowledgement');
test('letter and skill corrections in one pass each reach their own RPC and acknowledgement'); // tableResults has both keys
test('a failure after the outbox delete rolls back the write-back');

// __tests__/childrenRepository.test.js
test('a child with a skill tick is not deleted as history-free');                    // deleteIfNoHistory → false; child row remains
// __tests__/debugExport.test.js
test('the export lists skill ticks and a terminal tick has no server record id');    // dump.skillMastery[0].stepKey === 'add.5'; terminalPayload(row).serverRecordId === null; wirePayload.p_step_key === 'add.5'
```

- [ ] **Step 2: Run to make sure they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/skillMasteryCorrectionSync.test.js __tests__/childrenRepository.test.js __tests__/debugExport.test.js`
Expected: FAIL (`skill_mastery` is not in `PUSH_ORDER`; no `set_skill_mastery` call).

- [ ] **Step 3: Implement.** Append `'skill_mastery'` to `PUSH_ORDER` after `'letter_mastery'`. Give it the same entries as `letter_mastery` in `TABLE_DEPENDENCIES` (`['children']`), `PARENT_FK_COLUMNS` (`{ children: 'child_id' }`) and `GRANT_SUBJECTS` (direct `child_ea_assignments` only). Add it to the 23505 and 22023 table lists. **Leave the two `letter_mastery` branches byte-identical** (the RPC send at `:676`, `finalizeSuccess` at `:834-865`). Add a parallel `skill_mastery` branch directly after each one, calling `set_skill_mastery`, `parseSetSkillMasteryResult` and `applySkillCorrectionAcknowledgement`. This follows the spec's anti-goal, "touching the literacy mastery contract" (§2), and ADR 0013's accepted duplication. Folding both into one table-keyed map belongs to the roadmap item "unify the mastery tables", not this release. Step 4 adds a check: `git diff origin/main -- src/services/offlineSync.js` shows no removed or changed line inside either letter branch; it adds lines only. `buildSyncPayload` returns `toSetSkillMasteryArgs(record)` for `skill_mastery`. `debugDump.wireEvidence` and `terminalPayload` treat `skill_mastery` like `letter_mastery` (`serverRecordId: null`). `deleteIfNoHistory` adds `"select 1 from skill_mastery where child_id = ? limit 1"`.

- [ ] **Step 4: Run the new tests and the drift and letter suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/skillMasteryCorrectionSync.test.js __tests__/letterMasteryCorrectionSync.test.js __tests__/letterMasteryRpcError.test.js __tests__/syncContractCompleteness.test.js __tests__/syncContractServerSchema.test.js __tests__/classifyErrorHardening.test.js __tests__/offlineSyncOutbox.test.js __tests__/debugExport.test.js __tests__/childrenRepository.test.js __tests__/referenceDataRepository.test.js`
Expected: PASS. `syncContractServerSchema` finds every `SERVER_COLUMNS.skill_mastery` column in Task 1's migration.

- [ ] **Step 5: Orchestrator commits**

```bash
git add src/services/skillMasteryCorrection.js src/services/offlineSync.js src/services/syncPayload.js src/services/syncServerColumns.js src/db/debugDump.js src/services/incidentPayloads.js src/db/repositories/childrenRepository.js src/db/repositories/referenceDataRepository.js __tests__/skillMasteryCorrectionSync.test.js __tests__/debugExport.test.js __tests__/childrenRepository.test.js jest.integration.config.js
git commit -m "feat(numeracy): skill ticks sync through set_skill_mastery with atomic acknowledgement"
```

---

### Task 5: History page, walk, handover and completeness

**Files:**
- Modify: `src/db/repositories/skillMasteryRepository.js` (add `saveHistoryPage`, `deleteUndeliveredSkillMastery`, `skillMasteryHistoryScope`)
- Modify: `src/db/repositories/childrenRepository.js:169` (call `deleteUndeliveredSkillMastery` after `deleteUndeliveredLetterMastery`, with the same arguments)
- Modify: `src/services/assessmentHistoryPull.js`, `src/services/assessmentHistoryStatus.js`, `src/services/pullCoverage.js`, `src/session/handleServices.js`, `src/services/supportIncidents.js:106-111`, `src/screens/main/SyncStatusScreen.js:70-78`
- Modify: `test-support/assessmentHistoryServer.js`
- Create: `__tests__/skillMasteryHistoryPage.test.js`, `__tests__/skillMasteryHandover.test.js`
- Modify: `__tests__/skillMasteryRepository.test.js` (the repository-keys assertion gains `'saveHistoryPage'`), `__tests__/assessmentHistoryStatus.test.js`, `__tests__/historyPullTriggerBudget.test.js`, `__tests__/syncStatusScreen.test.js`, `__tests__/supportIncidentObserver.test.js`, `__tests__/pullCoverage.test.js`, `__tests__/handleServices.test.js`, `jest.integration.config.js`

**Interfaces:**
- Consumes: Tasks 1–4; `ensureHistoryReferenceChildren, insertOrIgnoreRows, selectRowsByIds` (`./historyPageApply`); `removeFromHistoryCoverage, resolveHistoryPullState` (`./historyCoverage`); `serverTimestampMicros, compareServerTuples`; `runHistoryWalk`, `createHistoryWalkState`; `readMasteryScope`; `isCoverageWalkComplete`.
- Produces:
  - `export const skillMasteryHistoryScope = (userId) => \`skill_mastery_pull:${userId}\``
  - `export const deleteUndeliveredSkillMastery = async (txn, { userId, childIds }) => number`. It deletes only synced rows with no `pending`, `failed` or `in_flight` slot, for children with no active assignment for `userId`, in at most four statements. It drops those ids from the `skill_mastery_pull:` coverage.
  - `repository.saveHistoryPage(rows, { scope, pullState, admit }) → Promise<{ inserted, applied, skipped }>`. Validation checks `STEP_KEY_PATTERN`, not the curriculum.
  - `export const SKILL_MASTERY_PAGE_SIZE = 200`; `export const runSkillMasteryHistoryPull = ({ userId, force = false, deps = {} }) => Promise<{ status, pages }>` (tag `SkillMasteryHistory`, RPC `get_skill_mastery_page`, coverage `readMasteryScope`, `windowStart: null`)
  - `createAssessmentHistoryStates()` adds `skillMastery`. The store runs **Battery Runs → assessments → mastery → skillMastery**. `lastResults` and `getPullStates(userId)` add `skillMastery`.
  - `export const skillMasteryCompletenessByChild = async ({ database, userId, childIds = [] }) => Record<childId, boolean>`: true only when the `skill_mastery_pull:` cursor passes `isCoverageWalkComplete(cursor, { childIds: [id], windowStart: null })` **and** the child is in `readMasteryScope`.
  - Handle: `services.assessmentHistory.skillMasteryCompletenessByChild({ childIds })`. Track D turns this into the planner's `complete.ticks`.
  - `test-support/assessmentHistoryServer.js`: `get_skill_mastery_page` skips the year check; `export const skillMasteryRow = (childId, stepKey, at, extra = {})`

- [ ] **Step 1: Write the failing tests.** Copy the fixtures from `letterMasteryHistoryPage.test.js` and `letterMasteryHandover.test.js`, using `step_key: 'add.5'`.

```js
// __tests__/skillMasteryHistoryPage.test.js
test('absent rows insert with their server tuple; an unknown child becomes a reference child'); // { inserted: 1, applied: 0, skipped: 0 }; no outbox
test('a well-formed step key outside the bundled edition is stored, not rejected');   // 'add.25' saved; getSkillMastery returns it
test('a malformed step key rejects the page whole');                                 // ['Add.5'] → TypeError, kind 'query'; no rows, cursor unchanged
test('a pending local tick is left alone');                                          // skipped: 1
test('a synced row takes only a newer server tuple');
test('an in-flight correction blocks the merge');
test('a terminal row takes a newer or equal tuple without touching its terminal slot');
test('a null server tuple is lowest and a higher id wins an equal-time tie');
test('cancellation after the rows rolls back rows and cursor together');
test('the delete helper uses at most four statements and drops coverage even when nothing is deleted');

// __tests__/skillMasteryHandover.test.js
test('handover deletes synced ticks, keeps owed ones, and the return re-walks');      // child-m: synced tick gone, owed tick stays; reassign → walk restores it
test('a walk in flight across the handover cannot re-add the child');
test('a failing skill walk leaves letter mastery completeness and the letter cursor untouched');
// server.lists.get_skill_mastery_page throws { code: 'PGRST202' }; after a store pass:
//   lastResults.skillMastery.status !== 'complete'; isMasteryInputsComplete(...) unchanged from before;
//   letter_mastery_pull cursor unchanged; skillMasteryCompletenessByChild → all false

// existing suites
// assessmentHistoryStatus.test.js: one pass calls B, A, M, then 'get_skill_mastery_page'; emptyResults and getPullStates include skillMastery: null / { scope: 'skill_mastery_pull:user-1' }
// historyPullTriggerBudget.test.js: 3 → 4 calls, order ends with 'get_skill_mastery_page'
// syncStatusScreen.test.js: History reads 'Up to date' only when all five states are up to date
// supportIncidentObserver.test.js: 'a skill walk failing for a day raises pull_failing' with payload.scopeFamily === 'skill_mastery_pull'
// pullCoverage.test.js: skillMasteryCompletenessByChild true after a complete walk; false for a lost grant, a failed cursor, a missing cursor
```

- [ ] **Step 2: Run to make sure they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/skillMasteryHistoryPage.test.js __tests__/skillMasteryHandover.test.js __tests__/assessmentHistoryStatus.test.js __tests__/historyPullTriggerBudget.test.js`
Expected: FAIL (`saveHistoryPage` / `runSkillMasteryHistoryPull` undefined; 3 calls instead of 4).

- [ ] **Step 3: Implement.** `saveHistoryPage` and `deleteUndeliveredSkillMastery` mirror `masteryRepository`'s. The only differences are the table, the `step_key` column and the validation (`typeof step_key === 'string' && STEP_KEY_PATTERN.test(step_key)`). Add the walk and wire it into the store's `walks`, `emptyResults` and `getPullStates`. The year-mismatch restart already nulls only the year-scoped results, so leave it. Add `skillMasteryCompletenessByChild` and bind it on the handle. Add `(scope >= 'skill_mastery_pull:' and scope < 'skill_mastery_pull;')` to the incident scope query, and `states.skillMastery` as the fifth `pullStates` entry, initialised as `[null, null, null, null, null]`.

- [ ] **Step 4: Run the whole unit suite and the integration suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --silent --maxWorkers=2 && PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`
Expected: both PASS. `letterMasteryHandover.test.js`, `letterMasteryHistoryPage.test.js` and `pullReconcile.integration.test.js` still pass unchanged.

- [ ] **Step 5: Orchestrator commits**

```bash
git add src/db/repositories/skillMasteryRepository.js src/db/repositories/childrenRepository.js src/services/assessmentHistoryPull.js src/services/assessmentHistoryStatus.js src/services/pullCoverage.js src/session/handleServices.js src/services/supportIncidents.js src/screens/main/SyncStatusScreen.js test-support/assessmentHistoryServer.js __tests__/skillMasteryHistoryPage.test.js __tests__/skillMasteryHandover.test.js __tests__/assessmentHistoryStatus.test.js __tests__/historyPullTriggerBudget.test.js __tests__/syncStatusScreen.test.js __tests__/supportIncidentObserver.test.js __tests__/pullCoverage.test.js __tests__/handleServices.test.js __tests__/skillMasteryRepository.test.js jest.integration.config.js
git commit -m "feat(numeracy): skill mastery history pull, handover and completeness"
```

---

### Task 6: Contract map, CONTEXT, PRD, roadmap and build log

**Files:**
- Modify: `documentation/rls-sync-contract-map.md`, `CONTEXT.md`, `PRD.md:138`, `documentation/ROADMAP.md`, `documentation/build-log.md`

**Interfaces:**
- Consumes: everything above, as built. Write from the code, not from this plan.
- Produces: standing docs that match the code (anti-drift rule).

- [ ] **Step 1: Contract map.** Add a section **"Skill mastery: numeracy ticks, one current record per child and step (Numeracy Track B)"** directly after the letter mastery section. State only what differs, and say "identical to letter mastery" for the rest. It must cover:
  - the identity (new namespace, name expression);
  - the shape-only server check versus the curriculum check on the phone;
  - the five-argument RPC and the MA001 five-field replay;
  - the RLS policy name;
  - the outbox payload and the acknowledgement table, by reference;
  - history page validation (shape, not curriculum);
  - accepted risks A2 and A3, inherited.

  Then add rows or lines in:
  - **Operation Semantics** (`skill_mastery` single `update` slot → `rpc('set_skill_mastery', …)`);
  - the history pages table (`get_skill_mastery_page`, switch `skill_mastery`);
  - the walks table (`skill_mastery_pull:<userId>`, 200, no Programme or year bound, fourth in the store order);
  - **Mastery input completeness**: numeracy ticks completeness is `skillMasteryCompletenessByChild` (skill cursor plus delivery scope). Numeracy evidence completeness reuses the assessment cursor;
  - **Server switch** (four features);
  - **Reconcile invariants** (handover deletes synced `skill_mastery` rows too);
  - field diagnostics (`serverRecordId: null` for `skill_mastery`);
  - **Table Contract Map** (a `skill_mastery` row);
  - **Source Files to Review Together**.

  Note in the section header that the hosted migration is not applied until Task 7, and that the branch must not merge before it.
- [ ] **Step 2: CONTEXT.md.** Under **Language**, add **Maths skill**, **Step** and **Step key**, with the spec §3 meanings verbatim. If the EGMA branch has merged, its **Band** term is already there; cross-reference it rather than redefining it. Under "What the child knows", add **Skill mastery (tick)**. It states:
  - an EA's tick is one current record per child and step key in `skill_mastery`;
  - it counts from any current deliverer and any Programme;
  - the last writer is kept in `changed_by`;
  - the most recently made correction wins;
  - a refused correction never counts;
  - the server accepts any well-formed key.

  Add *Avoid*: "band" (that is EGMA's word) and "rung"/"ladder". Add the **History reference child** relationship line for `skill_mastery`, and a settled-decisions bullet with the same visibility as Letter mastery.

  Also add **Known step**, including implied steps, using the spec's §3 and §5.1–5.2 meanings: EGMA shows it, an EA ticked it, or a higher step in the same skill is known. Implied steps are worked out when needed and never written, and EGMA evidence wins over a tick. Track C's plan says this track owns the numeracy CONTEXT terms and doesn't edit CONTEXT.md itself. Write it in domain words only and name no Track C function or file, so Step 5's dangling-name check passes before Track C merges. **Number tracker**, **Lesson shape** and the numeracy lesson flow belong to Track D (screens). Don't add them here.
- [ ] **Step 3: PRD and roadmap.** Add `skill_mastery` to the PRD work-records table list. Add three outstanding items to `ROADMAP.md`, from spec §11. Tracks A and C don't edit the roadmap, so this track carries all three:
  - "Unify `letter_mastery` and `skill_mastery` into one mastery table (ADR 0013); revisit on a third mastery domain."
  - "Numeracy group heat map (Zazi's `groupLetterProgress.js` as prior art); not needed to teach."
  - "Lesson-shape comparison (mixed vs focused): a per-EA setting, assigned by EA or by school. Design it when a comparison is scheduled (numeracy spec §6.4)."
- [ ] **Step 4: Build log.** Add a dated entry for `feat/numeracy-skill-mastery` with:
  - each task's verification commands and their counts (Jest suites, each PG harness case count);
  - review findings;
  - surprises;
  - the Task 7 gate state (pending or applied).
- [ ] **Step 5: Check the docs against the code.** Run `rg -n "skill_mastery" documentation/rls-sync-contract-map.md CONTEXT.md PRD.md documentation/ROADMAP.md`. Each named function, file and test must exist (`rg -l` on each name). Expected: no dangling names.
- [ ] **Step 6: Orchestrator commits**

```bash
git add documentation/rls-sync-contract-map.md CONTEXT.md PRD.md documentation/ROADMAP.md documentation/build-log.md
git commit -m "docs(numeracy): skill_mastery contract, terms, roadmap and build log"
```

---

### Task 7: Staging apply gate (Jim), then merge

This task has no code. It must finish **before** `feat/numeracy-skill-mastery` merges to `main`. Use the `sqlite-staging-sql` skill's helper only. Never run raw `supabase` from the repository root.

- [ ] **Step 1: Precondition query (read-only).** Confirm the printed `project_ref=segygjzpujphwvrubusm`, then run:

```bash
npm run sqlite:staging:query -- "select u.id, u.first_name, u.last_name, spa.assigned_at from public.staff_programme_assignments spa join public.programmes p on p.id = spa.programme_id join public.users u on u.id = spa.user_id where p.code = 'numeracy' and spa.ended_at is null order by u.last_name;"
```

Show Jim the rows. Expected: no field EA, only test accounts he names. Stop if there is any doubt.
- [ ] **Step 2: Pending list and dry run.** Run `npm run sqlite:staging:migrations` and `npm run sqlite:staging:dry-run`. Expected: the pending set is exactly `20261101120000_skill_mastery_current_state.sql`, plus any migration Jim has already approved. Stop and ask if anything else is pending, including the EGMA branch's `20261031120000_*`.
- [ ] **Step 3: STOP: Jim's explicit yes.** Then run `npm run sqlite:staging:push`.
- [ ] **Step 4: Verify (read-only).** Run `npm run sqlite:staging:query -- "select private.history_pull_enabled('skill_mastery', gen_random_uuid()), (select count(*) from public.skill_mastery), has_function_privilege('anon', 'public.set_skill_mastery(uuid,uuid,text,boolean,timestamptz)', 'EXECUTE');"`. Expected: `t | 0 | f`. Then run `npm run sqlite:staging:advisors`. Expected: no new warning that names a `skill_mastery` object.
- [ ] **Step 5: Record and merge.** Record the gate in `documentation/build-log.md` and the contract map header ("applied to `masi-app-sqlite` <date>"). The orchestrator commits:

```bash
git add documentation/build-log.md documentation/rls-sync-contract-map.md
git commit -m "docs(numeracy): skill_mastery applied to masi-app-sqlite"
```

Then open the PR. Use `Refs`, not `Closes`, for any issue that waits on a device check.
