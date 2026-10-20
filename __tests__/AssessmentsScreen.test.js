import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import AssessmentsScreen from '../src/screens/main/AssessmentsScreen';

const mockGetLetterResults = jest.fn();
const mockGetAcademicYears = jest.fn();
const mockGate = jest.fn();
jest.mock('../src/context/SignedInEAContext', () => ({
  useSignedInEA: () => ({ handle: {}, repositories: {
    assessments: { getLetterResults: mockGetLetterResults },
    academicYears: { getAll: mockGetAcademicYears },
  } }),
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
  mockChildren.splice(0);
  mockGate.mockResolvedValue({ hasActiveProgramme: true });
  mockGetLetterResults.mockResolvedValue([]);
  mockGetAcademicYears.mockResolvedValue([
    { id: 'year-2026', starts_on: '2026-01-01', ends_on: '2026-12-31', is_active: 1 },
  ]);
});

test('shows active-year letter coverage, result total and latest raw average score', async () => {
  mockChildren.push(...['a', 'b', 'c', 'd'].map(id => ({ id })));
  mockGetLetterResults.mockResolvedValue([
    { id: 'a-old', child_id: 'a', question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2026-02-02', score: 10 },
    { id: 'a-latest', child_id: 'a', question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2026-03-02', score: 18 },
    { id: 'b-run-q1', child_id: 'b', user_id: 'other-ea', battery_run_id: 'run-b', question_code: 'letter_sounds', stopped_reason: 'stop_rule', assessment_date: '2026-03-02', score: 8 },
    { id: 'c-skipped', child_id: 'c', question_code: 'letter_sounds', stopped_reason: 'skipped_tired', assessment_date: '2026-03-02', score: 0 },
    { id: 'd-last-year', child_id: 'd', question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2025-12-31', score: 60 },
    { id: 'inactive-child', child_id: 'hidden', question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2026-03-02', score: 60 },
  ]);
  const screen = render(<PaperProvider><AssessmentsScreen navigation={{ navigate: jest.fn() }} /></PaperProvider>);
  await screen.findByText('Avg score');
  expect(screen.getByText('50%')).toBeTruthy();
  expect(screen.getByText('3')).toBeTruthy();
  expect(screen.getByText('13')).toBeTruthy();
  expect(screen.queryByText('13%')).toBeNull();
  expect(screen.queryByText('Avg Accuracy')).toBeNull();
  expect(mockGetLetterResults).toHaveBeenCalledWith({ userId: 'user-1' });
});

test('shows zero evidence when academic years exist but none is active', async () => {
  mockChildren.push({ id: 'a' });
  mockGetAcademicYears.mockResolvedValue([
    { id: 'year-2026', starts_on: '2026-01-01', ends_on: '2026-12-31', is_active: false },
  ]);
  mockGetLetterResults.mockResolvedValue([
    { child_id: 'a', question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2026-06-01', score: 30 },
  ]);
  const screen = render(<PaperProvider><AssessmentsScreen navigation={{ navigate: jest.fn() }} /></PaperProvider>);
  await screen.findByText('Avg score');
  expect(screen.getByText('0%')).toBeTruthy();
  expect(screen.getAllByText('0')).toHaveLength(2);
  expect(screen.queryByText('30')).toBeNull();
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
