import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, tints } from '../src/constants/colors';
import InlineNote from '../src/components/common/InlineNote';
import { fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ClockInBeforeSessionSheet from '../src/components/sessions/ClockInBeforeSessionSheet';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

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
    expect(screen.getByText(
      'If you record without clocking in, your hours for this session will not be counted. '
      + 'Only do this if your GPS will not lock.'
    )).toBeTruthy();
    fireEvent.press(screen.getByText('Clock in now'));
    fireEvent.press(screen.getByText('Record without clocking in'));
    expect(onClockInNow).toHaveBeenCalledTimes(1);
    expect(onContinueAnyway).toHaveBeenCalledTimes(1);
  });
});

test('Cancel dismisses and the D8 warning uses the shared note and warning button', () => {
  const onDismiss = jest.fn();
  const sheet = render(<PaperProvider><ClockInBeforeSessionSheet visible onDismiss={onDismiss} /></PaperProvider>);
  fireEvent.press(sheet.getByRole('button', { name: 'Cancel' }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  const note = sheet.UNSAFE_getByType(InlineNote);
  expect(note.props).toMatchObject({ tone: 'warning', size: 'md' });
  expect(note.findAllByType(View).some((node) => StyleSheet.flatten(node.props.style)?.backgroundColor === colors.warningBg)).toBe(true);
  expect(StyleSheet.flatten(sheet.getByRole('button', { name: 'Record without clocking in' }).props.style)).toMatchObject({ backgroundColor: colors.warningBg, borderColor: tints.warningControl, borderWidth: 1.5 });
});
