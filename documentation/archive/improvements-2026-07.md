> **Archived 2026-07-23.** Implemented work is recorded in
> [`documentation/build-log.md`](../build-log.md); every surviving product, design,
> sync, and hygiene item is consolidated in
> [`documentation/ROADMAP.md`](../ROADMAP.md). This review is point-in-time
> rationale, not a current backlog.

# Masi App: Ranked Code Improvements (2026-07-02)

**Date:** 2026-07-02
**Status:** Fresh review complete. Ready to convert into implementation plans.
**Status note (2026-07-12):** superseded for current state by `documentation/archive/codebase-audit-2026-07-12.md`, which re-verified every remaining item against the tree. Landed since this review: items 1-5, 7 (Phases 1-2), the ZZ launch-blockers, the assessment render-perf pack, and the sync-status trust UX. Known-stale claims in this document (do not act on them): item 8's `LetterMasteryPanel` no longer loads all assessments (it passes `childId`); item 6's "five provider values" is now six (TimeTrackingContext); item 13b's GPS hang gates clock-in/out only, not session capture (which has "Continue Anyway"); item 16.3's dev-backend default flip landed 2026-07-12.
**Relationship to prior work:** This supersedes the open remainder of `documentation/archive/top-10-improvements-2026-06.md`. Since that review (2026-06-14), ~111 commits landed and June items 1, 2, 3, 4, 8 and most of 5 are done (sync-reliability slice, design tokens + colour guard, sequential capture spine, Child Results + Children-tab stack, test-coverage tranche). This document re-verifies the still-open June items against today's tree and adds what the new code introduced.

## How this was produced

Five parallel review agents, each owning one dimension (sync/DB layer, state management + performance, screens/components/navigation, utils/services/seams, tests + tooling), each required to verify findings against the working tree with `file:line` evidence and to label findings new-vs-carryover. Overlapping findings were deduplicated, and every load-bearing claim in the top items was independently re-confirmed inline on 2026-07-02. Both test suites were executed during the review (unit: 117 suites / 636 tests in ~19s; integration: 23 suites / 145 tests in ~5s).

---

## Priority summary

| # | Improvement | Theme | Impact | Effort | Type | Status |
|---|-------------|-------|--------|--------|------|--------|
| 1 | Single source of truth for clock-in state | Data integrity | High | S-M | Bug | Carryover (9b), now a live corruption path |
| 2 | Session-form letter tracker desyncs from real mastery | Data integrity | High | S-M | Bug | NEW |
| 3 | Leave guard on the session form | Data integrity | High | S | Bug/UX | NEW |
| 4 | NetInfo "unknown reachability" blocks sync entirely | Sync reliability | Med-High | S | Bug | NEW |
| 5 | Add covering indexes (schema has zero non-unique indexes) | Performance | High | S | Efficiency | NEW |
| 6 | Break the post-capture reload/re-render amplifier | Performance | High | S-M | Efficiency | Carryover (6b/6c) + NEW angle |
| 7 | Put the test suites in CI; fix the flaky mastery test | Tooling | High | S | Tooling | NEW |
| 8 | Kill the read-path N+1s and unbounded loads | Performance | High | M | Efficiency | Carryover (6a) |
| 9 | Finish the storage.js facade removal | Architecture | High (strategic) | M | Design | Carryover (9a), now much cheaper |
| 10 | `localDate.js` + the remaining UTC-day bugs | Correctness | Med | S | Bug | Carryover (9c), worse than documented |
| 11 | Sync convergence refinements | Sync reliability | Med | S-M | Engineering | Part carryover (2c), part NEW |
| 12 | Extract capture chrome + a shared BottomSheet before WelaPLUS | Architecture | Med | M | Engineering | NEW |
| 13 | Crash-diagnostics and GPS hardening | Reliability | Med | S | Bug | NEW |
| 14 | Close the motivation loop (June item 7) | UX | Med-High | S-M | UX | Carryover (7), untouched |
| 15 | Typography tokens: roll out or retire | Design system | Med | S | Design | NEW (Item 3 remainder) |
| 16 | Hygiene sweep (deps, lint, config, naming) | Hygiene | Low-Med | S | Cleanup | Mostly NEW |

Items 1-4 are the only findings that corrupt or lose field data; they go first. Items 5-7 are the cheapest high-leverage wins. Items 8-9 are the systemic work that everything else keeps paying for. WelaPLUS implementation is next on the roadmap, which raises the priority of 12 and 9 (every new capture Pattern multiplies their cost).

---

## 1. Single source of truth for clock-in state

**Theme:** Data integrity · **Impact:** High · **Effort:** S-M · **Carryover of June 9b, now with a concrete corruption path**

`useTimeTracking` is instantiated independently by `HomeScreen.js:41` and `TimeTrackingScreen.js:21`. Each copy loads `isSignedIn`/`activeEntry` only on mount (`useTimeTracking.js:33-40`, deps `[user?.id]`, no focus listener). HomeScreen stays mounted beneath the stack, so the mainline flow that the app itself steers EAs through corrupts state:

1. Home → "Record Session" → not-clocked-in dialog → **"Clock In Now"** navigates to TimeTracking (`useSessionLaunchGuard.js:67-71`).
2. EA clocks in there, goes back. Home's copy is stale: it still shows "Not clocked in" with a Clock In button.
3. `handleSignIn` guards only on the stale local state (`useTimeTracking.js:140`: `if (isSignedIn)`), and nothing at the repository or schema level prevents a second open entry (`getActiveTimeEntry` is just `order by sign_in_time desc limit 1`, `timeEntriesRepository.js:121-130`).

Result: two overlapping open time entries, one of which the 10-hour auto-clock-out later closes (`useTimeTracking.js:51-71`). This is payroll-adjacent data. The reverse direction also corrupts: clock out on TimeTrackingScreen, return Home, Home still ticks and its Clock Out writes a new `sign_out_time` onto the already-closed entry (`useTimeTracking.js:200-208`).

**Fix.** Promote to a `TimeTrackingContext` (single truth, one timer), keeping a compat shim so call sites don't change. While there, isolate the ticking elapsed-time text into a small memoized child component so the 1Hz `setElapsedTime` (`useTimeTracking.js:97-113`) stops re-rendering the whole 599-line HomeScreen every second of the clocked-in day. Belt-and-braces: re-check `getActiveTimeEntry` inside `handleSignIn`/`handleSignOut`, and add a repository guard against inserting an open entry when one exists.

---

## 2. Session-form letter tracker silently desyncs from real mastery

**Theme:** Data integrity · **Impact:** High · **Effort:** S-M · **NEW (introduced by the word-assessment + Item 5 combination)**

`buildAssessmentRecord` stamps `letter_language` for **both** assessment types (`assessmentScoring.js:54`), and the session-form tracker picks the child's "latest assessment" filtering only on language, with no type filter (`src/components/session/LetterTrackerBottomSheet.js:70`, same bug in `getTrackerCount` at `:252`). `computeAssessmentMastery` returns an empty set for non-letter types (`letterMastery.js:32`). Meanwhile `LetterMasteryPanel.js:53` (used by ChildResults and the letter tracker screen) filters correctly with `(a.assessment_type || 'letter_egra') === 'letter_egra'`.

**Failure scenario:** EA runs a word assessment on a child. From then on, the letter tracker inside the session form shows **zero** assessment-mastered letters (all unlocked/gray) while ChildResults shows them locked/green. The EA can re-mark "mastered" letters as merely "taught", writing conflicting mastery records.

**Root cause is duplication, so fix it there.** Item 5 unified the two mastery *screens* onto `LetterMasteryPanel`, but the session-form sheet still owns its own copy of the load-latest-assessment → compute-mastery → taught-set pipeline (`LetterTrackerBottomSheet.js:59-100` vs `LetterMasteryPanel.js:43-84`), plus duplicated grid math. They have already diverged once (this bug). Extract one shared mastery-state loader/hook; keep write timing (panel writes immediately, sheet defers via `pendingChanges`) as the only variation point. Do not just patch the filter into the copy. WelaPLUS multiplies the cost of leaving two pipelines alive.

---

## 3. The session form has no unsaved-changes leave guard

**Theme:** Data integrity · **Impact:** High · **Effort:** S · **NEW**

The only `beforeRemove` guard in the app is in `useAssessmentSession.js:73`. `LiteracySessionForm` (the highest-traffic capture flow, ~10 fields of state including per-child tracker changes) discards everything silently on a back-swipe or Android hardware back. An assessment mis-tap is guarded; a full session's worth of capture is not.

**Fix.** Add a `beforeRemove` confirm when the form is dirty, e.g. `selectedChildren.length > 0 || selectedLetters.length > 0 || Object.keys(letterTrackerChanges).length > 0`. The pattern to copy already exists in `useAssessmentSession`.

---

## 4. NetInfo "unknown reachability" is treated as offline, blocking sync

**Theme:** Sync reliability · **Impact:** Med-High · **Effort:** S · **NEW**

`OfflineContext.js:141` and `:200` compute `online = state.isConnected && state.isInternetReachable`. NetInfo reports `isInternetReachable: null` while its reachability probe is pending or blocked, which is common on Android cold start and on school Wi-Fi/captive networks that filter the probe endpoint. `null` makes `isOnline` falsy, so `syncNow` refuses (`OfflineContext.js:84-87`) and `triggerBackgroundSync` no-ops (`:117`). A device that is genuinely online but whose probe never resolves **cannot sync at all**, with no UI hint. Given the field runs on exactly this class of network, this may already be happening silently.

**Fix.** Standard pattern: `state.isConnected && state.isInternetReachable !== false` (treat unknown as online; the sync engine already tolerates failed uploads gracefully). One-line change plus a regression test.

---

## 5. Add covering indexes: the SQLite schema has zero non-unique indexes

**Theme:** Performance · **Impact:** High · **Effort:** S · **NEW. The cheapest high-leverage change in this review.**

Every index in `src/db/migrations.js` is a *partial unique* index (`create unique index ... where ...`; 11 of them, 0 plain `create index`). Partial indexes cannot serve queries that omit their `where` predicate. Consequences:

- The per-session attendees probe (`sessionsRepository.js:71-74`) is a full `session_attendees` scan, N times per screen load (see item 8).
- `getLetterMastery` filters on `programme_id/user_id/child_id` without the partial predicate (`masteryRepository.js:88-91`), so it scans.
- No index exists on `assessment_items(assessment_id)`, `child_group_memberships(group_id)`, `assessments(child_id)`, `sessions(programme_id)`, or `sync_outbox(status)`.

These scans grow linearly all school year and multiply the N+1 costs in item 8.

**Fix.** One additive schema migration (version bump) creating ~8 covering indexes on the hot FK columns above. Update the migration pin tests. This is safe, local-only DDL and independently shippable in an afternoon.

---

## 6. Break the post-capture reload/re-render amplifier

**Theme:** Performance · **Impact:** High · **Effort:** S-M · **Carryover (June 6b/6c) plus a NEW wasted-sync angle**

Three links form a loop that fires after **every capture** and every 30 seconds in between. Each link is confirmed in today's tree:

**6a. The 30s poll re-renders the whole app.** `OfflineContext.js:213-221` polls every 30s; `:49` unconditionally `setSyncStatus(freshObject)` even when nothing changed (including a full failed-items outbox read per tick, `syncOutboxRepository.js:174-209`); the provider `value` is an inline literal (`:223-233`). ChildrenProvider, ClassesProvider, LookupsProvider all consume `useOffline` and all build their own values as inline literals with un-memoized functions (`ChildrenContext.js:434-454`, `ClassesContext.js:281-293`, `LookupsContext.js:68`, `AuthContext.js:245-255`). `React.memo` count in `src/`: **0**. So the tick cascades through the entire provider chain to every mounted screen, all day, on Go-class devices.

**6b. NEW: a backed-off record turns the poll into a no-op sync storm.** `refreshSyncStatus` auto-triggers `syncNow` whenever `unsyncedCount > 0` (`OfflineContext.js:51-53`), but `unsyncedCount` counts `failed` rows still inside their backoff window (`syncOutboxRepository.js:191-194`). One failed record waiting out its capped 15-minute backoff drives a **full sync pass every 30 seconds**, each running the group-ownership repair writer transaction (`offlineSync.js:878-883`) and a sync-meta write (`:966-973`) while processing zero records.

**6c. Every sync completion triggers a full server re-pull.** `ChildrenContext.js:71-77` re-runs `loadPreloadedChildData` whenever `isSyncing` flips true→false; the pull has no `updated_at` watermark (`preloadedChildData.js:48-150` selects everything) and persistence loops `await saveRow(row)` per record (`ChildrenContext.js:26-30, 109-127`), where each facade save is **two writer transactions** (payload side-channel + repository row, `storage.js:118-121`). For a 60-child EA that is roughly 300-600 serialized writer transactions queued behind every capture, on 2G. `ClassesContext.js:71-77` independently re-pulls classes. The fresh array identities then re-fire every focused screen's full-table stats load (`HomeScreen.js:64-88`, `ChildrenListScreen.js:37-45`), which is what makes item 8's N+1s fire constantly.

**Fix, in effort order:**
1. (S) Bail the poll: shallow-compare counts before `setSyncStatus`; only auto-trigger sync when a record is actually ready (`next_retry_at <= now`).
2. (S) `useMemo` all five provider values, `useCallback` their APIs. Also stop re-subscribing the NetInfo/AppState listeners on every count change (`OfflineContext.js:139-159, 165-191`; refs already exist in the file for this pattern).
3. (M) Decouple the re-pull from upload completion: pull on sign-in / pull-to-refresh / long interval or an `updated_at` watermark; batch row persistence into one transaction per table.

Fixing link 1+2 alone (one small PR) removes the amplifier and is the best effort-to-impact ratio in this whole document.

---

## 7. Put the test suites in CI, and fix the flaky mastery test

**Theme:** Tooling · **Impact:** High · **Effort:** S · **NEW**

**7a. No CI runs any tests.** `.github/workflows/` contains only the two Claude workflows; nothing runs `npm test` or `npm run test:integration`. The repo's flagship guards (the PGRST204 schema-drift guard `__tests__/syncContractServerSchema.test.js`, `syncContractCompleteness.test.js`, `noLegacyHues.test.js`) only fire when someone remembers to run the release gate locally. Both suites are fast and CI-friendly (unit ~19s; integration ~5s via better-sqlite3, no device or Docker needed). Scenario that motivates this: an agent branch drops a `SERVER_COLUMNS` entry, the local gate is skipped, and the PR merges green because no check exists. Fix: one workflow (Node 20 via `.nvmrc`, `npm ci`, unit + integration; leave `sqlite:staging:check` local since it needs supabase login).

**7b. Flaky test on main.** A full-suite run during this review failed at `__tests__/LetterMasteryPanel.test.js:83` ("toggling a letter on then off"): `waitFor(() => expect(queryByText('1 / 26 letters mastered')).toBeNull())` timed out under parallel load, passes in isolation. Either a test race or a real optimistic-update ordering race in `LetterMasteryPanel` that manifests under CPU contention (i.e. on a slow device). Investigate the un-toggle state update ordering before "fixing" the test; three more `waitFor(...toBeNull())` instances share the fragile shape. A flaky release gate reads as noise and erodes the whole discipline, so this blocks 7a.

---

## 8. Kill the read-path N+1s and unbounded loads

**Theme:** Performance · **Impact:** High (grows all school year) · **Effort:** M · **Carryover (June 6a), untouched**

The write path got its reliability slice in June; the read path is still shaped the way it was:

- `sessionsRepository.getSessions` runs `select * from sessions` (no date bound) then one `session_attendees` query **per session** in a sequential loop (`sessionsRepository.js:71-74, 110-119`). `assessmentsRepository.getAssessments` has the same shape with a per-row summary query (`assessmentsRepository.js:76-80, 110-118`). `timeEntriesRepository.getTimeEntries` is unbounded full-history (`:65-79`).
- Facade reads add a second N+1: one `local_state` SELECT per record (`storage.js:150-156`).
- Hot consumers do full-table loads per focus: `HomeScreen.js:67-71` (all time entries + sessions + assessments just for month/week counts), `SessionsScreen.js:48`, `AssessmentsScreen.js:32`, `AssessmentChildSelectScreen.js:37`, `SessionHistoryScreen.js:71` (everything, then a 30-day cutoff in JS at `:37-52`), `AssessmentHistoryScreen.js:61`.
- Derived-computation hotspots on top: `AssessmentChildSelectScreen.js:47` computes `attemptCount` with a filter-inside-a-loop (O(n²)); `dashboardStats.js:157-207, 213-247` filter the full assessments/mastery arrays per child; `ChildrenContext.js:410-416` uses `membershipIds.includes(...)` (O(n×m)) and is called per class row; `ClassDetailScreen.js:56-66` rebuilds a Set and re-sorts all groups per child row per render.
- NEW instance in Item 5 code: `LetterMasteryPanel.js:48-53` calls `getAssessments({ userId })` and filters to one child in JS, even though the repository supports `childId` and the sibling `ChildResultsScreen.js:66-69` passes it correctly. The panel is now embedded in the high-traffic ChildResults screen.
- NEW: `persistLiteracySession` prefetches the **entire** mastery table for user+programme inside the save transaction and linear-scans it per (child, letter) change (`literacySessionPersistence.js:44-48`, `:7-14`), lengthening writer-lock hold time as mastery accumulates (thousands of rows by Q4). `masteryRepository.saveLetterMasteryRecord` already resolves rows per logical key itself, so the prefetch is nearly redundant.

A year-end EA with ~1,500 sessions/assessments pays thousands of sequential queries per Home focus, and item 6 currently makes that fire after every capture.

**Fix.** Batch child-table hydration with `WHERE session_id IN (...)`; add aggregate repository methods (`COUNT`/`GROUP BY`) so stats consumers never hydrate full rows; push date cutoffs into SQL; pass `childId` in `LetterMasteryPanel`; replace the per-child filters with one-pass `Map(child_id → ...)` builds; convert `TimeEntriesListScreen` (renders all history as Cards in a `ScrollView`, `:185-283`) to a `SectionList` over a bounded query. The normalized schema makes all of this natural, and item 5's indexes make it fast.

---

## 9. Finish the storage.js facade removal

**Theme:** Architecture · **Impact:** High (strategic) · **Effort:** M, incremental · **Carryover (June 9a), now much cheaper than in June**

Good news first: only 6 files still import `utils/storage` (4 contexts, ProfileScreen, offlineSync), and method-level analysis shows roughly **40 of ~70 facade methods have zero production callers** (the whole sessions/assessments/mastery/time-entries surface, the entire sync-meta and sync-queue blocks, `markAsSynced`/`getUnsyncedRecords`/etc.). The deletion is now mostly free.

Why finish it rather than let it sit:

- **Every facade save is two writer transactions** (the `storage_payload` side-channel write plus the repository write, `storage.js:118-121`), and every facade read is N+1 (`mergeFacadeList`, `:150-156`). This is half of item 6c's cost.
- **The stale payload wins over the repository row.** `mergeFacadeRecord` returns `{...payload, synced}` (`storage.js:137-148`), so any repo-direct write to children/groups/classes (the pattern ~20 screens already use for other tables) is invisible to context reads. That is a latent staleness bug with a fuse, not just duplication.
- Dead code with teeth: the unused `saveAssessment` path's `ensureChildExists` (`storage.js:98-111`) fabricates an "Unknown Child" marked `synced: true` that would never push and would guarantee server FK failures if ever called.
- `offlineSync.fetchAndCacheSchools` (`offlineSync.js:1093-1104`) duplicates `pullReferenceData`'s schools path through the facade, a second API for the same job.

**Fix path.** (1) One test-guarded commit deleting the dead two-thirds. (2) Migrate the four contexts to repositories one consumer at a time, killing `storage_payload`, `mergeFacadeRecord`, the `normalize*ForLegacyFacade` functions and `ensure*Exists`. (3) Move capture-mode + user-profile persistence to a slim `deviceSettings` module over `localStateRepository`. Fold step 2 into item 6c's batching work since they touch the same lines.

---

## 10. `localDate.js` plus the remaining UTC-day bugs

**Theme:** Correctness · **Impact:** Med · **Effort:** S · **Carryover (June 9c), and slightly worse than documented**

No shared local-day util exists. Three byte-equivalent *correct* local formatters are duplicated (`dashboardStats.js:18-23`, `LiteracySessionForm.js:55-58`, `assessmentScoring.js:43`), seven near-identical display `formatDate` helpers live in seven screens, and there are live UTC bugs (the field is SAST, UTC+2):

- `TimeEntriesListScreen.js:64` groups by `toISOString().split('T')[0]` and `:147` computes "today" in UTC: clock-ins between 00:00 and 02:00 SAST display under the previous day.
- **NEW:** `dashboardStats.toDateString` (`:25-29`) short-circuits string inputs with `slice(0,10)`. Correct for `session_date` (already local YYYY-MM-DD), but `getDaysWorkedThisMonth` feeds it `entry.sign_in_time` (`:63`), a UTC ISO timestamp, so the Home "days worked" stat attributes an early-morning clock-in to the previous UTC day, and to the previous *month* at month boundaries, despite the file's own warning comment at `:14-17`.

**Fix.** Add `utils/localDate.js` with `toLocalDateString(dateOrIsoTimestamp)` (parse, then localize) and a `formatDisplayDate`; point the three storage formatters, the seven display helpers, and the two buggy paths at it. Land this before WelaPLUS adds more date-stamped tables.

---

## 11. Sync convergence refinements

**Theme:** Sync reliability · **Impact:** Med · **Effort:** S-M · **Part carryover (June 2c), part NEW**

The June reliability slice landed well (capped backoff, force-sync resurrection, per-record try/catch, bulk finalize all confirmed). Four refinements remain, in priority order:

**11a. Deterministic server errors retry forever (NEW, S).** `classifyError` (`offlineSync.js:269-287`) marks only `23505/23503/42501` terminal; `PGRST204` (the repo's most-documented failure class), `42703`, `22P02`, `23502` all retry at the 15-minute cap indefinitely, silently, and while failed they keep tripping item 6b's pass storm. `PGRST204` is genuinely ambiguous (it heals when a server migration lands), so this is a policy decision: classify these terminal (visible on SyncStatusScreen, force-sync resurrects) or give the deterministic class a much longer cap. Decide once, document in the contract map.

**11b. Dependency skipping is still table-scoped (carryover 2c, M).** One child failing retriably puts `children` in `failedTables` (`offlineSync.js:839`) and every assessment/mastery/membership row for **all** children skips that pass (`:896`, cascading via `:909`). Less severe than June (backoff keeps bad records out of most passes) but still over-blocking. Fix as June specified: track failed `(table, record_id)` pairs; the parent ids are already inspected in `dependenciesForRecord` (`:230-244`).

**11c. The child-data pull monopolizes the global Supabase queue (NEW, S).** `pullPreloadedChildData` wraps its entire five-query body in **one** `enqueueSupabaseRequest` critical section (`preloadedChildData.js:48-51`) on the concurrency-1 queue shared with all outbox uploads. On a slow connection the pull stalls uploads for its full duration (and vice versa). Enqueue each query individually, as `pullReferenceData` already does (`offlineSync.js:1067-1076`).

**11d. Outbox bookkeeping chattiness + `created_at` perturbation (NEW, S).** `processBatch` re-reads its batch one row at a time (`offlineSync.js:777-779`) and `markInFlight` runs one UPDATE per id (`syncOutboxRepository.js:91-98`); both are single `WHERE id IN (...)` statements. Separately, the outbox upsert's conflict-update set includes `created_at` (`sqliteRepositoryUtils.js:222-259`), so re-saving a record moves it to the back of the within-table ordering used by `getReadyRecords`/`sortByPushOrder`, which can invert archive-before-insert expectations (e.g. `grouping_versions`). Preserve `created_at` on conflict; also drop the redundant second UPDATE in `syncOutboxRepository.enqueue` (`:51-59`).

Update `documentation/rls-sync-contract-map.md` alongside 11a/11b per the standing rule.

---

## 12. Extract capture chrome + a shared BottomSheet primitive before WelaPLUS

**Theme:** Architecture · **Impact:** Med (multiplies with each WelaPLUS Pattern) · **Effort:** M · **NEW**

Two extractions are cheap now and expensive later:

**12a. Capture-screen chrome.** Item 4 extracted the capture *spine* (`useAssessmentSession`) but not the *chrome*: the instructions phase (`LetterAssessmentScreen.js:111-161` vs `SequentialAssessmentScreen.js:73-93`), the timer/page-dots header, the End-assessment Alert, and ~20 identical style keys are copy-pasted between the two capture screens. Six WelaPLUS Patterns each need this chrome. Extract `AssessmentInstructions` + a capture-header component while there are only two consumers to reconcile.

**12b. One BottomSheet primitive.** `GroupPickerBottomSheet`, `LetterTrackerBottomSheet`, `LastAttemptedBottomSheet` each re-implement ~60 lines of Modal/backdrop/slide/handle scaffolding, while the reading-level pickers (`LiteracySessionForm.js:509-547`), the language picker (`AssessmentChildSelectScreen.js:163-177`), and the class-form pickers still use Paper `Dialog`, against the standing bottom-sheets-over-dialogs preference. Extract the primitive, then convert the Dialog pickers (full rollout, per the consistency rule). This also pre-positions the WelaPLUS Settings UX.

**Also in this bucket:** decide the fate of the session-type machinery. `session_type_id` and the `_pendingJobTitleResolve` fields are stamped by the form (`LiteracySessionForm.js:280`), buried in an `activities.__legacySession` JSON side-channel (`sessionsRepository.js:47-56`), stripped from the outbox payload (`:141`), absent from `SERVER_COLUMNS` (`offlineSync.js:125-128`), and never resolved by anything. Session type **never reaches the server** today. Either promote it to a real local+server column (contract-map update) or delete the machinery and derive the label at render; either way the `__legacySession` envelope goes away.

---

## 13. Crash-diagnostics and GPS hardening

**Theme:** Reliability · **Impact:** Med · **Effort:** S · **NEW**

**13a. The logger destroys Error payloads and can throw at the log site.** `logger.addLog` (`logger.js:63-69`) serializes object args with bare `JSON.stringify`: an `Error` becomes `{}`, so `ErrorBoundary.componentDidCatch`'s `console.error('App crashed:', error, ...)` (`App.js:24`) exports as `App crashed: {}`. The crash diagnostic that Export Logs exists to capture loses its message and stack. Worse, a circular-reference arg makes `JSON.stringify` throw synchronously inside the console interceptor (no try/catch), turning a harmless log line into a crash. Fix: special-case `Error` (message + stack), wrap stringify in try/catch with an `[unserializable]` fallback.

**13b. The "10s GPS timeout" doesn't exist.** `getCurrentPosition` passes `timeInterval: LOCATION_TIMEOUT` to `Location.getCurrentPositionAsync` (`locationService.js:98-101`), but `timeInterval` is a watch-mode spacing option, not a timeout. On weak GPS the promise can hang indefinitely, wedging clock-in, which gates session capture; the `E_LOCATION_TIMEOUT` branch (`:119`) is unreachable. Fix: `Promise.race` with a real 10s timer. Also `requestLocationPermission` (`:22-55`) can re-alert in a loop on Android once `canAskAgain: false`; check it and deep-link `Linking.openSettings()`.

---

## 14. Close the motivation loop (June item 7, untouched)

**Theme:** UX · **Impact:** Med-High · **Effort:** S-M per sub-item · **Carryover, all four sub-items verified still open**

Unchanged from June, re-verified today: (a) HomeScreen never reads `classes`, so a freshly onboarded EA gets a "Record Session" CTA that dead-ends (acute while the go-live backend has zero field users: on day one every EA is the zero-class EA); (b) `SessionCompleteScreen.js:46` Done is `navigation.goBack()`, not the popToTop-to-Home ring payoff that was explicitly requested; (c) ring colour staging still lives inside `SessionsTodayRing` rather than a shared helper + tokens; (d) no `deviceTier` util exists, and it should land before any of the planned animations do. See the June doc's item 7 for the full specs; they remain accurate.

---

## 15. Typography tokens: roll out or retire

**Theme:** Design system · **Impact:** Med · **Effort:** S · **NEW (Item 3 Task 2 built the scale; the rollout never happened)**

`constants/typography.js` has exactly **one** importer (`BrandButton`), while 79 raw `fontSize` declarations remain, including sub-floor sizes on the exact surfaces EAs read in the field: `fontSize: 9` (`HomeScreen.js:518`), `10` (`:378, :383`), `11` (`:557, :593`) on day labels, stat labels, and the coverage caption. The token file itself encodes a 12px informational floor. The colour side proves the mechanism works: `noLegacyHues.test.js` is fail-closed and colour drift stopped.

**Fix.** Bounded full-rollout sweep plus a mirror guard test (allowed-size floor), exactly like the colour guard. Alternatively delete the token file; a token system with one consumer is worse than none because it looks handled. Recommendation: roll out. Fold in the two straggler UX fixes the screens review found: the ClassDetail row tap still opens `EditChild` (`ClassDetailScreen.js:88`; the June item 5 #2 flip may be deliberately deferred into the group-centric item, so confirm before scheduling), and the child CRUD screens still sit on the root stack, hiding the tab bar mid-flow (`AppNavigator.js`), with the custom back button copy-pasted between the two navigators (`AppNavigator.js:82-95` vs `:181-194`).

---

## 16. Hygiene sweep

**Theme:** Hygiene · **Impact:** Low-Med individually, compounding · **Effort:** S each · **Mostly NEW**

Batch these opportunistically or as one half-day sweep:

1. **Dead dependencies.** Zero imports anywhere: `react-hook-form`, `expo-linear-gradient` (orphaned when Item 3 replaced gradient CTAs; it is a native module, so removal shrinks the binary), `@testing-library/jest-native` (deprecated; RNTL v13 provides the matchers). Also move `jest-expo` from `dependencies` to `devDependencies`. (`expo-updates` looks unused to grep but is config-driven via `app.config.js:61-66`; keep it.)
2. **Lint.** No ESLint/Prettier config exists in a 113-file codebase whose known weak spot is context/effect churn. `npx expo lint` (eslint-config-expo) gives `react-hooks/exhaustive-deps` nearly for free; wire into item 7's CI.
3. **Dev backend default.** `resolveSupabaseProjectConfig` defaults to the **legacy** backend with hardcoded legacy fallbacks (`config/supabaseProjectConfig.js:6-7, 34-36, 58-60`), the known `npm start` trap. Once field cutover completes, flip the default to `sqlite-staging` or make the target mandatory in dev so a missing env fails fast.
4. **Language-key inconsistency.** `AssessmentChildSelectScreen.js:96` uses raw `home_language.toLowerCase()` as the `LETTER_SETS` key while every other call site uses `normalizeLanguageKey` ('Xhosa' → 'isixhosa'). A class with `home_language: 'Xhosa'` auto-launches from ChildResults but bounces to the manual language dialog from the Assessments tab. Use the normalizer and make the unknown-language policy explicit in one place.
5. **Profile/Home polish cluster.** Offline password change reports "Current password is incorrect" for any failure including network errors (`ProfileScreen.js:163-169`); both export buttons share one `exportLoading` flag so both spin (`:31, :287, :298`); `HomeScreen.loadStats` has no try/catch, so a repository error silently leaves stale/zero stats (`HomeScreen.js:66-87`).
6. **Test hygiene.** Replace the `AsyncStorage.clear` monkey-patch that silently recreates the SQLite test DB (`jest.setup.js:58-63`) with an explicit `resetTestDatabase()` helper; add a `test:coverage` script (report-only first) so the 1,104-line `offlineSync.js`'s untested branches become visible; rename the nine `.plan5.test.js` suites for behavior on next touch; add a cheap static routing test for `ChildrenStackNavigator` (currently fully mocked in `App.plan5.test.js`, so the cross-tab `navigate('ClassDetail')` retargeting has no automated guard).
7. **Dead-code deletions.** The dead session-edit landmine: `saveSession` never removes attendees when `children_ids` shrinks (`sessionsRepository.js:144-162`); no UI shrinks it today, but WelaPLUS session editing will. Add an attendee diff or a pinning test. Delete the `setRefreshKey` force-refresh hack in `ClassDetailScreen.js:47-50` (context updates already re-render it).

---

## Suggested sequencing

1. **Data-integrity fixes first (1-4).** All small-to-medium, all protect field data captured this term. Items 3 and 4 are near-one-liners with tests.
2. **The two cheap systemic wins (5, 7).** The index migration and CI are each an afternoon and de-risk everything after them. Fix the flaky test before turning CI on.
3. **The amplifier (6), then the read path (8).** Do 6's links 1-2 as one small PR; fold 6c's re-pull decoupling into the item 9 facade migration since they touch the same lines.
4. **Architecture (9, 10, 11, 12) interleaved with feature work.** Item 12 should land immediately before WelaPLUS capture-Pattern work begins; items 9 and 10 can proceed one consumer at a time behind everything else.
5. **Product-facing (13, 14, 15)** as capacity allows; 14a (zero-class onboarding) should be treated as go-live-blocking rather than polish.
6. **Hygiene (16)** continuously.

## Explicitly checked and healthy

To bound future reviews, these were verified clean today: the June sync-reliability slice (capped backoff with `retry_count` reset, force-sync resurrection of terminal rows, per-record try/catch backstops, chunked bulk finalize with preserved CAS semantics, extended batchable tables); migration `user_version` transactionality and FK-off-only-when-pending behavior; the letter-mastery deterministic-id convergence design end-to-end; `useAssessmentSession` and the sequential capture reducer; `scoreBands.js`, `sessionGoal.js`, `profileNormalizer.js`, `assessmentScoring.js`, `letterMastery.js`, `debugExport.js`, `releaseMetadata.js`, `app.config.js`; test-suite health overall (fast, behavior-level, restrained mocking in the new Item 4/5 suites, guard-test pattern actively maintained); and scripts read secrets from env with no hardcoded credentials found.

## Deliberately not re-proposed

- **June item 10 (push notifications + message inbox):** still open, still strategic, unchanged; it stays on the roadmap as its own tranche per the June doc.
- **The group-centric work item:** already scheduled as the next feature item; findings here that touch it (ClassDetail row-tap flip, group-count efficiency) are noted in items 8 and 15 rather than re-planned.
- **Anything the WelaPLUS PRD already specifies.**
