jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));
import React from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, fireEvent, within } from '@testing-library/react-native';
import { v4 as uuid } from 'uuid';
import { colors } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
import SurfaceCard from '../src/components/common/SurfaceCard';
import AssessmentDetailScreen from '../src/screens/assessments/AssessmentDetailScreen';
import AssessmentResultsScreen from '../src/screens/assessments/AssessmentResultsScreen';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { useAuth } from '../src/context/AuthContext';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { createFamilySyncFixture, questionResult } from '../test-support/assessmentFamilySyncTestUtils';

let fixture;
beforeEach(async () => {
  fixture = await createFamilySyncFixture();
  useAuth.mockReturnValue({ user: { id: fixture.userId } });
});
afterEach(async () => {
  cleanup();
  jest.restoreAllMocks();
  await fixture.db.closeAsync();
});

async function renderSavedResult({ stoppedReason = 'completed', missing = false, correct = 9 } = {}) {
  const assessmentId = uuid();
  const child = { id: fixture.childId, first_name: 'Amahle', last_name: 'Dlamini' };
  if (!missing) {
    await fixture.assessments.saveQuestionResult({
      assessmentId, childId: fixture.childId, userId: fixture.userId, captureMode: 'sequential',
      result: questionResult(60, {
        stopped_reason: stoppedReason, duration_ms: 61000,
        items: Array.from({ length: 60 }, (_, position) => ({
          position, item_key: `letter-${position}`, prompt: 'a', is_correct: position < correct,
          metadata: { row: Math.floor(position / 10), reached: position < 19 },
        })),
        derived: { total_correct: correct, total_attempted: 19, percent: correct / 19 * 100,
          last_attempted_position: 18, max_consecutive_wrong: 10, stop_at: 10 },
      }),
    });
    // The id filter must select the requested family, not whichever result sorts first.
    await fixture.save(1);
  }
  const read = jest.spyOn(fixture.assessments, 'getQuestionResults');
  const navigation = { replace: jest.fn(), navigate: jest.fn() };
  const screen = renderWithProviders(
    <SignedInEAContext.Provider value={{ repositories: { assessments: fixture.assessments } }}>
      <AssessmentResultsScreen navigation={navigation}
        route={{ params: { assessmentId, testCode: 'letter_sounds', child, languageCode: 'en' } }} />
    </SignedInEAContext.Provider>,
  );
  return { ...screen, navigation, assessmentId, child, read };
}

test('reads the saved family by id and shows its raw score, attempted count and duration', async () => {
  const screen = await renderSavedResult();
  expect(await screen.findByLabelText('Assessment main result')).toHaveTextContent('9 / 60');
  expect(screen.getByText('Completed in 61s')).toBeTruthy();
  expect(screen.getByText('47% correct')).toBeTruthy();
  expect(screen.read).toHaveBeenCalledWith({ userId: fixture.userId, assessmentId: screen.assessmentId });
  expect(within(screen.UNSAFE_getAllByType(SurfaceCard)[0]).getByText('19')).toBeTruthy();
});

test('a real saved stop_rule result shows the stop reason and 9 / 60', async () => {
  const screen = await renderSavedResult({ stoppedReason: 'stop_rule' });
  expect(await screen.findByText('Stopped: 10 in a row wrong')).toBeTruthy();
  expect(screen.getByLabelText('Assessment main result')).toHaveTextContent('9 / 60');
});

test('Try again replaces the host with the test, child and language, without reusing the saved id', async () => {
  const screen = await renderSavedResult();
  await screen.findByLabelText('Assessment main result');
  fireEvent.press(screen.getByText('Try again'));
  expect(screen.navigation.replace).toHaveBeenCalledTimes(1);
  expect(screen.navigation.replace).toHaveBeenCalledWith('StandaloneTest', {
    testCode: 'letter_sounds', child: screen.child, languageCode: 'en',
  });
});

test('low-score results keep action red text, a secondary Try again button and shared stat cards', async () => {
  const screen = await renderSavedResult({ correct: 3 });
  await screen.findByLabelText('Assessment main result');
  expect(StyleSheet.flatten(screen.getByText('Keep practicing!').props.style).color).toBe(colors.primary);
  expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Try again' }).props.style).backgroundColor).toBe(colors.surface);
  expect(screen.UNSAFE_getAllByType(SurfaceCard)).toHaveLength(3);
  const label = within(screen.UNSAFE_getAllByType(SurfaceCard)[2]).getByText('Incorrect');
  expect(StyleSheet.flatten(label.props.style)).toMatchObject(typeRoles.textLabel);
});

test('a missing saved result shows an honest empty state', async () => {
  const screen = await renderSavedResult({ missing: true });
  expect(await screen.findByText('Result not found.')).toBeTruthy();
  expect(screen.queryByLabelText('Assessment main result')).toBeNull();
});

// Task 12 owns this reader; retain its existing visual regression unchanged.
test('assessment detail uses contrasting low-score text and shared stat cards', () => {
  const screen = renderWithProviders(<AssessmentDetailScreen route={{ params: { childName: 'A Child', assessment: {
    letters_attempted: 31, correct_responses: 21, accuracy: 20, completion_time: 61,
    correct_letters: [{ index: 0 }, { index: 2 }], incorrect_letters: [{ index: 1 }],
    last_letter_attempted: { index: 2 }, date_assessed: '2026-10-19', letter_language: 'English',
    attempt_number: 1, items_tested: ['a', 'b', 'c', 'd', 'e'],
  } } }} />);
  expect(StyleSheet.flatten(screen.getByText('Keep practicing!').props.style).color).toBe(colors.primary);
  expect(screen.UNSAFE_getAllByType(SurfaceCard)).toHaveLength(3);
});
