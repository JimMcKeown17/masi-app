import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { OfflineProvider, useOffline } from '../src/context/OfflineContext';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { ClassesProvider, useClasses } from '../src/context/ClassesContext';
import { LookupsProvider, useLookupsContext } from '../src/context/LookupsContext';
import { TimeTrackingProvider, useTimeTracking } from '../src/context/TimeTrackingContext';
import { fetchAndCacheSchools, getSyncStatus } from '../src/services/offlineSync';
import { storage } from '../src/utils/storage';
import { pullPreloadedChildData } from '../src/services/preloadedChildData';
import { enqueueSupabaseRequest } from '../src/services/supabaseRequestQueue';
import { timeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';

jest.mock('../src/services/offlineSync', () => ({
  getSyncStatus: jest.fn(),
  fetchAndCacheSchools: jest.fn(async () => []),
  requeueTerminalRlsFailures: jest.fn(async () => 0),
  syncAll: jest.fn(async () => ({ success: true, totalSynced: 0, totalFailed: 0 })),
}));

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
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
    getSchools: jest.fn(),
    getClasses: jest.fn(),
    getUnsyncedClasses: jest.fn(),
    getJobTitles: jest.fn(),
    saveChild: jest.fn(),
    createChild: jest.fn(),
    saveStaffChild: jest.fn(),
    saveChildProgrammeEnrollment: jest.fn(),
    saveChildClassMembership: jest.fn(),
    saveClass: jest.fn(),
    saveClassEaAssignment: jest.fn(),
    updateClass: jest.fn(),
    deleteClass: jest.fn(),
    saveJobTitles: jest.fn(),
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

jest.mock('../src/db/repositories/referenceDataRepository', () => ({
  academicYearsRepository: {
    getActive: jest.fn(async () => ({ id: 'year-2026' })),
  },
}));

jest.mock('../src/db/repositories/domainRepositoryUtils', () => ({
  getActiveProgrammeId: jest.fn(async () => 'programme-a'),
}));

jest.mock('../src/db/repositories/repositoryRuntime', () => ({
  resolveDatabase: jest.fn(async () => ({})),
}));

jest.mock('../src/services/supabaseRequestQueue', () => ({
  enqueueSupabaseRequest: jest.fn(async () => ({ data: [], error: null })),
}));

jest.mock('../src/services/locationService', () => ({
  getCurrentPosition: jest.fn(),
}));

jest.mock('../src/db/repositories/timeEntriesRepository', () => ({
  OPEN_TIME_ENTRY_EXISTS: 'OPEN_TIME_ENTRY_EXISTS',
  timeEntriesRepository: {
    getActiveTimeEntry: jest.fn(),
    saveTimeEntry: jest.fn(),
    createOpenTimeEntry: jest.fn(),
    updateTimeEntry: jest.fn(),
  },
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
let classesRenders = 0;
let lookupsRenders = 0;
let timeTrackingRenders = 0;
let offlineApi = null;
let childrenApi = null;
let classesApi = null;
let lookupsApi = null;
let timeTrackingApi = null;

const ChildrenProbe = () => {
  childrenApi = useChildren();
  childrenRenders += 1;
  return null;
};

const OfflineTap = () => {
  offlineApi = useOffline();
  return null;
};

const ClassesProbe = () => {
  classesApi = useClasses();
  classesRenders += 1;
  return null;
};

const LookupsProbe = () => {
  lookupsApi = useLookupsContext();
  lookupsRenders += 1;
  return null;
};

const TimeTrackingProbe = () => {
  timeTrackingApi = useTimeTracking();
  timeTrackingRenders += 1;
  return null;
};

describe('context render isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    childrenRenders = 0;
    classesRenders = 0;
    lookupsRenders = 0;
    timeTrackingRenders = 0;
    offlineApi = null;
    childrenApi = null;
    classesApi = null;
    lookupsApi = null;
    timeTrackingApi = null;
    getSyncStatus.mockResolvedValue(statusWith());
    storage.getChildren.mockResolvedValue([]);
    storage.getMyChildren.mockResolvedValue([]);
    storage.getGroups.mockResolvedValue([]);
    storage.getChildrenGroups.mockResolvedValue([]);
    storage.getUnsyncedChildren.mockResolvedValue([]);
    storage.getUnsyncedGroups.mockResolvedValue([]);
    storage.getUnsyncedChildrenGroups.mockResolvedValue([]);
    storage.getSchools.mockResolvedValue([]);
    storage.getClasses.mockResolvedValue([]);
    storage.getUnsyncedClasses.mockResolvedValue([]);
    storage.getJobTitles.mockResolvedValue([]);
    storage.saveChild.mockResolvedValue(true);
    storage.createChild.mockResolvedValue(true);
    storage.saveStaffChild.mockResolvedValue(true);
    storage.saveChildProgrammeEnrollment.mockResolvedValue(true);
    storage.saveChildClassMembership.mockResolvedValue(true);
    storage.saveClass.mockResolvedValue(true);
    storage.saveClassEaAssignment.mockResolvedValue(true);
    storage.saveJobTitles.mockResolvedValue(true);
    storage.saveGroup.mockResolvedValue(true);
    storage.saveChildrenGroup.mockResolvedValue(true);
    fetchAndCacheSchools.mockResolvedValue([]);
    enqueueSupabaseRequest.mockResolvedValue({ data: [], error: null });
    timeEntriesRepository.getActiveTimeEntry.mockResolvedValue(null);
    timeEntriesRepository.saveTimeEntry.mockResolvedValue(true);
    timeEntriesRepository.createOpenTimeEntry.mockResolvedValue(true);
    timeEntriesRepository.updateTimeEntry.mockResolvedValue(true);
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

  test('ClassesProvider mounts and completes hydration without throwing', async () => {
    expect(() => render(
      <OfflineProvider>
        <ChildrenProvider>
          <ClassesProvider>
            <ClassesProbe />
          </ClassesProvider>
        </ChildrenProvider>
      </OfflineProvider>
    )).not.toThrow();

    await waitFor(() => {
      expect(storage.getSchools).toHaveBeenCalled();
      expect(fetchAndCacheSchools).toHaveBeenCalled();
      expect(storage.getClasses).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(storage.getUnsyncedClasses).toHaveBeenCalled();
      expect(classesApi.loading).toBe(false);
    });
  });

  test('an Offline status change does not re-render Classes consumers', async () => {
    render(
      <OfflineProvider>
        <ChildrenProvider>
          <ClassesProvider>
            <OfflineTap />
            <ClassesProbe />
          </ClassesProvider>
        </ChildrenProvider>
      </OfflineProvider>
    );
    await waitFor(() => {
      expect(getSyncStatus).toHaveBeenCalled();
      expect(storage.getMyChildren).toHaveBeenCalledWith('user-1');
      expect(storage.getSchools).toHaveBeenCalled();
      expect(fetchAndCacheSchools).toHaveBeenCalled();
      expect(storage.getClasses).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(storage.getUnsyncedClasses).toHaveBeenCalled();
      expect(classesApi.loading).toBe(false);
    });
    const rendersAfterSettle = classesRenders;

    getSyncStatus.mockResolvedValue(statusWith({
      unsyncedCount: 7,
      readyCount: 7,
      waitingCount: 7,
      breakdown: { sessions: 7 },
    }));
    await act(async () => {
      await offlineApi.refreshSyncStatus({ autoTrigger: false });
    });

    expect(classesRenders).toBe(rendersAfterSettle);
  });

  test('LookupsProvider mounts and completes hydration without throwing', async () => {
    expect(() => render(
      <OfflineProvider>
        <LookupsProvider>
          <LookupsProbe />
        </LookupsProvider>
      </OfflineProvider>
    )).not.toThrow();

    await waitFor(() => {
      expect(storage.getJobTitles).toHaveBeenCalled();
      expect(enqueueSupabaseRequest).toHaveBeenCalled();
      expect(storage.saveJobTitles).toHaveBeenCalledWith([]);
      expect(lookupsApi.loading).toBe(false);
    });
  });

  test('an Offline status change does not re-render Lookups consumers', async () => {
    render(
      <OfflineProvider>
        <LookupsProvider>
          <OfflineTap />
          <LookupsProbe />
        </LookupsProvider>
      </OfflineProvider>
    );
    await waitFor(() => {
      expect(getSyncStatus).toHaveBeenCalled();
      expect(storage.getJobTitles).toHaveBeenCalled();
      expect(enqueueSupabaseRequest).toHaveBeenCalled();
      expect(storage.saveJobTitles).toHaveBeenCalledWith([]);
      expect(lookupsApi.loading).toBe(false);
    });
    const rendersAfterSettle = lookupsRenders;

    getSyncStatus.mockResolvedValue(statusWith({
      unsyncedCount: 4,
      readyCount: 4,
      waitingCount: 4,
      breakdown: { sessions: 4 },
    }));
    await act(async () => {
      await offlineApi.refreshSyncStatus({ autoTrigger: false });
    });

    expect(lookupsRenders).toBe(rendersAfterSettle);
  });

  test('an Offline status change does not re-render TimeTracking consumers', async () => {
    render(
      <OfflineProvider>
        <TimeTrackingProvider>
          <OfflineTap />
          <TimeTrackingProbe />
        </TimeTrackingProvider>
      </OfflineProvider>
    );
    await waitFor(() => {
      expect(getSyncStatus).toHaveBeenCalled();
      expect(timeEntriesRepository.getActiveTimeEntry).toHaveBeenCalledWith('user-1');
      expect(timeTrackingApi.activeEntry).toBeNull();
      expect(timeTrackingApi.isSignedIn).toBe(false);
    });
    const rendersAfterSettle = timeTrackingRenders;

    getSyncStatus.mockResolvedValue(statusWith({
      unsyncedCount: 6,
      readyCount: 6,
      waitingCount: 6,
      breakdown: { time_entries: 6 },
    }));
    await act(async () => {
      await offlineApi.refreshSyncStatus({ autoTrigger: false });
    });

    expect(timeTrackingRenders).toBe(rendersAfterSettle);
  });
});
