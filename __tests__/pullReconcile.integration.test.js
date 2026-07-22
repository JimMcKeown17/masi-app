jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { createGroupEaAssignmentsRepository } from '../src/db/repositories/groupEaAssignmentsRepository';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createClassEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import {
  childEaAssignmentDomainId,
  groupEaAssignmentDomainId,
} from '../src/db/repositories/domainRepositoryUtils';
import { runBatchWithPerRowFallback } from '../src/db/repositories/repositoryRuntime';
import { createCountingSqliteTestDatabase } from '../test-support/countingSqliteAdapter';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const CREATED_AT = '2026-07-01T09:00:00.000Z';
const PULLED_AT = '2026-07-13T12:00:00.000Z';

const childRow = (id) => ({
  id,
  first_name: 'Child',
  last_name: id,
  class_id: 'class-1',
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: 'synced',
  synced: true,
});

const childEaAssignmentRow = ({ id, childId, syncStatus = 'synced' }) => ({
  id,
  child_id: childId,
  user_id: 'user-1',
  assigned_at: CREATED_AT,
  unassigned_at: null,
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: syncStatus,
  synced: syncStatus === 'synced',
});

const programmeEnrollmentRow = ({
  id,
  childId,
  programmeId = 'programme-a',
  syncStatus = 'synced',
}) => ({
  id,
  child_id: childId,
  programme_id: programmeId,
  enrolled_at: CREATED_AT,
  ended_at: null,
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: syncStatus,
  synced: syncStatus === 'synced',
});

const classMembershipRow = ({ id, childId, syncStatus = 'synced' }) => ({
  id,
  child_id: childId,
  class_id: 'class-1',
  academic_year_id: 'year-2026',
  enrolled_at: CREATED_AT,
  exited_at: null,
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: syncStatus,
  synced: syncStatus === 'synced',
});

const groupRow = ({ id, archivedAt = null }) => ({
  id,
  name: id,
  programme_id: 'programme-a',
  class_id: 'class-1',
  archived_at: archivedAt,
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: archivedAt || CREATED_AT,
  sync_status: 'synced',
  synced: true,
});

const groupEaAssignmentRow = ({ id, groupId, eaUserId = 'user-1' }) => ({
  id,
  group_id: groupId,
  ea_user_id: eaUserId,
  programme_id: 'programme-a',
  assigned_at: CREATED_AT,
  unassigned_at: null,
  handover_reason: null,
  created_by: eaUserId,
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: 'synced',
  synced: true,
});

const groupMembershipRow = ({ id, childId, groupId, syncStatus = 'synced' }) => ({
  id,
  child_id: childId,
  group_id: groupId,
  joined_at: CREATED_AT,
  removed_at: null,
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: syncStatus,
  synced: syncStatus === 'synced',
});

const classRow = (id) => ({
  id,
  school_id: 'school-1',
  name: id,
  grade: '1',
  academic_year_id: 'year-2026',
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: 'synced',
  synced: true,
});

const classEaAssignmentRow = ({ id, classId, eaUserId = 'user-1' }) => ({
  id,
  class_id: classId,
  ea_user_id: eaUserId,
  programme_id: 'programme-a',
  assigned_at: CREATED_AT,
  unassigned_at: null,
  handover_reason: null,
  created_by: eaUserId,
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: 'synced',
  synced: true,
});

const createDatabase = async () => {
  const db = await createMigratedDatabase(runMigrations);
  await db.execAsync('PRAGMA foreign_keys = ON');
  await seedCoreData(db);
  return db;
};

const seedChildEaAssignments = async (db, count = 15) => {
  const repository = createChildrenRepository({ database: db });
  const children = Array.from({ length: count }, (_, index) => (
    childRow(`child-breaker-${String(index).padStart(2, '0')}`)
  ));
  const assignments = children.map((child, index) => childEaAssignmentRow({
    id: `cea-breaker-${String(index).padStart(2, '0')}`,
    childId: child.id,
  }));
  await repository.saveServerChildRows(children);
  await repository.saveServerStaffChildRows(assignments);
  return { repository, assignments };
};

describe('relationship-scoped pull reconcile', () => {
  test('child EA reconcile ends only an absent synced assignment and enqueues nothing', async () => {
    const db = await createDatabase();
    try {
      const repository = createChildrenRepository({ database: db });
      const keptChild = childRow('child-kept');
      const absentChild = childRow('child-absent');
      await repository.saveServerChildRows([keptChild, absentChild]);
      const kept = childEaAssignmentRow({ id: 'cea-kept', childId: keptChild.id });
      const absent = childEaAssignmentRow({ id: 'cea-absent', childId: absentChild.id });
      await repository.saveServerStaffChildRows([kept, absent]);
      const keptBefore = await db.getFirstAsync(
        'select unassigned_at, updated_at from child_ea_assignments where id = ?',
        kept.id
      );

      await expect(repository.saveServerStaffChildRows([], {
        reconcile: {
          acknowledgedIds: [kept.id],
          pulledAt: PULLED_AT,
          userId: 'user-1',
        },
      })).resolves.toEqual({
        applied: 0,
        skipped: 0,
        failed: 0,
        ended: 1,
        fallbackUsed: false,
        reconcileCompleted: true,
      });

      expect(await db.getFirstAsync(`
        select unassigned_at, sync_status, updated_at
        from child_ea_assignments
        where id = ?
      `, absent.id)).toEqual({
        unassigned_at: PULLED_AT,
        sync_status: 'synced',
        updated_at: PULLED_AT,
      });
      expect(await db.getFirstAsync(
        'select unassigned_at, updated_at from child_ea_assignments where id = ?',
        kept.id
      )).toEqual(keptBefore);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
      expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
    } finally {
      await db.closeAsync();
    }
  });

  test('programme enrollment reconcile ends only absent rows in the acknowledged child and programme scope', async () => {
    const db = await createDatabase();
    try {
      const repository = createChildrenRepository({ database: db });
      const children = ['child-kept', 'child-absent', 'child-outside']
        .map(childRow);
      await repository.saveServerChildRows(children);
      const kept = programmeEnrollmentRow({ id: 'cpe-kept', childId: children[0].id });
      const absent = programmeEnrollmentRow({ id: 'cpe-absent', childId: children[1].id });
      const outside = programmeEnrollmentRow({ id: 'cpe-outside', childId: children[2].id });
      const otherProgramme = programmeEnrollmentRow({
        id: 'cpe-other-programme',
        childId: children[1].id,
        programmeId: 'programme-b',
      });
      await repository.saveServerChildProgrammeEnrollmentRows([
        kept,
        absent,
        outside,
        otherProgramme,
      ]);

      await expect(repository.saveServerChildProgrammeEnrollmentRows([kept], {
        reconcile: {
          acknowledgedIds: [kept.id],
          acknowledgedAssignedChildIds: [children[0].id, children[1].id],
          programmeId: 'programme-a',
          pulledAt: PULLED_AT,
        },
      })).resolves.toEqual(expect.objectContaining({
        ended: 1,
        reconcileCompleted: true,
      }));

      expect(await db.getAllAsync(`
        select id, ended_at, sync_status, updated_at
        from child_programme_enrollments
        order by id
      `)).toEqual([
        { id: absent.id, ended_at: PULLED_AT, sync_status: 'synced', updated_at: PULLED_AT },
        { id: kept.id, ended_at: null, sync_status: 'synced', updated_at: CREATED_AT },
        { id: otherProgramme.id, ended_at: null, sync_status: 'synced', updated_at: CREATED_AT },
        { id: outside.id, ended_at: null, sync_status: 'synced', updated_at: CREATED_AT },
      ]);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('class membership reconcile ends only absent rows for acknowledged children', async () => {
    const db = await createDatabase();
    try {
      const repository = createChildrenRepository({ database: db });
      const children = ['child-kept', 'child-absent', 'child-outside'].map(childRow);
      await repository.saveServerChildRows(children);
      const kept = classMembershipRow({ id: 'ccm-kept', childId: children[0].id });
      const absent = classMembershipRow({ id: 'ccm-absent', childId: children[1].id });
      const outside = classMembershipRow({ id: 'ccm-outside', childId: children[2].id });
      await repository.saveServerChildClassMembershipRows([kept, absent, outside]);

      await expect(repository.saveServerChildClassMembershipRows([kept], {
        reconcile: {
          acknowledgedIds: [kept.id],
          acknowledgedChildIds: [children[0].id, children[1].id],
          pulledAt: PULLED_AT,
        },
      })).resolves.toEqual(expect.objectContaining({
        ended: 1,
        reconcileCompleted: true,
      }));

      expect(await db.getAllAsync(`
        select id, exited_at, sync_status, updated_at
        from child_class_memberships
        order by id
      `)).toEqual([
        { id: absent.id, exited_at: PULLED_AT, sync_status: 'synced', updated_at: PULLED_AT },
        { id: kept.id, exited_at: null, sync_status: 'synced', updated_at: CREATED_AT },
        { id: outside.id, exited_at: null, sync_status: 'synced', updated_at: CREATED_AT },
      ]);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('group assignment reconcile ends the assignment without archiving the group entity', async () => {
    const db = await createDatabase();
    try {
      const groupsRepository = createGroupsRepository({ database: db });
      const assignmentsRepository = createGroupEaAssignmentsRepository({ database: db });
      const keptGroup = groupRow({ id: 'group-kept' });
      const absentGroup = groupRow({ id: 'group-absent' });
      await groupsRepository.saveServerGroupRows([keptGroup, absentGroup]);
      const kept = groupEaAssignmentRow({ id: 'gea-kept', groupId: keptGroup.id });
      const absent = groupEaAssignmentRow({ id: 'gea-absent', groupId: absentGroup.id });
      await assignmentsRepository.saveServerRows([kept, absent]);

      await expect(assignmentsRepository.saveServerRows([kept], {
        reconcile: {
          acknowledgedGroupIds: [keptGroup.id],
          userId: 'user-1',
          programmeId: 'programme-a',
          pulledAt: PULLED_AT,
        },
      })).resolves.toEqual(expect.objectContaining({
        ended: 1,
        reconcileCompleted: true,
      }));

      expect(await db.getFirstAsync(`
        select unassigned_at, sync_status, updated_at
        from group_ea_assignments
        where id = ?
      `, absent.id)).toEqual({
        unassigned_at: PULLED_AT,
        sync_status: 'synced',
        updated_at: PULLED_AT,
      });
      expect(await db.getFirstAsync(
        'select archived_at from groups where id = ?',
        absentGroup.id
      )).toEqual({ archived_at: null });
      expect(await db.getFirstAsync(
        'select unassigned_at, updated_at from group_ea_assignments where id = ?',
        kept.id
      )).toEqual({ unassigned_at: null, updated_at: CREATED_AT });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('group membership reconcile ends only absent rows for acknowledged groups', async () => {
    const db = await createDatabase();
    try {
      const childrenRepository = createChildrenRepository({ database: db });
      const groupsRepository = createGroupsRepository({ database: db });
      const children = ['child-kept', 'child-absent', 'child-outside'].map(childRow);
      const groups = ['group-in-scope', 'group-outside'].map((id) => groupRow({ id }));
      await childrenRepository.saveServerChildRows(children);
      await groupsRepository.saveServerGroupRows(groups);
      const kept = groupMembershipRow({
        id: 'cgm-kept',
        childId: children[0].id,
        groupId: groups[0].id,
      });
      const absent = groupMembershipRow({
        id: 'cgm-absent',
        childId: children[1].id,
        groupId: groups[0].id,
      });
      const outside = groupMembershipRow({
        id: 'cgm-outside',
        childId: children[2].id,
        groupId: groups[1].id,
      });
      await groupsRepository.saveServerChildrenGroupRows([kept, absent, outside]);

      await expect(groupsRepository.saveServerChildrenGroupRows([kept], {
        reconcile: {
          acknowledgedIds: [kept.id],
          acknowledgedGroupIds: [groups[0].id],
          pulledAt: PULLED_AT,
        },
      })).resolves.toEqual(expect.objectContaining({
        ended: 1,
        reconcileCompleted: true,
      }));

      expect(await db.getAllAsync(`
        select id, removed_at, sync_status, updated_at
        from child_group_memberships
        order by id
      `)).toEqual([
        { id: absent.id, removed_at: PULLED_AT, sync_status: 'synced', updated_at: PULLED_AT },
        { id: kept.id, removed_at: null, sync_status: 'synced', updated_at: CREATED_AT },
        { id: outside.id, removed_at: null, sync_status: 'synced', updated_at: CREATED_AT },
      ]);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('class EA reconcile ends only absent classes in the EA and programme scope', async () => {
    const db = await createDatabase();
    try {
      const classesRepository = createClassesRepository({ database: db });
      const assignmentsRepository = createClassEaAssignmentsRepository({ database: db });
      const keptClass = classRow('class-kept');
      const absentClass = classRow('class-absent');
      await classesRepository.saveServerClassRows([keptClass, absentClass]);
      const kept = classEaAssignmentRow({ id: 'class-ea-kept', classId: keptClass.id });
      const absent = classEaAssignmentRow({ id: 'class-ea-absent', classId: absentClass.id });
      await assignmentsRepository.saveServerRows([kept, absent]);

      await expect(assignmentsRepository.saveServerRows([kept], {
        reconcile: {
          acknowledgedClassIds: [keptClass.id],
          userId: 'user-1',
          programmeId: 'programme-a',
          pulledAt: PULLED_AT,
        },
      })).resolves.toEqual(expect.objectContaining({
        ended: 1,
        reconcileCompleted: true,
      }));

      expect(await db.getAllAsync(`
        select id, unassigned_at, sync_status, updated_at
        from class_ea_assignments
        order by id
      `)).toEqual([
        { id: absent.id, unassigned_at: PULLED_AT, sync_status: 'synced', updated_at: PULLED_AT },
        { id: kept.id, unassigned_at: null, sync_status: 'synced', updated_at: CREATED_AT },
      ]);
      expect(await db.getFirstAsync(
        'select archived_at from classes where id = ?',
        absentClass.id
      )).toEqual({ archived_at: null });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('reconcile never ends pending, failed, or terminal local rows', async () => {
    const db = await createDatabase();
    try {
      const repository = createChildrenRepository({ database: db });
      const statuses = ['synced', 'pending', 'failed', 'terminal'];
      const children = statuses.map((status) => childRow(`child-${status}`));
      await repository.saveServerChildRows(children);
      for (const status of statuses) {
        await db.runAsync(`
          insert into child_ea_assignments (
            id, user_id, child_id, assigned_at, created_by,
            created_at, updated_at, sync_status
          ) values (?, 'user-1', ?, ?, 'user-1', ?, ?, ?)
        `, `cea-${status}`, `child-${status}`, CREATED_AT, CREATED_AT, CREATED_AT, status);
      }

      const result = await repository.saveServerStaffChildRows([], {
        reconcile: {
          acknowledgedIds: [],
          pulledAt: PULLED_AT,
          userId: 'user-1',
        },
      });

      expect(result).toEqual(expect.objectContaining({ ended: 1, reconcileCompleted: true }));
      expect(await db.getAllAsync(`
        select id, unassigned_at, sync_status
        from child_ea_assignments
        order by id
      `)).toEqual([
        { id: 'cea-failed', unassigned_at: null, sync_status: 'failed' },
        { id: 'cea-pending', unassigned_at: null, sync_status: 'pending' },
        { id: 'cea-synced', unassigned_at: PULLED_AT, sync_status: 'synced' },
        { id: 'cea-terminal', unassigned_at: null, sync_status: 'terminal' },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('enrollment reconcile never infers the fate of a child EA assignment', async () => {
    const db = await createDatabase();
    try {
      const repository = createChildrenRepository({ database: db });
      const endedEnrollmentChild = childRow('child-ended-enrollment');
      const pendingEnrollmentChild = childRow('child-pending-enrollment');
      await repository.saveServerChildRows([endedEnrollmentChild, pendingEnrollmentChild]);
      const assignments = [
        childEaAssignmentRow({ id: 'cea-ended-enrollment', childId: endedEnrollmentChild.id }),
        childEaAssignmentRow({ id: 'cea-pending-enrollment', childId: pendingEnrollmentChild.id }),
      ];
      await repository.saveServerStaffChildRows(assignments);
      await repository.saveServerChildProgrammeEnrollmentRows([
        programmeEnrollmentRow({
          id: 'cpe-ended-enrollment',
          childId: endedEnrollmentChild.id,
        }),
      ]);
      await db.runAsync(`
        insert into child_programme_enrollments (
          id, child_id, programme_id, enrolled_at, created_by,
          created_at, updated_at, sync_status
        ) values (
          'cpe-pending-enrollment', ?, 'programme-a', ?, 'user-1', ?, ?, 'pending'
        )
      `, pendingEnrollmentChild.id, CREATED_AT, CREATED_AT, CREATED_AT);

      await repository.saveServerChildProgrammeEnrollmentRows([], {
        reconcile: {
          acknowledgedIds: [],
          acknowledgedAssignedChildIds: [
            endedEnrollmentChild.id,
            pendingEnrollmentChild.id,
          ],
          programmeId: 'programme-a',
          pulledAt: PULLED_AT,
        },
      });

      expect(await db.getAllAsync(`
        select id, ended_at, sync_status
        from child_programme_enrollments
        order by id
      `)).toEqual([
        { id: 'cpe-ended-enrollment', ended_at: PULLED_AT, sync_status: 'synced' },
        { id: 'cpe-pending-enrollment', ended_at: null, sync_status: 'pending' },
      ]);
      expect(await db.getAllAsync(`
        select id, unassigned_at
        from child_ea_assignments
        order by id
      `)).toEqual([
        { id: 'cea-ended-enrollment', unassigned_at: null },
        { id: 'cea-pending-enrollment', unassigned_at: null },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('child EA reconcile then re-assignment reactivates the same deterministic row', async () => {
    const db = await createDatabase();
    try {
      const repository = createChildrenRepository({ database: db });
      const child = childRow('child-reactivated');
      await repository.saveServerChildRows([child]);
      const deterministicId = childEaAssignmentDomainId({
        userId: 'user-1',
        childId: child.id,
      });
      const assignment = childEaAssignmentRow({
        id: deterministicId,
        childId: child.id,
      });
      await repository.saveServerStaffChildRows([assignment]);
      await repository.saveServerStaffChildRows([], {
        reconcile: {
          acknowledgedIds: [],
          pulledAt: PULLED_AT,
          userId: 'user-1',
        },
      });

      const reassignedAt = '2026-07-13T13:00:00.000Z';
      await repository.saveServerStaffChildRows([{
        ...assignment,
        assigned_at: reassignedAt,
        unassigned_at: null,
        updated_at: reassignedAt,
      }]);

      expect(await db.getAllAsync(`
        select id, unassigned_at, sync_status
        from child_ea_assignments
        where user_id = 'user-1' and child_id = ?
      `, child.id)).toEqual([{
        id: deterministicId,
        unassigned_at: null,
        sync_status: 'synced',
      }]);
    } finally {
      await db.closeAsync();
    }
  });

  test('group tombstones arrive as entities and a re-pull reactivates the deterministic assignment', async () => {
    const db = await createDatabase();
    try {
      const groupsRepository = createGroupsRepository({ database: db });
      const assignmentsRepository = createGroupEaAssignmentsRepository({ database: db });
      const group = groupRow({ id: 'group-reactivated' });
      await groupsRepository.saveServerGroupRows([group]);
      const deterministicId = groupEaAssignmentDomainId({ groupId: group.id });
      const assignment = groupEaAssignmentRow({
        id: deterministicId,
        groupId: group.id,
      });
      await assignmentsRepository.saveServerRows([assignment]);
      await assignmentsRepository.saveServerRows([], {
        reconcile: {
          acknowledgedGroupIds: [],
          userId: 'user-1',
          programmeId: 'programme-a',
          pulledAt: PULLED_AT,
        },
      });
      expect(await db.getFirstAsync(
        'select archived_at from groups where id = ?',
        group.id
      )).toEqual({ archived_at: null });

      const reassignedAt = '2026-07-13T13:00:00.000Z';
      await assignmentsRepository.saveServerRows([{
        ...assignment,
        assigned_at: reassignedAt,
        unassigned_at: null,
        updated_at: reassignedAt,
      }]);
      expect(await db.getAllAsync(`
        select id, unassigned_at
        from group_ea_assignments
        where group_id = ?
      `, group.id)).toEqual([{ id: deterministicId, unassigned_at: null }]);

      await groupsRepository.saveServerGroupRows([{
        ...group,
        archived_at: reassignedAt,
        updated_at: reassignedAt,
      }]);
      expect(await db.getFirstAsync(
        'select archived_at from groups where id = ?',
        group.id
      )).toEqual({ archived_at: reassignedAt });
    } finally {
      await db.closeAsync();
    }
  });

  test('mass-end breaker persists a durable note and bypass applies once then clears it', async () => {
    const db = await createDatabase();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { repository, assignments } = await seedChildEaAssignments(db);
      const acknowledgedIds = assignments.slice(0, 3).map((row) => row.id);
      const reconcile = {
        acknowledgedIds,
        pulledAt: PULLED_AT,
        userId: 'user-1',
      };

      await expect(repository.saveServerStaffChildRows([], { reconcile })).resolves.toEqual({
        applied: 0,
        skipped: 0,
        failed: 0,
        ended: 0,
        fallbackUsed: false,
        reconcileCompleted: false,
      });
      expect(error).toHaveBeenCalledWith(expect.stringContaining(
        '[Pull reconcile breaker] childEaAssignments would end 12 of 15'
      ));
      const noteRow = await db.getFirstAsync(`
        select cursor
        from sync_state
        where scope = 'pull_reconcile_breaker:childEaAssignments'
      `);
      expect(JSON.parse(noteRow.cursor)).toEqual({
        scope: 'childEaAssignments',
        candidateCount: 15,
        wouldEndCount: 12,
        triggeredAt: PULLED_AT,
      });
      expect(await db.getFirstAsync(`
        select count(*) as count
        from child_ea_assignments
        where unassigned_at is null
      `)).toEqual({ count: 15 });

      await expect(repository.saveServerStaffChildRows([], {
        reconcile: { ...reconcile, bypassBreaker: true },
      })).resolves.toEqual(expect.objectContaining({
        ended: 12,
        reconcileCompleted: true,
      }));
      expect(await db.getFirstAsync(`
        select cursor
        from sync_state
        where scope = 'pull_reconcile_breaker:childEaAssignments'
      `)).toBeNull();
    } finally {
      error.mockRestore();
      await db.closeAsync();
    }
  });

  test('an under-threshold reconcile ends three of fifteen and clears an earlier breaker note', async () => {
    const db = await createDatabase();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { repository, assignments } = await seedChildEaAssignments(db);
      await repository.saveServerStaffChildRows([], {
        reconcile: {
          acknowledgedIds: assignments.slice(0, 3).map((row) => row.id),
          pulledAt: PULLED_AT,
          userId: 'user-1',
        },
      });
      expect(await db.getFirstAsync(`
        select cursor from sync_state
        where scope = 'pull_reconcile_breaker:childEaAssignments'
      `)).not.toBeNull();

      const laterPullAt = '2026-07-13T14:00:00.000Z';
      await expect(repository.saveServerStaffChildRows([], {
        reconcile: {
          acknowledgedIds: assignments.slice(0, 12).map((row) => row.id),
          pulledAt: laterPullAt,
          userId: 'user-1',
        },
      })).resolves.toEqual(expect.objectContaining({
        ended: 3,
        reconcileCompleted: true,
      }));
      expect(await db.getFirstAsync(`
        select cursor from sync_state
        where scope = 'pull_reconcile_breaker:childEaAssignments'
      `)).toBeNull();
    } finally {
      error.mockRestore();
      await db.closeAsync();
    }
  });

  test('per-row fallback logs the batch error and never reconciles', async () => {
    const db = await createDatabase();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const repository = createChildrenRepository({ database: db });
      const children = ['child-fallback-absent', 'child-fallback-valid', 'child-fallback-invalid']
        .map(childRow);
      await repository.saveServerChildRows(children);
      const absent = classMembershipRow({
        id: 'ccm-fallback-absent',
        childId: children[0].id,
      });
      await repository.saveServerChildClassMembershipRows([absent]);
      const valid = classMembershipRow({
        id: 'ccm-fallback-valid',
        childId: children[1].id,
      });
      const invalid = {
        ...classMembershipRow({
          id: 'ccm-fallback-invalid',
          childId: children[2].id,
        }),
        academic_year_id: 'missing-year',
      };

      await expect(repository.saveServerChildClassMembershipRows([valid, invalid], {
        reconcile: {
          acknowledgedIds: [valid.id],
          acknowledgedChildIds: children.map((child) => child.id),
          pulledAt: PULLED_AT,
        },
      })).resolves.toEqual({
        applied: 1,
        skipped: 0,
        failed: 1,
        ended: 0,
        fallbackUsed: true,
        reconcileCompleted: false,
      });
      expect(error).toHaveBeenCalledWith(expect.stringContaining(
        'Pulled child_class_memberships batch transaction failed; retrying rows without reconcile'
      ));
      expect(await db.getFirstAsync(
        'select exited_at from child_class_memberships where id = ?',
        absent.id
      )).toEqual({ exited_at: null });
      expect(await db.getFirstAsync(
        'select id from child_class_memberships where id = ?',
        valid.id
      )).toEqual({ id: valid.id });
    } finally {
      error.mockRestore();
      await db.closeAsync();
    }
  });

  test('a throwing reconcile callback rolls back the batch, persists fallback rows, and surfaces the error', async () => {
    const db = await createDatabase();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const rows = [{ id: 'callback-row-a' }, { id: 'callback-row-b' }];
      const saveRow = async (row, { transaction } = {}) => {
        const target = transaction || db;
        await target.runAsync(`
          insert into local_state (key, value, updated_at)
          values (?, 'saved', ?)
        `, row.id, CREATED_AT);
        return true;
      };

      await expect(runBatchWithPerRowFallback({
        database: db,
        rows,
        saveRow,
        tableName: 'callback_rows',
        reconcile: async () => {
          throw new Error('reconcile callback exploded');
        },
      })).resolves.toEqual({
        applied: 2,
        skipped: 0,
        failed: 0,
        ended: 0,
        fallbackUsed: true,
        reconcileCompleted: false,
      });
      expect(error).toHaveBeenCalledWith(expect.stringContaining('reconcile callback exploded'));
      expect(await db.getAllAsync(`
        select key, value from local_state
        where key like 'callback-row-%'
        order by key
      `)).toEqual([
        { key: 'callback-row-a', value: 'saved' },
        { key: 'callback-row-b', value: 'saved' },
      ]);
    } finally {
      error.mockRestore();
      await db.closeAsync();
    }
  });

  test('two independent 999-id acknowledged sets bind as two JSON parameters below the variable limit', async () => {
    const db = createCountingSqliteTestDatabase();
    await runMigrations(db);
    await db.execAsync('PRAGMA foreign_keys = ON');
    await seedCoreData(db);
    try {
      const repository = createChildrenRepository({ database: db });
      const child = childRow('child-boundary');
      const membership = classMembershipRow({
        id: 'ccm-boundary',
        childId: child.id,
      });
      await repository.saveServerChildRows([child]);
      await repository.saveServerChildClassMembershipRows([membership]);
      const acknowledgedIds = [membership.id, ...Array.from(
        { length: 998 },
        (_, index) => `ccm-ack-${index}`
      )];
      const acknowledgedChildIds = [child.id, ...Array.from(
        { length: 998 },
        (_, index) => `child-ack-${index}`
      )];
      const runCalls = [];
      const baseRunAsync = db.runAsync;
      db.runAsync = async (sql, ...params) => {
        runCalls.push({ sql, params });
        return baseRunAsync(sql, ...params);
      };
      db.resetQueryLog();

      await expect(repository.saveServerChildClassMembershipRows([], {
        reconcile: {
          acknowledgedIds,
          acknowledgedChildIds,
          pulledAt: PULLED_AT,
        },
      })).resolves.toEqual(expect.objectContaining({
        ended: 0,
        fallbackUsed: false,
        reconcileCompleted: true,
      }));

      const updateCall = runCalls.find(({ sql }) => (
        /update child_class_memberships/i.test(sql)
        && /not in \(select value from json_each\(\?\)\)/i.test(sql)
      ));
      expect(updateCall).toBeDefined();
      expect((updateCall.sql.match(/\?/g) || []).length).toBeLessThan(999);
      expect((updateCall.sql.match(/json_each\(\?\)/g) || []).length).toBe(2);
      expect(JSON.parse(updateCall.params[2])).toHaveLength(999);
      expect(JSON.parse(updateCall.params[3])).toHaveLength(999);
      expect(db.getTransactionCount()).toBe(1);
    } finally {
      await db.closeAsync();
    }
  });
});

describe('server pull active-pair supersede recovery', () => {
  const SUPERSEDED_AT = '2026-07-22T15:30:00.000Z';

  test('child EA pull converges a same-pair active server row under a new id in one batch', async () => {
    const db = await createDatabase();
    try {
      const repository = createChildrenRepository({ database: db });
      const child = childRow('child-ea-supersede');
      const stale = childEaAssignmentRow({
        id: 'cea-stale-id',
        childId: child.id,
      });
      const incoming = childEaAssignmentRow({
        id: 'cea-server-id',
        childId: child.id,
      });
      await repository.saveServerChildRows([child]);
      await repository.saveServerStaffChildRows([stale]);

      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(new Date(SUPERSEDED_AT));

      const reconcile = {
        acknowledgedIds: ['cea-server-id'],
        pulledAt: SUPERSEDED_AT,
        userId: 'user-1',
      };
      await expect(repository.saveServerStaffChildRows([incoming], { reconcile }))
        .resolves.toEqual({
          applied: 1,
          skipped: 0,
          failed: 0,
          ended: 0,
          fallbackUsed: false,
          reconcileCompleted: true,
        });
      expect(await db.getAllAsync(`
        select id, unassigned_at, updated_at, sync_status
        from child_ea_assignments
        where child_id = 'child-ea-supersede'
        order by id
      `)).toEqual([
        {
          id: 'cea-server-id',
          unassigned_at: null,
          updated_at: SUPERSEDED_AT,
          sync_status: 'synced',
        },
        {
          id: 'cea-stale-id',
          unassigned_at: SUPERSEDED_AT,
          updated_at: SUPERSEDED_AT,
          sync_status: 'synced',
        },
      ]);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });

      await expect(repository.saveServerStaffChildRows([incoming], { reconcile }))
        .resolves.toEqual({
          applied: 1,
          skipped: 0,
          failed: 0,
          ended: 0,
          fallbackUsed: false,
          reconcileCompleted: true,
        });
      expect(await db.getAllAsync(`
        select id, unassigned_at, updated_at, sync_status
        from child_ea_assignments
        where child_id = 'child-ea-supersede'
        order by id
      `)).toEqual([
        {
          id: 'cea-server-id',
          unassigned_at: null,
          updated_at: SUPERSEDED_AT,
          sync_status: 'synced',
        },
        {
          id: 'cea-stale-id',
          unassigned_at: SUPERSEDED_AT,
          updated_at: SUPERSEDED_AT,
          sync_status: 'synced',
        },
      ]);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      jest.useRealTimers();
      await db.closeAsync();
    }
  });

  test('programme enrollment pull converges a same-pair active server row under a new id in one batch', async () => {
    const db = await createDatabase();
    try {
      const repository = createChildrenRepository({ database: db });
      const child = childRow('child-programme-supersede');
      const stale = programmeEnrollmentRow({
        id: 'cpe-stale-id',
        childId: child.id,
      });
      const incoming = programmeEnrollmentRow({
        id: 'cpe-server-id',
        childId: child.id,
      });
      await repository.saveServerChildRows([child]);
      await repository.saveServerChildProgrammeEnrollmentRows([stale]);

      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(new Date(SUPERSEDED_AT));

      const reconcile = {
        acknowledgedIds: ['cpe-server-id'],
        acknowledgedAssignedChildIds: ['child-programme-supersede'],
        programmeId: 'programme-a',
        pulledAt: SUPERSEDED_AT,
      };
      await expect(repository.saveServerChildProgrammeEnrollmentRows([incoming], { reconcile }))
        .resolves.toEqual({
          applied: 1,
          skipped: 0,
          failed: 0,
          ended: 0,
          fallbackUsed: false,
          reconcileCompleted: true,
        });
      expect(await db.getAllAsync(`
        select id, ended_at, updated_at, sync_status
        from child_programme_enrollments
        where child_id = 'child-programme-supersede'
        order by id
      `)).toEqual([
        {
          id: 'cpe-server-id',
          ended_at: null,
          updated_at: CREATED_AT,
          sync_status: 'synced',
        },
        {
          id: 'cpe-stale-id',
          ended_at: SUPERSEDED_AT,
          updated_at: SUPERSEDED_AT,
          sync_status: 'synced',
        },
      ]);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });

      await expect(repository.saveServerChildProgrammeEnrollmentRows([incoming], { reconcile }))
        .resolves.toEqual({
          applied: 1,
          skipped: 0,
          failed: 0,
          ended: 0,
          fallbackUsed: false,
          reconcileCompleted: true,
        });
      expect(await db.getAllAsync(`
        select id, ended_at, updated_at, sync_status
        from child_programme_enrollments
        where child_id = 'child-programme-supersede'
        order by id
      `)).toEqual([
        {
          id: 'cpe-server-id',
          ended_at: null,
          updated_at: CREATED_AT,
          sync_status: 'synced',
        },
        {
          id: 'cpe-stale-id',
          ended_at: SUPERSEDED_AT,
          updated_at: SUPERSEDED_AT,
          sync_status: 'synced',
        },
      ]);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      jest.useRealTimers();
      await db.closeAsync();
    }
  });

  test('class EA pull converges a same-pair active server row under a new id in one batch', async () => {
    const db = await createDatabase();
    try {
      const repository = createClassEaAssignmentsRepository({ database: db });
      const stale = classEaAssignmentRow({
        id: 'class-ea-stale-id',
        classId: 'class-1',
      });
      const incoming = classEaAssignmentRow({
        id: 'class-ea-server-id',
        classId: 'class-1',
      });
      await repository.saveServerRows([stale]);

      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(new Date(SUPERSEDED_AT));

      const reconcile = {
        acknowledgedClassIds: ['class-1'],
        userId: 'user-1',
        programmeId: 'programme-a',
        pulledAt: SUPERSEDED_AT,
      };
      await expect(repository.saveServerRows([incoming], { reconcile }))
        .resolves.toEqual({
          applied: 1,
          skipped: 0,
          failed: 0,
          ended: 0,
          fallbackUsed: false,
          reconcileCompleted: true,
        });
      expect(await db.getAllAsync(`
        select id, unassigned_at, updated_at, sync_status
        from class_ea_assignments
        where class_id = 'class-1'
          and ea_user_id = 'user-1'
          and programme_id = 'programme-a'
        order by id
      `)).toEqual([
        {
          id: 'class-ea-server-id',
          unassigned_at: null,
          updated_at: CREATED_AT,
          sync_status: 'synced',
        },
        {
          id: 'class-ea-stale-id',
          unassigned_at: SUPERSEDED_AT,
          updated_at: SUPERSEDED_AT,
          sync_status: 'synced',
        },
      ]);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });

      await expect(repository.saveServerRows([incoming], { reconcile }))
        .resolves.toEqual({
          applied: 1,
          skipped: 0,
          failed: 0,
          ended: 0,
          fallbackUsed: false,
          reconcileCompleted: true,
        });
      expect(await db.getAllAsync(`
        select id, unassigned_at, updated_at, sync_status
        from class_ea_assignments
        where class_id = 'class-1'
          and ea_user_id = 'user-1'
          and programme_id = 'programme-a'
        order by id
      `)).toEqual([
        {
          id: 'class-ea-server-id',
          unassigned_at: null,
          updated_at: CREATED_AT,
          sync_status: 'synced',
        },
        {
          id: 'class-ea-stale-id',
          unassigned_at: SUPERSEDED_AT,
          updated_at: SUPERSEDED_AT,
          sync_status: 'synced',
        },
      ]);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      jest.useRealTimers();
      await db.closeAsync();
    }
  });

  test('group EA pull converges a same-pair active server row under a new id in one batch', async () => {
    const db = await createDatabase();
    try {
      const groupsRepository = createGroupsRepository({ database: db });
      const repository = createGroupEaAssignmentsRepository({ database: db });
      const group = groupRow({ id: 'group-ea-supersede' });
      const stale = groupEaAssignmentRow({
        id: 'group-ea-stale-id',
        groupId: group.id,
      });
      const incoming = groupEaAssignmentRow({
        id: 'group-ea-server-id',
        groupId: group.id,
      });
      await groupsRepository.saveServerGroupRows([group]);
      await repository.saveServerRows([stale]);

      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(new Date(SUPERSEDED_AT));

      const reconcile = {
        acknowledgedGroupIds: ['group-ea-supersede'],
        userId: 'user-1',
        programmeId: 'programme-a',
        pulledAt: SUPERSEDED_AT,
      };
      await expect(repository.saveServerRows([incoming], { reconcile }))
        .resolves.toEqual({
          applied: 1,
          skipped: 0,
          failed: 0,
          ended: 0,
          fallbackUsed: false,
          reconcileCompleted: true,
        });
      expect(await db.getAllAsync(`
        select id, unassigned_at, updated_at, sync_status
        from group_ea_assignments
        where group_id = 'group-ea-supersede'
        order by id
      `)).toEqual([
        {
          id: 'group-ea-server-id',
          unassigned_at: null,
          updated_at: CREATED_AT,
          sync_status: 'synced',
        },
        {
          id: 'group-ea-stale-id',
          unassigned_at: SUPERSEDED_AT,
          updated_at: SUPERSEDED_AT,
          sync_status: 'synced',
        },
      ]);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });

      await expect(repository.saveServerRows([incoming], { reconcile }))
        .resolves.toEqual({
          applied: 1,
          skipped: 0,
          failed: 0,
          ended: 0,
          fallbackUsed: false,
          reconcileCompleted: true,
        });
      expect(await db.getAllAsync(`
        select id, unassigned_at, updated_at, sync_status
        from group_ea_assignments
        where group_id = 'group-ea-supersede'
        order by id
      `)).toEqual([
        {
          id: 'group-ea-server-id',
          unassigned_at: null,
          updated_at: CREATED_AT,
          sync_status: 'synced',
        },
        {
          id: 'group-ea-stale-id',
          unassigned_at: SUPERSEDED_AT,
          updated_at: SUPERSEDED_AT,
          sync_status: 'synced',
        },
      ]);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      jest.useRealTimers();
      await db.closeAsync();
    }
  });

  test('child EA pull skips a different-id collision with an active pending local row', async () => {
    const db = await createDatabase();
    try {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(new Date(SUPERSEDED_AT));
      const repository = createChildrenRepository({ database: db });
      const child = childRow('child-ea-pending');
      const local = childEaAssignmentRow({
        id: 'cea-local-pending',
        childId: child.id,
        syncStatus: 'pending',
      });
      const incoming = childEaAssignmentRow({
        id: 'cea-server-pending-collision',
        childId: child.id,
      });
      await repository.saveServerChildRows([child]);
      await repository.saveStaffChild(local);

      await expect(repository.saveServerStaffChildRows([incoming])).resolves.toEqual({
        applied: 0,
        skipped: 1,
        failed: 0,
        ended: 0,
        fallbackUsed: false,
        reconcileCompleted: false,
      });
      expect(await db.getAllAsync(`
        select id, unassigned_at, updated_at, sync_status
        from child_ea_assignments
        where child_id = 'child-ea-pending'
      `)).toEqual([{
        id: 'cea-local-pending',
        unassigned_at: null,
        updated_at: SUPERSEDED_AT,
        sync_status: 'pending',
      }]);
      expect(await db.getAllAsync(`
        select id, table_name, record_id, operation, status
        from sync_outbox
        order by id
      `)).toEqual([{
        id: 'child_ea_assignments:cea-local-pending:insert',
        table_name: 'child_ea_assignments',
        record_id: 'cea-local-pending',
        operation: 'insert',
        status: 'pending',
      }]);
    } finally {
      jest.useRealTimers();
      await db.closeAsync();
    }
  });

  test('programme enrollment pull skips a different-id collision with an active pending local row', async () => {
    const db = await createDatabase();
    try {
      const repository = createChildrenRepository({ database: db });
      const child = childRow('child-programme-pending');
      const local = programmeEnrollmentRow({
        id: 'cpe-local-pending',
        childId: child.id,
        syncStatus: 'pending',
      });
      const incoming = programmeEnrollmentRow({
        id: 'cpe-server-pending-collision',
        childId: child.id,
      });
      await repository.saveServerChildRows([child]);
      await repository.saveChildProgrammeEnrollment(local);

      await expect(repository.saveServerChildProgrammeEnrollmentRows([incoming]))
        .resolves.toEqual({
          applied: 0,
          skipped: 1,
          failed: 0,
          ended: 0,
          fallbackUsed: false,
          reconcileCompleted: false,
        });
      expect(await db.getAllAsync(`
        select id, ended_at, updated_at, sync_status
        from child_programme_enrollments
        where child_id = 'child-programme-pending'
      `)).toEqual([{
        id: 'cpe-local-pending',
        ended_at: null,
        updated_at: CREATED_AT,
        sync_status: 'pending',
      }]);
      expect(await db.getAllAsync(`
        select id, table_name, record_id, operation, status
        from sync_outbox
        order by id
      `)).toEqual([{
        id: 'child_programme_enrollments:cpe-local-pending:insert',
        table_name: 'child_programme_enrollments',
        record_id: 'cpe-local-pending',
        operation: 'insert',
        status: 'pending',
      }]);
    } finally {
      await db.closeAsync();
    }
  });

  test('class EA pull skips a different-id collision with an active pending local row', async () => {
    const db = await createDatabase();
    try {
      const repository = createClassEaAssignmentsRepository({ database: db });
      const local = {
        ...classEaAssignmentRow({ id: 'class-ea-local-pending', classId: 'class-1' }),
        sync_status: 'pending',
        synced: false,
      };
      const incoming = classEaAssignmentRow({
        id: 'class-ea-server-pending-collision',
        classId: 'class-1',
      });
      await repository.save(local);

      await expect(repository.saveServerRows([incoming])).resolves.toEqual({
        applied: 0,
        skipped: 1,
        failed: 0,
        ended: 0,
        fallbackUsed: false,
        reconcileCompleted: false,
      });
      expect(await db.getAllAsync(`
        select id, unassigned_at, updated_at, sync_status
        from class_ea_assignments
        where class_id = 'class-1'
          and ea_user_id = 'user-1'
          and programme_id = 'programme-a'
      `)).toEqual([{
        id: 'class-ea-local-pending',
        unassigned_at: null,
        updated_at: CREATED_AT,
        sync_status: 'pending',
      }]);
      expect(await db.getAllAsync(`
        select id, table_name, record_id, operation, status
        from sync_outbox
        order by id
      `)).toEqual([{
        id: 'class_ea_assignments:class-ea-local-pending:insert',
        table_name: 'class_ea_assignments',
        record_id: 'class-ea-local-pending',
        operation: 'insert',
        status: 'pending',
      }]);
    } finally {
      await db.closeAsync();
    }
  });

  test('group EA pull skips a different-id collision with an active pending local row', async () => {
    const db = await createDatabase();
    try {
      const groupsRepository = createGroupsRepository({ database: db });
      const repository = createGroupEaAssignmentsRepository({ database: db });
      const group = groupRow({ id: 'group-ea-pending' });
      const local = {
        ...groupEaAssignmentRow({ id: 'group-ea-local-pending', groupId: group.id }),
        sync_status: 'pending',
        synced: false,
      };
      const incoming = groupEaAssignmentRow({
        id: 'group-ea-server-pending-collision',
        groupId: group.id,
      });
      await groupsRepository.saveServerGroupRows([group]);
      await repository.save(local);

      await expect(repository.saveServerRows([incoming])).resolves.toEqual({
        applied: 0,
        skipped: 1,
        failed: 0,
        ended: 0,
        fallbackUsed: false,
        reconcileCompleted: false,
      });
      expect(await db.getAllAsync(`
        select id, unassigned_at, updated_at, sync_status
        from group_ea_assignments
        where group_id = 'group-ea-pending'
      `)).toEqual([{
        id: 'group-ea-local-pending',
        unassigned_at: null,
        updated_at: CREATED_AT,
        sync_status: 'pending',
      }]);
      expect(await db.getAllAsync(`
        select id, table_name, record_id, operation, status
        from sync_outbox
        order by id
      `)).toEqual([{
        id: 'group_ea_assignments:group-ea-local-pending:insert',
        table_name: 'group_ea_assignments',
        record_id: 'group-ea-local-pending',
        operation: 'insert',
        status: 'pending',
      }]);
    } finally {
      await db.closeAsync();
    }
  });

  test('programme enrollment pull skips a different-id collision with an active failed local row', async () => {
    const db = await createDatabase();
    try {
      const repository = createChildrenRepository({ database: db });
      const child = childRow('child-programme-failed');
      const local = programmeEnrollmentRow({
        id: 'cpe-local-failed',
        childId: child.id,
        syncStatus: 'failed',
      });
      const incoming = programmeEnrollmentRow({
        id: 'cpe-server-failed-collision',
        childId: child.id,
      });
      await repository.saveServerChildRows([child]);
      await repository.saveChildProgrammeEnrollment(local);

      await expect(repository.saveServerChildProgrammeEnrollmentRows([incoming]))
        .resolves.toEqual({
          applied: 0,
          skipped: 1,
          failed: 0,
          ended: 0,
          fallbackUsed: false,
          reconcileCompleted: false,
        });
      expect(await db.getAllAsync(`
        select id, ended_at, updated_at, sync_status
        from child_programme_enrollments
        where child_id = 'child-programme-failed'
      `)).toEqual([{
        id: 'cpe-local-failed',
        ended_at: null,
        updated_at: CREATED_AT,
        sync_status: 'failed',
      }]);
      expect(await db.getAllAsync(`
        select id, table_name, record_id, operation, status
        from sync_outbox
        order by id
      `)).toEqual([{
        id: 'child_programme_enrollments:cpe-local-failed:insert',
        table_name: 'child_programme_enrollments',
        record_id: 'cpe-local-failed',
        operation: 'insert',
        status: 'pending',
      }]);
    } finally {
      await db.closeAsync();
    }
  });

  test('group EA pull skips a different-id collision with an active terminal local row', async () => {
    const db = await createDatabase();
    try {
      const groupsRepository = createGroupsRepository({ database: db });
      const repository = createGroupEaAssignmentsRepository({ database: db });
      const group = groupRow({ id: 'group-ea-terminal' });
      const local = {
        ...groupEaAssignmentRow({ id: 'group-ea-local-terminal', groupId: group.id }),
        sync_status: 'terminal',
        synced: false,
      };
      const incoming = groupEaAssignmentRow({
        id: 'group-ea-server-terminal-collision',
        groupId: group.id,
      });
      await groupsRepository.saveServerGroupRows([group]);
      await repository.save(local);

      await expect(repository.saveServerRows([incoming])).resolves.toEqual({
        applied: 0,
        skipped: 1,
        failed: 0,
        ended: 0,
        fallbackUsed: false,
        reconcileCompleted: false,
      });
      expect(await db.getAllAsync(`
        select id, unassigned_at, updated_at, sync_status
        from group_ea_assignments
        where group_id = 'group-ea-terminal'
      `)).toEqual([{
        id: 'group-ea-local-terminal',
        unassigned_at: null,
        updated_at: CREATED_AT,
        sync_status: 'terminal',
      }]);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('an inactive incoming enrollment does not supersede the same-pair active local row', async () => {
    const db = await createDatabase();
    try {
      const repository = createChildrenRepository({ database: db });
      const child = childRow('child-programme-inactive-incoming');
      const active = programmeEnrollmentRow({
        id: 'cpe-active-local',
        childId: child.id,
      });
      const inactiveIncoming = {
        ...programmeEnrollmentRow({
          id: 'cpe-inactive-server',
          childId: child.id,
        }),
        ended_at: PULLED_AT,
        updated_at: PULLED_AT,
      };
      await repository.saveServerChildRows([child]);
      await repository.saveServerChildProgrammeEnrollmentRows([active]);

      await expect(repository.saveServerChildProgrammeEnrollmentRows([inactiveIncoming]))
        .resolves.toEqual({
          applied: 1,
          skipped: 0,
          failed: 0,
          ended: 0,
          fallbackUsed: false,
          reconcileCompleted: false,
        });
      expect(await db.getAllAsync(`
        select id, ended_at, updated_at, sync_status
        from child_programme_enrollments
        where child_id = 'child-programme-inactive-incoming'
        order by id
      `)).toEqual([
        {
          id: 'cpe-active-local',
          ended_at: null,
          updated_at: CREATED_AT,
          sync_status: 'synced',
        },
        {
          id: 'cpe-inactive-server',
          ended_at: PULLED_AT,
          updated_at: PULLED_AT,
          sync_status: 'synced',
        },
      ]);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('a pending local create stays on the normal path and never supersedes an active synced row', async () => {
    const db = await createDatabase();
    try {
      const classesRepository = createClassesRepository({ database: db });
      const repository = createClassEaAssignmentsRepository({ database: db });
      const active = classEaAssignmentRow({
        id: 'class-ea-active-synced',
        classId: 'class-1',
      });
      const pendingLocalCreate = {
        ...classEaAssignmentRow({
          id: 'class-ea-pending-local-create',
          classId: 'class-local-create',
        }),
        sync_status: 'pending',
        synced: false,
      };
      await classesRepository.saveServerClassRows([classRow('class-local-create')]);
      await repository.saveServerRows([active]);

      await expect(repository.save(pendingLocalCreate)).resolves.toBe(true);
      expect(await db.getAllAsync(`
        select id, unassigned_at, updated_at, sync_status
        from class_ea_assignments
        where ea_user_id = 'user-1'
          and programme_id = 'programme-a'
        order by id
      `)).toEqual([{
        id: 'class-ea-active-synced',
        unassigned_at: null,
        updated_at: CREATED_AT,
        sync_status: 'synced',
      }, {
        id: 'class-ea-pending-local-create',
        unassigned_at: null,
        updated_at: CREATED_AT,
        sync_status: 'pending',
      }]);
      expect(await db.getAllAsync(`
        select id, table_name, record_id, operation, status
        from sync_outbox
        order by id
      `)).toEqual([{
        id: 'class_ea_assignments:class-ea-pending-local-create:insert',
        table_name: 'class_ea_assignments',
        record_id: 'class-ea-pending-local-create',
        operation: 'insert',
        status: 'pending',
      }]);
    } finally {
      await db.closeAsync();
    }
  });
});
