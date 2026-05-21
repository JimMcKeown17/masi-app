jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createTimeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';

const makeEntry = (overrides = {}) => ({
  id: 'time-1',
  user_id: 'user-1',
  sign_in_time: '2026-05-21T08:00:00.000Z',
  sign_in_lat: -34.1,
  sign_in_lon: 18.4,
  synced: false,
  created_at: '2026-05-21T08:00:00.000Z',
  updated_at: '2026-05-21T08:00:00.000Z',
  ...overrides,
});

describe('timeEntriesRepository', () => {
  test('active time entry survives repository reload', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      await createTimeEntriesRepository({ database: db }).saveTimeEntry(makeEntry());

      const reloadedRepository = createTimeEntriesRepository({ database: db });
      expect(await reloadedRepository.getActiveTimeEntry('user-1')).toEqual(expect.objectContaining({
        id: 'time-1',
        user_id: 'user-1',
        sign_out_time: null,
        synced: false,
      }));
    } finally {
      await db.closeAsync();
    }
  });

  test('time-entry update changes one row and preserves sync metadata', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const repository = createTimeEntriesRepository({ database: db });

      await repository.saveTimeEntry(makeEntry({ id: 'time-1' }));
      await repository.saveTimeEntry(makeEntry({ id: 'time-2', sign_in_time: '2026-05-21T09:00:00.000Z' }));

      await repository.updateTimeEntry('time-1', {
        sign_out_time: '2026-05-21T12:00:00.000Z',
        sign_out_lat: -34.2,
        sign_out_lon: 18.5,
      });

      expect(await repository.getTimeEntries()).toEqual([
        expect.objectContaining({
          id: 'time-1',
          sign_out_time: '2026-05-21T12:00:00.000Z',
          sync_status: 'pending',
          synced: false,
          last_sync_error: null,
        }),
        expect.objectContaining({
          id: 'time-2',
          sign_out_time: null,
          synced: false,
        }),
      ]);
      expect(await repository.getUnsyncedRecords()).toHaveLength(2);
    } finally {
      await db.closeAsync();
    }
  });
});
