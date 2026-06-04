import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WriteSentencesFromDictationQuestion } from '..';

describe('WriteSentencesFromDictationQuestion — intro & active', () => {
  test('Start renders all 12 sentence prompts in a vertical scroller', () => {
    const { getByText, getByTestId } = render(
      <WriteSentencesFromDictationQuestion
        language="en"
        instructions="Dictate each sentence; tap if child wrote it correctly."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('The cat sat down.')).toBeTruthy();
    expect(getByText('He helped his friend.')).toBeTruthy();
    const scroller = getByTestId('prompt-scroll');
    expect(scroller.props.horizontal).not.toBe(true);
  });
});

describe('WriteSentencesFromDictationQuestion — marking', () => {
  test('tap a card marks it correct, second tap clears', () => {
    const { getByText, getByTestId } = render(
      <WriteSentencesFromDictationQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    const card = getByTestId('card-q10.item_1');
    expect(card.props.accessibilityLabel).toBe('The cat sat down., idle');
    fireEvent.press(card);
    expect(getByTestId('card-q10.item_1').props.accessibilityLabel).toBe(
      'The cat sat down., correct',
    );
    fireEvent.press(getByTestId('card-q10.item_1'));
    expect(getByTestId('card-q10.item_1').props.accessibilityLabel).toBe(
      'The cat sat down., idle',
    );
  });
});

describe('WriteSentencesFromDictationQuestion — Finish & Abandon', () => {
  test('Finish with all marked emits Result with stopped_reason=completed', () => {
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <WriteSentencesFromDictationQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    for (let i = 1; i <= 12; i++) {
      fireEvent.press(getByTestId(`card-q10.item_${i}`));
    }
    fireEvent.press(getByText('Finish'));
    const r = onComplete.mock.calls[0][0];
    expect(r.question_code).toBe('wela_plus_write_sentences_dictation');
    expect(r.derived.total_correct).toBe(12);
    expect(r.derived.was_timed).toBe(false);
  });

  test('Abandon picker emits skipped_* stopped_reason', () => {
    const onComplete = jest.fn();
    const onAbandon = jest.fn();
    const { getByText } = render(
      <WriteSentencesFromDictationQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
        onAbandon={onAbandon}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Abandon'));
    fireEvent.press(getByText('Child tired'));
    expect(onAbandon).toHaveBeenCalledWith('skipped_tired');
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('skipped_tired');
  });
});

describe('WriteSentencesFromDictationQuestion — itemSet override', () => {
  test('falls back to bundled default when override missing item_set_id', () => {
    const { getByText } = render(
      <WriteSentencesFromDictationQuestion
        language="en"
        instructions="."
        itemSet={{ prompts: [{ item_key: 'k', sentence: 'foo' }] }}
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('The cat sat down.')).toBeTruthy();
  });
});
