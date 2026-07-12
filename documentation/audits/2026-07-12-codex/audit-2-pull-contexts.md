# Pull Side + Contexts Audit — 2026-07-12

## Summary table

| # | Finding | Severity | Score | Likelihood | Confidence | Effort |
|---|---|---:|---:|---|---|---|
| 1 | Backed-off rows trigger 30-second sync and full-pull storms | P1 | 8 | Occasional | Confirmed | S |
| 2 | Server removals are dropped from React state but not SQLite, so stale entities return offline | P1 | 8 | Occasional | Confirmed | M |
| 3 | Every completed sync performs transaction-heavy full reloads; manual refresh can run them twice | P1 | 8 | Common | Confirmed | M |
| 4 | Server changes are not pulled on ordinary foreground or reconnect events | P1 | 7 | Occasional | Confirmed | S-M |
| 5 | The unimplemented phase-3 work leaves a 30-second context re-render cascade | P1 | 7 | Common | Confirmed | S-M |
| 6 | Restored offline authentication waits for a server pull before publishing the cached user | P2 | 6 | Occasional | Confirmed | S |
| 7 | A failed no-history child delete can temporarily resurrect the child | P2 | 6 | Occasional | Confirmed | S-M |
| 8 | One failed preload scope prevents unrelated successful empty scopes from clearing stale state | P2 | 5 | Occasional | Confirmed | S |

## Findings

### 1. Backed-off rows trigger 30-second sync and full-pull storms

- Evidence:
  - `src/context/OfflineContext.js:48-57`: every status refresh auto-triggers when `status.unsyncedCount > 0`.
  - `src/context/OfflineContext.js:241-246`: status refresh runs every 30 seconds while active.
  - `src/db/repositories/syncOutboxRepository.js:243-259`: `unsyncedCount` includes every `failed` row, including rows whose `next_retry_at` is still in the future. `backedOffCount` is calculated separately, but no `readyCount` is returned.
  - `src/context/OfflineContext.js:93-108`: even an empty pass flips `isSyncing` true then false.
  - `src/context/ChildrenContext.js:59-66` and `src/context/ClassesContext.js:55-62`: every true-to-false transition launches full domain reloads.
  - The planned fix is still unchecked at `docs/superpowers/plans/2026-07-04-improvements-phase3-amplifier.md:23-165`.
- Failure scenario: one upload fails on intermittent connectivity and enters a 15-minute backoff. Every 30 seconds the phone starts another sync pass that has no ready work, flips `isSyncing`, and then downloads and rewrites the full child/class dataset. This repeats roughly 30 times during one backoff window.
- Fix sketch: implement phase-3 Task 1. Return `readyCount` from `getSyncStatus`, and auto-trigger only for ready or stranded in-flight rows. Preserve manual forced-sync behavior.

### 2. Server removals are dropped from React state but not SQLite, so stale entities return offline

- Evidence:
  - `src/utils/mergeServerRows.js:25-42`: a synced cached row absent from the server response is excluded from the returned React array.
  - `src/context/ChildrenContext.js:106-126`: the context persists only rows returned by the server. It never archives or removes local rows missing from a complete response.
  - `src/context/ClassesContext.js:153-158`: classes use the same pattern.
  - `src/db/repositories/childrenRepository.js:460-484`: cold hydration reads active local assignments, enrollments, class memberships, classes, and children from SQLite.
  - `src/db/repositories/classesRepository.js:56-73` and `src/db/repositories/groupsRepository.js:150-170`: active local classes, groups, and memberships remain readable until their archive columns are updated locally.
  - `documentation/rls-sync-contract-map.md:116` accurately admits the boundary: missing rows are “dropped from state (not from SQLite).”
- Failure scenario: Head Office ends an EA assignment, archives a class/group, removes a child-group membership, or deletes a server row. An online pull hides it for the current render because it is absent from the response. The device is later killed and reopened offline. SQLite still describes it as active, so it reappears in the roster.
- Archive/delete behavior:
  - Archives propagate correctly only when the archived row remains visible and is actually returned with its archive field.
  - The pull queries explicitly request only active assignments/memberships at `src/services/preloadedChildData.js:82-85`, `:97`, `:108-109`, and `:121-123`. Those archived relationship rows are therefore absent rather than received as tombstones.
  - Hard server deletes have the same persistence gap.
  - Reference tables other than user-scoped `staff_programme_assignments` also only upsert returned rows; `src/db/repositories/referenceDataRepository.js:382-415` deletes absent rows only when `replaceScopeColumn` is configured.
- Fix sketch: after a complete, error-free scoped pull, reconcile server IDs against SQLite inside one transaction. Archive/end/remove missing acknowledged rows while preserving `pending` and `failed` rows. Do not reconcile from partial or errored responses.

### 3. Every completed sync performs transaction-heavy full reloads; manual refresh can run them twice

- Evidence:
  - `src/context/ChildrenContext.js:59-66` and `src/context/ClassesContext.js:55-62`: every completed sync triggers both loaders.
  - `src/screens/main/ChildrenListScreen.js:97-105`: pull-to-refresh awaits `syncNow()`, then explicitly calls `loadChildren()` and `loadClasses()`. The sync completion already schedules those same two loads.
  - `src/services/preloadedChildData.js:48-149`: no watermark or pagination; each load requests the entire assigned child, junction, class, group, and membership scope.
  - `src/context/ChildrenContext.js:15-18` and `:106-126`: every returned row is saved serially with `await`.
  - `src/utils/storage.js:225-235`: each child save performs a repository transaction and then a separate local payload transaction.
  - `src/utils/storage.js:154-159`: even cache hydration performs one sequential payload lookup per row.
  - `src/utils/storage.js:313-318`, `:341-346`, and `:385-390`: groups, memberships, and classes have the same two-write facade pattern.
- Failure scenario: an EA saves one session, or manually pulls to refresh. The upload finishes quickly, but the phone continues doing hundreds of serialized SQLite transactions and redundant network requests. On a low-end phone this presents as a frozen or sluggish list immediately after capture.
- 5,000-child estimate:
  - One Children reload performs up to five server queries: programme, children with two embedded junctions, class memberships/classes, groups, and group memberships. ClassesContext adds two more.
  - With one EA assignment, programme enrollment, and class membership per child, persistence is approximately five writer transactions per child: two for `saveChild`, plus one each for the three junction rows. That is roughly 25,000 serialized writer transactions before groups and group memberships.
  - Cache hydration also performs about 5,000 sequential `local_state` point reads.
  - Manual refresh can duplicate both loaders, approaching 50,000 base writer transactions.
  - Suspected additional limit: there is no `.range()` pagination, and the 5,000 UUID `.in('child_id', childIds)` at `src/services/preloadedChildData.js:91-98` creates a very large request. Actual truncation or URL failure depends on the live PostgREST configuration.
- Fix sketch: add a single-flight context pull coordinator, remove the explicit duplicate reload after `syncNow`, and persist each table in one transaction. Add pagination before claiming 5,000-child support.

### 4. Server changes are not pulled on ordinary foreground or reconnect events

- Evidence:
  - Domain pulls occur on user publication at `src/context/ChildrenContext.js:46-57` and `src/context/ClassesContext.js:33-44`.
  - They also occur after local sync completion at `ChildrenContext.js:59-66` and `ClassesContext.js:55-62`.
  - The foreground listener only refreshes outbox status and potentially uploads local work at `src/context/OfflineContext.js:169-195`.
  - The connectivity listener only schedules an upload at `OfflineContext.js:143-163`.
  - The 30-second interval only calls `refreshSyncStatus()` at `OfflineContext.js:241-246`.
  - Lookups refresh on reconnect at `src/context/LookupsContext.js:26-32`; ClassesContext refreshes schools only when its cache is empty at `src/context/ClassesContext.js:46-53`. Neither refreshes child/class/group domain rows.
- Failure scenario: Head Office changes a roster while an EA’s app is open or while the phone is offline. The phone reconnects and foregrounds with no local unsynced work. No domain pull occurs, so the EA continues seeing the old roster until a local write, manual Children refresh, sign-out, or remount happens.
- Fix sketch: run one debounced, single-flight domain pull on offline-to-online and on foreground after a reasonable staleness threshold. Avoid another 30-second loop.

### 5. The unimplemented phase-3 work leaves a 30-second context re-render cascade

- Evidence:
  - `src/context/OfflineContext.js:48-54`: `setSyncStatus(status)` installs a fresh object even when its contents are unchanged.
  - `src/context/OfflineContext.js:255-266`: the provider value is also a fresh object.
  - `src/context/OfflineContext.js:143-163` and `:169-195`: NetInfo and AppState listeners re-subscribe whenever counts/connectivity change.
  - Four nested providers consume OfflineContext:
    - `TimeTrackingContext.js:15-17`
    - `LookupsContext.js:10-13`
    - `ChildrenContext.js:21-24`
    - `ClassesContext.js:23-26`
  - All four republish inline values:
    - `TimeTrackingContext.js:204-224`
    - `LookupsContext.js:67-70`
    - `ChildrenContext.js:432-456`
    - `ClassesContext.js:260-275`
  - Provider nesting is `Offline → Auth → TimeTracking → Lookups → Children → Classes` at `App.js:126-138`.
- Blast radius: every idle 30-second tick republishes five context identities: Offline, TimeTracking, Lookups, Children, and Classes. Auth does not consume Offline and is not part of this tick cascade. Mounted consumers include Home, Children, Sessions, Assessments, class/child editors and selectors, assessment ranking/history screens, sync indicators, and literacy capture. For example:
  - `HomeScreen.js:26-39`
  - `ChildrenListScreen.js:23-27`
  - `LiteracySessionForm.js:192-194`
  - `AssessmentsScreen.js:17`
- Failure scenario: an idle low-end Android phone repeatedly renders mounted screens and list consumers even though no domain data or sync counters changed. If a backed-off row exists, Finding 1 expands this from rendering into full network and SQLite work.
- Fix sketch: implement phase-3 Tasks 2-5: equality-gate `syncStatus`, stabilize listeners with refs, memoize provider values, and wrap exported context functions in `useCallback`. Include the now-present TimeTrackingContext in the memoization pass.

### 6. Restored offline authentication waits for a server pull before publishing the cached user

- Evidence:
  - `src/context/AuthContext.js:46-70`: a persisted session correctly enters authenticated startup instead of clearing auth.
  - `src/context/AuthContext.js:145-170`: startup awaits `pullReferenceData()` before loading the cached profile and before `setUser(authUser)`.
  - `src/services/offlineSync.js:1465-1493`: reference tables are fetched sequentially, beginning with a live Supabase request.
  - The existing test explicitly pins the blocking behavior: `__tests__/AuthContext.test.js:111-139` expects `user` to remain null while the reference pull promise is unresolved.
  - The cold-start regression confirms eventual restore at `__tests__/authColdStartRestore.test.js:144-160`, but its reference pull mock resolves immediately at `:121-136`.
- Failure scenario: the app is killed at a school, then reopened with no usable network. The valid persisted session prevents a login bounce, but the navigation gate remains loading until the first reference-data request fails or times out. Child, class, and lookup contexts cannot hydrate because `user` is still null.
- Fix sketch: for a persisted offline restore, publish the authenticated user and cached profile first. Refresh reference data afterward, or bound the startup network attempt with connectivity/timeout handling. Preserve the current user-ID guards against cross-user cache leakage.

### 7. A failed no-history child delete can temporarily resurrect the child

- Evidence:
  - `src/db/repositories/childrenRepository.js:535-562`: no-history deletion removes the child and its local relationships entirely, leaving only a `hard_delete` outbox row.
  - `src/db/repositories/childrenRepository.js:342-345`: `getUnsyncedChildren()` can no longer return that deleted ID.
  - `src/utils/mergeServerRows.js:33-40`: tombstone suppression depends on an unsynced local row, so the deleted ID is unknown.
  - `src/context/ChildrenContext.js:106-109`: a subsequent pull saves the still-existing server child back into SQLite and React state.
- Failure scenario: an EA deletes a newly-added/no-history child while connectivity is unstable. The delete RPC fails, `isSyncing` returns to false, and the post-sync pull receives the server copy. The child reappears until a later retry successfully executes the RPC.
- Fix sketch: have the merge/repository pull guard consult pending `hard_delete` outbox IDs, or retain a lightweight local deletion tombstone until server acknowledgement.

### 8. One failed preload scope prevents unrelated successful empty scopes from clearing stale state

- Evidence:
  - `src/services/preloadedChildData.js:34-45`: each query records its own scope but all failures are accumulated in one `errors` array.
  - `src/context/ChildrenContext.js:11-13`: an empty result is applied only when the global error array is empty.
  - `src/context/ChildrenContext.js:106-126`: children, groups, and memberships all use that same global array.
- Failure scenario: the child-class-membership request fails, but the groups request succeeds and correctly returns zero because the EA has been removed from all groups. Since one unrelated error exists, the empty group result is ignored and old groups remain visible.
- Fix sketch: return per-scope success/error state. Apply an empty result when that specific scope succeeded, while retaining cached data only for the failed scope.

## Verified fixed

### F7 pull-clobber coverage

The documented eight-table coverage is accurate.

| Server-fetched table | Local treatment | Pull-clobber guard |
|---|---|---|
| `children` | Persisted domain row | Guarded at `childrenRepository.js:324-340` |
| `child_ea_assignments` | Persisted domain row | Guarded at `childrenRepository.js:357-380` |
| `child_programme_enrollments` | Persisted domain row | Guarded at `childrenRepository.js:383-402` |
| `child_class_memberships` | Persisted domain row | Guarded at `childrenRepository.js:405-424` |
| `classes` | Persisted domain row | Guarded at `classesRepository.js:76-105` |
| `class_ea_assignments` | Persisted domain row | Guarded at `classEaAssignmentsRepository.js:30-48` |
| `groups` | Persisted domain row | Guarded at `groupsRepository.js:174-207` |
| `child_group_memberships` | Persisted domain row | Guarded at `groupsRepository.js:229-261` |
| `group_ea_assignments` | Embedded selector only; stripped and not cached | No local row is written by this pull |
| `schools`, `job_titles`, `programmes`, `academic_years`, `assessment_windows`, `teachers` | Server-authoritative reference cache | Unguarded by design; not mobile outbox tables |
| `staff_programme_assignments` | Server-authoritative, user-scoped replacement | Unguarded by design |
| `users` | Cached local profile | Unguarded; not an outbox domain table |

The guard itself is transaction-scoped at `src/db/repositories/domainRepositoryUtils.js:132-145`. It rejects an incoming `synced` row when SQLite is `pending` or `failed`.

A mid-flight upload remains protected: `markInFlight` changes only the outbox row at `src/db/repositories/syncOutboxRepository.js:113-126`; the domain row remains pending until finalization at `src/services/offlineSync.js:740-768`. Therefore an ordinary pull cannot overwrite an edit sitting in the outbox or currently uploading. Terminal rows are intentionally overwriteable because they no longer have queued retry authority.

The UI-side pending tombstone fix also landed. `mergeServerRows.js:28-40` suppresses stale server copies using the unfiltered unsynced rows, and the contexts pass those rows at `ChildrenContext.js:85-95`, `:106-125` and `ClassesContext.js:102-105`, `:153`.

### Offline cold-start restore

The July 7 fix landed in commits `dbd780f` and `83f14f1`. A null `INITIAL_SESSION` consults auth-js persistence at `AuthContext.js:55-70`; a valid stored user is restored rather than bounced to login. Local sign-out clears persistence first and does not wait on the network at `AuthContext.js:243-262`.

The remaining network-first delay is Finding 6, not a failure of the restore decision itself.

### Push scheduling controls

- Concurrent `syncNow()` callers share an active promise at `OfflineContext.js:70-86`.
- Forced requests coalesce behind an active non-forced pass at `:73-83`.
- Write-driven background sync is debounced by one second at `:120-133`.
- Supabase requests are serialized by `src/services/supabaseRequestQueue.js:1-15`.

There is no push thundering herd. The remaining duplicate work is at the context pull layer.

### RLS SELECT visibility against current migration code

No confirmed pulled-table mismatch was found in the checked-in RLS contract:

- The client queries only the active user’s assignments/programme at `preloadedChildData.js:54-123` and `ClassesContext.js:110-135`.
- `staff_programme_assignments_read_own` permits the same user scope at `supabase/migrations/20260521120147_masi_rls_advisor_cleanup.sql:77-79`.
- Child, class, group, and junction SELECT policies use the corresponding read/access helpers at `supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:656-719`, `:732-775`, and `:854-897`.
- The creator fallbacks required for upsert visibility exist in `supabase/migrations/20260526151352_creator_select_upsert_visibility.sql:7-23`.

An RLS under-return would remove rows from current React state via `mergeServerRows`, but it would not currently delete domain rows from SQLite. The exception is user-scoped `staff_programme_assignments`, whose replacement is intentionally destructive within that user’s scope.

## Docs-vs-code drift

- The phase-3 amplifier plan did not land.
  - `git status --short -- docs/superpowers/plans/2026-07-04-improvements-phase3-amplifier.md` reports it as untracked.
  - `git log --all --follow --` for that path returns no commit.
  - All task checkboxes remain unchecked.
  - Live code has no `readyCount`, no unchanged-status equality guard, no memoized Offline value, no stable count refs, and no context isolation test.
- `documentation/improvements-2026-07.md:106-119` remains substantially accurate about the amplifier, although its line numbers are stale.
- Its “five provider values” description is now incomplete. Phase 2 added TimeTrackingContext. The current idle Offline tick republishes Offline plus four dependent contexts: TimeTracking, Lookups, Children, and Classes.
- `documentation/sqlite-refactor-log.md` records Phase 1, Phase 2, F7, auth, and later sync work, but contains no phase-3 completion entry.
- `documentation/rls-sync-contract-map.md:116` is accurate that missing synced rows are dropped only from React state, not SQLite. The user-facing offline-resurrection consequence is not highlighted there.

## Open questions

- Live RLS was not queried. The checked-in migration policies and client filters align, but repository guidance explicitly warns that migrations can drift from the deployed backend. A read-only live probe against `segygjzpujphwvrubusm` remains necessary.
- The live PostgREST maximum-row setting was not available. The client has no pagination, so a 5,000-child pull may truncate before the already-severe local processing cost occurs.
- The practical render duration and writer-queue time need a low-end Android profile. This audit was read-only and ran no tests or profilers.
- The expected maximum children per field user should be made explicit. The present pull design is unsuitable for 5,000 rows even if the backend returns all of them.

