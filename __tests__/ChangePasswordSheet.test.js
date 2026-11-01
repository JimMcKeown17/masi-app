import React, { useState } from 'react';
import { BackHandler, Pressable, ScrollView, Text } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders as render } from '../test-support/renderWithProviders';
import ChangePasswordSheet from '../src/components/profile/ChangePasswordSheet';
import BottomSheet from '../src/components/common/BottomSheet';
import TextField from '../src/components/common/TextField';
import ToastHost from '../src/components/common/Toast';
import { ToastActorScope } from '../src/context/ToastContext';
import { PASSWORD_VERIFICATION_FAILED_MESSAGE } from '../src/utils/passwordChange';
import { StaleActorError } from '../src/session/staleActor';
import { colors, spacing } from '../src/constants/colors';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('react-native-safe-area-context', () => {
  const ReactForMock = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    useSafeAreaInsets: () => insets,
    SafeAreaInsetsContext: ReactForMock.createContext(insets),
    SafeAreaProvider: ({ children }) => <>{children}</>,
  };
});

const SUCCESS = 'Password changed successfully';
const INVALID = { phase: 'verification', error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } };
const OK = { phase: 'update', error: null };
const labels = ['Current password', 'New password', 'Confirm new password'];
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

function Harness({ onClose, ...props }) {
  const [visible, setVisible] = useState(true);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Open password" onPress={() => setVisible(true)}><Text>Open password</Text></Pressable>
    <ChangePasswordSheet {...props} visible={visible} onClose={() => { onClose(); setVisible(false); }} />
  </>;
}

function renderSheet(overrides = {}) {
  const handle = overrides.handle ?? { isCurrent: jest.fn(() => true), userId: 'ea-1', epoch: 1 };
  const onClose = jest.fn();
  const changePassword = overrides.changePassword ?? jest.fn().mockResolvedValue(OK);
  const ui = render(<ToastActorScope handle={handle}><Harness handle={handle} onClose={onClose} changePassword={changePassword} /></ToastActorScope>);
  return { ...ui, handle, onClose, changePassword };
}
const input = (ui, label) => ui.getByLabelText(new RegExp(`^${label}(, error:|$)`));
const inputs = (ui) => labels.map((label) => input(ui, label));
const fill = (ui, current = 'current-password', next = 'new-password', confirm = next) => {
  [current, next, confirm].forEach((value, index) => fireEvent.changeText(input(ui, labels[index]), value));
};
const submit = (ui) => fireEvent.press(ui.getByTestId('change-password-submit'));
const reopen = (ui) => fireEvent.press(ui.getByRole('button', { name: 'Open password' }));
const toast = (ui) => ui.UNSAFE_getByType(ToastHost).props.toast;
const expectToast = (ui, message, tone) => {
  expect(ui.getAllByText(message)).toHaveLength(1);
  expect(toast(ui)).toMatchObject({ message, tone, duration: 4000, actorKey: 'ea-1:1' });
};
const layout = (node, y, height) => fireEvent(node, 'layout', { nativeEvent: { layout: { x: 0, y, width: 312, height } } });
const measure = (ui, height = 120) => {
  const scroll = ui.UNSAFE_getByType(ScrollView);
  layout(scroll, 0, height);
  ['current', 'new', 'confirm', 'notes'].forEach((key, index) => layout(ui.getByTestId(`password-block-${key}`), index * 114, index === 3 ? 40 : 102));
  const scrollTo = scroll.instance.scrollTo;
  scrollTo.mockClear();
  return { scroll, scrollTo };
};

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('empty fields show the form note and mark no field', async () => {
  const ui = renderSheet();
  await act(async () => { await submit(ui); });
  expect(ui.getByRole('alert')).toHaveTextContent('All password fields are required');
  inputs(ui).forEach((field, index) => expect(field.props.accessibilityLabel).toBe(labels[index]));
  expect(ui.changePassword).not.toHaveBeenCalled();
  expect(toast(ui)).toBeNull();
});

test.each([
  ['short new password', '1234567', '1234567', 'New password', 'New password must be at least 8 characters'],
  ['mismatch', '12345678', 'different', 'Confirm new password', 'New passwords do not match'],
])('%s is reported under the appropriate field', async (_name, next, confirm, label, message) => {
  const ui = renderSheet();
  fill(ui, 'a', next, confirm);
  await act(async () => { await submit(ui); });
  expect(ui.getByRole('alert')).toHaveTextContent(message);
  expect(ui.getByLabelText(`${label}, error: ${message}`)).toBeTruthy();
  expect(ui.changePassword).not.toHaveBeenCalled();
});

test('an incorrect current password is reported under Current without a toast', async () => {
  const ui = renderSheet({ changePassword: jest.fn().mockResolvedValue(INVALID) });
  fill(ui);
  await act(async () => { await submit(ui); });
  expect(ui.getByLabelText('Current password, error: Current password is incorrect')).toBeTruthy();
  expect(ui.getByRole('alert')).toHaveTextContent('Current password is incorrect');
  expect(toast(ui)).toBeNull();
  expect(console.error).toHaveBeenCalledWith('Password verification error:', INVALID.error);
});

test('a network failure during verification never blames Current', async () => {
  const ui = renderSheet({ changePassword: jest.fn().mockResolvedValue({ phase: 'verification', error: { message: 'Network request failed', status: 0 } }) });
  fill(ui);
  await act(async () => { await submit(ui); });
  expect(ui.getByRole('alert')).toHaveTextContent(PASSWORD_VERIFICATION_FAILED_MESSAGE);
  expect(ui.queryByText('Current password is incorrect')).toBeNull();
  expect(ui.getByLabelText('Current password')).toBeTruthy();
  expect(toast(ui)).toBeNull();
});

test.each([
  [{ message: 'Password too weak' }, 'Password too weak'],
  [{}, 'Failed to change password'],
])('an update error shows its message or the fallback: %p', async (error, message) => {
  const ui = renderSheet({ changePassword: jest.fn().mockResolvedValue({ phase: 'update', error }) });
  fill(ui);
  await act(async () => { await submit(ui); });
  expect(ui.getByRole('alert')).toHaveTextContent(message);
  expect(console.error).toHaveBeenCalledWith('Password change error:', error);
});

test('a thrown rejection shows the update failure inline and unlocks the form', async () => {
  const error = new Error('Request failed');
  const ui = renderSheet({ changePassword: jest.fn().mockRejectedValue(error) });
  fill(ui);
  await act(async () => { await submit(ui); });
  expect(ui.getByRole('alert')).toHaveTextContent('Request failed');
  expect(console.error).toHaveBeenCalledWith('Password change error:', error);
  expect(ui.getByTestId('change-password-submit').props.accessibilityState.busy).toBe(false);
});

test('loading locks the fields and refuses a second button or keyboard submit', async () => {
  const pending = deferred();
  const ui = renderSheet({ changePassword: jest.fn(() => pending.promise) });
  fill(ui);
  let request;
  // Both callbacks can arrive before React has committed the loading render.
  act(() => { request = submit(ui); fireEvent(input(ui, 'Confirm new password'), 'submitEditing'); });
  expect(request).toBeInstanceOf(Promise);
  inputs(ui).forEach((field) => expect(field.props.editable).toBe(false));
  expect(ui.getByTestId('change-password-submit').props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  expect(ui.getByTestId('change-password-submit')).toHaveStyle({ backgroundColor: colors.primary });
  submit(ui);
  expect(ui.changePassword).toHaveBeenCalledTimes(1);
  expect(ui.changePassword).toHaveBeenCalledWith({ currentPassword: 'current-password', newPassword: 'new-password', handle: ui.handle });
  fireEvent.press(ui.getByRole('button', { name: 'Show passwords' }));
  inputs(ui).forEach((field) => expect(field.props.secureTextEntry).toBe(false));
  await act(async () => { pending.resolve(OK); await request; });
});

test('success closes the sheet and toasts, and reopening starts empty', async () => {
  const ui = renderSheet();
  fill(ui);
  await act(async () => { await submit(ui); });
  expect(ui.onClose).toHaveBeenCalledTimes(1);
  expectToast(ui, SUCCESS, 'success');
  reopen(ui);
  inputs(ui).forEach((field) => expect(field.props.value).toBe(''));
});

test('editing a field clears its own error and any form error', async () => {
  const ui = renderSheet();
  fill(ui, 'a', '12345678', 'different');
  await act(async () => { await submit(ui); });
  fireEvent.changeText(input(ui, 'Current password'), 'another');
  expect(ui.getByText('New passwords do not match')).toBeTruthy();
  fireEvent.changeText(input(ui, 'Confirm new password'), '12345678');
  expect(ui.queryByText('New passwords do not match')).toBeNull();
  fireEvent.changeText(input(ui, 'Current password'), '');
  await act(async () => { await submit(ui); });
  expect(ui.getByText('All password fields are required')).toBeTruthy();
  fireEvent.changeText(input(ui, 'New password'), 'another-password');
  expect(ui.queryByText('All password fields are required')).toBeNull();
});

test.each(['Cancel', 'backdrop', 'Android Back'])('%s clears fields, errors and Show passwords', async (action) => {
  const backSpy = jest.spyOn(BackHandler, 'addEventListener');
  const ui = renderSheet();
  fill(ui, 'a', 'short', 'short');
  await act(async () => { await submit(ui); });
  fireEvent.press(ui.getByRole('button', { name: 'Show passwords' }));
  if (action === 'Cancel') fireEvent.press(ui.getByRole('button', { name: 'Cancel' }));
  else if (action === 'backdrop') fireEvent.press(ui.getByLabelText('Dismiss change password'));
  else {
    const handlers = backSpy.mock.calls.filter(([event]) => event === 'hardwareBackPress');
    act(() => { expect(handlers.at(-1)[1]()).toBe(true); });
  }
  expect(ui.onClose).toHaveBeenCalledTimes(1);
  reopen(ui);
  inputs(ui).forEach((field) => {
    expect(field.props.value).toBe('');
    expect(field.props.secureTextEntry).toBe(true);
  });
  expect(ui.getByRole('button', { name: 'Show passwords' })).toBeTruthy();
  expect(ui.queryByRole('alert')).toBeNull();
});

test.each([
  ['Cancel', OK, SUCCESS, 'success'],
  ['backdrop', INVALID, 'Current password is incorrect', 'error'],
])('dismissing via %s during a request reports its outcome once as a toast', async (action, outcome, message, tone) => {
  const pending = deferred();
  const ui = renderSheet({ changePassword: jest.fn(() => pending.promise) });
  fill(ui);
  const request = submit(ui);
  fireEvent.press(action === 'Cancel' ? ui.getByRole('button', { name: 'Cancel' }) : ui.getByLabelText('Dismiss change password'));
  await act(async () => { pending.resolve(outcome); await request; });
  expectToast(ui, message, tone);
  expect(ui.onClose).toHaveBeenCalledTimes(1);
  reopen(ui);
  expect(ui.UNSAFE_getAllByType(TextField).every((field) => !field.props.error)).toBe(true);
  inputs(ui).forEach((field) => expect(field.props.value).toBe(''));
});

test('a reopened sheet is usable and keeps new input while the abandoned request finishes', async () => {
  const pending = deferred();
  const ui = renderSheet({ changePassword: jest.fn(() => pending.promise) });
  fill(ui);
  const request = submit(ui);
  fireEvent.press(ui.getByRole('button', { name: 'Cancel' }));
  reopen(ui);
  expect(ui.getByTestId('change-password-submit').props.accessibilityState.busy).toBe(false);
  inputs(ui).forEach((field) => {
    expect(field.props.editable).not.toBe(false);
    expect(field.props.value).toBe('');
  });
  fireEvent.changeText(input(ui, 'Current password'), 'new attempt');
  await act(async () => { pending.resolve(OK); await request; });
  expectToast(ui, SUCCESS, 'success');
  expect(input(ui, 'Current password').props.value).toBe('new attempt');
  expect(ui.onClose).toHaveBeenCalledTimes(1);
});

test('an abandoned attempt cannot unlock or set errors on a newer running attempt', async () => {
  const first = deferred(); const second = deferred();
  const ui = renderSheet({ changePassword: jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) });
  fill(ui);
  const firstRequest = submit(ui);
  fireEvent.press(ui.getByRole('button', { name: 'Cancel' }));
  reopen(ui);
  fill(ui);
  const secondRequest = submit(ui);
  await act(async () => { first.resolve(INVALID); await firstRequest; });
  expectToast(ui, 'Current password is incorrect', 'error');
  expect(ui.getByTestId('change-password-submit').props.accessibilityState.busy).toBe(true);
  expect(ui.UNSAFE_getAllByType(TextField).every((field) => !field.props.error)).toBe(true);
  inputs(ui).forEach((field) => expect(field.props.editable).toBe(false));
  await act(async () => { second.resolve(OK); await secondRequest; });
  expect(ui.onClose).toHaveBeenCalledTimes(2);
  expectToast(ui, SUCCESS, 'success');
});

test('unmounting the sheet preserves the late outcome in the same actor session', async () => {
  const pending = deferred();
  const ui = renderSheet({ changePassword: jest.fn(() => pending.promise) });
  fill(ui);
  const request = submit(ui);
  ui.rerender(<ToastActorScope handle={ui.handle}><Text>Another screen</Text></ToastActorScope>);
  await act(async () => { pending.reject(new Error('Request failed')); await request; });
  expectToast(ui, 'Request failed', 'error');
  expect(ui.onClose).not.toHaveBeenCalled();
});

test.each(['stale handle', 'returned stale error', 'thrown stale error'])('%s shows no outcome', async (kind) => {
  const pending = deferred();
  const ui = renderSheet({ changePassword: jest.fn(() => pending.promise) });
  fill(ui);
  const request = submit(ui);
  if (kind === 'stale handle') ui.handle.isCurrent.mockReturnValue(false);
  await act(async () => {
    if (kind === 'thrown stale error') pending.reject(new StaleActorError());
    else pending.resolve(kind === 'stale handle' ? OK : { phase: 'update', error: new StaleActorError() });
    await request;
  });
  expect(toast(ui)).toBeNull();
  expect(ui.queryByRole('alert')).toBeNull();
  expect(ui.onClose).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
});

test('a stale handle refuses submission before calling changePassword', async () => {
  const ui = renderSheet();
  fill(ui);
  ui.handle.isCurrent.mockReturnValue(false);
  await act(async () => { await submit(ui); });
  expect(ui.changePassword).not.toHaveBeenCalled();
});

test('Show passwords toggles all three fields and their platform assistance stays available', () => {
  const ui = renderSheet();
  inputs(ui).forEach((field) => {
    expect(field.props.secureTextEntry).toBe(true);
    expect(field.props.autoCapitalize).toBe('none');
    expect(field.props.autoCorrect).toBe(false);
  });
  expect(input(ui, 'Current password').props).toMatchObject({ autoFocus: true, placeholder: 'Enter current password', textContentType: 'password', autoComplete: 'current-password', returnKeyType: 'next' });
  expect(input(ui, 'New password').props).toMatchObject({ placeholder: 'Enter new password', textContentType: 'newPassword', autoComplete: 'new-password', returnKeyType: 'next' });
  expect(input(ui, 'Confirm new password').props).toMatchObject({ placeholder: 'Re-enter new password', textContentType: 'newPassword', autoComplete: 'new-password', returnKeyType: 'done' });
  fireEvent.press(ui.getByRole('button', { name: 'Show passwords' }));
  inputs(ui).forEach((field) => expect(field.props.secureTextEntry).toBe(false));
  fireEvent.press(ui.getByRole('button', { name: 'Hide passwords' }));
  inputs(ui).forEach((field) => expect(field.props.secureTextEntry).toBe(true));
});

test('Next focuses New then Confirm, and Done submits the same form', async () => {
  const ui = renderSheet();
  const fields = ui.UNSAFE_getAllByType(TextField);
  // RN's Jest inputs share a prototype mock; its receiver proves which ref won.
  const focus = jest.spyOn(fields[1].props.inputRef.current, 'focus');
  focus.mockClear();
  fireEvent(input(ui, 'Current password'), 'submitEditing');
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus.mock.contexts.at(-1)).toBe(fields[1].props.inputRef.current);
  fireEvent(input(ui, 'New password'), 'submitEditing');
  expect(focus).toHaveBeenCalledTimes(2);
  expect(focus.mock.contexts.at(-1)).toBe(fields[2].props.inputRef.current);
  fill(ui);
  await act(async () => { await fireEvent(input(ui, 'Confirm new password'), 'submitEditing'); });
  expect(ui.changePassword).toHaveBeenCalledTimes(1);
});

test('header toggle and footer stay outside the scrolling fields', () => {
  const ui = renderSheet();
  const sheet = ui.UNSAFE_getByType(BottomSheet);
  expect(sheet.props).toMatchObject({ maxHeight: '100%', keyboardAvoiding: true, scrollable: true, footerStyle: { borderTopWidth: 0, paddingTop: 0 } });
  const scroll = ui.UNSAFE_getByType(ScrollView);
  expect(scroll.props).toMatchObject({ keyboardShouldPersistTaps: 'handled', scrollEventThrottle: 16 });
  expect(scroll.findAllByType(TextField)).toHaveLength(3);
  expect(scroll.findAllByProps({ testID: 'change-password-submit' })).toHaveLength(0);
  expect(ui.getByText('Password must be at least 8 characters')).toBeTruthy();
});

test('focusing already-measured fields scrolls immediately without more layout events', () => {
  const ui = renderSheet();
  const { scroll, scrollTo } = measure(ui);
  fireEvent(input(ui, 'New password'), 'focus');
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 96, animated: true });
  fireEvent(scroll, 'scroll', { nativeEvent: { contentOffset: { y: 96 } } });
  fireEvent(input(ui, 'Confirm new password'), 'focus');
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 210, animated: true });
  fireEvent(input(ui, 'Current password'), 'focus');
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: true });
  fireEvent(input(ui, 'Current password'), 'focus');
  expect(scrollTo).toHaveBeenCalledTimes(3);
});

test.each(['block first', 'viewport first'])('focus before measurement scrolls once layouts arrive: %s', (order) => {
  const ui = renderSheet();
  const scroll = ui.UNSAFE_getByType(ScrollView);
  const scrollTo = scroll.instance.scrollTo;
  scrollTo.mockClear();
  fireEvent(input(ui, 'New password'), 'focus');
  expect(scrollTo).not.toHaveBeenCalled();
  const blockLayout = () => layout(ui.getByTestId('password-block-new'), 114, 102);
  const viewportLayout = () => layout(scroll, 0, 120);
  (order === 'block first' ? blockLayout : viewportLayout)();
  expect(scrollTo).not.toHaveBeenCalled();
  (order === 'block first' ? viewportLayout : blockLayout)();
  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 96, animated: true });
});

test('the keyboard shrinking the viewport re-checks the focused field', () => {
  const ui = renderSheet();
  const { scroll, scrollTo } = measure(ui, 400);
  fireEvent(input(ui, 'New password'), 'focus');
  expect(scrollTo).not.toHaveBeenCalled();
  layout(scroll, 0, 120);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 96, animated: true });
  scrollTo.mockClear();
  fireEvent(input(ui, 'New password'), 'blur');
  layout(scroll, 0, 80);
  expect(scrollTo).not.toHaveBeenCalled();
});

test('an error re-scrolls its block after it grows', async () => {
  const ui = renderSheet();
  const { scrollTo } = measure(ui);
  fill(ui, 'a', '12345678', 'different');
  await act(async () => { await submit(ui); });
  expect(scrollTo).not.toHaveBeenCalled();
  layout(ui.getByTestId('password-block-confirm'), 228, 130);
  // Taller than the 120dp viewport: anchor the start, as computeScrollTarget specifies.
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 228, animated: true });
});

test('a form error scrolls the notes block after its layout changes', async () => {
  const ui = renderSheet();
  const { scrollTo } = measure(ui);
  await act(async () => { await submit(ui); });
  layout(ui.getByTestId('password-block-notes'), 342, 80);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 302, animated: true });
});

test.each([
  ['new', ['current', 'short', 'short'], 114, 130, 114],
  ['confirm', ['current', '12345678', 'different'], 228, 130, 228],
  ['notes', ['', '', ''], 342, 80, 302],
])('resubmitting the same %s error scrolls its cached layout back into view', async (key, values, y, height, target) => {
  const ui = renderSheet();
  const { scroll, scrollTo } = measure(ui);
  fill(ui, ...values);
  await act(async () => { await submit(ui); });
  layout(ui.getByTestId(`password-block-${key}`), y, height);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: target, animated: true });

  // The EA scrolls away, then submits unchanged values. Native layout does not
  // emit another event because the same error still occupies the same space.
  fireEvent(scroll, 'scroll', { nativeEvent: { contentOffset: { y: 0 } } });
  scrollTo.mockClear();
  await act(async () => { await submit(ui); });
  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: target, animated: true });
  expect(ui.changePassword).not.toHaveBeenCalled();
});
