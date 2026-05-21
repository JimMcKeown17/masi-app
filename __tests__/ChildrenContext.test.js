import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { storage } from '../src/utils/storage';
import { pullPreloadedChildData } from '../src/services/preloadedChildData';

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
  STORAGE_KEYS: {
    CHILDREN: '@children',
    GROUPS: '@groups',
    CHILDREN_GROUPS: '@children_groups',
  },
  storage: {
    getChildren: jest.fn(),
    getGroups: jest.fn(),
    getChildrenGroups: jest.fn(),
    setItem: jest.fn(),
    saveChild: jest.fn(),
    saveStaffChild: jest.fn(),
    updateChild: jest.fn(),
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
    storage.getGroups.mockResolvedValue([
      { id: 'cached-group', name: 'Cached Group', synced: false },
    ]);
    storage.getChildrenGroups.mockResolvedValue([
      { id: 'cached-membership', child_id: 'cached-child', group_id: 'cached-group', synced: false },
    ]);
    storage.setItem.mockResolvedValue(true);
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
    await waitFor(() => expect(result.current.children.map(child => child.id)).toContain('server-child'));
    expect(result.current.groups.map(group => group.id)).toContain('server-group');
    expect(result.current.childrenGroups.map(membership => membership.id)).toContain('server-membership');
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
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
