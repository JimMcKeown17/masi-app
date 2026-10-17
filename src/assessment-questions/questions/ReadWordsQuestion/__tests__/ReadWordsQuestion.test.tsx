import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ReadWordsQuestion } from '..';
import { FIXTURE_READ_WORDS_EN } from '../../../testFixtures';

const SET = {
  item_set_id: 'wela_plus_read_words@fixture.en', question_code: 'wela_plus_read_words',
  question_version: 'fixture', language: 'en', row_lengths: [3, 3],
  words: ['there', 'how', 'there', 'how', 'come', 'with'].map((w) => ({ item_key: w, word: w })),
};

test('renders rows from row_lengths', () => {
  const r = render(<ReadWordsQuestion language="en" itemSet={SET} instructions="." onComplete={jest.fn()} />);
  fireEvent.press(r.getByText('Start'));
  expect(r.getAllByTestId(/^word-row-/)).toHaveLength(2);
});

test('duplicate words are marked independently', () => {
  const onComplete = jest.fn();
  const r = render(<ReadWordsQuestion language="en" itemSet={SET} instructions="." onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getAllByLabelText('there, idle')[1]); // the second "there", position 2
  expect(r.getAllByLabelText('there, idle')).toHaveLength(1);
  fireEvent.press(r.getByText('End'));
  fireEvent.press(r.getByText('Reached the end'));
  const items = onComplete.mock.calls[0][0].items;
  expect(items[0].is_correct).toBe(false);
  expect(items[2].is_correct).toBe(true);
});

test('wrong answers after the last correct still count as attempted (marker, not taps)', () => {
  const onComplete = jest.fn();
  const r = render(<ReadWordsQuestion language="en" itemSet={SET} instructions="." onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getAllByLabelText('there, idle')[0]); // correct at 0
  fireEvent.press(r.getByText('End'));
  fireEvent.press(r.getByLabelText('come, item 5'));     // the child stopped after 5 words
  fireEvent.press(r.getByText('Confirm'));
  const d = onComplete.mock.calls[0][0].derived;
  expect(d.total_attempted).toBe(5);
  expect(d.total_correct).toBe(1);
  expect(d.percent).toBe(20);
});

describe('ReadWordsQuestion — intro phase', () => {
  test('renders instructions + Start; Start transitions to active showing words', () => {
    const { getByText } = render(
      <ReadWordsQuestion
        language="en"
        itemSet={FIXTURE_READ_WORDS_EN}
        instructions="Child reads words aloud; tap each correct word."
        durationSec={60}
        onComplete={jest.fn()}
      />,
    );
    expect(getByText(/Child reads words aloud/)).toBeTruthy();
    fireEvent.press(getByText('Start'));
    expect(getByText('cat')).toBeTruthy();
    expect(getByText('dog')).toBeTruthy();
  });
});

describe('ReadWordsQuestion — marking', () => {
  test('tap a word marks it correct (accessibility flips)', () => {
    const { getByText, getByLabelText } = render(
      <ReadWordsQuestion
        language="en"
        itemSet={FIXTURE_READ_WORDS_EN}
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
        itemSet={FIXTURE_READ_WORDS_EN}
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

describe('ReadWordsQuestion — End marker finishes early', () => {
  test('End then marker confirmation fires onComplete with stopped_reason=ea_ended', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ReadWordsQuestion
        language="en"
        itemSet={FIXTURE_READ_WORDS_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('cat, idle'));
    fireEvent.press(getByLabelText('dog, idle'));
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Reached the end'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const r = onComplete.mock.calls[0][0];
    expect(r.stopped_reason).toBe('ea_ended');
    expect(r.derived.total_correct).toBe(2);
    expect(r.derived.was_timed).toBe(true);
    expect(r.derived.last_attempted_position).toBe(19);
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
        itemSet={FIXTURE_READ_WORDS_EN}
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
    fireEvent.press(getByText('Reached the end'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('timer');
    expect(onComplete.mock.calls[0][0].derived.last_attempted_position).toBe(19);
  });
});

describe('ReadWordsQuestion — Skip flow', () => {
  test('Skip question opens picker and selecting emits Result', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ReadWordsQuestion
        language="en"
        itemSet={FIXTURE_READ_WORDS_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Skip question'));
    expect(getByText(/Why are you skipping this question/i)).toBeTruthy();
    fireEvent.press(getByText('Child refused'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('skipped_child_refused');
  });
});

describe('ReadWordsQuestion — itemSet override validation', () => {
  test('falls back to bundled default when override is missing item_set_id', () => {
    const onComplete = jest.fn();
    const incomplete = { words: [{ item_key: 'k', word: 'foo' }] };
    const { getByText, queryByText } = render(
      <ReadWordsQuestion
        language="en"
        instructions="."
        durationSec={60}
        itemSet={incomplete}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(queryByText('foo')).toBeNull();
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Reached the end'));
    expect(onComplete.mock.calls[0][0].item_set_id).toBeDefined();
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
        itemSet={FIXTURE_READ_WORDS_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('cat, idle'));
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Reached the end'));
    const items = onComplete.mock.calls[0][0].items;
    const catItem = items.find((i: { item_key: string }) => i.item_key === 'cat');
    expect(catItem.is_correct).toBe(true);
  });

  test("'tap_wrong' inverts within the reached boundary; positions past last_attempted_position are is_correct=false (not-reached)", () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ReadWordsQuestion
        language="en"
        itemSet={FIXTURE_READ_WORDS_EN}
        instructions="."
        durationSec={60}
        markingPolarity="tap_wrong"
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    // tap_wrong mode: tap cat (position 0) means "child got it wrong";
    // dog/sun/run (1, 2, 3) are untapped. Then tap sun (position 2) as
    // wrong. The marker records that the child attempted through position 2.
    fireEvent.press(getByLabelText('cat, idle'));
    fireEvent.press(getByLabelText('sun, idle'));
    fireEvent.press(getByText('End'));
    fireEvent.press(getByLabelText('sun, item 3'));
    fireEvent.press(getByText('Confirm'));
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

  test("'tap_wrong' zero-tap (no taps at all) → all items not-reached, total_correct=0, total_attempted=0", () => {
    // Adversarial review found: when no taps happen in tap_wrong mode,
    // lastPos=-1 was bypassing the not-reached guard and every untapped word
    // (i.e. all 20) was marked is_correct=true — inflating total_correct
    // while total_attempted was still 0. This test pins the correct behavior.
    const onComplete = jest.fn();
    const { getByText } = render(
      <ReadWordsQuestion
        language="en"
        itemSet={FIXTURE_READ_WORDS_EN}
        instructions="."
        durationSec={60}
        markingPolarity="tap_wrong"
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Nothing attempted'));
    const r = onComplete.mock.calls[0][0];
    expect(r.derived.last_attempted_position).toBe(-1);
    expect(r.derived.total_attempted).toBe(0);
    expect(r.derived.total_correct).toBe(0);
    // Every items[i].is_correct must be false (none reached, none correct)
    r.items.forEach((item: { is_correct: boolean }) => {
      expect(item.is_correct).toBe(false);
    });
  });

  test("'tap_wrong' total_correct excludes not-reached words", () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ReadWordsQuestion
        language="en"
        itemSet={FIXTURE_READ_WORDS_EN}
        instructions="."
        durationSec={60}
        markingPolarity="tap_wrong"
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    // Mark position 0 wrong, then clear it so it is correct in tap_wrong.
    fireEvent.press(getByLabelText('cat, idle'));
    fireEvent.press(getByLabelText('cat, correct')); // untap, leaving it idle
    fireEvent.press(getByText('End'));
    fireEvent.press(getByLabelText('cat, item 1'));
    fireEvent.press(getByText('Confirm'));
    const r = onComplete.mock.calls[0][0];
    // The marker sets last_attempted_position=0 and total_attempted=1;
    // total_correct=1 (cat is "correct" in tap_wrong because untapped).
    // The other 19 words must NOT be counted as correct (codex finding #2 fix).
    expect(r.derived.last_attempted_position).toBe(0);
    expect(r.derived.total_attempted).toBe(1);
    expect(r.derived.total_correct).toBe(1);
  });
});
