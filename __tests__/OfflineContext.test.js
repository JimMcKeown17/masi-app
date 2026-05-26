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
