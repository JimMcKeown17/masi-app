# Improvements Phase 3: Amplifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the write→sync→re-render amplifier from `documentation/archive/improvements-2026-07.md` item 6 (sub-items 6a and 6b): the 30-second poll re-renders the whole app even when nothing changed, one backed-off failed record drives a no-op full sync pass every 30 seconds, the NetInfo/AppState listeners re-subscribe on every count change, and none of the five context providers memoize their values, so any Offline tick cascades to every consumer of every context.

**Architecture:** Six tasks, one branch, all in `src/context/` plus one repository query. Order matters within Tasks 1-3 (all edit OfflineContext) and they precede Tasks 4-5 (the cascade-cut test in Task 4 needs Task 3's stable Offline behavior to be meaningful). Explicitly OUT of scope (deferred to Phase 5 with the facade work): the post-sync full re-pull in ChildrenContext/ClassesContext (item 6c) — the `isSyncing` reload effects must NOT be touched.

**Tech Stack:** React Native (Expo) + JavaScript, Jest + React Native Testing Library, better-sqlite3-backed SQLite test engine.

## 2026-07-12 refresh (read before executing)

This plan was verified against the 2026-07-04 tree. Two workstreams landed since (Phase 2 data integrity, and the sync-status trust UX merged at `006f9cb`), so:

1. **Locate code by pattern, never by the line numbers below.** The OfflineContext value literal is now around `:255-266`, the 30s interval around `:241-249`, and the auto-trigger around `:48-57`.
2. **`getSyncStatus` grew fields** (`waitingCount`, `needsAttentionCount`, `backedOffCount`, `nextRetryAt`, `needsAttentionItems`) and the OfflineContext provider value grew keys to match. Wherever this plan shows an abbreviated status object in a test snippet, mirror the CURRENT baseline mock shape in `__tests__/OfflineContext.test.js` instead. The Task 3 `useMemo` must include every key the value object has today, unchanged.
3. **Prefer deriving `readyCount` inside `getSyncStatus`'s existing row loop** (a `pending` row, or a `failed` row whose `next_retry_at` is null or <= now, is ready) rather than the second SQL query shown in Task 1 Step 3. Same semantics, one query fewer. Keep the plan's test as the contract.
4. **Task 5 now also covers `TimeTrackingContext`** (added by Phase 2; it consumes `useOffline` and republishes an inline value around `TimeTrackingContext.js:204-224`). Apply the same recipe: functional setters where needed, `useCallback` the exported APIs, `useMemo` the value, extend `__tests__/contextRenderIsolation.test.js` with a TimeTracking probe. Its clock-in/out logic must not change.
5. The commit-message rule below stands: no co-author line, no agent attribution.

## Codex plan review dispositions (2026-07-12, R1-R6) — BINDING

A second-model adversarial review (gpt-5.6-sol) verified this plan against today's tree. All findings accepted. **Where a disposition below conflicts with task text further down, the disposition wins.**

- **R1 (Task 3 value keys):** the Task 3 `useMemo` snippet predates the trust UX and is INCOMPLETE. Enumerate every key of the CURRENT provider value object (today that includes `waitingCount`, `needsAttentionCount`, `nextRetryAt`, and anything else present; read the live literal around `OfflineContext.js:255-266`). Add an assertion to the new tests that the memoized value still exposes `waitingCount`, `needsAttentionCount`, and `nextRetryAt` after a status refresh, so a dropped key fails red.
- **R2 (TDZ crashes, Tasks 4-5):** in ChildrenContext/ClassesContext/LookupsContext the mount and reload effects currently sit ABOVE the functions this plan wraps in `useCallback` (e.g. `ChildrenContext.js:46-66` vs `loadPreloadedChildData` at `:68`). Adding the callback to those effects' dependency arrays without reordering throws a temporal-dead-zone ReferenceError during render. Amendment: in each provider, declare the `useCallback` functions ABOVE every effect that names them in its deps (move the effects below the callback declarations; effect bodies stay byte-identical). Each provider gets a plain mount smoke test (render provider, expect no throw, expect `loading` to reach false) so a TDZ regression is caught immediately.
- **R3 (TimeTracking subtask, Task 5):** TimeTrackingContext gets a full subtask, not a footnote. Recipe: (a) declare `autoClockOut` first via `useCallback`, then `loadActiveEntry` (which calls it) with `autoClockOut` in its deps; (b) the exported APIs (`handleSignIn`/`handleSignOut` or current names) read live state (`isSignedIn`, `activeEntry`, `user`); either include that state in deps or (preferred, matching Task 3's pattern) mirror it into refs kept current on each set, then use refs inside the callbacks; (c) the watchdog interval effect keeps its current semantics with a stable dep list; (d) `useMemo` the value with its complete current key set (read the literal around `TimeTrackingContext.js:204-224`); (e) extend `__tests__/contextRenderIsolation.test.js` with a TimeTracking probe; (f) the full `useTimeTracking.plan5.test.js` and `useTimeTracking.integration.test.js` suites must stay green; (g) add `src/context/TimeTrackingContext.js` to Task 5's `git add`. Clock-in/out logic must not change; if a dependency choice would alter observable behavior, stop and flag instead of guessing.
- **R4 (isolation-test harness):** do NOT invent new mocks for the isolation test. Copy the mock surfaces verbatim from the existing suites: `__tests__/ChildrenContext.test.js` for the storage mock (it includes `getUnsyncedChildren`/`getUnsyncedGroups`/`getUnsyncedChildrenGroups`, which the plan's Task 4 snippet omits) and `__tests__/OfflineContext.test.js` for the supabase auth mock (OfflineProvider calls `supabase.auth.onAuthStateChange` on mount; a bare `{}` crashes). Replace `await act(async () => {})` settling with explicit conditions: `waitFor` on the expected hydration calls AND `loading === false` before capturing the render baseline. Keep the isolation tests serial-safe: no timing assumptions that only hold in isolation (this repo has documented parallel-load flake history).
- **R5 (ready-gating through listeners, Tasks 1+3):** Task 3's ref plan keeps `unsyncedCountRef` for the reconnect/AppState triggers, which silently bypasses Task 1's gating (unsyncedCount includes backed-off rows). Amendment: maintain `readyCountRef` (kept current in `refreshSyncStatus` alongside the others) and use `readyCountRef.current > 0 || inFlightCountRef.current > 0` for EVERY automatic trigger site (NetInfo reconnect, AppState foreground). Forced `syncNow` stays unconditional. Add regressions: reconnect with only backed-off rows does NOT schedule a pass; foreground with only backed-off rows does NOT schedule a pass; reconnect with ready rows DOES.
- **R6 (reconnect test honesty):** the Task 3 reconnect test as written does NOT pass against today's code (status changes re-subscribe listeners, so `mock.calls[0][0]` is a stale callback holding old counts). Treat it as RED-first: write it, watch it fail today, and let the ref-based implementation turn it green. Also assert the replaced subscription's unsubscribe was called (each mocked `addEventListener` returns a jest.fn; after the refactor exactly one subscription exists and zero unsubscribes fire during status churn).

## Global Constraints

- Branch off main first: `git checkout -b improvement/p3-amplifier` (repo rule: always branch).
- Node 20 per `.nvmrc`; prefix jest commands with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH` if the shell defaults to 22.
- Commit messages: `type(scope): message`. Never add an agent name as co-author.
- No sync-contract changes: `readyCount` is a read-side status field; no payload, RLS, outbox-ordering, or schema change. `documentation/rls-sync-contract-map.md` stays untouched.
- Behavior invariants that MUST survive (all pinned by existing tests): background-sync debounce semantics, forced-sync coalescing, the in_flight-recovery auto-trigger (`OfflineContext.test.js:264`), unknown-reachability-is-online, the `isSyncing` true→false reload effects in ChildrenContext/ClassesContext, and every context's public API shape (no key added or removed from any provider value).
- Never write an em dash in any authored doc, comment, or commit message. Exception: code blocks preserving existing source comments stay byte-identical.
- **Reviewer note:** treat git as read-only during concurrent reviews (no stash/checkout/restore).

---

### Task 1: `readyCount` + auto-trigger gating (stop the no-op sync storm)

**The bug:** `refreshSyncStatus` auto-triggers a sync whenever `unsyncedCount > 0` (`OfflineContext.js:51`), but `unsyncedCount` counts `failed` rows still inside their backoff window (`syncOutboxRepository.js` `getSyncStatus`). One failed record waiting out its capped 15-minute backoff makes the 30s poll schedule a full sync pass every tick; the pass uploads nothing (`getReadyRecords` skips backed-off rows) but still runs the group-ownership repair writer transaction and a sync-meta write.

**Files:**
- Modify: `src/db/repositories/syncOutboxRepository.js` (`getSyncStatus`)
- Modify: `src/context/OfflineContext.js:51` (the auto-trigger condition)
- Test: `__tests__/syncOutboxRepository.test.js` (repo), `__tests__/OfflineContext.test.js` (gating)

**Interfaces:**
- Produces: `getSyncStatus()` result gains `readyCount` (pending/failed rows whose `next_retry_at` is null or due). All existing fields unchanged.
- Consumes: existing `timestamp()` helper already imported in the repository file.

- [x] **Step 1: Write the failing repository test**

In `__tests__/syncOutboxRepository.test.js`, following the file's existing conventions (it builds an `outbox` from `createSyncOutboxRepository({ database: db })` and marks backoff via `markRetriableFailure` with the `table:record:operation` outbox id, see its existing backoff test at ~line 50), add:

```javascript
  test('getSyncStatus separates ready work from backed-off work', async () => {
    await outbox.enqueue({
      tableName: 'sessions',
      recordId: 'ready-1',
      operation: 'insert',
      payload: { id: 'ready-1' },
    });
    await outbox.enqueue({
      tableName: 'sessions',
      recordId: 'backed-off-1',
      operation: 'insert',
      payload: { id: 'backed-off-1' },
    });
    await outbox.markRetriableFailure('sessions:backed-off-1:insert', {
      errorMessage: 'network down',
      nextRetryAt: '2099-01-01T00:00:00.000Z',
    });

    const status = await outbox.getSyncStatus();

    expect(status.unsyncedCount).toBe(2);   // pending + failed both count as unsynced
    expect(status.readyCount).toBe(1);      // only the non-backed-off row is ready
  });
```

(Reuse the surrounding describe's `db`/`outbox` setup verbatim; if the file names the repository differently in scope, match it.)

- [x] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/syncOutboxRepository.test.js -t "separates ready work" --verbose
```

Expected: FAIL with `readyCount` undefined.

- [x] **Step 3: Implement `readyCount`**

In `src/db/repositories/syncOutboxRepository.js`, inside `getSyncStatus` (after the breakdown loop, before the return), add:

```javascript
    const readyRow = await db.getFirstAsync(`
      select count(*) as count
      from sync_outbox
      where status in ('pending', 'failed')
        and (next_retry_at is null or next_retry_at <= ?)
    `, timestamp());
```

and add `readyCount: readyRow?.count || 0,` to the returned object.

- [x] **Step 4: Write the failing gating test, then gate**

In `__tests__/OfflineContext.test.js`: first add `readyCount: 0` to the `beforeEach` `getSyncStatus.mockResolvedValue` baseline object, and add `readyCount` to any existing per-test status mocks that expect an auto-trigger (the in_flight-recovery test at ~line 264 must keep passing WITHOUT adding readyCount to it — the in_flight clause covers it). Then add:

```javascript
  test('a backed-off record does not schedule a background sync pass', async () => {
    const { result } = await renderOfflineHook();
    getSyncStatus.mockResolvedValue({
      unsyncedCount: 2,       // failed rows inside their backoff window
      readyCount: 0,
      inFlightCount: 0,
      failedCount: 2,
      failedItems: [],
      breakdown: { sessions: 2 },
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });

    await act(async () => {
      await result.current.refreshSyncStatus();
    });
    act(() => {
      jest.advanceTimersByTime(1500); // through the background-sync debounce
    });

    expect(syncAll).not.toHaveBeenCalled();
  });

  test('ready records still schedule a background sync pass', async () => {
    const { result } = await renderOfflineHook();
    getSyncStatus.mockResolvedValue({
      unsyncedCount: 2,
      readyCount: 2,
      inFlightCount: 0,
      failedCount: 0,
      failedItems: [],
      breakdown: { sessions: 2 },
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });

    await act(async () => {
      await result.current.refreshSyncStatus();
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    expect(syncAll).toHaveBeenCalledTimes(1);
  });
```

Run to see the first test FAIL (syncAll IS called today). Then change `src/context/OfflineContext.js:51` to:

```javascript
      if (autoTrigger && ((status.readyCount || 0) > 0 || (status.inFlightCount || 0) > 0) && isOnlineRef.current) {
```

(`|| 0` keeps any status shape without `readyCount` conservative: no ready work, no trigger.)

- [x] **Step 5: Run the sync suites**

```bash
npx jest __tests__/OfflineContext.test.js __tests__/syncOutboxRepository.test.js --verbose
npm run test:integration
```

Expected: PASS, including the pre-existing in_flight-recovery and debounce/coalescing tests.

- [x] **Step 6: Commit**

```bash
git add src/db/repositories/syncOutboxRepository.js src/context/OfflineContext.js __tests__/syncOutboxRepository.test.js __tests__/OfflineContext.test.js
git commit -m "fix(sync): gate the auto-trigger on ready work, not backed-off counts"
```

---

### Task 2: Bail the poll when the status is unchanged

**The bug:** the 30s poll calls `refreshSyncStatus`, which unconditionally `setSyncStatus(status)` with a fresh object (`OfflineContext.js:49`), re-rendering every `useOffline` consumer every 30 seconds all day. (`setUnsyncedCount`/`setInFlightCount` already bail via React's primitive Object.is check.)

**Files:**
- Modify: `src/context/OfflineContext.js` (`refreshSyncStatus`)
- Test: `__tests__/OfflineContext.test.js`

**Interfaces:**
- Produces: no API change. `syncStatus` keeps its previous object identity when contents are unchanged.

- [x] **Step 1: Write the failing render-count test**

```javascript
  test('a no-change status refresh does not re-render consumers', async () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useOffline();
    }, { wrapper });
    await waitFor(() => expect(getSyncStatus).toHaveBeenCalled());
    getSyncStatus.mockClear();

    const rendersAfterMount = renders;
    await act(async () => {
      await result.current.refreshSyncStatus({ autoTrigger: false });
    });

    // Same status contents (the beforeEach mock returns an identical fresh
    // object every call) must not produce a state change or a re-render.
    expect(renders).toBe(rendersAfterMount);

    // A genuinely changed status must still re-render.
    getSyncStatus.mockResolvedValue({
      unsyncedCount: 3,
      readyCount: 3,
      inFlightCount: 0,
      failedCount: 0,
      failedItems: [],
      breakdown: { sessions: 3 },
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
    await act(async () => {
      await result.current.refreshSyncStatus({ autoTrigger: false });
    });
    expect(renders).toBeGreaterThan(rendersAfterMount);
  });
```

- [x] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/OfflineContext.test.js -t "no-change status refresh" --verbose
```

Expected: FAIL on the first assertion (the fresh `syncStatus` object re-renders the hook today).

- [x] **Step 3: Implement the bail**

In `src/context/OfflineContext.js`, add above the provider:

```javascript
// Cheap deep-compare for sync status snapshots. The object is small (a few
// counters, a per-table breakdown, and the usually-empty failedItems list),
// and both sides come from the same code path, so key order is stable.
const isSameSyncStatus = (a, b) => JSON.stringify(a) === JSON.stringify(b);
```

and change `setSyncStatus(status);` inside `refreshSyncStatus` to:

```javascript
      setSyncStatus(prev => (isSameSyncStatus(prev, status) ? prev : status));
```

(Returning the previous object from a functional update makes React bail out of the state change entirely.)

- [x] **Step 4: Run to verify green**

```bash
npx jest __tests__/OfflineContext.test.js --verbose
```

Expected: PASS, including the pre-existing `refreshSyncStatus updates local status` test (its assertions read the returned status, which is unchanged).

- [x] **Step 5: Commit**

```bash
git add src/context/OfflineContext.js __tests__/OfflineContext.test.js
git commit -m "perf(sync): bail the 30s status poll when nothing changed"
```

---

### Task 3: Stable listeners + memoized Offline value

**The bug:** the NetInfo listener effect re-subscribes on every `[isOnline, unsyncedCount, inFlightCount]` change (`OfflineContext.js:139-159`) and the AppState effect on those plus two callbacks (`:165-191`); the provider `value` is a fresh object literal every render (`:223-233`).

**Files:**
- Modify: `src/context/OfflineContext.js`
- Test: `__tests__/OfflineContext.test.js`

**Interfaces:**
- Produces: no API change. `NetInfo.addEventListener` and `AppState.addEventListener` are each called exactly once per provider lifetime; the value object is `useMemo`d.

- [x] **Step 1: Write the failing subscription-count test**

```javascript
  test('status changes do not re-subscribe the NetInfo and AppState listeners', async () => {
    const { result } = await renderOfflineHook();
    const netInfoSubscriptions = NetInfo.addEventListener.mock.calls.length;
    const appStateSubscriptions = AppState.addEventListener.mock.calls.length;

    getSyncStatus.mockResolvedValue({
      unsyncedCount: 5,
      readyCount: 5,
      inFlightCount: 1,
      failedCount: 0,
      failedItems: [],
      breakdown: { sessions: 5 },
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
    await act(async () => {
      await result.current.refreshSyncStatus({ autoTrigger: false });
    });

    expect(NetInfo.addEventListener.mock.calls.length).toBe(netInfoSubscriptions);
    expect(AppState.addEventListener.mock.calls.length).toBe(appStateSubscriptions);
  });

  test('reconnecting with unsynced work still schedules a background sync', async () => {
    const { result } = await renderOfflineHook();
    getSyncStatus.mockResolvedValue({
      unsyncedCount: 2,
      readyCount: 2,
      inFlightCount: 0,
      failedCount: 0,
      failedItems: [],
      breakdown: { sessions: 2 },
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
    await act(async () => {
      await result.current.refreshSyncStatus({ autoTrigger: false });
    });
    syncAll.mockClear();

    const listener = NetInfo.addEventListener.mock.calls[0][0];
    act(() => {
      listener({ isConnected: false, isInternetReachable: false }); // go offline
    });
    act(() => {
      listener({ isConnected: true, isInternetReachable: true });   // reconnect
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    expect(syncAll).toHaveBeenCalledTimes(1);
  });
```

Expected on first run: the subscription-count test FAILS (counts increase today because the effects' deps include the counters); the reconnect test passes today and pins the behavior the refactor must preserve.

- [x] **Step 2: Implement refs + stable effects + memoized value**

In `src/context/OfflineContext.js`:

1. Add `useMemo` to the React import.
2. Add two refs next to `isOnlineRef` and keep them current inside `refreshSyncStatus` (right after the `setUnsyncedCount`/`setInFlightCount` calls):

```javascript
  const unsyncedCountRef = useRef(0);
  const inFlightCountRef = useRef(0);
```

```javascript
      unsyncedCountRef.current = status.unsyncedCount;
      inFlightCountRef.current = status.inFlightCount || 0;
```

3. Replace the NetInfo listener effect (lines ~139-159) with:

```javascript
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
      console.log('Network state changed:', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        online
      });

      const wasOffline = !isOnlineRef.current;
      setIsOnline(online);
      isOnlineRef.current = online;

      // If we just came online and have unsynced or in_flight data, sync
      if (online && wasOffline && (unsyncedCountRef.current > 0 || inFlightCountRef.current > 0)) {
        console.log('Connection restored, triggering sync...');
        triggerBackgroundSyncRef.current();
      }
    });

    return () => unsubscribe();
  }, []);
```

(Note `isOnlineRef.current = online;` is set synchronously inside the listener so two back-to-back events read the right `wasOffline`; the existing `[isOnline]` sync effect stays and is now redundant-but-harmless.)

4. Replace the AppState effect (lines ~165-191) with the same body it has today, except: every `isOnline` read becomes `isOnlineRef.current`, every `unsyncedCount`/`inFlightCount` read becomes `unsyncedCountRef.current`/`inFlightCountRef.current`, every `triggerBackgroundSync()` call becomes `triggerBackgroundSyncRef.current()`, `refreshSyncStatus()` stays as-is (it is stable), and the dependency array becomes `[refreshSyncStatus]`.

5. Replace the `value` literal (lines ~223-233) with:

```javascript
  const value = useMemo(() => ({
    isOnline,
    isSyncing,
    unsyncedCount,
    inFlightCount,
    syncStatus,
    lastSyncResult,
    triggerBackgroundSync,
    syncNow,
    refreshSyncStatus,
  }), [
    isOnline,
    isSyncing,
    unsyncedCount,
    inFlightCount,
    syncStatus,
    lastSyncResult,
    triggerBackgroundSync,
    syncNow,
    refreshSyncStatus,
  ]);
```

- [x] **Step 3: Run the full OfflineContext suite plus consumers**

```bash
npx jest __tests__/OfflineContext.test.js __tests__/useTimeTracking.plan5.test.js __tests__/HomeScreen.test.js __tests__/SyncStatusScreen.test.js --verbose
npx jest --silent
```

(If there is no `SyncStatusScreen.test.js`, drop it from the command.) Expected: all green, including both new tests and every pre-existing debounce/coalescing/reachability test.

- [x] **Step 4: Commit**

```bash
git add src/context/OfflineContext.js __tests__/OfflineContext.test.js
git commit -m "perf(sync): stable NetInfo/AppState subscriptions + memoized Offline value"
```

---

### Task 4: Memoize ChildrenContext + the cascade-cut test

**The bug:** `ChildrenProvider` consumes `useOffline`, so every Offline change re-renders it; its `value` is an inline literal (`ChildrenContext.js:434-454`), so every one of those re-renders invalidates every `useChildren` consumer in the app. `React.memo` count in `src/` is 0, so list rows re-render too.

**Files:**
- Modify: `src/context/ChildrenContext.js`
- Create: `__tests__/contextRenderIsolation.test.js`

**Interfaces:**
- Produces: identical public API (same 18 keys). Value identity changes only when children/groups/memberships/loading actually change.
- Out of scope: the `isSyncing` reload effect body (6c, Phase 5) — its dependency array gains the now-memoized callback but its logic must not change.

- [x] **Step 1: Write the failing cascade-cut test**

Create `__tests__/contextRenderIsolation.test.js`:

```javascript
import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { OfflineProvider, useOffline } from '../src/context/OfflineContext';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { getSyncStatus, syncAll } from '../src/services/offlineSync';

jest.mock('../src/services/offlineSync', () => ({
  getSyncStatus: jest.fn(),
  syncAll: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));
jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(() => ({ user: { id: 'user-1' } })),
}));
jest.mock('../src/utils/storage', () => ({
  storage: {
    getMyChildren: jest.fn(async () => []),
    getGroups: jest.fn(async () => []),
    getChildrenGroups: jest.fn(async () => []),
    saveChild: jest.fn(async () => true),
    saveClass: jest.fn(async () => true),
    saveStaffChild: jest.fn(async () => true),
    saveChildProgrammeEnrollment: jest.fn(async () => true),
    saveChildClassMembership: jest.fn(async () => true),
    saveGroup: jest.fn(async () => true),
    saveChildrenGroup: jest.fn(async () => true),
  },
}));
jest.mock('../src/services/preloadedChildData', () => ({
  pullPreloadedChildData: jest.fn(async () => ({ errors: [] })),
}));

const statusWith = (overrides = {}) => ({
  unsyncedCount: 0,
  readyCount: 0,
  inFlightCount: 0,
  failedCount: 0,
  failedItems: [],
  breakdown: {},
  lastSyncTime: null,
  lastSuccessfulSyncTime: null,
  ...overrides,
});

let childrenRenders = 0;
let offlineApi = null;

const ChildrenProbe = () => {
  useChildren();
  childrenRenders += 1;
  return null;
};

const OfflineTap = () => {
  offlineApi = useOffline();
  return null;
};

describe('context render isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    childrenRenders = 0;
    offlineApi = null;
    getSyncStatus.mockResolvedValue(statusWith());
  });

  test('an Offline status change does not re-render Children consumers', async () => {
    render(
      <OfflineProvider>
        <ChildrenProvider>
          <OfflineTap />
          <ChildrenProbe />
        </ChildrenProvider>
      </OfflineProvider>
    );
    await waitFor(() => expect(getSyncStatus).toHaveBeenCalled());
    await act(async () => {}); // flush the initial children load
    const rendersAfterSettle = childrenRenders;

    getSyncStatus.mockResolvedValue(statusWith({ unsyncedCount: 5, readyCount: 5, breakdown: { sessions: 5 } }));
    await act(async () => {
      await offlineApi.refreshSyncStatus({ autoTrigger: false });
    });

    expect(childrenRenders).toBe(rendersAfterSettle);
  });
});
```

- [x] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/contextRenderIsolation.test.js --verbose
```

Expected: FAIL — the fresh inline value re-renders `ChildrenProbe` when the Offline status changes today.

- [x] **Step 3: Memoize ChildrenContext**

In `src/context/ChildrenContext.js` (mechanical; no logic changes):

1. Wrap `loadPreloadedChildData` in `useCallback(..., [user?.id])` (its body reads `user?.id`, refs, setters, and module imports only). Then update the two effects that call it: the mount effect's deps become `[user?.id, loadPreloadedChildData]` and the sync-reload effect's deps become `[isSyncing, user?.id, loadPreloadedChildData]` (the `prevSyncingRef` guard already makes extra invocations no-ops; the effect BODY stays byte-identical).
2. Convert the direct-state-read setters to functional updates, then wrap each API function in `useCallback` with these exact deps:

| Function | Body change | Deps |
|---|---|---|
| `loadChildren` | none | `[loadPreloadedChildData]` |
| `addChild` | none (already functional) | `[user?.id, refreshSyncStatus]` |
| `updateChild` | `setChildrenList(childrenList.map(...))` becomes `setChildrenList(prev => prev.map(...))` | `[user?.id, refreshSyncStatus]` |
| `deleteChild` | none (already functional) | `[user?.id, refreshSyncStatus]` |
| `loadGroups` | none | `[loadPreloadedChildData]` |
| `addGroup` | `setGroups([...groups, group])` becomes `setGroups(prev => [...prev, group])` | `[user?.id, refreshSyncStatus]` |
| `updateGroup` | `setGroups(groups.map(...))` becomes `setGroups(prev => prev.map(...))` | `[refreshSyncStatus]` |
| `deleteGroup` | `setGroups(groups.filter(...))` becomes functional; the memberships filter becomes `setChildrenGroups(prev => prev.filter(cg => cg.group_id !== groupId))` | `[refreshSyncStatus]` |
| `addChildToGroup` | `setChildrenGroups([...childrenGroups, membership])` becomes `setChildrenGroups(prev => [...prev, membership])`; the exists-check keeps reading `childrenGroups` | `[childrenGroups, user?.id, refreshSyncStatus]` |
| `removeChildFromGroup` | `setChildrenGroups(childrenGroups.filter(...))` becomes functional | `[refreshSyncStatus]` |
| `getChildrenInGroup` | none (pure read) | `[childrenGroups, visibleChildren]` |
| `getGroupsForChild` | none (pure read) | `[childrenGroups, groups]` |

(`visibleChildren` and `getChildById` are already memoized.)
3. Replace the inline provider value with:

```javascript
  const value = useMemo(() => ({
    children: visibleChildren,
    allChildren: childrenList,
    getChildById,
    groups,
    childrenGroups,
    loading,
    loadChildren,
    addChild,
    updateChild,
    deleteChild,
    loadGroups,
    addGroup,
    updateGroup,
    deleteGroup,
    addChildToGroup,
    removeChildFromGroup,
    getChildrenInGroup,
    getGroupsForChild,
  }), [
    visibleChildren, childrenList, getChildById, groups, childrenGroups, loading,
    loadChildren, addChild, updateChild, deleteChild, loadGroups, addGroup,
    updateGroup, deleteGroup, addChildToGroup, removeChildFromGroup,
    getChildrenInGroup, getGroupsForChild,
  ]);
```

and render `<ChildrenContext.Provider value={value}>` (keep the explanatory comment above the return).

- [x] **Step 4: Run to verify green + no regressions**

```bash
npx jest __tests__/contextRenderIsolation.test.js --verbose
npx jest --silent
```

Expected: the isolation test PASSES; the full suite stays green (children/groups CRUD flows are pinned by existing screen and context tests).

- [x] **Step 5: Commit**

```bash
git add src/context/ChildrenContext.js __tests__/contextRenderIsolation.test.js
git commit -m "perf(children): memoize the provider value; cut the Offline re-render cascade"
```

---

### Task 5: Memoize Classes, Lookups, Auth, and TimeTracking providers

Same mechanical pattern, full rollout per the standing consistency rule (TimeTrackingContext added per the 2026-07-12 refresh note).

**Files:**
- Modify: `src/context/ClassesContext.js`, `src/context/LookupsContext.js`, `src/context/AuthContext.js`, `src/context/TimeTrackingContext.js`
- Test: extend `__tests__/contextRenderIsolation.test.js`

**Interfaces:**
- Produces: identical public APIs. `useMemo`/`useCallback` must be added to each file's React import where missing.

- [x] **Step 1: Extend the failing isolation test to Classes**

Add to `__tests__/contextRenderIsolation.test.js` (new mocks at top: `jest.mock` for `../src/services/supabaseClient` exporting `supabase: {}` if module load requires it, plus the storage mock gains `getSchools: jest.fn(async () => [])`, `getClasses: jest.fn(async () => [])`, `saveClassEaAssignment: jest.fn(async () => true)`, `saveJobTitles`/`getJobTitles` as needed; also mock `../src/services/offlineSync`'s `fetchAndCacheSchools: jest.fn(async () => [])` in the existing offlineSync mock, and `../src/db/repositories/referenceDataRepository` + `../src/db/repositories/domainRepositoryUtils` + `../src/db/repositories/repositoryRuntime` with inert async fns, and `../src/services/supabaseRequestQueue` with `enqueueSupabaseRequest: jest.fn(async () => ({ data: [], error: null }))`):

```javascript
  test('an Offline status change does not re-render Classes consumers', async () => {
    let classesRenders = 0;
    const ClassesProbe = () => {
      useClasses();
      classesRenders += 1;
      return null;
    };

    render(
      <OfflineProvider>
        <ChildrenProvider>
          <ClassesProvider>
            <OfflineTap />
            <ClassesProbe />
          </ClassesProvider>
        </ChildrenProvider>
      </OfflineProvider>
    );
    await waitFor(() => expect(getSyncStatus).toHaveBeenCalled());
    await act(async () => {});
    const rendersAfterSettle = classesRenders;

    getSyncStatus.mockResolvedValue(statusWith({ unsyncedCount: 7, readyCount: 7, breakdown: { sessions: 7 } }));
    await act(async () => {
      await offlineApi.refreshSyncStatus({ autoTrigger: false });
    });

    expect(classesRenders).toBe(rendersAfterSettle);
  });
```

Run: FAILS today.

- [x] **Step 2: Memoize ClassesContext**

Same pattern as Task 4. Wrap in `useCallback` with these deps; convert direct-state-read setters to functional first:

| Function | Body change | Deps |
|---|---|---|
| `loadSchools` | none | `[user?.id]` |
| `loadClasses` | none | `[user?.id]` |
| `addClass` | none (already functional: `setClasses(prev => [...prev, newClass])`) | `[user?.id, refreshSyncStatus]` |
| `updateClass` | `setClasses(classes.map(...))` style reads become functional (`prev =>` form) | `[refreshSyncStatus]` |
| `deleteClass` | same functional conversion | `[refreshSyncStatus]` |
| `getChildrenInClass` | none (pure read of `childrenList` from useChildren) | `[childrenList]` |

Effects gain the memoized callbacks in their deps with bodies unchanged: mount `[user?.id, loadSchools, loadClasses]`; reconnect-refetch `[isOnline, user?.id, schools.length, loadSchools]` (the `prevOnlineRef` guard keeps semantics; note `schools.length` joins because the body reads it — verify the guard still means it only fires on offline→online transitions); sync-reload `[isSyncing, user?.id, loadClasses]`. Value:

```javascript
  const value = useMemo(() => ({
    schools, classes, loading,
    loadSchools, loadClasses, addClass, updateClass, deleteClass, getChildrenInClass,
  }), [schools, classes, loading, loadSchools, loadClasses, addClass, updateClass, deleteClass, getChildrenInClass]);
```

- [x] **Step 3: Memoize LookupsContext**

`loadJobTitles` in `useCallback([user?.id])`; both effects add it to deps (bodies unchanged; `prevOnlineRef` guard preserved); value:

```javascript
  const value = useMemo(() => ({ jobTitles, loading, loadJobTitles }), [jobTitles, loading, loadJobTitles]);
```

- [x] **Step 4: Memoize AuthContext**

Wrap the five EXPORTED functions (`signIn`, `signOut`, `resetPassword`, `updatePassword`, `refreshProfile`) in `useCallback`. Their bodies call internal helpers (`loadUserProfile`, `commitSignedOutState`, etc.) that touch only refs, setters, module imports, and parameters — never state directly — so capturing a render's helper instance is safe; verify that invariant while editing (if any internal helper reads state directly, stop and re-plan). Deps: `signIn`/`signOut`/`resetPassword`/`updatePassword` → `[]`; `refreshProfile` → `[user?.id]`. Value:

```javascript
  const value = useMemo(() => ({
    user, profile, session, loading,
    signIn, signOut, resetPassword, updatePassword, refreshProfile,
  }), [user, profile, session, loading, signIn, signOut, resetPassword, updatePassword, refreshProfile]);
```

- [x] **Step 5: Run everything**

```bash
npx jest __tests__/contextRenderIsolation.test.js --verbose
npx jest --silent
npm run test:integration
```

Expected: isolation tests PASS; full suites green (auth flows, class CRUD, lookups are pinned by existing suites).

- [x] **Step 6: Commit**

```bash
git add src/context/ClassesContext.js src/context/LookupsContext.js src/context/AuthContext.js __tests__/contextRenderIsolation.test.js
git commit -m "perf(context): memoize Classes/Lookups/Auth provider values and APIs"
```

---

### Task 6: Phase wrap

- [x] **Step 1: Full gates**

```bash
npx jest --silent
npm run test:integration
```

- [x] **Step 2: Documentation**

One row in `documentation/sqlite-refactor-log.md` (ready-gating + poll bail + memoization sweep, suite counts, contract map untouched). Tick all plan checkboxes. Add the Phase 3 entry to `PRD.md` Development Progress (Phase 1/2 entry format).

- [x] **Step 3: Commit and hand off to the orchestrator**

```bash
git add documentation/sqlite-refactor-log.md docs/superpowers/plans/2026-07-04-improvements-phase3-amplifier.md PRD.md
git commit -m "docs(p3): phase wrap — checklists, log row"
```

Do NOT push or open a PR; the orchestrator handles push, PR, and CI verification.

**Device gate (Jim, after merge):** with a captured-but-backed-off record (airplane mode a capture, reconnect, let one upload fail), confirm the app stays quiet between polls (no 30s log churn of "Starting sync...") and Sync Now still force-drains; general smoke of children/classes/groups CRUD and sign-in/out.

---

## Self-review notes

- Spec coverage: 6b's no-op-pass storm → Task 1; 6a's poll re-render → Task 2; listener re-subscription + Offline value → Task 3; provider memoization cascade → Tasks 4-5. 6c explicitly out of scope (Phase 5).
- Type consistency: `readyCount` produced in Task 1 is consumed by Tasks 2-5's test status objects via `statusWith`; `isSameSyncStatus` is internal to OfflineContext; no public API key changes anywhere.
- Behavior pins: in_flight recovery (existing :264 test), debounce/coalescing (existing tests), reconnect-sync (new Task 3 test), sync-reload effects untouched (Tasks 4-5 constraint), unknown-reachability (existing tests).
- Verified against the working tree on 2026-07-04: OfflineContext value literal at :223-233; auto-trigger at :51; listener deps at :159 and :191; `refreshSyncStatus`/`syncNow`/`triggerBackgroundSync` already `useCallback`-stable; ChildrenContext value literal at :434-454 with the 12 unmemoized functions listed above; ClassesContext value at :281-293; LookupsContext value at :68; AuthContext value at :245-255; `getSyncStatus` counts pending+failed with no readiness notion.
