import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { OfflineProvider, useOffline } from '../src/context/OfflineContext';
import { getSyncStatus, syncAll } from '../src/services/offlineSync';

jest.mock('../src/services/offlineSync', () => ({
  getSyncStatus: jest.fn(),
  syncAll: jest.fn(),
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
      failedItems: [],
      breakdown: {},
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
    syncAll.mockResolvedValue({ success: true, totalSynced: 0, totalFailed: 0 });
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
});
