# Plan Review: Item 8 Field-Critical Paths

Reviewed: 2026-06-18  
Plan: `docs/superpowers/plans/2026-06-18-item8-field-critical-paths.md`

## Findings

### High: Task 6 is stale: `timeEntriesRepository.test.js` already exists

The plan repeatedly says Task 6 should create `__tests__/timeEntriesRepository.test.js` (`docs/superpowers/plans/2026-06-18-item8-field-critical-paths.md:55`, `docs/superpowers/plans/2026-06-18-item8-field-critical-paths.md:295`), but the repo already has a tracked file at that path with seven real-SQLite repository tests (`__tests__/timeEntriesRepository.test.js:1`). Those tests already cover active-entry reload, update persistence, user scoping, insert outbox enqueue, update payload coalescing, synced rows not enqueuing, and retry metadata reset (`__tests__/timeEntriesRepository.test.js:21`, `__tests__/timeEntriesRepository.test.js:40`, `__tests__/timeEntriesRepository.test.js:76`, `__tests__/timeEntriesRepository.test.js:93`, `__tests__/timeEntriesRepository.test.js:122`, `__tests__/timeEntriesRepository.test.js:155`, `__tests__/timeEntriesRepository.test.js:171`).

The actual gap is narrower: the file is absent from `jest.integration.config.js` `testMatch` (`jest.integration.config.js:6`). If an agent follows the plan literally, it may overwrite or duplicate stronger existing coverage with the smaller sample test in the plan.

Recommendation: rewrite Task 6 as "add the existing `__tests__/timeEntriesRepository.test.js` to the integration tier, run it, and only add any missing clock-in/clock-out assertions after comparing against the existing tests." The sample test should not replace the existing file.

### High: Task 7 names the wrong wiring precedent for singleton-backed SQLite

Task 7 says to copy `ChildrenContext.test.js` for the production `openDatabaseAsync` / `expoSQLiteMock.__setDatabaseFactory` wiring (`docs/superpowers/plans/2026-06-18-item8-field-critical-paths.md:352`, `docs/superpowers/plans/2026-06-18-item8-field-critical-paths.md:354`). That file does not exercise real SQLite at all: it mocks `storage` (`__tests__/ChildrenContext.test.js:24`) and never calls `__setDatabaseFactory`.

The actual precedent is `clientWriterConnection.test.js`, which mocks `expo-sqlite`, imports `__setDatabaseFactory`, resets `src/db/client`, and returns writer/reader handles from successive opens (`__tests__/clientWriterConnection.test.js:10`, `__tests__/clientWriterConnection.test.js:12`, `__tests__/clientWriterConnection.test.js:39`, `__tests__/clientWriterConnection.test.js:46`). This matters because `useTimeTracking` writes through the singleton `timeEntriesRepository` (`src/hooks/useTimeTracking.js:4`, `src/hooks/useTimeTracking.js:166`), and the singleton resolves through `withTransaction()` / `src/db/client`, not through an injected database (`src/db/repositories/repositoryRuntime.js:17`, `src/db/client.js:114`).

Recommendation: update Task 7 to copy the `clientWriterConnection.test.js` bootstrap/reset pattern, using real better-sqlite handles for writer and reader and `resetDatabaseConnectionForTests()` in setup/teardown. Keep `ChildrenContext.test.js` out of this task's convention list.

### High: Task 1's parser spec is too narrow for existing Supabase migration shapes

Task 1 only specifies `create table ...` and a single `alter table ... add column ... <col>` statement shape (`docs/superpowers/plans/2026-06-18-item8-field-critical-paths.md:77`). Existing migrations already use multi-column `ALTER TABLE` statements against push tables, for example `classes`, `children`, `groups`, `assessments`, `session_attendees`, and `letter_mastery` in `20260521144901_masi_zazi_alignment_schema.sql` (`supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:127`, `supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:149`, `supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:177`, `supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:180`).

Several of those columns are in `SERVER_COLUMNS`, such as `classes.academic_year_id`, `classes.teacher_id`, `classes.archived_at`, and `assessments.assessment_window_id` (`src/services/offlineSync.js:75`, `src/services/offlineSync.js:133`). A parser that only captures the first `ADD COLUMN` or only one-line ALTER statements will either fail the intended green run or silently undercount server columns. The "throw on unknown DDL" rule also needs to distinguish additive column DDL from constraint-only `ALTER TABLE` inside `DO $$` blocks, such as the assessment check constraint (`supabase/migrations/20260618120000_masi_assessments_capture_mode.sql:9`).

Recommendation: require a top-level SQL splitter and support comma-separated `ADD COLUMN` clauses inside one `ALTER TABLE` statement before dispatching Task 1. Add fixture tests for multi-add ALTERs and constraint-only ALTERs so the guard catches real PGRST204 drift without rejecting current migrations.

### Medium: Task 3's LiteracySessionForm test omits a required `useChildren` mock

Task 3 says to mock `useAuth`, `useOffline`, `useClasses`, and `useLookupsContext` only (`docs/superpowers/plans/2026-06-18-item8-field-critical-paths.md:192`). But `LiteracySessionForm` renders `ChildSelector` (`src/screens/sessions/LiteracySessionForm.js:21`, `src/screens/sessions/LiteracySessionForm.js:353`), and `ChildSelector` immediately calls `useChildren()` and `useClasses()` (`src/components/children/ChildSelector.js:12`, `src/components/children/ChildSelector.js:16`).

Without a `ChildrenContext` mock or a mocked `ChildSelector`, the scaffold test can fail before it reaches the intended form assertions.

Recommendation: add a module-level `useChildren` mock returning `{ children: [], groups: [], getChildrenInGroup: jest.fn(() => []) }`, or explicitly mock `ChildSelector` as a dumb test component. Prefer the context mock if the test is meant to characterize the real mounted scaffold.

### Medium: Task 9 invents a sessions policy name that does not exist

The plan correctly describes the sessions rule as direct `user_id = auth.uid()` inside the session SELECT policy (`docs/superpowers/plans/2026-06-18-item8-field-critical-paths.md:431`), but the proposed unit test expects a policy named `sessions_select_user_id` (`docs/superpowers/plans/2026-06-18-item8-field-critical-paths.md:437`). The actual policy name is `sessions_select_own_or_assigned_child_history`, and that policy contains the direct `user_id` branch (`supabase/migrations/20260522103000_masi_session_upsert_visibility.sql:3`, `supabase/migrations/20260522103000_masi_session_upsert_visibility.sql:6`).

Impact: the CI-safe probe test will either encode a fake policy name or force the script to maintain a made-up alias that is disconnected from the migration/contract map.

Recommendation: make `PROBE_RULES` separate `policy` from `assertion`, e.g. `{ table: 'sessions', policy: 'sessions_select_own_or_assigned_child_history', assertion: 'user_id_self_select' }`, and assert the real migration policy name.

## Checks That Look Sound

- The plan's overall gap mapping is right: schema drift, high-traffic render coverage, clock-in vertical, opt-in RLS probe, and force-stop/reopen persistence each map to a field-relevant failure mode.
- The CI-safe/live split for the RLS probe is correct for this repo's Supabase auth constraints.
- Keeping the file-backed SQLite engine opt-in is the right risk boundary; do not repoint the existing integration tier at it in this item.
- The leave-untouched list matches the current unrelated dirty worktree and should stay explicit in each implementation handoff.
