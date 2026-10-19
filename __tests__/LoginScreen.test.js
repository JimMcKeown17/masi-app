global.__MASI_NO_DEFAULT_HANDLE__ = true;
import React from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput } from 'react-native';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { Snackbar } from 'react-native-paper';
import { renderWithProviders } from '../test-support/renderWithProviders';
import LoginScreen from '../src/screens/auth/LoginScreen';
import ForgotPasswordScreen from '../src/screens/auth/ForgotPasswordScreen';
import { borderRadius, colors, shadows } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

const mockSignIn = jest.fn();
const mockResetPassword = jest.fn();
const mockStatusBar = jest.fn();
let mockListener;
const mockUnsubscribe = jest.fn();
let mockKeyboardHeight = 0;
let mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
const mockInsets = { top: 47, bottom: 34, left: 0, right: 0 };

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ signIn: mockSignIn, resetPassword: mockResetPassword }) }));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn((listener) => { mockListener = listener; return mockUnsubscribe; }),
}));
jest.mock('../src/hooks/useKeyboardHeight', () => ({ useKeyboardHeight: () => mockKeyboardHeight }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true, default: () => mockWindow,
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockInsets,
  SafeAreaProvider: ({ children }) => children,
}));
jest.mock('../src/components/common/FocusAwareStatusBar', () => ({
  __esModule: true, default: (props) => { mockStatusBar(props); return null; },
}));

const EMPTY = 'Please enter both email and password';
const FORMAT = 'Please enter a valid email address';
const OFFLINE = 'You’re offline. Sign in needs the internet.';
const CONNECTION = 'Couldn’t reach Masi. Check your internet connection and try again.';
const FOOTNOTE = 'This app is for Masinyusane staff only.';
const fieldError = (input) => input.props.accessibilityHint ?? input.props.accessibilityLabel.split(', error: ')[1];
const emailField = () => screen.getByLabelText(/^Email/);
const passwordField = () => screen.getByLabelText(/^Password/);
const signInButton = () => screen.getByRole('button', { name: 'Sign in' });
const renderLogin = () => renderWithProviders(<LoginScreen navigation={{ navigate: jest.fn() }} />);
const rerenderLogin = () => screen.rerender(<LoginScreen navigation={{ navigate: jest.fn() }} />);
const flat = (node) => StyleSheet.flatten(node.props.style);
function fillLogin(email = 'asanda.mbeki@masinyusane.org', password = 'test-password') {
  fireEvent.changeText(emailField(), email);
  fireEvent.changeText(passwordField(), password);
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function expectNoTransientMessage() {
  expect(screen.UNSAFE_queryAllByType(Snackbar)).toHaveLength(0);
  expect(screen.queryByLabelText('Dismiss message')).toBeNull();
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockSignIn.mockReset();
  mockSignIn.mockResolvedValue({ data: {}, error: null });
  mockResetPassword.mockReset();
  mockKeyboardHeight = 0;
  mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
  Object.assign(mockInsets, { top: 47, bottom: 34, left: 0, right: 0 });
  mockListener = undefined;
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('renders the board’s content', () => {
  renderLogin();
  expect(screen.getByRole('header', { name: 'Sign in' })).toBeTruthy();
  expect(emailField().props.placeholder).toBe('you@masinyusane.org');
  expect(passwordField().props.placeholder).toBe('Your password');
  expect(signInButton()).toBeTruthy();
  expect(screen.getByText(FOOTNOTE)).toBeTruthy();
  expect(screen.getByLabelText('Masinyusane')).toBeTruthy();
  expect(screen.queryByText('Sign in to continue')).toBeNull();
  expect(mockStatusBar).toHaveBeenLastCalledWith({ style: 'light' });
});

test('Forgot password is hidden', () => {
  renderLogin();
  expect(screen.queryByText(/forgot password/i)).toBeNull();
  expect(screen.queryByLabelText(/forgot password/i)).toBeNull();
});

test('both empty: one form note, each ring clears only when its field gets a value', () => {
  renderLogin();
  fireEvent.press(signInButton());
  expect(within(screen.getByTestId('login-form-note')).getByText(EMPTY)).toBeTruthy();
  expect(fieldError(emailField())).toBe(EMPTY);
  expect(fieldError(passwordField())).toBe(EMPTY);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(mockSignIn).not.toHaveBeenCalled();
  fireEvent.changeText(emailField(), '');
  expect(fieldError(emailField())).toBe(EMPTY);
  fireEvent.changeText(emailField(), 'ea@example.com');
  expect(fieldError(emailField())).toBeUndefined();
  expect(fieldError(passwordField())).toBe(EMPTY);
  expect(screen.getByText(EMPTY)).toBeTruthy();
  fireEvent.changeText(passwordField(), 'test-password');
  expect(screen.queryByText(EMPTY)).toBeNull();
  expect(fieldError(passwordField())).toBeUndefined();
});

test.each(['password', 'email'])('only %s empty marks only that field', (emptyField) => {
  renderLogin();
  fillLogin(emptyField === 'email' ? '' : 'asanda.mbeki@masinyusane.org', emptyField === 'password' ? '' : 'test-password');
  fireEvent.press(signInButton());
  expect(fieldError(emailField())).toBe(emptyField === 'email' ? EMPTY : undefined);
  expect(fieldError(passwordField())).toBe(emptyField === 'password' ? EMPTY : undefined);
  expect(screen.getByText(EMPTY)).toBeTruthy();
  expect(mockSignIn).not.toHaveBeenCalled();
});

test('invalid email: a field note survives Password edits and clears on Email edit', () => {
  renderLogin();
  fillLogin('asanda.mbeki@masinyusane');
  fireEvent.press(signInButton());
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(screen.getByText(FORMAT)).toBeTruthy();
  expect(fieldError(emailField())).toBe(FORMAT);
  expect(fieldError(passwordField())).toBeUndefined();
  expect(screen.queryByTestId('login-form-note')).toBeNull();
  expect(mockSignIn).not.toHaveBeenCalled();
  fireEvent.changeText(passwordField(), 'another-password');
  expect(screen.getByText(FORMAT)).toBeTruthy();
  fireEvent.changeText(emailField(), 'asanda.mbeki@masinyusane.org');
  expect(screen.queryByText(FORMAT)).toBeNull();
});

test('invalid credentials: form note clears on edit and before the next request resolves', async () => {
  mockSignIn.mockResolvedValue({ data: null, error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 } });
  renderLogin();
  fillLogin();
  await act(async () => fireEvent.press(signInButton()));
  expect(within(screen.getByTestId('login-form-note')).getByText('Invalid login credentials')).toBeTruthy();
  expect(fieldError(emailField())).toBeUndefined();
  expect(fieldError(passwordField())).toBeUndefined();
  fireEvent.changeText(passwordField(), 'another-password');
  expect(screen.queryByText('Invalid login credentials')).toBeNull();
  await act(async () => fireEvent.press(signInButton()));
  expect(screen.getByText('Invalid login credentials')).toBeTruthy();
  const request = deferred();
  mockSignIn.mockReturnValueOnce(request.promise);
  fireEvent.press(signInButton());
  expect(screen.queryByText('Invalid login credentials')).toBeNull();
  await act(async () => request.resolve({ data: {}, error: null }));
});

test('suspended EA sees supervisor copy inline, never the raw message', async () => {
  mockSignIn.mockResolvedValue({ data: null, error: { code: 'user_banned', message: 'User is banned', status: 400 } });
  renderLogin();
  fillLogin();
  await act(async () => fireEvent.press(signInButton()));
  expect(within(screen.getByTestId('login-form-note')).getByText('Your access is paused. Please contact your supervisor.')).toBeTruthy();
  expect(screen.queryByText(/User is banned/)).toBeNull();
});

test('no connection shows mapped copy', async () => {
  mockSignIn.mockResolvedValue({ data: null, error: new AuthRetryableFetchError('Network request failed', 0) });
  renderLogin();
  fillLogin();
  await act(async () => fireEvent.press(signInButton()));
  expect(screen.getByText(CONNECTION)).toBeTruthy();
});

test('unknown error shows safe fallback', async () => {
  mockSignIn.mockResolvedValue({ error: { message: 'boom' } });
  renderLogin();
  fillLogin();
  await act(async () => fireEvent.press(signInButton()));
  expect(screen.getByText('Couldn’t sign in. Please try again.')).toBeTruthy();
  expect(screen.queryByText('boom')).toBeNull();
});

test('while signing in: busy, disabled fields and eye; taps and go do not sign in twice', async () => {
  const request = deferred();
  mockSignIn.mockReturnValue(request.promise);
  renderLogin();
  fillLogin();
  fireEvent.press(signInButton());
  const busy = screen.getByRole('button', { name: 'Signing in…' });
  expect(busy.props.accessibilityState).toEqual({ busy: true, disabled: true });
  expect(emailField().props.editable).toBe(false);
  expect(passwordField().props.editable).toBe(false);
  expect(screen.getByLabelText('Show password').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText('Show password'));
  expect(passwordField().props.secureTextEntry).toBe(true);
  fireEvent.press(busy);
  fireEvent(passwordField(), 'submitEditing');
  expect(mockSignIn).toHaveBeenCalledTimes(1);
  expect(mockSignIn).toHaveBeenCalledWith('asanda.mbeki@masinyusane.org', 'test-password');
  await act(async () => request.resolve({ data: {}, error: null }));
});

test('button and Go before a render submit once and allow a retry after failure', async () => {
  const request = deferred();
  mockSignIn.mockReturnValue(request.promise);
  renderLogin();
  fireEvent.press(signInButton()); // Validation must not acquire the submission guard.
  fillLogin();
  const button = signInButton();
  const password = passwordField();
  act(() => {
    fireEvent.press(button);
    fireEvent(password, 'submitEditing');
  });
  try {
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => request.resolve({ data: null, error: { status: 503 } }));
  }
  expect(signInButton()).toBeEnabled();
  mockSignIn.mockResolvedValue({ data: {}, error: null });
  await act(async () => fireEvent(passwordField(), 'submitEditing'));
  expect(mockSignIn).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
});

test('go with empty fields validates', () => {
  renderLogin();
  fireEvent(passwordField(), 'submitEditing');
  expect(screen.getByText(EMPTY)).toBeTruthy();
  expect(mockSignIn).not.toHaveBeenCalled();
});

test('success leaves the button busy and unmounts cleanly', async () => {
  const errors = jest.spyOn(console, 'error');
  const request = deferred();
  mockSignIn.mockReturnValue(request.promise);
  const view = renderLogin();
  fillLogin();
  fireEvent.press(signInButton());
  await act(async () => request.resolve({ data: {}, error: null }));
  expect(screen.getByRole('button', { name: 'Signing in…' }).props.accessibilityState.busy).toBe(true);
  view.unmount();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  expect(errors).not.toHaveBeenCalled();
});

test('offline caption is definite-only, announces once per appearance and permits sign-in', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  renderLogin();
  expect(screen.queryByText(OFFLINE)).toBeNull();
  act(() => mockListener({ isConnected: false, isInternetReachable: null }));
  expect(screen.getByText(OFFLINE).props.accessibilityLiveRegion).toBe('polite');
  fillLogin();
  rerenderLogin();
  act(() => mockListener({ isConnected: false, isInternetReachable: null }));
  expect(Platform.OS).toBe('ios');
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenLastCalledWith(OFFLINE);
  await act(async () => fireEvent.press(signInButton()));
  expect(mockSignIn).toHaveBeenCalledWith('asanda.mbeki@masinyusane.org', 'test-password');
  act(() => mockListener({ isConnected: true, isInternetReachable: true }));
  expect(screen.queryByText(OFFLINE)).toBeNull();
  act(() => mockListener({ isConnected: true, isInternetReachable: false }));
  expect(screen.getByText(OFFLINE)).toBeTruthy();
  expect(announce).toHaveBeenCalledTimes(2);
  act(() => mockListener({ isConnected: null, isInternetReachable: null }));
  expect(screen.queryByText(OFFLINE)).toBeNull();
});

test('offline mid-request keeps busy, then connection note survives reconnect until an edit', async () => {
  const request = deferred();
  mockSignIn.mockReturnValue(request.promise);
  renderLogin();
  fillLogin();
  fireEvent.press(signInButton());
  act(() => mockListener({ isConnected: false, isInternetReachable: null }));
  expect(screen.getByText(OFFLINE)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Signing in…' }).props.accessibilityState.busy).toBe(true);
  await act(async () => request.resolve({ data: null, error: new AuthRetryableFetchError('Network request failed', 0) }));
  expect(screen.getByText(CONNECTION)).toBeTruthy();
  expect(screen.getByText(OFFLINE)).toBeTruthy();
  act(() => mockListener({ isConnected: true, isInternetReachable: true }));
  expect(screen.queryByText(OFFLINE)).toBeNull();
  expect(screen.getByText(CONNECTION)).toBeTruthy();
  fireEvent.changeText(emailField(), 'another@example.com');
  expect(screen.queryByText(CONNECTION)).toBeNull();
});

test('eye button shows and hides the password', () => {
  renderLogin();
  expect(passwordField().props.secureTextEntry).toBe(true);
  fireEvent.press(screen.getByLabelText('Show password'));
  expect(screen.getByLabelText('Hide password')).toBeTruthy();
  expect(passwordField().props.secureTextEntry).toBe(false);
  fireEvent.press(screen.getByLabelText('Hide password'));
  expect(passwordField().props.secureTextEntry).toBe(true);
});

test('Email submit moves to Password and keeps the keyboard up', () => {
  renderLogin();
  const focus = require('react-native/jest/MockNativeMethods').default.focus;
  focus.mockClear();
  expect(emailField().props.returnKeyType).toBe('next');
  expect(emailField().props.submitBehavior).toBe('submit');
  expect(passwordField().props.returnKeyType).toBe('go');
  fireEvent(emailField(), 'submitEditing');
  expect(focus).toHaveBeenCalledTimes(1);
  expect(mockSignIn).not.toHaveBeenCalled();
});

test('no Snackbar or toast in validation, server-error or offline states', async () => {
  renderLogin();
  fireEvent.press(signInButton());
  expectNoTransientMessage();
  fillLogin();
  mockSignIn.mockResolvedValue({ error: { code: 'invalid_credentials', status: 400 } });
  await act(async () => fireEvent.press(signInButton()));
  expectNoTransientMessage();
  act(() => mockListener({ isConnected: false, isInternetReachable: null }));
  expectNoTransientMessage();
});

test('panel, heading, button and footnote use board tokens with a scroll fallback', () => {
  renderLogin();
  expect(flat(screen.getByTestId('login-root'))).toMatchObject({ flex: 1, backgroundColor: colors.red600 });
  expect(flat(screen.getByTestId('login-panel'))).toMatchObject({
    backgroundColor: colors.red700, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl,
    paddingTop: 24, paddingHorizontal: 24, paddingBottom: 34,
  });
  expect(flat(screen.getByTestId('login-panel')).shadowColor).toBeUndefined();
  const heading = screen.getByRole('header', { name: 'Sign in' });
  expect(flat(heading)).toMatchObject({ ...typeRoles.display2XL, color: colors.onDark });
  expect(heading.props.maxFontSizeMultiplier).toBe(1.2);
  expect(flat(screen.getByText(FOOTNOTE))).toMatchObject({ ...typeRoles.textCaption, color: colors.red50, textAlign: 'center', marginTop: 16 });
  expect(flat(signInButton())).toMatchObject({ ...shadows.onRedButton, minHeight: 56, backgroundColor: colors.surface, marginTop: 20 });
  expect(flat(screen.getByTestId('brand-lockup'))).toMatchObject({ position: 'absolute', left: 24, top: 56 });
  const scroll = screen.UNSAFE_getByType(ScrollView);
  expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  expect(scroll.props.bounces).toBe(false);
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({ flexGrow: 1 });
  expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props).toMatchObject({ behavior: 'padding', enabled: true });
  mockInsets.bottom = 0;
  rerenderLogin();
  expect(flat(screen.getByTestId('login-panel')).paddingBottom).toBe(24);
});

test.each(['android', 'ios'])('keyboard padding is active on %s with large text and notes', (platform) => {
  jest.replaceProperty(Platform, 'OS', platform);
  mockWindow = { ...mockWindow, width: 360, height: 640, fontScale: 1.3 };
  mockKeyboardHeight = 280;
  renderLogin();
  act(() => mockListener({ isConnected: false, isInternetReachable: null }));
  fireEvent(passwordField(), 'submitEditing');
  expect(screen.getByText(OFFLINE)).toBeTruthy();
  expect(screen.getByText(EMPTY)).toBeTruthy();
  expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props).toMatchObject({
    behavior: 'padding', enabled: true,
  });
  expect(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle).toEqual({ flexGrow: 1 });
});

describe('layout', () => {
  const layoutPanel = (y, contentHeight) => {
    fireEvent(screen.getByTestId('login-panel'), 'layout', { persist: jest.fn(), nativeEvent: { layout: { y, height: contentHeight + 58 } } });
    fireEvent(screen.getByTestId('login-panel-content'), 'layout', { persist: jest.fn(), nativeEvent: { layout: { height: contentHeight } } });
  };

  test('art waits for the first panel layout', () => {
    renderLogin();
    expect(screen.queryByTestId('login-hero-art', { includeHiddenElements: true })).toBeNull();
    layoutPanel(484, 312);
    expect(screen.getByTestId('login-hero-art', { includeHiddenElements: true })).toBeTruthy();
  });

  test('keyboard hides the art and keeps the lockup', () => {
    renderLogin();
    layoutPanel(484, 312);
    mockKeyboardHeight = 336;
    rerenderLogin();
    expect(screen.queryByTestId('login-hero-art', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText('Masinyusane')).toBeTruthy();
    expect(flat(screen.getByTestId('login-spacer'))).toEqual({ height: 130 });
    expect(flat(screen.getByTestId('login-panel'))).toMatchObject({ flexGrow: 1, paddingTop: 24, paddingBottom: 24 });
  });

  test('compact keyboard hides the lockup and steps the heading down', () => {
    mockWindow = { ...mockWindow, width: 360, height: 640 };
    mockInsets.top = 24;
    renderLogin();
    layoutPanel(292, 300);
    mockKeyboardHeight = 280;
    rerenderLogin();
    expect(screen.queryByLabelText('Masinyusane')).toBeNull();
    expect(screen.queryByTestId('login-hero-art', { includeHiddenElements: true })).toBeNull();
    expect(flat(screen.getByRole('header', { name: 'Sign in' }))).toMatchObject(typeRoles.displaySheetTitle);
    expect(flat(screen.getByText(FOOTNOTE)).marginTop).toBe(12);
    expect(flat(screen.getByTestId('login-spacer'))).toEqual({ height: 24 });
    expect(flat(screen.getByTestId('login-panel'))).toMatchObject({ flexGrow: 1, paddingTop: 16, paddingBottom: 24 });
    expect(flat(screen.getByTestId('login-email-field')).marginTop).toBe(12);
    act(() => mockListener({ isConnected: false, isInternetReachable: null }));
    expect(flat(screen.getByTestId('login-email-field')).marginTop).toBe(16);
  });

  test('compact uses the height measured with the note', () => {
    mockWindow = { ...mockWindow, width: 360, height: 780 };
    mockInsets.top = 24;
    renderLogin();
    layoutPanel(432, 290);
    mockKeyboardHeight = 300;
    rerenderLogin();
    expect(screen.getByLabelText('Masinyusane')).toBeTruthy();
    mockKeyboardHeight = 0;
    rerenderLogin();
    fireEvent.press(signInButton());
    layoutPanel(382, 340);
    mockKeyboardHeight = 300;
    rerenderLogin();
    expect(screen.queryByLabelText('Masinyusane')).toBeNull();
  });

  test('a note growing while the keyboard is open recomputes compact without a panel-position change', () => {
    mockWindow = { ...mockWindow, width: 360, height: 780 };
    mockInsets.top = 24;
    renderLogin();
    layoutPanel(432, 290);
    mockKeyboardHeight = 300;
    rerenderLogin();
    fireEvent.press(signInButton());
    fireEvent(screen.getByTestId('login-panel-content'), 'layout', { persist: jest.fn(), nativeEvent: { layout: { height: 340 } } });
    expect(screen.queryByLabelText('Masinyusane')).toBeNull();
    // The compact column is smaller; measuring it must not switch back and oscillate.
    fireEvent(screen.getByTestId('login-panel-content'), 'layout', { persist: jest.fn(), nativeEvent: { layout: { height: 280 } } });
    expect(screen.queryByLabelText('Masinyusane')).toBeNull();
  });

  test.each(['error', 'offline'])('the art does not move when the %s note appears', (note) => {
    renderLogin();
    layoutPanel(484, 312);
    const top = flat(screen.getByTestId('login-hero-learner', { includeHiddenElements: true })).top;
    if (note === 'error') fireEvent.press(signInButton());
    else act(() => mockListener({ isConnected: false, isInternetReachable: null }));
    layoutPanel(420, 376);
    expect(flat(screen.getByTestId('login-hero-learner', { includeHiddenElements: true })).top).toBe(top);
  });

  test('large text on a short phone drops the art', () => {
    mockWindow = { ...mockWindow, width: 360, height: 640, fontScale: 1.3 };
    mockInsets.top = 24;
    renderLogin();
    layoutPanel(150, 432);
    expect(screen.queryByTestId('login-hero-art', { includeHiddenElements: true })).toBeNull();
  });

  test('closing the keyboard restores the rest heading, inset and anchored art', () => {
    mockWindow = { ...mockWindow, width: 360, height: 640 };
    mockInsets.top = 24;
    renderLogin();
    layoutPanel(292, 300);
    const top = flat(screen.getByTestId('login-hero-learner', { includeHiddenElements: true })).top;
    mockKeyboardHeight = 280;
    rerenderLogin();
    layoutPanel(24, 280);
    mockKeyboardHeight = 0;
    rerenderLogin();
    layoutPanel(292, 300);
    expect(flat(screen.getByRole('header', { name: 'Sign in' }))).toMatchObject(typeRoles.display2XL);
    expect(flat(screen.getByTestId('login-panel')).paddingBottom).toBe(34);
    expect(screen.getByLabelText('Masinyusane')).toBeTruthy();
    expect(flat(screen.getByTestId('login-hero-learner', { includeHiddenElements: true })).top).toBe(top);
  });

  test('Android uses keyboard padding with the scroll fallback under edge-to-edge', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    renderLogin();
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props).toMatchObject({ behavior: 'padding', enabled: true });
    expect(screen.UNSAFE_getByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled');
  });
});

test('reset errors use reset copy and never reveal raw server text', async () => {
  mockResetPassword.mockResolvedValue({ error: { message: 'boom' } });
  renderWithProviders(<ForgotPasswordScreen navigation={{ popTo: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }} />);
  fireEvent.changeText(screen.UNSAFE_getByType(TextInput), 'ea@example.com');
  await act(async () => fireEvent.press(screen.getByText('Send reset link')));
  expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t send the reset link. Please try again.');
  expect(screen.queryByText('boom')).toBeNull();
});

test('reset validation uses the existing copy and successful sends keep the existing confirmation', async () => {
  mockResetPassword.mockResolvedValue({ error: null });
  renderWithProviders(<ForgotPasswordScreen navigation={{ popTo: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }} />);
  fireEvent.press(screen.getByText('Send reset link'));
  expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address');
  expect(mockResetPassword).not.toHaveBeenCalled();
  fireEvent.changeText(screen.UNSAFE_getByType(TextInput), 'ea@example.com');
  await act(async () => fireEvent.press(screen.getByText('Send reset link')));
  act(() => jest.advanceTimersByTime(200));
  expect(screen.getByText('Check your email')).toBeTruthy();
  expect(screen.getByText('If an account exists with ea@example.com, you will receive a password reset link shortly.')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
