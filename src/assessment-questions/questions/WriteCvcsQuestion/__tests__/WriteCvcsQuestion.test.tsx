import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WriteCvcsQuestion } from '..';
import { FIXTURE_WRITE_CVCS_EN } from '../../../testFixtures';

const SET = {
  item_set_id: 'wela_plus_write_cvcs@fixture.xh', question_code: 'wela_plus_write_cvcs',
  question_version: 'fixture', language: 'xh',
  words: [
    { item_key: 'w1', word: 'lala', letters: ['l', 'a', 'l', 'a'] },
    { item_key: 'w3', word: 'imali', letters: ['m', 'a', 'l', 'i'] },
  ],
};

test('one item per scoring letter, prefix excluded, per-word totals', () => {
  const onComplete = jest.fn();
  const r = render(<WriteCvcsQuestion language="xh" itemSet={SET} instructions="." onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  expect(r.getByText('1. lala')).toBeTruthy();
  fireEvent.press(r.getByLabelText('lala letter 1 l, idle'));
  fireEvent.press(r.getByLabelText('imali letter 4 i, idle'));
  fireEvent.press(r.getByText('Finish'));
  const confirm = r.queryByText('Yes, finish');
  if (confirm) fireEvent.press(confirm);
  const res = onComplete.mock.calls[0][0];
  expect(res.items).toHaveLength(8);
  expect(res.items[7]).toMatchObject({ position: 7, item_key: 'w3.l4', prompt: 'i', is_correct: true, metadata: { word: 'imali', word_index: 1, letter_index: 3 } });
  expect(res.derived.total_correct).toBe(2);
  expect(res.derived.total_attempted).toBe(8);
  expect(res.derived.per_word).toEqual([{ word: 'lala', correct: 1, total: 4 }, { word: 'imali', correct: 1, total: 4 }]);
});

describe('WriteCvcsQuestion — intro & active', () => {
  test('Start renders four numbered word rows in a vertical scroller', () => {
    const { getByText, getByTestId } = render(
      <WriteCvcsQuestion
        language="en"
        itemSet={FIXTURE_WRITE_CVCS_EN}
        instructions="Dictate each CVC; tap if child wrote it correctly."
        onComplete={jest.fn()}
      />,
    );
    expect(getByText(/Dictate each CVC/)).toBeTruthy();
    fireEvent.press(getByText('Start'));
    expect(getByText('1. jam')).toBeTruthy();
    expect(getByText('4. net')).toBeTruthy();
    const scroller = getByTestId('prompt-scroll');
    expect(scroller.props.horizontal).not.toBe(true);
  });
});

describe('WriteCvcsQuestion — marking', () => {
  test('tap a scoring-letter cell marks it correct, second tap clears', () => {
    const { getByText, getByLabelText } = render(
      <WriteCvcsQuestion
        language="en"
        itemSet={FIXTURE_WRITE_CVCS_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('jam letter 1 j, idle'));
    expect(getByLabelText('jam letter 1 j, correct')).toBeTruthy();
    fireEvent.press(getByLabelText('jam letter 1 j, correct'));
    expect(getByLabelText('jam letter 1 j, idle')).toBeTruthy();
  });
});

describe('WriteCvcsQuestion — Finish flow', () => {
  test('Finish all-marked emits Result with stopped_reason=completed and was_timed=false', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <WriteCvcsQuestion
        language="en"
        itemSet={FIXTURE_WRITE_CVCS_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    FIXTURE_WRITE_CVCS_EN.words.forEach((word) =>
      word.letters.forEach((letter, letterIndex) =>
        fireEvent.press(
          getByLabelText(
            `${word.word} letter ${letterIndex + 1} ${letter}, idle`,
          ),
        ),
      ),
    );
    fireEvent.press(getByText('Finish'));
    const r = onComplete.mock.calls[0][0];
    expect(r.question_code).toBe('wela_plus_write_cvcs');
    expect(r.stopped_reason).toBe('completed');
    expect(r.derived.total_correct).toBe(12);
    expect(r.derived.total_attempted).toBe(12);
    expect(r.derived.was_timed).toBe(false);
    expect(r.derived.per_word).toEqual([
      { word: 'jam', correct: 3, total: 3 },
      { word: 'hut', correct: 3, total: 3 },
      { word: 'fin', correct: 3, total: 3 },
      { word: 'net', correct: 3, total: 3 },
    ]);
  });

  test('Finish counts unmarked letters; Cancel preserves marks; Yes finishes', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <WriteCvcsQuestion
        language="en"
        itemSet={FIXTURE_WRITE_CVCS_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('jam letter 1 j, idle'));
    fireEvent.press(getByText('Finish'));
    expect(getByText(/11 items unmarked/i)).toBeTruthy();
    fireEvent.press(getByText('Cancel'));
    expect(getByLabelText('jam letter 1 j, correct')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));
    expect(onComplete.mock.calls[0][0].derived.total_correct).toBe(1);
    expect(onComplete.mock.calls[0][0].derived.total_attempted).toBe(12);
  });
});

describe('WriteCvcsQuestion — Skip flow', () => {
  test('Skip emits skipped_* stopped_reason', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <WriteCvcsQuestion
        language="en"
        itemSet={FIXTURE_WRITE_CVCS_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Skip question'));
    fireEvent.press(getByText('Out of time'));
    const result = onComplete.mock.calls[0][0];
    expect(result.stopped_reason).toBe('skipped_time');
    expect(result.items).toEqual([]);
    expect(result.derived.per_word).toEqual([]);
  });
});

describe('WriteCvcsQuestion — itemSet override', () => {
  test('falls back to bundled default when letters are empty', () => {
    const { getByText, queryByText } = render(
      <WriteCvcsQuestion
        language="en"
        instructions="."
        itemSet={{
          item_set_id: 'bad@1.en',
          question_version: '1',
          words: [{ item_key: 'k', word: 'foo', letters: [] }],
        }}
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(queryByText('1. foo')).toBeNull();
    expect(getByText('1. jam')).toBeTruthy();
  });
});
