jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('@react-navigation/native', () => ({
  NavigationContext: require('react').createContext(undefined),
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'ea-1' } }) }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => ({ children: [] }) }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => ({ classes: [] }) }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/assessmentsRepository'),
  assessmentsRepository: { getAssessments: jest.fn(async () => []) },
}));
import React from 'react';
import { fireEvent, within } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import AssessmentRankingScreen from '../src/screens/insights/AssessmentRankingScreen';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { getBarColor } from '../src/components/dashboard/RankedBarRow';
import { OKAY_YELLOW, getBandColor } from '../src/utils/scoreBands';

test('the radio group changes the ranking mode without fetching again', async () => {
  const screen = renderWithProviders(<AssessmentRankingScreen navigation={{ navigate: jest.fn() }} />);
  const group = await screen.findByRole('radiogroup');
  const letters = within(group).getByRole('radio', { name: 'Letters' });
  const words = within(group).getByRole('radio', { name: 'Words' });
  expect(letters.props.accessibilityState.checked).toBe(true);
  fireEvent.press(words);
  expect(words.props.accessibilityState.checked).toBe(true);
  expect(screen.getByText('Ranked by words correct on the most recent EGRA word assessment')).toBeTruthy();
  expect(screen.queryByText("Colour shows each child's level for their grade")).toBeNull();
  expect(assessmentsRepository.getAssessments).toHaveBeenCalledTimes(1);
});

test('ranked bars share the score-band yellow', () => {
  expect(OKAY_YELLOW).toBe('#FFBB00');
  expect(getBarColor(50)).toBe(OKAY_YELLOW);
  expect(getBandColor('okay')).toBe(OKAY_YELLOW);
  const source = require('fs').readFileSync(require('path').join(__dirname, '../src/components/dashboard/RankedBarRow.js'), 'utf8');
  expect(source).toContain("import { OKAY_YELLOW } from '../../utils/scoreBands'");
});
