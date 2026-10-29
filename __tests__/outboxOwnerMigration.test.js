import { CURRENT_SCHEMA_VERSION, MIGRATIONS, runMigrations } from '../src/db/migrations';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';

let db;
beforeEach(async () => {
  db = createBetterSqliteTestDatabase();
  for (const migration of MIGRATIONS.filter(item => item.version <= 11)) await db.execAsync(migration.sql);
  await db.execAsync(`PRAGMA user_version = 11;
    insert into sync_outbox (id, table_name, record_id, operation, owner_user_id, status, retry_count, last_error)
    values ('legacy-null', 'children', 'child', 'update', null, 'failed', 2, 'retry'),
      ('legacy-owner', 'children', 'other-child', 'insert', 'ea', 'pending', 0, null);`);
});
afterEach(async () => db.closeAsync());

test('v11 to v12 preserves existing rows and indexes and enforces the exact owner-required trigger', async () => {
  const rows = await db.getAllAsync('select * from sync_outbox order by id');
  const indexes = await db.getAllAsync("select name, sql from sqlite_master where tbl_name = 'sync_outbox' and type = 'index' order by name");
  await runMigrations(db);
  expect(await db.getFirstAsync('pragma user_version')).toEqual({ user_version: CURRENT_SCHEMA_VERSION });
  expect(MIGRATIONS.find(item => item.version === 12).name).toBe('sync_outbox_owner_required');
  expect(await db.getAllAsync('select * from sync_outbox order by id')).toEqual(rows.map(row => ({
    ...row,
    error_class: row.status === 'failed' ? 'retryable' : null,
    error_code: row.status === 'failed' ? 'OTHER' : null,
  })));
  expect(await db.getAllAsync("select name, sql from sqlite_master where tbl_name = 'sync_outbox' and type = 'index' order by name")).toEqual(indexes);
  for (const ownerSql of ['null', "'ea'"]) {
    const insert = () => db.runAsync(`insert into sync_outbox (id, table_name, record_id, operation, owner_user_id)
      values ('new', 'children', 'new', 'update', ${ownerSql})`);
    if (ownerSql === 'null') await expect(insert()).rejects.toMatchObject({ message: 'sync_outbox.owner_user_id is required', code: 'SQLITE_CONSTRAINT_TRIGGER' });
    else await expect(insert()).resolves.toMatchObject({ changes: 1 });
  }
  await expect(db.runAsync("insert into sync_outbox (id, table_name, record_id, operation) values ('omitted', 'children', 'omitted', 'insert')"))
    .rejects.toMatchObject({ message: 'sync_outbox.owner_user_id is required', code: 'SQLITE_CONSTRAINT_TRIGGER' });
  await runMigrations(db);
  expect(await db.getFirstAsync("select count(*) as count from sqlite_master where type = 'trigger' and name = 'sync_outbox_owner_required'"))
    .toEqual({ count: 1 });
  expect(await db.getAllAsync('pragma foreign_key_check')).toEqual([]);
});

test('T7: v12 rejects raw inserts with a null or omitted owner', async () => {
  await runMigrations(db);
  await expect(db.runAsync("insert into sync_outbox (id, table_name, record_id, operation, owner_user_id) values ('null', 'children', 'null', 'insert', null)"))
    .rejects.toMatchObject({ message: 'sync_outbox.owner_user_id is required', code: 'SQLITE_CONSTRAINT_TRIGGER' });
  await expect(db.runAsync("insert into sync_outbox (id, table_name, record_id, operation) values ('omitted', 'children', 'omitted', 'insert')"))
    .rejects.toMatchObject({ message: 'sync_outbox.owner_user_id is required', code: 'SQLITE_CONSTRAINT_TRIGGER' });
});
