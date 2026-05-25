jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { createGroupEaAssignmentsRepository } from '../src/db/repositories/groupEaAssignmentsRepository';
import { createGroupingVersionsRepository } from '../src/db/repositories/groupingVersionsRepository';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

const FIXED_NOW = new Date('2026-05-21T08:00:00.000Z');

describe('groupsRepository', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('grouping version save enforces one active grouping version per class/year', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createGroupingVersionsRepository({ database: db });

      await repository.save({
        id: 'grouping-1',
        class_id: 'class-1',
        academic_year_id: 'year-2026',
        version_number: 1,
        status: 'active',
      });

      await expect(repository.save({
        id: 'grouping-2',
        class_id: 'class-1',
        academic_year_id: 'year-2026',
        version_number: 2,
        status: 'active',
      })).rejects.toThrow(/unique/i);
    } finally {
      await db.closeAsync();
    }
  });

  test('group save, membership operations, and archive are transactional', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      }, { actorUserId: 'user-1' });
      const groupsRepository = createGroupsRepository({ database: db });
      const assignmentsRepository = createGroupEaAssignmentsRepository({ database: db });

      await groupsRepository.saveGroup({
        id: 'group-1',
        name: 'Group 1',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await groupsRepository.addChildToGroup({
        id: 'membership-1',
        child_id: 'child-1',
        group_id: 'group-1',
        synced: false,
      });
      await assignmentsRepository.save({
        id: 'group-assignment-1',
        group_id: 'group-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        assigned_at: '2026-05-21T08:00:00.000Z',
        created_by: 'user-1',
        synced: false,
      });

      await groupsRepository.archiveGroup('group-1', {
        actorUserId: 'user-1',
        archivedAt: '2026-05-25T00:00:00.000Z',
      });

      expect(await db.getFirstAsync('select archived_at from groups where id = ?', 'group-1'))
        .toEqual({ archived_at: '2026-05-25T00:00:00.000Z' });
      expect(await db.getFirstAsync('select unassigned_at from group_ea_assignments where id = ?', 'group-assignment-1'))
        .toEqual({ unassigned_at: '2026-05-25T00:00:00.000Z' });
      expect(await db.getFirstAsync('select removed_at from child_group_memberships where id = ?', 'membership-1'))
        .toEqual({ removed_at: '2026-05-25T00:00:00.000Z' });
    } finally {
      await db.closeAsync();
    }
  });

  test('deleteGroup archives synced groups with dependents instead of creating a sync orphan', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      }, { actorUserId: 'user-1' });
      const groupsRepository = createGroupsRepository({ database: db });
      const assignmentsRepository = createGroupEaAssignmentsRepository({ database: db });

      await groupsRepository.saveGroup({
        id: 'group-1',
        name: 'Group 1',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await groupsRepository.addChildToGroup({
        id: 'membership-1',
        child_id: 'child-1',
        group_id: 'group-1',
        synced: false,
      });
      await assignmentsRepository.save({
        id: 'group-assignment-1',
        group_id: 'group-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        assigned_at: '2026-05-21T08:00:00.000Z',
        created_by: 'user-1',
        synced: false,
      });
      await db.runAsync("update groups set sync_status = 'synced' where id = 'group-1'");
      await db.runAsync('delete from sync_outbox');

      await groupsRepository.deleteGroup('group-1', {
        actorUserId: 'user-1',
        archivedAt: '2026-05-26T00:00:00.000Z',
      });

      expect(await db.getFirstAsync('select id, archived_at from groups where id = ?', 'group-1'))
        .toEqual({ id: 'group-1', archived_at: '2026-05-26T00:00:00.000Z' });
      expect(await db.getFirstAsync('select unassigned_at from group_ea_assignments where id = ?', 'group-assignment-1'))
        .toEqual({ unassigned_at: '2026-05-26T00:00:00.000Z' });
      expect(await db.getFirstAsync('select removed_at from child_group_memberships where id = ?', 'membership-1'))
        .toEqual({ removed_at: '2026-05-26T00:00:00.000Z' });
      expect(await db.getFirstAsync(`
        select table_name, record_id, operation
        from sync_outbox
        where table_name = 'groups'
          and record_id = 'group-1'
      `)).toEqual({
        table_name: 'groups',
        record_id: 'group-1',
        operation: 'archive',
      });
    } finally {
      await db.closeAsync();
    }
  });

  test('getChildrenGroups excludes removed memberships by default', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      }, { actorUserId: 'user-1' });
      const groupsRepository = createGroupsRepository({ database: db });

      await groupsRepository.saveGroup({
        id: 'group-1',
        name: 'Group 1',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await groupsRepository.addChildToGroup({
        id: 'membership-1',
        child_id: 'child-1',
        group_id: 'group-1',
        synced: false,
      });

      expect(await groupsRepository.getChildrenGroups()).toEqual([
        expect.objectContaining({ id: 'membership-1' }),
      ]);

      await groupsRepository.removeChildFromGroup('child-1', 'group-1', {
        removedAt: '2026-05-27T00:00:00.000Z',
      });

      expect(await groupsRepository.getChildrenGroups()).toEqual([]);
      expect(await groupsRepository.getChildrenGroups({ includeRemoved: true })).toEqual([
        expect.objectContaining({ id: 'membership-1', removed_at: '2026-05-27T00:00:00.000Z' }),
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('group saves require an active programme assignment when programme_id is omitted', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await db.runAsync("update staff_programme_assignments set ended_at = '2026-05-21T00:00:00.000Z'");
      const repository = createGroupsRepository({ database: db });

      await expect(repository.saveGroup({
        id: 'group-without-programme',
        name: 'Group Without Programme',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      })).rejects.toThrow(/No active programme assignment/i);

      expect(await db.getFirstAsync('select count(*) as count from groups')).toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('user-scoped group reads only return groups in the active programme', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createGroupsRepository({ database: db });

      await repository.saveGroup({
        id: 'group-literacy',
        name: 'Literacy Group',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await repository.saveGroup({
        id: 'group-numeracy',
        name: 'Numeracy Group',
        programme_id: 'programme-b',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });

      expect((await repository.getGroups()).map(group => group.id))
        .toEqual(['group-literacy', 'group-numeracy']);
      expect(await repository.getGroups({ userId: 'user-1' })).toEqual([
        expect.objectContaining({ id: 'group-literacy', programme_id: 'programme-a' }),
      ]);
    } finally {
      await db.closeAsync();
    }
  });
});
