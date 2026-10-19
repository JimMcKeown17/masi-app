jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { __reset, __setDatabaseFactory } from 'expo-sqlite';
import { useTimeTracking } from '../src/hooks/useTimeTracking';
import { TimeTrackingProvider } from '../src/context/TimeTrackingContext';
import { initializeTestDatabase, closeDefaultTestHandle } from '../test-support/testDatabase';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { StaleActorError } from '../src/session/staleActor';
import { timeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';

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
  mockGetCurrentPosition.mockReset();
  await closeDefaultTestHandle();
  __reset();
  testDb = createBetterSqliteTestDatabase();
  __setDatabaseFactory(async () => testDb);
  await initializeTestDatabase();
  mockGetCurrentPosition.mockResolvedValue({
    status: 'fix',
    coords: {
      latitude: -33.9,
      longitude: 25.6,
    },
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  await closeDefaultTestHandle();
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

test('auto clock-out after a synced clock-in enqueues the sign-out for upload', async () => {
  const signInTime = new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString();
  const expectedSignOutTime = new Date(new Date(signInTime).getTime() + 10 * 60 * 60 * 1000).toISOString();
  await timeEntriesRepository.saveTimeEntry({
    id: 'expired-synced-entry',
    user_id: 'user-1',
    sign_in_time: signInTime,
    sign_in_lat: -33.9,
    sign_in_lon: 25.6,
    synced: true,
  });
  expect(await testDb.getAllAsync('select * from sync_outbox')).toEqual([]);

  const { result } = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(result.current.snackbarMessage).toBe('Auto clocked out after 10 hours.'));

  expect(await timeEntriesRepository.getActiveTimeEntry('user-1')).toBeNull();
  expect(result.current.isSignedIn).toBe(false);
  const [entry] = await timeEntriesRepository.getTimeEntries({ userId: 'user-1' });
  expect(entry).toEqual(expect.objectContaining({
    sign_out_time: expectedSignOutTime,
    sign_out_lat: null,
    sign_out_lon: null,
    sign_out_location_status: null,
    auto_clocked_out: true,
    sync_status: 'pending',
    synced: false,
    last_sync_error: null,
  }));
  const outbox = await testDb.getAllAsync("select operation, payload from sync_outbox where table_name = 'time_entries'");
  expect(outbox).toHaveLength(1);
  expect(outbox[0].operation).toBe('update');
  expect(JSON.parse(outbox[0].payload)).toEqual(expect.objectContaining({
    id: entry.id,
    sign_out_time: expectedSignOutTime,
    auto_clocked_out: true,
  }));
});

test('clock-out after the clock-in has synced enqueues the sign-out for upload', async () => {
  const { result } = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(result.current).toBeTruthy());

  await act(async () => {
    await result.current.handleSignIn();
  });

  // What a successful upload leaves behind (offlineSync finalizeSuccess): the insert's
  // outbox row is gone and the domain row is marked synced.
  await testDb.runAsync("delete from sync_outbox where table_name = 'time_entries'");
  await testDb.runAsync("update time_entries set sync_status = 'synced'");

  await act(async () => {
    await result.current.handleSignOut();
  });

  const entry = await testDb.getFirstAsync('select sign_out_time, sync_status from time_entries');
  expect(entry.sign_out_time).toEqual(expect.any(String));
  expect(entry.sync_status).toBe('pending');
  const outbox = await testDb.getAllAsync(`
    select operation, payload
    from sync_outbox
    where table_name = 'time_entries'
  `);
  expect(outbox).toHaveLength(1);
  expect(outbox[0].operation).toBe('update');
  expect(JSON.parse(outbox[0].payload).sign_out_time).toBe(entry.sign_out_time);
});

const seedOpenEntry = async (signInTime) => {
  await timeEntriesRepository.saveTimeEntry({
    id: 'time-open',
    user_id: 'user-1',
    sign_in_time: signInTime,
    sign_in_lat: -33.9,
    sign_in_lon: 25.6,
    synced: true,
    sync_status: 'synced',
  });
};

test('a clock-out after ten hours records the ten-hour auto-close', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-19T16:59:00.000Z'));
  await seedOpenEntry('2026-10-19T07:00:00.000Z');
  mockGetCurrentPosition.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(result.current.isSignedIn).toBe(true));

  // Move the clock past ten hours without running the 30-second watchdog.
  jest.setSystemTime(new Date('2026-10-19T17:01:00.000Z'));
  let signOut;
  await act(async () => { signOut = result.current.handleSignOut(); });
  expect(mockGetCurrentPosition).not.toHaveBeenCalled();
  await act(async () => { expect(await signOut).toBe(true); });

  const [entry] = await timeEntriesRepository.getTimeEntries({ userId: 'user-1' });
  expect(entry).toEqual(expect.objectContaining({
    sign_out_time: '2026-10-19T17:00:00.000Z',
    auto_clocked_out: true,
    sign_out_lat: null,
    sign_out_lon: null,
    sign_out_location_status: null,
    sync_status: 'pending',
  }));
  const notice = await getDefaultTestHandle().services.homeAttention.loadAutoClockOutNotice();
  expect(notice).toEqual({
    entryId: 'time-open',
    userId: 'user-1',
    signInTime: '2026-10-19T07:00:00.000Z',
    detectedAt: '2026-10-19T17:01:00.000Z',
    dismissedAt: null,
  });
  expect(result.current.autoClockOutNotice).toEqual(notice);
  expect(result.current.isSignedIn).toBe(false);
  expect(result.current.activeEntry).toBeNull();
  expect(result.current.loadingLocation).toBe(false);
  expect(result.current.snackbarMessage).toBe('Auto clocked out after 10 hours.');
});

test('a clock-out crossing ten hours during location capture records the ten-hour auto-close', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-19T16:59:00.000Z'));
  await seedOpenEntry('2026-10-19T07:00:00.000Z');
  let releaseGps;
  mockGetCurrentPosition.mockReturnValue(new Promise((resolve) => { releaseGps = resolve; }));
  const { result } = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(result.current.isSignedIn).toBe(true));
  jest.setSystemTime(new Date('2026-10-19T16:59:00.000Z'));

  let signOut;
  await act(async () => { signOut = result.current.handleSignOut(); });
  expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
  expect(await timeEntriesRepository.getActiveTimeEntry('user-1')).not.toBeNull();
  jest.setSystemTime(new Date('2026-10-19T17:01:00.000Z'));
  await act(async () => {
    releaseGps({ coords: { latitude: -33.9, longitude: 25.6 }, status: 'fix' });
    expect(await signOut).toBe(true);
  });

  const [entry] = await timeEntriesRepository.getTimeEntries({ userId: 'user-1' });
  expect(entry).toEqual(expect.objectContaining({
    sign_out_time: '2026-10-19T17:00:00.000Z',
    auto_clocked_out: true,
    sign_out_lat: null,
    sign_out_lon: null,
    sign_out_location_status: null,
    sync_status: 'pending',
  }));
  const notice = await getDefaultTestHandle().services.homeAttention.loadAutoClockOutNotice();
  expect(notice).toEqual({
    entryId: 'time-open',
    userId: 'user-1',
    signInTime: '2026-10-19T07:00:00.000Z',
    detectedAt: '2026-10-19T17:01:00.000Z',
    dismissedAt: null,
  });
  expect(result.current.autoClockOutNotice).toEqual(notice);
  expect(result.current.isSignedIn).toBe(false);
  expect(result.current.activeEntry).toBeNull();
  expect(result.current.loadingLocation).toBe(false);
  expect(result.current.snackbarMessage).toBe('Auto clocked out after 10 hours.');
});

test.each([
  ['at 9 h 59 m', '2026-10-19T16:59:00.000Z'],
  ['at exactly ten hours', '2026-10-19T17:00:00.000Z'],
])('a clock-out %s stores the real time and location', async (_, signOutTime) => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-19T16:59:00.000Z'));
  await seedOpenEntry('2026-10-19T07:00:00.000Z');
  const { result } = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(result.current.isSignedIn).toBe(true));
  jest.setSystemTime(new Date(signOutTime));

  await act(async () => { expect(await result.current.handleSignOut()).toBe(true); });

  const [entry] = await timeEntriesRepository.getTimeEntries({ userId: 'user-1' });
  expect(entry).toEqual(expect.objectContaining({
    sign_out_time: signOutTime,
    auto_clocked_out: false,
    sign_out_lat: -33.9,
    sign_out_lon: 25.6,
    sign_out_location_status: 'fix',
    sync_status: 'pending',
  }));
  expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
  expect(await getDefaultTestHandle().services.homeAttention.loadAutoClockOutNotice()).toBeNull();
  expect(result.current.autoClockOutNotice).toBeNull();
  expect(result.current.isSignedIn).toBe(false);
  expect(result.current.activeEntry).toBeNull();
  expect(result.current.loadingLocation).toBe(false);
});

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
    releaseGps = () => resolve({ coords: { latitude: -33.9, longitude: 25.6 }, status: 'fix' });
  }));

  const { result } = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(result.current.isSignedIn).toBe(true));

  let signOut;
  act(() => { signOut = result.current.handleSignOut(); });
  await waitFor(() => expect(releaseGps).toBeDefined());

  // The watchdog closes the entry while the manual path waits for GPS.
  await timeEntriesRepository.closeOpenTimeEntry('time-open', {
    sign_out_time: '2026-10-17T16:00:00.000Z',
    sign_out_lat: null,
    sign_out_lon: null,
    auto_clocked_out: true,
  });

  await act(async () => {
    releaseGps();
    expect(await signOut).toBe(true);
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


test('a cancelled location handoff returns false and leaves the shift open', async () => {
  await seedOpenEntry(new Date(Date.now() - 3600e3).toISOString());
  mockGetCurrentPosition.mockResolvedValue({ cancelled: true });
  const { result } = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(result.current.isSignedIn).toBe(true));
  await act(async () => { expect(await result.current.handleSignOut()).toBe(false); });
  expect(await timeEntriesRepository.getActiveTimeEntry('user-1')).not.toBeNull();
  expect(result.current.isSignedIn).toBe(true);
  expect(result.current.snackbarMessage).toBe('Return from Settings and tap Clock Out again, or continue without location.');
});

test('manual clock-out without location clears stale sync errors and queues the close', async () => {
  await seedOpenEntry(new Date(Date.now() - 3600e3).toISOString());
  await testDb.runAsync("update time_entries set sync_status = 'failed', last_sync_error = 'previous upload failed'");
  mockGetCurrentPosition.mockResolvedValue({ status: 'timeout' });
  const { result } = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(result.current.isSignedIn).toBe(true));
  await act(async () => { expect(await result.current.handleSignOut()).toBe(true); });
  const [row] = await timeEntriesRepository.getTimeEntries();
  expect(row).toEqual(expect.objectContaining({
    sign_out_time: expect.any(String), sign_out_lat: null, sign_out_lon: null,
    sign_out_location_status: 'timeout', sync_status: 'pending', synced: false, last_sync_error: null,
  }));
  expect(result.current.snackbarMessage).toBe('Clocked out without location. 1.00 hours worked.');
});

test('the automatic close notice survives provider remount', async () => {
  await seedOpenEntry(new Date(Date.now() - 11 * 3600e3).toISOString());
  const first = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(first.result.current.autoClockOutNotice).toEqual(expect.objectContaining({ entryId: 'time-open' })));
  const notice = first.result.current.autoClockOutNotice;
  first.unmount();
  const second = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(second.result.current.autoClockOutNotice).toEqual(notice));
  expect(mockTriggerBackgroundSync).toHaveBeenCalledTimes(1);
});

test('the watchdog quietly handles a stale close rejection after unmount', async () => {
  await seedOpenEntry(new Date(Date.now() - 9 * 3600e3).toISOString());
  const intervals = jest.spyOn(global, 'setInterval');
  const report = jest.spyOn(console, 'error').mockImplementation(() => {});
  const { result, unmount } = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(result.current.isSignedIn).toBe(true));
  const watchdog = intervals.mock.calls.find(([, ms]) => ms === 30000)[0];
  let rejectClose;
  const close = jest.spyOn(getDefaultTestHandle().repositories.timeEntries, 'closeOpenTimeEntry')
    .mockImplementationOnce(() => new Promise((_, reject) => { rejectClose = reject; }));
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 3600e3);
  act(() => { watchdog(); });
  expect(close).toHaveBeenCalledTimes(1);
  unmount();
  await act(async () => {
    rejectClose(new StaleActorError());
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(report).not.toHaveBeenCalled();
  expect(mockRefreshSyncStatus).not.toHaveBeenCalled();
  expect(mockTriggerBackgroundSync).not.toHaveBeenCalled();
  expect(await getDefaultTestHandle().services.homeAttention.loadAutoClockOutNotice()).toBeNull();
  expect(await timeEntriesRepository.getActiveTimeEntry('user-1')).not.toBeNull();
});

test('clock-out succeeds when the provider already has no open shift', async () => {
  const { result } = renderHook(() => useTimeTracking(), { wrapper });
  await act(async () => { expect(await result.current.handleSignOut()).toBe(true); });
  expect(result.current.isSignedIn).toBe(false);
  expect(result.current.activeEntry).toBeNull();
  expect(result.current.snackbarMessage).toBe('You must clock in first before clocking out.');
  expect(mockGetCurrentPosition).not.toHaveBeenCalled();
});
