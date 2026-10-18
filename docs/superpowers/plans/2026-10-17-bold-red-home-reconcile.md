# Bold Red Home — Reconciliation with the Merge Stack

> **For agentic workers:** this plan finishes an in-progress `git merge origin/main` into
> `feat/bold-red-home-reconcile` (worktree `.claude/worktrees/bold-red-home`). Do not commit,
> abort, or rebase; Claude commits the merge after review.

**Goal:** land the Bold Red Home (`docs/superpowers/plans/2026-10-17-bold-red-home.md`) on top of
everything merged to `main` on 2026-10-17: PR #60 session-history hydration, Plan 1 upload-path
correctness, clock-without-location, organisation label, Plan 2 signed-in EA handle (ADR 0008), and
Plan 3 sign-out questions (#68, #69).

**Spec:** `docs/superpowers/specs/2026-10-17-bold-red-home-design.md` (behaviour is unchanged by
this plan; only its plumbing moves).

## What changed underneath the Home branch

1. **Plan 2: one SQLite file per EA, reached only through the handle.** React consumers read
   `useSignedInEA().repositories`; module singletons such as `timeEntriesRepository` throw
   `UnboundRepositoryError` in production (tests get an ambient test handle, which hides this).
   `__tests__/productionBindingStatic.test.js` enforces it statically for names ending in
   `Repository`, but **does not catch `homeAttentionStore`** because of its name. Providers are
   remounted per EA (`<SignedInEAProvider key={userId:epoch}>` in `App.js`), so per-user state
   cannot leak between EAs inside one provider instance.
2. **Plan 1: a local edit owns its sync state.** Every local write sets `sync_status: 'pending'`,
   `synced: false`, `last_sync_error: null` (see `updateTimeEntry`).
3. **Clock without location.** `getCurrentPosition()` resolves `{ coords?, status?, cancelled? }`;
   clock-in/out proceeds without coords and records `sign_in_location_status` /
   `sign_out_location_status`. `cancelled` aborts with the Settings copy. A `clockActionInFlight`
   ref guards double taps. GPS is captured *before* the open entry is re-read.
4. **Plan 3 sign-out flow.** `ProfileScreen` passes `handleSignOut` as `clockOut` to
   `useSignOutFlow`, which treats a `false` result as a failure: it shows "Couldn't clock out" and
   stays on the "You're still clocked in" step. **Main has a latent bug here** (review round 1):
   if the 10-hour watchdog closes the shift while "Clock out now" waits on GPS, main's
   `handleSignOut` returns `false`, every retry also returns `false`, and the sheet is stuck.
   **New contract: `handleSignOut` resolves `true` whenever no open shift remains afterwards**
   (closed by this call, or found already closed by the watchdog or another path), and `false`
   only when a shift is still open (location `cancelled`, a genuine write error, or a clock action
   already in flight). Document this contract in a comment above `handleSignOut`.
5. **PR #60.** Home reloads when `useSessionHistoryStatus()`'s `pageVersion` / `runVersion`
   change, and the stats spinner covers only the first load: later reloads update in place.

## Global constraints

- Use Node 20: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- No new dependencies. No changes outside the files listed below unless a test proves it necessary.
- Keep every user-visible copy string from both sides exactly as written.
- Colour rule: translucent fills are `token + 'NN'`, never `rgba(...)`; no colour-guard exceptions.
- Do not touch `docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md` or `design/`.

## Tasks

### Task 1: `closeOpenTimeEntry` follows Plan 1

`src/db/repositories/timeEntriesRepository.js` (auto-merged, keeps my function):

- Set `sync_status: 'pending'`, `synced: false`, `last_sync_error: null` exactly as
  `updateTimeEntry` does (replace `syncStatusFromSynced(false)`; drop that import if unused).
- Return the closed record (`next`) instead of `true`, and `null` instead of `false`, so callers
  can compute hours from the row that was actually closed. Update its JSDoc-style comment.
- Tests (`__tests__/timeEntriesRepository.test.js` or the existing integration file that covers
  it): closing a row whose `last_sync_error` was set and `sync_status` was `failed` leaves it
  `pending` with `last_sync_error` null; a second close returns `null` and writes no outbox row;
  location-status columns passed in `closeFields` persist.

### Task 2: the attention store becomes a handle service

`src/services/homeAttentionStore.js`:

- Delete the `homeAttentionStore` singleton export. Keep `createHomeAttentionStore({ database })`
  and `AUTO_CLOCK_OUT_NOTICE_TTL_MS`.
- The database file is now per-EA, so drop the `userId` from keys and from the API:
  keys `home_attention.auto_clock_out` and `home_attention.assessment_due_dismissed_on`;
  `loadAutoClockOutNotice()`, `dismissAutoClockOutNotice(entryId, dismissedAt)`,
  `getAssessmentDismissedOn()`, `dismissAssessmentForDay(localDate)`,
  `recordAutoClockOutNotice(txn, { entry, detectedAt })`. The notice keeps `userId` in its value
  (harmless, and useful in an exported support database).
- Accept the handle's `localState` repository instead of building its own:
  `createHomeAttentionStore({ database, localState })`, so the store uses the same bound
  repository as every other handle consumer.
- Construct it once in `src/session/handleServices.js`: `homeAttention:
  createHomeAttentionStore({ database: handle, localState: repositories.localState })` on the
  returned services object.
- Update `__tests__/homeAttentionStore.integration.test.js` to the new API, and add a case to
  `__tests__/productionBindingStatic.test.js` style coverage only if cheap; at minimum, grep shows
  no production import of a `homeAttentionStore` singleton.

### Task 3: resolve `src/context/TimeTrackingContext.js`

Start from **main's** version and add the Home behaviour on top:

- Import `MAX_SHIFT_HOURS`, `MAX_SHIFT_MS` from `src/constants/timeTracking.js` (delete the local
  constants). Read `const { repositories, services } = useSignedInEA()`; use
  `services.homeAttention`.
- `autoClockOut(entry)`: use `timeEntriesRepository.closeOpenTimeEntry(entry.id, { sign_out_time:
  sign-in + MAX_SHIFT_MS, sign_out_lat: null, sign_out_lon: null, auto_clocked_out: true }, {
  onClosed: (txn, closed) => homeAttention.recordAutoClockOutNotice(txn, { entry: closed,
  detectedAt }) })`. Always clear the active state; if nothing was closed, return without snackbar
  or notice; otherwise publish the notice, refresh sync status, trigger sync, and show
  `Auto clocked out after ${MAX_SHIFT_HOURS} hours.`
- Remove the `notice.userId === userRef.current?.id` and loader `userRef` guards: the provider is
  remounted per EA, so they are dead code. Keep the loader's `cancelled` flag and the "keep the
  newer in-memory notice by `detectedAt`" merge (the startup auto clock-out can publish before the
  load resolves).
- `handleSignIn`: main's version unchanged.
- `handleSignOut`: main's version (in-flight guard, GPS first, `cancelled` handling, re-read of the
  open entry, location status, both snackbar copies), except:
  - the write: replace `updateTimeEntry(current.id, updatedEntry)` with
    `closeOpenTimeEntry(current.id, { sign_out_time, sign_out_lat, sign_out_lon,
    sign_out_location_status })`, and compute `hoursWorked` from the returned row's
    `sign_in_time`;
  - the return values follow the contract in "What changed" item 4. The "not clocked in" paths
    (the initial `!isSignedInRef.current || !activeEntryRef.current` check, the re-read finding no
    open entry, and `closeOpenTimeEntry` returning `null`) clear active state, keep their existing
    snackbar copy, and return **`true`**. In-flight, `cancelled` and `catch` return `false`.
  - No change to `useSignOutFlow.js` is needed: with this contract its `closed` branch advances to
    the unsent-work check.
- `dismissAutoClockOutNotice(entryId)`: call the store, reload, set state; catch and log.
- The watchdog interval calls `autoClockOut(activeEntry)` without awaiting it, so its rejection is
  unhandled on both sides today. Attach `.catch(...)` at that call site (log genuine errors, ignore
  stale-actor errors). `autoClockOut` must publish nothing (no notice, no snackbar, no sync
  trigger) when the close rejects.
- Every `catch` that logs in this file skips `isStaleActorError(error)` (import from
  `src/session/staleActor`), matching `SignedInEAContext`: after sign-out an in-flight write
  rejecting with a stale-actor error is expected, not an error.
- Expose `autoClockOutNotice` and `dismissAutoClockOutNotice` in the memo value.

### Task 4: resolve `src/screens/main/HomeScreen.js`

Start from **my** version (the redesign) and take main's plumbing:

- `const { handle, repositories, services } = useSignedInEA()`; sessions and assessments from
  `repositories`; `services.homeAttention` for the assessment dismissal. Remove the singleton
  imports and the `homeAttentionStore` import.
- `loadStats`: pass `{ handle, userId }` to `getSessionsTodayGoal` and `getActiveProgrammeGate`;
  call `homeAttention.getAssessmentDismissedOn()` and `dismissAssessmentForDay(today)`.
- Add `pageVersion, runVersion` (from `useSessionHistoryStatus()`, already imported) to
  `loadStats`'s dependencies so each history page reloads Home while it is focused.
- **Spinner only on the first load** (PR #60): do not call `setStatsLoading(true)` at the start of
  `loadStats`; `statsLoading` starts `true` and is cleared after the first settled load. Later
  reloads update in place. A later failure still sets `statsFailed` (existing behaviour).
- **A reload must never undo a dismissal** (review round 1): a load that read `null` before the EA
  dismissed the card can finish afterwards. Dismissal dates only move forward, so apply the loaded
  value monotonically: `setAssessmentDismissedOn((current) => (current && (!loaded || current >
  loaded) ? current : loaded))` (`YYYY-MM-DD` strings compare correctly). Use the same merge in
  `dismissItem`.
- Keep the `loadSeqRef` sequencing, focus + AppState `active` reload, and everything else in my
  version. Drop main's `statsLoadStartedRef`, `whoToSeeNext` and `recentSessions` (removed by the
  redesign).
- Stats-load and dismissal `catch` blocks skip `isStaleActorError`.

### Task 5: resolve the tests

- `__tests__/HomeScreen.test.js`: keep both sides' mocks — `mockIsFocused`, `mockStatusBar`, and
  `mockUseSessionHistoryStatus` (default `{ pageVersion: 0, runVersion: 0 }`). Replace the
  `homeAttentionStore` module mock with `services.homeAttention` on whatever `useSignedInEA`
  mock main's version of this file uses. For `useFocusEffect`, use main's
  `React.useEffect(() => cb(), [cb])` so a changed callback re-runs. Add tests: (a) bumping
  `pageVersion` reloads stats without showing the skeleton again; (b) a load rejecting with a
  `StaleActorError` does not call `console.error`; (c) hold a reload whose
  `getAssessmentDismissedOn` resolved `null`, dismiss the assessment card, release the reload: the
  card stays hidden.
- `__tests__/useTimeTracking.integration.test.js`: keep all tests from both sides. Use main's
  singleton-under-ambient-handle style or `createTimeEntriesRepository({ database: testDb })`,
  whichever the file's setup actually binds; do not mix databases. Update my tests' GPS mocks to
  the new `{ coords, status }` shape. Add: (a) manual clock-out losing the race to the watchdog
  resolves `true`, keeps the automatic close, and shows `You are not clocked in.`; (a2) a location
  `cancelled` result resolves `false` with the shift still open; (a3) the watchdog's close
  rejecting with a `StaleActorError` after unmount produces no unhandled rejection and no
  `console.error`; (b) manual clock-out without location
  (`{ status: 'timeout' }`) closes the shift with `sign_out_location_status: 'timeout'` and the
  row is `pending` with `last_sync_error` null; (c) the auto clock-out notice is readable after
  remounting the provider (persisted, not just in memory).
- `__tests__/useSignOutFlow*` / Profile sign-out tests from Plan 3 must pass unchanged. Add one
  `useSignOutFlow` test: `clockOut` resolving `true` while the shift was closed elsewhere advances
  to the unsent-work step (`countUnsent` called).

### Review log

- Round 1 (Codex adversarial, 2026-10-17): needs-attention, 3 findings, all accepted. (1) The
  watchdog race strands the sign-out sheet: fixed by the "no open shift remains" contract (bug is
  latent on main too). (2) The detached watchdog promise is unhandled: `.catch` at the call site.
  (3) A history reload can resurrect a dismissed assessment card: monotonic merge.

### Task 6: docs

- `documentation/build-log.md`: keep both sides' rows, in date order. Add one Decision row for
  this reconciliation (attention store moved to handle services; keys no longer per-user; close
  returns the row) and one Verification row with the suite counts.
- `docs/superpowers/specs/2026-10-17-bold-red-home-design.md`: add a dated status note at the top
  pointing at this plan (do not rewrite the body).
- `documentation/rls-sync-contract-map.md`: if it documents the `time_entries` write paths, add the
  conditional close (no RLS or payload change).

## Proof expected

```
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest -c jest.integration.config.js
grep -rn "homeAttentionStore\b" src   # only createHomeAttentionStore remains
git diff --check
```

No conflict markers may remain (`git diff --name-only --diff-filter=U` empty after `git add`
would be Claude's job; just leave the files resolved).

## Review focus

1. Plan 3's sign-out sheet: "Clock out now" while the watchdog closes the shift must not report
   success twice or leave the sheet stuck.
2. Sign-out while a Home load or auto clock-out is in flight: stale-actor rejections stay quiet;
   nothing writes into the next EA's file.
3. History pages landing while Home is focused: no skeleton flash, no out-of-order overwrite.
4. An EA whose previous shift was auto-closed on a different day opens Home: notice TTL still
   applies from `detectedAt`.
5. A failed-then-edited time entry: `last_sync_error` cleared on close.
