# App Shell + Diagnostics Audit - 2026-07-12

## Summary table

| # | Finding | Severity | Score | Likelihood | Confidence | Effort |
|---|---|---:|---:|---|---|---|
| 1 | Logout can expose one EA’s pending outbox rows to another EA’s session and terminalize them | P1 | 8 | Occasional | High | M |
| 2 | The advertised GPS timeout is not a timeout; clock-in and clock-out can hang indefinitely | P1 | 8 | Common | High | S |
| 3 | Offline-restored auth waits for unbounded network work before publishing the user | P1 | 7 | Occasional | Medium | S |
| 4 | SQLite bootstrap failure has no dedicated recovery or diagnostics surface | P2 | 6 | Rare | High | M |
| 5 | Logger destroys useful crash errors and can itself crash on circular values | P2 | 6 | Occasional | High | S |
| 6 | Time-entry day grouping and “days worked” use UTC dates | P2 | 5 | Rare | High | S |
| 7 | The SQLite storage facade still has split-transaction drift races | P2 | 5 | Occasional | High | M |
| 8 | OTA rollback and same-version native compatibility are not guarded by schema or fingerprint checks | P2 | 5 | Rare | Medium | M |

## Findings

### 1. Logout can expose one EA’s pending outbox rows to another EA’s session and terminalize them

- Status: **Confirmed**
- Severity: **P1, score 8**
- Likelihood: Occasional
- Confidence: High
- Effort: M
- Evidence:
  - `src/context/AuthContext.js:243-262`: sign-out clears auth and the cached profile, but does not inspect, flush, partition, or clear `sync_outbox`.
    ```js
    setUser(null);
    await storage.clearUserProfile();
    await clearPersistedSession();
    supabase.auth.signOut({ scope: 'local' })
    ```
  - `src/context/OfflineContext.js:203-217`: every subsequent `SIGNED_IN`, `TOKEN_REFRESHED`, or non-null `INITIAL_SESSION` triggers background sync.
  - `src/db/repositories/syncOutboxRepository.js:71-86`: readiness selects every pending/failed row globally. There is no owner or authenticated-user predicate.
    ```sql
    select * from sync_outbox
    where status in ('pending', 'failed')
    ```
  - `src/services/offlineSync.js:1144-1169,1237-1245`: `syncAll` confirms only that some live session exists and then processes all ready rows. It does not match each row to `session.user.id`.
  - `src/services/offlineSync.js:999-1010`: a `42501` under the new user’s live session receives the `42501-authenticated:` marker and becomes terminal.
  - `src/services/offlineSync.js:1346-1357`: authenticated-denial terminals are explicitly excluded from automatic auth-restoration healing.
- Failure scenario: EA A records sessions or assessments offline, then signs out and hands the device to EA B. When B signs in with connectivity, B’s session attempts A’s pending rows. RLS rejects root records such as A’s session or time entry. Those rows can become authenticated terminal failures and will not auto-heal when A later returns. The local data is not deleted, but it is stranded until A performs a manual forced sync or support intervenes.
- Fix sketch: add an immutable `owner_user_id` to each outbox row at enqueue time and restrict readiness to the current authenticated user. Preserve other users’ rows untouched. As an immediate guard, warn on logout when pending rows exist, but do not treat that warning as the root fix.

### 2. The advertised GPS timeout is not a timeout; clock-in and clock-out can hang indefinitely

- Status: **Confirmed**
- Severity: **P1, score 8**
- Likelihood: Common
- Confidence: High
- Effort: S
- Evidence:
  - `src/services/locationService.js:14-16,97-101` passes `timeInterval: 10000` to `getCurrentPositionAsync`.
  - The installed Expo Location definition, `node_modules/expo-location/build/Location.types.d.ts:94-115`, defines `timeInterval` as the minimum interval between updates on Android, not a request timeout.
  - `src/context/TimeTrackingContext.js:111-132`: clock-in awaits GPS before writing the SQLite time entry.
  - `src/context/TimeTrackingContext.js:157-190`: clock-out also awaits GPS before closing the entry.
  - `src/services/locationService.js:22-47`: denied permission presents “Enable Location,” which recursively requests permission again without checking `canAskAgain`. A permanently denied Android permission can therefore produce a repeated alert loop.
- Failure scenario: an EA tries to clock in inside a concrete school building or with weak GPS. The button remains in its location-loading state because the location promise has no upper bound. On clock-out, the same failure leaves the shift open until the ten-hour auto-clock-out.
- Fix sketch: race the location request against a real ten-second timer and proceed with null coordinates plus a visible warning. Check `canAskAgain`; when false, offer to open device settings rather than recursively requesting permission.
- Session-capture qualification: GPS does **not** hard-block recording a session. `src/hooks/useSessionLaunchGuard.js:46-64` and `src/components/sessions/ClockInBeforeSessionDialog.js:13-21` provide “Continue Anyway.” The defect blocks time tracking, not session persistence.

### 3. Offline-restored auth waits for unbounded network work before publishing the user

- Status: **Suspected**
- Severity: **P1, score 7**
- Likelihood: Occasional
- Confidence: Medium
- Effort: S
- Evidence:
  - `src/context/AuthContext.js:46-52`: offline restoration sets `loading=true` and schedules authenticated startup.
  - `src/context/AuthContext.js:153-170`: startup waits for `pullReferenceData`, then profile loading, before `setUser(authUser)` and `setLoading(false)`.
    ```js
    await pullReferenceData({ userId: authUser.id });
    await loadUserProfile(...);
    setUser(authUser);
    setLoading(false);
    ```
  - `src/services/offlineSync.js:1451-1494`: the reference pull performs up to seven sequential Supabase requests.
  - `src/services/supabaseRequestQueue.js:1-8`: the global queue has no timeout or cancellation.
  - `src/navigation/AppNavigator.js:368-377`: while auth remains loading, the only UI is an indefinite spinner.
- Failure scenario: a previously authenticated EA cold-starts without usable connectivity. The persisted session is found correctly, but the first Supabase request stalls rather than rejecting promptly. The app remains on its startup spinner even though the local SQLite data and persisted identity are sufficient for offline operation.
- Why Suspected: fetch may reject quickly on some devices and network states. The code nevertheless provides no upper bound, and the ordering deliberately prevents the local shell from opening until network work settles.
- Fix sketch: publish the restored user and cached profile first, then run reference/profile refresh in the background. Alternatively, enforce a short startup timeout and fall back to cached data.

### 4. SQLite bootstrap failure has no dedicated recovery or diagnostics surface

- Status: **Confirmed**
- Severity: **P2, score 6**
- Likelihood: Rare
- Confidence: High
- Effort: M
- Evidence:
  - `src/db/client.js:47-70`: database open, PRAGMAs, migrations, and reader creation share one initializer. Any failure disposes the handles and rethrows, resetting the initializer so later access retries the same bootstrap.
  - `src/context/OfflineContext.js:48-63`, `src/context/TimeTrackingContext.js:72-92`, and `src/context/AuthContext.js:153-170`: major startup consumers catch and log database failures rather than entering a central database-failed state.
  - `App.js:17-47`: the only global error UI is a render error boundary with “Try Again.” It has no Share Logs, Share Database, safe mode, or reset option.
  - `src/utils/debugExport.js:29-55` and `src/db/debugDump.js:122-135`: Export Database itself requires `getDatabase()`, so it cannot export when opening or migrating the database fails.
- Failure scenario: an OTA contains a bad local migration, or SQLite reports corruption. The shell may open with missing profile/reference/domain data because async failures are caught independently. Every later database access retries and logs the same failure. If a render error also occurs, the user sees only “Something went wrong,” with no support-export action.
- Startup outcome:
  - Database open or migration failure does not deterministically create a white screen.
  - Most current async callers degrade to empty/stale screens and logs.
  - A render-time failure reaches the generic error boundary.
  - There is no corruption recovery, safe mode, or database-failure screen.
- Fix sketch: introduce one explicit database-bootstrap gate above the providers. On failure, show retry, Share Logs, release/backend identity, and a clearly confirmed local-database reset option. Database export can remain unavailable when opening SQLite is impossible, but the UI should explain that.

### 5. Logger destroys useful crash errors and can itself crash on circular values

- Status: **Confirmed**
- Severity: **P2, score 6**
- Likelihood: Occasional
- Confidence: High
- Effort: S
- Evidence:
  - `src/utils/logger.js:63-68` serializes every object with unguarded `JSON.stringify`.
    ```js
    message: args.map(a =>
      typeof a === 'object' ? JSON.stringify(a) : String(a)
    ).join(' ')
    ```
  - Native `Error` properties are non-enumerable, so the error becomes `{}`.
  - Circular objects throw synchronously inside the replacement `console.log/error/warn`.
  - `App.js:24-25` sends the actual crash `Error` through this path:
    ```js
    console.error('App crashed:', error, componentStack);
    ```
  - `src/utils/debugExport.js:61-75`: Export Logs depends on this serialized output.
- Failure scenario: a crash occurs and the exported line says `App crashed: {}` without message or stack. Alternatively, a harmless diagnostic call containing a circular object throws from the logger and creates a second crash.
- Fix sketch: serialize `Error` as `{name, message, stack}`; guard object serialization and fall back to `[unserializable: Type]`.
- What is already sound:
  - `src/utils/logger.js:4-7,80-87` caps persisted logs at 1,000 and 48 hours.
  - Writes are asynchronous and batched every 30 seconds, not synchronous per log call.
  - No explicit child names or coordinates were found in current log calls, although user UUIDs and record UUIDs are logged and there is no general redaction layer.
  - Export Logs works without SQLite if the authenticated Profile screen remains reachable. It is not accessible from the global crash screen.

### 6. Time-entry day grouping and “days worked” use UTC dates

- Status: **Confirmed**
- Severity: **P2, score 5**
- Likelihood: Rare
- Confidence: High
- Effort: S
- Evidence:
  - `src/screens/main/TimeEntriesListScreen.js:63-70` groups `sign_in_time` with `toISOString().split('T')[0]`.
  - `src/screens/main/TimeEntriesListScreen.js:149-155` computes “today” with the UTC date.
  - `src/utils/dashboardStats.js:25-29` returns `string.slice(0,10)` without converting timestamp strings to device-local time.
  - `src/utils/dashboardStats.js:56-68` passes UTC `sign_in_time` strings through that helper for “days worked.”
  - `src/screens/sessions/LiteracySessionForm.js:55-60,312-318` correctly stores session dates using local calendar components, so session goal/week/month filters are not affected.
- Failure scenario: an EA clocks in between 00:00 and 01:59 South African time. The history groups the entry under the previous day. At a month boundary, Home can attribute the day worked to the previous month.
- Boundary clarification: there is no South Africa-specific failure between 22:00 and 24:00 local. The failure window is 00:00 through 01:59 local because SAST is UTC+2.
- Auto-clock-out: `src/context/TimeTrackingContext.js:39-53` uses elapsed milliseconds and writes exactly `sign_in_time + 10 hours`. It is not using a UTC calendar-day boundary and is correct across midnight.
- Fix sketch: create one local-calendar formatter that parses timestamp strings into `Date` before reading local year/month/day. Keep plain `YYYY-MM-DD` domain dates as date-only values.

### 7. The SQLite storage facade still has split-transaction drift races

- Status: **Confirmed**
- Severity: **P2, score 5**
- Likelihood: Occasional
- Confidence: High
- Effort: M
- Evidence:
  - `src/utils/storage.js:118-125`: legacy screen-shaped payloads live separately in `local_state`.
  - `src/utils/storage.js:137-151`: facade reads let the sidecar payload supply domain fields, overlaying only sync truth from the normalized row.
  - `src/utils/storage.js:248-253`, `321-326`, and `397-402`: update paths read and write the payload first, then run the typed repository update in a separate transaction.
  - `src/db/repositories/localStateRepository.js:5-20`: each `get` and `set` is a separate operation; there is no atomic read-modify-write primitive.
- Failure scenario: an EA edits a child while a background server pull is persisting the same child. The pull can update the normalized row, the edit can mark it pending, and then the pull’s later sidecar write can overwrite the visible payload. SQLite and the outbox contain the local edit, but context reads reconstruct the stale server values, making the edit appear lost until later convergence.
- Fix sketch: for still-live facade paths, update normalized row and sidecar in the same repository transaction. Then retire the sidecar facade context-by-context, as already planned, so normalized repository view models become the sole read truth.

### 8. OTA rollback and same-version native compatibility are not guarded by schema or fingerprint checks

- Status: **Suspected**
- Severity: **P2, score 5**
- Likelihood: Rare
- Confidence: Medium
- Effort: M
- Evidence:
  - `app.config.js:61-66` uses `runtimeVersion: { policy: 'appVersion' }`.
  - This separates app versions, but two native binaries built with the same marketing version share the runtime even if their native modules differ.
  - `src/db/client.js:56-62` correctly runs migrations before opening the reader, protecting fresh JS against an older local schema.
  - `src/db/migrations.js:590-625` applies migrations only when `migration.version > userVersion`. There is no check for `userVersion > CURRENT_SCHEMA_VERSION`.
- Failure scenario: an OTA at app version 1.2.0 applies schema version 6 and is then rolled back to an earlier 1.2.0 bundle that only understands version 5. The older bundle accepts the newer database without a compatibility check. Current migrations are additive, so today’s version-5 database is tolerant, but the guard is absent for future behavioral or destructive migrations.
- Fix sketch: fail safely when local `user_version` exceeds the bundle’s `CURRENT_SCHEMA_VERSION`. Show an update-required support screen instead of opening domain flows. For native compatibility, use a fingerprint-based runtime policy if supported by the chosen Expo release, or enforce and document a mandatory app-version bump for every native dependency/config change.

## Verified fixed

- **Cold-start persisted-session recovery exists.** `src/services/persistedAuthSession.js:18-63` reads Supabase’s actual storage key and requires a refresh token plus user identity. `src/context/AuthContext.js:55-70` restores it when `INITIAL_SESSION` is null.
- **Manual logout is local-first.** `src/context/AuthContext.js:243-262` removes the local UI session without waiting for a network sign-out.
- **Token refresh does not re-run full hydration.** `src/context/AuthContext.js:80-93` updates the session and returns early for `TOKEN_REFRESHED` when the user is unchanged.
- **Supabase auth refresh follows foreground/background state.** `src/services/supabaseClient.js:82-121` starts refresh when active and stops it in the background.
- **Sessionless sync does not RLS-quarantine the outbox.** `src/services/offlineSync.js:1144-1169` skips the pass when there is no live session.
- **Logger growth is bounded and batched.** `src/utils/logger.js:4-7,71-90`.
- **Session capture can continue without clock-in/GPS.** `src/hooks/useSessionLaunchGuard.js:46-64`.
- **Clock-in state is user-scoped.** `src/utils/timeEntryStatus.js:8-15` delegates to `getActiveTimeEntry(userId)`, whose SQL filters by `user_id` at `src/db/repositories/timeEntriesRepository.js:157-168`.
- **Open time-entry creation is atomic.** `src/db/repositories/timeEntriesRepository.js:105-129` checks and inserts inside one writer transaction.
- **Domain storage is SQLite.** Production direct `AsyncStorage` usage is limited to `src/services/supabaseClient.js`, `src/services/persistedAuthSession.js`, and `src/utils/logger.js`. The first two are auth-session paths; the last is logs. No production domain table still directly reads or writes AsyncStorage.
- **Fresh JS plus an older SQLite schema is gated through migrations.** `src/db/client.js:56-62` runs migrations before the reader becomes available, and `src/db/migrations.js:598-658` applies each migration transactionally with `user_version` updated in the same commit.
- **Release/backend identity is visible.** `src/screens/main/ProfileScreen.js:396-408` displays app/build, backend target, and project ID. `config/supabaseProjectConfig.js:38-72` validates known targets and URL/project consistency.
- **Export Database is a real SQLite support package.** `src/utils/debugExport.js:29-50` includes release/device metadata, while `src/db/debugDump.js:122-135` includes schema version, applied migrations, table counts, sync state, and failed/terminal outbox rows. The Profile warning correctly identifies the export as sensitive at `src/screens/main/ProfileScreen.js:80-98`.

## Docs-vs-code drift

- `documentation/auth-session-resilience-2026-04-24.md:54-77` says a non-manual null-session event waits 15 seconds. Current code treats `SIGNED_OUT` specially and commits immediately unless persisted auth proves it stale (`src/context/AuthContext.js:96-111`). The 15-second grace applies only to other null-session events (`:119-129`).
- The auth document’s example log spelling at `documentation/auth-session-resilience-2026-04-24.md:89-94` uses `[Auth] INITIAL_SESSION...`; current code logs `[Auth] Event=INITIAL_SESSION...` at `src/context/AuthContext.js:77-78`.
- `documentation/sqlite-refactor-log.md:179` says direct AsyncStorage is limited to Supabase auth and logger paths. `src/services/persistedAuthSession.js:1,37,66-72` is now a third direct importer. This is still an allowed auth path, but the literal file inventory is stale.
- `documentation/archive/improvements-2026-07.md:220` says the GPS hang gates session capture. It gates clock-in/out, but session capture has an explicit “Continue Anyway” path at `src/hooks/useSessionLaunchGuard.js:56-64`.
- `DEPLOYMENT.md:61-75` describes `appVersion` runtime policy as preventing incompatible native code. It only does so if every native change also receives a marketing-version bump; the configuration itself is not a native fingerprint.
- The July improvements claims about logger serialization, GPS timeout, facade status, and UTC dates remain accurate and open in the live code. They should not be marked completed.

## Open questions

- The production EAS profile does not specify Supabase variables in-repo (`eas.json:30-36`), while `config/supabaseProjectConfig.js:34-60` defaults to the legacy `primary` project. Are production EAS environment variables configured externally to select `sqlite-staging`/`segygjzpujphwvrubusm`? Without them, a production build targets the legacy backend.
- Are devices formally single-user, or is EA rotation on one phone expected? The code comments explicitly contemplate shared/rotated devices, but the frequency determines how urgently finding 1 should block release.
- What is the intended operator policy for OTA rollback after a local schema migration? No compatibility matrix or “database newer than bundle” behavior is encoded.
- Should support be allowed to reset a corrupt local database when pending rows may exist? A recovery UI needs an explicit data-loss warning and escalation policy.

This was a static, read-only audit. No tests, database commands, or file modifications were run.

