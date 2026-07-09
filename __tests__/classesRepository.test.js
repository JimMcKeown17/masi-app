jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createClassEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { classEaAssignmentDomainId } from '../src/db/repositories/domainRepositoryUtils';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

const FIXED_NOW = new Date('2026-05-21T08:00:00.000Z');

describe('classesRepository', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('saves and updates classes with sync metadata', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createClassesRepository({ database: db });

      await repository.saveClass({
        id: 'class-2',
        school_id: 'school-1',
        name: 'Grade 2B',
        grade: '2',
        teacher: 'Ms Zulu',
        academic_year_id: 'year-2026',
        created_by: 'user-1',
        synced: false,
      });
      await repository.updateClass('class-2', { teacher: 'Mr Mokoena' });

      expect(await repository.getClasses()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'class-2',
          teacher: 'Mr Mokoena',
          synced: false,
        }),
      ]));
    } finally {
      await db.closeAsync();
    }
  });

  test('mobile-created classes create an active EA assignment in the same transaction', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createClassesRepository({ database: db });

      await repository.saveClass({
        id: 'class-created-on-device',
        school_id: 'school-1',
        name: 'Plan5A',
        grade: 'Grade 1',
        teacher: 'Teacher Plan5',
        academic_year_id: 'year-2026',
        created_by: 'user-1',
        synced: false,
      });

      expect(await repository.getClasses({ userId: 'user-1' })).toEqual([
        expect.objectContaining({
          id: 'class-created-on-device',
        }),
      ]);
      expect(await db.getFirstAsync(`
        select id, class_id, ea_user_id, programme_id, unassigned_at
        from class_ea_assignments
        where class_id = ?
      `, 'class-created-on-device')).toEqual({
        id: classEaAssignmentDomainId({
          classId: 'class-created-on-device',
          eaUserId: 'user-1',
          programmeId: 'programme-a',
        }),
        class_id: 'class-created-on-device',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        unassigned_at: null,
      });
      expect(await db.getFirstAsync(`
        select count(*) as count
        from sync_outbox
        where table_name in ('classes', 'class_ea_assignments')
          and record_id in (
            'class-created-on-device',
            (select id from class_ea_assignments where class_id = 'class-created-on-device')
          )
      `)).toEqual({ count: 2 });
    } finally {
      await db.closeAsync();
    }
  });

  test('synced server-pulled class assignments make admin classes visible offline without outbox rows', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const classesRepository = createClassesRepository({ database: db });
      const assignmentsRepository = createClassEaAssignmentsRepository({ database: db });

      await classesRepository.saveClass({
        id: 'admin-class',
        school_id: 'school-1',
        name: 'Admin Assigned',
        grade: '1',
        academic_year_id: 'year-2026',
        created_by: 'admin-user',
        sync_status: 'synced',
      });
      await assignmentsRepository.save({
        id: 'server-class-assignment',
        class_id: 'admin-class',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        assigned_at: '2026-05-22T08:00:00.000Z',
        created_by: 'admin-user',
        sync_status: 'synced',
      });

      expect(await classesRepository.getClasses({ userId: 'user-1' })).toEqual([
        expect.objectContaining({ id: 'admin-class' }),
      ]);
      expect(await db.getFirstAsync(`
        select count(*) as count
        from sync_outbox
        where record_id in ('admin-class', 'server-class-assignment')
      `)).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('archiveClass ends active class EA assignments in the same transaction', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const classesRepository = createClassesRepository({ database: db });
      const assignmentsRepository = createClassEaAssignmentsRepository({ database: db });
      await createChildrenRepository({ database: db }).save({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      }, { actorUserId: 'user-1' });

      await assignmentsRepository.save({
        id: 'class-assignment-1',
        class_id: 'class-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        assigned_at: '2026-05-21T08:00:00.000Z',
        created_by: 'user-1',
        synced: false,
      });

      await classesRepository.archiveClass('class-1', {
        actorUserId: 'user-1',
        archivedAt: '2026-05-24T00:00:00.000Z',
      });

      expect(await db.getFirstAsync('select archived_at from classes where id = ?', 'class-1'))
        .toEqual({ archived_at: '2026-05-24T00:00:00.000Z' });
      expect(await db.getFirstAsync('select unassigned_at from class_ea_assignments where id = ?', 'class-assignment-1'))
        .toEqual({ unassigned_at: '2026-05-24T00:00:00.000Z' });
      expect(await db.getFirstAsync('select class_id from children where id = ?', 'child-1'))
        .toEqual({ class_id: null });
      expect(await db.getFirstAsync('select exited_at from child_class_memberships where child_id = ?', 'child-1'))
        .toEqual({ exited_at: '2026-05-24T00:00:00.000Z' });
      expect(await db.getFirstAsync(`
        select table_name, operation
        from sync_outbox
        where table_name = 'child_class_memberships'
          and operation = 'archive'
      `)).toEqual({
        table_name: 'child_class_memberships',
        operation: 'archive',
      });
      const childOutbox = await db.getFirstAsync(`
        select payload
        from sync_outbox
        where table_name = 'children'
          and record_id = 'child-1'
          and operation = 'update'
      `);
      expect(JSON.parse(childOutbox.payload)).toEqual(expect.objectContaining({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: null,
      }));
    } finally {
      await db.closeAsync();
    }
  });

  test('deleteClass archives synced classes with dependents instead of creating a sync orphan', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const classesRepository = createClassesRepository({ database: db });
      const assignmentsRepository = createClassEaAssignmentsRepository({ database: db });

      await assignmentsRepository.save({
        id: 'class-assignment-1',
        class_id: 'class-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        assigned_at: '2026-05-21T08:00:00.000Z',
        created_by: 'user-1',
        synced: false,
      });
      await db.runAsync("update classes set sync_status = 'synced' where id = 'class-1'");
      await db.runAsync('delete from sync_outbox');

      await classesRepository.deleteClass('class-1', {
        actorUserId: 'user-1',
        archivedAt: '2026-05-26T00:00:00.000Z',
      });

      expect(await db.getFirstAsync('select id, archived_at from classes where id = ?', 'class-1'))
        .toEqual({ id: 'class-1', archived_at: '2026-05-26T00:00:00.000Z' });
      expect(await db.getFirstAsync('select unassigned_at from class_ea_assignments where id = ?', 'class-assignment-1'))
        .toEqual({ unassigned_at: '2026-05-26T00:00:00.000Z' });
      expect(await db.getFirstAsync(`
        select table_name, record_id, operation
        from sync_outbox
        where table_name = 'classes'
          and record_id = 'class-1'
      `)).toEqual({
        table_name: 'classes',
        record_id: 'class-1',
        operation: 'archive',
      });
    } finally {
      await db.closeAsync();
    }
  });

  test('saveClass on a local write throws when no owner field is set (RLS contract guard)', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createClassesRepository({ database: db });

      await expect(repository.saveClass({
        id: 'class-no-owner',
        school_id: 'school-1',
        name: 'Orphan',
        grade: '1',
        academic_year_id: 'year-2026',
        synced: false,
      })).rejects.toThrow(/classes\.created_by is required/i);

      expect(await db.getFirstAsync('select count(*) as count from classes where id = ?', 'class-no-owner'))
        .toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('saveClass defaults created_by from staff_id when only staff_id is provided', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createClassesRepository({ database: db });

      await repository.saveClass({
        id: 'class-via-staff-id',
        school_id: 'school-1',
        name: 'StaffIdOnly',
        grade: '1',
        academic_year_id: 'year-2026',
        staff_id: 'user-1',
        programme_id: 'programme-a',
        synced: false,
      });

      expect(await db.getFirstAsync('select id, created_by from classes where id = ?', 'class-via-staff-id'))
        .toEqual({ id: 'class-via-staff-id', created_by: 'user-1' });
      expect(await db.getFirstAsync(`
        select count(*) as count
        from class_ea_assignments
        where class_id = ?
          and ea_user_id = ?
          and unassigned_at is null
      `, 'class-via-staff-id', 'user-1')).toEqual({ count: 1 });
    } finally {
      await db.closeAsync();
    }
  });

  test('saveClass on a local write throws when no programme can be resolved (RLS contract guard)', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db, { includeStaffProgrammeAssignment: false });
      const repository = createClassesRepository({ database: db });

      await expect(repository.saveClass({
        id: 'class-no-programme',
        school_id: 'school-1',
        name: 'NoProgramme',
        grade: '1',
        academic_year_id: 'year-2026',
        created_by: 'user-1',
        synced: false,
      })).rejects.toThrow(/classes.*programme.*required|active programme assignment/i);

      expect(await db.getFirstAsync('select count(*) as count from classes where id = ?', 'class-no-programme'))
        .toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('user-scoped class reads return active assignments in the active programme', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const classesRepository = createClassesRepository({ database: db });
      const assignmentsRepository = createClassEaAssignmentsRepository({ database: db });

      await classesRepository.saveClass({
        id: 'class-2',
        school_id: 'school-1',
        name: 'Grade 2B',
        grade: '2',
        academic_year_id: 'year-2026',
        created_by: 'admin-user',
        synced: true,
      });
      await assignmentsRepository.save({
        id: 'assignment-literacy',
        class_id: 'class-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        assigned_at: '2026-05-21T08:00:00.000Z',
        created_by: 'admin-user',
        synced: false,
      });
      await assignmentsRepository.save({
        id: 'assignment-numeracy',
        class_id: 'class-2',
        ea_user_id: 'user-1',
        programme_id: 'programme-b',
        assigned_at: '2026-05-21T08:00:00.000Z',
        created_by: 'admin-user',
        synced: false,
      });

      expect((await classesRepository.getClasses()).map(classItem => classItem.id))
        .toEqual(['class-1', 'class-2']);
      expect(await classesRepository.getClasses({ userId: 'user-1' })).toEqual([
        expect.objectContaining({ id: 'class-1' }),
      ]);
    } finally {
      await db.closeAsync();
    }
  });
});
