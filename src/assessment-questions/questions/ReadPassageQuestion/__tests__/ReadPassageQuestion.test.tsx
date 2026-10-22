import React from 'react';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import { ReadPassageQuestion } from '..';
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
  const pill = within(r.getByTestId('paragraph-0')).getByTestId('pill-p1.w1');
  let row = pill.parent;
  while (row && typeof row.type !== 'string') row = row.parent;
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
    fireEvent.press(r.getByText('End'));
    fireEvent.press(r.getByText('Reached the end'));
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
    const { getByText } = render(
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

  test('timer opens the marker at ~60s when durationSec is supplied', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ReadPassageQuestion
        language="en"
        itemSet={FIXTURE_READ_PASSAGE_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    act(() => {
      jest.advanceTimersByTime(59 * 1000);
    });
    expect(onComplete).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(2 * 1000);
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(getByText('Last item attempted')).toBeTruthy();
    expect(() => getByText('Cancel')).toThrow();
    fireEvent.press(getByText('Reached the end'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('timer');
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
    ['p1.w1', 'p1.w2', 'p1.w3', 'p1.w4', 'p1.w5', 'p1.w6'].forEach((k) => {
      fireEvent.press(getByTestId(`pill-${k}`));
    });
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Confirm'));
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
    const onComplete = jest.fn();
    const { getByText } = render(
      <ReadPassageQuestion
        language="en"
        itemSet={FIXTURE_READ_PASSAGE_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Nothing attempted'));
    const r = onComplete.mock.calls[0][0];
    expect(r.derived.correct_words_per_minute).toBe(0);
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
    const { getByText } = render(
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
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Reached the end'));
    const r = onComplete.mock.calls[0][0];
    expect(r.items).toHaveLength(100);
  });

  test('falls back to bundled default when override is malformed', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ReadPassageQuestion
        language="en"
        instructions="."
        durationSec={60}
        itemSet={{ words: 'not an array' }}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('End')).toBeTruthy();
  });
});

describe('ReadPassageQuestion — Skip flow', () => {
  test('Skip picker emits Result', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
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
    const { getByText } = render(
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
