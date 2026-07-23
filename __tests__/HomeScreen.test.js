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
  };
});

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

  test('shows children the signed-in EA has not seen this week', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-22T08:00:00.000Z'));
    mockUseChildren.mockReturnValue({
      children: [
        { id: 'child-1', first_name: 'Onwethu' },
        { id: 'child-2', first_name: 'Esona' },
        { id: 'child-3', first_name: 'Buhle' },
      ],
    });
    mockGetSessions.mockResolvedValue([
      {
        id: 'session-1',
        user_id: 'ea-1',
        session_date: '2026-07-20',
        children_ids: ['child-1'],
      },
    ]);

    const screen = renderHome();

    expect(await screen.findByText('WHO TO SEE NEXT')).toBeTruthy();
    expect(screen.getByLabelText('Who to see next: Esona')).toBeTruthy();
    expect(screen.getByLabelText('Who to see next: Buhle')).toBeTruthy();
    expect(screen.queryByLabelText('Who to see next: Onwethu')).toBeNull();
    expect(mockGetSessions).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'ea-1',
      recordedByUserId: 'ea-1',
      order: 'desc',
    }));
  });

  test('shows recent sessions and opens the complete history', async () => {
    mockUseChildren.mockReturnValue({
      children: [
        { id: 'child-1', first_name: 'Sinovuyo' },
        { id: 'child-2', first_name: 'Ayanda' },
      ],
    });
    mockGetSessions.mockResolvedValue([
      {
        id: 'session-1',
        user_id: 'ea-1',
        session_date: '2026-07-22',
        created_at: '2026-07-22T08:15:00+02:00',
        children_ids: ['child-1', 'child-2'],
        session_type: 'Shared reading',
      },
    ]);
    const navigation = { navigate: jest.fn() };

    const screen = renderHome(navigation);

    expect(await screen.findByText('Sinovuyo & Ayanda')).toBeTruthy();
    expect(screen.getByText('08:15')).toBeTruthy();
    expect(screen.getByText('Shared reading')).toBeTruthy();
    fireEvent.press(screen.getByText('View all →'));
    expect(navigation.navigate).toHaveBeenCalledWith('SessionHistory');
  });

  test('renders the locked body sections', async () => {
    const screen = renderHome();

    expect(await screen.findByText('WHO TO SEE NEXT')).toBeTruthy();
    expect(screen.getByText('RECENT')).toBeTruthy();
    expect(screen.getByText('View all →')).toBeTruthy();
  });

  test('shows Clock In button when not signed in', async () => {
    const screen = renderHome();

    await waitFor(() => expect(screen.getByText('Clock In')).toBeTruthy());
  });

  test('shows Clock Out / session controls when signed in', async () => {
    mockUseTimeTracking.mockReturnValue({
      ...defaultTimeTracking,
      isSignedIn: true,
      activeEntry: { id: '1', sign_in_time: '2026-06-18T06:00:00.000Z' },
      currentEntry: { id: '1' },
    });

    const screen = renderHome();

    await waitFor(() => expect(screen.getByText('Clock Out')).toBeTruthy());
    expect(screen.queryByText('Clock In')).toBeNull();
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

  test('uses complete active-roster assessment coverage, matching the Assessments tab', async () => {
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

    await waitFor(() => expect(screen.getByText('1 of 2 children assessed')).toBeTruthy());
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
    expect(screen.getByLabelText('0 of 0 children assessed. 0 to go.')).toBeTruthy();
    expect(screen.getByText('No sessions recorded yet.')).toBeTruthy();

    consoleError.mockRestore();
  });
});
