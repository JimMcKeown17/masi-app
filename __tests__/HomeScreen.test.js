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

import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
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
      profile: { first_name: 'Alice' },
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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders the greeting with the user first name', async () => {
    const screen = renderHome();

    await waitFor(() => expect(screen.getByText('Welcome, Alice!')).toBeTruthy());
  });

  test('renders core stats section', async () => {
    const screen = renderHome();

    await waitFor(() => expect(screen.getByText('days worked')).toBeTruthy());
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

  test('renders Record Session button', async () => {
    const screen = renderHome();

    await waitFor(() => expect(screen.getByText('Record Session')).toBeTruthy());
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

  test('renders Home stats from bounded and aggregate repository reads', async () => {
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
    mockGetSessionCountsSince.mockResolvedValue([
      { session_date: '2026-07-06', count: 2 },
      { session_date: '2026-07-07', count: 1 },
    ]);
    mockGetAssessmentCountsSince.mockResolvedValue([{ child_id: 'child-1', count: 3 }]);

    const screen = renderHome();

    await waitFor(() => expect(screen.getByText('1 of 2 children assessed')).toBeTruthy());
    expect(mockGetTimeEntries).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'ea-1',
      sinceIso: '2026-06-30T22:00:00.000Z',
      completedOnly: true,
    }));
    expect(mockGetSessionCountsSince).toHaveBeenCalledWith({
      userId: 'ea-1',
      sinceDate: '2026-07-01',
    });
    expect(mockGetAssessmentCountsSince).toHaveBeenCalledWith({
      userId: 'ea-1',
      sinceDate: '2026-07-01',
    });
    expect(mockGetSessions).not.toHaveBeenCalled();
    expect(mockGetAssessments).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('keeps existing stats usable and clears loading when a stats read fails', async () => {
    let rejectTimeEntries;
    mockGetTimeEntries.mockImplementationOnce(() => new Promise((resolve, reject) => {
      rejectTimeEntries = reject;
    }));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const screen = renderHome();

    expect(screen.getByLabelText('Loading statistics')).toBeTruthy();

    await act(async () => {
      rejectTimeEntries(new Error('stats database unavailable'));
    });

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Error loading Home statistics:',
        expect.objectContaining({ message: 'stats database unavailable' }),
      );
    });
    expect(screen.queryByLabelText('Loading statistics')).toBeNull();
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2);

    consoleError.mockRestore();
  });
});
