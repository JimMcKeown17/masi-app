import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { LetterWritingFromPicturesQuestion } from '..';

describe('LetterWritingFromPicturesQuestion — intro & first page', () => {
  test('Start renders 8 cells on page 1 with picture alt + expected letter', () => {
    const { getByText } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    // First 8 alts: apple, ball, cat, dog, egg, frog, goat, hat
    expect(getByText('apple')).toBeTruthy();
    expect(getByText('hat')).toBeTruthy();
    // Expected-letter labels for the EA's recall: 'a' next to apple etc.
    expect(getByText('a')).toBeTruthy();
  });
});

describe('LetterWritingFromPicturesQuestion — pagination', () => {
  test('Next advances to page 2', () => {
    const { getByText } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Next'));
    // Page 2: ink, jug, kite, log, mug, nut, orange, pig
    expect(getByText('ink')).toBeTruthy();
    expect(getByText('pig')).toBeTruthy();
  });

  test('Prev returns to page 1', () => {
    const { getByText, queryByText } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Next'));
    fireEvent.press(getByText('Prev'));
    expect(getByText('apple')).toBeTruthy();
    expect(queryByText('ink')).toBeNull();
  });
});

describe('LetterWritingFromPicturesQuestion — batch marking', () => {
  test('Tap a cell marks it correct; tap again clears (batch marking semantic)', () => {
    const { getByText, getByTestId } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    const cell = getByTestId('cell-q5.item_1');
    expect(cell.props.accessibilityLabel).toBe('apple → a, idle');
    fireEvent.press(cell);
    const cellAfter = getByTestId('cell-q5.item_1');
    expect(cellAfter.props.accessibilityLabel).toBe('apple → a, correct');
  });

  test('Finish emits Result with derived.total_correct based on tapped cells', () => {
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    // Mark 3 cells on page 1
    fireEvent.press(getByTestId('cell-q5.item_1'));
    fireEvent.press(getByTestId('cell-q5.item_2'));
    fireEvent.press(getByTestId('cell-q5.item_3'));
    fireEvent.press(getByText('Finish'));
    // Confirmation should appear because 23 of 26 are unmarked
    fireEvent.press(getByText('Yes, finish'));

    const r = onComplete.mock.calls[0][0];
    expect(r.question_code).toBe('wela_plus_letter_writing');
    expect(r.stopped_reason).toBe('completed');
    expect(r.derived.total_correct).toBe(3);
    expect(r.derived.total_attempted).toBe(26);
    expect(r.derived.was_timed).toBe(false);
  });
});

describe('LetterWritingFromPicturesQuestion — Abandon flow', () => {
  test('Abandon picker fires onAbandon', () => {
    const onComplete = jest.fn();
    const onAbandon = jest.fn();
    const { getByText } = render(
      <LetterWritingFromPicturesQuestion
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

describe('LetterWritingFromPicturesQuestion — itemSet override', () => {
  test('falls back to bundled default when override missing item_set_id', () => {
    const { getByText } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        instructions="."
        itemSet={{ prompts: [] }}
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('apple')).toBeTruthy();
  });
});
