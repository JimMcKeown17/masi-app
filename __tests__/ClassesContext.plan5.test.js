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
import { classOnboardingRepository } from '../src/db/repositories/classOnboardingRepository';

const mockSupabaseFrom = jest.fn();
const mockSupabaseRpc = jest.fn();
const mockCaptureOperationalError = jest.fn();
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
    rpc: (...args) => mockSupabaseRpc(...args),
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

jest.mock('../src/services/observability', () => ({
  captureOperationalError: (...args) => mockCaptureOperationalError(...args),
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

jest.mock('../src/db/repositories/classOnboardingRepository', () => ({
  classOnboardingRepository: {
    start: jest.fn(),
    getPendingClassId: jest.fn(),
    complete: jest.fn(),
  },
}));

const wrapper = ({ children }) => (
  <ClassesProvider>{children}</ClassesProvider>
);

const reconcileSnapshot = (overrides = {}) => ({
  schema_version: 1,
  complete: true,
  user_id: 'user-1',
  generated_at: '2026-07-14T12:00:00.000Z',
  active_programme_id: 'programme-a',
  child_ea_assignment_ids: [],
  assigned_child_ids: [],
  visible_child_ids: [],
  child_programme_enrollment_ids: [],
  child_class_membership_ids: [],
  class_ea_assignment_ids: ['assignment-1'],
  class_ids: ['class-1'],
  group_ea_assignment_ids: [],
  group_ids: [],
  child_group_membership_ids: [],
  ...overrides,
});

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
    classOnboardingRepository.start.mockResolvedValue(true);
    classOnboardingRepository.getPendingClassId.mockResolvedValue(null);
    classOnboardingRepository.complete.mockResolvedValue(true);
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
    mockSupabaseRpc.mockResolvedValue({ data: reconcileSnapshot(), error: null });
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
    mockSupabaseRpc.mockClear();

    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: false,
      domainPullNonce: 1,
    });
    rerender();

    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledTimes(2));
    expect(mockSupabaseFrom).toHaveBeenCalledWith('staff_programme_assignments');
    expect(mockSupabaseFrom).toHaveBeenCalledWith('classes');
    expect(mockSupabaseRpc).toHaveBeenCalledTimes(1);
  });

  test('mount performs exactly one class network pull', async () => {
    renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('staff_programme_assignments'));
    expect(mockSupabaseFrom).toHaveBeenCalledTimes(2);
    expect(mockSupabaseFrom).toHaveBeenCalledWith('classes');
    expect(mockSupabaseRpc).toHaveBeenCalledTimes(1);
  });

  test('reports confirmed zero classes only after the initial backend check succeeds', async () => {
    let releaseClasses;
    const heldClasses = new Promise((resolve) => {
      releaseClasses = resolve;
    });
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({ data: [{ programme_id: 'programme-a' }], error: null });
      }
      const builder = queryResult({ data: [], error: null });
      builder.order = jest.fn(() => heldClasses);
      return builder;
    });

    const { result } = renderHook(() => useClasses(), { wrapper });

    expect(result.current.classBootstrapStatus).toBe('checking');
    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('classes'));
    expect(result.current.classBootstrapStatus).toBe('checking');

    await act(async () => {
      releaseClasses({ data: [], error: null });
      await heldClasses;
    });

    await waitFor(() => expect(result.current.classBootstrapStatus).toBe('confirmed_empty'));
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

  test('Apply arriving after an active class pull reconciles queues one authorized follow-up pull', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: reconcileSnapshot({ class_ea_assignment_ids: [], class_ids: [] }),
      error: null,
    });
    let authorized = false;
    const consumeReconcileBreakerAuthorization = jest.fn((scope) => {
      if (scope !== 'classEaAssignments' || !authorized) return false;
      authorized = false;
      return true;
    });
    const hasReconcileBreakerAuthorization = jest.fn(
      (scope) => scope === 'classEaAssignments' && authorized
    );
    const offlineValue = (domainPullNonce) => ({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: false,
      domainPullNonce,
      consumeReconcileBreakerAuthorization,
      hasReconcileBreakerAuthorization,
    });
    useOffline.mockReturnValue(offlineValue(0));
    classEaAssignmentsRepository.saveServerRows.mockResolvedValue({
      applied: 0,
      skipped: 0,
      reconcileCompleted: true,
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

    let releaseFinalRead;
    const heldFinalRead = new Promise((resolve) => {
      releaseFinalRead = resolve;
    });
    classesRepository.getClasses
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(heldFinalRead)
      .mockResolvedValue([]);

    const { rerender } = renderHook(() => useClasses(), { wrapper });
    await waitFor(() => expect(classEaAssignmentsRepository.saveServerRows).toHaveBeenCalledTimes(1));

    authorized = true;
    useOffline.mockReturnValue(offlineValue(1));
    rerender();
    expect(mockSupabaseFrom.mock.calls.filter(([table]) => table === 'staff_programme_assignments'))
      .toHaveLength(1);

    await act(async () => {
      releaseFinalRead([]);
      await heldFinalRead;
    });

    await waitFor(() => expect(
      mockSupabaseFrom.mock.calls.filter(([table]) => table === 'staff_programme_assignments')
    ).toHaveLength(2));
    await waitFor(() => expect(classEaAssignmentsRepository.saveServerRows).toHaveBeenCalledTimes(2));
    expect(classEaAssignmentsRepository.saveServerRows.mock.calls[1][1].reconcile)
      .toEqual(expect.objectContaining({ bypassBreaker: true }));
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
    mockSupabaseRpc.mockResolvedValue({
      data: reconcileSnapshot({
        class_ea_assignment_ids: ['assignment-1'],
        class_ids: ['server-class'],
      }),
      error: null,
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
    mockSupabaseRpc.mockResolvedValue({
      data: reconcileSnapshot({ class_ea_assignment_ids: [], class_ids: [] }),
      error: null,
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

  test('a malformed authoritative snapshot blocks reconcile and the successful-pull stamp', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: {
        ...reconcileSnapshot({ class_ea_assignment_ids: [], class_ids: [] }),
        complete: false,
      },
      error: null,
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
    expect(classEaAssignmentsRepository.saveServerRows).toHaveBeenCalledWith([]);
    expect(syncStateRepository.setPullState).not.toHaveBeenCalled();
    expect(mockCaptureOperationalError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Malformed reconcile acknowledgment snapshot' }),
      expect.objectContaining({
        category: 'reconcile_acknowledgment_failed',
        tags: expect.objectContaining({ pull_scope: 'classes' }),
      })
    );
  });

  test('no active programme marks class scopes as dependencies and performs no persistence', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: reconcileSnapshot({
        active_programme_id: null,
        class_ea_assignment_ids: [],
        class_ids: [],
      }),
      error: null,
    });
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
    mockSupabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'network request failed' },
    });
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({
          data: null,
          error: { message: 'network request failed' },
        });
      }
      return queryResult({ data: [], error: null });
    });

    const { result } = renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(mockSupabaseFrom).toHaveBeenCalledWith('staff_programme_assignments'));
    expect(syncStateRepository.setPullState).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.classBootstrapStatus).toBe('unconfirmed_empty'));
  });

  test('a local class-cache read failure settles bootstrap conservatively', async () => {
    classesRepository.getClasses.mockRejectedValue(new Error('sqlite unavailable'));

    const { result } = renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(result.current.classBootstrapStatus).toBe('unconfirmed_empty'));
    expect(result.current.loading).toBe(false);
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

  test('an authorized class-assignment breaker bypass refreshes status on success', async () => {
    const refreshSyncStatus = jest.fn();
    const consumeReconcileBreakerAuthorization = jest.fn(
      (scope) => scope === 'classEaAssignments'
    );
    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus,
      isSyncing: false,
      domainPullNonce: 0,
      consumeReconcileBreakerAuthorization,
    });
    classEaAssignmentsRepository.saveServerRows.mockResolvedValue({
      applied: 1,
      skipped: 0,
      reconcileCompleted: true,
    });
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({ data: [{ programme_id: 'programme-a' }], error: null });
      }
      if (tableName === 'classes') {
        return queryResult({
          data: [{
            id: 'class-1',
            name: 'Class 1',
            class_ea_assignments: [{
              id: 'assignment-1',
              class_id: 'class-1',
              ea_user_id: 'user-1',
              programme_id: 'programme-a',
            }],
          }],
          error: null,
        });
      }
      return queryResult({ data: [], error: null });
    });

    renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(classEaAssignmentsRepository.saveServerRows).toHaveBeenCalled());
    expect(classEaAssignmentsRepository.saveServerRows).toHaveBeenCalledWith(
      expect.any(Array),
      { reconcile: expect.objectContaining({ bypassBreaker: true }) }
    );
    expect(refreshSyncStatus).toHaveBeenCalledWith({ autoTrigger: false });
  });

  test('a complete authoritative snapshot permits reconcile when the ordinary class query reaches its limit', async () => {
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
    mockSupabaseRpc.mockResolvedValue({
      data: reconcileSnapshot({
        class_ea_assignment_ids: serverClasses.map((row) => row.class_ea_assignments[0].id),
        class_ids: serverClasses.map((row) => row.id),
      }),
      error: null,
    });

    renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(classEaAssignmentsRepository.saveServerRows).toHaveBeenCalled());
    expect(classEaAssignmentsRepository.saveServerRows.mock.calls[0]).toHaveLength(2);
    expect(classEaAssignmentsRepository.saveServerRows.mock.calls[0][0]).toHaveLength(1000);
    expect(classEaAssignmentsRepository.saveServerRows.mock.calls[0][1]).toEqual({
      reconcile: expect.objectContaining({
        acknowledgedClassIds: serverClasses.map((row) => row.id),
      }),
    });
    expect(syncStateRepository.setPullState).not.toHaveBeenCalled();
    expect(mockCaptureOperationalError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Classes pull reached its completeness limit' }),
      expect.objectContaining({ category: 'class_pull_incomplete' })
    );
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

  test('starts durable child onboarding in the same class-creation operation', async () => {
    const { result } = renderHook(() => useClasses(), { wrapper });
    await waitFor(() => expect(classesRepository.getClasses).toHaveBeenCalled());

    await act(async () => {
      await result.current.addClass({
        school_id: 'school-1',
        name: 'Grade 1A',
        grade: '1',
      }, { onboarding: true });
    });

    expect(classOnboardingRepository.start).toHaveBeenCalledWith({
      userId: 'user-1',
      classData: expect.objectContaining({
        school_id: 'school-1',
        name: 'Grade 1A',
      }),
    });
    expect(classesRepository.saveClass).not.toHaveBeenCalled();
    expect(result.current.incompleteOnboardingClassId).toEqual(expect.any(String));
  });

  test('restores and completes a pending child step for the active user', async () => {
    classOnboardingRepository.getPendingClassId.mockResolvedValue('class-pending');
    classesRepository.getClasses.mockResolvedValue([{
      id: 'class-pending',
      name: 'Grade 1A',
    }]);
    const { result } = renderHook(() => useClasses(), { wrapper });

    await waitFor(() => {
      expect(result.current.incompleteOnboardingClassId).toBe('class-pending');
    });
    await act(async () => {
      await result.current.completeClassOnboarding('class-pending');
    });

    expect(classOnboardingRepository.complete).toHaveBeenCalledWith({
      userId: 'user-1',
      classId: 'class-pending',
    });
    expect(result.current.incompleteOnboardingClassId).toBeNull();
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
