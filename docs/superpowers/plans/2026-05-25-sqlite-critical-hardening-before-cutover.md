# SQLite Critical Hardening Before Cutover

> **For agentic workers:** REQUIRED SUB-SKILL: use `.agents/skills/tdd`. Implement this plan with vertical red-green-refactor slices: one behavior test, minimal implementation, then the next behavior. Do not batch all tests first.

**Goal:** Port the critical Zazi lessons that are directly relevant to Masi's SQLite cutover stability before field distribution: SQLite lock hardening, sync/preload contention reduction, local-first screen completion, domain form input hardening, and support-visible release/build identity.

**Source evidence:**

- `documentation/zazi-izandi-feature-port-roadmap.md`
- `/Users/jimmckeown/Development/zazi-izandi-app/documentation/sqlite-refactor-log.md`
- `/Users/jimmckeown/Development/zazi-izandi-app/documentation/build-log.md`
- Current Masi device findings from 2026-05-25 physical iPhone/Expo Go testing

**Non-goals for this slice:**

- Do not port Zazi push notifications.
- Do not redesign the login screen or add celebration screens.
- Do not add the Sessions Today ring yet.
- Do not change the package manager.
- Do not reintroduce legacy AsyncStorage domain migration.

**Operating rules:**

- Update `documentation/sqlite-refactor-log.md` after each completed task with decisions, bugs, test commands, and device findings.
- Keep tests behavior-oriented and public-interface based.
- Keep release validation focused on the current SQLite staging backend (`masi-app-sqlite`, project ref `segygjzpujphwvrubusm`).
- If a task exposes a deeper schema/RLS problem, pause and log it before widening scope.

---

## Task 0: Baseline And Work Boundary

**Files:**

- Read: `src/db/migrations.js`
- Read: `src/services/offlineSync.js`
- Read: `src/context/OfflineContext.js`
- Read: `src/screens/children/*`
- Read: `src/screens/sessions/*`
- Read: `src/screens/assessments/*`
- Update: `documentation/sqlite-refactor-log.md`

- [x] **Step 1: Capture baseline grep output**

Run and save the important findings to the refactor log:

```bash
rg -n "busy_timeout|journal_mode|foreign_keys|setTimeout\\(\\(\\) => navigation\\.goBack|triggerBackgroundSync|assessment_items|autoCorrect|spellCheck|autoComplete|textContentType" src __tests__
```

- [x] **Step 2: Run the current focused baseline**

Run:

```bash
npm test -- --runInBand __tests__/sqliteFoundation.test.js __tests__/offlineSyncOutbox.test.js __tests__/OfflineContext.test.js
```

Expected: pass before implementation. If not, record the failure and fix the baseline first.

---

## Task 1: SQLite Lock Hardening

**Why:** Zazi's final Android validation found `database is locked` was not fully solved by transaction queuing. Expo SQLite needs a busy timeout so transient lock contention waits instead of redboxing.

**Files:**

- Modify: `src/db/migrations.js`
- Test: `__tests__/sqliteFoundation.test.js`
- Update: `documentation/sqlite-refactor-log.md`

- [x] **Step 1: Red test for connection pragmas**

Add a behavior test proving `runMigrations()` configures SQLite with:

- `PRAGMA foreign_keys = ON`
- `PRAGMA journal_mode = WAL`
- `PRAGMA busy_timeout = 5000`

The test should assert these pragmas happen before migration execution and not inside the migration transaction.

- [x] **Step 2: Implement pragmas**

In `runMigrationsNow`, apply the connection pragmas before reading `PRAGMA user_version`.

Important constraints:

- Keep `PRAGMA user_version = ...` outside migration transactions.
- Keep app-level `runMigrations()` serialized through `withDatabaseAccess()`.
- Do not add retry loops around app code to mask lock bugs.

- [x] **Step 3: Verify**

Run:

```bash
npm test -- --runInBand __tests__/sqliteFoundation.test.js
git diff --check
```

Acceptance:

- Test fails before implementation and passes after.
- No `busy_timeout` regression can be removed silently.

---

## Task 2: Reduce Sync And Supabase Contention

**Why:** Zazi found assessment completion and rapid letter-tracker edits could create many individual Supabase calls, compete with startup preloads, and make local-first screens feel network-bound. Masi has a Supabase request queue, but sync operations still need to be checked and hardened against noisy same-table work.

**Files:**

- Modify: `src/services/offlineSync.js`
- Modify if needed: `src/context/OfflineContext.js`
- Test: `__tests__/offlineSyncOutbox.test.js`
- Test: `__tests__/OfflineContext.test.js`
- Update: `documentation/sqlite-refactor-log.md`

- [x] **Step 1: Red test for batched `assessment_items` upload**

Add a test that creates multiple ready `assessment_items` outbox rows for one assessment and proves sync sends them as one Supabase upsert batch, not one request per item.

Contract:

- Same-table `assessment_items` insert/update rows can batch.
- Hard deletes do not batch.
- Unknown tables and terminal failures still remain visible failed items.

- [x] **Step 2: Red test for batch fallback**

Add a test proving a batch failure falls back to per-record processing so one bad item does not hide every other item's result.

Contract:

- If the batch call fails, each item is retried through the existing per-record path.
- Terminal classification still applies per row.
- Successful fallback rows finalize normally.

- [x] **Step 3: Route sync server calls through the Supabase request queue**

Ensure sync upload work cannot run concurrently with startup preload/profile calls against the Supabase auth lock.

Contract:

- Manual `syncNow()` remains a shared in-flight promise.
- Background sync remains non-blocking for screen write paths.
- Preload pulls and sync uploads are serialized at the Supabase request boundary.

- [x] **Step 4: Tune background sync debounce**

Revisit the current `300ms` debounce. Zazi settled on `1000ms` to coalesce rapid letter-tracker taps. Use test evidence to choose:

- Keep `300ms` only if tests and device behavior prove it is not noisy.
- Prefer `1000ms` if rapid mastery/session writes still produce repeated sync starts.

- [x] **Step 5: Verify**

Run:

```bash
npm test -- --runInBand __tests__/offlineSyncOutbox.test.js __tests__/OfflineContext.test.js
npm test -- --runInBand __tests__/LetterAssessmentScreen.plan5.test.js __tests__/LetterTrackerScreen.plan5.test.js
git diff --check
```

Acceptance:

- Assessment-item uploads are measurably fewer.
- Sync/preload contention is reduced without blocking user-visible local writes.

---

## Task 3: Enforce Local-First Screen Completion

**Why:** Zazi found several screen-level `setTimeout(...navigation.goBack...)` delays that made successful local writes feel slow. Masi still has those delays in Add/Edit Child and Create/Edit Class paths.

**Files:**

- Modify: `src/screens/children/AddChildScreen.js`
- Modify: `src/screens/children/CreateClassScreen.js`
- Modify: `src/screens/children/EditChildScreen.js`
- Modify: `src/screens/children/EditClassScreen.js`
- Test: existing screen tests or new focused tests
- Optional new test: `__tests__/screenTimerAudit.test.js`
- Update: `documentation/sqlite-refactor-log.md`

- [x] **Step 1: Red tests for immediate navigation after durable local success**

Add or update tests proving:

- Add Child calls `navigation.goBack()` immediately after `addChild()` succeeds.
- Create Class calls `navigation.goBack()` immediately after `addClass()` succeeds.
- Edit Child calls `navigation.goBack()` immediately after `updateChild()` succeeds.
- Edit Class calls `navigation.goBack()` immediately after `updateClass()` succeeds.
- Failure paths do not navigate.

- [x] **Step 2: Remove screen-level success timers**

Remove timer-delayed navigation from successful local-write paths and missing-record exits.

Keep intentional timers only where they are infrastructure:

- Auth sign-out grace timer.
- Offline sync debounce.
- Logger flush.
- Clock/timer intervals.

- [x] **Step 3: Add a timer audit guard**

Add a small regression test or documented grep allowlist so future `setTimeout(() => navigation.goBack())` patterns are caught before field testing.

- [x] **Step 4: Verify**

Run:

```bash
npm test -- --runInBand __tests__/AddChildScreen.test.js __tests__/CreateClassScreen.test.js __tests__/EditChildScreen.test.js __tests__/EditClassScreen.test.js
rg -n "setTimeout\\(\\(\\) => navigation\\.goBack" src
git diff --check
```

Acceptance:

- The grep returns no screen-level delayed navigation.
- Successful local writes do not wait for background sync or an arbitrary snackbar delay.

---

## Task 4: Harden Domain Form Inputs

**Why:** Zazi disabled keyboard language assistance broadly for multilingual field data. Masi has started this, but the pattern should be applied consistently instead of field-by-field.

**Files:**

- Modify: `src/constants/textInputProps.js`
- Optional create: `src/components/forms/ChipSelector.js`
- Modify: `src/screens/children/AddChildScreen.js`
- Modify: `src/screens/children/EditChildScreen.js`
- Modify: `src/screens/children/CreateClassScreen.js`
- Modify: `src/screens/children/EditClassScreen.js`
- Modify: group create/rename fields if present
- Modify: child/class/assessment search fields if present
- Modify: `src/screens/sessions/LiteracySessionForm.js`
- Test: affected screen/component tests
- Update: `documentation/sqlite-refactor-log.md`

- [x] **Step 1: Enumerate domain text inputs**

Run:

```bash
rg -n "<TextInput|TextInput" src/screens src/components
```

Classify each field as:

- Domain/local-language data: no suggestions.
- Search over domain/local-language data: no suggestions.
- Auth email/password: keep platform assistance.
- Numeric/picker-only: use appropriate keyboard/picker behavior.

Save the classification summary to the refactor log.

- [x] **Step 2: Red tests for no-suggestion domain fields**

Add focused tests proving representative fields disable:

- `autoCorrect`
- `spellCheck`
- `autoComplete`
- `textContentType`

At minimum cover:

- Add Child first/last name.
- Edit Child first/last name.
- Create/Edit Class class name and teacher name.
- Literacy session notes/comments.
- One search field.

- [x] **Step 3: Apply shared props consistently**

Apply `NO_TEXT_SUGGESTIONS` or a narrower preset everywhere the classification says it belongs.

- [x] **Step 4: Replace gender modal with two-option chips**

Use Masi's current product decision: only `male` and `female`.

Preferred implementation:

- Add a small reusable `ChipSelector`.
- Use it on Add Child and Edit Child.
- Keep stored values unchanged (`male`, `female`).
- Do not re-add `unknown`, `other`, or `non_binary`.

Handling historic data (decided 2026-05-25):

- Existing children with `gender` values other than `male`/`female` (e.g., `non_binary`, `unknown`, NULL) keep their stored value in SQLite and Supabase. No migration touches existing rows.
- When such a child is loaded in Edit Child, the chip group renders with **neither chip selected** (no fallback, no auto-coerce).
- Saving from Edit Child without selecting a chip leaves the gender field unchanged (the underlying value persists). Selecting a chip and saving writes the new `male`/`female` value, overwriting the historic value.
- Add focused tests: (a) Edit Child loaded with `non_binary` renders both chips unselected, (b) saving without picking a chip preserves the original DB value, (c) picking a chip and saving writes the new value.

- [x] **Step 5: Verify**

Run:

```bash
npm test -- --runInBand __tests__/AddChildScreen.test.js __tests__/EditChildScreen.test.js __tests__/CreateClassScreen.test.js __tests__/EditClassScreen.test.js
git diff --check
```

Acceptance:

- Domain text inputs stop fighting isiXhosa/local names.
- Auth inputs keep password/email manager behavior.
- Gender UI cannot submit a value outside the server/local constraint.

---

## Task 5: Add Visible Release And Backend Identity

**Why:** Masi will have Expo Go, preview APKs, OTA updates, and eventually field builds in circulation. Support needs a quick way to verify which build and Supabase project a user is actually running.

**Files:**

- Create or update: `src/constants/releaseMetadata.json`
- Create or update: `src/utils/releaseMetadata.js`
- Modify: `src/screens/main/ProfileScreen.js`
- Modify: `src/db/debugDump.js`
- Test: `__tests__/releaseMetadata.test.js`
- Test: `__tests__/debugExport.test.js`
- Update: `documentation/sqlite-refactor-log.md`

- [x] **Step 1: Red tests for visible build/backend identity**

Add tests proving release metadata includes:

- App version/build number.
- Release label or build message.
- Git commit or explicit unknown fallback.
- Update channel/runtime version if available.
- Supabase target.
- Supabase project ref.

- [x] **Step 2: Show metadata in Profile/support area**

Display concise metadata in Profile, with enough detail for a field user screenshot:

- App version/build.
- Channel/profile if available.
- Backend target/project ref.

- [x] **Step 3: Include metadata in support export**

Ensure `exportDatabase()`/`debugDump()` include the same metadata so support exports can prove backend identity.

- [x] **Step 4: Verify**

Run:

```bash
npm test -- --runInBand __tests__/releaseMetadata.test.js __tests__/debugExport.test.js __tests__/releaseGateConfig.test.js
npm run sqlite:staging:check
git diff --check
```

Acceptance:

- A screenshot or support export can distinguish `masi-app-sqlite` from old production.
- The EAS preview profile remains pinned to SQLite staging.

---

## Task 6: Clock-In Soft Warning Before Session Capture

**Why:** Zazi used a clock-in-before-session guard as an operational workflow rule. This is not a SQLite prerequisite, but it is critical if Masi wants session records tied to verified working time. Masi has chosen a **soft warning** rather than a hard block: EAs who forgot to clock in can still capture session data after acknowledging.

**Decision locked 2026-05-25:** soft warning, not hard block, not defer.

**Files:**

- Modify: session launch screen(s) — likely `src/screens/main/HomeScreen.js` (Record Session CTA) and any other entry point into `SessionFormScreen`
- Modify or create: `src/hooks/useTimeTracking.js` exposes active-time-entry status; if not, add `src/utils/timeEntryStatus.js` with a pure helper that reads from the time-entries repository
- Test: session launch screen tests + helper unit tests
- Update: `documentation/sqlite-refactor-log.md`

- [x] **Step 1: Red test for soft-warning policy**

Add behavior tests proving:

- Navigating to `SessionFormScreen` (or its launch CTA) with no active `time_entry` shows a non-blocking warning UI: "You're not clocked in. Clock in now or continue anyway?"
- The warning offers two CTAs: **Clock In Now** (navigates to TimeTracking) and **Continue Anyway** (proceeds to the session form).
- "Continue Anyway" results in `navigation.navigate('SessionForm', ...)` (or whatever the current entry is) being called.
- "Clock In Now" results in navigation to the time-tracking screen.
- With an active `time_entry`, no warning appears and navigation proceeds directly.

- [x] **Step 2: Implement policy through a shared helper**

Keep active-time-entry logic out of screen components.

Contract:

- Helper exposes a boolean (`hasActiveTimeEntry`) or enum (`'clocked_in' | 'clocked_out'`).
- Helper reads from the existing time-entries repository — do not duplicate query logic.
- The warning UI is a modal or inline banner (pick whichever is least disruptive on small phones); test for behavior, not exact widget choice.

- [ ] **Step 3: Verify clock-in/out still syncs**

Status 2026-05-25: code-level helper/screen tests passed, but the physical-device clock-in/out sync smoke remains pending because emulator location could not complete this path. This is intentionally left open for user physical-device validation.

Run targeted unit tests plus one physical-device smoke when available:

- clock in
- force-stop/reopen
- confirm still clocked in
- clock out
- sync
- verify `time_entries` row in `masi-app-sqlite`
- session created via "Continue Anyway" path still persists and syncs correctly (warning is non-blocking; data integrity unaffected)

Acceptance:

- EAs who forgot to clock in are nudged but not blocked.
- Every session-form launch path goes through the helper (no duplicated active-entry checks).
- Helper is unit-tested independently of the UI.

---

## Task 7: Final Verification Gate

**Files:**

- Update: `documentation/sqlite-refactor-log.md`
- Update if needed: `documentation/sqlite-staging-setup.md`
- Update if needed: `AGENTS.md`

- [x] **Step 1: Targeted suite**

Run all touched tests:

```bash
npm test -- --runInBand __tests__/sqliteFoundation.test.js __tests__/offlineSyncOutbox.test.js __tests__/OfflineContext.test.js __tests__/debugExport.test.js
```

Add screen/release metadata tests from the actual touched set.

- [x] **Step 2: Release gate**

Run:

```bash
npm test -- --runInBand
npm run test:integration
npm run sqlite:staging:check
git diff --check
```

If time permits before cutover:

```bash
npm run test:release
```

- [x] **Step 2.5: Schema drift verification (pre-cutover safety)**

Per CLAUDE.md, `supabase-migrations/` has diverged from the live schema in three confirmed cases on the old production project. The `masi-app-sqlite` backend is new but the cutover gate is the right moment to verify no drift has crept in.

Run (without injecting `.env.local` — see CLAUDE.md warning):

```bash
supabase db pull --linked --schema public
git diff supabase/migrations
```

Acceptance:

- The `db pull` produces no unexpected `ALTER TABLE`, missing column, or RLS-policy diff against `supabase/migrations/`.
- Any drift found is logged in `documentation/sqlite-refactor-log.md` with an explicit "accepted before cutover" note OR fixed via a new canonical migration.
- If `supabase db pull` is unavailable, fall back to a targeted `mcp__supabase__list_tables` + spot-check of columns the app writes most often (`children`, `sessions`, `assessment_items`, `time_entries`).

- [ ] **Step 3: Device smoke**

Status 2026-05-25: not rerun in this hardening slice. Existing emulator validation from Plan 6 remains logged; final physical-device smoke remains pending before field distribution.

Run a focused physical-device or emulator smoke:

- fresh launch/sign-in against `segygjzpujphwvrubusm`
- Add/Edit Class
- Add/Edit Child
- Letter Tracker rapid edits
- session or assessment offline write
- force-stop/reopen with pending outbox
- reconnect and sync
- support export contains backend/build metadata
- logcat/device console has no `database is locked`, Supabase auth-lock timeout, or SQLite constraint redbox

- [x] **Step 4: Review**

Run a focused review pass against:

- SQLite lock hardening
- sync batching/fallback correctness
- local-first UI behavior
- form-input consistency
- support metadata accuracy

- [x] **Step 5: Documentation closeout**

Update:

- `documentation/sqlite-refactor-log.md`
- `documentation/sqlite-staging-setup.md` if validation status changes
- `AGENTS.md` only if this hardening pass changes agent instructions

Acceptance:

- All critical hardening tasks completed or explicitly deferred with rationale.
- Release/device status is honest and reproducible.
- Plan 6 cutover communication remains the only non-engineering gate.
