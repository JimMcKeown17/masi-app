jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import {
  decodeJson,
  encodeJson,
  replaceAllRecords,
  setRecordLastSyncError,
  setRecordSyncStatus,
  syncStatusFromSynced,
  timestamp,
  toBoolean,
  toSyncedFlag,
  upsertRecord,
} from '../src/db/repositories/sqliteRepositoryUtils';

describe('SQLite repository utilities', () => {
  test('converts booleans, sync status, JSON, and timestamps for repository boundaries', () => {
    expect(toBoolean(1)).toBe(true);
    expect(toBoolean(0)).toBe(false);
    expect(toBoolean(null)).toBe(null);

    expect(toSyncedFlag('synced')).toBe(true);
    expect(toSyncedFlag('pending')).toBe(false);
    expect(toSyncedFlag(undefined)).toBe(false);
    expect(syncStatusFromSynced(true)).toBe('synced');
    expect(syncStatusFromSynced(false)).toBe('pending');
    expect(syncStatusFromSynced(undefined)).toBe('pending');

    expect(decodeJson(encodeJson({ letters: ['a', 'm'] }))).toEqual({ letters: ['a', 'm'] });
    expect(decodeJson(null, [])).toEqual([]);
    expect(timestamp()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('upsertRecord writes only allowlisted columns and updates by primary key', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);

      await upsertRecord(db, {
        tableName: 'schools',
        columns: ['id', 'name', 'is_active', 'sync_status'],
        booleanColumns: ['is_active'],
        record: {
          id: 'school-1',
          name: 'Old School',
          is_active: true,
          sync_status: 'pending',
          ignored_column: 'must not be written',
        },
      });

      await upsertRecord(db, {
        tableName: 'schools',
        columns: ['id', 'name', 'is_active', 'sync_status'],
        booleanColumns: ['is_active'],
        record: {
          id: 'school-1',
          name: 'Updated School',
          is_active: false,
          sync_status: 'synced',
        },
      });

      expect(await db.getAllAsync('select id, name, is_active, sync_status from schools')).toEqual([
        {
          id: 'school-1',
          name: 'Updated School',
          is_active: 0,
          sync_status: 'synced',
        },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('replaceAllRecords is transactional and keeps the previous cache on failure', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      await upsertRecord(db, {
        tableName: 'schools',
        columns: ['id', 'name'],
        record: { id: 'school-1', name: 'Cached School' },
      });

      await expect(replaceAllRecords(db, {
        tableName: 'schools',
        columns: ['id', 'name'],
        requiredColumns: ['id', 'name'],
        records: [
          { id: 'school-2', name: 'Valid School' },
          { id: 'school-3', name: null },
        ],
      })).rejects.toThrow(/not.*null/i);

      expect(await db.getAllAsync('select id, name from schools order by id')).toEqual([
        { id: 'school-1', name: 'Cached School' },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('updates sync metadata without touching the domain payload', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      await upsertRecord(db, {
        tableName: 'schools',
        columns: ['id', 'name'],
        record: { id: 'school-1', name: 'Masi Primary' },
      });

      await setRecordSyncStatus(db, 'schools', 'school-1', 'failed');
      await setRecordLastSyncError(db, 'schools', 'school-1', 'temporary outage');

      expect(await db.getFirstAsync(
        'select name, sync_status, last_sync_error from schools where id = ?',
        'school-1'
      )).toEqual({
        name: 'Masi Primary',
        sync_status: 'failed',
        last_sync_error: 'temporary outage',
      });
    } finally {
      await db.closeAsync();
    }
  });
});
