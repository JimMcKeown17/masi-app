jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 'balanced' },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
const mockRefreshSyncStatus = jest.fn();
const mockTriggerBackgroundSync = jest.fn();
jest.mock('../src/context/OfflineContext', () => ({
  useOffline: () => ({ refreshSyncStatus: mockRefreshSyncStatus, triggerBackgroundSync: mockTriggerBackgroundSync }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

import React from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AllProviders } from '../test-support/renderWithProviders';
import { TimeTrackingProvider } from '../src/context/TimeTrackingContext';
import LockedBottomTabBar from '../src/components/navigation/LockedBottomTabBar';
import { initializeTestDatabase } from '../test-support/testDatabase';
import { timeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';

const state = {
  index: 0,
  routes: ['Home', 'Children', 'Insights', 'Assessments'].map(name => ({ key: name, name })),
};
const navigation = { navigate: jest.fn(), emit: jest.fn() };
const POSITION = { coords: { latitude: -33.9, longitude: 25.6, accuracy: 50 }, timestamp: 1000 };
const flush = async () => { for (let i = 0; i < 80; i += 1) await Promise.resolve(); };

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-25T06:00:00Z'));
  jest.clearAllMocks();
  Object.values(Location).forEach(value => value?.mockReset?.());
  // The shared harness opens separate writer/reader connections backed by better-sqlite3.
  const db = await initializeTestDatabase();
  // Exercise the real programme gate as well as the real clock-status query.
  await db.runAsync("insert into programmes (id, code, name) values ('literacy', 'literacy', 'Core Literacy')");
  await db.runAsync("insert into staff_programme_assignments (id, user_id, programme_id) values ('assignment-1', 'user-1', 'literacy')");
  Location.hasServicesEnabledAsync.mockResolvedValue(true);
  Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.getCurrentPositionAsync.mockResolvedValue(POSITION);
  Location.getLastKnownPositionAsync.mockResolvedValue(null);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openSettings').mockResolvedValue();
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const openSheet = async () => {
  const screen = render(<AllProviders><TimeTrackingProvider>
    <LockedBottomTabBar state={state} descriptors={{}} navigation={navigation} />
  </TimeTrackingProvider></AllProviders>);
  await act(flush);
  fireEvent.press(screen.getByLabelText('Record a session'));
  await screen.findByText('You are not clocked in.');
  return screen;
};

test.each([
  ['timeout', null, null],
  ['fix', POSITION.coords.latitude, POSITION.coords.longitude],
])('Record > Clock in now persists one %s shift and opens the session form', async (status, latitude, longitude) => {
  if (status === 'timeout') Location.getCurrentPositionAsync.mockRejectedValue({ code: 'E_LOCATION_TIMEOUT' });
  const screen = await openSheet();
  fireEvent.press(screen.getByRole('button', { name: 'Clock in now' }));
  expect(screen.getByRole('button', { name: 'Clocking in…' }).props.accessibilityState.busy).toBe(true);
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('SessionForm'));
  expect(navigation.navigate).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('You are not clocked in.')).toBeNull();
  const entries = await timeEntriesRepository.getTimeEntries({ userId: 'user-1' });
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    sign_out_time: null, sign_in_location_status: status, sign_in_lat: latitude, sign_in_lon: longitude,
  });
  expect(await timeEntriesRepository.getActiveTimeEntry('user-1')).toMatchObject({ id: entries[0].id });
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  if (status === 'timeout') expect(screen.getByText('Clocked in without location (GPS timed out).')).toBeTruthy();
});

test('cancel, reopen and tap again while GPS is still searching joins the running clock-in', async () => {
  let resolveLocation;
  Location.getCurrentPositionAsync.mockReturnValue(new Promise(resolve => { resolveLocation = resolve; }));
  const screen = await openSheet();
  fireEvent.press(screen.getByRole('button', { name: 'Clock in now' }));
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByText('You are not clocked in.')).toBeNull();

  fireEvent.press(screen.getByLabelText('Record a session'));
  await screen.findByText('You are not clocked in.');
  fireEvent.press(screen.getByRole('button', { name: 'Clock in now' }));
  expect(screen.getByRole('button', { name: 'Clocking in…' }).props.accessibilityState.busy).toBe(true);

  await act(async () => { resolveLocation(POSITION); await flush(); });
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('SessionForm'));
  expect(navigation.navigate).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('You are not clocked in.')).toBeNull();
  expect(await timeEntriesRepository.getTimeEntries({ userId: 'user-1' })).toHaveLength(1);
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
});

test('Settings hand-off creates no shift and keeps the clock-in sheet open', async () => {
  Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
  const screen = await openSheet();
  fireEvent.press(screen.getByRole('button', { name: 'Clock in now' }));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
  await act(async () => {
    Alert.alert.mock.calls[0][2].find(action => action.text === 'Open Settings').onPress();
    await flush();
  });
  expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  expect(await timeEntriesRepository.getTimeEntries({ userId: 'user-1' })).toEqual([]);
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(screen.getByText('You are not clocked in.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Clock in now' }).props.accessibilityState).toMatchObject({ busy: false, disabled: false });
  expect(screen.getByText('Return from Settings and tap Clock In again, or continue without location.')).toBeTruthy();
});
