import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import MonthCalendar from '../src/components/common/MonthCalendar';
import { colors } from '../src/constants/colors';
import { fontFamilies, typeRoles } from '../src/constants/typography';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

describe('MonthCalendar', () => {
  const originalTimeZone = process.env.TZ;
  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  test.each(['Africa/Johannesburg', 'Pacific/Auckland'])('calendar keys stay on the same day in %s', (zone) => {
    process.env.TZ = zone;
    const onSelect = jest.fn();
    const screen = render(<MonthCalendar selectedKey="2026-10-15" todayKey="2026-10-15" onSelect={onSelect} />);
    expect(screen.getByRole('header', { name: 'October 2026' })).toBeTruthy();
    const today = screen.getByRole('button', { name: 'Thu 15 October 2026' });
    expect(today.props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(StyleSheet.flatten(today.props.style)).toMatchObject({ width: 44, height: 44, backgroundColor: colors.text });
    expect(StyleSheet.flatten(within(today).getByText('15').props.style)).toMatchObject({ ...typeRoles.textDay, color: colors.onDark, fontFamily: fontFamilies.textHeavy });
    expect(within(today).getByText('15').props.maxFontSizeMultiplier).toBe(1.2);
    const future = screen.getByRole('button', { name: 'Fri 16 October 2026, unavailable' });
    expect(future.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(future);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Next month' }).props.accessibilityState.disabled).toBe(true);
    const firstRow = screen.getByTestId('calendar-week-0');
    expect(firstRow.children).toHaveLength(7);
    expect(firstRow.children.slice(0, 4).every(cell => within(cell).queryAllByRole('button').length === 0)).toBe(true);
    expect(within(firstRow.children[4]).getByRole('button', { name: 'Thu 1 October 2026' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Mon 12 October 2026' }));
    expect(onSelect).toHaveBeenCalledWith('2026-10-12');
    fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('header', { name: 'September 2026' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next month' }).props.accessibilityState.disabled).toBe(false);
    fireEvent.press(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('header', { name: 'October 2026' })).toBeTruthy();
  });

  test('opens the selected month and crosses the year boundary', () => {
    const screen = render(<MonthCalendar selectedKey="2026-01-10" todayKey="2026-10-15" onSelect={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'January 2026' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('header', { name: 'December 2025' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('button', { name: 'Sat 10 January 2026' }).props.accessibilityState.selected).toBe(true);
  });

  test('today has an ink ring when a past day is selected', () => {
    const screen = render(<MonthCalendar selectedKey="2026-10-12" todayKey="2026-10-15" onSelect={jest.fn()} />);
    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Thu 15 October 2026' }).props.style)).toMatchObject({ borderWidth: 1.5, borderColor: colors.text });
  });
});
