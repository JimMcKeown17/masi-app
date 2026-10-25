import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { LetterSoundsQuestion } from '../questions/LetterSoundsQuestion';
import { ReadWordsQuestion } from '../questions/ReadWordsQuestion';
import { ReadPassageQuestion } from '../questions/ReadPassageQuestion';

const words = Array.from({ length: 30 }, (_, idx) => ({
  item_key: `word${idx + 1}`, word: `word${idx + 1}`,
}));
const wordSet = {
  item_set_id: 'reading-duration@fixture.en', question_version: 'fixture', words,
  question_code: 'reading-duration', language: 'en',
};

describe.each([
  {
    name: 'Q6 ReadWordsQuestion', Component: ReadWordsQuestion,
    itemSet: wordSet, labels: words.map((word) => word.word), marks: 5, prefix: 'word', reportsWpm: false,
  },
  {
    name: 'Q8 ReadPassageQuestion', Component: ReadPassageQuestion,
    itemSet: wordSet, labels: words.map((word) => word.word), marks: 5, prefix: 'passage', reportsWpm: true,
  },
  {
    name: 'Q1 LetterSoundsQuestion', Component: LetterSoundsQuestion,
    itemSet: {
      item_set_id: 'letter-duration@fixture.en', question_version: 'fixture',
      question_code: 'letter-duration', language: 'en',
      rows: [['a', 'b', 'c', 'd']], stop_rule: null,
    },
    labels: ['a', 'b', 'c', 'd'], marks: 3, prefix: 'letter', reportsWpm: false,
  },
])('$name reading duration', ({ Component, itemSet, labels, marks, prefix, reportsWpm }) => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-19T12:00:00Z'));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function startReading(durationSec?: number) {
    const onComplete = jest.fn();
    const screen = render(
      <Component language="en" itemSet={itemSet} durationSec={durationSec} onComplete={onComplete} />,
    );
    fireEvent.press(screen.getByText('Start'));
    expect(marks).toBeLessThan(labels.length);
    for (let i = 0; i < marks; i++) fireEvent.press(screen.getByText('Correct'));
    return { screen, onComplete };
  }

  function openEnd(screen: ReturnType<typeof render>, endPrefix = prefix) {
    fireEvent.press(screen.getByTestId(`${endPrefix}-end`));
  }

  function confirmEnd(screen: ReturnType<typeof render>) {
    fireEvent.press(within(screen.getByTestId('end-confirmation')).getByText('End question'));
  }

  describe.each([false, true])('End with an overdue callback (earlier End cancelled: %s)', (cancelEarlierEnd) => {
    test.each([60000, 65000])('End at %i ms resolves the deadline before later UI activity', (elapsedMs) => {
      const { screen, onComplete } = startReading(60);
      const startedAt = globalThis.performance.now();
      if (cancelEarlierEnd) {
        act(() => jest.advanceTimersByTime(20000));
        openEnd(screen);
        act(() => jest.advanceTimersByTime(10000));
        fireEvent.press(screen.getByText('Keep marking'));
      }

      // Move monotonic time to/past the deadline without running any timer callbacks.
      // Keep it advancing during confirmation so this still detects a missing freeze.
      const now = globalThis.performance.now.bind(globalThis.performance);
      const delayedMs = startedAt + elapsedMs - now();
      jest.spyOn(globalThis.performance, 'now').mockImplementation(() => now() + delayedMs);
      expect(screen.queryByText('Last item attempted')).toBeNull();
      openEnd(screen);
      const canCancel = screen.queryByText('Keep marking') !== null;
      expect(screen.queryByTestId('end-confirmation')).toBeNull();
      expect(onComplete).toHaveBeenCalledTimes(1);
      act(() => jest.advanceTimersByTime(30000));

      expect(onComplete).toHaveBeenCalledTimes(1);
      const result = onComplete.mock.calls[0][0];
      expect(result.duration_ms).toBe(60000);
      expect(result.stopped_reason).toBe('timer');
      expect(result.derived.total_correct).toBe(marks);
      expect(result.derived.was_timed).toBe(true);
      expect(result.derived.correct_words_per_minute).toBe(reportsWpm ? marks : undefined);
      expect(canCancel).toBe(false);
    });
  });

  test.each([0, 5000])('timer freezes at its deadline despite a %i ms callback delay and later UI activity', (callbackDelay) => {
    const { screen, onComplete } = startReading(60);
    // Advance monotonic time without running callbacks, then let the first interval run.
    const now = globalThis.performance.now.bind(globalThis.performance);
    jest.spyOn(globalThis.performance, 'now').mockImplementation(() => now() + 60000 + callbackDelay - 250);
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(screen.queryByText('Cancel')).toBeNull();
    expect(screen.queryByText('Last item attempted')).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(30000));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.duration_ms).toBe(60000);
    expect(result.stopped_reason).toBe('timer');
    expect(result.derived.total_correct).toBe(marks);
    expect(result.derived.was_timed).toBe(true);
    expect(result.derived.correct_words_per_minute).toBe(reportsWpm ? marks : undefined);
  });

  test('early End freezes duration before confirmation delayed past the deadline', () => {
    const { screen, onComplete } = startReading(60);
    act(() => jest.advanceTimersByTime(20000));
    openEnd(screen);
    expect(screen.getByText('End this question?')).toBeTruthy();
    act(() => jest.advanceTimersByTime(70000));
    expect(onComplete).not.toHaveBeenCalled();
    confirmEnd(screen);
    const result = onComplete.mock.calls[0][0];
    expect(result.duration_ms).toBe(20000);
    expect(result.stopped_reason).toBe('ea_ended');
    expect(result.derived.total_correct).toBe(marks);
    expect(result.derived.total_attempted).toBe(marks);
    expect(result.derived.correct_words_per_minute).toBe(reportsWpm ? marks * 3 : undefined);
  });

  test.each(['End', 'timer', 'skip'])('cancelling End resumes the original clock before the next %s', (nextStop) => {
    const { screen, onComplete } = startReading(60);
    act(() => jest.advanceTimersByTime(20000));
    openEnd(screen);
    act(() => jest.advanceTimersByTime(10000));
    fireEvent.press(screen.getByText('Keep marking'));
    expect(screen.queryByText('Last item attempted')).toBeNull();
    expect(screen.getByLabelText(`${labels[0]}, correct. Double-tap to change to incorrect`)).toBeTruthy();

    if (nextStop === 'timer') {
      act(() => jest.advanceTimersByTime(30000));
      act(() => jest.advanceTimersByTime(30000));
    } else {
      act(() => jest.advanceTimersByTime(10000));
      if (nextStop === 'End') openEnd(screen);
      else fireEvent.press(screen.getByText('Skip question'));
      act(() => jest.advanceTimersByTime(30000));
      if (nextStop === 'End') confirmEnd(screen);
      else fireEvent.press(screen.getByText('Child refused'));
    }

    const elapsed = nextStop === 'timer' ? 60000 : nextStop === 'End' ? 40000 : 70000;
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.duration_ms).toBe(elapsed);
    expect(result.stopped_reason).toBe(
      nextStop === 'timer' ? 'timer' : nextStop === 'End' ? 'ea_ended' : 'skipped_child_refused',
    );
    expect(result.derived.correct_words_per_minute).toBe(
      reportsWpm && nextStop !== 'skip' ? Math.round(marks * 60000 / elapsed) : undefined,
    );
  });

  test('untimed reading uses its frozen End time and omits WPM', () => {
    const { screen, onComplete } = startReading();
    act(() => jest.advanceTimersByTime(120000));
    expect(screen.queryByText('Last item attempted')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    openEnd(screen);
    act(() => jest.advanceTimersByTime(30000));
    confirmEnd(screen);
    const result = onComplete.mock.calls[0][0];
    expect(result.duration_ms).toBe(120000);
    expect(result.stopped_reason).toBe('ea_ended');
    expect(result.derived.was_timed).toBe(false);
    expect(result.derived.correct_words_per_minute).toBeUndefined();
  });
});

test('all items marked: review freezes the reading time', () => {
  jest.useFakeTimers();
  try {
    const onComplete = jest.fn();
    const screen = render(<ReadWordsQuestion language="en" itemSet={wordSet}
      durationSec={60} onComplete={onComplete} />);
    fireEvent.press(screen.getByText('Start'));
    act(() => jest.advanceTimersByTime(20000));
    words.forEach(() => fireEvent.press(screen.getByText('Correct')));
    expect(screen.getByText('All 30 marked · 30 correct. Tap any word to change it.')).toBeTruthy();
    act(() => jest.advanceTimersByTime(70000));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Finish'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ duration_ms: 20000, stopped_reason: 'completed',
      derived: { total_correct: 30, total_attempted: 30 } });
  } finally {
    jest.useRealTimers();
  }
});
