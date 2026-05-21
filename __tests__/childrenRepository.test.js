jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

const makeChild = (overrides = {}) => ({
  id: 'child-1',
  first_name: 'Amahle',
  last_name: 'Dlamini',
  class_id: 'class-1',
  created_by: 'user-1',
  synced: false,
  created_at: '2026-05-21T08:00:00.000Z',
  updated_at: '2026-05-21T08:00:00.000Z',
  ...overrides,
});

describe('childrenRepository', () => {
  test('saving a child creates child, EA assignment, programme enrollment, class membership, and outbox rows atomically', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await repository.save(makeChild(), { actorUserId: 'user-1' });

      expect(await db.getFirstAsync('select id, first_name, sync_status from children where id = ?', 'child-1'))
        .toEqual({ id: 'child-1', first_name: 'Amahle', sync_status: 'pending' });
      expect(await db.getFirstAsync('select user_id, child_id from child_ea_assignments'))
        .toEqual({ user_id: 'user-1', child_id: 'child-1' });
      expect(await db.getFirstAsync('select child_id, programme_id from child_programme_enrollments'))
        .toEqual({ child_id: 'child-1', programme_id: 'programme-a' });
      expect(await db.getFirstAsync('select child_id, class_id, academic_year_id from child_class_memberships'))
        .toEqual({ child_id: 'child-1', class_id: 'class-1', academic_year_id: 'year-2026' });

      const outboxRows = await db.getAllAsync('select table_name, record_id, operation from sync_outbox order by table_name');
      expect(outboxRows).toEqual([
        { table_name: 'child_class_memberships', record_id: 'child-1:class-1:year-2026', operation: 'insert' },
        { table_name: 'child_ea_assignments', record_id: 'child-1:user-1', operation: 'insert' },
        { table_name: 'child_programme_enrollments', record_id: 'child-1:programme-a', operation: 'insert' },
        { table_name: 'children', record_id: 'child-1', operation: 'insert' },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('child save rollback leaves no domain or outbox rows', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await expect(db.withExclusiveTransactionAsync(async (txn) => {
        await repository.save(makeChild(), { actorUserId: 'user-1', transaction: txn });
        throw new Error('forced rollback');
      })).rejects.toThrow('forced rollback');

      for (const tableName of [
        'children',
        'child_ea_assignments',
        'child_programme_enrollments',
        'child_class_memberships',
        'sync_outbox',
      ]) {
        expect(await db.getFirstAsync(`select count(*) as count from ${tableName}`)).toEqual({ count: 0 });
      }
    } finally {
      await db.closeAsync();
    }
  });

  test('getMyChildren is scoped to the user active programme', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.save(makeChild(), { actorUserId: 'user-1' });

      await db.runAsync(`
        update staff_programme_assignments
        set ended_at = '2026-05-22T00:00:00.000Z'
        where id = 'spa-user-1'
      `);
      await db.runAsync(`
        insert into staff_programme_assignments (
          id,
          user_id,
          programme_id,
          school_id,
          assigned_at
        )
        values (
          'spa-user-1-b',
          'user-1',
          'programme-b',
          'school-1',
          '2026-05-22T00:00:01.000Z'
        )
      `);

      expect(await repository.getMyChildren('user-1')).toEqual([]);
    } finally {
      await db.closeAsync();
    }
  });

  test('archive ends active EA, programme, and class relationships in the same transaction', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.save(makeChild(), { actorUserId: 'user-1' });

      await repository.archiveChild('child-1', { actorUserId: 'user-1', archivedAt: '2026-05-23T00:00:00.000Z' });

      expect(await db.getFirstAsync('select archived_at from children where id = ?', 'child-1'))
        .toEqual({ archived_at: '2026-05-23T00:00:00.000Z' });
      expect(await db.getFirstAsync('select unassigned_at from child_ea_assignments where child_id = ?', 'child-1'))
        .toEqual({ unassigned_at: '2026-05-23T00:00:00.000Z' });
      expect(await db.getFirstAsync('select ended_at from child_programme_enrollments where child_id = ?', 'child-1'))
        .toEqual({ ended_at: '2026-05-23T00:00:00.000Z' });
      expect(await db.getFirstAsync('select exited_at from child_class_memberships where child_id = ?', 'child-1'))
        .toEqual({ exited_at: '2026-05-23T00:00:00.000Z' });
    } finally {
      await db.closeAsync();
    }
  });

  test('deleteIfNoHistory deletes no-history children and refuses children with history', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.save(makeChild(), { actorUserId: 'user-1' });

      expect(await repository.deleteIfNoHistory('child-1')).toBe(true);
      expect(await db.getFirstAsync('select count(*) as count from children')).toEqual({ count: 0 });

      await repository.save(makeChild(), { actorUserId: 'user-1' });
      await db.runAsync(`
        insert into assessments (
          id,
          user_id,
          child_id,
          programme_id,
          assessment_type,
          assessment_date
        )
        values (
          'assessment-1',
          'user-1',
          'child-1',
          'programme-a',
          'letter_egra',
          '2026-05-21'
        )
      `);

      expect(await repository.deleteIfNoHistory('child-1')).toBe(false);
      expect(await db.getFirstAsync('select count(*) as count from children')).toEqual({ count: 1 });
    } finally {
      await db.closeAsync();
    }
  });
});
