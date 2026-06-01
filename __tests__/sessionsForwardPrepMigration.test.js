jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

describe('sessions forward-prep migration', () => {
  test('adds group_id and state columns to sessions', async () => {
    const db = await createMigratedDatabase(runMigrations);

    const columns = await db.getAllAsync("PRAGMA table_info('sessions')");
    const names = columns.map((c) => c.name);

    expect(names).toContain('group_id');
    expect(names).toContain('state');
  });

  test('submit-and-go insert without state persists state = completed', async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);

    // Mirrors a submit-and-go write: no state, no group_id supplied.
    await db.runAsync(
      "insert into sessions (id, user_id, programme_id, session_date) values ('sess-1', 'user-1', 'programme-a', '2026-05-29')"
    );

    const row = await db.getFirstAsync("select state, group_id from sessions where id = 'sess-1'");
    expect(row.state).toBe('completed');
    expect(row.group_id).toBeNull();
  });

  test('rejects a state outside the allowed set', async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);

    // Capture the error directly rather than via expect().rejects.toThrow(): the
    // latter misreports in multi-file jest runs, while the real CHECK error
    // (verified) is "CHECK constraint failed: state in (...)".
    let error;
    try {
      await db.runAsync(
        "insert into sessions (id, user_id, programme_id, session_date, state) values ('sess-bad', 'user-1', 'programme-a', '2026-05-29', 'bogus')"
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toMatch(/CHECK constraint failed/);
  });

  test('accepts an allowed non-default state', async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);

    await db.runAsync(
      "insert into sessions (id, user_id, programme_id, session_date, state) values ('sess-ip', 'user-1', 'programme-a', '2026-05-29', 'in_progress')"
    );

    const row = await db.getFirstAsync("select state from sessions where id = 'sess-ip'");
    expect(row.state).toBe('in_progress');
  });
});
