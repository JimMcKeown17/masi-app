import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ChildResultsScreen from '../src/screens/assessments/ChildResultsScreen';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { useAuth } from '../src/context/AuthContext';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { getAssessments: jest.fn(), countAssessments: jest.fn() },
}));
jest.mock('../src/components/assessment/LetterMasteryPanel', () => {
  const { Text } = require('react-native');
  return () => <Text>MASTERY_PANEL</Text>;
});

describe('ChildResultsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    assessmentsRepository.getAssessments.mockResolvedValue([]);
    assessmentsRepository.countAssessments.mockResolvedValue(0);
  });

  test('renders assessment sections and embeds the mastery panel', async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      params: {
        child: { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' },
        classItem: { id: 'class-1', home_language: 'English' },
      },
    };
    const { getByText, queryByText } = render(
      <PaperProvider>
        <ChildResultsScreen navigation={navigation} route={route} />
      </PaperProvider>,
    );

    await waitFor(() => expect(getByText('Amahle Dlamini')).toBeTruthy());
    expect(getByText('Letter Sound')).toBeTruthy();
    expect(getByText('MASTERY_PANEL')).toBeTruthy();
    expect(queryByText('View and manage letter mastery progress')).toBeNull();
  });
});
