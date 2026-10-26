import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { WELA_PLUS_FULL_2026_1 as B } from '../wela_plus_full_2026_1';
import { questionComponentFor } from '../questionComponents';
import { sharedItemSetFor } from '../../egra/sharedReading';
import { validateResult } from '../../contractTest/validateResult';

function expectDeepFrozen(value: unknown): void {
  if (value && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(expectDeepFrozen);
  }
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test.each([
  { index: 0, component: 'LetterSoundsQuestion', prefix: 'letter' },
  { index: 5, component: 'ReadWordsQuestion', prefix: 'word' },
  { index: 7, component: 'ReadPassageQuestion', prefix: 'passage' },
  { index: 8, component: 'ReadingComprehensionQuestion', prefix: 'story' },
])('$component marks, corrects and saves with the real frozen shared xh set without mutating it', ({ index, prefix }) => {
  const question = B.questions[index];
  const itemSet = sharedItemSetFor(question.question_code, question.question_version, 'xh')!;
  expect(itemSet).not.toBeNull();
  expectDeepFrozen(itemSet);
  const before = JSON.parse(JSON.stringify(itemSet));
  const { Component, extraProps } = questionComponentFor(question.question_code)!;
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const screen = render(<Component {...extraProps} language="xh" itemSet={itemSet}
    durationSec={question.durationSec} instructions={question.instructions!.xh}
    onComplete={onComplete} onItemMarked={onItemMarked} />);

  fireEvent.press(screen.getByRole('button', { name: prefix === 'story' ? 'Ask the questions' : 'Start' }));
  for (const name of ['Correct', 'Incorrect', 'Back', 'Correct', 'Incorrect']) {
    fireEvent.press(screen.getByRole('button', { name }));
  }
  expect(onItemMarked).toHaveBeenCalledTimes(4);
  expect(onComplete).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1000));
  fireEvent.press(screen.getByTestId(`${prefix}-end`));
  fireEvent.press(within(screen.getByTestId('end-confirmation')).getByText('End question'));

  expect(onComplete).toHaveBeenCalledTimes(1);
  const result = onComplete.mock.calls[0][0];
  expect(result).toMatchObject({
    question_code: question.question_code, question_version: '2026.3', language: 'xh',
    item_set_id: itemSet.item_set_id, stopped_reason: 'ea_ended',
    derived: { total_attempted: 3, total_correct: 2, correction_count: 1 },
  });
  expect(result.items.slice(0, 3).map((item: { is_correct: boolean }) => item.is_correct)).toEqual([true, true, false]);
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
  screen.unmount();
  expect(itemSet).toEqual(before);
  expectDeepFrozen(itemSet);
});
