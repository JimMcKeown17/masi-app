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
    itemSet: wordSet, labels: words.map((word) => word.word), reportsWpm: false,
  },
  {
    name: 'Q8 ReadPassageQuestion', Component: ReadPassageQuestion,
    itemSet: wordSet, labels: words.map((word) => word.word), reportsWpm: true,
  },
  {
    name: 'Q1 LetterSoundsQuestion', Component: LetterSoundsQuestion,
    itemSet: {
      item_set_id: 'letter-duration@fixture.en', question_version: 'fixture',
      question_code: 'letter-duration', language: 'en',
      rows: [['a', 'b', 'c', 'd']], stop_rule: null,
    },
    labels: ['a', 'b', 'c'], reportsWpm: false,
  },
])('$name reading duration', ({ Component, itemSet, labels, reportsWpm }) => {
  const sequential = Component === LetterSoundsQuestion;
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
    labels.forEach((label) => fireEvent.press(sequential
      ? screen.getByText('Correct') : screen.getByLabelText(`${label}, idle`)));
    return { screen, onComplete };
  }

  function pressEnd(screen: ReturnType<typeof render>) {
    fireEvent.press(sequential ? screen.getByTestId('letter-end') : screen.getByText('End'));
  }

  function confirmEnd(screen: ReturnType<typeof render>) {
    fireEvent.press(sequential
      ? within(screen.getByTestId('end-confirmation')).getByText('End test')
      : screen.getByText('Confirm'));
  }

  describe.each([false, true])('End with an overdue callback (earlier End cancelled: %s)', (cancelEarlierEnd) => {
    test.each([60000, 65000])('End at %i ms resolves the deadline before delayed confirmation', (elapsedMs) => {
      const { screen, onComplete } = startReading(60);
      const startedAt = globalThis.performance.now();
      if (cancelEarlierEnd) {
        act(() => jest.advanceTimersByTime(20000));
        pressEnd(screen);
        act(() => jest.advanceTimersByTime(10000));
        fireEvent.press(screen.getByText('Cancel'));
      }

      // Move monotonic time to/past the deadline without running any timer callbacks.
      // Keep it advancing during confirmation so this still detects a missing freeze.
      const now = globalThis.performance.now.bind(globalThis.performance);
      const delayedMs = startedAt + elapsedMs - now();
      jest.spyOn(globalThis.performance, 'now').mockImplementation(() => now() + delayedMs);
      expect(screen.queryByText('Last item attempted')).toBeNull();
      pressEnd(screen);
      if (!sequential) expect(screen.getByText('Last item attempted')).toBeTruthy();
      const canCancel = screen.queryByText('Cancel') !== null;
      act(() => jest.advanceTimersByTime(30000));
      if (!sequential) {
        expect(onComplete).not.toHaveBeenCalled();
        fireEvent.press(screen.getByText('Confirm'));
      }

      expect(onComplete).toHaveBeenCalledTimes(1);
      const result = onComplete.mock.calls[0][0];
      expect(result.duration_ms).toBe(60000);
      expect(result.stopped_reason).toBe('timer');
      expect(result.derived.total_correct).toBe(labels.length);
      expect(result.derived.was_timed).toBe(true);
      expect(result.derived.correct_words_per_minute).toBe(reportsWpm ? labels.length : undefined);
      expect(canCancel).toBe(false);
    });
  });

  test.each([0, 5000])('timer freezes at its deadline despite a %i ms callback delay and delayed confirmation', (callbackDelay) => {
    const { screen, onComplete } = startReading(60);
    // Advance monotonic time without running callbacks, then let the first interval run.
    const now = globalThis.performance.now.bind(globalThis.performance);
    jest.spyOn(globalThis.performance, 'now').mockImplementation(() => now() + 60000 + callbackDelay - 250);
    act(() => {
      jest.advanceTimersByTime(250);
    });
    if (!sequential) expect(screen.getByText('Last item attempted')).toBeTruthy();
    expect(screen.queryByText('Cancel')).toBeNull();
    if (!sequential) expect(onComplete).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(30000));
    if (!sequential) fireEvent.press(screen.getByText('Confirm'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.duration_ms).toBe(60000);
    expect(result.stopped_reason).toBe('timer');
    expect(result.derived.total_correct).toBe(labels.length);
    expect(result.derived.was_timed).toBe(true);
    expect(result.derived.correct_words_per_minute).toBe(reportsWpm ? labels.length : undefined);
  });

  test('early End freezes duration before confirmation delayed past the deadline', () => {
    const { screen, onComplete } = startReading(60);
    act(() => jest.advanceTimersByTime(20000));
    pressEnd(screen);
    expect(screen.getByText(sequential ? 'End the test?' : 'Last item attempted')).toBeTruthy();
    act(() => jest.advanceTimersByTime(70000));
    expect(onComplete).not.toHaveBeenCalled();
    if (sequential) confirmEnd(screen);
    else fireEvent.press(screen.getByText('Reached the end'));
    const result = onComplete.mock.calls[0][0];
    expect(result.duration_ms).toBe(20000);
    expect(result.stopped_reason).toBe('ea_ended');
    expect(result.derived.correct_words_per_minute).toBe(reportsWpm ? labels.length * 3 : undefined);
  });

  test.each(['End', 'timer', 'skip'])('Cancel resumes the original clock before the next %s', (nextStop) => {
    const { screen, onComplete } = startReading(60);
    act(() => jest.advanceTimersByTime(20000));
    pressEnd(screen);
    act(() => jest.advanceTimersByTime(10000));
    fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByText('Last item attempted')).toBeNull();
    expect(screen.getByLabelText(`${labels[0]}, correct`)).toBeTruthy();

    if (nextStop === 'timer') {
      act(() => jest.advanceTimersByTime(30000));
      if (!sequential) expect(screen.getByText('Last item attempted')).toBeTruthy();
      act(() => jest.advanceTimersByTime(30000));
      if (!sequential) fireEvent.press(screen.getByText('Confirm'));
    } else {
      act(() => jest.advanceTimersByTime(10000));
      if (nextStop === 'End') pressEnd(screen);
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
      reportsWpm && nextStop !== 'skip' ? Math.round(labels.length * 60000 / elapsed) : undefined,
    );
  });

  test('untimed reading uses its capture-mode finish time and omits WPM', () => {
    const { screen, onComplete } = startReading();
    act(() => jest.advanceTimersByTime(120000));
    expect(screen.queryByText('Last item attempted')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    pressEnd(screen);
    act(() => jest.advanceTimersByTime(30000));
    confirmEnd(screen);
    const result = onComplete.mock.calls[0][0];
    expect(result.duration_ms).toBe(sequential ? 120000 : 150000);
    expect(result.stopped_reason).toBe('ea_ended');
    expect(result.derived.was_timed).toBe(false);
    expect(result.derived.correct_words_per_minute).toBeUndefined();
  });
});
