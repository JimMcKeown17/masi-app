jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { __reset, __setDatabaseFactory } from 'expo-sqlite';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { getWriter, resetDatabaseConnectionForTests } from '../src/db/client';
import { childrenRepository } from '../src/db/repositories/childrenRepository';
import { groupsRepository } from '../src/db/repositories/groupsRepository';
import { groupEaAssignmentsRepository } from '../src/db/repositories/groupEaAssignmentsRepository';
import { __testables as offlineSyncTestables } from '../src/services/offlineSync';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const mockPullPreloadedChildData = jest.fn();
const mockRefreshSyncStatus = jest.fn();
const mockSupabaseFrom = jest.fn();

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('../src/context/OfflineContext', () => ({
  useOffline: () => ({
    refreshSyncStatus: (...args) => mockRefreshSyncStatus(...args),
    isSyncing: false,
  }),
}));

jest.mock('../src/services/preloadedChildData', () => ({
  pullPreloadedChildData: (...args) => mockPullPreloadedChildData(...args),
}));

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: (...args) => mockSupabaseFrom(...args),
  },
}));

const wrapper = ({ children }) => (
  <ChildrenProvider>{children}</ChildrenProvider>
);

const successfulScope = (rows) => ({
  ok: true,
  rows,
  complete: true,
  failureKind: null,
});

const failedScope = (failureKind, error) => ({
  ok: false,
  rows: [],
  complete: false,
  failureKind,
  ...(error ? { error } : {}),
});

const successfulAcknowledgments = (overrides = {}) => ({
  ok: true,
  complete: true,
  failureKind: null,
  data: {
    schemaVersion: 1,
    generatedAt: '2026-07-14T12:00:00.000Z',
    activeProgrammeId: 'programme-a',
    childEaAssignmentIds: ['cea-child-1'],
    assignedChildIds: ['child-1'],
    visibleChildIds: ['child-1'],
    childProgrammeEnrollmentIds: ['cpe-child-1'],
    childClassMembershipIds: ['ccm-child-1'],
    classEaAssignmentIds: ['class-assignment-1'],
    classIds: ['class-1'],
    groupEaAssignmentIds: ['gea-group-1'],
    groupIds: ['group-1'],
    childGroupMembershipIds: ['membership-1'],
    ...overrides,
  },
});

const pulledBundle = (overrides = {}) => {
  const {
    activeProgrammeId = 'programme-a',
    reconcileAcknowledgments = successfulAcknowledgments({ activeProgrammeId }),
    scopeOverrides = {},
    ...rowOverrides
  } = overrides;
  const rows = {
    programmeAssignment: [{ programme_id: activeProgrammeId }],
    children: [{
      id: 'child-1',
      first_name: 'Stale Server Name',
      last_name: 'Dlamini',
      class_id: 'class-1',
      created_by: 'user-1',
      synced: true,
      sync_status: 'synced',
    }],
    classes: [{
      id: 'class-1',
      school_id: 'school-1',
      name: 'Grade 1A',
      grade: '1',
      academic_year_id: 'year-2026',
      created_by: 'user-1',
      synced: true,
      sync_status: 'synced',
    }],
    childEaAssignments: [{
      id: 'cea-child-1',
      user_id: 'user-1',
      child_id: 'child-1',
      assigned_at: '2026-01-15T00:00:00.000Z',
      created_by: 'user-1',
      synced: true,
      sync_status: 'synced',
      children: {
        id: 'child-1',
        first_name: 'Stale Server Name',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: true,
        sync_status: 'synced',
      },
    }],
    childProgrammeEnrollments: [{
      id: 'cpe-child-1',
      child_id: 'child-1',
      programme_id: 'programme-a',
      enrolled_at: '2026-01-15T00:00:00.000Z',
      created_by: 'user-1',
      synced: true,
      sync_status: 'synced',
    }],
    childClassMemberships: [{
      id: 'ccm-child-1',
      child_id: 'child-1',
      class_id: 'class-1',
      academic_year_id: 'year-2026',
      enrolled_at: '2026-01-15T00:00:00.000Z',
      created_by: 'user-1',
      synced: true,
      sync_status: 'synced',
    }],
    groups: [{
      id: 'group-1',
      name: 'Stale Server Group',
      programme_id: 'programme-a',
      class_id: 'class-1',
      created_by: 'user-1',
      synced: true,
      sync_status: 'synced',
    }],
    groupEaAssignments: [{
      id: 'gea-group-1',
      group_id: 'group-1',
      ea_user_id: 'user-1',
      programme_id: 'programme-a',
      assigned_at: '2026-01-15T00:00:00.000Z',
      created_by: 'user-1',
      synced: true,
      sync_status: 'synced',
    }],
    childrenGroups: [{
      id: 'membership-1',
      child_id: 'child-1',
      group_id: 'group-1',
      joined_at: '2026-02-01T00:00:00.000Z',
      created_by: 'user-1',
      synced: true,
      sync_status: 'synced',
    }],
    ...rowOverrides,
  };
  return {
    activeProgrammeId,
    reconcileAcknowledgments,
    scopes: {
      ...Object.fromEntries([
      'programmeAssignment',
      'children',
      'classes',
      'childEaAssignments',
      'childProgrammeEnrollments',
      'childClassMemberships',
      'groups',
      'groupEaAssignments',
      'childrenGroups',
      ].map((name) => [name, successfulScope(rows[name] || [])])),
      ...scopeOverrides,
    },
  };
};

const createDeferred = () => {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

const countGroupsForClass = ({ children, childrenGroups }, classId) => {
  const classChildIds = new Set(
    children.filter((child) => child.class_id === classId).map((child) => child.id)
  );
  return new Set(
    childrenGroups
      .filter((membership) => classChildIds.has(membership.child_id))
      .map((membership) => membership.group_id)
  ).size;
};

const seedContextRows = async (db) => {
  await seedCoreData(db);
  await db.runAsync(`
    insert into children (
      id, first_name, last_name, class_id, created_by, sync_status
    ) values (
      'child-1', 'Original Local Name', 'Dlamini', 'class-1', 'user-1', 'synced'
    )
  `);
  await db.runAsync(`
    insert into child_ea_assignments (
      id, user_id, child_id, assigned_at, created_by, sync_status
    ) values (
      'cea-child-1', 'user-1', 'child-1', '2026-01-15T00:00:00.000Z', 'user-1', 'synced'
    )
  `);
  await db.runAsync(`
    insert into child_programme_enrollments (
      id, child_id, programme_id, enrolled_at, created_by, sync_status
    ) values (
      'cpe-child-1', 'child-1', 'programme-a', '2026-01-15T00:00:00.000Z', 'user-1', 'synced'
    )
  `);
  await db.runAsync(`
    insert into child_class_memberships (
      id, child_id, class_id, academic_year_id, enrolled_at, created_by, sync_status
    ) values (
      'ccm-child-1', 'child-1', 'class-1', 'year-2026',
      '2026-01-15T00:00:00.000Z', 'user-1', 'synced'
    )
  `);
  await db.runAsync(`
    insert into groups (
      id, name, programme_id, class_id, created_by, sync_status
    ) values (
      'group-1', 'Original Local Group', 'programme-a', 'class-1', 'user-1', 'synced'
    )
  `);
  await db.runAsync(`
    insert into group_ea_assignments (
      id, group_id, ea_user_id, programme_id, assigned_at, created_by, sync_status
    ) values (
      'gea-group-1', 'group-1', 'user-1', 'programme-a',
      '2026-01-15T00:00:00.000Z', 'user-1', 'synced'
    )
  `);
  await db.runAsync(`
    insert into child_group_memberships (
      id, child_id, group_id, joined_at, created_by, sync_status
    ) values (
      'membership-1', 'child-1', 'group-1', '2026-02-01T00:00:00.000Z',
      'user-1', 'synced'
    )
  `);
};

const referenceRows = {
  schools: [{ id: 'school-server', name: 'Server Primary' }],
  job_titles: [],
  programmes: [{ id: 'programme-server', code: 'literacy', name: 'Literacy' }],
  academic_years: [{
    id: 'year-server',
    label: '2026',
    starts_on: '2026-01-01',
    ends_on: '2026-12-31',
    is_active: true,
  }],
  assessment_windows: [],
  teachers: [],
  staff_programme_assignments: [{
    id: 'spa-user-1',
    user_id: 'user-1',
    programme_id: 'programme-server',
    school_id: 'school-server',
    assigned_at: '2026-01-15T00:00:00.000Z',
  }],
};

let testDb;

beforeEach(async () => {
  jest.clearAllMocks();
  offlineSyncTestables.resetReferenceDataBarrierForTests();
  await AsyncStorage.clear();
  await resetDatabaseConnectionForTests();
  __reset();
  testDb = createBetterSqliteTestDatabase();
  __setDatabaseFactory(async () => testDb);
  await getWriter();
  await testDb.execAsync('PRAGMA foreign_keys = ON');

  mockRefreshSyncStatus.mockResolvedValue(undefined);
  mockSupabaseFrom.mockImplementation((tableName) => {
    const query = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      then: (resolve) => Promise.resolve({
        data: referenceRows[tableName] || [],
        error: null,
      }).then(resolve),
    };
    return query;
  });
});

afterEach(async () => {
  await resetDatabaseConnectionForTests();
  __reset();
});

test('a child edit made while the network pull is pending survives in React state and SQLite', async () => {
  await seedContextRows(testDb);
  const deferredPull = createDeferred();
  mockPullPreloadedChildData.mockReturnValue(deferredPull.promise);
  const { result } = renderHook(() => useChildren(), { wrapper });
  await waitFor(() => expect(mockPullPreloadedChildData).toHaveBeenCalledWith({ userId: 'user-1' }));
  await waitFor(() => expect(result.current.children).toEqual([
    expect.objectContaining({ id: 'child-1', first_name: 'Original Local Name' }),
  ]));

  await act(async () => {
    await result.current.updateChild('child-1', { first_name: 'Edited Mid Pull' });
  });
  await act(async () => {
    deferredPull.resolve(pulledBundle());
    await deferredPull.promise;
  });
  await waitFor(() => expect(result.current.loading).toBe(false));

  const sqliteChildren = await childrenRepository.getMyChildren('user-1');
  expect(sqliteChildren.find((row) => row.id === 'child-1')).toEqual(expect.objectContaining({
    first_name: 'Edited Mid Pull',
    synced: false,
  }));
  expect(result.current.allChildren).toEqual(sqliteChildren);
});

test('a group edit made while the network pull is pending survives in React state and SQLite', async () => {
  await seedContextRows(testDb);
  const deferredPull = createDeferred();
  mockPullPreloadedChildData.mockReturnValue(deferredPull.promise);
  const { result } = renderHook(() => useChildren(), { wrapper });
  await waitFor(() => expect(mockPullPreloadedChildData).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(result.current.groups).toEqual([
    expect.objectContaining({ id: 'group-1', name: 'Original Local Group' }),
  ]));

  await act(async () => {
    await result.current.updateGroup('group-1', { name: 'Edited Group Mid Pull' });
  });
  await act(async () => {
    deferredPull.resolve(pulledBundle());
    await deferredPull.promise;
  });
  await waitFor(() => expect(result.current.loading).toBe(false));

  const sqliteGroups = await groupsRepository.getGroups({ userId: 'user-1' });
  expect(sqliteGroups.find((row) => row.id === 'group-1')).toEqual(expect.objectContaining({
    name: 'Edited Group Mid Pull',
    synced: false,
  }));
  expect(result.current.groups).toEqual(sqliteGroups);
});

test('a membership removal made while the network pull is pending survives in React state and SQLite', async () => {
  await seedContextRows(testDb);
  const deferredPull = createDeferred();
  mockPullPreloadedChildData.mockReturnValue(deferredPull.promise);
  const { result } = renderHook(() => useChildren(), { wrapper });
  await waitFor(() => expect(mockPullPreloadedChildData).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(result.current.childrenGroups).toEqual([
    expect.objectContaining({ id: 'membership-1' }),
  ]));

  await act(async () => {
    await result.current.removeChildFromGroup('child-1', 'group-1');
  });
  await act(async () => {
    deferredPull.resolve(pulledBundle());
    await deferredPull.promise;
  });
  await waitFor(() => expect(result.current.loading).toBe(false));

  const sqliteMemberships = await groupsRepository.getVisibleChildrenGroups({ userId: 'user-1' });
  expect(sqliteMemberships).toEqual([]);
  expect(result.current.childrenGroups).toEqual(sqliteMemberships);
});

test('a full context pull creates no storage facade sidecar rows', async () => {
  await seedContextRows(testDb);
  mockPullPreloadedChildData.mockResolvedValue(pulledBundle());
  const { result } = renderHook(() => useChildren(), { wrapper });

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(await testDb.getAllAsync(`
    select key from local_state where key like 'storage_payload:%'
  `)).toEqual([]);
});

test('an empty cache pulls reference parents before persisting the domain bundle', async () => {
  mockPullPreloadedChildData.mockResolvedValue(pulledBundle({
    activeProgrammeId: 'programme-server',
    reconcileAcknowledgments: successfulAcknowledgments({
      activeProgrammeId: 'programme-server',
      childEaAssignmentIds: ['cea-server'],
      assignedChildIds: ['child-server'],
      visibleChildIds: ['child-server'],
      childProgrammeEnrollmentIds: ['cpe-server'],
      childClassMembershipIds: ['ccm-server'],
      classEaAssignmentIds: [],
      classIds: [],
      groupEaAssignmentIds: ['gea-server'],
      groupIds: ['group-server'],
      childGroupMembershipIds: ['membership-server'],
    }),
    programmeAssignment: [{ programme_id: 'programme-server' }],
    children: [{
      id: 'child-server',
      first_name: 'Server',
      last_name: 'Child',
      class_id: 'class-server',
      created_by: 'user-1',
      synced: true,
    }],
    classes: [{
      id: 'class-server',
      school_id: 'school-server',
      name: 'Server Class',
      grade: '1',
      academic_year_id: 'year-server',
      created_by: 'user-1',
      synced: true,
    }],
    childEaAssignments: [{
      id: 'cea-server',
      user_id: 'user-1',
      child_id: 'child-server',
      created_by: 'user-1',
      synced: true,
    }],
    childProgrammeEnrollments: [{
      id: 'cpe-server',
      child_id: 'child-server',
      programme_id: 'programme-server',
      created_by: 'user-1',
      synced: true,
    }],
    childClassMemberships: [{
      id: 'ccm-server',
      child_id: 'child-server',
      class_id: 'class-server',
      academic_year_id: 'year-server',
      created_by: 'user-1',
      synced: true,
    }],
    groups: [{
      id: 'group-server',
      name: 'Server Group',
      programme_id: 'programme-server',
      class_id: 'class-server',
      created_by: 'user-1',
      synced: true,
    }],
    groupEaAssignments: [{
      id: 'gea-server',
      group_id: 'group-server',
      ea_user_id: 'user-1',
      programme_id: 'programme-server',
      created_by: 'user-1',
      synced: true,
    }],
    childrenGroups: [{
      id: 'membership-server',
      child_id: 'child-server',
      group_id: 'group-server',
      created_by: 'user-1',
      synced: true,
    }],
  }));
  const { result } = renderHook(() => useChildren(), { wrapper });

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(mockSupabaseFrom).toHaveBeenCalledWith('schools');
  expect(await testDb.getFirstAsync('select id from schools where id = ?', 'school-server'))
    .toEqual({ id: 'school-server' });
  expect(await testDb.getFirstAsync('select id from programmes where id = ?', 'programme-server'))
    .toEqual({ id: 'programme-server' });
  expect(await testDb.getFirstAsync('select id from academic_years where id = ?', 'year-server'))
    .toEqual({ id: 'year-server' });
  expect(await testDb.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
  expect(result.current.children.map((row) => row.id)).toEqual(['child-server']);
});

test('ended group assignments hide intact memberships until a later pull re-acknowledges the group', async () => {
  await seedContextRows(testDb);
  mockPullPreloadedChildData.mockResolvedValue(pulledBundle());
  const { result } = renderHook(() => useChildren(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.groups.map((group) => group.id)).toEqual(['group-1']);
  expect(result.current.childrenGroups.map((membership) => membership.id))
    .toEqual(['membership-1']);
  expect(countGroupsForClass(result.current, 'class-1')).toBe(1);
  const membershipBeforeAssignmentEnd = await testDb.getFirstAsync(`
    select *
    from child_group_memberships
    where id = 'membership-1'
  `);

  await groupEaAssignmentsRepository.saveServerRows([], {
    reconcile: {
      acknowledgedGroupIds: [],
      userId: 'user-1',
      programmeId: 'programme-a',
      pulledAt: '2026-07-13T14:00:00.000Z',
    },
  });
  await act(async () => {
    await result.current.refreshFromCache();
  });

  expect(result.current.groups).toEqual([]);
  expect(result.current.childrenGroups).toEqual([]);
  expect(countGroupsForClass(result.current, 'class-1')).toBe(0);
  expect(await testDb.getFirstAsync(`
    select *
    from child_group_memberships
    where id = 'membership-1'
  `)).toEqual(membershipBeforeAssignmentEnd);
  expect(membershipBeforeAssignmentEnd.removed_at).toBeNull();

  await groupEaAssignmentsRepository.saveServerRows([{
    ...pulledBundle().scopes.groupEaAssignments.rows[0],
    unassigned_at: null,
    updated_at: '2026-07-13T15:00:00.000Z',
  }]);
  expect(await testDb.getFirstAsync(`
    select ea_user_id, programme_id, unassigned_at
    from group_ea_assignments
    where id = 'gea-group-1'
  `)).toEqual({
    ea_user_id: 'user-1',
    programme_id: 'programme-a',
    unassigned_at: null,
  });
  await act(async () => {
    await result.current.refreshFromCache();
  });

  expect(result.current.groups.map((group) => group.id)).toEqual(['group-1']);
  expect(result.current.childrenGroups.map((membership) => membership.id))
    .toEqual(['membership-1']);
  expect(countGroupsForClass(result.current, 'class-1')).toBe(1);
  expect(await testDb.getFirstAsync(`
    select *
    from child_group_memberships
    where id = 'membership-1'
  `)).toEqual(membershipBeforeAssignmentEnd);
});

test('a failed membership scope does not block empty group reconcile and final state comes from SQLite', async () => {
  await seedContextRows(testDb);
  const deferredPull = createDeferred();
  mockPullPreloadedChildData.mockReturnValue(deferredPull.promise);
  const { result } = renderHook(() => useChildren(), { wrapper });

  await waitFor(() => expect(mockPullPreloadedChildData).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(result.current.groups.map((group) => group.id)).toEqual(['group-1']));
  expect(result.current.childrenGroups.map((membership) => membership.id))
    .toEqual(['membership-1']);

  await act(async () => {
    deferredPull.resolve(pulledBundle({
      groups: [],
      groupEaAssignments: [],
      reconcileAcknowledgments: successfulAcknowledgments({
        groupEaAssignmentIds: [],
        groupIds: [],
        childGroupMembershipIds: [],
      }),
      scopeOverrides: {
        childrenGroups: failedScope('query', { message: 'membership query failed' }),
      },
    }));
    await deferredPull.promise;
  });
  await waitFor(() => expect(result.current.loading).toBe(false));

  const freshGroups = await groupsRepository.getGroups({ userId: 'user-1' });
  const freshMemberships = await groupsRepository.getVisibleChildrenGroups({ userId: 'user-1' });
  expect(result.current.groups).toEqual(freshGroups);
  expect(result.current.childrenGroups).toEqual(freshMemberships);
  expect(freshGroups).toEqual([]);
  expect(freshMemberships).toEqual([]);
  expect(await testDb.getFirstAsync(`
    select unassigned_at
    from group_ea_assignments
    where id = 'gea-group-1'
  `)).toEqual({ unassigned_at: expect.any(String) });
  expect(await testDb.getFirstAsync(`
    select removed_at
    from child_group_memberships
    where id = 'membership-1'
  `)).toEqual({ removed_at: null });
});

test('RLS-under-returned group rows cannot override the server-authoritative acknowledgment set', async () => {
  await seedContextRows(testDb);
  mockPullPreloadedChildData.mockResolvedValue(pulledBundle({
    groups: [],
    groupEaAssignments: [],
    reconcileAcknowledgments: successfulAcknowledgments({
      groupEaAssignmentIds: ['gea-group-1'],
      groupIds: ['group-1'],
      childGroupMembershipIds: ['membership-1'],
    }),
  }));

  const { result } = renderHook(() => useChildren(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(await testDb.getFirstAsync(`
    select unassigned_at
    from group_ea_assignments
    where id = 'gea-group-1'
  `)).toEqual({ unassigned_at: null });
  expect(result.current.groups.map((group) => group.id)).toEqual(['group-1']);
});

test('an unavailable authoritative snapshot preserves local relationships and does not stamp the pull', async () => {
  await seedContextRows(testDb);
  mockPullPreloadedChildData.mockResolvedValue(pulledBundle({
    groups: [],
    groupEaAssignments: [],
    reconcileAcknowledgments: {
      ok: false,
      complete: false,
      failureKind: 'query',
      error: new Error('acknowledgment RPC unavailable'),
    },
  }));

  const { result } = renderHook(() => useChildren(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(await testDb.getFirstAsync(`
    select unassigned_at
    from group_ea_assignments
    where id = 'gea-group-1'
  `)).toEqual({ unassigned_at: null });
  expect(await testDb.getFirstAsync(`
    select scope
    from sync_state
    where scope = 'child_data_pull'
  `)).toBeNull();
  expect(result.current.groups.map((group) => group.id)).toEqual(['group-1']);
});
