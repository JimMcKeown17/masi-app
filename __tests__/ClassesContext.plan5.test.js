import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ClassesProvider, useClasses } from '../src/context/ClassesContext';
import { storage } from '../src/utils/storage';
import { academicYearsRepository } from '../src/db/repositories/referenceDataRepository';
import { getActiveProgrammeId } from '../src/db/repositories/domainRepositoryUtils';
import { resolveDatabase } from '../src/db/repositories/repositoryRuntime';
import { fetchAndCacheSchools } from '../src/services/offlineSync';
import { useChildren } from '../src/context/ChildrenContext';

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
  })),
}));

jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: jest.fn(),
}));

jest.mock('../src/services/offlineSync', () => ({
  fetchAndCacheSchools: jest.fn(),
}));

jest.mock('../src/db/repositories/referenceDataRepository', () => ({
  academicYearsRepository: {
    getActive: jest.fn(),
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

jest.mock('../src/utils/storage', () => ({
  storage: {
    getSchools: jest.fn(),
    getClasses: jest.fn(),
    getUnsyncedClasses: jest.fn(),
    saveClass: jest.fn(),
    saveClassEaAssignment: jest.fn(),
    updateClass: jest.fn(),
    deleteClass: jest.fn(),
    updateChild: jest.fn(),
  },
}));

const wrapper = ({ children }) => (
  <ClassesProvider>{children}</ClassesProvider>
);

describe('ClassesContext Plan 5 behavior', () => {
  const updateChild = jest.fn();

  beforeEach(() => {
    useChildren.mockReturnValue({
      children: [],
      updateChild,
    });
    storage.getSchools.mockResolvedValue([]);
    storage.getClasses.mockResolvedValue([]);
    storage.getUnsyncedClasses.mockResolvedValue([]);
    storage.saveClass.mockResolvedValue(true);
    storage.saveClassEaAssignment.mockResolvedValue(true);
    storage.updateClass.mockResolvedValue(true);
    storage.deleteClass.mockResolvedValue(true);
    storage.updateChild.mockResolvedValue(true);
    fetchAndCacheSchools.mockResolvedValue([]);
    academicYearsRepository.getActive.mockResolvedValue({ id: 'year-2026', label: '2026' });
    resolveDatabase.mockResolvedValue({});
    getActiveProgrammeId.mockResolvedValue('programme-a');
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({ data: [], error: null });
      }
      return queryResult({ data: [], error: null });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('addClass automatically uses the active academic year', async () => {
    const { result } = renderHook(() => useClasses(), { wrapper });
    await waitFor(() => expect(storage.getClasses).toHaveBeenCalled());

    await act(async () => {
      await result.current.addClass({
        school_id: 'school-1',
        name: 'Grade 1A',
        grade: '1',
      });
    });

    expect(academicYearsRepository.getActive).toHaveBeenCalledTimes(1);
    expect(storage.saveClass).toHaveBeenCalledWith(expect.objectContaining({
      school_id: 'school-1',
      name: 'Grade 1A',
      academic_year_id: 'year-2026',
    }));
  });

  test('deleteClass delegates to archive storage without double-writing child updates', async () => {
    const { result } = renderHook(() => useClasses(), { wrapper });
    await waitFor(() => expect(storage.getClasses).toHaveBeenCalled());

    await act(async () => {
      await result.current.deleteClass('class-1');
    });

    expect(storage.deleteClass).toHaveBeenCalledWith('class-1');
    expect(storage.updateChild).not.toHaveBeenCalled();
    expect(updateChild).not.toHaveBeenCalled();
  });

  test('successful class pull drops synced local classes absent from the server but keeps dirty local classes', async () => {
    storage.getClasses.mockResolvedValueOnce([
      { id: 'synced-stale-class', name: 'Stale', synced: true, sync_status: 'synced' },
      { id: 'pending-class', name: 'Pending', synced: false, sync_status: 'pending' },
      { id: 'terminal-class', name: 'Terminal', synced: false, sync_status: 'terminal' },
    ]);
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({
          data: [{ programme_id: 'programme-a' }],
          error: null,
        });
      }
      if (tableName === 'classes') {
        return queryResult({
          data: [{
            id: 'server-class',
            name: 'Server',
            class_ea_assignments: [{ id: 'class-assignment-1', class_id: 'server-class', ea_user_id: 'user-1' }],
            sync_status: 'synced',
          }],
          error: null,
        });
      }
      return queryResult({ data: [], error: null });
    });

    const { result } = renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(result.current.classes.map(classItem => classItem.id)).toContain('server-class'));

    expect(result.current.classes.map(classItem => classItem.id).sort()).toEqual([
      'pending-class',
      'server-class',
      'terminal-class',
    ]);
    expect(storage.saveClassEaAssignment).toHaveBeenCalledWith(expect.objectContaining({
      id: 'class-assignment-1',
      class_id: 'server-class',
      sync_status: 'synced',
    }));
  });

  test('successful class pull keeps a pending local edit when the server returns the same class id', async () => {
    storage.getClasses.mockResolvedValueOnce([
      {
        id: 'class-1',
        name: 'Edited Local Class',
        teacher: 'Edited Teacher',
        synced: false,
        sync_status: 'pending',
      },
    ]);
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({
          data: [{ programme_id: 'programme-a' }],
          error: null,
        });
      }
      if (tableName === 'classes') {
        return queryResult({
          data: [{
            id: 'class-1',
            name: 'Server Class',
            teacher: 'Server Teacher',
            class_ea_assignments: [{ id: 'class-assignment-1', class_id: 'class-1', ea_user_id: 'user-1' }],
            sync_status: 'synced',
          }],
          error: null,
        });
      }
      return queryResult({ data: [], error: null });
    });

    const { result } = renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(result.current.classes).toEqual([
      expect.objectContaining({
        id: 'class-1',
        name: 'Edited Local Class',
        teacher: 'Edited Teacher',
      }),
    ]));
    // The context hands every server row to storage; the repository-layer pull
    // guard (serverPullWouldClobberPendingLocal) is what protects the pending
    // local edit in SQLite, inside the same transaction as the write.
    await waitFor(() => expect(storage.saveClass).toHaveBeenCalledWith(expect.objectContaining({
      id: 'class-1',
      name: 'Server Class',
    })));
    expect(result.current.classes).toEqual([
      expect.objectContaining({
        id: 'class-1',
        name: 'Edited Local Class',
        teacher: 'Edited Teacher',
      }),
    ]);
  });

  test('a class archived offline does not resurrect in UI state when a pull still returns it', async () => {
    // getClasses is an active-only read (archived_at is null), so the pending
    // tombstone only surfaces through getUnsyncedClasses; the merge must
    // suppress the server copy until the archive pushes.
    storage.getClasses.mockResolvedValueOnce([]);
    storage.getUnsyncedClasses.mockResolvedValueOnce([
      {
        id: 'class-1',
        name: 'Archived Class',
        archived_at: '2026-07-04T08:00:00.000Z',
        synced: false,
        sync_status: 'pending',
      },
    ]);
    mockSupabaseFrom.mockImplementation((tableName) => {
      if (tableName === 'staff_programme_assignments') {
        return queryResult({
          data: [{ programme_id: 'programme-a' }],
          error: null,
        });
      }
      if (tableName === 'classes') {
        return queryResult({
          data: [{
            id: 'class-1',
            name: 'Archived Class',
            class_ea_assignments: [{ id: 'class-assignment-1', class_id: 'class-1', ea_user_id: 'user-1' }],
            sync_status: 'synced',
          }],
          error: null,
        });
      }
      return queryResult({ data: [], error: null });
    });

    const { result } = renderHook(() => useClasses(), { wrapper });

    await waitFor(() => expect(storage.saveClass).toHaveBeenCalledWith(expect.objectContaining({
      id: 'class-1',
    })));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.classes.map(row => row.id)).not.toContain('class-1');
  });
});
