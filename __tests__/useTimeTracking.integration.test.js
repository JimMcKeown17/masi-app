jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { __reset, __setDatabaseFactory } from 'expo-sqlite';
import { useTimeTracking } from '../src/hooks/useTimeTracking';
import { TimeTrackingProvider } from '../src/context/TimeTrackingContext';
import { resetDatabaseConnectionForTests } from '../src/db/client';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { createTimeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';

const mockRefreshSyncStatus = jest.fn();
const mockTriggerBackgroundSync = jest.fn();
const mockGetCurrentPosition = jest.fn();

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('../src/context/OfflineContext', () => ({
  useOffline: () => ({
    refreshSyncStatus: mockRefreshSyncStatus,
    triggerBackgroundSync: mockTriggerBackgroundSync,
  }),
}));

jest.mock('../src/services/locationService', () => ({
  getCurrentPosition: (...args) => mockGetCurrentPosition(...args),
}));

const wrapper = ({ children }) => <TimeTrackingProvider>{children}</TimeTrackingProvider>;

let testDb;

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDatabaseConnectionForTests();
  __reset();
  testDb = createBetterSqliteTestDatabase();
  __setDatabaseFactory(async () => testDb);
  mockGetCurrentPosition.mockResolvedValue({
    coords: {
      latitude: -33.9,
      longitude: 25.6,
    },
  });
});

afterEach(async () => {
  await resetDatabaseConnectionForTests();
  await testDb.closeAsync();
});

test('clock-in writes a time_entries row and enqueues an insert outbox record', async () => {
  const { result } = renderHook(() => useTimeTracking(), { wrapper });

  await waitFor(() => expect(result.current).toBeTruthy());

  await act(async () => {
    await result.current.handleSignIn();
  });

  expect(await testDb.getFirstAsync('select count(*) as count from time_entries')).toEqual({ count: 1 });
  expect(await testDb.getAllAsync(`
    select table_name, operation
    from sync_outbox
    where table_name = 'time_entries'
    order by created_at
  `)).toEqual([
    { table_name: 'time_entries', operation: 'insert' },
  ]);
  expect(result.current.isSignedIn).toBe(true);
});

const seedOpenEntry = async (signInTime) => {
  await createTimeEntriesRepository({ database: testDb }).saveTimeEntry({
    id: 'time-open',
    user_id: 'user-1',
    sign_in_time: signInTime,
    sign_in_lat: -33.9,
    sign_in_lon: 25.6,
    synced: true,
    sync_status: 'synced',
  });
};

test('startup auto clock-out records and publishes the notice with the detection time', async () => {
  const elevenHoursAgo = new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString();
  await seedOpenEntry(elevenHoursAgo);
  const before = Date.now();

  const { result } = renderHook(() => useTimeTracking(), { wrapper });

  await waitFor(() => expect(result.current.autoClockOutNotice).not.toBeNull());
  const notice = result.current.autoClockOutNotice;
  expect(notice).toEqual(expect.objectContaining({
    entryId: 'time-open',
    userId: 'user-1',
    signInTime: elevenHoursAgo,
    dismissedAt: null,
  }));
  // detectedAt is "now", not the computed sign-out time (sign-in + 10h, an hour ago).
  expect(Date.parse(notice.detectedAt)).toBeGreaterThanOrEqual(before);
  const row = await testDb.getFirstAsync("select auto_clocked_out, sign_out_time from time_entries where id = 'time-open'");
  expect(row.auto_clocked_out).toBe(1);
  expect(Date.parse(row.sign_out_time)).toBe(Date.parse(elevenHoursAgo) + 10 * 60 * 60 * 1000);
  expect(result.current.isSignedIn).toBe(false);
});

test('a manual clock-out that loses the race to the watchdog keeps the automatic close', async () => {
  const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
  await seedOpenEntry(nineHoursAgo);
  let releaseGps;
  mockGetCurrentPosition.mockImplementation(() => new Promise((resolve) => {
    releaseGps = () => resolve({ coords: { latitude: -33.9, longitude: 25.6 } });
  }));

  const { result } = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(result.current.isSignedIn).toBe(true));

  let signOut;
  act(() => { signOut = result.current.handleSignOut(); });
  await waitFor(() => expect(releaseGps).toBeDefined());

  // The watchdog closes the entry while the manual path waits for GPS.
  await createTimeEntriesRepository({ database: testDb }).closeOpenTimeEntry('time-open', {
    sign_out_time: '2026-10-17T16:00:00.000Z',
    sign_out_lat: null,
    sign_out_lon: null,
    auto_clocked_out: true,
  });

  await act(async () => {
    releaseGps();
    await signOut;
  });

  const row = await testDb.getFirstAsync("select auto_clocked_out, sign_out_time from time_entries where id = 'time-open'");
  expect(row).toEqual({ auto_clocked_out: 1, sign_out_time: '2026-10-17T16:00:00.000Z' });
  expect(result.current.snackbarMessage).toBe('You are not clocked in.');
  expect(result.current.isSignedIn).toBe(false);
});

test('dismissing the notice clears it from provider state', async () => {
  await seedOpenEntry(new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString());
  const { result } = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(result.current.autoClockOutNotice).not.toBeNull());

  await act(async () => {
    await result.current.dismissAutoClockOutNotice('time-open');
  });

  expect(result.current.autoClockOutNotice.dismissedAt).toEqual(expect.any(String));
});
