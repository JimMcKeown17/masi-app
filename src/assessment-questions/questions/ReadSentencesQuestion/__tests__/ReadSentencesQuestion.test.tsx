import React from 'react';
import { StyleSheet } from 'react-native';
import { tokens } from '../../../theme/tokens';
import { render, fireEvent } from '@testing-library/react-native';
import { ReadSentencesQuestion } from '..';
import { FIXTURE_READ_SENTENCES_EN } from '../../../testFixtures';

test('Finish reports every word attempted', () => {
  const onComplete = jest.fn();
  const r = render(
    <ReadSentencesQuestion
      language="en"
      itemSet={FIXTURE_READ_SENTENCES_EN}
      instructions="."
      onComplete={onComplete}
    />,
  );
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByText('Finish'));
  const confirm = r.queryByText('Yes, finish');
  if (confirm) fireEvent.press(confirm);
  const res = onComplete.mock.calls[0][0];
  expect(res.derived.tracks_progress).toBe(true);
  expect(res.derived.last_attempted_position).toBe(res.items.length - 1);
  expect(res.derived.total_attempted).toBe(res.items.length);
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
  test('tap a word marks it correct; second tap clears', () => {
    const { getByText, getByLabelText } = render(
      <ReadSentencesQuestion
        language="en"
        itemSet={FIXTURE_READ_SENTENCES_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('The, idle'));
    expect(getByLabelText('The, correct')).toBeTruthy();
    fireEvent.press(getByLabelText('The, correct'));
    expect(getByLabelText('The, idle')).toBeTruthy();
  });
});

describe('ReadSentencesQuestion — Finish flow and per-sentence percent', () => {
  test('Finish with all marked → derived.per_sentence_percent reflects 100% each', () => {
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <ReadSentencesQuestion
        language="en"
        itemSet={FIXTURE_READ_SENTENCES_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    // s1: 4 words, all correct
    ['s1.w1', 's1.w2', 's1.w3', 's1.w4'].forEach((k) =>
      fireEvent.press(getByTestId(`pill-${k}`)),
    );
    // s2: 5 words, all correct
    ['s2.w1', 's2.w2', 's2.w3', 's2.w4', 's2.w5'].forEach((k) =>
      fireEvent.press(getByTestId(`pill-${k}`)),
    );
    // s3: 6 words, all correct
    ['s3.w1', 's3.w2', 's3.w3', 's3.w4', 's3.w5', 's3.w6'].forEach((k) =>
      fireEvent.press(getByTestId(`pill-${k}`)),
    );
    // s4: 5 words, mark 3 of 5 → 60%
    ['s4.w1', 's4.w2', 's4.w3'].forEach((k) =>
      fireEvent.press(getByTestId(`pill-${k}`)),
    );

    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish')); // 2 items unmarked confirmation

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
    const { getByText, getByTestId } = render(
      <ReadSentencesQuestion
        language="en"
        instructions="."
        itemSet={goodOverride}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('zebra')).toBeTruthy();
    fireEvent.press(getByTestId('pill-sA.w1'));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));
    expect(onComplete.mock.calls[0][0].item_set_id).toBe('custom@1.0.en');
    expect(onComplete.mock.calls[0][0].derived.per_sentence_percent).toEqual([50]);
  });
});


test('Finish with unmarked items asks in a bottom sheet over the marked tiles', () => {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(
    <ReadSentencesQuestion language="en" itemSet={FIXTURE_READ_SENTENCES_EN}
      instructions="." onComplete={onComplete} onItemMarked={onItemMarked} />,
  );
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByLabelText('The, idle'));
  fireEvent.press(r.getByLabelText('tree., idle'));
  const markedTile = r.getByTestId('pill-s1.w1');
  const scroller = r.getByTestId('sentence-scroll');
  fireEvent.press(r.getByText('Finish'));
  const sheet = r.getByTestId('confirm-finish');
  expect(StyleSheet.flatten(sheet.props.style)).toMatchObject({
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: tokens.color.scrim,
  });
  expect(sheet.props.accessibilityViewIsModal).toBe(true);
  expect(r.getByText('18 items unmarked — finish anyway?')).toBeTruthy();
  expect(r.getByTestId('pill-s1.w1', { includeHiddenElements: true })).toBe(markedTile);
  expect(r.getByTestId('sentence-scroll', { includeHiddenElements: true })).toBe(scroller);
  expect(r.queryByLabelText('The, correct')).toBeNull();
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
  expect(r.getByLabelText('The, correct')).toBeTruthy();
  expect(r.getByLabelText('tree., correct')).toBeTruthy();
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
    <ReadSentencesQuestion language="en" instructions="." onComplete={onComplete} onItemMarked={onItemMarked}
      itemSet={{ ...FIXTURE_READ_SENTENCES_EN, sentences: [
        { item_key: 'same', words: [{ item_key: 'same', word: 'first' }] },
        { item_key: 'same', words: [{ item_key: 'same', word: 'second' }] },
      ] }} />,
  );
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByLabelText('second, idle'));
  expect(r.getByLabelText('first, idle')).toBeTruthy();
  expect(r.getByLabelText('second, correct')).toBeTruthy();
  expect(onItemMarked).toHaveBeenCalledTimes(1);
  expect(onItemMarked).toHaveBeenLastCalledWith({ position: 1, item_key: 'same', prompt: 'second', is_correct: true });
  fireEvent.press(r.getByText('Finish'));
  fireEvent.press(r.getByText('Yes, finish'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0].items).toEqual([
    { position: 0, item_key: 'same', prompt: 'first', is_correct: false },
    { position: 1, item_key: 'same', prompt: 'second', is_correct: true },
  ]);
});
