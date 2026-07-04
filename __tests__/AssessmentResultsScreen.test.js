import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import AssessmentResultsScreen from '../src/screens/assessments/AssessmentResultsScreen';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');

  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaInsetsContext: React.createContext({ top: 0, right: 0, bottom: 0, left: 0 }),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('../src/utils/assessmentRouting', () => ({
  resolveAssessmentRoute: jest.fn(),
}));

import { resolveAssessmentRoute } from '../src/utils/assessmentRouting';

const assessment = {
  letters_attempted: 31,
  correct_responses: 21,
  accuracy: 68,
  completion_time: 61,
  correct_letters: [{ index: 0 }, { index: 2 }],
  incorrect_letters: [{ index: 1 }],
  last_letter_attempted: { index: 2 },
};

const child = {
  first_name: 'Amahle',
  last_name: 'Dlamini',
};

const letterSet = {
  language: 'English',
  letters: ['a', 'b', 'c', 'd', 'e'],
};

function renderScreen() {
  const navigation = {
    replace: jest.fn(),
    navigate: jest.fn(),
  };

  const utils = render(
    <PaperProvider>
      <AssessmentResultsScreen
        navigation={navigation}
        route={{
          params: {
            assessment,
            child,
            letterSet,
            attemptNumber: 2,
          },
        }}
      />
    </PaperProvider>
  );

  return { navigation, ...utils };
}

describe('AssessmentResultsScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows correct responses as the primary result with accuracy as supporting context', () => {
    const { getByLabelText, getByText } = renderScreen();

    expect(getByLabelText('Assessment main result')).toHaveTextContent('21');
    expect(getByText('68% correct')).toBeTruthy();
    expect(getByText('Completed in 61s')).toBeTruthy();
  });

  test.each([
    ['sequential', 'SequentialAssessment'],
    ['grid', 'LetterAssessment'],
  ])('Try Again routes %s capture mode through the resolver', async (mode, screenName) => {
    resolveAssessmentRoute.mockResolvedValueOnce({ screenName, captureMode: mode });
    const { navigation, getByText } = renderScreen();

    fireEvent.press(getByText('Try Again'));

    await waitFor(() => {
      expect(resolveAssessmentRoute).toHaveBeenCalledTimes(1);
      expect(navigation.replace).toHaveBeenCalledWith(
        screenName,
        expect.objectContaining({
          child,
          letterSet,
          attemptNumber: 3,
          assessmentType: 'letter_egra',
          captureMode: mode,
        }),
      );
    });
  });
});
