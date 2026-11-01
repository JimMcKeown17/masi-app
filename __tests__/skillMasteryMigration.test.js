import { MIGRATIONS, runMigrations } from '../src/db/migrations';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';

const TIME = '2026-10-31T08:00:00.000Z';
let db;

beforeEach(() => {
  db = createBetterSqliteTestDatabase();
});
afterEach(async () => db.closeAsync());

const prepareCurrent = async () => {
  await runMigrations(db);
  await db.runAsync("insert into children (id, first_name, last_name) values ('child-1', 'Test', 'Child')");
};

const insertTick = (id, stepKey) => db.runAsync(`
  insert into skill_mastery (id, child_id, step_key, confirmed, changed_at, correction_id, changed_by)
  values (?, 'child-1', ?, 1, ?, ?, 'user-1')
`, id, stepKey, TIME, id);

const expectConstraint = async (operation, code) => {
  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code });
};

test('v21 creates skill_mastery with exactly the mirrored columns and its natural key', async () => {
  await prepareCurrent();
  expect((await db.getAllAsync('PRAGMA table_info(skill_mastery)')).map(c => c.name)).toEqual([
    'id', 'child_id', 'step_key', 'confirmed', 'changed_at', 'correction_id', 'changed_by',
    'programme_id', 'created_at', 'updated_at', 'sync_status', 'last_sync_error', 'server_updated_at',
    'server_changed_at', 'server_correction_id',
  ]);
  expect(await db.getAllAsync('PRAGMA index_list(skill_mastery)')).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'idx_skill_mastery_child_key', unique: 1, partial: 0 }),
  ]));
  expect((await db.getAllAsync('PRAGMA index_info(idx_skill_mastery_child_key)')).map(c => c.name))
    .toEqual(['child_id', 'step_key']);
  await insertTick('first', 'add.5');
  await expectConstraint(() => insertTick('duplicate', 'add.5'), 'SQLITE_CONSTRAINT_UNIQUE');
});

test.each(['add.5', 'skip_count.2s', 'count_aloud.100'])('step key %s is accepted', async stepKey => {
  await prepareCurrent();
  await insertTick('tick', stepKey);
  expect(await db.getFirstAsync('select step_key from skill_mastery')).toEqual({ step_key: stepKey });
});

test.each(['Add.5', 'add', 'add.', '.5', 'a1.5', 'add.5.1', 'add.5_', 'add-5', 'add.5 '])(
  'step key %j is rejected by the CHECK', async stepKey => {
    await prepareCurrent();
    await expectConstraint(() => insertTick('invalid', stepKey), 'SQLITE_CONSTRAINT_CHECK');
  }
);

test('upgrading a populated v20 database adds the table and leaves letter_mastery rows untouched', async () => {
  for (const migration of MIGRATIONS.filter(m => m.version <= 20)) {
    await db.execAsync(migration.sql);
    if (migration.transform) await migration.transform(db);
    await db.runAsync('insert into schema_migrations (version, name) values (?, ?)', migration.version, migration.name);
  }
  await db.execAsync('PRAGMA user_version = 20; PRAGMA foreign_keys = ON');
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 20 });
  await db.runAsync("insert into children (id, first_name, last_name) values ('child-1', 'Test', 'Child')");
  await db.runAsync(`insert into letter_mastery
    (id, child_id, letter, language, confirmed, changed_at, correction_id, changed_by, programme_id,
     created_at, updated_at, sync_status, last_sync_error, server_updated_at, server_changed_at, server_correction_id)
    values ('letter-id', 'child-1', 'k', 'xh', 1, ?, 'correction', 'user-1', 'programme-1',
      ?, ?, 'synced', 'preserved error', ?, ?, 'server-correction')`, TIME, TIME, TIME, TIME, TIME);
  const before = JSON.stringify(await db.getAllAsync('select * from letter_mastery order by id'));
  expect(await db.getFirstAsync("select name from sqlite_master where name = 'skill_mastery'")).toBeNull();
  await runMigrations(db);
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 21 });
  expect(JSON.stringify(await db.getAllAsync('select * from letter_mastery order by id'))).toBe(before);
  expect(await db.getFirstAsync("select name from sqlite_master where type = 'table' and name = 'skill_mastery'"))
    .toEqual({ name: 'skill_mastery' });
  await insertTick('new-tick', 'add.5');
});

test('deleting the child cascades its skill_mastery rows', async () => {
  await prepareCurrent();
  expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
  await insertTick('tick-1', 'add.5');
  await insertTick('tick-2', 'add.10');
  expect(await db.getFirstAsync('select count(*) as count from skill_mastery')).toEqual({ count: 2 });
  await db.runAsync("delete from children where id = 'child-1'");
  expect(await db.getAllAsync('select * from skill_mastery')).toEqual([]);
  expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
});
