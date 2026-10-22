jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { CURRENT_SCHEMA_VERSION, MIGRATIONS, runMigrations } from '../src/db/migrations';
import { letterMasteryDomainId } from '../src/db/repositories/domainRepositoryUtils';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';

const migration = () => MIGRATIONS.find((m) => m.name === 'letter_mastery_current_state');
const BASE = (migration()?.version ?? CURRENT_SCHEMA_VERSION + 1) - 1;
const T1 = '2026-10-01T08:00:00.000Z';
const T2 = '2026-10-05T08:00:00.000Z';
const T3 = '2026-10-06T08:00:00.000Z';
const T_E = '2026-10-03T08:00:00.000Z';
const T_K = '2026-10-02T08:00:00.000Z';
let db;

beforeEach(async () => {
  db = createBetterSqliteTestDatabase();
  for (const item of MIGRATIONS.filter((m) => m.version <= BASE)) {
    await db.execAsync(item.sql);
    if (item.transform) await item.transform(db);
  }
  await db.execAsync(`PRAGMA user_version = ${BASE}`);
  await db.execAsync(`
    insert into programmes (id, code, name)
    values ('programme-1', 'literacy', 'Literacy'), ('programme-2', 'numeracy', 'Numeracy');
    insert into children (id, first_name, last_name) values ('child-1', 'Test', 'Child');
    insert into letter_mastery
      (id, child_id, letter, language, user_id, programme_id, deleted_at, updated_at,
       created_at, sync_status, server_updated_at)
    values
      ('old-a-user-1', 'child-1', 'a', 'English', 'user-1', 'programme-1', null, '${T1}', '${T1}', 'synced', '${T1}'),
      ('old-a-user-2', 'child-1', 'a', 'en', 'user-2', 'programme-2', '${T2}', '${T2}', '${T1}', 'synced', '${T2}'),
      ('old-k', 'child-1', 'K', 'isiXhosa', 'user-1', 'programme-1', null, '${T_K}', '${T1}', 'synced', '${T_K}'),
      ('old-e', 'child-1', 'e', 'Afrikaans', 'user-1', 'programme-1', null, '${T_E}', '${T1}', 'synced', '${T_E}'),
      ('old-z', 'child-1', 'z', 'Klingon', 'user-1', 'programme-1', null, '${T1}', '${T1}', 'synced', null),
      ('old-b-user-1', 'child-1', 'b', 'English', 'user-1', 'programme-1', null, '${T1}', '${T1}', 'synced', '${T1}'),
      ('old-b-user-2', 'child-1', 'b', 'English', 'user-2', 'programme-2', null, '${T3}', '${T1}', 'pending', null);
    insert into sync_outbox (id, table_name, record_id, operation, owner_user_id)
    values
      ('old-insert', 'letter_mastery', 'old-b-user-2', 'insert', 'user-1'),
      ('old-archive', 'letter_mastery', 'old-a-user-2', 'archive', 'user-1'),
      ('old-update', 'letter_mastery', 'old-k', 'update', 'user-1'),
      ('keep-child', 'children', 'child-1', 'insert', 'user-1');
  `);
});
afterEach(async () => db.closeAsync());

test('upgrading converts labels to codes, keeps the latest row per key, and drops unsynced keys and old outbox rows', async () => {
  const children = await db.getAllAsync('select * from children');
  const childOutbox = await db.getAllAsync("select * from sync_outbox where table_name = 'children'");
  await runMigrations(db);
  expect(migration().version).toBe(BASE + 1);
  expect(await db.getFirstAsync('pragma user_version')).toEqual({ user_version: CURRENT_SCHEMA_VERSION });
  const id = (letter, language) => letterMasteryDomainId({ childId: 'child-1', letter, language });
  expect(await db.getAllAsync(`select id, letter, language, confirmed, changed_at, correction_id, changed_by,
      sync_status, server_changed_at, server_correction_id from letter_mastery order by letter`)).toEqual([
    { id: id('a', 'en'), letter: 'a', language: 'en', confirmed: 0, changed_at: T2, correction_id: 'old-a-user-2',
      changed_by: 'user-2', sync_status: 'synced', server_changed_at: null, server_correction_id: null },
    { id: id('e', 'af'), letter: 'e', language: 'af', confirmed: 1, changed_at: T_E, correction_id: 'old-e',
      changed_by: 'user-1', sync_status: 'synced', server_changed_at: null, server_correction_id: null },
    { id: id('k', 'xh'), letter: 'k', language: 'xh', confirmed: 1, changed_at: T_K, correction_id: 'old-k',
      changed_by: 'user-1', sync_status: 'synced', server_changed_at: null, server_correction_id: null },
  ]);
  expect(await db.getFirstAsync("select programme_id, created_at, updated_at, server_updated_at from letter_mastery where letter = 'a'"))
    .toEqual({ programme_id: 'programme-2', created_at: T1, updated_at: T2, server_updated_at: T2 });
  expect(await db.getAllAsync('select table_name from sync_outbox')).toEqual([{ table_name: 'children' }]);
  expect(await db.getAllAsync('select * from sync_outbox')).toEqual(childOutbox);
  expect(await db.getAllAsync('select * from children')).toEqual(children);
  expect(await db.getAllAsync('pragma foreign_key_check')).toEqual([]);
  expect(await db.getFirstAsync('pragma foreign_keys')).toEqual({ foreign_keys: 1 });
});

test('the rebuilt table has exactly the new columns and its natural key', async () => {
  await runMigrations(db);
  expect((await db.getAllAsync('pragma table_info(letter_mastery)')).map((c) => c.name)).toEqual([
    'id', 'child_id', 'letter', 'language', 'confirmed', 'changed_at', 'correction_id', 'changed_by',
    'programme_id', 'created_at', 'updated_at', 'sync_status', 'last_sync_error', 'server_updated_at',
    'server_changed_at', 'server_correction_id',
  ]);
  expect(await db.getAllAsync('pragma index_list(letter_mastery)')).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'idx_letter_mastery_child_key', unique: 1, partial: 0 }),
  ]));
  const insert = (id, letter, language, confirmed = 1, programme = 'not-on-this-phone') => db.runAsync(`
    insert into letter_mastery (id, child_id, letter, language, confirmed, changed_at, correction_id, changed_by, programme_id)
    values (?, 'child-1', ?, ?, ?, ?, ?, 'user-2', ?)
  `, id, letter, language, confirmed, T3, id, programme);
  await expect(insert('duplicate', 'a', 'en')).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_UNIQUE' });
  await expect(insert('label', 'r', 'English')).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
  await expect(insert('long-letter', 'ab', 'en')).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
  await expect(insert('uppercase', 'A', 'en')).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
  await expect(insert('invalid-confirmed', 'r', 'en', 2)).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
  await insert('context-without-programme', 'r', 'en');
  await insert('null-context', 's', 'en', 0, null);
  expect(await db.getAllAsync('pragma foreign_key_list(letter_mastery)')).toEqual([
    expect.objectContaining({ from: 'child_id', table: 'children', on_delete: 'CASCADE' }),
  ]);
  expect(await db.getAllAsync('pragma foreign_key_check')).toEqual([]);
});

test('a failing transform rolls back the whole migration', async () => {
  const oldRows = await db.getAllAsync('select * from letter_mastery order by id');
  const oldOutbox = await db.getAllAsync('select * from sync_outbox order by id');
  const run = db.runAsync.bind(db);
  const failure = new Error('deliberate mastery id transform failure');
  db.runAsync = jest.fn(async (sql, ...params) => {
    if (/update letter_mastery set id/i.test(sql)) throw failure;
    return run(sql, ...params);
  });
  await expect(runMigrations(db)).rejects.toMatchObject({ message: failure.message });
  expect(await db.getFirstAsync('pragma user_version')).toEqual({ user_version: BASE });
  expect((await db.getAllAsync('pragma table_info(letter_mastery)')).map((c) => c.name))
    .toEqual(expect.arrayContaining(['user_id', 'source', 'mastered_at', 'deleted_at']));
  expect(await db.getAllAsync('select * from letter_mastery order by id')).toEqual(oldRows);
  expect(await db.getAllAsync('select * from sync_outbox order by id')).toEqual(oldOutbox);
  expect(await db.getFirstAsync('select version from schema_migrations where name = ?', 'letter_mastery_current_state')).toBeNull();
  expect(await db.getFirstAsync("select name from sqlite_master where name = 'letter_mastery_v2'")).toBeNull();
  expect(await db.getFirstAsync('pragma foreign_keys')).toEqual({ foreign_keys: 1 });
});

test('relaunching runs nothing and leaves rows untouched', async () => {
  await runMigrations(db);
  const rows = await db.getAllAsync('select * from letter_mastery order by id');
  const ledger = await db.getAllAsync('select * from schema_migrations order by version');
  const exec = jest.spyOn(db, 'execAsync');
  const run = jest.spyOn(db, 'runAsync');
  await runMigrations(db);
  expect(exec).not.toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
  expect(await db.getAllAsync('select * from letter_mastery order by id')).toEqual(rows);
  expect(await db.getAllAsync('select * from schema_migrations order by version')).toEqual(ledger);
});
