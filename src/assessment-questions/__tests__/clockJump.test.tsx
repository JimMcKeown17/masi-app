import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { LetterSoundsQuestion } from '../questions/LetterSoundsQuestion';
import { ReadWordsQuestion } from '../questions/ReadWordsQuestion';
import { ReadPassageQuestion } from '../questions/ReadPassageQuestion';
import { ReadSentencesQuestion } from '../questions/ReadSentencesQuestion';
import { ListenFirstSoundQuestion } from '../questions/ListenFirstSoundQuestion';
import { ListenPhonemeBlendQuestion } from '../questions/ListenPhonemeBlendQuestion';
import { ListenAndAnswerStoryQuestion } from '../questions/ListenAndAnswerStoryQuestion';
import { LetterWritingFromPicturesQuestion } from '../questions/LetterWritingFromPicturesQuestion';
import { WriteCvcsQuestion } from '../questions/WriteCvcsQuestion';
import { WriteSentencesFromDictationQuestion } from '../questions/WriteSentencesFromDictationQuestion';
import { StoryWritingRubricQuestion } from '../questions/StoryWritingRubricQuestion';
import { CURRENT_ITEM_SETS } from '../itemsets/current';
import { validateResult } from '../contractTest/validateResult';

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-20T12:00:00Z'));
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const sequentialCases = [
  { name: 'LetterSoundsQuestion', Component: LetterSoundsQuestion,
    itemSet: CURRENT_ITEM_SETS.letter_sounds.en },
  { name: 'ReadWordsQuestion sequential', Component: ReadWordsQuestion,
    itemSet: { ...CURRENT_ITEM_SETS.word_reading.en,
      stop_rule: { kind: 'consecutive_wrong' as const, stop_at: 10 } } },
];

test.each([
  { name: 'LetterSoundsQuestion', Component: LetterSoundsQuestion, startLabel: 'Start' },
  { name: 'ReadWordsQuestion', Component: ReadWordsQuestion, startLabel: 'Start' },
  { name: 'ReadPassageQuestion', Component: ReadPassageQuestion, startLabel: 'Start' },
  { name: 'ReadSentencesQuestion', Component: ReadSentencesQuestion, startLabel: 'Start' },
  { name: 'ListenFirstSoundQuestion', Component: ListenFirstSoundQuestion, startLabel: 'Start' },
  { name: 'ListenPhonemeBlendQuestion', Component: ListenPhonemeBlendQuestion, startLabel: 'Start' },
  { name: 'ListenAndAnswerStoryQuestion', Component: ListenAndAnswerStoryQuestion, startLabel: "I've finished reading" },
  { name: 'LetterWritingFromPicturesQuestion', Component: LetterWritingFromPicturesQuestion, startLabel: 'Start' },
  { name: 'WriteCvcsQuestion', Component: WriteCvcsQuestion, startLabel: 'Start' },
  { name: 'WriteSentencesFromDictationQuestion', Component: WriteSentencesFromDictationQuestion, startLabel: 'Start' },
  { name: 'StoryWritingRubricQuestion', Component: StoryWritingRubricQuestion, startLabel: 'Start' },
])('$name emits integer milliseconds from a fractional monotonic elapsed time', ({ Component, startLabel }) => {
  let nowMs = 123.25;
  jest.spyOn(globalThis.performance, 'now').mockImplementation(() => nowMs);
  const onComplete = jest.fn();
  const screen = render(<Component language="en" onComplete={onComplete} />);
  fireEvent.press(screen.getByText(startLabel));
  nowMs += 10000.6;
  act(() => jest.setSystemTime(Date.now() - 3600000));
  fireEvent.press(screen.getByText('Skip question'));
  fireEvent.press(screen.getByText('Child refused'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  const result = onComplete.mock.calls[0][0];
  expect(result).toMatchObject({ stopped_reason: 'skipped_child_refused', duration_ms: 10001 });
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
});

describe.each(sequentialCases)('$name clock corrections', ({ Component, itemSet }) => {
  function start() {
    const onComplete = jest.fn();
    const screen = render(<Component language="en" itemSet={itemSet}
      durationSec={60} onComplete={onComplete} />);
    fireEvent.press(screen.getByText('Start'));
    return { screen, onComplete };
  }

  test('a backward clock jump preserves the ten-second stop-rule result', () => {
    const { screen, onComplete } = start();
    act(() => jest.advanceTimersByTime(10000));
    act(() => jest.setSystemTime(Date.now() - 3600000));
    for (let i = 0; i < 10; i += 1) fireEvent.press(screen.getByText('Incorrect'));
    expect(screen.getByTestId('stop-card')).toBeTruthy();
    act(() => jest.advanceTimersByTime(90000));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Save result'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result).toMatchObject({ stopped_reason: 'stop_rule', duration_ms: 10000,
      derived: { total_attempted: 10, total_correct: 0, last_attempted_position: 9 } });
    expect(validateResult(result, { stopAt: 10 })).toEqual({ valid: true, errors: [] });
  });

  test.each([-3600000, 3600000])('Undo excludes the stop-card pause despite a %i ms wall-clock jump', (jump) => {
    const { screen, onComplete } = start();
    act(() => jest.advanceTimersByTime(10000));
    for (let i = 0; i < 10; i += 1) fireEvent.press(screen.getByText('Incorrect'));
    act(() => {
      jest.setSystemTime(Date.now() + jump);
      jest.advanceTimersByTime(90000);
    });
    fireEvent.press(screen.getByText('Undo last mark'));
    fireEvent.press(screen.getByText('Correct'));
    act(() => jest.advanceTimersByTime(49999));
    expect(onComplete).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'timer', duration_ms: 60000,
      derived: { total_attempted: 10, total_correct: 1, correction_count: 1 } });
  });
});

describe.each([...sequentialCases, { name: 'ReadPassageQuestion', Component: ReadPassageQuestion, itemSet: undefined }])('$name timer clock corrections', ({ Component, itemSet }) => {
  test('a forward clock jump at five seconds still expires at sixty monotonic seconds', () => {
    const onComplete = jest.fn();
    const screen = render(<Component language="en" itemSet={itemSet} durationSec={60} onComplete={onComplete} />);
    fireEvent.press(screen.getByText('Start'));
    fireEvent.press(screen.getByText('Correct'));
    act(() => jest.advanceTimersByTime(5000));
    act(() => jest.setSystemTime(Date.now() + 3600000));
    act(() => jest.advanceTimersByTime(54999));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText('Correct')).toBeTruthy();
    act(() => jest.advanceTimersByTime(1));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'timer', duration_ms: 60000 });
    expect(validateResult(onComplete.mock.calls[0][0])).toEqual({ valid: true, errors: [] });
  });
});
