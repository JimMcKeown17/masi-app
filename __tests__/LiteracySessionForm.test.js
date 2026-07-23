const mockUseAuth = jest.fn();
const mockUseOffline = jest.fn();
const mockUseClasses = jest.fn();
const mockUseLookupsContext = jest.fn();
const mockUseChildren = jest.fn();
const mockPersistLiteracySession = jest.fn();
const mockRefreshSyncStatus = jest.fn();
const mockTriggerBackgroundSync = jest.fn();

jest.mock('@expo/vector-icons', () => new Proxy({}, {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (!target[prop]) target[prop] = () => null;
    return target[prop];
  },
}), { virtual: true });

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({
  __esModule: true,
  default: () => null,
}), { virtual: true });

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 320, height: 640 };
  const SafeAreaInsetsContext = React.createContext(insets);
  const SafeAreaFrameContext = React.createContext(frame);
  return {
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: SafeAreaInsetsContext.Consumer,
    initialWindowMetrics: { insets, frame },
  };
});

jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => mockUseClasses() }));
jest.mock('../src/context/LookupsContext', () => ({ useLookupsContext: () => mockUseLookupsContext() }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockUseChildren() }));
jest.mock('../src/services/literacySessionPersistence', () => ({
  persistLiteracySession: (...args) => mockPersistLiteracySession(...args),
}));

import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import LiteracySessionForm from '../src/screens/sessions/LiteracySessionForm';
import { READING_LEVELS } from '../src/constants/literacyConstants';

const buildNavigation = () => {
  const listeners = {};
  return {
    replace: jest.fn(),
    dispatch: jest.fn(),
    addListener: jest.fn((event, callback) => {
      listeners[event] = callback;
      return jest.fn();
    }),
    emitBeforeRemove: () => {
      const event = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
      listeners.beforeRemove?.(event);
      return event;
    },
  };
};

const renderForm = (navigation = buildNavigation()) => {
  const screen = render(
    <PaperProvider settings={{ icon: () => null }}>
      <LiteracySessionForm navigation={navigation} />
    </PaperProvider>
  );
  return { navigation, ...screen };
};

describe('LiteracySessionForm', () => {
  const originalTimeZone = process.env.TZ;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 'ea-1' },
      profile: {},
    });
    mockUseOffline.mockReturnValue({
      refreshSyncStatus: mockRefreshSyncStatus,
      triggerBackgroundSync: mockTriggerBackgroundSync,
    });
    mockUseClasses.mockReturnValue({
      classes: [{ id: 'class-1', name: 'Grade 1A', home_language: 'English' }],
    });
    mockUseLookupsContext.mockReturnValue({ jobTitles: [] });
    mockUseChildren.mockReturnValue({
      children: [{ id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' }],
      groups: [],
      getChildrenInGroup: () => [],
    });
    mockPersistLiteracySession.mockResolvedValue(true);
    mockRefreshSyncStatus.mockResolvedValue({ unsyncedCount: 1 });
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.TZ = originalTimeZone;
  });

  const submitValidForm = (screen) => {
    fireEvent.press(screen.getByText('Amahle Dlamini'));
    fireEvent.press(screen.getByLabelText('A, not selected'));
    fireEvent.press(screen.getByText('Select a level'));
    fireEvent.press(screen.getByText(READING_LEVELS[0]));
    fireEvent.press(screen.getByText('Submit Session'));
  };

  test('renders the session-capture form scaffold', () => {
    const screen = renderForm();

    expect(screen.getByText('Session Date')).toBeTruthy();
    expect(screen.getByText('Select Children')).toBeTruthy();
    expect(screen.getByText('Letters Focused On')).toBeTruthy();
    expect(screen.getByText('Submit Session')).toBeTruthy();
  });

  describe('unsaved-changes leave guard', () => {
    test('a dirty form blocks leaving and asks for confirmation', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { navigation, getByPlaceholderText } = renderForm();
      fireEvent.changeText(getByPlaceholderText('Add session notes...'), 'worked on m sounds');
      const event = navigation.emitBeforeRemove();
      expect(event.preventDefault).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    test('choosing a session reading level alone makes the form dirty', () => {
      const { navigation, getByText } = renderForm();
      fireEvent.press(getByText('Select a level'));
      fireEvent.press(getByText(READING_LEVELS[0]));
      const event = navigation.emitBeforeRemove();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    test('a clean form leaves without prompting', () => {
      const { navigation } = renderForm();
      const event = navigation.emitBeforeRemove();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('completion ordering', () => {
    test('attributes a new session to the South African programme day outside South Africa', async () => {
      process.env.TZ = 'America/New_York';
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-23T01:03:00.000Z'));
      const screen = renderForm();

      submitValidForm(screen);

      await waitFor(() => expect(mockPersistLiteracySession).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({
            session_date: '2026-07-23',
          }),
        }),
      ));
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
    });

    test('does not navigate before persistence commits', async () => {
      let resolvePersistence;
      mockPersistLiteracySession.mockReturnValue(new Promise(resolve => {
        resolvePersistence = resolve;
      }));
      const screen = renderForm();

      submitValidForm(screen);
      await waitFor(() => expect(mockPersistLiteracySession).toHaveBeenCalledTimes(1));
      expect(screen.navigation.replace).not.toHaveBeenCalled();

      resolvePersistence(true);
      await waitFor(() => expect(screen.navigation.replace).toHaveBeenCalledTimes(1));
    });

    test('navigates on commit without waiting for refresh and preserves completion side effects', async () => {
      mockRefreshSyncStatus.mockReturnValue(new Promise(() => {}));
      const screen = renderForm();

      submitValidForm(screen);

      await waitFor(() => expect(screen.navigation.replace).toHaveBeenCalledWith(
        'SessionComplete', { childCount: 1 }
      ));
      expect(mockRefreshSyncStatus).toHaveBeenCalledTimes(1);
      expect(mockTriggerBackgroundSync).toHaveBeenCalledTimes(1);
      expect(screen.navigation.emitBeforeRemove().preventDefault).not.toHaveBeenCalled();
    });

    test('keeps navigation successful when the non-blocking refresh rejects', async () => {
      const refreshError = new Error('status refresh failed');
      mockRefreshSyncStatus.mockRejectedValue(refreshError);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const screen = renderForm();

      submitValidForm(screen);

      await waitFor(() => expect(screen.navigation.replace).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(
        'Error refreshing sync status after session save:', refreshError
      ));
      expect(mockTriggerBackgroundSync).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });
  });

  test('sets a reading level for the child whose picker was opened', async () => {
    mockUseChildren.mockReturnValue({
      children: [
        { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' },
        { id: 'child-2', first_name: 'Buhle', last_name: 'Moyo', class_id: 'class-1' },
      ],
      groups: [],
      getChildrenInGroup: () => [],
    });
    const screen = renderForm();

    fireEvent.press(screen.getByText('Amahle Dlamini'));
    fireEvent.press(screen.getByText('Buhle Moyo'));
    fireEvent.press(screen.getAllByText('Not set')[1]);

    expect(screen.getByLabelText('Dismiss child reading level picker')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    fireEvent.press(screen.getByText(READING_LEVELS[1]));

    fireEvent.press(screen.getByLabelText('A, not selected'));
    fireEvent.press(screen.getByText('Select a level'));
    fireEvent.press(screen.getByText(READING_LEVELS[0]));
    fireEvent.press(screen.getByText('Submit Session'));

    await waitFor(() => expect(mockPersistLiteracySession).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          activities: expect.objectContaining({
            child_reading_levels: { 'child-2': READING_LEVELS[1] },
          }),
        }),
      }),
    ));
  });

  test('pre-fills a selected child from their saved current reading level', () => {
    mockUseChildren.mockReturnValue({
      children: [{
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        reading_level: READING_LEVELS[4],
      }],
      groups: [],
      getChildrenInGroup: () => [],
    });
    const screen = renderForm();

    fireEvent.press(screen.getByText('Amahle Dlamini'));

    expect(screen.getByText(READING_LEVELS[4])).toBeTruthy();
    expect(screen.queryByText('Not set')).toBeNull();
  });
});
