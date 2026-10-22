import React from 'react';
const ReactNative = require('react-native');
import { StyleSheet } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders as render } from '../test-support/renderWithProviders';
import AssessmentStatCards from '../src/components/assessment/AssessmentStatCards';
import SurfaceCard from '../src/components/common/SurfaceCard';
import { colors } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

const stats = [
  { key: 'attempted', value: 11, label: 'Attempted', accentColor: colors.primary },
  { key: 'correct', value: 7, label: 'Correct', accentColor: colors.success },
  { key: 'incorrect', value: 4, label: 'Incorrect', accentColor: colors.emphasis },
];
const style = node => StyleSheet.flatten(node.props.style);
const width = (screen, value) => fireEvent(screen.getByTestId('assessment-stat-cards'), 'layout', {
  nativeEvent: { layout: { width: value } },
});
const lines = (screen, label, count) => fireEvent(screen.getByText(label), 'textLayout', {
  nativeEvent: { lines: Array.from({ length: count }, () => ({})) },
});
const fit = screen => stats.forEach(stat => lines(screen, stat.label, 1));

beforeEach(() => jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
  width: 360, height: 800, scale: 1, fontScale: 1,
}));
afterEach(() => jest.restoreAllMocks());

test('keeps the full-size row invisible until every label measures one line', () => {
  const screen = render(<AssessmentStatCards stats={stats} />);
  const layout = () => screen.getByTestId('assessment-stat-layout');
  expect(style(layout())).toMatchObject({ flexDirection: 'row', opacity: 0 });
  width(screen, 312);
  lines(screen, 'Attempted', 1);
  lines(screen, 'Correct', 1);
  expect(style(layout()).opacity).toBe(0);
  lines(screen, 'Incorrect', 1);
  expect(style(layout())).toMatchObject({ flexDirection: 'row', opacity: 1 });
  stats.forEach(({ label, value, accentColor }, index) => {
    const text = screen.getByText(label);
    expect(text.props.adjustsFontSizeToFit).toBeUndefined();
    expect(text.props.minimumFontScale).toBeUndefined();
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.allowFontScaling).not.toBe(false);
    expect(text.props.maxFontSizeMultiplier).toBeUndefined();
    expect(style(text)).toMatchObject({ ...typeRoles.textLabel, color: colors.textSecondary });
    expect(style(screen.UNSAFE_getAllByType(SurfaceCard)[index])).toMatchObject({
      borderTopColor: accentColor, borderTopWidth: 3, paddingVertical: 16, alignItems: 'center',
    });
    expect(screen.getByLabelText(`${label}, ${value}`).props.accessible).toBe(true);
    expect(text.props.accessible).toBe(false);
    expect(screen.getByText(String(value)).props.accessible).toBe(false);
  });
});

test.each(['Attempted', 'Correct', 'Incorrect'])('%s reporting two lines stacks all cards at full font size', label => {
  const screen = render(<AssessmentStatCards stats={stats} />);
  width(screen, 312);
  lines(screen, label, 2);
  expect(style(screen.getByTestId('assessment-stat-layout'))).toMatchObject({
    flexDirection: 'column', opacity: 1,
  });
  expect(screen.getAllByLabelText(/^(Attempted|Correct|Incorrect), \d+$/)).toHaveLength(3);
  stats.forEach(({ label, value, accentColor }, index) => {
    expect(screen.getByLabelText(`${label}, ${value}`).props.accessible).toBe(true);
    expect(style(screen.UNSAFE_getAllByType(SurfaceCard)[index])).toMatchObject({
      flexDirection: 'row', justifyContent: 'space-between', borderTopColor: accentColor, borderTopWidth: 3,
    });
    const text = screen.getByText(label);
    expect(style(text).textAlign).toBe('left');
    expect(style(screen.getByText(String(value))).textAlign).toBe('right');
    expect(text.props.accessible).toBe(false);
    expect(screen.getByText(String(value)).props.accessible).toBe(false);
    expect(text.props.adjustsFontSizeToFit).toBeUndefined();
    expect(text.props.minimumFontScale).toBeUndefined();
    expect(text.props.allowFontScaling).not.toBe(false);
    expect(text.props.maxFontSizeMultiplier).toBeUndefined();
  });
});

test.each(['width', 'font scale'])('a later %s change remeasures and can return from stack to row', change => {
  ReactNative.useWindowDimensions.mockReturnValue({ width: 360, height: 800, scale: 1, fontScale: 1.3 });
  const screen = render(<AssessmentStatCards stats={stats} />);
  width(screen, 312);
  lines(screen, 'Attempted', 2);
  const layout = () => screen.getByTestId('assessment-stat-layout');
  expect(style(layout()).flexDirection).toBe('column');

  if (change === 'width') width(screen, 480);
  else {
    ReactNative.useWindowDimensions.mockReturnValue({ width: 360, height: 800, scale: 1, fontScale: 1 });
    screen.rerender(<AssessmentStatCards stats={stats} />);
  }
  expect(style(layout())).toMatchObject({ flexDirection: 'row', opacity: 0 });
  fit(screen);
  expect(style(layout())).toMatchObject({ flexDirection: 'row', opacity: 1 });
  // A height-only notification must not hide or remeasure the chosen row.
  width(screen, change === 'width' ? 480 : 312);
  expect(style(layout())).toMatchObject({ flexDirection: 'row', opacity: 1 });
});

test('zero-line text decides stacked immediately, and late row events cannot undo it', () => {
  const screen = render(<AssessmentStatCards stats={stats} />);
  width(screen, 312);
  const lateRowEvent = screen.getByText('Attempted').props.onTextLayout;
  lines(screen, 'Attempted', 0);
  expect(style(screen.getByTestId('assessment-stat-layout'))).toMatchObject({
    flexDirection: 'column', opacity: 1,
  });
  act(() => lateRowEvent({ nativeEvent: { lines: [{}] } }));
  expect(style(screen.getByTestId('assessment-stat-layout'))).toMatchObject({
    flexDirection: 'column', opacity: 1,
  });
});

test('replacing a label starts a fresh measurement while changing only values preserves layout', () => {
  const screen = render(<AssessmentStatCards stats={stats} />);
  width(screen, 312);
  fit(screen);
  screen.rerender(<AssessmentStatCards stats={stats.map(stat => ({ ...stat, value: stat.value + 1 }))} />);
  expect(style(screen.getByTestId('assessment-stat-layout')).opacity).toBe(1);
  expect(screen.getByLabelText('Attempted, 12')).toBeTruthy();
  screen.rerender(<AssessmentStatCards stats={stats.map(stat => stat.key === 'attempted'
    ? { ...stat, label: 'Tried' } : stat)} />);
  expect(style(screen.getByTestId('assessment-stat-layout')).opacity).toBe(0);
  ['Tried', 'Correct', 'Incorrect'].forEach(label => lines(screen, label, 1));
  expect(style(screen.getByTestId('assessment-stat-layout')).opacity).toBe(1);
});

test('callbacks from the previous width cannot decide a new measurement pass', () => {
  const screen = render(<AssessmentStatCards stats={stats} />);
  width(screen, 312);
  const previousWidthEvent = screen.getByText('Attempted').props.onTextLayout;
  width(screen, 480);
  act(() => previousWidthEvent({ nativeEvent: { lines: [{}, {}] } }));
  expect(style(screen.getByTestId('assessment-stat-layout'))).toMatchObject({ flexDirection: 'row', opacity: 0 });
  fit(screen);
  expect(style(screen.getByTestId('assessment-stat-layout'))).toMatchObject({ flexDirection: 'row', opacity: 1 });
});

describe('bounded measurement fallback', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('a missing callback reveals stacked cards after 1000ms from the measured width', () => {
    const screen = render(<AssessmentStatCards stats={stats} />);
    act(() => jest.advanceTimersByTime(1000));
    expect(style(screen.getByTestId('assessment-stat-layout')).opacity).toBe(0);
    width(screen, 312);
    lines(screen, 'Attempted', 1);
    lines(screen, 'Correct', 1);
    act(() => jest.advanceTimersByTime(999));
    expect(style(screen.getByTestId('assessment-stat-layout')).opacity).toBe(0);
    act(() => jest.advanceTimersByTime(1));
    expect(style(screen.getByTestId('assessment-stat-layout'))).toMatchObject({
      flexDirection: 'column', opacity: 1,
    });
  });

  test('a normal row decision clears the timer and ignores subsequent measurements', () => {
    const screen = render(<AssessmentStatCards stats={stats} />);
    width(screen, 312);
    const lateRowEvent = screen.getByText('Attempted').props.onTextLayout;
    act(() => jest.advanceTimersByTime(400));
    fit(screen);
    expect(style(screen.getByTestId('assessment-stat-layout'))).toMatchObject({
      flexDirection: 'row', opacity: 1,
    });
    expect(jest.getTimerCount()).toBe(0);
    act(() => {
      lateRowEvent({ nativeEvent: { lines: [{}, {}] } });
      jest.advanceTimersByTime(1000);
    });
    expect(style(screen.getByTestId('assessment-stat-layout'))).toMatchObject({
      flexDirection: 'row', opacity: 1,
    });
  });

  test.each([0, 2])('%s lines decides stacked and clears the pending timer', count => {
    const screen = render(<AssessmentStatCards stats={stats} />);
    width(screen, 312);
    expect(jest.getTimerCount()).toBe(1);
    lines(screen, 'Attempted', count);
    expect(jest.getTimerCount()).toBe(0);
    act(() => jest.advanceTimersByTime(1000));
    expect(style(screen.getByTestId('assessment-stat-layout'))).toMatchObject({
      flexDirection: 'column', opacity: 1,
    });
  });

  test.each(['width', 'font scale', 'labels'])('a new %s generation after fallback can return to row', change => {
    const screen = render(<AssessmentStatCards stats={stats} />);
    width(screen, 312);
    const lateRowEvent = screen.getByText('Attempted').props.onTextLayout;
    act(() => jest.advanceTimersByTime(1000));
    act(() => lateRowEvent({ nativeEvent: { lines: [{}] } }));
    expect(style(screen.getByTestId('assessment-stat-layout'))).toMatchObject({
      flexDirection: 'column', opacity: 1,
    });

    if (change === 'width') width(screen, 480);
    else if (change === 'font scale') {
      ReactNative.useWindowDimensions.mockReturnValue({ width: 360, height: 800, scale: 1, fontScale: 1.3 });
      screen.rerender(<AssessmentStatCards stats={stats} />);
    } else {
      screen.rerender(<AssessmentStatCards stats={stats.map(stat => stat.key === 'attempted'
        ? { ...stat, label: 'Tried' } : stat)} />);
    }
    expect(style(screen.getByTestId('assessment-stat-layout'))).toMatchObject({
      flexDirection: 'row', opacity: 0,
    });
    [change === 'labels' ? 'Tried' : 'Attempted', 'Correct', 'Incorrect']
      .forEach(label => lines(screen, label, 1));
    expect(style(screen.getByTestId('assessment-stat-layout'))).toMatchObject({
      flexDirection: 'row', opacity: 1,
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a width change cancels the previous deadline and starts a fresh 1000ms window', () => {
    const screen = render(<AssessmentStatCards stats={stats} />);
    width(screen, 312);
    act(() => jest.advanceTimersByTime(500));
    width(screen, 480);
    expect(jest.getTimerCount()).toBe(1);
    act(() => jest.advanceTimersByTime(999));
    expect(style(screen.getByTestId('assessment-stat-layout')).opacity).toBe(0);
    act(() => jest.advanceTimersByTime(1));
    expect(style(screen.getByTestId('assessment-stat-layout'))).toMatchObject({
      flexDirection: 'column', opacity: 1,
    });
  });

  test('unmount clears the deadline and ignores late native events without a warning', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const screen = render(<AssessmentStatCards stats={stats} />);
    width(screen, 312);
    const lateRowEvent = screen.getByText('Attempted').props.onTextLayout;
    expect(jest.getTimerCount()).toBe(1);
    screen.unmount();
    expect(jest.getTimerCount()).toBe(0);
    act(() => {
      lateRowEvent({ nativeEvent: { lines: [{}] } });
      jest.advanceTimersByTime(1000);
    });
    expect(error).not.toHaveBeenCalled();
  });
});
