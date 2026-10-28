global.__MASI_NO_DEFAULT_HANDLE__ = true;
import React from 'react';
import { renderWithProviders } from '../test-support/renderWithProviders';
import LessonLettersSection from '../src/components/lessons/LessonLettersSection';
import LessonBlendSection from '../src/components/lessons/LessonBlendSection';
import LessonBookSection from '../src/components/lessons/LessonBookSection';
import GroupLessonRow from '../src/components/lessons/GroupLessonRow';
import UpNextCard from '../src/components/lessons/UpNextCard';
import { getGroupDotColor } from '../src/utils/groupHelpers';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

const draft = { language_code: 'xh', ticks: { letters: [], blends: [], books: [] } };
const plan = { suggested_letters: [], review_letters: [], blend_tier: '2 Letter Blends' };
const choices = { tiers: [], books: [], contentAvailable: { blends: false, books: false } };

test.each([
  [LessonLettersSection, '1 ·\u00a0Letters ·\u00a015\u00a0min'],
  [LessonBlendSection, '2 ·\u00a0Blending ·\u00a015\u00a0min ·\u00a02-letter'],
  [LessonBookSection, '3 ·\u00a0Pair\u00a0reading ·\u00a05\u00a0min'],
])('%p binds each heading separator to the detail after it', (Section, expected) => {
  const view = renderWithProviders(<Section draft={draft} plan={plan} choices={choices} participants={[]} />);
  expect(view.getByRole('header').props.children).toBe(expected);
  // Lines may break only before a dot, so a wrapped heading never ends on one.
  expect(view.getByRole('header').props.children).not.toMatch(/· /);
});

test.each([GroupLessonRow, UpNextCard])('%p binds detail separators to the letters after them', Component => {
  const row = { groupId: 'g', members: [{ firstName: 'Aviwe' }], dotColor: getGroupDotColor(0),
    lastSeenOn: null, nextLetters: ['o', 'm'] };
  const view = renderWithProviders(<Component row={row} today="2026-10-23" index={0} count={1} />);
  expect(view.getByText('Not seen yet · letters o m').props.children).toBe('Not\u00a0seen\u00a0yet ·\u00a0letters\u00a0o\u00a0m');
});
