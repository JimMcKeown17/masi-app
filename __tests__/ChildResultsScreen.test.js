jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ChildResultsScreen from '../src/screens/assessments/ChildResultsScreen';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { useAuth } from '../src/context/AuthContext';

jest.mock('@react-navigation/native', () => ({
  NavigationContext: require('react').createContext(undefined),
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/assessmentsRepository'),
  assessmentsRepository: { getQuestionResults: jest.fn() },
}));
jest.mock('../src/components/assessment/LetterMasteryPanel', () => {
  const { Text } = require('react-native');
  return () => <Text>MASTERY_PANEL</Text>;
});

describe('ChildResultsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    assessmentsRepository.getQuestionResults.mockResolvedValue([]);
  });

  test('renders assessment sections and embeds the mastery panel', async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      params: {
        child: {
          id: 'child-1',
          first_name: 'Amahle',
          last_name: 'Dlamini',
          reading_level: 'Word Reading',
        },
        classItem: { id: 'class-1', home_language: 'English' },
      },
    };
    const { getByText, queryByText } = render(
      <PaperProvider>
        <ChildResultsScreen navigation={navigation} route={route} />
      </PaperProvider>,
    );

    await waitFor(() => expect(getByText('Amahle Dlamini')).toBeTruthy());
    expect(getByText('Current reading level: Word Reading')).toBeTruthy();
    expect(getByText('Letter Sounds')).toBeTruthy();
    expect(getByText('MASTERY_PANEL')).toBeTruthy();
    expect(queryByText('View and manage letter mastery progress')).toBeNull();
  });

  test('reads each standalone test by code and opens its latest stored result in Detail', async () => {
    const child = { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' };
    const older = { id: 'older', child_id: child.id, question_code: 'letter_sounds', assessment_date: '2026-10-19', created_at: '2026-10-19T12:00:00Z', score: 8, total_items: 60, derived: { percent: 40 } };
    const latest = { ...older, id: 'latest', assessment_date: '2026-10-20', created_at: '2026-10-20T12:00:00Z', score: 9, derived: { percent: 45 } };
    assessmentsRepository.getQuestionResults.mockResolvedValue([older, latest]);
    const navigation = { navigate: jest.fn() };
    const screen = render(<PaperProvider><ChildResultsScreen navigation={navigation} route={{ params: { child, classItem: { home_language: 'isiXhosa' } } }} /></PaperProvider>);
    await screen.findByText('9 / 60 correct');
    expect(assessmentsRepository.getQuestionResults).toHaveBeenCalledWith({
      userId: 'user-1', childId: child.id, questionCodes: ['letter_sounds', 'word_reading'],
    });
    expect(screen.getByText('45%')).toBeTruthy();
    fireEvent.press(screen.getByText('View detail'));
    expect(navigation.navigate).toHaveBeenCalledWith('AssessmentDetail', {
      assessment: { ...latest, date_assessed: latest.assessment_date }, childName: 'Amahle Dlamini',
    });
  });

});
