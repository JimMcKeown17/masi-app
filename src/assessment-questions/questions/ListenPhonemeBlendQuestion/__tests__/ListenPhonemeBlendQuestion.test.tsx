import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ListenPhonemeBlendQuestion } from '..';

describe('ListenPhonemeBlendQuestion — intro and active phases', () => {
  test('renders instructions + Start; Start transitions to active showing segmented prompts', () => {
    const { getByText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        instructions="Say each segmented prompt; child blends."
        onComplete={jest.fn()}
      />,
    );

    expect(getByText(/segmented prompt/i)).toBeTruthy();
    fireEvent.press(getByText('Start'));
    expect(getByText('s-u-n')).toBeTruthy();
    expect(getByText('m-a-p')).toBeTruthy();
  });

  test('renders the word gloss below every segmented prompt (always visible)', () => {
    const { getByText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    expect(getByText('(sun)')).toBeTruthy();
    expect(getByText('(cat)')).toBeTruthy();
  });

  test('tap a prompt marks it correct (accessibility flips); second tap clears', () => {
    const { getByText, getByLabelText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    expect(getByLabelText('s-u-n, idle')).toBeTruthy();
    fireEvent.press(getByLabelText('s-u-n, idle'));
    expect(getByLabelText('s-u-n, correct')).toBeTruthy();
    fireEvent.press(getByLabelText('s-u-n, correct'));
    expect(getByLabelText('s-u-n, idle')).toBeTruthy();
  });
});

describe('ListenPhonemeBlendQuestion — Finish flow', () => {
  test('Finish with all 8 unmarked shows a confirmation listing the count', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Finish'));

    expect(getByText(/8 items unmarked/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('Yes emits a Result with stopped_reason=completed and question_code=wela_plus_phoneme_blend', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('s-u-n, idle'));
    fireEvent.press(getByLabelText('c-a-t, idle'));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.stopped_reason).toBe('completed');
    expect(result.question_code).toBe('wela_plus_phoneme_blend');
    expect(result.derived.total_correct).toBe(2);
    expect(result.items[0].item_key).toBe('q4.phoneme_blend.item_1');
  });
});

describe('ListenPhonemeBlendQuestion — scrollable list', () => {
  test('active-phase list is wrapped in a ScrollView so all cards remain reachable', () => {
    const { getByText, getByTestId } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    const scroller = getByTestId('prompt-scroll');
    expect(scroller.props.horizontal).not.toBe(true);
  });
});

describe('ListenPhonemeBlendQuestion — onItemMarked', () => {
  test('fires per-tap with the segmented form as prompt and the stable item_key', () => {
    const onItemMarked = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
        onItemMarked={onItemMarked}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('s-u-n, idle'));

    expect(onItemMarked).toHaveBeenCalledTimes(1);
    const item = onItemMarked.mock.calls[0][0];
    expect(item.item_key).toBe('q4.phoneme_blend.item_1');
    expect(item.prompt).toBe('s-u-n');
    expect(item.is_correct).toBe(true);
  });
});
