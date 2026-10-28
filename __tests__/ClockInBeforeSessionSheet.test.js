import React from 'react';
import { StyleSheet } from 'react-native';
import { colors, tints } from '../src/constants/colors';
import { fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ClockInBeforeSessionSheet from '../src/components/sessions/ClockInBeforeSessionSheet';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

describe('ClockInBeforeSessionSheet', () => {
  test('presents the locked clock-in warning as a bottom sheet with both escape paths', () => {
    const onClockInNow = jest.fn();
    const onContinueAnyway = jest.fn();
    const screen = render(
      <PaperProvider>
        <ClockInBeforeSessionSheet
          visible
          onDismiss={jest.fn()}
          onClockInNow={onClockInNow}
          onContinueAnyway={onContinueAnyway}
        />
      </PaperProvider>
    );

    expect(screen.getByText('You are not clocked in.')).toBeTruthy();
    expect(screen.queryByText(/If you record without clocking in/)).toBeNull();
    fireEvent.press(screen.getByText('Clock in now'));
    fireEvent.press(screen.getByText('Record without clocking in'));
    expect(onClockInNow).toHaveBeenCalledTimes(1);
    expect(onContinueAnyway).toHaveBeenCalledTimes(1);
  });
});

test('Cancel dismisses and the escape hatch is a plain secondary button', () => {
  const onDismiss = jest.fn();
  const sheet = render(<PaperProvider><ClockInBeforeSessionSheet visible onDismiss={onDismiss} /></PaperProvider>);
  fireEvent.press(sheet.getByRole('button', { name: 'Cancel' }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(sheet.queryByText(/If you record without clocking in/)).toBeNull();
  expect(sheet.UNSAFE_queryAllByType('Ionicons').some(node => node.props.name === 'warning-outline')).toBe(false);
  expect(StyleSheet.flatten(sheet.getByRole('button', { name: 'Record without clocking in' }).props.style)).toMatchObject({ backgroundColor: colors.surface, borderColor: tints.control, borderWidth: 1.5 });
});

test('clocking in reports busy, disables the escape hatch, and keeps Cancel enabled', () => {
  const onDismiss = jest.fn();
  const onContinueAnyway = jest.fn();
  const sheet = render(<PaperProvider><ClockInBeforeSessionSheet visible clockingIn onDismiss={onDismiss} onContinueAnyway={onContinueAnyway} /></PaperProvider>);
  expect(sheet.getByRole('button', { name: 'Clocking in…' }).props.accessibilityState).toEqual({ busy: true, disabled: true });
  const escape = sheet.getByRole('button', { name: 'Record without clocking in' });
  expect(escape.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(escape);
  expect(onContinueAnyway).not.toHaveBeenCalled();
  expect(sheet.getByRole('button', { name: 'Cancel' }).props.accessibilityState.disabled).toBe(false);
  fireEvent.press(sheet.getByRole('button', { name: 'Cancel' }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
