import React from 'react';
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
