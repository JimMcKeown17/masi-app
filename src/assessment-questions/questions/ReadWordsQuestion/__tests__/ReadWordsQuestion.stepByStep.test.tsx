import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { ReadWordsQuestion } from '..';
import { WELA_PLUS_READ_WORDS_EN, WELA_PLUS_READ_WORDS_XH } from '../../../itemsets';
import { CURRENT_ITEM_SETS } from '../../../itemsets/current';
import { validateResult } from '../../../contractTest/validateResult';

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
  const screen = render(<ReadWordsQuestion language="en" itemSet={SET}
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
  fireEvent.press(screen.getByTestId('word-end'));
  fireEvent.press(within(screen.getByTestId('end-confirmation')).getByText('End question'));
}

test('50 Correct decisions open review and Finish completes with all fifty item-set keys and sequential results', () => {
  const { screen, onComplete, onItemMarked } = start();
  decide(screen, true, 49);
  expect(onComplete).not.toHaveBeenCalled();
  const correct = screen.getByRole('button', { name: 'Correct' });
  act(() => { fireEvent.press(correct); fireEvent.press(correct); });
  act(() => jest.advanceTimersByTime(60000));
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Finish'));
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

test('word_reading shows card rows 1–2 as page 1 of 5 in two continuous columns', () => {
  const { screen } = start();
  expect(screen.getByText('Card rows 1–2 · page 1 of 5')).toBeTruthy();
  expect(screen.getAllByLabelText(/, (current|not reached)$/)).toHaveLength(10);
  expect(screen.queryAllByTestId(/^word-row-/)).toHaveLength(0);
  const grid = screen.getByTestId('word-grid');
  expect(grid).toHaveStyle({ flex: 1, paddingHorizontal: 16, justifyContent: 'center' });
  expect(screen.queryByTestId('card-row-divider')).toBeNull();
  const displayRows: ReturnType<typeof screen.getByTestId>[] = grid.findAll(
    (node: ReturnType<typeof screen.getByTestId>) => node.type === 'View' && StyleSheet.flatten(node.props.style)?.flexDirection === 'row',
  );
  expect(displayRows).toHaveLength(5);
  displayRows.forEach((row, index) => {
    const cells = within(row).getAllByLabelText(/, (current|not reached)$/);
    expect(cells.map(cell => cell.props.accessibilityLabel)).toEqual(
      SET.words.slice(index * 2, index * 2 + 2).map(({ word }, column) =>
        `${word}, ${index === 0 && column === 0 ? 'current' : 'not reached'}`),
    );
  });
  fireEvent(grid, 'layout', { nativeEvent: { layout: { width: 360 } } });
  expect(screen.getByLabelText(`${SET.words[0].word}, current`)).toHaveStyle({ width: 159 });
  expect(within(grid).queryAllByRole('button')).toHaveLength(0);
  decide(screen, true);
  expect(within(grid).getAllByRole('button')).toHaveLength(1);
});

test('long isiXhosa words shrink to fit their tile', () => {
  const { screen } = start({ language: 'xh', itemSet: CURRENT_ITEM_SETS.word_reading.xh });
  decide(screen, true, 30);
  expect(screen.getByText('ibhulukhwe').props).toMatchObject({
    numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6, maxFontSizeMultiplier: 1.2,
  });
});

test('word 20 is current on page 2 after nineteen decisions', () => {
  const { screen } = start();
  decide(screen, true, 19);
  expect(screen.getByText('Card rows 3–4 · page 2 of 5')).toBeTruthy();
  expect(screen.getByLabelText(`${SET.words[19].word}, current`)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByLabelText(`${SET.words[18].word}, current`)).toBeTruthy();
});

test('a 50-word set with no row_lengths pages as one card row: Card row 1 · page 1 of 5', () => {
  const { screen } = start({ itemSet: { ...SET, row_lengths: undefined } });
  expect(screen.getByText('Card row 1 · page 1 of 5')).toBeTruthy();
  expect(screen.getAllByLabelText(/, (current|not reached)$/)).toHaveLength(10);
});

test('missing row_lengths uses one row and duplicate words retain distinct item-set keys', () => {
  const { screen, onComplete, onItemMarked } = start({ itemSet: {
    ...SET, row_lengths: undefined,
    words: [{ item_key: 'first', word: 'same' }, { item_key: 'second', word: 'same' }],
  } });
  expect(screen.getAllByLabelText(/same, (current|not reached)$/)).toHaveLength(2);
  expect(screen.queryByTestId('page-indicator')).toBeNull();
  decide(screen, true);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  decide(screen, false);
  decide(screen, true);
  fireEvent.press(screen.getByText('Finish'));
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
  fireEvent.press(screen.getByTestId('word-end'));
  expect(screen.getByTestId('end-confirmation')).toBeTruthy();
  expect(screen.queryByText('Last item attempted')).toBeNull();
  act(() => jest.advanceTimersByTime(90000));
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(within(screen.getByTestId('end-confirmation')).getByText('End question'));
  expect(onComplete.mock.calls[0][0]).toMatchObject({ duration_ms: 12345, stopped_reason: 'ea_ended',
    derived: { total_correct: 3, total_attempted: 3, last_attempted_position: 2 } });
});

test('cancelling End retains decisions and the original deadline', () => {
  const { screen, onComplete } = start();
  decide(screen, true);
  act(() => jest.advanceTimersByTime(20000));
  fireEvent.press(screen.getByTestId('word-end'));
  act(() => jest.advanceTimersByTime(10000));
  fireEvent.press(screen.getByText('Keep marking'));
  expect(screen.getByLabelText('the, correct. Double-tap to change to incorrect')).toBeTruthy();
  act(() => jest.advanceTimersByTime(30000));
  expect(onComplete.mock.calls[0][0]).toMatchObject({ duration_ms: 60000, stopped_reason: 'timer',
    derived: { total_correct: 1, total_attempted: 1 } });
});

test.each(['Correct', 'Incorrect', 'Back', 'End question'])('%s resolves a delayed timer before changing decisions', (control) => {
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
  expect(screen.getByLabelText('the, correct. Double-tap to change to incorrect')).toBeTruthy();
  fireEvent.press(screen.getByText('Skip question'));
  const refused = screen.getByText('Child refused');
  act(() => { fireEvent.press(refused); fireEvent.press(refused); });
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'skipped_child_refused', items: [], derived: {
    total_correct: 0, total_attempted: 0, percent: 0, last_attempted_position: null,
    was_timed: true, tracks_progress: false, capture_mode: 'sequential',
  } });
});

test('an empty word override shows the no-items card without starting', () => {
  const onStart = jest.fn(), onComplete = jest.fn();
  const screen = render(<ReadWordsQuestion language="en"
    itemSet={{ ...SET, words: [], row_lengths: undefined }} onStart={onStart} onComplete={onComplete} />);
  expect(screen.getByTestId('missing-item-set-en')).toHaveTextContent("This test's card has no items.");
  expect(screen.queryByText('Start')).toBeNull();
  expect(screen.queryByTestId('page-indicator')).toBeNull();
  expect(onStart).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled();
});

test.each([WELA_PLUS_READ_WORDS_EN, WELA_PLUS_READ_WORDS_XH])(
  'Q6 steps word by word through the shipped set and never stops early ($language)', itemSet => {
    const { screen, onComplete, onItemMarked } = start({ language: itemSet.language, itemSet });
    decide(screen, false, 12);
    expect(screen.queryByTestId('stop-card')).toBeNull();
    expect(screen.getByLabelText(`${itemSet.words[12].word}, current`)).toBeTruthy();
    expect(screen.getByText('Word 13 of 40')).toBeTruthy();
    expect(onItemMarked).toHaveBeenCalledTimes(12);
    expect(onComplete).not.toHaveBeenCalled();
  },
);

test.each([WELA_PLUS_READ_WORDS_EN, WELA_PLUS_READ_WORDS_XH])(
  'Q6 pages are one 7-word card row each and the line reads Word 1 of 40 ($language)', itemSet => {
    const { screen } = start({ language: itemSet.language, itemSet });
    expect(itemSet.words).toHaveLength(40);
    expect(itemSet.row_lengths).toEqual([7, 7, 7, 7, 7, 5]);
    expect(screen.getByText('Word 1 of 40')).toBeTruthy();
    for (let row = 0; row < 6; row += 1) {
      expect(screen.getByText(`Card row ${row + 1} · page ${row + 1} of 6`)).toBeTruthy();
      const grid = within(screen.getByTestId('word-grid'));
      const offset = row * 7;
      for (let position = offset; position < offset + itemSet.row_lengths![row]; position += 1) {
        expect(grid.getByTestId(`tile-${position}`)).toBeTruthy();
      }
      expect(grid.queryByTestId(`tile-${offset + itemSet.row_lengths![row]}`)).toBeNull();
      if (row < 5) decide(screen, true, 7);
    }
  },
);

test('ReadWordsQuestion has no grid mode', () => {
  // @ts-expect-error captureMode was removed
  const screen = render(<ReadWordsQuestion language="en" captureMode="grid" onComplete={jest.fn()} />);
  fireEvent.press(screen.getByText('Start'));
  expect(screen.getByLabelText(`${WELA_PLUS_READ_WORDS_EN.words[0].word}, current`)).toBeTruthy();
  expect(screen.getByText('Correct')).toBeTruthy();
});
