import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { OfflineProvider, useOffline } from '../src/context/OfflineContext';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { ClassesProvider, useClasses } from '../src/context/ClassesContext';
import { LookupsProvider, useLookupsContext } from '../src/context/LookupsContext';
import { TimeTrackingProvider, useTimeTracking } from '../src/context/TimeTrackingContext';
import { fetchAndCacheSchools, getSyncStatus } from '../src/services/offlineSync';
import { pullPreloadedChildData } from '../src/services/preloadedChildData';
import { enqueueSupabaseRequest } from '../src/services/supabaseRequestQueue';
import { timeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';
import { childrenRepository } from '../src/db/repositories/childrenRepository';
import { classesRepository } from '../src/db/repositories/classesRepository';
import { classEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import { groupsRepository } from '../src/db/repositories/groupsRepository';
import { groupEaAssignmentsRepository } from '../src/db/repositories/groupEaAssignmentsRepository';
import { syncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import {
  jobTitlesRepository,
  schoolsRepository,
} from '../src/db/repositories/referenceDataRepository';

jest.mock('../src/services/offlineSync', () => ({
  getSyncStatus: jest.fn(),
  fetchAndCacheSchools: jest.fn(async () => []),
  ensureReferenceData: jest.fn(async () => ({})),
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

jest.mock('../src/db/repositories/childrenRepository', () => ({
  childrenRepository: {
    getMyChildren: jest.fn(),
    saveServerChildRows: jest.fn(),
    saveServerStaffChildRows: jest.fn(),
    saveServerChildProgrammeEnrollmentRows: jest.fn(),
    saveServerChildClassMembershipRows: jest.fn(),
  },
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

jest.mock('../src/db/repositories/groupsRepository', () => ({
  groupsRepository: {
    getGroups: jest.fn(),
    getVisibleChildrenGroups: jest.fn(),
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

jest.mock('../src/services/preloadedChildData', () => ({
  PULL_SCOPE_COMPLETENESS_LIMIT: 1000,
  classifyPullFailureKind: jest.fn(() => 'query'),
  pullPreloadedChildData: jest.fn(),
}));

jest.mock('../src/db/repositories/referenceDataRepository', () => ({
  academicYearsRepository: {
    getActive: jest.fn(async () => ({ id: 'year-2026' })),
  },
  jobTitlesRepository: {
    getAll: jest.fn(),
    replaceFromServer: jest.fn(),
  },
  schoolsRepository: {
    getAll: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/domainRepositoryUtils', () => ({
  getActiveProgrammeId: jest.fn(async () => 'programme-a'),
}));

jest.mock('../src/db/repositories/repositoryRuntime', () => ({
  resolveDatabase: jest.fn(async () => ({})),
}));

jest.mock('../src/services/supabaseRequestQueue', () => ({
  enqueueSupabaseRequest: jest.fn(),
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
    childrenRepository.getMyChildren.mockResolvedValue([]);
    groupsRepository.getGroups.mockResolvedValue([]);
    groupsRepository.getVisibleChildrenGroups.mockResolvedValue([]);
    syncOutboxRepository.getPendingHardDeleteIds.mockResolvedValue(new Set());
    schoolsRepository.getAll.mockResolvedValue([]);
    classesRepository.getClasses.mockResolvedValue([]);
    jobTitlesRepository.getAll.mockResolvedValue([]);
    classesRepository.saveServerClassRows.mockResolvedValue({ applied: 0, skipped: 0 });
    classEaAssignmentsRepository.saveServerRows.mockResolvedValue({ applied: 0, skipped: 0 });
    childrenRepository.saveServerChildRows.mockResolvedValue({ applied: 0, skipped: 0 });
    childrenRepository.saveServerStaffChildRows.mockResolvedValue({ applied: 0, skipped: 0 });
    childrenRepository.saveServerChildProgrammeEnrollmentRows.mockResolvedValue({ applied: 0, skipped: 0 });
    childrenRepository.saveServerChildClassMembershipRows.mockResolvedValue({ applied: 0, skipped: 0 });
    classesRepository.saveClass.mockResolvedValue(true);
    jobTitlesRepository.replaceFromServer.mockResolvedValue(true);
    groupsRepository.saveServerGroupRows.mockResolvedValue({ applied: 0, skipped: 0 });
    groupsRepository.saveServerChildrenGroupRows.mockResolvedValue({ applied: 0, skipped: 0 });
    groupEaAssignmentsRepository.saveServerRows.mockResolvedValue({ applied: 0, skipped: 0 });
    fetchAndCacheSchools.mockResolvedValue([]);
    enqueueSupabaseRequest.mockResolvedValue({
      activeProgrammeId: 'programme-a',
      scopes: {
        programmeAssignment: {
          ok: true,
          rows: [{ programme_id: 'programme-a' }],
          complete: true,
          failureKind: null,
        },
        classes: { ok: true, rows: [], complete: true, failureKind: null },
        classEaAssignments: { ok: true, rows: [], complete: true, failureKind: null },
      },
    });
    timeEntriesRepository.getActiveTimeEntry.mockResolvedValue(null);
    timeEntriesRepository.saveTimeEntry.mockResolvedValue(true);
    timeEntriesRepository.createOpenTimeEntry.mockResolvedValue(true);
    timeEntriesRepository.updateTimeEntry.mockResolvedValue(true);
    pullPreloadedChildData.mockResolvedValue({
      activeProgrammeId: 'programme-a',
      scopes: Object.fromEntries([
        ['programmeAssignment', [{ programme_id: 'programme-a' }]],
        ['children', []],
        ['classes', []],
        ['childEaAssignments', []],
        ['childProgrammeEnrollments', []],
        ['childClassMemberships', []],
        ['groups', []],
        ['groupEaAssignments', []],
        ['childrenGroups', []],
      ].map(([name, rows]) => [name, {
        ok: true,
        rows,
        complete: true,
        failureKind: null,
      }])),
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
      expect(childrenRepository.getMyChildren).toHaveBeenCalledWith('user-1');
      expect(groupsRepository.getGroups).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(groupsRepository.getVisibleChildrenGroups).toHaveBeenCalledWith({ userId: 'user-1' });
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
      expect(childrenRepository.getMyChildren).toHaveBeenCalledWith('user-1');
      expect(groupsRepository.getGroups).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(groupsRepository.getVisibleChildrenGroups).toHaveBeenCalledWith({ userId: 'user-1' });
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
      expect(schoolsRepository.getAll).toHaveBeenCalled();
      expect(fetchAndCacheSchools).toHaveBeenCalled();
      expect(classesRepository.getClasses).toHaveBeenCalledWith({ userId: 'user-1' });
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
      expect(childrenRepository.getMyChildren).toHaveBeenCalledWith('user-1');
      expect(schoolsRepository.getAll).toHaveBeenCalled();
      expect(fetchAndCacheSchools).toHaveBeenCalled();
      expect(classesRepository.getClasses).toHaveBeenCalledWith({ userId: 'user-1' });
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
      expect(jobTitlesRepository.getAll).toHaveBeenCalled();
      expect(enqueueSupabaseRequest).toHaveBeenCalled();
      expect(jobTitlesRepository.replaceFromServer).toHaveBeenCalledWith([]);
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
      expect(jobTitlesRepository.getAll).toHaveBeenCalled();
      expect(enqueueSupabaseRequest).toHaveBeenCalled();
      expect(jobTitlesRepository.replaceFromServer).toHaveBeenCalledWith([]);
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
