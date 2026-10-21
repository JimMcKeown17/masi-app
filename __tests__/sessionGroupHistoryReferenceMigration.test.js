import { CURRENT_SCHEMA_VERSION, MIGRATIONS, runMigrations } from '../src/db/migrations';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const V = MIGRATIONS.find(({ name }) => name === 'sessions_group_history_reference')?.version;

let db;
beforeEach(async () => {
  db = createBetterSqliteTestDatabase();
  expect(V).toBeDefined();
  for (const migration of MIGRATIONS.filter(({ version }) => version < V)) {
    await db.execAsync(migration.sql);
    await db.runAsync(
      'insert into schema_migrations (version, name) values (?, ?)',
      migration.version, migration.name
    );
  }
  await db.execAsync(`PRAGMA user_version = ${V - 1}; PRAGMA foreign_keys = ON;`);
  await seedCoreData(db);
  await db.execAsync(`
    insert into children (id, first_name, last_name)
    values ('child-1', 'Test', 'Child');
    insert into groups (id, name, programme_id, class_id, created_by)
    values ('group-1', 'Group 1', 'programme-a', 'class-1', 'user-1');
    insert into sessions (
      id, user_id, programme_id, class_id, session_date, started_at, ended_at,
      activities, notes, created_at, updated_at, sync_status, last_sync_error,
      server_updated_at, group_id, state
    ) values (
      's-1', 'user-1', 'programme-a', 'class-1', '2026-10-20',
      '2026-10-20T08:00:00.000Z', '2026-10-20T08:30:00.000Z',
      '{"letters_focused":["m"]}', 'Saved session',
      '2026-10-20T08:30:00.000Z', '2026-10-20T08:31:00.000Z',
      'failed', 'Upload waiting', '2026-10-20T08:32:00.000Z', 'group-1', 'paused'
    );
    insert into sessions (id, user_id, programme_id, session_date, sync_status)
    values ('s-2', 'user-1', 'programme-a', '2026-10-21', 'pending');
    insert into session_attendees (
      id, session_id, child_id, group_id, attendance_status, grade_snapshot,
      notes, sync_status, last_sync_error, server_updated_at
    ) values (
      'attendee-1', 's-1', 'child-1', 'group-1', 'late', '1',
      'Attendee snapshot', 'failed', 'Retry attendee', '2026-10-20T08:33:00.000Z'
    );
    insert into sync_outbox (
      id, table_name, record_id, operation, payload, owner_user_id, status
    ) values (
      'sessions:s-2:insert', 'sessions', 's-2', 'insert',
      '{"id":"s-2","programme_id":"programme-a"}', 'user-1', 'pending'
    );
  `);
});
afterEach(async () => db.closeAsync());

const sessionIndexes = async () => (
  await db.getAllAsync(
    "select name, sql from sqlite_master where type = 'index' and tbl_name = 'sessions' order by name"
  )
).map(({ name, sql }) => ({ name, sql: sql?.replace(/\s+/g, ' ').trim() ?? null }));

const snapshotRows = async () => ({
  sessions: await db.getAllAsync('select * from sessions order by id'),
  attendees: await db.getAllAsync('select * from session_attendees order by id'),
  outbox: await db.getAllAsync('select * from sync_outbox order by id'),
});

test('the migration is registered after assessment_results', () => {
  expect(V).toBeDefined();
  expect(V).toBeGreaterThan(MIGRATIONS.find(({ name }) => name === 'assessment_results').version);
});

test('upgrade keeps sessions, attendees, queued uploads, indexes and the attendee cascade', async () => {
  const rows = await snapshotRows();
  const indexes = await sessionIndexes();
  const attendeeForeignKeys = await db.getAllAsync('pragma foreign_key_list(session_attendees)');

  await runMigrations(db);

  expect(await db.getFirstAsync('pragma user_version')).toEqual({ user_version: CURRENT_SCHEMA_VERSION });
  expect(await db.getFirstAsync('select version, name from schema_migrations where version = ?', V))
    .toEqual({ version: V, name: 'sessions_group_history_reference' });
  expect(await snapshotRows()).toEqual(rows);
  expect(await sessionIndexes()).toEqual(indexes);
  expect(await db.getAllAsync('pragma foreign_key_list(session_attendees)')).toEqual(attendeeForeignKeys);
  expect(await db.getAllAsync('pragma foreign_key_check')).toEqual([]);
  expect(await db.getFirstAsync('pragma foreign_keys')).toEqual({ foreign_keys: 1 });

  await db.runAsync("delete from sessions where id = 's-1'");
  expect(await db.getFirstAsync("select count(*) as count from session_attendees where session_id = 's-1'"))
    .toEqual({ count: 0 });
});

test('sessions.group_id no longer requires a group on this phone', async () => {
  await runMigrations(db);
  await db.runAsync(`
    insert into sessions (id, user_id, programme_id, session_date, group_id)
    values ('historical-session', 'user-1', 'programme-a', '2026-10-19', 'group-not-on-phone')
  `);
  expect(await db.getFirstAsync("select group_id from sessions where id = 'historical-session'"))
    .toEqual({ group_id: 'group-not-on-phone' });
  expect((await db.getAllAsync('pragma foreign_key_list(sessions)')).map(({ table }) => table).sort())
    .toEqual(['classes', 'programmes']);
  expect(await db.getAllAsync('pragma foreign_key_check')).toEqual([]);
});

test('class and programme references and the state check still hold', async () => {
  await runMigrations(db);
  for (const [column, value, expected] of [
    ['class_id', 'class-missing', /FOREIGN KEY constraint failed/],
    ['programme_id', 'programme-missing', /FOREIGN KEY constraint failed/],
    ['state', 'bogus', /CHECK constraint failed/],
  ]) {
    let caught;
    try {
      await db.runAsync(`update sessions set ${column} = ? where id = 's-1'`, value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    expect(caught.message).toMatch(expected);
  }
});

test('a second run changes nothing', async () => {
  await runMigrations(db);
  const rows = await snapshotRows();
  const version = await db.getFirstAsync('pragma user_version');
  const ledger = await db.getAllAsync('select * from schema_migrations order by version');
  await runMigrations(db);
  expect(await db.getFirstAsync('pragma user_version')).toEqual(version);
  expect(await snapshotRows()).toEqual(rows);
  expect(await db.getAllAsync('select * from schema_migrations order by version')).toEqual(ledger);
});
