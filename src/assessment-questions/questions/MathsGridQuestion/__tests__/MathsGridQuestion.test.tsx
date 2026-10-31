import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import { MathsGridQuestion } from '..';
import { FIXTURE_MATHS_GRID_TIMED_EN as fixture } from '../../../testFixtures';
import { PagedGrid } from '../../../ui/PagedGrid';
import { LETTER_PAGE_LAYOUT, WORD_PAGE_LAYOUT, THREE_BY_THREE_LAYOUT } from '../../../ui';
import type { Result } from '../../../types/Result';

test('sum tiles show the answer', () => {
  const r = render(<MathsGridQuestion language="en" itemSet={fixture} instructions="Read each sum." onComplete={jest.fn()} />);
  expect(within(r.getByTestId('maths-intro')).getByText('Read each sum.')).toBeTruthy();
  fireEvent.press(r.getByText('Start'));
  expect(r.getByTestId('tile-0')).toHaveTextContent('1 + 3  = 4');
  expect(r.getByLabelText('Number 1 of 5')).toBeTruthy();
});

test('items carry skill and band', () => {
  const onComplete = jest.fn<void, [Result]>(), onItemMarked = jest.fn();
  const r = render(<MathsGridQuestion language="en" itemSet={{ ...fixture, strategy_step: false }} onComplete={onComplete} onItemMarked={onItemMarked} />);
  fireEvent.press(r.getByText('Start')); fixture.items.forEach(() => fireEvent.press(r.getByText('Correct'))); fireEvent.press(r.getByText('Finish'));
  expect(onComplete.mock.calls[0][0].items.map(item => item.metadata)).toEqual(fixture.items.map(item => ({ skill: item.skill, band: item.band, reached: true })));
  expect(onItemMarked.mock.calls[0][0]).toMatchObject({ item_key: fixture.items[0].item_key, metadata: { skill: fixture.items[0].skill, band: fixture.items[0].band } });
});

test.each([
  ['three_by_three', THREE_BY_THREE_LAYOUT], ['five_by_four', LETTER_PAGE_LAYOUT], ['two_by_five', WORD_PAGE_LAYOUT],
] as const)('uses the %s layout and number tiles', (layout, expected) => {
  const r = render(<MathsGridQuestion language="en" itemSet={{ ...fixture, layout, tile: 'number', strategy_step: false }} onComplete={jest.fn()} />);
  fireEvent.press(r.getByText('Start'));
  expect(r.UNSAFE_getByType(PagedGrid).props).toMatchObject({ layout: expected, variant: 'letter' });
});

test('twenty sums use two pages of ten and follow the cursor', () => {
  const items = Array.from({ length: 20 }, (_, position) => ({ ...fixture.items[position % fixture.items.length], item_key: String(position) }));
  const r = render(<MathsGridQuestion language="en" itemSet={{ ...fixture, items }} onComplete={jest.fn()} />);
  fireEvent.press(r.getByText('Start'));
  expect(r.getByTestId('maths-grid')).toBeTruthy(); expect(r.queryByTestId('tile-10')).toBeNull();
  for (let i = 0; i < 10; i++) fireEvent.press(r.getByText('Correct'));
  expect(r.queryByTestId('tile-0')).toBeNull(); expect(r.getByTestId('tile-10')).toHaveAccessibleName(/current/);
});

test.each([undefined, null, {}, { ...fixture, kind: 'maths_cards' }, { ...fixture, layout: 'unknown' },
  { ...fixture, items: [{ ...fixture.items[0], band: 6 }] }, { ...fixture, stop_rule: { kind: 'consecutive_wrong', stop_at: 0 } },
].map(itemSet => ({ itemSet })))('invalid grid item set shows MissingItemSet ($itemSet)', ({ itemSet }) => {
  const onComplete = jest.fn(); const r = render(<MathsGridQuestion language="en" itemSet={itemSet} onComplete={onComplete} />);
  expect(r.getByTestId('missing-item-set-en')).toBeTruthy(); expect(r.queryByText('Start')).toBeNull(); expect(onComplete).not.toHaveBeenCalled();
});
