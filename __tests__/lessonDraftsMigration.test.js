import { CURRENT_SCHEMA_VERSION, MIGRATIONS, runMigrations } from '../src/db/migrations';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';

const draftsMigration = () => MIGRATIONS.find((migration) => migration.name === 'lesson_drafts');
const BASE = (draftsMigration()?.version ?? CURRENT_SCHEMA_VERSION + 1) - 1;

let db;
beforeEach(async () => {
  db = createBetterSqliteTestDatabase();
  for (const migration of MIGRATIONS.filter(({ version }) => version <= BASE)) {
    await db.execAsync(migration.sql);
  }
  await db.execAsync(`
    PRAGMA user_version = ${BASE};
    insert into programmes (id, code, name) values ('p', 'literacy', 'Literacy');
    insert into sessions (id, user_id, programme_id, session_date)
      values ('existing-session', 'ea', 'p', '2026-10-19');
    insert into sync_outbox (id, table_name, record_id, operation, owner_user_id)
      values ('existing-outbox', 'sessions', 'existing-session', 'insert', 'ea');
  `);
});
afterEach(async () => db.closeAsync());

test('upgrading the previous version keeps every row and adds an empty lesson_drafts table', async () => {
  const sessions = await db.getAllAsync('select * from sessions order by id');
  const outbox = await db.getAllAsync('select * from sync_outbox order by id');
  await runMigrations(db);
  expect(draftsMigration().version).toBeGreaterThan(15);
  expect(await db.getFirstAsync('pragma user_version')).toEqual({ user_version: CURRENT_SCHEMA_VERSION });
  expect(await db.getAllAsync('select * from sessions order by id')).toEqual(sessions);
  expect(await db.getAllAsync('select * from sync_outbox order by id')).toEqual(outbox.map(row => ({
    ...row, error_class: null, error_code: null,
  })));
  expect(await db.getFirstAsync('select count(*) as n from lesson_drafts')).toEqual({ n: 0 });
  expect(await db.getAllAsync('pragma foreign_key_check')).toEqual([]);
});

test('lesson_drafts is local only: exactly these columns and no sync bookkeeping', async () => {
  await runMigrations(db);
  const columns = (await db.getAllAsync('pragma table_info(lesson_drafts)')).map((column) => column.name);
  expect(columns).toEqual([
    'id', 'slot', 'session_id', 'programme_id', 'group_id', 'class_id',
    'language_code', 'pack_id', 'lesson_date', 'attendance', 'plan', 'plan_fixed_at', 'ticks',
    'tracker_changes', 'reading_level_changes', 'notes', 'created_at', 'updated_at',
  ]);
  expect(await db.getAllAsync('pragma foreign_key_list(lesson_drafts)')).toEqual([]);
});

test('the database refuses a second draft row', async () => {
  await runMigrations(db);
  const insert = (id, sessionId, slot = 1) => db.runAsync(`insert into lesson_drafts
    (id, slot, session_id, programme_id, group_id, lesson_date) values (?, ?, ?, 'p', 'g', '2026-10-19')`,
  id, slot, sessionId);
  await insert('d1', 's1');
  await expect(insert('d2', 's2')).rejects.toMatchObject({
    message: expect.stringMatching(/UNIQUE constraint failed: lesson_drafts.slot/),
  });
  await expect(insert('d3', 's3', 2)).rejects.toMatchObject({
    message: expect.stringMatching(/CHECK constraint failed/),
  });
});

test('relaunching runs no migration and leaves a stored draft untouched', async () => {
  await runMigrations(db);
  await db.runAsync(`insert into lesson_drafts (id, session_id, programme_id, group_id, lesson_date, notes)
    values ('d1', 's1', 'p', 'g', '2026-10-19', 'kept')`);
  const before = await db.getAllAsync('select * from lesson_drafts');
  await runMigrations(db);
  expect(await db.getAllAsync('select * from lesson_drafts')).toEqual(before);
});
