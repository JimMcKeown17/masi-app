jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { CURRENT_SCHEMA_VERSION, SchemaTooNewError, isSchemaTooNewError, runMigrations } from '../src/db/migrations';
import { resolveDatabase } from '../src/db/repositories/repositoryRuntime';

it.each([
  ['migrations', runMigrations],
  ['repository resolution', resolveDatabase],
])('%s refuses a newer schema without changing the file or issuing any writes', async (_, open) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-newer-schema-'));
  const filename = path.join(dir, 'newer.db');
  const db = createBetterSqliteTestDatabase(filename);
  const fileVersion = CURRENT_SCHEMA_VERSION + 86;
  try {
    await runMigrations(db);
    await db.execAsync("create table sentinel (value text); insert into sentinel values ('keep me');");
    await db.execAsync(`PRAGMA user_version = ${fileVersion}`);
    const ledger = await db.getAllAsync('select * from schema_migrations order by version');
    const digest = () => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
    const before = digest();
    const exec = jest.spyOn(db, 'execAsync');
    const run = jest.spyOn(db, 'runAsync');

    let caught;
    try { await open(db); } catch (error) { caught = error; }

    expect(caught).toBeDefined();
    expect(caught).toBeInstanceOf(SchemaTooNewError);
    expect(caught).toMatchObject({ code: 'SCHEMA_TOO_NEW', fileVersion, appVersion: CURRENT_SCHEMA_VERSION });
    expect(isSchemaTooNewError(caught)).toBe(true);
    expect(exec).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: fileVersion });
    expect(await db.getAllAsync('select * from schema_migrations order by version')).toEqual(ledger);
    expect(await db.getAllAsync('select * from sentinel')).toEqual([{ value: 'keep me' }]);
    expect(digest()).toBe(before);
  } finally {
    await db.closeAsync();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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
  expect(calls).toEqual([]);
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: CURRENT_SCHEMA_VERSION });
  const fk = await db.getFirstAsync('PRAGMA foreign_keys');
  expect(fk.foreign_keys).toBe(1); // posture still ON from the first run
});
