import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { ReadWordsQuestion } from '..';
import { CURRENT_ITEM_SETS } from '../../../itemsets/current';
import { validateResult } from '../../../contractTest/validateResult';
import { tokens } from '../../../theme/tokens';

const SET = CURRENT_ITEM_SETS.word_reading.en;
const STOP_SET = { ...SET, stop_rule: { kind: 'consecutive_wrong' as const, stop_at: 10 } };
const STOP_TITLE = 'Lwazi got 10 in a row wrong. The test has stopped.';

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-20T12:00:00Z'));
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function start(props: Partial<React.ComponentProps<typeof ReadWordsQuestion>> = {}) {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const screen = render(<ReadWordsQuestion language="en" itemSet={SET} captureMode="sequential"
    durationSec={60} childName="Lwazi" onComplete={onComplete} onItemMarked={onItemMarked} {...props} />);
  fireEvent.press(screen.getByText('Start'));
  return { screen, onComplete, onItemMarked };
}
type Screen = ReturnType<typeof render>;
function decide(screen: Screen, correct: boolean, count = 1) {
  for (let i = 0; i < count; i += 1) {
    fireEvent.press(screen.getByRole('button', { name: correct ? 'Correct' : 'Incorrect' }));
  }
}
function end(screen: Screen) {
  fireEvent.press(screen.getByText('End'));
  fireEvent.press(screen.getByText('End test'));
}

test('50 Correct decisions auto-complete with all fifty item-set keys and sequential results', () => {
  const { screen, onComplete, onItemMarked } = start();
  decide(screen, true, 49);
  expect(onComplete).not.toHaveBeenCalled();
  const correct = screen.getByRole('button', { name: 'Correct' });
  act(() => { fireEvent.press(correct); fireEvent.press(correct); });
  act(() => jest.advanceTimersByTime(60000));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onItemMarked).toHaveBeenCalledTimes(50);
  const result = onComplete.mock.calls[0][0];
  expect(result).toMatchObject({
    question_code: 'word_reading', question_version: '2026.1', item_set_id: 'word_reading@2026.1.en',
    language: 'en', stopped_reason: 'completed',
    derived: { total_correct: 50, total_attempted: 50, percent: 100, last_attempted_position: 49,
      was_timed: true, tracks_progress: true, capture_mode: 'sequential', correction_count: 0, max_consecutive_wrong: 0 },
  });
  expect(result.items).toHaveLength(50);
  expect(result.items).toEqual(SET.words.map((word, position) => ({
    position, item_key: String(position), prompt: word.word, is_correct: true,
    metadata: { row: Math.floor(position / 5), reached: true },
  })));
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
});

test.each([undefined, null])('20 Incorrect decisions never stop when stop_rule is %s', (stop_rule) => {
  const { screen, onComplete } = start({ itemSet: stop_rule === undefined ? SET : { ...SET, stop_rule } });
  decide(screen, false, 20);
  expect(screen.queryByTestId('stop-card')).toBeNull();
  expect(onComplete).not.toHaveBeenCalled();
  expect(screen.getByLabelText(`${SET.words[20].word}, current`)).toBeTruthy();
  end(screen);
  const result = onComplete.mock.calls[0][0];
  expect(result).toMatchObject({ stopped_reason: 'ea_ended', derived: {
    total_correct: 0, total_attempted: 20, percent: 0, last_attempted_position: 19, max_consecutive_wrong: 20,
  } });
  expect(result.items.slice(20).every((item: any) => !item.is_correct && item.metadata.reached === false)).toBe(true);
});

test('a stop-rule override stops at ten across rows, guards queued taps, and freezes time until Save', () => {
  const { screen, onComplete, onItemMarked } = start({ itemSet: STOP_SET });
  act(() => jest.advanceTimersByTime(40000));
  decide(screen, false, 9);
  const incorrect = screen.getByRole('button', { name: 'Incorrect' });
  const correct = screen.getByRole('button', { name: 'Correct' });
  const back = screen.getByRole('button', { name: 'Back' });
  act(() => { fireEvent.press(incorrect); fireEvent.press(incorrect); fireEvent.press(correct); fireEvent.press(back); });
  expect(screen.getAllByText(STOP_TITLE)).toHaveLength(1);
  act(() => jest.advanceTimersByTime(30000));
  expect(onComplete).not.toHaveBeenCalled();
  const save = screen.getByRole('button', { name: 'Save result' });
  act(() => { fireEvent.press(save); fireEvent.press(save); });
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onItemMarked).toHaveBeenCalledTimes(10);
  const result = onComplete.mock.calls[0][0];
  expect(result).toMatchObject({ duration_ms: 40000, stopped_reason: 'stop_rule', derived: {
    total_attempted: 10, last_attempted_position: 9, correction_count: 0, max_consecutive_wrong: 10,
  } });
  expect(result.items[9]).toMatchObject({ item_key: '9', metadata: { row: 1, reached: true } });
  expect(result.items[10]).toMatchObject({ item_key: '10', is_correct: false, metadata: { row: 2, reached: false } });
  expect(validateResult(result, { stopAt: 10 }).valid).toBe(true);
});

test('rows follow the ten row_lengths of five without wrapping and controls use large side-by-side targets', () => {
  const { screen } = start();
  const rows = screen.getAllByTestId(/^word-row-/);
  expect(rows).toHaveLength(10);
  rows.forEach((row, rowIndex) => {
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'nowrap' });
    const cells = within(row).getAllByLabelText(/, (current|not reached)$/);
    expect(cells.map((cell) => cell.props.accessibilityLabel)).toEqual(
      SET.words.slice(rowIndex * 5, rowIndex * 5 + 5).map(({ word }, column) =>
        `${word}, ${rowIndex === 0 && column === 0 ? 'current' : 'not reached'}`),
    );
  });
  expect(within(screen.getByTestId('word-grid')).queryAllByRole('button')).toHaveLength(0);
  const decisions = screen.getByTestId('word-decisions');
  expect(StyleSheet.flatten(decisions.props.style).flexDirection).toBe('row');
  for (const name of ['Correct', 'Incorrect']) {
    expect(StyleSheet.flatten(within(decisions).getByRole('button', { name }).props.style)).toMatchObject({
      flex: 1, minHeight: 56, borderRadius: tokens.radius.pill,
    });
  }
  expect(within(decisions).queryByRole('button', { name: 'Back' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
});

test('current-row scrolling follows forward decisions and Back', () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
  const { screen } = start();
  fireEvent(screen.getByTestId('word-row-0'), 'layout', { nativeEvent: { layout: { y: 0 } } });
  fireEvent(screen.getByTestId('word-row-1'), 'layout', { nativeEvent: { layout: { y: 80 } } });
  decide(screen, true, 5);
  expect(screen.getByLabelText(`${SET.words[5].word}, current`)).toBeTruthy();
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 80, animated: true });
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: true });
});

test('missing row_lengths uses one row and duplicate words retain distinct item-set keys', () => {
  const { screen, onComplete, onItemMarked } = start({ itemSet: {
    ...SET, row_lengths: undefined,
    words: [{ item_key: 'first', word: 'same' }, { item_key: 'second', word: 'same' }],
  } });
  expect(screen.getAllByTestId(/^word-row-/)).toHaveLength(1);
  decide(screen, true);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  decide(screen, false);
  decide(screen, true);
  const result = onComplete.mock.calls[0][0];
  expect(result.items).toEqual([
    { position: 0, item_key: 'first', prompt: 'same', is_correct: false, metadata: { row: 0, reached: true } },
    { position: 1, item_key: 'second', prompt: 'same', is_correct: true, metadata: { row: 0, reached: true } },
  ]);
  expect(result.derived).toMatchObject({ correction_count: 1, max_consecutive_wrong: 1 });
  expect(onItemMarked.mock.calls.map(([item]) => item.item_key)).toEqual(['first', 'first', 'second']);
});

test('Undo excludes the stop-card pause and resumes the shifted deadline', () => {
  const { screen, onComplete } = start({ itemSet: STOP_SET });
  act(() => jest.advanceTimersByTime(20000));
  decide(screen, false, 10);
  act(() => jest.advanceTimersByTime(90000));
  fireEvent.press(screen.getByText('Undo last mark'));
  decide(screen, true);
  act(() => jest.advanceTimersByTime(39750));
  expect(onComplete).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(250));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ duration_ms: 60000, stopped_reason: 'timer', derived: {
    total_correct: 1, total_attempted: 10, correction_count: 1, max_consecutive_wrong: 9,
  } });
});

test('a stop on the final word takes precedence over automatic completion', () => {
  const { screen, onComplete } = start({ itemSet: {
    ...STOP_SET, words: SET.words.slice(0, 10), row_lengths: [5, 5],
  } });
  decide(screen, false, 10);
  expect(screen.getByText(STOP_TITLE)).toBeTruthy();
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Save result'));
  expect(onComplete.mock.calls[0][0].stopped_reason).toBe('stop_rule');
});

test('End confirmation freezes reading at the tap even when confirmation is delayed past the deadline', () => {
  const { screen, onComplete } = start();
  decide(screen, true, 3);
  act(() => jest.advanceTimersByTime(12345));
  fireEvent.press(screen.getByText('End'));
  expect(screen.getByTestId('end-confirmation')).toBeTruthy();
  expect(screen.queryByText('Last item attempted')).toBeNull();
  act(() => jest.advanceTimersByTime(90000));
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('End test'));
  expect(onComplete.mock.calls[0][0]).toMatchObject({ duration_ms: 12345, stopped_reason: 'ea_ended',
    derived: { total_correct: 3, total_attempted: 3, last_attempted_position: 2 } });
});

test('cancelling End retains decisions and the original deadline', () => {
  const { screen, onComplete } = start();
  decide(screen, true);
  act(() => jest.advanceTimersByTime(20000));
  fireEvent.press(screen.getByText('End'));
  act(() => jest.advanceTimersByTime(10000));
  fireEvent.press(screen.getByText('Cancel'));
  expect(screen.getByLabelText('the, correct')).toBeTruthy();
  act(() => jest.advanceTimersByTime(30000));
  expect(onComplete.mock.calls[0][0]).toMatchObject({ duration_ms: 60000, stopped_reason: 'timer',
    derived: { total_correct: 1, total_attempted: 1 } });
});

test.each(['Correct', 'Incorrect', 'Back', 'End'])('%s resolves a delayed timer before changing decisions', (control) => {
  const { screen, onComplete, onItemMarked } = start();
  decide(screen, true);
  // Elapsed time advances while the interval callback is delayed.
  jest.spyOn(globalThis.performance, 'now').mockReturnValue(globalThis.performance.now() + 65000);
  fireEvent.press(screen.getByRole('button', { name: control }));
  expect(onItemMarked).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ duration_ms: 60000, stopped_reason: 'timer',
    derived: { total_attempted: 1, last_attempted_position: 0 } });
});

test('allowSkip=false hides Skip in sequential mode', () => {
  const { screen } = start({ allowSkip: false });
  expect(screen.queryByText('Skip question')).toBeNull();
});

test('Skip defaults to allowed and keeps the skipped result shape with one terminal callback', () => {
  const { screen, onComplete } = start();
  decide(screen, true);
  fireEvent.press(screen.getByText('Skip question'));
  fireEvent.press(screen.getByText('Cancel'));
  expect(screen.getByLabelText('the, correct')).toBeTruthy();
  fireEvent.press(screen.getByText('Skip question'));
  const refused = screen.getByText('Child refused');
  act(() => { fireEvent.press(refused); fireEvent.press(refused); });
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'skipped_child_refused', items: [], derived: {
    total_correct: 0, total_attempted: 0, percent: 0, last_attempted_position: null,
    was_timed: true, tracks_progress: false, capture_mode: 'sequential',
  } });
});
