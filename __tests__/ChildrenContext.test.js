import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { storage } from '../src/utils/storage';
import { pullPreloadedChildData } from '../src/services/preloadedChildData';
import { useAuth } from '../src/context/AuthContext';

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

jest.mock('../src/utils/storage', () => ({
  storage: {
    getChildren: jest.fn(),
    getMyChildren: jest.fn(),
    getGroups: jest.fn(),
    getChildrenGroups: jest.fn(),
    getUnsyncedChildren: jest.fn(),
    getUnsyncedGroups: jest.fn(),
    getUnsyncedChildrenGroups: jest.fn(),
    saveChild: jest.fn(),
    createChild: jest.fn(),
    saveStaffChild: jest.fn(),
    saveChildProgrammeEnrollment: jest.fn(),
    saveChildClassMembership: jest.fn(),
    saveClass: jest.fn(),
    updateChild: jest.fn(),
    deleteChild: jest.fn(),
    saveGroup: jest.fn(),
    updateGroup: jest.fn(),
    deleteGroup: jest.fn(),
    saveChildrenGroup: jest.fn(),
    deleteChildrenGroup: jest.fn(),
  },
}));

jest.mock('../src/services/preloadedChildData', () => ({
  pullPreloadedChildData: jest.fn(),
}));

const wrapper = ({ children }) => (
  <ChildrenProvider>{children}</ChildrenProvider>
);

describe('ChildrenContext Plan 5 hydration', () => {
  beforeEach(() => {
    storage.getChildren.mockResolvedValue([
      { id: 'cached-child', first_name: 'Cached', last_name: 'Child', synced: false },
    ]);
    storage.getMyChildren.mockResolvedValue([
      { id: 'cached-child', first_name: 'Cached', last_name: 'Child', synced: false },
    ]);
    storage.getGroups.mockResolvedValue([
      { id: 'cached-group', name: 'Cached Group', synced: false },
    ]);
    storage.getChildrenGroups.mockResolvedValue([
      { id: 'cached-membership', child_id: 'cached-child', group_id: 'cached-group', synced: false },
    ]);
    storage.getUnsyncedChildren.mockResolvedValue([]);
    storage.getUnsyncedGroups.mockResolvedValue([]);
    storage.getUnsyncedChildrenGroups.mockResolvedValue([]);
    storage.saveChild.mockResolvedValue(true);
    storage.createChild.mockResolvedValue(true);
    storage.saveStaffChild.mockResolvedValue(true);
    storage.saveChildProgrammeEnrollment.mockResolvedValue(true);
    storage.saveChildClassMembership.mockResolvedValue(true);
    storage.saveClass.mockResolvedValue(true);
    storage.saveGroup.mockResolvedValue(true);
    storage.saveChildrenGroup.mockResolvedValue(true);
    storage.deleteChild.mockResolvedValue({ deleted: false, archived: true });
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

    expect(pullPreloadedChildData).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
    }));
    expect(storage.getMyChildren).toHaveBeenCalledWith('user-1');
    expect(storage.getGroups).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
    await waitFor(() => expect(result.current.children.map(child => child.id)).toContain('server-child'));
    expect(result.current.groups.map(group => group.id)).toContain('server-group');
    expect(result.current.childrenGroups.map(membership => membership.id)).toContain('server-membership');
    expect(storage.saveChild).toHaveBeenCalledWith(expect.objectContaining({ id: 'server-child' }));
    expect(storage.saveClass).toHaveBeenCalledWith(expect.objectContaining({ id: 'server-class' }));
    expect(storage.saveStaffChild).toHaveBeenCalledWith(expect.objectContaining({ id: 'cea-1' }));
    expect(storage.saveChildProgrammeEnrollment).toHaveBeenCalledWith(expect.objectContaining({ id: 'cpe-1' }));
    expect(storage.saveChildClassMembership).toHaveBeenCalledWith(expect.objectContaining({ id: 'ccm-1' }));
    expect(storage.saveGroup).toHaveBeenCalledWith(expect.objectContaining({ id: 'server-group' }));
    expect(storage.saveChildrenGroup).toHaveBeenCalledWith(expect.objectContaining({ id: 'server-membership' }));
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

    expect(result.current.children).toEqual([
      expect.objectContaining({ id: 'cached-child' }),
    ]);
    expect(result.current.groups).toEqual([
      expect.objectContaining({ id: 'cached-group' }),
    ]);
    expect(result.current.childrenGroups).toEqual([
      expect.objectContaining({ id: 'cached-membership' }),
    ]);
    expect(storage.saveChild).not.toHaveBeenCalled();
    expect(storage.saveGroup).not.toHaveBeenCalled();
    expect(storage.saveChildrenGroup).not.toHaveBeenCalled();
  });

  test('successful preload drops synced local rows that disappeared from the server but keeps dirty local rows', async () => {
    storage.getMyChildren.mockResolvedValueOnce([
      { id: 'synced-stale-child', first_name: 'Stale', synced: true, sync_status: 'synced' },
      { id: 'pending-child', first_name: 'Pending', synced: false, sync_status: 'pending' },
      { id: 'failed-child', first_name: 'Failed', synced: false, sync_status: 'failed' },
      { id: 'terminal-child', first_name: 'Terminal', synced: false, sync_status: 'terminal' },
    ]);
    storage.getGroups.mockResolvedValueOnce([
      { id: 'synced-stale-group', name: 'Stale Group', synced: true, sync_status: 'synced' },
      { id: 'pending-group', name: 'Pending Group', synced: false, sync_status: 'pending' },
    ]);
    storage.getChildrenGroups.mockResolvedValueOnce([
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
    storage.getMyChildren.mockResolvedValueOnce([
      { id: 'shared-child', first_name: 'Edited Locally', synced: false, sync_status: 'pending' },
    ]);
    storage.getGroups.mockResolvedValueOnce([
      { id: 'shared-group', name: 'Renamed Locally', synced: false, sync_status: 'pending' },
    ]);
    storage.getChildrenGroups.mockResolvedValueOnce([]);
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
    storage.getMyChildren.mockResolvedValueOnce([
      { id: 'shared-child', first_name: 'Edited Locally', synced: false, sync_status: 'synced' },
    ]);
    storage.getGroups.mockResolvedValueOnce([]);
    storage.getChildrenGroups.mockResolvedValueOnce([]);
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
    storage.getChildrenGroups.mockResolvedValueOnce([]);
    storage.getUnsyncedChildrenGroups.mockResolvedValueOnce([
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
    await waitFor(() => expect(storage.saveChildrenGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'removed-membership' })
    ));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.childrenGroups.map(row => row.id)).not.toContain('removed-membership');
  });

  test('deleteChild uses repository-backed delete/archive instead of hidden_at update', async () => {
    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(result.current.children.map(child => child.id)).toContain('cached-child'));

    await act(async () => {
      await result.current.deleteChild('cached-child');
    });

    expect(storage.deleteChild).toHaveBeenCalledWith('cached-child', expect.objectContaining({
      actorUserId: 'user-1',
    }));
    expect(storage.updateChild).not.toHaveBeenCalled();
    expect(result.current.children.map(child => child.id)).not.toContain('cached-child');
  });

  test('addChild uses the atomic clean-slate child creation path', async () => {
    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(pullPreloadedChildData).toHaveBeenCalledTimes(1));
    storage.saveStaffChild.mockClear();

    await act(async () => {
      await result.current.addChild({
        first_name: 'New',
        last_name: 'Child',
        class_id: 'class-1',
      });
    });

    expect(storage.createChild).toHaveBeenCalledWith(expect.objectContaining({
      first_name: 'New',
      last_name: 'Child',
      class_id: 'class-1',
      created_by: 'user-1',
    }), expect.objectContaining({
      actorUserId: 'user-1',
    }));
    expect(storage.saveStaffChild).not.toHaveBeenCalled();
  });

  test('getChildrenInGroup ignores removed memberships', async () => {
    storage.getChildrenGroups.mockResolvedValueOnce([
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
