# Sprint 3: Read-Path Efficiency + Local Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or the repo TDD skill) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** implement Sprint 3 of `documentation/codebase-audit-2026-07-12.md` (its findings #3, #15, #10, #18; roadmap items 8 and 10):

- **#18 localDate:** one shared local-day util; fix the two live UTC bugs (time-entry day grouping/today, Home "days worked"). South Africa is UTC+2; the failure window is 00:00-01:59 local.
- **#3 read-path N+1s:** batched hydration, aggregate COUNT queries, SQL-side date cutoffs, bounded history reads. A year-end Home focus currently costs ~365 sequential SQLite queries; the gate is query-count regression tests.
- **#10 attempt-number race:** resolve `attemptNumber` at launch time from a COUNT, never from an optional screen preload.
- **#15 completion-path latency:** fewer statements inside the save transactions, navigate on commit, sync-status refresh non-blocking.

**Branch:** `improvement/s3-read-path` (already checked out in your worktree).

## Verified anchors (2026-07-12 audit, spot-re-verified today; locate by pattern if lines drift)

- `sessionsRepository.getSessions({ userId, programmeId })` at `src/db/repositories/sessionsRepository.js:105` hydrates every session then runs one `session_attendees` query per session (`:72`), no date bound.
- `assessmentsRepository.mapAssessment` runs a per-row `assessment_items` summary query (`src/db/repositories/assessmentsRepository.js:73-80`); `getAssessments` (`:95`) awaits it sequentially per row (`:116`), and a second call site at `:212` does the same.
- `timeEntriesRepository.getTimeEntries({ userId })` at `src/db/repositories/timeEntriesRepository.js:74-86` is unbounded full-history.
- Every repository call resolves the active programme via `getActiveProgrammeAssignment` (`src/db/repositories/domainRepositoryUtils.js:162+`).
- `src/utils/dashboardStats.js:25-29`: `toDateString` short-circuits strings with `slice(0,10)`; correct for local `YYYY-MM-DD` domain dates, WRONG for UTC ISO timestamps; `getDaysWorkedThisMonth` (`:56-68`) feeds it `entry.sign_in_time` (UTC ISO). A correct `toLocalDateString(Date)` helper already exists in this file for Date inputs.
- `src/screens/main/TimeEntriesListScreen.js`: groups by `toISOString().split('T')[0]` (~`:63-70`), computes "today" in UTC (~`:149-155`), renders ALL history as Cards in a ScrollView (~`:185-283`).
- `src/screens/main/HomeScreen.js` `loadStats` (~`:65-82`) hydrates all time entries + sessions + assessments just to compute month/week counts.
- `src/screens/sessions/SessionHistoryScreen.js` (~`:37-51`, `:69-73`) and `src/screens/assessments/AssessmentHistoryScreen.js` (~`:34-45`, `:59-64`) load everything then apply a 30-day cutoff in JavaScript.
- `src/screens/assessments/AssessmentChildSelectScreen.js:31-53`: history preload with no readiness gate; `attemptCount` computed with a filter-inside-a-loop (O(A^2) at `:40-48`); `navigateToAssessment` stamps `attemptNumber: (assessmentMap[child.id]?.attemptCount || 0) + 1` (`:74-85`). `src/screens/assessments/ChildResultsScreen.js:40-57` has the same default-to-zero shape.
- `src/services/literacySessionPersistence.js:44-48` prefetches the ENTIRE user/programme mastery table inside the writer transaction and linear-scans it per (child, letter).
- `src/screens/sessions/LiteracySessionForm.js:332-345` awaits persistence AND `refreshSyncStatus()` before navigating.
- **Sprint 2A interaction (important):** `enqueueDomainOutbox` (`src/db/repositories/domainRepositoryUtils.js:105`) now loads the domain row by id on EVERY call to stamp `owner_user_id`, and accepts an `{ ownerRow }` override (added for hard-deletes). Multi-row saves (61 assessment items, N attendees, mastery loops) therefore pay one extra SELECT per row today. The override is the sanctioned fast path: passing a row with the correct owner columns skips the load while stamping identically.
- Session dates (`session_date`) and assessment dates (`date_assessed`) are stored as LOCAL `YYYY-MM-DD` strings (safe for SQL text comparison); `time_entries.sign_in_time` is a UTC ISO timestamp (NOT safe for SQL day extraction; local-day math on time entries happens in JS via the util).
- Repositories accept database injection for tests (see `__tests__/childrenRepository.test.js`, `__tests__/sessionsRepository*.test.js` conventions and `repositoryRuntime.js`); integration tests run real SQLite via the better-sqlite3 adapter with per-test `:memory:` databases.

## Design decisions (locked; do not relitigate)

1. **`src/utils/localDate.js`** exports `toLocalDateString(value)` (accepts `Date`, UTC ISO timestamp string, or `YYYY-MM-DD` passthrough; timestamps are parsed then localized) and `formatDisplayDate(value, options?)`. `dashboardStats.toLocalDateString` moves there; `dashboardStats.toDateString`'s string branch delegates to it (passthrough for date-only strings, parse-then-localize for timestamps, detected by a `T` in the string).
2. **Aggregate/bounded APIs are additive options on existing repositories**, not new modules: `getSessions`/`getAssessments` gain `{ sinceDate, batchHydrate }` semantics (batched child-table hydration via one `WHERE ... IN (...)` query, SQL `>= ?` date cutoff); new `getSessionCountsSince({ userId, programmeId, sinceDate })`-style COUNT methods for Home; `getTimeEntries` gains `{ sinceIso, limit }`. Existing call shapes keep working unchanged.
3. **Query-count regression tests are the gate for #3 and #15.** Wrap the injected test database in a counting proxy (count `getAllAsync` + `getFirstAsync` + `runAsync` calls); assert budgets, e.g.: `getSessions` with 30 sessions = at most 4 queries (was 32); Home-stats repository calls = at most 6 queries total regardless of history size; a 61-item assessment save = at most `items + constant` statements with ZERO per-item domain-row SELECTs (the `ownerRow` fast path) and zero full-table mastery SELECTs during `persistLiteracySession`.
4. **Attempt number is resolved at launch**: new `assessmentsRepository.countAssessments({ userId, childId, assessmentType })`; `navigateToAssessment` (and ChildResultsScreen's launch action) awaits it and stamps `count + 1`. The screen preload remains display-only. The O(A^2) attemptCount computation becomes a one-pass Map build.
5. **Completion path:** keep every existing transaction boundary EXACTLY. Inside them: pass the already-loaded parent/domain row as `ownerRow` to every `enqueueDomainOutbox` call in multi-row loops (assessment items, session attendees, mastery writes) so owner stamping is identical but the per-row SELECT disappears (pin identical stamping with a test); replace the mastery full-table prefetch with targeted per-(child,letter) or `WHERE child_id IN (...)` lookups; in `LiteracySessionForm`, navigate immediately after the transaction resolves and fire `refreshSyncStatus()` without awaiting it (catch errors).
6. **TimeEntriesListScreen** becomes a `SectionList` over a bounded query (last 60 days via `sinceIso`), grouped by `toLocalDateString(sign_in_time)`; "today" uses the util.
7. **No sync-contract changes**: no payload, RLS, outbox-ordering, schema, or migration change. `documentation/rls-sync-contract-map.md` is untouched EXCEPT if the reviewer finds the ownerRow fast-path worth a one-line note under the v6 owner description (allowed).
8. **Out of scope:** the 7 screen-local display `formatDate` helpers may be pointed at `formatDisplayDate` ONLY where the change is a drop-in (identical output); skip any that would change visible formatting. List/virtualization work beyond TimeEntriesListScreen (audit #8 session-form roster) is NOT this sprint. Pull-side, contexts, facade: untouched.

## Codex plan review dispositions (2026-07-12, R1-R12) — BINDING

Adversarial review (gpt-5.6-sol) against the merged tree; all findings accepted. **Where a disposition conflicts with task or design text, the disposition wins.**

- **R1 (timezone determinism):** the repo pins no TZ, so localization tests can pass vacuously on non-SAST machines. Amendment: set `process.env.TZ = 'Africa/Johannesburg'` at the VERY TOP of `jest.setup.js` AND the integration setup (before any imports), making the whole suite SAST-deterministic everywhere including CI. New date tests use hardcoded SAST expectations and `jest.setSystemTime` for "today/this month"; never derive expectations with the same local-Date behavior under test. If pinning TZ breaks any existing test, fix that test to be TZ-agnostic (report each).
- **R2 (counting adapter):** a naive proxy misses queries inside transactions (the adapter's `withExclusiveTransactionAsync` hands the task the base adapter, `test-support/betterSqliteAdapter.js:51`) and counts migration probes (`PRAGMA user_version` per injected read). Amendment: build a dedicated counting adapter in `test-support/` whose transaction method invokes the task with the counting adapter itself; migrate and seed FIRST, reset counters, capture SQL text alongside totals, and exclude/classify migration-control SQL. Budgets assert both totals AND absence of the eliminated query pattern by SQL text.
- **R3 (ownerRow semantics):** `ownerRow` is the record's OWN-table row (`outboxOwnership.js:3`), never the parent; passing the parent still triggers the per-item parent SELECT via `viaParentOwner` payload fallback. Amendment: extend `enqueueDomainOutbox` options to `{ ownerRow, ownerUserId }` where a provided `ownerUserId` skips resolution entirely; multi-row saves resolve the parent owner ONCE per save and pass `ownerUserId` for `assessment_items`/`session_attendees`; `letter_mastery`/parents pass their own-table `ownerRow`. Pin stamped-owner equality against the row-load path for all three shapes.
- **R4 (honest write budget; DECIDED):** no bulk-write this sprint. The Task 5 budget is: `2 x itemRows + constant` write statements (domain upsert + outbox upsert per row, unchanged), ZERO per-row domain/parent SELECTs, zero full-table mastery SELECTs. Bulk multi-VALUES insertion is explicitly out of scope (noted as a future optimization); do not attempt it.
- **R5 (history-screen scoping — correctness):** `getSessions`/`getAssessments` are programme-scoped, NOT user-scoped (`sessionsRepository.js:105`); the screens' JS filtering is what enforces the signed-in-EA scope and newest-first order. Amendment: add `recordedByUserId` and `order: 'desc'` options to these reads; history screens pass both plus `sinceDate`; add a two-EA-same-programme fixture proving no cross-EA leakage. Calendar boundary: the local `YYYY-MM-DD` cutoff replaces the rolling 720-hour cutoff (whole-day inclusive); pin this deliberately in a test.
- **R6 (Home aggregate contracts; DECIDED):** time entries = fetch completed entries since the UTC instant of local month start, distinct local days in JS; sessions = `session_date, COUNT(*)` grouped since month start (serves monthly total AND weekday counts); assessment coverage = distinct assessed child IDs (since window) intersected in JS with the active `childrenList`. Preserve today's programme-scoped (not EA-scoped) counting semantics deliberately.
- **R7 (SessionsScreen + goal):** include `SessionsScreen` and `sessionsTodayGoal` in Task 3: a targeted today-count (user + local today) for the goal service, and the tab's stats reuse ONE bounded session load instead of two full hydrations (`SessionsScreen.js:48,:52`, `sessionsTodayGoal.js:20-35`).
- **R8 (batching is the default):** batched hydration becomes the DEFAULT behavior of `getSessions`/`getAssessments` (all consumers benefit; no `batchHydrate` flag), preserving exact output: `__summary__` merge semantics (summary overrides mapped columns; `date_assessed` falls back to `assessment_date`), attendee ordering `created_at, id` (it determines `children_ids`/`group_ids` order), ascending default order (existing repo tests pin it), and the `getUnsyncedRecords` mapping path (`assessmentsRepository.js:207`).
- **R9 (honest measurements):** the O(A^2) fix is JavaScript, not SQL; extract a pure one-pass assessment-map builder (latest row + counts per child) into a util and unit-test its output; do not claim db counters prove JS complexity. `countAssessments` budget = 2 domain queries (programme lookup + COUNT) or one combined statement; SQL must preserve `coalesce(assessment_type, 'letter_egra')` compatibility. Update `assessmentEntryRouting.test.js:84` and ChildResults mocks to provide `countAssessments`.
- **R10 (mastery semantics; DECIDED):** keep `findMasteryRecord` and the in-memory cache-mutation semantics EXACTLY (reactivation of deleted rows by id, active/deleted distinction, same-transaction visibility); change only the prefetch to a batched `WHERE child_id IN (<changed child ids>)` query. Tests pin: reactivation of a synced deleted row, active-to-deleted transition, programme isolation, outbox operation/payload shape, multiple changes in one transaction.
- **R11 (SectionList contract):** preserve `testID="time-entries-scroll"` and the explicit `refreshControl` prop (SectionList accepts it; the sync-voice suite invokes `props.refreshControl.props.onRefresh`, `TimeEntriesListScreen.syncVoice.test.js:38`). Keep both existing TimeEntries suites green; add assertions for bounded repository arguments, the 60-day footer, newest-first SQL ordering BEFORE limit, and refresh-reloads-bounded-query-after-sync.
- **R12 (form assertions are new, not updates):** no existing test pins the await order. Add six focused assertions: no navigation before persistence resolves; navigation while a deferred `refreshSyncStatus` is unresolved; refresh called exactly once; rejected refresh caught (no unhandled rejection, navigation stands); `triggerBackgroundSync` still fires once; `allowLeaveRef` still suppresses the dirty-form guard on the completion replace.
- Review-confirmed: `AssessmentResultsScreen`'s "Try Again" attempt increment is NOT the finding-#10 race (based on the just-committed assessment); leave it alone. `mapAssessment` has no side effects. No consumer depends on this screen's full history (export uses the SQLite debug dump).

## Global Constraints

- Node 20: prefix jest/npm commands with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`; run full-suite gates with `--maxWorkers=4`.
- Strict red-green per step; commit per task; NEVER push; no PR.
- Commit messages `type(scope): message`; no co-author line; no em dashes anywhere.
- Screen behavior (what the user sees) must not change except: faster loads, correct local-day grouping/attribution, and TimeEntriesListScreen showing the bounded window (add a quiet footer note like "Showing last 60 days" so the boundary is honest).
- New BetterSQLite tests use per-test `:memory:` databases; no fixed shared filenames.
- If a step cannot be executed as written, apply the smallest faithful adaptation, record it, continue; flag behavior-affecting conflicts instead of guessing.

---

### Task 1: `utils/localDate.js` + the two live UTC bugs (#18)

- [x] RED (util): new `__tests__/localDate.test.js` with SAST-boundary cases: a UTC ISO timestamp `2026-07-11T22:30:00.000Z` in a UTC+2 environment localizes to `2026-07-12`; a `YYYY-MM-DD` string passes through; a `Date` localizes; month boundary: `2026-06-30T23:10:00.000Z` (UTC+2) → `2026-07-01`. Use `jest` fake timezone via `TZ` env in the test file's config comment if needed; the repo's jest runs in the machine TZ, so compute expectations from `new Date(...)` locally rather than hardcoding, OR set `process.env.TZ = 'Africa/Johannesburg'` before importing (document which; the reviewer will check this is deterministic).
- [x] RED (bugs): `dashboardStats.getDaysWorkedThisMonth` with a `sign_in_time` at 00:30 SAST on the 1st of the month (23:30 UTC previous month) counts it in the CURRENT month; TimeEntriesListScreen grouping/today tests with an entry at 00:30 SAST group it under the local day (extend the existing screen suite; follow its render conventions).
- [x] GREEN: create the util; move/reuse `dashboardStats`'s Date-branch logic; fix `toDateString`'s timestamp branch; fix the screen's grouping and "today". Keep `session_date`/`date_assessed` handling byte-identical (already local).
- [x] Commit: `fix(dates): shared localDate util; local-day grouping and days-worked at SAST boundaries`

### Task 2: Repository aggregates, batched hydration, bounded reads (#3 repo layer)

- [x] RED: query-count tests using a counting-proxy database: `getSessions` with 30 sessions performs ≤ 4 queries and returns identical data to today (golden compare against the unbatched result); `getAssessments` same shape; `{ sinceDate }` excludes older rows in SQL (assert both result correctness and that no post-query JS filtering is needed); `getTimeEntries({ sinceIso, limit })` bounds; new COUNT methods return correct values with exactly 1 query each.
- [x] GREEN: batched `WHERE session_id IN (...)`/`assessment_id IN (...)` hydration maps built in one pass; SQL cutoffs; COUNT methods (`getSessionCountsSince`, `getAssessmentCountsSince`, or one `getDashboardCounts` per repo, implementer's choice, named consistently); all additive, existing signatures unchanged (verify by leaving existing repository suites untouched and green).
- [x] Commit: `perf(repos): batched hydration, SQL date cutoffs, and aggregate counts`

### Task 3: Screen consumers (#3 screens)

- [x] RED: HomeScreen stats test asserting the repository aggregate methods are called (not full hydration) and rendered counts match; history screens pass `sinceDate` (30 days via `toLocalDateString`) and no longer slice in JS; AssessmentChildSelectScreen builds its map in one pass (assert correctness on a fixture where O(A^2) vs one-pass would differ in call counts via the proxy); TimeEntriesListScreen renders a SectionList with day sections from a bounded query and shows the last-60-days footer.
- [x] GREEN: convert consumers. HomeScreen "days worked" uses the bounded month query + JS local-day count (NOT SQL day extraction on UTC timestamps).
- [x] Commit: `perf(screens): aggregate-backed Home stats, bounded histories, SectionList time entries`

### Task 4: Attempt number at launch (#10)

- [x] RED: with 3 existing letter_egra assessments for a child and the screen's preload STILL PENDING (unresolved mock), launching stamps `attemptNumber: 4` (assert on the navigate call params). Repository RED: `countAssessments({ userId, childId, assessmentType })` counts type-filtered rows with 1 query.
- [x] GREEN: implement the count; `navigateToAssessment` and ChildResultsScreen's launch action await it. Preload stays display-only.
- [x] Commit: `fix(assessments): attempt number resolved at launch, immune to preload races`

### Task 5: Completion-path statement budget (#15)

- [x] RED (query-count, integration): a 61-item assessment save performs zero per-item domain-row SELECTs (ownerRow fast path) while every outbox row still stamps the SAME `owner_user_id` as before (golden compare on stamped owners); `persistLiteracySession` performs zero full-table mastery SELECTs (targeted lookups only) with identical resulting mastery rows; session save with 10 attendees same shape.
- [x] RED (form): after a successful save, `navigation` fires before `refreshSyncStatus` resolves (mock refresh as slow; assert navigation happened; assert refresh was still called).
- [x] GREEN: pass `ownerRow` in the multi-row loops (assessment items use the parent assessment row? NO: items' owner resolves via the parent assessment's `user_id`; pass the parent row through the existing resolver path correctly; verify against `outboxOwnership.js` semantics and pin equality); targeted mastery lookups; non-blocking refresh with `.catch`.
- [x] Commit: `perf(capture): lean save transactions and navigate-on-commit`

### Task 6: Wrap

- [x] Full gates: `npx jest --silent --maxWorkers=4` and `npm run test:integration`, exact counts reported.
- [x] One row in `documentation/sqlite-refactor-log.md`; tick plan checkboxes; PRD progress entry. Contract map only if the ownerRow note was added.
- [x] Commit: `docs(s3): read-path wrap - checklists, log row`

**Device gate (Jim, after merge):** open Home/Assessments/Sessions with real history and feel the difference; clock in at ~00:30 and confirm the entry lands on the right day (or simulate by device clock); time-entries screen scrolls smoothly and shows the 60-day footer; complete a full 60-letter assessment and confirm the completion screen appears immediately.
