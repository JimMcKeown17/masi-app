import React from 'react';
import { render, act } from '@testing-library/react-native';
import CountdownTimer from '../src/components/assessment/CountdownTimer';

describe('CountdownTimer', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('shows remaining seconds from getElapsedMs and ticks down', () => {
    let elapsed = 0;
    const getElapsedMs = () => elapsed;
    const { getByText } = render(<CountdownTimer getElapsedMs={getElapsedMs} />);
    expect(getByText('60s')).toBeTruthy();
    elapsed = 5000;
    act(() => { jest.advanceTimersByTime(1000); });
    expect(getByText('55s')).toBeTruthy();
  });

  test('never shows negative remaining', () => {
    const getElapsedMs = () => 999000;
    const { getByText } = render(<CountdownTimer getElapsedMs={getElapsedMs} />);
    expect(getByText('0s')).toBeTruthy();
  });
});
