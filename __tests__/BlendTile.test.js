import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import BlendTile from '../src/components/lessons/BlendTile';
import { MotionProvider } from '../src/context/MotionContext';
import { colors } from '../src/constants/colors';
import { letterStateColors } from '../src/constants/letterStateColors';
import { typeRoles } from '../src/constants/typography';

test.each(['rest', 'selected'])('%s tone follows the letter tile colour and press rules', tone => {
  const onPress = jest.fn();
  const view = render(<BlendTile text="mama" display="ma-ma" tone={tone} onPress={onPress} />);
  const tile = view.getByRole('button', { name: `mama, ${tone === 'selected' ? 'ticked' : 'not ticked'}` });
  expect(tile.props.accessibilityState.selected).toBe(tone === 'selected');
  expect(StyleSheet.flatten(tile.props.style)).toMatchObject({
    backgroundColor: tone === 'selected' ? colors.text : letterStateColors.default.bg,
    borderColor: tone === 'selected' ? colors.text : letterStateColors.default.border,
  });
  expect(StyleSheet.flatten(view.getByText('ma-ma').props.style)).toMatchObject({
    color: tone === 'selected' ? colors.onDark : colors.text,
  });
  const pressable = view.UNSAFE_root.find(node => typeof node.props.style === 'function');
  expect(StyleSheet.flatten(pressable.props.style({ pressed: true })).backgroundColor).toBe(colors.border);
  fireEvent.press(tile);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('content grows and wraps at 1.3x without a fixed width or height', () => {
  const view = render(<BlendTile text="oomama" display="o-o-ma-ma" tone="rest" />);
  const text = view.getByText('o-o-ma-ma');
  expect(text.props.maxFontSizeMultiplier).toBe(1.3);
  expect(text.props.numberOfLines).toBeUndefined();
  expect(StyleSheet.flatten(text.props.style)).toMatchObject(typeRoles.lessonItem);
  const style = StyleSheet.flatten(view.getByRole('button').props.style);
  expect(style).toMatchObject({ minHeight: 56, maxWidth: '100%' });
  expect(style.width).toBeUndefined();
  expect(style.height).toBeUndefined();
});

test('spoken label removes hyphens and an explicit label is honoured', () => {
  const view = render(<BlendTile text="ma-ma" display="ma-ma" tone="rest" />);
  expect(view.getByRole('button', { name: 'mama, not ticked' })).toBeTruthy();
  view.rerender(<BlendTile text="ma-ma" tone="selected" accessibilityLabel="Custom label" />);
  expect(view.getByRole('button', { name: 'Custom label' })).toBeTruthy();
});

test.each([true, false])('press motion respects reduceMotion=%s', reduceMotion => {
  const timing = jest.spyOn(Animated, 'timing');
  const view = render(<MotionProvider value={{ reduceMotion, tier: 'high', motionLevel: 'full' }}>
    <BlendTile text="mama" display="ma-ma" tone="rest" />
  </MotionProvider>);
  fireEvent(view.getByRole('button'), 'pressIn');
  if (reduceMotion) expect(timing).not.toHaveBeenCalled();
  else expect(timing).toHaveBeenLastCalledWith(expect.anything(), { toValue: 0.96, duration: 90, useNativeDriver: true });
  fireEvent(view.getByRole('button'), 'pressOut');
  if (reduceMotion) expect(timing).not.toHaveBeenCalled();
  else expect(timing).toHaveBeenLastCalledWith(expect.anything(), { toValue: 1, duration: 140, useNativeDriver: true });
  view.unmount();
  timing.mockRestore();
});
