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
const mockCaptureEvent = jest.fn();
const mockGetDeliveryState = jest.fn();
const mockSyncNow = jest.fn();
let mockSignedInEAOverride;
const mockAvailablePicker = jest.fn(() => null);
const mockPickScreenshot = jest.fn();
jest.mock('../src/utils/supportScreenshot', () => ({
  availablePicker: () => mockAvailablePicker(), pickSupportScreenshot: (...args) => mockPickScreenshot(...args),
}));
let mockIsOnline = true;
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
import { NavigationContext } from '@react-navigation/native';
import { ToastActorScope } from '../src/context/ToastContext';
let mockGalleryEnabled = false;
jest.mock('../src/utils/questionGallery', () => ({ isQuestionGalleryEnabled: () => mockGalleryEnabled }));
let mockProfile;
let mockSignOutFlowOverride;
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

jest.mock('../src/hooks/useTimeTracking', () => ({
  useTimeTracking: () => ({ isSignedIn: true, handleSignOut: mockClockOut }),
}));
jest.mock('../src/context/OfflineContext', () => ({
  useOffline: () => ({ isOnline: mockIsOnline, syncNow: mockSyncNow }),
}));
jest.mock('../src/context/SignedInEAContext', () => ({
  useSignedInEA: () => mockSignedInEAOverride ?? ({
    handle: mockHandle,
    repositories: { syncOutbox: { countUnsent: mockCountUnsent } },
    services: { supportIncidents: { captureEvent: mockCaptureEvent, getDeliveryState: mockGetDeliveryState } },
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
  mockIsOnline = true;
  mockSignedInEAOverride = null;
  mockAvailablePicker.mockReturnValue(null);
  mockPickScreenshot.mockReset();
  mockCaptureEvent.mockReset();
  mockGetDeliveryState.mockReset();
  mockSyncNow.mockReset();
  mockGetDeliveryState.mockResolvedValue('sent');
  mockSyncNow.mockResolvedValue({ success: true });
  mockGalleryEnabled = false;
  mockProfile = { first_name: 'Test', last_name: 'User', jobTitleName: 'Education Assistant', schoolName: 'Masi Primary' };
  mockSignOutFlowOverride = null;
});

test.each(['sent', 'pending', 'rejected'])('Send diagnostics captures a fresh manual event and confirms only its %s receipt', async (delivery) => {
  const incidentRef = { id: 'diagnostics-1', kind: 'diagnostics_sent', reportGeneration: 1 };
  mockCaptureEvent.mockResolvedValue({ saved: true, incidentRef });
  mockGetDeliveryState.mockResolvedValue(delivery);
  const screen = renderProfile();
  fireEvent.press(screen.getByRole('button', { name: 'Support tools' }));
  fireEvent.press(screen.getByRole('button', { name: 'Send diagnostics' }));
  const send = screen.getByRole('button', { name: 'Send' });
  await act(async () => { fireEvent.press(send); fireEvent.press(send); });
  expect(mockCaptureEvent).toHaveBeenCalledTimes(1);
  expect(mockCaptureEvent).toHaveBeenCalledWith('diagnostics_sent', { trigger: 'manual' });
  expect(mockGetDeliveryState).toHaveBeenCalledWith(incidentRef);
  const message = delivery === 'sent' ? 'Sent. Thank you.' : delivery === 'pending'
    ? "Saved on your phone. It will send when you're online." : 'Could not save diagnostics. Please try again.';
  expect(screen.getByText(message)).toBeTruthy();
});

test('a screenshot reaches durable capture with its original metadata before any sync', async () => {
  mockAvailablePicker.mockReturnValue({});
  const screenshotFile = { uri: 'file:///private/picker/shot.heif', extension: 'heif', mimeType: 'image/heif', fileSize: 8000 };
  mockPickScreenshot.mockResolvedValue(screenshotFile);
  mockCaptureEvent.mockResolvedValue({ saved: true, incidentRef: { id: 'screenshot-report', kind: 'ea_report', reportGeneration: 1 } });
  const screen = renderProfile();
  fireEvent.press(screen.getByRole('button', { name: 'Support tools' }));
  fireEvent.press(screen.getByRole('button', { name: 'Report a problem' }));
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'Screenshot report');
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Attach a screenshot' })); });
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Send' })); });
  expect(mockCaptureEvent).toHaveBeenCalledWith('ea_report', {
    message: 'Screenshot report', screenshotAttached: true, screen: 'Profile',
  }, { screenshotFile });
});

test('dismiss/reopen cannot create a duplicate report or let the old completion clear the new form', async () => {
  const pending = deferred();
  mockCaptureEvent.mockReturnValueOnce(pending.promise);
  const screen = renderProfile();
  fireEvent.press(screen.getByRole('button', { name: 'Support tools' }));
  fireEvent.press(screen.getByRole('button', { name: 'Report a problem' }));
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'First report');
  const send = screen.getByRole('button', { name: 'Send' });
  act(() => { fireEvent.press(send); fireEvent.press(send); });
  expect(mockCaptureEvent).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.press(screen.getByRole('button', { name: 'Report a problem' }));
  expect(screen.getByLabelText('What went wrong?').props.value).toBe('');
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'New report');
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Send' })); });
  expect(mockCaptureEvent).toHaveBeenCalledTimes(1);
  expect(screen.getByText('A report is still being saved. Please wait and try again.')).toBeTruthy();
  await act(async () => { pending.resolve({ saved: true, incidentRef: { id: 'first-report', kind: 'ea_report', reportGeneration: 1 } }); });
  expect(screen.getByLabelText('What went wrong?').props.value).toBe('New report');
  expect(screen.getByRole('header', { name: 'Report a problem' })).toBeTruthy();
});

test('a current-actor outcome uses the root toast after navigating away for 4,000 ms', async () => {
  jest.useFakeTimers();
  try {
    const pending = deferred();
    mockCaptureEvent.mockReturnValueOnce(pending.promise);
    const content = (profileVisible) => <ToastActorScope handle={mockHandle}>{profileVisible ? <ProfileScreen /> : null}</ToastActorScope>;
    const screen = render(content(true));
    fireEvent.press(screen.getByRole('button', { name: 'Support tools' }));
    fireEvent.press(screen.getByRole('button', { name: 'Report a problem' }));
    fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'Report before leaving');
    fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    screen.rerender(content(false));
    await act(async () => { pending.resolve({ saved: true, incidentRef: { id: 'navigated-report', kind: 'ea_report', reportGeneration: 1 } }); });
    expect(screen.getByText('Sent. Thank you.')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(3999); });
    expect(screen.getByText('Sent. Thank you.')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(1); });
    act(() => { jest.advanceTimersByTime(500); });
    expect(screen.queryByText('Sent. Thank you.')).toBeNull();
  } finally { jest.useRealTimers(); }
});

// This checkout predates C's captureEvent/getDeliveryState handle services.
// TODO Slice C: enable this real-handle Profile capture test after C is integrated.
test.skip('TODO Slice C: Profile records a report through real handle services and reads its durable pending receipt', async () => {
  const realHandle = require('../test-support/defaultTestHandle').getDefaultTestHandle();
  mockSignedInEAOverride = { handle: realHandle, repositories: realHandle.repositories, services: realHandle.services };
  const capture = jest.spyOn(realHandle.services.supportIncidents, 'captureEvent');
  mockSyncNow.mockResolvedValue(null);
  const screen = render(<ToastActorScope handle={realHandle}><ProfileScreen /></ToastActorScope>);
  fireEvent.press(screen.getByRole('button', { name: 'Support tools' }));
  fireEvent.press(screen.getByRole('button', { name: 'Report a problem' }));
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'Real handle report');
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Send' })); });
  const result = await capture.mock.results[0].value;
  expect(result.saved).toBe(true);
  expect(await realHandle.services.supportIncidents.getDeliveryState(result.incidentRef)).toBe('pending');
  const row = await realHandle.getReader().getFirstAsync('SELECT kind, payload FROM support_incident_queue WHERE id = ?', [result.incidentRef.id]);
  expect(row.kind).toBe('ea_report');
  expect(JSON.parse(row.payload).message).toBe('Real handle report');
  expect(screen.getByText("Saved on your phone. It will send when you're online.")).toBeTruthy();
});

test('Report a problem awaits durable capture and bundle completion, syncs, then checks the exact receipt', async () => {
  const capture = deferred();
  const sync = deferred();
  const incidentRef = { id: 'incident-1', kind: 'ea_report', reportGeneration: 2 };
  mockCaptureEvent.mockReturnValueOnce(capture.promise);
  mockSyncNow.mockReturnValueOnce(sync.promise);
  const screen = renderProfile();
  fireEvent.press(screen.getByRole('button', { name: 'Support tools' }));
  fireEvent.press(screen.getByRole('button', { name: 'Report a problem' }));
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), '  My session disappeared.  ');
  fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  expect(mockCaptureEvent).toHaveBeenCalledWith('ea_report', {
    message: '  My session disappeared.  ', screenshotAttached: false, screen: 'Profile',
  }, { screenshotFile: undefined });
  expect(mockSyncNow).not.toHaveBeenCalled();
  await act(async () => { capture.resolve({ saved: true, incidentRef }); });
  expect(mockSyncNow).toHaveBeenCalledTimes(1);
  expect(mockGetDeliveryState).not.toHaveBeenCalled();
  await act(async () => { sync.resolve({ success: true }); });
  expect(mockGetDeliveryState).toHaveBeenCalledWith(incidentRef);
  expect(screen.getByText('Sent. Thank you.')).toBeTruthy();
});

test.each(['offline', 'online transport failure', 'generic success', 'joined preexisting sync'])('%s reports an exact pending receipt as saved on the phone', async (scenario) => {
  const incidentRef = { id: 'pending-report', kind: 'ea_report', reportGeneration: 1 };
  mockCaptureEvent.mockResolvedValue({ saved: true, incidentRef });
  mockGetDeliveryState.mockResolvedValue('pending');
  if (scenario === 'offline') { mockIsOnline = false; mockSyncNow.mockResolvedValue(null); }
  if (scenario === 'online transport failure') mockSyncNow.mockRejectedValue(new Error('Transport unavailable'));
  if (scenario === 'joined preexisting sync') mockSyncNow.mockResolvedValue({ success: true, incidentsSent: 0 });
  const screen = renderProfile();
  fireEvent.press(screen.getByRole('button', { name: 'Support tools' }));
  fireEvent.press(screen.getByRole('button', { name: 'Report a problem' }));
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'My session disappeared');
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Send' })); });
  expect(mockGetDeliveryState).toHaveBeenCalledWith(incidentRef);
  expect(screen.getByText("Saved on your phone. It will send when you're online.")).toBeTruthy();
  expect(screen.queryByText('Sent. Thank you.')).toBeNull();
});

test.each(['unsaved', 'too large', 'rejected', 'attachment failure'])('%s shows an inline failure and never claims saved or sent', async (scenario) => {
  const incidentRef = { id: 'bad-report', kind: 'ea_report', reportGeneration: 1 };
  if (scenario === 'too large' || scenario === 'attachment failure') mockCaptureEvent.mockRejectedValue(new Error(scenario));
  else mockCaptureEvent.mockResolvedValue({ saved: scenario !== 'unsaved', incidentRef });
  mockGetDeliveryState.mockResolvedValue('rejected');
  const screen = renderProfile();
  fireEvent.press(screen.getByRole('button', { name: 'Support tools' }));
  fireEvent.press(screen.getByRole('button', { name: 'Report a problem' }));
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'Preserve this report for retry');
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Send' })); });
  expect(screen.queryByText('Sent. Thank you.')).toBeNull();
  expect(screen.queryByText("Saved on your phone. It will send when you're online.")).toBeNull();
  expect(screen.getByText('Could not save your report. Please try again.')).toBeTruthy();
  expect(screen.getByLabelText('What went wrong?').props.value).toBe('Preserve this report for retry');
  if (scenario !== 'rejected') expect(mockSyncNow).not.toHaveBeenCalled();
});

test.each(['capture', 'sync', 'delivery'])('sign-out during %s cannot continue as another EA or publish a toast', async (phase) => {
  let current = true;
  jest.spyOn(mockHandle, 'isCurrent').mockImplementation(() => current);
  const pending = deferred();
  const incidentRef = { id: 'old-ea-report', kind: 'ea_report', reportGeneration: 1 };
  mockCaptureEvent.mockResolvedValue({ saved: true, incidentRef });
  if (phase === 'capture') mockCaptureEvent.mockReturnValueOnce(pending.promise);
  if (phase === 'sync') mockSyncNow.mockReturnValueOnce(pending.promise);
  if (phase === 'delivery') mockGetDeliveryState.mockReturnValueOnce(pending.promise);
  const screen = renderProfile();
  fireEvent.press(screen.getByRole('button', { name: 'Support tools' }));
  fireEvent.press(screen.getByRole('button', { name: 'Report a problem' }));
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'Old EA report');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Send' })); });
  current = false;
  await act(async () => { pending.resolve(phase === 'capture' ? { saved: true, incidentRef } : phase === 'delivery' ? 'sent' : { success: true }); });
  if (phase === 'capture') expect(mockSyncNow).not.toHaveBeenCalled();
  if (phase !== 'delivery') expect(mockGetDeliveryState).not.toHaveBeenCalled();
  expect(screen.queryByText('Sent. Thank you.')).toBeNull();
  expect(screen.queryByText("Saved on your phone. It will send when you're online.")).toBeNull();
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
test('Support tools toggles and reveals reporting, diagnostics and the existing tools', () => {
  const screen = renderProfile();
  const support = () => screen.getByRole('button', { name: 'Support tools' });
  expect(support().props.accessibilityState).toMatchObject({ expanded: false });
  expect(screen.getByText(/Report\sa\sproblem · Send\sdiagnostics · Share\slogs · Share\sdatabase · Test\scrash\sreporting/)).toBeTruthy();
  expect(screen.queryByText('Share logs')).toBeNull();
  fireEvent.press(support());
  expect(support().props.accessibilityState).toMatchObject({ expanded: true });
  expect(screen.getByText('Report a problem or share app information with Masi')).toBeTruthy();
  for (const name of ['Report a problem', 'Send diagnostics', 'Share logs', 'Share database, sensitive', 'Test crash reporting']) {
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

test('Support tools shows Question gallery when the gallery is enabled', () => {
  mockGalleryEnabled = true;
  const navigation = { navigate: jest.fn() };
  const screen = render(<ProfileScreen navigation={navigation} />);
  expect(screen.queryByText('Question gallery')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Support tools' }));
  fireEvent.press(screen.getByRole('button', { name: 'Question gallery' }));
  expect(navigation.navigate).toHaveBeenCalledWith('QuestionGallery');
});

test('with __DEV__ false and no build flag, there is no Profile row', () => {
  const screen = renderProfile();
  fireEvent.press(screen.getByRole('button', { name: 'Support tools' }));
  expect(screen.queryByText('Question gallery')).toBeNull();
});
