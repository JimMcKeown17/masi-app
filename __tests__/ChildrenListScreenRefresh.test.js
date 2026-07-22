const mockUseChildren = jest.fn();
const mockUseClasses = jest.fn();
const mockUseOffline = jest.fn();
const mockUseFocusEffect = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (...args) => mockUseFocusEffect(...args),
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
import { act, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ChildrenListScreen from '../src/screens/main/ChildrenListScreen';

describe('ChildrenListScreen pull to refresh', () => {
  const syncNow = jest.fn();
  const loadChildren = jest.fn();
  const loadClasses = jest.fn();
  const refreshSyncStatus = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
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
    mockUseOffline.mockReturnValue({ refreshSyncStatus, syncNow });
  });

  test('syncs first then performs one children pull and one classes pull', async () => {
    const screen = render(
      <PaperProvider>
        <ChildrenListScreen navigation={{ navigate: jest.fn() }} />
      </PaperProvider>
    );

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

  test('automatically enters onboarding from My Children after zero classes are confirmed', () => {
    mockUseFocusEffect.mockImplementation((callback) => callback());
    mockUseClasses.mockReturnValue({
      classes: [],
      schools: [],
      loading: false,
      classBootstrapStatus: 'confirmed_empty',
      loadClasses,
      getChildrenInClass: jest.fn(() => []),
    });
    const navigation = { navigate: jest.fn() };

    render(
      <PaperProvider>
        <ChildrenListScreen navigation={navigation} />
      </PaperProvider>
    );

    expect(navigation.navigate).toHaveBeenCalledWith('ClassOnboarding');
  });

  test('resumes the durable child step from My Children after a restart', () => {
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
    const navigation = { navigate: jest.fn() };

    render(
      <PaperProvider>
        <ChildrenListScreen navigation={navigation} />
      </PaperProvider>
    );

    expect(navigation.navigate).toHaveBeenCalledWith('ChildOnboarding', {
      classId: 'class-pending',
    });
    expect(navigation.navigate).not.toHaveBeenCalledWith('ClassOnboarding');
  });

  test('shows a neutral loading state instead of the empty setup prompt while children load', () => {
    mockUseChildren.mockReturnValue({
      children: [],
      groups: [],
      childrenGroups: [],
      loading: true,
      loadChildren,
    });

    const screen = render(
      <PaperProvider>
        <ChildrenListScreen navigation={{ navigate: jest.fn() }} />
      </PaperProvider>
    );

    expect(screen.getByText('Loading classes and children...')).toBeTruthy();
    expect(screen.queryByText('No classes yet')).toBeNull();
    expect(screen.queryByText('Start Setup')).toBeNull();
  });

  test('shows the same neutral loading state while classes load', () => {
    mockUseClasses.mockReturnValue({
      classes: [],
      schools: [],
      loading: true,
      classBootstrapStatus: 'available',
      loadClasses,
      getChildrenInClass: jest.fn(() => []),
    });

    const screen = render(
      <PaperProvider>
        <ChildrenListScreen navigation={{ navigate: jest.fn() }} />
      </PaperProvider>
    );

    expect(screen.getByText('Loading classes and children...')).toBeTruthy();
    expect(screen.queryByText('No classes yet')).toBeNull();
  });
});
