import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import { LetterSoundsQuestion } from '..';
import { LETTER_SOUNDS_2026_2_EN } from '../../../itemsets/letter_sounds@2026.2.en';
import { FIXTURE_LETTER_SOUNDS_EN } from '../../../testFixtures';
import { validateResult } from '../../../contractTest/validateResult';
import { tokens } from '../../../theme/tokens';
import type { QuestionProps } from '../../../types/QuestionProps';

const SET = LETTER_SOUNDS_2026_2_EN;
const STOP_TITLE = 'The child got 10 in a row wrong. The test has stopped.';

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-20T12:00:00Z'));
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function startQ(props: Partial<QuestionProps> = {}) {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(<LetterSoundsQuestion language="en" itemSet={SET} durationSec={60}
    onComplete={onComplete} onItemMarked={onItemMarked} {...props} />);
  fireEvent.press(r.getByText('Start'));
  return { r, onComplete, onItemMarked };
}
type Screen = ReturnType<typeof render>;
function decide(r: Screen, correct: boolean, count = 1) {
  for (let i = 0; i < count; i += 1) fireEvent.press(r.getByRole('button', { name: correct ? 'Correct' : 'Incorrect' }));
}
function end(r: Screen) {
  fireEvent.press(r.getByTestId('letter-end'));
  fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End test'));
}

test('renders instructions and starts the timer only on Start', () => {
  const onComplete = jest.fn();
  const r = render(<LetterSoundsQuestion language="en" instructions="Read the sounds." durationSec={60} onComplete={onComplete} />);
  expect(r.getByText('Read the sounds.')).toBeTruthy();
  act(() => jest.advanceTimersByTime(90000));
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(r.getByText('Start'));
  act(() => jest.advanceTimersByTime(59999));
  expect(onComplete).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'timer', duration_ms: 60000 });
});

test('intro uses the shared instructions card and bottom Start', () => {
  const r = render(<LetterSoundsQuestion language="en" itemSet={SET}
    instructions="Read the sounds." onComplete={jest.fn()} />);
  expect(r.getByTestId('letter-intro')).toHaveStyle({ flex: 1, backgroundColor: tokens.color.canvas });
  expect(r.getByTestId('letter-intro-scroll').props.contentContainerStyle).toMatchObject({ padding: 16 });
  expect(r.getByText('Read the sounds.')).toHaveStyle({ color: tokens.color.ink, lineHeight: 24 });
  expect(r.getByRole('button', { name: 'Start' })).toHaveStyle({ backgroundColor: tokens.color.ink, minHeight: 52 });
});

test('active capture shows the timed status row and updates its countdown', () => {
  const { r } = startQ();

  expect(r.getByText('60s')).toBeTruthy();
  expect(r.getByLabelText('Time left, 60 seconds')).toBeTruthy();
  expect(r.getByText('Card rows 1–2 · page 1 of 3')).toBeTruthy();

  act(() => jest.advanceTimersByTime(10000));

  expect(r.getByText('50s')).toBeTruthy();
  expect(r.getByLabelText('Time left, 50 seconds')).toBeTruthy();
  decide(r, true, 13);
  expect(r.getByText('Card rows 1–2 · page 1 of 3')).toBeTruthy();
});

test('Start notifies the host exactly once', () => {
  const onStart = jest.fn();
  const onComplete = jest.fn();
  const r = render(<LetterSoundsQuestion language="en" itemSet={SET} durationSec={60}
    onStart={onStart} onComplete={onComplete} />);
  const start = r.getByRole('button', { name: 'Start' });

  act(() => { fireEvent.press(start); fireEvent.press(start); });

  expect(onStart).toHaveBeenCalledTimes(1);
});

test('ten Incorrect decisions open one bottom stop card and Save freezes the tenth-tap time', () => {
  const { r, onComplete, onItemMarked } = startQ();
  for (let i = 0; i < 10; i += 1) {
    act(() => jest.advanceTimersByTime(4000));
    decide(r, false);
  }
  expect(r.getAllByText(STOP_TITLE)).toHaveLength(1);
  const card = r.getByTestId('stop-card');
  expect(StyleSheet.flatten(card.props.style)).toMatchObject({ justifyContent: 'flex-end', backgroundColor: tokens.color.scrim });
  expect(r.queryByText('Last item attempted')).toBeNull();
  expect(onComplete).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(30000)); // past the original deadline
  expect(onComplete).not.toHaveBeenCalled();
  const save = r.getByRole('button', { name: 'Save result' });
  act(() => { fireEvent.press(save); fireEvent.press(save); });
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onItemMarked).toHaveBeenCalledTimes(10);
  const result = onComplete.mock.calls[0][0];
  expect(result).toMatchObject({ question_code: 'letter_sounds', question_version: '2026.2',
    item_set_id: SET.item_set_id, stopped_reason: 'stop_rule', duration_ms: 40000,
    derived: { total_correct: 0, total_attempted: 10, percent: 0, last_attempted_position: 9,
      was_timed: true, tracks_progress: true, capture_mode: 'sequential', correction_count: 0, max_consecutive_wrong: 10 } });
  expect(result.items).toHaveLength(60);
  expect(result.items.slice(0, 10).every((item: any) => item.metadata.reached && !item.is_correct)).toBe(true);
  expect(result.items.slice(10).every((item: any) => item.metadata.reached === false && item.is_correct === false)).toBe(true);
  const positioned = SET.rows.flatMap((row, rowIndex) => row.map((prompt) => ({ prompt, rowIndex })));
  [0, 11, 12, 59].forEach((position) => expect(result.items[position]).toMatchObject({
    position, item_key: String(position), prompt: positioned[position].prompt,
    metadata: { row: positioned[position].rowIndex },
  }));
  expect(validateResult(result, { stopAt: 10 })).toEqual({ valid: true, errors: [] });
});

test('Undo clears the last mark, resumes the frozen clock, and a Correct decision continues', () => {
  const { r, onComplete } = startQ();
  act(() => jest.advanceTimersByTime(20000));
  decide(r, false, 10);
  act(() => jest.advanceTimersByTime(90000));
  fireEvent.press(r.getByText('Undo last mark'));
  expect(r.queryByText(STOP_TITLE)).toBeNull();
  decide(r, true);
  act(() => jest.advanceTimersByTime(5000));
  end(r);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'ea_ended', duration_ms: 25000,
    derived: { total_attempted: 10, total_correct: 1, percent: 10, correction_count: 1, max_consecutive_wrong: 9 } });
});

test('Undo moves the deadline by the paused interval', () => {
  const { r, onComplete } = startQ();
  act(() => jest.advanceTimersByTime(20000));
  decide(r, false, 10);
  act(() => jest.advanceTimersByTime(90000));
  fireEvent.press(r.getByText('Undo last mark'));
  act(() => jest.advanceTimersByTime(39750));
  expect(onComplete).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(250));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'timer', duration_ms: 60000,
    derived: { total_attempted: 9, last_attempted_position: 8, max_consecutive_wrong: 9 } });
});

test('countdown freezes on the stop card and resumes after Undo', () => {
  const { r } = startQ();
  act(() => jest.advanceTimersByTime(10000));
  decide(r, false, 10);
  expect(r.getByText('50s', { includeHiddenElements: true })).toBeTruthy();

  act(() => jest.advanceTimersByTime(5000));
  expect(r.getByText('50s', { includeHiddenElements: true })).toBeTruthy();

  fireEvent.press(r.getByText('Undo last mark'));
  act(() => jest.advanceTimersByTime(1000));
  expect(r.getByText('49s')).toBeTruthy();
});

test('same-tick tenth and eleventh Incorrect taps stop once; all queued marking controls are ignored', () => {
  const { r, onComplete, onItemMarked } = startQ();
  decide(r, false, 9);
  const incorrect = r.getByRole('button', { name: 'Incorrect' });
  const correct = r.getByRole('button', { name: 'Correct' });
  const back = r.getByRole('button', { name: 'Back' });
  act(() => { fireEvent.press(incorrect); fireEvent.press(incorrect); fireEvent.press(correct); fireEvent.press(back); });
  expect(r.getAllByText(STOP_TITLE)).toHaveLength(1);
  expect(onItemMarked).toHaveBeenCalledTimes(10);
  fireEvent.press(r.getByText('Save result'));
  const result = onComplete.mock.calls[0][0];
  expect(result.derived).toMatchObject({ total_attempted: 10, correction_count: 0 });
  expect(result.items[10]).toMatchObject({ is_correct: false, metadata: { reached: false } });
});

test('childName is used verbatim in the stop card', () => {
  const { r } = startQ({ childName: 'Lwazi' });
  decide(r, false, 10);
  expect(r.getByText('Lwazi got 10 in a row wrong. The test has stopped.')).toBeTruthy();
});

test('stop_at comes from data and a stop on the final item takes precedence over completion', () => {
  const { r, onComplete } = startQ({ itemSet: { ...SET, rows: [['a'], ['b', 'c']], stop_rule: { kind: 'consecutive_wrong', stop_at: 3 } } });
  decide(r, false, 3);
  expect(r.getByText('The child got 3 in a row wrong. The test has stopped.')).toBeTruthy();
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(r.getByText('Save result'));
  expect(onComplete.mock.calls[0][0].stopped_reason).toBe('stop_rule');
});

test('consecutive wrong decisions count across row ends', () => {
  const { r } = startQ();
  decide(r, true, 7);
  decide(r, false, 10);
  expect(r.getByText(STOP_TITLE)).toBeTruthy();
});

test('allowSkip=false hides the skip control', () => {
  const { r } = startQ({ allowSkip: false });
  expect(r.queryByText('Skip question')).toBeNull();
});

test('Skip defaults to allowed; cancel retains decisions and a chosen reason emits the skipped shape once', () => {
  const { r, onComplete } = startQ();
  decide(r, true);
  fireEvent.press(r.getByText('Skip question'));
  fireEvent.press(r.getByText('Cancel'));
  expect(onComplete).not.toHaveBeenCalled();
  expect(r.getByLabelText('l, correct')).toBeTruthy();
  fireEvent.press(r.getByText('Skip question'));
  const tired = r.getByText('Child tired');
  act(() => { fireEvent.press(tired); fireEvent.press(tired); });
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'skipped_tired', items: [],
    derived: { total_correct: 0, total_attempted: 0, percent: 0, last_attempted_position: null,
      was_timed: true, tracks_progress: false, capture_mode: 'sequential' } });
});

test('Back clears the previous decision and counts a correction without notifying onItemMarked', () => {
  const { r, onComplete, onItemMarked } = startQ();
  expect(r.getByRole('button', { name: 'Back' })).toBeDisabled();
  decide(r, false, 5);
  fireEvent.press(r.getByRole('button', { name: 'Back' }));
  expect(onItemMarked).toHaveBeenCalledTimes(5);
  end(r);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ derived: {
    total_attempted: 4, last_attempted_position: 3, correction_count: 1, max_consecutive_wrong: 4,
  } });
  expect(onComplete.mock.calls[0][0].items[4].metadata.reached).toBe(false);
});

test('Correct and Incorrect notify exactly once per forward decision, including a corrected position', () => {
  const { r, onItemMarked } = startQ();
  decide(r, true);
  decide(r, false);
  fireEvent.press(r.getByRole('button', { name: 'Back' }));
  decide(r, true);
  expect(onItemMarked.mock.calls.map(([item]) => item)).toEqual([
    { position: 0, item_key: '0', prompt: 'l', is_correct: true, metadata: { row: 0, reached: true } },
    { position: 1, item_key: '1', prompt: 'a', is_correct: false, metadata: { row: 0, reached: true } },
    { position: 1, item_key: '1', prompt: 'a', is_correct: true, metadata: { row: 0, reached: true } },
  ]);
});

test('last-item decisions auto-complete once even with same-tick extra taps', () => {
  const { r, onComplete, onItemMarked } = startQ({ itemSet: { ...SET, rows: [['a', 'b']], stop_rule: null } });
  decide(r, true);
  const incorrect = r.getByRole('button', { name: 'Incorrect' });
  act(() => { fireEvent.press(incorrect); fireEvent.press(incorrect); });
  act(() => jest.advanceTimersByTime(120000));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onItemMarked).toHaveBeenCalledTimes(2);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'completed',
    derived: { total_attempted: 2, total_correct: 1, percent: 50, last_attempted_position: 1 } });
});

test('End confirms in a bottom sheet, freezing subsecond duration and scores at the tap', () => {
  const { r, onComplete } = startQ();
  decide(r, true, 2);
  decide(r, false);
  const correct = r.getByRole('button', { name: 'Correct' });
  act(() => jest.advanceTimersByTime(375));
  fireEvent.press(r.getByTestId('letter-end'));
  const sheet = r.getByTestId('end-confirmation');
  expect(StyleSheet.flatten(sheet.props.style)).toMatchObject({ justifyContent: 'flex-end', backgroundColor: tokens.color.scrim });
  fireEvent.press(correct);
  act(() => jest.advanceTimersByTime(90000));
  expect(onComplete).not.toHaveBeenCalled();
  const confirm = within(sheet).getByText('End test');
  act(() => { fireEvent.press(confirm); fireEvent.press(confirm); });
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ duration_ms: 375, stopped_reason: 'ea_ended',
    derived: { total_correct: 2, total_attempted: 3, percent: 67, last_attempted_position: 2 } });
});

test('Cancel on End retains decisions and the original deadline, including time in confirmation', () => {
  const { r, onComplete } = startQ();
  decide(r, true);
  act(() => jest.advanceTimersByTime(20000));
  fireEvent.press(r.getByTestId('letter-end'));
  act(() => jest.advanceTimersByTime(10000));
  fireEvent.press(r.getByText('Cancel'));
  expect(r.getByLabelText('l, correct')).toBeTruthy();
  act(() => jest.advanceTimersByTime(30000));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ duration_ms: 60000, stopped_reason: 'timer' });
});

test.each(['Correct', 'Incorrect', 'Back', 'End test'])('%s resolves an overdue deadline before changing any decisions', (control) => {
  const { r, onComplete, onItemMarked } = startQ();
  decide(r, true);
  // Elapsed time advances while the interval callback is delayed.
  jest.spyOn(globalThis.performance, 'now').mockReturnValue(globalThis.performance.now() + 65000);
  fireEvent.press(r.getByRole('button', { name: control }));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onItemMarked).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ duration_ms: 60000, stopped_reason: 'timer',
    derived: { total_correct: 1, total_attempted: 1, last_attempted_position: 0 } });
});

test('deadline expiry without marks emits -1, zero attempted, and no last-attempted sheet', () => {
  const { r, onComplete } = startQ();
  act(() => jest.advanceTimersByTime(60000));
  expect(r.queryByText('Last item attempted')).toBeNull();
  act(() => jest.advanceTimersByTime(60000));
  expect(onComplete).toHaveBeenCalledTimes(1);
  const result = onComplete.mock.calls[0][0];
  expect(result.derived).toMatchObject({ total_attempted: 0, total_correct: 0, percent: 0, last_attempted_position: -1 });
  expect(validateResult(result).valid).toBe(true);
});

test('untimed End freezes reading time and reports was_timed=false', () => {
  const { r, onComplete } = startQ({ durationSec: undefined });
  expect(r.queryByLabelText(/Time left/)).toBeNull();
  act(() => jest.advanceTimersByTime(120000));
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(r.getByTestId('letter-end'));
  act(() => jest.advanceTimersByTime(30000));
  fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End test'));
  expect(onComplete.mock.calls[0][0]).toMatchObject({ duration_ms: 120000, derived: { was_timed: false } });
});

test('unequal rows stay intact, highlight the current letter, and preserve duplicate positions', () => {
  const { r, onComplete } = startQ({ itemSet: { ...SET, rows: [['a', 'b'], ['c', 'a', 'd'], ['e']], stop_rule: null } });
  const rows = r.getAllByTestId(/^letter-row-/);
  expect(r.getByTestId('letter-grid')).toHaveStyle({ flex: 1, paddingHorizontal: 16, justifyContent: 'center' });
  expect(rows).toHaveLength(3);
  expect(rows.map((row) => within(row).getAllByLabelText(/, (current|not reached)$/).length)).toEqual([2, 3, 1]);
  const current = r.getByLabelText('a, current');
  expect(current.props.accessibilityState.selected).toBe(true);
  expect(current).toHaveStyle({ backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.ink });
  expect(r.getByTestId('current-ring', { includeHiddenElements: true })).toHaveStyle({ borderWidth: 3, borderColor: tokens.color.ink });
  expect(r.getAllByText('a')[0].props).toMatchObject({
    numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6, maxFontSizeMultiplier: 1.2,
  });
  expect(r.getAllByText('a')[0]).toHaveStyle({ fontSize: tokens.font.tileLetter });
  expect(within(r.getByTestId('letter-grid')).queryAllByRole('button')).toHaveLength(0);
  decide(r, false, 3);
  decide(r, true);
  end(r);
  const result = onComplete.mock.calls[0][0];
  expect(result.items.map((item: any) => item.metadata.row)).toEqual([0, 0, 1, 1, 1, 2]);
  expect(result.items[0].is_correct).toBe(false);
  expect(result.items[3]).toMatchObject({ position: 3, prompt: 'a', is_correct: true });
});

test('no progress counter; no row auto-scroll', () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
  const { r } = startQ();
  expect(r.queryByText(/^\d+ \/ \d+$/)).toBeNull();
  decide(r, true, 20);
  fireEvent.press(r.getByRole('button', { name: 'Back' }));
  expect(r.queryByText(/^\d+ \/ \d+$/)).toBeNull();
  expect(r.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
  expect(scrollTo).not.toHaveBeenCalled();
});

test('decision layout: Correct/Incorrect side by side, full-width Back, End test centred below', () => {
  const { r } = startQ({ allowSkip: false });
  const row = r.getByTestId('letter-decisions');
  expect(row).toHaveStyle({ flexDirection: 'row' });
  for (const name of ['Correct', 'Incorrect']) {
    expect(within(row).getByRole('button', { name })).toHaveStyle({ flex: 1, minHeight: 52, borderRadius: tokens.radius.pill });
  }
  expect(within(row).queryByRole('button', { name: 'Back' })).toBeNull();
  const back = r.getByRole('button', { name: 'Back' });
  expect(back).toBeDisabled();
  expect(back).toHaveStyle({ alignSelf: 'stretch', borderWidth: 1.5, borderColor: tokens.color.ink });
  const navigation = r.getByTestId('letter-navigation');
  expect(navigation).toHaveStyle({ flexDirection: 'row', justifyContent: 'center' });
  expect(within(navigation).queryByRole('button', { name: 'Back' })).toBeNull();
  expect(within(navigation).getByRole('button', { name: 'End test' })).toHaveStyle({ minHeight: 44 });
});

test('Skip question shows beside End test only when allowSkip', () => {
  const { r } = startQ();
  const navigation = r.getByTestId('letter-navigation');
  expect(within(navigation).getByRole('button', { name: 'Skip question' })).toBeTruthy();
  expect(within(navigation).getByRole('button', { name: 'End test' })).toBeTruthy();
});

test('Grid A shows card rows 1–2 as page 1 of 3, twenty letter tiles in rows of five', () => {
  const { r } = startQ();
  expect(r.getByText('Card rows 1–2 · page 1 of 3')).toBeTruthy();
  expect(r.getAllByLabelText(/, (current|not reached)$/)).toHaveLength(20);
  const rows = r.getAllByTestId(/^letter-row-/);
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(within(row).getAllByLabelText(/, (current|not reached)$/)).toHaveLength(10);
    expect(row.children).toHaveLength(2);
    for (const displayRow of row.children) {
      expect(typeof displayRow).not.toBe('string');
      expect(within(displayRow as typeof row).getAllByLabelText(/, (current|not reached)$/)).toHaveLength(5);
    }
  }
  expect(r.getByLabelText('l, current')).toHaveStyle({ borderWidth: 1, borderColor: tokens.color.ink });
  expect(r.getByTestId('current-ring', { includeHiddenElements: true })).toHaveStyle({ borderWidth: 3, borderColor: tokens.color.ink });
  expect(r.queryByRole('button', { name: 'Previous page' })).toBeNull();
  expect(r.queryByRole('button', { name: 'Next page' })).toBeNull();
  fireEvent(r.getByTestId('letter-grid'), 'layout', { nativeEvent: { layout: { width: 360 } } });
  expect(r.getByLabelText('l, current')).toHaveStyle({ width: 57.6 });
});

test('marking the twentieth letter moves to page 2; Back from its first letter returns to page 1 with letter 20 current and unmarked', () => {
  const { r } = startQ();
  decide(r, true, 19);
  expect(r.getByText('Card rows 1–2 · page 1 of 3')).toBeTruthy();
  decide(r, true);
  expect(r.getByText('Card rows 3–4 · page 2 of 3')).toBeTruthy();
  expect(r.getByLabelText(`${SET.rows[2][0]}, current`)).toBeTruthy();
  fireEvent.press(r.getByRole('button', { name: 'Back' }));
  expect(r.getByText('Card rows 1–2 · page 1 of 3')).toBeTruthy();
  expect(r.getByLabelText(`${SET.rows[1][9]}, current`)).toHaveStyle({ backgroundColor: tokens.color.surface, borderWidth: 1 });
  expect(r.getByTestId('current-ring', { includeHiddenElements: true })).toHaveStyle({ borderWidth: 3, borderColor: tokens.color.ink });
  expect(r.getAllByLabelText(/, correct$/)).toHaveLength(19);
});

test('earlier marks stay visible after Back', () => {
  const { r } = startQ();
  decide(r, true);
  decide(r, false);
  decide(r, true);
  fireEvent.press(r.getByRole('button', { name: 'Back' }));
  expect(r.getByLabelText('l, correct')).toHaveStyle({ backgroundColor: tokens.color.marked });
  expect(r.getByLabelText('a, incorrect')).toHaveStyle({ backgroundColor: tokens.color.error });
  expect(r.getByLabelText('m, current')).toHaveStyle({ backgroundColor: tokens.color.surface, borderWidth: 1 });
  expect(r.getByTestId('current-ring', { includeHiddenElements: true })).toHaveStyle({ borderWidth: 3, borderColor: tokens.color.ink });
});

test('a stop on the last letter of a page leaves that page showing under the stop card', () => {
  const { r, onComplete } = startQ();
  decide(r, true, 10);
  decide(r, false, 10);
  expect(r.getByTestId('stop-card')).toBeTruthy();
  expect(r.getByText('Card rows 1–2 · page 1 of 3', { includeHiddenElements: true })).toBeTruthy();
  expect(r.getAllByLabelText(/, (correct|incorrect)$/, { includeHiddenElements: true })).toHaveLength(20);
  expect(r.queryByRole('button', { name: 'Correct' })).toBeNull();
  expect(onComplete).not.toHaveBeenCalled();
});

test('a stop on the final letter of the card does not blank the grid', () => {
  const { r, onComplete } = startQ();
  decide(r, true, 50);
  decide(r, false, 10);
  expect(r.getByTestId('stop-card')).toBeTruthy();
  expect(r.getByText('Card rows 5–6 · page 3 of 3', { includeHiddenElements: true })).toBeTruthy();
  expect(r.getAllByLabelText(/, (correct|incorrect)$/, { includeHiddenElements: true })).toHaveLength(20);
  expect(onComplete).not.toHaveBeenCalled();
});

test('an incomplete override resolves to the requested bundled set', () => {
  const { r, onComplete } = startQ({ itemSet: { rows: [['invalid']], stop_rule: null } });
  expect(r.queryByText('invalid')).toBeNull();
  end(r);
  expect(onComplete.mock.calls[0][0].item_set_id).toBe(SET.item_set_id);
});

test('a complete override supplies the result identity and content', () => {
  const custom = { ...SET, item_set_id: 'custom@1.en', question_code: 'custom', question_version: '1', rows: [['x', 'y']], stop_rule: null };
  const { r, onComplete } = startQ({ itemSet: custom });
  decide(r, true, 2);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ question_code: 'custom', question_version: '1', item_set_id: 'custom@1.en' });
});

test('fixture item_set_id is clearly marked as fixture', () => {
  const { r, onComplete } = startQ({ itemSet: FIXTURE_LETTER_SOUNDS_EN });
  end(r);
  expect(onComplete.mock.calls[0][0].item_set_id).toBe('letter_sounds@fixture.en');
});


test('a stop clears the current tile selection and Undo restores it', () => {
  const { r } = startQ();
  decide(r, false, 10);
  expect(r.getByTestId('stop-card')).toBeTruthy();
  expect(r.getAllByRole('text', { includeHiddenElements: true }).filter(tile => tile.props.accessibilityState?.selected === true)).toHaveLength(0);
  fireEvent.press(r.getByText('Undo last mark'));
  expect(r.getByLabelText(`${SET.rows.flat()[9]}, current`).props.accessibilityState.selected).toBe(true);
});
