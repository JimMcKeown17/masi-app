# Masi App Deep Audit: Offline Sync + Low-End Devices (2026-07-12)

**Date:** 2026-07-12
**Goal:** the app must "just work" for 95% of users. Every user must be able to login/logout, run sessions, and run assessments without lag or errors, on low-end Android devices with intermittent connectivity. This audit deliberately does not chase exotic edge cases.
**Method:** four parallel Codex (gpt-5.6-sol, high reasoning effort) read-only auditors, each owning one dimension: (1) sync push engine, (2) pull side + React contexts, (3) assessment capture + screen performance, (4) app shell + diagnostics + auth lifecycle. Each was required to verify documentation claims against today's tree with file:line evidence and to separate "verified fixed" from open findings. Claude (Fable) orchestrated, then independently re-verified every load-bearing claim in the top-ranked findings against the code before writing this document. No tests were run and no files were modified during the audit.
**Relationship to prior work:** builds on `documentation/improvements-2026-07.md` (the ranked 16-item review) and its roadmap. Since that review, 79 commits landed: Phase 1 (safety net, PR #40), Phase 2 (data integrity, PR #41), sync auth hardening (PR #50), classifyError hardening (PR #51), pull-clobber guard (PR #49), collision proofing (PRs #52/#53), the assessment render-perf pack, and the sync-status trust UX. This audit confirmed all of those in code, found that Phase 3 (the amplifier) has not landed, and surfaced eight findings the July 2 review did not have.

---

## Verdict

**No P0 was found.** The capture spine is sound: writes are local-first and atomic (domain rows + outbox in one `BEGIN IMMEDIATE` transaction), the auth gate stops sessionless sync, crash recovery converges, the pull-clobber guard covers all eight guarded tables, and the render-perf pack genuinely fixed the timed-tap hot path (zero per-tap SQLite work, isolated timers). A field user's session or assessment, once saved, is safe locally and will not be silently overwritten.

The open risk is concentrated in four clusters:

1. **The idle-churn amplifier** (unimplemented Phase 3): the single biggest lag source on low-end devices, and it is compound.
2. **Data stranding and staleness at the edges**: logout with pending rows, server-side removals that resurrect offline, deterministic errors that loop forever.
3. **Read-path query storms** that grow linearly all school year.
4. **Two hangs with no timeout**: GPS on clock-in/out, and reference-data pull on cold start.

## Severity rubric

- **P0 (9-10):** breaks login/logout, session capture, or assessment capture, or causes data loss/corruption, under common field conditions.
- **P1 (7-8):** core flow badly degraded (stuck sync needing support, visible lag, silent staleness, indefinite hang) under common conditions.
- **P2 (5-6):** realistic but less common failure; erodes trust or requires occasional support.
- **P3 (1-4):** polish, latent risk, rare edge case.

Confidence: **Confirmed** = traced in code (top findings re-verified independently by the orchestrator). **Suspected** = plausible, not fully provable read-only.

---

## Ranked findings

| # | Finding | Sev | Score | Likelihood | Confidence | Effort |
|---|---------|-----|-------|------------|------------|--------|
| 0 | Verify production EAS env vars: config defaults to the LEGACY backend | gate | n/a | unknown | Confirmed (default) | 15 min check |
| 1 | The 30s amplifier: backed-off rows drive no-op sync passes, full re-pulls, and an app-wide re-render cascade | P1 | 8 | Common | Confirmed (2 auditors) | S-M |
| 2 | Logout strands the previous user's outbox rows under the next user's session | P1 | 8 | Occasional | Confirmed | M |
| 3 | Read-path N+1 query storms (~365 queries per Home focus at year-end) | P1 | 8 | Common | Confirmed | M |
| 4 | Server-side removals are never reconciled into SQLite, so removed entities resurrect offline | P1 | 7 | Occasional | Confirmed | M |
| 5 | The "10s GPS timeout" does not exist: clock-in and clock-out can hang indefinitely | P1 | 7 | Common | Confirmed | S |
| 6 | Deterministic server errors retry forever, silently, while "Last Synced" advances | P1 | 7 | Occasional | Confirmed | S-M |
| 7 | Cold start on a stalled network holds the login spinner with no upper bound | P1 | 7 | Occasional | Confirmed | S |
| 8 | Session form renders the whole roster unvirtualized and re-renders it on every keystroke | P1 | 7 | Common (large rosters) | Confirmed | M |
| 9 | No domain pull on foreground or reconnect: roster changes invisible until a local write | P2 | 6 | Occasional | Confirmed | S-M |
| 10 | Assessment attempt number races the history preload and can stamp the wrong attempt | P2 | 6 | Occasional | Confirmed | S |
| 11 | Force-quit or process death loses the entire in-progress assessment | P2 | 6 | Occasional | Confirmed | M |
| 12 | Logger destroys Error payloads and can itself crash on circular values | P2 | 6 | Occasional | Confirmed | S |
| 13 | SQLite bootstrap failure has no recovery or diagnostics surface | P2 | 6 | Rare | Confirmed | M |
| 14 | Child hard-delete is not idempotent and a failed delete resurrects the child | P2 | 5 | Rare | Confirmed | S |
| 15 | Completion paths run ~125 sequential statements and navigation waits on sync-status work | P2 | 5 | Occasional | Confirmed | M |
| 16 | A failed large batch fans out into up to 1,000 per-record attempts in one pass | P2 | 5 | Occasional | Confirmed | M |
| 17 | One failed parent row skips every dependent table for the whole pass (table-scoped) | P2 | 5 | Occasional | Confirmed | M |
| 18 | UTC-day bugs in time-entry grouping and Home "days worked" | P2 | 5 | Rare | Confirmed | S |
| 19 | Storage facade split-transaction races can show stale data over a fresh local edit | P2 | 5 | Occasional | Confirmed | M |
| 20 | One failed preload scope blocks unrelated empty scopes from clearing stale state | P3 | 4 | Occasional | Confirmed | S |
| 21 | No guard against OTA rollback onto a newer local schema | P3 | 4 | Rare | Suspected | M |

Roadmap mapping: #1 = items 6a/6b/6c (Phase 3 + part of Phase 5), #3 = item 8 (Phase 4), #5 + #12 = item 13 (Phase 6), #6 + #16 + #17 = item 11 (Phase 5), #18 = item 10 (Phase 4), #19 = item 9 (Phase 5). Findings #2, #4, #7, #9, #10, #11, #13, #14, #20, #21 are new since the July 2 review.

---

## 0. Gate: verify the production EAS environment (15 minutes, do first)

`eas.json` (production profile, lines 30-36) specifies no Supabase variables in-repo, and `config/supabaseProjectConfig.js:34-60` defaults to the **legacy** backend (`jcqrlwetutnpuchjoyyd`) when no target is provided. If the Expo dashboard environment variables are not set for the production profile, a production build silently targets the legacy backend. This is probably already configured (preview builds have worked), but it is a two-line check against a catastrophic-if-wrong default. Consider making the target mandatory in production builds so a missing env fails the build instead of falling back.

Two more verification items from the audit that cannot be confirmed from the tree:

- **Live schema probe:** unique indexes, RPC definitions, and RLS policies were verified against `supabase/migrations/` only. Given this repo's documented history of schema drift, run a read-only probe against `segygjzpujphwvrubusm` (via `npm run sqlite:staging:query`) to confirm the ~10 unique indexes and `delete_child_if_no_history` match the migrations.
- **PostgREST max-rows:** the child-data pull has no pagination; confirm the hosted row limit before assuming large rosters return complete.

---

## 1. The 30s amplifier (P1, score 8, effort S-M) — items 6a/6b/6c, Phase 3 unimplemented

The most impactful fix in this document, confirmed independently by both the push-side and pull-side auditors. Git history confirms the Phase 3 plan (`docs/superpowers/plans/2026-07-04-improvements-phase3-amplifier.md`) never landed: the file is untracked, no commit touches it, and none of its planned code exists.

Four links compound:

- **Trigger:** `OfflineContext.js:48-57` auto-triggers sync whenever `unsyncedCount > 0`; `syncOutboxRepository.js:243-259` counts backed-off `failed` rows in `unsyncedCount` (a `backedOffCount` exists but no `readyCount`); `OfflineContext.js:241-249` repeats this every 30 seconds.
- **No-op pass cost:** even with zero ready records the pass runs the group-ownership repair writer transaction (`offlineSync.js:1227`) and writes sync metadata (`:1320`), and flips `isSyncing` true then false (`OfflineContext.js:93-108`).
- **Full re-pull:** every `isSyncing` true-to-false transition makes ChildrenContext and ClassesContext reload everything (`ChildrenContext.js:59-66`, `ClassesContext.js:55-62`). The pull has no watermark (`preloadedChildData.js:48-149`) and persists row-by-row through the facade, where each save is two writer transactions (`storage.js:225-235`). Pull-to-refresh on the Children screen then duplicates both loads (`ChildrenListScreen.js:97-105`).
- **Re-render cascade:** `setSyncStatus` installs a fresh object even when unchanged (`OfflineContext.js:48-54`), the provider value is an inline literal (`:255-266`), and all four dependent providers (TimeTracking, Lookups, Children, Classes) republish inline values. Every idle 30s tick re-renders every mounted consumer: Home, lists, capture screens, sync indicators. `React.memo` count in `src/` for these paths: effectively zero. Note the July review said "five provider values"; Phase 2 added TimeTrackingContext, so the memoization pass must include it.

**Failure scenario:** one upload fails on flaky connectivity and enters its 15-minute backoff. For those 15 minutes, a low-end phone starts a pointless writer-transaction sync pass every 30 seconds, roughly 30 times, each flipping `isSyncing` and re-downloading and re-writing the entire child/class dataset, while every mounted screen re-renders. This is the single largest source of "the app feels slow" and battery drain, and it runs all day.

**Fix:** implement the existing Phase 3 plan. (a) Return `readyCount` from `getSyncStatus` and auto-trigger only when a row is actually eligible (`next_retry_at <= now`); (b) equality-gate `setSyncStatus`; (c) memoize all five provider values and `useCallback` their APIs; stop re-subscribing NetInfo/AppState listeners on count changes; (d) decouple the re-pull from upload completion (watermark or sign-in/interval/pull-to-refresh only) and batch row persistence into one transaction per table; remove the duplicate explicit reload in `ChildrenListScreen`. Links a-c are one small PR; link d can fold into the facade work (item 9) as the roadmap already planned.

## 2. Logout strands the previous user's outbox rows (P1, score 8, effort M) — NEW

`sync_outbox` rows carry no owner. Sign-out clears auth and profile but never inspects, flushes, or partitions the outbox (`AuthContext.js:243-262`). Readiness selection is global with no user predicate (`syncOutboxRepository.js:71-86`), and `syncAll` only checks that *some* session exists (`offlineSync.js:1144-1169`). When the next EA signs in on the same device, their session pushes the previous EA's pending rows. RLS rejects the root records with `42501`; under a live session these get the `42501-authenticated` marker and become terminal (`offlineSync.js:999-1010`), and authenticated-denial terminals are deliberately excluded from auto-healing on auth restore (`:1346-1357`).

**Failure scenario:** EA A records sessions offline, signs out, hands the device over (staff turnover, device reassignment, a shared spare phone). EA B signs in with connectivity. A's rows are pushed under B's session, rejected, and terminalized. A's data is not deleted but is stranded until support intervenes with a forced sync under A's account.

**Fix:** add an `owner_user_id` column to `sync_outbox` stamped at enqueue, and restrict `getReadyRecords` (and status counts) to the current authenticated user. Other users' rows stay untouched and resume when they sign back in. Interim mitigation while that lands: warn on logout when pending rows exist. Also decide the product policy question this raises: how common is device rotation between EAs? If it is expected, this finding is closer to score 9.

## 3. Read-path N+1 query storms (P1, score 8, effort M) — item 8, Phase 4

Confirmed unchanged in shape from the July review, now quantified:

- `assessmentsRepository.js:110-118` hydrates each assessment with a per-row summary query; `sessionsRepository.js:105-119` does one attendee query per session with no date bound; `domainRepositoryUtils.js:147-158` adds a programme lookup per repository call.
- Opening Assessments/My Children/child selection with 60 children and one assessment each: ~62 queries; with letter + word history: ~122. Home focus at year-end (60 assessments, 300 sessions): **~365 sequential SQLite queries**, plus history screens loading everything and cutting off 30 days in JavaScript (`AssessmentHistoryScreen.js:34-45`, `SessionHistoryScreen.js:37-51`).
- `literacySessionPersistence.js:44-48` still prefetches the entire user/programme mastery table inside the writer transaction and linear-scans it per (child, letter).

**Failure scenario:** a mid-year EA taps Home or Assessments and watches a spinner while hundreds of sequential native calls run; finding #1 currently makes this re-fire after every capture and every no-op sync.

**Fix:** per the Phase 4 plan: batched `WHERE ... IN (...)` hydration, aggregate `COUNT`/`GROUP BY` repository methods for stats, SQL-side date cutoffs, targeted mastery lookups, and query-count regression tests (2-3 queries per screen). The Phase 1 covering indexes are already in place to make this fast.

## 4. Server removals resurrect offline (P1, score 7, effort M) — NEW

`mergeServerRows.js:25-42` drops a synced cached row absent from the server response from **React state only**. Nothing archives or removes the row in SQLite (`ChildrenContext.js:106-126` persists only returned rows), and the pull queries request only active relationship rows (`preloadedChildData.js:82-123`), so an archived assignment/membership arrives as an *absence*, not a tombstone. `rls-sync-contract-map.md:116` documents the mechanism but not the user-facing consequence.

**Failure scenario:** Head Office ends an EA's assignment to a child, archives a class, or removes a group membership. While online, the item disappears from the list. The app is later killed and reopened offline: SQLite still holds the row as active, so the child/class/group reappears in the roster and the EA can keep recording against it.

**Fix:** after a complete, error-free scoped pull, reconcile server IDs against SQLite in one transaction: archive/end rows that are locally `synced` but absent from the acknowledged scope, never touching `pending`/`failed` rows. Do not reconcile from partial or errored responses (see finding #20 for the per-scope error plumbing this needs).

## 5. The GPS timeout does not exist (P1, score 7, effort S) — item 13b, Phase 6

`locationService.js:97-101` passes `timeInterval: 10000` to `Location.getCurrentPositionAsync`; in expo-location this is the minimum interval between watch updates on Android, not a timeout. The promise can hang forever. Clock-in awaits it before writing the time entry (`TimeTrackingContext.js:111-135`), and clock-out does the same (`:157-190`). Additionally `requestLocationPermission` (`locationService.js:22-47`) re-prompts recursively without checking `canAskAgain`, so a permanently denied permission produces an alert loop, and a permission error currently aborts clock-in entirely.

Important scope correction to the July review: session capture is **not** hard-blocked; `useSessionLaunchGuard.js:46-64` offers "Continue Anyway". The defect blocks time tracking, which is payroll-adjacent.

**Failure scenario:** an EA inside a concrete school building taps Clock In; the button spins forever. On clock-out the shift stays open until the 10-hour auto-clock-out fires, corrupting hours worked.

**Fix:** `Promise.race` the location request against a real 10s timer; on timeout proceed with null coordinates and a visible "recorded without location" note. Check `canAskAgain` and deep-link to settings instead of looping. Never let location failure block the time entry write.

## 6. Deterministic server errors retry forever, silently (P1, score 7, effort S-M) — item 11a, Phase 5

`classifyError` (`offlineSync.js:390-428`) terminalizes only assignment-table `23514`, `23505`, evidence-free `23503`/`42501`, and local sentinels. `PGRST204` (this repo's most-documented failure class), `42703`, `22P02`, and `23502` fall through to retriable and loop at the 15-minute cap indefinitely, with no retry-count cap (`:381`, `:772`). Two aggravators: retriable failures do not make the pass unsuccessful (`:1195`), so `lastSuccessfulSyncTime` keeps advancing (`:1323`), and the SyncStatusScreen itemizes only terminal rows (`SyncStatusScreen.js:146`), so a looping row shows as a calm "waiting to sync" count forever. `rls-sync-contract-map.md:31` claims errors "never loop forever"; the code contradicts this.

**Failure scenario:** with multiple app versions in the wild (the deployment reality documented in AGENTS.md), an older client writes a column the server dropped, or a newer client writes one the server does not have yet. `PGRST204` fires on every attempt. The record never syncs, the EA sees "waiting" language, and Last Synced stays fresh. Head Office quietly never receives that session.

**Fix:** the roadmap's 11a policy decision, made once and documented in the contract map: give the deterministic class (`PGRST204`, `42703`, `22P02`, `23502`, non-assignment `23514`) a bounded retry budget (e.g. 5 attempts or 24 hours), then move to needs-attention where the trust UX already knows how to display it and force-sync already knows how to resurrect it. Keep codeless/network/5xx errors retriable forever as today.

## 7. Cold start on a stalled network can hold the spinner unbounded (P1, score 7, effort S) — NEW

The offline cold-start *restore decision* landed and works: a null `INITIAL_SESSION` consults persisted auth and restores instead of bouncing to login (`AuthContext.js:55-70`). But `hydrateAuthenticatedUser` awaits `pullReferenceData` (up to seven sequential Supabase requests, `offlineSync.js:1465-1493`) before `setUser(authUser)` runs in its `finally` (`AuthContext.js:153-171`), the request queue has no timeout (`supabaseRequestQueue.js`), and the navigator shows only a spinner while auth is loading (`AppNavigator.js:368-377`). `__tests__/AuthContext.test.js:111-139` pins user-stays-null-while-pull-pending as expected behavior.

Orchestrator verification nuance: the pull is inside try/catch, so **clean offline** (airplane mode, no route) rejects fast and startup proceeds with cached data. The hazard is the **stalled socket**: weak signal where TCP retries for minutes, or a captive portal that blackholes. That is a common network condition at field sites.

**Failure scenario:** EA kills the app at school, reopens it with one bar of signal. The persisted session restores, then the first reference request stalls. The EA stares at the startup spinner although SQLite has everything needed to work offline.

**Fix:** publish the restored user and cached profile first, then refresh reference data in the background; or bound the startup pull with a short timeout (5-8s) falling back to cache. Update the pinned test to the new contract.

## 8. Session form roster is unvirtualized and re-renders on every keystroke (P1, score 7, effort M) — NEW

`ChildSelector.js:99-124` nests a `FlatList` with `scrollEnabled={false}` inside the form's outer `ScrollView` (`LiteracySessionForm.js:354-398`). With no bounded height, virtualization is defeated: the full roster is laid out. `renderItem` is inline, does a `classes.find(...)` per row, rows are unmemoized, and the comment field updates parent state per keystroke (`:439-445`), re-rendering the whole form and roster each time.

**Failure scenario:** an EA with a 60-child roster opens session capture on a low-end phone. Selecting children, choosing letters, and typing comments all feel delayed; taps appear dropped. This is the highest-traffic capture flow in the app.

**Fix:** memoized child row component with scalar props, stable callbacks, a class-name Map instead of per-row `find`, and either a bounded genuinely-scrolling list for child selection or restructure the form as a `SectionList`. Same recipe that just worked for the letter grid (LetterTile).

## 9. No domain pull on foreground or reconnect (P2, score 6, effort S-M) — NEW

Domain pulls happen only on user publication and after a local sync completes (`ChildrenContext.js:46-66`, `ClassesContext.js:33-62`). Foreground and connectivity listeners only refresh outbox status and push local work (`OfflineContext.js:143-195`). An EA with no local unsynced work never pulls.

**Failure scenario:** Head Office fixes a roster in the morning; an EA who captured nothing that day reconnects and still sees the old roster until they write something, pull-to-refresh on Children, or sign out.

**Fix:** one debounced, single-flight domain pull on offline-to-online and on foreground past a staleness threshold (e.g. 15 minutes). Do this with or after finding #1's re-pull decoupling, not before (today it would amplify the churn).

## 10. Attempt number races the history preload (P2, score 6, effort S) — NEW

`AssessmentChildSelectScreen.js:31-53` loads assessment history asynchronously with no readiness gate, and `navigateToAssessment` stamps `attemptNumber: (assessmentMap[child.id]?.attemptCount || 0) + 1` (`:74-85`). `ChildResultsScreen.js:40-57` has the same shape. The preload is slow on exactly the devices where the race window is widest (finding #3), and attempt counting is O(A²) (`:40-48`).

**Failure scenario:** a child has three prior attempts. The EA taps the child before the preload resolves. The new assessment is saved as attempt 1. Taps and score survive; longitudinal attempt metadata is now wrong, and reporting that trusts `attempt_number` misreads progress.

**Fix:** resolve the attempt number at launch/save time with a targeted `COUNT(*) WHERE child_id = ? AND assessment_type = ?` instead of deriving authoritative write metadata from an optional screen preload.

## 11. Force-quit loses the in-progress assessment (P2, score 6, effort M) — known design decision, worth revisiting

Capture state lives only in React state/refs (`LetterAssessmentScreen.js:28-39`, `SequentialAssessmentScreen.js:19-21`); persistence begins at completion (`useAssessmentSession.js:127-157`). The AppState handler pauses the clock but cannot survive process death. The WelaPLUS briefing explicitly locks "no mid-Question resume, restart on force-quit."

**Failure scenario:** a phone call backgrounds the app mid-assessment; memory-constrained Android kills the process; the EA reopens to nothing. Today's loss window is one 60-second EGRA run, which is why this is P2 and the locked decision was reasonable. Future WelaPLUS Questions (untimed writing, comprehension) make the loss window much larger.

**Fix (when WelaPLUS capture work starts, not before):** a small local-only draft checkpoint at bounded intervals (per few decisions or on background), with Resume/Discard on re-entry. Do not add per-tap persistence; that would trade this finding for a worse hot-path one.

## 12. Logger destroys Error payloads and can crash on circular values (P2, score 6, effort S) — item 13a, Phase 6

`logger.js:63-68` serializes objects with bare `JSON.stringify`: an `Error`'s non-enumerable properties vanish, so `ErrorBoundary`'s `console.error('App crashed:', error, ...)` (`App.js:24-25`) exports as `App crashed: {}`. A circular argument throws synchronously inside the console interceptor, turning a log line into a crash. What is already sound: growth is capped (1,000 entries / 48h) and writes are batched, not synchronous.

**Fix:** serialize `Error` as name/message/stack; wrap stringify in try/catch with an `[unserializable]` fallback. One of the cheapest fixes in this list and it upgrades every future field diagnosis.

## 13. SQLite bootstrap failure has no recovery surface (P2, score 6, effort M) — NEW

Database open, PRAGMAs, and migrations share one initializer that rethrows on failure (`client.js:47-70`). Startup consumers each catch and log independently, so the shell opens with empty screens rather than a deliberate state. The only global error UI is the render boundary's "Try Again" (`App.js:17-47`) with no export or reset option, and Export Database itself requires a working database (`debugExport.js:29-55`).

**Failure scenario:** rare, but when it happens (corruption, a bad future migration) the EA sees an empty app or a generic crash screen, support gets nothing to work with, and the device needs hands-on rescue. For a fleet with no nearby IT, one deliberate recovery screen (retry, Share Logs, backend identity, explicit confirmed local reset) is cheap insurance.

**Fix:** one database-bootstrap gate above the providers with that recovery screen. Wire Export Logs (which does not need SQLite) into both it and the render error boundary.

## 14. Child hard-delete: not idempotent, and a failed delete resurrects (P2, score 5, effort S) — NEW

Two facets, one flow. (a) `delete_child_if_no_history` raises `42501` for an absent child (`supabase/migrations/20260521153217_masi_child_delete_guard.sql:61`), so a crash between server success and local finalization means the retry hits an already-deleted child and records a false authenticated-terminal "Needs Attention" (`offlineSync.js:649`, `:740`). (b) The local no-history delete removes the child entirely, leaving only the outbox row (`childrenRepository.js:535-562`); `mergeServerRows` tombstone suppression only consults unsynced *domain* rows (`mergeServerRows.js:33-40`), so if the RPC fails once, the next pull re-saves the server copy and the deleted child reappears until a retry lands.

**Fix:** make the RPC treat an absent target as success (idempotent delete), and have the pull path consult pending `hard_delete` outbox IDs when merging.

## 15. Completion-path latency (P2, score 5, effort M) — NEW

Saves are correctly atomic but chatty: a fully-attempted EGRA writes ~61 item rows plus outbox rows as sequential awaited statements inside the transaction (`assessmentsRepository.js:121-205`), roughly 125 statements; sessions do the same per attendee (`sessionsRepository.js:122-165`); `literacySessionPersistence.js:28-108` holds the writer transaction while scanning the full mastery table; and the session form awaits `refreshSyncStatus()` before navigating (`LiteracySessionForm.js:332-345`), which reads the entire outbox snapshot.

**Fix:** batch/prepare the repeated inserts, targeted mastery lookups instead of the prefetch, navigate on commit and refresh sync status after. Keep the transaction boundary exactly as is.

## 16. Failed large batch fans out to up to 1,000 per-record attempts (P2, score 5, effort M) — NEW

A pass loads up to 1,000 ready rows (`offlineSync.js:1237`) and batch formation has no size ceiling (`:1277`); any batch error falls back to per-record processing for the whole batch via `Promise.allSettled` (`:1066`, `:1101`). Requests are serialized by the queue, but every promise and its SQLite work stays alive through one long pass.

**Failure scenario:** a phone returns from weeks offline, the combined upsert times out, and the engine grinds through hundreds of per-record attempts in one pass: memory pressure and a very long-lived spinner on a low-end device, restarting after any background kill.

**Fix:** chunk batches and fallback groups to 50-100 rows, finalizing each chunk before starting the next.

## 17. Dependency skipping is table-scoped (P2, score 5, effort M) — item 11b, Phase 5

Failures are tracked as table names (`offlineSync.js:1183`, `:1204`); one retriably-failing child skips assessments, mastery, and memberships for **all** children that pass (`:1244`, `:1285`). Backoff keeps the bad row out of most passes, so this mostly costs throughput during exactly the short connectivity windows that matter.

**Fix:** track failed `(table, record_id)` pairs; the parent IDs are already resolved in `dependenciesForRecord`.

## 18. UTC-day bugs (P2, score 5, effort S) — item 10, Phase 4, scope corrected

Confirmed live: `TimeEntriesListScreen.js:63-70` groups by UTC date and `:149-155` computes "today" in UTC; `dashboardStats.js:25-29` passes UTC `sign_in_time` strings through `slice(0,10)` for "days worked" (`:56-68`). Failure window is 00:00-01:59 SAST; at month boundaries the day lands in the wrong month. Scope corrections from this audit: session dates are stored with local calendar components and are fine, and auto-clock-out is elapsed-time based and correct across midnight.

**Fix:** the planned `utils/localDate.js`, pointed at these two paths plus the duplicated formatters, with SAST-boundary tests.

## 19. Facade split-transaction races (P2, score 5, effort M) — item 9, Phase 5

Facade update paths write the `local_state` sidecar payload and the normalized row in separate transactions (`storage.js:248-253`, `:321-326`, `:397-402`), and reads let the sidecar payload win (`:137-151`). A concurrent pull persisting the same entity can interleave so context reads reconstruct stale server values over a fresh local edit until convergence. The data is safe (outbox has the edit); the display lies for a while.

**Fix:** already planned facade retirement (contexts to repositories, delete the sidecar). Until then, make the still-live paths write both in one transaction. Fold into finding #1's link-d work as the roadmap intended.

## 20. Per-scope preload errors block empty-scope clearing (P3, score 4, effort S) — NEW

`preloadedChildData.js:34-45` accumulates all scope failures into one array, and contexts apply empty results only when the whole array is empty (`ChildrenContext.js:11-13`). One failed membership query means a genuinely-empty groups result is ignored and stale groups stay visible. Also a prerequisite for finding #4's reconcile (which must be per-scope).

**Fix:** per-scope success/error state; apply empty results for scopes that succeeded.

## 21. OTA rollback schema guard (P3, score 4, effort M) — NEW, latent

`runtimeVersion: { policy: 'appVersion' }` (`app.config.js:61-66`) does not distinguish native builds sharing a marketing version, and `migrations.js:590-625` has no check for `user_version > CURRENT_SCHEMA_VERSION`, so an OTA rollback can put an older bundle on a newer database. Harmless today because all migrations are additive; becomes real the first time a migration changes behavior.

**Fix:** fail safe when the local schema is newer than the bundle understands (update-required screen), and either adopt a fingerprint runtime policy or enforce a version-bump rule for every native change.

---

## Verified healthy (do not re-litigate)

All four auditors were required to verify prior claims in code. Confirmed working as designed, with evidence in the underlying reports:

- **Push spine:** auth-gated sync with regression test; atomic domain-write + outbox enqueue everywhere checked (sessions, assessments, children); crash recovery via in-flight reset + idempotent `onConflict:'id'` upserts (sole exception: finding #14); immutable-assignment insert-or-ignore preserved; partial batch failures isolated per record; poison rows do not block the queue (terminal rows are excluded and surfaced).
- **Deterministic active-pair IDs** match the canonical partial unique indexes, with push remapping guarded for bare archives.
- **Pull-clobber guard (F7):** all eight guarded tables confirmed guarded, transaction-scoped, protecting pending/failed and mid-flight rows; UI tombstone suppression landed. (The guard protects local *edits*; it does not address finding #4, which is about *removals*.)
- **Push scheduling:** concurrent `syncNow` callers coalesce; background sync debounced; Supabase requests serialized. No push thundering herd.
- **Assessment hot path:** render-perf pack fully landed and effective; zero per-tap SQLite/context work; timers isolated, cleaned up, monotonic, with expiry hard-stops; save atomicity correct; navigation local-first with Retry/Discard on failure.
- **Time tracking:** single-truth TimeTrackingContext landed; open-entry creation atomic; clock-in state user-scoped; auto-clock-out elapsed-time correct.
- **Auth lifecycle:** persisted-session cold-start restore decision; local-first logout (see finding #2 for the outbox gap); token refresh does not re-run hydration; foreground-aware auth refresh.
- **Diagnostics:** logger growth bounded and batched; release/backend identity visible in Profile; Export Database is a real support package; domain storage fully off AsyncStorage (only auth session + logs remain, as designed).
- **RLS contract:** no pulled-table SELECT-visibility mismatch found against checked-in migrations (live probe still recommended, see gate section).

## Docs-vs-code drift found

- `rls-sync-contract-map.md:31` claims sync errors "never loop forever"; contradicted for the deterministic class (finding #6).
- `improvements-2026-07.md:143` (LetterMasteryPanel loads all assessments) is stale; the shared loader now passes `childId`. The rest of item 8's claims remain accurate.
- `improvements-2026-07.md` "five provider values" is now six with TimeTrackingContext (finding #1 must include it).
- `improvements-2026-07.md:220` says the GPS hang gates session capture; it gates clock-in/out only (session capture has "Continue Anyway").
- The July review's UTC claims stand, but auto-clock-out and session dates are confirmed correct (narrower than a reader might assume).
- `auth-session-resilience-2026-04-24.md` describes a 15s grace for all null-session events; code now commits `SIGNED_OUT` immediately unless persisted auth proves it stale.
- `sqlite-refactor-log.md:179`'s AsyncStorage inventory is missing `persistedAuthSession.js` (an allowed auth path, but the list is stale).
- `DEPLOYMENT.md:61-75` overstates what the `appVersion` runtime policy guarantees (finding #21).

## Suggested sequencing

1. **Now (gate):** the EAS production env check (#0). Fifteen minutes, before anything else ships.
2. **Sprint 1, "stop the churn" (S-M):** #1 links a-c (poll bail + ready-gating + memoization) as one PR, then #5 (GPS race timer) and #12 (logger) as two tiny PRs. Three cheap PRs that remove the biggest lag source and the worst hang, and fix crash diagnostics for everything after.
3. **Sprint 2, "data edges" (M):** #2 (outbox ownership), #6 (deterministic-error policy, contract-map update included), #7 (cold-start publish-user-first), #14 (idempotent delete). These four close every data-stranding path found.
4. **Sprint 3, "read path" (M):** #3 + #15 + #10 together (they touch the same repositories), plus #18 (localDate) while in there. Query-count regression tests as the gate.
5. **Sprint 4, "pull correctness" (M):** #4 + #9 + #20 together (reconcile, staleness pull, per-scope errors), folded with #1 link d and #19 (facade) per the existing Phase 5 plan.
6. **Opportunistic:** #8 (with the next session-form touch), #16, #17, #13, #11 + #21 (when WelaPLUS capture work starts).

The four underlying audit reports (full evidence, verified-fixed lists, open questions) were generated read-only on 2026-07-12 by Codex gpt-5.6-sol; this document is the deduplicated, re-verified synthesis.
