import React from 'react';
import { KeyboardAvoidingView, Linking, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { renderWithProviders as render } from '../test-support/renderWithProviders';
import ProfileScreen from '../src/screens/main/ProfileScreen';
import { colors } from '../src/constants/colors';
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
import { NavigationContext } from '@react-navigation/native';
import { ToastActorScope } from '../src/context/ToastContext';
let mockProfile;
let mockSignOutFlowOverride;
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
    profile: mockProfile,
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

jest.mock('../src/hooks/useSignOutFlow', () => ({
  useSignOutFlow: (...args) => mockSignOutFlowOverride ?? jest.requireActual('../src/hooks/useSignOutFlow').useSignOutFlow(...args),
}));

const renderProfile = () => render(<ProfileScreen navigation={{ goBack: jest.fn() }} />);
const fillPassword = (screen) => {
  fireEvent.press(screen.getByRole('button', { name: 'Change password' }));
  fireEvent.changeText(screen.getByLabelText('Current password'), 'current-secret');
  fireEvent.changeText(screen.getByLabelText('New password'), 'new-secret-123');
  fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'new-secret-123');
};
beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = { first_name: 'Test', last_name: 'User', jobTitleName: 'Education Assistant', schoolName: 'Masi Primary' };
  mockSignOutFlowOverride = null;
});
afterEach(() => jest.restoreAllMocks());

test('identity block shows name, job title and initials', () => {
  const screen = renderProfile();
  expect(screen.getByRole('header', { name: 'Test User' })).toBeTruthy();
  expect(screen.getByText('Education Assistant')).toBeTruthy();
  expect(screen.getByText('TU', { includeHiddenElements: true })).toBeTruthy();
});
test('Assigned school row appears only with a school', () => {
  const screen = renderProfile();
  expect(screen.getByLabelText('Assigned school, Masi Primary')).toBeTruthy();
  mockProfile = { ...mockProfile, schoolName: null };
  screen.rerender(<ProfileScreen />);
  expect(screen.queryByLabelText(/Assigned school/)).toBeNull();
});
test('the Email row is one element named Email, test@masinyusane.org', () => {
  const screen = renderProfile();
  expect(screen.getAllByLabelText('Email, test@masinyusane.org')).toHaveLength(1);
  expect(screen.getByLabelText('Email, test@masinyusane.org').props.accessible).toBe(true);
});
test('the footnote is plain, not italic', () => {
  const screen = renderProfile();
  expect(StyleSheet.flatten(screen.getByText('Profile information is managed by administrators').props.style).fontStyle).not.toBe('italic');
});
test('section labels are headers', () => {
  const screen = renderProfile();
  for (const name of ['Profile info', 'Account & support', 'Legal']) {
    expect(screen.getByRole('header', { name })).toBeTruthy();
  }
});
test('Support tools toggles and reveals the three tools', () => {
  const screen = renderProfile();
  const support = () => screen.getByRole('button', { name: 'Support tools' });
  expect(support().props.accessibilityState).toMatchObject({ expanded: false });
  expect(screen.getByText(/Share\slogs · Share\sdatabase · Test\scrash\sreporting/)).toBeTruthy();
  expect(screen.queryByText('Share logs')).toBeNull();
  fireEvent.press(support());
  expect(support().props.accessibilityState).toMatchObject({ expanded: true });
  expect(screen.getByText('Use when Masi support asks')).toBeTruthy();
  for (const name of ['Share logs', 'Share database, sensitive', 'Test crash reporting']) {
    expect(screen.getByRole('button', { name })).toBeTruthy();
  }
  fireEvent.press(support());
  expect(support().props.accessibilityState).toMatchObject({ expanded: false });
  expect(screen.queryByText('Share logs')).toBeNull();
});
test('Change password opens the sheet and Cancel closes it', async () => {
  const screen = renderProfile();
  fireEvent.press(screen.getByRole('button', { name: 'Change password' }));
  expect(screen.getByLabelText('Current password')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByLabelText('Current password')).toBeNull());
});
test('password change succeeds through the screen and reopens empty', async () => {
  const pending = deferred();
  mockChangePassword.mockReturnValueOnce(pending.promise);
  const screen = renderProfile();
  fillPassword(screen);
  const change = fireEvent.press(screen.getByTestId('change-password-submit'));
  expect(change).toBeInstanceOf(Promise);
  expect(mockChangePassword).toHaveBeenCalledWith({ currentPassword: 'current-secret', newPassword: 'new-secret-123', handle: mockHandle });
  await act(async () => { pending.resolve({ error: null, phase: 'update' }); await change; });
  expect(screen.getByText('Password changed successfully')).toBeTruthy();
  await waitFor(() => expect(screen.queryByLabelText('Current password')).toBeNull());
  fireEvent.press(screen.getByRole('button', { name: 'Change password' }));
  for (const label of ['Current password', 'New password', 'Confirm new password']) {
    expect(screen.getByLabelText(label).props.value).toBe('');
  }
});
test('a password outcome after leaving Profile still arrives as a toast', async () => {
  const pending = deferred();
  mockChangePassword.mockReturnValueOnce(pending.promise);
  const screen = render(<ToastActorScope handle={mockHandle}><ProfileScreen /></ToastActorScope>);
  fillPassword(screen);
  const change = fireEvent.press(screen.getByTestId('change-password-submit'));
  expect(change).toBeInstanceOf(Promise);
  // Keep the app-level host and actor alive, as navigation away does.
  screen.rerender(<ToastActorScope handle={mockHandle}>{null}</ToastActorScope>);
  expect(screen.queryByLabelText('Current password')).toBeNull();
  await act(async () => { pending.resolve({ error: null, phase: 'update' }); await change; });
  expect(within(screen.getByTestId('toast')).getByText('Password changed successfully')).toBeTruthy();
});
test.each([
  ['Terms & Conditions', 'https://masinyusane.org/terms'],
  ['Privacy Policy', 'https://www.masinyusane.org/privacy'],
])('%s is a link that opens the exact URL', async (title, url) => {
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const screen = renderProfile();
  await act(async () => { await fireEvent.press(screen.getByRole('link', { name: `${title}, opens in browser` })); });
  expect(Linking.canOpenURL).toHaveBeenCalledWith(url);
  expect(Linking.openURL).toHaveBeenCalledWith(url);
});
test.each([
  ['Terms & Conditions', false, 'Cannot open URL'],
  ['Privacy Policy', false, 'Cannot open URL'],
  ['Terms & Conditions', true, 'Failed to open Terms & Conditions'],
  ['Privacy Policy', true, 'Failed to open Privacy Policy'],
])('%s reports link failure (supported=%s)', async (title, supported, message) => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(supported);
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('offline'));
  const screen = renderProfile();
  await act(async () => { await fireEvent.press(screen.getByRole('link', { name: `${title}, opens in browser` })); });
  expect(screen.getByRole('alert')).toHaveTextContent(message);
  if (!supported) expect(Linking.openURL).not.toHaveBeenCalled();
});
test('Sign out is a quiet destructive pill', () => {
  const screen = renderProfile();
  expect(StyleSheet.flatten(screen.getByText('Sign out').props.style).color).toBe(colors.error);
  expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Sign out' }).props.style).backgroundColor).toBe(colors.surface);
});
test('Sign out exposes busy while signing out', () => {
  mockSignOutFlowOverride = { step: null, unsentCount: 0, busy: 'signing_out', start: jest.fn() };
  const screen = renderProfile();
  expect(screen.getByRole('button', { name: 'Sign out' }).props.accessibilityState).toMatchObject({ busy: true });
});
test('the page has no keyboard avoiding view', () => {
  const screen = renderProfile();
  expect(screen.UNSAFE_queryByType(KeyboardAvoidingView)).toBeNull();
});
test('scroll updates the header hairline only when navigation context is present', () => {
  const navigation = { setOptions: jest.fn(), goBack: jest.fn(), isFocused: () => true, addListener: () => () => {} };
  const screen = renderProfile();
  fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), { nativeEvent: { contentOffset: { y: 20 } } });
  expect(navigation.setOptions).not.toHaveBeenCalled();
  screen.rerender(<NavigationContext.Provider value={navigation}><ProfileScreen navigation={navigation} /></NavigationContext.Provider>);
  fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), { nativeEvent: { contentOffset: { y: 20 } } });
  expect(navigation.setOptions).toHaveBeenCalledWith({ headerScrolled: true });
});
