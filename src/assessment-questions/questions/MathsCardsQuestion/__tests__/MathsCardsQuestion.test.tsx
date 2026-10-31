import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import { MathsCardsQuestion } from '..';
import { FIXTURE_MATHS_CARDS_PLAIN_EN as plain, FIXTURE_MATHS_CARDS_COUNTERS_EN as counters } from '../../../testFixtures';
import type { Result } from '../../../types/Result';

test('plain cards show prompt and gloss', () => {
  const r = render(<MathsCardsQuestion language="en" itemSet={plain} instructions="Say the bigger number." onComplete={jest.fn()} />);
  expect(within(r.getByTestId('maths-intro')).getByText('Say the bigger number.')).toBeTruthy(); fireEvent.press(r.getByText('Start'));
  expect(r.getByTestId('maths-cards')).toBeTruthy();
  expect(within(r.getByTestId('tile-0')).getByText(plain.items[0].prompt)).toBeTruthy();
  expect(within(r.getByTestId('tile-0')).getByText(plain.items[0].gloss!)).toBeTruthy();
  expect(r.getByLabelText('Pair 1 of 3')).toBeTruthy(); expect(r.getByText('Correct')).toBeTruthy();
});

test('take-away cards use their own choice labels and preserve tags', () => {
  const onComplete = jest.fn<void, [Result]>();
  const itemSet = { ...counters, question_code: 'maths_take_away_counters', choices: 'take_away',
    items: [[3,1],[5,2],[4,3]].map(([a,b], i) => ({ item_key: String(i+1), prompt: `${a} − ${b}`, gloss: String(a-b), skill: 'subtract_objects', band: 5 })) };
  const r = render(<MathsCardsQuestion language="en" itemSet={itemSet} onComplete={onComplete} />); fireEvent.press(r.getByText('Start'));
  expect(r.getByText('Counted what was left')).toBeTruthy(); expect(r.getByText('Counted back')).toBeTruthy();
  itemSet.items.forEach(() => fireEvent.press(r.getByText('Counted back'))); fireEvent.press(r.getByText('Finish'));
  expect(onComplete.mock.calls[0][0].items[0].metadata).toMatchObject({ skill: 'subtract_objects', band: 5, reached: true, strategy: 'count_on' });
});

test('plain Core cards ask for observation after Finish', () => {
  const onComplete = jest.fn<void, [Result]>();
  const r = render(<MathsCardsQuestion language="en" itemSet={{ ...plain, question_code: 'egma_word_problems', strategy_step: true }} onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start')); plain.items.forEach(() => fireEvent.press(r.getByText('Correct'))); fireEvent.press(r.getByText('Finish'));
  expect(onComplete).not.toHaveBeenCalled(); fireEvent.press(r.getByText("Couldn't tell")); fireEvent.press(r.getByText('Save'));
  expect(onComplete.mock.calls[0][0].derived.strategies).toEqual(['not_seen']);
});

test.each([undefined, null, {}, { ...plain, kind: 'maths_grid' }, { ...plain, choices: 'bad' },
  { ...plain, items: [{ ...plain.items[0], skill: 5 }] }, { ...plain, stop_rule: { kind: 'unknown' } },
].map(itemSet => ({ itemSet })))('invalid item set shows MissingItemSet ($itemSet)', ({ itemSet }) => {
  const onComplete = jest.fn(); const r = render(<MathsCardsQuestion language="xh" itemSet={itemSet} onComplete={onComplete} />);
  expect(r.getByTestId('missing-item-set-xh')).toBeTruthy(); expect(r.queryByText('Start')).toBeNull(); expect(onComplete).not.toHaveBeenCalled();
});
