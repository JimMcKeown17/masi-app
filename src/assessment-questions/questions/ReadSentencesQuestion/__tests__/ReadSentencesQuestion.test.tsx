import React from 'react';
import { StyleSheet } from 'react-native';
import { tokens } from '../../../theme/tokens';
import { render, fireEvent, within } from '@testing-library/react-native';
import { ReadSentencesQuestion } from '..';
import { FIXTURE_READ_SENTENCES_EN } from '../../../testFixtures';

test('End reports only the reached prefix attempted', () => {
  const onComplete = jest.fn();
  const r = render(<ReadSentencesQuestion language="en" itemSet={FIXTURE_READ_SENTENCES_EN} onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(r.getByTestId('sentences-end'));
  fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question'));
  const res = onComplete.mock.calls[0][0];
  expect(res.derived).toMatchObject({ tracks_progress: true, last_attempted_position: 0, total_attempted: 1 });
  expect(res.items.slice(1).every((item: any) => !item.metadata.reached && !item.is_correct)).toBe(true);
});

describe('ReadSentencesQuestion — intro & active', () => {
  test('Start advances to active and renders all sentence words as pills', () => {
    const { getByText } = render(
      <ReadSentencesQuestion
        language="en"
        itemSet={FIXTURE_READ_SENTENCES_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('The')).toBeTruthy();
    expect(getByText('tree.')).toBeTruthy();
    expect(getByText('sun.')).toBeTruthy();
  });

  test('sentences are visually grouped (each sentence has a testID container)', () => {
    const { getByText, getByTestId } = render(
      <ReadSentencesQuestion
        language="en"
        itemSet={FIXTURE_READ_SENTENCES_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByTestId('sentence-row-s1')).toBeTruthy();
    expect(getByTestId('sentence-row-s2')).toBeTruthy();
  });
});

describe('ReadSentencesQuestion — marking', () => {
  test('Correct marks the current word; tapping flips its decision', () => {
    const { getByText, getByLabelText } = render(
      <ReadSentencesQuestion
        language="en"
        itemSet={FIXTURE_READ_SENTENCES_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Correct'));
    expect(getByLabelText('The, correct. Double-tap to change to incorrect')).toBeTruthy();
    fireEvent.press(getByLabelText('The, correct. Double-tap to change to incorrect'));
    expect(getByLabelText('The, incorrect. Double-tap to change to correct')).toBeTruthy();
  });
});

describe('ReadSentencesQuestion — Finish flow and per-sentence percent', () => {
  test('Finish after review reports per-sentence percentages from all decisions', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ReadSentencesQuestion
        language="en"
        itemSet={FIXTURE_READ_SENTENCES_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    // All words in the first three sentences and the first three in sentence four are correct.
    for (let position = 0; position < 18; position++) fireEvent.press(getByText('Correct'));

    fireEvent.press(getByText('Incorrect'));
    fireEvent.press(getByText('Incorrect'));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(getByText('Finish'));

    const r = onComplete.mock.calls[0][0];
    expect(r.stopped_reason).toBe('completed');
    expect(r.derived.per_sentence_percent).toEqual([100, 100, 100, 60]);
    expect(r.derived.was_timed).toBe(false);
    expect(r.derived.last_attempted_position).toBe(r.items.length - 1);
    expect(r.derived.tracks_progress).toBe(true);
  });
});

describe('ReadSentencesQuestion — Skip flow', () => {
  test('Skip picker emits Result.stopped_reason', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ReadSentencesQuestion
        language="en"
        itemSet={FIXTURE_READ_SENTENCES_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Skip question'));
    fireEvent.press(getByText('Child refused'));

    const result = onComplete.mock.calls[0][0];
    expect(result.stopped_reason).toBe('skipped_child_refused');
    expect(result.items).toEqual([]);
    expect(result.derived.last_attempted_position).toBeNull();
    expect(result.derived.tracks_progress).toBe(false);
    expect(result.derived.per_sentence_percent).toEqual([]);
  });
});

describe('ReadSentencesQuestion — itemSet override', () => {
  test('falls back to bundled default when override misses item_set_id', () => {
    const onComplete = jest.fn();
    const { getByText, queryByText } = render(
      <ReadSentencesQuestion
        language="en"
        instructions="."
        itemSet={{
          sentences: [
            {
              item_key: 's',
              words: [{ item_key: 's.w1', word: 'fixture-only-invalid-word' }],
            },
          ],
        }}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(queryByText('fixture-only-invalid-word')).toBeNull();
  });

  test('accepts a fully-formed override', () => {
    const onComplete = jest.fn();
    const goodOverride = {
      item_set_id: 'custom@1.0.en',
      question_code: 'custom',
      language: 'en',
      question_version: '1.0',
      sentences: [
        {
          item_key: 'sA',
          words: [
            { item_key: 'sA.w1', word: 'zebra' },
            { item_key: 'sA.w2', word: 'queen' },
          ],
        },
      ],
    };
    const { getByText } = render(
      <ReadSentencesQuestion
        language="en"
        instructions="."
        itemSet={goodOverride}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('zebra')).toBeTruthy();
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('Incorrect'));
    fireEvent.press(getByText('Finish'));
    expect(onComplete.mock.calls[0][0].item_set_id).toBe('custom@1.0.en');
    expect(onComplete.mock.calls[0][0].derived.per_sentence_percent).toEqual([50]);
  });
});


test('End asks in a bottom sheet over the marked tiles; Keep marking restores them', () => {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(
    <ReadSentencesQuestion language="en" itemSet={FIXTURE_READ_SENTENCES_EN}
      instructions="." onComplete={onComplete} onItemMarked={onItemMarked} />,
  );
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(r.getByText('Correct'));
  const scroller = r.getByTestId('sentence-scroll');
  fireEvent.press(r.getByTestId('sentences-end'));
  const sheet = r.getByTestId('end-confirmation');
  expect(StyleSheet.flatten(sheet.props.style)).toMatchObject({
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: tokens.color.scrim,
  });
  expect(sheet.props.accessibilityViewIsModal).toBe(true);
  expect(r.getByText("2 marked. The 18 not marked won't count towards the score.")).toBeTruthy();
  expect(r.getByTestId('tile-0', { includeHiddenElements: true })).toHaveStyle({ backgroundColor: tokens.color.marked });
  expect(r.getByTestId('sentence-scroll', { includeHiddenElements: true })).toBe(scroller);
  expect(r.queryByLabelText('The, correct. Double-tap to change to incorrect')).toBeNull();
  let hiddenView = scroller.parent;
  while (hiddenView && hiddenView.props.accessibilityElementsHidden === undefined) {
    hiddenView = hiddenView.parent;
  }
  expect(hiddenView?.props.accessibilityElementsHidden).toBe(true);
  expect(hiddenView?.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(hiddenView?.props.pointerEvents).toBe('none');
  expect(onComplete).not.toHaveBeenCalled();
  expect(onItemMarked).toHaveBeenCalledTimes(2);
  fireEvent.press(r.getByText('Keep marking'));
  expect(r.queryByText(/not marked won/)).toBeNull();
  expect(r.queryByTestId('end-confirmation')).toBeNull();
  expect(r.getByLabelText('The, correct. Double-tap to change to incorrect')).toBeTruthy();
  expect(r.getByLabelText('cat, correct. Double-tap to change to incorrect')).toBeTruthy();
  expect(hiddenView?.props.accessibilityElementsHidden).toBe(false);
  expect(hiddenView?.props.importantForAccessibility).toBe('auto');
  expect(hiddenView?.props.pointerEvents).toBe('auto');
  expect(onComplete).not.toHaveBeenCalled();
  expect(onItemMarked).toHaveBeenCalledTimes(2);
});


test('repeated item keys keep positional tile identity and independent marks', () => {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(<ReadSentencesQuestion language="en" onComplete={onComplete} onItemMarked={onItemMarked}
    itemSet={{ ...FIXTURE_READ_SENTENCES_EN, sentences: [
      { item_key: 'same', words: [{ item_key: 'same', word: 'first' }] },
      { item_key: 'same', words: [{ item_key: 'same', word: 'second' }] },
    ] }} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByText('Incorrect'));
  fireEvent.press(r.getByText('Correct'));
  expect(r.getByLabelText('first, incorrect. Double-tap to change to correct')).toBeTruthy();
  expect(r.getByLabelText('second, correct. Double-tap to change to incorrect')).toBeTruthy();
  expect(onItemMarked).toHaveBeenCalledTimes(2);
  expect(onItemMarked).toHaveBeenLastCalledWith({ position: 1, item_key: 'same', prompt: 'second', is_correct: true,
    metadata: { sentence_index: 1, word_index: 0, reached: true } });
  fireEvent.press(r.getByText('Finish'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0].items).toEqual([
    { position: 0, item_key: 'same', prompt: 'first', is_correct: false, metadata: { sentence_index: 0, word_index: 0, reached: true } },
    { position: 1, item_key: 'same', prompt: 'second', is_correct: true, metadata: { sentence_index: 1, word_index: 0, reached: true } },
  ]);
});

test('Q7: per_sentence_percent counts reached words and is null for a sentence never reached', () => {
  const onComplete = jest.fn();
  const r = render(<ReadSentencesQuestion language="en" itemSet={FIXTURE_READ_SENTENCES_EN} onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(r.getByText('Incorrect'));
  fireEvent.press(r.getByTestId('sentences-end'));
  fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question'));
  expect(onComplete.mock.calls[0][0].derived.per_sentence_percent).toEqual([50, null, null, null]);
  expect(onComplete.mock.calls[0][0].items[1].metadata).toEqual({ sentence_index: 0, word_index: 1, reached: true });
});
