// __tests__/WeekStrip.test.js
import React from 'react';
import { render } from '@testing-library/react-native';
import WeekStrip from '../src/components/home/WeekStrip';

const days = [
  { day: 'Mon', count: 3, isToday: false, isFuture: false },
  { day: 'Tue', count: 0, isToday: false, isFuture: false },
  { day: 'Wed', count: 2, isToday: false, isFuture: false },
  { day: 'Thu', count: 2, isToday: true, isFuture: false },
  { day: 'Fri', count: 0, isToday: false, isFuture: true },
];

test('each day is one accessible element with the spec labels', () => {
  const screen = render(<WeekStrip days={days} />);
  expect(screen.getByLabelText('Monday, 3 sessions')).toBeTruthy();
  expect(screen.getByLabelText('Tuesday, 0 sessions')).toBeTruthy();
  expect(screen.getByLabelText('Thursday, today, 2 sessions')).toBeTruthy();
  expect(screen.getByLabelText('Friday, upcoming')).toBeTruthy();
  expect(screen.getByText('–')).toBeTruthy();
});

test('one session reads singular', () => {
  const screen = render(<WeekStrip days={[{ day: 'Mon', count: 1, isToday: false, isFuture: false }]} />);
  expect(screen.getByLabelText('Monday, 1 session')).toBeTruthy();
});
