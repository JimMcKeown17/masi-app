# Assessment Results — Plan 2: Mastery Confirmations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A stored letter confirmation becomes one current record per child, letter and language
code. Any current deliverer can correct it, the most recently *made* correction wins (D1), and
the phone shows the winning record as soon as the server answers.

**Architecture:**
- **Server.** One migration re-keys `letter_mastery` in place, adds the server-only receipts
  table `letter_mastery_corrections`, and narrows SELECT to "last writer or current deliverer".
  It also revokes direct writes and adds `set_letter_mastery`, the only EA write path. The
  function fixes each correction's effective time once, in its receipt, then applies it only if
  `(effective_at, correction_id)` is newer.
- **Phone storage and writes.** A local migration rebuilds `letter_mastery` under the same
  identity: codes, `uuidv5(child, letter, language)` ids, and two server-ordering columns.
  `masteryRepository.setLetterMastery` is the only writer. It mints a new correction id per
  change and keeps one outbox row per record. A save with an older tap time never replaces a
  newer correction this phone still owes the server. It keeps that newer one (Task 3).
- **Phone sync.** The engine sends that row as one RPC call. One SQLite transaction then writes
  the returned winner back, or deletes the row on `acknowledged`, or moves only the ordering
  columns when a newer local change is queued.
- **Readers** read with no `user_id` or programme filter and never show a refused correction.
  Both tracker surfaces re-read after a sync pass that sent mastery corrections (Task 6).

**Tech Stack:**
- Expo / React Native, JavaScript;
- SQLite (expo-sqlite; better-sqlite3 in tests);
- Supabase Postgres 17 (plpgsql, `uuid-ossp`) through PostgREST / supabase-js;
- Jest 29.

**Spec:** `docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md` ("AR").
This plan implements AR §14's Plan 2 row: §10.1–10.3, the §13 rollout, and AR §15's
`set_letter_mastery` cases plus its mastery real-SQLite cases. It also implements asks 1 and 2 of
`docs/superpowers/specs/2026-10-20-lesson-plan-design.md` §7.6. Read that spec's §7.2 (tap time)
and §7.5 (pending-change shape) with it. Assessment history and the mastery pull (§11) are Plan 3.

**Build path:** Codex (gpt-5.6-sol) builds each task; Claude reviews the diff and runs the tests (AGENTS.md). Codex usually cannot run git commit in its sandbox, so the orchestrator runs the commit steps.

**Refreshed:** 2026-10-20 against `origin/main` `f27b347` (#90). Line numbers cite that tree.
AF, C1 and B2 may move them, so locate edits by content when they differ.

**Codex round 1:** folded in 2026-10-20 (`set_letter_mastery` gets `#variable_conflict use_column`
and named conflict targets; an older save keeps this phone's newer unsent correction; the
session-form tracker sheet re-reads after a mastery sync pass, as the panel does, without a
spinner flash).

## Global Constraints

**Order and coexistence**
- **AF lands first** (`docs/superpowers/plans/2026-10-20-lesson-plan-af-afrikaans.md`).
  - This plan consumes AF's `af` registry entry and its pending tracker change
    `{ mastered: boolean, languageCode: string, madeAt: string }`.
  - It also uses AF's `assertTrackerChanges` and its `persistLiteracySession` without
    `trackerLanguageCode`.
  - Task 0 checks this, and the plan does not start without it.
- **Local schema version.** The new migration, `letter_mastery_current_state`, takes the **next
  free version at build time** (N: 16, 17 or 18, depending on C1's `lesson_drafts` and B2's
  `sessions_group_history_reference`).
  - Tests find it by name and compare against `CURRENT_SCHEMA_VERSION`, never a literal.
  - If the literal `user_version: 15` pins are still present, make C1 Task 1 Step 4's
    byte-identical edits. They merge cleanly with C1 and B2.
- **Server migration** `supabase/migrations/20261021160000_letter_mastery_current_state.sql`
  **(plan call)**.
  - It sorts after `20261021120000` (newest on main) and B2's `20261021140000`.
  - If a later file exists at build time, take a timestamp after it.
- **Build log.** Parallel branches append to the same registers. Union-resolve in commit order.

**Commands**
- Prefix every jest, tsc and harness command with
  `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH"`.
- Real-SQLite suites are added to `jest.integration.config.js` `testMatch` and also run with
  `npm run test:integration -- <file>`.
- Assert rejections with `try/catch` or `rejects.toMatchObject`, never `rejects.toThrow`.
- The disposable PostgreSQL harnesses run on PG17 at port **55432**, and **the controller runs
  them**. The Codex sandbox cannot reach TCP Postgres. Every `verify:*:postgres` script in
  `package.json` reruns, not only the new one.

**Backend and approvals**
- **Backend:** `masi-app-sqlite` (`segygjzpujphwvrubusm`) only. Never touch the legacy
  `jcqrlwetutnpuchjoyyd`.
- Never run raw `supabase` from the repo root, and never source `.env.local`. Use the isolated
  `sqlite:staging:*` helper (skill `sqlite-staging-sql`), and confirm `project_ref` before every
  write.
- Each rollout step needs Jim's yes at the time:
  - the hosted read-only preflight that needs credentials;
  - the practice-data wipe;
  - the hosted migration;
  - staging fixture writes;
  - EAS builds.

  The controller does these, never the implementer.

**Values copied from AR (verbatim where quoted)**
- **Write function signature** (AR §10.2):
  - `public.set_letter_mastery(p_correction_id uuid, p_child_id uuid, p_letter text, p_language text, p_confirmed boolean, p_changed_at timestamptz)`
  - `returns table (outcome text, confirmed boolean, changed_at timestamptz, correction_id uuid, changed_by uuid)`
  - outcome is `'applied' | 'superseded' | 'acknowledged'`, all three success.
- **Record identity:** `id = uuidv5(child_id, letter, language)`, unique on
  `(child_id, letter, language)`. The phone computes it as
  `deterministicDomainId('letter_mastery', childId, letter, language)` with namespace
  `09dcf4b2-6c53-4c46-917f-33bc7f2df4d2`. The server must produce the identical uuid.
- **Fields:**
  - `letter` is lowercase, one letter;
  - `language` is a two-letter code (`^[a-z]{2}$`): `en`, `xh`, `zu`, and `af` from AF;
  - `source`, `mastered_at`, `deleted_at` and `user_id` go;
  - un-confirming stores `confirmed = false`.
- **Receipt.** A correction id names one immutable payload of six fields: caller, child, letter,
  language, `confirmed` and `requested_at`. A later call must match all six, otherwise `MA001`.
  `effective_at = least(p_changed_at, now())` is fixed at first arrival, and replays use the
  stored receipt only.
- **Apply rule:**
  `where (effective_at, correction_id) > (letter_mastery.changed_at, letter_mastery.correction_id)`.
- **Authority and errors:**
  - a new correction needs an active `child_ea_assignments` row for the caller, else `42501`;
  - a replay skips that check;
  - `28000` means no `auth.uid()`; `22023` means a malformed argument.
- **Readable** (AR §10.3): `changed_by = auth.uid()`, or an active `child_ea_assignments` row
  for the child. There is no year bound. A record the caller may not read is returned as
  `acknowledged` with no record.
- **Phone acknowledgement** (AR §10.2):
  - If the local `correction_id` is still the one sent, `applied`/`superseded` writes the
    returned record, sets `server_changed_at`/`server_correction_id` and marks it `synced`;
    `acknowledged` deletes the local row.
  - Otherwise only the two server ordering columns change, and the local values and outbox row
    stay.
- **Phone writes and reads:**
  - `setLetterMastery({ childId, letter, language, confirmed })` stamps `changed_at = now`, a new
    `correction_id` and `changed_by`.
  - Lesson-plan ask 1: an optional `changedAt` (the tap time) replaces `now`, and is never later
    than now on the phone.
  - **(plan call, deviates from AR §10.2 "On the phone", Codex round 1).** AR has every local
    change replace the record's outbox slot. With ask 1's tap time, that lets an older save
    replace a newer correction this phone has not uploaded yet. For example, Monday's draft mark
    saved on Wednesday would replace Tuesday's queued un-confirm, and the server would never see
    Tuesday's correction. So `setLetterMastery` checks, in the same SQLite transaction. It keeps
    the local row and its slot unchanged, and returns that retained record, when both hold:
    - the row has a correction still owed to the server (its outbox row is `pending`, `failed`
      or `in_flight`);
    - that correction's `changed_at` is later than the incoming one.

    Otherwise it replaces both, as AR says. Details are in Task 3, step 4.
  - `getLetterMastery` has no `user_id` and no programme filter and excludes `terminal` rows.
- **Language re-key map** (AR §10.1 plus ask 2):
  - `English` → `en`, `isiXhosa` → `xh`, `Afrikaans` → `af`;
  - **(plan call)** also `isiZulu` → `zu`;
  - matched trimmed and case-insensitively, with `xhosa` and `zulu` accepted as for
    `languageCodeForHomeLanguage`;
  - an existing two-letter lowercase code passes through;
  - anything else is dropped.

  `letter_mastery.language` has been free text with no CHECK in both databases since
  `20260521115412` / SQLite v1. Its writers stored `LETTER_SETS[…].language` before #90,
  `LANGUAGE_LABELS[code]` after it, and `Afrikaans` after AF; test fixtures wrote `en`. The new
  CHECKs and the RPC's `22023` enforce codes from now on.
- **Outbox (plan call).** One slot per record: `letter_mastery:<id>:update`, with payload
  `{ id, child_id, letter, language, confirmed, changed_at, correction_id, changed_by, programme_id }`.
  Every local change replaces it, except an older save that a newer still-owed correction keeps
  out (above). `letter_mastery` is not row-versioned and never batched.
- **Rollout** (AR §13), in order, each with Jim's yes:
  1. test phones sync completely;
  2. practice mastery on `masi-app-sqlite` is wiped, with counts recorded first;
  3. the migration is applied through the isolated helper;
  4. the new build is installed.

**Out of scope (Plan 3)**
- Every page RPC and pull, including `get_letter_mastery_page`.
- The mastery merge (AR §11.3), including the terminal-restore and stale-page cases that AR §15
  lists next to the `set_letter_mastery` cases.
- Completeness and lesson-plan asks 3 and 5.
- **(plan call)** Ask 4, C23's current-year bound on letter evidence. It belongs with Plan 3's
  academic-year predicate and assessment pull, and is not built here.

**Guards that stay green**
- `__tests__/productionBindingStatic.test.js`: production code takes repositories from the handle.
  Named non-`*Repository` exports from repository modules are allowed.
- `__tests__/moduleStateAllowlist.test.js`: no new module-level `let`, `var`, `Set` or `Map` in
  `src/services`, `src/db` or `src/session`.
- `__tests__/syncContractCompleteness.test.js` and `__tests__/syncContractServerSchema.test.js`.
- `__tests__/designSystemGuard.test.js`.

**Git**
- Never `git stash`.
- The orchestrator stages each task's Files and commits with the attribution its session requires.

## Checkpoints

- **Task 1** (server) ends green on its own: the jest static pins plus every PostgreSQL harness.
- **Tasks 2–6 are one local cutover.**
  - They share **one full-suite checkpoint at the end of Task 6**: `npx jest`,
    `npm run test:integration`, `npm run test:types`.
  - Task 2's schema breaks the old mastery repository methods and their callers until Tasks 3–6
    replace them. Each task still ends with its own named suites green.
  - No build is made before Task 7.

## Review Focus

1. **A letter is tapped again while its previous correction is in flight** (toggle on, the sync
   starts, toggle off before the reply). The reply must not overwrite the newer value or mark it
   synced. Only the two server ordering columns move, and the newer correction is the next call.
   Test: Task 4, `a newer change made while the call is in flight survives the acknowledgement`.
2. **A phone clock that is wrong.** It may be an hour fast, or set back between the tap and the
   save. The phone never sends a time later than its own now. The server clamps once, and a retry
   keeps that first effective time, so the fast phone cannot undo a newer correction. Tests:
   Task 3, `changedAt is the tap time, never later than now`; Task 1, the fast-clock lost-reply
   sequence.
3. **A child is handed to another EA while this EA's correction is queued.**
   - If it never reached the server, the result is `42501` → terminal with the authenticated
     marker. It never shows as mastery and is visible in needs attention.
   - If it committed and only the reply was lost, the replay returns `acknowledged` and the local
     row is deleted.

   Tests: Task 4, `a refused correction is terminal and never shows as mastery` and
   `acknowledged deletes the local row`; Task 1, the handover replay case.
4. **A test phone upgraded with old-shape mastery.** The rows may hold labels (including
   `Afrikaans`), two EAs' rows for one letter, an uppercase letter, an unknown label, an unsynced
   latest row, and queued old-shape outbox rows.
   - Expected: one row per key under its uuidv5 id, codes only, unknown or unsynced keys dropped,
     and no old outbox row left.
   - Sync then sends nothing stale: no `MISSING_OUTBOX_PAYLOAD`, unknown-op or terminal rows.

   Test: Task 2.
5. **An EA watches a tracker while a sync supersedes or refuses their tap.** This covers both
   surfaces: Child Results → Letter tracker (the panel) and the session form's tracker sheet.
   - After that pass, each surface shows the winner, or drops a refused confirmation, while it
     stays open.
   - The sheet keeps the EA's unsaved marks.
   - Neither surface flashes its loading state.

   Tests: Task 6, `the panel re-reads after a sync pass that touched letter_mastery` and
   `an open sheet re-reads its baseline after superseded and refused corrections and keeps unsaved marks`.
   Device: Task 7 G1 (panel, Android) and G1r (sheet, iOS).
6. **An older save arrives after a newer unsent correction for the same letter.** For example,
   Tuesday's un-confirm is queued offline, then Monday's draft mark is saved on Wednesday.
   - The phone keeps Tuesday's correction queued, unchanged, and that is what uploads.
   - A `terminal` slot is not owed, so a new save replaces it.
   - A tap made now always replaces, even when the queued time is ahead of the phone's clock.

   Tests: Task 3, the `an older save keeps a newer correction that is still owed` table; Task 4,
   `an older save never replaces this phone's newer unsent correction, and the newer one uploads`;
   Task 6, the persistence case.
7. **`set_letter_mastery` under the default `plpgsql.variable_conflict = error`.** The
   `returns table` names are plpgsql variables, so an unqualified `on conflict (correction_id)`
   raises `42702` on every new correction. The fix has two parts:
   - the body starts with `#variable_conflict use_column`;
   - both conflict targets name their constraint.

   Tests: Task 1, `variable-conflict-default`, `newer-applies` and `same-id-concurrent` on PG17;
   Task 2's static pins.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20261021160000_letter_mastery_current_state.sql` (create) | Re-key, receipts, id and delivery helpers, SELECT narrowing, revokes, `set_letter_mastery` | 1 |
| `scripts/letter-mastery-postgres-harness.cjs` (create) | Disposable-PG proof of the migration and the RPC | 1 |
| `scripts/assessment-results-postgres-harness.cjs`, `scripts/upload-contract-postgres-harness.cjs` (modify) | Their `letter_mastery` fixtures move to the new shape | 1 |
| `src/db/domainId.js` (create) | Leaf module: the domain-id namespace, `deterministicDomainId`, `letterMasteryDomainId` (importable from `migrations.js` without a cycle) | 2 |
| `src/db/migrations.js` (modify) | Optional per-migration `transform` step; migration `letter_mastery_current_state` | 2 |
| `src/db/repositories/masteryRepository.js` (rewrite) | `setLetterMastery`, `getLetterMastery`, `applyCorrectionAcknowledgement` | 3 |
| `src/services/letterMasteryCorrection.js` (create) | Outbox payload → RPC args; RPC result parsing | 4 |
| `src/services/offlineSync.js`, `src/services/syncServerColumns.js` (modify) | One RPC per correction; acknowledgement in the finalize transaction | 4 |
| `src/utils/masteryState.js`, `src/utils/dashboardStats.js`, `src/screens/insights/LetterMasteryRankingScreen.js`, `src/db/debugDump.js` (modify) | Readers on codes and `confirmed`; support export shows mastery rows | 5 |
| `src/services/literacySessionPersistence.js`, `src/components/assessment/LetterMasteryPanel.js` (modify) | The two write surfaces | 6 |
| `src/hooks/useLetterMasterySyncRefresh.js` (create), `src/components/session/LetterTrackerBottomSheet.js` (modify) | One trigger that makes a visible tracker re-read after a sync pass that sent mastery corrections; the sheet's baseline refresh | 6 |

## Tests that encode the old identity, and what happens to each

| Test | Encodes | Disposition |
|---|---|---|
| `__tests__/letterMasterySync.test.js` (whole) | per-EA deterministic push id, insert coalescing, 23505 legacy collision | **Delete** (Task 4); replaced by `letterMasteryCorrectionSync.test.js` |
| `__tests__/masteryRepository.test.js` (whole) | per-EA/programme key, soft-delete re-teach, programme-scoped reads, `user_id` required | **Rewrite** (Task 3) |
| `__tests__/offlineSyncOutbox.test.js` `batches letter_mastery upserts into a single call` (:1783–1845) | batching | **Delete** (Task 4); "two letters are two calls" replaces it |
| `__tests__/offlineSyncOutbox.test.js` `keeps foreign-key and RLS failures visible as terminal failed items` (:2382–2445) | old-shape mastery row, upsert 42501 | **Adapt** (Task 4): new-shape row and slot, `set_letter_mastery` 42501; assertions unchanged |
| `__tests__/offlineSyncUpdateById.test.js` `a letter_mastery update targets the re-derived deterministic id…` (:131–159) | id re-derivation | **Delete** (Task 4) |
| `__tests__/offlineSyncUpdateById.test.js` `a readable letter_mastery row stays retriable while the child assignment is pending` (:250–270) | UPDATE-by-id evidence | **Delete**; the pending-assignment retry moves to the new sync suite (Task 4) |
| `__tests__/offlineSyncLifecycleEdits.test.js` `mastery deletion and reactivation still carry deleted_at…` (:96–118) | archive/reactivate branches | **Delete** (Task 4); the coalescing test replaces it |
| `__tests__/rowVersionSend.test.js:424` | mastery through the generic upsert | Drop `'letter_mastery'` from the list (Task 4); the new suite asserts the RPC args carry no `row_version` |
| `__tests__/sqliteFoundation.test.js` :252, :268–392 (mastery block), :142, ledger (:632–648), fakes (:86, :494) | old columns and key, version tripwire, runner fakes | **Update** (Task 2); debug-dump object (:621–655) gains `letterMastery: []` (Task 5) |
| `__tests__/hotPathIndexes.test.js:11, :59–64` | `idx_letter_mastery_user_child` | New index and query (Task 2) |
| `__tests__/migrations.assessmentResults.test.js:80–81, :96, :107` | v15 keeps the old mastery row byte for byte | **Remove** the mastery seed and assertion (Task 2); pins :108 and :115–117 as C1 |
| `__tests__/completionPathBudget.test.js:102–158` | mastery read, archive/insert/update ops | **Rewrite** (Task 6) |
| `__tests__/foreignKeyEnforcement.test.js:61–108` | tracker changes and mastery rows | Assert codes (Task 6) |
| `__tests__/literacySessionPersistence.test.js` (mastery cases :140–389, plus AF's additions) | labels, reactivation, programme-scoped reuse, save-time stamp | **Rewrite** the mastery assertions (Task 6); `:323–389` is replaced by the C23 case |
| `__tests__/LiteracySessionForm.submit.test.js:281–322` and AF's mixed-language test | Plan 1 label, `saveLetterMasteryRecord` seeding | Codes; seed with `setLetterMastery` (Task 6) |
| `__tests__/masteryState.test.js` (:24–26, :54–60, :73–104, AF's Afrikaans case) | labels, `_deleted`, `saveLetterMasteryRecord` | **Update** (Task 5) |
| `__tests__/LetterMasteryPanel.test.js`, `__tests__/LetterTrackerScreen.plan5.test.js:37–90` | save/update/reactivate mocks | **Rewrite** to `setLetterMastery` (Task 6) |
| `__tests__/LetterTrackerBottomSheet.test.js:36`, `.plan5.test.js:52–66`, `__tests__/dashboardStats.letterMastery.test.js`, `__tests__/LetterMasteryRankingScreen.test.js:82–99` | label rows with `_deleted` | Codes and `confirmed` (Task 5) |
| `scripts/upload-contract-postgres-harness.cjs:78–79, :150–155` | old-shape fixture; acknowledged UPDATE by id | New-shape fixture; the UPDATE is now refused (Task 1) |
| `scripts/assessment-results-postgres-harness.cjs:431–446` | old-shape direct insert for the trigger stamp | New-shape row (Task 1) |
| `__tests__/sqlitePlan1Migrations.test.js`, `__tests__/uploadContractRowVersionMigration.test.js`, `__tests__/letterMastery.storedItems.test.js` | historical migration files by name; assessment evidence | **Unchanged** |

---

### Task 0: Preconditions (orchestrator, no commit)

- [ ] **Step 1: AF is merged.** On `origin/main`, each of these must hold. If any fails, stop.
  - `grep -n "case 'afrikaans'" src/utils/assessmentRegistry.js` matches.
  - `grep -n "assertTrackerChanges" src/utils/masteryState.js` matches an export.
  - `grep -n "trackerLanguageCode" src/services/literacySessionPersistence.js` matches nothing.
- [ ] **Step 2: Worktree.** Run
  `git worktree add -b feat/assessment-results-plan-2 .claude/worktrees/assessment-results-plan-2 origin/main`.
  Bring in this plan (merge or cherry-pick the design branch commit), then run `npm ci`.
- [ ] **Step 3: Baseline.** Run `npx jest`, `npm run test:integration` and `npm run test:types`.
  Record the counts. Expected: all green.
- [ ] **Step 4: Numbers.**
  - Record N = the last `MIGRATIONS` version + 1.
  - Record the newest file in `supabase/migrations/`. The server file must sort after it.
- [ ] **Step 5: Extension on the disposable server** (controller). Run
  `psql postgresql://postgres:postgres@127.0.0.1:55432/postgres -Atc "select name from pg_available_extensions where name = 'uuid-ossp'"`.
  Expected: `uuid-ossp`. CI's `postgres:17` image ships contrib.
- [ ] **Step 6: Hosted read-only preflight (Jim's yes; helper; confirm
  `project_ref=segygjzpujphwvrubusm`).**
  - `select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'uuid-ossp';`
    must return `extensions`. If it does not, stop and ask Jim.
  - `select language, count(*) from public.letter_mastery group by 1 order by 1;` answers ask 2's
    "what else may it hold". Record it.
  - Read the migration ledger's newest version.

  Record all three in the build log.

---

### Task 1: Server — one record per key, receipts, and `set_letter_mastery`

**Files:**
- Create: `supabase/migrations/20261021160000_letter_mastery_current_state.sql`
- Create: `scripts/letter-mastery-postgres-harness.cjs`
- Modify: `scripts/assessment-results-postgres-harness.cjs`
  - `:431-446`: the `letter_mastery` row in the trigger-stamp loop becomes the new shape:
    `{ id, child_id: CHILD, letter: 'a', language: 'en', confirmed: true, changed_at: STARTED_AT, correction_id: randomUUID(), changed_by: EA_A, programme_id, created_at: STARTED_AT, updated_at: OLD_UPDATED_AT }`.
  - `overlappingCalls` (`:478-517`) gains an optional fifth argument
    `{ secondCall = call, firstActor = EA_A, secondActor = EA_A }`. The existing calls are
    unchanged.
- Modify: `scripts/upload-contract-postgres-harness.cjs`
  - `:78-79`: the fixture inserts a new-shape row
    `(id, child_id, letter, language, confirmed, changed_at, correction_id, changed_by, programme_id)`,
    with `'a', 'xh', false`.
  - `:150-155`: remove the `letter_mastery` entry from `CASES`. After `runCases`, assert that
    `asActor(ASSIGNED_EA, updateByIdSql('letter_mastery', 'confirmed = true', MASTERY))` raises
    `42501`.
- Modify: `package.json`: add
  `"verify:letter-mastery:postgres": "node scripts/letter-mastery-postgres-harness.cjs"` after
  `verify:ea-access:postgres` (`:26`).
- Modify: `.github/workflows/tests.yml`: add a "Letter mastery PostgreSQL harness" step after the
  EA access step (`:69-75`), with the same env block and `PGTZ: UTC`.
- Docs: `documentation/rls-sync-contract-map.md` and `documentation/build-log.md`.

**Interfaces:**
- Produces (server; Task 4 calls the RPC through PostgREST):
  - `public.set_letter_mastery(...)` as in Global Constraints. It is `volatile security definer`,
    `set search_path = ''`. EXECUTE is revoked from `public, anon, authenticated, authenticator, service_role`
    and granted to `authenticated` only.
  - `public.letter_mastery`:
    - columns `id uuid pk, child_id, letter, language, confirmed boolean not null, changed_at timestamptz not null, correction_id uuid not null, changed_by uuid not null, programme_id uuid null, created_at, updated_at`;
    - unique **constraint** `letter_mastery_child_letter_language_key`, `unique (child_id, letter, language)`,
      which also creates its index. It must be a constraint, not a bare `create unique index`,
      so that `on conflict on constraint` can name it (Codex round 1);
    - index `letter_mastery_changed_by_idx`;
    - `letter_mastery_language_code_chk` (`language ~ '^[a-z]{2}$'`);
    - `letter_mastery_letter_chk` (`char_length(letter) = 1 and letter = pg_catalog.lower(letter)`);
    - `letter_mastery_changed_by_fkey → auth.users(id) on delete restrict`;
    - the Plan 1 `letter_mastery_set_updated_at` trigger is kept.
  - `public.letter_mastery_corrections`:
    - `correction_id uuid not null, child_id → children on delete cascade, letter, language, confirmed, requested_at, effective_at, changed_by → auth.users on delete restrict, programme_id → programmes null, received_at default now()`;
    - primary key named in the DDL, `constraint letter_mastery_corrections_pkey primary key (correction_id)`,
      because the receipt insert names it (Codex round 1);
    - index `(child_id, letter, language)`;
    - RLS enabled with **no policies**;
    - all privileges revoked from `anon, authenticated`; `service_role` has
      select/insert/update/delete.
  - `private.letter_mastery_id(p_child_id uuid, p_letter text, p_language text) returns uuid`:
    - immutable;
    - `extensions.uuid_generate_v5('09dcf4b2-6c53-4c46-917f-33bc7f2df4d2'::uuid, pg_catalog.concat_ws(pg_catalog.chr(31), 'letter_mastery', p_child_id::text, p_letter, p_language))`;
    - not executable by `anon` or `authenticated`.
  - `private.current_user_delivers_to_child(p_child_id uuid) returns boolean`:
    - stable security definer;
    - true when an active `child_ea_assignments` row exists for `auth.uid()`;
    - EXECUTE granted to `authenticated`.
  - SELECT policy `letter_mastery_select_writer_or_deliverer`:
    `using (changed_by = (select auth.uid()) or (select private.current_user_delivers_to_child(child_id)))`.
    It replaces the four old policies.

**Migration contents, in this order**
1. Session-level `SET lock_timeout = '10s'; SET statement_timeout = '60s';`.
2. `create schema if not exists extensions; create extension if not exists "uuid-ossp" with schema extensions;`
3. The two `private` helpers.
4. **Top level, so `syncContractServerSchema`'s parser sees them:**
   `alter table public.letter_mastery add column if not exists confirmed boolean, add column if not exists changed_at timestamptz, add column if not exists correction_id uuid, add column if not exists changed_by uuid;`
5. **The transform, inside `do $$ … $$` guarded by "column `public.letter_mastery.user_id`
   exists"**, so a re-run is a no-op:
   1. Drop the policies `letter_mastery_select_assigned_child_history` and
      `letter_mastery_{insert,update,delete}_active_assignment`. They reference `user_id`, and a
      dependent policy blocks the column drop.
   2. Drop the indexes `idx_letter_mastery_unique_active` and `idx_letter_mastery_child_programme`.
      Mapping can make two old rows collide on the old key.
   3. **One statement** maps and ranks the rows. It must be one statement because the
      INSERT/UPDATE trigger restamps `updated_at` on every row it updates, and the ranking must
      read the old values.

      ```sql
      with mapped as (
        select id, user_id, updated_at, deleted_at, pg_catalog.lower(letter) as l, <code>(language) as code,
               row_number() over (partition by child_id, pg_catalog.lower(letter), <code>(language)
                                  order by updated_at desc, id desc) as rn
        from public.letter_mastery)
      update public.letter_mastery lm
         set letter = m.l, language = m.code, confirmed = (m.deleted_at is null),
             changed_at = m.updated_at, correction_id = m.id, changed_by = m.user_id
        from mapped m
       where lm.id = m.id and m.rn = 1 and m.code is not null and pg_catalog.char_length(m.l) = 1;
      ```

      `<code>(x)` is a `case pg_catalog.lower(pg_catalog.btrim(x))` over the re-key map in Global
      Constraints. It returns `null` for anything else.
   4. `delete from public.letter_mastery where correction_id is null;` removes the losers, the
      unmappable rows and multi-character letters.
   5. `update public.letter_mastery set id = private.letter_mastery_id(child_id, letter, language);`
   6. Drop the columns `user_id`, `source`, `mastered_at` and `deleted_at`.
6. Constraints and indexes from Interfaces:
   - each new constraint in a `pg_constraint` existence check (Plan 1's pattern). This includes
     `alter table public.letter_mastery add constraint letter_mastery_child_letter_language_key unique (child_id, letter, language);`;
   - `set not null` on the four new columns;
   - `alter column programme_id drop not null` **(plan call: programme is context; the caller may
     have no active programme)**.
7. `public.letter_mastery_corrections`, its index, RLS, revokes and service-role grants. It is
   `create table if not exists`, and its column list ends with
   `constraint letter_mastery_corrections_pkey primary key (correction_id)`.
8. On `letter_mastery`: `revoke insert, update, delete … from anon, authenticated`, then the new
   SELECT policy (`drop policy if exists` first).
9. `set_letter_mastery`. **Name resolution (Codex round 1).** The `returns table` names
   `confirmed`, `changed_at`, `correction_id` and `changed_by` are plpgsql variables that collide
   with column names.
   - Under the default `plpgsql.variable_conflict = error`, every unqualified collision raises
     `42702`.
   - An `on conflict (correction_id)` target is one such collision. Qualifying the other
     references does not fix it, because a conflict target cannot be qualified.

   All three rules below are required:
   - **The body text starts with `#variable_conflict use_column`**, on the line after `as $$` and
     before `declare`, as `supabase/migrations/20260925120000_session_history_family_delta.sql:165-167`
     does. The body never reads an output variable inside SQL, so the column is always the
     intended meaning.
   - **Every conflict target names its constraint**, as `20261017120000_mobile_support_incidents.sql:61`
     does:
     - `on conflict on constraint letter_mastery_corrections_pkey do nothing` for the receipt;
     - `on conflict on constraint letter_mastery_child_letter_language_key do update` for the
       record.

     **(plan call, deviates from AR §10.2's text `on conflict (correction_id) do nothing`; the
     semantics are the same.)**
   - **Every column in an expression is qualified:**
     - `lm.` for the record. The `insert … as lm` alias hides the table name, so write `lm.x`,
       never `letter_mastery.x`.
     - `excluded.` on the right-hand side of `set`.
     - a table alias in every `select`.

     `set` targets and insert column lists are bare column names. PostgreSQL does not allow them
     to be qualified, and plpgsql does not substitute variables there.

   Locals are `v_`-prefixed (the stored receipt is the record variable `v_receipt`) and
   parameters are `p_`-prefixed, so neither collides with a column. The body runs in this order:
   1. `auth.uid()` must be present, else `28000`.
   2. Validate, else `22023`:
      - no argument is null;
      - `p_letter ~ '^[[:alpha:]]$' and p_letter = pg_catalog.lower(p_letter)`;
      - `p_language ~ '^[a-z]{2}$'`.
   3. If no receipt has `p_correction_id`:
      - `private.current_user_delivers_to_child(p_child_id)` must hold, else `42501`;
      - then
        `insert into public.letter_mastery_corrections (correction_id, child_id, letter, language, confirmed, requested_at, effective_at, changed_by, programme_id, received_at) values (p_correction_id, …) on conflict on constraint letter_mastery_corrections_pkey do nothing`,
        with `requested_at = p_changed_at`, `effective_at = least(p_changed_at, now())`,
        `changed_by = auth.uid()` and `received_at = now()`;
      - `programme_id` = the caller's active `staff_programme_assignments.programme_id`, or null.
        **Plan call:** the signature has no programme. The partial unique index
        `idx_staff_programme_assignments_active_user_unique` guarantees at most one row.
   4. Read the stored receipt into `v_receipt`
      (`select r.* into v_receipt from public.letter_mastery_corrections r where r.correction_id = p_correction_id`).
      Compare the six fields, else `MA001`. Use its `effective_at`.
   5. Upsert the record from the receipt:

      ```sql
      insert into public.letter_mastery as lm (id, child_id, letter, language, confirmed, changed_at, correction_id, changed_by, programme_id)
      values (private.letter_mastery_id(v_receipt.child_id, v_receipt.letter, v_receipt.language),
              v_receipt.child_id, v_receipt.letter, v_receipt.language, v_receipt.confirmed,
              v_receipt.effective_at, v_receipt.correction_id, v_receipt.changed_by, v_receipt.programme_id)
      on conflict on constraint letter_mastery_child_letter_language_key do update
        set confirmed = excluded.confirmed, changed_at = excluded.changed_at, correction_id = excluded.correction_id,
            changed_by = excluded.changed_by, programme_id = excluded.programme_id
        where (excluded.changed_at, excluded.correction_id) > (lm.changed_at, lm.correction_id);
      ```

   6. Read the record.
      - If `record.changed_by = auth.uid()` or the caller currently delivers to the child, return
        one row: `outcome = 'applied'` when `record.correction_id = p_correction_id`, else
        `'superseded'`, with the record's four fields.
      - Otherwise return `('acknowledged', null, null, null, null)`.
10. `notify pgrst, 'reload schema';`, then `RESET statement_timeout; RESET lock_timeout;`.

**Harness.**
- `scripts/letter-mastery-postgres-harness.cjs` imports `MIGRATIONS_DIR`,
  `assertDisposableAdminTarget`, `bootstrapSql`, `buildDatabaseUrl`, `buildPsqlEnv`,
  `expectSqlState` and `runPsql` from `history-authorization-postgres-harness.cjs`. It imports
  `overlappingCalls` from `assessment-results-postgres-harness.cjs`.
- Its `main()` follows that harness's `main()` (`:533-566`): Supabase-style default privileges,
  every migration replayed, a fixture, then the cases.
- It uses two databases, `${HISTORY_RLS_DATABASE_NAME}_letter_mastery` and `…_letter_mastery_rekey`.
  Both are dropped in `finally`.
- Fixture actors: `EA_A` (literacy staff assignment, delivers to `CHILD` and `OTHER_CHILD`);
  `EA_B` (numeracy staff assignment, delivers to `CHILD`); `FORMER` (an ended assignment to
  `CHILD`); `CLASS_ONLY` (an active class assignment, with `CHILD` an active member of that class
  and no direct assignment); `NO_PROGRAMME` (delivers to `CHILD`, no staff assignment);
  `UNRELATED`.
- Times are fixed past instants `MON = '2026-10-19T08:00:00Z'`, `TUE = '2026-10-20T08:00:00Z'`.
  Steps that need distinct `now()` values run as separate committed `asActor(…, { commit: true })`
  calls on fresh children. The new harness defines its own `childSetup(childId, actors)` helper,
  shaped like Plan 1's (`assessment-results-postgres-harness.cjs:126-131`), which it does not
  export.
- `overlappingCalls` runs `SELECT ${call}` and compares the printed values. Pass each call as
  `(select outcome from public.set_letter_mastery(…))`, so the outputs are outcome strings.
- The node cross-check uses `const { v5 } = await import('uuid')`. `uuid@13` is ESM-only.
- **Default name resolution (Codex round 1).** The harness never sets `plpgsql.variable_conflict`.
  `runPsql` passes `-X` (`history-authorization-postgres-harness.cjs:98-106`), so no psqlrc can
  set it either. Every case therefore runs under PG17's default `error`.
  - `newer-applies` sends a new correction through the receipt insert.
  - `same-id-concurrent` makes two overlapping same-id calls, so one of them replays.

  These are the cases that raise `42702` if either name-resolution rule in step 9 is missing.

| Case | Expected |
|---|---|
| `variable-conflict-default` (runs first) | One `runPsql` call: `do $$ begin null; end $$; select pg_catalog.current_setting('plpgsql.variable_conflict');` prints `error`. The `do` block loads plpgsql into the session. If it prints anything else, the harness fails, because the remaining cases would not prove step 9 |
| `named-conflict-targets` | `select conname, contype from pg_catalog.pg_constraint where conname in ('letter_mastery_child_letter_language_key', 'letter_mastery_corrections_pkey') order by conname` prints `letter_mastery_child_letter_language_key\|u` and `letter_mastery_corrections_pkey\|p` |
| `newer-applies` | A confirms `k` at MON → `applied`, returned `(true, MON, cA, A)`; one record whose `id = private.letter_mastery_id(CHILD,'k','xh')`; then B un-confirms at TUE → `applied`, record `changed_by = B`, `programme_id` = numeracy (C23: same record across programmes) |
| `older-superseded-returns-winner` | after B's TUE un-confirm, A confirms at MON → `superseded`, returned `(false, TUE, cB, B)`. **This is ask 1's "Monday mark saved on Wednesday loses to another EA's Tuesday correction" at the server.** Run the two calls as separate committed transactions. The record's `updated_at` still equals B's transaction time, so no update fired |
| `future-clamped` | `p_changed_at = '2099-01-01'` → the receipt's `effective_at = now()` and the record's `changed_at = now()`, both inside the same transaction |
| `fast-clock-lost-reply` | (1) A confirms `m` with `p_changed_at` = JS now + 1 h, committed. (2) B confirms then un-confirms `m` at the call's now, each committed. (3) A repeats call (1) unchanged → `superseded`, winner B's un-confirm. A's receipt `effective_at` is still (1)'s value, and there is exactly one receipt for A's id |
| `same-id-concurrent` | `overlappingCalls` with one call twice → `['applied', 'applied']`; one receipt and one `effective_at` |
| `same-key-concurrent` (ZZ-BUG-20260813-006) | `overlappingCalls` with A's MON call first and B's TUE call second (`secondActor: EA_B`) → both succeed; one record, held by B's correction |
| `non-deliverers-denied` | `FORMER`, `CLASS_ONLY` and `UNRELATED` → `42501`; no receipt stored |
| `no-programme-deliverer` | `NO_PROGRAMME` → `applied`; record and receipt `programme_id is null` |
| `replay-after-revocation` | A confirms (committed), A's assignment ended, the same call again → `applied` (A is the last writer, so it may read); the record is unchanged |
| `replay-mismatch` | A's correction id replayed with a different child, letter, language, `confirmed` or `p_changed_at`, or by B → `MA001` each |
| `replay-after-handover-and-newer-writer` | A confirms (committed), A's assignment ended, B un-confirms later (committed), A replays → `('acknowledged', null, null, null, null)` |
| `shape` | null id, `'ab'`, `'A'`, `'1'`, `'eng'`, `'EN'`, null `p_confirmed`, null `p_changed_at` → `22023`; no `request.jwt.claim.sub` → `28000` |
| `direct-writes-denied` | as A: INSERT, UPDATE and DELETE on `letter_mastery` → `42501`; SELECT and INSERT on `letter_mastery_corrections` → `42501` |
| `select-scope` | after A's committed confirm: B sees it; `CLASS_ONLY`, `FORMER` and `UNRELATED` see nothing. After A is unassigned and B writes, A sees nothing. Where A is still the last writer after unassignment, A sees it |
| `grants` | `has_function_privilege` on `public.set_letter_mastery(uuid,uuid,text,text,boolean,timestamptz)`: true for `authenticated`, false for `anon` and `public`. `private.letter_mastery_id(uuid,text,text)`: false for `authenticated` |
| `server-stamp` | an inserting call and an applying call each set `updated_at = now()` |
| `id-parity` | `private.letter_mastery_id(CHILD, 'k', 'xh')` equals `v5(['letter_mastery', CHILD, 'k', 'xh'].join('\u001f'), '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2')` |
| `rekey` (second database) | Replay the files that sort before this one. Seed old-shape rows as `postgres` under `SET LOCAL session_replication_role = replica`, which keeps the seeded `updated_at`:<br>(C1, `a`, `English`, E1, active, 10-01); (C1, `a`, `en`, E2, deleted, 10-05); (C1, `K`, `isiXhosa`, 10-02); (C1, `e`, `Afrikaans`, 10-03); (C1, `z`, `Klingon`); (C2, `b`, `' ISIXHOSA '`); (C2, `ab`, `en`).<br>Apply this file, then the rest. Expect exactly (C1,`a`,`en`, false, changed_by E2, changed_at 10-05, correction_id = E2's old id, programme = E2's), (C1,`k`,`xh`), (C1,`e`,`af`), (C2,`b`,`xh`). Every id equals the node v5 value, and the old columns are gone. Applying the file a second time succeeds and changes nothing |

- [ ] **Step 1: Write the harness** with every case above, then make the two harness edits and
  the `package.json`/CI edits.
- [ ] **Step 2 (controller): RED.** Run
  `HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres HISTORY_RLS_DATABASE_NAME=masi_history_rls_letter_mastery HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE PGTZ=UTC npm run verify:letter-mastery:postgres`.
  Expected: FAIL in an executed assertion, because `public.set_letter_mastery` does not exist. A
  guard or fixture error is not RED.
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4 (controller): GREEN.** Re-run the new harness, then **every** `verify:*:postgres`
  script against the same server. Expected: each prints its pass JSON. `upload-contract` now
  includes the refused mastery UPDATE.
- [ ] **Step 5: Run** `npx jest __tests__/syncContractServerSchema.test.js`. Expected: PASS. The
  four columns are parsed from the top-level `add column` statement.
- [ ] **Step 6: Docs.**
  - **Contract map.** Add a section "Letter mastery: one current record, the most recently made
    correction wins (Assessment Results Plan 2)" immediately before `## Row versions (upload contract)`
    (`:383`). The server half covers:
    - identity and the uuidv5 helper;
    - the receipts table and its six immutable fields;
    - `effective_at` fixed once;
    - the apply rule with its id tie-break;
    - new-correction authority (active direct assignment only, so class/group arms do not write);
    - replay before authority;
    - the three outcomes and readability;
    - SELECT `letter_mastery_select_writer_or_deliverer`, with no year bound;
    - direct DML revoked;
    - the re-key map and the hosted-apply status ("not applied").

    Task 4 appends the phone half.
  - **Build log.** A Verification Register row with the RED and GREEN results and every harness's
    pass count.
- [ ] **Step 7: Commit:** `feat(supabase): letter mastery as one current record with set_letter_mastery and receipts`.

---

### Task 2: Local schema — one record per key, codes, and the uuidv5 id

**Files:**
- Create: `src/db/domainId.js`
- Modify: `src/db/repositories/domainRepositoryUtils.js`
  - `:1, :13-18`: import and re-export `deterministicDomainId` from `../domainId`, and delete the
    local namespace constant and function.
  - `:41-55`: `letterMasteryDomainId` is re-exported from `../domainId`.
- Modify: `src/db/migrations.js`
  - in `runMigrationsNow` (`:835`), after `await txn.execAsync(migration.sql)` (`:852`), add
    `if (migration.transform) await migration.transform(txn);`;
  - append the migration after v15 (`:736-797`).
- Create: `__tests__/letterMasteryCurrentStateMigration.test.js`; add it to `jest.integration.config.js`.
- Create: `__tests__/letterMasteryIdParity.test.js`
- Modify tests:
  - `__tests__/sqliteFoundation.test.js`:
    - add `getAllAsync: jest.fn(async () => [])` to the fakes at `:86` and `:494`;
    - the tripwire `:142` becomes N;
    - add `{ version: N, name: 'letter_mastery_current_state' }` to the ledger (`:632-648`);
    - `:252` becomes `letter_mastery: ['confirmed', 'changed_at', 'correction_id', 'changed_by', 'server_changed_at', 'server_correction_id']`;
    - the mastery block of `:268-392` is rewritten: a second row for the same
      `(child_id, letter, language)` is refused, and so is a label language.
  - `__tests__/hotPathIndexes.test.js`: `:11` becomes `'idx_letter_mastery_child_key'`, and
    `:59-64` explains `select * from letter_mastery where child_id = 'c-1'`.
  - `__tests__/migrations.assessmentResults.test.js`: remove the mastery seed (`:80-81`), its
    capture (`:96`) and its assertion (`:107`). Then apply the C1 pin edits to `:108` and
    `:115-117` if they are not already present.
  - `__tests__/timeEntryLocationMigration.test.js:28`, `__tests__/rowVersionLocal.test.js:50, :137`,
    `__tests__/outboxOwnerMigration.test.js:19`: change to `CURRENT_SCHEMA_VERSION`, as C1.
- Docs: `documentation/build-log.md`.

**Interfaces:**
- Produces, in `src/db/domainId.js`. It imports only `uuid`.

  ```js
  export const MASI_DOMAIN_ID_NAMESPACE = '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2';
  export const deterministicDomainId = (...parts) => string;            // body moved unchanged
  export const letterMasteryDomainId = ({ childId, letter, language }) => string;
  // = deterministicDomainId('letter_mastery', String(childId).toLowerCase(), letter, language)
  ```

- Produces: a `MIGRATIONS` entry may carry `transform: async (txn) => void`. It runs inside the
  migration's transaction, after its SQL and before the version bump. A throw rolls back both.
- Produces the local table, after `{ version: N, name: 'letter_mastery_current_state' }`:

  ```sql
  create table letter_mastery_v2 (
    id text primary key,
    child_id text not null references children(id) on delete cascade,
    letter text not null check (length(letter) = 1 and letter = lower(letter)),
    language text not null check (language glob '[a-z][a-z]'),
    confirmed integer not null check (confirmed in (0, 1)),
    changed_at text not null,
    correction_id text not null,
    changed_by text not null,
    programme_id text,               -- context only; no FK (plan call: a winner's programme may not be on this phone)
    created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ${LOCAL_SYNC_COLUMNS},
    server_changed_at text,          -- only from an acknowledgement or (Plan 3) a pull
    server_correction_id text
  );
  ```

  The SQL then:
  1. Copies the rank-1 row per `(child_id, lower(letter), code)`, ranked by
     `updated_at desc, id desc` with a window function. It uses the same code map as the server
     (SQLite `case lower(trim(language))`). It keeps rows only when the code is non-null, the
     letter is one character, and the **winning row is `synced`**. Values are `confirmed = (deleted_at is null)`,
     `changed_at = updated_at`, `correction_id = id`, `changed_by = user_id`, `programme_id`,
     `created_at`, `updated_at`, `sync_status = 'synced'`, `server_updated_at`, and
     `server_changed_at = server_correction_id = null`.
  2. `delete from sync_outbox where table_name = 'letter_mastery';`
  3. Drops the old table and renames `letter_mastery_v2` to `letter_mastery` (the v11 rebuild
     pattern, with FKs off).
  4. `create unique index idx_letter_mastery_child_key on letter_mastery(child_id, letter, language);`

  The `transform` then rewrites each row's `id` to
  `letterMasteryDomainId({ childId, letter, language })`. SQLite has no hash function.
- **Plan calls:**
  - A key whose latest row was unsynced is cleared with its outbox rows, like Plan 1's v15 clear.
    AR §13 step 1 makes this empty on test phones, and it never leaves a row claiming `synced`
    for a change the server never accepted.
  - Old outbox payloads cannot be sent through `set_letter_mastery`, so they are deleted.

- [ ] **Step 1: Write the failing tests.**
  - `__tests__/letterMasteryCurrentStateMigration.test.js` follows the
    `timeEntryLocationMigration.test.js:5-8` pattern:
    - `const migration = () => MIGRATIONS.find((m) => m.name === 'letter_mastery_current_state');`
    - `BASE = (migration()?.version ?? CURRENT_SCHEMA_VERSION + 1) - 1`;
    - apply `MIGRATIONS.filter((m) => m.version <= BASE)`, then `PRAGMA user_version = ${BASE}`;
    - seed the row set from Review Focus 4: `(child-1, a, English, user-1, active, T1, synced)`,
      `(child-1, a, en, user-2, deleted T2 > T1, synced)`, `(child-1, K, isiXhosa, synced)`,
      `(child-1, e, Afrikaans, synced)`, `(child-1, z, Klingon, synced)`,
      `(child-1, b, English, synced, T1)` with `(child-1, b, English, user-2, pending, T3)`;
    - add outbox rows for `letter_mastery` (`insert`, `archive`, `update`) and one for `children`,
      each with `owner_user_id = 'user-1'`.

    ```js
    test('upgrading converts labels to codes, keeps the latest row per key, and drops unsynced keys and old outbox rows', async () => {
      await runMigrations(db);
      expect(migration().version).toBeGreaterThan(15);
      expect(await db.getFirstAsync('pragma user_version')).toEqual({ user_version: CURRENT_SCHEMA_VERSION });
      const id = (letter, language) => letterMasteryDomainId({ childId: 'child-1', letter, language });
      expect(await db.getAllAsync(`select id, letter, language, confirmed, changed_at, correction_id, changed_by,
          sync_status, server_changed_at, server_correction_id from letter_mastery order by letter`)).toEqual([
        { id: id('a', 'en'), letter: 'a', language: 'en', confirmed: 0, changed_at: T2, correction_id: 'old-a-user-2',
          changed_by: 'user-2', sync_status: 'synced', server_changed_at: null, server_correction_id: null },
        { id: id('e', 'af'), letter: 'e', language: 'af', confirmed: 1, changed_at: T_E, correction_id: 'old-e',
          changed_by: 'user-1', sync_status: 'synced', server_changed_at: null, server_correction_id: null },
        { id: id('k', 'xh'), letter: 'k', language: 'xh', confirmed: 1, changed_at: T_K, correction_id: 'old-k',
          changed_by: 'user-1', sync_status: 'synced', server_changed_at: null, server_correction_id: null },
      ]); // 'b' (unsynced winner) and 'z' (Klingon) are gone
      // T1 < T2 < T3 and T_E, T_K are the seeded updated_at values; 'old-…' are the seeded row ids
      expect(await db.getAllAsync("select table_name from sync_outbox")).toEqual([{ table_name: 'children' }]);
      expect(await db.getAllAsync('pragma foreign_key_check')).toEqual([]);
    });
    ```

    Also add:
    - `the rebuilt table has exactly the new columns and its natural key`: check
      `pragma table_info` names, a second row for the same key refused, `language 'English'`
      refused, letter `'ab'` refused, `confirmed 2` refused;
    - `a failing transform rolls back the whole migration`: wrap `db.runAsync` to throw on
      `update letter_mastery set id`; `runMigrations` rejects; `user_version` stays `BASE`; the
      old columns are still present;
    - `relaunching runs nothing and leaves rows untouched`.
  - `__tests__/letterMasteryIdParity.test.js`:
    - reads `supabase/migrations/*_letter_mastery_current_state.sql`;
    - expects its `uuid_generate_v5('<ns>'::uuid` literal to equal `MASI_DOMAIN_ID_NAMESPACE`;
    - expects the name expression to match
      `/concat_ws\(pg_catalog\.chr\(31\), 'letter_mastery', p_child_id::text, p_letter, p_language\)/`;
    - expects the file to contain no `set local`;
    - expects `letterMasteryDomainId({ childId: 'ABC', letter: 'k', language: 'xh' })` to equal
      the `'abc'` value;
    - **(Codex round 1) pins Task 1 step 9's name resolution**, so the sandbox catches a
      regression without PostgreSQL (`sql` is the migration file's text):

      ```js
      const body = sql.slice(sql.search(/create or replace function public\.set_letter_mastery\(/i));
      expect(body).toMatch(/\bas \$\$\s*\n\s*#variable_conflict use_column\s*\n\s*declare\b/i);
      expect(body).toMatch(/on conflict on constraint letter_mastery_corrections_pkey do nothing/i);
      expect(body).toMatch(/on conflict on constraint letter_mastery_child_letter_language_key do update/i);
      expect(sql).not.toMatch(/on conflict\s*\(/i);
      expect(sql).toMatch(/constraint letter_mastery_corrections_pkey primary key \(correction_id\)/i);
      expect(sql).toMatch(/add constraint letter_mastery_child_letter_language_key unique \(child_id, letter, language\)/i);
      ```
- [ ] **Step 2: Run them.**
  `npm run test:integration -- __tests__/letterMasteryCurrentStateMigration.test.js` and
  `npx jest __tests__/letterMasteryIdParity.test.js`. Expected: FAIL (no migration or module).
- [ ] **Step 3: Implement** the leaf module, the runner hook and the migration.
- [ ] **Step 4: Run** the two new suites, then
  `npx jest __tests__/sqliteFoundation.test.js __tests__/hotPathIndexes.test.js __tests__/migrations.assessmentResults.test.js __tests__/timeEntryLocationMigration.test.js __tests__/rowVersionLocal.test.js __tests__/outboxOwnerMigration.test.js __tests__/migrationsForeignKeysOff.test.js`.
  Expected: PASS. Mastery repository and sync suites are expected to fail until Tasks 3–6
  (Checkpoints).
- [ ] **Step 5: Build log.** Add a Verification row:
  "AR Plan 2 Task 2, local schema N `letter_mastery_current_state`". Include the clear rule and
  the commands with their counts.
- [ ] **Step 6: Commit:** `feat(db): local letter mastery keyed by child, letter and language code`.

---

### Task 3: Repository — `setLetterMastery`, `getLetterMastery`, acknowledgement

**Files:**
- Rewrite: `src/db/repositories/masteryRepository.js`
- Rewrite: `__tests__/masteryRepository.test.js` (real SQLite: `createMigratedDatabase(runMigrations)`
  plus `seedCoreData`, actor `user-1`, programme `programme-a`, one child). Add it to
  `jest.integration.config.js`.

**Interfaces:**
- Consumes: Task 2's `letterMasteryDomainId`; `PEDAGOGICAL_ORDERS` (`src/utils/assessmentRegistry.js`,
  which includes `af` after AF); `getConnectionActor` (`src/session/signedInHandle.js`);
  `getActiveProgrammeId`, `enqueueDomainOutbox` (`domainRepositoryUtils.js`); `upsertRecord`.
- Produces `MasteryRecord`:
  `{ id, child_id, letter, language, confirmed: boolean, changed_at, correction_id, changed_by, programme_id, created_at, updated_at, sync_status, last_sync_error, server_updated_at, server_changed_at, server_correction_id }`,
  mapped with `booleanColumns: ['confirmed']`.
- Produces, on `createMasteryRepository({ database })`:
  - **`setLetterMastery({ childId, letter, language, confirmed, changedAt, programmeId, transaction }) → Promise<MasteryRecord-like>`**,
    in the caller's transaction or its own:
    1. Validation throws `TypeError` naming the field, and writes nothing, when:
       - `childId` is not a non-empty string;
       - `PEDAGOGICAL_ORDERS[language]` is missing or does not include `letter`;
       - `confirmed` is not a boolean;
       - `changedAt` is present but is not a string with a finite `Date.parse`.
    2. Read `nowMs = Date.now()` once. Then
       `changed_at = new Date(Math.min(changedAt === undefined ? nowMs : Date.parse(changedAt), nowMs)).toISOString()`
       (ask 1).
    3. `changed_by = getConnectionActor(txn)`. A null actor throws
       `Error('letter_mastery.changed_by requires the signed-in EA')`.
    4. **Keep a newer correction this phone still owes (plan call, deviates from AR §10.2 "On
       the phone", Codex round 1; see Global Constraints).** Make one keyed read in the same
       transaction:

       ```sql
       select lm.*, o.status as outbox_status
       from letter_mastery lm
       left join sync_outbox o
         on o.table_name = 'letter_mastery' and o.record_id = lm.id
        and o.status in ('pending', 'failed', 'in_flight')
       where lm.id = ?
       ```

       - **What "still owed" means.** It is the status set of `syncOutboxRepository.hasPendingRecord`
         (`src/db/repositories/syncOutboxRepository.js:119-130`), and Plan 3's mastery merge
         skips on the same set. A `terminal` slot is not owed, so a new save replaces a refused
         correction.
       - **When to keep.** If `outbox_status` is non-null and
         `Math.min(Date.parse(row.changed_at), nowMs) > Date.parse(changed_at)`, return the
         mapped row unchanged and write nothing. `nowMs` is the value step 2 read.
         - In every path Plan 2 builds, an owed slot's `row.changed_at` is this phone's own
           `toISOString()` value. An acknowledgement that writes a server time also deletes the
           slot, and `ordering_only` leaves `changed_at` alone. If a parse ever fails, `NaN > x`
           is false and the save replaces, which is AR's behaviour.
       - **Compare `changed_at` alone, strictly.** At an equal time the later call wins, so on,
         off, on within one millisecond keeps the last. That happens under fake timers and with
         quick test calls. A tie-break on the freshly minted random `correction_id` would keep a
         random one instead.
       - **A queued time ahead of the phone's clock counts as now.** Suppose a phone's fast clock
         was corrected after a tap. Without this rule, it would refuse every later tap on that
         letter until the queued correction uploads. With it, a tap made now (no `changedAt`)
         always replaces.
       - Otherwise (no row, no owed slot, or an incoming time at least as late) continue.
    5. `programme_id = programmeId ?? await getActiveProgrammeId(txn, changed_by)`, which may be
       null. It never throws and never uses the legacy programme.
    6. Upsert by `id = letterMasteryDomainId(...)` with a new `correction_id = uuidv4()`:
       - `sync_status = 'pending'`, `last_sync_error = null`, `updated_at = now`;
       - `created_at` is preserved on conflict;
       - the `server_*` columns are untouched.
    7. `enqueueDomainOutbox(txn, 'letter_mastery', id, 'update', payload)`, with the payload in
       Global Constraints.
    8. Return the written fields. In step 4's case, return the retained record instead: a
       `MasteryRecord` with its own `confirmed`, `changed_at` and `correction_id`, without
       `outbox_status`. Callers display what is returned.

    The budget is one keyed read and two writes per call, plus at most one programme read when
    `programmeId` is omitted. A retained call is one read and no writes. **(Codex round 1 relaxes
    the earlier no-read budget.)**
  - **`getLetterMastery({ transaction, childId, childIds, language } = {}) → Promise<MasteryRecord[]>`**:
    - `sync_status <> 'terminal'`, with optional child, children and language filters;
    - ordered by `child_id, letter`;
    - `childIds: []` returns `[]`; `childIds` are chunked by 500;
    - throws `TypeError('getLetterMastery takes no userId or programmeId')` if either key is
      present (C23).
  - Removed: `saveLetterMasteryRecord`, `updateLetterMasteryRecord`, `removeLetterMasteryRecord`.
    `getUnsyncedRecords` stays.
- Produces, as a named export used by Task 4:
  **`applyCorrectionAcknowledgement(txn, { recordId, sentCorrectionId, result, outboxDeleted }) → Promise<'written' | 'deleted' | 'ordering_only' | 'none'>`**.
  Here `result = { outcome, confirmed, changed_at, correction_id, changed_by }` from Task 4's
  parser.

  | Local state | `applied` / `superseded` | `acknowledged` |
  |---|---|---|
  | row missing | `none` | `none` |
  | `outboxDeleted` and local `correction_id === sentCorrectionId` | `written`: set the four returned fields, `server_changed_at = changed_at`, `server_correction_id = correction_id`, `sync_status = 'synced'`, `last_sync_error = null`; `programme_id` kept on `applied`, set **null on `superseded`** (plan call: AR's return carries no programme) | `deleted`: delete the row |
  | otherwise (a newer local correction is queued) | `ordering_only`: only `server_changed_at` / `server_correction_id` | `none` |

  Server times are stored as the raw PostgREST string, never through a `Date`.

- [ ] **Step 1: Write the failing tests** in `__tests__/masteryRepository.test.js`:
  - `setLetterMastery stores one pending record under the uuidv5 id and queues one update slot`:
    - the row has `changed_by: 'user-1'`, `programme_id: 'programme-a'`, `confirmed: 1`;
    - the outbox id is `letter_mastery:${id}:update`;
    - the payload keys are exactly those in Global Constraints;
    - `correction_id` matches the uuid v4 pattern.
  - `each change gets a new correction id and replaces the single slot`: on, off, on gives three
    distinct correction ids, one outbox row, and payload `confirmed: true` with the third id.
  - **`an older save keeps a newer correction that is still owed`** (Review Focus 6), as a
    `test.each` over the outbox state of a Tuesday correction.
    - Write it with `setLetterMastery({ childId, letter: 'k', language: 'en', confirmed: false, changedAt: TUE })`.
    - Set the state:
      - for a status row, `update sync_outbox set status = ? where table_name = 'letter_mastery'`.
        For `failed` and `terminal`, also set the domain row's `sync_status` to the same value,
        as the finalizers do;
      - for "synced", delete the outbox row and set the domain row `sync_status = 'synced'`.
    - Snapshot `select * from letter_mastery` and `select * from sync_outbox`.
    - Then call `const result = await setLetterMastery({ …same key, confirmed: true, changedAt: MON })`.
    - `MON = '2026-10-19T08:00:00.000Z'` and `TUE = '2026-10-20T08:00:00.000Z'`.

    | Tuesday's slot | `result` | Afterwards |
    |---|---|---|
    | `pending`, `failed`, `in_flight` (three rows) | `confirmed: false`, `changed_at: TUE`, Tuesday's `correction_id`, and no `outbox_status` key | both snapshots are unchanged (`toEqual` the before values), including the slot's `status` and `updated_at` |
    | `terminal` | `confirmed: true`, `changed_at: MON`, a new `correction_id` | the row is `confirmed: 1`, `changed_at: MON`, `pending`; the slot is `pending` with Monday's payload |
    | none (the row is `synced`) | the same as `terminal` | the same as `terminal`. The server decides (Task 4's Monday/Tuesday case) |
  - `a tap made now replaces a queued correction stamped ahead of the clock`. Under
    `jest.useFakeTimers({ now: new Date('2026-10-21T09:30:00.000Z') })`:
    - write `confirmed: true` with no `changedAt`;
    - then set the row's `changed_at` and the slot payload's `changed_at` to
      `'2026-10-21T10:30:00.000Z'` by SQL. This stands for a fast clock that has since been
      corrected.
    - `setLetterMastery({ …, confirmed: false })` with no `changedAt` replaces both. The row is
      `confirmed: 0` with `changed_at: '2026-10-21T09:30:00.000Z'`, and the payload carries the
      new `correction_id`.
  - `on, off, on in one millisecond keeps the last`: under the same frozen time, three calls
    leave `confirmed: 1`, the third call's `correction_id`, and one slot carrying it.
  - `changedAt is the tap time, never later than now` (Review Focus 2). Under
    `jest.useFakeTimers({ now: new Date('2026-10-21T09:30:00.000Z') })`, with each value on its
    own letter (so step 4 never applies):
    - `'2026-10-19T08:00:00.000Z'` is stored as is;
    - `'2099-01-01T00:00:00.000Z'` and an omitted value store `'2026-10-21T09:30:00.000Z'`;
    - `'not a time'` throws `TypeError`, and no row or outbox row exists.
  - `refuses a letter outside the order, an unknown language, a label and a non-boolean`: the
    pairs `('ch','en')`, `('a','zu')`, `('a','English')` and `confirmed: 'yes'` each throw
    `TypeError`, and nothing is written.
  - `changed_by is the signed-in EA`: after `bindTestActor(db, 'user-2')`, `changed_by` is
    `'user-2'`. An unbound database throws.
  - `a record written by another EA in another programme is the same record (C23)`:
    - seed a synced row for the key with `changed_by 'user-2'` and `programme_id 'programme-b'`;
    - `setLetterMastery` by `user-1` leaves one row with the same id;
    - that row has `changed_by 'user-1'` and `programme_id 'programme-a'`.
  - `getLetterMastery has no user or programme filter and hides terminal rows`. Seed own
    confirmed, another EA's confirmed, unconfirmed, terminal, other-language and other-child rows.
    - `getLetterMastery({ childId, language: 'xh' })` returns own, other and unconfirmed (with
      `confirmed: false`) in letter order.
    - `{ childIds: [] }` returns `[]`.
    - `{ userId: 'user-1' }` throws `TypeError`.
  - **Acknowledgement**, one test per table cell:
    - `superseded replaces the local value with the winner`;
    - `a newer local correction survives an older acknowledgement`, with only the ordering
      columns changing.

    These two are AR §15's mastery real-SQLite cases.
- [ ] **Step 2: Run** `npm run test:integration -- __tests__/masteryRepository.test.js`.
  Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(mastery): setLetterMastery, unfiltered reads and acknowledgement write-back`.

---

### Task 4: Sync — one RPC per correction, one acknowledgement

**Files:**
- Create: `src/services/letterMasteryCorrection.js`
- Modify: `src/services/syncServerColumns.js:95-98`: `letter_mastery` becomes
  `['id', 'child_id', 'letter', 'language', 'confirmed', 'changed_at', 'correction_id', 'changed_by', 'programme_id', 'created_at', 'updated_at']`.
- Modify: `src/services/offlineSync.js`:
  - imports (`:29-30`): drop `letterMasteryDomainId`; import the two helpers below and
    `applyCorrectionAcknowledgement`;
  - `LOCAL_ONLY_COLUMNS` (`:69`): add `'server_changed_at'` and `'server_correction_id'`;
  - `GRANT_SUBJECTS.letter_mastery` (`:203-206`):
    `[{ grantTable: 'child_ea_assignments', subjectColumn: 'child_id' }]` only. The server writes
    only for active direct deliverers;
  - remove `'letter_mastery'` from `BATCHABLE_UPSERT_TABLES` (`:238`) and from
    `ARCHIVE_SERVER_COLUMNS` (`:271`), and therefore from `UPDATE_BY_ID_TABLES`;
  - `buildSyncPayload` (`:529`): for `letter_mastery`, return `toSetLetterMasteryArgs(record)`
    (like `assessments` at `:530`), and delete the id re-derivation (`:557-570`);
  - `buildOperationPatch`: delete the `letter_mastery` exception (`:677-681`);
  - `runServerOperation`:
    - the `TypeError → 22023` mapping (`:723`) also covers `letter_mastery`;
    - add a `letter_mastery` branch before the hard-delete branch:
      `rpc('set_letter_mastery', args)`;
    - an error returns `{ success: false, error }`;
    - an unparseable result returns `UNEXPECTED_RPC_RESULT`;
    - otherwise return `{ success: true, acknowledgement, sentCorrectionId: args.p_correction_id }`;
  - `finalizeSuccess` (`:890`) takes `serverResult`. For `letter_mastery`, the arguments are
    `{ recordId: outboxRecord.record_id, sentCorrectionId: serverResult.sentCorrectionId, result: serverResult.acknowledgement }`:
    - if the compare-and-swap delete matched nothing, call
      `applyCorrectionAcknowledgement(txn, { …, outboxDeleted: false })` before
      `restorePendingAfterStaleFinalize`;
    - on a match, call it with `outboxDeleted: true` in place of `applyAcknowledgedPayload`, after
      `setDomainSyncResult`;
    - both calls run in the same transaction.
  - `processRecord` (`:1185`) passes `serverResult` through.
- Create: `__tests__/letterMasteryCorrectionSync.test.js`. It uses real SQLite through
  `createFamilySyncFixture`'s `engine()`, and `createSupabaseMock({ rpcResults })` with
  `client.rpc.mockImplementationOnce` for sequences. Add it to `jest.integration.config.js`.
- Create: `__tests__/letterMasteryRpcError.test.js` (a real `PostgrestClient` with stubbed
  `fetch`, in the style of `__tests__/assessmentFamilyRpcError.test.js`).
- Modify: `__tests__/classifyErrorHardening.test.js` (after `:108`); `__tests__/rowVersionSend.test.js:424`;
  `__tests__/offlineSyncOutbox.test.js:1783-1845` (delete), `:2382-2445` (adapt);
  `__tests__/offlineSyncUpdateById.test.js:131-159, :250-270` (delete);
  `__tests__/offlineSyncLifecycleEdits.test.js:96-118` (delete).
- Delete: `__tests__/letterMasterySync.test.js`.
- Docs: `documentation/rls-sync-contract-map.md`, `documentation/LEARNING.md`, `documentation/build-log.md`.

**Interfaces:**
- Consumes: Task 3's `setLetterMastery` and `applyCorrectionAcknowledgement`; Task 1's RPC.
- Produces, in `src/services/letterMasteryCorrection.js`:
  - `toSetLetterMasteryArgs(payload) → { p_correction_id, p_child_id, p_letter, p_language, p_confirmed, p_changed_at }`.
    It throws `TypeError` unless the six fields are present, `confirmed` is a boolean, and
    `changed_at` parses.
  - `parseSetLetterMasteryResult(data) → { outcome, confirmed, changed_at, correction_id, changed_by } | null`.
    It accepts only a one-element array.
    - The outcome must be one of `'applied' | 'superseded' | 'acknowledged'`.
    - `applied`/`superseded` require a boolean, two strings and a string. `acknowledged` requires
      nulls.

- [ ] **Step 1: Write the failing tests** in `__tests__/letterMasteryCorrectionSync.test.js`.
  Write the corrections with `setLetterMastery` on the fixture's handle.

  ```js
  test('one correction is one set_letter_mastery call with exactly its six arguments', async () => {
    const written = await mastery.setLetterMastery({ childId: f.childId, letter: 'k', language: 'en', confirmed: true });
    client.rpc.mockResolvedValueOnce({ data: [winner({ correction_id: written.correction_id, changed_by: f.userId })], error: null });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(client.rpc).toHaveBeenCalledWith('set_letter_mastery', {
      p_correction_id: written.correction_id, p_child_id: f.childId, p_letter: 'k', p_language: 'en',
      p_confirmed: true, p_changed_at: written.changed_at });
    expect(client.from).not.toHaveBeenCalled();
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });
  ```

  Then add:
  - `applied writes the returned record and the server ordering columns`;
  - `superseded: the phone shows the winner at once`. The local row becomes the other EA's
    `confirmed: 0`, `changed_by`, `changed_at`, `correction_id` and server tuple, and is
    `synced`.
  - `acknowledged deletes the local row` (Review Focus 3).
  - `a newer change made while the call is in flight survives the acknowledgement`
    (Review Focus 1):
    - the first `rpc` mock calls `setLetterMastery(… confirmed: false)` before resolving
      `applied`;
    - after the pass, the row is `confirmed: 0` with the new `correction_id`, `pending`, and the
      server tuple from the reply;
    - the next `syncAll` sends the new correction id.
  - `on, off, on offline is one call with the last correction id`;
  - **`an older save never replaces this phone's newer unsent correction, and the newer one uploads`**.
    This is Review Focus 6 and the regression for Codex round 1's data-loss finding. The suite
    defines `MON = '2026-10-19T08:00:00.000Z'` and `TUE = '2026-10-20T08:00:00.000Z'`, as Task 3
    does. Both are past instants, so this test needs no fake timers.

    ```js
    const tuesday = await mastery.setLetterMastery({ childId: f.childId, letter: 'k', language: 'en', confirmed: false, changedAt: TUE });
    const kept = await mastery.setLetterMastery({ childId: f.childId, letter: 'k', language: 'en', confirmed: true, changedAt: MON });
    expect(kept).toMatchObject({ confirmed: false, changed_at: TUE, correction_id: tuesday.correction_id });
    const slots = await f.db.getAllAsync("select payload from sync_outbox where table_name = 'letter_mastery'");
    expect(slots.map((s) => JSON.parse(s.payload))).toEqual([
      expect.objectContaining({ confirmed: false, changed_at: TUE, correction_id: tuesday.correction_id })]);
    client.rpc.mockResolvedValueOnce({ data: [winner({ confirmed: false, changed_at: TUE, correction_id: tuesday.correction_id, changed_by: f.userId })], error: null });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith('set_letter_mastery', expect.objectContaining({
      p_correction_id: tuesday.correction_id, p_confirmed: false, p_changed_at: TUE }));
    expect(await f.db.getFirstAsync("select confirmed, sync_status from letter_mastery where letter = 'k'"))
      .toEqual({ confirmed: 0, sync_status: 'synced' });
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
    ```

  - `an older save made while the newer correction is in flight is kept back too`.
    - The first `rpc` mock awaits
      `setLetterMastery({ …same key, confirmed: true, changedAt: MON })` before it resolves
      `applied` for Tuesday's id.
    - After the pass, the row is Tuesday's (`confirmed: 0`), `synced`, with the reply's server
      tuple.
    - The outbox is empty, and `rpc` was called once.
    - This proves an `in_flight` slot counts as owed. The compare-and-swap still matches,
      because the kept-back save wrote nothing.
  - `two letters are two calls; letter_mastery is never batched or upserted`;
  - `a Monday mark saved on Wednesday is sent with Monday's time and shows Tuesday's winning correction`
    (ask 1, phone side):
    - `setLetterMastery({ …, changedAt: MON })` runs under fake time WED;
    - the call has `p_changed_at: MON`;
    - the reply is `superseded` with another EA's TUE un-confirm;
    - the local row is `confirmed: 0`, `changed_at: TUE`, `synced`.
  - `42501 stays retriable while the child assignment is pending, then terminal with the authenticated marker`;
  - `a refused correction is terminal and never shows as mastery`. `MA001` makes the row
    terminal; `getLetterMastery` and `loadMasteryState` exclude it; the needs-attention list still
    shows it. Repeat for `22023` and an unexpected result (`UNEXPECTED_RPC_RESULT`).
  - `a malformed payload is refused locally as 22023 without a network call`;
  - `a failure after the outbox delete rolls back the write-back`. Add an SQLite trigger that
    aborts the `letter_mastery` update; the outbox row and the local values are both unchanged.

  Also:
  - in `letterMasteryRpcError.test.js`:
    - an `MA001` body is terminal and a `28000` body is retriable;
    - the URL is `…/rest/v1/rpc/set_letter_mastery`;
    - a `200` body `[{"outcome":"applied",…}]` is synced;
  - in `classifyErrorHardening.test.js`: `expect(GRANT_SUBJECTS.letter_mastery).toEqual([{ grantTable: 'child_ea_assignments', subjectColumn: 'child_id' }])`;
  - `expect(_testUpdateByIdTables.has('letter_mastery')).toBe(false)`;
  - the RPC args never contain `row_version` or `updated_at`.
- [ ] **Step 2: Run**
  `npm run test:integration -- __tests__/letterMasteryCorrectionSync.test.js` and
  `npx jest __tests__/letterMasteryRpcError.test.js __tests__/classifyErrorHardening.test.js`.
  Expected: FAIL.
- [ ] **Step 3: Implement**, then delete or adapt the old tests listed under Files.
- [ ] **Step 4: Run** the Step 2 suites, then
  `npx jest __tests__/offlineSync* __tests__/rowVersion* __tests__/syncContract* __tests__/assessmentFamily* __tests__/batch*`.
  Expected: PASS. List every changed expectation and its reason in the report.
- [ ] **Step 5: Docs.**
  - **Contract map.**
    - Append the phone half to Task 1's section:
      - the single slot and payload;
      - the ordering-aware slot (Task 3 step 4). An older save keeps a newer correction that is
        still owed (`pending`, `failed` or `in_flight`, the set Plan 3's merge also uses). A
        queued time ahead of the phone's clock counts as now;
      - send-time args;
      - the acknowledgement table from Task 3;
      - error classes (`42501` evidence = direct assignment only; `MA001`, `22023` and
        `UNEXPECTED_RPC_RESULT` terminal; `28000` retriable);
      - "`server_changed_at` holds the raw server string; Plan 3 compares it as a timestamp".
    - Global Contract 3 (`:171`): remove the `letter_mastery.deleted_at` exception sentence.
    - Operation Semantics: remove `letter_mastery` from the acknowledged-edit (`:191`),
      lifecycle-archive (`:192`) and batched-upsert (`:194`) rows, and remove `:193`'s last
      sentence. Add a row "Letter mastery correction".
    - Delete the exception paragraph (`:329-333`).
    - `:287-292`: the RPC ignores phone `updated_at`; the record's `updated_at` moves only when a
      correction applies.
    - `:416-417`: D1 is built. Ordering is by correction time, not `row_version`.
    - Error Classification: in the `:566` limitation, the mastery ordering gap is closed by D1.
    - Source-file lists (`:960-991`): add the new files.
  - **`documentation/LEARNING.md`**, a new section "One mark per child and letter: why the server
    keeps a receipt and returns the winner". It covers:
    - D1;
    - the fast clock with a lost reply, and why re-clamping would undo the newer correction;
    - why a losing phone must not display its own value as synced;
    - why an older save must not replace a newer correction the phone still owes: the slot holds
      one correction, so replacing it loses the newer one before the server can order them;
    - resolving the natural key inside the statement (ZZ-BUG-20260813-006);
    - why the RPC names its conflict targets: `returns table` columns are plpgsql variables, and
      an unqualified `on conflict (correction_id)` raises `42702` under the default
      `plpgsql.variable_conflict`.
  - **Build log:** a Verification row, plus a Decision row: "one RPC per correction, never
    batched; volume is a few rows per session".
- [ ] **Step 6: Commit:** `feat(sync): letter mastery uploads through set_letter_mastery and writes back the winner`.

---

### Task 5: Readers — codes, `confirmed`, and no recorder or programme filter

**Files:**
- Modify:
  - `src/utils/masteryState.js:10, :30-35`;
  - `src/utils/dashboardStats.js:11, :214-223`;
  - `src/screens/insights/LetterMasteryRankingScreen.js:36-39`;
  - `src/db/debugDump.js` (a new section in `debugDump`, `:125-140`).
- Test:
  - `__tests__/masteryState.test.js`;
  - `__tests__/dashboardStats.letterMastery.test.js`;
  - `__tests__/LetterMasteryRankingScreen.test.js`;
  - `__tests__/LetterTrackerBottomSheet.test.js`, `__tests__/LetterTrackerBottomSheet.plan5.test.js`;
  - `__tests__/debugExport.test.js`;
  - `__tests__/sqliteFoundation.test.js:621-655`.

**Interfaces:**
- Consumes: Task 3's `getLetterMastery` and `MasteryRecord`.
- Produces:
  - `loadMasteryState({ repositories, userId, childId, languageCode })` keeps its signature and
    return shape.
    - `taughtRecords` = `(await repositories.mastery.getLetterMastery({ childId, language: languageCode })).filter((r) => r.confirmed)`.
    - `userId` still scopes the evidence's programme only.
    - The `LANGUAGE_LABELS` import and the "Plan 2 re-keys" comment go.
  - `getLetterMasteryRanking(children, assessments, letterMastery, classes)` keeps its signature.
    A confirmation counts when `r.child_id === child.id && r.language === languageCode && r.confirmed`.
  - `LetterMasteryRankingScreen` reads `getLetterMastery({ childIds: childrenList.map((c) => c.id) })`.
  - `debugDump` gains `letterMastery: [{ childId, letter, language, confirmed, changedAt, correctionId, changedBy, programmeId, syncStatus, serverChangedAt, serverCorrectionId }]`,
    ordered by `child_id, letter`, with no names **(plan call: Task 7's gate reads both phones'
    rows through Profile → Export Database, and failed outbox payloads already carry the same
    ids)**.

- [ ] **Step 1: Write the failing tests.**
  - `masteryState.test.js`. Its `confirm` helper becomes
    `repositories.mastery.setLetterMastery({ childId: f.childId, letter, language, confirmed })`
    with codes. Add:

    ```js
    test('confirmations from any EA and any programme count; unconfirmed, terminal and other-language rows do not', async () => {
      await confirm('a', 'en', true);
      await insertRow({ letter: 'b', language: 'en', confirmed: 1, changed_by: 'other-ea', programme_id: 'programme-b', sync_status: 'synced' });
      await insertRow({ letter: 'c', language: 'en', confirmed: 0, changed_by: 'other-ea', sync_status: 'synced' });
      await insertRow({ letter: 'd', language: 'en', confirmed: 1, sync_status: 'terminal' });
      await confirm('e', 'xh', true);
      const read = jest.spyOn(repositories.mastery, 'getLetterMastery');
      const state = await load('en');
      expect(read).toHaveBeenCalledWith({ childId: f.childId, language: 'en' });
      expect(state.taughtRecords.map((r) => r.letter)).toEqual(['a', 'b']);
    });
    ```

    AF's Afrikaans case and `:54-60`/`:73-104` use codes (`'af'`, `'en'`, `'xh'`) and
    `confirmed`.
  - `dashboardStats.letterMastery.test.js`:
    - confirmations become `{ child_id, language: 'xh', letter, confirmed: true }`, and `:41`'s
      deleted row becomes `confirmed: false`;
    - AF's Afrikaans case uses `language: 'af'`;
    - add `an unconfirmed record does not count`.
  - `LetterMasteryRankingScreen.test.js`:
    - seed with `setLetterMastery` (codes);
    - add `a confirmation recorded by another EA counts`;
    - assert `getLetterMastery` was called with `{ childIds: [fixture.childId] }`.
  - `LetterTrackerBottomSheet*.test.js`: `stored()` rows become `{ …, language: 'en', confirmed: true }`
    (AF's Afrikaans case: `'af'`).
  - `debugExport.test.js`: one stored row appears in `database.letterMastery` with exactly the
    keys above. `sqliteFoundation.test.js:621-655` expects `letterMastery: []`.
- [ ] **Step 2: Run** the seven files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them. Expected: PASS. `grep -rn "Plan 2 re-keys letter_mastery" src/utils`
  matches nothing.
- [ ] **Step 5: Commit:** `feat(mastery): readers use codes and every deliverer's confirmations`.

---

### Task 6: Writers — the session tracker and `LetterMasteryPanel`; standing docs

**Files:**
- Modify: `src/services/literacySessionPersistence.js`, as AF leaves it:
  - the mastery block (today `:75-144`) becomes one `setLetterMastery` call per attendee change;
  - the `findMasteryRecord`, `LANGUAGE_LABELS` and `createMasteryRepository` lookups for reads go.
- Modify: `src/components/assessment/LetterMasteryPanel.js:11, :26, :34-35, :37-57, :65-150`.
- Create: `src/hooks/useLetterMasterySyncRefresh.js` **(Codex round 1)**.
- Modify: `src/components/session/LetterTrackerBottomSheet.js:1-2` (imports) and `:46-65` (the
  load effect) **(Codex round 1)**.
- Test:
  - `__tests__/literacySessionPersistence.test.js`;
  - `__tests__/completionPathBudget.test.js:102-158`;
  - `__tests__/foreignKeyEnforcement.test.js:61-108`;
  - `__tests__/LiteracySessionForm.submit.test.js`;
  - `__tests__/LetterMasteryPanel.test.js`;
  - `__tests__/LetterTrackerScreen.plan5.test.js`;
  - `__tests__/LetterTrackerBottomSheet.test.js` (the sync-refresh cases; Task 5 already moved
    its rows to codes).
- Docs:
  - `CONTEXT.md` (Letter mastery, `:113-114`; the access rule, `:261`);
  - `documentation/rls-sync-contract-map.md:879` (table row);
  - `documentation/ROADMAP.md` (`:60`, `:149-152`, `:391-403`, `:551-558`, `:563-564`);
  - `docs/adr/0005-assessment-delivery-scope-two-tier-access.md` (status note, `:8`);
  - `documentation/build-log.md`.

**Interfaces:**
- Consumes: Task 3's `setLetterMastery`; AF's `assertTrackerChanges` and pending-change shape.
- Produces:
  - **`persistLiteracySession({ handle, database, session, letterTrackerChanges, nowIso, idFactory })`**
    keeps AF's signature and its validation before the transaction. Inside the transaction, for
    each attendee change it calls
    `mastery.setLetterMastery({ childId, letter, language: change.languageCode, confirmed: change.mastered, changedAt: change.madeAt, programmeId, transaction })`.
    - `nowIso` stamps only the session and reading levels.
    - `idFactory` is no longer used for mastery.
    - An un-mark with no stored record still writes a `confirmed: false` record. **Plan call:**
      AR §10.1 keeps the un-confirm as a record of that correction.
    - A change that Task 3 step 4 keeps out (a newer correction is still owed) writes nothing.
      The session and its other changes still save.
  - **`useLetterMasterySyncRefresh({ enabled, onRefresh })`** (`src/hooks/useLetterMasterySyncRefresh.js`).
    **Plan call, Codex round 1:** this is the one trigger both tracker surfaces use. AR §10.2
    names the panel and the sheet as write surfaces but says nothing about refreshing them.

    ```js
    import { useEffect, useRef } from 'react';
    import { useOffline } from '../context/OfflineContext';

    // A tracker on screen re-reads after a sync pass that sent letter_mastery corrections, so a
    // superseded or refused tap never stays displayed (Assessment Results Plan 2).
    export default function useLetterMasterySyncRefresh({ enabled, onRefresh }) {
      const { lastSyncResult } = useOffline();
      const seen = useRef(lastSyncResult);
      useEffect(() => {
        if (lastSyncResult === seen.current) return;
        seen.current = lastSyncResult;
        if (enabled && lastSyncResult?.tableResults?.letter_mastery) onRefresh();
      }, [lastSyncResult, enabled, onRefresh]);
    }
    ```

    - `syncAll` (`src/services/offlineSync.js:1431`) builds a fresh `result` for each pass
      (`:1484`), and `OfflineContext.syncNow` publishes it (`src/context/OfflineContext.js:160`).
      The debounced `triggerBackgroundSync` also goes through `syncNow` (`:196-209`).
    - `tableResults.letter_mastery` exists whenever the pass processed or skipped a mastery slot
      (`offlineSync.js:1631-1663`, `:1698-1712`). That covers `applied`, `superseded`,
      `acknowledged`, retriable and terminal outcomes.
    - A result that arrives while `enabled` is false is still marked as seen. So opening a
      surface never loads twice, and a pass with no mastery never re-reads.
    - It covers uploads only. Mastery rows applied by Plan 3's pull need their own signal.
  - **`LetterMasteryPanel`**:
    - a tap calls
      `masteryRepository.setLetterMastery({ childId: child.id, letter, language: languageCode, confirmed: !taughtLetters[letter] })`,
      with no `changedAt`, then updates `taughtLetters` from the returned `confirmed`;
    - the sync nudges (`refreshSyncStatus`, `triggerBackgroundSync`) and the `updatingLetter`
      guard stay;
    - the cached-id and soft-delete branches go;
    - **(plan call, Review Focus 5)** the panel calls
      `useLetterMasterySyncRefresh({ enabled: true, onRefresh })`, with
      `onRefresh = useCallback(() => loadData({ background: true }), [loadData])`.
      - `loadData({ background = false } = {})` keeps today's dependency list
        (`child.id`, `languageCode`, `user.id`).
      - A background load leaves `loading` unchanged, so the grid stays on screen. Without this,
        every tap would flash the full-panel spinner: the tap's own background sync pass touches
        `letter_mastery`, and `if (loading)` (`:158-164`) replaces the whole panel.
      - A `useRef` counter numbers each load. Only the latest load applies its results and
        clears `loading`.
      - `useFocusEffect` keeps calling `loadData()` in the foreground, as today.
  - **`LetterTrackerBottomSheet`** **(plan call, Codex round 1)**:
    - **The load.** The effect at `:46-65` becomes `loadBaseline({ background = false } = {})`.
      - It is a `useCallback` over today's dependencies (`child?.id`, `languageCode`, `userId`).
      - `repositories` stays out of that list, as it does today. In component tests,
        `useSignedInEA()` returns a new `repositories` object on every render
        (`test-support/legacyHandleMocks.js:22-27`), so listing it would reload on every render.
      - It has the same latest-load counter and background rule as the panel.
    - **Opening** (`visible` with a `child`) calls `loadBaseline()`, which shows the spinner as
      today, from `useEffect(..., [visible, loadBaseline])`.
    - **The refresh.**
      `useLetterMasterySyncRefresh({ enabled: Boolean(visible && child), onRefresh })`, with
      `onRefresh = useCallback(() => loadBaseline({ background: true }), [loadBaseline])`.
    - **Unsaved marks.** `pendingChanges` is a prop that the form owns (AF's
      `{ [letter]: { mastered, languageCode, madeAt } }`). A refresh never touches it.
      - `getCellState`, `handleCellTap` and `countMastered` already read it over the refreshed
        baseline.
      - So each tap still produces the state the tile then shows, measured against the current
        stored record.

- [ ] **Step 1: Write the failing tests.**
  - `literacySessionPersistence.test.js`:
    - every mastery assertion reads `confirmed` and codes;
    - AF's mixed-language test expects `language` `'xh'`/`'en'` and `changed_at: MADE_AT`;
    - replace `:323-389` with `a confirmation recorded under another programme is the same record (C23)`;
    - AF's refusal table stays as is;
    - add:

    ```js
    test("a Monday mark saved on Wednesday keeps Monday's correction time", async () => {
      // seed child-1, clear the outbox
      await persistLiteracySession({ database: db,
        session: { id: 'session-wed', user_id: 'user-1', programme_id: 'programme-a', session_date: '2026-10-21',
          children_ids: ['child-1'], activities: { letters_focused: ['a'] }, synced: false },
        letterTrackerChanges: { 'child-1': { m: { mastered: true, languageCode: 'en', madeAt: '2026-10-19T08:00:00.000Z' } } },
        nowIso: '2026-10-21T09:30:00.000Z', idFactory: () => 'unused' });
      expect(await db.getFirstAsync("select changed_at, confirmed, sync_status from letter_mastery where letter = 'm'"))
        .toEqual({ changed_at: '2026-10-19T08:00:00.000Z', confirmed: 1, sync_status: 'pending' });
      const { payload } = await db.getFirstAsync("select payload from sync_outbox where table_name = 'letter_mastery'");
      expect(JSON.parse(payload)).toMatchObject({ letter: 'm', changed_at: '2026-10-19T08:00:00.000Z' });
    });
    ```

    Task 4 proves the other half of ask 1's test: the server's Tuesday winner shows.

    Also add the same-phone half (Review Focus 6, Codex round 1). It uses the suite's mastery
    repository on `db`:

    ```js
    test("a Monday mark saved on Wednesday leaves this phone's newer unsent Tuesday correction queued", async () => {
      // seed child-1, clear the outbox
      const tuesday = await mastery.setLetterMastery({ childId: 'child-1', letter: 'm', language: 'en',
        confirmed: false, changedAt: '2026-10-20T08:00:00.000Z' });
      await persistLiteracySession({ database: db,
        session: { id: 'session-wed', user_id: 'user-1', programme_id: 'programme-a', session_date: '2026-10-21',
          children_ids: ['child-1'], activities: { letters_focused: ['a'] }, synced: false },
        letterTrackerChanges: { 'child-1': { m: { mastered: true, languageCode: 'en', madeAt: '2026-10-19T08:00:00.000Z' } } },
        nowIso: '2026-10-21T09:30:00.000Z', idFactory: () => 'unused' });
      expect(await db.getFirstAsync("select changed_at, confirmed, correction_id, sync_status from letter_mastery where letter = 'm'"))
        .toEqual({ changed_at: '2026-10-20T08:00:00.000Z', confirmed: 0, correction_id: tuesday.correction_id, sync_status: 'pending' });
      const slots = await db.getAllAsync("select payload from sync_outbox where table_name = 'letter_mastery'");
      expect(slots.map((s) => JSON.parse(s.payload))).toEqual([expect.objectContaining({
        confirmed: false, changed_at: '2026-10-20T08:00:00.000Z', correction_id: tuesday.correction_id })]);
      expect(await db.getFirstAsync("select id from sessions where id = 'session-wed'")).toEqual({ id: 'session-wed' });
    });
    ```
  - `completionPathBudget.test.js`: `literacy persistence writes each tracker change with one keyed read, one record and one outbox upsert`.
    **(Codex round 1 relaxes round 0's no-read budget; see Task 3 step 4.)**
    - With three changes for one child, exactly three `getFirstAsync` calls touch
      `from letter_mastery`, and each one's `compactSql` contains `where lm.id = ?`.
    - Zero `getAllAsync` calls touch `from letter_mastery`.
    - At most 6 `runAsync` writes touch `letter_mastery` or `sync_outbox` for mastery.
    - Each of the three outbox rows is `operation = 'update'`.
  - `foreignKeyEnforcement.test.js`: the committed rows have `language: 'en'` and `confirmed: 1`.
  - `LiteracySessionForm.submit.test.js`:
    - `:281-322` expects `language: 'xh'` in the row and the outbox payload;
    - AF's mixed-class test seeds `stored-k` with `setLetterMastery({ …, language: code, confirmed: true })`;
    - those tests read `select letter, language from letter_mastery where child_id = ? and confirmed = 1`
      and expect the code.
  - `LetterMasteryPanel.test.js` (rewrite). The mocked repository exposes `getLetterMastery` and
    `setLetterMastery`.
    - Toggling a grey letter calls `setLetterMastery` once with
      `{ childId, letter: 'a', language: 'en', confirmed: true }` and no `changedAt`, and the count
      rises.
    - Toggling it back calls `confirmed: false`.
    - The locked assessment cell never calls it.
    - A rejected save shows `Letter update was not saved. Please try again.` and leaves the cell
      grey.
    - A sync-status refresh failure shows no error.
    - `the panel re-reads after a sync pass that touched letter_mastery`.
      - Load with stored `a` and `s` confirmed, which shows `2 / 26 letters mastered`.
      - Make the next `getLetterMastery` a deferred promise. Rerender with `useOffline` returning
        `lastSyncResult: { tableResults: { letter_mastery: { success: true, synced: 1, failed: 0 } } }`.
      - While the promise is pending, `a, taught by coach` is still on screen and
        `UNSAFE_queryByType(ActivityIndicator)` is `null`. There is no spinner flash (Codex
        round 1).
      - Resolve it with `s` now `confirmed: false`. Then `s, not mastered` shows, and so does
        `1 / 26 letters mastered`.
    - `a sync pass that sent no mastery does not re-read`: rerender with
      `lastSyncResult: { tableResults: { children: { success: true, synced: 1, failed: 0 } } }`.
      `getLetterMastery` was still called once.
  - `LetterTrackerScreen.plan5.test.js:37-90`: the mocks become `setLetterMastery`.
  - **`LetterTrackerBottomSheet.test.js`** (Review Focus 5, Codex round 1).
    - Add `jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }))`, and
      `useOffline.mockReturnValue({ lastSyncResult: null })` in `beforeEach`.
    - Split `renderSheet` into an element factory, `sheet(props)`, and `render(sheet(props))`,
      so that `screen.rerender(sheet(props))` keeps the same instance.
    - Use AF's `change` helper and Task 5's code-shaped `stored()` rows.

    ```js
    const masteryPass = (failed = 0) => ({ tableResults: { letter_mastery: { success: failed === 0, synced: 1 - failed, failed } } });

    test('an open sheet re-reads its baseline after superseded and refused corrections and keeps unsaved marks', async () => {
      const onDismiss = jest.fn();
      const props = { pendingChanges: { e: change(true) }, onDismiss };
      masteryRepository.getLetterMastery.mockResolvedValueOnce([stored('a'), stored('s'), stored('t')]);
      const screen = renderSheet(props);
      await waitFor(() => expect(screen.getByText('Amahle Dlamini · 4/26 letters')).toBeTruthy());

      // superseded: another EA's newer un-confirm of s now holds the record
      let release;
      masteryRepository.getLetterMastery.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
      useOffline.mockReturnValue({ lastSyncResult: masteryPass() });
      screen.rerender(sheet(props));
      expect(screen.getByLabelText('s, taught by coach')).toBeTruthy(); // the grid stays during the re-read
      expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
      await act(async () => { release([stored('a'), { ...stored('s'), confirmed: false }, stored('t')]); });
      expect(screen.getByLabelText('s, not mastered')).toBeTruthy();
      expect(screen.getByText('Amahle Dlamini · 3/26 letters')).toBeTruthy();

      // refused: this phone's confirmation of t went terminal, so getLetterMastery no longer returns it
      masteryRepository.getLetterMastery.mockResolvedValueOnce([stored('a'), { ...stored('s'), confirmed: false }]);
      useOffline.mockReturnValue({ lastSyncResult: masteryPass(1) });
      screen.rerender(sheet(props));
      await waitFor(() => expect(screen.getByLabelText('t, not mastered')).toBeTruthy());
      expect(screen.getByText('Amahle Dlamini · 2/26 letters')).toBeTruthy();

      expect(screen.getByLabelText('e, taught, added this session')).toBeTruthy(); // the unsaved mark survives both
      expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(3);
      expect(onDismiss).not.toHaveBeenCalled();
    });

    test('a pass with no mastery, or one that arrives while the sheet is closed, does not re-read', async () => {
      const screen = renderSheet();
      await waitFor(() => expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(1));
      useOffline.mockReturnValue({ lastSyncResult: { tableResults: { children: { success: true, synced: 1, failed: 0 } } } });
      screen.rerender(sheet());
      useOffline.mockReturnValue({ lastSyncResult: masteryPass() });
      screen.rerender(sheet({ visible: false }));
      await act(async () => {});
      expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(1);
      screen.rerender(sheet()); // reopening loads once, from the open effect
      await waitFor(() => expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(2));
    });
    ```

    Some test files render the sheet with no `OfflineContext` mock
    (`LetterTrackerBottomSheet.plan5.test.js`, which gets the default context's `null`). Others
    use a `useOffline` mock with no `lastSyncResult` (`LiteracySessionForm.submit.test.js:18`,
    `LiteracySessionForm.test.js:96`, `ChildSelector.renderCount.test.js`). These files are
    unchanged, and they never re-read.
- [ ] **Step 2: Run** the seven files, with the real-SQLite ones through `npm run test:integration -- …`.
  Expected: FAIL.
- [ ] **Step 3: Implement** both writers, the hook and the sheet's refresh.
- [ ] **Step 4: Static checks.** Each of these must match nothing:
  - `grep -rn "Plan 2 re-keys letter_mastery" src`;
  - `grep -rn "saveLetterMasteryRecord\|updateLetterMasteryRecord\|removeLetterMasteryRecord" src __tests__ test-support`;
  - `grep -rn "getLetterMastery({[^}]*userId" src __tests__`.

  `grep -rn "LANGUAGE_LABELS" src` matches only display code: `assessmentRegistry.js`,
  `AssessmentHistoryScreen.js`, `AssessmentDetailScreen.js`, `StandaloneTestScreen.js` and
  `AssessmentChildSelectScreen.js`.
- [ ] **Step 5: Docs.**
  - **`CONTEXT.md`.**
    - `:113`: the stored confirmation is one current record per child, letter and language
      **code** (`letter_mastery.language` holds `en`/`xh`/`af`/`zu`), with the last writer in
      `changed_by`. Any current deliverer's confirmation counts, whoever recorded it and in any
      programme. A refused (terminal) correction never counts. Remove the "Plan 1 confirmations
      still store language labels" sentence and its AF-era variant.
    - `:114`: "the retired `letter_mastery.source = 'taught'` value".
    - `:261`: replace "Today's stored rows are keyed per EA … assessment-history slice." with:
      "Built in Assessment Results Plan 2: `set_letter_mastery` fixes each correction's effective
      time when the server first receives it, so a retry cannot move it."
  - **Contract map `:879`.**
    - Producer: `masteryRepository.setLetterMastery`, called by `persistLiteracySession` (tap
      time) and `LetterMasteryPanel` (now).
    - Local required fields: `child_id`, `letter`, `language` (code), `confirmed`, `changed_at`,
      `correction_id`, `changed_by`.
    - Sync operation: one `set_letter_mastery` call per record slot.
    - RLS: `letter_mastery_select_writer_or_deliverer`; no direct DML.
    - Ordering: after `children`, D1.
    - Tests: the new suites.
  - **ROADMAP.**
    - `:391-403` and `:551-558`: re-key and D1 built (Plan 2), with hosted apply and device gate
      left to Task 7. The mastery pull stays in Plan 3.
    - `:60` and `:149-152`: say the same.
    - `:563-564`: "the deterministic per-EA id" is gone; panel taps are corrections.
  - **ADR-0005 status note:** "Follow-up 2 built (Assessment Results Plan 2, ⟨date⟩): one record
    per child, letter and language; current-deliverer writes; the most recently made correction
    wins (D1)."
  - **Build log:** Verification rows for Tasks 3–6.
- [ ] **Step 6: Full-suite checkpoint** (Tasks 2–6). Run `npx jest`, `npm run test:integration`
  and `npm run test:types`. Expected: PASS, with counts recorded against the Task 0 baseline.
  Report every deleted or rewritten old-identity test against the table above.
- [ ] **Step 7: Commit:** `feat(mastery): both tracker surfaces write corrections; docs`.

---

### Task 7: Release gates (controller; each external step with Jim's yes at the time)

**Files:** `documentation/build-log.md`, `documentation/ROADMAP.md`,
`documentation/rls-sync-contract-map.md` (status lines only). Fixes found here go to the owning
task's files.

- [ ] **Step 1: Suites.** Run `npx jest`, `npm run test:integration`, `npm run test:types`, and
  every `verify:*:postgres` on the disposable server. Expected: all pass. Record the counts.
- [ ] **Step 2: Review.** Run `/codex:adversarial-review` with `--cwd <worktree> --base origin/main`.
  Fix the findings worth fixing, in at most two rounds. Record each finding and how it was
  handled.
- [ ] **Step 3: AR §13 step 1.** Every test phone on the current build syncs completely: Sync
  status reads "All saved and synced" with no needs-attention items. Record it.
- [ ] **Step 4: AR §13 step 2 (Jim's yes).** Through the helper, after confirming `project_ref`:
  1. record `select language, count(*) from public.letter_mastery group by 1;`;
  2. run `delete from public.letter_mastery;`;
  3. the count is now `0`. Record both counts.
- [ ] **Step 5: AR §13 step 3 (Jim's yes).**
  - `npm run sqlite:staging:dry-run` must list **only** this migration. If B2 or another
    branch's file is also pending, stop and ask Jim for the order.
  - Then run `npm run sqlite:staging:push`.
  - Verify read-only:
    - the ledger row is recorded;
    - `set_letter_mastery` is security definer, executable by `authenticated` and not `anon`;
    - `has_table_privilege('authenticated', 'public.letter_mastery', p)` is false for INSERT,
      UPDATE and DELETE, and true for SELECT;
    - no `authenticated` privilege exists on `letter_mastery_corrections`;
    - the only policy on `letter_mastery` is `letter_mastery_select_writer_or_deliverer`.
  - Then a rollback-only smoke (Jim's yes):
    `begin; set local role authenticated; set local request.jwt.claim.sub = '<test EA>'; select * from public.set_letter_mastery(gen_random_uuid(), '<a child that EA delivers to>', 'a', 'xh', true, now()); rollback;`.
    It returns `applied`, with zero residue afterwards.
  - Old builds' mastery writes now fail with `42501`. Install the new build before field use.
- [ ] **Step 6: AR §13 step 4 (Jim's yes): EAS preview builds** (Android and iOS), through the
  `expo-deployment` skill's cloud path.
  - **G0, upgrade on the Galaxy A03s.**
    - Install over the current build with at least one stored confirmation.
    - The app opens to Home.
    - Profile → Export Database shows `schemaVersion` N, the `letter_mastery_current_state`
      migration, and `letterMastery` rows with two-letter codes, `synced` and a null server tuple.
    - `failedOutboxRows` is `[]`, and Sync status reads "All saved and synced".
    - **Plan call:** then uninstall and reinstall both phones fresh. The hosted wipe removed the
      server copies of those practice confirmations, and Plan 2 has no pull to reconcile them.
- [ ] **Step 7: Gate fixture (Jim's yes).**
  - Two test EAs: EA-A on the A03s at 360 dp (`wm density 320`), EA-B on the iPhone.
  - Both have an active `child_ea_assignments` row to one gate child in an isiXhosa class. Create
    EA-B's row through the helper, and record the SQL and ids.
  - Server reads (helper, read-only) are:
    - `select letter, confirmed, changed_at, correction_id, changed_by from public.letter_mastery where child_id = '<gate child>' order by letter;`
    - `select correction_id, confirmed, requested_at, effective_at, changed_by from public.letter_mastery_corrections where child_id = '<gate child>' order by received_at;`
  - Turn A03 Wi-Fi off with `adb shell cmd wifi set-wifi-enabled disabled`. Airplane mode
    re-enables Wi-Fi on this phone.
- [ ] **Step 8: Device gate (AR §14 Plan 2 row).** Take a screenshot of each tracker state and
  export both phones' databases at the end of each case.

| Case | Steps | Pass when |
|---|---|---|
| **G1: an offline older confirm loses** (letter `s`) | (1) A03 offline: Child Results → Letter tracker, tap `s`. (2) At least 1 min later, iPhone online: tap `s`, wait for "All saved and synced", tap `s` again, wait. (3) A03 Wi-Fi on, Sync now, stay on the tracker | **A03:** `s` turns grey within that sync pass without leaving the screen. The count is one lower. The session-form tracker sheet also shows `s` grey. The export's `s` row has `confirmed: false`, `changedBy` = EA-B, `correctionId` = `serverCorrectionId` = EA-B's second correction, `changedAt` = `serverChangedAt` = the server's `changed_at`, and `syncStatus: synced`; `tableCounts.sync_outbox` is `0`. **iPhone:** `s` grey; its `s` row carries the same correction id, `synced`. **Server:** one `s` record held by EA-B's un-confirm; three receipts; A03's `effective_at` equals its tap time (earlier than both of EA-B's) |
| **G1r: the same with roles swapped** (letter `t`) | The iPhone is the offline older phone (Airplane Mode, with Wi-Fi also switched off in Settings); the A03 confirms and un-confirms online. **In step (3), the iPhone waits on the session-form tracker sheet instead of the panel (Codex round 1).** Before reconnecting, start a literacy session, select the gate child, open its letter tracker, and mark one other letter (`v`) without saving. Then reconnect from Control Centre with the sheet still open. Reconnecting with queued work starts the sync on its own (`OfflineContext.js:288-295`), so no Sync now is needed | The same criteria, with the phones swapped, read on the open sheet. `t` turns grey and the `n/26` count drops by one without closing the sheet, and `v` still shows "added this session". No spinner appears during the pass. Then discard the session. This runs the `superseded` write-back on iOS and the sheet's refresh on a device |
| **G2: an hour-fast clock and a lost reply** (letter `m`) | (1) A03: automatic time off, clock +1 h, online. Tap `m` and, within about 1 s, turn Wi-Fi off. (2) Server read: A03's receipt for `m` exists, with `effective_at` ≈ real arrival time (not +1 h), and the record is confirmed by EA-A. The A03 export shows `m` `pending`, and Sync status shows 1 waiting. That is a lost reply. **If** the receipt is missing or the A03 shows `m` synced, repeat with a fresh letter (`n`, `l`, `o`, `u`), at most five attempts. (3) iPhone: tap `m` (green), sync, tap `m` (grey), sync. (4) A03, clock still +1 h and within the hour: Wi-Fi on, Sync now | **A03:** `m` grey, with the export row `confirmed: false`, `changedBy` EA-B and the server tuple = EA-B's un-confirm, `synced`. **iPhone:** `m` grey. **Server:** the record is EA-B's un-confirm. A03's correction id has exactly one receipt, and its `effective_at` is unchanged since step 2. If five attempts give no lost reply, record that, and the harness's `fast-clock-lost-reply` case stands as the proof for that half (orchestrator call, 2026-10-20); the rest of G2 must still pass on device. Afterwards, turn automatic time back on |
| **G3: screens** | Letter tracker panel and session-form tracker sheet on both phones, text size 1.0x and 1.3x | No clipping. The `n / 26` count matches the green tiles. Locked assessment tiles are unchanged |

- [ ] **Step 9: Docs.**
  - **Build log:** one Verification subsection with every command and count, the review rounds,
    the wipe counts, the hosted verification, and each gate row's result with its screenshot and
    export references.
  - **Build log Decision Register:** this plan's **(plan call)** items, each with a revisit
    trigger:
    - the server-derived programme;
    - `uuid-ossp`;
    - clearing unsynced keys;
    - the fresh reinstall after G0;
    - ask 4 deferred to Plan 3;
    - both tracker surfaces' reload on a mastery sync pass, through
      `useLetterMasterySyncRefresh` (uploads only; Plan 3's pull needs its own signal);
    - an older save keeps a newer still-owed correction, with the clamp to the phone's now and
      the strict comparison on `changed_at` (deviates from AR §10.2 "On the phone");
    - named conflict targets in `set_letter_mastery` (deviates from AR §10.2's
      `on conflict (correction_id)` text);
    - `isiZulu` → `zu`.
  - **ROADMAP:** close Ruling 11 for `letter_mastery` (`:149-152`). Mark D1 done (`:551-558`) and
    the re-key half of `:391-403` done, with its pull left to Plan 3. Update priority 5 (`:60`).
  - **Contract map:** "applied to hosted ⟨date⟩; device gate passed ⟨date⟩".
- [ ] **Step 10: PR.**
  - Open the PR, keeping issue-closing keywords out unless intended.
  - The PR body lists every deleted old-identity test with its replacement.
  - Ask Jim before merging.
