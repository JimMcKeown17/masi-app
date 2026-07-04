# Item 8 — Test the Field-Critical Paths — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Orchestration model (from the Item 8 handoff — unchanged from Item 4):** Codex builds each task TDD via the `codex:codex-rescue` subagent; the controller (Claude) independently re-runs every focused suite + scope-checks every diff; risky tasks (the SQL-parsing guard, the provider-backed real-SQLite wiring, the engine port) get a Codex adversarial pass (two-LLM cross-review); **the controller commits** (Codex's sandbox blocks `.git`). Right-size reviews by risk: pure/characterization tasks → controller review only. Every review finding is a **claim to verify**, not an order.
>
> **Jest commands (better-sqlite3 needs Node 20):**
> - Unit/RTL focused: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest <file> --testPathIgnorePatterns "/.claude/worktrees/"`
> - Integration focused: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest --runInBand --config jest.integration.config.js <file>`
> - Finish gate (full): `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test && npm run test:integration`
>
> **Testing-item red/green semantics (READ FIRST):** Most tasks here *characterize or guard existing code*, so a correctly-written test goes **green on first run**. A red is therefore a signal, not a step to skip: either a test-wiring bug, OR a **real defect** — in which case STOP and use `superpowers:systematic-debugging` (find root cause; do not "fix" the test to hide it). The two **guard** tests (Task 1, and the `SERVER_COLUMNS` slice of it) must additionally be **proven to bite** via a temporary mutation that turns them red, then reverted.

**Goal:** Close the five field-critical test gaps named in `documentation/top-10-improvements-2026-06.md` §8 — the schema-drift (`PGRST204`) guard, render coverage on the four highest-traffic untested screens, the clock-in vertical, an opt-in RLS upsert-visibility probe, and a device-faithful (force-stop/reopen) SQLite test engine — turning field-only failures into CI failures *before* the Item 5–7 screen refactors land.

**Architecture:** Pure additive testing. New `__tests__/*.test.js` suites copy the established conventions (RTL `SessionCompleteScreen.test.js`; migration-parse `sessionsForwardPrepSupabaseMigration.test.js`; real-SQLite repo `assessmentsRepository.test.js`; staging-guard `sqliteStagingScript.test.js`). Two new `test-support/` artifacts (the ported real engine) and one opt-in probe script. No production `src/` behavior changes unless a test surfaces a genuine bug (then `systematic-debugging`, separately scoped).

**Tech stack:** Jest + `jest-expo`, `@testing-library/react-native` (RTL), real `better-sqlite3` via `test-support/betterSqliteAdapter.js` + `test-support/sqliteRepositoryTestUtils.js`, Supabase staging (`masi-app-sqlite`, ref `segygjzpujphwvrubusm`) for the opt-in probe.

---

## Pre-flight (controller — DONE)

- [x] **Item 4 merged to `main` (local FF) and Item 8 branched.** `main` fast-forwarded `65118aa → fcec7e2`; branch `test/field-critical-paths` created off it. Full suite re-verified green first: **107/107 unit suites · 606 tests**, **20/20 integration suites · 134 tests** (Node 20). Local-only, not pushed (Jim's schedule).
- [ ] **Leave untouched / never stage** (pre-existing unrelated WIP per the handoff): `skills-lock.json`, `src/screens/assessments/AssessmentResultsScreen.js`, `__tests__/AssessmentResultsScreen.test.js`, `.claude/skills/*`, `.agents/skills/*`, `documentation/top-10-improvements-2026-06.md`, `documentation/zazi-izandi-feature-port-prd-2026-go-live.md`. Stage **only** each task's own files.

## Coverage baseline (verified against the merged tree @ `fcec7e2`, 2026-06-18)

What §8 named, vs. what discovery actually found (corrections to the first coverage sweep in **bold**):

- **Gap 1 (schema-drift):** `__tests__/syncContractCompleteness.test.js` (integration tier) **already pins `SERVER_COLUMNS`/`PUSH_ORDER` against the LOCAL migrated SQLite schema** (via `runMigrations` + `PRAGMA table_info`), classifying every local column as synced / intentionally-unsynced / local-only and asserting `PUSH_ORDER` ⊇ every locally-written synced table. **Missing = the SERVER mirror:** nothing parses `supabase/migrations/*.sql` to confirm each `SERVER_COLUMNS[table]` column actually exists server-side. That is the exact `PGRST204` direction (client pushes a column Supabase lacks). Task 1 adds it.
- **Gap 2 (render):** `HomeScreen` (599), `LiteracySessionForm` (689), `TimeTrackingScreen` (263), `ClassDetailScreen` (383) have **zero** render tests. (**`SyncStatusScreen` already has `__tests__/syncStatusScreen.test.js` — so it is NOT a target**; §8's list was stale here.) Tasks 2–5.
- **Gap 3 (clock-in):** `timeEntriesRepository` is **confirmed absent** from `jest.integration.config.js` `testMatch` (the first sweep's "present via syncOutboxRepository" was an over-read). `time_entries` is first in `PUSH_ORDER`; clock-in gates session capture. Tasks 6–7.
- **Gap 4 (RLS probe):** Staging guard infra exists (`scripts/sqlite-staging.cjs` `validateSqliteEnv` + `__tests__/sqliteStagingScript.test.js`), but **no probe exercises the four documented upsert-visibility rules** against the live backend. Task 9.
- **Gap 5 (engine):** Masi has `test-support/betterSqliteAdapter.js` (`:memory:`, JS-serialized exclusive txns) + `test-support/expoSQLiteMock.js` (factory, **no persistence**). The fork's device-faithful engine exists at `/Users/jimmckeown/Development/zazi-izandi-app/test-support/expoSQLiteRealEngine.js` (per-name file registry, close/reopen survival, sidecar-aware delete). Task 8.

## Decisions locked

1. **Gap 1 is the SERVER mirror, not a from-scratch suite.** Parse the Supabase migration SQL; assert `SERVER_COLUMNS[table] ⊆ server columns` (the `PGRST204` guard) and flag server columns missing from `SERVER_COLUMNS` unless intentionally excluded. The existing local-mirror test stays as-is.
2. **Gap 5 ADDS an opt-in engine; it does NOT replace `expoSQLiteMock.js`.** Rewiring the existing 20 integration suites onto a new engine is out of scope (regression risk). Only the new force-stop/reopen suite uses it.
3. **Gap 4 splits CI-safe from live.** The CI-runnable deliverable is the probe's **guard + policy-targeting unit test** (no network). The **live probe** is an opt-in script Jim runs in an interactive terminal (the management access-token 401s in non-interactive/agent shells — documented in AGENTS.md). Don't gate CI on the network probe.
4. **No production `src/` edits in this item** unless a characterization test surfaces a real bug. If it does: STOP, `systematic-debugging`, and raise it as a separate disclosed finding (don't bury a fix inside a "test" commit).

## Post-review revisions (2026-06-18, two-LLM) — THESE OVERRIDE the task bodies below where they conflict

Reviewers: Claude `plan-reviewer` (**SHIP-WITH-FIXES**) + Codex adversarial (**NEEDS-REWORK**) → reconciled **SHIP-WITH-FIXES** (architecture endorsed by both; 7 fixable defects). All seven verified against live code (the three HIGH ones re-verified by the controller). Review file: `docs/plan-reviews/2026-06-18-item8-field-critical-paths-plan-review.md`; the Codex adversarial findings are captured in the build-log Item 8 kickoff entry. Each Codex dispatch must apply the relevant revision.

**R1 (Task 1 — parser handles multi-column ALTER + DO-blocks; HIGH, both — the load-bearing false-green).** Real migrations add several `SERVER_COLUMNS` columns via ONE comma-separated `ALTER TABLE` (verified `supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:127-181`: `classes` +5 incl. `academic_year_id`/`teacher_id`/`archived_at`, `children` +3, `groups` +5, `assessments` +4 incl. `assessment_window_id`, `session_attendees` +1, `letter_mastery` +1). A first-`ADD COLUMN`-only parser silently undercounts → green while whole column families go unchecked = the exact PGRST204 the test exists to catch. The parser MUST:
- Split into top-level statements, treating `do $$ … $$` blocks as **opaque** (do NOT parse their inner `alter table … add constraint`).
- For each `alter table [only] [public.]<t>`, capture EVERY `add column [if not exists] <col>` clause in the comma-separated list (not just the first).
- Treat `add constraint …`, `do $$` blocks, `create index`, and `alter … alter column` as non-column DDL (skip; do NOT throw).
- Throw (with file + statement) ONLY on an `alter table … add column` whose column name can't be extracted.
- Fixture tests: (a) multi-add ALTER → all columns captured; (b) `do $$ … add constraint …$$` → zero columns, no throw; (c) malformed `add column` → throws.

**R2 (Task 6 — WIRE the existing test, do NOT create; HIGH, plan-reviewer).** `__tests__/timeEntriesRepository.test.js` ALREADY EXISTS with 7 real-SQLite tests (active-entry reload, update persistence + sync metadata, user scoping, insert-outbox enqueue, update-payload coalescing, synced-rows-skip-enqueue, retry-metadata reset). The ONLY gap: it's absent from `jest.integration.config.js` `testMatch`. Task 6 becomes — (1) add `'<rootDir>/__tests__/timeEntriesRepository.test.js',` to the integration `testMatch`; (2) run it under the integration config; (3) add ONLY genuinely-missing clock-in/out assertions after diffing against the existing file. **Never overwrite or shrink it.** It uses `createBetterSqliteTestDatabase()` directly (not `createMigratedDatabase`) — leave that.

**R3 (Task 8 — the ported engine must honor `useNewConnection`; HIGH, Codex).** Production opens a writer then a reader for the SAME db name (`src/db/client.js:56-62`) and applies `PRAGMA query_only = ON` to the reader (`client.js:13-16`). The fork engine reuses ONE handle per name (`zazi …RealEngine.js:117-127`), so `query_only` would poison the writer (`betterSqliteAdapter.js:23-30` skips it for exactly this reason). Fix the port: `openDatabaseAsync(name, options)` MUST return a **distinct `better-sqlite3` handle to the same on-disk file when `options?.useNewConnection` is true** (WAL permits a real second connection), so `query_only` lands only on the reader. Guard test: open writer + reader for one name, apply `query_only=ON` to the reader, assert a write through the writer still succeeds. The force-stop/reopen test opens a single handle (no `useNewConnection`) and is unaffected. Keep the engine OPT-IN (do not repoint the existing 20 suites).

**R4 (Task 7 — correct precedent is `clientWriterConnection.test.js` with a shared REAL db; HIGH/MED, both).** `ChildrenContext.test.js` mocks `storage` and never binds SQLite — wrong precedent. The singleton `timeEntriesRepository` resolves reads via `resolveDatabase(undefined) → getDatabase()` and writes via `runRepositoryTransaction(undefined) → withTransaction()` (`repositoryRuntime.js:5-23` → `src/db/client`). Bind it like `clientWriterConnection.test.js:10-48`, but feed a REAL shared db so migrations actually run:
```javascript
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
import { __reset, __setDatabaseFactory } from 'expo-sqlite';
import { resetDatabaseConnectionForTests } from '../src/db/client';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
let testDb;
beforeEach(async () => {
  await resetDatabaseConnectionForTests();
  __reset();
  testDb = createBetterSqliteTestDatabase();   // ONE real db; client.js runMigrations() runs on first (writer) open
  __setDatabaseFactory(async () => testDb);    // writer + reader opens both return it; reader's query_only is SKIPPED by the adapter (no poison)
});
afterEach(async () => { await resetDatabaseConnectionForTests(); await testDb.closeAsync(); });
```
Mock only `useAuth`/`useOffline`/`locationService.getCurrentPosition`; `renderHook(useTimeTracking)` + `act(() => handleSignIn())`; assert `testDb` has the `time_entries` row + a `time_entries` `insert` outbox. **HARD RULE retained:** if `resetDatabaseConnectionForTests`/`__setDatabaseFactory` aren't exported as assumed, STOP and report.

**R5 (Task 3 — add the `useChildren` mock; MED, both).** `LiteracySessionForm` mounts `ChildSelector` (`LiteracySessionForm.js:21,353`) which calls `useChildren()` (`ChildSelector.js:12`); `useChildren` THROWS outside `ChildrenProvider` (`ChildrenContext.js:461-465`) → the test crashes before asserting. Add `jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => ({ children: [], groups: [], getChildrenInGroup: () => [] }) }))` — confirm the exact fields `ChildSelector` reads against source.

**R6 (Task 9 — real policy name; MED, plan-reviewer).** No `sessions_select_user_id` exists. The real policy is `sessions_select_own_or_assigned_child_history` (`20260522103000_masi_session_upsert_visibility.sql:3-8`), which holds the direct `user_id = auth.uid()` branch. Make `PROBE_RULES` entries `{ table, policy, assertion }` and assert the real name: `{ table: 'sessions', policy: 'sessions_select_own_or_assigned_child_history', assertion: 'user_id_self_select' }`.

**R7 (Task 5 — `childrenGroups` is an array; LOW, Codex).** `ClassDetailScreen` calls `.find()` on `childrenGroups` (`ClassDetailScreen.js:57-61`) — mock it as `[]` not `{}`. The two specced assertions tolerate the wrong shape, but any child-row assertion would break.

**Endorsed by both reviewers (no change):** the five-gap mapping; the CI-safe/live RLS split; keeping the engine opt-in; the leave-untouched list.

---

## Port source (gap 5)

| Fork file (`/Users/jimmckeown/Development/zazi-izandi-app`, read 2026-06-18) | Masi destination | Port style |
|---|---|---|
| `test-support/expoSQLiteRealEngine.js` (165 lines) | `test-support/expoSQLiteRealEngine.js` | **adapt** — temp dir `zz-tests` → `masi-tests`; reconcile API surface with Masi's `betterSqliteAdapter` (see Task 8 HARD RULES) |

## File structure (created / modified across all tasks)

**Create:**
- `__tests__/syncContractServerSchema.test.js` (Task 1)
- `__tests__/HomeScreen.test.js`, `__tests__/LiteracySessionForm.test.js`, `__tests__/TimeTrackingScreen.test.js`, `__tests__/ClassDetailScreen.test.js` (Tasks 2–5)
- `__tests__/timeEntriesRepository.test.js` (Task 6)
- `__tests__/useTimeTracking.integration.test.js` (Task 7)
- `test-support/expoSQLiteRealEngine.js`, `__tests__/forceStopReopenOutbox.test.js` (Task 8)
- `scripts/rls-visibility-probe.cjs`, `__tests__/rlsVisibilityProbe.test.js` (Task 9)

**Modify:**
- `jest.integration.config.js` — add `timeEntriesRepository.test.js`, `useTimeTracking.integration.test.js`, `forceStopReopenOutbox.test.js` to `testMatch` (Tasks 6–8)
- `package.json` — add `rls:probe` opt-in script (Task 9)
- `documentation/rls-sync-contract-map.md` — note the new server-schema guard + the RLS probe under the relevant tables' "Tests and probes" column (Tasks 1, 9)
- `documentation/build-log.md` — Item 8 entries (append; controller, per task)

---

## Task 1 — Gap 1: server-schema contract guard (`PGRST204` guard)

**Risk:** MED-HIGH (regex SQL parsing; a missed column = false-green = the exact failure the test exists to prevent). → Codex adversarial pass.

**Files:**
- Create: `__tests__/syncContractServerSchema.test.js`
- Reads: `src/services/offlineSync.js` (`SERVER_COLUMNS`, `INTENTIONALLY_UNSYNCED`, exported via `__contract`), `supabase/migrations/*.sql` (17 files)
- Convention to copy: `__tests__/sessionsForwardPrepSupabaseMigration.test.js:6-19` (`readMigrations` + regex)

- [ ] **Step 1: Write the failing test.** Build a per-table server-column map by parsing, in filename-sorted order, every `supabase/migrations/*.sql`:
  - `create table [if not exists] [public.]<t> ( ... )` → extract column names from the paren body (first token of each top-level comma-separated line that isn't a constraint keyword: `primary|foreign|unique|check|constraint`).
  - `alter table [only] [public.]<t> add column [if not exists] <col> ...` → add `<col>`.
  Then assert the **load-bearing** direction:

```javascript
const { SERVER_COLUMNS, INTENTIONALLY_UNSYNCED } = require('../src/services/offlineSync').__contract;
const serverCols = buildServerColumnMap(); // table -> Set(columns) from migration SQL

describe('SERVER_COLUMNS is backed by the Supabase server schema (PGRST204 guard)', () => {
  for (const [table, cols] of Object.entries(SERVER_COLUMNS)) {
    test(`${table}: every pushed column exists server-side`, () => {
      const missing = cols.filter((c) => !(serverCols[table] && serverCols[table].has(c)));
      expect({ table, missing }).toEqual({ table, missing: [] });
    });
  }
  // capture_mode is the freshest at-risk column — prove the parser actually saw the ALTER.
  test('assessments.capture_mode is present in the parsed server schema', () => {
    expect(serverCols.assessments.has('capture_mode')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect GREEN** (the contract should currently be intact). Run: `… npx jest __tests__/syncContractServerSchema.test.js`. If RED: a `SERVER_COLUMNS` column has **no** backing migration → a real latent `PGRST204` → STOP, `systematic-debugging`, surface it (do not delete the assertion).
- [ ] **Step 3: PROVE THE GUARD BITES (mutation check).** Temporarily append a bogus column to `SERVER_COLUMNS.time_entries` (e.g. `'definitely_not_a_column'`) in `src/services/offlineSync.js`; re-run; confirm the `time_entries` test goes RED with `missing: ['definitely_not_a_column']`. **Revert the mutation.** (Do not commit the mutation.)
- [ ] **Step 4: HARD RULE for the parser.** If a migration adds a column to a `PUSH_ORDER` table via a statement shape the extractor doesn't recognize (anything other than the two forms above — e.g. a generated column, a `DO $$` block, a table rename), the parser must **throw with the offending file + statement**, NOT silently skip it. A silent skip undercounts server columns and could mask a real drift in the *other* direction. Add a test asserting the parser throws on an unrecognized DDL shape (feed it a fixture string).
- [ ] **Step 5: Run focused green, then commit.** Run: `… npx jest __tests__/syncContractServerSchema.test.js`. Expected: PASS. Then:
```bash
git add __tests__/syncContractServerSchema.test.js documentation/rls-sync-contract-map.md
git commit -m "test(sync): guard SERVER_COLUMNS against the Supabase server schema (PGRST204 guard, Item 8)"
```

---

## Task 2 — Gap 2a: HomeScreen render characterization (highest-traffic; §8 priority)

**Risk:** MED (most complex screen — `useFocusEffect` + 5 contexts + 3 repos). → Codex adversarial pass (the others are controller-review).

**Files:**
- Create: `__tests__/HomeScreen.test.js`
- Target: `src/screens/main/HomeScreen.js` (default export; prop `navigation`)
- Convention to copy: `__tests__/SessionCompleteScreen.test.js` (PaperProvider wrap; module-level `jest.mock` of each context; `waitFor`)

- [ ] **Step 1: Write the characterization test.** Mock — at module level, BEFORE importing the screen — `@expo/vector-icons` (virtual), the five context hooks, the session-launch-guard hook, and the three repositories so the focus effect never touches SQLite:

```javascript
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
// Run useFocusEffect's effect once on mount (RN-navigation shim):
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (cb) => React.useEffect(() => cb(), []),
}));

const mockUseAuth = jest.fn(); jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
const mockUseOffline = jest.fn(); jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));
const mockUseChildren = jest.fn(); jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockUseChildren() }));
const mockUseTimeTracking = jest.fn(); jest.mock('../src/hooks/useTimeTracking', () => ({ useTimeTracking: () => mockUseTimeTracking() }));
const mockUseGuard = jest.fn(); jest.mock('../src/hooks/useSessionLaunchGuard', () => ({ useSessionLaunchGuard: () => mockUseGuard() }));
jest.mock('../src/db/repositories/timeEntriesRepository', () => ({ timeEntriesRepository: { getTimeEntries: jest.fn().mockResolvedValue([]) } }));
jest.mock('../src/db/repositories/sessionsRepository', () => ({ sessionsRepository: { getSessions: jest.fn().mockResolvedValue([]) } }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({ assessmentsRepository: { getAssessments: jest.fn().mockResolvedValue([]) } }));

import HomeScreen from '../src/screens/main/HomeScreen';

const renderHome = () => render(<PaperProvider><HomeScreen navigation={{ navigate: jest.fn() }} /></PaperProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: 'ea-1' }, profile: { first_name: 'Thandi' } });
  mockUseOffline.mockReturnValue({ isOnline: true, unsyncedCount: 0, syncStatus: {} });
  mockUseChildren.mockReturnValue({ children: [] });
  mockUseTimeTracking.mockReturnValue({ isSignedIn: false, loadingLocation: false, elapsedTime: 0,
    snackbarVisible: false, setSnackbarVisible: jest.fn(), handleSignIn: jest.fn(), handleSignOut: jest.fn(),
    formatElapsedTime: () => '0h 0m 0s', formatTime: () => '8:00 AM' });
  mockUseGuard.mockReturnValue({ warningVisible: false, requestSessionLaunch: jest.fn(), continueAnyway: jest.fn(), clockInNow: jest.fn(), dismissWarning: jest.fn() });
});

test('renders the EA greeting and the core stat + action surfaces', async () => {
  const s = renderHome();
  await waitFor(() => expect(s.getByText('Welcome, Thandi!')).toBeTruthy());
  expect(s.getByText(/days worked/i)).toBeTruthy();
  expect(s.getByText('Record Session')).toBeTruthy();
});

test('signed-out shows Clock In; signed-in shows the clocked-in state', async () => {
  mockUseTimeTracking.mockReturnValue({ ...mockUseTimeTracking(), isSignedIn: false });
  const s = renderHome();
  await waitFor(() => expect(s.getByText('Clock In')).toBeTruthy());
});
```

- [ ] **Step 2: HARD RULE — confirm exact import paths + the greeting string before asserting.** Open `src/screens/main/HomeScreen.js` and confirm: each context's import path (mock the path the screen actually imports — a wrong path silently runs the real provider), the exact greeting literal (`Welcome, {profile?.first_name || 'User'}!`), and that `loadStats` runs the 3 mocked repos inside `useFocusEffect`. If any import path or the greeting differs from the assumptions above, ADJUST the mock/assert to match the source — do not change the source.
- [ ] **Step 3: Run — expect GREEN.** Run: `… npx jest __tests__/HomeScreen.test.js --testPathIgnorePatterns "/.claude/worktrees/"`. A red here is a wiring bug (likely a mock path) — fix the test. If the screen genuinely throws on a documented prop shape, that's a finding → `systematic-debugging`.
- [ ] **Step 4: Add the second characterized branch** (signed-in): set `isSignedIn: true`, `activeEntry: { sign_in_time: '2026-06-18T06:00:00.000Z' }`, assert the clocked-in affordance renders (`Clock Out` or the elapsed display — confirm the exact label from source). Run green.
- [ ] **Step 5: Commit.**
```bash
git add __tests__/HomeScreen.test.js
git commit -m "test(home): characterization render coverage for HomeScreen (Item 8)"
```

---

## Task 3 — Gap 2b: LiteracySessionForm render characterization (§8 priority)

**Risk:** LOW-MED (no on-mount async — pure synchronous form). → Controller review.

**Files:**
- Create: `__tests__/LiteracySessionForm.test.js`
- Target: `src/screens/sessions/LiteracySessionForm.js` (default export; prop `navigation`)
- Convention: `SessionCompleteScreen.test.js`

- [ ] **Step 1: Write the test.** Mock `useAuth` (`{ user: { id: 'ea-1' }, profile: {} }`), `useOffline` (`{ refreshSyncStatus: jest.fn(), triggerBackgroundSync: jest.fn() }`), `useClasses` (`{ classes: [] }`), `useLookupsContext` (`{ jobTitles: [] }`). No repos to mock for mount (form renders empty). Assert the static section scaffold renders synchronously:
```javascript
test('renders the session-capture form scaffold', () => {
  const s = render(<PaperProvider><LiteracySessionForm navigation={{ replace: jest.fn() }} /></PaperProvider>);
  expect(s.getByText('Session Date')).toBeTruthy();
  expect(s.getByText('Select Children')).toBeTruthy();
  expect(s.getByText('Letters Focused On')).toBeTruthy();
  expect(s.getByText('Submit Session')).toBeTruthy();
});
```
- [ ] **Step 2: HARD RULE — confirm import paths + the four section labels** against `src/screens/sessions/LiteracySessionForm.js` (the agent reported `Session Date` L323, `Select Children` L352, `Letters Focused On` L366, `Submit Session` L489). Adjust assertions to the source's exact strings.
- [ ] **Step 3: Run — expect GREEN.** Run: `… npx jest __tests__/LiteracySessionForm.test.js …`.
- [ ] **Step 4: Characterize the children-selected branch** if cheap: the agent flagged `Update Child Progress (Optional)` appears only when `selectedChildren.length > 0`. This is driven by internal `useState`, not a prop — so either drive it via `fireEvent` on a child chip (preferred, true characterization) or skip if the child list requires complex setup. Keep this branch optional; the scaffold test is the must-have.
- [ ] **Step 5: Commit.**
```bash
git add __tests__/LiteracySessionForm.test.js
git commit -m "test(sessions): characterization render coverage for LiteracySessionForm (Item 8)"
```

---

## Task 4 — Gap 2c: TimeTrackingScreen render characterization

**Risk:** LOW (single hook, `useTimeTracking`). → Controller review.

**Files:** Create `__tests__/TimeTrackingScreen.test.js`; target `src/screens/main/TimeTrackingScreen.js` (default export; prop `navigation`).

- [ ] **Step 1: Write the test.** Mock only `useTimeTracking`. Two branches off `isSignedIn`:
```javascript
const base = { activeEntry: null, loadingLocation: false, elapsedTime: 0, snackbarVisible: false,
  setSnackbarVisible: jest.fn(), handleSignIn: jest.fn(), handleSignOut: jest.fn(),
  formatElapsedTime: () => '0h 0m 0s', formatTime: () => '8:00 AM' };

test('signed-out: shows status + Clock In + the explainer', () => {
  mockUseTimeTracking.mockReturnValue({ ...base, isSignedIn: false });
  const s = render(<PaperProvider><TimeTrackingScreen navigation={{ navigate: jest.fn() }} /></PaperProvider>);
  expect(s.getByText('Current Status')).toBeTruthy();
  expect(s.getByText('Clock In')).toBeTruthy();
  expect(s.getByText('How Time Tracking Works')).toBeTruthy();
  expect(s.getByText('View Work History')).toBeTruthy();
});

test('signed-in: shows Clock Out and the active-shift detail', () => {
  mockUseTimeTracking.mockReturnValue({ ...base, isSignedIn: true,
    activeEntry: { sign_in_time: '2026-06-18T06:00:00.000Z', sign_in_lat: -33.9, sign_in_lon: 25.6 } });
  const s = render(<PaperProvider><TimeTrackingScreen navigation={{ navigate: jest.fn() }} /></PaperProvider>);
  expect(s.getByText('Clock Out')).toBeTruthy();
});
```
- [ ] **Step 2: HARD RULE** — confirm the exact labels (`Current Status` L31, `Clock In`/`Clock Out` L104/L114, `How Time Tracking Works` L133, `View Work History` L160) against source.
- [ ] **Step 3: Run — expect GREEN.**
- [ ] **Step 4: Commit.**
```bash
git add __tests__/TimeTrackingScreen.test.js
git commit -m "test(time): characterization render coverage for TimeTrackingScreen (Item 8)"
```

---

## Task 5 — Gap 2d: ClassDetailScreen render characterization

**Risk:** LOW-MED (`route.params.classId`, `useLayoutEffect` header, context-only data). → Controller review.

**Files:** Create `__tests__/ClassDetailScreen.test.js`; target `src/screens/children/ClassDetailScreen.js` (default export; prop `navigation`, `route.params.classId`).

- [ ] **Step 1: Write the test.** Mock `useClasses` (`{ classes, schools, getChildrenInClass }`) and `useChildren` (`{ groups: [], childrenGroups: {} }`). Provide `navigation` with `setOptions` (the `useLayoutEffect` calls it) + `navigate`. Three branches:
```javascript
const navigation = { setOptions: jest.fn(), navigate: jest.fn(), popToTop: jest.fn() };
const route = { params: { classId: 'class-1' } };
const classItem = { id: 'class-1', name: 'Grade 1A', school_id: 'school-1', grade: '1',
  teacher: 'Ms K', home_language: 'isiXhosa' };

test('class found + empty: shows header + empty-children state', () => {
  mockUseClasses.mockReturnValue({ classes: [classItem], schools: [{ id: 'school-1', name: 'Masi Primary' }],
    getChildrenInClass: () => [] });
  mockUseChildren.mockReturnValue({ groups: [], childrenGroups: {} });
  const s = render(<PaperProvider><ClassDetailScreen navigation={navigation} route={route} /></PaperProvider>);
  expect(s.getByText('Grade 1A')).toBeTruthy();
  expect(s.getByText('No children in this class yet.')).toBeTruthy();
});

test('class not found: shows the not-found fallback', () => {
  mockUseClasses.mockReturnValue({ classes: [], schools: [], getChildrenInClass: () => [] });
  mockUseChildren.mockReturnValue({ groups: [], childrenGroups: {} });
  const s = render(<PaperProvider><ClassDetailScreen navigation={navigation} route={route} /></PaperProvider>);
  expect(s.getByText('Class not found.')).toBeTruthy();
});
```
- [ ] **Step 2: HARD RULE** — confirm how the screen resolves the class (the agent reported `classItem` from `classes` filtered by `route.params.classId`, and `getChildrenInClass` from `useClasses`). Confirm the exact strings `Class not found.` (L77), `No children in this class yet.` (L214), and how the school name is derived. Adjust to source.
- [ ] **Step 3: Run — expect GREEN.** Watch for `setOptions`/`useLayoutEffect` throwing if `navigation` lacks a method — add the missing mock method, don't change source.
- [ ] **Step 4: Commit.**
```bash
git add __tests__/ClassDetailScreen.test.js
git commit -m "test(children): characterization render coverage for ClassDetailScreen (Item 8)"
```

---

## Task 6 — Gap 3a: `timeEntriesRepository` real-SQLite integration test

**Risk:** LOW-MED (follows the repo-integration convention exactly). → Controller review.

> **⚠️ SUPERSEDED BY R2 — do NOT create this file; it already exists with 7 real-SQLite tests.** This task WIRES the existing `__tests__/timeEntriesRepository.test.js` into the integration tier and adds only genuinely-missing clock-in/out assertions. The Step-2 sample below is reference only — reconcile against the existing file, never overwrite it.

**Files:**
- Modify: `__tests__/timeEntriesRepository.test.js` (existing — add only missing assertions), `jest.integration.config.js` (add to `testMatch`)
- Target: `src/db/repositories/timeEntriesRepository.js` (`createTimeEntriesRepository({ database })`: `saveTimeEntry`, `updateTimeEntry`, `getActiveTimeEntry`, `getTimeEntries`)
- Convention to copy: `__tests__/assessmentsRepository.test.js:1-82` (`jest.mock('expo-sqlite', expoSQLiteMock)`; `createMigratedDatabase(runMigrations)`; `seedCoreData`; assert rows + `sync_outbox`; `closeAsync` in `finally`)

- [ ] **Step 1: Add to the integration tier.** In `jest.integration.config.js` `testMatch`, add `'<rootDir>/__tests__/timeEntriesRepository.test.js',`.
- [ ] **Step 2: Write the failing test** (real SQLite). Assert the clock-in/out write path + outbox enqueue:
```javascript
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
import { runMigrations } from '../src/db/migrations';
import { createTimeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';
import { createMigratedDatabase } from '../test-support/sqliteRepositoryTestUtils';

test('clock-in writes a time_entries row and enqueues an insert outbox record', async () => {
  const db = await createMigratedDatabase(runMigrations);
  try {
    const repo = createTimeEntriesRepository({ database: db });
    await repo.saveTimeEntry({ id: 'te-1', user_id: 'user-1', sign_in_time: '2026-06-18T06:00:00.000Z',
      sign_in_lat: -33.9, sign_in_lon: 25.6, sign_out_time: null, synced: false });

    expect(await db.getFirstAsync('select count(*) as count from time_entries')).toEqual({ count: 1 });
    const out = await db.getAllAsync("select operation from sync_outbox where table_name = 'time_entries' and record_id = 'te-1'");
    expect(out).toEqual([{ operation: 'insert' }]);
    expect(await repo.getActiveTimeEntry('user-1')).toEqual(expect.objectContaining({ id: 'te-1' }));
  } finally { await db.closeAsync(); }
});

test('clock-out updates the row and closes the active entry', async () => {
  const db = await createMigratedDatabase(runMigrations);
  try {
    const repo = createTimeEntriesRepository({ database: db });
    await repo.saveTimeEntry({ id: 'te-1', user_id: 'user-1', sign_in_time: '2026-06-18T06:00:00.000Z', sign_out_time: null, synced: false });
    await repo.updateTimeEntry('te-1', { sign_out_time: '2026-06-18T14:00:00.000Z', synced: false });
    expect(await repo.getActiveTimeEntry('user-1')).toBeNull();
    const row = await db.getFirstAsync("select sign_out_time from time_entries where id = 'te-1'");
    expect(row.sign_out_time).toBe('2026-06-18T14:00:00.000Z');
  } finally { await db.closeAsync(); }
});
```
- [ ] **Step 3: Run — expect GREEN.** Run: `… npx jest --runInBand --config jest.integration.config.js __tests__/timeEntriesRepository.test.js`. (`time_entries` has no domain FKs, so `seedCoreData` isn't required, but call it if the schema needs a user row — confirm against the migrated schema; if an FK rejects the insert, that's a finding.)
- [ ] **Step 4: HARD RULE** — `getActiveTimeEntry` maps a null row via `mapTimeEntry(null)`; confirm it returns `null` (not a throw) for the no-active case before asserting `toBeNull()`. If it throws on null, that is a real defect → `systematic-debugging`.
- [ ] **Step 5: Commit.**
```bash
git add __tests__/timeEntriesRepository.test.js jest.integration.config.js
git commit -m "test(time): real-SQLite integration coverage for timeEntriesRepository (Item 8)"
```

---

## Task 7 — Gap 3b: clock-in vertical through the real SQLite path (provider-backed)

**Risk:** MED-HIGH (binds the production `timeEntriesRepository` singleton to a test DB via the `expo-sqlite` factory; the wiring is the hard part). → Codex adversarial pass.

**Files:**
- Create: `__tests__/useTimeTracking.integration.test.js`
- Modify: `jest.integration.config.js` (add to `testMatch`)
- Target: `src/hooks/useTimeTracking.js` (`handleSignIn` → singleton `timeEntriesRepository.saveTimeEntry`; mounts `loadActiveEntry`)
- Convention to copy: **whichever existing integration test drives the production `openDatabaseAsync` path via `expoSQLiteMock.__setDatabaseFactory`** — `__tests__/ChildrenContext.test.js` (provider-backed, real SQLite) is the closest; `__tests__/sqliteFoundation.test.js` also exercises the production bootstrap.

- [ ] **Step 1: HARD RULE — discover the wiring first; STOP if it differs.** Before writing, read `__tests__/ChildrenContext.test.js` and `src/db/repositories/repositoryRuntime.js` (`resolveDatabase`) to learn exactly how a test binds the production singleton's DB to `better-sqlite3` (via `require('../test-support/expoSQLiteMock').__setDatabaseFactory(() => createBetterSqliteTestDatabase())` + `runMigrations` on that same handle). If the singleton resolves its DB through a path these tests don't cover, **STOP and report** — do not invent a wiring.
- [ ] **Step 2: Write the failing test.** Mock the boundary only — `useAuth` (`{ user: { id: 'user-1' } }`), `useOffline` (`{ refreshSyncStatus: jest.fn(), triggerBackgroundSync: jest.fn() }`), and `getCurrentPosition` (`../src/services/locationService` → resolves `{ coords: { latitude: -33.9, longitude: 25.6 } }`). Drive the hook with `@testing-library/react-native`'s `renderHook` + `act`:
```javascript
const { result } = renderHook(() => useTimeTracking());
await act(async () => { await result.current.handleSignIn(); });
// Assert against the SAME better-sqlite3 handle the factory returned:
expect(await testDb.getFirstAsync('select count(*) as count from time_entries')).toEqual({ count: 1 });
const out = await testDb.getAllAsync("select operation from sync_outbox where table_name = 'time_entries'");
expect(out).toEqual([{ operation: 'insert' }]);
expect(result.current.isSignedIn).toBe(true);
```
- [ ] **Step 3: Add to `jest.integration.config.js` `testMatch`:** `'<rootDir>/__tests__/useTimeTracking.integration.test.js',`.
- [ ] **Step 4: Run — expect GREEN.** Run: `… npx jest --runInBand --config jest.integration.config.js __tests__/useTimeTracking.integration.test.js`. This proves the full vertical: hook → singleton repo → real SQLite → outbox. If it can't bind the singleton to the test DB, that's the Step-1 STOP condition, not a workaround target.
- [ ] **Step 5: Commit.**
```bash
git add __tests__/useTimeTracking.integration.test.js jest.integration.config.js
git commit -m "test(time): provider-backed clock-in vertical through real SQLite (Item 8)"
```

---

## Task 8 — Gap 5: port the device-faithful engine + force-stop/reopen test

**Risk:** HIGH (new engine must coexist with the existing 20 integration suites without regressing them). → Codex adversarial pass.

**Files:**
- Create: `test-support/expoSQLiteRealEngine.js` (port of the fork file), `__tests__/forceStopReopenOutbox.test.js`
- Modify: `jest.integration.config.js` (add the new test to `testMatch`)
- Port source: `/Users/jimmckeown/Development/zazi-izandi-app/test-support/expoSQLiteRealEngine.js`

- [ ] **Step 1: Port the engine (adapt, don't rewrite).** Copy the fork file to `test-support/expoSQLiteRealEngine.js`, changing only: the temp-dir tag `zz-tests` → `masi-tests`; keep the per-name registry, close/reopen survival, sidecar-aware `deleteDatabaseAsync`, `withTransactionAsync` (void return) / `withExclusiveTransactionAsync` (`BEGIN EXCLUSIVE`), and `__usesRealEngine: true`.
- [ ] **Step 2: HARD RULES (reconcile with Masi).**
  - This is an **opt-in** engine. **Do NOT** repoint `expoSQLiteMock.js` or the existing 20 integration suites at it.
  - Masi's production reader uses `PRAGMA query_only` (the `:memory:` `betterSqliteAdapter` deliberately *skips* it on its shared single connection — see `betterSqliteAdapter.js:24-33`). The ported engine uses one handle per open; if `runMigrations` or the client bootstrap issues `PRAGMA query_only` through this engine, decide explicitly (skip it like the adapter, or open a separate reader handle). If the force-stop test doesn't touch the reader path, document that and keep it out of scope — but do NOT let a swallowed `query_only` poison the writer.
  - Confirm `runMigrations(db)` works against this engine's wrapped handle (it expects `execAsync`/`runAsync`/`getAllAsync`/`getFirstAsync` + a transaction method). If the migration runner needs a method the wrapper doesn't expose, add it faithfully (matching expo-sqlite), don't stub it.
- [ ] **Step 3: Write the failing test — force-stop/reopen with pending outbox.**
```javascript
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteRealEngine'));
import { openDatabaseAsync, deleteDatabaseAsync, __resetMockDatabases } from '../test-support/expoSQLiteRealEngine';
import { runMigrations } from '../src/db/migrations';
import { createTimeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';

afterEach(async () => { await __resetMockDatabases(); });

test('a pending outbox row survives force-stop (close) and reopen', async () => {
  const name = 'masi-forcestop.db';
  let db = await openDatabaseAsync(name);
  await runMigrations(db);
  await createTimeEntriesRepository({ database: db }).saveTimeEntry({
    id: 'te-1', user_id: 'user-1', sign_in_time: '2026-06-18T06:00:00.000Z', sign_out_time: null, synced: false });
  await db.closeAsync();                         // simulate force-stop (WAL sidecars remain)

  db = await openDatabaseAsync(name);            // reopen the same on-disk file
  const survived = await db.getAllAsync("select record_id, operation from sync_outbox where table_name = 'time_entries'");
  expect(survived).toEqual([{ record_id: 'te-1', operation: 'insert' }]);
  const row = await db.getFirstAsync("select id from time_entries where id = 'te-1'");
  expect(row).toEqual({ id: 'te-1' });
  await deleteDatabaseAsync(name);
});
```
- [ ] **Step 4: Add to `jest.integration.config.js` `testMatch`:** `'<rootDir>/__tests__/forceStopReopenOutbox.test.js',`.
- [ ] **Step 5: Run focused, THEN run the full integration tier** to prove no regression to the other 20 suites. Run: `… npx jest --runInBand --config jest.integration.config.js __tests__/forceStopReopenOutbox.test.js` then `… npm run test:integration`. Both green.
- [ ] **Step 6: Commit.**
```bash
git add test-support/expoSQLiteRealEngine.js __tests__/forceStopReopenOutbox.test.js jest.integration.config.js
git commit -m "test(db): port device-faithful engine; force-stop/reopen outbox-survival test (Item 8)"
```

---

## Task 9 — Gap 4: opt-in RLS upsert-visibility probe (CI-safe guard + live script)

**Risk:** MED (network/auth at the live edge; the CI part is pure). → Controller review; live run is Jim-interactive.

**Files:**
- Create: `scripts/rls-visibility-probe.cjs` (live, opt-in), `__tests__/rlsVisibilityProbe.test.js` (CI-safe, no network)
- Modify: `package.json` (`"rls:probe": "node scripts/rls-visibility-probe.cjs"`), `documentation/rls-sync-contract-map.md` (probe under the four tables' "Tests and probes")
- The four documented rules (`rls-sync-contract-map.md:44-49`): `children_select_created_by`, `classes_select_created_by`, `groups_select_created_by` (all `created_by = auth.uid()`), and `sessions` direct `user_id = auth.uid()`.
- Guard convention to copy: `scripts/sqlite-staging.cjs:68-89` (`validateSqliteEnv`: REQUIRED_ENV + `SUPABASE_PROJECT_ID_SQLITE === 'segygjzpujphwvrubusm'` + URL match) and its test `__tests__/sqliteStagingScript.test.js`.

- [ ] **Step 1: Write the CI-safe unit test first.** It must (a) assert the probe reuses the project-ref guard (rejects the legacy ref `jcqrlwetutnpuchjoyyd` and a mismatched URL), and (b) assert the probe enumerates exactly the four documented rules. Export a pure `PROBE_RULES` array + a `validateProbeEnv` (re-export `validateSqliteEnv`) from the script for testing without network:
```javascript
const { PROBE_RULES, validateProbeEnv } = require('../scripts/rls-visibility-probe.cjs');
test('targets exactly the four documented upsert-visibility rules', () => {
  expect(PROBE_RULES.map((r) => r.policy).sort()).toEqual(
    ['children_select_created_by', 'classes_select_created_by', 'groups_select_created_by', 'sessions_select_user_id'].sort());
});
test('refuses to run against the legacy backend', () => {
  expect(() => validateProbeEnv({ SUPABASE_PROJECT_ID_SQLITE: 'jcqrlwetutnpuchjoyyd', /* … */ })).toThrow(/segygjzpujphwvrubusm/);
});
```
- [ ] **Step 2: Implement the script's pure pieces** (`PROBE_RULES`, `validateProbeEnv`) to pass Step 1. Run: `… npx jest __tests__/rlsVisibilityProbe.test.js`. Expected: PASS.
- [ ] **Step 3: Implement the live probe (opt-in, guarded).** Behind `validateProbeEnv`, using the publishable key + a test-EA sign-in: for each rule, insert a row as the creator, then assert it is SELECT-visible to that same creator (the upsert-conflict-resolution visibility), and — where applicable — invisible to a second EA. Print a per-rule PASS/FAIL summary; **never print secrets** (mirror `sqlite-staging.cjs`'s safe-summary discipline). The DB is the **wipeable** `masi-app-sqlite` (no field users), so the probe may create/clean its own rows.
- [ ] **Step 4: HARD RULE — do NOT gate CI on the live probe.** It is not added to any `testMatch`; it runs only via `npm run rls:probe` in an interactive terminal (the management token 401s in non-interactive shells). Document this in the script header + the contract map.
- [ ] **Step 5: Controller runs the CI-safe test green + Jim runs the live probe interactively (owed, like Item 4's device pass). Commit the CI-safe pieces.**
```bash
git add scripts/rls-visibility-probe.cjs __tests__/rlsVisibilityProbe.test.js package.json documentation/rls-sync-contract-map.md
git commit -m "test(rls): opt-in upsert-visibility probe + CI-safe guard test (Item 8)"
```

---

## Finish gate

- [ ] Full suite green (Node 20): `… npm test && npm run test:integration`. Expected ≥ **111 unit suites / ~620 tests** (606 + the 4 render suites + Task 1) and **23 integration suites / ~140 tests** (20 + Tasks 6, 7, 8). Record the exact counts in the build-log.
- [ ] **Owed (carried, not done — disclose like Item 4):** Jim runs `npm run rls:probe` interactively (Task 9 live half).
- [ ] Append Item 8 entries to `documentation/build-log.md`; update `documentation/rls-sync-contract-map.md` "Tests and probes" for `time_entries` (Task 6/7) and the four visibility tables (Task 9).
- [ ] `superpowers:finishing-a-development-branch` → `handoff` to **Item 5**.

---

## Self-review (controller, before dispatching Task 1)

**Spec coverage vs §8:** Gap 1 → Task 1 (server-mirror, complementing the existing local-mirror). Gap 2 → Tasks 2–5 (Home + session form prioritized per §8; `SyncStatusScreen` correctly dropped — already covered). Gap 3 → Tasks 6–7 (repo in the tier + provider-backed vertical). Gap 4 → Task 9 (opt-in probe, CI-safe split). Gap 5 → Task 8 (engine port + force-stop test). All five mapped.

**Placeholder scan:** every task has exact paths, a convention file with line refs, concrete assertions, and a HARD RULE. The render-test mocks name the exact context modules (with a HARD RULE to confirm import paths against source). No "add appropriate assertions."

**Type/name consistency:** repository factory names match source (`createTimeEntriesRepository`, `saveTimeEntry`, `updateTimeEntry`, `getActiveTimeEntry`); harness names match (`createMigratedDatabase`, `createBetterSqliteTestDatabase`, `runMigrations`, `seedCoreData`); `__contract` export confirmed in `offlineSync.js`; engine exports (`openDatabaseAsync`, `deleteDatabaseAsync`, `__resetMockDatabases`, `__usesRealEngine`) match the fork file.

**Known soft spots (flag to plan review):** (1) Task 1's SQL parser is the fragile piece — the mutation check + throw-on-unknown-DDL rule are the mitigations. (2) Task 7's singleton-DB binding is assumption-bearing — gated behind a Step-1 STOP rule. (3) Task 8's `query_only` reconciliation could regress the reader path — full-integration-tier re-run is the gate.
