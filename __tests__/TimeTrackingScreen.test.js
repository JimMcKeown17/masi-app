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
import { StyleSheet } from 'react-native';
import { colors } from '../src/constants/colors';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider, Snackbar } from 'react-native-paper';
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
  handleSignIn: jest.fn(),
  handleSignOut: jest.fn(),
  formatElapsedTime: jest.fn(() => '0h 0m 0s'),
  formatTime: jest.fn(() => '8:00 AM'),
  ...overrides,
});

describe('TimeTrackingScreen signed-out branch', () => {
  test('renders no screen-local Snackbar', async () => {
    const screen = renderTimeTracking();
    expect(screen.UNSAFE_queryByType(Snackbar)).toBeNull();
  });

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
    expect(screen.getByRole('button', { name: 'Clock in' })).toBeTruthy();
    expect(screen.getByText('How Time Tracking Works')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View work history' })).toBeTruthy();
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

    const button = screen.getByRole('button', { name: 'Clock out' });
    expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe(colors.surface);
    fireEvent.press(button);
    expect(mockUseTimeTracking().handleSignOut).toHaveBeenCalledTimes(1);
  });
});


test('an active shift without coordinates renders No location and Clock Out', () => {
  mockUseTimeTracking.mockReturnValue(buildTimeTrackingState({
    isSignedIn: true, activeEntry: {
      sign_in_time: '2026-10-15T08:00:00Z', sign_in_lat: null, sign_in_lon: null,
      sign_in_location_status: 'timeout',
    },
  }));
  const screen = renderTimeTracking();
  expect(screen.getByText('No location')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Clock out' })).toBeTruthy();
});
