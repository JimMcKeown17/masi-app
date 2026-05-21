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

describe('groupsRepository', () => {
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
});
