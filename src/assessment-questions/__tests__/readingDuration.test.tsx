import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { LetterSoundsQuestion } from '../questions/LetterSoundsQuestion';
import { ReadWordsQuestion } from '../questions/ReadWordsQuestion';
import { ReadPassageQuestion } from '../questions/ReadPassageQuestion';

const words = Array.from({ length: 30 }, (_, idx) => ({
  item_key: `word${idx + 1}`, word: `word${idx + 1}`,
}));
const wordSet = {
  item_set_id: 'reading-duration@fixture.en', question_version: 'fixture', words,
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
      letters: ['a', 'b', 'c'], columns: 3,
    },
    labels: ['a', 'b', 'c'], reportsWpm: false,
  },
])('$name reading duration', ({ Component, itemSet, labels, reportsWpm }) => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-19T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  function startReading(durationSec?: number) {
    const onComplete = jest.fn();
    const screen = render(
      <Component language="en" itemSet={itemSet} durationSec={durationSec} onComplete={onComplete} />,
    );
    fireEvent.press(screen.getByText('Start'));
    labels.forEach((label) => fireEvent.press(screen.getByLabelText(`${label}, idle`)));
    return { screen, onComplete };
  }

  test.each([0, 5000])('timer freezes at its deadline despite a %i ms callback delay and delayed confirmation', (callbackDelay) => {
    const { screen, onComplete } = startReading(60);
    // Jump wall time without running callbacks, then let the first interval run.
    act(() => {
      jest.setSystemTime(Date.now() + 60000 + callbackDelay - 250);
      jest.advanceTimersByTime(250);
    });
    expect(screen.getByText('Last item attempted')).toBeTruthy();
    expect(screen.queryByText('Cancel')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(30000));
    fireEvent.press(screen.getByText('Confirm'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.duration_ms).toBe(60000);
    expect(result.stopped_reason).toBe('timer');
    expect(result.derived.total_correct).toBe(labels.length);
    expect(result.derived.was_timed).toBe(true);
    expect(result.derived.correct_words_per_minute).toBe(reportsWpm ? labels.length : undefined);
  });

  test('early End freezes duration before a marker confirmation delayed past the deadline', () => {
    const { screen, onComplete } = startReading(60);
    act(() => jest.advanceTimersByTime(20000));
    fireEvent.press(screen.getByText('End'));
    expect(screen.getByText('Last item attempted')).toBeTruthy();
    act(() => jest.advanceTimersByTime(70000));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Reached the end'));
    const result = onComplete.mock.calls[0][0];
    expect(result.duration_ms).toBe(20000);
    expect(result.stopped_reason).toBe('ea_ended');
    expect(result.derived.correct_words_per_minute).toBe(reportsWpm ? labels.length * 3 : undefined);
  });

  test.each(['End', 'timer', 'skip'])('Cancel resumes the original clock before the next %s', (nextStop) => {
    const { screen, onComplete } = startReading(60);
    act(() => jest.advanceTimersByTime(20000));
    fireEvent.press(screen.getByText('End'));
    act(() => jest.advanceTimersByTime(10000));
    fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByText('Last item attempted')).toBeNull();
    expect(screen.getByLabelText(`${labels[0]}, correct`)).toBeTruthy();

    if (nextStop === 'timer') {
      act(() => jest.advanceTimersByTime(30000));
      expect(screen.getByText('Last item attempted')).toBeTruthy();
      act(() => jest.advanceTimersByTime(30000));
      fireEvent.press(screen.getByText('Confirm'));
    } else {
      act(() => jest.advanceTimersByTime(10000));
      fireEvent.press(screen.getByText(nextStop === 'End' ? 'End' : 'Skip question'));
      act(() => jest.advanceTimersByTime(30000));
      fireEvent.press(screen.getByText(nextStop === 'End' ? 'Confirm' : 'Child refused'));
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

  test('untimed reading keeps its existing finish-time duration and omits WPM', () => {
    const { screen, onComplete } = startReading();
    act(() => jest.advanceTimersByTime(120000));
    expect(screen.queryByText('Last item attempted')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('End'));
    act(() => jest.advanceTimersByTime(30000));
    fireEvent.press(screen.getByText('Confirm'));
    const result = onComplete.mock.calls[0][0];
    expect(result.duration_ms).toBe(150000);
    expect(result.stopped_reason).toBe('ea_ended');
    expect(result.derived.was_timed).toBe(false);
    expect(result.derived.correct_words_per_minute).toBeUndefined();
  });
});
