jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createClassEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

describe('classesRepository', () => {
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

  test('archiveClass ends active class EA assignments in the same transaction', async () => {
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

      await classesRepository.archiveClass('class-1', {
        actorUserId: 'user-1',
        archivedAt: '2026-05-24T00:00:00.000Z',
      });

      expect(await db.getFirstAsync('select archived_at from classes where id = ?', 'class-1'))
        .toEqual({ archived_at: '2026-05-24T00:00:00.000Z' });
      expect(await db.getFirstAsync('select unassigned_at from class_ea_assignments where id = ?', 'class-assignment-1'))
        .toEqual({ unassigned_at: '2026-05-24T00:00:00.000Z' });
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
});
