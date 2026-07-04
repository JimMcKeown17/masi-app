import React from 'react';
import { render, act } from '@testing-library/react-native';
import ElapsedTime, { formatElapsedTime } from '../src/components/common/ElapsedTime';

describe('ElapsedTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-04T10:00:30.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders and ticks the elapsed time from signInTime', () => {
    const { getByText } = render(<ElapsedTime signInTime="2026-07-04T10:00:00.000Z" />);
    expect(getByText('0h 0m 30s')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(getByText('0h 0m 32s')).toBeTruthy();
  });

  test('renders nothing without a signInTime', () => {
    const { toJSON } = render(<ElapsedTime signInTime={null} />);
    expect(toJSON()).toBeNull();
  });

  test('formatElapsedTime formats hours, minutes, seconds', () => {
    expect(formatElapsedTime(3723000)).toBe('1h 2m 3s');
  });
});
