# Assessment Results — Plan 3: History Pull — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Codex round 1:** folded in 2026-10-20 (coverage drops lost grants so a regained child or class re-walks; a terminal outbox row no longer blocks the mastery merge; a delivery handover deletes the child's synced mastery; embedded run headers are an explicit read rule; programme pages carry the expected academic year).

**Codex round 2:** folded in 2026-10-20 (the handover delete also drops the child from the mastery walk's covered sets in its own transaction, and every walk write bounds its coverage to the grants it reads in that transaction; new Task 7A makes the reference refresh switch the active year whatever the response order, and MR002 recovery is tested through it; the session tracker sheet no longer refreshes on pulled pages).

**Goal:** A new phone, a reinstall, or a second EA in the class downloads the current-year
assessment families, WelaPLUS runs and letter-mastery confirmations they may read. Each page lands
whole with its cursor. Sync status says when all of it is down, and the lesson engine can ask
whether a given set of children's mastery inputs are complete.

**Architecture:**
- **Server.** One migration adds `private.can_read_assessment` (owner arm, plus the current-year
  class arm of ADR-0005 follow-up 1) and new SELECT policies built on it. It also adds three
  bounded keyset page RPCs, each gated by a per-EA server switch. Assessment pages carry each
  family's items as one jsonb array, so a page is at most 200 rows under PostgREST's 1,000-row cap.
  Each assessment row carries its run header (the embedded-header rule, Task 2). The two
  programme pages take the academic year the phone expects and refuse a mismatch.
- **Phone, walks.** CAP-004's traversal is extracted from `sessionHistoryPull.js` into a shared
  walker, and sessions keep their exact behaviour. Three new walks run on it, in order: runs, then
  assessments, then mastery. The walks re-walk when the EA gains a class, a child in a held class
  or a delivery child. Their coverage keeps only ids still granted, so a grant lost and later
  regained counts as a gain and re-walks. Each durable write bounds coverage to the grants it
  reads in its own transaction. Each page applies set-wise in one transaction through the
  signed-in handle.
- **Phone, handover.** When the child EA reconcile ends a delivery assignment, the same
  transaction deletes that child's synced letter-mastery rows and drops the child from the
  mastery walk's covered sets, so its return re-walks. Rows with an outstanding or refused
  correction stay.
- **Phone, reference refresh (Task 7A, a pre-existing bug).** The active academic year switches
  in one transaction whatever order the server lists the years in. MR002 recovery is that refresh.
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
  - the outbox slot `letter_mastery:<id>:update`. An `MA001` from `set_letter_mastery` finalizes
    it through `finalizeTerminalFailure` (`src/services/offlineSync.js:955-983`), which keeps the
    outbox row as `terminal` and marks the domain row `terminal` (Plan 2 Task 4);
  - Plan 2's ordering-aware `setLetterMastery` (its Codex round 1, fix 2): a local row may keep a
    newer outstanding correction and return it. Such a row always has a `pending`, `failed` or
    `in_flight` outbox row, so Task 6's merge and its handover delete both leave it alone;
  - `useLetterMasterySyncRefresh(onRefresh)` (`src/hooks/useLetterMasterySyncRefresh.js`, no
    `enabled` argument), mounted by `LetterMasteryPanel` only. Plan 2's Codex round 2 drops the
    session tracker sheet's sync refresh, because a re-read under its pending marks can undo a
    cancelling tap (Plan 2's accepted risk A1). `LetterTrackerBottomSheet` is unchanged and does
    not call the hook;
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
  - `get_assessment_history_page(p_programme_id, p_academic_year_id, p_page_size, p_after_updated_at, p_after_id, p_overlap_seconds)`;
  - `get_battery_run_history_page(...)`, with the same parameters;
  - `get_letter_mastery_page(p_after_updated_at, p_after_id, p_page_size, p_overlap_seconds)`.
  - **`p_academic_year_id` (plan call, deviates from AR §11.2's signatures).** It is the active
    year the phone's walk expects. The server still decides the year, and refuses a mismatch,
    so a walk never completes against a year its cursor and readers do not hold. Without it, a
    stale reference cache or a year change between pages could leave a walk marked complete under
    the wrong year: `ensureReferenceData` accepts any earlier completed cache
    (`src/services/offlineSync.js:1976-2007`).
- **Errors:**
  - `28000`: no `auth.uid()`;
  - `22023`: bad argument;
  - `MR001`, message `rollout_disabled`: the switch is off;
  - `55000`, message `no_active_academic_year`: no active year (assessment and run pages only);
  - `MR002`, message `academic_year_mismatch`: `p_academic_year_id` is not the server's active
    year (assessment and run pages only). It is raised before any row is read, so a page that
    would be empty is refused too.
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
   reference refresh makes the new year active whatever order the server lists the years in.
   The assessment and run cursors reset. Last year's results stop counting as evidence on an old
   phone exactly as on a fresh one, and completeness is false until the new walk finishes.
   Tests: Task 7, Task 7A, Task 10 and Task 11.
6. **A grant is lost and later regained** (a child handed away and back, a class removed and
   restored) while another EA changes that child's results or mastery. The regained child
   re-walks, and `masteryInputsComplete` stays false until it does. This holds when the child
   returns before any walk has written (Codex round 2: the handover drops the child from mastery
   coverage itself). It also holds when a walk is running across the loss, because that walk
   cannot re-add the child. Sessions keep CAP-004's rule.
   Tests: Task 4, Task 6, Task 7 and Task 11.
7. **A refused correction recovers.** Its terminal outbox row stays as evidence and never blocks
   the accepted value, or a later accepted change, from landing. Test: Task 6, through the real
   terminal finalizer.
8. **A handover removes mastery from the old EA's phone** only through the server-acknowledged
   child EA reconcile, only for synced rows with nothing owed, and never because a page was empty.
   The same transaction drops the child from the mastery walk's covered sets.
   Tests: Task 6 and Task 7 (Gate 4's sequence).
9. **The phone and the server disagree on the year.** A stale reference cache or a server year
   change mid-walk never leaves a walk complete. The recovery is the real reference refresh,
   which switches the year whatever the response order. Tests: Task 2, Task 7, Task 7A and Task 8.
10. **An embedded run header** is readable exactly when its assessment is; the run pager and
    `battery_runs` SELECT stay year-bounded. Test: Task 2.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20261022120000_assessment_history_pull.sql` (create) | Predicate, SELECT policies, switch, indexes, three page RPCs | 1, 2 |
| `scripts/assessment-history-postgres-harness.cjs` (create) | Disposable-PG proof of predicate, policies and RPCs | 1, 2 |
| `scripts/assessment-history-http-probe.cjs` (create) | Authenticated PostgREST proof (>1,000 items), volume fixture for gates | 3 |
| `src/services/historyWalk.js` (create) | Shared keyset walker extracted from CAP-004; coverage that drops lost grants; the year-mismatch stop | 4 |
| `src/db/repositories/historyCoverage.js` (create) | Cursor coverage helpers: bound to current grants inside a write's transaction; drop ids at a handover | 4, 6 |
| `src/services/sessionHistoryPull.js` (modify) | Session walk as a walker config; exports unchanged | 4 |
| `src/utils/serverTimestamps.js` (create) | Exact microsecond comparison of server timestamps and tuples | 6 |
| `src/db/repositories/historyPageApply.js` (create) | Set-wise apply helpers: id lookups, insert-or-ignore, reference children, run merge | 5 |
| `src/db/repositories/assessmentsRepository.js`, `batteryRunsRepository.js`, `masteryRepository.js` (modify) | `saveHistoryPage` per family; `deleteUndeliveredLetterMastery` | 5, 6 |
| `src/db/repositories/childrenRepository.js` (modify) | The child EA reconcile calls the handover delete in its transaction | 6 |
| `src/services/assessmentHistoryPull.js` (create) | The three walks, their scopes and scope queries | 7 |
| `src/db/repositories/referenceDataRepository.js` (modify) | Order-independent active academic-year switch in the reference refresh | 7A |
| `src/services/assessmentHistoryStatus.js` (create) | Store (runs → assessments → mastery), year-mismatch refresh and restart, status hook | 8 |
| `src/session/handleServices.js`, `src/context/{Children,Classes,Offline}Context.js`, `src/screens/assessments/AssessmentHistoryScreen.js` (modify) | Wiring and the four triggers | 8 |
| `src/utils/syncStatusPresenter.js`, `src/screens/main/SyncStatusScreen.js`, `src/db/repositories/childrenRepository.js`, reader screens, Plan 2's `src/hooks/useLetterMasterySyncRefresh.js` (modify) | Combined History row; reference-child names in Assessment History; readers and the mastery panel refresh as pages land (the session tracker sheet does not) | 9 |
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
  - `grep -n "useLetterMasterySyncRefresh" src/components/session/LetterTrackerBottomSheet.js`
    finds nothing (Plan 2's Codex round 2). If it finds a call, stop and ask: Task 9's pulled-page
    signal must not reach the sheet.
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
    - `B_2026`: `CHILD_B`, dated 2026-08-01;
    - `A_2026_PRE_YEAR_RUN`: `CHILD_A`, dated 2026-01-15, the battery's Q1, with
      `battery_run_id = RUN_PRE_YEAR`. `submit_assessment` allows this: it checks the run's owner,
      child and programme, and no date (`20261021120000_assessment_results_contract.sql:292-298`).
  - Three runs for `CHILD_A`, all by `OWNER`:
    - `RUN_2026`, started `2026-03-01T08:00Z`;
    - `RUN_YEAR_EDGE`, started `2026-01-14T23:30:00Z`, which is 01:30 SAST on 2026-01-15 and so
      falls inside 2026;
    - `RUN_PRE_YEAR`, started `2026-01-14T20:00:00Z`, which is 22:00 SAST on 2026-01-14, the day
      before the year starts.
- [ ] **Step 2: Write the read-predicate cases** (direct `SELECT` as each actor, rolled back):

  | Case | Expected |
  |---|---|
  | `OWNER` | sees all five assessments, items of each, all three runs (the owner arm has no year bound) |
  | `CLASS_ONLY` (new class after a mid-year move) | `A_2026_EARLY`, `A_2026_LATE`, `A_2026_PRE_YEAR_RUN`, their items, `RUN_2026` and `RUN_YEAR_EDGE`; not `A_2025`, not `B_2026` (a 2025 membership grants nothing in 2026), not `RUN_PRE_YEAR` (its SAST date is before the year) |
  | `OLD_CLASS` (old class after a mid-year move; exited membership counts) | same as `CLASS_ONLY` |
  | `CURRENT_DELIVERY` (delivery-only, no class assignment) | nothing |
  | `FORMER_DELIVERY`, `GROUP_ONLY`, `UNRELATED`, `ENDED_CLASS` | nothing |
  | `LAST_YEAR_CLASS` | nothing: last year's assessment hidden; the active year decides |
  | items follow parent | for every actor, `count(assessment_items)` visible equals the sum of `total_items` over the parents it sees |
  | run year edge | `CLASS_ONLY` sees `RUN_YEAR_EDGE` (the SAST date is 2026-01-15) and not `RUN_PRE_YEAR` (2026-01-14) |
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
  switch, arguments, year. For the two programme pages the year step is: no active year →
  `55000`; an active year whose id differs from `p_academic_year_id` → `MR002`. Both are raised
  before any row is read. Each has two arms, each ordered and limited before a `union` of ids,
  then joins back, orders and limits):
  - **`public.get_assessment_history_page(p_programme_id uuid, p_academic_year_id uuid, p_page_size integer default 50, p_after_updated_at timestamptz default null, p_after_id uuid default null, p_overlap_seconds integer default 0)`**
    - It returns `table(...)` with the columns of `SERVER_COLUMNS.assessments`
      (`src/services/syncServerColumns.js:82-90`), plus:
      - `items jsonb`: `jsonb_agg(jsonb_build_object('id','position','item_key','prompt','response','is_correct','metadata') order by position)`,
        or `'[]'` for zero items. Per item it omits `assessment_id`, `created_at` and
        `updated_at` (plan call). The phone fills them from the parent: AR §8.4 says one
        `now()` per family, and `saveQuestionResult` gives items the parent's `created_at`
        (`assessmentsRepository.js:131-145`).
      - `battery_run jsonb`: the run's `SERVER_COLUMNS.battery_runs` fields
        (`src/services/syncServerColumns.js:77-81`) via `jsonb_build_object`, or null when
        `battery_run_id` is null;
      - `child_first_name`, `child_last_name`, `child_preferred_name`.
    - **Embedded-header rule (plan call, deviates from AR §11.1, which gives a run one read path).**
      An assessment the caller may read makes its run header readable inside that assessment's
      page row, whether or not the run passes `battery_runs_select_owner_or_class_year` or the
      run pager. The run pager and the `battery_runs` SELECT policy stay year-bounded.
      - Why: the phone cannot store the family without the run, because
        `assessments.battery_run_id` references `battery_runs(id)` (`src/db/migrations.js:787`).
        `submit_assessment` sets no date relationship between a Question and its run
        (`20261021120000_assessment_results_contract.sql:292-298`), so a current-year Question can
        name a run started before the year. Withholding that header would make a readable family
        unstorable.
      - The header is only `SERVER_COLUMNS.battery_runs`. It grants no other row: the run's other
        Questions still need their own read.
      - On the phone, run lists are own-runs only (`getRunsForUser`,
        `src/db/repositories/batteryRunsRepository.js:72-82`), so another EA's stored header is an
        FK target and never lists.
      - The definer function does not inherit the caller's RLS, so this rule is written into
        the function, documented in the contract map and pinned by the harness.
    - The arms, both with `programme_id = p_programme_id`, `question_code is not null`,
      `assessment_date` inside the active year (from `academic_years where is_active`, after the
      year step above), and the keyset:
      - owner: `user_id = auth.uid()`;
      - class: `child_id in (members this year of classes the caller holds an active class assignment on)`.
  - **`public.get_battery_run_history_page(p_programme_id uuid, p_academic_year_id uuid, p_page_size integer default 200, p_after_updated_at timestamptz default null, p_after_id uuid default null, p_overlap_seconds integer default 0)`**:
    `SERVER_COLUMNS.battery_runs` plus the three name columns. It has the same arms on runs, with
    the run's SAST year date, and the same year step.
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
  | RPC equals policy | for each of the 9 actors, walking `get_assessment_history_page` to exhaustion at page size 1 returns exactly the ids that actor's direct `SELECT` sees with `programme_id = literacy and assessment_date` in 2026; the same holds for runs (by the run's SAST date), and for mastery with no filter |
  | owner year bound | `OWNER`'s assessment pages exclude `A_2025`, and its run pages exclude `RUN_PRE_YEAR` |
  | embedded header (Codex round 1) | as `CLASS_ONLY`: the assessment walk returns `A_2026_PRE_YEAR_RUN` with `battery_run.id = RUN_PRE_YEAR` and its `started_at` round-tripped; the run walk never returns `RUN_PRE_YEAR`; a direct `select count(*) from battery_runs where id = RUN_PRE_YEAR` is 0. As `UNRELATED`, no assessment row, so no header. As `OWNER`, the header arrives on the assessment page while the run page still excludes the run |
  | year agreement (Codex round 1) | with `p_academic_year_id` = the inactive 2025 id, both programme pages raise `MR002` (`academic_year_mismatch`), for `OWNER` (rows exist) and for `UNRELATED` (the page would be empty); a random uuid also raises `MR002`. Inside a rolled-back transaction that makes 2025 the active year, the 2026 id raises `MR002` and the 2025 id succeeds. The switch is two statements, `update academic_years set is_active = false where is_active;` then `update academic_years set is_active = true where id = <2025 id>;` (Codex round 2: Postgres checks the partial unique index row by row, so a one-statement switch depends on the order it visits the rows). The mastery page takes no year argument |
  | whole family | `A_2026_LATE`'s row has `items` of length 3 = `total_items`, ordered by position, each with exactly the 7 keys; a skipped (zero-item) family has `items = []` |
  | run header | `A_2026_PRE_YEAR_RUN`'s `battery_run` has exactly the `SERVER_COLUMNS.battery_runs` keys, its `id` equals `RUN_PRE_YEAR` and `started_at` round-trips; a standalone family has `battery_run` null |
  | child projection | the row's keys beyond the parent and items are exactly `battery_run, child_first_name, child_last_name, child_preferred_name` |
  | run walk | a zero-Question run is returned; after `save_battery_run` completes it, a delta from the previous cursor returns it again with `status = 'completed'` (status-only change moves `updated_at`) |
  | mastery pager | after the Task 1 handover sequence, `FORMER_DELIVERY` gets the record at step 3 and nothing at step 5 |
  | keyset | five rows with one pinned `updated_at` (as `postgres` with `session_replication_role = replica`, as `history-authorization-postgres-harness.cjs:747-754`) at page size 1 return once each; `p_overlap_seconds = 120` re-returns a row stamped 60 s before the cursor |
  | arguments | page size 0 or 201, overlap 601, a half cursor, a null `p_programme_id`, or a null `p_academic_year_id` → `22023` |
  | auth | anon EXECUTE → `42501`; authenticated with no `sub` → `28000` |
  | no active year | with `is_active` cleared in a rolled-back transaction, assessment and run pages → `55000` whatever `p_academic_year_id` is (the year step checks for an active year first); the mastery page still works |
  | switch | delete the `assessments` everyone row: every actor gets `MR001`. Insert `OWNER`'s row enabled: only `OWNER` gets rows. Restore the everyone row and set `OWNER`'s row disabled: `OWNER` gets `MR001` and `CLASS_ONLY` gets rows. Each feature gates only its own RPC. |
  | server stamps | after `submit_assessment`, `save_battery_run` and Plan 2's `set_letter_mastery`, each row's `updated_at` equals that transaction's `now()` even when the payload carried 2001 |
  | dense plan gate | copy `runDensePlanChecks` (`history-authorization-postgres-harness.cjs:735-791`) with 20,000 noise assessments by another EA in the programme. A sparse class-arm first page and a dense owner deep page each use less than one tenth of the raw-RLS baseline's root shared blocks (`collectPlanMetrics`). |

- [ ] **Step 2: Controller RED.** Run the Task 1 command. Expected: FAIL, because the function does
  not exist.
- [ ] **Step 3: Write sections 5–7.**
- [ ] **Step 4: Controller GREEN.** Run the new harness, then all other harnesses. Expected: all
  pass. Record the dense-plan numbers.
- [ ] **Step 5: Docs.** Contract map Operation Semantics gets three rows. Each gives the signature,
  bounds, arms, partition key (programme, not a grant), year source (server, checked against
  `p_academic_year_id`, `MR002` on mismatch), item shape, switch and errors. The assessment row
  states the embedded-header rule as an authorization rule: "an assessment the caller may read
  makes its run header readable inside that assessment's page row; the run pager and the
  `battery_runs` SELECT policy stay year-bounded". Build log row.
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
      a child), inserts the 20 × 61 families as service role, and signs in as the EA. It reads the
      active year's id as service role (`academic_years where is_active`) and calls
      `rpc('get_assessment_history_page', { p_programme_id, p_academic_year_id, p_page_size: 50, p_after_updated_at: null, p_after_id: null, p_overlap_seconds: 0 })`
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
- Create: `src/db/repositories/historyCoverage.js` (Codex round 2; the cursor's coverage fields in
  one place, for the walker and for Task 6's handover)
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
      `'query'`, `'cancelled'`, `'disabled'` or `'year_mismatch'`.
    - `deps` is exactly today's `runSessionHistoryPull` deps (`:65-77`).
  - The `walk` object:
    - `tag: string`, used in log lines;
    - `coverageKeys: ('childIds' | 'classIds')[]`;
    - `pageSize: number`, `firstPageSize = pageSize`, `logTiming = false`,
      `dropLostCoverage = false` (below);
    - `resolveScope({ db, userId }) → Promise<{ scope, windowStart: string | null, context } | null>`.
      A null result gives `'dependency'` with no request and no write;
    - `readCoverage({ db, userId, context }) → Promise<{ childIds: string[], classIds?: string[] }>`;
    - `fetchPage({ request, position, overlapSeconds, pageSize, context }) → Promise<{ rows: object[], data?: any }>`.
      `rows` must be in `(updated_at, id)` order. The walker reads the row count and the last
      row's `updated_at`/`id`, and passes `data ?? rows` to `savePage`;
    - `savePage({ data, scope, pullState, admit }) → Promise<void>`. For a `dropLostCoverage`
      walk, `pullState` is a function `async (txn) => ({ lastPulledAt, cursor })` (below). The
      saver resolves it inside its own transaction, after the rows and before the cursor write,
      through `resolveHistoryPullState(txn, pullState)`. The session walk still gets the object
      it gets today (`sessionHistoryPull.js:174`).
  - Cursor fields are CAP-004's (`sessionHistoryPull.js:90-95`). For each coverage key `k`, the
    walker keeps `firstWalk<K>`, `rewalk<K>` and `rescan<K>`, where `K` is `ChildIds` or
    `ClassIds`. Class fields appear only when `classIds` is a coverage key, so the session cursor
    JSON is unchanged.
  - A re-walk is due when, beyond CAP-004's conditions (`:114-117`), any current id of any
    coverage key is absent from its `rescan<K>` set. Gains trigger a re-walk; a loss alone does
    not, because it brings nothing new. Task 11 checks losses at read time.
  - **Request order in a re-walk run** (CAP-004, `sessionHistoryPull.js:226-271`): the delta runs
    first, from the saved position, then the re-walk from `rescanAfter` (null at its start). So
    tests assert that *some* request in the run has `position: null` and overlap 0, as
    `sessionHistoryPull.test.js:378` does, not that the first one does. Only a reset cursor (a new
    `windowStart`, or no cursor) makes the first request null.
  - **Lost grants leave coverage (`dropLostCoverage`, Codex rounds 1 and 2).** When the flag is
    set, every durable write of the walk bounds the cursor's coverage sets with
    `boundHistoryCoverage`. Those writes are a page save, including the exhausted page that
    completes a walk, and the failure marker. The bound uses the ids that
    `walk.readCoverage({ db: txn, userId, context })` reads **inside that write's transaction**.
    After the commit, the walker adopts the bounded state.
    - Why: a cursor watches writes, not authorization. Codex's case: complete for children A
      and B; A is handed away; while A is hidden another EA corrects A's mastery; a delta on B
      moves the cursor past that correction; A is handed back. With A still in `rescanChildIds`
      there is no re-walk, and the walk reports complete while holding A's stale value. After
      the intersection, regaining A is a gain, so A re-walks and is not covered until it
      finishes.
    - **Why inside the transaction (Codex round 2).** A run holds its coverage sets in memory
      from its start. If it bounded them only then, a grant that ended while the run was
      waiting on a page would come back with the run's next write. SQLite serializes the two
      writers, so the bound either sees the ended grant or runs before it ends. If it runs
      first, the handover's own drop (Task 6) comes after it.
    - A run with no durable write (`fresh`, `dependency`, `cancelled`) writes nothing. For the
      walk's own cursor that is safe, because the cursor moves only with a durable write. It is
      not safe for local data deleted outside the walk (Codex round 2's case: completed for A
      and B; A handed away; its mastery deleted; the next run `fresh`; A back; no gain seen; the
      delta cannot reach A's old rows). So the one such delete, the handover, drops its children
      from the mastery cursor in its own transaction (`removeFromHistoryCoverage`, Task 6).
    - The programme walks need no such drop. Their coverage comes from class assignments and
      memberships, not delivery, and nothing deletes assessment or run rows on the phone
      (Task 7, "absence never deletes"). A loss that no walk wrote down therefore hides nothing:
      the cursor has not moved, and the rows it already passed are still on the phone.
    - This implements AR §11.3's "re-walk when the set of … assignments changes": a loss shrinks
      coverage, and the later gain re-walks.
    - **Sessions keep `dropLostCoverage: false`.** Their read grant is historical:
      `get_delivery_history_page`'s delivery arm joins `child_ea_assignments` with no
      `unassigned_at` filter (`20260925120000_session_history_family_delta.sql:110-115`), so a
      lost child's sessions stay readable and nothing can hide behind the cursor. Their cursor
      JSON and suites are unchanged.
    - **Residual risks (accepted, rare; narrowed in Codex round 2).** Each is caught by the
      6–8-day backstop re-walk:
      - the phone never sees the loss. The server ends and restores the grant between two of
        the phone's roster or class pulls. Another EA's change made while it was hidden is
        passed by a page in between;
      - the loss and the return both reach the phone inside one run, which is two roster pulls
        within its 60 s budget. The run's next write finds the grant again and keeps the child
        covered, although the handover deleted its mastery.
  - A `windowStart` that differs from the stored one resets the cursor (`:98-101`). A null
    `windowStart` never resets.
  - `request(rpcName, args)` keeps `withDeadline` (`:42-62`). An error with `code === 'MR001'`
    stops the run as `'disabled'`. An error with `code === 'MR002'` stops it as
    `'year_mismatch'`: it records `lastFailureAt` like any failure (so the walk is not complete),
    keeps `updatedAt` and `id`, and logs the end line as a failure with
    `failureKind=year_mismatch`. The store (Task 8) refreshes reference data and restarts the walk.
  - **`'disabled'`** records `lastFailureAt` (so the walk is not complete), keeps `updatedAt` and
    `id`, and logs the end line with `console.log`, not `console.warn`.
  - **Page size.** The first page of each run asks for `firstPageSize`, later pages for
    `pageSize`. A page is exhausted when it holds fewer rows than were asked for.
  - **Log lines.**
    - The start line is CAP-004's (`:130`) with `[<tag>]`.
    - The end line is CAP-004's (`:213-216`). When `logTiming` is set, it adds
      ` rpcMs=<n> saveMs=<n> firstCommitMs=<n|none>` before any ` failureKind=… error=…` suffix.
    - `firstCommitMs` runs from run start to the first resolved `savePage`.
- Produces, in `src/db/repositories/historyCoverage.js` (Codex round 2; db-level, so Task 6's
  reconcile can use it without importing a service):
  - `coverageFields(key) → [string, string, string]`: `rescan<K>`, `rewalk<K>` and
    `firstWalk<K>` for `childIds` or `classIds`. Only this module and the walker name them.
  - `boundHistoryCoverage(cursorState, current, coverageKeys) → cursorState`. It is pure. For
    each key it intersects `rescan<K>`, and `rewalk<K>` and `firstWalk<K>` when they are not
    null, with `current[key]`, keeping order. Every other field is returned unchanged.
  - `resolveHistoryPullState(txn, pullState) → Promise<{ lastPulledAt, cursor }>`: it returns an
    object as it is, and awaits a function with `txn`.
  - `removeFromHistoryCoverage(txn, { scope, coverageKey, ids }) → Promise<boolean>`. It reads
    that scope's `sync_state` row in `txn` and drops `ids` from the key's three sets. It writes
    back only the `cursor`, through
    `setPullState(scope, { lastPulledAt: <unchanged>, cursor }, { transaction: txn })`. With no
    row, or no id to drop, it writes nothing and returns false. It never creates a row.
- Produces, in `sessionHistoryPull.js`: every current export, with its name and value
  (`SESSION_HISTORY_*`, `sessionHistoryScope`, `createSessionHistoryState`,
  `resetSessionHistoryState`, `runSessionHistoryPull`). The session walk is
  `tag: 'SessionHistory'`, `coverageKeys: ['childIds']`, `pageSize: 200`, `logTiming: false`,
  `dropLostCoverage: false`.
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
    `readCoverage` returns `classIds: ['class-1', 'class-2']`, and the next unforced run makes a
    fetch from `position: null`. After it, `rescanClassIds` is `['class-1', 'class-2']`.
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
  - **`a lost child leaves coverage, and its return re-walks`** (Codex round 1). A Probe walk with
    `coverageKeys: ['childIds']` and `dropLostCoverage: true` completes with
    `rescanChildIds: ['child-a', 'child-b']`. `readCoverage` then returns `['child-b']`. A run at
    +16 minutes saves one delta page, and the stored cursor has `rescanChildIds: ['child-b']`.
    `readCoverage` returns both again. The next unforced run makes a fetch from `position: null`,
    and afterwards `rescanChildIds` is `['child-a', 'child-b']`.
  - `a lost class leaves coverage, and its return re-walks`: the same with
    `coverageKeys: ['childIds', 'classIds']` and `class-1`; `rescanClassIds` is `[]` in between.
  - `a loss during a paused re-walk leaves its snapshot`. A re-walk due for
    `['child-a', 'child-b']` stops on budget after one page, with `rewalkChildIds` holding both.
    `child-a` is then lost. The resumed run finishes with `rescanChildIds: ['child-b']`.
  - `a run that makes no request writes nothing`. A loss within 15 minutes of completion gives
    `{ status: 'fresh' }`, and the `sync_state` row is equal, column for column, before and after.
  - **`a child lost while a page is in flight is not re-added`** (Codex round 2). Here the Probe's
    `readCoverage` reads a real `probe_grants (child_id text)` table through the `db` it is
    given, and its `savePage` resolves `pullState` inside `runRepositoryTransaction`. The walk
    completes with `rescanChildIds: ['child-a', 'child-b']`. At +16 minutes a run starts, and
    its first fetch waits on a deferred. The test deletes `child-a` from `probe_grants`, then
    releases an empty page. The result is `{ status: 'complete', pages: 1 }`, and the stored
    cursor has `rescanChildIds: ['child-b']`. After `child-a` is inserted again, the next
    unforced run makes a fetch from `position: null`.
  - `the failure marker is bounded too`: the same, but the released fetch returns
    `{ error: { message: 'Network request failed' } }`. The result is
    `{ status: 'transport', pages: 0 }`,
    and the stored cursor has `lastFailureAt` set and `rescanChildIds: ['child-b']`.
  - `removeFromHistoryCoverage drops only the given ids`. Take a stored cursor with
    `rescanChildIds: ['a', 'b']`, `rewalkChildIds: ['a', 'b']`, `firstWalkChildIds: null`,
    `rescanClassIds: ['class-1']` and `last_pulled_at` `L`. Removing `['a']` from `childIds`
    returns true. It leaves `['b']`, `['b']` and null, keeps `rescanClassIds`, and leaves every
    other cursor field and `last_pulled_at` equal. For an absent scope it returns false, and
    `select count(*) from sync_state` is unchanged.
  - **`the session walk keeps a lost child covered`** (its read grant is historical). The session
    walk completes for `child-a` and `child-b`; `child-a`'s assignment ends; a forced run saves a
    delta page. The cursor still has `rescanChildIds: ['child-a', 'child-b']`. After `child-a` is
    reassigned, no fetch in the next forced run is from `position: null`.
  - `MR002 stops as year_mismatch`. The first page returns
    `{ error: { code: 'MR002', message: 'academic_year_mismatch' } }`, giving
    `{ status: 'year_mismatch', pages: 0 }`. The cursor has `lastFailureAt` set and
    `complete: false`, `savePage` was never called, and the end line contains
    `failureKind=year_mismatch`.
- [ ] **Step 5: Run** `npm run test:integration -- __tests__/historyWalk.test.js`. Expected:
  FAIL.
- [ ] **Step 6: Implement** class coverage, `firstPageSize`, `'disabled'`, `dropLostCoverage`
  with its in-transaction bound, `historyCoverage.js`, `'year_mismatch'`, timing and the null
  window.
- [ ] **Step 7: Run** Step 1's commands and Step 5's. Expected: PASS, with session counts
  unchanged.
- [ ] **Step 8: Docs.**
  - Contract map, CAP-004 section (`:759`): "traversal lives in `src/services/historyWalk.js`;
    sessions are one walk config". Add: "sessions keep a lost delivery child in their covered
    set, because the session read grant is historical; walks whose grant can be lost set
    `dropLostCoverage`, and each of their durable writes bounds coverage to the grants it reads
    in its own transaction".
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
       - the cursor, from `resolveHistoryPullState(txn, pullState)` (Task 4), so a walk's bound
         reads the grants inside this transaction;
       - `admit()` again, with no await after it (`sessionsRepository.js:263-267, 318-325`).
    - Present parents, whatever their `sync_status`, and their items are left alone: an
      immutable fact (ADR-0007). It writes no outbox row.
  - **`batteryRuns.saveHistoryPage(rows, { scope, pullState, admit }) → Promise<{ inserted: number, advanced: number }>`**:
    shape check, then `admit`, children, `mergePulledRunHeaders`, the cursor (resolved the same
    way) and `admit`, in one transaction.

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
  - `another EA's run header from before the year lands as the FK target and never lists`
    (embedded-header rule, Task 2). A co-EA's (`user-2`) Q1 family dated 2026-01-15 carries a
    header started `2026-01-14T20:00:00Z`. The page saves with foreign keys enforced, the run is
    stored with `started_here = 0`, and `createBatteryRunsRepository({ database: db }).getRunsForUser('user-1')`
    does not include it.
  - `the statement budget holds`. Using `createCountingSqliteTestDatabase`
    (`test-support/countingSqliteAdapter.js`), the 50 × 61 page uses fewer than 100 statements
    (the per-row CAP-004 path would be over 3,000).
  - `an actor change at the cursor write rolls back the whole page`. `admit` returns false on its
    second call, giving zero parents, zero items and no cursor
    (`sessionHistoryPull.test.js:256-281` pattern).
  - `a pullState function is resolved inside the page's transaction` (Codex round 2). For a
    page of 3 families, the function runs `select count(*) as n from assessments` on the `txn`
    it receives and gets `{ n: 3 }`, and the stored cursor is the one it returned. When it
    throws, there are zero parents and no cursor.
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

### Task 6: Mastery page apply — the monotonic merge, and the handover delete

**Files:**
- Create: `src/utils/serverTimestamps.js`, unless Task 0 found Plan 2's equivalent
- Modify: `src/db/repositories/masteryRepository.js` (Plan 2's version; add `saveHistoryPage`,
  the named export `deleteUndeliveredLetterMastery` and the named export
  `letterMasteryHistoryScope`, which Task 7 re-exports)
- Modify: `src/db/repositories/childrenRepository.js` (`buildChildEaReconcile`, `:121-164`)
- Test: create `__tests__/serverTimestamps.test.js` (unit) and
  `__tests__/letterMasteryHistoryPage.test.js` (real SQLite; add to `jest.integration.config.js`);
  extend `__tests__/pullReconcile.integration.test.js` (already in `jest.integration.config.js:59`)
- Docs: contract map (the merge rules; a new bullet in "Reconcile invariants and safety rails",
  `:793-803`; the `child_ea_assignments` row of the acknowledgment table, `:750`),
  `documentation/LEARNING.md` (a short section: why the merge compares accepted server tuples and
  never the local edit's own time; why refused-correction evidence must not block recovery; why a
  handover deletes on the grant loss and never on an empty page; why a delete outside the walk
  must invalidate the walk's coverage in the same transaction), build log

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
    - one lookup of the **outstanding** `sync_outbox` rows for those record ids:
      `table_name = 'letter_mastery'` and `status in ('pending', 'failed', 'in_flight')`, the
      "still owed" set of `hasPendingRecord` (`src/db/repositories/syncOutboxRepository.js:119-130`);
    - then per row:
      - **absent:** insert it, `synced`, with `server_changed_at = changed_at` and
        `server_correction_id = correction_id`;
      - **an outstanding correction** (local `sync_status` `pending` or `failed`, or an
        outstanding outbox row): skip. Its acknowledgement brings back the authoritative record
        (AR §10.2). Plan 2's ordering-aware `setLetterMastery` keeps a newer outstanding
        correction in exactly this state, so the two agree;
      - **a `terminal` outbox row does not block** (Codex round 1; this restores AR §11.3's rule,
        which skips only pending, failed or in-flight rows). `finalizeTerminalFailure`
        (`src/services/offlineSync.js:955-983`) keeps the outbox row as `terminal` and marks the
        domain row `terminal`. Skipping on any outbox row would make the terminal rule below
        unreachable, and, once a row was restored, would block every later pull for it;
      - **local `synced`:** apply only if
        `compareServerTuples(pulled, [local.server_changed_at, local.server_correction_id]) === 1`.
        This includes a row the terminal rule restored, whose terminal outbox row remains;
      - **local `terminal`:** apply if the result is `1` or `0`;
      - a null local tuple counts as lowest, so apply.
    - "Apply" overwrites `confirmed`, `changed_at`, `correction_id`, `changed_by`,
      `programme_id`, `created_at`, `updated_at`, `server_updated_at` and both server ordering
      columns, and sets `sync_status = 'synced', last_sync_error = null`.
    - It never touches `sync_outbox`, so a refused correction stays visible in needs-attention.
    - Then the cursor, from `resolveHistoryPullState(txn, pullState)` (Task 4), and `admit()`.
- Produces, in `masteryRepository.js`, `letterMasteryHistoryScope(userId)` →
  `letter_mastery_pull:<userId>`. It lives here because the handover needs it, and Task 7
  re-exports it.
- Produces, in `masteryRepository.js`, the named export
  **`deleteUndeliveredLetterMastery(txn, { userId, childIds }) → Promise<number>`**
  **(plan call, deviates from AR §11.3: AR's only mastery removal is the `acknowledged` delete of
  §10.2, which cannot help an EA with nothing left to upload).** It runs in the caller's
  transaction. `childIds: []` does nothing and returns 0. Otherwise it takes three steps:
  1. **The undelivered ids.** It runs
     `select json_each.value as child_id from json_each(?) where not exists (select 1 from child_ea_assignments a where a.child_id = json_each.value and a.user_id = ? and a.unassigned_at is null)`.
     If none are left, it stops and returns 0.
  2. **The delete,** bound to those ids:

     ```sql
     delete from letter_mastery
     where child_id in (select value from json_each(?))
       and sync_status = 'synced'
       and not exists (
         select 1 from sync_outbox o
         where o.table_name = 'letter_mastery'
           and o.record_id = letter_mastery.id
           and o.status in ('pending', 'failed', 'in_flight')
       )
     ```

  3. **The coverage drop (Codex round 2).** It calls
     `removeFromHistoryCoverage(txn, { scope: letterMasteryHistoryScope(userId), coverageKey: 'childIds', ids })`
     (Task 4) with the undelivered ids, whether or not step 2 deleted any of their rows. A delta
     cannot bring back a deleted row older than its 120 s overlap, so only a re-walk can. With
     the child gone from coverage, its return is a gain and re-walks, even when no walk wrote in
     between (a `fresh` run writes nothing).
     - The assessment and run cursors are not touched. Their coverage is class-based, and a
       delivery handover deletes none of their rows (Task 4).
     - An undelivered id whose rows were all kept (pending, failed, terminal) leaves coverage
       too. Its grant is lost, and the walk's next write would drop it anyway.

  - It returns the deleted count and enqueues no outbox row: the server already owns the change
    of authority.
  - **Kept:** `pending`, `failed` and `terminal` domain rows, and any row with an outstanding
    outbox row.
  - A `synced` row whose only outbox row is `terminal` (restored by the terminal rule) is
    deleted. Its terminal outbox row stays in needs-attention as the evidence: `getSyncStatus`
    reads `sync_outbox` only (`syncOutboxRepository.js:407-484`).
  - Step 1's active-assignment guard is redundant today (`idx_child_ea_assignments_active_unique`,
    `src/db/migrations.js:294`, allows one active row per pair). It keeps the export correct for
    any caller, and it keeps a child that is still delivered in coverage.
  - At most four statements: step 1's select, the delete, and `removeFromHistoryCoverage`'s one
    read and at most one write.
- Modifies **`buildChildEaReconcile`** (`src/db/repositories/childrenRepository.js:121-164`). Its
  `apply` (`:155-165`) now does three things in the reconcile transaction:
  1. it reads `select distinct child_id ${absentSql}` with `userId, acknowledgedIdsJson` (the
     children it is about to end);
  2. it runs today's update;
  3. it calls `deleteUndeliveredLetterMastery(txn, { userId, childIds })`, which deletes and
     drops coverage in this same transaction.

  It still returns the update's `changes`, so `ended` keeps its meaning and the existing
  reconcile tests stay as they are.
  - **Driven by the grant loss only.** The child EA reconcile ends a row only from the validated,
    complete `get_reconcile_acknowledgments` snapshot (contract map "Server-authoritative
    relationship acknowledgment"). No mastery page, empty or not, deletes anything.
  - **Mass-end breaker.** The delete runs inside `apply`, which `runReconcileWithMassEndBreaker`
    (`src/db/repositories/repositoryRuntime.js:39-77`) calls only when the breaker has not tripped
    or Apply granted the bypass. A tripped breaker ends no assignment, deletes no mastery and
    drops no coverage. Mastery gets no breaker of its own, for three reasons:
    - it deletes only accepted server state (`synced`, nothing owed);
    - it deletes it only for exactly the assignments the breaker admitted;
    - that state comes back when the assignment does. The same transaction dropped the child
      from the mastery cursor (step 3), so the regained child is a coverage gain and re-walks.
  - The per-row fallback never reconciles (`runBatchWithPerRowFallback`,
    `repositoryRuntime.js:79`), so it never deletes mastery.
  - A child the EA removes on the phone (`deleteStaffChild`, `childrenRepository.js:687-709`, a
    pending end) is not reconciled, so its rows stay. No reader shows them (below), and
    reassignment re-walks.
  - **Readers already show only current delivery children's mastery** (checked on 2026-10-20), so
    this delete changes no screen. It keeps the phone's data true and makes Gate 4's exported
    database exact.
    - `LetterMasteryPanel` is mounted by `ChildResultsScreen.js:143` and `LetterTrackerScreen.js:18`.
      Both are reached from `ClassDetailScreen.js:92-94`, whose rows come from
      `getChildrenInClass` (`src/context/ClassesContext.js:581-583`, a filter of
      `useChildren().children`), and from `LetterMasteryRankingScreen.js:73`.
    - `LetterMasteryRankingScreen.js:27` ranks `useChildren().children`.
    - `LetterTrackerBottomSheet` opens for the session form's attendees, picked through
      `ChildSelector.js:79` from `useChildren().children`.
    - `useChildren().children` is `childrenRepository.getMyChildren` (`ChildrenContext.js:89, :320`;
      `childrenRepository.js:720-748`), which joins an active `child_ea_assignments` row.
  - **Residual (accepted):** the 6–8-day backstop re-walk can re-download a row whose last writer
    is this EA for a child it no longer delivers (AR §10.3 lets the last writer read it). That row
    then waits until reassignment re-walks it. No reader shows it, and it holds only this EA's own
    write.
  - **Residual (accepted, rare timing; Codex round 2).** A mastery page fetched before the
    handover and saved after it re-inserts that child's rows, because the page apply does not
    check grants. No reader shows them, and that page's bounded cursor no longer covers the
    child (Task 4), so a return re-walks it.

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
  - **`a refused correction is restored through the real terminal finalizer`** (AR §15; Codex
    round 1, Review Focus 7). It runs twice, with the accepted correction id sorting below and
    then above the refused one. The refusal goes through Plan 2's sync and `finalizeTerminalFailure`;
    the state is not hand-seeded. Setup: `bindTestActor(db, 'user-1')` and a synced active
    `child_ea_assignments` row for `child-1`. `pulled(...)` builds a Task 2 mastery row for
    `child-1`, and `pageOptions()` gives a fresh `{ scope, pullState, admit: () => true }`.

    ```js
    import { createOutboxSyncEngine } from '../src/services/offlineSync';
    import { createSupabaseMock } from '../test-support/supabaseSyncMock';

    const ACCEPTED_BELOW = '00000000-0000-4000-8000-000000000000'; // below any v4 id
    const ACCEPTED_ABOVE = 'ffffffff-ffff-4fff-bfff-ffffffffffff'; // above any v4 id
    const session = async () => ({ data: { session: { user: { id: 'user-1' } } } });

    test.each([['below', ACCEPTED_BELOW], ['above', ACCEPTED_ABOVE]])(
      'a refused correction is restored through the real terminal finalizer (accepted id sorts %s)',
      async (_label, acceptedId) => {
        const id = letterMasteryDomainId({ childId: 'child-1', letter: 'k', language: 'en' });
        await mastery.saveHistoryPage(
          [pulled({ letter: 'k', confirmed: true, changed_at: T2, correction_id: acceptedId })], pageOptions());
        await mastery.setLetterMastery({ childId: 'child-1', letter: 'k', language: 'en', confirmed: false });
        const { supabaseClient } = createSupabaseMock({
          rpcResults: { set_letter_mastery: { data: null, error: { code: 'MA001', message: 'correction mismatch' } } },
        });
        const engine = createOutboxSyncEngine({
          enqueueRequest: (task) => task(), getAuthSession: session, database: db, supabaseClient,
        });
        await engine.syncAll();

        const evidence = await db.getFirstAsync(
          'select * from sync_outbox where table_name = ? and record_id = ?', 'letter_mastery', id);
        expect(evidence.status).toBe('terminal');
        expect(await db.getFirstAsync('select sync_status from letter_mastery where id = ?', id))
          .toEqual({ sync_status: 'terminal' });

        // An equal accepted tuple restores the accepted value although the terminal row remains.
        await mastery.saveHistoryPage(
          [pulled({ letter: 'k', confirmed: true, changed_at: T2, correction_id: acceptedId })], pageOptions());
        expect(await db.getFirstAsync(`
          select confirmed, correction_id, sync_status, last_sync_error, server_changed_at, server_correction_id
          from letter_mastery where id = ?`, id)).toEqual({
          confirmed: 1, correction_id: acceptedId, sync_status: 'synced', last_sync_error: null,
          server_changed_at: T2, server_correction_id: acceptedId,
        });

        // Then the synced rule: an older tuple is skipped, a newer one applies.
        await mastery.saveHistoryPage(
          [pulled({ letter: 'k', confirmed: false, changed_at: T1, correction_id: HIGH })], pageOptions());
        expect(await db.getFirstAsync('select confirmed from letter_mastery where id = ?', id))
          .toEqual({ confirmed: 1 });
        await mastery.saveHistoryPage(
          [pulled({ letter: 'k', confirmed: false, changed_at: T3, correction_id: MID })], pageOptions());
        expect(await db.getFirstAsync(
          'select confirmed, server_changed_at, server_correction_id from letter_mastery where id = ?', id))
          .toEqual({ confirmed: 0, server_changed_at: T3, server_correction_id: MID });

        // The evidence is untouched and still needs attention.
        expect(await db.getFirstAsync('select * from sync_outbox where id = ?', evidence.id)).toEqual(evidence);
        expect((await engine.getSyncStatus()).needsAttentionItems)
          .toEqual([expect.objectContaining({ table: 'letter_mastery', id, terminal: true })]);
      },
    );
    ```

  - `an in-flight correction blocks the merge`: after `setLetterMastery`, the outbox row is set
    to `in_flight` (as `markInFlight` leaves it mid-upload). A newer pulled tuple leaves the row,
    its values and its outbox row unchanged.
  - **`a refused correction never shows as mastery when the pager returns nothing`**. A terminal
    local row, then an empty page, gives no row from `getLetterMastery({ childId, language })`
    (Plan 2 excludes terminal), and the cursor saves.
  - `a malformed changed_at rejects the page whole`.
- [ ] **Step 3: Write the failing handover tests** (extend `__tests__/pullReconcile.integration.test.js`,
  in `describe('relationship-scoped pull reconcile')` after `:169`). Rows are inserted by SQL with
  Plan 2's columns and ids from `letterMasteryDomainId`; outbox rows carry
  `owner_user_id = 'user-1'` and the stated `status`.
  - **`child EA reconcile deletes the ended child's synced letter mastery and keeps what is owed
    or refused`.** Seed `child-kept` and `child-absent` with synced assignments `cea-kept` and
    `cea-absent`, and these rows:

    | Child | Letter | Domain `sync_status` | Outbox row | After the reconcile |
    |---|---|---|---|---|
    | `child-absent` | `a` | `synced` | none | deleted |
    | `child-absent` | `b` | `pending` | `pending` | kept |
    | `child-absent` | `c` | `synced` | `in_flight` | kept |
    | `child-absent` | `d` | `failed` | `failed` | kept |
    | `child-absent` | `e` | `terminal` | `terminal` | kept |
    | `child-absent` | `f` | `synced` | `terminal` | deleted; its outbox row kept |
    | `child-kept` | `a` | `synced` | none | kept |

    `saveServerStaffChildRows([], { reconcile: { acknowledgedIds: ['cea-kept'], pulledAt: PULLED_AT, userId: 'user-1' } })`
    resolves to `{ applied: 0, skipped: 0, failed: 0, ended: 1, fallbackUsed: false, reconcileCompleted: true }`.
    `select letter, child_id from letter_mastery order by child_id, letter` equals exactly the
    kept rows. `select * from sync_outbox order by id` is equal before and after.
    `PRAGMA foreign_key_check` is empty.
    - **The coverage drop (Codex round 2).** Before the reconcile, seed two `sync_state` rows:
      - `letter_mastery_pull:user-1`, with `last_pulled_at` `L` and a cursor holding
        `rescanChildIds: ['child-absent', 'child-kept']`, `rewalkChildIds: ['child-absent', 'child-kept']`,
        a `rescanAfter` position, `complete: true` and the other CAP-004 fields;
      - `assessment_history_pull:user-1:programme-a`, whose `rescanChildIds` holds
        `child-absent`.

      After the reconcile, the mastery cursor equals the seeded one except that both sets are
      `['child-kept']`, and its `last_pulled_at` is still `L`. The assessment row is equal,
      column for column.
  - `a tripped breaker deletes no letter mastery, and Apply's bypass deletes it`. Reuse
    `seedChildEaAssignments` (`:651`) and give each of the 15 children one synced row, plus a
    mastery cursor covering all 15. With 3 acknowledged, the result has
    `reconcileCompleted: false`, all 15 rows remain and the cursor is unchanged. With
    `bypassBreaker: true`, the 12 ended children's rows are deleted, the 3 kept remain, and the
    cursor's `rescanChildIds` holds only the 3.
  - `a same-pair supersede deletes no letter mastery`: the `:908` case, with a synced row for
    `child-ea-supersede` and a mastery cursor covering it, keeps that row and leaves the cursor
    unchanged (`ended: 0`; the child is still delivered).
  - `a pending local end is not a reconcile`: `deleteStaffChild('user-1', 'child-absent')` leaves
    `child-absent`'s synced row and the mastery cursor in place.
  - `a reconcile with no mastery cursor creates none`: the first case without the seeded
    `sync_state` rows ends `child-absent`, deletes its row, and leaves
    `select count(*) from sync_state where scope like 'letter_mastery_pull:%'` at 0.
- [ ] **Step 4: Run**
  `npm run test:integration -- __tests__/letterMasteryHistoryPage.test.js __tests__/pullReconcile.integration.test.js`
  and `npx jest __tests__/serverTimestamps.test.js`. Expected: FAIL.
- [ ] **Step 5: Implement** the three modules.
- [ ] **Step 6: Run** Step 4's commands, then
  `npx jest __tests__/masteryState.test.js __tests__/LetterMasteryPanel.test.js __tests__/productionBindingStatic.test.js`
  and `npm run test:integration -- __tests__/pullReconcileOffline.integration.test.js __tests__/ChildrenContextPull.integration.test.js`.
  Expected: PASS.
- [ ] **Step 7: Docs and commit.**
  - Contract map:
    - the mastery merge rules, including "a terminal outbox row never blocks the merge";
    - a "Reconcile invariants and safety rails" bullet: "Ending a child EA assignment also deletes
      that child's `synced` `letter_mastery` rows that have no `pending`, `failed` or `in_flight`
      outbox row, in the same transaction and behind the same breaker. Nothing is enqueued.
      Outstanding and refused corrections stay. The same transaction drops the child from the
      mastery walk's covered sets, so its return re-walks even if no walk ran in between";
    - the `child_ea_assignments` row of the acknowledgment table (`:750`) names the delete.
  - The LEARNING section.
  - Build log.
  - Commit `feat(mastery): monotonic history merge over accepted server tuples; handover delete`.

---

### Task 7: The three walks and their scope queries

**Files:**
- Create: `src/services/assessmentHistoryPull.js`
- Test: create `__tests__/assessmentHistoryPull.test.js` and `__tests__/letterMasteryHandover.test.js`
  (real SQLite with a fake keyset server; add both to `jest.integration.config.js`); extend
  `__tests__/ClassesContextPull.integration.test.js`
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
    - `letterMasteryHistoryScope(userId)` → `letter_mastery_pull:<userId>`, re-exported from
      Task 6's `masteryRepository.js`, where the handover needs it.
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
        `logTiming: true`, `dropLostCoverage: true`;
      - scope: active programme and active year, or `'dependency'`; `windowStart = year.starts_on`;
      - coverage: `readAssessmentScope`;
      - fetch: `get_battery_run_history_page`, with `p_academic_year_id: context.academicYearId`;
      - save: `repositories.batteryRuns.saveHistoryPage`.
    - **`runAssessmentHistoryPull`**: the same, with `tag: 'AssessmentHistory'`, first page 10
      then 50, `get_assessment_history_page` and `repositories.assessments.saveHistoryPage`.
    - **`runLetterMasteryHistoryPull`**:
      - `tag: 'LetterMasteryHistory'`, `coverageKeys: ['childIds']`, page size 200,
        `logTiming: true`, `dropLostCoverage: true`;
      - scope `letterMasteryHistoryScope(userId)`, `windowStart: null`; no programme needed;
      - coverage: `readMasteryScope`;
      - fetch: `get_letter_mastery_page`;
      - save: `repositories.mastery.saveHistoryPage`.
  - `createAssessmentHistoryStates() → { batteryRuns, assessments, mastery }`, three
    `createHistoryWalkState()` values.
  - For both programme walks, `resolveScope` returns `context: { programmeId, academicYearId }`,
    and `readCoverage` passes `context.academicYearId` to `readAssessmentScope`. The same
    `academicYearId` is sent as `p_academic_year_id` on every page, so the year that sets
    `windowStart`, the coverage and the request is one value read once per run.
  - Each walk takes its repository from `deps.repositories` and falls back to the
    `create…Repository({ database })` factory, as sessions do (`sessionHistoryPull.js:80`).

- [ ] **Step 1: Write the failing tests.** The fake server keeps three row lists and implements
  each RPC's keyset, overlap and page size, like `sessionHistoryPull.test.js:23-58`. It can
  return `MR001` per RPC.
  - Each list is a function read on every call, as `sessionHistoryPull.test.js:25-26` does, so a
    test can hide rows from this EA between runs. That is how a lost grant looks from the phone.
  - It holds an active year id, `'year-2026'` by default. A programme RPC whose
    `p_academic_year_id` differs returns `{ data: null, error: { code: 'MR002', message: 'academic_year_mismatch' } }`.
    Tests that change the local year change it too, unless they test a mismatch.
  - `a fresh phone shows another EA's letter result and confirmation`. The server holds a
    co-EA's 61-item letter result and a confirmation for `child-1`. The three walks run in order
    and each returns `complete`. Then `loadMasteryState(...)` gives the union of the result's
    mastered letters and the confirmed letter (lesson-plan §9 B1 fresh-device test).
  - `a run with no Questions arrives through the run walk, and its completion through a delta`.
  - `a class gained re-walks the assessment and run walks` (Review Focus 2). After a complete
    walk, a synced `class_ea_assignments` row for `class-2` is added. The next unforced runs of
    both walks each make a request with `p_after_id: null` and download an older family dated
    2026-03-01.
  - `a delivery child moving into a held class re-walks`: a synced membership of an existing
    delivery child in `class-1` appears.
  - `a pending membership or class assignment is not coverage`: an unsynced row adds nothing to
    `readAssessmentScope` and triggers no re-walk.
  - `a delivery child gained re-walks the mastery walk`.
  - **`a delivery child lost, corrected while hidden, then regained converges`** (Codex round 1's
    reproduction, Review Focus 6).
    1. The mastery walk completes for `child-a` and `child-b`. The server holds `child-a`'s `k`
       confirmed at `08:00`.
    2. `child-a`'s assignment ends by SQL (`unassigned_at` set, `synced`). The handover delete
       is not used here, so the stale local row stays, which is Codex's state. The server hides
       `child-a`'s rows from this EA.
    3. A co-EA un-confirms `k` at `08:20`; the row is hidden.
    4. `child-b`'s row changes at `08:40`, and a run at +16 minutes saves that delta. The cursor
       is at `08:40` with `rescanChildIds: ['child-b']`.
    5. `child-a` is reassigned (synced, active), and the server shows its rows again.
    6. The next unforced run makes a request with `p_after_id: null` (the re-walk, after its
       delta). Afterwards `child-a`'s `k`
       is `confirmed: 0` with `server_changed_at` `08:20`, and `rescanChildIds` is
       `['child-a', 'child-b']`.
  - **`a class lost, a co-EA's result added while hidden, then the class regained re-walks`**
    (Review Focus 6). Both programme walks complete with `class-1` held. The class assignment
    ends (synced, `unassigned_at` set), and the server hides `class-1` members' rows. A co-EA's
    family for `child-c`, a `class-1` member, lands at `08:20`, hidden. The EA's own family lands
    at `08:40`, and a run saves it, so the cursor passes `08:20` with `rescanClassIds: []`. After
    `class-1` is reassigned, the next unforced runs of both walks each make a request with
    `p_after_id: null`, and `child-c`'s family is stored.
  - **`a stale local year never completes`** (Review Focus 9). The fake server's year is
    `'year-2027'`; the phone still holds `'year-2026'` active. The assessment walk's first
    request carries `p_academic_year_id: 'year-2026'` and returns
    `{ status: 'year_mismatch', pages: 0 }`. No family is stored, and the cursor has
    `lastFailureAt` set and `complete: false` (Task 11 checks `masteryInputsComplete` on it).
  - **`a server year change between pages stops at the saved page`.** With 15 families
    (first page 10), the fake server switches to `'year-2027'` after the first page. The result
    is `{ status: 'year_mismatch', pages: 1 }`, and the cursor holds page 1's last
    `updatedAt`/`id` with `complete: false`. Then the test makes `'year-2027'` the local active
    year by SQL, which is the walk-level stand-in; Task 8 proves the real refresh gets there.
    The next run's first request has `p_after_id: null` and `p_academic_year_id: 'year-2027'`,
    because the new `windowStart` reset the cursor.
  - `absence never deletes`: after the server drops a family and a re-walk runs, the local family
    remains. The same for mastery: after the server stops returning a synced row (a re-walk with
    an empty page), the local row remains. Only the handover delete removes mastery.
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
  - **`letterMasteryHandover.test.js`: Gate 4's sequence** (Review Focus 8). It uses real
    repositories, the real reconcile and the real mastery walk; only the server is fake.
    `bindTestActor(db, 'user-1')`. `user-1` delivers `child-m` and `child-n` (synced assignments
    `cea-m`, `cea-n`).
    1. **EA1 confirms and syncs.** `setLetterMastery({ childId: 'child-m', letter: 'k', language: 'en', confirmed: true })`.
       The test reads the slot's `correction_id` and runs `createOutboxSyncEngine(...).syncAll()`
       with `createSupabaseMock({ rpcResults: { set_letter_mastery: { data: [{ outcome: 'applied', confirmed: true, changed_at: T1, correction_id: <that id>, changed_by: 'user-1' }], error: null } } })`.
       The row is `synced`, with `server_changed_at: T1`. The fake server now holds `k` at
       `(T1, <that id>)`, and EA1's mastery walk completes with
       `rescanChildIds: ['child-m', 'child-n']`. EA1 then queues `s` for `child-m` (`pending`,
       not synced).
    2. **Head Office moves the child to EA2.** EA1's roster persist runs
       `saveServerStaffChildRows([cea-n], { reconcile: { acknowledgedIds: ['cea-n'], pulledAt, userId: 'user-1' } })`.
       - Result: `ended: 1`.
       - `k` is deleted, and `s` stays with its pending outbox row.
       - `childrenRepository.getMyChildren('user-1')` no longer lists `child-m`.
       - Before any walk runs, the mastery cursor's `rescanChildIds` is already `['child-n']`
         (Task 6's coverage drop).
    3. **EA2 un-confirms.** The fake server's `k` for `child-m` becomes `(T2, C2)`,
       `confirmed: false`, `changed_by: 'user-2'`, hidden from `user-1`. EA1's forced mastery walk
       returns `complete`. `getLetterMastery({ childId: 'child-m', language: 'en' })` returns only
       the pending `s`, and the cursor's `rescanChildIds` is `['child-n']`.
    4. **Head Office gives the child back.** `cea-m` is active again (synced), and the server
       shows `child-m`'s rows to `user-1`. The next unforced mastery walk makes a request with
       `p_after_id: null`. `k` is stored as `confirmed: 0` with `server_changed_at: T2`, and `s`
       is still pending with its outbox row unchanged.
  - **`letterMasteryHandover.test.js`: a handover inside the freshness window still re-walks on
    return** (Codex round 2's reproduction, Review Focus 6). Same setup; the fake server holds
    `child-m`'s `k` at `(07:00, C1)` and `child-n`'s `a` at `08:00`.
    1. The mastery walk completes at 09:00 with `rescanChildIds: ['child-m', 'child-n']`. Its
       cursor is at `08:00`, so `k` is older than the 120 s overlap.
    2. At 09:05 the reconcile ends `cea-m` (`ended: 1`). `k` is deleted, and the cursor's
       `rescanChildIds` is `['child-n']`.
    3. At 09:06 an unforced mastery walk returns `{ status: 'fresh', pages: 0 }` with no request,
       and the `sync_state` row is equal before and after.
    4. At 09:07 `cea-m` is active again (synced). The next unforced mastery walk makes a request
       with `p_after_id: null`. `k` is stored with `server_changed_at` `07:00`, and
       `rescanChildIds` is `['child-m', 'child-n']`.

    Without the coverage drop, step 4's walk would return `fresh`. A forced delta would start at
    `08:00` minus 120 s and never reach `k`.
  - **`letterMasteryHandover.test.js`: a walk in flight across the handover cannot re-add the
    child** (Codex round 2). Same setup and step 1. At +16 minutes an unforced mastery walk
    starts a delta, and the fake server holds its first request on a deferred. The test runs
    the reconcile ending `cea-m` and awaits it: `k` is deleted, and `rescanChildIds` is
    `['child-n']`. It then releases an empty page. The walk returns `complete`, and the stored
    `rescanChildIds` is still `['child-n']`; without Task 4's in-transaction bound it would be
    both. After `cea-m` is reassigned, the next unforced walk makes a request with
    `p_after_id: null` and `k` is back.
- [ ] **Step 2: Run** `npm run test:integration -- __tests__/assessmentHistoryPull.test.js __tests__/letterMasteryHandover.test.js __tests__/ClassesContextPull.integration.test.js`.
  Expected: FAIL.
- [ ] **Step 3: Implement** `assessmentHistoryPull.js`.
- [ ] **Step 4: Run** Step 2's command plus `npx jest __tests__/productionBindingStatic.test.js`.
  Expected: PASS.
- [ ] **Step 5: Docs.**
  - The new contract-map subsection covers:
    - the three scopes and cursors;
    - coverage, and why it counts only synced rows;
    - re-walks on gains, with lost grants dropped from coverage (`dropLostCoverage`) so a
      regained one is a gain; sessions excepted, with the reason;
    - the bound inside each durable write's transaction, and the handover's own coverage drop
      (Task 6); why the programme walks need no drop (nothing deletes their rows);
    - page sizes, run order and the switch;
    - the year agreement: `p_academic_year_id`, `MR002`, and the store's refresh and restart;
    - the embedded-header rule (Task 2);
    - "absence never deletes" and "no page reconcile". Mastery's one removal is the handover
      delete in the child EA reconcile (Task 6);
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

### Task 7A: The reference refresh switches the active academic year in any response order (Codex round 2)

A pre-existing bug, fixed here because MR002 recovery (Task 8) is this refresh. It would also hit
every phone at the January rollover. It needs nothing from Tasks 1–7 and can be built first.
- `pullReferenceDataRows` fetches `academic_years` with no order (`src/services/offlineSync.js:1939-1950`).
- `replaceAll` upserts the rows one by one in one transaction
  (`src/db/repositories/referenceDataRepository.js:385-419`), under the partial unique index
  `idx_academic_years_active_unique` (`src/db/migrations.js:147-149`).
- So when the response lists the new active year before the old one, the first upsert makes a
  second active row and fails with `SQLITE_CONSTRAINT_UNIQUE`. The table rolls back, the refresh
  rejects before `reference_data_complete_at` is written, and the phone keeps last year active.
  Every refresh that gets the same order fails the same way. Codex reproduced it through the real
  repository; the reverse order succeeds.
- The same happens when the phone's active year is missing from the response, whatever the order.

**Decision (plan call): the repository keeps the one-active-year rule, inside the replace
transaction.** Ordering the fetch alone would not cover a local active year that the response
leaves out, and would leave every other caller order-dependent.

**Files:**
- Modify: `src/db/repositories/referenceDataRepository.js`:
  - `REFERENCE_TABLES.academic_years` (`:134-158`) gains `singleActiveColumn: 'is_active'`;
  - `getConfig` (`:236-255`) passes it through (`null` by default);
  - `replaceAll` (`:385-419`).
- Test: extend `__tests__/referenceDataRepository.test.js` (real SQLite,
  `jest.integration.config.js:39`) and `__tests__/offlineSyncOutbox.test.js` (the real refresh,
  `jest.integration.config.js:23`).
- Docs:
  - contract map, the "Profile and reference refresh" bullet (`documentation/rls-sync-contract-map.md:849`);
  - the build log's Bug And Gap Register (`documentation/build-log.md:1227`), plus a Verification
    Register row.

**Interfaces:**
- `replaceAll(records, { scope })`, for a table with a `singleActiveColumn`. Inside its one
  transaction, after the scope delete and before the upsert loop, it acts on the records:
  - **exactly one active record:** it runs
    `update <table> set <column> = 0 where <column> = 1 and id <> ?` with that record's id, then
    the upserts in response order;
  - **no active record:** no clear, as today. The upserts write each carried row's own flag, and
    a local active year the response leaves out stays active. An empty or yearless response
    never strips the phone's year; the programme pages then answer `55000`, and the walks stay
    incomplete, which is the true state;
  - **two or more active records:** no clear. The second upsert still fails the index, and the
    table keeps its last good state. The server's own unique index forbids this response.
- The retarget by label (`retargetConflictingRows`) still runs per record, after the clear. A
  local row with the incoming active year's label but another id is cleared first, then takes the
  incoming id and its flag.
- `pullReferenceDataRows` and its unordered fetch are unchanged.

- [ ] **Step 1: Write the failing repository tests** (`referenceDataRepository.test.js`; rows
  `Y2026 = { id: 'year-2026', label: '2026', starts_on: '2026-01-15', ends_on: '2026-12-15' }`
  and `Y2025` and `Y2027` likewise, each with an explicit `is_active`):
  - **`a refresh switches the active year whatever order the server lists the years in`**,
    `test.each` over `[['the new year first', [Y2027 active, Y2026 inactive]], ['the old year first', [Y2026 inactive, Y2027 active]]]`.
    It starts from `replaceFromServer([Y2026 active])` and a `classes` row on `year-2026` (as
    `:502-530`). Then `replaceFromServer(order)` resolves `true`, and `getActive()` returns
    `year-2027`. `select id, is_active from academic_years order by id` equals
    `[{ id: 'year-2026', is_active: 0 }, { id: 'year-2027', is_active: 1 }]`, and the class keeps
    `academic_year_id: 'year-2026'`. Today "the new year first" rejects with
    `SQLITE_CONSTRAINT_UNIQUE`; "the old year first" is the control and passes today.
  - `a local active year missing from the response is cleared`: local `year-2025` active, then
    `replaceFromServer([Y2026 active])` gives `year-2026` active and `year-2025` kept, inactive.
  - `a response with no active year changes only the rows it carries`: local `year-2026` active,
    then `replaceFromServer([Y2025 inactive])` leaves `year-2026` active.
  - `two active years in one response fail whole`: inside `try/catch`, the error's message
    matches `/UNIQUE/`, and `select * from academic_years order by id` is equal before and after.
- [ ] **Step 2: Write the failing refresh test** (`offlineSyncOutbox.test.js`, beside `:2682`,
  with its `rowsByTable` builder and real reference repositories over `createMigratedDatabase`):
  **`pullReferenceData switches the active academic year whatever the response order`**,
  `test.each` over the same two orders. A first `pullReferenceData` holds `year-2026` active. The
  second, with `academic_years` in the given order and the other six tables as before, resolves
  (today it rejects for the new year first). Its result counts `academic_years: 2`, which
  `pullReferenceDataRows` returns only after every table commits, and
  `getActiveAcademicYear(db)` is `year-2027`.
- [ ] **Step 3: Run**
  `npm run test:integration -- __tests__/referenceDataRepository.test.js __tests__/offlineSyncOutbox.test.js`.
  Expected: FAIL, in the "new year first" cases, "missing from the response" and the refresh
  test's "new year first" only.
- [ ] **Step 4: Implement** the config flag and the clear in `replaceAll`.
- [ ] **Step 5: Run** Step 3's command, then `npx jest __tests__/handleServices.test.js`.
  Expected: PASS.
- [ ] **Step 6: Docs and commit.**
  - Contract map `:849`: "A refresh switches the active academic year inside its one
    `academic_years` transaction whatever order the server lists the years in. When the response
    holds an active year, every other local year is made inactive before the upserts, so
    `idx_academic_years_active_unique` never sees two active rows. A response with no active year
    changes only the rows it carries. The server's index is also checked row by row, so a
    server-side switch is two statements: clear, then set."
  - Bug And Gap Register row (2026-10-20). Gap: the refresh could not switch the active year
    when the server listed the new year first, or left the phone's active year out (the three
    code references above), and kept last year active on every such refresh. Resolution: fixed
    in AR Plan 3 Task 7A, with tests through the real repository and the real refresh; MR002
    recovery (Task 8) depends on it. Reuse note: a one-row rule enforced by a unique index must be
    kept inside the replace transaction, not left to the response order.
  - Verification Register row with Step 3 and 5 counts.
  - Commit `fix(reference): switch the active academic year whatever the response order`.

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
- Test: create `__tests__/assessmentHistoryStatus.test.js` and `__tests__/historyPullTriggerBudget.test.js`
  (both real SQLite, since the store runs the real walks and the real reference refresh; add both
  to `jest.integration.config.js`). Add cases to `__tests__/handleServices.test.js`, `__tests__/OfflineContext.test.js`,
  `__tests__/ChildrenContext.test.js`, `__tests__/ClassesContext.test.js` and
  `__tests__/AssessmentHistoryScreen.plan5.test.js`.
- Docs: the contract map subsection gets the trigger table below; ROADMAP §3 `:605` (Z8: built for
  the three history RPCs; uploads, roster and session pulls are not gated) and `:623` (Z4: pinned
  for history pulls); build log.

**Interfaces:**
- Consumes: Task 7's walks and states.
- Produces:
  - **`createAssessmentHistoryStore({ database, repositories, states, client, enqueueRequest, referenceDataReady, refreshReferenceData })`**
    returns `{ start({ userId, force = false }), reset(), getPullStates(userId), getSnapshot(), subscribe(listener) }`.
    - It mirrors `createSessionHistoryStore` (`src/services/sessionHistoryStatus.js:12-69`).
    - Its snapshot is `{ running, pageVersion, runVersion, lastResults: { batteryRuns, assessments, mastery } }`.
    - `start` awaits `referenceDataReady()`, then runs the run walk, the assessment walk and the
      mastery walk in that order.
    - A `StaleActorError` rethrows and ends the pass. `'cancelled'` ends the pass. Any other
      status lets the next walk run (plan call: AR §11.3 "either order converges").
    - **Year mismatch (Codex round 1).** When a programme walk returns `'year_mismatch'` and the
      pass has not refreshed yet, the store awaits `refreshReferenceData()`. If it resolves, the
      store runs that walk once more in the same pass. Any other `'year_mismatch'` in the pass
      ends that walk for this pass, so a pass never loops.
      - A new local year changes `windowStart`, so the rerun resets its cursor and walks the new
        year from the first page. A later programme walk in the pass reads the refreshed year
        itself.
      - A rejected refresh rethrows a `StaleActorError`. Any other rejection is logged as
        `[AssessmentHistory] reference refresh failed` with the message only; the walk is not
        rerun and stays incomplete until a later pass.
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
  - In `handleServices.js`, the store gets `referenceDataReady` (`:71-74`) and
    `refreshReferenceData: () => { assertCurrent(); return pullReferenceData(referenceOptions); }`,
    the same refresh as `services.pullReferenceData` (`:97`). It goes through the handle's
    single-flight barrier (`pullReferenceData`, `src/services/offlineSync.js:1988-1993`). After
    Task 7A it switches the active year whatever order the server lists the years in, so the
    recovery cannot fail on the year it is meant to adopt.
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
    - `getPullStates` is scoped to the user and active programme;
    - **`a year mismatch refreshes reference data once and restarts that walk`** (Review Focus
      9; Codex round 2: through the real refresh, not a SQL shortcut). The fake server's year is
      `'year-2027'`.
      - `refreshReferenceData` wraps the real `pullReferenceData` (`src/services/offlineSync.js`)
        in a call counter. It runs over the test database's real reference repositories (as
        `offlineSyncOutbox.test.js:2767-2778`), with `createLocalStateRepository({ database: db })`,
        `enqueueRequest: (task) => task()` and `userId: 'user-1'`.
      - Its `from()` builder mock is like `offlineSyncOutbox.test.js:2744-2764`. `academic_years`
        returns `year-2027` active and `year-2026` inactive. The other six tables return the
        rows the seeded database holds (`select *` before the pass), so only the year changes.
      - It runs for both response orders (`test.each`). "The new year first" fails today, inside
        the refresh.

      In one pass:
      - the run walk's first request carries `p_academic_year_id: 'year-2026'` and gets `MR002`;
      - `refreshReferenceData` is called exactly once;
      - the run walk reruns with `'year-2027'` and `p_after_id: null`;
      - the assessment walk sends `'year-2027'`;
      - `lastResults` is `complete` for all three walks.
    - `a failed refresh restarts nothing`. The same real refresh, but the mock's
      `academic_years` returns `{ data: null, error: { message: 'Network request failed' } }`.
      `lastResults.batteryRuns.status` and `lastResults.assessments.status` are
      `'year_mismatch'`, and each programme RPC was called once. `refreshReferenceData` was
      called once, the mastery walk still ran, and `getActiveAcademicYear(db)` is still
      `year-2026`.
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
  - `LetterMasteryPanel`, through Plan 2's `src/hooks/useLetterMasterySyncRefresh.js` (Plan 2
    Task 6; adapt if Task 0 finds another name), not through its dependency list. Plan 2 says
    that hook "covers uploads only. Mastery rows applied by Plan 3's pull need their own
    signal. Plan 3 may add it here, for the panel only." The hook also calls `onRefresh` when
    `useAssessmentHistoryStatus().pageVersion` changes, with the same seen-ref rule: the version
    published when the panel mounts counts as seen. The panel then refreshes through its
    background load (`loadData({ background: true })`) and keeps its grid.
  - **Not `LetterTrackerBottomSheet` (Codex round 2, orchestrator call).** Plan 2's Codex round 2
    drops the sheet's sync refresh, because a re-read under its pending marks can undo a
    cancelling tap, and only the panel mounts the hook (Task 0 checks this). So pulled pages do
    not refresh an open sheet either.
    - **Accepted risk (the same as Plan 2's A1).** An open session tracker sheet can show stale
      tiles, until it is reopened, when a pulled page changes that child's mastery. Nothing is
      saved wrongly. Each tap records the state the EA chose (`{ mastered, languageCode, madeAt }`),
      not a toggle of the stored value, and Plan 2's ordering-aware `setLetterMastery` orders it
      by its own time. The sheet loads its baseline each time it opens;
  - `src/screens/insights/LetterMasteryRankingScreen.js:45`;
  - `src/screens/insights/AssessmentRankingScreen.js:79`;
  - `src/screens/main/ChildrenListScreen.js:116`.
- Test: `__tests__/syncStatusPresenter.test.js`, `__tests__/syncStatusScreen.test.js`,
  `__tests__/AssessmentHistoryScreen.plan5.test.js`, `__tests__/ChildResultsScreen.test.js`,
  `__tests__/childrenHistoryReference.test.js`, `__tests__/LetterTrackerBottomSheet.test.js`,
  `__tests__/LetterMasteryPanel.test.js`
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
  - `LetterTrackerBottomSheet.test.js` (pins the accepted risk): with the sheet open and one
    pending change, an increment of `pageVersion` reads nothing from the mastery repository, and
    the pending change still shows. Reopening the sheet loads the baseline once.
  - `LetterMasteryPanel.test.js`: an increment of `pageVersion` that brings a new confirmation
    re-reads once without showing the spinner, and the new letter shows as taught. Mounting with
    a nonzero `pageVersion` loads once, from `useFocusEffect`.
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
    - A grant lost and then regained is not covered again until a re-walk finishes. The walk
      drops a lost id from `rescan<K>` (Task 4's `dropLostCoverage`), so check 1 or 3 is false
      for that child until then, while checks 2 and 4 already pass (Codex round 1).
    - This holds even when no walk wrote between the loss and the return (Codex round 2). The
      handover drops a handed-away child from the mastery cursor in its own transaction (Task 6),
      and a walk in flight cannot write the child back (Task 4's in-transaction bound).
    - A `'year_mismatch'` walk recorded `lastFailureAt`, so checks 1 and 3 fail until a walk
      under the server's year succeeds.
  - `services.assessmentHistory.masteryInputsComplete({ childIds }) → Promise<boolean>`, bound to
    the handle and its EA: the name the engine's input builder calls.

- [ ] **Step 1: Write the failing tests** (cursors written by the real walks of Task 7 against an
  empty fake server unless a case says what it holds; `seedCoreData`; `child-a` and `child-b`
  delivery children with synced memberships in `class-1`, held by a synced class assignment):
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
  - **`a delivery child lost and regained is false until the mastery re-walk finishes`** (Codex
    round 1, Review Focus 6). Both walks complete for `child-a` and `child-b`. `child-a`'s
    assignment ends (synced, `unassigned_at` set), and a mastery walk runs at +16 minutes.
    `child-a` is then reassigned (synced, active).
    `isMasteryInputsComplete({ ..., childIds: ['child-a'] })` is false, `['child-b']` is true.
    After the next mastery walk, which makes a request with `p_after_id: null`, `['child-a']` is
    true.
  - **`a class lost and regained is false until the assessment re-walk finishes`**: the same,
    with `class-1`'s class assignment and the assessment walk.
  - **`a handover inside the freshness window keeps the child false until the re-walk restores
    its row`** (Codex round 2, Review Focus 6). This runs through the real reconcile and walks.
    The fake server holds `child-a`'s `k`, accepted at `07:00`, and `child-b`'s `a` at `08:00`.
    1. Both walks complete at 09:00. The mastery cursor is at `08:00`, so `k` is older than the
       120 s overlap.
    2. At 09:05 `saveServerStaffChildRows` ends `child-a`'s assignment through the reconcile
       (`ended: 1`), which deletes `k`.
    3. At 09:06 an unforced mastery walk returns `fresh`.
    4. At 09:07 `child-a` is reassigned (synced, active).
       `isMasteryInputsComplete({ ..., childIds: ['child-a'] })` is false, and `['child-b']` is
       true.
    5. The next unforced mastery walk makes a request with `p_after_id: null`. `k` is back, and
       `['child-a']` is true.
  - `a year mismatch keeps it false`: the fake server's year is `'year-2027'` while the phone
    holds `'year-2026'`. After the assessment walk returns `'year_mismatch'`, false.
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
  - `get_assessment_history_page` and `get_battery_run_history_page` take
    `p_academic_year_id uuid`;
  - the three policies exist and the three old ones are gone;
  - `private.history_pull_rollout` holds three enabled everyone rows;
  - RLS is on, with zero policies on the rollout table.
- [ ] **Step 4: Rollback-only hosted matrix (Jim's yes).** Over the IPv4 session pooler (skill
  `sqlite-staging-sql`), one `BEGIN … ROLLBACK` per case, rerun Task 1's actor matrix and Task 2's
  switch, year-agreement and embedded-header cases. Then run a residue query. Expected: zero.
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
- [ ] **Gate 4: Mastery after a handover, and back (both devices).** EA1 confirms `k` for a child
  and syncs. Head Office moves the child's delivery assignment to EA2. Task 7's
  `letterMasteryHandover.test.js` runs this sequence in CI; the gate proves it on devices.
  - Pass: EA2's phone shows `k` confirmed.
  - After EA1's next foreground pull, the child is gone from EA1's lists. EA1's exported database
    has no `letter_mastery` row for the child (the handover delete, Task 6).
  - EA2 un-confirms `k` and syncs.
  - Head Office gives the child back to EA1. After EA1's next foreground, EA1's tracker shows `k`
    not confirmed, and the log shows `[LetterMasteryHistory] start … mode=rewalk_due`
    (the handover's coverage drop, Task 6).
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
    merge with the terminal rule; completeness and re-walks; page size) → Tasks 4–7, plus the
    handover delete (Task 6), which AR does not have;
  - §11.4 (pulled runs read-only) → Task 5 merge and Gate 2;
  - §11.5 → Task 9;
  - §13 → Task 13;
  - §14 gates → Task 14;
  - §15's page apply, run merge, mastery merge, pull calls and read predicates → Tasks 1, 2, 5,
    6 and 7;
  - §16 docs → folded into each task;
  - asks 3, 4 and 5 → Tasks 11, 10, and 1 + 8 + 14;
  - Task 7A fixes a pre-existing reference-refresh bug that AR does not name. Task 8's MR002
    recovery depends on it.
- **AR §14's "triggers"** is read as pull triggers (Task 8). The server stamps were built in
  Plan 1; Task 2 re-asserts them.
- **Plan 2 boundary:** this plan writes `letter_mastery` only through the merge (Task 6) and the
  handover delete in the child EA reconcile (Task 6). It never changes the upload path. Plan 2's
  ordering-aware `setLetterMastery` (its fix 2) leaves a newer correction outstanding, and both
  of this plan's writers skip outstanding rows, so they agree.
- **Codex round 1 (2026-10-20): what changed, and where it departs from AR.**
  - Coverage drops lost grants (Task 4 `dropLostCoverage`, used by the three new walks). This
    implements AR §11.3's "re-walk when the set … changes"; it is not a deviation. Sessions keep
    CAP-004's rule because their grant is historical.
  - The mastery merge skips only outstanding corrections, so a terminal outbox row no longer
    blocks it (Task 6). This restores AR §11.3's rule; it is not a deviation.
  - **Deviates from AR §11.3:** a delivery handover deletes the child's synced mastery inside the
    child EA reconcile (Task 6). AR's only mastery removal was §10.2's `acknowledged` delete.
  - **Deviates from AR §11.1:** an assessment the caller may read makes its run header readable
    inside its page row (Task 2's embedded-header rule). AR gave a run one read path.
  - **Deviates from AR §11.2's signatures:** both programme pages take `p_academic_year_id`, and
    a mismatch raises `MR002` (Task 2). The store refreshes reference data and restarts the walk
    (Task 8).
  - **Residual risks, accepted as rare:**
    - narrowed in Codex round 2 (below): a loss and return that the phone never sees, or that
      both land inside one run, wait for the 6–8-day backstop (Task 4);
    - the backstop can re-download this EA's own last write for a child it no longer delivers.
      No reader shows it, and reassignment re-walks it (Task 6);
    - a year whose id is unchanged but whose dates were edited is not detected by `MR002`. The
      server's dates still decide the rows, and the next reference refresh brings the local
      dates;
    - a refused (terminal) correction that H2 has restored to the accepted value, and that the EA
      then re-sends with Retry or a forced Sync Now after regaining delivery, can apply on the
      server while the phone records only the ordering (`ordering_only`). The phone then shows the
      restored value until a strictly newer pulled tuple arrives. It needs a refusal, a restore, a
      regained grant and a manual re-send in that order (orchestrator call, 2026-10-20: accepted,
      recorded in the build log's Bug and Gap Register when Plan 3 lands).
  - **Orchestrator calls on the reviser's questions (2026-10-20, Jim may override):** delete an
    EA's synced mastery for a child at handover, including its own last write (H3); keep Gate 4's
    hand-back step on devices; use `MR002` for the year mismatch.
- **Codex round 2 (2026-10-20): what changed.** Both findings were accepted by the orchestrator.
  - **Coverage invalidation is atomic with the handover delete.** Round 1 skipped the coverage
    write on a run with no durable write. That was safe for the cursor but not once Task 6
    deleted mastery on its own: a `fresh` run left the handed-away child covered, and its return
    was not a gain. Now:
    - `deleteUndeliveredLetterMastery` drops the undelivered children from the mastery cursor's
      covered sets in the reconcile transaction (Task 6);
    - every durable write of a `dropLostCoverage` walk bounds its coverage to the grants it reads
      in that write's own transaction, so a run in flight cannot re-add a lost child (Task 4).
      The page saves resolve a `pullState` function in their transaction (Tasks 5 and 6);
    - the programme walks need no handover drop: their coverage is class-based, and nothing
      deletes their rows;
    - sessions are unchanged (`dropLostCoverage: false`, their suites untouched).
    - Regressions: Task 4 (an in-flight loss, the failure marker, `removeFromHistoryCoverage`);
      Task 6 (the cursor drop beside the delete, the breaker, supersede and pending end);
      Task 7 (a handover inside the freshness window; a walk in flight across the handover);
      Task 11 (`masteryInputsComplete` false until the re-walk restores the row).
  - **The reference refresh switches the active year in any response order** (new Task 7A, a
    pre-existing bug). The MR002 recovery test now runs the real refresh in both orders
    (Task 8). Task 2's harness switches the year in two statements, because Postgres checks the
    partial unique index row by row too.
  - **The session tracker sheet does not refresh on pulled pages** (Task 9). Plan 2's round 2
    keeps the hook on the panel only.
  - **Residual risks, accepted as rare (Jim's rule: record rare timing races, do not add
    machinery):**
    - the phone never sees a loss: the grant is ended and restored on the server between two
      roster or class pulls, with a hidden change passed in between (Task 4);
    - a loss and a return both reach the phone inside one run's 60 s, so its next write keeps
      the child covered although the handover deleted its mastery (Task 4);
    - a mastery page fetched before a handover and saved after it re-inserts that child's rows.
      No reader shows them, and coverage no longer holds the child (Task 6);
    - an open session tracker sheet shows stale tiles until it is reopened, as Plan 2's A1 (Task 9).
    - Each of the first three is caught by the 6–8-day backstop re-walk. They are recorded in the
      build log's Bug and Gap Register when Plan 3 lands.
