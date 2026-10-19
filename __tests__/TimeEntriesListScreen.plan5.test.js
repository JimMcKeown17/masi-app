jest.mock('@expo/vector-icons', () => new Proxy({}, {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (!target[prop]) target[prop] = () => null;
    return target[prop];
  },
}), { virtual: true });
import { StyleSheet } from 'react-native';
import { colors } from '../src/constants/colors';
import StatusBadge from '../src/components/common/StatusBadge';
import { renderWithProviders as render } from '../test-support/renderWithProviders';
import React from 'react';
import { waitFor } from '@testing-library/react-native';
import { ScrollView, SectionList } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TimeEntriesListScreen from '../src/screens/main/TimeEntriesListScreen';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { timeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';
import { supabase } from '../src/services/supabaseClient';

jest.mock('@react-navigation/native', () => ({
  NavigationContext: require('react').createContext(undefined),
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
  ...jest.requireActual('../src/db/repositories/timeEntriesRepository'),
  timeEntriesRepository: {
    getTimeEntries: jest.fn(),
  },
}));

jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'),
  supabase: {
    from: jest.fn(),
  },
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
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test.each([false, true])('work history preserves its bottom gap with 48dp inset (empty: %s)', async (empty) => {
    if (empty) timeEntriesRepository.getTimeEntries.mockResolvedValue([]);
    const screen = render(<TimeEntriesListScreen />, {
      insets: { top: 24, right: 0, bottom: 48, left: 0 },
    });
    await screen.findByText(empty ? 'No Time Entries Yet' : 'Work History');
    const content = screen.UNSAFE_getByType(empty ? ScrollView : SectionList).props.contentContainerStyle;
    expect(StyleSheet.flatten(content)).toMatchObject({
      padding: empty ? 32 : 16,
      paddingBottom: empty ? 80 : 64,
    });
  });

  test('load failures in the empty branch appear in the root toast', async () => {
    timeEntriesRepository.getTimeEntries.mockRejectedValueOnce(new Error('read failed'));
    const screen = render(<TimeEntriesListScreen />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to load entries'));
    expect(screen.getByRole('button', { name: 'Dismiss message' })).toBeTruthy();
  });

  test('shows No location for both ends of a completed shift without coordinates', async () => {
    timeEntriesRepository.getTimeEntries.mockResolvedValue([{
      id: 'no-location', user_id: 'user-1', sign_in_time: '2026-10-15T08:00:00Z',
      sign_out_time: '2026-10-15T09:00:00Z', sign_in_lat: null, sign_in_lon: null,
      sign_out_lat: null, sign_out_lon: null, sign_in_location_status: 'timeout',
      sign_out_location_status: 'unavailable', synced: false,
    }]);
    const screen = render(<SafeAreaProvider><TimeEntriesListScreen /></SafeAreaProvider>);
    await waitFor(() => expect(screen.getAllByText('No location')).toHaveLength(2));
    expect(screen.getByText('1.00')).toBeTruthy();
  });

  test('loads completed work history from SQLite without screen-owned Supabase or storage pulls', async () => {
    const { getByText, queryByText, UNSAFE_getByType } = render(
      <SafeAreaProvider>
        <TimeEntriesListScreen />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(getByText('Work History')).toBeTruthy());

    expect(getByText('3.00')).toBeTruthy();
    expect(getByText('Unsynced')).toBeTruthy();
    expect(UNSAFE_getByType(StatusBadge).props.tone).toBe('warning');
    let badge = getByText('Unsynced').parent;
    while (badge.type !== 'View') badge = badge.parent;
    expect(StyleSheet.flatten(badge.props.style).backgroundColor).toBe(colors.warningBg);
    expect(getByText('Showing last 60 days')).toBeTruthy();
    expect(UNSAFE_getByType(SectionList).props.sections).toEqual([
      expect.objectContaining({ title: '2026-05-21' }),
    ]);
    expect(queryByText('No Time Entries Yet')).toBeNull();
    expect(timeEntriesRepository.getTimeEntries).toHaveBeenCalledTimes(1);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('groups a 00:30 SAST entry under its local day and marks that day as today', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-11T22:45:00.000Z'));
    timeEntriesRepository.getTimeEntries.mockResolvedValue([{
      id: 'entry-boundary',
      user_id: 'user-1',
      sign_in_time: '2026-07-11T22:30:00.000Z',
      sign_out_time: '2026-07-11T23:30:00.000Z',
      synced: true,
    }]);

    const { getByText } = render(
      <SafeAreaProvider>
        <TimeEntriesListScreen />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(getByText('Sunday, Jul 12, 2026')).toBeTruthy());
    expect(getByText('Today')).toBeTruthy();
    expect(timeEntriesRepository.getTimeEntries).toHaveBeenCalledWith({
      userId: 'user-1',
      sinceIso: '2026-05-12T22:00:00.000Z',
    });
  });
});
