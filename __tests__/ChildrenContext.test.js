import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { pullPreloadedChildData } from '../src/services/preloadedChildData';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { childrenRepository } from '../src/db/repositories/childrenRepository';
import { classesRepository } from '../src/db/repositories/classesRepository';
import { groupsRepository } from '../src/db/repositories/groupsRepository';
import { groupEaAssignmentsRepository } from '../src/db/repositories/groupEaAssignmentsRepository';
import { syncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { syncStateRepository } from '../src/db/repositories/syncStateRepository';
import { ensureReferenceData } from '../src/services/offlineSync';

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {},
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

jest.mock('../src/services/preloadedChildData', () => ({
  pullPreloadedChildData: jest.fn(),
}));

jest.mock('../src/services/offlineSync', () => ({
  ensureReferenceData: jest.fn(),
}));

jest.mock('../src/db/repositories/childrenRepository', () => ({
  childrenRepository: {
    getMyChildren: jest.fn(),
    getChildren: jest.fn(),
    save: jest.fn(),
    updateChild: jest.fn(),
    deleteIfNoHistory: jest.fn(),
    archiveChild: jest.fn(),
    saveServerChildRows: jest.fn(),
    saveServerStaffChildRows: jest.fn(),
    saveServerChildProgrammeEnrollmentRows: jest.fn(),
    saveServerChildClassMembershipRows: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/classesRepository', () => ({
  classesRepository: {
    saveServerClassRows: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/groupsRepository', () => ({
  groupsRepository: {
    getGroups: jest.fn(),
    getVisibleChildrenGroups: jest.fn(),
    saveGroup: jest.fn(),
    updateGroup: jest.fn(),
    deleteGroup: jest.fn(),
    addChildToGroup: jest.fn(),
    removeChildFromGroup: jest.fn(),
    saveServerGroupRows: jest.fn(),
    saveServerChildrenGroupRows: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/groupEaAssignmentsRepository', () => ({
  groupEaAssignmentsRepository: {
    saveServerRows: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/syncOutboxRepository', () => ({
  syncOutboxRepository: {
    getPendingHardDeleteIds: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/syncStateRepository', () => ({
  syncStateRepository: {
    setPullState: jest.fn(),
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

const pulledBundle = (options = {}) => {
  const {
    activeProgrammeId = 'programme-a',
    programmeAssignment = [{ programme_id: activeProgrammeId }],
    children = [],
    childEaAssignments = [],
    childProgrammeEnrollments = [],
    childClassMemberships = [],
    classes = [],
    groups = [],
    groupEaAssignments = [],
    childrenGroups = [],
    scopeOverrides = {},
    reconcileAcknowledgments = {
      ok: true,
      complete: true,
      failureKind: null,
      data: {
        schemaVersion: 1,
        generatedAt: '2026-07-14T12:00:00.000Z',
        activeProgrammeId,
        childEaAssignmentIds: childEaAssignments.map((row) => row.id),
        assignedChildIds: childEaAssignments.map((row) => row.child_id),
        visibleChildIds: children.map((row) => row.id),
        childProgrammeEnrollmentIds: childProgrammeEnrollments.map((row) => row.id),
        childClassMembershipIds: childClassMemberships.map((row) => row.id),
        classEaAssignmentIds: [],
        classIds: [],
        groupEaAssignmentIds: groupEaAssignments.map((row) => row.id),
        groupIds: groups.map((row) => row.id),
        childGroupMembershipIds: childrenGroups.map((row) => row.id),
      },
    },
  } = options;
  return {
    activeProgrammeId,
    reconcileAcknowledgments,
    scopes: {
      programmeAssignment: successfulScope(programmeAssignment),
      children: successfulScope(children),
      childEaAssignments: successfulScope(childEaAssignments),
      childProgrammeEnrollments: successfulScope(childProgrammeEnrollments),
      childClassMemberships: successfulScope(childClassMemberships),
      classes: successfulScope(classes),
      groups: successfulScope(groups),
      groupEaAssignments: successfulScope(groupEaAssignments),
      childrenGroups: successfulScope(childrenGroups),
      ...scopeOverrides,
    },
  };
};

describe('ChildrenContext Plan 5 hydration', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: false,
      domainPullNonce: 0,
    });
    ensureReferenceData.mockResolvedValue({});
    childrenRepository.getMyChildren.mockResolvedValue([
      { id: 'cached-child', first_name: 'Cached', last_name: 'Child', synced: false },
    ]);
    childrenRepository.getChildren.mockResolvedValue([
      { id: 'cached-child', first_name: 'Cached', last_name: 'Child', synced: false },
    ]);
    childrenRepository.save.mockResolvedValue(true);
    childrenRepository.updateChild.mockResolvedValue(true);
    childrenRepository.deleteIfNoHistory.mockResolvedValue(false);
    childrenRepository.archiveChild.mockResolvedValue(true);
    groupsRepository.getGroups.mockResolvedValue([
      { id: 'cached-group', name: 'Cached Group', synced: false },
    ]);
    groupsRepository.getVisibleChildrenGroups.mockResolvedValue([
      { id: 'cached-membership', child_id: 'cached-child', group_id: 'cached-group', synced: false },
    ]);
    groupsRepository.saveGroup.mockResolvedValue(true);
    groupsRepository.updateGroup.mockResolvedValue(true);
    groupsRepository.deleteGroup.mockResolvedValue(true);
    groupsRepository.addChildToGroup.mockResolvedValue(true);
    groupsRepository.removeChildFromGroup.mockResolvedValue(true);
    syncOutboxRepository.getPendingHardDeleteIds.mockResolvedValue(new Set());
    syncStateRepository.setPullState.mockResolvedValue(true);
    classesRepository.saveServerClassRows.mockResolvedValue({ applied: 0, skipped: 0 });
    childrenRepository.saveServerChildRows.mockResolvedValue({ applied: 0, skipped: 0 });
    childrenRepository.saveServerStaffChildRows.mockResolvedValue({ applied: 0, skipped: 0 });
    childrenRepository.saveServerChildProgrammeEnrollmentRows.mockResolvedValue({ applied: 0, skipped: 0 });
    childrenRepository.saveServerChildClassMembershipRows.mockResolvedValue({ applied: 0, skipped: 0 });
    groupsRepository.saveServerGroupRows.mockResolvedValue({ applied: 0, skipped: 0 });
    groupsRepository.saveServerChildrenGroupRows.mockResolvedValue({ applied: 0, skipped: 0 });
    groupEaAssignmentsRepository.saveServerRows.mockResolvedValue({ applied: 0, skipped: 0 });
    pullPreloadedChildData.mockResolvedValue(pulledBundle({
      children: [{ id: 'server-child', first_name: 'Server', last_name: 'Child', synced: true }],
      classes: [{ id: 'server-class', name: 'Server Class', synced: true }],
      childEaAssignments: [{ id: 'cea-1', child_id: 'server-child', user_id: 'user-1', synced: true }],
      childProgrammeEnrollments: [{ id: 'cpe-1', child_id: 'server-child', programme_id: 'programme-a', synced: true }],
      childClassMemberships: [{ id: 'ccm-1', child_id: 'server-child', class_id: 'server-class', synced: true }],
      groups: [{ id: 'server-group', name: 'Server Group', synced: true }],
      groupEaAssignments: [],
      childrenGroups: [{ id: 'server-membership', child_id: 'server-child', group_id: 'server-group', synced: true }],
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('mount performs one preloaded child-data pull and persists the result', async () => {
    const { result } = renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(pullPreloadedChildData).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
    }));
    expect(childrenRepository.getMyChildren).toHaveBeenCalledWith('user-1');
    expect(groupsRepository.getGroups).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
    expect(childrenRepository.saveServerChildRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'server-child' }),
    ]);
    expect(classesRepository.saveServerClassRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'server-class' }),
    ]);
    expect(childrenRepository.saveServerStaffChildRows.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'cea-1' }),
    ]);
    expect(childrenRepository.saveServerChildProgrammeEnrollmentRows.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'cpe-1' }),
    ]);
    expect(childrenRepository.saveServerChildClassMembershipRows.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'ccm-1' }),
    ]);
    expect(groupsRepository.saveServerGroupRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'server-group' }),
    ]);
    expect(groupsRepository.saveServerChildrenGroupRows.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'server-membership' }),
    ]);
  });

  test('one domain-pull nonce increment triggers exactly one additional pull', async () => {
    const { rerender, result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    pullPreloadedChildData.mockClear();

    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: false,
      domainPullNonce: 1,
    });
    rerender();

    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));
  });

  test('rapid same-user nonce increments join one in-flight pull', async () => {
    const { rerender, result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    pullPreloadedChildData.mockClear();
    let releasePull;
    const heldPull = new Promise((resolve) => {
      releasePull = resolve;
    });
    pullPreloadedChildData.mockReturnValue(heldPull);

    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: false,
      domainPullNonce: 1,
    });
    rerender();
    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));

    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: false,
      domainPullNonce: 2,
    });
    rerender();
    expect(pullPreloadedChildData).toHaveBeenCalledTimes(1);

    await act(async () => {
      releasePull(pulledBundle());
      await heldPull;
    });
  });

  test('Apply arriving after an active pull reconciles queues one authorized follow-up pull', async () => {
    let authorized = false;
    const consumeReconcileBreakerAuthorization = jest.fn((scope) => {
      if (scope !== 'childEaAssignments' || !authorized) return false;
      authorized = false;
      return true;
    });
    const hasReconcileBreakerAuthorization = jest.fn(
      (scope) => scope === 'childEaAssignments' && authorized
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

    let releaseFinalRead;
    const heldFinalRead = new Promise((resolve) => {
      releaseFinalRead = resolve;
    });
    const cachedRows = [{ id: 'cached-child', first_name: 'Cached', synced: true }];
    childrenRepository.getMyChildren
      .mockResolvedValueOnce(cachedRows)
      .mockReturnValueOnce(heldFinalRead)
      .mockResolvedValue(cachedRows);

    const { rerender } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(childrenRepository.saveServerStaffChildRows).toHaveBeenCalledTimes(1));

    authorized = true;
    useOffline.mockReturnValue(offlineValue(1));
    rerender();
    expect(pullPreloadedChildData).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseFinalRead(cachedRows);
      await heldFinalRead;
    });

    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(childrenRepository.saveServerStaffChildRows).toHaveBeenCalledTimes(2));
    expect(childrenRepository.saveServerStaffChildRows.mock.calls[1][1].reconcile)
      .toEqual(expect.objectContaining({ bypassBreaker: true }));
  });

  test('an A-to-B user transition starts one pull per user and only publishes B after A settles', async () => {
    useAuth.mockReturnValue({ user: { id: 'user-a' } });
    childrenRepository.getMyChildren.mockImplementation(async (userId) => ([
      { id: `${userId}-child`, first_name: userId, synced: true },
    ]));
    groupsRepository.getGroups.mockResolvedValue([]);
    groupsRepository.getVisibleChildrenGroups.mockResolvedValue([]);
    let releaseUserAPull;
    const heldUserAPull = new Promise((resolve) => {
      releaseUserAPull = resolve;
    });
    pullPreloadedChildData.mockImplementation(({ userId }) => (
      userId === 'user-a' ? heldUserAPull : Promise.resolve(pulledBundle())
    ));

    const { rerender, result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledWith({ userId: 'user-a' }));

    useAuth.mockReturnValue({ user: { id: 'user-b' } });
    rerender();

    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledWith({ userId: 'user-b' }));
    await waitFor(() => expect(result.current.children).toEqual([
      expect.objectContaining({ id: 'user-b-child' }),
    ]));

    await act(async () => {
      releaseUserAPull(pulledBundle());
      await heldUserAPull;
    });

    expect(pullPreloadedChildData).toHaveBeenCalledTimes(2);
    expect(result.current.children).toEqual([
      expect.objectContaining({ id: 'user-b-child' }),
    ]);
  });

  test('a query-failed child-data pull still stamps its completion time', async () => {
    const dependencyScope = failedScope('dependency');
    pullPreloadedChildData.mockResolvedValueOnce(pulledBundle({
      activeProgrammeId: null,
      programmeAssignment: [],
      scopeOverrides: {
        programmeAssignment: failedScope('query', { message: 'query failed' }),
        children: dependencyScope,
        childEaAssignments: dependencyScope,
        childProgrammeEnrollments: dependencyScope,
        childClassMemberships: dependencyScope,
        classes: dependencyScope,
        groups: dependencyScope,
        groupEaAssignments: dependencyScope,
        childrenGroups: dependencyScope,
      },
    }));

    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(syncStateRepository.setPullState).toHaveBeenCalledWith('child_data_pull', {
      lastPulledAt: expect.any(String),
    });
  });

  test('a transport-failed child-data pull does not stamp', async () => {
    const dependencyScope = failedScope('dependency');
    pullPreloadedChildData.mockResolvedValueOnce(pulledBundle({
      activeProgrammeId: null,
      programmeAssignment: [],
      scopeOverrides: {
        programmeAssignment: failedScope('transport', { message: 'network failed' }),
        children: dependencyScope,
        childEaAssignments: dependencyScope,
        childProgrammeEnrollments: dependencyScope,
        childClassMemberships: dependencyScope,
        classes: dependencyScope,
        groups: dependencyScope,
        groupEaAssignments: dependencyScope,
        childrenGroups: dependencyScope,
      },
    }));

    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(syncStateRepository.setPullState).not.toHaveBeenCalled();
  });

  test('a child-data pull with an incomplete reconcile does not stamp', async () => {
    const completed = { applied: 0, skipped: 0, reconcileCompleted: true };
    childrenRepository.saveServerStaffChildRows.mockResolvedValue({
      applied: 0,
      skipped: 0,
      reconcileCompleted: false,
    });
    childrenRepository.saveServerChildProgrammeEnrollmentRows.mockResolvedValue(completed);
    childrenRepository.saveServerChildClassMembershipRows.mockResolvedValue(completed);
    groupEaAssignmentsRepository.saveServerRows.mockResolvedValue(completed);
    groupsRepository.saveServerChildrenGroupRows.mockResolvedValue(completed);

    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(syncStateRepository.setPullState).not.toHaveBeenCalled();
  });

  test('an authorized child-assignment breaker bypass is scope-specific and refreshes status on success', async () => {
    const refreshSyncStatus = jest.fn();
    const consumeReconcileBreakerAuthorization = jest.fn(
      (scope) => scope === 'childEaAssignments'
    );
    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus,
      isSyncing: false,
      domainPullNonce: 0,
      consumeReconcileBreakerAuthorization,
    });
    childrenRepository.saveServerStaffChildRows.mockResolvedValue({
      applied: 0,
      skipped: 0,
      reconcileCompleted: true,
    });

    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(childrenRepository.saveServerStaffChildRows).toHaveBeenCalledWith(
      expect.any(Array),
      { reconcile: expect.objectContaining({ bypassBreaker: true }) }
    );
    expect(childrenRepository.saveServerChildProgrammeEnrollmentRows.mock.calls[0][1].reconcile)
      .not.toHaveProperty('bypassBreaker', true);
    expect(refreshSyncStatus).toHaveBeenCalledWith({ autoTrigger: false });
  });

  test('persists pulled group assignments after their groups', async () => {
    const groupRow = { id: 'server-group', name: 'Server Group', synced: true };
    const assignmentRow = {
      id: 'gea-1',
      group_id: 'server-group',
      ea_user_id: 'user-1',
      programme_id: 'programme-a',
      synced: true,
    };
    pullPreloadedChildData.mockResolvedValueOnce(pulledBundle({
      groups: [groupRow],
      groupEaAssignments: [assignmentRow],
    }));

    const { result } = renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(groupsRepository.saveServerGroupRows).toHaveBeenCalledWith([groupRow]);
    expect(groupEaAssignmentsRepository.saveServerRows.mock.calls[0][0]).toEqual([assignmentRow]);
    expect(groupsRepository.saveServerGroupRows.mock.invocationCallOrder[0])
      .toBeLessThan(groupEaAssignmentsRepository.saveServerRows.mock.invocationCallOrder[0]);
  });

  test('persists the deduplicated union of intersection and assignment-embedded children', async () => {
    pullPreloadedChildData.mockResolvedValueOnce(pulledBundle({
      children: [
        { id: 'child-a', first_name: 'Intersection', synced: true },
      ],
      childEaAssignments: [
        {
          id: 'cea-a',
          child_id: 'child-a',
          user_id: 'user-1',
          children: { id: 'child-a', first_name: 'Embedded duplicate', synced: true },
          synced: true,
        },
        {
          id: 'cea-b',
          child_id: 'child-b',
          user_id: 'user-1',
          children: { id: 'child-b', first_name: 'Embedded only', synced: true },
          synced: true,
        },
      ],
    }));

    const { result } = renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const persistedChildren = childrenRepository.saveServerChildRows.mock.calls[0][0];
    expect(persistedChildren.map((row) => row.id).sort()).toEqual(['child-a', 'child-b']);
  });

  test('pending hard-delete ids filter assignment-embedded children and direct relationships', async () => {
    syncOutboxRepository.getPendingHardDeleteIds.mockResolvedValue(new Set(['child-deleted']));
    pullPreloadedChildData.mockResolvedValueOnce(pulledBundle({
      childEaAssignments: [
        {
          id: 'cea-deleted',
          child_id: 'child-deleted',
          children: { id: 'child-deleted', first_name: 'Deleted', synced: true },
          synced: true,
        },
        {
          id: 'cea-kept',
          child_id: 'child-kept',
          children: { id: 'child-kept', first_name: 'Kept', synced: true },
          synced: true,
        },
      ],
      childProgrammeEnrollments: [
        { id: 'cpe-deleted', child_id: 'child-deleted', synced: true },
        { id: 'cpe-kept', child_id: 'child-kept', synced: true },
      ],
    }));

    const { result } = renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(childrenRepository.saveServerChildRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'child-kept' }),
    ]);
    expect(childrenRepository.saveServerStaffChildRows.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'cea-kept' }),
    ]);
    expect(childrenRepository.saveServerChildProgrammeEnrollmentRows.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'cpe-kept' }),
    ]);
  });

  test('mount publishes cached SQLite rows before the server pull resolves', async () => {
    let releasePull;
    pullPreloadedChildData.mockImplementation(() => new Promise((resolve) => {
      releasePull = resolve;
    }));

    const { result } = renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.children.map(child => child.id)).toContain('cached-child'));
    expect(result.current.groups.map(group => group.id)).toContain('cached-group');
    expect(result.current.childrenGroups.map(membership => membership.id)).toContain('cached-membership');

    await act(async () => {
      releasePull(pulledBundle());
    });
  });

  test('sync completion refreshes SQLite state without pulling from the server', async () => {
    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: true,
    });
    const { rerender } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));
    pullPreloadedChildData.mockClear();
    childrenRepository.getMyChildren.mockClear();

    useOffline.mockReturnValue({
      isOnline: true,
      refreshSyncStatus: jest.fn(),
      isSyncing: false,
    });
    rerender();

    await waitFor(() => expect(childrenRepository.getMyChildren).toHaveBeenCalledWith('user-1'));
    expect(pullPreloadedChildData).not.toHaveBeenCalled();
  });

  test('refreshFromCache is exposed and updates state without a server pull', async () => {
    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));
    pullPreloadedChildData.mockClear();
    childrenRepository.getMyChildren.mockResolvedValue([
      { id: 'cache-refresh-child', first_name: 'Cache', synced: true },
    ]);

    await act(async () => {
      await result.current.refreshFromCache();
    });

    expect(result.current.children).toEqual([
      expect.objectContaining({ id: 'cache-refresh-child' }),
    ]);
    expect(pullPreloadedChildData).not.toHaveBeenCalled();
  });

  test('server pull waits for reference data and persists each table through the batch APIs in FK order', async () => {
    renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(groupsRepository.saveServerChildrenGroupRows).toHaveBeenCalledTimes(1));

    expect(ensureReferenceData).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(classesRepository.saveServerClassRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'server-class' }),
    ]);
    expect(childrenRepository.saveServerChildRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'server-child' }),
    ]);
    expect(childrenRepository.saveServerStaffChildRows.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'cea-1' }),
    ]);
    expect(childrenRepository.saveServerChildProgrammeEnrollmentRows.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'cpe-1' }),
    ]);
    expect(childrenRepository.saveServerChildClassMembershipRows.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'ccm-1' }),
    ]);
    expect(groupsRepository.saveServerGroupRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'server-group' }),
    ]);
    expect(groupEaAssignmentsRepository.saveServerRows.mock.calls[0][0]).toEqual([]);
    expect(groupsRepository.saveServerChildrenGroupRows.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'server-membership' }),
    ]);

    const callsInOrder = [
      ensureReferenceData,
      classesRepository.saveServerClassRows,
      childrenRepository.saveServerChildRows,
      childrenRepository.saveServerStaffChildRows,
      childrenRepository.saveServerChildProgrammeEnrollmentRows,
      childrenRepository.saveServerChildClassMembershipRows,
      groupsRepository.saveServerGroupRows,
      groupEaAssignmentsRepository.saveServerRows,
      groupsRepository.saveServerChildrenGroupRows,
    ].map((mock) => mock.mock.invocationCallOrder[0]);
    expect(callsInOrder).toEqual([...callsInOrder].sort((a, b) => a - b));
  });

  test('successful complete scopes pass relationship-specific reconcile contracts to every batch', async () => {
    renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(groupsRepository.saveServerChildrenGroupRows).toHaveBeenCalled());

    expect(childrenRepository.saveServerStaffChildRows).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'cea-1' })],
      { reconcile: {
        acknowledgedIds: ['cea-1'],
        pulledAt: expect.any(String),
        userId: 'user-1',
      } }
    );
    expect(childrenRepository.saveServerChildProgrammeEnrollmentRows).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'cpe-1' })],
      { reconcile: {
        acknowledgedIds: ['cpe-1'],
        acknowledgedAssignedChildIds: ['server-child'],
        programmeId: 'programme-a',
        pulledAt: expect.any(String),
      } }
    );
    expect(childrenRepository.saveServerChildClassMembershipRows).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'ccm-1' })],
      { reconcile: {
        acknowledgedIds: ['ccm-1'],
        acknowledgedChildIds: ['server-child'],
        pulledAt: expect.any(String),
      } }
    );
    expect(groupEaAssignmentsRepository.saveServerRows).toHaveBeenCalledWith(
      [],
      { reconcile: {
        acknowledgedGroupIds: ['server-group'],
        userId: 'user-1',
        programmeId: 'programme-a',
        pulledAt: expect.any(String),
      } }
    );
    expect(groupsRepository.saveServerChildrenGroupRows).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'server-membership' })],
      { reconcile: {
        acknowledgedIds: ['server-membership'],
        acknowledgedGroupIds: ['server-group'],
        pulledAt: expect.any(String),
      } }
    );

    const pulledAtValues = [
      childrenRepository.saveServerStaffChildRows,
      childrenRepository.saveServerChildProgrammeEnrollmentRows,
      childrenRepository.saveServerChildClassMembershipRows,
      groupEaAssignmentsRepository.saveServerRows,
      groupsRepository.saveServerChildrenGroupRows,
    ].map((mock) => mock.mock.calls[0][1].reconcile.pulledAt);
    expect(new Set(pulledAtValues)).toHaveProperty('size', 1);
  });

  test('authoritative assigned-child ids allow enrollment reconcile when the ordinary assignment query fails', async () => {
    pullPreloadedChildData.mockResolvedValueOnce(pulledBundle({
      childProgrammeEnrollments: [],
      scopeOverrides: {
        childEaAssignments: failedScope('query', { message: 'assignment query failed' }),
      },
    }));

    renderHook(() => useChildren(), { wrapper });

    await waitFor(() => {
      expect(childrenRepository.saveServerChildProgrammeEnrollmentRows).toHaveBeenCalled();
    });
    expect(childrenRepository.saveServerStaffChildRows).not.toHaveBeenCalled();
    expect(childrenRepository.saveServerChildProgrammeEnrollmentRows).toHaveBeenCalledWith([], {
      reconcile: {
        acknowledgedAssignedChildIds: [],
        acknowledgedIds: [],
        programmeId: 'programme-a',
        pulledAt: expect.any(String),
      },
    });
  });

  test('a failed membership scope does not block empty group-assignment reconcile', async () => {
    pullPreloadedChildData.mockResolvedValueOnce(pulledBundle({
      groups: [],
      groupEaAssignments: [],
      scopeOverrides: {
        childrenGroups: failedScope('query', { message: 'membership query failed' }),
      },
    }));

    renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(groupEaAssignmentsRepository.saveServerRows).toHaveBeenCalled());
    expect(groupsRepository.saveServerGroupRows).toHaveBeenCalledWith([]);
    expect(groupEaAssignmentsRepository.saveServerRows).toHaveBeenCalledWith([], {
      reconcile: {
        acknowledgedGroupIds: [],
        userId: 'user-1',
        programmeId: 'programme-a',
        pulledAt: expect.any(String),
      },
    });
    expect(groupsRepository.saveServerChildrenGroupRows).not.toHaveBeenCalled();
  });

  test('a complete authoritative snapshot permits reconcile when the ordinary assignment query is incomplete', async () => {
    const assignment = {
      id: 'cea-incomplete',
      child_id: 'server-child',
      user_id: 'user-1',
      children: { id: 'server-child', first_name: 'Server' },
    };
    pullPreloadedChildData.mockResolvedValueOnce(pulledBundle({
      childEaAssignments: [assignment],
      scopeOverrides: {
        childEaAssignments: {
          ...successfulScope([assignment]),
          complete: false,
        },
      },
    }));

    renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(childrenRepository.saveServerStaffChildRows).toHaveBeenCalled());
    expect(childrenRepository.saveServerStaffChildRows).toHaveBeenCalledWith([assignment], {
      reconcile: {
        acknowledgedIds: ['cea-incomplete'],
        pulledAt: expect.any(String),
        userId: 'user-1',
      },
    });
    expect(syncStateRepository.setPullState).not.toHaveBeenCalled();
  });

  test('a failed children scope leaves its cache visible while successful scopes still persist', async () => {
    pullPreloadedChildData.mockResolvedValueOnce(pulledBundle({
      scopeOverrides: {
        children: failedScope('transport', { message: 'network down' }),
      },
    }));

    const { result } = renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.children).toEqual([
      expect.objectContaining({ id: 'cached-child' }),
    ]);
    expect(result.current.groups).toEqual([
      expect.objectContaining({ id: 'cached-group' }),
    ]);
    expect(result.current.childrenGroups).toEqual([
      expect.objectContaining({ id: 'cached-membership' }),
    ]);
    expect(childrenRepository.saveServerChildRows).toHaveBeenCalledWith([]);
    expect(groupsRepository.saveServerGroupRows).toHaveBeenCalled();
    expect(groupsRepository.saveServerChildrenGroupRows).toHaveBeenCalled();
  });

  test('a pending child hard-delete suppresses the child and its pulled relationships', async () => {
    syncOutboxRepository.getPendingHardDeleteIds.mockResolvedValue(new Set(['child-9']));
    pullPreloadedChildData.mockResolvedValueOnce(pulledBundle({
      children: [{ id: 'child-9', first_name: 'Deleted', synced: true }],
      classes: [],
      childEaAssignments: [{ id: 'cea-9', child_id: 'child-9', user_id: 'user-1', synced: true }],
      childProgrammeEnrollments: [{ id: 'cpe-9', child_id: 'child-9', programme_id: 'programme-a', synced: true }],
      childClassMemberships: [{ id: 'ccm-9', child_id: 'child-9', class_id: 'class-1', synced: true }],
      groups: [],
      childrenGroups: [],
    }));

    const { result } = renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(syncOutboxRepository.getPendingHardDeleteIds).toHaveBeenCalledWith({
      tableName: 'children',
      ownerUserId: 'user-1',
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.children.map(row => row.id)).not.toContain('child-9');
    expect(childrenRepository.saveServerChildRows).toHaveBeenCalledWith([]);
    expect(childrenRepository.saveServerStaffChildRows.mock.calls[0][0]).toEqual([]);
    expect(childrenRepository.saveServerChildProgrammeEnrollmentRows.mock.calls[0][0]).toEqual([]);
    expect(childrenRepository.saveServerChildClassMembershipRows.mock.calls[0][0]).toEqual([]);
    expect(childrenRepository.saveServerStaffChildRows.mock.calls[0][1].reconcile)
      .toEqual(expect.objectContaining({ acknowledgedIds: ['cea-9'] }));
    expect(childrenRepository.saveServerChildProgrammeEnrollmentRows.mock.calls[0][1].reconcile)
      .toEqual(expect.objectContaining({
        acknowledgedIds: ['cpe-9'],
        acknowledgedAssignedChildIds: ['child-9'],
      }));
    expect(childrenRepository.saveServerChildClassMembershipRows.mock.calls[0][1].reconcile)
      .toEqual(expect.objectContaining({
        acknowledgedIds: ['ccm-9'],
        acknowledgedChildIds: ['child-9'],
      }));
  });

  test('deleteChild uses the repository hard-delete then archive path', async () => {
    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(result.current.children.map(child => child.id)).toContain('cached-child'));

    await act(async () => {
      await result.current.deleteChild('cached-child');
    });

    expect(childrenRepository.deleteIfNoHistory).toHaveBeenCalledWith('cached-child', expect.objectContaining({
      actorUserId: 'user-1',
    }));
    expect(childrenRepository.archiveChild).toHaveBeenCalledWith('cached-child', expect.objectContaining({
      actorUserId: 'user-1',
    }));
    expect(result.current.children.map(child => child.id)).not.toContain('cached-child');
  });

  test('addChild uses the atomic clean-slate child creation path', async () => {
    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.addChild({
        first_name: 'New',
        last_name: 'Child',
        class_id: 'class-1',
      });
    });

    expect(childrenRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      first_name: 'New',
      last_name: 'Child',
      class_id: 'class-1',
      created_by: 'user-1',
    }), expect.objectContaining({
      actorUserId: 'user-1',
    }));
  });

  test('group and membership CRUD write through the repositories directly', async () => {
    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.addGroup({ name: 'New Group', programme_id: 'programme-a' });
    });
    const groupId = groupsRepository.saveGroup.mock.calls[0]?.[0]?.id;
    expect(groupsRepository.saveGroup).toHaveBeenCalledWith(expect.objectContaining({
      name: 'New Group',
      created_by: 'user-1',
    }));

    await act(async () => {
      await result.current.updateGroup(groupId, { name: 'Renamed Group' });
      await result.current.addChildToGroup('cached-child', groupId);
      await result.current.removeChildFromGroup('cached-child', groupId);
      await result.current.deleteGroup(groupId);
    });

    expect(groupsRepository.updateGroup).toHaveBeenCalledWith(
      groupId,
      expect.objectContaining({ name: 'Renamed Group', synced: false })
    );
    expect(groupsRepository.addChildToGroup).toHaveBeenCalledWith(expect.objectContaining({
      child_id: 'cached-child',
      group_id: groupId,
      created_by: 'user-1',
    }));
    expect(groupsRepository.removeChildFromGroup).toHaveBeenCalledWith('cached-child', groupId);
    expect(groupsRepository.deleteGroup).toHaveBeenCalledWith(groupId);
  });

  test('getChildrenInGroup ignores removed memberships', async () => {
    groupsRepository.getVisibleChildrenGroups.mockResolvedValue([
      {
        id: 'removed-membership',
        child_id: 'cached-child',
        group_id: 'cached-group',
        removed_at: '2026-05-21T00:00:00.000Z',
      },
    ]);
    pullPreloadedChildData.mockResolvedValueOnce(pulledBundle());

    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(result.current.children.map(child => child.id)).toContain('cached-child'));

    expect(result.current.getChildrenInGroup('cached-group')).toEqual([]);
  });

  test('clears child state when the authenticated user disappears', async () => {
    const { rerender, result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(result.current.children.map(child => child.id)).toContain('cached-child'));

    useAuth.mockReturnValueOnce({ user: null });
    rerender();

    await waitFor(() => {
      expect(result.current.children).toEqual([]);
      expect(result.current.groups).toEqual([]);
      expect(result.current.childrenGroups).toEqual([]);
    });
  });
});
