import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { OfflineProvider, useOffline } from '../src/context/OfflineContext';
import { supabase } from '../src/services/supabaseClient';
import { getSyncStatus, requeueTerminalRlsFailures, syncAll } from '../src/services/offlineSync';
import { runStartupRepairs } from '../src/services/startupRepairs';
import { syncStateRepository } from '../src/db/repositories/syncStateRepository';
import {
  captureOperationalError,
  reportSyncResult,
  reportSyncStatus,
} from '../src/services/observability';

const appStateCurrentStateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState');

jest.mock('../src/services/offlineSync', () => ({
  getSyncStatus: jest.fn(),
  requeueTerminalRlsFailures: jest.fn(async () => 0),
  syncAll: jest.fn(),
}));

jest.mock('../src/services/startupRepairs', () => ({
  runStartupRepairs: jest.fn(async () => ({
    success: true,
    fromVersion: 0,
    toVersion: 1,
    applied: [],
  })),
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

jest.mock('../src/db/repositories/syncStateRepository', () => ({
  syncStateRepository: {
    getPullState: jest.fn(),
    getReconcileBreakerNotes: jest.fn(),
  },
}));

jest.mock('../src/services/observability', () => ({
  reportSyncResult: jest.fn(),
  reportSyncStatus: jest.fn(),
  captureOperationalError: jest.fn(),
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
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      writable: true,
      value: 'active',
    });
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
    getSyncStatus.mockResolvedValue({
      unsyncedCount: 0,
      readyCount: 0,
      inFlightCount: 0,
      waitingCount: 0,
      needsAttentionCount: 0,
      backedOffCount: 0,
      nextRetryAt: null,
      failedItems: [],
      needsAttentionItems: [],
      breakdown: {},
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
    syncAll.mockResolvedValue({ success: true, totalSynced: 0, totalFailed: 0 });
    requeueTerminalRlsFailures.mockResolvedValue(0);
    runStartupRepairs.mockResolvedValue({
      success: true,
      fromVersion: 0,
      toVersion: 1,
      applied: [],
    });
    syncStateRepository.getPullState.mockResolvedValue(null);
    syncStateRepository.getReconcileBreakerNotes.mockResolvedValue([]);
  });

  afterEach(() => {
    Object.defineProperty(AppState, 'currentState', appStateCurrentStateDescriptor);
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

  test('runs startup repairs once before the first status read', async () => {
    renderHook(() => useOffline(), { wrapper });
    await waitFor(() => expect(getSyncStatus).toHaveBeenCalled());

    expect(runStartupRepairs).toHaveBeenCalledTimes(1);
    expect(runStartupRepairs.mock.invocationCallOrder[0])
      .toBeLessThan(getSyncStatus.mock.invocationCallOrder[0]);
  });

  test('manual sync waits for the shared startup repair before uploading', async () => {
    let finishRepair;
    runStartupRepairs.mockReturnValueOnce(new Promise((resolve) => {
      finishRepair = resolve;
    }));
    const rendered = renderHook(() => useOffline(), { wrapper });

    let syncPromise;
    act(() => {
      syncPromise = rendered.result.current.syncNow();
    });
    await act(async () => Promise.resolve());
    expect(syncAll).not.toHaveBeenCalled();

    await act(async () => {
      finishRepair({ success: true, fromVersion: 0, toVersion: 1, applied: [] });
      await syncPromise;
    });
    expect(syncAll).toHaveBeenCalledTimes(1);
  });

  test('a failed startup repair is reported, does not block the app, and is not retried this launch', async () => {
    const repairError = Object.assign(new Error('repair failed'), {
      repairVersion: 2,
      repairName: 'repair-two',
      completedVersion: 1,
    });
    runStartupRepairs.mockRejectedValueOnce(repairError);
    renderHook(() => useOffline(), { wrapper });

    await waitFor(() => expect(getSyncStatus).toHaveBeenCalled());

    expect(runStartupRepairs).toHaveBeenCalledTimes(1);
    expect(captureOperationalError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'repair failed' }),
      {
        category: 'startup_repair_failed',
        context: {
          repairVersion: 2,
          repairName: 'repair-two',
          completedVersion: 1,
        },
      }
    );
  });

  test('refreshSyncStatus surfaces persisted breaker notes as needs-attention state', async () => {
    const note = {
      scope: 'childEaAssignments',
      candidateCount: 15,
      wouldEndCount: 12,
      triggeredAt: '2026-07-13T12:00:00.000Z',
    };
    syncStateRepository.getReconcileBreakerNotes.mockResolvedValue([note]);

    const { result } = await renderOfflineHook();

    expect(result.current.needsAttentionCount).toBe(1);
    expect(result.current.syncStatus.reconcileBreakerNotes).toEqual([note]);
    expect(reportSyncStatus).toHaveBeenCalledWith(expect.objectContaining({
      reconcileBreakerNotes: [note],
    }), { source: 'status_refresh', isOnline: true });
  });

  test('reports a returned sync result even when the sync engine does not throw', async () => {
    const syncResult = {
      success: true,
      totalSynced: 0,
      totalFailed: 2,
      totalTerminal: 0,
      totalRetriable: 2,
      failedRecords: [{ table: 'sessions', reason: 'network request failed' }],
      preflightErrors: [],
    };
    syncAll.mockResolvedValue(syncResult);
    const { result } = await renderOfflineHook();

    await act(async () => {
      await result.current.syncNow({ force: true });
    });

    expect(reportSyncResult).toHaveBeenCalledWith(syncResult, {
      source: 'sync_now',
      force: true,
      isOnline: true,
    });
  });

  test('Apply authorizes one scope once and forces the next domain pull', async () => {
    const { result } = await renderOfflineHook();

    act(() => {
      result.current.authorizeReconcileBreaker('childEaAssignments');
    });

    expect(result.current.domainPullNonce).toBe(1);
    expect(result.current.hasReconcileBreakerAuthorization('childEaAssignments')).toBe(true);
    expect(result.current.consumeReconcileBreakerAuthorization('childEaAssignments')).toBe(true);
    expect(result.current.hasReconcileBreakerAuthorization('childEaAssignments')).toBe(false);
    expect(result.current.consumeReconcileBreakerAuthorization('childEaAssignments')).toBe(false);
    expect(result.current.consumeReconcileBreakerAuthorization('classEaAssignments')).toBe(false);
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
      readyCount: 3,
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

  test('a backed-off record does not schedule a background sync pass', async () => {
    const { result } = await renderOfflineHook();
    getSyncStatus.mockResolvedValue({
      unsyncedCount: 2,
      readyCount: 0,
      inFlightCount: 0,
      waitingCount: 2,
      needsAttentionCount: 0,
      backedOffCount: 2,
      nextRetryAt: '2099-01-01T00:00:00.000Z',
      failedCount: 2,
      failedItems: [],
      needsAttentionItems: [],
      breakdown: { sessions: 2 },
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });

    await act(async () => {
      await result.current.refreshSyncStatus();
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(syncAll).not.toHaveBeenCalled();
  });

  test('ready records still schedule a background sync pass', async () => {
    const { result } = await renderOfflineHook();
    getSyncStatus.mockResolvedValue({
      unsyncedCount: 2,
      readyCount: 2,
      inFlightCount: 0,
      waitingCount: 2,
      needsAttentionCount: 0,
      backedOffCount: 0,
      nextRetryAt: null,
      failedCount: 0,
      failedItems: [],
      needsAttentionItems: [],
      breakdown: { sessions: 2 },
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });

    await act(async () => {
      await result.current.refreshSyncStatus();
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(syncAll).toHaveBeenCalledTimes(1);
  });

  test('a no-change status refresh does not re-render consumers', async () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useOffline();
    }, { wrapper });
    await waitFor(() => expect(getSyncStatus).toHaveBeenCalled());
    await waitFor(() => expect(result.current.syncStatus).toEqual(expect.objectContaining({
      unsyncedCount: 0,
      readyCount: 0,
      waitingCount: 0,
    })));
    getSyncStatus.mockClear();
    getSyncStatus.mockResolvedValue({
      ...result.current.syncStatus,
      failedItems: [...result.current.syncStatus.failedItems],
      needsAttentionItems: [...result.current.syncStatus.needsAttentionItems],
      breakdown: { ...result.current.syncStatus.breakdown },
    });

    const rendersAfterMount = renders;
    await act(async () => {
      await result.current.refreshSyncStatus({ autoTrigger: false });
    });

    expect(renders).toBe(rendersAfterMount);

    getSyncStatus.mockResolvedValue({
      unsyncedCount: 3,
      readyCount: 3,
      inFlightCount: 0,
      waitingCount: 3,
      needsAttentionCount: 0,
      backedOffCount: 0,
      nextRetryAt: null,
      failedCount: 0,
      failedItems: [],
      needsAttentionItems: [],
      breakdown: { sessions: 3 },
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
    await act(async () => {
      await result.current.refreshSyncStatus({ autoTrigger: false });
    });
    expect(renders).toBeGreaterThan(rendersAfterMount);
  });

  test('status changes do not re-subscribe the NetInfo and AppState listeners', async () => {
    const { result } = await renderOfflineHook();
    const netInfoSubscriptions = NetInfo.addEventListener.mock.calls.length;
    const appStateSubscriptions = AppState.addEventListener.mock.calls.length;
    const netInfoUnsubscribe = NetInfo.addEventListener.mock.results[0].value;
    const appStateRemove = AppState.addEventListener.mock.results[0].value.remove;

    getSyncStatus.mockResolvedValue({
      unsyncedCount: 5,
      readyCount: 5,
      inFlightCount: 1,
      waitingCount: 6,
      needsAttentionCount: 2,
      backedOffCount: 0,
      nextRetryAt: '2099-01-01T00:00:00.000Z',
      failedCount: 2,
      failedItems: [],
      needsAttentionItems: [],
      breakdown: { sessions: 5 },
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
    await act(async () => {
      await result.current.refreshSyncStatus({ autoTrigger: false });
    });

    expect(NetInfo.addEventListener.mock.calls.length).toBe(netInfoSubscriptions);
    expect(AppState.addEventListener.mock.calls.length).toBe(appStateSubscriptions);
    expect(netInfoUnsubscribe).not.toHaveBeenCalled();
    expect(appStateRemove).not.toHaveBeenCalled();
    expect(result.current.waitingCount).toBe(6);
    expect(result.current.needsAttentionCount).toBe(2);
    expect(result.current.nextRetryAt).toBe('2099-01-01T00:00:00.000Z');
  });

  test('reconnecting with ready work still schedules a background sync', async () => {
    const { result } = await renderOfflineHook();
    getSyncStatus.mockResolvedValue({
      unsyncedCount: 2,
      readyCount: 2,
      inFlightCount: 0,
      waitingCount: 2,
      needsAttentionCount: 0,
      backedOffCount: 0,
      nextRetryAt: null,
      failedCount: 0,
      failedItems: [],
      needsAttentionItems: [],
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
      listener({ isConnected: false, isInternetReachable: false });
      listener({ isConnected: true, isInternetReachable: true });
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(syncAll).toHaveBeenCalledTimes(1);
  });

  test('reconnecting requests one domain pull when either pull stamp is missing', async () => {
    const { result } = await renderOfflineHook();
    const listener = NetInfo.addEventListener.mock.calls[0][0];

    await act(async () => {
      listener({ isConnected: false, isInternetReachable: false });
      listener({ isConnected: true, isInternetReachable: true });
      await Promise.resolve();
    });

    expect(syncStateRepository.getPullState).toHaveBeenCalledWith('child_data_pull');
    expect(syncStateRepository.getPullState).toHaveBeenCalledWith('classes_pull');
    expect(result.current.domainPullNonce).toBe(1);
  });

  test('reconnecting does not request a domain pull when both stamps are fresh', async () => {
    const freshState = { lastPulledAt: new Date(Date.now() - 1000).toISOString() };
    syncStateRepository.getPullState.mockResolvedValue(freshState);
    const { result } = await renderOfflineHook();
    const listener = NetInfo.addEventListener.mock.calls[0][0];

    await act(async () => {
      listener({ isConnected: false, isInternetReachable: false });
      listener({ isConnected: true, isInternetReachable: true });
      await Promise.resolve();
    });

    expect(result.current.domainPullNonce).toBe(0);
  });

  test('foregrounding requests one domain pull when either pull stamp is stale', async () => {
    const freshState = { lastPulledAt: new Date(Date.now() - 1000).toISOString() };
    const staleState = { lastPulledAt: new Date(Date.now() - (16 * 60 * 1000)).toISOString() };
    syncStateRepository.getPullState
      .mockResolvedValueOnce(freshState)
      .mockResolvedValueOnce(staleState);
    const { result } = await renderOfflineHook();
    const listener = AppState.addEventListener.mock.calls.at(-1)[1];

    await act(async () => {
      listener('background');
      listener('active');
      await Promise.resolve();
    });

    expect(result.current.domainPullNonce).toBe(1);
  });

  test('foregrounding does not request a domain pull when both stamps are fresh', async () => {
    const freshState = { lastPulledAt: new Date(Date.now() - 1000).toISOString() };
    syncStateRepository.getPullState.mockResolvedValue(freshState);
    const { result } = await renderOfflineHook();
    const listener = AppState.addEventListener.mock.calls.at(-1)[1];

    await act(async () => {
      listener('background');
      listener('active');
      await Promise.resolve();
    });

    expect(result.current.domainPullNonce).toBe(0);
  });

  test('reconnecting with only backed-off work does not schedule a background sync', async () => {
    const { result } = await renderOfflineHook();
    getSyncStatus.mockResolvedValue({
      unsyncedCount: 2,
      readyCount: 0,
      inFlightCount: 0,
      waitingCount: 2,
      needsAttentionCount: 0,
      backedOffCount: 2,
      nextRetryAt: '2099-01-01T00:00:00.000Z',
      failedCount: 2,
      failedItems: [],
      needsAttentionItems: [],
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
      listener({ isConnected: false, isInternetReachable: false });
      listener({ isConnected: true, isInternetReachable: true });
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(syncAll).not.toHaveBeenCalled();
  });

  test('foregrounding with only backed-off work does not schedule a background sync', async () => {
    const { result } = await renderOfflineHook();
    getSyncStatus.mockResolvedValue({
      unsyncedCount: 2,
      readyCount: 0,
      inFlightCount: 0,
      waitingCount: 2,
      needsAttentionCount: 0,
      backedOffCount: 2,
      nextRetryAt: '2099-01-01T00:00:00.000Z',
      failedCount: 2,
      failedItems: [],
      needsAttentionItems: [],
      breakdown: { sessions: 2 },
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
    await act(async () => {
      await result.current.refreshSyncStatus({ autoTrigger: false });
    });
    syncAll.mockClear();

    const listener = AppState.addEventListener.mock.calls.at(-1)[1];
    act(() => {
      listener('background');
      listener('active');
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(syncAll).not.toHaveBeenCalled();
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

    test('an initial session refreshes status for that owner', async () => {
      await renderOfflineHook();

      await emitAuthEvent('INITIAL_SESSION', { user: { id: 'ea-a' } });

      expect(getSyncStatus).toHaveBeenLastCalledWith({ ownerUserId: 'ea-a' });
    });

    test('an A-to-B auth transition replaces the visible status owner', async () => {
      await renderOfflineHook();
      await emitAuthEvent('SIGNED_IN', { user: { id: 'ea-a' } });
      getSyncStatus.mockClear();

      await emitAuthEvent('SIGNED_IN', { user: { id: 'ea-b' } });

      expect(getSyncStatus).toHaveBeenCalledWith({ ownerUserId: 'ea-b' });
      expect(getSyncStatus).not.toHaveBeenCalledWith({ ownerUserId: 'ea-a' });
    });

    test('sign-out refreshes status with a null owner', async () => {
      await renderOfflineHook();
      await emitAuthEvent('SIGNED_IN', { user: { id: 'ea-a' } });
      getSyncStatus.mockClear();

      await emitAuthEvent('SIGNED_OUT', null);

      expect(getSyncStatus).toHaveBeenCalledWith({ ownerUserId: null });
    });
  });

  test('exposes waitingCount, needsAttentionCount, and nextRetryAt from sync status', async () => {
    const { result } = await renderOfflineHook();
    getSyncStatus.mockResolvedValueOnce({
      unsyncedCount: 3,
      readyCount: 0,
      inFlightCount: 0,
      waitingCount: 3,
      needsAttentionCount: 2,
      backedOffCount: 1,
      nextRetryAt: '2099-01-01T00:00:00.000Z',
      failedItems: [],
      needsAttentionItems: [],
      breakdown: {},
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
    syncAll.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      await result.current.refreshSyncStatus();
    });

    expect(result.current.waitingCount).toBe(3);
    expect(result.current.needsAttentionCount).toBe(2);
    expect(result.current.nextRetryAt).toBe('2099-01-01T00:00:00.000Z');
  });
});
