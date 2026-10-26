import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, within, act } from '@testing-library/react-native';
import { tokens } from '../../../theme/tokens';
import { WriteSentencesFromDictationQuestion } from '..';
import { FIXTURE_WRITE_SENTENCES_DICTATION_EN } from '../../../testFixtures';

function start(itemSet = FIXTURE_WRITE_SENTENCES_DICTATION_EN, extra = {}) {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(<WriteSentencesFromDictationQuestion language="en" itemSet={itemSet}
    instructions="Dictate each sentence." onComplete={onComplete} onItemMarked={onItemMarked} {...extra} />);
  expect(r.getByText('Dictate each sentence.')).toBeTruthy();
  fireEvent.press(r.getByText('Start'));
  return { r, onComplete, onItemMarked };
}
const mark = (r: ReturnType<typeof render>, ...correct: boolean[]) =>
  correct.forEach(value => fireEvent.press(r.getByText(value ? 'Correct' : 'Incorrect')));
const tile = (r: ReturnType<typeof render>, position: number) =>
  within(r.getByTestId('prompt-scroll')).getByTestId(`tile-${position}`);
function end(r: ReturnType<typeof render>) {
  fireEvent.press(r.getByTestId('dictation-end'));
  fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question'));
}

test('Q10: word by word with Sentence 1 · word 2 of 8; per_sentence counts reached words', () => {
  const { r, onComplete } = start();
  expect(r.getByText('1.')).toBeTruthy();
  expect(r.getByText('2.')).toBeTruthy();
  expect(r.getByText('Mom')).toBeTruthy();
  expect(r.getByText('us.')).toBeTruthy();
  expect(r.getByTestId('prompt-scroll').props.horizontal).not.toBe(true);
  expect(tile(r, 0).props.accessibilityLabel).toBe('Mom, current');
  mark(r, true);
  expect(r.getByText('Sentence 1 · word 2 of 8')).toBeTruthy();
  expect(tile(r, 1).props.accessibilityLabel).toBe('got, current');
  mark(r, false);
  end(r);
  const result = onComplete.mock.calls[0][0];
  expect(result).toMatchObject({ stopped_reason: 'ea_ended', derived: { total_correct: 1,
    total_attempted: 2, percent: 50, last_attempted_position: 1, capture_mode: 'sequential', tracks_progress: true } });
  expect(result.derived.per_sentence).toEqual([{ correct: 1, total: 2 }, { correct: 0, total: 0 }]);
  expect(result.items).toHaveLength(15);
  expect(result.items.slice(2).every((item: any) => !item.metadata.reached && !item.is_correct)).toBe(true);
});

test('Q10: items keep their metadata beside reached', () => {
  const { r, onComplete, onItemMarked } = start();
  mark(r, true);
  expect(onItemMarked).toHaveBeenLastCalledWith({ position: 0, item_key: 's1.w1', prompt: 'Mom',
    is_correct: true, metadata: { sentence_index: 0, word_index: 0, reached: true } });
  end(r);
  let position = 0;
  expect(onComplete.mock.calls[0][0].items).toEqual(FIXTURE_WRITE_SENTENCES_DICTATION_EN.sentences.flatMap((sentence, sentence_index) =>
    sentence.words.map(({ item_key, word }, word_index) => {
      const current = position++;
      return { position: current, item_key, prompt: word, is_correct: current === 0,
        metadata: { sentence_index, word_index, reached: current === 0 } };
    })));
});

test('Q10: repeated words keep independent marks through flip and Back', () => {
  const { r, onComplete, onItemMarked } = start({ ...FIXTURE_WRITE_SENTENCES_DICTATION_EN, sentences: [
    { item_key: 'same', words: [{ item_key: 'same', word: 'a' }, { item_key: 'same', word: 'a' }] },
    { item_key: 'same', words: [{ item_key: 'same', word: 'a' }] },
  ] });
  mark(r, true, false, true);
  expect(onComplete).not.toHaveBeenCalled();
  expect(r.getByText('All 3 marked · 2 correct. Tap any word to change it.')).toBeTruthy();
  fireEvent.press(tile(r, 1));
  expect(r.getByText('Word 2 of sentence 1 changed to Correct')).toBeTruthy();
  fireEvent.press(tile(r, 0));
  expect(tile(r, 0).props.accessibilityLabel).toBe('a, incorrect. Double-tap to change to correct');
  expect(tile(r, 1).props.accessibilityLabel).toBe('a, correct. Double-tap to change to incorrect');
  fireEvent.press(r.getByText('Back'));
  expect(tile(r, 2).props.accessibilityLabel).toBe('a, current');
  expect(r.queryByText('Finish')).toBeNull();
  mark(r, false);
  fireEvent.press(r.getByText('Finish'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0].items).toEqual([false, true, false].map((is_correct, position) => ({
    position, item_key: 'same', prompt: 'a', is_correct,
    metadata: { sentence_index: position < 2 ? 0 : 1, word_index: position < 2 ? position : 0, reached: true },
  })));
  expect(onComplete.mock.calls[0][0].derived).toMatchObject({ correction_count: 3,
    total_correct: 1, total_attempted: 3, per_sentence: [{ correct: 1, total: 2 }, { correct: 0, total: 1 }] });
  expect(onItemMarked).toHaveBeenCalledTimes(6);
});

test('Q10: review then Finish emits completed and per_sentence totals; stays untimed', () => {
  jest.useFakeTimers();
  try {
    const { r, onComplete } = start(FIXTURE_WRITE_SENTENCES_DICTATION_EN, { durationSec: 1 });
    act(() => jest.advanceTimersByTime(2000));
    expect(onComplete).not.toHaveBeenCalled();
    for (let i = 0; i < 15; i++) mark(r, true);
    expect(onComplete).not.toHaveBeenCalled();
    expect(r.getByText('All 15 marked · 15 correct. Tap any word to change it.')).toBeTruthy();
    fireEvent.press(r.getByText('Finish'));
    expect(onComplete.mock.calls[0][0]).toMatchObject({ question_code: 'wela_plus_write_sentences_dictation',
      stopped_reason: 'completed', derived: { total_correct: 15, total_attempted: 15, was_timed: false,
        per_sentence: [{ correct: 8, total: 8 }, { correct: 7, total: 7 }] } });
  } finally { jest.useRealTimers(); }
});

test('Q10: one item per word and per_sentence totals across the sentence boundary', () => {
  const { r, onComplete } = start({ ...FIXTURE_WRITE_SENTENCES_DICTATION_EN, sentences: [
    { item_key: 's1', words: ['It', 'drinks', 'milk'].map((word, i) => ({ item_key: `s1.w${i + 1}`, word })) },
    { item_key: 's2', words: ['Mom', 'got'].map((word, i) => ({ item_key: `s2.w${i + 1}`, word })) },
  ] });
  mark(r, false, true, false, true, false);
  fireEvent.press(r.getByText('Finish'));
  const result = onComplete.mock.calls[0][0];
  expect(result.items).toHaveLength(5);
  expect(result.items[1]).toEqual({ position: 1, item_key: 's1.w2', prompt: 'drinks', is_correct: true,
    metadata: { sentence_index: 0, word_index: 1, reached: true } });
  expect(result.derived.total_attempted).toBe(5);
  expect(result.derived.per_sentence).toEqual([{ correct: 1, total: 3 }, { correct: 1, total: 2 }]);
});

test('Q10: End asks in a bottom sheet; Keep marking preserves tiles, accessibility and callbacks', () => {
  const { r, onComplete, onItemMarked } = start();
  mark(r, true, false);
  const markedTile = tile(r, 0);
  const markedLabel = markedTile.props.accessibilityLabel;
  const scroller = r.getByTestId('prompt-scroll');
  fireEvent.press(r.getByTestId('dictation-end'));
  const sheet = r.getByTestId('end-confirmation');
  expect(StyleSheet.flatten(sheet.props.style)).toMatchObject({ ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end', backgroundColor: tokens.color.scrim });
  expect(sheet.props.accessibilityViewIsModal).toBe(true);
  expect(r.getByText('End this question?')).toBeTruthy();
  expect(r.getByText("2 marked. The 13 not marked won't count towards the score.")).toBeTruthy();
  // The engine disables flips under the sheet, replacing the button with a text tile.
  const coveredTile = r.getByTestId('tile-0', { includeHiddenElements: true });
  expect(coveredTile.props.accessibilityLabel).toBe(markedLabel.split('. Double-tap')[0]);
  expect(coveredTile.props.accessibilityRole).toBe('text');
  expect(r.getByTestId('prompt-scroll', { includeHiddenElements: true })).toBe(scroller);
  expect(r.queryByLabelText('Mom, correct. Double-tap to change to incorrect')).toBeNull();
  let hiddenView = scroller.parent;
  while (hiddenView && hiddenView.props.accessibilityElementsHidden === undefined) hiddenView = hiddenView.parent;
  expect(hiddenView?.props.accessibilityElementsHidden).toBe(true);
  expect(hiddenView?.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(hiddenView?.props.pointerEvents).toBe('none');
  expect(onComplete).not.toHaveBeenCalled();
  expect(onItemMarked).toHaveBeenCalledTimes(2);
  fireEvent.press(r.getByText('Keep marking'));
  expect(r.queryByTestId('end-confirmation')).toBeNull();
  expect(tile(r, 0).props.accessibilityLabel).toBe('Mom, correct. Double-tap to change to incorrect');
  expect(tile(r, 1).props.accessibilityLabel).toBe('got, incorrect. Double-tap to change to correct');
  expect(hiddenView?.props.accessibilityElementsHidden).toBe(false);
  expect(hiddenView?.props.importantForAccessibility).toBe('auto');
  expect(hiddenView?.props.pointerEvents).toBe('auto');
  expect(onComplete).not.toHaveBeenCalled();
  expect(onItemMarked).toHaveBeenCalledTimes(2);
  end(r);
  expect(onComplete.mock.calls[0][0].derived).toMatchObject({ total_correct: 1, total_attempted: 2 });
});

test('Q10: Skip emits skipped_* with no items or per_sentence after marking', () => {
  const { r, onComplete } = start();
  mark(r, true);
  fireEvent.press(r.getByText('Skip question'));
  fireEvent.press(r.getByText('Child is tired'));
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'skipped_tired', items: [],
    derived: { total_correct: 0, total_attempted: 0, per_sentence: [] } });
});

test('falls back to bundled default when a sentence has no words', () => {
  const { r } = start({ ...FIXTURE_WRITE_SENTENCES_DICTATION_EN, sentences: [
    { item_key: 's1', words: [] }, { item_key: 's2', words: [{ item_key: 's2.w1', word: 'foo' }] },
  ] });
  expect(r.queryByText('foo')).toBeNull();
  expect(r.getByText('Mom')).toBeTruthy();
});
