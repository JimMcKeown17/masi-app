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
    const screen = render(<Countdown getRemainingMs={() => remainingMs} />);

    expect(screen.getByText('1:00')).toBeTruthy();
    expect(screen.getByLabelText('Time left, 60 seconds')).toBeTruthy();

    remainingMs = 50000;
    act(() => jest.advanceTimersByTime(250));

    expect(screen.getByText('0:50')).toBeTruthy();
    expect(screen.getByLabelText('Time left, 50 seconds')).toBeTruthy();
  });

  test('is memoized as the isolated ticking leaf', () => {
    expect(Countdown.$$typeof).toBe(Symbol.for('react.memo'));
  });

  test('uses the error colour at ten seconds or less', () => {
    const screen = render(<Countdown getRemainingMs={() => 10000} />);

    expect(StyleSheet.flatten(screen.getByText('0:10').props.style).color)
      .toBe(tokens.color.error);
  });
});
