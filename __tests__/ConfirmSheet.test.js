import React from 'react';
import { BackHandler, KeyboardAvoidingView, ScrollView, StyleSheet, Text } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
import ConfirmSheet from '../src/components/common/ConfirmSheet';

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

const TITLE = 'Discard this session?';
const BODY = 'Your session details have not been saved. Leaving now will discard them.';
const renderSheet = (props = {}) => renderWithProviders(
  <ConfirmSheet
    visible title={TITLE} body={BODY} confirmLabel="Discard" cancelLabel="Keep editing"
    onConfirm={jest.fn()} onCancel={jest.fn()} {...props}
  />,
);

afterEach(() => jest.restoreAllMocks());

test('renders the copy, shared button treatments and paragraph body', () => {
  const sheet = renderSheet();
  expect(sheet.getByRole('header')).toHaveTextContent(TITLE);
  expect(sheet.getByText(BODY)).toHaveStyle({ ...typeRoles.textParagraph, color: colors.textSecondary });
  expect(sheet.getByRole('button', { name: 'Discard' })).toHaveStyle({
    backgroundColor: colors.surface, borderColor: tints.control, minHeight: 56,
  });
  expect(sheet.getByText('Discard')).toHaveStyle({ color: colors.error });
  expect(sheet.getByText('Keep editing')).toHaveStyle({ ...typeRoles.textButtonM, color: colors.text });
  expect(sheet.UNSAFE_getByType(ScrollView)).toBeTruthy();
  expect(sheet.UNSAFE_queryByType(KeyboardAvoidingView)).toBeNull();
});

test('body and title accessory can scroll within the bounded sheet while both actions stay reachable', () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const sheet = renderSheet({ titleAccessory: <Text>Sensitive</Text>, onConfirm, onCancel });
  const scroll = sheet.UNSAFE_getByType(ScrollView);
  expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({ flexShrink: 1 });
  expect(StyleSheet.flatten(sheet.getByTestId('bottom-sheet-panel').props.style)).toMatchObject({ maxHeight: '80%' });
  expect(scroll.findAllByProps({ children: BODY }).length).toBeGreaterThan(0);
  expect(scroll.findAllByProps({ children: 'Sensitive' }).length).toBeGreaterThan(0);
  expect(scroll.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
  fireEvent.press(sheet.getByRole('button', { name: 'Discard' }));
  fireEvent.press(sheet.getByRole('button', { name: 'Keep editing' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test('confirm calls onConfirm exactly once without cancelling', () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const sheet = renderSheet({ onConfirm, onCancel });
  fireEvent.press(sheet.getByRole('button', { name: 'Discard' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
});

test.each(['cancel', 'scrim', 'Android back'])('%s cancels without confirming', (action) => {
  const backSpy = jest.spyOn(BackHandler, 'addEventListener');
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const sheet = renderSheet({ onConfirm, onCancel });
  if (action === 'cancel') fireEvent.press(sheet.getByRole('button', { name: 'Keep editing' }));
  else if (action === 'scrim') fireEvent.press(sheet.getByLabelText(`Dismiss ${TITLE}`));
  else {
    const handlers = backSpy.mock.calls.filter(([event]) => event === 'hardwareBackPress');
    act(() => { expect(handlers[handlers.length - 1][1]()).toBe(true); });
  }
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

test('the sheet panel is a modal alertdialog', () => {
  const sheet = renderSheet();
  expect(sheet.UNSAFE_getByProps({ role: 'alertdialog' }).props.accessibilityViewIsModal).toBe(true);
});

test('supports a title accessory, destructive variant and explicit dismiss label', () => {
  const sheet = renderSheet({
    titleAccessory: <Text>Sensitive</Text>, confirmVariant: 'destructive', dismissLabel: 'Dismiss discard confirmation',
  });
  expect(sheet.getByText('Sensitive')).toBeTruthy();
  expect(sheet.getByLabelText('Dismiss discard confirmation')).toBeTruthy();
  expect(StyleSheet.flatten(sheet.getByRole('button', { name: 'Discard' }).props.style).backgroundColor).toBe(colors.error);
});

test('renders nothing when not visible', () => {
  const sheet = renderSheet({ visible: false });
  expect(sheet.queryByText(TITLE)).toBeNull();
  expect(sheet.queryByText(BODY)).toBeNull();
  expect(sheet.queryByRole('button', { name: 'Discard' })).toBeNull();
  expect(sheet.queryByRole('button', { name: 'Keep editing' })).toBeNull();
});
