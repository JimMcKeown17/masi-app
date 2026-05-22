jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
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
        { table_name: 'child_class_memberships', record_id: expect.any(String), operation: 'insert' },
        { table_name: 'child_ea_assignments', record_id: expect.any(String), operation: 'insert' },
        { table_name: 'child_programme_enrollments', record_id: expect.any(String), operation: 'insert' },
        { table_name: 'children', record_id: 'child-1', operation: 'insert' },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('reassigning a child after ended relationships preserves historical rows', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await repository.save(makeChild(), { actorUserId: 'user-1' });

      const originalAssignment = await db.getFirstAsync('select id from child_ea_assignments where child_id = ?', 'child-1');
      const originalEnrollment = await db.getFirstAsync('select id from child_programme_enrollments where child_id = ?', 'child-1');
      const originalClassMembership = await db.getFirstAsync('select id from child_class_memberships where child_id = ?', 'child-1');

      await repository.deleteStaffChild('user-1', 'child-1');
      await db.runAsync(`
        update child_programme_enrollments
        set ended_at = '2026-05-22T00:00:00.000Z'
        where child_id = 'child-1'
      `);
      await db.runAsync(`
        update child_class_memberships
        set exited_at = '2026-05-22T00:00:00.000Z'
        where child_id = 'child-1'
      `);

      await repository.save(makeChild({ updated_at: '2026-05-23T00:00:00.000Z' }), { actorUserId: 'user-1' });

      const assignments = await db.getAllAsync('select id, unassigned_at from child_ea_assignments order by assigned_at, id');
      const enrollments = await db.getAllAsync('select id, ended_at from child_programme_enrollments order by enrolled_at, id');
      const classMemberships = await db.getAllAsync('select id, exited_at from child_class_memberships order by enrolled_at, id');

      expect(assignments).toHaveLength(2);
      expect(assignments).toEqual(expect.arrayContaining([
        { id: originalAssignment.id, unassigned_at: expect.any(String) },
        { id: expect.not.stringMatching(originalAssignment.id), unassigned_at: null },
      ]));
      expect(enrollments).toHaveLength(2);
      expect(enrollments).toEqual(expect.arrayContaining([
        { id: originalEnrollment.id, ended_at: '2026-05-22T00:00:00.000Z' },
        { id: expect.not.stringMatching(originalEnrollment.id), ended_at: null },
      ]));
      expect(classMemberships).toHaveLength(2);
      expect(classMemberships).toEqual(expect.arrayContaining([
        { id: originalClassMembership.id, exited_at: '2026-05-22T00:00:00.000Z' },
        { id: expect.not.stringMatching(originalClassMembership.id), exited_at: null },
      ]));

      const insertOutboxRows = await db.getAllAsync(`
        select table_name, record_id, operation
        from sync_outbox
        where operation = 'insert'
          and table_name in (
            'child_ea_assignments',
            'child_programme_enrollments',
            'child_class_memberships'
          )
        order by table_name, record_id
      `);
      expect(insertOutboxRows).toEqual(expect.arrayContaining([
        { table_name: 'child_ea_assignments', record_id: originalAssignment.id, operation: 'insert' },
        { table_name: 'child_programme_enrollments', record_id: originalEnrollment.id, operation: 'insert' },
        { table_name: 'child_class_memberships', record_id: originalClassMembership.id, operation: 'insert' },
      ]));
      expect(insertOutboxRows).toHaveLength(6);
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

  test('synced server-pulled child junctions make a handover child visible offline without outbox rows', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await repository.saveChildRecord({
        id: 'handover-child',
        first_name: 'Handover',
        last_name: 'Child',
        class_id: 'class-1',
        created_by: 'admin-user',
        sync_status: 'synced',
      });
      await repository.saveStaffChild({
        id: 'server-cea-1',
        user_id: 'user-1',
        child_id: 'handover-child',
        assigned_at: '2026-05-22T08:00:00.000Z',
        sync_status: 'synced',
      });
      await repository.saveChildProgrammeEnrollment({
        id: 'server-cpe-1',
        child_id: 'handover-child',
        programme_id: 'programme-a',
        enrolled_at: '2026-05-22T08:00:00.000Z',
        sync_status: 'synced',
      });
      await repository.saveChildClassMembership({
        id: 'server-ccm-1',
        child_id: 'handover-child',
        class_id: 'class-1',
        academic_year_id: 'year-2026',
        enrolled_at: '2026-05-22T08:00:00.000Z',
        sync_status: 'synced',
      });

      expect(await repository.getMyChildren('user-1')).toEqual([
        expect.objectContaining({ id: 'handover-child' }),
      ]);
      expect(await db.getFirstAsync(`
        select count(*) as count
        from sync_outbox
        where record_id in ('handover-child', 'server-cea-1', 'server-cpe-1', 'server-ccm-1')
      `)).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('getMyChildren excludes children whose active class is archived', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.save(makeChild(), { actorUserId: 'user-1' });

      expect(await repository.getMyChildren('user-1')).toHaveLength(1);

      await db.runAsync("update classes set archived_at = '2026-05-24T00:00:00.000Z' where id = 'class-1'");

      expect(await repository.getMyChildren('user-1')).toEqual([]);
    } finally {
      await db.closeAsync();
    }
  });

  test('archive ends active EA, programme, class, and group relationships in the same transaction', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.save(makeChild(), { actorUserId: 'user-1' });
      await createGroupsRepository({ database: db }).saveGroup({
        id: 'group-1',
        name: 'Group 1',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await createGroupsRepository({ database: db }).addChildToGroup({
        id: 'membership-1',
        child_id: 'child-1',
        group_id: 'group-1',
        synced: false,
      });

      await repository.archiveChild('child-1', { actorUserId: 'user-1', archivedAt: '2026-05-23T00:00:00.000Z' });

      expect(await db.getFirstAsync('select archived_at from children where id = ?', 'child-1'))
        .toEqual({ archived_at: '2026-05-23T00:00:00.000Z' });
      expect(await db.getFirstAsync('select unassigned_at from child_ea_assignments where child_id = ?', 'child-1'))
        .toEqual({ unassigned_at: '2026-05-23T00:00:00.000Z' });
      expect(await db.getFirstAsync('select ended_at from child_programme_enrollments where child_id = ?', 'child-1'))
        .toEqual({ ended_at: '2026-05-23T00:00:00.000Z' });
      expect(await db.getFirstAsync('select exited_at from child_class_memberships where child_id = ?', 'child-1'))
        .toEqual({ exited_at: '2026-05-23T00:00:00.000Z' });
      expect(await db.getFirstAsync('select removed_at from child_group_memberships where child_id = ?', 'child-1'))
        .toEqual({ removed_at: '2026-05-23T00:00:00.000Z' });
      expect(await db.getFirstAsync(`
        select table_name, record_id, operation
        from sync_outbox
        where table_name = 'child_group_memberships'
          and record_id = 'membership-1'
          and operation = 'archive'
      `)).toEqual({
        table_name: 'child_group_memberships',
        record_id: 'membership-1',
        operation: 'archive',
      });
    } finally {
      await db.closeAsync();
    }
  });

  test('deleteIfNoHistory enqueues a hard delete for synced children', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.save(makeChild(), { actorUserId: 'user-1' });
      await db.runAsync("update children set sync_status = 'synced' where id = 'child-1'");
      await db.runAsync('delete from sync_outbox');

      expect(await repository.deleteIfNoHistory('child-1')).toBe(true);

      expect(await db.getFirstAsync('select count(*) as count from children')).toEqual({ count: 0 });
      expect(await db.getFirstAsync(`
        select table_name, record_id, operation
        from sync_outbox
        where table_name = 'children'
          and record_id = 'child-1'
      `)).toEqual({
        table_name: 'children',
        record_id: 'child-1',
        operation: 'hard_delete',
      });
    } finally {
      await db.closeAsync();
    }
  });

  test('saveChildRecord does not enqueue already-synced server rows', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await repository.saveChildRecord(makeChild({ sync_status: 'synced', synced: true }));

      expect(await db.getFirstAsync('select sync_status from children where id = ?', 'child-1'))
        .toEqual({ sync_status: 'synced' });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('saving a child requires an active programme assignment and academic year', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await db.runAsync("update staff_programme_assignments set ended_at = '2026-05-21T00:00:00.000Z'");
      await expect(repository.save(makeChild(), { actorUserId: 'user-1' }))
        .rejects.toThrow(/No active programme assignment/i);

      await db.runAsync("update staff_programme_assignments set ended_at = null where id = 'spa-user-1'");
      await db.runAsync('update academic_years set is_active = 0');
      await expect(repository.save(makeChild(), { actorUserId: 'user-1' }))
        .rejects.toThrow(/active academic year/i);
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
