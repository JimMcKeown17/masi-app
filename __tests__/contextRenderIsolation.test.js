import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { OfflineProvider, useOffline } from '../src/context/OfflineContext';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { getSyncStatus } from '../src/services/offlineSync';
import { storage } from '../src/utils/storage';
import { pullPreloadedChildData } from '../src/services/preloadedChildData';

jest.mock('../src/services/offlineSync', () => ({
  getSyncStatus: jest.fn(),
  requeueTerminalRlsFailures: jest.fn(async () => 0),
  syncAll: jest.fn(async () => ({ success: true, totalSynced: 0, totalFailed: 0 })),
}));

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(() => ({ user: { id: 'user-1' } })),
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

const statusWith = (overrides = {}) => ({
  unsyncedCount: 0,
  readyCount: 0,
  inFlightCount: 0,
  waitingCount: 0,
  needsAttentionCount: 0,
  backedOffCount: 0,
  nextRetryAt: null,
  failedCount: 0,
  failedItems: [],
  needsAttentionItems: [],
  breakdown: {},
  lastSyncTime: null,
  lastSuccessfulSyncTime: null,
  ...overrides,
});

let childrenRenders = 0;
let offlineApi = null;
let childrenApi = null;

const ChildrenProbe = () => {
  childrenApi = useChildren();
  childrenRenders += 1;
  return null;
};

const OfflineTap = () => {
  offlineApi = useOffline();
  return null;
};

describe('context render isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    childrenRenders = 0;
    offlineApi = null;
    childrenApi = null;
    getSyncStatus.mockResolvedValue(statusWith());
    storage.getChildren.mockResolvedValue([]);
    storage.getMyChildren.mockResolvedValue([]);
    storage.getGroups.mockResolvedValue([]);
    storage.getChildrenGroups.mockResolvedValue([]);
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
    pullPreloadedChildData.mockResolvedValue({
      children: [],
      classes: [],
      childEaAssignments: [],
      childProgrammeEnrollments: [],
      childClassMemberships: [],
      groups: [],
      childrenGroups: [],
      errors: [],
    });
  });

  test('ChildrenProvider mounts and completes hydration without throwing', async () => {
    expect(() => render(
      <OfflineProvider>
        <ChildrenProvider>
          <ChildrenProbe />
        </ChildrenProvider>
      </OfflineProvider>
    )).not.toThrow();

    await waitFor(() => {
      expect(storage.getMyChildren).toHaveBeenCalledWith('user-1');
      expect(storage.getGroups).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(storage.getChildrenGroups).toHaveBeenCalled();
      expect(pullPreloadedChildData).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(childrenApi.loading).toBe(false);
    });
  });

  test('an Offline status change does not re-render Children consumers', async () => {
    render(
      <OfflineProvider>
        <ChildrenProvider>
          <OfflineTap />
          <ChildrenProbe />
        </ChildrenProvider>
      </OfflineProvider>
    );
    await waitFor(() => {
      expect(getSyncStatus).toHaveBeenCalled();
      expect(storage.getMyChildren).toHaveBeenCalledWith('user-1');
      expect(storage.getGroups).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(storage.getChildrenGroups).toHaveBeenCalled();
      expect(pullPreloadedChildData).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(childrenApi.loading).toBe(false);
    });
    const rendersAfterSettle = childrenRenders;

    getSyncStatus.mockResolvedValue(statusWith({
      unsyncedCount: 5,
      readyCount: 5,
      waitingCount: 5,
      breakdown: { sessions: 5 },
    }));
    await act(async () => {
      await offlineApi.refreshSyncStatus({ autoTrigger: false });
    });

    expect(childrenRenders).toBe(rendersAfterSettle);
  });
});
