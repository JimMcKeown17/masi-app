import React from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { useToast } from '../src/context/ToastContext';
import { colors } from '../src/constants/colors';
import StickyActionFooter from '../src/components/forms/StickyActionFooter';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

function keyboardEvents() {
  const listeners = new Map();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(listener);
    return { remove: () => listeners.get(event).delete(listener) };
  });
  const phase = Platform.OS === 'ios' ? 'Will' : 'Did';
  return (visible, height = 300) => act(() => {
    listeners.get(`keyboard${phase}${visible ? 'Show' : 'Hide'}`)?.forEach(listener =>
      listener({ endCoordinates: { height } }));
  });
}

test.each([0, 34])('renders its children with the surface and bottom inset %s', bottom => {
  const screen = renderWithProviders(<StickyActionFooter><Text>Action</Text></StickyActionFooter>, {
    insets: { top: 0, left: 0, right: 0, bottom },
  });
  expect(screen.getByText('Action')).toBeTruthy();
  expect(StyleSheet.flatten(screen.getByTestId('sticky-action-footer').props.style)).toMatchObject({
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: 11, paddingHorizontal: 24, paddingBottom: Math.max(bottom, 16),
  });
});

test.each(['ios', 'android'])('hides and restores its children for the %s keyboard', os => {
  jest.replaceProperty(Platform, 'OS', os);
  const emit = keyboardEvents();
  const screen = renderWithProviders(<StickyActionFooter hideOnKeyboard><Text>Action</Text></StickyActionFooter>);
  emit(true);
  expect(screen.queryByText('Action')).toBeNull();
  emit(false);
  expect(screen.getByText('Action')).toBeTruthy();
});

test('registers measured height with the root toast and unregisters on hide and unmount', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const emit = keyboardEvents();
  function Publisher() {
    const toast = useToast();
    return <Pressable accessibilityLabel="Publish" onPress={() => toast.show({ message: 'Saved', tone: 'success' })}><Text>Publish</Text></Pressable>;
  }
  const screen = renderWithProviders(<><Publisher /><StickyActionFooter hideOnKeyboard><Text>Action</Text></StickyActionFooter></>);
  fireEvent(screen.getByTestId('sticky-action-footer'), 'layout', { nativeEvent: { layout: { height: 120 } } });
  fireEvent.press(screen.getByLabelText('Publish'));
  const bottom = () => StyleSheet.flatten(screen.getByTestId('toast').props.style).bottom;
  expect(bottom()).toBe(128);
  emit(true, 30);
  expect(bottom()).toBe(38);
  emit(false);
  fireEvent(screen.getByTestId('sticky-action-footer'), 'layout', { nativeEvent: { layout: { height: 140 } } });
  expect(bottom()).toBe(148);
  screen.rerender(<Publisher />);
  expect(bottom()).toBe(16);
});

test('rejects an unsupported surface in development', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => renderWithProviders(<StickyActionFooter surface="unknown" />)).toThrow(/surface/);
});


test.each([false, true])('onOverflow surface follows overflowing=%s and merges caller style last', overflowing => {
  const screen = renderWithProviders(<StickyActionFooter surface="onOverflow" overflowing={overflowing}
    style={{ paddingTop: 12, paddingHorizontal: 24 }}><Text>Done</Text></StickyActionFooter>);
  expect(screen.getByTestId('sticky-action-footer')).toHaveStyle({
    backgroundColor: overflowing ? colors.surface : 'transparent',
    borderTopWidth: overflowing ? 1 : 0,
    ...(overflowing ? { borderTopColor: colors.border } : {}),
    paddingTop: 12, paddingHorizontal: 24,
  });
});
