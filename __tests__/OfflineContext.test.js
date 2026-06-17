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
