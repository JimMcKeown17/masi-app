import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ReadSentencesQuestion } from '..';

describe('ReadSentencesQuestion — intro & active', () => {
  test('Start advances to active and renders all sentence words as pills', () => {
    const { getByText } = render(
      <ReadSentencesQuestion
        language="en"
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
    expect(r.derived.last_attempted_position).toBeNull();
  });
});

describe('ReadSentencesQuestion — Abandon flow', () => {
  test('Abandon picker fires onAbandon + Result.stopped_reason', () => {
    const onComplete = jest.fn();
    const onAbandon = jest.fn();
    const { getByText } = render(
      <ReadSentencesQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
        onAbandon={onAbandon}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Abandon'));
    fireEvent.press(getByText('Child refused'));

    expect(onAbandon).toHaveBeenCalledWith('skipped_child_refused');
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('skipped_child_refused');
  });
});

describe('ReadSentencesQuestion — itemSet override', () => {
  test('falls back to bundled default when override misses item_set_id', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ReadSentencesQuestion
        language="en"
        instructions="."
        itemSet={{ sentences: [{ item_key: 's', words: [] }] }}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('The')).toBeTruthy();
  });

  test('accepts a fully-formed override', () => {
    const onComplete = jest.fn();
    const goodOverride = {
      item_set_id: 'custom@1.0.en',
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
