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
});
