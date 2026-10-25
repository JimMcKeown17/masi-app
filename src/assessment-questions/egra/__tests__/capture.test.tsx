import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
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

test('oral reading marks errors visually and in the result, with untouched words correct only through the last word', () => {
  const { Component, extraProps } = questionComponentFor('oral_reading')!;
  const onComplete = jest.fn();
  const screen = render(<Component language="en" itemSet={itemSets.oral_reading} durationSec={60} {...extraProps} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Start'));
  fireEvent.press(screen.getByTestId('pill-0'));
  expect(screen.getByTestId('pill-0').props.accessibilityLabel).toBe(`${itemSets.oral_reading.words[0].word}, incorrect`);
  expect(screen.getByTestId('pill-0')).toHaveStyle({ backgroundColor: tokens.color.error });
  act(() => jest.advanceTimersByTime(30000));
  fireEvent.press(screen.getByText('End'));
  fireEvent.press(screen.getByText('Reached the end'));
  const result = onComplete.mock.calls[0][0];
  expect(result.items[0].is_correct).toBe(false);
  expect(result.items.slice(1).every((item: any) => item.is_correct)).toBe(true);
  expect(result.derived.correct_words_per_minute).toBe((result.items.length - 1) * 2);
  expect(validateResult(result).valid).toBe(true);
  expect(result).toEqual(buildEgraResult(itemSets.oral_reading, { reason: 'ea_ended', correct: result.items.map((_: unknown, i: number) => i).slice(1), durationMs: result.duration_ms }));
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


test('oral reading with no errors requires an explicit last word after End at 30 s', () => {
  const { Component, extraProps } = questionComponentFor('oral_reading')!;
  const onComplete = jest.fn();
  const screen = render(<Component language="en" itemSet={itemSets.oral_reading} durationSec={60} {...extraProps} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Start'));
  act(() => jest.advanceTimersByTime(30000));
  fireEvent.press(screen.getByText('End'));
  const confirm = screen.getByRole('button', { name: 'Confirm' });
  expect(confirm).toBeDisabled();
  fireEvent.press(confirm);
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText(`${itemSets.oral_reading.words[19].word}, item 20`));
  fireEvent.press(screen.getByText('Confirm'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  const result = onComplete.mock.calls[0][0];
  expect(result).toMatchObject({ stopped_reason: 'ea_ended', duration_ms: 30000,
    derived: { last_attempted_position: 19, total_attempted: 20, total_correct: 20, correct_words_per_minute: 40 } });
  expect(result.items.map((item: { is_correct: boolean }) => item.is_correct)).toEqual(
    itemSets.oral_reading.words.map((_, index) => index < 20));
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
});


test('oral reading with an error at word 6 requires an explicit last word after the timer', () => {
  const { Component, extraProps } = questionComponentFor('oral_reading')!;
  const onComplete = jest.fn();
  const screen = render(<Component language="en" itemSet={itemSets.oral_reading} durationSec={60} {...extraProps} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Start'));
  fireEvent.press(screen.getByTestId('pill-5'));
  act(() => jest.advanceTimersByTime(60000));
  expect(screen.getByText('Last item attempted')).toBeTruthy();
  expect(screen.queryByText('Cancel')).toBeNull();
  const confirm = screen.getByRole('button', { name: 'Confirm' });
  expect(confirm).toBeDisabled();
  fireEvent.press(confirm);
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText(`${itemSets.oral_reading.words[39].word}, item 40`));
  fireEvent.press(screen.getByText('Confirm'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  const result = onComplete.mock.calls[0][0];
  expect(result).toMatchObject({ stopped_reason: 'timer', duration_ms: 60000,
    derived: { last_attempted_position: 39, total_attempted: 40, total_correct: 39, correct_words_per_minute: 39 } });
  expect(result.items.map((item: { is_correct: boolean }) => item.is_correct)).toEqual(
    itemSets.oral_reading.words.map((_, index) => index < 40 && index !== 5));
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
});


test.each(['wela_plus_read_passage', 'wela_plus_read_words'])('%s keeps the last correct word preselected', code => {
  const { Component } = questionComponentFor(code)!;
  const set = code === 'wela_plus_read_passage' ? WELA_PLUS_READ_PASSAGE_EN : WELA_PLUS_READ_WORDS_EN;
  const onComplete = jest.fn();
  const screen = render(<Component language="en" itemSet={set} durationSec={60} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Start'));
  for (let index = 0; index < 10; index += 1) {
    if (code === 'wela_plus_read_passage') {
      fireEvent.press(screen.getAllByTestId(`pill-${set.words[index].item_key}`)[
        set.words.slice(0, index).filter(word => word.item_key === set.words[index].item_key).length
      ]);
    } else {
      if (index === 7) fireEvent.press(screen.getByLabelText('Next page'));
      fireEvent.press(screen.getByLabelText(`${set.words[index].word}, idle`));
    }
  }
  act(() => jest.advanceTimersByTime(30000));
  fireEvent.press(screen.getByText('End'));
  expect(screen.getByLabelText(`${set.words[9].word}, item 10`).props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  fireEvent.press(screen.getByText('Confirm'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'ea_ended',
    derived: { last_attempted_position: 9, total_attempted: 10, total_correct: 10 } });
});

test('oral reading forgets an earlier last-word choice after Cancel and End again', () => {
  const { Component, extraProps } = questionComponentFor('oral_reading')!;
  const onComplete = jest.fn();
  const screen = render(<Component language="en" itemSet={itemSets.oral_reading} durationSec={60} {...extraProps} onComplete={onComplete} />);
  fireEvent.press(screen.getByText('Start'));
  act(() => jest.advanceTimersByTime(10000));
  fireEvent.press(screen.getByText('End'));
  fireEvent.press(screen.getByLabelText(`${itemSets.oral_reading.words[9].word}, item 10`));
  fireEvent.press(screen.getByText('Cancel'));
  act(() => jest.advanceTimersByTime(10000));
  fireEvent.press(screen.getByText('End'));
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText(`${itemSets.oral_reading.words[24].word}, item 25`));
  fireEvent.press(screen.getByText('Confirm'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'ea_ended',
    derived: { last_attempted_position: 24, total_attempted: 25, total_correct: 25 } });
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
