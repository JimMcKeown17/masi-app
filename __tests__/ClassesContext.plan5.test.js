import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ClassesProvider, useClasses } from '../src/context/ClassesContext';
import {
  academicYearsRepository,
  schoolsRepository,
} from '../src/db/repositories/referenceDataRepository';
import { getActiveProgrammeId } from '../src/db/repositories/domainRepositoryUtils';
import { resolveDatabase } from '../src/db/repositories/repositoryRuntime';
import { ensureReferenceData, fetchAndCacheSchools } from '../src/services/offlineSync';
import { useChildren } from '../src/context/ChildrenContext';
import { useOffline } from '../src/context/OfflineContext';
import { useAuth } from '../src/context/AuthContext';
import { classesRepository } from '../src/db/repositories/classesRepository';
import { classEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import { syncStateRepository } from '../src/db/repositories/syncStateRepository';

const mockSupabaseFrom = jest.fn();
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

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: (...args) => mockSupabaseFrom(...args),
  },
}));

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(() => ({ user: { id: 'user-1' } })),
}));

jest.mock('../src/context/OfflineContext', () => ({
  useOffline: jest.fn(() => ({
    isOnline: true,
    refreshSyncStatus: jest.fn(),
    isSyncing: false,
    domainPullNonce: 0,
  })),
}));

jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: jest.fn(),
}));

jest.mock('../src/services/offlineSync', () => ({
  fetchAndCacheSchools: jest.fn(),
  ensureReferenceData: jest.fn(),
}));

jest.mock('../src/db/repositories/referenceDataRepository', () => ({
  academicYearsRepository: {
    getActive: jest.fn(),
  },
  schoolsRepository: {
    getAll: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/domainRepositoryUtils', () => ({
  getActiveProgrammeId: jest.fn(),
  // Real predicate: the context merge must apply the same pending-local-wins
  // policy as the repository pull guard, so don't stub it out.
  hasUnpushedLocalChanges: jest.requireActual('../src/db/repositories/domainRepositoryUtils').hasUnpushedLocalChanges,
}));

jest.mock('../src/db/repositories/repositoryRuntime', () => ({
  resolveDatabase: jest.fn(),
}));

jest.mock('../src/db/repositories/classesRepository', () => ({
  classesRepository: {
    getClasses: jest.fn(),
    saveServerClassRows: jest.fn(),
    saveClass: jest.fn(),
    updateClass: jest.fn(),
    deleteClass: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/classEaAssignmentsRepository', () => ({
  classEaAssignmentsRepository: {
    saveServerRows: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/syncStateRepository', () => ({
  syncStateRepository: {
    setPullState: jest.fn(),
  },
}));

const wrapper = ({ children }) => (
  <ClassesProvider>{children}</ClassesProvider>
);

describe('ClassesContext Plan 5 behavior', () => {
  const updateChild = jest.fn();
  const refreshChildrenFromCache = jest.fn();

  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useChildren.mockReturnValue({
      children: [],
      updateChild,
      refreshFromCache: refreshChildrenFromCache,
    });
    schoolsRepository.getAll.mockResolvedValue([]);
    classesRepository.getClasses.mockResolvedValue([]);
    classesRepository.saveServerClassRows.mockResolvedValue({ applied: 0, skipped: 0 });
    classesRepository.saveClass.mockResolvedValue(true);
    classesRepository.updateClass.mockResolvedValue(true);
    classesRepository.deleteClass.mockResolvedValue(true);
    classEaAssignmentsRepository.saveServerRows.mockResolvedValue({ applied: 0, skipped: 0 });
    syncStateRepository.setPullState.mockResolvedValue(true);
    refreshChildrenFromCache.mockResolvedValue(undefined);
    fetchAndCacheSchools.mockResolvedValue([]);
    ensureReferenceData.mockResolvedValue({});
    academicYearsRepository.getActive.mockResolvedValue({ id: 'year-2026', label: '2026' });
    resolveDatabase.mockResolvedValue({});
    getActiveProgrammeId.mockResolvedValue('programme-a');
    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: false,
      domainPullNonce: 0,
    });
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({ data: [], error: null });
      }
      return queryResult({ data: [], error: null });
    });
  });

  test('sync completion refreshes classes from SQLite without querying the server', async () => {
    const { rerender } = renderHook(() => useClasses(), { wrapper });
    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalled());

    mockSupabaseFrom.mockClear();
    classesRepository.getClasses.mockClear();
    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: true,
    });
    rerender({});
    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: false,
    });
    rerender({});

    await waitFor(() => expect(classesRepository.getClasses).toHaveBeenCalledWith({ userId: 'user-1' }));
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  test('one domain-pull nonce increment triggers exactly one additional class pull', async () => {
    const { rerender } = renderHook(() => useClasses(), { wrapper });
    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('staff_programme_assignments'));
    await waitFor(() => expect(classesRepository.getClasses).toHaveBeenCalled());
    mockSupabaseFrom.mockClear();

    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: false,
      domainPullNonce: 1,
    });
    rerender();

    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledTimes(1));
    expect(mockSupabaseFrom).toHaveBeenCalledWith('staff_programme_assignments');
  });

  test('mount performs exactly one class network pull', async () => {
    renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('staff_programme_assignments'));
    expect(mockSupabaseFrom).toHaveBeenCalledTimes(1);
  });

  test('rapid same-user nonce increments join one in-flight class pull', async () => {
    const { rerender } = renderHook(() => useClasses(), { wrapper });
    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('staff_programme_assignments'));
    mockSupabaseFrom.mockClear();
    let releaseAssignments;
    const heldAssignments = new Promise((resolve) => {
      releaseAssignments = resolve;
    });
    mockSupabaseFrom.mockImplementation(() => {
      const builder = queryResult({ data: [], error: null });
      builder.limit = jest.fn(() => heldAssignments);
      return builder;
    });

    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: false,
      domainPullNonce: 1,
    });
    rerender();
    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledTimes(1));

    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: false,
      domainPullNonce: 2,
    });
    rerender();
    expect(mockSupabaseFrom).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseAssignments({ data: [], error: null });
      await heldAssignments;
    });
  });

  test('an A-to-B user transition starts one class pull per user and only publishes B after A settles', async () => {
    useAuth.mockReturnValue({ user: { id: 'user-a' } });
    classesRepository.getClasses.mockImplementation(async ({ userId }) => ([
      { id: `${userId}-class`, name: userId, synced: true },
    ]));
    let releaseUserAAssignments;
    const heldUserAAssignments = new Promise((resolve) => {
      releaseUserAAssignments = resolve;
    });
    let releaseUserBAssignments;
    const heldUserBAssignments = new Promise((resolve) => {
      releaseUserBAssignments = resolve;
    });
    mockSupabaseFrom.mockImplementation(() => {
      let requestedUserId = null;
      const builder = queryResult({ data: [], error: null });
      builder.eq = jest.fn((column, value) => {
        if (column === 'user_id') requestedUserId = value;
        return builder;
      });
      builder.limit = jest.fn(() => (
        requestedUserId === 'user-a'
          ? heldUserAAssignments
          : heldUserBAssignments
      ));
      return builder;
    });

    const { rerender, result } = renderHook(() => useClasses(), { wrapper });
    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledTimes(1));

    useAuth.mockReturnValue({ user: { id: 'user-b' } });
    rerender();

    await waitFor(() => expect(result.current.classes).toEqual([
      expect.objectContaining({ id: 'user-b-class' }),
    ]));

    await act(async () => {
      releaseUserAAssignments({ data: [], error: null });
      await heldUserAAssignments;
    });
    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledTimes(2));

    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: false,
      domainPullNonce: 1,
    });
    rerender();
    expect(mockSupabaseFrom).toHaveBeenCalledTimes(2);

    await act(async () => {
      releaseUserBAssignments({ data: [], error: null });
      await heldUserBAssignments;
    });

    expect(result.current.classes).toEqual([
      expect.objectContaining({ id: 'user-b-class' }),
    ]);
  });

  test('mount publishes cached SQLite classes before the server pull resolves', async () => {
    classesRepository.getClasses.mockResolvedValue([
      { id: 'cached-class', name: 'Cached Class', created_by: 'user-1', synced: true },
    ]);
    let releaseAssignments;
    const assignmentPromise = new Promise((resolve) => {
      releaseAssignments = resolve;
    });
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        const builder = queryResult({ data: [], error: null });
        builder.limit = jest.fn(() => assignmentPromise);
        return builder;
      }
      return queryResult({ data: [], error: null });
    });

    const { result } = renderHook(() => useClasses(), { wrapper });

    try {
      await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('staff_programme_assignments'));
      await waitFor(() => expect(result.current.classes).toEqual([
        expect.objectContaining({ id: 'cached-class' }),
      ]));
    } finally {
      await act(async () => {
        releaseAssignments({ data: [], error: null });
        await assignmentPromise;
      });
    }
  });

  test('server pull awaits reference data then persists classes and assignments in batches', async () => {
    const serverClass = {
      id: 'server-class',
      name: 'Server Class',
      created_by: 'user-1',
      class_ea_assignments: [{
        id: 'assignment-1',
        class_id: 'server-class',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
      }],
    };
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({ data: [{ programme_id: 'programme-a' }], error: null });
      }
      if (tableName === 'classes') {
        return queryResult({ data: [serverClass], error: null });
      }
      return queryResult({ data: [], error: null });
    });

    renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(classesRepository.saveServerClassRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'server-class', sync_status: 'synced' }),
    ]));
    expect(classEaAssignmentsRepository.saveServerRows.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'assignment-1', sync_status: 'synced' }),
    ]);
    expect(ensureReferenceData).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(ensureReferenceData.mock.invocationCallOrder[0])
      .toBeLessThan(classesRepository.saveServerClassRows.mock.invocationCallOrder[0]);
    expect(classesRepository.saveServerClassRows.mock.invocationCallOrder[0])
      .toBeLessThan(classEaAssignmentsRepository.saveServerRows.mock.invocationCallOrder[0]);
  });

  test('an active programme with zero classes persists an empty assignment batch with reconcile', async () => {
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({ data: [{ programme_id: 'programme-a' }], error: null });
      }
      if (tableName === 'classes') {
        return queryResult({ data: [], error: null });
      }
      return queryResult({ data: [], error: null });
    });

    renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(classEaAssignmentsRepository.saveServerRows).toHaveBeenCalled());
    expect(classesRepository.saveServerClassRows).toHaveBeenCalledWith([]);
    expect(classEaAssignmentsRepository.saveServerRows).toHaveBeenCalledWith([], {
      reconcile: {
        acknowledgedClassIds: [],
        userId: 'user-1',
        programmeId: 'programme-a',
        pulledAt: expect.any(String),
      },
    });
  });

  test('no active programme marks class scopes as dependencies and performs no persistence', async () => {
    renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('staff_programme_assignments'));
    expect(mockSupabaseFrom).not.toHaveBeenCalledWith('classes');
    expect(classesRepository.saveServerClassRows).not.toHaveBeenCalled();
    expect(classEaAssignmentsRepository.saveServerRows).not.toHaveBeenCalled();
  });

  test('a class query error performs no persistence or reconcile', async () => {
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({ data: [{ programme_id: 'programme-a' }], error: null });
      }
      if (tableName === 'classes') {
        return queryResult({ data: null, error: { message: 'class query failed' } });
      }
      return queryResult({ data: [], error: null });
    });

    renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('classes'));
    expect(classesRepository.saveServerClassRows).not.toHaveBeenCalled();
    expect(classEaAssignmentsRepository.saveServerRows).not.toHaveBeenCalled();
  });

  test('a query-failed classes pull still stamps its completion time', async () => {
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({ data: [{ programme_id: 'programme-a' }], error: null });
      }
      if (tableName === 'classes') {
        return queryResult({ data: null, error: { message: 'class query failed' } });
      }
      return queryResult({ data: [], error: null });
    });

    renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('classes'));
    expect(syncStateRepository.setPullState).toHaveBeenCalledWith('classes_pull', {
      lastPulledAt: expect.any(String),
    });
  });

  test('a transport-failed classes pull does not stamp', async () => {
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({
          data: null,
          error: { message: 'network request failed' },
        });
      }
      return queryResult({ data: [], error: null });
    });

    renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('staff_programme_assignments'));
    expect(syncStateRepository.setPullState).not.toHaveBeenCalled();
  });

  test('a classes pull with an incomplete reconcile does not stamp', async () => {
    classEaAssignmentsRepository.saveServerRows.mockResolvedValue({
      applied: 0,
      skipped: 0,
      reconcileCompleted: false,
    });
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({ data: [{ programme_id: 'programme-a' }], error: null });
      }
      if (tableName === 'classes') {
        return queryResult({ data: [], error: null });
      }
      return queryResult({ data: [], error: null });
    });

    renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(classEaAssignmentsRepository.saveServerRows).toHaveBeenCalled());
    expect(syncStateRepository.setPullState).not.toHaveBeenCalled();
  });

  test('an incomplete class-assignment scope persists rows without reconcile', async () => {
    const serverClasses = Array.from({ length: 1000 }, (_, index) => ({
      id: `class-${index}`,
      name: `Class ${index}`,
      class_ea_assignments: [{
        id: `assignment-${index}`,
        class_id: `class-${index}`,
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
      }],
    }));
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({ data: [{ programme_id: 'programme-a' }], error: null });
      }
      if (tableName === 'classes') {
        return queryResult({ data: serverClasses, error: null });
      }
      return queryResult({ data: [], error: null });
    });

    renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(classEaAssignmentsRepository.saveServerRows).toHaveBeenCalled());
    expect(classEaAssignmentsRepository.saveServerRows.mock.calls[0]).toHaveLength(1);
    expect(classEaAssignmentsRepository.saveServerRows.mock.calls[0][0]).toHaveLength(1000);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('addClass automatically uses the active academic year', async () => {
    const { result } = renderHook(() => useClasses(), { wrapper });
    await waitFor(() => expect(classesRepository.getClasses).toHaveBeenCalled());
    expect(schoolsRepository.getAll).toHaveBeenCalled();

    await act(async () => {
      await result.current.addClass({
        school_id: 'school-1',
        name: 'Grade 1A',
        grade: '1',
      });
    });

    expect(academicYearsRepository.getActive).toHaveBeenCalledTimes(1);
    expect(classesRepository.saveClass).toHaveBeenCalledWith(expect.objectContaining({
      school_id: 'school-1',
      name: 'Grade 1A',
      academic_year_id: 'year-2026',
    }));
  });

  test('deleteClass archives in the repository and refreshes child cache without double writes', async () => {
    const { result } = renderHook(() => useClasses(), { wrapper });
    await waitFor(() => expect(classesRepository.getClasses).toHaveBeenCalled());

    await act(async () => {
      await result.current.deleteClass('class-1');
    });

    expect(classesRepository.deleteClass).toHaveBeenCalledWith('class-1', {
      actorUserId: 'user-1',
    });
    expect(refreshChildrenFromCache).toHaveBeenCalledTimes(1);
    expect(updateChild).not.toHaveBeenCalled();
  });

});
