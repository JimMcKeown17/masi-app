import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { pullPreloadedChildData } from '../src/services/preloadedChildData';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { childrenRepository } from '../src/db/repositories/childrenRepository';
import { classesRepository } from '../src/db/repositories/classesRepository';
import { groupsRepository } from '../src/db/repositories/groupsRepository';
import { syncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
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
    getUnsyncedChildren: jest.fn(),
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
    getChildrenGroups: jest.fn(),
    getUnsyncedGroups: jest.fn(),
    getUnsyncedChildrenGroups: jest.fn(),
    saveGroup: jest.fn(),
    updateGroup: jest.fn(),
    deleteGroup: jest.fn(),
    addChildToGroup: jest.fn(),
    removeChildFromGroup: jest.fn(),
    saveServerGroupRows: jest.fn(),
    saveServerChildrenGroupRows: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/syncOutboxRepository', () => ({
  syncOutboxRepository: {
    getPendingHardDeleteIds: jest.fn(),
  },
}));

const wrapper = ({ children }) => (
  <ChildrenProvider>{children}</ChildrenProvider>
);

describe('ChildrenContext Plan 5 hydration', () => {
  beforeEach(() => {
    ensureReferenceData.mockResolvedValue({});
    childrenRepository.getMyChildren.mockResolvedValue([
      { id: 'cached-child', first_name: 'Cached', last_name: 'Child', synced: false },
    ]);
    childrenRepository.getChildren.mockResolvedValue([
      { id: 'cached-child', first_name: 'Cached', last_name: 'Child', synced: false },
    ]);
    childrenRepository.getUnsyncedChildren.mockResolvedValue([]);
    childrenRepository.save.mockResolvedValue(true);
    childrenRepository.updateChild.mockResolvedValue(true);
    childrenRepository.deleteIfNoHistory.mockResolvedValue(false);
    childrenRepository.archiveChild.mockResolvedValue(true);
    groupsRepository.getGroups.mockResolvedValue([
      { id: 'cached-group', name: 'Cached Group', synced: false },
    ]);
    groupsRepository.getChildrenGroups.mockResolvedValue([
      { id: 'cached-membership', child_id: 'cached-child', group_id: 'cached-group', synced: false },
    ]);
    groupsRepository.getUnsyncedGroups.mockResolvedValue([]);
    groupsRepository.getUnsyncedChildrenGroups.mockResolvedValue([]);
    groupsRepository.saveGroup.mockResolvedValue(true);
    groupsRepository.updateGroup.mockResolvedValue(true);
    groupsRepository.deleteGroup.mockResolvedValue(true);
    groupsRepository.addChildToGroup.mockResolvedValue(true);
    groupsRepository.removeChildFromGroup.mockResolvedValue(true);
    syncOutboxRepository.getPendingHardDeleteIds.mockResolvedValue(new Set());
    classesRepository.saveServerClassRows.mockResolvedValue({ applied: 0, skipped: 0 });
    childrenRepository.saveServerChildRows.mockResolvedValue({ applied: 0, skipped: 0 });
    childrenRepository.saveServerStaffChildRows.mockResolvedValue({ applied: 0, skipped: 0 });
    childrenRepository.saveServerChildProgrammeEnrollmentRows.mockResolvedValue({ applied: 0, skipped: 0 });
    childrenRepository.saveServerChildClassMembershipRows.mockResolvedValue({ applied: 0, skipped: 0 });
    groupsRepository.saveServerGroupRows.mockResolvedValue({ applied: 0, skipped: 0 });
    groupsRepository.saveServerChildrenGroupRows.mockResolvedValue({ applied: 0, skipped: 0 });
    pullPreloadedChildData.mockResolvedValue({
      children: [{ id: 'server-child', first_name: 'Server', last_name: 'Child', synced: true }],
      classes: [{ id: 'server-class', name: 'Server Class', synced: true }],
      childEaAssignments: [{ id: 'cea-1', child_id: 'server-child', user_id: 'user-1', synced: true }],
      childProgrammeEnrollments: [{ id: 'cpe-1', child_id: 'server-child', programme_id: 'programme-a', synced: true }],
      childClassMemberships: [{ id: 'ccm-1', child_id: 'server-child', class_id: 'server-class', synced: true }],
      groups: [{ id: 'server-group', name: 'Server Group', synced: true }],
      childrenGroups: [{ id: 'server-membership', child_id: 'server-child', group_id: 'server-group', synced: true }],
      errors: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('mount performs one preloaded child-data pull and distributes the result', async () => {
    const { result } = renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(pullPreloadedChildData).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
    }));
    expect(childrenRepository.getMyChildren).toHaveBeenCalledWith('user-1');
    expect(groupsRepository.getGroups).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
    await waitFor(() => expect(result.current.children.map(child => child.id)).toContain('server-child'));
    expect(result.current.groups.map(group => group.id)).toContain('server-group');
    expect(result.current.childrenGroups.map(membership => membership.id)).toContain('server-membership');
    expect(childrenRepository.saveServerChildRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'server-child' }),
    ]);
    expect(classesRepository.saveServerClassRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'server-class' }),
    ]);
    expect(childrenRepository.saveServerStaffChildRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'cea-1' }),
    ]);
    expect(childrenRepository.saveServerChildProgrammeEnrollmentRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'cpe-1' }),
    ]);
    expect(childrenRepository.saveServerChildClassMembershipRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'ccm-1' }),
    ]);
    expect(groupsRepository.saveServerGroupRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'server-group' }),
    ]);
    expect(groupsRepository.saveServerChildrenGroupRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'server-membership' }),
    ]);
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
    childrenRepository.getMyChildren.mockResolvedValueOnce([
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
    expect(childrenRepository.saveServerStaffChildRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'cea-1' }),
    ]);
    expect(childrenRepository.saveServerChildProgrammeEnrollmentRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'cpe-1' }),
    ]);
    expect(childrenRepository.saveServerChildClassMembershipRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'ccm-1' }),
    ]);
    expect(groupsRepository.saveServerGroupRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'server-group' }),
    ]);
    expect(groupsRepository.saveServerChildrenGroupRows).toHaveBeenCalledWith([
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
      groupsRepository.saveServerChildrenGroupRows,
    ].map((mock) => mock.mock.invocationCallOrder[0]);
    expect(callsInOrder).toEqual([...callsInOrder].sort((a, b) => a - b));
  });

  test('partial preload failure keeps cached child, group, and membership lists visible', async () => {
    pullPreloadedChildData.mockResolvedValueOnce({
      children: [],
      groups: [],
      childrenGroups: [],
      errors: [{ scope: 'children', message: 'network down' }],
    });

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
    expect(childrenRepository.saveServerChildRows).not.toHaveBeenCalled();
    expect(groupsRepository.saveServerGroupRows).not.toHaveBeenCalled();
    expect(groupsRepository.saveServerChildrenGroupRows).not.toHaveBeenCalled();
  });

  test('successful preload drops synced local rows that disappeared from the server but keeps dirty local rows', async () => {
    childrenRepository.getMyChildren.mockResolvedValueOnce([
      { id: 'synced-stale-child', first_name: 'Stale', synced: true, sync_status: 'synced' },
      { id: 'pending-child', first_name: 'Pending', synced: false, sync_status: 'pending' },
      { id: 'failed-child', first_name: 'Failed', synced: false, sync_status: 'failed' },
      { id: 'terminal-child', first_name: 'Terminal', synced: false, sync_status: 'terminal' },
    ]);
    groupsRepository.getGroups.mockResolvedValueOnce([
      { id: 'synced-stale-group', name: 'Stale Group', synced: true, sync_status: 'synced' },
      { id: 'pending-group', name: 'Pending Group', synced: false, sync_status: 'pending' },
    ]);
    groupsRepository.getChildrenGroups.mockResolvedValueOnce([
      { id: 'synced-stale-membership', child_id: 'synced-stale-child', group_id: 'synced-stale-group', synced: true, sync_status: 'synced' },
      { id: 'pending-membership', child_id: 'pending-child', group_id: 'pending-group', synced: false, sync_status: 'pending' },
    ]);
    pullPreloadedChildData.mockResolvedValueOnce({
      children: [{ id: 'server-child', first_name: 'Server', synced: true, sync_status: 'synced' }],
      classes: [],
      childEaAssignments: [],
      childProgrammeEnrollments: [],
      childClassMemberships: [],
      groups: [{ id: 'server-group', name: 'Server Group', synced: true, sync_status: 'synced' }],
      childrenGroups: [{ id: 'server-membership', child_id: 'server-child', group_id: 'server-group', synced: true, sync_status: 'synced' }],
      errors: [],
    });

    const { result } = renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(result.current.children.map(child => child.id)).toContain('server-child'));

    expect(result.current.children.map(child => child.id).sort()).toEqual([
      'failed-child',
      'pending-child',
      'server-child',
      'terminal-child',
    ]);
    expect(result.current.groups.map(group => group.id).sort()).toEqual([
      'pending-group',
      'server-group',
    ]);
    expect(result.current.childrenGroups.map(membership => membership.id).sort()).toEqual([
      'pending-membership',
      'server-membership',
    ]);
  });

  test('a pending local edit whose id exists on the server survives the pull in UI state (pending-local-wins)', async () => {
    childrenRepository.getMyChildren.mockResolvedValueOnce([
      { id: 'shared-child', first_name: 'Edited Locally', synced: false, sync_status: 'pending' },
    ]);
    groupsRepository.getGroups.mockResolvedValueOnce([
      { id: 'shared-group', name: 'Renamed Locally', synced: false, sync_status: 'pending' },
    ]);
    groupsRepository.getChildrenGroups.mockResolvedValueOnce([]);
    pullPreloadedChildData.mockResolvedValueOnce({
      children: [{ id: 'shared-child', first_name: 'Stale Server', synced: true, sync_status: 'synced' }],
      classes: [],
      childEaAssignments: [],
      childProgrammeEnrollments: [],
      childClassMemberships: [],
      groups: [{ id: 'shared-group', name: 'Stale Server Group', synced: true, sync_status: 'synced' }],
      childrenGroups: [],
      errors: [],
    });

    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));

    await waitFor(() => {
      const child = result.current.children.find(row => row.id === 'shared-child');
      expect(child.first_name).toBe('Edited Locally');
      expect(child.synced).toBe(false);
    });
    expect(result.current.children.filter(row => row.id === 'shared-child')).toHaveLength(1);
    const group = result.current.groups.find(row => row.id === 'shared-group');
    expect(group.name).toBe('Renamed Locally');
    expect(result.current.groups.filter(row => row.id === 'shared-group')).toHaveLength(1);
  });

  test('a pending edit still wins when the cached row carries a stale sync_status from the facade payload', async () => {
    // The legacy facade payload can hold sync_status 'synced' from pull time while a
    // later offline edit only overlays synced: false — the merge must trust the
    // dirty signal, not the stale status (Codex P2 on issue #42).
    childrenRepository.getMyChildren.mockResolvedValueOnce([
      { id: 'shared-child', first_name: 'Edited Locally', synced: false, sync_status: 'synced' },
    ]);
    groupsRepository.getGroups.mockResolvedValueOnce([]);
    groupsRepository.getChildrenGroups.mockResolvedValueOnce([]);
    pullPreloadedChildData.mockResolvedValueOnce({
      children: [{ id: 'shared-child', first_name: 'Stale Server', synced: true, sync_status: 'synced' }],
      classes: [],
      childEaAssignments: [],
      childProgrammeEnrollments: [],
      childClassMemberships: [],
      groups: [],
      childrenGroups: [],
      errors: [],
    });

    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));

    await waitFor(() => {
      const child = result.current.children.find(row => row.id === 'shared-child');
      expect(child.first_name).toBe('Edited Locally');
    });
    expect(result.current.children.filter(row => row.id === 'shared-child')).toHaveLength(1);
  });

  test('a membership removed offline does not resurrect in UI state when a pull still returns it', async () => {
    // The active-only cache read hides the tombstone (removed_at set), so the
    // merge must learn about it from the unfiltered unsynced read and suppress
    // the server copy instead of resurrecting the membership (Codex P2 #2).
    groupsRepository.getChildrenGroups.mockResolvedValueOnce([]);
    groupsRepository.getUnsyncedChildrenGroups.mockResolvedValueOnce([
      {
        id: 'removed-membership',
        child_id: 'cached-child',
        group_id: 'cached-group',
        removed_at: '2026-07-04T08:00:00.000Z',
        synced: false,
        sync_status: 'pending',
      },
    ]);
    pullPreloadedChildData.mockResolvedValueOnce({
      children: [],
      classes: [],
      childEaAssignments: [],
      childProgrammeEnrollments: [],
      childClassMemberships: [],
      groups: [],
      childrenGroups: [
        { id: 'removed-membership', child_id: 'cached-child', group_id: 'cached-group', synced: true, sync_status: 'synced' },
      ],
      errors: [],
    });

    const { result } = renderHook(() => useChildren(), { wrapper });

    // Anchor on the pull having been fully applied (saves precede the state
    // update, which precedes loading=false) so the negative assertion below
    // cannot pass vacuously before the merge lands.
    await waitFor(() => expect(groupsRepository.saveServerChildrenGroupRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'removed-membership' }),
    ]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.childrenGroups.map(row => row.id)).not.toContain('removed-membership');
  });

  test('a pending child hard-delete suppresses the child and its pulled relationships', async () => {
    syncOutboxRepository.getPendingHardDeleteIds.mockResolvedValue(new Set(['child-9']));
    pullPreloadedChildData.mockResolvedValueOnce({
      children: [{ id: 'child-9', first_name: 'Deleted', synced: true }],
      classes: [],
      childEaAssignments: [{ id: 'cea-9', child_id: 'child-9', user_id: 'user-1', synced: true }],
      childProgrammeEnrollments: [{ id: 'cpe-9', child_id: 'child-9', programme_id: 'programme-a', synced: true }],
      childClassMemberships: [{ id: 'ccm-9', child_id: 'child-9', class_id: 'class-1', synced: true }],
      groups: [],
      childrenGroups: [],
      errors: [],
    });

    const { result } = renderHook(() => useChildren(), { wrapper });

    await waitFor(() => expect(syncOutboxRepository.getPendingHardDeleteIds).toHaveBeenCalledWith({
      tableName: 'children',
      ownerUserId: 'user-1',
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.children.map(row => row.id)).not.toContain('child-9');
    expect(childrenRepository.saveServerChildRows).toHaveBeenCalledWith([]);
    expect(childrenRepository.saveServerStaffChildRows).toHaveBeenCalledWith([]);
    expect(childrenRepository.saveServerChildProgrammeEnrollmentRows).toHaveBeenCalledWith([]);
    expect(childrenRepository.saveServerChildClassMembershipRows).toHaveBeenCalledWith([]);
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
    groupsRepository.getChildrenGroups.mockResolvedValueOnce([
      {
        id: 'removed-membership',
        child_id: 'cached-child',
        group_id: 'cached-group',
        removed_at: '2026-05-21T00:00:00.000Z',
      },
    ]);
    pullPreloadedChildData.mockResolvedValueOnce({
      children: [],
      groups: [],
      childrenGroups: [],
      errors: [],
    });

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
