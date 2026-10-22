import React from 'react';
import { StyleSheet } from 'react-native';
import { tokens } from '../../../theme/tokens';
import { render, fireEvent } from '@testing-library/react-native';
import { WriteSentencesFromDictationQuestion } from '..';
import { FIXTURE_WRITE_SENTENCES_DICTATION_EN } from '../../../testFixtures';

const SET = {
  item_set_id: 'wela_plus_write_sentences_dictation@fixture.en', question_code: 'wela_plus_write_sentences_dictation',
  question_version: 'fixture', language: 'en',
  sentences: [
    { item_key: 's1', words: ['It', 'drinks', 'milk'].map((w, i) => ({ item_key: `s1.w${i + 1}`, word: w })) },
    { item_key: 's2', words: ['Mom', 'got'].map((w, i) => ({ item_key: `s2.w${i + 1}`, word: w })) },
  ],
};

test('one item per word; per_sentence totals; max is word count', () => {
  const onComplete = jest.fn();
  const r = render(<WriteSentencesFromDictationQuestion language="en" itemSet={SET} instructions="." onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByLabelText('drinks, idle'));
  fireEvent.press(r.getByLabelText('Mom, idle'));
  fireEvent.press(r.getByText('Finish'));
  const confirm = r.queryByText('Yes, finish');
  if (confirm) fireEvent.press(confirm);
  const res = onComplete.mock.calls[0][0];
  expect(res.items).toHaveLength(5);
  expect(res.items[1]).toMatchObject({ item_key: 's1.w2', prompt: 'drinks', is_correct: true, metadata: { sentence_index: 0, word_index: 1 } });
  expect(res.derived.total_attempted).toBe(5);
  expect(res.derived.per_sentence).toEqual([{ correct: 1, total: 3 }, { correct: 1, total: 2 }]);
});

describe('WriteSentencesFromDictationQuestion — intro & active', () => {
  test('Start renders two numbered sentence groups in a vertical scroller', () => {
    const { getByText, getByTestId } = render(
      <WriteSentencesFromDictationQuestion
        language="en"
        itemSet={FIXTURE_WRITE_SENTENCES_DICTATION_EN}
        instructions="Dictate each sentence; tap if child wrote it correctly."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('1.')).toBeTruthy();
    expect(getByText('2.')).toBeTruthy();
    expect(getByText('Mom')).toBeTruthy();
    expect(getByText('us.')).toBeTruthy();
    const scroller = getByTestId('prompt-scroll');
    expect(scroller.props.horizontal).not.toBe(true);
  });
});

describe('WriteSentencesFromDictationQuestion — marking', () => {
  test('tap a word marks it correct, second tap clears', () => {
    const { getByText, getByLabelText } = render(
      <WriteSentencesFromDictationQuestion
        language="en"
        itemSet={FIXTURE_WRITE_SENTENCES_DICTATION_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('Mom, idle'));
    expect(getByLabelText('Mom, correct')).toBeTruthy();
    fireEvent.press(getByLabelText('Mom, correct'));
    expect(getByLabelText('Mom, idle')).toBeTruthy();
  });
});

describe('WriteSentencesFromDictationQuestion — Finish & Skip', () => {
  test('Finish with all marked emits Result with stopped_reason=completed', () => {
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <WriteSentencesFromDictationQuestion
        language="en"
        itemSet={FIXTURE_WRITE_SENTENCES_DICTATION_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    FIXTURE_WRITE_SENTENCES_DICTATION_EN.sentences.forEach((sentence) =>
      sentence.words.forEach((word) =>
        fireEvent.press(getByTestId(`word-${word.item_key}`)),
      ),
    );
    fireEvent.press(getByText('Finish'));
    const r = onComplete.mock.calls[0][0];
    expect(r.question_code).toBe('wela_plus_write_sentences_dictation');
    expect(r.derived.total_correct).toBe(15);
    expect(r.derived.total_attempted).toBe(15);
    expect(r.derived.per_sentence).toEqual([
      { correct: 8, total: 8 },
      { correct: 7, total: 7 },
    ]);
    expect(r.derived.was_timed).toBe(false);
  });

  test('Finish counts unmarked words; Cancel preserves marks; Yes finishes', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <WriteSentencesFromDictationQuestion
        language="en"
        itemSet={FIXTURE_WRITE_SENTENCES_DICTATION_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('Mom, idle'));
    fireEvent.press(getByText('Finish'));
    expect(getByText(/14 items unmarked/i)).toBeTruthy();
    fireEvent.press(getByText('Cancel'));
    expect(getByLabelText('Mom, correct')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));
    expect(onComplete.mock.calls[0][0].derived.total_correct).toBe(1);
    expect(onComplete.mock.calls[0][0].derived.total_attempted).toBe(15);
  });

  test('Skip picker emits skipped_* stopped_reason', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <WriteSentencesFromDictationQuestion
        language="en"
        itemSet={FIXTURE_WRITE_SENTENCES_DICTATION_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Skip question'));
    fireEvent.press(getByText('Child tired'));
    const result = onComplete.mock.calls[0][0];
    expect(result.stopped_reason).toBe('skipped_tired');
    expect(result.items).toEqual([]);
    expect(result.derived.per_sentence).toEqual([]);
  });
});

describe('WriteSentencesFromDictationQuestion — itemSet override', () => {
  test('falls back to bundled default when a sentence has no words', () => {
    const { getByText, queryByText } = render(
      <WriteSentencesFromDictationQuestion
        language="en"
        instructions="."
        itemSet={{
          item_set_id: 'bad@1.en',
          question_code: 'bad',
          language: 'en',
          question_version: '1',
          sentences: [
            { item_key: 's1', words: [] },
            {
              item_key: 's2',
              words: [{ item_key: 's2.w1', word: 'foo' }],
            },
          ],
        }}
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(queryByText('foo')).toBeNull();
    expect(getByText('Mom')).toBeTruthy();
  });
});

test('Finish with unmarked items asks in a bottom sheet over the marked tiles', () => {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(
    <WriteSentencesFromDictationQuestion language="en" itemSet={FIXTURE_WRITE_SENTENCES_DICTATION_EN}
      instructions="." onComplete={onComplete} onItemMarked={onItemMarked} />,
  );
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByLabelText('Mom, idle'));
  fireEvent.press(r.getByLabelText('us., idle'));
  const markedTile = r.getByTestId('word-s1.w1');
  const scroller = r.getByTestId('prompt-scroll');
  fireEvent.press(r.getByText('Finish'));
  const sheet = r.getByTestId('confirm-finish');
  expect(StyleSheet.flatten(sheet.props.style)).toMatchObject({
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: tokens.color.scrim,
  });
  expect(sheet.props.accessibilityViewIsModal).toBe(true);
  expect(r.getByText('13 items unmarked — finish anyway?')).toBeTruthy();
  expect(r.getByTestId('word-s1.w1', { includeHiddenElements: true })).toBe(markedTile);
  expect(r.getByTestId('prompt-scroll', { includeHiddenElements: true })).toBe(scroller);
  expect(r.queryByLabelText('Mom, correct')).toBeNull();
  let hiddenView = scroller.parent;
  while (hiddenView && hiddenView.props.accessibilityElementsHidden === undefined) {
    hiddenView = hiddenView.parent;
  }
  expect(hiddenView?.props.accessibilityElementsHidden).toBe(true);
  expect(hiddenView?.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(hiddenView?.props.pointerEvents).toBe('none');
  expect(onComplete).not.toHaveBeenCalled();
  expect(onItemMarked).toHaveBeenCalledTimes(2);
  fireEvent.press(r.getByText('Cancel'));
  expect(r.queryByText(/items unmarked/)).toBeNull();
  expect(r.queryByTestId('confirm-finish')).toBeNull();
  expect(r.getByLabelText('Mom, correct')).toBeTruthy();
  expect(r.getByLabelText('us., correct')).toBeTruthy();
  expect(hiddenView?.props.accessibilityElementsHidden).toBe(false);
  expect(hiddenView?.props.importantForAccessibility).toBe('auto');
  expect(hiddenView?.props.pointerEvents).toBe('auto');
  expect(onComplete).not.toHaveBeenCalled();
  expect(onItemMarked).toHaveBeenCalledTimes(2);
});


test('repeated item keys keep positional tile identity and independent marks', () => {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(
    <WriteSentencesFromDictationQuestion language="en" instructions="." onComplete={onComplete} onItemMarked={onItemMarked}
      itemSet={{ ...FIXTURE_WRITE_SENTENCES_DICTATION_EN, sentences: [
        { item_key: 'same', words: [{ item_key: 'same', word: 'first' }] },
        { item_key: 'same', words: [{ item_key: 'same', word: 'second' }] },
      ] }} />,
  );
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByLabelText('second, idle'));
  expect(r.getByLabelText('first, idle')).toBeTruthy();
  expect(r.getByLabelText('second, correct')).toBeTruthy();
  expect(onItemMarked).toHaveBeenCalledTimes(1);
  expect(onItemMarked).toHaveBeenLastCalledWith({ position: 1, item_key: 'same', prompt: 'second', is_correct: true,
    metadata: { sentence_index: 1, word_index: 0 } });
  fireEvent.press(r.getByText('Finish'));
  fireEvent.press(r.getByText('Yes, finish'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0].items).toEqual([
    { position: 0, item_key: 'same', prompt: 'first', is_correct: false,
      metadata: { sentence_index: 0, word_index: 0 } },
    { position: 1, item_key: 'same', prompt: 'second', is_correct: true,
      metadata: { sentence_index: 1, word_index: 0 } },
  ]);
});
