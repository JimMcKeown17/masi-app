import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import {
  WELA_PLUS_FULL_2024_1,
  bundledItemSetFor,
  questionComponentFor,
} from '../index';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const CASES = WELA_PLUS_FULL_2024_1.questions.flatMap(question =>
  WELA_PLUS_FULL_2024_1.languages.map(language => ({
    code: question.question_code,
    question,
    language,
  })));

test.each(CASES)('$code/$language reports its first capture start once and preserves skip provenance', ({
  question, language,
}) => {
  const entry = questionComponentFor(question.question_code)!;
  const itemSet = bundledItemSetFor(question.question_code, question.question_version, language)!;
  expect(entry).not.toBeNull();
  expect(itemSet).not.toBeNull();
  const { Component, extraProps } = entry;
  const onStart = jest.fn();
  const onComplete = jest.fn();
  const props = {
    ...extraProps,
    language,
    itemSet,
    instructions: question.instructions![language],
    durationSec: question.durationSec,
    onStart,
    onComplete,
  };
  const screen = render(<Component {...props} />);
  expect(onStart).not.toHaveBeenCalled();
  screen.rerender(<Component {...props} />);
  expect(onStart).not.toHaveBeenCalled();

  const start = screen.queryByRole('button', { name: 'Start' })
    ?? screen.getByRole('button', { name: "I've finished reading" });
  fireEvent.press(start);
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
  screen.rerender(<Component {...props} />);
  expect(onStart).toHaveBeenCalledTimes(1);

  fireEvent.press(screen.getByRole('button', { name: 'Skip question' }));
  expect(onStart).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Skip question' }));
  fireEvent.press(screen.getByRole('button', { name: 'Other' }));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0]).toMatchObject({
    item_set_id: itemSet.item_set_id,
    question_code: itemSet.question_code,
    question_version: itemSet.question_version,
    language,
    stopped_reason: 'skipped_other',
    items: [],
  });
  screen.rerender(<Component {...props} />);
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test.each(WELA_PLUS_FULL_2024_1.languages)(
  'story/%s re-reading, review cancellation and completion never report another capture start', language => {
    const question = WELA_PLUS_FULL_2024_1.questions[1];
    const { Component, extraProps } = questionComponentFor(question.question_code)!;
    const itemSet = bundledItemSetFor(question.question_code, question.question_version, language)!;
    const onStart = jest.fn();
    const onComplete = jest.fn();
    const screen = render(<Component {...extraProps} language={language} itemSet={itemSet}
      instructions={question.instructions![language]} onStart={onStart} onComplete={onComplete} />);
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: "I've finished reading" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Re-read story' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
    fireEvent.press(screen.getByRole('button', { name: 'Yes, finish' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('completed');
    expect(onStart).toHaveBeenCalledTimes(1);
  },
);

test.each(WELA_PLUS_FULL_2024_1.languages)(
  'sequential word reading/%s retains its existing single onStart callback', language => {
    const { Component, extraProps } = questionComponentFor('word_reading')!;
    const itemSet = bundledItemSetFor('word_reading', '2026.1', language)!;
    const onStart = jest.fn();
    const onComplete = jest.fn();
    const props = { ...extraProps, language, itemSet, onStart, onComplete };
    const screen = render(<Component {...props} />);
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    screen.rerender(<Component {...props} />);
    expect(onStart).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Skip question' }));
    fireEvent.press(screen.getByRole('button', { name: 'Other' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      item_set_id: itemSet.item_set_id,
      question_code: itemSet.question_code,
      question_version: itemSet.question_version,
      stopped_reason: 'skipped_other',
    });
    expect(onStart).toHaveBeenCalledTimes(1);
  },
);
