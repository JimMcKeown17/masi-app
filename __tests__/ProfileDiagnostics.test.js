import React from 'react';
import { BackHandler, KeyboardAvoidingView, ScrollView } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders as render } from '../test-support/renderWithProviders';
import ReportProblemSheet from '../src/components/profile/ReportProblemSheet';
import SendDiagnosticsSheet from '../src/components/profile/SendDiagnosticsSheet';
import { StaleActorError } from '../src/session/staleActor';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const handle = { userId: 'ea-1', epoch: 1, isCurrent: () => true };
const mockNativeModule = jest.fn(() => null);
const mockPickerLoaded = jest.fn();
const mockLauncher = jest.fn();
const mockFileInfo = jest.fn(async () => ({ exists: true, size: 1234 }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: (...args) => mockFileInfo(...args) }));
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: (...args) => mockNativeModule(...args),
}));
jest.mock('expo-image-picker', () => {
  mockPickerLoaded();
  return { launchImageLibraryAsync: mockLauncher };
});

beforeEach(() => { jest.clearAllMocks(); mockNativeModule.mockReturnValue(null); });
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};

test('native-null hides Attach a screenshot, never loads picker JS and still submits text', async () => {
  const onSubmit = jest.fn(async () => ({}));
  const screen = render(<ReportProblemSheet visible handle={handle} onClose={jest.fn()} onSubmit={onSubmit} />);
  expect(mockNativeModule).toHaveBeenCalledWith('ExponentImagePicker');
  expect(mockPickerLoaded).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Attach a screenshot' })).toBeNull();
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'Report without screenshot');
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Send' })); });
  expect(onSubmit).toHaveBeenCalledWith({ message: 'Report without screenshot' });
});

test.each(['cancel', 'permission', 'oversize'])('picker %s keeps report text and allows the same-form retry', async (outcome) => {
  mockNativeModule.mockReturnValue({});
  if (outcome === 'cancel') mockLauncher.mockResolvedValueOnce({ canceled: true, assets: null });
  else if (outcome === 'permission') mockLauncher.mockRejectedValueOnce(new Error('Allow photo access to attach a screenshot.'));
  else {
    mockLauncher.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///private/large.png', mimeType: 'image/png' }] });
    mockFileInfo.mockResolvedValueOnce({ exists: true, size: 15 * 1024 * 1024 + 1 });
  }
  const screen = render(<ReportProblemSheet visible handle={handle} onClose={jest.fn()} onSubmit={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'Keep these words');
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Attach a screenshot' })); });
  expect(screen.getByLabelText('What went wrong?').props.value).toBe('Keep these words');
  if (outcome !== 'cancel') expect(screen.getByRole('alert')).toBeTruthy();
  mockLauncher.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///private/small.png', mimeType: 'image/png' }] });
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Attach a screenshot' })); });
  expect(screen.getByText('Screenshot attached.')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

test.each(['dismiss', 'actor switch'])('late picker result after %s cannot attach to a fresh report', async (action) => {
  mockNativeModule.mockReturnValue({});
  const pending = deferred();
  mockLauncher.mockReturnValueOnce(pending.promise);
  let current = true;
  const firstHandle = { ...handle, isCurrent: () => current };
  const content = (visible, actor = firstHandle) => <ReportProblemSheet visible={visible} handle={actor} onClose={jest.fn()} onSubmit={jest.fn()} />;
  const screen = render(content(true));
  const attach = screen.getByRole('button', { name: 'Attach a screenshot' });
  act(() => { fireEvent.press(attach); fireEvent.press(attach); });
  expect(mockLauncher).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState.disabled).toBe(true);
  if (action === 'dismiss') { screen.rerender(content(false)); screen.rerender(content(true)); }
  else { current = false; screen.rerender(content(true, { ...handle, userId: 'ea-2' })); }
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'New report');
  await act(async () => { pending.resolve({ canceled: false, assets: [{ uri: 'file:///private/old.png', mimeType: 'image/png' }] }); });
  expect(screen.queryByText('Screenshot attached.')).toBeNull();
  expect(screen.getByLabelText('What went wrong?').props.value).toBe('New report');
});

test('whitespace-only reports show a required error beside What went wrong without submitting', () => {
  const onSubmit = jest.fn();
  const screen = render(<ReportProblemSheet visible handle={handle} onClose={jest.fn()} onSubmit={onSubmit} />);
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), '  \n ');
  fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  expect(screen.getByText('Please describe what went wrong.')).toBeTruthy();
  expect(screen.getByLabelText('What went wrong?, error: Please describe what went wrong.')).toBeTruthy();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('diagnostics guards duplicate presses and renders failures inline without closing', async () => {
  const pending = deferred();
  const onSubmit = jest.fn(() => pending.promise);
  const onClose = jest.fn();
  const screen = render(<SendDiagnosticsSheet visible handle={handle} onClose={onClose} onSubmit={onSubmit} />);
  const send = screen.getByRole('button', { name: 'Send' });
  act(() => { fireEvent.press(send); fireEvent.press(send); });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState.busy).toBe(true);
  await act(async () => { pending.resolve({ error: 'Could not save diagnostics. Please try again.' }); });
  expect(screen.getByText('Could not save diagnostics. Please try again.')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});

test('Send diagnostics explains the action and closes only after a successful submission', async () => {
  const onSubmit = jest.fn(async () => ({}));
  const onClose = jest.fn();
  const screen = render(<SendDiagnosticsSheet visible handle={handle} onClose={onClose} onSubmit={onSubmit} />);
  expect(screen.getByText('Send app information to the Masi team to help us investigate problems.')).toBeTruthy();
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Send' })); });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test.each([ReportProblemSheet, SendDiagnosticsSheet])('a stale submission error is abandoned without a form error in %p', async (Sheet) => {
  const onSubmit = jest.fn().mockRejectedValue(new StaleActorError());
  const onClose = jest.fn();
  const screen = render(<Sheet visible handle={handle} onClose={onClose} onSubmit={onSubmit} />);
  if (Sheet === ReportProblemSheet) fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'A report');
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Send' })); });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});

test.each(['Cancel', 'Dismiss report a problem', 'hardwareBackPress'])('report dismisses with %s', (action) => {
  const back = jest.spyOn(BackHandler, 'addEventListener');
  const onClose = jest.fn();
  const screen = render(<ReportProblemSheet visible handle={handle} onClose={onClose} onSubmit={jest.fn()} />);
  if (action === 'hardwareBackPress') act(() => back.mock.calls.find(([name]) => name === action)[1]());
  else fireEvent.press(screen.getByRole('button', { name: action }));
  expect(onClose).toHaveBeenCalledTimes(1);
  back.mockRestore();
});

test('report uses a multiline field, keyboard avoidance and a separate Send footer', () => {
  const screen = render(<ReportProblemSheet visible handle={handle} onClose={jest.fn()} onSubmit={jest.fn()} />);
  expect(screen.getByLabelText('What went wrong?').props.multiline).toBe(true);
  expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
  expect(screen.UNSAFE_getByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled');
  expect(screen.getByTestId('bottom-sheet-footer').findByProps({ accessibilityRole: 'button', accessibilityLabel: 'Send' })).toBeTruthy();
});

test('dismiss and reopen resets the form and ignores a late submission error', async () => {
  const pending = deferred();
  const onSubmit = jest.fn(() => pending.promise);
  const onClose = jest.fn();
  const content = (visible) => <ReportProblemSheet visible={visible} handle={handle} onClose={onClose} onSubmit={onSubmit} />;
  const screen = render(content(true));
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'Old report');
  fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  screen.rerender(content(false));
  screen.rerender(content(true));
  expect(screen.getByLabelText('What went wrong?').props.value).toBe('');
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'New report');
  await act(async () => { pending.resolve({ error: 'Old failure' }); });
  expect(screen.queryByText('Old failure')).toBeNull();
  expect(screen.getByLabelText('What went wrong?').props.value).toBe('New report');
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('same-tick Send presses submit once and a failed submission stays inline for retry', async () => {
  const pending = deferred();
  const onSubmit = jest.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce({});
  const onClose = jest.fn();
  const screen = render(<ReportProblemSheet visible handle={handle} onClose={onClose} onSubmit={onSubmit} />);
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'My session disappeared');
  const send = screen.getByRole('button', { name: 'Send' });
  act(() => { fireEvent.press(send); fireEvent.press(send); });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  await act(async () => { pending.resolve({ error: 'Could not save your report. Please try again.' }); });
  expect(screen.getByText('Could not save your report. Please try again.')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText('What went wrong?').props.value).toBe('My session disappeared');
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Send' })); });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test.each([4000, 4001])('report length %i is validated without truncating the text', async (length) => {
  const onSubmit = jest.fn(async () => ({}));
  const screen = render(<ReportProblemSheet visible handle={handle} onClose={jest.fn()} onSubmit={onSubmit} />);
  const message = 'x'.repeat(length);
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), message);
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Send' })); });
  if (length === 4000) expect(onSubmit).toHaveBeenCalledWith({ message });
  else {
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Use 4,000 characters or fewer.')).toBeTruthy();
    expect(screen.getByLabelText(/What went wrong\?/).props.value).toBe(message);
  }
});

test('a valid report preserves the raw words and closes after submission completes', async () => {
  const onSubmit = jest.fn(async () => ({}));
  const onClose = jest.fn();
  const screen = render(<ReportProblemSheet visible handle={handle} onClose={onClose} onSubmit={onSubmit} />);
  const message = '  My session disappeared.\nPlease help.  ';
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), message);
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Send' })); });
  expect(onSubmit).toHaveBeenCalledWith({ message });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('attaching a screenshot passes original-format metadata with the report', async () => {
  mockNativeModule.mockReturnValue({});
  mockLauncher.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///private/picker/shot.heic', fileName: 'shot.heic', mimeType: 'image/heic' }] });
  const onSubmit = jest.fn(async () => ({}));
  const screen = render(<ReportProblemSheet visible handle={handle} onClose={jest.fn()} onSubmit={onSubmit} />);
  fireEvent.changeText(screen.getByLabelText('What went wrong?'), 'Please see the screenshot');
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Attach a screenshot' })); });
  expect(screen.getByText('Screenshot attached.')).toBeTruthy();
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Send' })); });
  expect(onSubmit).toHaveBeenCalledWith({ message: 'Please see the screenshot', screenshotFile: {
    uri: 'file:///private/picker/shot.heic', extension: 'heic', mimeType: 'image/heic', fileSize: 1234,
  } });
});
