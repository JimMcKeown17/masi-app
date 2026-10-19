import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import IconCircleButton from '../src/components/common/IconCircleButton';
import { colors, tints } from '../src/constants/colors';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

test.each([
  ['canvas', colors.surface, colors.text], ['red', colors.red700, colors.onDark],
])('%s has a 44dp target and its own fill and glyph', (surface, backgroundColor, color) => {
  const onPress = jest.fn();
  const ui = render(<IconCircleButton icon="close" accessibilityLabel="Close" surface={surface} onPress={onPress} />);
  const button = ui.getByRole('button', { name: 'Close' });
  expect(StyleSheet.flatten(button.props.style)).toMatchObject({ width: 44, height: 44, borderRadius: 22, backgroundColor });
  expect(ui.UNSAFE_getByType('Ionicons').props).toMatchObject({ size: 22, color });
  fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('requires an accessibility label', () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<IconCircleButton icon="close" />);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('accessibilityLabel'));
  error.mockRestore();
});

test('disabled ignores presses and uses disabled chrome', () => {
  const onPress = jest.fn();
  const ui = render(<IconCircleButton icon="close" accessibilityLabel="Close" disabled onPress={onPress} />);
  const button = ui.getByRole('button');
  expect(button.props.accessibilityState.disabled).toBe(true);
  expect(StyleSheet.flatten(button.props.style).borderColor).toBe(tints.rule);
  expect(ui.UNSAFE_getByType('Ionicons').props.color).toBe(colors.disabled);
  fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
});
