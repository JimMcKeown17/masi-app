import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SignOutSheets from '../src/components/profile/SignOutSheets';
import { borderRadius, colors, spacing, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

// Keep the same minimal provider contract as the frozen flow tests.
const Providers = ({ children }) => (
  <SafeAreaProvider initialMetrics={{
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  }}>
    <PaperProvider>{children}</PaperProvider>
  </SafeAreaProvider>
);
const flat = (node) => StyleSheet.flatten(node.props.style);
const setup = (props = {}) => render(
  <SignOutSheets step="clocked_in" unsentCount={2} busy={null} message={null} isOnline
    clockOutNow={jest.fn()} stayClockedIn={jest.fn()} tryUploadNow={jest.fn()}
    recheck={jest.fn()} signOutAnyway={jest.fn()} cancel={jest.fn()} {...props} />,
  { wrapper: Providers },
);

test('clocked-in sheet uses the primary, secondary and ink buttons', () => {
  const screen = setup();
  expect(flat(screen.getByRole('button', { name: 'Clock out now' }))).toMatchObject({
    backgroundColor: colors.primary, minHeight: 56, borderRadius: borderRadius.pill,
  });
  expect(flat(screen.getByRole('button', { name: 'Stay clocked in and sign out' }))).toMatchObject({
    backgroundColor: colors.surface, borderColor: tints.control, minHeight: 56,
  });
  expect(flat(screen.getByText('Cancel')).color).toBe(colors.text);
});

test('the clocked-in warning is a warning note', () => {
  const message = "Couldn't clock out. Try again, or choose another option.";
  const screen = setup({ message });
  const text = screen.getByText(message);
  expect(flat(text)).toMatchObject({ ...typeRoles.textNote, color: colors.warningText });
  let container = text.parent;
  while (container.type !== 'View') container = container.parent;
  expect(flat(container)).toMatchObject({
    backgroundColor: colors.warningBg, borderRadius: borderRadius.md,
    paddingVertical: spacing.ms, paddingHorizontal: 14,
  });
});

test('unsent sheet’s confirming tap is the filled error button', () => {
  const screen = setup({ step: 'unsent' });
  expect(flat(screen.getByRole('button', { name: 'Sign out anyway' }))).toMatchObject({
    backgroundColor: colors.error, minHeight: 56, borderRadius: borderRadius.pill,
  });
  expect(flat(screen.getByText('Sign out anyway')).color).toBe(colors.onDark);
  expect(flat(screen.getByRole('button', { name: 'Try uploading now' }))).toMatchObject({
    backgroundColor: colors.surface, borderColor: tints.control,
  });
});

test('disabled pills look disabled', () => {
  const screen = setup({ step: 'unsent', isOnline: false });
  const button = screen.getByRole('button', { name: 'No connection' });
  expect(button.props.accessibilityState.disabled).toBe(true);
  expect(flat(button).backgroundColor).toBe(colors.border);
  expect(flat(button).borderWidth ?? 0).toBe(0);
  expect(flat(screen.getByText('No connection')).color).toBe(colors.disabled);
});

test('busy upload shows one spinner and keeps its name', () => {
  const screen = setup({ step: 'unsent', busy: 'uploading' });
  expect(screen.getByRole('button', { name: 'Uploading…' }).props.accessibilityState)
    .toMatchObject({ busy: true, disabled: true });
  expect(screen.UNSAFE_getAllByType(ActivityIndicator)).toHaveLength(1);
});
