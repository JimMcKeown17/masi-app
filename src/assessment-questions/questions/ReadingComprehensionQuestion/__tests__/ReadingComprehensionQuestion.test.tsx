import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ReadingComprehensionQuestion } from '..';
import { FIXTURE_READING_COMPREHENSION_EN as SET } from '../../../testFixtures/readingComprehension';
import { validateResult } from '../../../contractTest/validateResult';
import { QuestionIntro } from '../../../ui';

function start() {
  const onComplete = jest.fn(), onStart = jest.fn();
  const screen = render(<ReadingComprehensionQuestion language="en" itemSet={SET} onComplete={onComplete} onStart={onStart} />);
  const begin = screen.UNSAFE_getByType(QuestionIntro).props.onStart;
  act(() => { begin(); begin(); });
  return { screen, onComplete, onStart };
}
test('EGRA: three questions marked then Finish save correct out of asked', () => {
  const { screen, onComplete, onStart } = start();
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  expect(screen.getByText(`Answer guide: ${SET.questions[0].answer_guide}`)).toBeTruthy();
  for (const mark of ['Correct', 'Incorrect', 'Correct']) fireEvent.press(screen.getByText(mark));
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Finish'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  const result = onComplete.mock.calls[0][0];
  expect(result.items.map((i: any) => [i.is_correct, i.metadata])).toEqual([
    [true, { reached: true, asked: true }], [false, { reached: true, asked: true }], [true, { reached: true, asked: true }],
  ]);
  result.items.forEach((item: any) => expect(item).not.toHaveProperty('response'));
  expect(result.derived).toMatchObject({ total_correct: 2, total_attempted: 3, percent: 67,
    last_attempted_position: 2, was_timed: false, tracks_progress: true, questions_asked: 3, capture_mode: 'sequential' });
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
});
test('EGRA: Show story opens the passage and Close returns to the same question', () => {
  const { screen, onComplete } = start();
  fireEvent.press(screen.getByText('Correct'));
  fireEvent.press(screen.getByText('Show story'));
  expect(screen.getByText(SET.passage)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Close'));
  expect(screen.getByLabelText(`${SET.questions[1].prompt}, current`)).toBeTruthy();
  expect(screen.getByLabelText(`${SET.questions[0].prompt}, correct. Double-tap to change to incorrect`)).toBeTruthy();
  expect(onComplete).not.toHaveBeenCalled();
});
test('End with nothing asked confirms, can be cancelled, and saves an unreached tail', () => {
  const { screen, onComplete } = start();
  fireEvent.press(screen.getByTestId('story-end'));
  expect(screen.getByText("0 marked. The 3 not marked won't count towards the score.")).toBeTruthy();
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Keep marking'));
  expect(screen.getByLabelText(`${SET.questions[0].prompt}, current`)).toBeTruthy();
  fireEvent.press(screen.getByTestId('story-end'));
  fireEvent.press(screen.getByText('End question'));
  const result = onComplete.mock.calls[0][0];
  expect(result.items.every((i: any) => !i.is_correct && !i.metadata.reached && !i.metadata.asked)).toBe(true);
  expect(result.derived).toMatchObject({ percent: 0, total_attempted: 0, questions_asked: 0, last_attempted_position: -1 });
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
});
test('a reached answer can be flipped before ending with one question unreached', () => {
  const { screen, onComplete } = start();
  fireEvent.press(screen.getByText('Incorrect'));
  fireEvent.press(screen.getByTestId('tile-0'));
  fireEvent.press(screen.getByText('Incorrect'));
  fireEvent.press(screen.getByTestId('story-end'));
  expect(screen.getByText("2 marked. The 1 not marked won't count towards the score.")).toBeTruthy();
  fireEvent.press(screen.getByText('End question'));
  expect(onComplete.mock.calls[0][0].derived).toMatchObject({ total_correct: 1, total_attempted: 2, correction_count: 1 });
});
test('skip emits no items', () => {
  const { screen, onComplete } = start();
  fireEvent.press(screen.getByText('Skip question'));
  fireEvent.press(screen.getByText('Child is tired'));
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'skipped_tired', items: [], derived: { total_attempted: 0 } });
});
test.each([undefined, {}, { ...SET, questions: [{ item_key: '0', prompt: 'test' }] }])('missing or invalid item set has no bundled fallback', itemSet => {
  const screen = render(<ReadingComprehensionQuestion language="en" itemSet={itemSet} onComplete={jest.fn()} />);
  expect(screen.queryByText('Ask the questions')).toBeNull();
  expect(screen.getByTestId('missing-item-set-en')).toBeTruthy();
});
