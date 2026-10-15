jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { __reset, __setDatabaseFactory } from 'expo-sqlite';
import { useTimeTracking } from '../src/hooks/useTimeTracking';
import { TimeTrackingProvider } from '../src/context/TimeTrackingContext';
import { resetDatabaseConnectionForTests } from '../src/db/client';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
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
