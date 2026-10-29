import { CURRENT_SCHEMA_VERSION, MIGRATIONS, runMigrations } from '../src/db/migrations';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { NEW_CLASS_LETTER_ORDER_EDITION } from '../src/utils/letterOrders';

let db;
beforeEach(async () => {
  db = createBetterSqliteTestDatabase();
  for (const migration of MIGRATIONS.filter(({ version }) => version <= 18)) {
    await db.execAsync(migration.sql);
    if (migration.transform) await migration.transform(db);
    await db.runAsync('insert into schema_migrations (version, name) values (?, ?)', migration.version, migration.name);
  }
  await db.execAsync('PRAGMA user_version = 18; PRAGMA foreign_keys = ON;');
  await seedCoreData(db);
});
afterEach(async () => db.closeAsync());

test('a version 18 class gains the edition without changing its data or queued upload', async () => {
  await db.runAsync("update classes set sync_status = 'pending', row_version = 7 where id = 'class-1'");
  await db.runAsync(`insert into sync_outbox (id, table_name, record_id, operation, payload, owner_user_id)
    values ('class-upload', 'classes', 'class-1', 'insert', '{"id":"class-1","name":"Grade 1A"}', 'user-1')`);
  const before = await db.getFirstAsync("select * from classes where id = 'class-1'");
  const outbox = await db.getAllAsync('select * from sync_outbox');
  const upgradedOutbox = outbox.map(row => ({ ...row, error_class: null, error_code: null }));

  await runMigrations(db);

  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: CURRENT_SCHEMA_VERSION });
  expect(await db.getFirstAsync('select version, name from schema_migrations where version = 19'))
    .toEqual({ version: 19, name: 'classes_letter_order_edition' });
  expect(await db.getFirstAsync("select * from classes where id = 'class-1'"))
    .toEqual({ ...before, letter_order_edition: '2026-10-23' });
  expect(await db.getAllAsync('select * from sync_outbox')).toEqual(upgradedOutbox);
  await runMigrations(db);
  expect(await db.getAllAsync('select * from sync_outbox')).toEqual(upgradedOutbox);
});

test('new classes take the permanent edition default and future server editions are accepted', async () => {
  await runMigrations(db);
  await db.runAsync(`insert into classes (id, school_id, name, grade)
    values ('new-class', 'school-1', 'New class', '1')`);
  expect(await db.getFirstAsync("select letter_order_edition from classes where id = 'new-class'"))
    .toEqual({ letter_order_edition: NEW_CLASS_LETTER_ORDER_EDITION });
  await db.runAsync("update classes set letter_order_edition = '2099-01-01' where id = 'new-class'");
  expect(await db.getFirstAsync("select letter_order_edition from classes where id = 'new-class'"))
    .toEqual({ letter_order_edition: '2099-01-01' });
  await expect(db.runAsync("update classes set letter_order_edition = null where id = 'new-class'"))
    .rejects.toMatchObject({
      code: 'SQLITE_CONSTRAINT_NOTNULL',
      message: expect.stringContaining('NOT NULL constraint failed: classes.letter_order_edition'),
    });
});
