import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTimeTracking } from '../src/hooks/useTimeTracking';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { getCurrentPosition } from '../src/services/locationService';
import { timeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';
import { storage } from '../src/utils/storage';

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
  timeEntriesRepository: {
    getActiveTimeEntry: jest.fn(),
    saveTimeEntry: jest.fn(),
    updateTimeEntry: jest.fn(),
  },
}));

jest.mock('../src/utils/storage', () => ({
  storage: {
    getTimeEntries: jest.fn(),
    saveTimeEntry: jest.fn(),
    updateTimeEntry: jest.fn(),
  },
}));

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
      coords: {
        latitude: -34.1,
        longitude: 18.4,
      },
    });
    timeEntriesRepository.getActiveTimeEntry.mockResolvedValue(null);
    timeEntriesRepository.saveTimeEntry.mockResolvedValue(true);
    timeEntriesRepository.updateTimeEntry.mockResolvedValue(true);
    refreshSyncStatus.mockResolvedValue({ unsyncedCount: 1 });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('clock-in writes to the time entries repository and triggers background sync', async () => {
    const { result } = renderHook(() => useTimeTracking());

    await waitFor(() => expect(timeEntriesRepository.getActiveTimeEntry).toHaveBeenCalledWith('user-1'));

    await act(async () => {
      await result.current.handleSignIn();
    });

    expect(timeEntriesRepository.saveTimeEntry).toHaveBeenCalledWith(expect.objectContaining({
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
    expect(storage.saveTimeEntry).not.toHaveBeenCalled();
  });
});
