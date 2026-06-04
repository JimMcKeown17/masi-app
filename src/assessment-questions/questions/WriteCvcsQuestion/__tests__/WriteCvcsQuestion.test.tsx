import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WriteCvcsQuestion } from '..';

describe('WriteCvcsQuestion — intro & active', () => {
  test('Start renders all 12 CVC prompts in a vertical scroller', () => {
    const { getByText, getByTestId } = render(
      <WriteCvcsQuestion
        language="en"
        instructions="Dictate each CVC; tap if child wrote it correctly."
        onComplete={jest.fn()}
      />,
    );
    expect(getByText(/Dictate each CVC/)).toBeTruthy();
    fireEvent.press(getByText('Start'));
    expect(getByText('cat')).toBeTruthy();
    expect(getByText('log')).toBeTruthy();
    const scroller = getByTestId('prompt-scroll');
    expect(scroller.props.horizontal).not.toBe(true);
  });
});

describe('WriteCvcsQuestion — marking', () => {
  test('tap a card marks it correct, second tap clears', () => {
    const { getByText, getByTestId } = render(
      <WriteCvcsQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    const card = getByTestId('card-q9.item_1');
    expect(card.props.accessibilityLabel).toBe('cat, idle');
    fireEvent.press(card);
    expect(getByTestId('card-q9.item_1').props.accessibilityLabel).toBe(
      'cat, correct',
    );
    fireEvent.press(getByTestId('card-q9.item_1'));
    expect(getByTestId('card-q9.item_1').props.accessibilityLabel).toBe(
      'cat, idle',
    );
  });
});

describe('WriteCvcsQuestion — Finish flow', () => {
  test('Finish all-marked emits Result with stopped_reason=completed and was_timed=false', () => {
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <WriteCvcsQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    for (let i = 1; i <= 12; i++) {
      fireEvent.press(getByTestId(`card-q9.item_${i}`));
    }
    fireEvent.press(getByText('Finish'));
    const r = onComplete.mock.calls[0][0];
    expect(r.question_code).toBe('wela_plus_write_cvcs');
    expect(r.stopped_reason).toBe('completed');
    expect(r.derived.total_correct).toBe(12);
    expect(r.derived.was_timed).toBe(false);
  });

  test('Finish with unmarked prompts confirm dialog', () => {
    const { getByText, getByTestId } = render(
      <WriteCvcsQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByTestId('card-q9.item_1'));
    fireEvent.press(getByText('Finish'));
    expect(getByText(/11 items unmarked/i)).toBeTruthy();
  });
});

describe('WriteCvcsQuestion — Abandon flow', () => {
  test('Abandon emits skipped_* stopped_reason and fires onAbandon', () => {
    const onComplete = jest.fn();
    const onAbandon = jest.fn();
    const { getByText } = render(
      <WriteCvcsQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
        onAbandon={onAbandon}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Abandon'));
    fireEvent.press(getByText('Out of time'));
    expect(onAbandon).toHaveBeenCalledWith('skipped_time');
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('skipped_time');
  });
});

describe('WriteCvcsQuestion — itemSet override', () => {
  test('falls back to bundled default when override missing item_set_id', () => {
    const { getByText } = render(
      <WriteCvcsQuestion
        language="en"
        instructions="."
        itemSet={{ prompts: [{ item_key: 'k', word: 'foo' }] }}
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('cat')).toBeTruthy();
  });
});
