jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import { StyleSheet } from 'react-native';
import { colors } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
import SurfaceCard from '../src/components/common/SurfaceCard';
import AssessmentDetailScreen from '../src/screens/assessments/AssessmentDetailScreen';
import React from 'react';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
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

function renderScreen(overrides = {}) {
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
            assessment: { ...assessment, ...overrides },
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

    fireEvent.press(getByText('Try again'));

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

test('low-score results use action red for text and a secondary Try again button', () => {
  const screen = renderScreen({ accuracy: 20 });
  expect(StyleSheet.flatten(screen.getByText('Keep practicing!').props.style).color).toBe(colors.primary);
  expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Try again' }).props.style).backgroundColor).toBe(colors.surface);
  expect(screen.UNSAFE_getAllByType(SurfaceCard)).toHaveLength(3);
  const label = within(screen.UNSAFE_getAllByType(SurfaceCard)[2]).getByText('Incorrect');
  expect(StyleSheet.flatten(label.props.style)).toMatchObject(typeRoles.textLabel);
});

test('assessment detail uses contrasting low-score text and shared stat cards', () => {
  const screen = render(<AssessmentDetailScreen route={{ params: { childName: 'A Child', assessment: {
    ...assessment, accuracy: 20, date_assessed: '2026-10-19', letter_language: 'English',
    attempt_number: 1, items_tested: letterSet.letters,
  } } }} />);
  expect(StyleSheet.flatten(screen.getByText('Keep practicing!').props.style).color).toBe(colors.primary);
  expect(screen.UNSAFE_getAllByType(SurfaceCard)).toHaveLength(3);
});
