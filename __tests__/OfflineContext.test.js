import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { OfflineProvider, useOffline } from '../src/context/OfflineContext';
import { supabase } from '../src/services/supabaseClient';
import { getSyncStatus, requeueTerminalRlsFailures, syncAll } from '../src/services/offlineSync';

jest.mock('../src/services/offlineSync', () => ({
  getSyncStatus: jest.fn(),
  requeueTerminalRlsFailures: jest.fn(async () => 0),
  syncAll: jest.fn(),
}));

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));

const wrapper = ({ children }) => (
  <OfflineProvider>{children}</OfflineProvider>
);

const renderOfflineHook = async () => {
  const rendered = renderHook(() => useOffline(), { wrapper });
  await waitFor(() => expect(getSyncStatus).toHaveBeenCalled());
  getSyncStatus.mockClear();
  syncAll.mockClear();
  return rendered;
};

describe('OfflineContext Plan 4 sync API', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
    getSyncStatus.mockResolvedValue({
      unsyncedCount: 0,
      inFlightCount: 0,
      failedItems: [],
      breakdown: {},
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
    syncAll.mockResolvedValue({ success: true, totalSynced: 0, totalFailed: 0 });
    requeueTerminalRlsFailures.mockResolvedValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test('triggerBackgroundSync is debounced and non-blocking', async () => {
    const { result } = await renderOfflineHook();

    act(() => {
      expect(result.current.triggerBackgroundSync()).toBeUndefined();
      result.current.triggerBackgroundSync();
      result.current.triggerBackgroundSync();
    });

    expect(syncAll).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(999);
      await Promise.resolve();
    });

    expect(syncAll).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(syncAll).toHaveBeenCalledTimes(1);
  });

  test('concurrent manual sync calls share one in-flight promise', async () => {
    const { result } = await renderOfflineHook();
    let resolveSync;
    syncAll.mockReturnValue(new Promise((resolve) => {
      resolveSync = resolve;
    }));

    let first;
    let second;
    act(() => {
      first = result.current.syncNow();
      second = result.current.syncNow();
    });

    expect(second).toBe(first);
    expect(syncAll).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSync({ success: true, totalSynced: 1, totalFailed: 0 });
      await first;
    });

    await expect(second).resolves.toEqual({ success: true, totalSynced: 1, totalFailed: 0 });
  });

  test('force-during-active-sync: chains a forced pass after the background sync settles', async () => {
    const { result } = await renderOfflineHook();

    let resolveFirstSync;
    // First (non-forced) call — resolves on demand so we can hold it in-flight
    syncAll.mockReturnValueOnce(new Promise((resolve) => {
      resolveFirstSync = resolve;
    }));
    // Second (forced) pass resolves immediately
    syncAll.mockResolvedValueOnce({ success: true, totalSynced: 2, totalFailed: 0 });

    let backgroundResult;
    let forcedResult;

    act(() => {
      // Background (non-forced) sync starts first — activeSyncPromise is now set
      backgroundResult = result.current.syncNow();
      // Forced call while the background sync is still in-flight
      forcedResult = result.current.syncNow({ force: true });
    });

    // The forced call must NOT return the same promise as the background sync
    expect(forcedResult).not.toBe(backgroundResult);
    // Only the background pass has started so far
    expect(syncAll).toHaveBeenCalledTimes(1);
    expect(syncAll).toHaveBeenLastCalledWith({ force: false });

    // Let the background sync finish
    await act(async () => {
      resolveFirstSync({ success: true, totalSynced: 0, totalFailed: 0 });
      await backgroundResult;
    });

    // The forced pass should have been chained after the background sync settled
    await act(async () => {
      await forcedResult;
    });

    expect(syncAll).toHaveBeenCalledTimes(2);
    expect(syncAll).toHaveBeenLastCalledWith({ force: true });
    await expect(forcedResult).resolves.toEqual({ success: true, totalSynced: 2, totalFailed: 0 });
  });

  test('force coalescing: multiple forced calls during one active sync share ONE queued forced rerun', async () => {
    const { result } = await renderOfflineHook();

    let resolveFirstSync;
    // First (non-forced) background sync — held in-flight until we manually resolve it
    syncAll.mockReturnValueOnce(new Promise((resolve) => {
      resolveFirstSync = resolve;
    }));
    // Coalesced forced rerun resolves immediately
    syncAll.mockResolvedValueOnce({ success: true, totalSynced: 3, totalFailed: 0 });

    let backgroundResult;
    let forcedResult1;
    let forcedResult2;

    act(() => {
      // Background (non-forced) sync starts — activeSyncPromise is now set
      backgroundResult = result.current.syncNow();
      // Two rapid forced calls while the background sync is in-flight
      forcedResult1 = result.current.syncNow({ force: true });
      forcedResult2 = result.current.syncNow({ force: true });
    });

    // Both forced calls must return the SAME queued promise (coalesced)
    expect(forcedResult1).toBe(forcedResult2);
    // Neither forced call is the background sync promise
    expect(forcedResult1).not.toBe(backgroundResult);
    // Only the background pass has started so far — no extra Supabase hit yet
    expect(syncAll).toHaveBeenCalledTimes(1);
    expect(syncAll).toHaveBeenLastCalledWith({ force: false });

    // Let the background sync finish
    await act(async () => {
      resolveFirstSync({ success: true, totalSynced: 0, totalFailed: 0 });
      await backgroundResult;
    });

    // The single coalesced forced pass runs now
    await act(async () => {
      await forcedResult1;
    });

    // Exactly 2 total syncAll calls: 1 background + 1 coalesced forced rerun (NOT 3)
    expect(syncAll).toHaveBeenCalledTimes(2);
    expect(syncAll).toHaveBeenLastCalledWith({ force: true });
    await expect(forcedResult1).resolves.toEqual({ success: true, totalSynced: 3, totalFailed: 0 });
    await expect(forcedResult2).resolves.toEqual({ success: true, totalSynced: 3, totalFailed: 0 });
  });

  test('forced-during-active-forced: joins the active forced pass, syncAll called only once', async () => {
    const { result } = await renderOfflineHook();

    let resolveFirstSync;
    // Use mockImplementation so we capture every call in `calls` and control resolution
    syncAll.mockImplementation((opts) => {
      if (!resolveFirstSync) {
        // First call — hold in-flight until we manually resolve it
        return new Promise((resolve) => { resolveFirstSync = resolve; });
      }
      // Any subsequent call (which the test asserts does NOT happen)
      return Promise.resolve({ success: true, totalSynced: 99, totalFailed: 0 });
    });

    let forcedResult1;
    let forcedResult2;

    act(() => {
      // Start a FORCED sync — activeSyncPromise is now set AND activeSyncIsForced is true
      forcedResult1 = result.current.syncNow({ force: true });
      // Second forced call arrives while the forced pass is still in-flight
      forcedResult2 = result.current.syncNow({ force: true });
    });

    // The second forced call must JOIN the active forced promise (same reference)
    expect(forcedResult2).toBe(forcedResult1);
    // Only the initial forced pass has started so far
    expect(syncAll).toHaveBeenCalledTimes(1);
    expect(syncAll).toHaveBeenLastCalledWith({ force: true });

    // Resolve the active forced sync
    await act(async () => {
      resolveFirstSync({ success: true, totalSynced: 5, totalFailed: 0 });
      await forcedResult1;
    });

    // Only ONE syncAll call was ever made — no redundant second forced pass
    expect(syncAll).toHaveBeenCalledTimes(1);
    await expect(forcedResult1).resolves.toEqual({ success: true, totalSynced: 5, totalFailed: 0 });
    await expect(forcedResult2).resolves.toEqual({ success: true, totalSynced: 5, totalFailed: 0 });
  });

  test('refreshSyncStatus updates local status without waiting for upload', async () => {
    const { result } = await renderOfflineHook();
    getSyncStatus.mockResolvedValueOnce({
      unsyncedCount: 3,
      inFlightCount: 0,
      failedItems: [],
      breakdown: { children: 3 },
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
    syncAll.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      await result.current.refreshSyncStatus();
    });

    expect(result.current.unsyncedCount).toBe(3);
    expect(result.current.syncStatus.breakdown).toEqual({ children: 3 });
    expect(syncAll).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(syncAll).toHaveBeenCalledTimes(1);
  });

  test('schedules a background sync when only in_flight rows remain (recovery after a reset failure)', async () => {
    // getSyncStatus returns unsyncedCount:0 but inFlightCount:1 — stranded in_flight work.
    // Previously the autoTrigger condition only checked unsyncedCount>0, so the recovery
    // pass would never be scheduled. After the fix it must fire.
    getSyncStatus.mockResolvedValue({
      unsyncedCount: 0,
      inFlightCount: 1,
      failedItems: [],
      breakdown: {},
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
    syncAll.mockReturnValue(new Promise(() => {})); // hold in-flight; we only care it was called

    const { result } = await renderOfflineHook();

    // renderOfflineHook waits for the initial getSyncStatus call and clears mocks.
    // Now call refreshSyncStatus with autoTrigger (the default) to simulate the periodic
    // poll / foreground event that discovers stranded in_flight work.
    await act(async () => {
      await result.current.refreshSyncStatus();
    });

    // The autoTrigger fires synchronously inside refreshSyncStatus, which schedules a
    // debounced background sync. Advance past the debounce window.
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    // A recovery pass MUST have been scheduled even though unsyncedCount === 0.
    expect(syncAll).toHaveBeenCalledTimes(1);
    expect(result.current.inFlightCount).toBe(1);
  });

  describe('unknown reachability is treated as online', () => {
    test('initial fetch with isInternetReachable null leaves the app online', async () => {
      NetInfo.fetch.mockResolvedValueOnce({ isConnected: true, isInternetReachable: null });
      const { result } = await renderOfflineHook();
      await waitFor(() => expect(result.current.isOnline).toBe(true));
    });

    test('a listener event with isInternetReachable null keeps the app online', async () => {
      const { result } = await renderOfflineHook();
      const listener = NetInfo.addEventListener.mock.calls[0][0];
      act(() => {
        listener({ isConnected: true, isInternetReachable: null });
      });
      await waitFor(() => expect(result.current.isOnline).toBe(true));
    });
  });

  describe('auth-restore heal wiring', () => {
    const emitAuthEvent = async (event, session) => {
      const callback = supabase.auth.onAuthStateChange.mock.calls[0][0];
      await act(async () => {
        await callback(event, session);
      });
    };

    test.each([
      ['SIGNED_IN'],
      ['TOKEN_REFRESHED'],
      ['INITIAL_SESSION'],
    ])('%s with a session heals then schedules a sync', async (event) => {
      await renderOfflineHook();

      await emitAuthEvent(event, { user: { id: 'user-1' } });

      expect(requeueTerminalRlsFailures).toHaveBeenCalledWith('user-1');
      await act(async () => {
        jest.advanceTimersByTime(1500);
        await Promise.resolve();
      });
      expect(syncAll).toHaveBeenCalled();
    });

    test('SIGNED_OUT and a null INITIAL_SESSION do not heal', async () => {
      await renderOfflineHook();

      await emitAuthEvent('SIGNED_OUT', null);
      await emitAuthEvent('INITIAL_SESSION', null);

      expect(requeueTerminalRlsFailures).not.toHaveBeenCalled();
    });
  });
});
