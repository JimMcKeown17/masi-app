import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ListenFirstSoundQuestion } from '..';

describe('ListenFirstSoundQuestion — intro and active phases', () => {
  test('renders instructions + Start; Start transitions to active showing prompts', () => {
    const { getByText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="Read each word aloud; child says first sound."
        onComplete={jest.fn()}
      />,
    );

    expect(getByText(/Read each word aloud/)).toBeTruthy();
    fireEvent.press(getByText('Start'));
    expect(getByText('apple')).toBeTruthy();
    expect(getByText('jug')).toBeTruthy();
  });

  test('tap a prompt marks it correct (accessibility flips)', () => {
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    expect(getByLabelText('apple, idle')).toBeTruthy();
    fireEvent.press(getByLabelText('apple, idle'));
    expect(getByLabelText('apple, correct')).toBeTruthy();
  });

  test('second tap clears the mark', () => {
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    fireEvent.press(getByLabelText('apple, idle'));
    fireEvent.press(getByLabelText('apple, correct'));
    expect(getByLabelText('apple, idle')).toBeTruthy();
  });
});

describe('ListenFirstSoundQuestion — Finish flow', () => {
  test('Finish with all unmarked shows a confirmation listing unmarked count', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Finish'));

    expect(getByText(/10 items unmarked/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('Cancel from confirmation returns to active phase without emitting', () => {
    const onComplete = jest.fn();
    const { getByText, queryByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Cancel'));

    expect(queryByText(/items unmarked/i)).toBeNull();
    expect(getByLabelText('apple, idle')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('Yes from confirmation emits Result with stopped_reason=completed', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('apple, idle'));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.stopped_reason).toBe('completed');
    expect(result.derived.total_correct).toBe(1);
    expect(result.items[0].item_key).toBe('q3.first_sound.item_1');
  });

  test('Finish with all marked emits immediately (no confirmation)', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    [
      'apple',
      'ball',
      'cat',
      'dog',
      'egg',
      'fish',
      'goat',
      'hat',
      'ink',
      'jug',
    ].forEach((p) => {
      fireEvent.press(getByLabelText(`${p}, idle`));
    });
    fireEvent.press(getByText('Finish'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].derived.total_correct).toBe(10);
  });
});

describe('ListenFirstSoundQuestion — scrollable list', () => {
  test('active-phase list is wrapped in a ScrollView so all cards remain reachable', () => {
    const { getByText, getByTestId } = render(
      <ListenFirstSoundQuestion
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

describe('ListenFirstSoundQuestion — onItemMarked', () => {
  test('fires per-tap with the item shape', () => {
    const onItemMarked = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
        onItemMarked={onItemMarked}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('apple, idle'));

    expect(onItemMarked).toHaveBeenCalledTimes(1);
    const item = onItemMarked.mock.calls[0][0];
    expect(item.item_key).toBe('q3.first_sound.item_1');
    expect(item.prompt).toBe('apple');
    expect(item.is_correct).toBe(true);
  });
});
