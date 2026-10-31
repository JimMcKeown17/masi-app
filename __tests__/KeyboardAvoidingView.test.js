import React from 'react';
import { KeyboardAvoidingView as NativeKeyboardAvoidingView, Platform, StyleSheet, TextInput } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import KeyboardAvoidingView from '../src/components/common/KeyboardAvoidingView';
import RCTDeviceEventEmitter from 'react-native/Libraries/EventEmitter/RCTDeviceEventEmitter';

const keyboardEvent = (screenY, height) => ({
  duration: 0, easing: 'keyboard',
  endCoordinates: { screenX: 0, screenY, width: 411, height },
});
const emit = async (name, screenY, height) => {
  await act(async () => { RCTDeviceEventEmitter.emit(name, keyboardEvent(screenY, height)); });
};
const layout = async (screen, height) => {
  await act(async () => {
    fireEvent(screen.getByTestId('avoider'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 411, height } }, persist() {},
    });
  });
};
const style = screen => StyleSheet.flatten(screen.getByTestId('avoider').props.style);
afterEach(async () => { await emit('keyboardDidHide', 842, 0); jest.restoreAllMocks(); });

test('Android padding returns to its original layout after a real hide payload', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const screen = render(<KeyboardAvoidingView testID="avoider" behavior="padding" style={{ flex: 1 }}><TextInput /></KeyboardAvoidingView>);
  await layout(screen, 914);
  const before = style(screen);
  await emit('keyboardDidShow', 500, 414);
  expect(style(screen).paddingBottom).toBe(414);
  await emit('keyboardDidHide', 842, 0);
  expect(style(screen)).toEqual(before);
});

test('Android height restores its measured height after dismissal with offset 90', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const screen = render(<KeyboardAvoidingView testID="avoider" behavior="height" keyboardVerticalOffset={90} style={{ flex: 1 }}><TextInput testID="input" /></KeyboardAvoidingView>);
  await layout(screen, 914);
  const input = screen.getByTestId('input');
  const before = style(screen);
  await emit('keyboardDidShow', 500, 414);
  expect(style(screen)).toMatchObject({ height: 410, flex: 0 });
  // Native layout follows the height applied by RN; its next calculation adds
  // the current bottom back to this reduced frame.
  await layout(screen, 410);
  await emit('keyboardDidHide', 842, 0);
  expect(style(screen).height ?? 914).toBe(914);
  expect(screen.getByTestId('input')).toBe(input);
  expect(style(screen)).toEqual(before);
  await layout(screen, 914);
  await emit('keyboardDidShow', 500, 414);
  expect(style(screen)).toMatchObject({ height: 410, flex: 0 });
  await layout(screen, 410);
  await emit('keyboardDidHide', 842, 0);
  expect(style(screen)).toEqual(before);
});

test.each([0, 48])('floating keyboard show with reported height %s still avoids and preserves input state', async height => {
  jest.replaceProperty(Platform, 'OS', 'android');
  function Form() {
    const [value, setValue] = React.useState('');
    return <KeyboardAvoidingView testID="avoider" behavior="padding"><TextInput testID="input" value={value} onChangeText={setValue} /></KeyboardAvoidingView>;
  }
  const screen = render(<Form />);
  await layout(screen, 914);
  fireEvent.changeText(screen.getByTestId('input'), 'keep this');
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await emit('keyboardDidShow', 500, height);
    expect(style(screen).paddingBottom).toBe(414);
    await emit('keyboardDidHide', 842, 0);
    expect(style(screen).paddingBottom).toBe(0);
    expect(screen.getByTestId('input').props.value).toBe('keep this');
  }
});

test('an explicitly disabled caller remains disabled on Android', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const screen = render(<KeyboardAvoidingView testID="avoider" behavior="padding" enabled={false} />);
  await layout(screen, 914);
  await emit('keyboardDidShow', 500, 414);
  expect(style(screen).paddingBottom).toBe(0);
});

// Only the enabled flag is checked: RN pads after the next keyboard event, wrapped or not.
test('mounting while a zero-height keyboard is open starts the wrapper enabled', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await emit('keyboardDidShow', 500, 0);
  const screen = render(<KeyboardAvoidingView testID="avoider" behavior="padding" />);
  expect(screen.UNSAFE_getByType(NativeKeyboardAvoidingView).props.enabled).toBe(true);
});

test.each(['ios', 'web'])('%s forwards every prop unchanged', platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  const onLayout = jest.fn();
  const props = { behavior: 'height', enabled: false, keyboardVerticalOffset: 90, contentContainerStyle: { flex: 1 }, style: { flex: 1 }, onLayout, testID: 'avoider', accessibilityLabel: 'Form' };
  const screen = render(<KeyboardAvoidingView {...props}><TextInput /></KeyboardAvoidingView>);
  expect(screen.UNSAFE_getByType(NativeKeyboardAvoidingView).props).toMatchObject(props);
});

test('iOS retains RN will-show and will-hide behavior', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const screen = render(<KeyboardAvoidingView testID="avoider" behavior="padding" />);
  await layout(screen, 914);
  await emit('keyboardWillShow', 500, 414);
  expect(style(screen).paddingBottom).toBe(414);
  await emit('keyboardWillHide', 842, 0);
  expect(style(screen).paddingBottom).toBe(0);
});

// Positive controls preserve the upstream failure mechanism without leaving
// intentionally failing tests in the suite. Neither RN component nor Keyboard is mocked.
test.each(['padding', 'height'])('upstream RN still demonstrates the Android %s residue', async behavior => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const screen = render(<NativeKeyboardAvoidingView testID="avoider" behavior={behavior} keyboardVerticalOffset={behavior === 'height' ? 90 : 0} style={{ flex: 1 }} />);
  await layout(screen, 914);
  await emit('keyboardDidShow', 500, 414);
  if (behavior === 'height') await layout(screen, 410);
  await emit('keyboardDidHide', 842, 0);
  if (behavior === 'padding') expect(style(screen).paddingBottom).toBe(72);
  else expect(style(screen).height).toBe(752); // 914 - (72 system bars + 90 offset)
});
