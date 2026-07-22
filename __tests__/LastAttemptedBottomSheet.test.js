import React from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import LastAttemptedBottomSheet from '../src/components/assessment/LastAttemptedBottomSheet';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaInsetsContext: {
    Consumer: ({ children }) => children({ top: 0, right: 0, bottom: 0, left: 0 }),
  },
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const renderSheet = (props = {}) => render(
  <PaperProvider settings={{ icon: () => null }}>
    <LastAttemptedBottomSheet
      visible
      letterSet={{ type: 'letter', columns: 2, letters: ['a', 'b'] }}
      letterStates={[true, false]}
      defaultIndex={0}
      onConfirm={jest.fn()}
      onCancel={jest.fn()}
      {...props}
    />
  </PaperProvider>,
);

describe('LastAttemptedBottomSheet', () => {
  test('uses the canonical backdrop and preserves both cancel paths', () => {
    const backSpy = jest.spyOn(BackHandler, 'addEventListener');
    const onCancel = jest.fn();
    const sheet = renderSheet({ onCancel });
    const backdrop = sheet.getByLabelText('Dismiss last attempted selector');

    expect(StyleSheet.flatten(backdrop.props.style).backgroundColor)
      .toBe('rgba(0, 0, 0, 0.5)');

    fireEvent.press(backdrop);

    // BottomSheet renders through Portal now; hardware back dismissal goes
    // through the BackHandler subscription instead of Modal onRequestClose.
    const backCall = backSpy.mock.calls.find(([event]) => event === 'hardwareBackPress');
    expect(backCall).toBeTruthy();
    act(() => {
      backCall[1]();
    });

    expect(onCancel).toHaveBeenCalledTimes(2);
    backSpy.mockRestore();
  });

  test('confirms the selected index without adding a visible Cancel button', () => {
    const onConfirm = jest.fn();
    const sheet = renderSheet({ onConfirm });

    expect(sheet.queryByText('Cancel')).toBeNull();
    fireEvent.press(sheet.getByLabelText('Select letter b as last attempted'));
    fireEvent.press(sheet.getByText('Confirm'));

    expect(onConfirm).toHaveBeenCalledWith(1);
  });
});
