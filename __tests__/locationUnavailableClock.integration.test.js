jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
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

import React from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import { act, renderHook, cleanup } from '@testing-library/react-native';
import { __reset, __setDatabaseFactory } from 'expo-sqlite';
import { TimeTrackingProvider, useTimeTracking } from '../src/context/TimeTrackingContext';
import { closeDefaultTestHandle, initializeTestDatabase } from '../test-support/testDatabase';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { timeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';

const wrapper = ({ children }) => <TimeTrackingProvider>{children}</TimeTrackingProvider>;
const POSITION = { coords: { latitude: -33.9, longitude: 25.6, accuracy: 50 }, timestamp: 1000 };
let db;
const flush = async () => { for (let i = 0; i < 80; i += 1) await Promise.resolve(); };
const mount = async () => {
  const hook = renderHook(() => useTimeTracking(), { wrapper });
  await act(flush);
  return hook.result;
};
const seedSynced = async () => timeEntriesRepository.saveTimeEntry({
  id: 'synced-shift', user_id: 'user-1',
  sign_in_time: new Date(Date.now() - 3600000).toISOString(),
  sign_in_lat: -33.9, sign_in_lon: 25.6, synced: true,
});
const outbox = () => db.getAllAsync("select operation, payload from sync_outbox where table_name = 'time_entries'");

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-15T08:00:00Z'));
  jest.clearAllMocks();
  Object.values(Location).forEach(value => value?.mockReset?.());
  await closeDefaultTestHandle();
  __reset();
  db = createBetterSqliteTestDatabase();
  __setDatabaseFactory(async () => db);
  await initializeTestDatabase();
  await initializeTestDatabase();
  Location.hasServicesEnabledAsync.mockResolvedValue(true);
  Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.getCurrentPositionAsync.mockResolvedValue(POSITION);
  Location.getLastKnownPositionAsync.mockResolvedValue(null);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openSettings').mockResolvedValue();
});
afterEach(async () => {
  cleanup();
  await closeDefaultTestHandle();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('unavailable location closes a synced shift and enqueues one update with the reason', async () => {
  await seedSynced();
  Location.getCurrentPositionAsync.mockRejectedValue({ code: 'E_LOCATION_UNAVAILABLE' });
  const result = await mount();
  expect(result.current.isSignedIn).toBe(true);
  await act(async () => { await result.current.handleSignOut(); });
  expect(result.current.isSignedIn).toBe(false);
  const [entry] = await timeEntriesRepository.getTimeEntries({ userId: 'user-1' });
  expect(entry).toMatchObject({ sign_out_lat: null, sign_out_lon: null, sign_out_location_status: 'unavailable' });
  expect(entry.sign_out_time).toBeTruthy();
  const queued = await outbox();
  expect(queued).toHaveLength(1);
  expect(queued[0].operation).toBe('update');
  expect(JSON.parse(queued[0].payload)).toMatchObject({
    id: entry.id, sign_out_lat: null, sign_out_lon: null, sign_out_location_status: 'unavailable',
  });
  expect(result.current.snackbarMessage).toBe('Clocked out without location. 1.00 hours worked.');
});

test('airplane-mode clock-in finishes at the deadline and queues one null-pair timeout insert', async () => {
  Location.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
  const result = await mount();
  let pending;
  await act(async () => { pending = result.current.handleSignIn(); await flush(); });
  expect(result.current.loadingLocation).toBe(true);
  expect(await outbox()).toEqual([]);
  await act(async () => { await jest.advanceTimersByTimeAsync(9999); });
  expect(result.current.isSignedIn).toBe(false);
  await act(async () => { await jest.advanceTimersByTimeAsync(1); await pending; });
  expect(result.current.isSignedIn).toBe(true);
  expect(result.current.loadingLocation).toBe(false);
  const [entry] = await timeEntriesRepository.getTimeEntries({ userId: 'user-1' });
  const expected = { sign_in_lat: null, sign_in_lon: null, sign_in_location_status: 'timeout' };
  expect(entry).toMatchObject(expected);
  const queued = await outbox();
  expect(queued).toHaveLength(1);
  expect(queued[0].operation).toBe('insert');
  expect(JSON.parse(queued[0].payload)).toMatchObject(expected);
  expect(result.current.snackbarMessage).toBe('Clocked in without location (GPS timed out).');
});

test.each(['In', 'Out'])('double tap Clock %s starts only one capture and queues one write', async action => {
  if (action === 'Out') await seedSynced();
  let resolveLocation;
  Location.getCurrentPositionAsync.mockImplementation(() => new Promise(resolve => { resolveLocation = resolve; }));
  const result = await mount();
  let first, second;
  await act(async () => {
    first = result.current[`handleSign${action}`]();
    second = result.current[`handleSign${action}`]();
    await flush();
  });
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  await act(async () => { resolveLocation(POSITION); await Promise.all([first, second]); });
  expect(await outbox()).toHaveLength(1);
});

test.each([
  ['denied', 'permission denied'],
  ['services_off', 'location services off'],
  ['unavailable', 'location unavailable'],
])('clock-in records %s and tells the EA why', async (status, reason) => {
  if (status === 'denied') {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
    Alert.alert.mockImplementation((_title, _message, actions) => actions.find(item => item.text === 'Continue Without Location').onPress());
  } else if (status === 'services_off') Location.hasServicesEnabledAsync.mockResolvedValue(false);
  else Location.getCurrentPositionAsync.mockRejectedValue(new Error('native failure'));
  const result = await mount();
  await act(async () => { await result.current.handleSignIn(); });
  const [entry] = await timeEntriesRepository.getTimeEntries({ userId: 'user-1' });
  expect(entry).toMatchObject({ sign_in_lat: null, sign_in_lon: null, sign_in_location_status: status });
  expect(result.current.isSignedIn).toBe(true);
  expect(result.current.snackbarMessage).toBe(`Clocked in without location (${reason}).`);
  expect(await outbox()).toHaveLength(1);
});

test.each(['In', 'Out'])('Settings handoff from Clock %s writes nothing; a fresh tap rechecks permission', async action => {
  if (action === 'Out') await seedSynced();
  Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
  const result = await mount();
  const before = await timeEntriesRepository.getTimeEntries({ userId: 'user-1' });
  let pending;
  await act(async () => { pending = result.current[`handleSign${action}`](); await flush(); });
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  await act(async () => {
    const settings = Alert.alert.mock.calls[0][2].find(item => item.text === 'Open Settings');
    settings.onPress(); settings.onPress();
    await pending;
  });
  expect(await timeEntriesRepository.getTimeEntries({ userId: 'user-1' })).toEqual(before);
  expect(await outbox()).toEqual([]);
  expect(result.current.loadingLocation).toBe(false);
  expect(result.current.snackbarMessage).toBe(`Return from Settings and tap Clock ${action} again, or continue without location.`);
  expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(mockTriggerBackgroundSync).not.toHaveBeenCalled();
  Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  await act(async () => { await result.current[`handleSign${action}`](); });
  expect(Location.getForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
  expect(await outbox()).toHaveLength(1);
});

test('an entry closed during capture is not overwritten by manual clock-out', async () => {
  await seedSynced();
  let resolveLocation;
  Location.getCurrentPositionAsync.mockImplementation(() => new Promise(resolve => { resolveLocation = resolve; }));
  const result = await mount();
  let pending;
  await act(async () => { pending = result.current.handleSignOut(); await flush(); });
  await timeEntriesRepository.updateTimeEntry('synced-shift', {
    sign_out_time: '2026-10-15T07:59:00.000Z', sign_out_lat: null, sign_out_lon: null, auto_clocked_out: true,
  });
  const before = await timeEntriesRepository.getTimeEntries({ userId: 'user-1' });
  const queuedBefore = await outbox();
  await act(async () => { resolveLocation(POSITION); await pending; });
  expect(await timeEntriesRepository.getTimeEntries({ userId: 'user-1' })).toEqual(before);
  expect(await outbox()).toEqual(queuedBefore);
  expect(result.current.isSignedIn).toBe(false);
});
