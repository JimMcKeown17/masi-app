jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';

it('runs migrations without withExclusiveTransactionAsync and leaves a usable schema', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  // Force the manual-BEGIN path: remove the exclusive-transaction API the old code used.
  delete db.withExclusiveTransactionAsync;

  await runMigrations(db);

  // Schema exists and is queryable (proves migrations committed via manual BEGIN/COMMIT).
  const row = await db.getFirstAsync('PRAGMA user_version');
  expect(row.user_version).toBeGreaterThan(0);
  const tables = await db.getAllAsync(
    "select name from sqlite_master where type='table' and name='sync_outbox'"
  );
  expect(tables).toHaveLength(1);
});

it('leaves foreign_keys ON after migrations so injected DBs enforce FK like production', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);
  const fk = await db.getFirstAsync('PRAGMA foreign_keys');
  expect(fk.foreign_keys).toBe(1);
});

it('does not toggle foreign_keys when there are no pending migrations (no FK-off window)', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db); // first run applies all migrations
  const calls = [];
  const origExec = db.execAsync.bind(db);
  db.execAsync = async (sql) => { calls.push(sql); return origExec(sql); };
  await runMigrations(db); // second run: nothing pending — must NOT touch foreign_keys
  expect(calls.some((sql) => /foreign_keys/i.test(sql))).toBe(false);
  const fk = await db.getFirstAsync('PRAGMA foreign_keys');
  expect(fk.foreign_keys).toBe(1); // posture still ON from the first run
});
