import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { adaptEgraForm, egraFormFor } from '..';
import { questionComponentFor } from '../../battery/questionComponents';
import { validateResult } from '../../contractTest/validateResult';
const { buildEgraResult } = require('../../../../test-support/egraResults');
import { tokens } from '../../theme/tokens';
import { WELA_PLUS_READ_PASSAGE_EN } from '../../itemsets/wela_plus_read_passage.en';
import { WELA_PLUS_READ_WORDS_EN } from '../../itemsets/wela_plus_read_words.en';

const { itemSets } = adaptEgraForm(egraFormFor('dbe-egra-en-fal-2-v1')!);
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test.each([
  ['letter_sounds', 60], ['letter_sounds', undefined], ['word_reading', 60], ['word_reading', undefined],
] as const)('%s first-row stop with duration %s through its registered component', (code, durationSec) => {
  const entry = questionComponentFor(code)!;
  const Component = entry.Component;
  const onComplete = jest.fn();
  const set = itemSets[code];
  const screen = render(<Component language="en" itemSet={set} durationSec={durationSec} {...entry.extraProps} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Start'));
  const rule = set.stop_rule!;
  const width = rule.kind === 'first_row_all_wrong' ? rule.first_row_length : 0;
  for (let i = 0; i < width; i++) fireEvent.press(screen.getByRole('button', { name: 'Incorrect' }));
  expect(screen.getByText('The child got every item in the first row wrong. The test has stopped.')).toBeTruthy();
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Save result'));
  const result = onComplete.mock.calls[0][0];
  expect(result).toMatchObject({ stopped_reason: 'stop_rule', derived: { was_timed: durationSec !== undefined, last_attempted_position: width - 1, total_attempted: width } });
  expect(validateResult(result, { stopRule: set.stop_rule! })).toEqual({ valid: true, errors: [] });
  expect(result).toEqual(buildEgraResult(set, { reason: 'stop_rule', attempted: width, durationMs: result.duration_ms, timed: durationSec !== undefined }));
});

test.each(['letter_sounds', 'word_reading'] as const)('%s expires before the first row as timer', code => {
  const { Component, extraProps } = questionComponentFor(code)!;
  const onComplete = jest.fn();
  const screen = render(<Component language="en" itemSet={itemSets[code]} durationSec={60} {...extraProps} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Start'));
  fireEvent.press(screen.getByRole('button', { name: 'Incorrect' }));
  act(() => jest.advanceTimersByTime(60000));
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'timer', derived: { last_attempted_position: 0 } });
});

test('EGRA oral reading: Incorrect marks render red and score only Correct marks', () => {
  const { Component, extraProps } = questionComponentFor('oral_reading')!;
  const onComplete = jest.fn();
  const screen = render(<Component language="en" itemSet={itemSets.oral_reading} durationSec={60} {...extraProps} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Start'));
  fireEvent.press(screen.getByText('Incorrect'));
  const tile = within(screen.getByTestId('passage-scroll')).getByTestId('tile-0');
  expect(tile.props.accessibilityLabel).toBe(`${itemSets.oral_reading.words[0].word}, incorrect. Double-tap to change to correct`);
  expect(tile).toHaveStyle({ backgroundColor: tokens.color.error });
  fireEvent.press(screen.getByText('Correct'));
  fireEvent.press(screen.getByText('Correct'));
  act(() => jest.advanceTimersByTime(30000));
  fireEvent.press(screen.getByTestId('passage-end'));
  fireEvent.press(within(screen.getByTestId('end-confirmation')).getByText('End question'));
  const result = onComplete.mock.calls[0][0];
  expect(result.items.map((item: any) => item.is_correct)).toEqual(itemSets.oral_reading.words.map((_, i) => i === 1 || i === 2));
  expect(result.derived.correct_words_per_minute).toBe(4);
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
  expect(result).toEqual(buildEgraResult(itemSets.oral_reading, { reason: 'ea_ended', attempted: 3, correct: [1, 2], durationMs: result.duration_ms }));
});

test('real comprehension output agrees with the synthetic builder for the same form', () => {
  const { Component } = questionComponentFor('reading_comprehension')!;
  const onComplete = jest.fn();
  const screen = render(<Component language="en" itemSet={itemSets.reading_comprehension} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Ask the questions'));
  fireEvent.press(screen.getByText('Correct'));
  fireEvent.press(screen.getByText('Incorrect'));
  fireEvent.press(screen.getByText('Correct'));
  fireEvent.press(screen.getByTestId('story-end'));
  fireEvent.press(screen.getByText('End question'));
  const result = onComplete.mock.calls[0][0];
  expect(result).toEqual(buildEgraResult(itemSets.reading_comprehension, {
    reason: 'ea_ended', durationMs: result.duration_ms, responses: ['correct', 'incorrect', 'correct'], notReached: 2,
  }));
});


test('oral reading with no errors saves 20 explicitly marked words after End at 30 s', () => {
  const { Component, extraProps } = questionComponentFor('oral_reading')!;
  const onComplete = jest.fn();
  const screen = render(<Component language="en" itemSet={itemSets.oral_reading} durationSec={60} {...extraProps} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Start'));
  for (let i = 0; i < 20; i++) fireEvent.press(screen.getByText('Correct'));
  act(() => jest.advanceTimersByTime(30000));
  fireEvent.press(screen.getByTestId('passage-end'));
  expect(screen.queryByText('Last item attempted')).toBeNull();
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(within(screen.getByTestId('end-confirmation')).getByText('End question'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  const result = onComplete.mock.calls[0][0];
  expect(result).toMatchObject({ stopped_reason: 'ea_ended', duration_ms: 30000,
    derived: { last_attempted_position: 19, total_attempted: 20, total_correct: 20, correct_words_per_minute: 40 } });
  expect(result.items.map((item: any) => item.is_correct)).toEqual(itemSets.oral_reading.words.map((_, index) => index < 20));
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
});

test('oral reading with an error at word 6 saves at once after the timer with the last marked word', () => {
  const { Component, extraProps } = questionComponentFor('oral_reading')!;
  const onComplete = jest.fn();
  const screen = render(<Component language="en" itemSet={itemSets.oral_reading} durationSec={60} {...extraProps} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Start'));
  for (let i = 0; i < 40; i++) fireEvent.press(screen.getByText(i === 5 ? 'Incorrect' : 'Correct'));
  act(() => jest.advanceTimersByTime(60000));
  expect(screen.queryByText('Last item attempted')).toBeNull();
  expect(screen.queryByText('Cancel')).toBeNull();
  expect(onComplete).toHaveBeenCalledTimes(1);
  const result = onComplete.mock.calls[0][0];
  expect(result).toMatchObject({ stopped_reason: 'timer', duration_ms: 60000,
    derived: { last_attempted_position: 39, total_attempted: 40, total_correct: 39, correct_words_per_minute: 39 } });
  expect(result.items.map((item: any) => item.is_correct)).toEqual(itemSets.oral_reading.words.map((_, index) => index < 40 && index !== 5));
  expect(result.items.map((item: any) => item.metadata.reached)).toEqual(itemSets.oral_reading.words.map((_, index) => index < 40));
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
});

test.each(['wela_plus_read_passage', 'wela_plus_read_words'])('%s records the last reached word when ending after ten correct marks', code => {
  const { Component } = questionComponentFor(code)!;
  const set = code === 'wela_plus_read_passage' ? WELA_PLUS_READ_PASSAGE_EN : WELA_PLUS_READ_WORDS_EN;
  const prefix = code === 'wela_plus_read_passage' ? 'passage' : 'word';
  const onComplete = jest.fn();
  const screen = render(<Component language="en" itemSet={set} durationSec={60} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Start'));
  for (let i = 0; i < 10; i++) fireEvent.press(screen.getByText('Correct'));
  act(() => jest.advanceTimersByTime(30000));
  fireEvent.press(screen.getByTestId(`${prefix}-end`));
  expect(screen.queryByText('Last item attempted')).toBeNull();
  expect(screen.getByText(`10 marked. The ${set.words.length - 10} not marked won't count towards the score.`)).toBeTruthy();
  fireEvent.press(within(screen.getByTestId('end-confirmation')).getByText('End question'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'ea_ended',
    derived: { last_attempted_position: 9, total_attempted: 10, total_correct: 10 } });
});

test('oral reading Keep marking keeps the marks and End again saves the newly reached prefix', () => {
  const { Component, extraProps } = questionComponentFor('oral_reading')!;
  const onComplete = jest.fn();
  const screen = render(<Component language="en" itemSet={itemSets.oral_reading} durationSec={60} {...extraProps} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Start'));
  for (let i = 0; i < 10; i++) fireEvent.press(screen.getByText(i === 5 ? 'Incorrect' : 'Correct'));
  act(() => jest.advanceTimersByTime(10000));
  fireEvent.press(screen.getByTestId('passage-end'));
  fireEvent.press(screen.getByText('Keep marking'));
  const body = within(screen.getByTestId('passage-scroll'));
  expect(body.getByTestId('tile-0').props.accessibilityLabel).toContain('correct.');
  expect(body.getByTestId('tile-5')).toHaveStyle({ backgroundColor: tokens.color.error });
  expect(body.getByTestId('tile-10').props.accessibilityLabel).toContain('current');
  expect(onComplete).not.toHaveBeenCalled();
  for (let i = 10; i < 25; i++) fireEvent.press(screen.getByText('Correct'));
  act(() => jest.advanceTimersByTime(10000));
  fireEvent.press(screen.getByTestId('passage-end'));
  expect(screen.getByText(`25 marked. The ${itemSets.oral_reading.words.length - 25} not marked won't count towards the score.`)).toBeTruthy();
  fireEvent.press(within(screen.getByTestId('end-confirmation')).getByText('End question'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'ea_ended', duration_ms: 20000,
    derived: { last_attempted_position: 24, total_attempted: 25, total_correct: 24 } });
  expect(onComplete.mock.calls[0][0].items.map((item: any) => item.is_correct)).toEqual(itemSets.oral_reading.words.map((_, i) => i < 25 && i !== 5));
});

test.each(['letter_sounds', 'word_reading'] as const)('%s reviews all marks before Finish through its registered EGRA component', code => {
  const { Component, extraProps } = questionComponentFor(code)!;
  const set = itemSets[code];
  const onComplete = jest.fn();
  const screen = render(<Component language="en" itemSet={set} durationSec={60} {...extraProps} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Start'));
  const total = code === 'letter_sounds' ? itemSets.letter_sounds.rows.flat().length : itemSets.word_reading.words.length;
  for (let position = 0; position < total; position++) fireEvent.press(screen.getByRole('button', { name: 'Correct' }));
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Finish'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  const result = onComplete.mock.calls[0][0];
  expect(result).toMatchObject({ stopped_reason: 'completed', derived: { total_correct: total, total_attempted: total, last_attempted_position: total - 1 } });
  expect(result.items.every((item: any) => item.metadata.reached === true)).toBe(true);
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
  expect(result).toEqual(buildEgraResult(set, { reason: 'completed', attempted: total,
    correct: Array.from({ length: total }, (_, i) => i), durationMs: result.duration_ms, timed: true }));
});

test('EGRA story questions speak the answer guide on the tile in every state', () => {
  const { Component } = questionComponentFor('reading_comprehension')!;
  const screen = render(<Component language="en" itemSet={itemSets.reading_comprehension} onComplete={jest.fn()} />);
  fireEvent.press(screen.getByText('Ask the questions'));
  const [first, second] = itemSets.reading_comprehension.questions;
  const tile = (position: number) => within(screen.getByTestId('prompt-scroll')).getByTestId(`tile-${position}`);
  expect(tile(0).props.accessibilityLabel).toBe(`${first.prompt}, Answer guide: ${first.answer_guide}, current`);
  expect(tile(1).props.accessibilityLabel).toBe(`${second.prompt}, Answer guide: ${second.answer_guide}, not reached`);
  fireEvent.press(screen.getByText('Correct'));
  expect(tile(0).props.accessibilityLabel)
    .toBe(`${first.prompt}, Answer guide: ${first.answer_guide}, correct. Double-tap to change to incorrect`);
});
