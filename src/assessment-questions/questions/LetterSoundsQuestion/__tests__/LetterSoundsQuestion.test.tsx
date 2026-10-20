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

test('intro uses a padded full-height layout with instructions above a bottom-pinned Start', () => {
  const r = render(<LetterSoundsQuestion language="en" itemSet={SET}
    instructions="Read the sounds." onComplete={jest.fn()} />);

  expect(StyleSheet.flatten(r.getByTestId('letter-intro').props.style)).toMatchObject({
    flex: 1, padding: tokens.space.lg,
  });
  expect(StyleSheet.flatten(r.getByText('Read the sounds.').props.style)).toMatchObject({
    color: tokens.color.ink, fontSize: tokens.font.body, lineHeight: 24,
  });
  expect(StyleSheet.flatten(r.getByRole('button', { name: 'Start' }).props.style).marginTop).toBe('auto');
});

test('active capture shows the timed status row and updates its countdown', () => {
  const { r } = startQ();

  expect(r.getByText('1:00')).toBeTruthy();
  expect(r.getByLabelText('Time left, 60 seconds')).toBeTruthy();
  expect(r.getByText('0 / 60')).toBeTruthy();

  act(() => jest.advanceTimersByTime(10000));

  expect(r.getByText('0:50')).toBeTruthy();
  expect(r.getByLabelText('Time left, 50 seconds')).toBeTruthy();
  decide(r, true, 13);
  expect(r.getByText('13 / 60')).toBeTruthy();
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
  expect(r.getByText('0:50', { includeHiddenElements: true })).toBeTruthy();

  act(() => jest.advanceTimersByTime(5000));
  expect(r.getByText('0:50', { includeHiddenElements: true })).toBeTruthy();

  fireEvent.press(r.getByText('Undo last mark'));
  act(() => jest.advanceTimersByTime(1000));
  expect(r.getByText('0:49')).toBeTruthy();
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
  expect(StyleSheet.flatten(r.getByTestId('letter-grid').props.contentContainerStyle).paddingHorizontal)
    .toBe(tokens.space.lg);
  expect(rows).toHaveLength(3);
  expect(rows.map((row) => within(row).getAllByLabelText(/, (current|not reached)$/).length)).toEqual([2, 3, 1]);
  rows.forEach((row) => expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'nowrap' }));
  const current = r.getByLabelText('a, current');
  expect(current.props.accessibilityState.selected).toBe(true);
  expect(StyleSheet.flatten(current.props.style)).toMatchObject({
    backgroundColor: tokens.color.ink, flex: 1,
  });
  expect(r.getAllByText('a')[0].props).toMatchObject({
    numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7,
  });
  expect(StyleSheet.flatten(r.getAllByText('a')[0].props.style).fontSize).toBe(tokens.font.markingItem);
  expect(within(r.getByTestId('letter-grid')).queryAllByRole('button')).toHaveLength(0);
  decide(r, false, 3);
  decide(r, true);
  end(r);
  const result = onComplete.mock.calls[0][0];
  expect(result.items.map((item: any) => item.metadata.row)).toEqual([0, 0, 1, 1, 1, 2]);
  expect(result.items[0].is_correct).toBe(false);
  expect(result.items[3]).toMatchObject({ position: 3, prompt: 'a', is_correct: true });
});

test('the current row scrolls into view when the cursor moves forward or Back', () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
  const { r } = startQ();
  fireEvent(r.getByTestId('letter-row-0'), 'layout', { nativeEvent: { layout: { y: 0 } } });
  fireEvent(r.getByTestId('letter-row-1'), 'layout', { nativeEvent: { layout: { y: 80 } } });
  decide(r, true, 10);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 80, animated: true });
  fireEvent.press(r.getByRole('button', { name: 'Back' }));
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: true });
});

test('Correct/Incorrect stay side by side and Back/End test share one navigation row', () => {
  const { r } = startQ();
  const row = r.getByTestId('letter-decisions');
  expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('row');
  for (const name of ['Correct', 'Incorrect']) {
    expect(StyleSheet.flatten(within(row).getByRole('button', { name }).props.style)).toMatchObject({ flex: 1, minHeight: 56, borderRadius: tokens.radius.pill });
  }
  expect(within(row).queryByRole('button', { name: 'Back' })).toBeNull();
  const navigation = r.getByTestId('letter-navigation');
  expect(StyleSheet.flatten(navigation.props.style)).toMatchObject({
    flexDirection: 'row', justifyContent: 'space-between',
  });
  expect(within(navigation).getByRole('button', { name: 'Back' })).toBeDisabled();
  expect(within(navigation).getByText('End test')).toBeTruthy();
  for (const name of ['Back', 'End test']) {
    expect(StyleSheet.flatten(within(navigation).getByRole('button', { name }).props.style).minHeight)
      .toBeGreaterThanOrEqual(44);
  }
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
