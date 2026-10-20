jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const mockUseChildren = jest.fn();
const mockUseClasses = jest.fn();
const mockUseOffline = jest.fn();
const mockUseFocusEffect = jest.fn();
const mockGetLetterResults = jest.fn();
const mockGetAcademicYears = jest.fn();
jest.mock('../src/context/SignedInEAContext', () => ({
  useSignedInEA: () => ({ repositories: {
    assessments: { getLetterResults: mockGetLetterResults },
    academicYears: { getAll: mockGetAcademicYears },
  } }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (callback) => require('react').useEffect(() => mockUseFocusEffect(callback), [callback]),
}));

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: () => mockUseChildren(),
}));

jest.mock('../src/context/ClassesContext', () => ({
  useClasses: () => mockUseClasses(),
}));

jest.mock('../src/context/OfflineContext', () => ({
  useOffline: () => mockUseOffline(),
}));

import React from 'react';
import { RefreshControl } from 'react-native';
import { act } from '@testing-library/react-native';
import { renderWithProviders as render } from '../test-support/renderWithProviders';
import ChildrenListScreen from '../src/screens/main/ChildrenListScreen';

describe('ChildrenListScreen pull to refresh', () => {
  const syncNow = jest.fn();
  const loadChildren = jest.fn();
  const loadClasses = jest.fn();
  const refreshSyncStatus = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFocusEffect.mockReset();
    mockGetLetterResults.mockResolvedValue([]);
    mockGetAcademicYears.mockResolvedValue([]);
    syncNow.mockResolvedValue({ success: true });
    loadChildren.mockResolvedValue(undefined);
    loadClasses.mockResolvedValue(undefined);
    refreshSyncStatus.mockResolvedValue(undefined);
    mockUseChildren.mockReturnValue({
      children: [],
      groups: [],
      childrenGroups: [],
      loading: false,
      loadChildren,
    });
    mockUseClasses.mockReturnValue({
      classes: [],
      schools: [],
      loading: false,
      classBootstrapStatus: 'available',
      loadClasses,
      getChildrenInClass: jest.fn(() => []),
    });
    mockUseOffline.mockReturnValue({ isOnline: true, isSyncing: false, waitingCount: 0, needsAttentionCount: 0, refreshSyncStatus, syncNow });
  });

  test('syncs first then performs one children pull and one classes pull', async () => {
    const screen = render(
        <ChildrenListScreen navigation={{ navigate: jest.fn(), setOptions: jest.fn() }} />
    );
    await act(async () => {});

    await act(async () => {
      await screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(syncNow).toHaveBeenCalledWith({ force: true });
    expect(loadChildren).toHaveBeenCalledTimes(1);
    expect(loadClasses).toHaveBeenCalledTimes(1);
    expect(syncNow.mock.invocationCallOrder[0])
      .toBeLessThan(loadChildren.mock.invocationCallOrder[0]);
    expect(syncNow.mock.invocationCallOrder[0])
      .toBeLessThan(loadClasses.mock.invocationCallOrder[0]);
  });

  test('automatically enters onboarding from My Children after zero classes are confirmed', async () => {
    mockUseFocusEffect.mockImplementation((callback) => callback());
    mockUseClasses.mockReturnValue({
      classes: [],
      schools: [],
      loading: false,
      classBootstrapStatus: 'confirmed_empty',
      loadClasses,
      getChildrenInClass: jest.fn(() => []),
    });
    const navigation = { navigate: jest.fn(), setOptions: jest.fn() };

    render(
        <ChildrenListScreen navigation={navigation} />
    );
    await act(async () => {});

    expect(navigation.navigate).toHaveBeenCalledWith('ClassOnboarding');
  });

  test('resumes the durable child step from My Children after a restart', async () => {
    mockUseFocusEffect.mockImplementation((callback) => callback());
    mockUseClasses.mockReturnValue({
      classes: [{ id: 'class-pending', name: 'Grade 1A' }],
      schools: [],
      loading: false,
      classBootstrapStatus: 'available',
      incompleteOnboardingClassId: 'class-pending',
      loadClasses,
      getChildrenInClass: jest.fn(() => []),
    });
    const navigation = { navigate: jest.fn(), setOptions: jest.fn() };

    render(
        <ChildrenListScreen navigation={navigation} />
    );
    await act(async () => {});

    expect(navigation.navigate).toHaveBeenCalledWith('ChildOnboarding', {
      classId: 'class-pending',
    });
    expect(navigation.navigate).not.toHaveBeenCalledWith('ClassOnboarding');
  });

  test('shows a neutral loading state instead of the empty setup prompt while children load', async () => {
    mockUseChildren.mockReturnValue({
      children: [],
      groups: [],
      childrenGroups: [],
      loading: true,
      loadChildren,
    });

    const screen = render(
        <ChildrenListScreen navigation={{ navigate: jest.fn(), setOptions: jest.fn() }} />
    );
    await act(async () => {});

    expect(screen.getByText('Loading classes and children…')).toBeTruthy();
    expect(screen.queryByText('No classes yet')).toBeNull();
    expect(screen.queryByText('Start setup')).toBeNull();
  });

  test('shows the same neutral loading state while classes load', async () => {
    mockUseClasses.mockReturnValue({
      classes: [],
      schools: [],
      loading: true,
      classBootstrapStatus: 'available',
      loadClasses,
      getChildrenInClass: jest.fn(() => []),
    });

    const screen = render(
        <ChildrenListScreen navigation={{ navigate: jest.fn(), setOptions: jest.fn() }} />
    );
    await act(async () => {});

    expect(screen.getByText('Loading classes and children…')).toBeTruthy();
    expect(screen.queryByText('No classes yet')).toBeNull();
  });
});
