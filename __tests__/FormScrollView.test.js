import React from 'react';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import RCTDeviceEventEmitter from 'react-native/Libraries/EventEmitter/RCTDeviceEventEmitter';
import FormScrollView from '../src/components/forms/FormScrollView';
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 48 }) }));
const emit = (name, height = 300) => act(() => RCTDeviceEventEmitter.emit(name, { endCoordinates: { height } }));
afterEach(() => jest.restoreAllMocks());
test('Android lifts the scroll area by keyboard height plus bottom inset and restores it', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const s = render(<FormScrollView testID="form" />);
  emit('keyboardDidShow');
  expect(StyleSheet.flatten(s.getByTestId('form').props.style).marginBottom).toBe(348);
  emit('keyboardDidHide', 0);
  expect(StyleSheet.flatten(s.getByTestId('form').props.style).marginBottom).toBe(0);
});
test('iOS uses native keyboard insets with no lift', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const s = render(<FormScrollView testID="form" />);
  emit('keyboardWillShow');
  expect(StyleSheet.flatten(s.getByTestId('form').props.style).marginBottom).toBe(0);
  expect(s.UNSAFE_getByType(ScrollView).props.automaticallyAdjustKeyboardInsets).toBe(true);
});
test.each([true, false])('keepEndVisible=%s controls keyboard and content growth scrolling', keepEndVisible => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const scroll = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockClear();
  const onContentSizeChange = jest.fn();
  const ref = React.createRef();
  const s = render(<FormScrollView ref={ref} testID="form" keepEndVisible={keepEndVisible} onContentSizeChange={onContentSizeChange} />);
  expect(ref.current.scrollToEnd).toBeDefined();
  emit('keyboardDidShow');
  fireEvent(s.getByTestId('form'), 'contentSizeChange', 360, 1200);
  expect(scroll).toHaveBeenCalledTimes(keepEndVisible ? 2 : 0);
  expect(onContentSizeChange).toHaveBeenCalledWith(360, 1200);
  if (keepEndVisible) expect(scroll).toHaveBeenLastCalledWith({ animated: true });
});
test.each([true, false])('keepEndVisible=%s: the shrunken viewport layout scrolls to the end, and onLayout still reaches the caller', keepEndVisible => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const onLayout = jest.fn();
  const s = render(<FormScrollView testID="form" keepEndVisible={keepEndVisible} onLayout={onLayout} />);
  const scroll = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockClear();
  const event = { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 400 } } };
  fireEvent(s.getByTestId('form'), 'layout', event);
  expect(scroll).toHaveBeenCalledTimes(keepEndVisible ? 1 : 0);
  expect(onLayout).toHaveBeenCalledWith(event);
});
