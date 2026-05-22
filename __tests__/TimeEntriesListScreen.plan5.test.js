import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TimeEntriesListScreen from '../src/screens/main/TimeEntriesListScreen';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { timeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';
import { supabase } from '../src/services/supabaseClient';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../src/context/OfflineContext', () => ({
  useOffline: jest.fn(),
}));

jest.mock('../src/db/repositories/timeEntriesRepository', () => ({
  timeEntriesRepository: {
    getTimeEntries: jest.fn(),
  },
}));

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('TimeEntriesListScreen Plan 5 behavior', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({
      isOnline: true,
      syncNow: jest.fn(async () => ({ totalSynced: 0, totalFailed: 0 })),
      refreshSyncStatus: jest.fn(),
    });
    timeEntriesRepository.getTimeEntries.mockResolvedValue([
      {
        id: 'entry-1',
        user_id: 'user-1',
        sign_in_time: '2026-05-21T08:00:00.000Z',
        sign_in_lat: -34.1,
        sign_in_lon: 18.4,
        sign_out_time: '2026-05-21T11:00:00.000Z',
        sign_out_lat: -34.2,
        sign_out_lon: 18.5,
        synced: false,
      },
      {
        id: 'entry-active',
        user_id: 'user-1',
        sign_in_time: '2026-05-21T12:00:00.000Z',
        sign_in_lat: -34.1,
        sign_in_lon: 18.4,
        sign_out_time: null,
        synced: false,
      },
      {
        id: 'entry-other-user',
        user_id: 'user-2',
        sign_in_time: '2026-05-21T08:00:00.000Z',
        sign_out_time: '2026-05-21T10:00:00.000Z',
        synced: true,
      },
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('loads completed work history from SQLite without screen-owned Supabase or storage pulls', async () => {
    const { getByText, queryByText } = render(
      <SafeAreaProvider>
        <TimeEntriesListScreen />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(getByText('Work History')).toBeTruthy());

    expect(getByText('3.00')).toBeTruthy();
    expect(getByText('Unsynced')).toBeTruthy();
    expect(queryByText('No Time Entries Yet')).toBeNull();
    expect(timeEntriesRepository.getTimeEntries).toHaveBeenCalledTimes(1);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
