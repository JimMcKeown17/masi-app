import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AssessmentInstructions from '../src/components/assessment/AssessmentInstructions';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('AssessmentInstructions', () => {
  test('renders the assessment details and steps in order and exposes both actions', () => {
    const onStart = jest.fn();
    const onCancel = jest.fn();
    const steps = [
      '1. First instruction',
      '2. Second instruction',
      '3. Third instruction',
    ];
    const { getByText, getAllByText } = render(
      <AssessmentInstructions
        title="Letter Sound Assessment"
        childName="Amahle Dlamini"
        language="English"
        attemptNumber={2}
        steps={steps}
        onStart={onStart}
        onCancel={onCancel}
      />
    );

    expect(getByText('Letter Sound Assessment')).toBeTruthy();
    expect(getByText('Amahle Dlamini')).toBeTruthy();
    expect(getByText('English - Attempt #2')).toBeTruthy();
    expect(getAllByText(/instruction$/).map((node) => node.props.children)).toEqual(steps);

    fireEvent.press(getByText('Start Assessment'));
    fireEvent.press(getByText('Cancel'));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
