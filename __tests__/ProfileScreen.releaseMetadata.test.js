import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { renderWithProviders as render } from '../test-support/renderWithProviders';
import ProfileScreen from '../src/screens/main/ProfileScreen';
import { colors } from '../src/constants/colors';
import { exportDatabase, exportLogs } from '../src/utils/debugExport';
import { sendObservabilityTest } from '../src/services/observability';
const mockChangePassword = jest.fn();
const mockSignOut = jest.fn(async () => ({ error: null }));
const mockCountUnsent = jest.fn(async () => ({ total: 2, byTable: {} }));
const mockClockOut = jest.fn(async () => true);
const mockHandle = { isCurrent: () => true, userId: 'ea-1', epoch: 1 };
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

jest.mock('../src/hooks/useTimeTracking', () => ({
  useTimeTracking: () => ({ isSignedIn: true, handleSignOut: mockClockOut }),
}));
jest.mock('../src/context/OfflineContext', () => ({
  useOffline: () => ({ isOnline: true, syncNow: jest.fn() }),
}));
jest.mock('../src/context/SignedInEAContext', () => ({
  useSignedInEA: () => ({
    handle: mockHandle,
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


const renderProfile = () => render(<ProfileScreen navigation={{ goBack: jest.fn() }} />);
const openSupport = (screen) => fireEvent.press(screen.getByRole('button', { name: 'Support tools' }));
const openExport = (screen) => fireEvent.press(screen.getByRole('button', { name: 'Share database, sensitive' }));
const expectToast = (screen, message, tone) => {
  expect(within(screen.getByTestId('toast')).getByText(message)).toBeTruthy();
  expect(StyleSheet.flatten(screen.getByTestId('toast-status', { includeHiddenElements: true }).props.style).backgroundColor)
    .toBe(tone === 'success' ? colors.success : colors.errorBg);
  if (tone === 'error') expect(screen.getByRole('alert')).toHaveTextContent(message);
  else expect(screen.queryByRole('alert')).toBeNull();
};

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

test('shows app build and backend identity for support screenshots', () => {
  const screen = renderProfile();
  for (const fact of [/Version\s1\.2\.0\s\(Build\s7\)/, /Backend\ssqlite-staging/,
    /Project\ssegygjzpujphwvrubusm/, /Device\siPhone/, /Update\sEmbedded/]) {
    expect(screen.getByText(fact)).toBeTruthy();
  }
});

test('Sign out asks about the shift before reading the signed-in handle unsent count', async () => {
  const screen = renderProfile();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Sign out' })); });
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

test('keeps the database export available while logs are exporting', async () => {
  const pending = deferred();
  exportLogs.mockReturnValueOnce(pending.promise);
  const screen = renderProfile();
  openSupport(screen);
  fireEvent.press(screen.getByRole('button', { name: 'Share logs' }));
  expect(screen.getByRole('button', { name: 'Share logs' }).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  expect(screen.getByRole('button', { name: 'Share database, sensitive' }).props.accessibilityState).toMatchObject({ busy: false, disabled: false });
  openExport(screen);
  expect(screen.getByText('Export database')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  await act(async () => { pending.resolve({ success: true }); });
});

test('keeps the logs export available while the database is exporting and refuses to reopen its sheet', async () => {
  const pending = deferred();
  exportDatabase.mockReturnValueOnce(pending.promise);
  const screen = renderProfile();
  openSupport(screen);
  openExport(screen);
  fireEvent.press(screen.getByRole('button', { name: 'Export' }));
  await waitFor(() => expect(screen.queryByText('Export database')).toBeNull());
  expect(screen.getByRole('button', { name: 'Share database, sensitive' }).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  expect(screen.getByRole('button', { name: 'Share logs' }).props.accessibilityState).toMatchObject({ busy: false, disabled: false });
  openExport(screen);
  expect(screen.queryByText('Export database')).toBeNull();
  await act(async () => { pending.resolve({ success: true }); });
});

test('Share database opens the export sheet instead of an alert', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  const screen = renderProfile();
  openSupport(screen);
  openExport(screen);
  expect(screen.getByText('Export database')).toBeTruthy();
  expect(screen.getAllByText('Sensitive').length).toBeGreaterThan(0);
  expect(alert).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByText('Export database')).toBeNull());
  expect(screen.queryByText('This will export all local data including sensitive information. Only share with Masi support staff.')).toBeNull();
  expect(exportDatabase).not.toHaveBeenCalled();
});

test.each([
  ['success', { success: true }, 'Database exported successfully', 'success'],
  ['failure', { success: false }, 'Failed to export database', 'error'],
  ['reported error', { success: false, error: 'Disk full' }, 'Disk full', 'error'],
  ['rejection', null, 'Failed to export database', 'error'],
])('Export closes the sheet, exports once and toasts: %s', async (outcome, result, message, tone) => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const pending = deferred();
  exportDatabase.mockReturnValueOnce(pending.promise);
  const screen = renderProfile();
  openSupport(screen);
  openExport(screen);
  const button = screen.getByRole('button', { name: 'Export' });
  act(() => { fireEvent.press(button); fireEvent.press(button); });
  expect(exportDatabase).toHaveBeenCalledTimes(1);
  expect(exportDatabase).toHaveBeenCalledWith({ handle: mockHandle });
  await waitFor(() => expect(screen.queryByText('Export database')).toBeNull());
  await act(async () => { if (outcome === 'rejection') pending.reject(new Error('disk')); else pending.resolve(result); });
  expectToast(screen, message, tone);
});

test.each([
  ['Share logs', 'success', 'Logs exported successfully', 'success'],
  ['Share logs', 'failure', 'Disk full', 'error'],
  ['Test crash reporting', 'success', 'Crash reporting test sent', 'success'],
  ['Test crash reporting', 'rejection', 'Could not send crash reporting test', 'error'],
])('%s toasts its %s outcome even after collapsing support', async (label, outcome, message, tone) => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const pending = deferred();
  (label === 'Share logs' ? exportLogs : sendObservabilityTest).mockReturnValueOnce(pending.promise);
  const screen = renderProfile();
  openSupport(screen);
  fireEvent.press(screen.getByRole('button', { name: label }));
  expect(screen.getByRole('button', { name: label }).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  openSupport(screen);
  await act(async () => {
    if (outcome === 'rejection') pending.reject(new Error('offline'));
    else pending.resolve(outcome === 'success' ? { success: true } : { success: false, error: message });
  });
  expectToast(screen, message, tone);
});
