jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createTimeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';

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

  test('getTimeEntries can be scoped to the active user for dashboard stats', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const repository = createTimeEntriesRepository({ database: db });

      await repository.saveTimeEntry(makeEntry({ id: 'user-1-time', user_id: 'user-1' }));
      await repository.saveTimeEntry(makeEntry({ id: 'user-2-time', user_id: 'user-2' }));

      expect((await repository.getTimeEntries({ userId: 'user-1' })).map(entry => entry.id))
        .toEqual(['user-1-time']);
    } finally {
      await db.closeAsync();
    }
  });

  test('saveTimeEntry enqueues a sync outbox insert in the same repository write', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const repository = createTimeEntriesRepository({ database: db });

      await repository.saveTimeEntry(makeEntry());

      const outbox = await db.getFirstAsync(
        'select table_name, record_id, operation, status, payload from sync_outbox where record_id = ?',
        'time-1'
      );
      expect(outbox).toEqual(expect.objectContaining({
        table_name: 'time_entries',
        record_id: 'time-1',
        operation: 'insert',
        status: 'pending',
      }));
      expect(JSON.parse(outbox.payload)).toEqual(expect.objectContaining({
        id: 'time-1',
        user_id: 'user-1',
        sign_in_time: '2026-05-21T08:00:00.000Z',
      }));
    } finally {
      await db.closeAsync();
    }
  });

  test('updateTimeEntry keeps the outbox payload current for an unsynced time entry', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const repository = createTimeEntriesRepository({ database: db });

      await repository.saveTimeEntry(makeEntry());
      await repository.updateTimeEntry('time-1', {
        sign_out_time: '2026-05-21T17:00:00.000Z',
        sign_out_lat: -34.2,
        sign_out_lon: 18.5,
      });

      const outboxRows = await db.getAllAsync(
        'select table_name, record_id, operation, status, payload from sync_outbox where record_id = ? order by operation',
        'time-1'
      );
      expect(outboxRows).toHaveLength(1);
      expect(outboxRows[0]).toEqual(expect.objectContaining({
        table_name: 'time_entries',
        operation: 'insert',
        status: 'pending',
      }));
      expect(JSON.parse(outboxRows[0].payload)).toEqual(expect.objectContaining({
        id: 'time-1',
        sign_out_time: '2026-05-21T17:00:00.000Z',
      }));
    } finally {
      await db.closeAsync();
    }
  });

  test('synced server time entries do not enqueue outbox rows', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const repository = createTimeEntriesRepository({ database: db });

      await repository.saveTimeEntry(makeEntry({ synced: true, sync_status: 'synced' }));

      expect(await db.getFirstAsync('select * from sync_outbox where record_id = ?', 'time-1'))
        .toBeNull();
    } finally {
      await db.closeAsync();
    }
  });

  test('user update clears stale retry metadata from a failed time-entry outbox row', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const repository = createTimeEntriesRepository({ database: db });
      const outboxRepository = createSyncOutboxRepository({ database: db });

      await repository.saveTimeEntry(makeEntry());
      await outboxRepository.markRetriableFailure('time_entries:time-1:insert', {
        errorMessage: 'network down',
        nextRetryAt: '2099-01-01T00:00:00.000Z',
      });

      await repository.updateTimeEntry('time-1', {
        sign_out_time: '2026-05-21T17:00:00.000Z',
      });

      expect(await db.getFirstAsync(`
        select status, retry_count, last_error, next_retry_at, payload
        from sync_outbox
        where id = ?
      `, 'time_entries:time-1:insert')).toEqual(expect.objectContaining({
        status: 'pending',
        retry_count: 0,
        last_error: null,
        next_retry_at: null,
      }));
      const outbox = await db.getFirstAsync('select payload from sync_outbox where id = ?', 'time_entries:time-1:insert');
      expect(JSON.parse(outbox.payload)).toEqual(expect.objectContaining({
        id: 'time-1',
        sign_out_time: '2026-05-21T17:00:00.000Z',
      }));
    } finally {
      await db.closeAsync();
    }
  });

  test('clock-out closes the active time entry for the user', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const repository = createTimeEntriesRepository({ database: db });

      await repository.saveTimeEntry(makeEntry());
      await repository.updateTimeEntry('time-1', {
        sign_out_time: '2026-05-21T17:00:00.000Z',
      });

      expect(await repository.getActiveTimeEntry('user-1')).toBeNull();
    } finally {
      await db.closeAsync();
    }
  });
});
