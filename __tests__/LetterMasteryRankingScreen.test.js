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
import { cleanup } from '@testing-library/react-native';
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
import RankedBarRow from '../src/components/dashboard/RankedBarRow';

let fixture;
let repositories;
beforeEach(async () => {
  fixture = await createFamilySyncFixture();
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
});

const renderRanking = () => renderWithProviders(
  <SignedInEAContext.Provider value={{ repositories }}>
    <LetterMasteryRankingScreen navigation={{ navigate: jest.fn() }} />
  </SignedInEAContext.Provider>,
);

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

    const read = jest.spyOn(repositories.assessments, 'getLetterResults');
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
