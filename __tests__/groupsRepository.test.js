jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { groupEaAssignmentDomainId } from '../src/db/repositories/domainRepositoryUtils';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import {
  createGroupsRepository,
  repairGroupOwnershipForSync,
} from '../src/db/repositories/groupsRepository';
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

      await groupsRepository.archiveGroup('group-1', {
        actorUserId: 'user-1',
        archivedAt: '2026-05-25T00:00:00.000Z',
      });

      expect(await db.getFirstAsync('select archived_at from groups where id = ?', 'group-1'))
        .toEqual({ archived_at: '2026-05-25T00:00:00.000Z' });
      expect(await db.getFirstAsync('select unassigned_at from group_ea_assignments where group_id = ?', 'group-1'))
        .toEqual({ unassigned_at: '2026-05-25T00:00:00.000Z' });
      expect(await db.getFirstAsync('select removed_at from child_group_memberships where id = ?', 'membership-1'))
        .toEqual({ removed_at: '2026-05-25T00:00:00.000Z' });
    } finally {
      await db.closeAsync();
    }
  });

  test('mobile-created group saves owner and group EA assignment for sync', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const groupsRepository = createGroupsRepository({ database: db });

      await groupsRepository.saveGroup({
        id: 'group-1',
        name: 'Group 1',
        staff_id: 'user-1',
        synced: false,
      });

      expect(await db.getFirstAsync(`
        select id, programme_id, created_by, sync_status
        from groups
        where id = 'group-1'
      `)).toEqual({
        id: 'group-1',
        programme_id: 'programme-a',
        created_by: 'user-1',
        sync_status: 'pending',
      });

      const assignment = await db.getFirstAsync(`
        select id, group_id, ea_user_id, programme_id, created_by, sync_status
        from group_ea_assignments
        where group_id = 'group-1'
      `);
      expect(assignment).toEqual({
        id: groupEaAssignmentDomainId({ groupId: 'group-1' }),
        group_id: 'group-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        created_by: 'user-1',
        sync_status: 'pending',
      });

      const outboxTables = await db.getAllAsync(`
        select table_name, operation
        from sync_outbox
        where record_id = 'group-1'
           or table_name = 'group_ea_assignments'
        order by table_name
      `);
      expect(outboxTables).toEqual([
        { table_name: 'group_ea_assignments', operation: 'insert' },
        { table_name: 'groups', operation: 'insert' },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('ownership repair reactivates an archived deterministic group EA row without duplicating it', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const groupsRepository = createGroupsRepository({ database: db });
      const groupId = 'group-archived-assignment';
      const assignmentId = groupEaAssignmentDomainId({ groupId });

      await groupsRepository.saveGroup({
        id: groupId,
        name: 'Archived Assignment Group',
        staff_id: 'user-1',
        synced: false,
      });
      await db.runAsync(
        'update group_ea_assignments set unassigned_at = ? where id = ?',
        '2026-05-25T00:00:00.000Z',
        assignmentId
      );
      await db.runAsync('update groups set created_by = null where id = ?', groupId);

      await repairGroupOwnershipForSync({ database: db });

      const assignments = await db.getAllAsync(`
        select id, group_id, ea_user_id, programme_id, created_by, unassigned_at, sync_status
        from group_ea_assignments
        where group_id = ?
      `, groupId);
      expect(assignments).toEqual([
        {
          id: assignmentId,
          group_id: groupId,
          ea_user_id: 'user-1',
          programme_id: 'programme-a',
          created_by: 'user-1',
          unassigned_at: null,
          sync_status: 'pending',
        },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('child group membership derives owner and grouping version from group', async () => {
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
      await createGroupingVersionsRepository({ database: db }).save({
        id: 'grouping-1',
        class_id: 'class-1',
        academic_year_id: 'year-2026',
        version_number: 1,
        status: 'active',
        created_by: 'user-1',
        synced: false,
      });

      const groupsRepository = createGroupsRepository({ database: db });
      await groupsRepository.saveGroup({
        id: 'group-1',
        name: 'Group 1',
        programme_id: 'programme-a',
        class_id: 'class-1',
        grouping_version_id: 'grouping-1',
        created_by: 'user-1',
        synced: false,
      });

      await groupsRepository.addChildToGroup({
        id: 'membership-1',
        child_id: 'child-1',
        group_id: 'group-1',
        synced: false,
      });

      const membership = await db.getFirstAsync(`
        select id, child_id, group_id, grouping_version_id, created_by, sync_status
        from child_group_memberships
        where id = 'membership-1'
      `);
      expect(membership).toEqual({
        id: 'membership-1',
        child_id: 'child-1',
        group_id: 'group-1',
        grouping_version_id: 'grouping-1',
        created_by: 'user-1',
        sync_status: 'pending',
      });

      const outbox = await db.getFirstAsync(`
        select payload
        from sync_outbox
        where table_name = 'child_group_memberships'
          and record_id = 'membership-1'
      `);
      expect(JSON.parse(outbox.payload)).toEqual(expect.objectContaining({
        created_by: 'user-1',
        grouping_version_id: 'grouping-1',
      }));
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
      await db.runAsync("update groups set sync_status = 'synced' where id = 'group-1'");
      await db.runAsync('delete from sync_outbox');

      await groupsRepository.deleteGroup('group-1', {
        actorUserId: 'user-1',
        archivedAt: '2026-05-26T00:00:00.000Z',
      });

      expect(await db.getFirstAsync('select id, archived_at from groups where id = ?', 'group-1'))
        .toEqual({ id: 'group-1', archived_at: '2026-05-26T00:00:00.000Z' });
      expect(await db.getFirstAsync('select unassigned_at from group_ea_assignments where group_id = ?', 'group-1'))
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

  test('visible membership reads exclude active rows for groups the EA cannot see', async () => {
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
      const repository = createGroupsRepository({ database: db });

      for (const [id, name] of [
        ['group-visible', 'A Visible Group'],
        ['group-ended', 'B Ended Assignment'],
        ['group-archived', 'C Archived Group'],
      ]) {
        await repository.saveGroup({
          id,
          name,
          programme_id: 'programme-a',
          class_id: 'class-1',
          created_by: 'user-1',
          synced: false,
        });
        await repository.addChildToGroup({
          id: `membership-${id}`,
          child_id: 'child-1',
          group_id: id,
          created_by: 'user-1',
          synced: false,
        });
      }
      await db.runAsync(`
        update group_ea_assignments
        set unassigned_at = '2026-05-22T00:00:00.000Z'
        where group_id = 'group-ended'
      `);
      await db.runAsync(`
        update groups
        set archived_at = '2026-05-22T00:00:00.000Z'
        where id = 'group-archived'
      `);

      expect((await repository.getChildrenGroups())
        .map((membership) => membership.id).sort()).toEqual([
        'membership-group-archived',
        'membership-group-ended',
        'membership-group-visible',
      ]);
      expect((await repository.getVisibleChildrenGroups({
        userId: 'user-1',
        programmeId: 'programme-a',
      })).map((membership) => membership.id)).toEqual([
        'membership-group-visible',
      ]);
      expect(await db.getAllAsync(`
        select id, removed_at
        from child_group_memberships
        order by id
      `)).toEqual([
        { id: 'membership-group-archived', removed_at: null },
        { id: 'membership-group-ended', removed_at: null },
        { id: 'membership-group-visible', removed_at: null },
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

  test('user-scoped group reads require an active assignment for that EA', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createGroupsRepository({ database: db });

      await repository.saveGroup({
        id: 'group-visible',
        name: 'A Visible Group',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await repository.saveGroup({
        id: 'group-ended',
        name: 'B Ended Assignment',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await repository.saveGroup({
        id: 'group-unassigned',
        name: 'C Never Assigned',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-2',
        synced: false,
      });
      await repository.saveGroup({
        id: 'group-archived',
        name: 'D Archived Group',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await db.runAsync(`
        update group_ea_assignments
        set unassigned_at = '2026-05-22T00:00:00.000Z'
        where group_id = 'group-ended'
      `);
      await db.runAsync(`
        update groups
        set archived_at = '2026-05-22T00:00:00.000Z'
        where id = 'group-archived'
      `);

      expect((await repository.getGroups({
        userId: 'user-1',
        programmeId: 'programme-a',
      })).map((group) => group.id)).toEqual(['group-visible']);

      expect((await repository.getGroups()).map((group) => group.id)).toEqual([
        'group-visible',
        'group-ended',
        'group-unassigned',
      ]);
    } finally {
      await db.closeAsync();
    }
  });
});
