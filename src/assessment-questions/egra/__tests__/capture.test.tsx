import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { adaptEgraForm, egraFormFor } from '..';
import { questionComponentFor } from '../../battery/questionComponents';
import { validateResult } from '../../contractTest/validateResult';
const { buildEgraResult } = require('../../../../test-support/egraResults');
import { tokens } from '../../theme/tokens';

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
  const { within } = require('@testing-library/react-native');
  fireEvent.press(within(screen.getByTestId('comprehension-0')).getByText('Correct'));
  fireEvent.press(within(screen.getByTestId('comprehension-1')).getByText('Wrong'));
  fireEvent.press(within(screen.getByTestId('comprehension-2')).getByText('Not asked'));
  fireEvent.press(screen.getByText('Finish'));
  fireEvent.press(screen.getByText('Save as Not asked'));
  const result = onComplete.mock.calls[0][0];
  expect(result).toEqual(buildEgraResult(itemSets.reading_comprehension, {
    durationMs: result.duration_ms, responses: ['correct', 'incorrect', 'not_asked'],
  }));
});
