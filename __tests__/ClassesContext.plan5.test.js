import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ClassesProvider, useClasses } from '../src/context/ClassesContext';
import { storage } from '../src/utils/storage';
import { academicYearsRepository } from '../src/db/repositories/referenceDataRepository';
import { fetchAndCacheSchools } from '../src/services/offlineSync';
import { useChildren } from '../src/context/ChildrenContext';

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(async () => ({ data: [], error: null })),
        })),
      })),
    })),
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

jest.mock('../src/utils/storage', () => ({
  storage: {
    getSchools: jest.fn(),
    getClasses: jest.fn(),
    setItem: jest.fn(),
    saveClass: jest.fn(),
    updateClass: jest.fn(),
    deleteClass: jest.fn(),
    getChildren: jest.fn(),
    updateChild: jest.fn(),
  },
  STORAGE_KEYS: {
    CLASSES: '@classes',
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
    storage.setItem.mockResolvedValue(true);
    storage.saveClass.mockResolvedValue(true);
    storage.updateClass.mockResolvedValue(true);
    storage.deleteClass.mockResolvedValue(true);
    storage.getChildren.mockResolvedValue([]);
    storage.updateChild.mockResolvedValue(true);
    fetchAndCacheSchools.mockResolvedValue([]);
    academicYearsRepository.getActive.mockResolvedValue({ id: 'year-2026', label: '2026' });
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
    expect(storage.getChildren).not.toHaveBeenCalled();
    expect(storage.updateChild).not.toHaveBeenCalled();
    expect(updateChild).not.toHaveBeenCalled();
  });
});
