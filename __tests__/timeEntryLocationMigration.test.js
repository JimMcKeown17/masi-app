import { MIGRATIONS, runMigrations } from '../src/db/migrations';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';

let db;
beforeEach(async () => {
  db = createBetterSqliteTestDatabase();
  for (const migration of MIGRATIONS.filter(item => item.version <= 10)) await db.execAsync(migration.sql);
  await db.execAsync(`
    PRAGMA user_version = 10;
    insert into time_entries (id, user_id, sign_in_time, sign_in_lat, sign_in_lon, sync_status)
    values ('old-open', 'ea', '2026-10-15T08:00:00Z', -33.9, 25.6, 'pending');
    insert into time_entries (id, user_id, sign_in_time, sign_in_lat, sign_in_lon,
      sign_out_time, sign_out_lat, sign_out_lon, sync_status, last_sync_error, server_updated_at)
    values ('old-closed', 'ea', '2026-10-14T08:00:00Z', -33.9, 25.6,
      '2026-10-14T09:00:00Z', -33.8, 25.7, 'failed', 'retry', '2026-10-14T10:00:00Z');
    insert into sync_outbox (id, table_name, record_id, operation, payload, owner_user_id)
    values ('queued', 'time_entries', 'old-open', 'insert', '{"id":"old-open","sign_in_lat":-33.9,"sign_in_lon":25.6}', 'ea');
  `);
});
afterEach(async () => db.closeAsync());

test('v10 upgrade preserves every old field, indexes, foreign keys and triggers and adds nullable location outcomes', async () => {
  const before = await db.getAllAsync('select * from time_entries order by id');
  const objects = await db.getAllAsync("select type, name, sql from sqlite_master where tbl_name = 'time_entries' and type != 'table' order by name");
  const outboxBefore = await db.getAllAsync('select * from sync_outbox');
  const foreignKeys = await db.getAllAsync('pragma foreign_key_list(time_entries)');
  await runMigrations(db);
  expect(await db.getFirstAsync('pragma user_version')).toEqual({ user_version: 11 });
  expect(await db.getAllAsync('select * from time_entries order by id')).toEqual(before.map(row => ({
    ...row, sign_in_location_status: null, sign_out_location_status: null,
  })));
  expect(await db.getAllAsync("select type, name, sql from sqlite_master where tbl_name = 'time_entries' and type != 'table' order by name")).toEqual(objects);
  expect(await db.getAllAsync('pragma foreign_key_list(time_entries)')).toEqual(foreignKeys);
  expect(await db.getAllAsync('select * from sync_outbox')).toEqual(outboxBefore);
  expect(await db.getFirstAsync('pragma foreign_keys')).toEqual({ foreign_keys: 1 });
  expect(await db.getAllAsync('pragma foreign_key_check')).toEqual([]);
  await db.runAsync(`insert into time_entries (id, user_id, sign_in_time, sign_in_location_status)
    values ('no-fix', 'ea', '2026-10-15T09:00:00Z', 'timeout')`);
  await runMigrations(db);
  expect(await db.getFirstAsync("select sign_in_lat, sign_in_lon from time_entries where id = 'no-fix'"))
    .toEqual({ sign_in_lat: null, sign_in_lon: null });
});

test.each(['sign_in', 'sign_out'])('%s constraints reject half pairs, invalid statuses and incoherent fixes', async prefix => {
  await runMigrations(db);
  const update = (lat, lon, status) => db.runAsync(`update time_entries set ${prefix}_lat = ?, ${prefix}_lon = ?, ${prefix}_location_status = ? where id = 'old-open'`, lat, lon, status);
  for (const values of [[1, null, null], [null, 2, null], [null, null, 'fix'], [1, 2, 'timeout'], [1, 2, 'denied'], [1, 2, 'services_off'], [1, 2, 'unavailable'], [null, null, 'unknown']]) {
    await expect(update(...values)).rejects.toMatchObject({ message: expect.stringMatching(/CHECK constraint failed/) });
  }
  for (const status of ['timeout', 'denied', 'services_off', 'unavailable', null]) await update(null, null, status);
  await update(0, 0, 'fix');
  await update(1, 2, null); // old clients remain valid
});


test('invalid legacy pairs roll the rebuild back without losing data or advancing version', async () => {
  await db.runAsync("update time_entries set sign_out_lat = 1 where id = 'old-open'");
  const before = await db.getAllAsync('select * from time_entries order by id');
  await expect(runMigrations(db)).rejects.toMatchObject({ message: expect.stringMatching(/CHECK constraint failed/) });
  expect(await db.getFirstAsync('pragma user_version')).toEqual({ user_version: 10 });
  expect(await db.getAllAsync('select * from time_entries order by id')).toEqual(before);
  expect(await db.getFirstAsync('pragma foreign_keys')).toEqual({ foreign_keys: 1 });
  expect(await db.getFirstAsync("select name from sqlite_master where name = 'time_entries_new'")).toBeNull();
});
