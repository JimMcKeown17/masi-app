jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

const fs = require('fs');
const os = require('os');
const path = require('path');

import { runMigrations } from '../src/db/migrations';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createClassEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { createGroupEaAssignmentsRepository } from '../src/db/repositories/groupEaAssignmentsRepository';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const CREATED_AT = '2026-07-01T09:00:00.000Z';
const PULLED_AT = '2026-07-13T16:00:00.000Z';

const classAssignmentRow = {
  id: 'class-assignment-1',
  class_id: 'class-1',
  ea_user_id: 'user-1',
  programme_id: 'programme-a',
  assigned_at: CREATED_AT,
  unassigned_at: null,
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: 'synced',
  synced: true,
};

const childRow = {
  id: 'child-1',
  first_name: 'Amahle',
  last_name: 'Dlamini',
  class_id: 'class-1',
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: 'synced',
  synced: true,
};

const childAssignmentRow = {
  id: 'child-assignment-1',
  child_id: childRow.id,
  user_id: 'user-1',
  assigned_at: CREATED_AT,
  unassigned_at: null,
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: 'synced',
  synced: true,
};

const programmeEnrollmentRow = {
  id: 'programme-enrollment-1',
  child_id: childRow.id,
  programme_id: 'programme-a',
  enrolled_at: CREATED_AT,
  ended_at: null,
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: 'synced',
  synced: true,
};

const classMembershipRow = {
  id: 'class-membership-1',
  child_id: childRow.id,
  class_id: 'class-1',
  academic_year_id: 'year-2026',
  enrolled_at: CREATED_AT,
  exited_at: null,
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: 'synced',
  synced: true,
};

const groupRow = {
  id: 'group-1',
  name: 'Group 1',
  programme_id: 'programme-a',
  class_id: 'class-1',
  archived_at: null,
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: 'synced',
  synced: true,
};

const groupAssignmentRow = {
  id: 'group-assignment-1',
  group_id: groupRow.id,
  ea_user_id: 'user-1',
  programme_id: 'programme-a',
  assigned_at: CREATED_AT,
  unassigned_at: null,
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: 'synced',
  synced: true,
};

const groupMembershipRow = {
  id: 'group-membership-1',
  child_id: childRow.id,
  group_id: groupRow.id,
  joined_at: CREATED_AT,
  removed_at: null,
  created_by: 'user-1',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  sync_status: 'synced',
  synced: true,
};

const withRestartableDatabase = async (task) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-pull-reconcile-'));
  const filename = path.join(directory, 'pull-reconcile.sqlite');
  let database = createBetterSqliteTestDatabase(filename);

  try {
    await runMigrations(database);
    await database.execAsync('PRAGMA foreign_keys = ON');
    await seedCoreData(database);

    const reopen = async () => {
      await database.closeAsync();
      database = createBetterSqliteTestDatabase(filename);
      await database.execAsync('PRAGMA foreign_keys = ON');
      return database;
    };

    await task({ firstDatabase: database, reopen });
  } finally {
    try {
      await database.closeAsync();
    } catch (error) {
      // The test may have failed immediately after closing the first adapter.
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

const seedVisibleChild = async (repository) => {
  await repository.saveServerChildRows([childRow]);
  await repository.saveServerStaffChildRows([childAssignmentRow]);
  await repository.saveServerChildProgrammeEnrollmentRows([programmeEnrollmentRow]);
  await repository.saveServerChildClassMembershipRows([classMembershipRow]);
};

const seedVisibleGroup = async (database) => {
  const children = createChildrenRepository({ database });
  const groups = createGroupsRepository({ database });
  const assignments = createGroupEaAssignmentsRepository({ database });
  await children.saveServerChildRows([childRow]);
  await groups.saveServerGroupRows([groupRow]);
  await assignments.saveServerRows([groupAssignmentRow]);
  await groups.saveServerChildrenGroupRows([groupMembershipRow]);
  return { groups, assignments };
};

test('a Head Office class unassignment stays gone after an offline restart', async () => {
  await withRestartableDatabase(async ({ firstDatabase, reopen }) => {
    const classesBeforeRestart = createClassesRepository({ database: firstDatabase });
    const assignmentsBeforeRestart = createClassEaAssignmentsRepository({
      database: firstDatabase,
    });
    await assignmentsBeforeRestart.saveServerRows([classAssignmentRow]);
    expect(await classesBeforeRestart.getClasses({ userId: 'user-1' }))
      .toEqual([expect.objectContaining({ id: 'class-1' })]);

    await assignmentsBeforeRestart.saveServerRows([], {
      reconcile: {
        acknowledgedClassIds: [],
        userId: 'user-1',
        programmeId: 'programme-a',
        pulledAt: PULLED_AT,
      },
    });

    const secondDatabase = await reopen();
    const classesAfterRestart = createClassesRepository({ database: secondDatabase });
    const assignmentsAfterRestart = createClassEaAssignmentsRepository({
      database: secondDatabase,
    });

    expect(await classesAfterRestart.getClasses({ userId: 'user-1' })).toEqual([]);
    expect(await assignmentsAfterRestart.getAll()).toEqual([
      expect.objectContaining({
        id: classAssignmentRow.id,
        unassigned_at: PULLED_AT,
        sync_status: 'synced',
      }),
    ]);
  });
});

test('a Head Office child unassignment stays gone after an offline restart', async () => {
  await withRestartableDatabase(async ({ firstDatabase, reopen }) => {
    const childrenBeforeRestart = createChildrenRepository({ database: firstDatabase });
    await seedVisibleChild(childrenBeforeRestart);
    expect(await childrenBeforeRestart.getMyChildren('user-1'))
      .toEqual([expect.objectContaining({ id: childRow.id })]);

    await childrenBeforeRestart.saveServerStaffChildRows([], {
      reconcile: {
        acknowledgedIds: [],
        userId: 'user-1',
        pulledAt: PULLED_AT,
      },
    });

    const secondDatabase = await reopen();
    const childrenAfterRestart = createChildrenRepository({ database: secondDatabase });

    expect(await childrenAfterRestart.getMyChildren('user-1')).toEqual([]);
    expect(await secondDatabase.getFirstAsync(`
      select unassigned_at, sync_status
      from child_ea_assignments
      where id = ?
    `, childAssignmentRow.id)).toEqual({
      unassigned_at: PULLED_AT,
      sync_status: 'synced',
    });
  });
});

test('an ended enrollment hides the child without ending its assignment after restart', async () => {
  await withRestartableDatabase(async ({ firstDatabase, reopen }) => {
    const childrenBeforeRestart = createChildrenRepository({ database: firstDatabase });
    await seedVisibleChild(childrenBeforeRestart);

    await childrenBeforeRestart.saveServerChildProgrammeEnrollmentRows([], {
      reconcile: {
        acknowledgedIds: [],
        acknowledgedAssignedChildIds: [childRow.id],
        programmeId: 'programme-a',
        pulledAt: PULLED_AT,
      },
    });

    const secondDatabase = await reopen();
    const childrenAfterRestart = createChildrenRepository({ database: secondDatabase });

    expect(await childrenAfterRestart.getMyChildren('user-1')).toEqual([]);
    expect(await secondDatabase.getFirstAsync(`
      select unassigned_at, sync_status
      from child_ea_assignments
      where id = ?
    `, childAssignmentRow.id)).toEqual({
      unassigned_at: null,
      sync_status: 'synced',
    });
    expect(await secondDatabase.getFirstAsync(`
      select ended_at, sync_status
      from child_programme_enrollments
      where id = ?
    `, programmeEnrollmentRow.id)).toEqual({
      ended_at: PULLED_AT,
      sync_status: 'synced',
    });
  });
});

test('a Head Office group unassignment hides the group and intact membership after restart', async () => {
  await withRestartableDatabase(async ({ firstDatabase, reopen }) => {
    const { groups, assignments } = await seedVisibleGroup(firstDatabase);
    expect(await groups.getGroups({ userId: 'user-1' }))
      .toEqual([expect.objectContaining({ id: groupRow.id })]);
    expect(await groups.getVisibleChildrenGroups({ userId: 'user-1' }))
      .toEqual([expect.objectContaining({ id: groupMembershipRow.id })]);

    await assignments.saveServerRows([], {
      reconcile: {
        acknowledgedGroupIds: [],
        userId: 'user-1',
        programmeId: 'programme-a',
        pulledAt: PULLED_AT,
      },
    });

    const secondDatabase = await reopen();
    const groupsAfterRestart = createGroupsRepository({ database: secondDatabase });

    expect(await groupsAfterRestart.getGroups({ userId: 'user-1' })).toEqual([]);
    expect(await groupsAfterRestart.getVisibleChildrenGroups({ userId: 'user-1' })).toEqual([]);
    expect(await groupsAfterRestart.getChildrenGroups()).toEqual([
      expect.objectContaining({
        id: groupMembershipRow.id,
        removed_at: null,
        sync_status: 'synced',
      }),
    ]);
    expect(await secondDatabase.getFirstAsync(`
      select archived_at
      from groups
      where id = ?
    `, groupRow.id)).toEqual({ archived_at: null });
  });
});

test('a Head Office group tombstone stays gone after an offline restart', async () => {
  await withRestartableDatabase(async ({ firstDatabase, reopen }) => {
    const { groups } = await seedVisibleGroup(firstDatabase);

    await groups.saveServerGroupRows([{
      ...groupRow,
      archived_at: PULLED_AT,
      updated_at: PULLED_AT,
    }]);

    const secondDatabase = await reopen();
    const groupsAfterRestart = createGroupsRepository({ database: secondDatabase });

    expect(await groupsAfterRestart.getGroups({ userId: 'user-1' })).toEqual([]);
    expect(await groupsAfterRestart.getVisibleChildrenGroups({ userId: 'user-1' })).toEqual([]);
    expect(await secondDatabase.getFirstAsync(`
      select archived_at, sync_status
      from groups
      where id = ?
    `, groupRow.id)).toEqual({
      archived_at: PULLED_AT,
      sync_status: 'synced',
    });
  });
});
