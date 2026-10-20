import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import AssessmentsScreen from '../src/screens/main/AssessmentsScreen';

const mockGetAssessments = jest.fn();
const mockGate = jest.fn();
jest.mock('../src/context/SignedInEAContext', () => ({
  useSignedInEA: () => ({ handle: {}, repositories: { assessments: { getAssessments: mockGetAssessments } } }),
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
const mockChildren = [];
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => ({ children: mockChildren }) }));
jest.mock('../src/services/activeProgrammeGate', () => ({ getActiveProgrammeGate: (...args) => mockGate(...args) }));
jest.mock('@react-navigation/native', () => ({
  NavigationContext: require('react').createContext(undefined),
  useFocusEffect: callback => require('react').useEffect(callback, [callback]),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGate.mockResolvedValue({ hasActiveProgramme: true });
  mockGetAssessments.mockResolvedValue([]);
});

test('lists the registry standalone tests and launches child select by code', async () => {
  const navigation = { navigate: jest.fn() };
  const screen = render(<PaperProvider><AssessmentsScreen navigation={navigation} /></PaperProvider>);
  await screen.findByText('Letter Sounds');
  expect(screen.getByText('Word Reading')).toBeTruthy();
  expect(screen.getByText('60-second letter sound test')).toBeTruthy();
  expect(screen.getByText('60-second word reading test')).toBeTruthy();
  const starts = screen.getAllByText('Start assessment');
  fireEvent.press(starts[0]);
  expect(navigation.navigate).toHaveBeenLastCalledWith('AssessmentChildSelect', { testCode: 'letter_sounds' });
  fireEvent.press(starts[1]);
  expect(navigation.navigate).toHaveBeenLastCalledWith('AssessmentChildSelect', { testCode: 'word_reading' });
  fireEvent.press(screen.getByText('View history'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('AssessmentHistory');
});

test('retains the active-programme gate for starting tests', async () => {
  mockGate.mockResolvedValue({ hasActiveProgramme: false });
  const screen = render(<PaperProvider><AssessmentsScreen navigation={{ navigate: jest.fn() }} /></PaperProvider>);
  await screen.findByText(/No active programme/);
  expect(screen.queryByText('Start assessment')).toBeNull();
});
