const mockUseAuth = jest.fn();
const mockUseOffline = jest.fn();
const mockUseChildren = jest.fn();
const mockUseClasses = jest.fn();
const mockUseTimeTracking = jest.fn();
const mockUseSessionLaunchGuard = jest.fn();
const mockGetTimeEntries = jest.fn();
const mockGetSessions = jest.fn();
const mockGetAssessments = jest.fn();
const mockGetSessionCountsSince = jest.fn();
const mockGetAssessmentCountsSince = jest.fn();
const mockGetSessionsTodayGoal = jest.fn();
const mockGetActiveProgrammeGate = jest.fn();
const mockIsFocused = jest.fn(() => true);
const mockStatusBar = jest.fn();

const mockGetAssessmentDismissedOn = jest.fn();
const mockDismissAssessmentForDay = jest.fn();
jest.mock('../src/services/homeAttentionStore', () => ({
  AUTO_CLOCK_OUT_NOTICE_TTL_MS: 24 * 60 * 60 * 1000,
  homeAttentionStore: {
    getAssessmentDismissedOn: (...args) => mockGetAssessmentDismissedOn(...args),
    dismissAssessmentForDay: (...args) => mockDismissAssessmentForDay(...args),
  },
}));

jest.mock('@expo/vector-icons', () => new Proxy({}, {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (!target[prop]) target[prop] = () => null;
    return target[prop];
  },
}), { virtual: true });

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useFocusEffect: (cb) => { React.useEffect(() => cb(), []); },
    useIsFocused: () => mockIsFocused(),
  };
});

jest.mock('expo-status-bar', () => ({ StatusBar: (props) => { mockStatusBar(props); return null; } }));

jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockUseChildren() }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => mockUseClasses() }));
jest.mock('../src/hooks/useTimeTracking', () => ({ useTimeTracking: () => mockUseTimeTracking() }));
jest.mock('../src/hooks/useSessionLaunchGuard', () => ({
  useSessionLaunchGuard: (...args) => mockUseSessionLaunchGuard(...args),
}));
jest.mock('../src/db/repositories/timeEntriesRepository', () => ({
  timeEntriesRepository: { getTimeEntries: (...args) => mockGetTimeEntries(...args) },
}));
jest.mock('../src/db/repositories/sessionsRepository', () => ({
  sessionsRepository: {
    getSessions: (...args) => mockGetSessions(...args),
    getSessionCountsSince: (...args) => mockGetSessionCountsSince(...args),
  },
}));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: {
    getAssessments: (...args) => mockGetAssessments(...args),
    getAssessmentCountsSince: (...args) => mockGetAssessmentCountsSince(...args),
  },
}));
jest.mock('../src/services/sessionsTodayGoal', () => ({
  getSessionsTodayGoal: (...args) => mockGetSessionsTodayGoal(...args),
}));
jest.mock('../src/services/activeProgrammeGate', () => ({
  getActiveProgrammeGate: (...args) => mockGetActiveProgrammeGate(...args),
}));

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import HomeScreen from '../src/screens/main/HomeScreen';

const renderHome = (navigation = { navigate: jest.fn() }) => render(
  <PaperProvider>
    <HomeScreen navigation={navigation} />
  </PaperProvider>
);

const defaultTimeTracking = {
  autoClockOutNotice: null,
  dismissAutoClockOutNotice: jest.fn(),
  isSignedIn: false,
  activeEntry: null,
  currentEntry: null,
  loadingLocation: false,
  elapsedTime: 0,
  snackbarMessage: '',
  snackbarVisible: false,
  setSnackbarVisible: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  handleSignIn: jest.fn(),
  handleSignOut: jest.fn(),
  formatElapsedTime: jest.fn(() => '0h 0m 0s'),
  formatTime: jest.fn(() => '8:00 AM'),
};

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsFocused.mockReturnValue(true);
    mockGetAssessmentDismissedOn.mockResolvedValue(null);
    mockDismissAssessmentForDay.mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      user: { id: 'ea-1', first_name: 'Alice' },
      profile: { first_name: 'Alice', schoolName: 'Charles Duna Primary' },
    });
    mockUseOffline.mockReturnValue({
      isOnline: true,
      unsyncedCount: 0,
      waitingCount: 0,
      needsAttentionCount: 0,
      syncStatus: { failedItems: [] },
    });
    mockUseChildren.mockReturnValue({ children: [] });
    mockUseClasses.mockReturnValue({
      classes: [{ id: 'class-1', name: 'Grade 1A' }],
      classBootstrapStatus: 'available',
    });
    mockUseTimeTracking.mockReturnValue(defaultTimeTracking);
    mockUseSessionLaunchGuard.mockReturnValue({
      launchSession: jest.fn(),
      warningVisible: false,
      requestSessionLaunch: jest.fn(),
      continueAnyway: jest.fn(),
      clockInNow: jest.fn(),
      dismissWarning: jest.fn(),
    });
    mockGetTimeEntries.mockResolvedValue([]);
    mockGetSessions.mockResolvedValue([]);
    mockGetAssessments.mockResolvedValue([]);
    mockGetSessionCountsSince.mockResolvedValue([]);
    mockGetAssessmentCountsSince.mockResolvedValue([]);
    mockGetSessionsTodayGoal.mockResolvedValue({
      target: 3,
      ceiling: 5,
      count: 2,
      state: 'below',
    });
    mockGetActiveProgrammeGate.mockResolvedValue({
      hasActiveProgramme: true,
      programme: { id: 'programme-1', name: 'Core Literacy' },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders the locked status-only hero', async () => {
    const screen = renderHome();

    expect(await screen.findByText('Molo, Alice.')).toBeTruthy();
    expect(screen.getByText('Core Literacy · Charles Duna Primary')).toBeTruthy();
    expect(screen.queryByText('days worked')).toBeNull();
    expect(screen.queryByText('Performance Insights')).toBeNull();
    expect(screen.queryByText('Record Session')).toBeNull();
  });

  test('shows the locked daily half-gauge in the Home hero', async () => {
    const screen = renderHome();

    expect(await screen.findByLabelText('2 of 3 sessions today. Below target.')).toBeTruthy();
    expect(screen.getByText('2 of 3 sessions today')).toBeTruthy();
    expect(screen.getByText('One more pair reaches your target.')).toBeTruthy();
    expect(mockGetSessionsTodayGoal).toHaveBeenCalledWith({ userId: 'ea-1' });
  });

  test('shows Clock in button when not signed in', async () => {
    const screen = renderHome();

    await waitFor(() => expect(screen.getByText('Clock in')).toBeTruthy());
  });

  test('shows Clock out / session controls when signed in', async () => {
    mockUseTimeTracking.mockReturnValue({
      ...defaultTimeTracking,
      isSignedIn: true,
      activeEntry: { id: '1', sign_in_time: '2026-06-18T06:00:00.000Z' },
      currentEntry: { id: '1' },
    });

    const screen = renderHome();

    await waitFor(() => expect(screen.getByText('Clock out')).toBeTruthy());
    expect(screen.queryByText('Clock in')).toBeNull();
  });

  test('does not duplicate the navigation Record action on Home', async () => {
    const screen = renderHome();

    await screen.findByText('Core Literacy · Charles Duna Primary');
    expect(screen.queryByText('Record Session')).toBeNull();
  });

  test('automatically enters onboarding only after zero classes are confirmed', async () => {
    const navigation = { navigate: jest.fn() };
    mockUseClasses.mockReturnValue({
      classes: [],
      classBootstrapStatus: 'confirmed_empty',
    });

    renderHome(navigation);

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('ClassOnboarding');
    });
  });

  test('resumes the durable child step when class creation was already completed', async () => {
    const navigation = { navigate: jest.fn() };
    mockUseClasses.mockReturnValue({
      classes: [{ id: 'class-pending', name: 'Grade 1A' }],
      classBootstrapStatus: 'available',
      incompleteOnboardingClassId: 'class-pending',
    });

    renderHome(navigation);

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('ChildOnboarding', {
        classId: 'class-pending',
      });
    });
    expect(navigation.navigate).not.toHaveBeenCalledWith('ClassOnboarding');
  });

  test('assessment card uses complete active-roster coverage', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-12T08:00:00.000Z'));
    mockUseChildren.mockReturnValue({
      children: [
        { id: 'child-1', first_name: 'Amahle' },
        { id: 'child-2', first_name: 'Lwazi' },
      ],
    });
    mockGetTimeEntries.mockResolvedValue([{
      sign_in_time: '2026-07-01T06:00:00.000Z',
      sign_out_time: '2026-07-01T08:00:00.000Z',
    }]);
    mockGetSessions.mockResolvedValue([
      {
        id: 'session-1',
        user_id: 'ea-1',
        session_date: '2026-07-06',
        children_ids: ['child-1'],
      },
      {
        id: 'session-2',
        user_id: 'ea-1',
        session_date: '2026-07-07',
        children_ids: ['child-2'],
      },
    ]);
    mockGetAssessmentCountsSince.mockResolvedValue([{ child_id: 'child-1', count: 3 }]);

    const screen = renderHome();

    await waitFor(() => expect(screen.getByText('1 child to assess')).toBeTruthy());
    expect(screen.getByText('1 of 2 children assessed')).toBeTruthy();
    expect(mockGetSessions).toHaveBeenCalledWith({
      userId: 'ea-1',
      recordedByUserId: 'ea-1',
      sinceDate: '2026-06-12',
      order: 'desc',
    });
    expect(mockGetAssessmentCountsSince).toHaveBeenCalledWith({
      userId: 'ea-1',
    });
    expect(mockGetTimeEntries).not.toHaveBeenCalled();
    expect(mockGetSessionCountsSince).not.toHaveBeenCalled();
    expect(mockGetAssessments).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('keeps existing stats usable and clears loading when a stats read fails', async () => {
    let rejectSessions;
    mockGetSessions.mockImplementationOnce(() => new Promise((resolve, reject) => {
      rejectSessions = reject;
    }));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const screen = renderHome();

    expect(screen.getByLabelText('Loading statistics')).toBeTruthy();

    await act(async () => {
      rejectSessions(new Error('stats database unavailable'));
    });

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Error loading Home statistics:',
        expect.objectContaining({ message: 'stats database unavailable' }),
      );
    });
    expect(screen.queryByLabelText('Loading statistics')).toBeNull();
    expect(screen.getByText('Couldn’t load today’s sessions')).toBeTruthy();
    expect(screen.queryByLabelText('Needs your attention')).toBeNull();

    consoleError.mockRestore();
  });

  test('a normal day shows no attention area', async () => {
    mockUseChildren.mockReturnValue({ children: [{ id: 'c1', first_name: 'A' }] });
    mockGetAssessmentCountsSince.mockResolvedValue([{ child_id: 'c1', count: 1 }]);
    const screen = renderHome();
    await waitFor(() => expect(screen.getByText('2 of 3 sessions today')).toBeTruthy());
    expect(screen.queryByLabelText('Needs your attention')).toBeNull();
    expect(screen.queryByText('WHO TO SEE NEXT')).toBeNull();
    expect(screen.queryByText('RECENT')).toBeNull();
  });

  test('sync attention card opens Sync status and stays while syncing', async () => {
    mockUseOffline.mockReturnValue({
      isOnline: true, isSyncing: true, waitingCount: 0, needsAttentionCount: 2, syncStatus: { failedItems: [] },
    });
    const navigation = { navigate: jest.fn() };
    const screen = renderHome(navigation);
    fireEvent.press(await screen.findByLabelText('2 items need attention. Open sync status to sort it out'));
    expect(navigation.navigate).toHaveBeenCalledWith('SyncStatus');
  });

  test('an auto clock-out published after the first load appears without navigation', async () => {
    const screen = renderHome();
    await waitFor(() => expect(screen.getByText('2 of 3 sessions today')).toBeTruthy());
    expect(screen.queryByText('Clocked out after 10 hours')).toBeNull();

    mockUseTimeTracking.mockReturnValue({
      ...defaultTimeTracking,
      autoClockOutNotice: {
        entryId: 'time-1', userId: 'ea-1', signInTime: new Date(Date.now() - 11 * 3600e3).toISOString(),
        detectedAt: new Date().toISOString(), dismissedAt: null,
      },
    });
    screen.rerender(<PaperProvider><HomeScreen navigation={{ navigate: jest.fn() }} /></PaperProvider>);

    expect(await screen.findByText('Clocked out after 10 hours')).toBeTruthy();
  });

  test('dismissing the auto clock-out card calls the provider with its entry', async () => {
    const dismiss = jest.fn();
    mockUseTimeTracking.mockReturnValue({
      ...defaultTimeTracking,
      autoClockOutNotice: {
        entryId: 'time-9', userId: 'ea-1', signInTime: new Date().toISOString(),
        detectedAt: new Date().toISOString(), dismissedAt: null,
      },
      dismissAutoClockOutNotice: dismiss,
    });
    const screen = renderHome();
    fireEvent.press(await screen.findByLabelText('Dismiss: Clocked out after 10 hours'));
    expect(dismiss).toHaveBeenCalledWith('time-9');
  });

  test('dismissing the assessment card hides it for today', async () => {
    mockUseChildren.mockReturnValue({ children: [{ id: 'c1', first_name: 'A' }, { id: 'c2', first_name: 'B' }] });
    mockGetAssessmentCountsSince.mockResolvedValue([{ child_id: 'c1', count: 1 }]);
    const screen = renderHome();
    fireEvent.press(await screen.findByLabelText('Dismiss: 1 child to assess'));
    await waitFor(() => expect(screen.queryByText('1 child to assess')).toBeNull());
    expect(mockDismissAssessmentForDay).toHaveBeenCalledWith('ea-1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  test('returning to the foreground reloads the stats', async () => {
    const { AppState } = require('react-native');
    const listeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      listeners.push(fn);
      return { remove: jest.fn() };
    });
    renderHome();
    await waitFor(() => expect(mockGetSessionsTodayGoal).toHaveBeenCalledTimes(1));
    await act(async () => { listeners.forEach((fn) => fn('active')); });
    await waitFor(() => expect(mockGetSessionsTodayGoal).toHaveBeenCalledTimes(2));
  });

  test('omits the subtitle when there is no programme or school', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'ea-1' }, profile: { first_name: 'Alice' } });
    mockGetActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: false, programme: null });
    const screen = renderHome();
    await waitFor(() => expect(screen.getByText('Molo, Alice.')).toBeTruthy());
    expect(screen.queryByText(/ · /)).toBeNull();
  });

  test('a failed refresh keeps the last good stats on screen', async () => {
    const { AppState } = require('react-native');
    const listeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      listeners.push(fn);
      return { remove: jest.fn() };
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const screen = renderHome();
    await waitFor(() => expect(screen.getByText('2 of 3 sessions today')).toBeTruthy());

    mockGetSessions.mockRejectedValueOnce(new Error('busy'));
    await act(async () => { listeners.forEach((fn) => fn('active')); });

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(screen.getByText('2 of 3 sessions today')).toBeTruthy();
    consoleError.mockRestore();
  });

  test('Home owns a light status bar only while focused', async () => {
    const screen = renderHome();
    await waitFor(() => expect(mockStatusBar).toHaveBeenCalledWith(expect.objectContaining({ style: 'light' })));

    mockStatusBar.mockClear();
    mockIsFocused.mockReturnValue(false);
    screen.rerender(<PaperProvider><HomeScreen navigation={{ navigate: jest.fn() }} /></PaperProvider>);

    expect(mockStatusBar).not.toHaveBeenCalled();
  });
});
