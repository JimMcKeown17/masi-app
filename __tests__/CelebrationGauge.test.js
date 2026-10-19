import React from 'react';
import { Animated } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { Circle, Path } from 'react-native-svg';
import CelebrationGauge from '../src/components/sessions/CelebrationGauge';
import { buildEarnedArc, GAUGE_SIZES } from '../src/components/sessions/sessionGaugeGeometry';
import { deriveSessionCompleteView } from '../src/utils/sessionCompleteView';
import { colors } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

const goal = (count, state = 'below', target = 3) => ({ count, target, ceiling: 5, state });
const viewFor = (value, over = {}) => deriveSessionCompleteView({
  goal: value, goalStatus: 'ready', now: new Date('2026-10-13T10:00:00+02:00'), motionLevel: 'full',
  params: { childCount: 2, sessionDate: '2026-10-13' }, ...over,
});
const valuesFor = (content = 1) => ({
  content: new Animated.Value(content), earned: new Animated.Value(0), flip: new Animated.Value(0),
});
const hidden = { includeHiddenElements: true };

test('skeleton has no numeral, is hidden from accessibility and keeps the 218dp card geometry', () => {
  const screen = render(<CelebrationGauge card={{ kind: 'skeleton' }} gauge={null} />);
  const skeleton = screen.getByTestId('gauge-skeleton', hidden);
  expect(skeleton.props.accessibilityElementsHidden).toBe(true);
  expect(skeleton.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(screen.queryByTestId('gauge-numeral-to', hidden)).toBeNull();
  expect(screen.getByTestId('gauge-skeleton-title', hidden)).toHaveStyle({
    width: 168, height: 18, borderRadius: 9, marginTop: 13, backgroundColor: colors.border,
  });
  expect(screen.getByTestId('gauge-skeleton-subtitle', hidden)).toHaveStyle({
    width: 212, height: 12, borderRadius: 6, marginTop: 13, backgroundColor: colors.border,
  });
});

test('2/3 static: final accessible image, numeral, suffix, heading and sub-line', () => {
  const v = viewFor(goal(2), { motionLevel: 'still' });
  const screen = render(<CelebrationGauge card={v.card} gauge={v.gauge} />);
  expect(screen.getByRole('image', { name: '2 of 3 sessions today. Below target.' }))
    .toHaveStyle({ width: 232, height: 128 });
  expect(screen.getByText('2')).toHaveStyle({ ...typeRoles.displayNumeralXL, color: colors.text });
  expect(screen.getByText('/3')).toHaveStyle({
    fontFamily: typeRoles.textRowTitle.fontFamily, fontSize: 24, lineHeight: 28, marginLeft: 1,
  });
  expect(screen.getByText('2 of 3 sessions today')).toHaveStyle(typeRoles.displayHeading);
  expect(screen.getByText('One more pair reaches your target.')).toHaveStyle(typeRoles.textSmall);
  expect(screen.queryByTestId('gauge-earned', hidden)).toBeNull();
});

test('3/3 mid-animation: earned path, both numerals and the final accessible label', () => {
  const v = viewFor(goal(3, 'met'));
  const values = valuesFor();
  const screen = render(<CelebrationGauge card={v.card} gauge={v.gauge} values={values} settled={false} />);
  const arc = buildEarnedArc(v.card.goal, GAUGE_SIZES.celebration);
  expect(screen.getByTestId('gauge-earned', hidden).props).toEqual(expect.objectContaining({
    d: arc.d, strokeWidth: 22,
    strokeDasharray: [arc.length, arc.length], strokeDashoffset: arc.length + 1,
  }));
  expect(screen.UNSAFE_getAllByType(Path).find((path) => path.props.testID === 'gauge-earned').props.stroke)
    .toBe(colors.red500);
  expect(screen.getByTestId('gauge-numeral-from', hidden)).toHaveTextContent('2');
  expect(screen.getByTestId('gauge-numeral-to')).toHaveTextContent('3');
  expect(screen.getByLabelText('3 of 3 sessions today. Goal met.')).toBeTruthy();
  expect(screen.queryByText('Daily target reached.', hidden)).toBeNull();
  expect(screen.queryByText('2 of 3 sessions today')).toBeNull();
  expect(screen.getByText('2 of 3 sessions today', hidden)).toBeTruthy();
  act(() => values.earned.setValue(1));
  expect(screen.UNSAFE_getAllByType(Path).find((path) => path.props.testID === 'gauge-earned').props.strokeDashoffset).toBe(0);
  expect(screen.UNSAFE_getAllByType(Circle).find((dot) => dot.props.testID === 'gauge-earned-end').props.opacity).toBe(1);
});

test('settled shows only the final content even if animation values are at zero', () => {
  const v = viewFor(goal(3, 'met'));
  const screen = render(<CelebrationGauge card={v.card} gauge={v.gauge} values={valuesFor(0)} settled />);
  expect(screen.queryByTestId('gauge-numeral-from', hidden)).toBeNull();
  expect(screen.queryByTestId('gauge-earned', hidden)).toBeNull();
  expect(screen.queryByTestId('gauge-skeleton', hidden)).toBeNull();
  expect(screen.getByText('3')).toBeTruthy();
  expect(screen.getByText('3 of 3 sessions today')).toBeTruthy();
});

test('suffix rules: exceeded none, no target today, zero uses muted text', () => {
  const screen = render(<CelebrationGauge {...viewFor(goal(6, 'exceeded'))} />);
  expect(screen.queryByText('/3')).toBeNull();
  screen.rerender(<CelebrationGauge {...viewFor(goal(2, 'no_target', null))} />);
  expect(screen.getByText(' today', { normalizer: (text) => text })).toHaveStyle({ marginLeft: 4 });
  screen.rerender(<CelebrationGauge {...viewFor(goal(0))} />);
  expect(screen.getByText('0')).toHaveStyle({ color: colors.textSecondary });
});

test('first session never flashes the old prompt and starts its dot in the earned colour', () => {
  const v = viewFor(goal(1));
  const screen = render(<CelebrationGauge {...v} values={valuesFor()} settled={false} />);
  expect(screen.queryByText('Record your first session.', hidden)).toBeNull();
  expect(screen.UNSAFE_getAllByType(Circle)[0].props.fill).toBe(v.gauge.earned.color);
});

test('skeleton and content cross-fade without changing the content layout', () => {
  const v = viewFor(goal(2));
  const values = valuesFor(0);
  const screen = render(<CelebrationGauge {...v} values={values} settled={false} />);
  expect(screen.getByTestId('gauge-skeleton-overlay', hidden)).toHaveStyle({ position: 'absolute', opacity: 1 });
  expect(screen.getByTestId('gauge-content')).toHaveStyle({ opacity: 0 });
  act(() => values.content.setValue(0.5));
  expect(screen.getByTestId('gauge-skeleton-overlay', hidden)).toHaveStyle({ opacity: 0.5 });
  expect(screen.getByTestId('gauge-content')).toHaveStyle({ opacity: 0.5 });
});

test('same-colour layers swap at the start of the flip while the numeral cross-fades', () => {
  const v = viewFor(goal(4, 'met'));
  const values = valuesFor();
  const screen = render(<CelebrationGauge {...v} values={values} settled={false} />);
  expect(screen.getByTestId('gauge-layer-to')).toHaveStyle({ opacity: 0 });
  act(() => values.flip.setValue(0.01));
  expect(screen.getByTestId('gauge-layer-to')).toHaveStyle({ opacity: 1 });
  expect(screen.queryByTestId('gauge-earned', hidden)).toBeNull();
});
