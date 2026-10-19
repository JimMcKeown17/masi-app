import React from 'react';
import { AllProviders } from '../test-support/renderWithProviders';
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTimeTracking } from '../src/hooks/useTimeTracking';
import { TimeTrackingProvider } from '../src/context/TimeTrackingContext';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { getCurrentPosition } from '../src/services/locationService';
import { timeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../src/context/OfflineContext', () => ({
  useOffline: jest.fn(),
}));

jest.mock('../src/services/locationService', () => ({
  getCurrentPosition: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'time-entry-1'),
}));

jest.mock('../src/db/repositories/timeEntriesRepository', () => ({
  ...jest.requireActual('../src/db/repositories/timeEntriesRepository'),
  OPEN_TIME_ENTRY_EXISTS: 'OPEN_TIME_ENTRY_EXISTS',
  timeEntriesRepository: {
    getActiveTimeEntry: jest.fn(),
    saveTimeEntry: jest.fn(),
    createOpenTimeEntry: jest.fn(),
    closeOpenTimeEntry: jest.fn(),
  },
}));

const wrapper = ({ children }) => <AllProviders><TimeTrackingProvider>{children}</TimeTrackingProvider></AllProviders>;

describe('useTimeTracking Plan 5 behavior', () => {
  const refreshSyncStatus = jest.fn();
  const triggerBackgroundSync = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-21T08:00:00.000Z'));

    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({
      refreshSyncStatus,
      triggerBackgroundSync,
    });
    getCurrentPosition.mockResolvedValue({
      status: 'fix',
      coords: {
        latitude: -34.1,
        longitude: 18.4,
      },
    });
    timeEntriesRepository.getActiveTimeEntry.mockResolvedValue(null);
    timeEntriesRepository.saveTimeEntry.mockResolvedValue(true);
    timeEntriesRepository.createOpenTimeEntry.mockResolvedValue(true);
    timeEntriesRepository.closeOpenTimeEntry.mockImplementation(async (id, fields) => ({ ...openEntry, id, ...fields }));
    refreshSyncStatus.mockResolvedValue({ unsyncedCount: 1 });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('clock-in writes to the time entries repository and triggers background sync', async () => {
    const { result } = renderHook(() => useTimeTracking(), { wrapper });

    await waitFor(() => expect(timeEntriesRepository.getActiveTimeEntry).toHaveBeenCalledWith('user-1'));

    await act(async () => {
      await result.current.handleSignIn();
    });

    expect(timeEntriesRepository.createOpenTimeEntry).toHaveBeenCalledWith(expect.objectContaining({
      id: 'time-entry-1',
      user_id: 'user-1',
      sign_in_time: '2026-05-21T08:00:00.000Z',
      sign_in_lat: -34.1,
      sign_in_lon: 18.4,
      sign_out_time: null,
      synced: false,
    }));
    expect(result.current.isSignedIn).toBe(true);
    expect(refreshSyncStatus).toHaveBeenCalled();
    expect(triggerBackgroundSync).toHaveBeenCalled();
  });

  test('two consumers under one provider share a single clock-in truth', async () => {
    timeEntriesRepository.getActiveTimeEntry.mockResolvedValue(null);
    timeEntriesRepository.createOpenTimeEntry.mockResolvedValue(true);
    getCurrentPosition.mockResolvedValue({ coords: { latitude: -33.9, longitude: 25.6 } });

    const { result } = renderHook(
      () => ({ home: useTimeTracking(), timeTracking: useTimeTracking() }),
      { wrapper },
    );

    // Let the mount-time loadActiveEntry consume its mocked call first, so the
    // sign-in path cannot race it for the queued mock results.
    await waitFor(() => expect(timeEntriesRepository.getActiveTimeEntry).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.timeTracking.handleSignIn();
    });

    expect(result.current.home.isSignedIn).toBe(true);
    expect(result.current.home.activeEntry).toBe(result.current.timeTracking.activeEntry);
  });

  test('a conflicting open entry recovers state instead of double-clocking-in', async () => {
    timeEntriesRepository.getActiveTimeEntry
      .mockResolvedValueOnce(null) // initial mount load
      .mockResolvedValue({ id: 'existing-entry', user_id: 'user-1', sign_in_time: new Date().toISOString(), sign_out_time: null });
    getCurrentPosition.mockResolvedValue({ coords: { latitude: -33.9, longitude: 25.6 } });
    const conflict = new Error('open entry exists');
    conflict.code = 'OPEN_TIME_ENTRY_EXISTS';
    timeEntriesRepository.createOpenTimeEntry.mockRejectedValue(conflict);

    const { result } = renderHook(() => useTimeTracking(), { wrapper });

    // Wait out the mount-time load so its mockResolvedValueOnce(null) is
    // consumed before sign-in's conflict recovery re-queries.
    await waitFor(() => expect(timeEntriesRepository.getActiveTimeEntry).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.handleSignIn();
    });

    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.activeEntry?.id).toBe('existing-entry');
  });

  test('clock-out with no open entry resets state without writing', async () => {
    timeEntriesRepository.getActiveTimeEntry
      .mockResolvedValueOnce({ id: 'stale-entry', user_id: 'user-1', sign_in_time: new Date().toISOString(), sign_out_time: null }) // mount
      .mockResolvedValue(null); // re-resolve at clock-out: already closed elsewhere
    getCurrentPosition.mockResolvedValue({ coords: { latitude: -33.9, longitude: 25.6 } });

    const { result } = renderHook(() => useTimeTracking(), { wrapper });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    await act(async () => {
      expect(await result.current.handleSignOut()).toBe(true);
    });

    expect(timeEntriesRepository.closeOpenTimeEntry).not.toHaveBeenCalled();
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.activeEntry).toBeNull();
  });

  const openEntry = {
    id: 'open-entry', user_id: 'user-1',
    sign_in_time: '2026-05-21T07:00:00.000Z', sign_out_time: null,
  };

  test('clock-out resolves true after closing the open entry', async () => {
    timeEntriesRepository.getActiveTimeEntry.mockResolvedValue(openEntry);
    const { result } = renderHook(() => useTimeTracking(), { wrapper });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    // waitFor advances fake timers while the provider loads; pin the clock at the tap.
    jest.setSystemTime(new Date('2026-05-21T08:00:00.000Z'));

    await act(async () => {
      expect(await result.current.handleSignOut()).toBe(true);
    });

    expect(timeEntriesRepository.closeOpenTimeEntry).toHaveBeenCalledWith('open-entry', expect.objectContaining({
      sign_out_time: '2026-05-21T08:00:00.000Z',
    }));
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.activeEntry).toBeNull();
  });

  test('clock-out resolves true when already not clocked in', async () => {
    const { result } = renderHook(() => useTimeTracking(), { wrapper });
    await waitFor(() => expect(timeEntriesRepository.getActiveTimeEntry).toHaveBeenCalledTimes(1));

    await act(async () => {
      expect(await result.current.handleSignOut()).toBe(true);
    });

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(timeEntriesRepository.closeOpenTimeEntry).not.toHaveBeenCalled();
  });

  test('clock-out resolves false on the Settings detour and leaves the entry open', async () => {
    timeEntriesRepository.getActiveTimeEntry.mockResolvedValue(openEntry);
    getCurrentPosition.mockResolvedValue({ cancelled: true });
    const { result } = renderHook(() => useTimeTracking(), { wrapper });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    await act(async () => {
      expect(await result.current.handleSignOut()).toBe(false);
    });

    expect(timeEntriesRepository.closeOpenTimeEntry).not.toHaveBeenCalled();
    expect(result.current.isSignedIn).toBe(true);
  });

  test('clock-out resolves false for a duplicate tap while location is pending', async () => {
    let resolveLocation;
    getCurrentPosition.mockReturnValue(new Promise((resolve) => { resolveLocation = resolve; }));
    timeEntriesRepository.getActiveTimeEntry.mockResolvedValue(openEntry);
    const { result } = renderHook(() => useTimeTracking(), { wrapper });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    let firstClockOut;
    act(() => { firstClockOut = result.current.handleSignOut(); });
    let duplicateResult;
    await act(async () => { duplicateResult = await result.current.handleSignOut(); });
    await act(async () => {
      resolveLocation({ coords: { latitude: -34.1, longitude: 18.4 }, status: 'fix' });
      await firstClockOut;
    });

    expect(duplicateResult).toBe(false);
    expect(timeEntriesRepository.closeOpenTimeEntry).toHaveBeenCalledTimes(1);
  });

  test('clock-out resolves false when persistence fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    timeEntriesRepository.getActiveTimeEntry.mockResolvedValue(openEntry);
    timeEntriesRepository.closeOpenTimeEntry.mockRejectedValueOnce(new Error('write failed'));
    const { result } = renderHook(() => useTimeTracking(), { wrapper });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    try {
      await act(async () => {
        expect(await result.current.handleSignOut()).toBe(false);
      });
      expect(result.current.isSignedIn).toBe(true);
    } finally {
      consoleError.mockRestore();
    }
  });
});
