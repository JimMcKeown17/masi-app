jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { __reset, __setDatabaseFactory } from 'expo-sqlite';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { ClassesProvider, useClasses } from '../src/context/ClassesContext';
import { getWriter, resetDatabaseConnectionForTests } from '../src/db/client';
import { childrenRepository } from '../src/db/repositories/childrenRepository';
import { classesRepository } from '../src/db/repositories/classesRepository';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const mockPullPreloadedChildData = jest.fn();
const mockRefreshSyncStatus = jest.fn();
const mockFetchAndCacheSchools = jest.fn();
const mockEnsureReferenceData = jest.fn();
const mockSupabaseFrom = jest.fn();

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('../src/context/OfflineContext', () => ({
  useOffline: () => ({
    isOnline: false,
    refreshSyncStatus: (...args) => mockRefreshSyncStatus(...args),
    isSyncing: false,
  }),
}));

jest.mock('../src/services/preloadedChildData', () => ({
  PULL_SCOPE_COMPLETENESS_LIMIT: 1000,
  pullPreloadedChildData: (...args) => mockPullPreloadedChildData(...args),
}));

jest.mock('../src/services/offlineSync', () => ({
  fetchAndCacheSchools: (...args) => mockFetchAndCacheSchools(...args),
  ensureReferenceData: (...args) => mockEnsureReferenceData(...args),
}));

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: (...args) => mockSupabaseFrom(...args),
  },
}));

const childBundle = (overrides = {}) => {
  const rows = {
    programmeAssignment: [{ programme_id: 'programme-a' }],
    children: [],
    classes: [],
    childEaAssignments: [],
    childProgrammeEnrollments: [],
    childClassMemberships: [],
    groups: [],
    groupEaAssignments: [],
    childrenGroups: [],
    ...overrides,
  };
  return {
    activeProgrammeId: 'programme-a',
    scopes: Object.fromEntries(Object.entries(rows).map(([name, scopeRows]) => [name, {
      ok: true,
      rows: scopeRows,
      complete: true,
      failureKind: null,
    }])),
  };
};

const emptyChildBundle = childBundle();

const createDeferred = () => {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

const queryResult = (result) => {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(async () => result),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return builder;
};

const wrapper = ({ children }) => (
  <ChildrenProvider>
    <ClassesProvider>{children}</ClassesProvider>
  </ChildrenProvider>
);

const useContexts = () => ({
  childrenContext: useChildren(),
  classesContext: useClasses(),
});

let testDb;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await resetDatabaseConnectionForTests();
  __reset();
  testDb = createBetterSqliteTestDatabase();
  __setDatabaseFactory(async () => testDb);
  await getWriter();
  await testDb.execAsync('PRAGMA foreign_keys = ON');
  await seedCoreData(testDb);
  await testDb.runAsync(`
    insert into class_ea_assignments (
      id, class_id, ea_user_id, programme_id, assigned_at, created_by, sync_status
    ) values (
      'class-assignment-1', 'class-1', 'user-1', 'programme-a',
      '2026-01-15T00:00:00.000Z', 'user-1', 'synced'
    )
  `);

  mockPullPreloadedChildData.mockResolvedValue(emptyChildBundle);
  mockRefreshSyncStatus.mockResolvedValue(undefined);
  mockFetchAndCacheSchools.mockResolvedValue([]);
  mockEnsureReferenceData.mockResolvedValue(undefined);
});

afterEach(async () => {
  await resetDatabaseConnectionForTests();
  __reset();
});

test('a class edit made while the network pull is pending survives in React state and SQLite', async () => {
  const deferredClasses = createDeferred();
  mockSupabaseFrom.mockImplementation((tableName) => {
    if (tableName === 'staff_programme_assignments') {
      return queryResult({ data: [{ programme_id: 'programme-a' }], error: null });
    }
    if (tableName === 'classes') {
      const builder = queryResult({ data: [], error: null });
      builder.then = deferredClasses.promise.then.bind(deferredClasses.promise);
      return builder;
    }
    return queryResult({ data: [], error: null });
  });

  const { result } = renderHook(() => useContexts(), { wrapper });
  await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('classes'));
  await waitFor(() => expect(result.current.classesContext.classes).toEqual([
    expect.objectContaining({ id: 'class-1', name: 'Grade 1A' }),
  ]));

  await act(async () => {
    await result.current.classesContext.updateClass('class-1', { name: 'Edited Mid Pull' });
  });
  await act(async () => {
    deferredClasses.resolve({
      data: [{
        id: 'class-1',
        school_id: 'school-1',
        name: 'Stale Server Name',
        grade: '1',
        academic_year_id: 'year-2026',
        created_by: 'user-1',
        class_ea_assignments: [{
          id: 'class-assignment-1',
          class_id: 'class-1',
          ea_user_id: 'user-1',
          programme_id: 'programme-a',
          created_by: 'user-1',
        }],
      }],
      error: null,
    });
    await deferredClasses.promise;
  });
  await waitFor(() => expect(result.current.classesContext.loading).toBe(false));

  const sqliteClasses = await classesRepository.getClasses({ userId: 'user-1' });
  expect(sqliteClasses).toEqual([
    expect.objectContaining({ id: 'class-1', name: 'Edited Mid Pull', synced: false }),
  ]);
  expect(result.current.classesContext.classes).toEqual(sqliteClasses);
});

test('no active programme leaves the existing active class assignment untouched', async () => {
  mockSupabaseFrom.mockImplementation((tableName) => {
    if (tableName === 'staff_programme_assignments') {
      return queryResult({ data: [], error: null });
    }
    return queryResult({ data: [], error: null });
  });

  const { result } = renderHook(() => useContexts(), { wrapper });
  await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('staff_programme_assignments'));
  await waitFor(() => expect(result.current.classesContext.loading).toBe(false));

  expect(mockSupabaseFrom).not.toHaveBeenCalledWith('classes');
  expect(await testDb.getFirstAsync(`
    select unassigned_at
    from class_ea_assignments
    where id = 'class-assignment-1'
  `)).toEqual({ unassigned_at: null });
  const freshClasses = await classesRepository.getClasses({ userId: 'user-1' });
  expect(result.current.classesContext.classes).toEqual(freshClasses);
  expect(freshClasses).toEqual([
    expect.objectContaining({ id: 'class-1' }),
  ]);
});

test('an active programme with zero classes ends the existing active class assignment', async () => {
  mockSupabaseFrom.mockImplementation((tableName) => {
    if (tableName === 'staff_programme_assignments') {
      return queryResult({ data: [{ programme_id: 'programme-a' }], error: null });
    }
    if (tableName === 'classes') {
      return queryResult({ data: [], error: null });
    }
    return queryResult({ data: [], error: null });
  });

  const { result } = renderHook(() => useContexts(), { wrapper });
  await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('classes'));
  await waitFor(async () => {
    expect(await testDb.getFirstAsync(`
      select unassigned_at
      from class_ea_assignments
      where id = 'class-assignment-1'
    `)).toEqual({ unassigned_at: expect.any(String) });
  });
  await waitFor(() => expect(result.current.classesContext.loading).toBe(false));
  const freshClasses = await classesRepository.getClasses({ userId: 'user-1' });
  expect(result.current.classesContext.classes).toEqual(freshClasses);
  expect(freshClasses).toEqual([]);
});

test('archiving a class offline refreshes child assignment state without a server pull', async () => {
  await testDb.runAsync(`
    insert into children (
      id, first_name, last_name, class_id, created_by, sync_status
    ) values (
      'child-1', 'Amahle', 'Dlamini', 'class-1', 'user-1', 'synced'
    )
  `);
  await testDb.runAsync(`
    insert into child_ea_assignments (
      id, user_id, child_id, assigned_at, created_by, sync_status
    ) values (
      'child-ea-1', 'user-1', 'child-1', '2026-01-15T00:00:00.000Z',
      'user-1', 'synced'
    )
  `);
  await testDb.runAsync(`
    insert into child_programme_enrollments (
      id, child_id, programme_id, enrolled_at, created_by, sync_status
    ) values (
      'child-programme-1', 'child-1', 'programme-a', '2026-01-15T00:00:00.000Z',
      'user-1', 'synced'
    )
  `);
  await testDb.runAsync(`
    insert into child_class_memberships (
      id, child_id, class_id, academic_year_id, enrolled_at, created_by, sync_status
    ) values (
      'child-class-1', 'child-1', 'class-1', 'year-2026',
      '2026-01-15T00:00:00.000Z', 'user-1', 'synced'
    )
  `);

  mockPullPreloadedChildData.mockResolvedValue(childBundle({
    children: [{
      id: 'child-1',
      first_name: 'Amahle',
      last_name: 'Dlamini',
      class_id: 'class-1',
      created_by: 'user-1',
      synced: true,
    }],
    classes: [{
      id: 'class-1',
      school_id: 'school-1',
      name: 'Grade 1A',
      grade: '1',
      academic_year_id: 'year-2026',
      created_by: 'user-1',
      synced: true,
    }],
    childEaAssignments: [{
      id: 'child-ea-1',
      user_id: 'user-1',
      child_id: 'child-1',
      created_by: 'user-1',
      synced: true,
    }],
    childProgrammeEnrollments: [{
      id: 'child-programme-1',
      child_id: 'child-1',
      programme_id: 'programme-a',
      created_by: 'user-1',
      synced: true,
    }],
    childClassMemberships: [{
      id: 'child-class-1',
      child_id: 'child-1',
      class_id: 'class-1',
      academic_year_id: 'year-2026',
      created_by: 'user-1',
      synced: true,
    }],
  }));
  mockSupabaseFrom.mockImplementation((tableName) => {
    if (tableName === 'staff_programme_assignments') {
      return queryResult({ data: [{ programme_id: 'programme-a' }], error: null });
    }
    if (tableName === 'classes') {
      return queryResult({
        data: [{
          id: 'class-1',
          school_id: 'school-1',
          name: 'Grade 1A',
          grade: '1',
          academic_year_id: 'year-2026',
          created_by: 'user-1',
          class_ea_assignments: [{
            id: 'class-assignment-1',
            class_id: 'class-1',
            ea_user_id: 'user-1',
            programme_id: 'programme-a',
            created_by: 'user-1',
          }],
        }],
        error: null,
      });
    }
    return queryResult({ data: [], error: null });
  });

  const { result } = renderHook(() => useContexts(), { wrapper });
  await waitFor(() => expect(result.current.childrenContext.children).toEqual([
    expect.objectContaining({ id: 'child-1', class_id: 'class-1' }),
  ]));
  await waitFor(() => expect(result.current.classesContext.loading).toBe(false));
  mockPullPreloadedChildData.mockClear();
  mockSupabaseFrom.mockClear();

  await act(async () => {
    await result.current.classesContext.deleteClass('class-1');
  });

  expect(result.current.classesContext.getChildrenInClass('class-1')).toEqual([]);
  expect(result.current.childrenContext.children).toEqual([]);
  expect(await childrenRepository.getChildren()).toEqual([
    expect.objectContaining({ id: 'child-1', class_id: null }),
  ]);
  expect(mockPullPreloadedChildData).not.toHaveBeenCalled();
  expect(mockSupabaseFrom).not.toHaveBeenCalled();
});
