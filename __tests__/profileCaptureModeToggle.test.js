import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders as render } from '../test-support/renderWithProviders';
import ProfileScreen from '../src/screens/main/ProfileScreen';
import { CAPTURE_MODES } from '../src/constants/egraConstants';
import { deviceSettings } from '../src/services/deviceSettings';

const mockSignOut = jest.fn();
const mockChangePassword = jest.fn();

jest.mock('../src/hooks/useTimeTracking', () => ({
  useTimeTracking: () => ({ isSignedIn: false, handleSignOut: jest.fn() }),
}));
jest.mock('../src/context/OfflineContext', () => ({
  useOffline: () => ({ isOnline: true, syncNow: jest.fn() }),
}));
jest.mock('../src/context/SignedInEAContext', () => ({
  useSignedInEA: () => ({
    handle: { isCurrent: () => true, userId: 'ea-1', epoch: 1 },
    repositories: { syncOutbox: { countUnsent: jest.fn(async () => ({ total: 0, byTable: {} })) } },
  }),
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    NavigationContext: React.createContext({ isFocused: () => true }),
    useFocusEffect: (callback) => React.useEffect(callback, [callback]),
  };
});

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'test@masinyusane.org' },
    profile: {
      first_name: 'Test',
      last_name: 'User',
      jobTitleName: 'Education Assistant',
      schoolName: 'Masi Primary',
    },
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

jest.mock('../src/utils/releaseMetadata', () => ({
  getReleaseMetadata: () => ({
    appVersion: '1.2.0',
    iosBuildNumber: '7',
    androidVersionCode: 42,
    supabaseTarget: 'sqlite-staging',
    supabaseProjectId: 'segygjzpujphwvrubusm',
  }),
}));

jest.mock('../src/services/deviceSettings', () => ({
  deviceSettings: {
    getCaptureMode: jest.fn(),
    setCaptureMode: jest.fn(),
  },
}));

const renderProfile = () => render(
  <ProfileScreen navigation={{ goBack: jest.fn() }} />
);

describe('ProfileScreen assessment capture mode toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    deviceSettings.getCaptureMode.mockResolvedValue(CAPTURE_MODES.SEQUENTIAL);
    deviceSettings.setCaptureMode.mockResolvedValue(undefined);
  });

  test('loads and displays the stored grid capture mode', async () => {
    deviceSettings.getCaptureMode.mockResolvedValue(CAPTURE_MODES.GRID);

    const screen = renderProfile();

    expect(await screen.findByText('Assessment capture')).toBeTruthy();
    expect(screen.getByText('Grid')).toBeTruthy();
    // The group stays non-accessible so VoiceOver can reach its individual radios.
    expect(screen.getByLabelText('Assessment capture').props.accessibilityRole).toBe('radiogroup');
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Grid' }).props.accessibilityState.checked).toBe(true);
    });
    expect(screen.getByRole('radio', { name: 'Step-by-step' }).props.accessibilityState.checked).toBe(false);
  });

  test('pressing Step-by-step saves the new capture mode', async () => {
    deviceSettings.getCaptureMode.mockResolvedValue(CAPTURE_MODES.GRID);

    const screen = renderProfile();

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Grid' }).props.accessibilityState.checked).toBe(true);
    });

    fireEvent.press(screen.getByText('Step-by-step'));

    await waitFor(() => {
      expect(deviceSettings.setCaptureMode).toHaveBeenCalledWith(CAPTURE_MODES.SEQUENTIAL);
    });
  });

  test('reverts to the previous capture mode when saving fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    deviceSettings.getCaptureMode.mockResolvedValue(CAPTURE_MODES.GRID);
    deviceSettings.setCaptureMode.mockRejectedValueOnce(new Error('write failed'));

    const screen = renderProfile();

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Grid' }).props.accessibilityState.checked).toBe(true);
    });

    fireEvent.press(screen.getByText('Step-by-step'));

    await waitFor(() => {
      expect(deviceSettings.setCaptureMode).toHaveBeenCalledWith(CAPTURE_MODES.SEQUENTIAL);
      expect(screen.getByRole('radio', { name: 'Grid' }).props.accessibilityState.checked).toBe(true);
    });
    expect(screen.getByRole('radio', { name: 'Step-by-step' }).props.accessibilityState.checked).toBe(false);

    console.error.mockRestore();
  });
});

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

jest.mock('../src/services/observability', () => ({ sendObservabilityTest: jest.fn() }));
