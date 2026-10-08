import React from 'react';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import SessionsScreen from '../src/screens/main/SessionsScreen';
import { getActiveProgrammeGate } from '../src/services/activeProgrammeGate';
import { getSessionsTodayGoal } from '../src/services/sessionsTodayGoal';
import { useSessionHistoryStatus } from '../src/services/sessionHistoryStatus';

const mockNavigate = jest.fn();
const mockGetActiveTimeEntry = jest.fn();
const mockGetTimeEntries = jest.fn();
const mockGetSessions = jest.fn();
const mockGetAssessments = jest.fn();
const mockGetSessionCountsSince = jest.fn();
const mockGetAssessmentCountsSince = jest.fn();
const mockUseTimeTracking = jest.fn();
const mockUseAuth = jest.fn();
const mockUseOffline = jest.fn();
const mockUseChildren = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));
jest.mock('../src/services/sessionHistoryStatus', () => ({ useSessionHistoryStatus: jest.fn() }));
jest.mock('../src/services/sessionsTodayGoal', () => ({ getSessionsTodayGoal: jest.fn() }));

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../src/context/OfflineContext', () => ({
  useOffline: () => mockUseOffline(),
}));

jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: () => mockUseChildren(),
}));

jest.mock('../src/hooks/useTimeTracking', () => ({
  useTimeTracking: () => mockUseTimeTracking(),
}));

jest.mock('../src/db/repositories/timeEntriesRepository', () => ({
  timeEntriesRepository: {
    getActiveTimeEntry: (...args) => mockGetActiveTimeEntry(...args),
    getTimeEntries: (...args) => mockGetTimeEntries(...args),
  },
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

// This suite exercises the clock-in launch guard, not the programme gate, so the
// EA has an active programme — the screen renders its normal capture UI.
jest.mock('../src/services/activeProgrammeGate', () => ({
  getActiveProgrammeGate: jest.fn(async () => ({
    hasActiveProgramme: true,
    programme: { id: 'prog-1', name: 'Core Literacy' },
  })),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }) => <>{children}</>,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}), { virtual: true });

const navigation = {
  navigate: mockNavigate,
};

const renderWithPaper = (ui) => render(<PaperProvider>{ui}</PaperProvider>);

const defaultTimeTracking = {
  isSignedIn: false,
  activeEntry: null,
  loadingLocation: false,
  elapsedTime: 0,
  snackbarMessage: '',
  snackbarVisible: false,
  setSnackbarVisible: jest.fn(),
  handleSignIn: jest.fn(),
  handleSignOut: jest.fn(),
  formatElapsedTime: jest.fn(() => '0h 0m 0s'),
  formatTime: jest.fn(() => '8:00 AM'),
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionHistoryStatus.mockReturnValue({ pageVersion: 0, runVersion: 0 });
  getSessionsTodayGoal.mockResolvedValue({ target: 3, ceiling: 5, count: 0, state: 'below' });
  mockUseAuth.mockReturnValue({
    user: { id: 'user-1', email: 'test@masinyusane.org' },
    profile: {
      first_name: 'Test',
      jobTitleName: 'Education Assistant',
      schoolName: 'Masi Primary',
    },
  });
  mockUseOffline.mockReturnValue({
    isOnline: true,
    unsyncedCount: 0,
    syncStatus: { failedItems: [] },
  });
  mockUseChildren.mockReturnValue({ children: [] });
  mockUseTimeTracking.mockReturnValue(defaultTimeTracking);
  mockGetActiveTimeEntry.mockResolvedValue(null);
  mockGetTimeEntries.mockResolvedValue([]);
  mockGetSessions.mockResolvedValue([]);
  mockGetAssessments.mockResolvedValue([]);
  mockGetSessionCountsSince.mockResolvedValue([]);
  mockGetAssessmentCountsSince.mockResolvedValue([]);
});

const statPill = (screen, label) => {
  let node = screen.getByText(label).parent;
  while (node.type !== 'View') node = node.parent;
  return within(node);
};

describe('SessionsScreen history hydration', () => {
  afterEach(() => jest.useRealTimers());

  test.each(['pageVersion', 'runVersion'])('%s refreshes recorded-session stats without leaving', async (version) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-22T08:00:00.000Z'));
    mockUseChildren.mockReturnValue({ children: [{ id: 'child-1' }, { id: 'child-2' }] });
    const screen = renderWithPaper(<SessionsScreen navigation={navigation} />);
    await screen.findByText('This Week');
    expect(statPill(screen, 'This Week').getByText('0')).toBeTruthy();
    expect(mockGetSessions).toHaveBeenCalledTimes(1);

    mockGetSessions.mockResolvedValue([
      { id: 's-1', user_id: 'user-1', session_date: '2026-07-22', children_ids: ['child-1'] },
      { id: 's-2', user_id: 'user-1', session_date: '2026-07-22', children_ids: ['child-2'] },
      { id: 's-other', user_id: 'user-2', session_date: '2026-07-22', children_ids: ['child-1'] },
    ]);
    getSessionsTodayGoal.mockResolvedValue({ target: 3, ceiling: 5, count: 2, state: 'below' });
    useSessionHistoryStatus.mockReturnValue({ pageVersion: 0, runVersion: 0, [version]: 1 });
    screen.rerender(<PaperProvider><SessionsScreen navigation={navigation} /></PaperProvider>);

    await waitFor(() => expect(mockGetSessions).toHaveBeenCalledTimes(2));
    expect(statPill(screen, 'This Week').getByText('2')).toBeTruthy();
    expect(statPill(screen, 'This Month').getByText('2')).toBeTruthy();
    expect(screen.queryByText('2 children not seen this week')).toBeNull();
    expect(mockGetSessions).toHaveBeenLastCalledWith({
      userId: 'user-1', recordedByUserId: 'user-1', sinceDate: '2026-07-01',
    });
  });
});

describe('session launch clock-in warning', () => {
  test('recording while clocked out preserves the explicit continue escape hatch', async () => {
    const screen = renderWithPaper(<SessionsScreen navigation={navigation} />);

    fireEvent.press(await screen.findByText('Record New Session'));

    await waitFor(() => expect(screen.getByText('You are not clocked in.')).toBeTruthy());
    expect(mockNavigate).not.toHaveBeenCalledWith('SessionForm');

    fireEvent.press(screen.getByText('Record without clocking in'));

    expect(mockNavigate).toHaveBeenCalledWith('SessionForm');
  });

  test('record action can send the user to clock in', async () => {
    const screen = renderWithPaper(<SessionsScreen navigation={navigation} />);

    // findByText waits past the gate's loading spinner for the capture UI.
    fireEvent.press(await screen.findByText('Record New Session'));

    await waitFor(() => expect(screen.getByText('You are not clocked in.')).toBeTruthy());
    fireEvent.press(screen.getByText('Clock in now'));

    expect(mockNavigate).toHaveBeenCalledWith('TimeTracking');
  });

  test('gate-check error does not strand the tab on a spinner — capture UI still appears', async () => {
    // If the programme lookup rejects on first focus, the screen must not stay
    // stuck on the loading spinner; it falls back to the capture UI (the data
    // layer still guards the write at save).
    getActiveProgrammeGate.mockRejectedValueOnce(new Error('db read failed'));

    const screen = renderWithPaper(<SessionsScreen navigation={navigation} />);

    expect(await screen.findByText('Record New Session')).toBeTruthy();
  });

  test('active time entries go straight to the session form without warning', async () => {
    mockGetActiveTimeEntry.mockResolvedValueOnce({
      id: 'time-entry-1',
      user_id: 'user-1',
      sign_out_time: null,
    });

    const screen = renderWithPaper(<SessionsScreen navigation={navigation} />);

    fireEvent.press(await screen.findByText('Record New Session'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('SessionForm'));
    expect(screen.queryByText('You are not clocked in.')).toBeNull();
  });
});
