import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import HomeScreen from '../src/screens/main/HomeScreen';
import SessionsScreen from '../src/screens/main/SessionsScreen';
import { getActiveProgrammeGate } from '../src/services/activeProgrammeGate';

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
  useFocusEffect: (callback) => callback(),
}));

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

describe('session launch clock-in warning', () => {
  test('Home record session shows a soft warning when the user is not clocked in', async () => {
    const screen = renderWithPaper(<HomeScreen navigation={navigation} />);

    fireEvent.press(screen.getByText('Record Session'));

    await waitFor(() => expect(screen.getByText("You're not clocked in. Clock in now or continue anyway?")).toBeTruthy());
    expect(mockNavigate).not.toHaveBeenCalledWith('SessionForm');

    fireEvent.press(screen.getByText('Continue Anyway'));

    expect(mockNavigate).toHaveBeenCalledWith('SessionForm');
  });

  test('Sessions tab record button can send the user to clock in', async () => {
    const screen = renderWithPaper(<SessionsScreen navigation={navigation} />);

    // findByText waits past the gate's loading spinner for the capture UI.
    fireEvent.press(await screen.findByText('Record New Session'));

    await waitFor(() => expect(screen.getByText("You're not clocked in. Clock in now or continue anyway?")).toBeTruthy());
    fireEvent.press(screen.getByText('Clock In Now'));

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
    expect(screen.queryByText("You're not clocked in. Clock in now or continue anyway?")).toBeNull();
  });
});
