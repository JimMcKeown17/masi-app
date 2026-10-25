import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, within, act } from '@testing-library/react-native';
import { tokens } from '../../../theme/tokens';
import { WriteCvcsQuestion } from '..';
import { FIXTURE_WRITE_CVCS_EN } from '../../../testFixtures';
import { WELA_PLUS_WRITE_CVCS_EN } from '../../../itemsets/wela_plus_write_cvcs.en';
import { WELA_PLUS_WRITE_CVCS_XH } from '../../../itemsets/wela_plus_write_cvcs.xh';

function start(itemSet = FIXTURE_WRITE_CVCS_EN, extra = {}) {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(<WriteCvcsQuestion language={itemSet.language} itemSet={itemSet}
    instructions="Dictate each CVC." onComplete={onComplete} onItemMarked={onItemMarked} {...extra} />);
  expect(r.getByText('Dictate each CVC.')).toBeTruthy();
  fireEvent.press(r.getByText('Start'));
  return { r, onComplete, onItemMarked };
}
const mark = (r: ReturnType<typeof render>, ...correct: boolean[]) =>
  correct.forEach(value => fireEvent.press(r.getByText(value ? 'Correct' : 'Incorrect')));
const tile = (r: ReturnType<typeof render>, position: number) =>
  within(r.getByTestId('prompt-scroll')).getByTestId(`tile-${position}`);
function end(r: ReturnType<typeof render>) {
  fireEvent.press(r.getByTestId('cvc-end'));
  fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question'));
}

test('Q9: the ring steps letter by letter and the line reads Word 2 · letter 3 of 4', () => {
  const { r } = start(WELA_PLUS_WRITE_CVCS_XH);
  expect(r.getByText('1. lala')).toBeTruthy();
  expect(r.getByText('4. idolo')).toBeTruthy();
  expect(r.getByTestId('prompt-scroll').props.horizontal).not.toBe(true);
  expect(tile(r, 0).props.accessibilityLabel).toBe('lala letter 1 l, current');
  expect(tile(r, 1).props.accessibilityLabel).toBe('lala letter 2 a, not reached');
  mark(r, true, true, false, true, true, true);
  expect(r.getByText('Word 2 · letter 3 of 4')).toBeTruthy();
  expect(tile(r, 6).props.accessibilityLabel).toBe('sela letter 3 l, current');
  fireEvent.press(r.getByText('Back'));
  expect(tile(r, 5).props.accessibilityLabel).toBe('sela letter 2 e, current');
  expect(tile(r, 6).props.accessibilityLabel).toBe('sela letter 3 l, not reached');
});

test('Q9: End mid-word saves per_word over reached letters only', () => {
  const { r, onComplete } = start();
  mark(r, true, false, true, true, false);
  end(r);
  expect(onComplete).toHaveBeenCalledTimes(1);
  const result = onComplete.mock.calls[0][0];
  expect(result.derived).toMatchObject({ total_correct: 3, total_attempted: 5, percent: 60,
    last_attempted_position: 4, tracks_progress: true, capture_mode: 'sequential', was_timed: false });
  expect(result.stopped_reason).toBe('ea_ended');
  expect(result.derived.per_word).toEqual([
    { word: 'jam', correct: 2, total: 3 }, { word: 'hut', correct: 1, total: 2 },
    { word: 'fin', correct: 0, total: 0 }, { word: 'net', correct: 0, total: 0 },
  ]);
  expect(result.items).toHaveLength(12);
  expect(result.items.slice(5).every((item: any) => item.metadata.reached === false && !item.is_correct)).toBe(true);
});

test('Q9: a flip shows "Letter 3 of word 2 changed to Correct"', () => {
  const { r, onComplete } = start(WELA_PLUS_WRITE_CVCS_XH);
  mark(r, true, true, true, true, true, true, false);
  fireEvent.press(tile(r, 6));
  expect(r.getByText('Letter 3 of word 2 changed to Correct')).toBeTruthy();
  expect(tile(r, 7).props.accessibilityLabel).toBe('sela letter 4 a, current');
  expect(tile(r, 6).props.accessibilityLabel).toBe('sela letter 3 l, correct. Double-tap to change to incorrect');
  fireEvent.press(tile(r, 6));
  expect(r.getByText('Letter 3 of word 2 changed to Incorrect')).toBeTruthy();
  end(r);
  expect(onComplete.mock.calls[0][0].derived).toMatchObject({ correction_count: 2,
    total_correct: 6, per_word: [{ word: 'lala', correct: 4, total: 4 },
      { word: 'sela', correct: 2, total: 3 }, { word: 'imali', correct: 0, total: 0 },
      { word: 'idolo', correct: 0, total: 0 }] });
});

test('Q9: items keep their metadata beside reached', () => {
  const set = { ...WELA_PLUS_WRITE_CVCS_XH, words: [
    { item_key: 'w3', word: 'imali', letters: ['m', 'a', 'l', 'i'] },
  ] };
  const { r, onComplete, onItemMarked } = start(set);
  mark(r, true);
  expect(onItemMarked).toHaveBeenLastCalledWith({ position: 0, item_key: 'w3.l1', prompt: 'm',
    is_correct: true, metadata: { word: 'imali', word_index: 0, letter_index: 0, reached: true } });
  end(r);
  expect(onComplete.mock.calls[0][0].items).toEqual(set.words[0].letters.map((letter, i) => ({
    position: i, item_key: `w3.l${i + 1}`, prompt: letter, is_correct: i === 0,
    metadata: { word: 'imali', word_index: 0, letter_index: i, reached: i === 0 },
  })));
  r.unmount();

  // Retain the original prefix-exclusion regression across two complete word rows.
  const full = start({ ...set, words: [
    { item_key: 'w1', word: 'lala', letters: ['l', 'a', 'l', 'a'] }, ...set.words,
  ] });
  mark(full.r, true, false, false, false, false, false, false, true);
  fireEvent.press(full.r.getByText('Finish'));
  const result = full.onComplete.mock.calls[0][0];
  expect(result.items).toHaveLength(8);
  expect(result.items[7]).toEqual({ position: 7, item_key: 'w3.l4', prompt: 'i', is_correct: true,
    metadata: { word: 'imali', word_index: 1, letter_index: 3, reached: true } });
  expect(result.derived).toMatchObject({ total_correct: 2, total_attempted: 8,
    per_word: [{ word: 'lala', correct: 1, total: 4 }, { word: 'imali', correct: 1, total: 4 }] });
});

test('Q9: repeated words keep independent marks through flip and Back', () => {
  const { r, onComplete, onItemMarked } = start({ ...FIXTURE_WRITE_CVCS_EN, words: [
    { item_key: 'same', word: 'a', letters: ['a'] }, { item_key: 'same', word: 'a', letters: ['a'] },
  ] });
  mark(r, true, false);
  expect(onComplete).not.toHaveBeenCalled();
  expect(r.getByText('All 2 marked · 1 correct. Tap any letter to change it.')).toBeTruthy();
  fireEvent.press(tile(r, 1));
  fireEvent.press(tile(r, 0));
  expect(tile(r, 0).props.accessibilityLabel).toBe('a letter 1 a, incorrect. Double-tap to change to correct');
  expect(tile(r, 1).props.accessibilityLabel).toBe('a letter 1 a, correct. Double-tap to change to incorrect');
  fireEvent.press(r.getByText('Back'));
  expect(tile(r, 1).props.accessibilityLabel).toBe('a letter 1 a, current');
  expect(r.queryByText('Finish')).toBeNull();
  mark(r, false);
  fireEvent.press(r.getByText('Finish'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  const result = onComplete.mock.calls[0][0];
  expect(result.items).toEqual([false, false].map((is_correct, position) => ({ position,
    item_key: 'same.l1', prompt: 'a', is_correct,
    metadata: { word: 'a', word_index: position, letter_index: 0, reached: true } })));
  expect(result.derived).toMatchObject({ correction_count: 3, total_correct: 0, total_attempted: 2,
    per_word: [{ word: 'a', correct: 0, total: 1 }, { word: 'a', correct: 0, total: 1 }] });
  expect(onItemMarked).toHaveBeenCalledTimes(5);
});

test('Q9: review then Finish emits completed, all per-word totals, and stays untimed', () => {
  jest.useFakeTimers();
  try {
    const { r, onComplete } = start(FIXTURE_WRITE_CVCS_EN, { durationSec: 1 });
    act(() => jest.advanceTimersByTime(2000));
    expect(onComplete).not.toHaveBeenCalled();
    for (let i = 0; i < 12; i++) mark(r, true);
    expect(r.getByText('All 12 marked · 12 correct. Tap any letter to change it.')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(r.getByText('Finish'));
    const result = onComplete.mock.calls[0][0];
    expect(result).toMatchObject({ question_code: 'wela_plus_write_cvcs', stopped_reason: 'completed',
      derived: { total_correct: 12, total_attempted: 12, was_timed: false } });
    expect(result.derived.per_word).toEqual(FIXTURE_WRITE_CVCS_EN.words.map(({ word }) => ({ word, correct: 3, total: 3 })));
  } finally { jest.useRealTimers(); }
});

test('Q9: End asks in a bottom sheet; Keep marking preserves tiles, accessibility and callbacks', () => {
  const { r, onComplete, onItemMarked } = start();
  mark(r, true, false);
  const markedTile = tile(r, 0);
  const markedLabel = markedTile.props.accessibilityLabel;
  expect(markedTile).toHaveStyle({ width: 52 });
  const scroller = r.getByTestId('prompt-scroll');
  fireEvent.press(r.getByTestId('cvc-end'));
  const sheet = r.getByTestId('end-confirmation');
  expect(StyleSheet.flatten(sheet.props.style)).toMatchObject({ ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end', backgroundColor: tokens.color.scrim });
  expect(sheet.props.accessibilityViewIsModal).toBe(true);
  expect(r.getByText('End this question?')).toBeTruthy();
  expect(r.getByText("2 marked. The 10 not marked won't count towards the score.")).toBeTruthy();
  // The engine disables flips under the sheet, replacing the button with a text tile.
  const coveredTile = r.getByTestId('tile-0', { includeHiddenElements: true });
  expect(coveredTile.props.accessibilityLabel).toBe(markedLabel.split('. Double-tap')[0]);
  expect(coveredTile.props.accessibilityRole).toBe('text');
  expect(r.getByTestId('prompt-scroll', { includeHiddenElements: true })).toBe(scroller);
  expect(r.queryByLabelText('jam letter 1 j, correct. Double-tap to change to incorrect')).toBeNull();
  let hiddenView = scroller.parent;
  while (hiddenView && hiddenView.props.accessibilityElementsHidden === undefined) hiddenView = hiddenView.parent;
  expect(hiddenView?.props.accessibilityElementsHidden).toBe(true);
  expect(hiddenView?.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(hiddenView?.props.pointerEvents).toBe('none');
  expect(onComplete).not.toHaveBeenCalled();
  expect(onItemMarked).toHaveBeenCalledTimes(2);
  fireEvent.press(r.getByText('Keep marking'));
  expect(r.queryByTestId('end-confirmation')).toBeNull();
  expect(tile(r, 0).props.accessibilityLabel).toBe('jam letter 1 j, correct. Double-tap to change to incorrect');
  expect(tile(r, 1).props.accessibilityLabel).toBe('jam letter 2 a, incorrect. Double-tap to change to correct');
  expect(hiddenView?.props.accessibilityElementsHidden).toBe(false);
  expect(hiddenView?.props.importantForAccessibility).toBe('auto');
  expect(hiddenView?.props.pointerEvents).toBe('auto');
  expect(onComplete).not.toHaveBeenCalled();
  expect(onItemMarked).toHaveBeenCalledTimes(2);
  end(r);
  expect(onComplete.mock.calls[0][0].derived).toMatchObject({ total_correct: 1, total_attempted: 2 });
});

test('Q9: Skip emits skipped_* with no items or per_word after marking', () => {
  const { r, onComplete } = start();
  mark(r, true);
  fireEvent.press(r.getByText('Skip question'));
  fireEvent.press(r.getByText('Out of time'));
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'skipped_time', items: [],
    derived: { total_correct: 0, total_attempted: 0, per_word: [] } });
});

test('falls back to bundled default when letters are empty', () => {
  const { r } = start({ ...FIXTURE_WRITE_CVCS_EN, words: [{ item_key: 'k', word: 'foo', letters: [] }] });
  expect(r.queryByText('1. foo')).toBeNull();
  expect(r.getByText('1. jam')).toBeTruthy();
});

test('Q9: the widest shipped word still fits one card row at 360 dp', () => {
  const shippedSets = [WELA_PLUS_WRITE_CVCS_EN, WELA_PLUS_WRITE_CVCS_XH];
  const n = Math.max(...shippedSets.flatMap(set => set.words.map(word => word.letters.length)));
  // 360dp minus list gutters and card paddings (16dp on each side).
  expect(n * 52 + (n - 1) * 8).toBeLessThanOrEqual(296);
  expect(tokens.space.sm).toBe(8);
  for (const set of shippedSets) {
    const { r } = start(set);
    set.words.flatMap(word => word.letters).forEach((_, position) => expect(tile(r, position)).toHaveStyle({ width: 52 }));
    r.unmount();
  }
});
