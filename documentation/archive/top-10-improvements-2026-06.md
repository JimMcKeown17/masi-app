# Masi App — Top 10 Improvements Guide (2026-06)

**Date:** 2026-06-14
**Status:** Review complete. Ready to convert into an implementation plan.
**Companion source:** `/Users/jimmckeown/Development/zazi-izandi-app` (a fork of this app that has had ~6 weeks of field-tested design + workflow + reliability work since divergence).
**Related artifacts:** [`documentation/zazi-izandi-feature-port-prd-2026-go-live.md`](./zazi-izandi-feature-port-prd-2026-go-live.md), [`documentation/zazi-izandi-feature-port-roadmap.md`](./zazi-izandi-feature-port-roadmap.md), [`AGENTS.md`](../AGENTS.md), `zazi-izandi-app/documentation/sqlite-lock-storm-handoff-for-masi.md`.

---

## How this guide was produced

This is a synthesis of two parallel reviews, exactly as requested:

1. **Mining the companion app (`zazi-izandi-app`)** — what design, workflow, and infrastructure wins the fork field-tested after diverging from Masi, and which are portable back.
2. **A code review of Masi's own architecture** — sync-engine durability, layering, UI consistency, testing, and low-end-Android performance.

Method: an 8-agent fan-out review workflow across both repos (each agent owning one dimension and required to cite real `file:line` evidence in *both* codebases), followed by an adversarial verification pass and direct inline confirmation of every load-bearing claim against the current working tree. Findings that Masi already implements, or that the go-live PRD already covers, were filtered out as noise — except where the fork learned a *refinement* of a PRD item after building it (those are flagged **PRD refinement** below).

**Every claim below was verified against the live code on 2026-06-14**, not inferred from git history or docs.

A note on scope vs. the existing PRD: the go-live PRD (`zazi-izandi-feature-port-prd-2026-go-live.md`) already shipped the Sessions Today ring, the completion interstitial, the active-tab indicator, `SectionHeader`, the colour-semantics audit *scope*, and the additive schema columns. This guide deliberately does **not** re-propose those. It proposes the next tier: the reliability foundations the PRD assumed, the system-level design infrastructure the colour audit needs to be durable, and the field-learned refinements of features Masi has already built.

---

## Priority summary

| # | Improvement | Theme | Impact | Effort | Type |
|---|-------------|-------|--------|--------|------|
| 1 | Kill the SQLite lock-storm before the field hits it | Sync reliability | 🔴 High | M | New (handoff) |
| 2 | Make sync converge: cap backoff, guard records, scope dependencies | Sync reliability | 🔴 High | S–M | New |
| 3 | Build the design-token system (colour ramp, type scale, guard test) | Design system | 🔴 High | M | Foundation |
| 4 | Step-by-Step assessment capture + extracted capture spine | Workflow + arch | 🔴 High | M | New + foundation |
| 5 | Child Results workflow: row-tap to results, edit behind a pencil | Workflow | 🔴 High | M | New |
| 6 | Performance pass for low-end Android (queries, re-renders, lists) | Performance | 🔴 High | M | New |
| 7 | Close the motivation loop: onboarding + ring payoff + motion tiers | Workflow + design | 🟠 Med–High | S–M | PRD refinement |
| 8 | Test the field-critical paths that are currently uncovered | Testing | 🔴 High | M | New |
| 9 | Tidy the architecture seams (storage facade, time-tracking, dates) | Architecture | 🟠 Medium | M | Refactor |
| 10 | Head-office → field channel: push notifications + message inbox | Capability | 🟠 Med–High | L | New (future) |

Items 1–2 are reliability work that protects **field data integrity** and should land first. Items 3–4 are foundations that make everything after them cheaper. Item 10 is the one genuinely new strategic capability and is intentionally last (largest effort, future tranche).

---

## 1. Kill the SQLite "database is locked" storm before the field hits it

**Theme:** Sync reliability · **Impact:** High · **Effort:** M · **Verified:** ✅ confirmed in working tree

**The problem.** The companion app hit a hard `database is locked` failure in the field, root-caused it, fixed it, and wrote an explicit handoff doc addressed *to Masi* (`zazi-izandi-app/documentation/sqlite-lock-storm-handoff-for-masi.md`) warning that Masi is **more** exposed because it runs more assessment types, so its outbox backlogs are bigger. Masi has not hit it yet only because of an incidental mitigation.

Confirmed mechanics in the current tree:
- `withTransaction` → `db.withExclusiveTransactionAsync(task)` (`src/db/client.js:50-58`). In the installed `expo-sqlite`, that opens a **brand-new native connection per transaction**. WAL allows exactly one writer.
- The outbox finalizes per-record: `processBatch` runs `Promise.all(inFlightRecords.map(finalizeSuccess))` (`src/services/offlineSync.js:668-675`), and the batch-failure fallback runs `Promise.all(outboxRecords.map(processRecord))` (`offlineSync.js:657,665`) — i.e. N concurrent throwaway connections fighting for the single writer lock.
- **Mitigation that is currently saving you:** the JS `databaseQueue` serializes all transactions (`client.js:38-48`). This downgrades the failure from a guaranteed crash into *connection churn + queue starvation* — a 500-record backlog becomes ~1000 sequential open→BEGIN→COMMIT→close cycles that starve user writes (e.g. "Finish Session") queued behind a finalize burst on low-end Android.
- **A latent correctness bug rides along:** `CONNECTION_PRAGMAS` (foreign_keys=ON, busy_timeout=5000) are applied only to the main connection in `configureDatabaseConnection` (`client.js:13-19`). Every transaction connection therefore runs with **FK enforcement OFF and busy_timeout 0** — so transactional writes can fail *instantly* with `SQLITE_BUSY` against the unqueued main-connection writes that exist (e.g. `fetchAndCacheSchools` → `storage.setSchools`), and local orphan rows the schema was designed to reject are silently accepted, only to fail terminally on the server with FK `23503`.
- No bulk helpers exist: `grep` for `markMany`/`chunkArray` in `src/` returns nothing.

**What's good already (don't lose it):** finalization is compare-and-swap by `(id, updated_at)` (`offlineSync.js:439-447`), so the fork's separate "edit-during-flight data loss" bug is already fixed in Masi. Domain saves (assessment+items, session+attendees+mastery) are correctly single-transaction.

**Recommendation.** Apply the handoff doc's root fix, adapted to Masi:
1. **Collapse N per-record finalize transactions into `ceil(N/200)` bulk transactions.** Port the fork's chunked `markManyInFlight` / `markManySucceeded` (chunked `UPDATE/DELETE ... WHERE id IN (...)` with a matched-count guard) — `zazi syncOutboxRepository.js:201-235`, `zazi storage.js:398-412`. **Preserve Masi's existing `(id, updated_at)` CAS semantics** when batching — do not regress to a plain delete-by-id.
2. **Fix the pragma leak.** Either replace `withExclusiveTransactionAsync` with a small custom helper that opens its connection, applies `CONNECTION_PRAGMAS`, then `BEGIN IMMEDIATE/COMMIT`; **or** (cleaner, given the queue already serializes) run `BEGIN IMMEDIATE/COMMIT` on the main pragma'd connection and drop the per-transaction connection entirely — this *also* eliminates the connection churn from step 1. Audit read paths first if you choose the shared-connection route. Add a real-SQLite test asserting `PRAGMA foreign_keys` and `busy_timeout` inside a `withTransaction` callback.
3. **Extend batched server upserts** beyond `assessment_items` to the other high-volume plain-upsert tables (`letter_mastery`, `session_attendees`, `sessions`, `time_entries`) — `BATCHABLE_UPSERT_TABLES` currently holds only `assessment_items` (`offlineSync.js:196`), so a group session marking 3 letters × 10 children = 41 sequential HTTP round trips through the concurrency-1 queue. Keep `IMMUTABLE_ASSIGNMENT_TABLES` out of batching (their insert path needs `ignoreDuplicates`). Update `documentation/rls-sync-contract-map.md` for the changed operation shape.

**Verify with** transaction-count regression tests (spy on `withTransaction`, assert `ceil(N/chunk)` not `2N`) on `better-sqlite3`, then a device pass under a large backlog per the handoff's §9.

> Architectural note: this is the classic *N+1 writes* anti-pattern, but with a vicious twist — in expo-sqlite each "1" spawns a new OS-level connection, so the cost isn't just round-trips, it's lock contention. The fix (bulk `IN (...)` statements) is the same shape you'd apply to any chatty ORM, which is why it generalises.

---

## 2. Make sync *converge*: cap the backoff, guard each record, scope dependencies

**Theme:** Sync reliability · **Impact:** High · **Effort:** S (backoff/guard) + M (dependency scope) · **Verified:** ✅ confirmed

Three independent convergence traps mean field data can sit unsynced for hours-to-days with no effective user remedy. All three are Masi-native (no fork prior art) and all three protect captured-but-unsynced session/assessment data.

**2a. Uncapped exponential backoff + no manual override.** Retry delay is `BASE_RETRY_DELAY(5000) * 3^retry_count` with **no cap** (`offlineSync.js:240-242`): 6 failures ≈ 1 h, 8 ≈ 9 h, 10 ≈ 3.4 days. `getReadyRecords` filters `next_retry_at <= now` (`syncOutboxRepository.js:69-78`), and the manual "Sync Now" path does **not** bypass it — so an EA on good Wi-Fi cannot force a backed-off record up. Worse, per-item `retryFailedItem` resets `status` and `next_retry_at` but **not** `retry_count` (`offlineSync.js:~800-820`), so one further failure jumps straight back to a multi-hour delay. On 2G/captive-portal connectivity (where NetInfo reports online but uploads fail) retry counts climb fast.
→ **Fix (S):** cap the delay (`Math.min(getRetryDelay(n), 15*60*1000)`); make `retryFailedItem` also reset `retry_count = 0`; pass a `bypassBackoff` flag through the explicit "Sync Now" path so a deliberate sync drains everything.

**2b. One thrown exception aborts the whole pass.** `syncAll`'s loop awaits `processRecord`/`processBatch` with **no try/catch** (`offlineSync.js:721-774`). `processRecord` only handles errors *returned* by Supabase; anything *thrown* (a `SQLITE_BUSY` from the busy_timeout-0 connections in item 1, a payload-shaping bug in `buildSyncPayload`) propagates out, is swallowed at the top of `OfflineContext`, skips every later record in `PUSH_ORDER`, and leaves the throwing record `in_flight` until the next pass. A deterministic throw on one record **poisons the queue** — every pass aborts at the same point, invisibly except via Export Logs.
→ **Fix (S):** wrap the per-record/per-batch body in try/catch; on throw, `finalizeRetriableFailure` that record (so it shows on SyncStatusScreen with `last_error`), record it, and **continue** the pass. Top-level `finally` always updates sync meta.

**2c. Table-level dependency skipping over-blocks.** When any record of a table fails, the table goes into `failedTables` and **all** subsequent records of dependent tables are skipped (`offlineSync.js:203-226, 724-740`). One child whose upload fails *retriably* blocks every assessment, letter-mastery, and membership row for **all** children that pass — and because early backoff steps are short, the bad record re-fails and re-blocks pass after pass.
→ **Fix (M):** make the skip record-scoped (track failed `(table, record_id)` pairs; skip a dependent only if *its* parent id failed — the parent ids are already inspected in `dependenciesForRecord`). Cheaper interim: only add to `failedTables` on *terminal* failures, letting network blips not block dependents (the server FK check is the real guard).

Each fix needs one regression test (e.g. outbox `[throwing record, healthy record]` → healthy still syncs, throwing ends `status='failed'` with `last_error`).

---

## 3. Build the design-token system the colour audit needs to be durable

**Theme:** Design system · **Impact:** High · **Effort:** M · **Verified:** ✅ confirmed (65 hex literals / 21 files / 81 `fontSize` / 0 type tokens)

**The problem.** Masi has a real token file (`src/constants/colors.js`) but its highest-traffic surfaces bypass it, and there's nowhere to put the things screens actually need:
- **No tint ramp.** The palette is flat (primary `#294A99`, no 50–900 scale). So tints are invented per file: `#E8F0FE` appears 3× in HomeScreen + again in `RankedBarRow`, while `App.js` uses a *different* light blue `#E3E9F5` for Paper's `primaryContainer`.
- **Off-brand hero gradient.** The four most-seen CTAs (Home header, Clock In, Record Session, Login) render a locally re-declared `GRADIENT = ['#0984E3', '#E72D4D']` (`HomeScreen.js:25`, duplicated in `LoginScreen.js`) — a blue that **isn't even the brand blue**, fading into the error red.
- **Semantic palettes copy-pasted.** `LETTER_STATE` (the mastered/taught colours EAs are trained on) is byte-identical in `LetterTrackerScreen.js:19-20` and `LetterTrackerBottomSheet.js:22-23` — edit one and the capture tracker silently desyncs from the assessment tracker. Three different "okay" yellows exist with three different meanings.
- **No typography tokens.** Screens mix Paper variants with **81 raw `fontSize` declarations** spanning 19 values down to 9–10px on data EAs read in the field (Home stat labels, sync status, insights band labels).
- **Accessibility gap.** 32 raw touchables across 18 files but only ~9 `accessibilityLabel`/`Role` occurrences; the Profile gear icon (`AppNavigator.js:104-106`) is an unlabeled ~24pt target with no `hitSlop` — real mis-taps for EAs on small screens, and it makes the render tests the PRD itself plans (which assert a11y labels) impossible to write.

The PRD's colour-semantics audit is scoped to *reskinning ported components and picking the stretch-arc colour* — but with no tint/type tokens to land decisions on, the audit's fixes will re-drift the next time a feature ships.

**Recommendation.** One foundational constants PR, then a bounded rollout — the fork did exactly this as its *first* redesign step ("the app immediately re-skins wholesale"):
1. **Add a primary tint scale** (`primary50…900` derived from `#294A99`), a success-surface trio (`successBg/Text/Border`), and an exported brand-family `GRADIENT` (not blue→red). Delete the two local gradient declarations. Prior art: `zazi colors.js:16-27, 89-92, 114`.
2. **Add a typography export** (`screenTitle / cardTitle / body / caption / statValue / sectionLabel` as size+weight+colour objects) with a 11–12px floor for anything informational. Seed from the fork's hierarchy-via-weight ramp (spec §2.2).
3. **Hoist the semantic palettes** (`letterStateColors`, `scoreBandColors`, `groupBadgePalette`) into constants and import everywhere; decide one canonical yellow / one letter-state orange while hoisting.
4. **Extract a `BrandGradientCTA`** consumed by Home clock-in, Record Session, and Login.
5. **One accessibility sweep** over the 18 touchable files: `accessibilityRole`/label on every raw touchable, `hitSlop` or 44pt minimums on icon-only ones.
6. **Lock it with a fail-closed guard test** — port the fork's `noLegacyHues.test.js` (a scan of every `src` `.js` for colour literals against an explicit ALLOWED set) and `colors.test.js` (pins the token file against forbidden legacy values). Run it red first to enumerate offenders, port them, then leave the guard in the suite so the audit can **never silently regress**. This is the cheap dependency-free `fs`/`path` test that makes the whole effort permanent.

> Per your "consistency changes get full rollout" preference, do all 18 a11y files and all stray-hex files, not a sample — the guard test enforces it mechanically thereafter.

---

## 4. Step-by-Step assessment capture + an extracted capture spine

**Theme:** Workflow + architecture · **Impact:** High · **Effort:** M · **Verified:** ✅ confirmed (no `capture_mode`/sequential anywhere in `src/`)

**The problem (workflow).** Masi's only capture UI for both `letter_egra` and `word_egra` is the tap-correct grid (`AssessmentChildSelectScreen` always routes to `LetterAssessmentScreen`; no mode routing exists). The grid lets a misheard-correct item silently cost nothing. The fork built a cursor-based ✓/✗ "Step-by-Step" mode specifically to test whether forcing an explicit decision per item reduces EA capture mistakes, A/B-stamped it via a `capture_mode` column, and after field testing **made sequential the default** — and you (Jim) explicitly requested this: *"set the default assessment mode as Step-by-Step."*

**The problem (architecture).** `LetterAssessmentScreen.js` (517 lines) has the timer, leave-guard, finish-once guard, and save-with-retry path all **inline in the screen**. The WelaPLUS battery work (~45% through its PRD, implementation next) needs **six** capture Patterns, each needing this same spine. Without extraction, Masi will either duplicate it six times or invent the abstraction mid-build.

**Recommendation.** Do these together — the spine extraction de-risks both:
1. **Port the fork's `useAssessmentSession` hook** as the host-side capture spine (timer, phase machine, leave-guard, `finishAndSave`), refactoring `LetterAssessmentScreen` onto it as the proving slice (per the TDD skill). It carries field-hardened details Masi's inline version lacks: the `allowLeaveRef` vs `hasFinishedRef` distinction so a *failed* save stays leave-guarded; `elapsedRef` avoiding the timer off-by-one; `navigation.replace` to avoid dead finished-screens in the back stack.
2. **Port `sequentialAssessmentReducer`** (a pure 26-line reducer driving cursor/decide/back-with-correction-count) + a `SequentialAssessmentScreen`.
3. **Add an orthogonal `capture_mode` column** (local migration + Supabase migration + `rls-sync-contract-map.md` update), a per-EA Profile toggle (org → user → device resolution), and default to `SEQUENTIAL`.

Keep the 60s timer and letter/word sets identical so Masi can run its **own** grid-vs-sequential comparison on its EAs before hard-committing — capture quality compounds as more assessment types land.

---

## 5. Child Results workflow: row-tap opens results, edit moves behind a pencil

**Theme:** Workflow · **Impact:** High · **Effort:** M · **Verified:** ✅ confirmed

**The problem.** In `ClassDetailScreen`, the child row's big tap target opens `EditChild` (`:89`) — the rare, setup-week action — while the everyday destinations (results + letter tracker) hide behind **two small 30px icons** per row (`:145-161`). The `ChildAssessmentSummaryScreen` then *stubs* the letter tracker as yet another navigation card (`:139-146`) instead of embedding it, so checking a child's results + mastery is 2–3 taps across 2–3 screens. The fork hit exactly this in field use and shipped two rounds: it merged summary + tracker into one `ChildResultsScreen` with an embedded `LetterMasteryPanel`, then flipped the row tap to Child Results with Edit behind a pencil icon ("frequency-of-use flip approved by Jim").

**A compounding structural issue.** Masi registers `ClassDetail` on the **root stack above `MainTabs`** (`AppNavigator.js:193-195`), so the bottom tab bar is **hidden** on what — for auto-routed single-class EAs — is effectively their main working screen. From there an EA can't jump to Sessions/Assessments without finding the back affordance. (This also makes the PRD's planned active-tab indicator dot worthless on that screen.)

**Recommendation.**
1. **Extract a `LetterMasteryPanel`** from `LetterTrackerScreen` (one source of truth for the mastery grid + taught-record write path) and embed it in a renamed `ChildResultsScreen`; keep a thin `LetterTracker` wrapper for the Assessments-tab flow.
2. **Flip the ClassDetail row tap** to `ChildResults`; demote `EditChild` behind a 24px pencil `IconButton` with a full-name a11y label.
3. **Nest `ClassDetail` (and the child CRUD screens) inside a Children-tab stack** so the tab bar stays visible (mirror the fork's `ChildrenStackNavigator`), retargeting cross-screen `navigate('ClassDetail')` callers.
4. **Related, fold in if cheap:** show the *last session's letters* + a "View session history" bottom sheet inside the new-session flow (`LiteracySessionForm` currently asks the EA to pick "Letters Focused On" completely blind) — this supports continuity of instruction, the EA's core pedagogical decision at session start.

> The nav change isn't unit-testable; device-verify that tapping My Children keeps the tab bar and back-from-ClassDetail doesn't bounce.

---

## 6. Performance pass for low-end Android field devices

**Theme:** Performance · **Impact:** High · **Effort:** M · **Verified:** ✅ confirmed (0 `React.memo` in `src/`; 30s interval; per-row hydration)

EA hardware skews to 1–2GB Android Go-class devices. Masi's biggest costs are **data-shaped and render-shaped**, and they grow through the school year:

**6a. N+1 hydration + unbounded full-table loads on every focus.** `sessionsRepository.getSessions` does `select * from sessions` then **one awaited `session_attendees` query per session** (`mapSession`, `sessionsRepository.js:71-74`); `assessmentsRepository` does the same per assessment. `HomeScreen`'s `useFocusEffect` loads **all** time entries + sessions + assessments just to compute month/week counts — and the PRD plans to redirect to Home after every completion, so this fires after every capture. `SessionHistoryScreen` hydrates every session ever, then filters to 30 days *in JS*. `AssessmentChildSelectScreen` computes `attemptCount` with a filter-inside-a-loop (O(n²)).
→ **Fix:** batch child hydration with a single `WHERE session_id IN (...)` join; add aggregate repository methods (`COUNT`/`GROUP BY`) so Home/ChildrenList never hydrate full rows; push the 30-day cutoff into the SQL `WHERE`. Masi's normalized schema makes this natural.

**6b. App-wide re-render every 30 seconds.** `OfflineContext` polls `getSyncStatus` every 30s and unconditionally `setSyncStatus(freshObject)` (`OfflineContext.js:196-204, 40-44`); its provider `value` is an inline object (`:206-215`); `OfflineProvider` wraps the whole app; and `ChildrenContext`, `ClassesContext`, `LookupsContext`, `AuthContext` **all** build values as inline literals without `useMemo`/`useCallback`. Result: every 30s tick reconciles every consumer of every context — and `React.memo` is used **zero times**, so list rows re-render too.
→ **Fix:** `useMemo` each provider value + `useCallback` the API functions (fork prior art exists); and **bail the 30s poll** when counts are unchanged (skip `setSyncStatus`) — Masi can go one better than the fork here and eliminate the idle re-render entirely.

**6c. Full re-pull + per-row writes after every sync.** `ChildrenContext` re-runs `loadPreloadedChildData` whenever `isSyncing` flips true→false (`:71-77`); background sync runs after every write (1s debounce), so after each capture the app re-downloads the EA's full children/classes/groups dataset (no delta filter) and writes every row back **one transaction at a time**.
→ **Fix:** decouple the refresh from upload completion (only re-pull on sign-in / pull-to-refresh / long interval, or via an `updated_at` watermark); batch local writes into one transaction.

**6d. Memoized list rows + virtualized history.** Extract `React.memo` row components with stable props; hoist per-row lookups (`childId→group`, `classId→counts`) into `useMemo`'d Maps; convert `TimeEntriesListScreen` (which renders **all** history as Cards in a `ScrollView`) to a `SectionList` with a bounded query.

> Port the fork's device-tier framework here too (see item 7) — it's the gate that keeps the planned animations off these devices.

---

## 7. Close the motivation loop: onboarding, ring payoff, motion tiers

**Theme:** Workflow + design · **Impact:** Medium–High · **Effort:** S–M · **Verified:** ✅ confirmed · **PRD refinement**

The PRD already shipped the Sessions Today ring and the completion interstitial. The fork built those same features, then **field-learned three refinements** Masi hasn't applied:

**7a. Year-start onboarding (acute for go-live).** `HomeScreen` has **no zero-class branch** — a freshly onboarded EA sees the stats header and a "Record Session" CTA that dead-ends in a session form with no children. The only Create-Class path is buried in My Children. This is acute: the 2026 go-live is onto a fresh backend with **no field users**, so on day one *every* EA is the zero-class EA. → Add a `classesLoaded && classes.length === 0` "Create a Class" hero (port the fork's `classesLoaded` contract so a not-yet-loaded `[]` can't flash the onboarding state — the fork's review caught stale-user-flag reuse here).

**7b. The ring payoff.** `SessionCompleteScreen`'s Done currently does `navigation.goBack()` (`:46`). You asked for the dopamine of *returning to Home and watching the ring fill*. → Make Done `popToTop` + navigate Home; pass a `fillFrom` so only the newest slice animates on return.

**7c. Staged ring colours.** Masi's `SessionsTodayRing` maps states to blue/green/yellow/grey inside the component. When "in progress" is the same brand colour as normal UI, you lose the payoff of it turning green. The fork field-tested through 3 device passes to: **neutral grey → slate (under half) → brand (over half) → success green only at goal**, retiring yellow ("yellow reads warning"). → Move the colour mapping out of the component into a shared `getSessionRingState` helper (so Home ring, completion ring, and week pips stage identically) and define `ring*` tokens in `colors.js`.

**7d. Motion must be tier-gated.** Masi has essentially **no `Animated` usage today**, so porting the ring/glint/interstitial animations as-designed would introduce the first JS-thread animation load with no scaling. → Port the fork's `deviceTier.js` + `useDeviceTier.js` (pure, unit-tested: iOS→high; <1.5GB Android→static; Reduce Motion always wins) **before** building the PRD animations, and gate all SVG/non-native-driver motion on `tier === 'high'`. Adopt the fork's motion-grammar lessons as design rules: no infinite loops without a rest cadence (a looping comet was misread as a *loading spinner* by field testers), `isInteraction:false` on loop timings, AppState re-kick for loops, keyed SVG nodes when flipping dash variants.

---

## 8. Test the field-critical paths that are currently uncovered

**Theme:** Testing · **Impact:** High · **Effort:** M · **Verified:** ✅ confirmed (no SERVER_COLUMNS test; `timeEntries` absent from integration config)

Masi's suite is genuinely strong at the repository/outbox layer, but **coverage is inverted relative to field risk**: the highest-traffic screens have zero render tests while secondary CRUD screens are well covered, and the most-documented production failure class has no automated guard.

1. **Schema-drift contract test (S, do first).** Client/server column drift causing silent `PGRST204` is the repo's most-documented failure class (per AGENTS.md), yet nothing pins `SERVER_COLUMNS` (`offlineSync.js:56`) / `PUSH_ORDER` to the SQL in `supabase/migrations/`. The migration-file-parsing pattern already exists (`__tests__/sessionsForwardPrepSupabaseMigration.test.js:12`). → Add a Jest suite that parses the migrations and asserts every `SERVER_COLUMNS` entry exists server-side, every `PUSH_ORDER` table has columns + appears in the contract map. This turns a field-only failure into a CI failure.
2. **Render coverage on the screens the PRD port will rewrite (M).** `HomeScreen` (637), `LiteracySessionForm` (686), `TimeTrackingScreen`, `SyncStatusScreen`, `ClassDetailScreen` have **zero** render tests — and the go-live work modifies exactly these. Characterize them *before* the refactor, using the existing RTL convention (`SessionCompleteScreen.test.js`). Prioritize Home + session form.
3. **Clock-in vertical integration (S).** `useTimeTracking.plan5.test.js` mocks **both** the repository and the storage facade, and `jest.integration.config.js` omits `timeEntriesRepository` — yet `time_entries` is first in `PUSH_ORDER` and clock-in gates session capture. → Add the repository to the integration tier + one provider-backed test through the real SQLite path.
4. **RLS upsert-visibility staging probe (M).** The upsert-visibility contract is verified only by one-off manual probes; any "simplification" of the `multiple_permissive_policies` warnings would silently break it. → Add an opt-in staging tier (guarded by the project-ref check like `scripts/sqlite-staging.cjs`) that probes the four documented visibility rules against the wipeable `masi-app-sqlite` backend.
5. **Device-faithful test engine (M).** Port the fork's `expoSQLiteRealEngine.js` (per-name file registry surviving close+reopen, sidecar-aware delete, void transactions — "the engine must not be more generous than the device") so force-stop/reopen-with-pending-outbox becomes a repeatable test instead of a manual emulator pass.

---

## 9. Tidy the architecture seams that every feature pays for

**Theme:** Architecture · **Impact:** Medium · **Effort:** M · **Verified:** ✅ confirmed inline

**9a. The legacy storage facade is a dual API surface.** `src/utils/storage.js` is a 648-line facade with functions literally named `normalizeChildForLegacyFacade`, `mergeFacadeRecord`, plus a `storage_payload` side-channel — it preserves the old AsyncStorage-era API shape over the SQLite repositories. The four context providers (the app's main data layer) still route domain reads/writes **through it**, while ~20 screens/services import repositories **directly**. Every new feature must choose which of two APIs to use, and the facade reconstructs legacy shapes (e.g. sessions with embedded `children_ids`) that the normalized schema then re-flattens. → Pick one direction (repositories are the forward path) and migrate the contexts off the facade incrementally, deleting the legacy reconstruction as each consumer moves. This is the single highest-leverage layering cleanup — it removes the "which API?" tax from every item in this guide.

**9b. Promote time tracking to context.** `useTimeTracking` holds clock-in state per call site and is instantiated independently by `HomeScreen` and `TimeTrackingScreen` — two copies of the truth, duplicate 1Hz intervals, state that can disagree until refetch. This matters more now the soft clock-in warning depends on accurate signed-in state. → Port the fork's `TimeTrackingContext` (with the `ElapsedTimeContext` render-isolation trick so only the header timer re-renders per tick, and a compat shim so call sites don't change) and its `SnackbarContext`/`RootSnackbarHost` (14 screens currently each render their own `<Snackbar>`).

**9c. Centralize local-day date semantics.** Local-day logic is correct at the main producers but duplicated inline 3× with no shared utility, and two UTC-slice stragglers remain (`TimeEntriesListScreen` `toISOString()` mislabels the day for entries between 00:00–02:00 SAST; `storage.js` fallbacks). → Port the fork's `utils/localDate.js` and point everything at it before WelaPLUS adds new date-stamped tables.

---

## 10. Head-office → field channel: push notifications + message inbox

**Theme:** New capability · **Impact:** Medium–High · **Effort:** L · **Verified:** ✅ confirmed (no `expo-notifications`/`expo-device` in `package.json`)

**The problem.** Masi has **zero** push/messaging infrastructure — head office has no channel to reach EAs in the field (announcements, lost-device messaging, assessment-window reminders). The go-live PRD defers this (roadmap 8.1).

**The opportunity.** The fork has already built the **entire mobile half**: token registration via a Supabase RPC with Android channel setup, an **offline-capable** `notification_inbox_items` SQLite table + repository + sync, a `NotificationsContext` with tap-to-deep-link handling, a `navigationRef` + pending-navigation flush wired into `NavigationContainer`, and inbox UI. → When this tranche is picked up, **port the fork's mobile stack wholesale** rather than designing fresh. Masi needs its own sender backend (a Supabase-side or FastAPI sender — note your standing preference for a Python backend over Edge Functions). The `navigationRef` + pending-navigation piece is portable on its own at near-zero cost and is generally useful for any navigate-on-event need.

This is last because it's the largest effort and a genuinely new capability rather than a fix — but it's the highest-ceiling *strategic* item, so it belongs on the roadmap explicitly.

---

## Suggested sequencing

Each item is independently shippable; this order front-loads field-data safety and the foundations that make later items cheaper.

1. **Reliability first (items 1, 2)** — protect captured field data before adding load. These are the only items where *not* acting risks data loss.
2. **Foundations (items 3, 4)** — the design-token system and the capture spine unblock the colour audit, the WelaPLUS battery, and every later UI item.
3. **High-impact workflow (items 5, 7)** — Child Results + the motivation loop refinements; both build on item 3's tokens and item 4's patterns.
4. **Performance + tests (items 6, 8)** — interleave; the schema-drift and render tests (8) should ideally land *before* the screen refactors in 5–7, and the perf work (6) pairs with the context/memoization changes those refactors touch.
5. **Architecture cleanup (item 9)** — best done continuously alongside 4–8 (each feature that touches a context is a chance to move it off the facade), not as a big-bang.
6. **Future capability (item 10)** — schedule as its own tranche once the above stabilize.

## What was deliberately excluded

- Anything the go-live PRD already ships (Sessions Today ring, completion interstitial, `SectionHeader`, active-tab dot, monthly-stats footnote, additive schema columns, seed script) — only their *field-learned refinements* appear here (item 7).
- AsyncStorage-era dead code: **not a problem** — only `logger.js` and `supabaseClient.js` still touch AsyncStorage, consistent with the locked cutover decision. (One hypothesis tested and refuted.)
- An E2E (Maestro/Detox) smoke suite for the offline-first loop — real value but L effort and lower priority than items 1–9; revisit after the test foundations in item 8 land.
- A shared `EmptyState` component (low/S) — folded into item 3's rollout.
