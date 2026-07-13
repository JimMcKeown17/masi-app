jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { __reset, __setDatabaseFactory } from 'expo-sqlite';
import { storage } from '../src/utils/storage';
import { getWriter, resetDatabaseConnectionForTests } from '../src/db/client';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const readers = {
  children: () => storage.getMyChildren('user-1'),
  groups: () => storage.getGroups({ userId: 'user-1' }),
  memberships: () => storage.getChildrenGroups(),
  classes: () => storage.getClasses({ userId: 'user-1' }),
};

const selectFields = (row, fields) => Object.fromEntries(
  fields.map((field) => [field, row[field] ?? null])
);

describe('consumer-visible context row shapes', () => {
  let db;

  beforeEach(async () => {
    await resetDatabaseConnectionForTests();
    __reset();
    db = createBetterSqliteTestDatabase();
    __setDatabaseFactory(async () => db);

    const writer = await getWriter();
    await seedCoreData(writer);
    await writer.runAsync(`
      update classes
      set teacher = 'Ms Ndlovu',
          home_language = 'isiXhosa',
          sync_status = 'synced'
      where id = 'class-1'
    `);
    await writer.runAsync(`
      insert into classes (
        id, school_id, name, grade, academic_year_id, archived_at, created_by, sync_status
      ) values (
        'class-archived', 'school-1', 'Archived Class', '2', 'year-2026',
        '2026-06-30T12:00:00.000Z', 'user-1', 'synced'
      )
    `);
    await writer.runAsync(`
      insert into class_ea_assignments (
        id, class_id, ea_user_id, programme_id, assigned_at, created_by, sync_status
      ) values
        ('cea-class-1', 'class-1', 'user-1', 'programme-a',
         '2026-01-15T00:00:00.000Z', 'user-1', 'synced'),
        ('cea-class-archived', 'class-archived', 'user-1', 'programme-a',
         '2026-01-15T00:00:00.000Z', 'user-1', 'synced')
    `);
    await writer.runAsync(`
      insert into children (
        id, first_name, last_name, preferred_name, age, gender, class_id,
        hidden_at, created_by, sync_status
      ) values
        ('child-1', 'Amahle', 'Dlamini', 'Ama', 7, 'female', 'class-1',
         null, 'user-1', 'synced'),
        ('child-hidden', 'Buhle', 'Zulu', 'Bee', 8, 'male', 'class-1',
         '2026-07-01T09:00:00.000Z', 'user-1', 'synced')
    `);
    await writer.runAsync(`
      insert into child_ea_assignments (
        id, user_id, child_id, assigned_at, created_by, sync_status
      ) values
        ('cea-child-1', 'user-1', 'child-1', '2026-01-15T00:00:00.000Z', 'user-1', 'synced'),
        ('cea-child-hidden', 'user-1', 'child-hidden', '2026-01-15T00:00:00.000Z', 'user-1', 'synced')
    `);
    await writer.runAsync(`
      insert into child_programme_enrollments (
        id, child_id, programme_id, enrolled_at, created_by, sync_status
      ) values
        ('cpe-child-1', 'child-1', 'programme-a', '2026-01-15T00:00:00.000Z', 'user-1', 'synced'),
        ('cpe-child-hidden', 'child-hidden', 'programme-a', '2026-01-15T00:00:00.000Z', 'user-1', 'synced')
    `);
    await writer.runAsync(`
      insert into child_class_memberships (
        id, child_id, class_id, academic_year_id, enrolled_at, created_by, sync_status
      ) values
        ('ccm-child-1', 'child-1', 'class-1', 'year-2026', '2026-01-15T00:00:00.000Z', 'user-1', 'synced'),
        ('ccm-child-hidden', 'child-hidden', 'class-1', 'year-2026', '2026-01-15T00:00:00.000Z', 'user-1', 'synced')
    `);
    await writer.runAsync(`
      insert into groups (
        id, name, programme_id, class_id, created_by, sync_status
      ) values (
        'group-1', 'Blue Group', 'programme-a', 'class-1', 'user-1', 'synced'
      )
    `);
    await writer.runAsync(`
      insert into child_group_memberships (
        id, child_id, group_id, joined_at, created_by, sync_status
      ) values (
        'cgm-child-1', 'child-1', 'group-1', '2026-02-01T00:00:00.000Z', 'user-1', 'synced'
      )
    `);
  });

  afterEach(async () => {
    await resetDatabaseConnectionForTests();
    __reset();
    db = null;
  });

  test('pins the child fields consumed by screens', async () => {
    const children = await readers.children();

    expect(children.map((row) => selectFields(row, [
      'id',
      'first_name',
      'last_name',
      'preferred_name',
      'age',
      'gender',
      'class_id',
      'hidden_at',
      'synced',
    ]))).toEqual([
      {
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        preferred_name: 'Ama',
        age: 7,
        gender: 'female',
        class_id: 'class-1',
        hidden_at: null,
        synced: true,
      },
      {
        id: 'child-hidden',
        first_name: 'Buhle',
        last_name: 'Zulu',
        preferred_name: 'Bee',
        age: 8,
        gender: 'male',
        class_id: 'class-1',
        hidden_at: '2026-07-01T09:00:00.000Z',
        synced: true,
      },
    ]);
  });

  test('pins the group and membership fields consumed by screens', async () => {
    const groups = await readers.groups();
    const memberships = await readers.memberships();

    expect(selectFields(groups[0], [
      'id', 'name', 'programme_id', 'class_id',
    ])).toEqual({
      id: 'group-1',
      name: 'Blue Group',
      programme_id: 'programme-a',
      class_id: 'class-1',
    });
    expect(selectFields(memberships[0], [
      'id', 'child_id', 'group_id', 'removed_at',
    ])).toEqual({
      id: 'cgm-child-1',
      child_id: 'child-1',
      group_id: 'group-1',
      removed_at: null,
    });
  });

  test('pins active class fields and excludes archived classes', async () => {
    const classes = await readers.classes();

    expect(classes).toHaveLength(1);
    expect(selectFields(classes[0], [
      'id',
      'name',
      'grade',
      'teacher',
      'home_language',
      'school_id',
      'archived_at',
      'synced',
    ])).toEqual({
      id: 'class-1',
      name: 'Grade 1A',
      grade: '1',
      teacher: 'Ms Ndlovu',
      home_language: 'isiXhosa',
      school_id: 'school-1',
      archived_at: null,
      synced: true,
    });
  });
});
