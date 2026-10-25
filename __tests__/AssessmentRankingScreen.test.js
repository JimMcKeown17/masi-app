jest.mock('../src/hooks/useAssessableChildren', () => ({ useAssessableChildren: jest.fn() }));
import { useAssessableChildren } from '../src/hooks/useAssessableChildren';
beforeEach(() => useAssessableChildren.mockImplementation(() => {
  const state = require('../src/context/ChildrenContext').useChildren();
  const all = state.children ?? state.allChildren ?? [];
  return { all, yourChildren: all, restOfClass: [], loading: false };
}));
const mockToast = { show: jest.fn() };
jest.mock('../src/context/ToastContext', () => ({
  ...jest.requireActual('../src/context/ToastContext'),
  useToast: () => mockToast,
}));
let mockHistoryVersion = 0;
jest.mock('../src/services/assessmentHistoryStatus', () => ({
  ...jest.requireActual('../src/services/assessmentHistoryStatus'),
  useAssessmentHistoryStatus: () => ({ running: false, pageVersion: mockHistoryVersion, runVersion: 0 }),
}));
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('@react-navigation/native', () => ({
  NavigationContext: require('react').createContext(undefined),
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
}));
let mockUserId = 'ea-1';
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: mockUserId } }) }));
const mockChildren = [];
const mockClasses = [];
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => ({ children: mockChildren }) }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => ({ classes: mockClasses }) }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/assessmentsRepository'),
  assessmentsRepository: { getQuestionResults: jest.fn(async () => []) },
}));
jest.mock('../src/db/repositories/childClassMembershipsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/childClassMembershipsRepository'),
  childClassMembershipsRepository: { getAll: jest.fn(async () => []) },
}));
import React from 'react';
import { v4 as uuid } from 'uuid';
import { createFamilySyncFixture } from '../test-support/assessmentFamilySyncTestUtils';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { ActivityIndicator } from 'react-native-paper';
import { FlatList, StyleSheet } from 'react-native';
import { act, fireEvent, within } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import AssessmentRankingScreen from '../src/screens/insights/AssessmentRankingScreen';
import { childClassMembershipsRepository, createChildClassMembershipsRepository } from '../src/db/repositories/childClassMembershipsRepository';
import StatBar from '../src/components/dashboard/StatBar';
import RankedBarRow from '../src/components/dashboard/RankedBarRow';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { getBarColor } from '../src/components/dashboard/RankedBarRow';
import { OKAY_YELLOW, getBandColor } from '../src/utils/scoreBands';

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = 'ea-1';
  mockHistoryVersion = 0;
  mockChildren.length = 0;
  mockClasses.length = 0;
  assessmentsRepository.getQuestionResults.mockResolvedValue([]);
  childClassMembershipsRepository.getAll.mockResolvedValue([]);
});

test('assessment scores keep their existing gap above the bottom safe area', async () => {
  const screen = renderWithProviders(<AssessmentRankingScreen navigation={{ navigate: jest.fn() }} />, {
    insets: { top: 24, right: 0, bottom: 48, left: 0 },
  });
  await screen.findByTestId('segmented-control');
  expect(StyleSheet.flatten(screen.UNSAFE_getByType(FlatList).props.contentContainerStyle)).toEqual({
    padding: 16,
    paddingBottom: 96,
  });
});

test('the radio group changes the ranking mode without fetching again', async () => {
  const screen = renderWithProviders(<AssessmentRankingScreen navigation={{ navigate: jest.fn() }} />);
  const group = await screen.findByTestId('segmented-control');
  const letters = within(group).getByRole('radio', { name: 'Letters' });
  const words = within(group).getByRole('radio', { name: 'Words' });
  expect(letters.props.accessibilityState.checked).toBe(true);
  fireEvent.press(words);
  expect(words.props.accessibilityState.checked).toBe(true);
  expect(screen.getByText('Ranked by words correct on the most recent EGRA word assessment')).toBeTruthy();
  expect(screen.queryByText("Colour shows each child's level for their grade")).toBeNull();
  expect(assessmentsRepository.getQuestionResults).toHaveBeenCalledTimes(1);
});

test('ranked bars share the score-band yellow', () => {
  expect(OKAY_YELLOW).toBe('#FFBB00');
  expect(getBarColor(50)).toBe(OKAY_YELLOW);
  expect(getBandColor('okay')).toBe(OKAY_YELLOW);
  const source = require('fs').readFileSync(require('path').join(__dirname, '../src/components/dashboard/RankedBarRow.js'), 'utf8');
  expect(source).toContain("import { OKAY_YELLOW } from '../../utils/scoreBands'");
});

test('stored scores, scales and grade-at-date bands drive the rows; only standalone rows open Detail by id', async () => {
  mockChildren.push(
    { id: 'a', first_name: 'A', last_name: 'Able', class_id: 'current' },
    { id: 'b', first_name: 'B', last_name: 'Baker', class_id: 'current' },
    { id: 'c', first_name: 'C', last_name: 'Clark', class_id: 'current' },
  );
  mockClasses.push({ id: 'old', grade: 'Grade R' }, { id: 'current', grade: 'Grade 2' });
  childClassMembershipsRepository.getAll.mockResolvedValue([
    { child_id: 'a', class_id: 'old', enrolled_at: '2026-01-01T12:00:00Z', exited_at: '2026-06-01T12:00:00Z' },
  ]);
  assessmentsRepository.getQuestionResults.mockResolvedValue([
    { id: 'standalone', child_id: 'a', question_code: 'letter_sounds', language: 'xh', assessment_date: '2026-05-31', score: 20, total_items: 61, battery_run_id: null },
    { id: 'battery-q1', child_id: 'b', question_code: 'letter_sounds', language: 'en', assessment_date: '2026-05-31', score: 9, total_items: 60, battery_run_id: 'run' },
    { id: 'word', child_id: 'c', question_code: 'word_reading', language: 'en', assessment_date: '2026-05-31', score: 8, total_items: 43 },
    { id: 'skip', child_id: 'c', question_code: 'letter_sounds', language: 'en', assessment_date: '2026-06-01', stopped_reason: 'skipped_tired', score: 0, total_items: 0 },
  ]);
  const navigation = { navigate: jest.fn() };
  const screen = renderWithProviders(<AssessmentRankingScreen navigation={navigation} />);
  await screen.findByText('20 / 61');
  expect(screen.getByText('9 / 60')).toBeTruthy();
  expect(screen.getAllByText('Not assessed')).toHaveLength(1);
  const bars = screen.UNSAFE_getAllByType(RankedBarRow);
  expect(bars[0].props).toMatchObject({ value: 20, maxValue: 61, barColor: getBandColor('great') });
  expect(bars[1].props).toMatchObject({ value: 9, maxValue: 60 });
  expect(bars[1].props.onPress).toBeUndefined();
  fireEvent.press(screen.getByRole('button', { name: 'View details for A A., 20 / 61' }));
  expect(navigation.navigate).toHaveBeenCalledWith('AssessmentDetail', { assessmentId: 'standalone', childName: 'A A.' });
  expect(assessmentsRepository.getQuestionResults).toHaveBeenCalledWith({ userId: 'ea-1' });
  expect(childClassMembershipsRepository.getAll).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('radio', { name: 'Words' }));
  expect(screen.getByText('8 / 43')).toBeTruthy();
  expect(screen.UNSAFE_getAllByType(RankedBarRow)[0].props).toMatchObject({ maxValue: 43, barColor: getBandColor('unknown') });
  expect(screen.getAllByText('Not assessed')).toHaveLength(2);
});

test('a stored historical membership supplies its archived class grade when that class is absent from the active context', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-05-31T12:00:00Z'));
  const f = await createFamilySyncFixture();
  try {
    mockUserId = f.userId;
    const schoolId = uuid(), yearId = uuid(), oldClassId = uuid(), currentClassId = uuid();
    await f.db.runAsync('insert into schools (id, name) values (?, ?)', schoolId, 'Test school');
    await f.db.runAsync('insert into academic_years (id, label, starts_on, ends_on, is_active) values (?, ?, ?, ?, ?)',
      yearId, '2026', '2026-01-01', '2026-12-31', 1);
    await f.db.runAsync('insert into classes (id, school_id, name, grade, academic_year_id, archived_at) values (?, ?, ?, ?, ?, ?)',
      oldClassId, schoolId, 'Archived R', 'R', yearId, '2026-07-01T12:00:00Z');
    await f.db.runAsync('insert into classes (id, school_id, name, grade, academic_year_id) values (?, ?, ?, ?, ?)',
      currentClassId, schoolId, 'Current 2', '2', yearId);
    mockChildren.push({ id: f.childId, first_name: 'Historic', last_name: 'Child', class_id: currentClassId });
    mockClasses.push({ id: currentClassId, grade: '2' });
    const memberships = createChildClassMembershipsRepository({ database: f.db });
    await memberships.save({
      id: uuid(), child_id: f.childId, class_id: oldClassId, academic_year_id: yearId,
      enrolled_at: '2026-01-01T12:00:00Z', exited_at: '2026-07-01T12:00:00Z', created_by: f.userId,
    });
    await f.save(40); // 20 correct: great for R, merely okay for Grade 2.
    const screen = renderWithProviders(
      <SignedInEAContext.Provider value={{ repositories: { assessments: f.assessments, childClassMemberships: memberships } }}>
        <AssessmentRankingScreen navigation={{ navigate: jest.fn() }} />
      </SignedInEAContext.Provider>
    );
    await screen.findByText('20 / 40');
    expect(screen.UNSAFE_getByType(RankedBarRow).props.barColor).toBe(getBandColor('great'));
    screen.unmount();
  } finally {
    await f.db.closeAsync();
    jest.useRealTimers();
  }
});

test('current-class grade fallback survives an unassigned class missing from the classes context', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-05-31T12:00:00Z'));
  const f = await createFamilySyncFixture();
  try {
    mockUserId = f.userId;
    const schoolId = uuid(), yearId = uuid(), currentClassId = uuid();
    await f.db.runAsync('insert into schools (id, name) values (?, ?)', schoolId, 'Test school');
    await f.db.runAsync('insert into academic_years (id, label, starts_on, ends_on, is_active) values (?, ?, ?, ?, ?)',
      yearId, '2026', '2026-01-01', '2026-12-31', 1);
    await f.db.runAsync('insert into classes (id, school_id, name, grade, academic_year_id) values (?, ?, ?, ?, ?)',
      currentClassId, schoolId, 'Current R', 'R', yearId);
    mockChildren.push({ id: f.childId, first_name: 'Fallback', last_name: 'Child', class_id: currentClassId });
    // The EA has the child but not a class assignment, so useClasses is empty.
    const memberships = createChildClassMembershipsRepository({ database: f.db });
    await memberships.save({
      id: uuid(), child_id: f.childId, class_id: currentClassId, academic_year_id: yearId,
      enrolled_at: '2026-06-01T12:00:00Z', exited_at: null, created_by: f.userId,
    });
    await f.save(40); // Date predates all memberships; fall back to the child's current Grade R.
    const screen = renderWithProviders(
      <SignedInEAContext.Provider value={{ repositories: { assessments: f.assessments, childClassMemberships: memberships } }}>
        <AssessmentRankingScreen navigation={{ navigate: jest.fn() }} />
      </SignedInEAContext.Provider>
    );
    await screen.findByText('20 / 40');
    expect(screen.UNSAFE_getByType(RankedBarRow).props.barColor).toBe(getBandColor('great'));
    screen.unmount();
  } finally {
    await f.db.closeAsync();
    jest.useRealTimers();
  }
});

test('class-only children join the assessment not-assessed list', async () => {
  const delivery = { id: 'delivery', first_name: 'Dina', last_name: 'Delivery' };
  mockChildren.push(delivery);
  useAssessableChildren.mockReturnValue({ all: [delivery, { id: 'control', first_name: 'Cora', last_name: 'Control' }], loading: false });
  const screen = renderWithProviders(<AssessmentRankingScreen navigation={{ navigate: jest.fn() }} />);
  expect(await screen.findByText('Cora C.')).toBeTruthy();
  expect(screen.getAllByText('Not assessed')).toHaveLength(2);
});

test('a pending reload keeps the ranking mounted until the extra result arrives', async () => {
  mockChildren.push({ id: 'a', first_name: 'A', last_name: 'Able' });
  const rows = [{ id: 'a-result', child_id: 'a', question_code: 'letter_sounds', language: 'en', assessment_date: '2026-05-31', score: 20, total_items: 60 }];
  assessmentsRepository.getQuestionResults.mockResolvedValueOnce(rows);
  const navigation = { navigate: jest.fn() };
  const screen = renderWithProviders(<AssessmentRankingScreen navigation={navigation} />);
  expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  await screen.findByText('20 / 60');
  const row = screen.getByText('A A.');
  let resolve;
  assessmentsRepository.getQuestionResults.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  mockHistoryVersion = 1;
  screen.rerender(<AssessmentRankingScreen navigation={navigation} />);
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  expect(screen.getByText('A A.')).toBe(row);
  mockChildren.push({ id: 'b', first_name: 'B', last_name: 'Baker' });
  await act(async () => resolve([...rows, { ...rows[0], id: 'b-result', child_id: 'b', score: 9 }]));
  expect(await screen.findByText('9 / 60')).toBeTruthy();
  expect(screen.getByText('B B.')).toBeTruthy();
  expect(screen.getByText('A A.')).toBe(row);
});


test('switching EA hides old scores and settles a failed first load without restoring them', async () => {
  mockChildren.push({ id: 'a', first_name: 'A', last_name: 'Able' });
  assessmentsRepository.getQuestionResults.mockResolvedValueOnce([
    { id: 'a-result', child_id: 'a', question_code: 'letter_sounds', language: 'en', assessment_date: '2026-05-31', score: 20, total_items: 60 },
  ]);
  const screen = renderWithProviders(<AssessmentRankingScreen navigation={{ navigate: jest.fn() }} />);
  await screen.findByText('20 / 60');
  let reject;
  assessmentsRepository.getQuestionResults.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  mockUserId = 'ea-2';
  mockChildren.splice(0, mockChildren.length, { id: 'b', first_name: 'B', last_name: 'Baker' });
  screen.rerender(<AssessmentRankingScreen navigation={{ navigate: jest.fn() }} />);
  expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  expect(screen.queryByText('A A.')).toBeNull();
  await act(async () => reject(new Error('read failed')));
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  expect(screen.queryByText('20 / 60')).toBeNull();
  expect(screen.queryByText('A A.')).toBeNull();
  expect(screen.queryByText('B B.')).toBeNull();
  expect(screen.queryByText('Not assessed')).toBeNull();
  expect(screen.getByText("Couldn't load this ranking. Try again.")).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(mockToast.show).not.toHaveBeenCalled();
});


test('a failed first read shows retry instead of educational conclusions, then a retry shows the ranking', async () => {
  mockChildren.push({ id: 'a', first_name: 'A', last_name: 'Able' });
  assessmentsRepository.getQuestionResults.mockRejectedValueOnce(new Error('read failed'));
  const screen = renderWithProviders(<AssessmentRankingScreen navigation={{ navigate: jest.fn() }} />);
  expect(await screen.findByText("Couldn't load this ranking. Try again.")).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(screen.queryByText('A A.')).toBeNull();
  expect(screen.queryByText('Not assessed')).toBeNull();
  expect(screen.queryByText('No children to display')).toBeNull();
  expect(screen.UNSAFE_queryByType(StatBar)).toBeNull();
  expect(screen.UNSAFE_queryByType(RankedBarRow)).toBeNull();
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  expect(mockToast.show).not.toHaveBeenCalled();

  assessmentsRepository.getQuestionResults.mockResolvedValueOnce([
    { id: 'a-result', child_id: 'a', question_code: 'letter_sounds', language: 'en', assessment_date: '2026-05-31', score: 20, total_items: 60 },
  ]);
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  // The retry shows progress at once, so a slow read never looks like a dead button.
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();
  expect(screen.queryByText("Couldn't load this ranking. Try again.")).toBeNull();
  expect(await screen.findByText('20 / 60')).toBeTruthy();
  expect(screen.getByText('A A.')).toBeTruthy();
  expect(screen.queryByText("Couldn't load this ranking. Try again.")).toBeNull();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});

test('a rejected refresh retains scores and publishes one error toast', async () => {
  mockChildren.push({ id: 'a', first_name: 'A', last_name: 'Able' });
  assessmentsRepository.getQuestionResults.mockResolvedValueOnce([
    { id: 'a-result', child_id: 'a', question_code: 'letter_sounds', language: 'en', assessment_date: '2026-05-31', score: 20, total_items: 60 },
  ]);
  const navigation = { navigate: jest.fn() };
  const screen = renderWithProviders(<AssessmentRankingScreen navigation={navigation} />);
  await screen.findByText('20 / 60');
  const row = screen.getByText('A A.');
  childClassMembershipsRepository.getAll.mockRejectedValueOnce(new Error('read failed'));
  mockHistoryVersion = 1;
  screen.rerender(<AssessmentRankingScreen navigation={navigation} />);
  await act(async () => {});
  expect(screen.getByText('A A.')).toBe(row);
  expect(screen.getByText('20 / 60')).toBeTruthy();
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  expect(screen.queryByText("Couldn't load this ranking. Try again.")).toBeNull();
  expect(mockToast.show).toHaveBeenCalledTimes(1);
  expect(mockToast.show).toHaveBeenCalledWith({ message: "Couldn't refresh this ranking.", tone: 'error', duration: 3000 });
});
