import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { Circle, Path } from 'react-native-svg';
import InlineLoading from '../src/components/common/InlineLoading';
import SpinnerArc from '../src/components/common/SpinnerArc';
import { MotionProvider } from '../src/context/MotionContext';
import { colors } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

const full = { tier: 'high', reduceMotion: false, motionLevel: 'full' };
const wrap = (element, value = full) => <MotionProvider value={value}>{element}</MotionProvider>;
const flat = (node) => StyleSheet.flatten(node.props.style);

test('inline loading pairs the label with the branded arc and announces politely', () => {
  const ui = render(wrap(<InlineLoading label="Loading class…" />));
  expect(flat(ui.getByText('Loading class…'))).toMatchObject({ ...typeRoles.textBodySemi, color: colors.text });
  expect(ui.getByTestId('inline-loading').props.accessibilityLiveRegion).toBe('polite');
  expect(flat(ui.getByTestId('inline-loading'))).toMatchObject({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 });
  expect(ui.UNSAFE_getByType(SpinnerArc).props).toMatchObject({ size: 22, color: colors.primary });
});
test('the arc uses the board geometry', () => {
  const ui = render(wrap(<SpinnerArc />));
  expect(ui.UNSAFE_getByType(Circle).props).toMatchObject({ r: 9, stroke: colors.primary, strokeOpacity: 0.28, strokeWidth: 2.6 });
  expect(ui.UNSAFE_getByType(Path).props).toMatchObject({ d: 'M12 3a9 9 0 0 1 9 9', stroke: colors.primary, strokeLinecap: 'round' });
  expect(ui.getByTestId('spinner-arc').props.accessible).toBe(false);
});
test.each([
  { tier: 'static', reduceMotion: true, motionLevel: 'still' },
  { tier: 'static', reduceMotion: false, motionLevel: 'still' },
])('the arc is still under %p', (value) => {
  const ui = render(wrap(<SpinnerArc />, value));
  expect(flat(ui.getByTestId('spinner-arc')).transform).toBeUndefined();
});
test('full motion rotates and stops when motion is reduced or the spinner unmounts', () => {
  const loop = { start: jest.fn(), stop: jest.fn() };
  const spy = jest.spyOn(Animated, 'loop').mockReturnValue(loop);
  try {
    const ui = render(wrap(<SpinnerArc />));
    expect(flat(ui.getByTestId('spinner-arc')).transform[0]).toHaveProperty('rotate');
    expect(loop.start).toHaveBeenCalledTimes(1);
    ui.rerender(wrap(<SpinnerArc />, { ...full, reduceMotion: true, motionLevel: 'still' }));
    expect(loop.stop).toHaveBeenCalledTimes(1);
    expect(flat(ui.getByTestId('spinner-arc')).transform).toBeUndefined();
    ui.rerender(wrap(<SpinnerArc />));
    ui.unmount();
    expect(loop.stop).toHaveBeenCalledTimes(2);
  } finally {
    spy.mockRestore();
  }
});
