import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
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
test('assessor selects three explicit states, changes a choice, and views the story without grading it', () => {
  const { screen, onComplete, onStart } = start();
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  expect(screen.getByText(`Answer guide: ${SET.questions[0].answer_guide}`)).toBeTruthy();
  const first = within(screen.getByTestId('comprehension-0'));
  fireEvent.press(first.getByRole('button', { name: 'Wrong' }));
  expect(first.getByRole('button', { name: 'Wrong' }).props.accessibilityState.selected).toBe(true);
  fireEvent.press(first.getByRole('button', { name: 'Correct' }));
  expect(first.getByRole('button', { name: 'Wrong' }).props.accessibilityState.selected).toBe(false);
  fireEvent.press(within(screen.getByTestId('comprehension-1')).getByText('Wrong'));
  fireEvent.press(within(screen.getByTestId('comprehension-2')).getByText('Not asked'));
  fireEvent.press(screen.getByText('Show story'));
  expect(screen.getByText(SET.passage)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Close'));
  fireEvent.press(screen.getByText('Finish'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  const result = onComplete.mock.calls[0][0];
  expect(result.items.map((i: any) => [i.response, i.is_correct, i.metadata.asked])).toEqual([
    ['correct', true, true], ['incorrect', false, true], ['not_asked', false, false],
  ]);
  expect(result.derived).toEqual({ total_correct: 1, total_attempted: 2, percent: 50, last_attempted_position: null, was_timed: false, tracks_progress: false, questions_asked: 2 });
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
});
test('unmarked questions require confirmation and save as Not asked', () => {
  const { screen, onComplete } = start();
  fireEvent.press(screen.getByText('Finish'));
  expect(screen.getByText('3 questions not marked. Save them as Not asked?')).toBeTruthy();
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Cancel'));
  fireEvent.press(screen.getByText('Finish'));
  fireEvent.press(screen.getByText('Save as Not asked'));
  expect(onComplete.mock.calls[0][0].items.every((i: any) => i.response === 'not_asked' && !i.metadata.asked)).toBe(true);
  expect(onComplete.mock.calls[0][0].derived.percent).toBe(0);
});
test('one unmarked question uses singular copy', () => {
  const { screen } = start();
  fireEvent.press(within(screen.getByTestId('comprehension-0')).getByText('Correct'));
  fireEvent.press(within(screen.getByTestId('comprehension-1')).getByText('Wrong'));
  fireEvent.press(screen.getByText('Finish'));
  expect(screen.getByText('1 question not marked. Save it as Not asked?')).toBeTruthy();
});
test('skip emits no items', () => {
  const { screen, onComplete } = start();
  fireEvent.press(screen.getByText('Skip question'));
  fireEvent.press(screen.getByText('Child tired'));
  expect(onComplete.mock.calls[0][0]).toMatchObject({ stopped_reason: 'skipped_tired', items: [], derived: { total_attempted: 0 } });
});
test.each([undefined, {}, { ...SET, questions: [{ item_key: '0', prompt: 'test' }] }])('missing or invalid item set has no bundled fallback', itemSet => {
  const screen = render(<ReadingComprehensionQuestion language="en" itemSet={itemSet} onComplete={jest.fn()} />);
  expect(screen.queryByText('Ask the questions')).toBeNull();
  expect(screen.getByTestId('missing-item-set-en')).toBeTruthy();
});
