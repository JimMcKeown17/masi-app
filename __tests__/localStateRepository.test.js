jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createLocalStateRepository } from '../src/db/repositories/localStateRepository';

describe('localStateRepository', () => {
  test('stores JSON state by key and returns a fallback for missing keys', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const repository = createLocalStateRepository({ database: db });

      await repository.set('sync_meta', {
        lastSyncTime: '2026-05-21T10:00:00.000Z',
        retryAttempts: { CHILDREN_child1: 2 },
      });

      expect(await repository.get('sync_meta')).toEqual({
        lastSyncTime: '2026-05-21T10:00:00.000Z',
        retryAttempts: { CHILDREN_child1: 2 },
      });
      expect(await repository.get('missing', { defaulted: true })).toEqual({ defaulted: true });
    } finally {
      await db.closeAsync();
    }
  });
});
