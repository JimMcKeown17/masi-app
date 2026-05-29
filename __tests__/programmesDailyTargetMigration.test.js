jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createMigratedDatabase } from '../test-support/sqliteRepositoryTestUtils';

describe('programmes daily-session-target migration', () => {
  test('adds daily_session_target and daily_session_ceiling columns to programmes', async () => {
    const db = await createMigratedDatabase(runMigrations);

    const columns = await db.getAllAsync("PRAGMA table_info('programmes')");
    const names = columns.map((c) => c.name);

    expect(names).toContain('daily_session_target');
    expect(names).toContain('daily_session_ceiling');
  });
});
