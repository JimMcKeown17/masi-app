import React from 'react';
import { Alert, TextInput as NativeTextInput } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Button, PaperProvider } from 'react-native-paper';
import ProfileScreen from '../src/screens/main/ProfileScreen';
const mockChangePassword = jest.fn();
const mockSignOut = jest.fn(async () => ({ error: null }));
const mockCountUnsent = jest.fn(async () => ({ total: 2, byTable: {} }));
const mockClockOut = jest.fn(async () => true);
import { exportDatabase, exportLogs } from '../src/utils/debugExport';

jest.mock('../src/hooks/useTimeTracking', () => ({
  useTimeTracking: () => ({ isSignedIn: true, handleSignOut: mockClockOut }),
}));
jest.mock('../src/context/OfflineContext', () => ({
  useOffline: () => ({ isOnline: true, syncNow: jest.fn() }),
}));
jest.mock('../src/context/SignedInEAContext', () => ({
  useSignedInEA: () => ({
    handle: { isCurrent: () => true },
    repositories: { syncOutbox: { countUnsent: mockCountUnsent } },
  }),
}));

jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.2.0',
    runtimeVersion: { policy: 'appVersion' },
    ios: { buildNumber: '7' },
    android: { versionCode: 42 },
    updates: { url: 'https://u.expo.dev/test-project' },
    extra: {
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
    },
  },
}), { virtual: true });

jest.mock('expo-application', () => ({
  applicationId: 'org.masinyusane.masi',
  applicationName: 'Masi',
  nativeApplicationVersion: '1.2.0',
  nativeBuildVersion: '7',
}));

jest.mock('expo-device', () => ({
  brand: 'Apple',
  deviceName: 'Field iPhone',
  deviceType: 1,
  isDevice: true,
  manufacturer: 'Apple',
  modelId: 'iPhone-test',
  modelName: 'iPhone',
  osBuildId: 'test-build',
  osName: 'iOS',
  osVersion: '18.0',
  platformApiLevel: null,
  supportedCpuArchitectures: ['arm64'],
  totalMemory: 4_000_000_000,
}));

jest.mock('expo-updates', () => ({
  channel: 'preview',
  isEmbeddedLaunch: true,
  isEmergencyLaunch: false,
  runtimeVersion: '1.2.0',
  updateId: null,
}));

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'test@masinyusane.org' },
    profile: {
      first_name: 'Test',
      last_name: 'User',
      jobTitleName: 'Education Assistant',
      schoolName: 'Masi Primary',
    },
    updatePassword: jest.fn(),
    changePassword: mockChangePassword,
    signOut: mockSignOut,
  }),
}));

jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'),
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
    },
  },
}));

jest.mock('../src/utils/debugExport', () => ({
  exportDatabase: jest.fn(),
  exportLogs: jest.fn(),
}));

jest.mock('../src/services/observability', () => ({
  sendObservabilityTest: jest.fn(async () => ({ success: true })),
}));

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows app build and backend identity for support screenshots', () => {
    const { getByText } = render(
      <PaperProvider>
        <ProfileScreen navigation={{ goBack: jest.fn() }} />
      </PaperProvider>
    );

    expect(getByText(/Version 1\.2\.0/)).toBeTruthy();
    expect(getByText(/Backend sqlite-staging/)).toBeTruthy();
    expect(getByText(/Project segygjzpujphwvrubusm/)).toBeTruthy();
  });

  test('Sign Out asks about the shift before reading the signed-in handle unsent count', async () => {
    const screen = render(
      <PaperProvider>
        <ProfileScreen navigation={{ goBack: jest.fn() }} />
      </PaperProvider>
    );
    await act(async () => { fireEvent.press(screen.getByText('Sign Out')); });
    expect(screen.getByText("You're still clocked in.")).toBeTruthy();
    expect(mockCountUnsent).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();

    await act(async () => { fireEvent.press(screen.getByText('Stay clocked in and sign out')); });
    expect(mockCountUnsent).toHaveBeenCalledTimes(1);
    expect(screen.getByText("2 items haven't uploaded yet.")).toBeTruthy();
    expect(mockClockOut).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();

    await act(async () => { fireEvent.press(screen.getByText('Sign out anyway')); });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  test('does not blame the current password when verification fails over the network', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockChangePassword.mockResolvedValueOnce({
      phase: 'verification',
      error: { message: 'Network request failed', status: 0 },
    });
    const screen = render(
      <PaperProvider>
        <ProfileScreen navigation={{ goBack: jest.fn() }} />
      </PaperProvider>
    );

    const passwordInputs = screen.UNSAFE_getAllByType(NativeTextInput);
    fireEvent.changeText(passwordInputs[0], 'current-secret');
    fireEvent.changeText(passwordInputs[1], 'new-secret-123');
    fireEvent.changeText(passwordInputs[2], 'new-secret-123');
    fireEvent.press(screen.getAllByText('Change Password')[1]);

    await waitFor(() => {
      expect(screen.getByText(
        'Could not verify your current password. Check your connection and try again.'
      )).toBeTruthy();
    });
    expect(screen.queryByText('Current password is incorrect')).toBeNull();

    consoleError.mockRestore();
  });

  test('reports an explicitly identified invalid credential as an incorrect current password', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockChangePassword.mockResolvedValueOnce({
      phase: 'verification',
      error: {
        code: 'invalid_credentials',
        message: 'Invalid login credentials',
        status: 400,
      },
    });
    const screen = render(
      <PaperProvider>
        <ProfileScreen navigation={{ goBack: jest.fn() }} />
      </PaperProvider>
    );

    const passwordInputs = screen.UNSAFE_getAllByType(NativeTextInput);
    fireEvent.changeText(passwordInputs[0], 'wrong-secret');
    fireEvent.changeText(passwordInputs[1], 'new-secret-123');
    fireEvent.changeText(passwordInputs[2], 'new-secret-123');
    fireEvent.press(screen.getAllByText('Change Password')[1]);

    await waitFor(() => {
      expect(screen.getByText('Current password is incorrect')).toBeTruthy();
    });

    consoleError.mockRestore();
  });

  test('keeps the database export available while logs are exporting', async () => {
    let finishLogsExport;
    exportLogs.mockImplementationOnce(() => new Promise((resolve) => {
      finishLogsExport = resolve;
    }));
    const screen = render(
      <PaperProvider>
        <ProfileScreen navigation={{ goBack: jest.fn() }} />
      </PaperProvider>
    );
    const getButton = (label) => screen.UNSAFE_getAllByType(Button)
      .find((button) => button.props.children === label);
    const logsButton = screen.getByRole('button', { name: 'Share Logs' });

    fireEvent.press(logsButton);

    await waitFor(() => {
      expect(getButton('Share Logs').props).toEqual(expect.objectContaining({
        loading: true,
        disabled: true,
      }));
    });
    expect(getButton('Share Database (Contains Sensitive Data)').props).toEqual(expect.objectContaining({
      loading: false,
      disabled: false,
    }));

    await act(async () => {
      finishLogsExport({ success: true });
    });
  });

  test('keeps the logs export available while the database is exporting', async () => {
    let finishDatabaseExport;
    exportDatabase.mockImplementationOnce(() => new Promise((resolve) => {
      finishDatabaseExport = resolve;
    }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((title, message, actions) => {
      actions.find((action) => action.text === 'Export').onPress();
    });
    const screen = render(
      <PaperProvider>
        <ProfileScreen navigation={{ goBack: jest.fn() }} />
      </PaperProvider>
    );
    const getButton = (label) => screen.UNSAFE_getAllByType(Button)
      .find((button) => button.props.children === label);

    fireEvent.press(screen.getByRole('button', {
      name: 'Share Database (Contains Sensitive Data)',
    }));

    await waitFor(() => {
      expect(getButton('Share Database (Contains Sensitive Data)').props).toEqual(
        expect.objectContaining({ loading: true, disabled: true })
      );
    });
    expect(getButton('Share Logs').props).toEqual(expect.objectContaining({
      loading: false,
      disabled: false,
    }));

    await act(async () => {
      finishDatabaseExport({ success: true });
    });
    alert.mockRestore();
  });
});
