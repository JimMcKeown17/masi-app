# Assessment Results — Plan 3: History Pull — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new phone, a reinstall, or a second EA in the class downloads the current-year
assessment families, WelaPLUS runs and letter-mastery confirmations they may read. Each page lands
whole with its cursor. Sync status says when all of it is down, and the lesson engine can ask
whether a given set of children's mastery inputs are complete.

**Architecture:**
- **Server.** One migration adds `private.can_read_assessment` (owner arm, plus the current-year
  class arm of ADR-0005 follow-up 1) and new SELECT policies built on it. It also adds three
  bounded keyset page RPCs, each gated by a per-EA server switch. Assessment pages carry each
  family's items as one jsonb array, so a page is at most 200 rows under PostgREST's 1,000-row cap.
- **Phone, walks.** CAP-004's traversal is extracted from `sessionHistoryPull.js` into a shared
  walker, and sessions keep their exact behaviour. Three new walks run on it, in order: runs, then
  assessments, then mastery. The walks re-walk when the EA gains a class, a child in a held class
  or a delivery child. Each page applies set-wise in one transaction through the signed-in handle.
- **Phone, readers.** The Sync status History row reads all four cursors. Letter evidence is
  bounded to the current academic year (lesson-plan C23).

**Tech Stack:**
- Expo / React Native, JavaScript;
- SQLite (expo-sqlite; `better-sqlite3` in tests);
- Supabase Postgres 17 (plpgsql) with PostgREST via supabase-js;
- Jest.

**Spec:** `docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md` (AR):
§11 whole, §13, §14 (Plan 3 row), §15 (page apply, run merge, mastery merge, pull calls, read
predicate cases), §16. Plus `docs/superpowers/specs/2026-10-20-lesson-plan-design.md` rev 2,
§7.6 asks 3–5. Read with that spec's §7.2, §7.3, §7.5 and C23. Read AR §10 too: this plan consumes
Plan 2's mastery shape.

**Build path:** Codex (gpt-5.6-sol) builds each task; Claude reviews the diff and runs the tests (AGENTS.md). Codex usually cannot run git commit in its sandbox, so the orchestrator runs the commit steps.

## Global Constraints

**Dependencies (Task 0 verifies each one; a missing one stops the plan)**
- **AR Plan 2 is merged** (`docs/superpowers/plans/2026-10-20-assessment-results-plan-2.md`).
  This plan consumes these Plan 2 names:
  - `supabase/migrations/20261021160000_letter_mastery_current_state.sql`;
  - server `letter_mastery` columns `id, child_id, letter, language, confirmed, changed_at,
    correction_id, changed_by, programme_id (nullable), created_at, updated_at`, with
    `id = private.letter_mastery_id(child_id, letter, language)` (uuidv5) and no `user_id`;
  - `private.current_user_delivers_to_child(p_child_id uuid)` and the AR §10.3 SELECT policy
    `letter_mastery_select_writer_or_deliverer`;
  - `public.set_letter_mastery(...)`;
  - the local table: `confirmed`, `changed_at`, `correction_id`, `changed_by`, a nullable
    `programme_id` with **no FK** to `programmes`, `server_changed_at`, `server_correction_id`
    and the unique key `(child_id, letter, language)`. Server times are stored as raw PostgREST
    strings;
  - from `masteryRepository`:
    - `setLetterMastery({ childId, letter, language, confirmed, changedAt, programmeId, transaction })`;
    - `getLetterMastery({ transaction, childId, childIds, language })`, which excludes
      `terminal` rows;
    - the named export
      `applyCorrectionAcknowledgement(txn, { recordId, sentCorrectionId, result, outboxDeleted })`;
  - `letterMasteryDomainId({ childId, letter, language })` (`src/db/domainId.js`);
  - the harness `verify:letter-mastery:postgres`.

  Plan 2 leaves the page RPCs, the mastery merge, completeness and asks 3–5 to this plan.
- **AF is merged** (it lands before AR Plan 2).
- **C1 Task 4** (`src/services/pullCoverage.js`, `isCoverageWalkComplete`) must be on `main`
  before **Task 11** starts. Tasks 1–10 do not need it.
- **Server migration order.** The file sorts after every file in `supabase/migrations/` at build
  time, including Plan 2's and B2's `20261021140000_session_group_authorization.sql`. The proposed
  name is `20261022120000_assessment_history_pull.sql`; Task 0 renames it if anything sorts later.

**Branch and commands**
- Branch `feat/assessment-results-plan-3` in a new worktree off `main`. Run `npm ci` first.
- Node 20 for every jest, tsc and harness command: prefix
  `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH"`.
- Unit tests: `npx jest <file>`. Real-SQLite suites: add the file to `jest.integration.config.js`
  `testMatch`, then run `npm run test:integration -- <file>`.
- Assert rejections with `try/catch` or `rejects.toMatchObject`, never `rejects.toThrow()`.
- **Backend:** `masi-app-sqlite` (`segygjzpujphwvrubusm`) only. Never `jcqrlwetutnpuchjoyyd`. No
  raw `supabase` CLI from the repo root and no sourcing `.env.local`; use the isolated
  `sqlite:staging:*` helper (skill `sqlite-staging-sql`).

**Approvals**
- Jim's explicit yes at the time for the wipe, the hosted migration, any hosted fixture write and
  EAS builds. The controller does these, never the implementer.
- PostgreSQL harnesses run on a disposable PG17 at port **55432**, controller-run. Implementers
  write the cases and report them as unrun.

**Server values**
- **Read predicate** `private.can_read_assessment(p_user_id uuid, p_child_id uuid, p_assessment_date date)`
  is true when **either** arm holds:
  - owner: `p_user_id = auth.uid()`;
  - class: an active `class_ea_assignments` row (`ea_user_id = auth.uid()`,
    `unassigned_at is null`, any programme) on a class where `p_child_id` has a
    `child_class_memberships` row in the active academic year (`academic_years.is_active`),
    exited or not, **and** `p_assessment_date` falls between that year's `starts_on` and `ends_on`.
  - Delivery, historical delivery, group and `created_by` grant nothing.
- **A run's year date** is `(started_at at time zone 'Africa/Johannesburg')::date` (plan call:
  the programme day, as `src/utils/localDate.js` uses).
- **Page RPCs**, all `stable security definer set search_path = ''`, EXECUTE revoked from
  `public, anon` and granted to `authenticated`. Page size is 1–200 and overlap 0–600 s. A cursor
  is wholly null or wholly populated. Order is ascending `(updated_at, id)`.
  - `get_assessment_history_page(p_programme_id, p_page_size, p_after_updated_at, p_after_id, p_overlap_seconds)`;
  - `get_battery_run_history_page(...)`, with the same parameters;
  - `get_letter_mastery_page(p_after_updated_at, p_after_id, p_page_size, p_overlap_seconds)`.
- **Errors:**
  - `28000`: no `auth.uid()`;
  - `22023`: bad argument;
  - `MR001`, message `rollout_disabled`: the switch is off;
  - `55000`, message `no_active_academic_year`: no active year (assessment and run pages only).
- **Server switch:** table `private.history_pull_rollout`, features `assessments`,
  `battery_runs` and `letter_mastery`. A user row decides if present, else the everyone row
  (`user_id is null`), else off. The migration seeds an enabled everyone row per feature.

**Phone values**
- **Scopes (`sync_state`):**
  - `battery_run_history_pull:<userId>:<programmeId>`;
  - `assessment_history_pull:<userId>:<programmeId>`;
  - `letter_mastery_pull:<userId>`.
- **Page sizes:**
  - assessments: first page of each run **10**, then **50** (AR §11.3 "start at 50"; the smaller
    first page targets the 3 s first commit);
  - runs: **200**;
  - mastery: **200**.
- **Walk constants are CAP-004's:**
  - 15 s request deadline from enqueue;
  - 60 s run budget, checked between pages;
  - 120 s overlap on the first page of a delta that resumes from a completed cursor;
  - 15 min staleness;
  - re-walk backstop 6 days plus up to 2 days of jitter.
- **Log tags:** `[BatteryRunHistory]`, `[AssessmentHistory]`, `[LetterMasteryHistory]`. Logs
  carry counts and durations only, never ids, names, letters or user ids.
- **Local schema:** no migration (plan call; every table and column exists). If one becomes
  necessary, it takes the next free version at build time. Tests find it by name and compare
  against `CURRENT_SCHEMA_VERSION`, never a literal.
- **Handle rule (ADR-0008):**
  - production code reaches SQLite and the server only through the signed-in EA handle
    (`handle.withTransaction` facades, `handle.dataClient`, `handle.enqueueRequest`);
  - no repository singleton and no shared `supabase` data calls;
  - `__tests__/productionBindingStatic.test.js` stays green.
- **Copy (exact):**
  - Sync status History labels are unchanged: `Up to date`, `Downloading`, `Not downloaded yet`,
    `Incomplete since <time>`;
  - details are `Downloading history from Head Office…` and `History not fully downloaded yet`.

**Process**
- TDD per `.agents/skills/tdd`: failing test first, through public interfaces, real SQLite for
  transactions and page apply.
- Docs ship with the code (AGENTS.md anti-drift; AR §16). Each task updates the standing docs its
  change makes true and adds a Verification Register row to `documentation/build-log.md`.
  Parallel build-log appends conflict on rebase: keep both rows, in commit order.
- The orchestrator stages the listed files and ends each commit message with the session's
  attribution trailer. Never bare `git stash`.

## Review Focus

1. **The EA's own family comes back before its acknowledgement.** The upload committed, the
   response was lost, then a walk returns the family. The local pending row and its outbox row
   stay, nothing duplicates, and the retry returns `already_present`. Test: Task 5.
2. **A class or a child is gained between walks.** For example, Head Office gives the EA a class
   mid-year, or a delivery child moves into a held class. The next run re-walks and brings that
   year's older results down, and `masteryInputsComplete` stays false until it does.
   Tests: Task 7 and Task 11.
3. **The download is cut mid-page** (airplane mode, force-stop or a hung request). No partial
   family is ever stored, the cursor never passes an unsaved page, and the next run resumes
   forward. Tests: Task 5 (rejected and rolled-back pages), Task 7 (restart resumes) and the
   Task 14 gate.
4. **A stale mastery page lands after a newer correction was acknowledged, or a phone's clock is
   wrong.** The newer correction stays. Test: Task 6.
5. **A new academic year starts while the phone holds last year's results and cursors.** The
   assessment and run cursors reset. Last year's results stop counting as evidence on an old phone
   exactly as on a fresh one, and completeness is false until the new walk finishes.
   Tests: Task 7, Task 10 and Task 11.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20261022120000_assessment_history_pull.sql` (create) | Predicate, SELECT policies, switch, indexes, three page RPCs | 1, 2 |
| `scripts/assessment-history-postgres-harness.cjs` (create) | Disposable-PG proof of predicate, policies and RPCs | 1, 2 |
| `scripts/assessment-history-http-probe.cjs` (create) | Authenticated PostgREST proof (>1,000 items), volume fixture for gates | 3 |
| `src/services/historyWalk.js` (create) | Shared keyset walker extracted from CAP-004 | 4 |
| `src/services/sessionHistoryPull.js` (modify) | Session walk as a walker config; exports unchanged | 4 |
| `src/utils/serverTimestamps.js` (create) | Exact microsecond comparison of server timestamps and tuples | 6 |
| `src/db/repositories/historyPageApply.js` (create) | Set-wise apply helpers: id lookups, insert-or-ignore, reference children, run merge | 5 |
| `src/db/repositories/assessmentsRepository.js`, `batteryRunsRepository.js`, `masteryRepository.js` (modify) | `saveHistoryPage` per family | 5, 6 |
| `src/services/assessmentHistoryPull.js` (create) | The three walks, their scopes and scope queries | 7 |
| `src/services/assessmentHistoryStatus.js` (create) | Store (runs → assessments → mastery), status hook | 8 |
| `src/session/handleServices.js`, `src/context/{Children,Classes,Offline}Context.js`, `src/screens/assessments/AssessmentHistoryScreen.js` (modify) | Wiring and the four triggers | 8 |
| `src/utils/syncStatusPresenter.js`, `src/screens/main/SyncStatusScreen.js`, `src/db/repositories/childrenRepository.js`, reader screens (modify) | Combined History row; reference-child names in Assessment History; readers refresh as pages land | 9 |
| `src/db/repositories/assessmentsRepository.js`, `src/utils/letterMastery.js`, `src/utils/dashboardStats.js`, `src/screens/insights/LetterMasteryRankingScreen.js` (modify) | C23 year bound, one picker | 10 |
| `src/services/pullCoverage.js` (modify; C1 creates it) | `isMasteryInputsComplete` | 11 |

---

### Task 0: Preconditions and interface check (orchestrator, no commit)

- [ ] **Step 1: Dependencies.** Confirm on `main` and record in the build log:
  - AR Plan 2 merged, with every name in Global Constraints present as written. Check the
    policy with `select policyname, qual from pg_policies where tablename = 'letter_mastery'` on
    the replayed disposable database. Expected: only `letter_mastery_select_writer_or_deliverer`
    for SELECT. Check that the local `letter_mastery` DDL has no FK on `programme_id`.
  - If any name differs, adapt this plan's call sites and record the difference. If one is
    missing, stop: it belongs to Plan 2.
  - Plan 2 adds no phone-side server-timestamp comparator, so Task 6 creates one. If one has
    appeared since, reuse it.
  - AF merged.
  - Whether C1 Task 4 (`src/services/pullCoverage.js`) is merged. If not, Task 11 waits.
- [ ] **Step 2: Branch.** Create the worktree on `feat/assessment-results-plan-3` from `main` and run
  `npm ci`.
- [ ] **Step 3: Migration order.** Run `ls supabase/migrations | tail -5`. If anything sorts after
  `20261022120000`, pick a later timestamp and use it everywhere this plan names the file.
- [ ] **Step 4: Baseline.** Run `npx jest`, `npm run test:integration` and `npm run test:types`
  (Node 20 prefix). Then have the controller run every `verify:*:postgres` harness in
  `package.json`: the six on `main` on 2026-10-20, plus Plan 2's `verify:letter-mastery:postgres`.
  Record the counts. Expected: all green.

---

### Task 1: Server read authority — predicate, SELECT policies, switch, indexes

**Files:**
- Create: `supabase/migrations/20261022120000_assessment_history_pull.sql` (sections 1–4)
- Create: `scripts/assessment-history-postgres-harness.cjs`
- Modify: `package.json` (add `"verify:assessment-history:postgres": "node scripts/assessment-history-postgres-harness.cjs"`)
  and `.github/workflows/tests.yml` (a step like the assessment-results one, `tests.yml:63-68`)
- Docs: `documentation/rls-sync-contract-map.md`. Change `:123` and `:164`, and the
  `assessments`, `assessment_items` and `battery_runs` rows at `:876-878` (SELECT column). Also
  `docs/adr/0005-assessment-delivery-scope-two-tier-access.md` (a dated status line under its
  2026-09-04 note), `CONTEXT.md:259` (remove the "Current implementation gap" sentence),
  `documentation/ROADMAP.md:334` (tick) and the build log.

**Interfaces:**
- Consumes: Plan 2's `letter_mastery_select_writer_or_deliverer` and `set_letter_mastery`.
- Produces:
  - `private.can_read_assessment(p_user_id uuid, p_child_id uuid, p_assessment_date date) returns boolean`.
    It is `language sql stable security definer set search_path = ''`, EXECUTE revoked from
    `public, anon` and granted to `authenticated`, exactly as `private.can_read_session`.
  - Policies, each `for select to authenticated`:
    - `assessments_select_owner_or_class_year` on `assessments`, using
      `private.can_read_assessment(user_id, child_id, assessment_date)`;
    - `assessment_items_select_readable_assessment` on `assessment_items`, using an `exists` on
      the parent with the same call (items follow the parent);
    - `battery_runs_select_owner_or_class_year` on `battery_runs`, using the predicate with the
      run's year date (Global Constraints).
  - Dropped: `assessments_select_assigned_child_history`,
    `assessment_items_select_visible_assessment` and `battery_runs_select_assigned_child_history`.
  - **`letter_mastery`.** Plan 2's `letter_mastery_select_writer_or_deliverer` is AR §10.3's
    policy (AR §14 puts §10.1–10.3 in Plan 2). This file does not touch `letter_mastery`
    policies. The harness proves the policy, and Task 2 proves the pager matches it.
  - `private.history_pull_rollout`, with these columns:
    - `feature text not null check (feature in ('assessments','battery_runs','letter_mastery'))`;
    - `user_id uuid references auth.users(id) on delete cascade` (null means everyone);
    - `enabled boolean not null`, `note text`, `created_at timestamptz not null default now()`.

    It has a unique index on
    `(feature, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid))`, RLS on with no
    policies, and `revoke all … from public, anon, authenticated`. The everyone row per feature is
    seeded with `insert … select … where not exists`.
  - `private.history_pull_enabled(p_feature text, p_user_id uuid) returns boolean`: the user
    row's `enabled` if present, else the everyone row's, else false. It is definer, empty
    `search_path`, and has no EXECUTE for `authenticated`. It is called only inside the RPCs.
  - Indexes:
    - `idx_assessments_owner_programme_updated (user_id, programme_id, updated_at, id)`;
    - `idx_assessments_child_programme_updated (child_id, programme_id, updated_at, id)`;
    - `idx_battery_runs_owner_programme_updated (user_id, programme_id, updated_at, id)`;
    - `idx_battery_runs_child_programme_updated (child_id, programme_id, updated_at, id)`;
    - `idx_child_class_memberships_class_year_child (class_id, academic_year_id, child_id)`;
    - `idx_letter_mastery_changed_by_updated (changed_by, updated_at, id)`;
    - `idx_letter_mastery_child_updated (child_id, updated_at, id)`.
  - The file opens with session-level `SET lock_timeout = '10s'; SET statement_timeout = '60s';`
    and ends with `RESET statement_timeout; RESET lock_timeout;`. No `SET LOCAL`. Every statement
    is idempotent.

- [ ] **Step 1: Write the harness.** Copy `scripts/assessment-results-postgres-harness.cjs:1-140`:
  the imports from `history-authorization-postgres-harness.cjs`, `asActor`, `sqlAssert`,
  `expectSqlState`, and replaying every migration in `MIGRATIONS_DIR`.
  - **Fixture (plan call):** active year `2026` from the seed (`2026-01-15`–`2026-12-15`) plus an
    inactive `2025` year. Programme `literacy`. `CLASS_1` and `CLASS_2` in 2026, and `CLASS_OLD`
    in 2025.
  - `CHILD_A`'s 2026 memberships: `CLASS_2`, exited 2026-05-01, then `CLASS_1`, active.
    Its 2025 membership: `CLASS_OLD`.
  - `CHILD_B`'s 2025 membership: `CLASS_1`, and none in 2026.
  - Actors, as the CAP-004 matrix plus four:

  | # | Actor | Grants |
  |---|---|---|
  | 1 | `OWNER` | records every fixture assessment |
  | 2 | `CLASS_ONLY` | active class assignment on `CLASS_1` |
  | 3 | `FORMER_DELIVERY` | ended delivery assignment on `CHILD_A` |
  | 4 | `CURRENT_DELIVERY` | active delivery assignment on `CHILD_A`, no class assignment |
  | 5 | `GROUP_ONLY` | group assignment whose group holds `CHILD_A` |
  | 6 | `UNRELATED` | nothing |
  | 7 | `OLD_CLASS` | active class assignment on `CLASS_2` |
  | 8 | `ENDED_CLASS` | an ended (`unassigned_at` set) class assignment on `CLASS_1` |
  | 9 | `LAST_YEAR_CLASS` | active class assignment on `CLASS_OLD` |

  - Assessments, all by `OWNER` and inserted as `postgres` with explicit columns:
    - `A_2026_EARLY`: `CHILD_A`, dated 2026-03-01, taken while the child was in `CLASS_2`;
    - `A_2026_LATE`: `CHILD_A`, dated 2026-09-01, with 3 items;
    - `A_2025`: `CHILD_A`, dated 2025-11-01;
    - `B_2026`: `CHILD_B`, dated 2026-08-01.
  - Two runs for `CHILD_A`:
    - `RUN_2026`, started `2026-03-01T08:00Z`;
    - `RUN_YEAR_EDGE`, started `2026-01-14T23:30:00Z`, which is 01:30 SAST on 2026-01-15 and so
      falls inside 2026.
- [ ] **Step 2: Write the read-predicate cases** (direct `SELECT` as each actor, rolled back):

  | Case | Expected |
  |---|---|
  | `OWNER` | sees all four assessments, items of each, both runs (the owner arm has no year bound) |
  | `CLASS_ONLY` (new class after a mid-year move) | `A_2026_EARLY`, `A_2026_LATE`, their items and both runs; not `A_2025`, not `B_2026` (a 2025 membership grants nothing in 2026) |
  | `OLD_CLASS` (old class after a mid-year move; exited membership counts) | same as `CLASS_ONLY` |
  | `CURRENT_DELIVERY` (delivery-only, no class assignment) | nothing |
  | `FORMER_DELIVERY`, `GROUP_ONLY`, `UNRELATED`, `ENDED_CLASS` | nothing |
  | `LAST_YEAR_CLASS` | nothing: last year's assessment hidden; the active year decides |
  | items follow parent | for every actor, `count(assessment_items)` visible equals the sum of `total_items` over the parents it sees |
  | run year edge | `CLASS_ONLY` sees `RUN_YEAR_EDGE` (the SAST date is 2026-01-15) |
  | mastery (Plan 2's policy), on its own child `CHILD_M` | 1. `FORMER_DELIVERY` holds an active delivery assignment on `CHILD_M` and confirms `k` (Plan 2 `set_letter_mastery`). 2. Head Office ends that assignment and gives `CHILD_M` to `CURRENT_DELIVERY`. 3. `FORMER_DELIVERY` still sees the record (last writer). 4. `CURRENT_DELIVERY` un-confirms `k`. 5. `FORMER_DELIVERY` sees nothing, while `CURRENT_DELIVERY` sees the record with `confirmed = false`. `CLASS_ONLY` (given a class assignment on `CHILD_M`'s class) and `UNRELATED` see nothing at every step. |
  | grants | `has_function_privilege('anon', 'private.can_read_assessment(uuid,uuid,date)', 'EXECUTE')` false; `authenticated` reading or inserting `private.history_pull_rollout` → `42501`; `authenticated` executing `private.history_pull_enabled` → `42501` |
  | switch seed | three everyone rows, all enabled; re-applying the file leaves three |

- [ ] **Step 3: Controller RED.** Run
  `HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres HISTORY_RLS_DATABASE_NAME=masi_history_rls_assessment_history HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE PGTZ=UTC PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npm run verify:assessment-history:postgres`.
  Expected: FAIL in an executed assertion, because `CURRENT_DELIVERY` sees `A_2026_LATE` through
  today's child-read helper. A guard error is not RED.
- [ ] **Step 4: Write sections 1–4 of the migration:** bounds; predicate and policies; switch
  table and function; indexes.
- [ ] **Step 5: Controller GREEN.** Rerun the new harness. Expected: its pass JSON. Then rerun every
  other `verify:*:postgres` harness on the same server. Expected: all pass. The
  upload-contract harness's assessment cases still pass, because writes do not use SELECT.
- [ ] **Step 6: Docs.**
  - Contract map:
    - `:123`: the assessment row now reads "owner, or current-year class scope through
      `private.can_read_assessment` (built, migration `20261022120000`)";
    - `:164`: replace the bullet with "the assessment class arm is current-year bounded by the
      predicate";
    - SELECT column of `:876-878`: the new policies.
  - ADR-0005: a status line naming the migration.
  - CONTEXT: remove the gap sentence.
  - ROADMAP `:334`: ticked, with a pointer.
  - Build log row with the harness counts.
- [ ] **Step 7: Commit** `feat(supabase): current-year class predicate for assessment and run reads; history pull switch`.

---

### Task 2: Server page RPCs

**Files:**
- Modify: `supabase/migrations/20261022120000_assessment_history_pull.sql` (sections 5–7)
- Modify: `scripts/assessment-history-postgres-harness.cjs`
- Docs: the contract map's Operation Semantics table (new rows after `:199`, the CAP-004 rows) and
  the build log

**Interfaces:**
- Consumes: Task 1's predicate, switch and indexes.
- Produces (each follows `get_delivery_history_page`,
  `20260925120000_session_history_family_delta.sql:54-130`. Each validates in this order: auth,
  switch, arguments, year. Each has two arms, each ordered and limited before a `union` of ids,
  then joins back, orders and limits):
  - **`public.get_assessment_history_page(p_programme_id uuid, p_page_size integer default 50, p_after_updated_at timestamptz default null, p_after_id uuid default null, p_overlap_seconds integer default 0)`**
    - It returns `table(...)` with the columns of `SERVER_COLUMNS.assessments`
      (`src/services/syncServerColumns.js:82-90`), plus:
      - `items jsonb`: `jsonb_agg(jsonb_build_object('id','position','item_key','prompt','response','is_correct','metadata') order by position)`,
        or `'[]'` for zero items. Per item it omits `assessment_id`, `created_at` and
        `updated_at` (plan call). The phone fills them from the parent: AR §8.4 says one
        `now()` per family, and `saveQuestionResult` gives items the parent's `created_at`
        (`assessmentsRepository.js:131-145`).
      - `battery_run jsonb`: the run's `SERVER_COLUMNS.battery_runs` fields via
        `jsonb_build_object`, or null;
      - `child_first_name`, `child_last_name`, `child_preferred_name`.
    - The arms, both with `programme_id = p_programme_id`, `question_code is not null`,
      `assessment_date` inside the active year (from `academic_years where is_active`, else
      `55000`), and the keyset:
      - owner: `user_id = auth.uid()`;
      - class: `child_id in (members this year of classes the caller holds an active class assignment on)`.
  - **`public.get_battery_run_history_page(p_programme_id uuid, p_page_size integer default 200, p_after_updated_at timestamptz default null, p_after_id uuid default null, p_overlap_seconds integer default 0)`**:
    `SERVER_COLUMNS.battery_runs` plus the three name columns. It has the same arms on runs, with
    the run's SAST year date.
  - **`public.get_letter_mastery_page(p_after_updated_at timestamptz default null, p_after_id uuid default null, p_page_size integer default 200, p_overlap_seconds integer default 0)`**
    - It returns Plan 2's server columns (`id, child_id, letter, language, confirmed, changed_at,
      correction_id, changed_by, programme_id, created_at, updated_at`; `programme_id` may be
      null) plus the three name columns.
    - The arms are the two disjuncts of Plan 2's `letter_mastery_select_writer_or_deliverer`,
      written out so each arm can use its index:
      - last writer: `changed_by = auth.uid()`;
      - deliverer: `child_id in (caller's active child_ea_assignments)`, the set
        `private.current_user_delivers_to_child` tests.
    - It is not programme-scoped and has no year bound. It includes `confirmed = false` rows.
  - Switch features: `'assessments'`, `'battery_runs'` and `'letter_mastery'` respectively.
  - Grants as in Global Constraints.

- [ ] **Step 1: Write the pull-call cases** (reuse Task 1's fixture; page walks run as each actor):

  | Case | Expected |
  |---|---|
  | RPC equals policy | for each of the 9 actors, walking `get_assessment_history_page` to exhaustion at page size 1 returns exactly the ids that actor's direct `SELECT` sees with `programme_id = literacy and assessment_date` in 2026; the same holds for runs, and for mastery with no filter |
  | owner year bound | `OWNER`'s pages exclude `A_2025` |
  | whole family | `A_2026_LATE`'s row has `items` of length 3 = `total_items`, ordered by position, each with exactly the 7 keys; a skipped (zero-item) family has `items = []` |
  | run header | a Q1 family's `battery_run.id` equals its run and `started_at` round-trips; a standalone family has `battery_run` null |
  | child projection | the row's keys beyond the parent and items are exactly `battery_run, child_first_name, child_last_name, child_preferred_name` |
  | run walk | a zero-Question run is returned; after `save_battery_run` completes it, a delta from the previous cursor returns it again with `status = 'completed'` (status-only change moves `updated_at`) |
  | mastery pager | after the Task 1 handover sequence, `FORMER_DELIVERY` gets the record at step 3 and nothing at step 5 |
  | keyset | five rows with one pinned `updated_at` (as `postgres` with `session_replication_role = replica`, as `history-authorization-postgres-harness.cjs:747-754`) at page size 1 return once each; `p_overlap_seconds = 120` re-returns a row stamped 60 s before the cursor |
  | arguments | page size 0 or 201, overlap 601, a half cursor, or a null `p_programme_id` → `22023` |
  | auth | anon EXECUTE → `42501`; authenticated with no `sub` → `28000` |
  | no active year | with `is_active` cleared in a rolled-back transaction, assessment and run pages → `55000`; the mastery page still works |
  | switch | delete the `assessments` everyone row: every actor gets `MR001`. Insert `OWNER`'s row enabled: only `OWNER` gets rows. Restore the everyone row and set `OWNER`'s row disabled: `OWNER` gets `MR001` and `CLASS_ONLY` gets rows. Each feature gates only its own RPC. |
  | server stamps | after `submit_assessment`, `save_battery_run` and Plan 2's `set_letter_mastery`, each row's `updated_at` equals that transaction's `now()` even when the payload carried 2001 |
  | dense plan gate | copy `runDensePlanChecks` (`history-authorization-postgres-harness.cjs:735-791`) with 20,000 noise assessments by another EA in the programme. A sparse class-arm first page and a dense owner deep page each use less than one tenth of the raw-RLS baseline's root shared blocks (`collectPlanMetrics`). |

- [ ] **Step 2: Controller RED.** Run the Task 1 command. Expected: FAIL, because the function does
  not exist.
- [ ] **Step 3: Write sections 5–7.**
- [ ] **Step 4: Controller GREEN.** Run the new harness, then all other harnesses. Expected: all
  pass. Record the dense-plan numbers.
- [ ] **Step 5: Docs.** Contract map Operation Semantics gets three rows. Each gives the signature,
  bounds, arms, partition key (programme, not a grant), year source (server), item shape, switch
  and errors. Build log row.
- [ ] **Step 6: Commit** `feat(supabase): bounded history pages for assessments, runs and letter mastery`.

---

### Task 3: Authenticated HTTP probe and volume fixture

AR §11.2: "An authenticated HTTP test proves the shape with a page whose families total more than
1,000 items. A direct-SQL harness case cannot show the cap."

**Files:**
- Create: `scripts/assessment-history-http-probe.cjs`
- Create: `__tests__/assessmentHistoryHttpProbe.test.js` (CI-safe; pure helpers only)
- Modify: `package.json` (`"assessment-history:probe": "node scripts/assessment-history-http-probe.cjs"`)

**Interfaces:**
- Consumes: `validateProbeEnv` and the env-loading pattern from `scripts/rls-visibility-probe.cjs`
  (`:17-43`, `:458-463`). It uses the same four `*_SQLITE` variables and refuses any ref other
  than `segygjzpujphwvrubusm`.
- Produces:
  - `buildProbeFamilies({ userId, childId, programmeId, assessmentDate, families = 20, itemsPerFamily = 61 }) → { assessments, items }`.
    It builds rows with valid Plan 1 shapes and fresh `randomUUID()` ids, which the script records
    for cleanup.
  - `validateProbePage(rows, { families, itemsPerFamily }) → { ok, errors }`. It checks the row
    count, `items.length === total_items === itemsPerFamily`, the position order, and that the
    item total exceeds 1,000.
  - `buildVolumeFixture({ eaUserId, coEaUserId, programmeId, academicYearId, classes = 2, childrenPerClass = 35, resultsPerChild = 2, deliveryChildren = 30, confirmationsPerChild = 26 }) → { tables: { [table]: rows[] } }`
    builds the realistic-volume gate account (plan call): 140 families, 8,540 items and 780
    confirmations. Results are recorded by the co-EA. The gate EA holds the class assignments and
    the delivery assignments.
  - Modes:
    - `probe` (default) seeds a disposable EA (auth user, `users`, a staff programme assignment,
      a child), inserts the 20 × 61 families as service role, and signs in as the EA. It calls
      `rpc('get_assessment_history_page', { p_programme_id, p_page_size: 50, p_after_updated_at: null, p_after_id: null, p_overlap_seconds: 0 })`
      and validates the page. As a cap control, a service-role
      `from('assessment_items').select('id').in('assessment_id', ids)` must return exactly
      1,000 rows. It then cleans up and asserts zero residue.
    - `seed-volume` prints a disposable gate EA's email and password to the operator's terminal
      only. `cleanup-volume` removes everything the seed made, keyed by its namespace, and
      asserts zero residue.

- [ ] **Step 1: Write the failing unit tests:**
  - `buildProbeFamilies` defaults give 20 families and 1,220 items, every family passing
    `assertSubmitShape` (after adding `items`);
  - `validateProbePage` rejects a page with one 60-item family and accepts the full page;
  - `buildVolumeFixture` defaults give exactly 140 families, 8,540 items and 780 mastery rows;
  - `validateProbeEnv` refuses `jcqrlwetutnpuchjoyyd`.
- [ ] **Step 2: Run** `npx jest __tests__/assessmentHistoryHttpProbe.test.js`. Expected: FAIL
  (module missing).
- [ ] **Step 3: Implement the script.** No dotenv dependency (reuse `parseEnvContent`), and no
  CLI.
- [ ] **Step 4: Run.** Expected: PASS. The live run is Task 13, which Jim runs.
- [ ] **Step 5: Commit** `test(supabase): authenticated history page probe and volume fixture`.

---

### Task 4: Shared history walker, extracted from CAP-004

**Decision (plan call): extract.** The three new walks need everything `runOnce` does
(`src/services/sessionHistoryPull.js:64-297`):
- deadline from enqueue;
- budget between pages;
- failure memory;
- completeness only after an exhausted error-free walk;
- coverage re-walks and the jittered backstop;
- single flight and actor fencing.

Copying it three times would give four copies of the subtlest code in the sync layer. Sessions
stay byte-for-byte in behaviour: same log lines, same cursor JSON, same exports. Their existing
suites are the guard and are not edited.

**Files:**
- Create: `src/services/historyWalk.js`
- Modify: `src/services/sessionHistoryPull.js` (becomes a walk config plus its existing exports)
- Test: create `__tests__/historyWalk.test.js` (real SQLite); add it to `jest.integration.config.js`
- Guard (unchanged, must stay green): `__tests__/sessionHistoryPull.test.js`,
  `__tests__/sessionHistoryPullProductionRouting.test.js`, `__tests__/sessionHistoryStatus.test.js`
  and `__tests__/OfflineContext.test.js`

**Interfaces:**
- Produces, in `historyWalk.js`:
  - `HISTORY_WALK_DEFAULTS = { requestTimeoutMs: 15_000, runBudgetMs: 60_000, overlapSeconds: 120, stalenessMs: 900_000, rewalkMinMs: 6 * DAY_MS, rewalkJitterMs: 2 * DAY_MS }`.
  - `createHistoryWalkState() → { actorGeneration: 0, inFlight: Map }` and
    `resetHistoryWalkState(state)`.
  - `runHistoryWalk({ userId, force = false, deps, walk }) → Promise<{ status, pages }>`, single
    flight per `deps.state` and `userId`.
    - `status` is one of `'fresh'`, `'complete'`, `'partial'`, `'dependency'`, `'transport'`,
      `'query'`, `'cancelled'` or `'disabled'`.
    - `deps` is exactly today's `runSessionHistoryPull` deps (`:65-77`).
  - The `walk` object:
    - `tag: string`, used in log lines;
    - `coverageKeys: ('childIds' | 'classIds')[]`;
    - `pageSize: number`, `firstPageSize = pageSize`, `logTiming = false`;
    - `resolveScope({ db, userId }) → Promise<{ scope, windowStart: string | null, context } | null>`.
      A null result gives `'dependency'` with no request and no write;
    - `readCoverage({ db, userId, context }) → Promise<{ childIds: string[], classIds?: string[] }>`;
    - `fetchPage({ request, position, overlapSeconds, pageSize, context }) → Promise<{ rows: object[], data?: any }>`.
      `rows` must be in `(updated_at, id)` order. The walker reads the row count and the last
      row's `updated_at`/`id`, and passes `data ?? rows` to `savePage`;
    - `savePage({ data, scope, pullState, admit }) → Promise<void>`.
  - Cursor fields are CAP-004's (`sessionHistoryPull.js:90-95`). For each coverage key `k`, the
    walker keeps `firstWalk<K>`, `rewalk<K>` and `rescan<K>`, where `K` is `ChildIds` or
    `ClassIds`. Class fields appear only when `classIds` is a coverage key, so the session cursor
    JSON is unchanged.
  - A re-walk is due when, beyond CAP-004's conditions (`:114-117`), any current id of any
    coverage key is absent from its `rescan<K>` set. Gains trigger a re-walk; losses do not,
    because they bring nothing new. Task 11 checks losses at read time.
  - A `windowStart` that differs from the stored one resets the cursor (`:98-101`). A null
    `windowStart` never resets.
  - `request(rpcName, args)` keeps `withDeadline` (`:42-62`). An error with `code === 'MR001'`
    stops the run as `'disabled'`.
  - **`'disabled'`** records `lastFailureAt` (so the walk is not complete), keeps `updatedAt` and
    `id`, and logs the end line with `console.log`, not `console.warn`.
  - **Page size.** The first page of each run asks for `firstPageSize`, later pages for
    `pageSize`. A page is exhausted when it holds fewer rows than were asked for.
  - **Log lines.**
    - The start line is CAP-004's (`:130`) with `[<tag>]`.
    - The end line is CAP-004's (`:213-216`). When `logTiming` is set, it adds
      ` rpcMs=<n> saveMs=<n> firstCommitMs=<n|none>` before any ` failureKind=… error=…` suffix.
    - `firstCommitMs` runs from run start to the first resolved `savePage`.
- Produces, in `sessionHistoryPull.js`: every current export, with its name and value
  (`SESSION_HISTORY_*`, `sessionHistoryScope`, `createSessionHistoryState`,
  `resetSessionHistoryState`, `runSessionHistoryPull`). The session walk is
  `tag: 'SessionHistory'`, `coverageKeys: ['childIds']`, `pageSize: 200`, `logTiming: false`.
  It keeps today's scope query (`:84-101`), delivery-children coverage query (`:103-107`), two-RPC
  fetch (`:146-160`, `:192-203`) and `saveHistoryPage` call (`:165-182`).

- [ ] **Step 1: Refactor guard.** Run
  `npm run test:integration -- __tests__/sessionHistoryPull.test.js __tests__/sessionHistoryPullProductionRouting.test.js`
  and `npx jest __tests__/sessionHistoryStatus.test.js __tests__/OfflineContext.test.js`. Record
  the counts.
- [ ] **Step 2: Extract** `runOnce`, `withDeadline`, `HistoryRunStop` and the single-flight
  wrapper into `historyWalk.js`. Rewrite `sessionHistoryPull.js` as the session walk config.
- [ ] **Step 3: Run Step 1's commands.** Expected: the same counts pass, and
  `git diff --stat -- __tests__/` is empty.
- [ ] **Step 4: Write the failing walker tests** (`historyWalk.test.js`, a `Probe` walk over a
  scripted row list, `random: () => 0.5`):
  - `a class gained between runs re-walks from the start`. A walk with
    `coverageKeys: ['childIds', 'classIds']` completes with `rescanClassIds: ['class-1']`. Then
    `readCoverage` returns `classIds: ['class-1', 'class-2']`, and the next unforced run's first
    fetch has `position: null`. After it, `rescanClassIds` is `['class-1', 'class-2']`.
  - `a class lost does not re-walk`: `classIds: []` after completion gives `{ status: 'fresh' }`
    within 15 minutes.
  - `the first page uses firstPageSize`. With `firstPageSize: 10, pageSize: 50` and 75 rows, the
    fetches ask for `[10, 50, 50]` and the result is `{ status: 'complete', pages: 3 }`. A run
    resumed after a budget stop asks for 10 first again.
  - `MR001 stops as disabled and keeps the position`. The second page returns
    `{ error: { code: 'MR001', message: 'rollout_disabled' } }`, giving
    `{ status: 'disabled', pages: 1 }`. The cursor keeps page 1's last `updatedAt`/`id`,
    `lastFailureAt` is set and `console.warn` is not called. A later run's first fetch carries
    page 1's last id with `overlapSeconds: 0`, because the walk was not complete.
  - `a null windowStart never resets`: a stored cursor with `windowStart: null` keeps its
    position.
  - `timing is logged without ids`. With `logTiming: true`, the end line matches
    `/^\[Probe\] end status=complete pages=1 durationMs=\d+ complete=true rpcMs=\d+ saveMs=\d+ firstCommitMs=\d+$/`
    and no line contains a row id or `user-1`.
  - `a session cursor has no class fields`: run the session walk once and assert the stored
    cursor has no key matching `/ClassIds$/`.
- [ ] **Step 5: Run** `npm run test:integration -- __tests__/historyWalk.test.js`. Expected:
  FAIL.
- [ ] **Step 6: Implement** class coverage, `firstPageSize`, `'disabled'`, timing and the null
  window.
- [ ] **Step 7: Run** Step 1's commands and Step 5's. Expected: PASS, with session counts
  unchanged.
- [ ] **Step 8: Docs.**
  - Contract map, CAP-004 section (`:759`): "traversal lives in `src/services/historyWalk.js`;
    sessions are one walk config".
  - Fix `:761-763`. The scope is one row per EA and programme in the EA's **own** file
    (ADR-0008), not a file shared by every EA. Skip this if C1 or B2 already merged the fix.
  - `docs/agent-context/cap-004-session-history-hydration.md:90`: point to both files.
  - Build log row with Step 1, 3 and 7 counts.
- [ ] **Step 9: Commit** `refactor(sync): extract CAP-004's traversal into a shared history walker`.

---

### Task 5: Assessment and run page apply

**Files:**
- Create: `src/db/repositories/historyPageApply.js`
- Modify: `src/db/repositories/assessmentsRepository.js` (add `saveHistoryPage` to the factory and
  its return block, `:236-243`) and `src/db/repositories/batteryRunsRepository.js` (add
  `saveHistoryPage`, `:111-119`)
- Test: create `__tests__/assessmentHistoryPage.test.js` and `__tests__/batteryRunHistoryMerge.test.js`
  (real SQLite; add both to `jest.integration.config.js`)
- Docs: contract map (the new section from Task 7 starts here as "Page apply"), ROADMAP `:367`
  (tick for assessments and runs), build log

**Interfaces:**
- Consumes: `assertSubmitShape` (`src/services/assessmentFamilyPayload.js:74`);
  `createSyncStateRepository(...).setPullState(scope, pullState, { transaction })`;
  `runRepositoryTransaction`.
- Produces, in `historyPageApply.js` (all run inside a caller's transaction facade, one SQL
  statement per call, as `src/session/signedInHandle.js:125-155` requires):
  - `SQLITE_BINDING_BUDGET = 999` (plan call: the lowest SQLite default, safe on every build).
  - **(plan call)** AR §11.3 asks for prepared statements, but the handle facade exposes only
    `runAsync`, `getFirstAsync` and `getAllAsync` (`signedInHandle.js:137-155`). So the apply
    uses a few multi-row statements per page instead, which gives the same gain (ROADMAP `:367`,
    Zazi Z2).
  - `selectRowsByIds(txn, table, ids, columns) → Promise<Map<string, row>>`, chunked so each
    statement binds at most 999 values.
  - `insertOrIgnoreRows(txn, { table, columns, rows }) → Promise<void>`: multi-row
    `insert or ignore into <table> (<columns>) values (…), (…)`, chunked to the budget.
  - `ensureHistoryReferenceChildren(txn, identities) → Promise<number>`. `identities` is
    `{ child_id, child_first_name, child_last_name, child_preferred_name }[]`. It inserts only the
    absent ids as `history_reference = 1, sync_status = 'synced'`. Present children, roster or
    reference, are never rewritten (CAP-004 rule, `sessionsRepository.js:283-298`).
  - `assertPulledRunShape(run) → void` throws `TypeError` unless:
    - `id`, `user_id`, `child_id` and `programme_id` are UUIDs;
    - `status` is one of the 3 values;
    - `completed_at` is set if and only if the status is `completed`;
    - `started_at` is an ISO timestamp;
    - `language` matches `^[a-z]{2}$`.
  - `mergePulledRunHeaders(txn, runs) → Promise<{ inserted: number, advanced: number }>`, per
    AR §11.3:
    - an absent run is inserted with `started_here = 0, sync_status = 'synced', server_updated_at = updated_at`;
    - a present run with `started_here = 1` is left untouched;
    - a present run with `started_here = 0` takes the incoming `status`, `completed_at`,
      `updated_at` and `server_updated_at` only when the local status is `in_progress` and the
      incoming one is `completed` or `abandoned`.
    - `class_id` is stored exactly as pulled, a plain column (`migrations.js:759`).
- Produces, in repositories:
  - **`assessments.saveHistoryPage(rows, { scope, pullState, admit }) → Promise<{ inserted: number, present: number, runsInserted: number, runsAdvanced: number }>`**.
    1. Before the transaction, for each row it builds the flat family:
       `{ ...parentColumns, items: row.items.map(i => ({ ...i, assessment_id: row.id, created_at: row.created_at })) }`
       and calls `assertSubmitShape`. Any failure throws a `TypeError` with `kind = 'query'`,
       which rejects the page whole. This includes `items.length !== total_items` (AR §11.3).
       The run header goes through `assertPulledRunShape`.
    2. Then, in one transaction:
       - `admit()`;
       - the history reference children;
       - the run headers of the page (deduplicated);
       - one `selectRowsByIds` on `assessments`;
       - `insertOrIgnoreRows` for absent parents (`sync_status = 'synced'`,
         `server_updated_at = updated_at`) and their items (`assessment_id`, `created_at`,
         `updated_at` and `server_updated_at` from the parent; `is_correct` as 0/1;
         `metadata` as JSON text);
       - the cursor;
       - `admit()` again, with no await after it (`sessionsRepository.js:263-267, 318-325`).
    - Present parents, whatever their `sync_status`, and their items are left alone: an
      immutable fact (ADR-0007). It writes no outbox row.
  - **`batteryRuns.saveHistoryPage(rows, { scope, pullState, admit }) → Promise<{ inserted: number, advanced: number }>`**:
    shape check, then `admit`, children, `mergePulledRunHeaders`, cursor and `admit`, in one
    transaction.

- [ ] **Step 1: Write the failing page tests** (`assessmentHistoryPage.test.js`;
  `createMigratedDatabase` + `seedCoreData`; a `serverFamily(n, { items = 61, run = null, childId = 'child-1' })`
  fixture shaped like Task 2's row):
  - `a page of 50 families of 61 items lands with its cursor`: 50 parents and 3,050 items, all
    `synced`; `select count(*) from sync_outbox` = 0; the `sync_state` row for the scope holds the
    passed cursor; every item's `assessment_id`, `created_at` and `updated_at` equal its parent's.
  - `replaying the page changes nothing`: identical counts and no error.
  - `a pending local family with the same id is left alone` (Review Focus 1).
    `saveQuestionResult` writes a family. Then a page carries the same id with server columns.
    Afterwards the parent is still `pending`, the `assessments:<id>:insert` outbox row is
    unchanged, and there are still 61 items.
  - `a short items array rejects the page whole`. Of three families, the second has
    `total_items: 61` and 60 items. Inside `try/catch`, the call throws with `kind === 'query'`,
    and there are zero new parents or items and no cursor row.
  - `an unknown child becomes a history reference child; a roster child keeps its names`.
  - `a Q1 result whose run is not on the phone lands with the run first`, with foreign keys
    enforced: the run is stored with `started_here = 0`, then the assessment's `battery_run_id`.
  - `the statement budget holds`. Using `createCountingSqliteTestDatabase`
    (`test-support/countingSqliteAdapter.js`), the 50 × 61 page uses fewer than 100 statements
    (the per-row CAP-004 path would be over 3,000).
  - `an actor change at the cursor write rolls back the whole page`. `admit` returns false on its
    second call, giving zero parents, zero items and no cursor
    (`sessionHistoryPull.test.js:256-281` pattern).
  - `the multi-row statements pass the signed-in facade`. Through `requestOpen` and
    `expoSQLiteRealEngine` (`sessionHistoryPullProductionRouting.test.js:1-20` pattern), a 10 × 61
    page saves through `createAssessmentsRepository({ database: handle })`.
- [ ] **Step 2: Write the failing merge tests** (`batteryRunHistoryMerge.test.js`):
  - `in_progress then completed converges`: header A (`in_progress`), then A (`completed`, with
    `completed_at`), gives one row, completed with that `completed_at`.
  - `a stale in_progress never reopens a completed run`.
  - `a different terminal status never replaces a terminal one` (completed stays completed).
  - `a run started here is never changed by a pull`. After `startRun` (pending,
    `started_here = 1`), a pulled `completed` header leaves the row and its outbox row unchanged.
  - `a hydrated run keeps started_here = 0` through a reopened database and a later advancing
    merge.
  - `an owned run whose class is not on the phone keeps its exact class_id`.
- [ ] **Step 3: Run** `npm run test:integration -- __tests__/assessmentHistoryPage.test.js __tests__/batteryRunHistoryMerge.test.js`.
  Expected: FAIL.
- [ ] **Step 4: Implement** `historyPageApply.js` and the two `saveHistoryPage` functions.
- [ ] **Step 5: Run** the two suites, then `npx jest __tests__/productionBindingStatic.test.js`.
  Expected: PASS.
- [ ] **Step 6: Docs and commit.** Contract map page-apply rules for both families; ROADMAP `:367`
  ticked for assessments and runs; build log. Commit
  `feat(db): set-wise history page apply for assessment families and runs`.

---

### Task 6: Mastery page apply — the monotonic merge

**Files:**
- Create: `src/utils/serverTimestamps.js`, unless Task 0 found Plan 2's equivalent
- Modify: `src/db/repositories/masteryRepository.js` (Plan 2's version; add `saveHistoryPage`)
- Test: create `__tests__/serverTimestamps.test.js` (unit) and
  `__tests__/letterMasteryHistoryPage.test.js` (real SQLite; add to `jest.integration.config.js`)
- Docs: contract map, `documentation/LEARNING.md` (a short section: why the merge compares accepted
  server tuples and never the local edit's own time), build log

**Interfaces:**
- Produces, in `serverTimestamps.js`:
  - `serverTimestampMicros(value: string | null) → number | null`. It gives exact epoch
    microseconds for ISO-8601 with 0–6 fraction digits and `Z` or `±HH:MM`. It never rounds
    through a millisecond `Date`. It returns null when the value is unparseable or not a safe
    integer.
  - `compareServerTimestamps(a, b) → -1 | 0 | 1 | null`, null when either side is unparseable.
  - `compareServerTuples([atA, idA], [atB, idB]) → -1 | 0 | 1 | null`: by time, then by
    lowercase id string. Lowercase hyphenated text sorts as Postgres sorts `uuid`, the tie-break
    the server uses in AR §10.2.
- Produces **`mastery.saveHistoryPage(rows, { scope, pullState, admit }) → Promise<{ inserted: number, applied: number, skipped: number }>`**,
  per AR §11.3:
  - **Shape.** `changed_at` must be parseable, `correction_id` a UUID, `confirmed` a boolean and
    `letter` and `language` nonempty. Otherwise the whole page is rejected (`kind = 'query'`).
  - **In one transaction:**
    - `admit()`;
    - the history reference children;
    - one `selectRowsByIds` on `letter_mastery`;
    - one lookup of `sync_outbox` rows for those record ids;
    - then per row:
      - **absent:** insert it, `synced`, with `server_changed_at = changed_at` and
        `server_correction_id = correction_id`;
      - **local `pending` or `failed`, or any outbox row for the record:** skip;
      - **local `synced`:** apply only if
        `compareServerTuples(pulled, [local.server_changed_at, local.server_correction_id]) === 1`;
      - **local `terminal`:** apply if the result is `1` or `0`;
      - a null local tuple counts as lowest, so apply.
    - "Apply" overwrites `confirmed`, `changed_at`, `correction_id`, `changed_by`,
      `programme_id`, `created_at`, `updated_at`, `server_updated_at` and both server ordering
      columns, and sets `sync_status = 'synced', last_sync_error = null`.
    - It never touches `sync_outbox`, so a refused correction stays visible in needs-attention.
    - Then the cursor, and `admit()`.

- [ ] **Step 1: Write the failing unit tests** (`serverTimestamps.test.js`):

```js
const base = Date.UTC(2026, 9, 20, 8, 0, 0) * 1000;
expect(serverTimestampMicros('2026-10-20T08:00:00.123456+00:00')).toBe(base + 123456);
expect(serverTimestampMicros('2026-10-20T08:00:00Z')).toBe(base);
expect(serverTimestampMicros('2026-10-20T10:00:00.5+02:00')).toBe(base + 500000);
expect(serverTimestampMicros('nope')).toBeNull();
expect(compareServerTimestamps('2026-10-20T08:00:00.000001+00:00', '2026-10-20T08:00:00Z')).toBe(1);
expect(compareServerTuples(['2026-10-20T08:00:00Z', 'b0000000-0000-4000-8000-000000000000'],
  ['2026-10-20T08:00:00+00:00', 'a0000000-0000-4000-8000-000000000000'])).toBe(1);
```

- [ ] **Step 2: Write the failing merge tests** (`letterMasteryHistoryPage.test.js`; times `T1 < T2 < T3`
  as microsecond strings; correction ids `LOW < MID < HIGH`):
  - `absent rows insert with their server tuple; an unknown child becomes a reference child`.
  - `a pending local change is left alone`: Plan 2's `setLetterMastery` writes, then a page with
    a newer tuple leaves the row, its values and its outbox row.
  - `a synced row takes only a newer server tuple`: `(T2, MID)` over local server `(T1, HIGH)`
    applies; `(T1, LOW)` and an equal `(T1, HIGH)` are skipped.
  - **`a stale page applied after a newer acknowledged correction does not roll it back`**
    (AR §11.3, Review Focus 4). A page is read with `(T1, LOW)`. The phone's correction is then
    acknowledged as `applied` with server `(T2, MID)` through Plan 2's
    `applyCorrectionAcknowledgement(txn, { recordId, sentCorrectionId, result, outboxDeleted: true })`.
    The stale page is applied, and the row keeps `(T2, MID)` and its value.
  - `a wrong phone clock does not block convergence`. A local row whose own `changed_at` is in
    2030 but whose server tuple is `(T1, LOW)` takes a pulled `(T2, MID)`.
  - **`a refused correction is restored to the accepted value`**, run twice. The local row is
    `terminal`, with its server tuple `(T2, MID)` and its own refused `correction_id` set first to
    `LOW`, then to `HIGH`. A pulled `(T2, MID)` (equal) applies, a `(T3, MID)` applies and a
    `(T1, HIGH)` is skipped. Each time the terminal outbox row is unchanged.
  - **`a refused correction never shows as mastery when the pager returns nothing`**. A terminal
    local row, then an empty page, gives no row from `getLetterMastery({ childId, language })`
    (Plan 2 excludes terminal), and the cursor saves.
  - `a malformed changed_at rejects the page whole`.
- [ ] **Step 3: Run** both suites. Expected: FAIL.
- [ ] **Step 4: Implement** both modules.
- [ ] **Step 5: Run** both, then `npx jest __tests__/masteryState.test.js __tests__/LetterMasteryPanel.test.js`.
  Expected: PASS.
- [ ] **Step 6: Docs and commit.** Contract map mastery merge rules; the LEARNING section; build
  log. Commit `feat(mastery): monotonic history merge over accepted server tuples`.

---

### Task 7: The three walks and their scope queries

**Files:**
- Create: `src/services/assessmentHistoryPull.js`
- Test: create `__tests__/assessmentHistoryPull.test.js` (real SQLite with a fake keyset server;
  add to `jest.integration.config.js`); extend `__tests__/ClassesContextPull.integration.test.js`
- Docs:
  - contract map: a new subsection "Assessment, run and mastery history (AR Plan 3)" after the
    CAP-004 subsection (`:759-792`), plus the `assessments`, `assessment_items`, `battery_runs`
    and `letter_mastery` table rows (`:876-879`: replace "no pull yet — Plan 3");
  - `CONTEXT.md:74-76` (History reference child) and `:198`;
  - ROADMAP `:339`, `:343`, `:364`, `:372`, `:404`, `:406`, `:408`, `:409`, `:411`, `:413`;
  - build log.

**Interfaces:**
- Consumes: Task 4's `runHistoryWalk`; Task 5's and 6's `saveHistoryPage`; Task 2's RPCs.
- Produces:
  - Constants:
    - `ASSESSMENT_HISTORY_PAGE_SIZE = 50`, `ASSESSMENT_HISTORY_FIRST_PAGE_SIZE = 10`;
    - `BATTERY_RUN_HISTORY_PAGE_SIZE = 200`, `LETTER_MASTERY_PAGE_SIZE = 200`.
  - Scope keys:
    - `assessmentHistoryScope(userId, programmeId)` → `assessment_history_pull:<userId>:<programmeId>`;
    - `batteryRunHistoryScope(userId, programmeId)` → `battery_run_history_pull:<userId>:<programmeId>`;
    - `letterMasteryHistoryScope(userId)` → `letter_mastery_pull:<userId>`.
  - **`readAssessmentScope(db, { userId, academicYearId }) → Promise<{ classIds: string[], childIds: string[] }>`**:
    the canonical SQLite assessment-scope query (ROADMAP `:339`), sorted. **(plan call)** It
    counts only rows the server already holds:
    - `classIds` are the class ids of `class_ea_assignments` with `ea_user_id = userId`,
      `unassigned_at is null` and `sync_status = 'synced'`, in any programme, as the server arm;
    - `childIds` are the distinct `child_id` of `child_class_memberships` with
      `sync_status = 'synced'` and `academic_year_id = academicYearId`, exited or not, in one of
      those classes.
    - The phone knows memberships only for its delivery children (it pulls active memberships for
      them, `src/services/preloadedChildData.js:300-311`), so `childIds` is a conservative subset
      of the server's class arm.
  - **`readMasteryScope(db, { userId }) → Promise<{ childIds: string[] }>`**: the distinct
    `child_id` of `child_ea_assignments` with `user_id = userId`, `unassigned_at is null` and
    `sync_status = 'synced'`.
  - The walks, each `({ userId, force, deps }) → Promise<{ status, pages }>`:
    - **`runBatteryRunHistoryPull`**:
      - `tag: 'BatteryRunHistory'`, `coverageKeys: ['childIds', 'classIds']`, page size 200,
        `logTiming: true`;
      - scope: active programme and active year, or `'dependency'`; `windowStart = year.starts_on`;
      - coverage: `readAssessmentScope`;
      - fetch: `get_battery_run_history_page`;
      - save: `repositories.batteryRuns.saveHistoryPage`.
    - **`runAssessmentHistoryPull`**: the same, with `tag: 'AssessmentHistory'`, first page 10
      then 50, `get_assessment_history_page` and `repositories.assessments.saveHistoryPage`.
    - **`runLetterMasteryHistoryPull`**:
      - `tag: 'LetterMasteryHistory'`, `coverageKeys: ['childIds']`, page size 200,
        `logTiming: true`;
      - scope `letterMasteryHistoryScope(userId)`, `windowStart: null`; no programme needed;
      - coverage: `readMasteryScope`;
      - fetch: `get_letter_mastery_page`;
      - save: `repositories.mastery.saveHistoryPage`.
  - `createAssessmentHistoryStates() → { batteryRuns, assessments, mastery }`, three
    `createHistoryWalkState()` values.
  - For both programme walks, `resolveScope` returns `context: { programmeId, academicYearId }`,
    and `readCoverage` passes `context.academicYearId` to `readAssessmentScope`.
  - Each walk takes its repository from `deps.repositories` and falls back to the
    `create…Repository({ database })` factory, as sessions do (`sessionHistoryPull.js:80`).

- [ ] **Step 1: Write the failing tests.** The fake server keeps three row lists and implements
  each RPC's keyset, overlap and page size, like `sessionHistoryPull.test.js:23-58`. It can
  return `MR001` per RPC.
  - `a fresh phone shows another EA's letter result and confirmation`. The server holds a
    co-EA's 61-item letter result and a confirmation for `child-1`. The three walks run in order
    and each returns `complete`. Then `loadMasteryState(...)` gives the union of the result's
    mastered letters and the confirmed letter (lesson-plan §9 B1 fresh-device test).
  - `a run with no Questions arrives through the run walk, and its completion through a delta`.
  - `a class gained re-walks the assessment and run walks` (Review Focus 2). After a complete
    walk, a synced `class_ea_assignments` row for `class-2` is added. The next unforced runs of
    both walks start from `position: null` and download an older family dated 2026-03-01.
  - `a delivery child moving into a held class re-walks`: a synced membership of an existing
    delivery child in `class-1` appears.
  - `a pending membership or class assignment is not coverage`: an unsynced row adds nothing to
    `readAssessmentScope` and triggers no re-walk.
  - `a delivery child gained re-walks the mastery walk`.
  - `absence never deletes`: after the server drops a family and a re-walk runs, the local family
    remains.
  - `a disabled walk keeps its data and cursor and resumes when re-enabled`. After a complete
    walk, `MR001` on the assessment RPC gives `status: 'disabled'`, with the family count and
    cursor position unchanged. Re-enabled, the next forced run's first request carries the saved
    id and `p_overlap_seconds: 120`: the delta resumes from a completed cursor, and no page was
    saved while disabled.
  - `a new academic year resets the assessment and run cursors, not the mastery cursor`
    (Review Focus 5).
  - `a restart resumes from the saved cursor`: a fresh `createAssessmentHistoryStates()` after a
    budget stop asks first for the saved position.
  - `requests carry the active programme; with none, both programme walks report dependency
    without a request`.
  - Extend `ClassesContextPull.integration.test.js` (ROADMAP `:343`). A server class assignment
    persisted by the class pull survives a fresh read, and `readAssessmentScope` includes its
    class. After a later pull reconciles it away (`unassigned_at` set), the class is excluded.
- [ ] **Step 2: Run** `npm run test:integration -- __tests__/assessmentHistoryPull.test.js __tests__/ClassesContextPull.integration.test.js`.
  Expected: FAIL.
- [ ] **Step 3: Implement** `assessmentHistoryPull.js`.
- [ ] **Step 4: Run** Step 2's command plus `npx jest __tests__/productionBindingStatic.test.js`.
  Expected: PASS.
- [ ] **Step 5: Docs.**
  - The new contract-map subsection covers:
    - the three scopes and cursors;
    - coverage, and why it counts only synced rows;
    - gains-only re-walks;
    - page sizes, run order and the switch;
    - "absence never deletes" and "no reconcile";
    - the history-reference rule;
    - the operator SQL to switch one EA off, through `npm run sqlite:staging:query` with Jim's
      yes:
      `insert into private.history_pull_rollout (feature, user_id, enabled, note) values ('assessments', '<uuid>', false, '<reason>');`
      and back on with `delete from private.history_pull_rollout where feature = 'assessments' and user_id = '<uuid>';`.
  - The four table rows.
  - CONTEXT: a history reference child is one the phone holds "because the child attended a
    session, or has an assessment, Battery Run or letter mastery record, the EA may read".
  - ROADMAP: tick the listed lines, each with a pointer; leave `:415` and `:420` for Task 14.
  - Build log.
- [ ] **Step 6: Commit** `feat(history): assessment, run and mastery walks with class and delivery coverage`.

---

### Task 8: Store, handle wiring, triggers and the trigger budget

**Files:**
- Create: `src/services/assessmentHistoryStatus.js`
- Modify:
  - `src/session/handleServices.js:79-83, 116` (the store, `handle.onClose` reset, and the
    `assessmentHistory` service);
  - `src/context/ChildrenContext.js:46-52` (reset on actor change) and `:332` (start after the
    roster persists);
  - `src/context/ClassesContext.js:353-359` (start after class assignments persist, after
    `publishClassBootstrapStatus`);
  - `src/context/OfflineContext.js:239-249` (start beside session history);
  - `src/screens/assessments/AssessmentHistoryScreen.js` (`RefreshControl` with a forced start);
  - `test-support/legacyHandleMocks.js:34-41` (clone `assessmentHistory` and its store; accept
    `mocks.startAssessmentHistoryPull`, `mocks.getAssessmentHistoryPullStates` and
    `mocks.resetAssessmentHistoryStatusForActorChange`).
- Test: create `__tests__/assessmentHistoryStatus.test.js` and `__tests__/historyPullTriggerBudget.test.js`.
  Add cases to `__tests__/handleServices.test.js`, `__tests__/OfflineContext.test.js`,
  `__tests__/ChildrenContext.test.js`, `__tests__/ClassesContext.test.js` and
  `__tests__/AssessmentHistoryScreen.plan5.test.js`.
- Docs: the contract map subsection gets the trigger table below; ROADMAP §3 `:605` (Z8: built for
  the three history RPCs; uploads, roster and session pulls are not gated) and `:623` (Z4: pinned
  for history pulls); build log.

**Interfaces:**
- Consumes: Task 7's walks and states.
- Produces:
  - **`createAssessmentHistoryStore({ database, repositories, states, client, enqueueRequest, referenceDataReady })`**
    returns `{ start({ userId, force = false }), reset(), getPullStates(userId), getSnapshot(), subscribe(listener) }`.
    - It mirrors `createSessionHistoryStore` (`src/services/sessionHistoryStatus.js:12-69`).
    - Its snapshot is `{ running, pageVersion, runVersion, lastResults: { batteryRuns, assessments, mastery } }`.
    - `start` awaits `referenceDataReady()`, then runs the run walk, the assessment walk and the
      mastery walk in that order.
    - A `StaleActorError` rethrows and ends the pass. `'cancelled'` ends the pass. Any other
      status lets the next walk run (plan call: AR §11.3 "either order converges").
    - **Trailing pass (plan call).** A `start` during a running pass starts nothing concurrent.
      It marks one trailing pass, forced if any waiting call was forced, which runs after the
      current pass. All waiting callers share its promise. This closes the window in which a
      class pull persists a class after the running pass read its coverage.
  - `getPullStates(userId) → Promise<{ batteryRuns, assessments, mastery }>`. Each value is a
    `syncState.getPullState` result or null; the programme walks are null without an active
    programme.
  - `useAssessmentHistoryStatus()`, like `useSessionHistoryStatus` (`:71-76`).
  - `services.assessmentHistory = { start: ({ force = false } = {}) => store.start({ userId: handle.userId, force }), store }`.
    Task 11 adds `masteryInputsComplete`.
- **Trigger inventory, pinned by the budget test.** Every `.start(` of a history service in `src/`:

  | Service | Caller | Trigger | How often |
  |---|---|---|---|
  | `sessionHistory` | `ChildrenContext.js` after roster persist | mount (sign-in, cold open); `domainPullNonce` (foreground or reconnect with stamps over 15 min old, first credentials, breaker Apply); Children pull-to-refresh | once per cold open; at most once per 15 min per foreground or reconnect; per gesture |
  | `sessionHistory` | `OfflineContext.js` `requestDomainPullOrResumeHistory` | foreground or reconnect when no roster pull was requested | per event; a complete walk under 15 min old makes no request |
  | `sessionHistory` | `SessionHistoryScreen.js` pull-to-refresh, forced | gesture | rare |
  | `assessmentHistory` | `ChildrenContext.js` after roster persist | as the first row | as the first row |
  | `assessmentHistory` | `ClassesContext.js` after class pull persist | mount; `domainPullNonce`; Children pull-to-refresh; ClassOnboarding retry | as the first row |
  | `assessmentHistory` | `OfflineContext.js` `requestDomainPullOrResumeHistory` | as above | as above |
  | `assessmentHistory` | `AssessmentHistoryScreen.js` pull-to-refresh, forced | gesture | rare |

  These never start a history pull: a sync pass or its completion, any save, a screen focus, the
  `isSyncing` true-to-false reloads (`ChildrenContext.js:407-413`, `ClassesContext.js` "Reload
  from SQLite after sync completes").

- [ ] **Step 1: Write the failing tests.**
  - `assessmentHistoryStatus.test.js`:
    - one pass calls the run, assessment and mastery RPCs in that order;
    - two `start` calls during one pass give exactly one trailing pass, and three calls give
      still one;
    - a class persisted mid-pass is re-walked by the trailing pass;
    - a previous actor's pass cannot publish into the next actor's snapshot (copy
      `sessionHistoryStatus.test.js:33-55`);
    - `getPullStates` is scoped to the user and active programme.
  - `historyPullTriggerBudget.test.js`:
    - a static scan of `src/**/*.js` for `/\b(sessionHistory|assessmentHistory)\.start\(/`
      equals exactly the seven rows above, as `{ file: count }` per service;
    - no file under `src/db/repositories`, `src/components` or `src/hooks`, and neither
      `src/services/offlineSync.js` nor `src/services/literacySessionPersistence.js`, mentions
      `assessmentHistory` or `sessionHistory.start`;
    - behaviour (real store, fake server): after a complete pass, starts at +1, +7 and +14
      minutes make **0** RPC calls, and a start at +16 minutes makes exactly **3** (one delta
      page per walk).
  - Provider cases:
    - `OfflineContext.test.js`: "a completed sync pass never starts assessment history"
      (`syncNow()` → `startAssessmentHistoryPull` not called) and "foreground with fresh roster
      stamps starts assessment history once";
    - `ChildrenContext.test.js`: "a persisted roster pull starts assessment history once" and
      "an actor change resets the assessment history store";
    - `ClassesContext.test.js`: "a persisted class pull starts assessment history once" and "a
      failed or offline class pull does not";
    - `handleServices.test.js`: "close during an in-flight assessment history pull writes no
      failure marker and cannot publish into B's store" (copy `:223-240` with
      `get_battery_run_history_page` hanging);
    - `AssessmentHistoryScreen.plan5.test.js`: pull-to-refresh calls
      `services.assessmentHistory.start({ force: true })`.
- [ ] **Step 2: Run** the new and changed suites. Expected: FAIL.
- [ ] **Step 3: Implement.** Each trigger is
  `void services.assessmentHistory.start().catch((error) => { if (!isStaleActorError(error)) console.error('Assessment history failed:', error); });`,
  never awaited.
- [ ] **Step 4: Run** the suites, then `npx jest` and `npm run test:integration`. Expected: PASS.
- [ ] **Step 5: Docs and commit.** The trigger table in the contract map; ROADMAP Z8 and Z4 lines;
  build log. Commit `feat(history): wire the assessment history store, triggers and trigger budget`.

---

### Task 9: Status — one History row, and readers refresh as pages land

AR §11.5: the Sync status History row covers sessions, assessments and mastery. It reads
"Up to date" only when all walks are complete; otherwise it shows the oldest incomplete one.

**Files:**
- Modify: `src/utils/syncStatusPresenter.js` (add after `:106-115`; leave `describeHistoryState`
  unchanged for `SessionHistoryScreen.js:46`)
- Modify: `src/screens/main/SyncStatusScreen.js:67-77`
- Modify: `src/screens/assessments/AssessmentHistoryScreen.js`:
  - a detail line like `SessionHistoryScreen.js:157,169`;
  - names for history reference children. Today `childInfoMap` (`:90-99`) reads only
    `allChildren`, and roster reads exclude reference children (`childrenRepository.js:290, 743`).
    So after a reinstall, the EA's own result for a control child would read "Unknown child".
- Modify: `src/db/repositories/childrenRepository.js` (add `getChildNamesByIds`)
- Modify the load-effect dependencies, adding `pageVersion` and `runVersion` from
  `useAssessmentHistoryStatus()`:
  - `src/screens/main/HomeScreen.js:114`;
  - `src/screens/main/AssessmentsScreen.js:47`;
  - `src/screens/assessments/AssessmentHistoryScreen.js:88`;
  - `src/screens/assessments/ChildResultsScreen.js:73`;
  - `src/components/assessment/LetterMasteryPanel.js:57`;
  - `src/screens/insights/LetterMasteryRankingScreen.js:45`;
  - `src/screens/insights/AssessmentRankingScreen.js:79`;
  - `src/screens/main/ChildrenListScreen.js:116`.
- Test: `__tests__/syncStatusPresenter.test.js`, `__tests__/syncStatusScreen.test.js`,
  `__tests__/AssessmentHistoryScreen.plan5.test.js`, `__tests__/ChildResultsScreen.test.js`,
  `__tests__/childrenHistoryReference.test.js`
- Docs: contract map (status rule), ROADMAP `:416` (assessments now included), build log

**Interfaces:**
- Produces **`describeCombinedHistoryState({ running, pullStates }) → { label, detail }`**, where
  `pullStates` is an array of pull states (or nulls) and walks are judged with today's
  per-walk rule (`:109-111`). In order:
  - any walk running gives `Downloading`, `Downloading history from Head Office…`;
  - else any null gives `Not downloaded yet`, null;
  - else all complete gives `Up to date`, null;
  - else `Incomplete since <time>`, `History not fully downloaded yet`, where `<time>` is the
    earliest of the incomplete walks' `lastFailureAt || updatedAt || lastPulledAt`, formatted as
    today (`:113`).
- SyncStatusScreen passes the session state plus the run, assessment and mastery states, and
  `running` is the OR of both hooks' `running`. AssessmentHistoryScreen passes the run and
  assessment states and shows only `detail`.
- Produces `children.getChildNamesByIds(ids) → Promise<Record<string, { name: string, hidden: boolean }>>`.
  It reads `children` whatever `history_reference` is, chunked like `getQuestionResults`.
  AssessmentHistoryScreen uses it for ids missing from `allChildren`.

- [ ] **Step 1: Write the failing tests:**
  - the presenter:
    - four complete walks give `Up to date`;
    - complete sessions with a null mastery state give `Not downloaded yet`;
    - two incomplete walks failed at 08:00 and 09:00 give a label with 08:00's time;
    - running wins;
  - `syncStatusScreen.test.js`: complete sessions with an incomplete assessment walk do **not**
    show `Up to date`;
  - `AssessmentHistoryScreen.plan5.test.js`: while running, `Downloading history from Head Office…`
    is shown. An own result whose child is a history reference child shows that child's name,
    not `Unknown child`;
  - `childrenHistoryReference.test.js`: `getChildNamesByIds` returns reference and roster
    children, and `getChildren()` still excludes reference children;
  - `ChildResultsScreen.test.js`: an increment of `runVersion` reloads the results once.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them, then `npx jest`. Expected: PASS.
- [ ] **Step 5: Docs and commit** `feat(history): one History status over sessions, runs, assessments and mastery`.

---

### Task 10: C23 — letter evidence comes from the current academic year (lesson-plan ask 4)

**Files:**
- Modify: `src/db/repositories/assessmentsRepository.js`:
  - `getQuestionResults` (`:174-213`) gains `untilDate`;
  - `latestLetterResult` (`:220-223`) is bounded to the year;
  - add `getLetterEvidenceResults`.
- Modify: `src/utils/letterMastery.js` (add `pickLatestLetterResult`)
- Modify: `src/utils/dashboardStats.js` (`getLetterMasteryRanking`, its latest-result selection
  at `:196-209`) and `src/screens/insights/LetterMasteryRankingScreen.js:37`
- Test: create `__tests__/letterEvidenceYear.test.js` (real SQLite; add to
  `jest.integration.config.js`); update `__tests__/dashboardStats.letterMastery.test.js` and
  `__tests__/LetterMasteryRankingScreen.test.js`
- Docs: `CONTEXT.md:113` ("the latest non-skipped Letter result **from the current academic year**
  …"), the contract map readers note, the build log

**Interfaces:**
- Produces:
  - `getQuestionResults({ …, untilDate })`: when it is given, adds `assessment_date <= ?`.
  - `getLetterEvidenceResults({ userId, childId, childIds }) → Promise<QuestionResult[]>`:
    `getLetterResults` bounded to `sinceDate = year.starts_on` and `untilDate = year.ends_on` of
    `getActiveAcademicYear`. **(plan call)** With no active year it returns `[]`: confirmations
    still count, assessment evidence does not.
  - `pickLatestLetterResult(results, { childId, languageCode }) → QuestionResult | null`, the one
    selection rule. Among results with that `child_id` and `language`, `LETTER_EVIDENCE_CODES`,
    non-skipped and with at least one `metadata.reached !== false` item, it takes the latest by
    `assessment_date`, then `created_at`.
  - `latestLetterResult({ userId, childId, language })` is
    `pickLatestLetterResult(await getLetterEvidenceResults({ userId, childId }), { childId, languageCode: language })`.
  - `getLetterMasteryRanking` uses `pickLatestLetterResult`, and its screen passes
    `getLetterEvidenceResults({ userId })`. `masteryState.js` is unchanged; it reads through
    `latestLetterResult`.

- [ ] **Step 1: Write the failing tests** (`letterEvidenceYear.test.js`; active year 2026 from
  `seedCoreData`; a 2025 year inserted inactive):
  - **`an old phone holding last year's result and a fresh phone agree`.** The old phone holds a
    2025-11-01 result with `a`, `m` and `s` correct and a 2026-03-01 result with only `a`
    correct. The fresh phone holds only the 2026 result. `loadMasteryState(...).assessmentMastered`
    is `{'a'}` on both.
  - `last year's result alone supplies no evidence`: the old phone holding only the 2025 result
    gives an empty set, equal to the fresh phone.
  - `a result dated after the year's end is not evidence`.
  - `with no active year there is no assessment evidence; confirmations still show`.
  - `the ranking and the tracker agree`: `getLetterMasteryRanking` over the same two databases
    gives the same `masteredCount` as the tracker.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite plus the mastery, panel, tracker and ranking suites. Expected:
  PASS.
- [ ] **Step 5: Docs and commit** `feat(mastery): letter evidence from the current academic year only (C23)`.

---

### Task 11: `masteryInputsComplete` (lesson-plan ask 3)

Starts only after C1 Task 4 is on `main` (Task 0).

**Files:**
- Modify: `src/services/pullCoverage.js` (add `isMasteryInputsComplete`)
- Modify: `src/session/handleServices.js` (add `services.assessmentHistory.masteryInputsComplete`)
- Test: extend `__tests__/pullCoverage.test.js`
- Docs: contract map (C1's "Readers" note in the CAP-004 subsection, plus the new subsection), build log

**Interfaces:**
- Consumes: C1's `isCoverageWalkComplete(cursor, { childIds = [], windowStart = null })`; Task 7's
  scopes, `readAssessmentScope` and `readMasteryScope`; `getActiveProgrammeId` and
  `getActiveAcademicYear`.
- Produces:
  - **`isMasteryInputsComplete({ database, userId, programmeId, childIds = [] }) → Promise<boolean>`**,
    with the programme and year resolved when omitted. It is true only when all of these hold:
    1. the assessment walk is complete for the year:
       `isCoverageWalkComplete(<assessment cursor>, { childIds, windowStart: year.starts_on })`;
    2. every given child is still covered now:
       `childIds ⊆ (await readAssessmentScope(db, { userId, academicYearId: year.id })).childIds`;
    3. the mastery walk is complete:
       `isCoverageWalkComplete(<mastery cursor>, { childIds, windowStart: null })`;
    4. every given child is still a current delivery child:
       `childIds ⊆ (await readMasteryScope(db, { userId })).childIds`.

    A missing programme, year or cursor gives false.
  - **"Covered" for the class-arm walk (exact).** A child is covered when it was in
    `readAssessmentScope(...).childIds` when the last completed walk started, and still is. That
    means a synced membership this year in a class the EA holds through a synced, active class
    assignment.
    - A child in a class the EA holds no class assignment for is never covered.
    - So is a child whose only class membership the phone has not downloaded: the phone pulls
      memberships only for delivery children.
    - Losses (an ended class assignment, a child moved to an unheld class) are caught by checks 2
      and 4 at read time, because walks re-walk only on gains.
  - `services.assessmentHistory.masteryInputsComplete({ childIds }) → Promise<boolean>`, bound to
    the handle and its EA: the name the engine's input builder calls.

- [ ] **Step 1: Write the failing tests** (cursors written by the real walks of Task 7 against an
  empty fake server; `seedCoreData`; `child-a` and `child-b` delivery children with synced
  memberships in `class-1`, held by a synced class assignment):
  - `before any walk it is false`.
  - `after both walks it is true for covered children and false for an uncovered one`. `child-g`
    has a delivery assignment but its only membership is in `class-9`, which the EA does not
    hold.
  - `a failure since the last success makes it false until a walk succeeds` (assessment walk and
    mastery walk, separately).
  - `last year's assessment walk does not count`. Roll the active year over before the next
    pull: false. After the walk: true.
  - `a child gained between walks is false until the re-walk`.
  - `losing the class assignment makes its children false at once`.
  - `the run walk's state does not matter`: a failed run walk still gives true.
- [ ] **Step 2: Run** `npm run test:integration -- __tests__/pullCoverage.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `npx jest __tests__/handleServices.test.js`. Expected: PASS.
- [ ] **Step 5: Docs and commit** `feat(history): masteryInputsComplete for the lesson engine`.

---

### Task 12: Branch gate and adversarial review (controller)

- [ ] **Step 1:** Run `npx jest`, `npm run test:integration` and `npm run test:types`, and the
  controller runs every `verify:*:postgres` harness, including the new one, on the disposable
  server. Expected: all green. Record the counts.
- [ ] **Step 2:** Run
  `/usr/bin/grep -rn "current_user_can_read_child" supabase/migrations/20261022120000_assessment_history_pull.sql`.
  Expected: no match.
  Then check `/usr/bin/grep -rn "from('assessments')\|from('letter_mastery')\|from('battery_runs')" src`.
  Expected: nothing.
- [ ] **Step 3:** Codex adversarial review of the branch (`--cwd <worktree> --base origin/main`).
  Engage every finding in the build log. Fix the ones worth fixing, at most two rounds, and stop
  on rare timing races at the cap with the risk recorded.
- [ ] **Step 4:** Rerun Step 1 after fixes. Commit `test(history): Plan 3 branch gate` if anything
  changed.

---

### Task 13: Rollout (AR §13; controller, each step with Jim's yes at the time)

- [ ] **Step 1: Test phones sync completely.** Each test phone's Sync status shows "All saved and
  synced". Export the support package from each one and keep it.
- [ ] **Step 2: Counts, no wipe.** Read-only counts on `masi-app-sqlite` of
  `assessments`, `assessment_items`, `battery_runs`, `letter_mastery` and Plan 2's
  `letter_mastery_corrections`, recorded in the build log as the gates' baseline.
  - **(orchestrator call, 2026-10-20)** No wipe for Plan 3: it changes no stored shape, and the
    Task 14 volume gates use the disposable fixture EA, whose counts are known exactly. Jim may
    still ask for a wipe.
- [ ] **Step 3: Apply the migration (Jim's yes).** Run `npm run sqlite:staging:dry-run`. Expected:
  `project_ref=segygjzpujphwvrubusm`, and only this plan's file pending. Then run
  `npm run sqlite:staging:push`. Read-only verification:
  - the ledger row exists;
  - the three RPCs and `private.can_read_assessment` are security definer with `search_path=""`;
  - `authenticated` has EXECUTE on the RPCs and `anon` does not;
  - the three policies exist and the three old ones are gone;
  - `private.history_pull_rollout` holds three enabled everyone rows;
  - RLS is on, with zero policies on the rollout table.
- [ ] **Step 4: Rollback-only hosted matrix (Jim's yes).** Over the IPv4 session pooler (skill
  `sqlite-staging-sql`), one `BEGIN … ROLLBACK` per case, rerun Task 1's actor matrix and Task 2's
  switch cases. Then run a residue query. Expected: zero.
- [ ] **Step 5: Authenticated HTTP probe (Jim runs it interactively).** Run
  `npm run assessment-history:probe`. Expected:
  - `PASS` for 20 families and 1,220 items in one page of 20 rows, each family whole;
  - the cap control returns exactly 1,000;
  - zero residue.
- [ ] **Step 6: Builds (Jim's yes).** EAS preview builds for Android and iOS. Install them on the
  Galaxy A03s and the iPhone after Step 1.
- [ ] **Step 7: Docs.** Build log rows for each step; contract map and ROADMAP status
  ("applied to hosted on <date>").

---

### Task 14: Device gates (AR §14 Plan 3 row; lesson-plan ask 5)

Run on the **Galaxy A03s at 360 dp** (`wm density 320`) and the **iPhone**, unless marked
A03-only, with screenshots and exported logs attached to each build-log row.

- **Throttled** means mobile data with *Network mode: 3G only* on the A03s; Wi-Fi does not count
  for throttled criteria.
- **Fixtures:**
  - the practice accounts;
  - for gates 5–7, the volume fixture from Task 3 (`seed-volume`, with Jim's yes), removed with
    `cleanup-volume` afterwards, with a zero-residue query recorded.

- [ ] **Gate 1: New phone (both devices).** EA1 holds letter and word results recorded on another
  phone. A seeded run fixture (Jim's yes) gives EA1 one completed run with Q1 and one
  `in_progress` run with no Questions. EA1 signs in on a freshly installed phone.
  - Pass: within 60 s of Home appearing (Wi-Fi), Sync status History reads `Up to date`.
  - Assessment History lists exactly EA1's current-year results (the count matches a read-only
    server query), plus the two runs as read-only rows (`WelaPLUS · Completed · 1 Questions`,
    `WelaPLUS · In progress · 0 Questions`, the copy at `AssessmentHistoryScreen.js:106, 139`).
  - Every row shows a child's name; none reads `Unknown child`.
  - A child's tracker shows the same mastered letters as on the original phone.
  - The log shows `[AssessmentHistory] end status=complete … complete=true`.
- [ ] **Gate 2: Reinstall (both devices).** Uninstall, reinstall and sign in as EA1.
  - Pass: Gate 1's lists return.
  - The exported database shows `battery_runs.started_here = 0` for both runs.
  - No screen offers Resume, Finish or Abandon for them.
- [ ] **Gate 3: Second EA (both devices).** EA2 holds a class assignment on the shared class.
  - Pass: on EA2's phone, EA1's letter result for a shared child appears in Child Results, and
    its letters show locked in the tracker.
  - Home's "children to assess" treats the child as assessed.
  - EA2's own Assessment History does not list EA1's results.
  - A control child of the class (not EA2's delivery child) appears in no roster or child picker.
- [ ] **Gate 4: Mastery after a handover (both devices).** EA1 confirms `k` for a child and syncs.
  Head Office moves the child's delivery assignment to EA2.
  - Pass: EA2's phone shows `k` confirmed.
  - EA2 un-confirms `k` and syncs. After EA1's next foreground, EA1's tracker no longer shows the
    record: EA1 is neither the last writer nor a deliverer.
- [ ] **Gate 5: First commit and volume (A03-only).** The volume account, fresh install, throttled.
  - Pass: `[AssessmentHistory]`'s first page commits with `firstCommitMs` ≤ 3000.
  - The walk completes with no failed run, and the build log records `pages`, `rpcMs`, `saveMs`
    and the time to `complete=true`.
  - **If `firstCommitMs` exceeds 3000, set `ASSESSMENT_HISTORY_FIRST_PAGE_SIZE` to 5 and rerun;**
    record both.
- [ ] **Gate 6: Interrupted download (A03-only).** On the volume account, force-stop the app 5 s
  into the first download, three times, then let it finish. Repeat once by toggling airplane
  mode mid-page.
  - Pass: each start line's position advances and never resets.
  - The server-to-phone family and item counts match at the end.
  - No local family has fewer items than its `total_items`: run a query on the exported database.
- [ ] **Gate 7: A lesson started mid-download (A03-only; ask 5).** While Gate 5's first download
  runs, open **+ Record**. Today's session form stands in until the Lesson screen exists. Mark
  two tracker letters and submit.
  - Pass: the session confirmation appears within 2 s of the tap, by screen recording.
  - The download still completes.
  - The tracker marks are saved with their own language and time (AF), and appear after a reopen.
- [ ] **Gate 8: Server switch drill (A03-only).** Switch EA1's `assessments` feature off (Task 7's
  operator SQL, Jim's yes) and foreground the app.
  - Pass: the log shows `[AssessmentHistory] end status=disabled`, Sync status shows
    `Incomplete since …`, and the local data is unchanged.
  - Delete the row. The next run's first request carries the saved cursor id, and History returns
    to `Up to date`.
- [ ] **Gate 9: The History row (both devices) at 1.0x and 1.3x text.** Each of `Downloading`,
  `Incomplete since …` and `Up to date` fits without clipping or overlap, and the Sync status
  card matches the design system's spacing.
- [ ] **Step: Docs.**
  - `documentation/device-gates-sqlite-backend-2026-07.md` gets a new section "T. Assessment and
    mastery history (AR Plan 3)" holding Gates 1–9.
  - ROADMAP: tick `:415` (two-device) and the assessment half of `:420` (CAP-004-style gates).
  - Build log rows.
  - Open the PR, and ask Jim before merging. Grep the commit messages for `Closes #` first.

---

## Self-review notes

- **Spec coverage:**
  - AR §11.1 (predicate, policies, items follow parent, old policies dropped) → Task 1. The
    mastery SELECT per §10.3 is Plan 2's policy; Tasks 1 and 2 prove it and the pager agree;
  - §11.2 (three RPCs, items as jsonb, run header, child projection, year from the server,
    owner-arm year bound, HTTP test) → Tasks 2 and 3;
  - §11.3 (one transaction per page with its cursor; children, then runs, then assessments;
    insert-or-ignore; short-items rejection; run merge with `started_here`; monotonic mastery
    merge with the terminal rule; completeness and re-walks; page size) → Tasks 4–7;
  - §11.4 (pulled runs read-only) → Task 5 merge and Gate 2;
  - §11.5 → Task 9;
  - §13 → Task 13;
  - §14 gates → Task 14;
  - §15's page apply, run merge, mastery merge, pull calls and read predicates → Tasks 1, 2, 5,
    6 and 7;
  - §16 docs → folded into each task;
  - asks 3, 4 and 5 → Tasks 11, 10, and 1 + 8 + 14.
- **AR §14's "triggers"** is read as pull triggers (Task 8). The server stamps were built in
  Plan 1; Task 2 re-asserts them.
- **Plan 2 boundary:** this plan never writes `letter_mastery` except through the merge, and never
  changes its upload path.
