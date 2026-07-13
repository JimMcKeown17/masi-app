import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TimeEntriesListScreen from '../src/screens/main/TimeEntriesListScreen';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { timeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/timeEntriesRepository', () => ({
  timeEntriesRepository: { getTimeEntries: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const entry = {
  id: 'entry-1',
  user_id: 'user-1',
  sign_in_time: '2026-05-21T08:00:00.000Z',
  sign_out_time: '2026-05-21T11:00:00.000Z',
  synced: false,
};

const renderScreen = () => render(
  <SafeAreaProvider><TimeEntriesListScreen /></SafeAreaProvider>
);

const pullToRefresh = async (getByTestId) => {
  await act(async () => {
    await getByTestId('time-entries-scroll').props.refreshControl.props.onRefresh();
  });
};

describe('TimeEntriesListScreen sync-voice snackbars', () => {
  const mockSync = (result) => {
    useOffline.mockReturnValue({
      isOnline: true,
      syncNow: jest.fn(async () => result),
      refreshSyncStatus: jest.fn(),
    });
  };

  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    timeEntriesRepository.getTimeEntries.mockResolvedValue([entry]);
  });

  afterEach(() => jest.clearAllMocks());

  test('a retriable-only backlog shows the presenter waiting message, never "failed" or "entries"', async () => {
    mockSync({ success: true, totalSynced: 0, totalFailed: 2, totalTerminal: 0, totalRetriable: 2 });
    const { getByTestId, getByText, queryByText } = renderScreen();
    await waitFor(() => expect(getByText('Work History')).toBeTruthy());

    await pullToRefresh(getByTestId);

    // Exact presenter copy: the counts are pass-level (all tables), so no "entries" claim.
    expect(getByText('Saved on your phone · 2 waiting to sync')).toBeTruthy();
    expect(queryByText(/failed/i)).toBeNull();
    expect(timeEntriesRepository.getTimeEntries).toHaveBeenCalledTimes(2);
    expect(timeEntriesRepository.getTimeEntries.mock.calls[1]).toEqual(
      timeEntriesRepository.getTimeEntries.mock.calls[0]
    );
  });

  test('terminal failures show the presenter needs-attention message', async () => {
    mockSync({ success: false, totalSynced: 0, totalFailed: 1, totalTerminal: 1, totalRetriable: 0 });
    const { getByTestId, getByText } = renderScreen();
    await waitFor(() => expect(getByText('Work History')).toBeTruthy());

    await pullToRefresh(getByTestId);

    expect(getByText('1 item needs attention')).toBeTruthy();
  });

  test('synced count says items, not entries (counts are pass-level)', async () => {
    mockSync({ success: true, totalSynced: 3, totalFailed: 0, totalTerminal: 0, totalRetriable: 0 });
    const { getByTestId, getByText } = renderScreen();
    await waitFor(() => expect(getByText('Work History')).toBeTruthy());

    await pullToRefresh(getByTestId);

    expect(getByText('3 items synced')).toBeTruthy();
  });
});
