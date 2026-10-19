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
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import LiteracySessionForm from '../src/screens/sessions/LiteracySessionForm';
import { READING_LEVELS } from '../src/constants/literacyConstants';

const COMMENTS_PLACEHOLDER = 'Add session notes...';
const mockCompleteMounted = jest.fn();
function HomeStub() { return null; }
function SessionCompleteStub({ route }) {
  React.useEffect(() => { mockCompleteMounted(route.params); }, []);
  return null;
}
const renderForm = () => renderInTestStack({
  routes: [
    { name: 'Home', component: HomeStub },
    { name: 'SessionForm', component: LiteracySessionForm },
    { name: 'SessionComplete', component: SessionCompleteStub },
  ],
  initialIndex: 1,
  wrapper: AllProviders,
});

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
    expect(screen.getByLabelText('Show children').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('Show groups').props.accessibilityState).toEqual({ selected: false });
    expect(screen.queryByText('Select by Group')).toBeNull();
    expect(screen.getByText('Letters Focused On')).toBeTruthy();
    expect(screen.getByText('Submit Session')).toBeTruthy();
  });

  test('switches the compact picker from child rows to group rows', () => {
    const groupChildren = [
      { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' },
      { id: 'child-2', first_name: 'Buhle', last_name: 'Moyo', class_id: 'class-1' },
    ];
    mockUseChildren.mockReturnValue({
      children: groupChildren,
      groups: [{ id: 'group-4', name: 'Group 4' }],
      getChildrenInGroup: (groupId) => (groupId === 'group-4' ? groupChildren : []),
    });
    const screen = renderForm();

    fireEvent.press(screen.getByLabelText('Show groups'));

    expect(screen.getByText('Group 4')).toBeTruthy();
    expect(screen.getByText('2 children')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search groups...')).toBeTruthy();
    expect(screen.queryByText('Amahle Dlamini')).toBeNull();
    expect(screen.getByLabelText('Show groups').props.accessibilityState).toEqual({ selected: true });
  });

  test('selecting a group chooses its children and keeps them editable in Children mode', async () => {
    const groupChildren = [
      { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' },
      { id: 'child-2', first_name: 'Buhle', last_name: 'Moyo', class_id: 'class-1' },
    ];
    mockUseChildren.mockReturnValue({
      children: groupChildren,
      groups: [{ id: 'group-4', name: 'Group 4' }],
      getChildrenInGroup: (groupId) => (groupId === 'group-4' ? groupChildren : []),
    });
    const screen = renderForm();

    fireEvent.press(screen.getByLabelText('Show groups'));
    fireEvent.press(screen.getByText('Group 4'));

    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(screen.getByLabelText('Group 4, 2 children, selected')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Show children'));
    expect(screen.getByLabelText('Amahle Dlamini, selected')).toBeTruthy();
    expect(screen.getByLabelText('Buhle Moyo, selected')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('A, not selected'));
    fireEvent.press(screen.getByText('Select a level'));
    fireEvent.press(screen.getByText(READING_LEVELS[0]));
    fireEvent.press(screen.getByText('Submit Session'));

    await waitFor(() => expect(mockPersistLiteracySession).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          children_ids: ['child-1', 'child-2'],
        }),
      }),
    ));
  });

  describe('unsaved-changes leave guard', () => {
    const goBack = (screen) => act(() => { screen.navigationRef.goBack(); });
    const dirty = (screen) => fireEvent.changeText(screen.getByPlaceholderText(COMMENTS_PLACEHOLDER), 'worked on m sounds');

    test('a dirty form refuses removal and shows the discard sheet with the verbatim copy', () => {
      const screen = renderForm();
      dirty(screen);
      goBack(screen);
      expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);
      expect(screen.getByText('Discard this session?')).toBeTruthy();
      expect(screen.getByText('Your session details have not been saved. Leaving now will discard them.')).toBeTruthy();
      expect(screen.getByText('Discard')).toBeTruthy();
      expect(screen.getByText('Keep editing')).toBeTruthy();
    });

    test('"Keep editing" hides the sheet, keeps every value, and the guard stays armed', () => {
      const screen = renderForm();
      dirty(screen);
      goBack(screen);
      fireEvent.press(screen.getByText('Keep editing'));
      expect(screen.queryByText('Discard this session?')).toBeNull();
      expect(screen.getByPlaceholderText(COMMENTS_PLACEHOLDER).props.value).toBe('worked on m sounds');
      goBack(screen);
      expect(screen.getByText('Discard this session?')).toBeTruthy();
      expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);
    });

    test('"Discard" dispatches the stored action and leaves without a second prompt', () => {
      const screen = renderForm();
      dirty(screen);
      goBack(screen);
      fireEvent.press(screen.getByText('Discard'));
      expect(screen.routeNames()).toEqual(['Home']);
    });

    test('Android back with the sheet open keeps editing', () => {
      const backSpy = jest.spyOn(BackHandler, 'addEventListener');
      const screen = renderForm();
      dirty(screen);
      goBack(screen);
      expect(screen.getByText('Discard this session?')).toBeTruthy();
      const handlers = backSpy.mock.calls.filter(([event]) => event === 'hardwareBackPress');
      act(() => { handlers[handlers.length - 1][1](); });
      expect(screen.queryByText('Discard this session?')).toBeNull();
      expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);
      expect(screen.getByPlaceholderText(COMMENTS_PLACEHOLDER).props.value).toBe('worked on m sounds');
      backSpy.mockRestore();
    });

    test('choosing a session reading level alone makes the form dirty', () => {
      const screen = renderForm();
      fireEvent.press(screen.getByText('Select a level'));
      fireEvent.press(screen.getByText(READING_LEVELS[0]));
      goBack(screen);
      expect(screen.getByText('Discard this session?')).toBeTruthy();
      expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);
    });

    test('a clean form leaves without the sheet', () => {
      const screen = renderForm();
      goBack(screen);
      expect(screen.routeNames()).toEqual(['Home']);
      expect(screen.queryByText('Discard this session?')).toBeNull();
    });

    test('a successful submit leaves without the sheet', async () => {
      const screen = renderForm();
      submitValidForm(screen);
      await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
      expect(mockCompleteMounted).toHaveBeenCalledWith({ childCount: 1 });
      expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);
      expect(screen.queryByText('Discard this session?')).toBeNull();
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
      expect(mockCompleteMounted).not.toHaveBeenCalled();
      expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);

      await act(async () => { resolvePersistence(true); });
      await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
      expect(mockCompleteMounted).toHaveBeenCalledWith({ childCount: 1 });
      expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);
    });

    test('navigates on commit without waiting for refresh and preserves completion side effects', async () => {
      mockRefreshSyncStatus.mockReturnValue(new Promise(() => {}));
      const screen = renderForm();

      submitValidForm(screen);

      await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
      expect(mockCompleteMounted).toHaveBeenCalledWith({ childCount: 1 });
      expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);
      expect(mockRefreshSyncStatus).toHaveBeenCalledTimes(1);
      expect(mockTriggerBackgroundSync).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Discard this session?')).toBeNull();
    });

    test('keeps navigation successful when the non-blocking refresh rejects', async () => {
      const refreshError = new Error('status refresh failed');
      mockRefreshSyncStatus.mockRejectedValue(refreshError);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const screen = renderForm();

      submitValidForm(screen);

      await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
      expect(mockCompleteMounted).toHaveBeenCalledWith({ childCount: 1 });
      expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);
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
