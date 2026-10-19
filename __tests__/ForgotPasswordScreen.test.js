global.__MASI_NO_DEFAULT_HANDLE__ = true;
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { act, fireEvent, within } from '@testing-library/react-native';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { Snackbar } from 'react-native-paper';
import { renderWithProviders } from '../test-support/renderWithProviders';
import ForgotPasswordScreen from '../src/screens/auth/ForgotPasswordScreen';
import { borderRadius, colors, tints } from '../src/constants/colors';
import { fontFamilies, typeRoles } from '../src/constants/typography';

const mockResetPassword = jest.fn();
const mockInsets = { top: 47, bottom: 34, left: 0, right: 0 };
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ resetPassword: mockResetPassword }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockInsets,
  SafeAreaProvider: ({ children }) => children,
}));

const navigation = { goBack: jest.fn(), popTo: jest.fn(), setOptions: jest.fn() };
const EMAIL = 'asanda.mbeki@masinyusane.org';
const PARAGRAPH = 'Enter your email address and we’ll send you instructions to reset your password.';
const FORMAT = 'Please enter a valid email address';
const RATE_LIMIT = 'Too many reset emails were requested. Please wait a while and try again.';
const NOTE = 'Please check your email and follow the instructions to reset your password.';
const flat = (node) => StyleSheet.flatten(node.props.style);
const renderReset = () => renderWithProviders(<ForgotPasswordScreen navigation={navigation} />);
const fill = (screen, email = EMAIL) => fireEvent.changeText(screen.getByLabelText(/^Email/), email);
const send = (screen) => fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
const expectNoTransientMessage = (screen) => {
  expect(screen.UNSAFE_queryAllByType(Snackbar)).toHaveLength(0);
  expect(screen.queryByLabelText('Dismiss message')).toBeNull();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockResetPassword.mockReset().mockResolvedValue({ error: null });
  mockInsets.bottom = 34;
});
afterEach(() => jest.restoreAllMocks());

test('form content uses canvas primitives, exact copy and paragraph type', () => {
  const screen = renderReset();
  expect(flat(screen.getByText(PARAGRAPH))).toMatchObject({
    ...typeRoles.textParagraph, color: colors.textSecondary, maxWidth: 330,
  });
  expect(screen.getByLabelText('Email').props).toMatchObject({
    autoFocus: true, keyboardType: 'email-address', autoCapitalize: 'none', returnKeyType: 'send',
  });
  expect(screen.getByLabelText('Email').props.placeholder).toBeUndefined();
  expect(screen.getByRole('button', { name: 'Send reset link' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeTruthy();
  expect(screen.queryByRole('header')).toBeNull(); // The navigator owns the form heading.
  expect(flat(screen.UNSAFE_getByType(KeyboardAvoidingView))).toMatchObject({ backgroundColor: colors.background });
  expect(screen.UNSAFE_getByType(ScrollView).props).toMatchObject({
    keyboardShouldPersistTaps: 'handled',
    contentContainerStyle: expect.objectContaining({ paddingTop: 10, paddingHorizontal: 24 }),
  });
});

test.each(['', 'asanda.mbeki'])('invalid email %p has one field note and editing clears it', (email) => {
  const screen = renderReset();
  fill(screen, email);
  send(screen);
  expect(screen.getAllByText(FORMAT)).toHaveLength(1);
  expect(screen.getByRole('alert')).toHaveTextContent(FORMAT);
  expect(screen.getByLabelText(`Email, error: ${FORMAT}`)).toBeTruthy();
  expect(mockResetPassword).not.toHaveBeenCalled();
  expectNoTransientMessage(screen);
  fill(screen);
  expect(screen.queryByText(FORMAT)).toBeNull();
  expect(screen.getByLabelText('Email')).toBeTruthy();
});

test('rate limited response shows mapped copy above the button and clears on edit', async () => {
  mockResetPassword.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', status: 429 } });
  const screen = renderReset();
  fill(screen);
  send(screen);
  expect(await screen.findByRole('alert')).toHaveTextContent(RATE_LIMIT);
  const renderedText = screen.UNSAFE_getAllByType(Text).map((node) => node.props.children);
  expect(renderedText).toEqual(expect.arrayContaining([RATE_LIMIT, 'Send reset link']));
  expect(renderedText.indexOf(RATE_LIMIT)).toBeLessThan(renderedText.indexOf('Send reset link'));
  expect(flat(screen.getByRole('button', { name: 'Send reset link' })).marginTop).toBe(12);
  expect(screen.getByLabelText('Email')).toBeTruthy();
  expectNoTransientMessage(screen);
  fill(screen, 'other@example.org');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('no connection maps the original retryable fetch error', async () => {
  mockResetPassword.mockResolvedValue({ error: new AuthRetryableFetchError('Network request failed', 0) });
  const screen = renderReset();
  fill(screen);
  send(screen);
  expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t reach Masi. Check your internet connection and try again.');
  expectNoTransientMessage(screen);
});

test('pending disables the field and Back and refuses another press or return-key submission', async () => {
  let resolve;
  mockResetPassword.mockReturnValue(new Promise((done) => { resolve = done; }));
  const screen = renderReset();
  fill(screen);
  send(screen);
  const busy = screen.getByRole('button', { name: 'Sending…' });
  expect(busy.props.accessibilityState).toEqual({ busy: true, disabled: true });
  expect(screen.getByLabelText('Email').props.editable).toBe(false);
  expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeDisabled();
  fireEvent.press(busy);
  fireEvent(screen.getByLabelText('Email'), 'submitEditing');
  expect(mockResetPassword).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ error: null }));
});

test('sent state has one heading, emphasized email, decorative tile and pops to Login', async () => {
  const screen = renderReset();
  fill(screen);
  send(screen);
  const heading = await screen.findByRole('header', { name: 'Check your email' });
  expect(flat(heading)).toMatchObject({ ...typeRoles.displayTitle, color: colors.text, marginTop: 28, textAlign: 'center' });
  expect(screen.getAllByRole('header')).toHaveLength(1);
  const message = screen.getByText(/If an account exists with\s+asanda\.mbeki@masinyusane\.org,\s+you will receive a password reset link shortly\./);
  expect(flat(within(message).getByText(EMAIL))).toMatchObject({ fontFamily: fontFamilies.textHeavy });
  expect(flat(screen.getByText(NOTE))).toMatchObject({ ...typeRoles.textParagraph, color: colors.textSecondary, maxWidth: 300 });
  expect(flat(screen.getByText(NOTE)).fontStyle).not.toBe('italic');
  const tile = screen.getByTestId('reset-sent-tile', { includeHiddenElements: true });
  expect(flat(tile)).toMatchObject({ width: 80, height: 80, borderRadius: borderRadius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: tints.rule });
  expect(tile.props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
  expect(navigation.setOptions).toHaveBeenCalledWith({ title: '' });
  expect(flat(screen.getByTestId('reset-sent-footer'))).toMatchObject({ paddingHorizontal: 24, paddingBottom: 34 });
  fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
  expect(navigation.popTo).toHaveBeenCalledWith('Login');
  expect(navigation.goBack).not.toHaveBeenCalled();
});

test('form Back to sign in calls goBack', () => {
  const screen = renderReset();
  fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
  expect(navigation.popTo).not.toHaveBeenCalled();
});

test('a 42-character address renders whole without truncation and the footer keeps its minimum inset', async () => {
  mockInsets.bottom = 0;
  const email = 'nomvula.dlamini-khumalo@masinyusane.org.za';
  expect(email).toHaveLength(42);
  const screen = renderReset();
  fill(screen, email);
  send(screen);
  await screen.findByText('Check your email');
  const address = screen.getByText(email);
  expect(address.props.numberOfLines).toBeUndefined();
  expect(address.parent.props.numberOfLines).toBeUndefined();
  expect(flat(screen.getByTestId('reset-sent-footer')).paddingBottom).toBe(24);
});

test('return key preserves the existing at-sign validation and submits through the same path', async () => {
  const screen = renderReset();
  fireEvent(screen.getByLabelText('Email'), 'submitEditing');
  expect(mockResetPassword).not.toHaveBeenCalled();
  fill(screen, 'a@b'); // Reset intentionally does not use Login's stricter format rule.
  fireEvent(screen.getByLabelText('Email'), 'submitEditing');
  await screen.findByText('Check your email');
  expect(mockResetPassword).toHaveBeenCalledWith('a@b');
});

test.each(['ios', 'android'])('keyboard avoidance is iOS-only on %s', (platform) => {
  jest.replaceProperty(Platform, 'OS', platform);
  const screen = renderReset();
  expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props).toMatchObject({ behavior: 'padding', enabled: platform === 'ios' });
});
