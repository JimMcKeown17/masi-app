import React, { useState } from 'react';
import { AccessibilityInfo, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { useToast, useToastObstruction } from '../src/context/ToastContext';
import BottomSheet from '../src/components/common/BottomSheet';
import { colors, shadows } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }) => require('react').createElement(require('react-native').Text, null, name),
}), { virtual: true });
function Publisher({ message = 'Saved', tone = 'success', duration = 3000, holder }) {
  const toast = useToast();
  if (holder) holder.current = toast;
  return <Pressable accessibilityRole="button" accessibilityLabel="Publish" onPress={() => toast.show({ message, tone, duration })}><Text>Publish</Text></Pressable>;
}
const publish = () => fireEvent.press(screen.getByLabelText('Publish'));
const finishFade = () => act(() => jest.advanceTimersByTime(200));
const toastStyle = () => StyleSheet.flatten(screen.getByTestId('toast').props.style);
function Obstruction({ height = 90, active = true }) { useToastObstruction(height, active); return null; }
function findNode(node, testID) {
  if (!node || typeof node !== 'object') return null;
  if (node.props?.testID === testID) return node;
  for (const child of Array.isArray(node) ? node : node.children ?? []) {
    const found = findNode(child, testID);
    if (found) return found;
  }
  return null;
}
beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test('show renders the message and auto-hides after its duration', () => {
  renderWithProviders(<Publisher />);
  publish();
  expect(screen.getByText('Saved')).toBeTruthy();
  act(() => jest.advanceTimersByTime(2999));
  expect(screen.getByText('Saved')).toBeTruthy();
  act(() => jest.advanceTimersByTime(1));
  finishFade();
  expect(screen.queryByText('Saved')).toBeNull();
});

test('Dismiss hides it', () => {
  renderWithProviders(<Publisher />);
  publish();
  fireEvent.press(screen.getByLabelText('Dismiss message'));
  finishFade();
  expect(screen.queryByText('Saved')).toBeNull();
});

test('a second show replaces the first and its old timer cannot hide the replacement', () => {
  const view = renderWithProviders(<Publisher message="First" />);
  publish();
  act(() => jest.advanceTimersByTime(2900));
  view.rerender(<Publisher message="Second" />);
  publish();
  expect(screen.queryByText('First')).toBeNull();
  act(() => jest.advanceTimersByTime(400));
  expect(screen.getByText('Second')).toBeTruthy();
});

test('a replacement survives a pending dismissal animation', () => {
  const view = renderWithProviders(<Publisher message="First" />);
  publish();
  fireEvent.press(screen.getByLabelText('Dismiss message'));
  view.rerender(<Publisher message="Second" />);
  publish();
  finishFade();
  expect(screen.getByText('Second')).toBeTruthy();
});

test('error tone is an assertive alert', () => {
  renderWithProviders(<Publisher tone="error" message="Failed" />);
  publish();
  expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  expect(screen.getByRole('alert').props.accessibilityLiveRegion).toBe('assertive');
});

test.each([undefined, 'unknown'])('a missing or unknown tone (%s) logs an error and renders neutral', (tone) => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const holder = {};
  renderWithProviders(<Publisher holder={holder} />);
  act(() => holder.current.show({ message: 'Neutral', tone }));
  expect(error).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledWith('Toast tone must be neutral, success or error');
  expect(screen.queryByTestId('toast-status')).toBeNull();
  expect(screen.getByTestId('toast').props.accessibilityLiveRegion).toBe('polite');
});

test('the offset includes a registered obstruction and updates on change, inactive and unmount', () => {
  const view = renderWithProviders(<><Publisher /><Obstruction /><Obstruction height={40} /></>);
  publish();
  expect(toastStyle().bottom).toBe(98);
  view.rerender(<><Publisher /><Obstruction height={100} /><Obstruction height={40} /></>);
  expect(toastStyle().bottom).toBe(108);
  view.rerender(<><Publisher /><Obstruction height={100} active={false} /><Obstruction height={40} /></>);
  expect(toastStyle().bottom).toBe(48);
  view.rerender(<Publisher />);
  expect(toastStyle().bottom).toBe(16);
});

test('the toast sits 8 above the keyboard', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const listeners = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
    listeners[event] = listener;
    return { remove: jest.fn() };
  });
  renderWithProviders(<Publisher />);
  publish();
  act(() => listeners.keyboardDidShow({ endCoordinates: { height: 300 } }));
  expect(toastStyle().bottom).toBe(308);
  act(() => listeners.keyboardDidHide());
  expect(toastStyle().bottom).toBe(16);
});

test.each([false, true])('the host renders after the whole Paper subtree with sheet-first=%s', (sheetFirst) => {
  function SheetPublisher() {
    const [open, setOpen] = useState(sheetFirst);
    return <View><Publisher /><Pressable accessibilityLabel="Open sheet" onPress={() => setOpen(true)}><Text>Open sheet</Text></Pressable><BottomSheet visible={open} title="Sheet" onDismiss={() => setOpen(false)}><Text>Sheet body</Text></BottomSheet></View>;
  }
  renderWithProviders(<SheetPublisher />);
  publish();
  if (!sheetFirst) fireEvent.press(screen.getByLabelText('Open sheet'));
  const root = findNode(screen.toJSON(), 'toast-root');
  expect(root.children.at(-1).props.testID).toBe('toast-host');
  expect(JSON.stringify(root.children[0])).toContain('Sheet');
  fireEvent.press(screen.getByLabelText('Dismiss message'));
  finishFade();
  expect(screen.queryByText('Saved')).toBeNull();
  expect(screen.getByText('Sheet')).toBeTruthy();
});

test('a toast shown before navigation survives the screen change', async () => {
  const Stack = createNativeStackNavigator();
  function Record({ navigation }) {
    const toast = useToast();
    return <Pressable accessibilityLabel="Save session" onPress={() => { toast.show({ message: 'Session saved', tone: 'success' }); navigation.replace('Home'); }}><Text>Save</Text></Pressable>;
  }
  function Home() { return <Text>Home screen</Text>; }
  renderWithProviders(<NavigationContainer><Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}><Stack.Screen name="Record" component={Record} /><Stack.Screen name="Home" component={Home} /></Stack.Navigator></NavigationContainer>);
  fireEvent.press(screen.getByLabelText('Save session'));
  expect(await screen.findByText('Home screen')).toBeTruthy();
  expect(screen.getByText('Session saved')).toBeTruthy();
});

test('useToast outside a provider throws', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => render(<Publisher />)).toThrow('useToast must be used within a ToastProvider');
});
test('useToastObstruction outside a provider does nothing', () => {
  expect(() => render(<Obstruction />)).not.toThrow();
});

test('the card uses tokens, wraps copy, respects safe area and keeps a stable publisher', () => {
  const held = {};
  renderWithProviders(<Publisher holder={held} />, { insets: { top: 0, left: 0, right: 0, bottom: 34 } });
  const before = held.current;
  publish();
  expect(held.current).toBe(before);
  expect(toastStyle()).toMatchObject({ minHeight: 56, borderRadius: 18, backgroundColor: colors.text, bottom: 42, ...shadows.toast });
  const message = screen.getByText('Saved');
  expect(StyleSheet.flatten(message.props.style)).toMatchObject({ ...typeRoles.textBodySemi, color: colors.onDark });
  expect(message.props.numberOfLines).toBeUndefined();
  expect(StyleSheet.flatten(screen.getByLabelText('Dismiss message').props.style).minHeight).toBe(44);
});

test('still motion has no translation and iOS announces a message only when it appears', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const view = renderWithProviders(<Publisher />, { motion: { tier: 'static', reduceMotion: true, motionLevel: 'still' } });
  publish();
  expect(toastStyle().transform).toBeUndefined();
  expect(announce).toHaveBeenCalledWith('Saved');
  view.rerender(<Publisher />);
  expect(announce).toHaveBeenCalledTimes(1);
});
