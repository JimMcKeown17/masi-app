import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { Countdown } from '../Countdown';
import { tokens } from '../../theme/tokens';

describe('Countdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('shows the remaining time immediately and updates from its stable clock callback', () => {
    let remainingMs = 60000;
    const screen = render(<Countdown getRemainingMs={() => remainingMs} durationMs={60000} />);

    expect(screen.getByText('60s')).toBeTruthy();
    expect(screen.getByLabelText('Time left, 60 seconds')).toBeTruthy();

    remainingMs = 50000;
    act(() => jest.advanceTimersByTime(250));

    expect(screen.getByText('50s')).toBeTruthy();
    expect(screen.getByLabelText('Time left, 50 seconds')).toBeTruthy();
  });

  test('is memoized as the isolated ticking leaf', () => {
    expect(Countdown.$$typeof).toBe(Symbol.for('react.memo'));
  });

  test('uses the warning colour at ten seconds or less', () => {
    const screen = render(<Countdown getRemainingMs={() => 10000} durationMs={60000} />);

    expect(StyleSheet.flatten(screen.getByText('10s').props.style).color)
      .toBe(tokens.color.warning);
    const fill = StyleSheet.flatten(screen.getByTestId('countdown-fill').props.style);
    expect(fill.backgroundColor).toBe(tokens.color.warning);
    expect(parseFloat(fill.width)).toBeCloseTo(100 * 10 / 60, 1);
  });

  test('is marked green above ten seconds', () => {
    const screen = render(<Countdown getRemainingMs={() => 11000} durationMs={60000} />);

    expect(screen.getByText('11s')).toHaveStyle({ color: tokens.color.marked });
    expect(screen.getByTestId('countdown-fill')).toHaveStyle({ backgroundColor: tokens.color.marked });
  });

  test('ticks every 250 ms and clears its interval on unmount', () => {
    let remainingMs = 60000;
    const screen = render(<Countdown getRemainingMs={() => remainingMs} durationMs={60000} />);
    expect(jest.getTimerCount()).toBe(1);
    remainingMs = 59000;
    act(() => jest.advanceTimersByTime(249));
    expect(screen.getByText('60s')).toBeTruthy();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByText('59s')).toBeTruthy();
    screen.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
