import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import EndAssessmentButton from '../src/components/assessment/EndAssessmentButton';

describe('EndAssessmentButton', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows the exact confirmation and calls onEnd only from the destructive action', () => {
    const onEnd = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText } = render(<EndAssessmentButton onEnd={onEnd} />);

    fireEvent.press(getByText('End Assessment'));

    expect(alertSpy).toHaveBeenCalledWith(
      'End Assessment?',
      'End the assessment now and record current results?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End', style: 'destructive', onPress: onEnd },
      ]
    );
    expect(onEnd).not.toHaveBeenCalled();

    alertSpy.mock.calls[0][2][1].onPress();

    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
