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

describe('ListenFirstSoundQuestion — Abandon flow', () => {
  test('Abandon button opens a reason picker', () => {
    const { getByText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Abandon'));

    expect(getByText(/Why are you abandoning/i)).toBeTruthy();
    expect(getByText('Child refused')).toBeTruthy();
    expect(getByText('Other')).toBeTruthy();
  });

  test('selecting a reason fires onAbandon and emits Result with that stopped_reason', () => {
    const onComplete = jest.fn();
    const onAbandon = jest.fn();
    const { getByText } = render(
      <ListenFirstSoundQuestion
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
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe(
      'skipped_child_refused',
    );
  });

  test('Cancel from abandon-picker returns to active without emitting', () => {
    const onComplete = jest.fn();
    const onAbandon = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
        onAbandon={onAbandon}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Abandon'));
    fireEvent.press(getByText('Cancel'));

    expect(onAbandon).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(getByLabelText('apple, idle')).toBeTruthy();
  });
});

describe('ListenFirstSoundQuestion — itemSet override validation', () => {
  test('falls back to bundled default when override is missing item_set_id', () => {
    const onComplete = jest.fn();
    const incomplete = { prompts: [{ item_key: 'k', prompt: 'pretend' }] };
    const { getByText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        itemSet={incomplete}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    // bundled default appears (not the override's single prompt)
    expect(getByText('apple')).toBeTruthy();
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

    expect(onComplete.mock.calls[0][0].item_set_id).toMatch(/^wela_plus_first_sound@stub/);
  });

  test('accepts a fully-formed override', () => {
    const onComplete = jest.fn();
    const goodOverride = {
      item_set_id: 'custom@1.0.en',
      question_version: '1.0',
      prompts: [
        { item_key: 'k1', prompt: 'zebra' },
        { item_key: 'k2', prompt: 'queen' },
      ],
    };
    const { getByText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        itemSet={goodOverride}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('zebra')).toBeTruthy();
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

    expect(onComplete.mock.calls[0][0].item_set_id).toBe('custom@1.0.en');
  });
});

describe('ListenFirstSoundQuestion — Pattern B is untimed', () => {
  test('was_timed is false in the emitted Result even when host passes durationSec', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('apple, idle'));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

    expect(onComplete.mock.calls[0][0].derived.was_timed).toBe(false);
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
