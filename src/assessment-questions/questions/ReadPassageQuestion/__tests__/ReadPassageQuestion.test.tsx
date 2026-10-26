import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import { ReadPassageQuestion } from '..';
import { ReadSentencesQuestion } from '../../ReadSentencesQuestion';
import { FIXTURE_READ_PASSAGE_EN } from '../../../testFixtures';
import { tokens } from '../../../theme/tokens';

test('the timer shows only when durationSec is given', () => {
  const r = render(
    <ReadPassageQuestion language="en" itemSet={FIXTURE_READ_PASSAGE_EN} onComplete={jest.fn()} />,
  );
  expect(r.queryByTestId('countdown-track')).toBeNull();
  fireEvent.press(r.getByText('Start'));
  expect(r.queryByTestId('countdown-track')).toBeNull();
  r.unmount();

  const timed = render(
    <ReadPassageQuestion language="en" itemSet={FIXTURE_READ_PASSAGE_EN} durationSec={60} onComplete={jest.fn()} />,
  );
  expect(timed.queryByTestId('countdown-track')).toBeNull();
  fireEvent.press(timed.getByText('Start'));
  expect(timed.getByTestId('countdown-track')).toBeTruthy();
  expect(within(timed.getByTestId('passage-scroll')).queryByTestId('countdown-track')).toBeNull();
});

test('with durationSec it shows 60s immediately after Start', () => {
  jest.useFakeTimers();
  try {
    const r = render(
      <ReadPassageQuestion language="en" itemSet={FIXTURE_READ_PASSAGE_EN} durationSec={60} onComplete={jest.fn()} />,
    );
    fireEvent.press(r.getByText('Start'));
    expect(r.getByText('60s')).toBeTruthy();
    expect(r.getByTestId('countdown-fill')).toHaveStyle({ width: '100%' });
    act(() => { jest.advanceTimersByTime(1000); });
    expect(r.getByText('59s')).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

test('paragraphs render as wrapped word pills', () => {
  const r = render(
    <ReadPassageQuestion language="en" itemSet={FIXTURE_READ_PASSAGE_EN} onComplete={jest.fn()} />,
  );
  fireEvent.press(r.getByText('Start'));
  const pill = within(r.getByTestId('paragraph-0')).getByTestId('tile-0');
  let row = pill.parent;
  while (row && !StyleSheet.flatten(row.props.style)?.flexWrap) row = row.parent;
  expect(row).toHaveStyle({ flexWrap: 'wrap' });
  expect(pill).toHaveStyle({ borderRadius: tokens.radius.tile });
});

test('untimed by default: no timer fires and no correct_words_per_minute', () => {
  jest.useFakeTimers();
  try {
    const onComplete = jest.fn();
    const r = render(
      <ReadPassageQuestion
        language="en"
        itemSet={FIXTURE_READ_PASSAGE_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(r.getByText('Start'));
    act(() => {
      jest.advanceTimersByTime(120000);
    });
    expect(onComplete).not.toHaveBeenCalled();
    endPassage(r);
    const d = onComplete.mock.calls[0][0].derived;
    expect(d.was_timed).toBe(false);
    expect(d.correct_words_per_minute).toBeUndefined();
  } finally {
    jest.useRealTimers();
  }
});

test('paragraph_starts splits the passage into paragraphs', () => {
  const set = { ...FIXTURE_READ_PASSAGE_EN, paragraph_starts: [0, 3] };
  const r = render(
    <ReadPassageQuestion
      language="en"
      itemSet={set}
      instructions="."
      onComplete={jest.fn()}
    />,
  );
  fireEvent.press(r.getByText('Start'));
  expect(r.getAllByTestId(/^paragraph-/)).toHaveLength(2);
});

describe('ReadPassageQuestion — intro & active', () => {
  test('Start renders the passage as wrap-pills', () => {
    const { getByText, getByTestId } = render(
      <ReadPassageQuestion
        language="en"
        itemSet={FIXTURE_READ_PASSAGE_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    // First and last words of the frozen fixture passage.
    expect(getByText('A')).toBeTruthy();
    expect(getByText('happy.')).toBeTruthy();
  });
});

describe('ReadPassageQuestion — explicit durationSec timer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('timer saves immediately at 60s when durationSec is supplied', () => {
    const onComplete = jest.fn();
    const r = render(<ReadPassageQuestion language="en" itemSet={FIXTURE_READ_PASSAGE_EN}
      durationSec={60} onComplete={onComplete} />);
    fireEvent.press(r.getByText('Start'));
    act(() => jest.advanceTimersByTime(59000));
    expect(onComplete).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(2000));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(r.queryByText('Last item attempted')).toBeNull();
    expect(r.queryByText('Cancel')).toBeNull();
    expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'timer', duration_ms: 60000,
      derived: { total_attempted: 0, total_correct: 0, last_attempted_position: -1 } });
  });
});

describe('ReadPassageQuestion — derived.correct_words_per_minute', () => {
  test('End mid-passage emits WPM derived from duration_ms + total_correct', () => {
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <ReadPassageQuestion
        language="en"
        itemSet={FIXTURE_READ_PASSAGE_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    // Mark 6 words as correct (positions 0-5)
    for (let position = 0; position < 6; position++) fireEvent.press(getByText('Correct'));
    fireEvent.press(getByTestId('passage-end'));
    fireEvent.press(getByText('End question'));
    const r = onComplete.mock.calls[0][0];
    expect(r.derived.total_correct).toBe(6);
    expect(r.derived.was_timed).toBe(true);
    expect(r.derived.last_attempted_position).toBe(5);
    // WPM = (correct / duration_ms) * 60000. With short test runtimes WPM
    // will be a very large number; just check it's a number >= 0.
    expect(typeof r.derived.correct_words_per_minute).toBe('number');
    expect(r.derived.correct_words_per_minute).toBeGreaterThanOrEqual(0);
  });

  test('Zero duration_ms (e.g. immediate End at t=0) reports WPM=0 (no divide by zero)', () => {
    jest.spyOn(globalThis.performance, 'now').mockReturnValue(0);
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <ReadPassageQuestion
        language="en"
        itemSet={FIXTURE_READ_PASSAGE_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByTestId('passage-end'));
    fireEvent.press(getByText('End question'));
    const r = onComplete.mock.calls[0][0];
    expect(r.duration_ms).toBe(0);
    expect(r.derived.correct_words_per_minute).toBe(0);
    jest.restoreAllMocks();
  });
});

describe('ReadPassageQuestion — itemSet override and variable passage length', () => {
  test('renders override passage of any length without hardcoded assumptions', () => {
    const onComplete = jest.fn();
    const longOverride = {
      item_set_id: 'custom@1.0.en',
      question_code: 'custom',
      language: 'en',
      question_version: '1.0',
      words: Array.from({ length: 100 }, (_, i) => ({
        item_key: `w${i}`,
        word: `word${i}`,
      })),
    };
    const { getByText, getByTestId } = render(
      <ReadPassageQuestion
        language="en"
        instructions="."
        durationSec={60}
        itemSet={longOverride}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('word0')).toBeTruthy();
    expect(getByText('word99')).toBeTruthy();
    fireEvent.press(getByTestId('passage-end'));
    fireEvent.press(getByText('End question'));
    const r = onComplete.mock.calls[0][0];
    expect(r.items).toHaveLength(100);
  });

  test('falls back to bundled default when override is malformed', () => {
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <ReadPassageQuestion
        language="en"
        instructions="."
        durationSec={60}
        itemSet={{ words: 'not an array' }}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('End question')).toBeTruthy();
  });
});

describe('ReadPassageQuestion — Skip flow', () => {
  test('Skip picker emits Result', () => {
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <ReadPassageQuestion
        language="en"
        itemSet={FIXTURE_READ_PASSAGE_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Skip question'));
    fireEvent.press(getByText('Child refused'));
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('skipped_child_refused');
  });

  test('timed Skip emits no items, no progress position, and no WPM', () => {
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <ReadPassageQuestion
        language="en"
        itemSet={FIXTURE_READ_PASSAGE_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Skip question'));
    fireEvent.press(getByText('Out of time'));
    const r = onComplete.mock.calls[0][0];
    expect(r.items).toEqual([]);
    expect(r.derived.total_correct).toBe(0);
    expect(r.derived.total_attempted).toBe(0);
    expect(r.derived.correct_words_per_minute).toBeUndefined();
    expect(r.derived.last_attempted_position).toBeNull();
    expect(r.derived.tracks_progress).toBe(false);
  });
});


test('repeated passage words mark independently and callbacks retain each position', () => {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(<ReadPassageQuestion language="en"
    itemSet={{ ...FIXTURE_READ_PASSAGE_EN, paragraph_starts: [0],
      words: ['there', 'how', 'there', 'how'].map(word => ({ item_key: word, word })) }}
    onComplete={onComplete} onItemMarked={onItemMarked} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByText('Incorrect'));
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(within(r.getByTestId('passage-scroll')).getByTestId('tile-2'));
  expect(r.getAllByLabelText('there, incorrect. Double-tap to change to correct')).toHaveLength(2);
  expect(r.getByLabelText('how, correct. Double-tap to change to incorrect')).toBeTruthy();
  expect(r.getByLabelText('how, current')).toBeTruthy();
  expect(onItemMarked.mock.calls.map(([item]) => [item.position, item.item_key, item.is_correct]))
    .toEqual([[0, 'there', false], [1, 'how', true], [2, 'there', true], [2, 'there', false]]);
  endPassage(r);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0].items.map((item: any) => [item.position, item.item_key, item.is_correct]))
    .toEqual([[0, 'there', false], [1, 'how', true], [2, 'there', false], [3, 'how', false]]);
  expect(onComplete.mock.calls[0][0].derived).toMatchObject({ total_attempted: 3, total_correct: 1, last_attempted_position: 2 });
});

test('passage: Countdown ticks do not re-read or render passage word data', () => {
  jest.useFakeTimers();
  try {
    let wordReadCount = 0;
    const word = { item_key: 'word', get word() { wordReadCount += 1; return 'word'; } };
    const r = render(<ReadPassageQuestion language="en" durationSec={60}
      itemSet={{ ...FIXTURE_READ_PASSAGE_EN, paragraph_starts: [0], words: [word] }} onComplete={jest.fn()} />);
    fireEvent.press(r.getByText('Start'));
    expect(wordReadCount).toBeGreaterThan(0);
    const tile = r.getByLabelText('word, current');
    wordReadCount = 0;
    act(() => jest.advanceTimersByTime(1000));
    expect(r.getByText('59s')).toBeTruthy();
    expect(wordReadCount).toBe(0);
    expect(r.getByLabelText('word, current')).toBe(tile);
    // Positive control: marking updates the rendered tile from the prepared word data.
    fireEvent.press(r.getByText('Correct'));
    expect(r.getByLabelText('word, correct. Double-tap to change to incorrect')).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

const longSet = { ...FIXTURE_READ_PASSAGE_EN, paragraph_starts: [0, 10],
  words: Array.from({ length: 20 }, (_, i) => ({ item_key: String(i), word: `word${i}` })) };
const endPassage = (r: ReturnType<typeof render>) => {
  fireEvent.press(r.getByTestId('passage-end'));
  fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question'));
};

test('passage: the ring follows the child word by word; the timer saves at once with the last marked word as last_attempted_position', () => {
  jest.useFakeTimers();
  try {
    const onComplete = jest.fn();
    const r = render(<ReadPassageQuestion language="en" itemSet={longSet} durationSec={60} onComplete={onComplete} />);
    fireEvent.press(r.getByText('Start'));
    for (let i = 0; i < 5; i++) {
      expect(r.getByLabelText(`word${i}, current`)).toBeTruthy();
      fireEvent.press(r.getByText(i === 2 ? 'Incorrect' : 'Correct'));
    }
    expect(r.getByLabelText('word5, current')).toBeTruthy();
    act(() => jest.advanceTimersByTime(60000));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ duration_ms: 60000, stopped_reason: 'timer',
      derived: { total_attempted: 5, total_correct: 4, last_attempted_position: 4, correct_words_per_minute: 4 } });
    expect(onComplete.mock.calls[0][0].items.slice(5).every((item: any) => item.metadata.reached === false && !item.is_correct)).toBe(true);
  } finally { jest.useRealTimers(); }
});

test.each(['End', 'timer'])('passage: no "Last item attempted" sheet appears on %s', stop => {
  jest.useFakeTimers();
  try {
    const onComplete = jest.fn();
    const r = render(<ReadPassageQuestion language="en" itemSet={longSet} durationSec={60} onComplete={onComplete} />);
    fireEvent.press(r.getByText('Start'));
    fireEvent.press(r.getByText('Correct'));
    if (stop === 'End') endPassage(r);
    else act(() => jest.advanceTimersByTime(60000));
    expect(r.queryByText('Last item attempted')).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].derived.last_attempted_position).toBe(0);
  } finally { jest.useRealTimers(); }
});

test('passage: an error-free reader who reached 12 words saves 12 correct', () => {
  const onComplete = jest.fn();
  const r = render(<ReadPassageQuestion language="en" itemSet={longSet} onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  for (let i = 0; i < 12; i++) fireEvent.press(r.getByText('Correct'));
  endPassage(r);
  expect(onComplete.mock.calls[0][0].derived).toMatchObject({ total_correct: 12, total_attempted: 12, last_attempted_position: 11, percent: 100 });
});

test.each([
  ['Q7', ReadSentencesQuestion, 'sentences', 'sentence-scroll'],
  ['passage', ReadPassageQuestion, 'passage', 'passage-scroll'],
] as const)('%s: repeated words keep independent marks through flip and Back', (_, Component, prefix, bodyID) => {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const words = Array.from({ length: 4 }, () => ({ item_key: 'same', word: 'same' }));
  const r = render(<Component language="en" onComplete={onComplete} onItemMarked={onItemMarked}
    itemSet={{ ...longSet, words, paragraph_starts: [0], sentences: [
      { item_key: 'same', words: words.slice(0, 2) }, { item_key: 'same', words: words.slice(2) },
    ] }} />);
  fireEvent.press(r.getByText('Start'));
  const body = () => within(r.getByTestId(bodyID));
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(r.getByText('Incorrect'));
  fireEvent.press(body().getByTestId('tile-0'));
  expect(body().getByTestId('tile-0').props.accessibilityLabel).toContain('incorrect');
  expect(body().getByTestId('tile-1').props.accessibilityLabel).toContain('incorrect');
  fireEvent.press(r.getByText('Back'));
  expect(body().getByTestId('tile-1').props.accessibilityLabel).toBe('same, current');
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(r.getByTestId(`${prefix}-end`));
  fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question'));
  expect(onItemMarked.mock.calls.map(([item]) => [item.position, item.is_correct])).toEqual([[0, true], [1, false], [0, false], [1, true]]);
  expect(onComplete.mock.calls[0][0].items.map((item: any) => [item.position, item.item_key, item.is_correct, item.metadata.reached]))
    .toEqual([[0, 'same', false, true], [1, 'same', true, true], [2, 'same', false, false], [3, 'same', false, false]]);
  expect(onComplete.mock.calls[0][0].derived).toMatchObject({ total_attempted: 2, total_correct: 1, correction_count: 2 });
});
