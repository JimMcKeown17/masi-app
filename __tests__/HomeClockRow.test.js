// __tests__/HomeClockRow.test.js
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

import React from 'react';
import { StyleSheet } from 'react-native';
import { typeRoles } from '../src/constants/typography';
import { colors } from '../src/constants/colors';
import { fireEvent, render } from '@testing-library/react-native';
import HomeClockRow from '../src/components/home/HomeClockRow';

const handlers = () => ({ onOpenHistory: jest.fn(), onClockIn: jest.fn(), onClockOut: jest.fn() });

describe('HomeClockRow', () => {
  test('not clocked in: status opens history, Clock in clocks in', () => {
    const h = handlers();
    const screen = render(<HomeClockRow isSignedIn={false} loadingLocation={false} {...h} />);
    fireEvent.press(screen.getByLabelText('Not clocked in. View work history'));
    fireEvent.press(screen.getByLabelText('Clock in'));
    expect(h.onOpenHistory).toHaveBeenCalled();
    expect(h.onClockIn).toHaveBeenCalled();
  });

  test('clocked in: label says since when, Clock out clocks out', () => {
    const h = handlers();
    const screen = render(
      <HomeClockRow isSignedIn loadingLocation={false} signInTime="2026-10-15T05:52:00.000Z" {...h} />
    );
    expect(screen.getByText('On the clock')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByText('On the clock').props.style)).toMatchObject({ ...typeRoles.textOptionSelected, color: colors.onDark });
    expect(StyleSheet.flatten(screen.getByText('Since 07:52').props.style)).toMatchObject({ ...typeRoles.textCaption, color: colors.red50, fontVariant: ['tabular-nums'] });
    expect(StyleSheet.flatten(screen.getByTestId('home-clock-row').props.style)).toMatchObject({ minHeight: 64, flexDirection: 'row' });
    expect(screen.queryByText(/\d+h \d+m/)).toBeNull();
    fireEvent.press(screen.getByLabelText('On the clock since 07:52. View work history'));
    fireEvent.press(screen.getByLabelText('Clock out'));
    expect(h.onClockOut).toHaveBeenCalled();
  });

  test('getting location: no action button', () => {
    const screen = render(<HomeClockRow isSignedIn={false} loadingLocation {...handlers()} />);
    expect(screen.getByText('Getting location…')).toBeTruthy();
    expect(screen.queryByLabelText('Clock in')).toBeNull();
  });

  test.each([true, false])('stacks above font scale 1.3 (clocked in: %s)', isSignedIn => {
    const screen = render(<HomeClockRow isSignedIn={isSignedIn} signInTime="2026-10-15T05:52:00.000Z" loadingLocation={false} fontScale={2} {...handlers()} />);
    expect(screen.getByTestId('home-clock-row').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })])
    );
  });
});
