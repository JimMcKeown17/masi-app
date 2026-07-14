import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ReadPassageQuestion } from '..';

describe('ReadPassageQuestion — intro & active', () => {
  test('Start renders the passage as wrap-pills', () => {
    const { getByText } = render(
      <ReadPassageQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    // First word of stub passage
    expect(getByText('A')).toBeTruthy();
    expect(getByText('happy.')).toBeTruthy();
  });
});

describe('ReadPassageQuestion — durationSec defaults to 60 when omitted', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('timer fires at ~60s when host passes no durationSec', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ReadPassageQuestion
        language="en"
        instructions="."
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
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('End'));
    const r = onComplete.mock.calls[0][0];
    expect(r.derived.correct_words_per_minute).toBe(0);
  });
});

describe('ReadPassageQuestion — itemSet override and variable passage length', () => {
  test('renders override passage of any length without hardcoded assumptions', () => {
    const onComplete = jest.fn();
    const longOverride = {
      item_set_id: 'custom@1.0.en',
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
    expect(getByText('A')).toBeTruthy(); // first stub word
  });
});

describe('ReadPassageQuestion — Abandon flow', () => {
  test('Abandon picker fires onAbandon + emits Result', () => {
    const onComplete = jest.fn();
    const onAbandon = jest.fn();
    const { getByText } = render(
      <ReadPassageQuestion
        language="en"
        instructions="."
        durationSec={60}
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

  test('Abandon emits items=[] yet last_attempted_position is still a number (timed contract)', () => {
    // Q8 is timed → contract validator requires numeric last_attempted_position.
    // The skip-emits-empty fix must NOT break that. items=[] + lastPos=-1 is
    // the correct shape for "EA abandoned a timed Question with zero taps".
    const onComplete = jest.fn();
    const { getByText } = render(
      <ReadPassageQuestion
        language="en"
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Abandon'));
    fireEvent.press(getByText('Out of time'));
    const r = onComplete.mock.calls[0][0];
    expect(r.items).toEqual([]);
    expect(r.derived.total_correct).toBe(0);
    expect(r.derived.total_attempted).toBe(0);
    expect(r.derived.correct_words_per_minute).toBe(0);
    expect(typeof r.derived.last_attempted_position).toBe('number'); // contract
  });
});
