import { CURRENT_SCHEMA_VERSION, MIGRATIONS, runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { createClassEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import { createGroupEaAssignmentsRepository } from '../src/db/repositories/groupEaAssignmentsRepository';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const VERSIONED_TABLE_NAMES = [
  'children', 'classes', 'groups',
  'child_ea_assignments', 'class_ea_assignments', 'group_ea_assignments',
  'child_programme_enrollments', 'child_class_memberships', 'child_group_memberships',
  'grouping_versions', 'class_grouping_state',
];
const PULLED_TABLES = [
  ['children', createChildrenRepository, 'saveServerChildRows', { first_name: 'Original', last_name: 'Child', class_id: 'class-1' }, 'first_name', 'Changed'],
  ['classes', createClassesRepository, 'saveServerClassRows', { name: 'Original', grade: '1', school_id: 'school-1', academic_year_id: 'year-2026' }, 'name', 'Changed'],
  ['groups', createGroupsRepository, 'saveServerGroupRows', { name: 'Original', programme_id: 'programme-a' }, 'name', 'Changed'],
  ['child_ea_assignments', createChildrenRepository, 'saveServerStaffChildRows', { child_id: 'child-1', user_id: 'user-1', unassigned_at: null }, 'unassigned_at', '2026-10-18T09:00:00.000Z'],
  ['class_ea_assignments', createClassEaAssignmentsRepository, 'saveServerRows', { class_id: 'class-1', ea_user_id: 'user-1', programme_id: 'programme-a', unassigned_at: null }, 'unassigned_at', '2026-10-18T09:00:00.000Z'],
  ['group_ea_assignments', createGroupEaAssignmentsRepository, 'saveServerRows', { group_id: 'group-1', ea_user_id: 'user-1', programme_id: 'programme-a', unassigned_at: null }, 'unassigned_at', '2026-10-18T09:00:00.000Z'],
  ['child_programme_enrollments', createChildrenRepository, 'saveServerChildProgrammeEnrollmentRows', { child_id: 'child-1', programme_id: 'programme-a', ended_at: null }, 'ended_at', '2026-10-18T09:00:00.000Z'],
  ['child_class_memberships', createChildrenRepository, 'saveServerChildClassMembershipRows', { child_id: 'child-1', class_id: 'class-1', academic_year_id: 'year-2026', exited_at: null }, 'exited_at', '2026-10-18T09:00:00.000Z'],
  ['child_group_memberships', createGroupsRepository, 'saveServerChildrenGroupRows', { child_id: 'child-1', group_id: 'group-1', removed_at: null }, 'removed_at', '2026-10-18T09:00:00.000Z'],
];

describe('local row versions', () => {
  let db;
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    await db.runAsync("insert into children (id, first_name, last_name, created_by) values ('child-1', 'Original', 'Child', 'user-1')");
    await db.runAsync("insert into groups (id, name, programme_id, created_by) values ('group-1', 'Original', 'programme-a', 'user-1')");
  });
  afterEach(async () => db.closeAsync());

  test('migration 14 adds row_version default 1 to exactly the 11 tables', async () => {
    const tables = await db.getAllAsync("select name from sqlite_master where type = 'table'");
    const versionedTables = [];
    for (const { name } of tables) {
      const columns = await db.getAllAsync(`pragma table_info("${name}")`);
      const version = columns.find(column => column.name === 'row_version');
      if (version) {
        versionedTables.push(name);
        expect(version).toMatchObject({ type: 'INTEGER', notnull: 1, dflt_value: '1' });
      }
    }
    expect(versionedTables.sort()).toEqual([...VERSIONED_TABLE_NAMES].sort());
    expect(await db.getFirstAsync('pragma user_version')).toEqual({ user_version: CURRENT_SCHEMA_VERSION });
    await runMigrations(db);
    expect(await db.getAllAsync('pragma foreign_key_check')).toEqual([]);
  });

  test('a local write never sets row_version', async () => {
    const repository = createChildrenRepository({ database: db });
    await db.runAsync("update children set row_version = 5, sync_status = 'synced' where id = 'child-1'");
    const edit = { first_name: 'Edited', row_version: 2, synced: true, sync_status: 'synced' };
    await repository.updateChild('child-1', edit);
    expect(await db.getFirstAsync("select first_name, row_version, sync_status from children where id = 'child-1'"))
      .toEqual({ first_name: 'Edited', row_version: 5, sync_status: 'pending' });
    expect(edit.row_version).toBe(2);

    await repository.save({ id: 'new-child', first_name: 'New', last_name: 'Child', created_by: 'user-1', row_version: 2 });
    expect(await db.getFirstAsync("select row_version, sync_status from children where id = 'new-child'"))
      .toEqual({ row_version: 1, sync_status: 'pending' });
    expect(await db.getFirstAsync("select count(*) as count from sync_outbox where table_name = 'children'"))
      .toEqual({ count: 2 });
  });

  describe.each(PULLED_TABLES)('%s downloads', (table, createRepository, saveMethod, fields, contentField, changedContent) => {
    const serverRow = (overrides = {}) => ({
      id: 'pulled-row',
      ...fields,
      created_by: 'user-1',
      assigned_at: '2026-10-18T08:00:00.000Z',
      created_at: '2026-10-18T08:00:00.000Z',
      updated_at: '2026-10-18T08:00:00.000Z',
      synced: true,
      sync_status: 'synced',
      ...overrides,
    });
    const readRow = () => db.getFirstAsync(`select * from ${table} where id = 'pulled-row'`);
    const saveRow = row => createRepository({ database: db })[saveMethod]([row]);

    test('a pulled row stores the server version', async () => {
      await saveRow(serverRow({ row_version: 7 }));
      expect(await readRow()).toMatchObject({ row_version: 7, sync_status: 'synced' });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    });

    test('acknowledged v5 survives a pulled v4, then accepts v6', async () => {
      await saveRow(serverRow({ row_version: 5 }));
      const acknowledged = await readRow();
      await saveRow(serverRow({ row_version: 4, [contentField]: changedContent }));
      expect(await readRow()).toEqual(acknowledged);
      await saveRow(serverRow({ row_version: 6, [contentField]: changedContent }));
      expect(await readRow()).toMatchObject({ row_version: 6, [contentField]: changedContent });
    });

    test('an equal pulled v5 applies new content', async () => {
      await saveRow(serverRow({ row_version: 5 }));
      await saveRow(serverRow({ row_version: 5, [contentField]: changedContent }));
      expect(await readRow()).toMatchObject({ row_version: 5, [contentField]: changedContent });
    });

    test('a terminal row converges from v7 to pulled v4', async () => {
      await saveRow(serverRow({ row_version: 7 }));
      await db.runAsync(`update ${table} set sync_status = 'terminal' where id = 'pulled-row'`);
      await saveRow(serverRow({ row_version: 4, [contentField]: changedContent }));
      expect(await readRow()).toMatchObject({ row_version: 4, sync_status: 'synced', [contentField]: changedContent });
    });

    test.each(['pending', 'failed'])('a %s local row still skips a newer pull', async status => {
      await saveRow(serverRow({ row_version: 5 }));
      await db.runAsync(`update ${table} set sync_status = ? where id = 'pulled-row'`, status);
      const local = await readRow();
      expect(local).toMatchObject({ id: 'pulled-row', sync_status: status });
      await saveRow(serverRow({ row_version: 7, [contentField]: changedContent }));
      expect(await readRow()).toEqual(local);
    });
  });
});

test('v13 upgrade preserves existing content and queued payloads and defaults existing rows to v1', async () => {
  const db = createBetterSqliteTestDatabase();
  try {
    for (const migration of MIGRATIONS.filter(item => item.version <= 13)) await db.execAsync(migration.sql);
    await db.execAsync('pragma user_version = 13');
    await seedCoreData(db);
    await db.runAsync("insert into children (id, first_name, last_name) values ('child-1', 'Original', 'Child')");
    await db.runAsync(`insert into sync_outbox (id, table_name, record_id, operation, payload, owner_user_id)
      values ('queued', 'children', 'child-1', 'insert', '{"id":"child-1"}', 'user-1')`);
    const before = await db.getFirstAsync("select * from children where id = 'child-1'");
    const outboxBefore = await db.getAllAsync('select * from sync_outbox');
    await runMigrations(db);
    expect(await db.getFirstAsync('pragma user_version')).toEqual({ user_version: CURRENT_SCHEMA_VERSION });
    expect(await db.getFirstAsync("select * from children where id = 'child-1'"))
      .toEqual({ ...before, row_version: 1 });
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual(outboxBefore.map(row => ({
      ...row, error_class: null, error_code: null,
    })));
    expect(await db.getAllAsync('pragma foreign_key_check')).toEqual([]);
  } finally {
    await db.closeAsync();
  }
});
