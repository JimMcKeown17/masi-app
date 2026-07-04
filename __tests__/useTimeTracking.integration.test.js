jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { __reset, __setDatabaseFactory } from 'expo-sqlite';
import { useTimeTracking } from '../src/hooks/useTimeTracking';
import { resetDatabaseConnectionForTests } from '../src/db/client';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';

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
  const { result } = renderHook(() => useTimeTracking());

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
