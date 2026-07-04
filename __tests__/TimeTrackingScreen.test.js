const mockUseTimeTracking = jest.fn();

jest.mock('@expo/vector-icons', () => new Proxy({}, {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (!target[prop]) target[prop] = () => null;
    return target[prop];
  },
}), { virtual: true });

jest.mock('../src/hooks/useTimeTracking', () => ({
  useTimeTracking: () => mockUseTimeTracking(),
}));

import React from 'react';
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import TimeTrackingScreen from '../src/screens/main/TimeTrackingScreen';

const renderTimeTracking = () => render(
  <PaperProvider>
    <TimeTrackingScreen navigation={{ navigate: jest.fn() }} />
  </PaperProvider>
);

const buildTimeTrackingState = (overrides = {}) => ({
  isSignedIn: false,
  activeEntry: null,
  clockIn: jest.fn(),
  clockOut: jest.fn(),
  isLoading: false,
  loadingLocation: false,
  elapsedTime: 0,
  snackbarMessage: '',
  snackbarVisible: false,
  setSnackbarVisible: jest.fn(),
  handleSignIn: jest.fn(),
  handleSignOut: jest.fn(),
  formatElapsedTime: jest.fn(() => '0h 0m 0s'),
  formatTime: jest.fn(() => '8:00 AM'),
  ...overrides,
});

describe('TimeTrackingScreen signed-out branch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTimeTracking.mockReturnValue(buildTimeTrackingState({
      isSignedIn: false,
      activeEntry: null,
      clockIn: jest.fn(),
      clockOut: jest.fn(),
      isLoading: false,
    }));
  });

  test('renders the signed-out status, clock-in action, help text, and work history link', () => {
    const screen = renderTimeTracking();

    expect(screen.getByText('Current Status')).toBeTruthy();
    expect(screen.getByText('Clock In')).toBeTruthy();
    expect(screen.getByText('How Time Tracking Works')).toBeTruthy();
    expect(screen.getByText('View Work History')).toBeTruthy();
  });
});

describe('TimeTrackingScreen signed-in branch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTimeTracking.mockReturnValue(buildTimeTrackingState({
      isSignedIn: true,
      activeEntry: {
        sign_in_time: '2026-06-18T06:00:00.000Z',
        sign_in_lat: -33.9,
        sign_in_lon: 25.6,
      },
      clockIn: jest.fn(),
      clockOut: jest.fn(),
      isLoading: false,
    }));
  });

  test('renders the clock-out action for an active time entry', () => {
    const screen = renderTimeTracking();

    expect(screen.getByText('Clock Out')).toBeTruthy();
  });
});
