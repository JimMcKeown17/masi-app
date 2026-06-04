import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ReadWordsQuestion } from '..';

describe('ReadWordsQuestion — intro phase', () => {
  test('renders instructions + Start; Start transitions to active showing words', () => {
    const { getByText } = render(
      <ReadWordsQuestion
        language="en"
        instructions="Child reads words aloud; tap each correct word."
        durationSec={60}
        onComplete={jest.fn()}
      />,
    );
    expect(getByText(/Child reads words aloud/)).toBeTruthy();
    fireEvent.press(getByText('Start'));
    // Stub words from wela_plus_read_words.en.ts
    expect(getByText('cat')).toBeTruthy();
    expect(getByText('dog')).toBeTruthy();
  });
});

describe('ReadWordsQuestion — marking', () => {
  test('tap a word marks it correct (accessibility flips)', () => {
    const { getByText, getByLabelText } = render(
      <ReadWordsQuestion
        language="en"
        instructions="."
        durationSec={60}
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    expect(getByLabelText('cat, idle')).toBeTruthy();
    fireEvent.press(getByLabelText('cat, idle'));
    expect(getByLabelText('cat, correct')).toBeTruthy();
  });

  test('second tap clears the mark', () => {
    const { getByText, getByLabelText } = render(
      <ReadWordsQuestion
        language="en"
        instructions="."
        durationSec={60}
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('cat, idle'));
    fireEvent.press(getByLabelText('cat, correct'));
    expect(getByLabelText('cat, idle')).toBeTruthy();
  });
});

describe('ReadWordsQuestion — End button finishes early', () => {
  test('End fires onComplete with stopped_reason=ea_ended', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ReadWordsQuestion
        language="en"
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('cat, idle'));
    fireEvent.press(getByLabelText('dog, idle'));
    fireEvent.press(getByText('End'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const r = onComplete.mock.calls[0][0];
    expect(r.stopped_reason).toBe('ea_ended');
    expect(r.derived.total_correct).toBe(2);
    expect(r.derived.was_timed).toBe(true);
    expect(r.derived.last_attempted_position).toBe(1); // highest tapped position
  });
});

describe('ReadWordsQuestion — timer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('timer expiry fires onComplete with stopped_reason=timer', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ReadWordsQuestion
        language="en"
        instructions="."
        durationSec={1}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('cat, idle'));

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('timer');
    expect(onComplete.mock.calls[0][0].derived.last_attempted_position).toBe(0);
  });
});

describe('ReadWordsQuestion — Abandon flow', () => {
  test('Abandon opens picker and selecting fires onAbandon + emits Result', () => {
    const onComplete = jest.fn();
    const onAbandon = jest.fn();
    const { getByText } = render(
      <ReadWordsQuestion
        language="en"
        instructions="."
        durationSec={60}
        onComplete={onComplete}
        onAbandon={onAbandon}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Abandon'));
    expect(getByText(/Why are you abandoning/i)).toBeTruthy();
    fireEvent.press(getByText('Child refused'));

    expect(onAbandon).toHaveBeenCalledWith('skipped_child_refused');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('skipped_child_refused');
  });
});

describe('ReadWordsQuestion — itemSet override validation', () => {
  test('falls back to bundled default when override is missing item_set_id', () => {
    const onComplete = jest.fn();
    const incomplete = { words: [{ item_key: 'k', word: 'foo' }] };
    const { getByText } = render(
      <ReadWordsQuestion
        language="en"
        instructions="."
        durationSec={60}
        itemSet={incomplete}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('cat')).toBeTruthy();
    fireEvent.press(getByText('End'));
    expect(onComplete.mock.calls[0][0].item_set_id).toMatch(
      /^wela_plus_read_words@stub/,
    );
  });

  test('accepts a fully-formed override and renders its words', () => {
    const onComplete = jest.fn();
    const good = {
      item_set_id: 'custom@1.0.en',
      question_version: '1.0',
      words: [
        { item_key: 'w1', word: 'zebra' },
        { item_key: 'w2', word: 'queen' },
      ],
    };
    const { getByText } = render(
      <ReadWordsQuestion
        language="en"
        instructions="."
        durationSec={60}
        itemSet={good}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('zebra')).toBeTruthy();
  });
});

describe('ReadWordsQuestion — markingPolarity', () => {
  test("defaults to 'tap_correct': tap = is_correct true", () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ReadWordsQuestion
        language="en"
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('cat, idle'));
    fireEvent.press(getByText('End'));
    const items = onComplete.mock.calls[0][0].items;
    const catItem = items.find((i: { item_key: string }) => i.item_key === 'cat');
    expect(catItem.is_correct).toBe(true);
  });

  test("'tap_wrong' inverts within the reached boundary; positions past last_attempted_position are is_correct=false (not-reached)", () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ReadWordsQuestion
        language="en"
        instructions="."
        durationSec={60}
        markingPolarity="tap_wrong"
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    // tap_wrong mode: tap cat (position 0) means "child got it wrong";
    // dog/sun/run (1, 2, 3) are untapped. Then tap sun (position 2) as
    // wrong. last_attempted_position becomes 2 (max-tapped).
    fireEvent.press(getByLabelText('cat, idle'));
    fireEvent.press(getByLabelText('sun, idle'));
    fireEvent.press(getByText('End'));
    const items = onComplete.mock.calls[0][0].items;
    const r = onComplete.mock.calls[0][0];
    expect(r.derived.last_attempted_position).toBe(2);

    const cat = items.find((i: { item_key: string }) => i.item_key === 'cat');
    const dog = items.find((i: { item_key: string }) => i.item_key === 'dog');
    const sun = items.find((i: { item_key: string }) => i.item_key === 'sun');
    const run = items.find((i: { item_key: string }) => i.item_key === 'run');
    expect(cat.is_correct).toBe(false); // pos 0, tapped (wrong)
    expect(dog.is_correct).toBe(true); // pos 1, untapped within boundary (correct)
    expect(sun.is_correct).toBe(false); // pos 2, tapped (wrong)
    // pos 3 ('run') is PAST last_attempted_position=2 → NOT reached, must NOT be is_correct=true
    expect(run.is_correct).toBe(false);
  });

  test("'tap_wrong' total_correct excludes not-reached words", () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ReadWordsQuestion
        language="en"
        instructions="."
        durationSec={60}
        markingPolarity="tap_wrong"
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    // Reach position 0 only (cat) and don't tap (so cat is "correct" in tap_wrong).
    fireEvent.press(getByLabelText('cat, idle'));
    fireEvent.press(getByLabelText('cat, correct')); // untap, leaving it idle
    fireEvent.press(getByText('End'));
    const r = onComplete.mock.calls[0][0];
    // last_attempted_position should be 0 (we touched cat), total_attempted=1,
    // total_correct=1 (cat is "correct" in tap_wrong because untapped).
    // The other 19 words must NOT be counted as correct (codex finding #2 fix).
    expect(r.derived.last_attempted_position).toBe(0);
    expect(r.derived.total_attempted).toBe(1);
    expect(r.derived.total_correct).toBe(1);
  });
});
