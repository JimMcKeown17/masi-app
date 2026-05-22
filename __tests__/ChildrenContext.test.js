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
    saveChild: jest.fn(),
    createChild: jest.fn(),
    saveStaffChild: jest.fn(),
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
    storage.saveChild.mockResolvedValue(true);
    storage.createChild.mockResolvedValue(true);
    storage.saveGroup.mockResolvedValue(true);
    storage.saveChildrenGroup.mockResolvedValue(true);
    storage.deleteChild.mockResolvedValue({ deleted: false, archived: true });
    pullPreloadedChildData.mockResolvedValue({
      children: [{ id: 'server-child', first_name: 'Server', last_name: 'Child', synced: true }],
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
