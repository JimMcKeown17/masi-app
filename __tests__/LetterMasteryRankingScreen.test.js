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
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

jest.mock('@react-navigation/native', () => ({
  NavigationContext: require('react').createContext(undefined),
  useFocusEffect: callback => require('react').useEffect(callback, [callback]),
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: jest.fn() }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: jest.fn() }));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import React from 'react';
import { ActivityIndicator } from 'react-native-paper';
import { act, cleanup, fireEvent } from '@testing-library/react-native';
import { v4 as uuid } from 'uuid';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { createFamilySyncFixture, questionResult } from '../test-support/assessmentFamilySyncTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { useAuth } from '../src/context/AuthContext';
import { useChildren } from '../src/context/ChildrenContext';
import { useClasses } from '../src/context/ClassesContext';
import LetterMasteryRankingScreen from '../src/screens/insights/LetterMasteryRankingScreen';
import StatBar from '../src/components/dashboard/StatBar';
import RankedBarRow from '../src/components/dashboard/RankedBarRow';

let fixture;
let repositories;
beforeEach(async () => {
  mockHistoryVersion = 0;
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
  fixture = await createFamilySyncFixture({ withDelivery: true });
  await fixture.db.runAsync(`insert into academic_years (id, label, starts_on, ends_on, is_active)
    values ('year-2026', '2026', '2026-01-15', '2026-12-15', 1)`);
  repositories = {
    assessments: fixture.assessments,
    mastery: createMasteryRepository({ database: fixture.db }),
  };
  useAuth.mockReturnValue({ user: { id: fixture.userId } });
  useChildren.mockReturnValue({ children: [{
    id: fixture.childId, first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1',
  }] });
  useClasses.mockReturnValue({ classes: [{ id: 'class-1', home_language: 'isiXhosa' }] });
});
afterEach(async () => {
  cleanup();
  jest.restoreAllMocks();
  jest.clearAllMocks();
  await fixture.db.closeAsync();
  jest.useRealTimers();
});

const renderRanking = () => renderWithProviders(
  <SignedInEAContext.Provider value={{ repositories }}>
    <LetterMasteryRankingScreen navigation={{ navigate: jest.fn() }} />
  </SignedInEAContext.Provider>,
);

test("last year's result does not appear in the ranking", async () => {
  const saved = await fixture.save(1, { result: questionResult(1, {
    language: 'xh', item_set_id: 'letter_sounds@2026.1.xh',
  }) });
  await fixture.db.runAsync("update assessments set assessment_date = '2025-11-01' where id = ?", saved.id);
  const screen = renderRanking();
  expect(await screen.findByLabelText('View details for Amahle D., 0/26')).toBeTruthy();
});

test.each(['current EA', 'another EA'])(
  'renders mastery from a real stored letter result recorded by %s',
  async recorder => {
    const writerId = recorder === 'current EA' ? fixture.userId : uuid();
    if (writerId !== fixture.userId) {
      await fixture.db.runAsync(`insert into staff_programme_assignments (id, user_id, programme_id, assigned_at)
        values (?, ?, ?, '2026-01-15T00:00:00.000Z')`, uuid(), writerId, fixture.programmeId);
    }
    bindTestActor(fixture.db, writerId);
    await fixture.assessments.saveQuestionResult({
      assessmentId: uuid(), userId: writerId, childId: fixture.childId,
      result: questionResult(3, {
        language: 'xh', item_set_id: 'letter_sounds@2026.1.xh',
        items: [
          { position: 2, item_key: 'a-upper', prompt: 'A', is_correct: true },
          { position: 0, item_key: 'a-lower', prompt: 'a', is_correct: true },
          { position: 1, item_key: 'b', prompt: 'b', is_correct: true },
        ],
        derived: { total_correct: 3, total_attempted: 3, percent: 100, last_attempted_position: 2 },
      }),
    });
    bindTestActor(fixture.db, fixture.userId);

    const read = jest.spyOn(repositories.assessments, 'getLetterEvidenceResults');
    const masteryRead = jest.spyOn(repositories.mastery, 'getLetterMastery');
    const screen = renderRanking();
    expect(await screen.findByLabelText('View details for Amahle D., 2/26')).toBeTruthy();
    expect(screen.getByText('2/26')).toBeTruthy();
    expect(read).toHaveBeenCalledWith({ userId: fixture.userId });
    expect(masteryRead).toHaveBeenCalledWith({ childIds: [fixture.childId] });
  },
);

test.each([null, undefined, 'isiZulu'])(
  'a class without a supported order (%p) keeps the 26-letter scale without using English evidence',
  async homeLanguage => {
    useClasses.mockReturnValue({ classes: [{ id: 'class-1', home_language: homeLanguage }] });
    await fixture.save(1);
    await repositories.mastery.setLetterMastery({
      childId: fixture.childId, letter: 'b', language: 'en', confirmed: true,
    });

    const screen = renderRanking();
    expect(await screen.findByLabelText('View details for Amahle D., 0/26')).toBeTruthy();
    expect(screen.queryByText('0/0')).toBeNull();
    expect(screen.UNSAFE_getByType(RankedBarRow).props).toMatchObject({ value: 0, maxValue: 26 });
  },
);

test('a confirmation recorded by another EA counts', async () => {
  const otherEa = uuid();
  await fixture.db.runAsync(`insert into child_ea_assignments (id, child_id, user_id, sync_status)
    values (?, ?, ?, 'synced')`, uuid(), fixture.childId, otherEa);
  bindTestActor(fixture.db, otherEa);
  await repositories.mastery.setLetterMastery({
    childId: fixture.childId, letter: 'b', language: 'xh', confirmed: true,
  });
  bindTestActor(fixture.db, fixture.userId);
  const read = jest.spyOn(repositories.mastery, 'getLetterMastery');
  const screen = renderRanking();
  expect(await screen.findByLabelText('View details for Amahle D., 1/26')).toBeTruthy();
  expect(read).toHaveBeenCalledWith({ childIds: [fixture.childId] });
});


test('a pending reload keeps the ranking mounted until the new roster and evidence arrive', async () => {
  const screen = renderRanking();
  expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  await screen.findByText('Amahle D.');
  const row = screen.getByText('Amahle D.');
  let resolve;
  jest.spyOn(repositories.assessments, 'getLetterEvidenceResults')
    .mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const children = useChildren().children;
  useChildren.mockReturnValue({ children: [...children, { id: 'new-child', first_name: 'New', last_name: 'Child', class_id: 'class-1' }] });
  mockHistoryVersion = 1;
  screen.rerender(<SignedInEAContext.Provider value={{ repositories }}>
    <LetterMasteryRankingScreen navigation={{ navigate: jest.fn() }} />
  </SignedInEAContext.Provider>);
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  expect(screen.getByText('Amahle D.')).toBe(row);
  expect(screen.queryByText('New C.')).toBeNull();
  await act(async () => resolve([]));
  expect(await screen.findByText('New C.')).toBeTruthy();
  expect(screen.getByText('Amahle D.')).toBe(row);
});


test('switching EA hides previous mastery and settles a failed first load without restoring it', async () => {
  const screen = renderRanking();
  await screen.findByText('Amahle D.');
  let reject;
  jest.spyOn(repositories.assessments, 'getLetterEvidenceResults')
    .mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  useAuth.mockReturnValue({ user: { id: 'ea-2' } });
  useChildren.mockReturnValue({ children: [{ id: 'new-child', first_name: 'New', last_name: 'Child', class_id: 'class-1' }] });
  screen.rerender(<SignedInEAContext.Provider value={{ repositories }}>
    <LetterMasteryRankingScreen navigation={{ navigate: jest.fn() }} />
  </SignedInEAContext.Provider>);
  expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  expect(screen.queryByText('Amahle D.')).toBeNull();
  await act(async () => reject(new Error('read failed')));
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  expect(screen.queryByText('Amahle D.')).toBeNull();
  expect(screen.queryByText('New C.')).toBeNull();
  expect(screen.getByText("Couldn't load this ranking. Try again.")).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(mockToast.show).not.toHaveBeenCalled();
});

test('a late older reload cannot overwrite newer mastery, and a failed reload keeps it', async () => {
  const screen = renderRanking();
  await screen.findByLabelText('View details for Amahle D., 0/26');
  let resolveOld, resolveNew;
  const read = jest.spyOn(repositories.assessments, 'getLetterEvidenceResults')
    .mockReturnValueOnce(new Promise(done => { resolveOld = done; }))
    .mockReturnValueOnce(new Promise(done => { resolveNew = done; }));
  const ui = () => <SignedInEAContext.Provider value={{ repositories }}>
    <LetterMasteryRankingScreen navigation={{ navigate: jest.fn() }} />
  </SignedInEAContext.Provider>;
  mockHistoryVersion = 1;
  screen.rerender(ui());
  mockHistoryVersion = 2;
  screen.rerender(ui());
  const saved = await fixture.save(1, { result: questionResult(1, { language: 'xh' }) });
  const results = await fixture.assessments.getQuestionResults({ userId: fixture.userId });
  expect(results[0].id).toBe(saved.id);
  await act(async () => resolveNew(results));
  expect(await screen.findByLabelText('View details for Amahle D., 1/26')).toBeTruthy();
  await act(async () => resolveOld([]));
  expect(screen.getByLabelText('View details for Amahle D., 1/26')).toBeTruthy();
  read.mockRejectedValueOnce(new Error('read failed'));
  mockHistoryVersion = 3;
  screen.rerender(ui());
  await act(async () => {});
  expect(screen.getByLabelText('View details for Amahle D., 1/26')).toBeTruthy();
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
});


test('a failed first read shows retry instead of educational conclusions, then a retry shows the ranking', async () => {
  await repositories.mastery.setLetterMastery({
    childId: fixture.childId, letter: 'b', language: 'xh', confirmed: true,
  });
  jest.spyOn(repositories.mastery, 'getLetterMastery').mockRejectedValueOnce(new Error('read failed'));
  const screen = renderRanking();
  expect(await screen.findByText("Couldn't load this ranking. Try again.")).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(screen.queryByText('Amahle D.')).toBeNull();
  expect(screen.queryByText('Not assessed')).toBeNull();
  expect(screen.queryByText('No children to display')).toBeNull();
  expect(screen.UNSAFE_queryByType(StatBar)).toBeNull();
  expect(screen.UNSAFE_queryByType(RankedBarRow)).toBeNull();
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  expect(mockToast.show).not.toHaveBeenCalled();

  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  // The retry shows progress at once, so a slow read never looks like a dead button.
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();
  expect(screen.queryByText("Couldn't load this ranking. Try again.")).toBeNull();
  expect(await screen.findByLabelText('View details for Amahle D., 1/26')).toBeTruthy();
  expect(screen.getByText('Amahle D.')).toBeTruthy();
  expect(screen.queryByText("Couldn't load this ranking. Try again.")).toBeNull();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});

test('a rejected refresh retains mastery and publishes one error toast', async () => {
  await repositories.mastery.setLetterMastery({
    childId: fixture.childId, letter: 'b', language: 'xh', confirmed: true,
  });
  const screen = renderRanking();
  await screen.findByLabelText('View details for Amahle D., 1/26');
  const row = screen.getByText('Amahle D.');
  jest.spyOn(repositories.assessments, 'getLetterEvidenceResults').mockRejectedValueOnce(new Error('read failed'));
  mockHistoryVersion = 1;
  screen.rerender(<SignedInEAContext.Provider value={{ repositories }}>
    <LetterMasteryRankingScreen navigation={{ navigate: jest.fn() }} />
  </SignedInEAContext.Provider>);
  await act(async () => {});
  expect(screen.getByText('Amahle D.')).toBe(row);
  expect(screen.getByLabelText('View details for Amahle D., 1/26')).toBeTruthy();
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  expect(screen.queryByText("Couldn't load this ranking. Try again.")).toBeNull();
  expect(mockToast.show).toHaveBeenCalledTimes(1);
  expect(mockToast.show).toHaveBeenCalledWith({ message: "Couldn't refresh this ranking.", tone: 'error', duration: 3000 });
});
