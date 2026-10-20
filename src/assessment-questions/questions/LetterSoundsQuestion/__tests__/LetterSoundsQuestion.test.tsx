import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import { LetterSoundsQuestion } from '..';
import { FIXTURE_LETTER_SOUNDS_EN } from '../../../testFixtures';
import { tokens } from '../../../theme/tokens';

const SET = {
  item_set_id: 'letter_sounds@fixture.en', question_code: 'letter_sounds',
  question_version: 'fixture', language: 'en', stop_rule: null,
  rows: [['a', 'n', 'i', 't'], ['m', 's', 'p', 'e']],
};

function startQ(onComplete = jest.fn(), durationSec?: number) {
  const r = render(<LetterSoundsQuestion language="en" itemSet={SET} instructions="." durationSec={durationSec} onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  return { r, onComplete };
}

function fontSizeOf(node: { props: { style?: unknown } }): number | undefined {
  const flat = StyleSheet.flatten(node.props.style) as
    | { fontSize?: number }
    | undefined;
  return flat?.fontSize;
}

describe('LetterSoundsQuestion — intro phase', () => {
  test('renders the instructions text and a Start button on mount', () => {
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="Tap each letter the child gets right. Stop if the child gets a whole row wrong."
        onComplete={jest.fn()}
      />,
    );

    expect(
      getByText(/Tap each letter the child gets right/),
    ).toBeTruthy();
    expect(getByText('Start')).toBeTruthy();
  });
});

describe('LetterSoundsQuestion — active phase grid', () => {
  test('Start transitions to active phase and renders letters from the English fixture', () => {
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );

    fireEvent.press(getByText('Start'));

    expect(getByText('a')).toBeTruthy();
    expect(getByText('b')).toBeTruthy();
  });

  test('tapping a letter marks it correct (accessibility label flips)', () => {
    const { getByText, getByLabelText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    expect(getByLabelText('a, idle')).toBeTruthy();
    fireEvent.press(getByLabelText('a, idle'));
    expect(getByLabelText('a, correct')).toBeTruthy();
  });

  test('second tap on the same letter clears the mark back to idle', () => {
    const { getByText, getByLabelText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    fireEvent.press(getByLabelText('a, idle'));
    fireEvent.press(getByLabelText('a, correct'));
    expect(getByLabelText('a, idle')).toBeTruthy();
  });
});

describe('LetterSoundsQuestion — timer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('expires after durationSec and emits a contract-valid Result with stopped_reason=timer', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));

    act(() => {
      jest.advanceTimersByTime(60000);
    });
    fireEvent.press(getByText('Reached the end'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.stopped_reason).toBe('timer');
    expect(result.derived.was_timed).toBe(true);
    expect(typeof result.derived.last_attempted_position).toBe('number');
    expect(result.question_code).toBe('letter_sounds');
    expect(result.language).toBe('en');
  });

  test('does not double-emit if the timer is somehow advanced twice', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));

    act(() => {
      jest.advanceTimersByTime(120000);
    });
    fireEvent.press(getByText('Reached the end'));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('LetterSoundsQuestion — End button and finalization', () => {
  test('pressing End during active phase emits a Result with stopped_reason=ea_ended', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Reached the end'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.stopped_reason).toBe('ea_ended');
    expect(result.derived.was_timed).toBe(true);
  });

  test('total_correct reflects the number of letters marked correct', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('a, idle'));
    fireEvent.press(getByLabelText('b, idle'));
    fireEvent.press(getByLabelText('c, idle'));
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Reached the end'));

    expect(onComplete.mock.calls[0][0].derived.total_correct).toBe(3);
  });
});

test('renders every letter at once in item-set rows, no Next/Prev', () => {
  const { r } = startQ();
  for (const l of SET.rows.flat()) expect(r.getAllByText(l).length).toBeGreaterThan(0);
  expect(r.queryByText('Next')).toBeNull();
  expect(r.getAllByTestId(/^letter-row-/)).toHaveLength(2);
});

test('unequal item-set rows preserve visual rows and flattened marking positions', () => {
  const onComplete = jest.fn();
  const r = render(
    <LetterSoundsQuestion
      language="en"
      itemSet={{ ...SET, rows: [['a', 'b'], ['c', 'a', 'd'], ['e']] }}
      onComplete={onComplete}
    />,
  );
  fireEvent.press(r.getByText('Start'));
  const rows = r.getAllByTestId(/^letter-row-/);
  expect(rows).toHaveLength(3);
  expect(rows.map((row) => within(row).getAllByRole('button').length)).toEqual([2, 3, 1]);
  fireEvent.press(within(rows[1]).getByLabelText('a, idle'));
  expect(within(rows[0]).getByLabelText('a, idle')).toBeTruthy();
  fireEvent.press(r.getByText('End'));
  fireEvent.press(r.getByLabelText('d, item 5'));
  fireEvent.press(r.getByText('Confirm'));
  const result = onComplete.mock.calls[0][0];
  expect(result.items.map((item: { prompt: string }) => item.prompt)).toEqual(['a', 'b', 'c', 'a', 'd', 'e']);
  expect(result.items[0].is_correct).toBe(false);
  expect(result.items[3]).toMatchObject({ position: 3, prompt: 'a', is_correct: true });
  expect(result.derived.total_correct).toBe(1);
  expect(result.derived.total_attempted).toBe(5);
});

test('End opens the marker; picking item 5 scores positions 0..4 only', () => {
  const { r, onComplete } = startQ();
  fireEvent.press(r.getByLabelText('a, idle'));
  fireEvent.press(r.getByLabelText('p, idle')); // position 6, beyond the marker
  fireEvent.press(r.getByText('End'));
  fireEvent.press(r.getByLabelText('m, item 5'));
  fireEvent.press(r.getByText('Confirm'));
  const res = onComplete.mock.calls[0][0];
  expect(res.stopped_reason).toBe('ea_ended');
  expect(res.derived.last_attempted_position).toBe(4);
  expect(res.derived.total_attempted).toBe(5);
  expect(res.derived.total_correct).toBe(1);
  expect(res.derived.tracks_progress).toBe(true);
  expect(res.items[6]).toMatchObject({ is_correct: false, metadata: { reached: false } });
});

test('cancel on the End marker returns to marking with marks intact', () => {
  const { r, onComplete } = startQ();
  fireEvent.press(r.getByLabelText('a, idle'));
  fireEvent.press(r.getByText('End'));
  fireEvent.press(r.getByText('Cancel'));
  expect(onComplete).not.toHaveBeenCalled();
  expect(r.getByLabelText('a, correct')).toBeTruthy();
});

test('timer opens a non-cancellable marker; taps underneath are ignored; one onComplete', () => {
  jest.useFakeTimers();
  const { r, onComplete } = startQ(jest.fn(), 1);
  act(() => { jest.advanceTimersByTime(1300); });
  expect(r.queryByText('Cancel')).toBeNull();
  expect(r.queryByLabelText('a, idle')).toBeNull(); // the marking grid is no longer interactive
  fireEvent.press(r.getByText('Reached the end'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0].stopped_reason).toBe('timer');
  expect(onComplete.mock.calls[0][0].derived.last_attempted_position).toBe(7);
  jest.useRealTimers();
});

test('Nothing attempted gives -1 and zero attempted', () => {
  const { r, onComplete } = startQ();
  fireEvent.press(r.getByText('End'));
  fireEvent.press(r.getByText('Nothing attempted'));
  const d = onComplete.mock.calls[0][0].derived;
  expect(d.last_attempted_position).toBe(-1);
  expect(d.total_attempted).toBe(0);
  expect(d.percent).toBe(0);
});

describe('LetterSoundsQuestion — fixed marking font', () => {
  test('letter font size uses tokens.font.markingItem', () => {
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    expect(fontSizeOf(getByText('a'))).toBe(tokens.font.markingItem);
  });
});

describe('LetterSoundsQuestion — duration_ms wall-clock accuracy', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('duration_ms reflects wall-clock elapsed when End fires under 1 second', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));

    act(() => {
      jest.advanceTimersByTime(500);
    });
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Reached the end'));

    const { duration_ms } = onComplete.mock.calls[0][0];
    expect(duration_ms).toBeGreaterThanOrEqual(500);
    expect(duration_ms).toBeLessThan(1000);
  });
});

describe('LetterSoundsQuestion — onItemMarked callback', () => {
  test('fires onItemMarked with the item shape when a letter is tapped', () => {
    const onItemMarked = jest.fn();
    const { getByText, getByLabelText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        onComplete={jest.fn()}
        onItemMarked={onItemMarked}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('a, idle'));

    expect(onItemMarked).toHaveBeenCalledTimes(1);
    const item = onItemMarked.mock.calls[0][0];
    expect(item.item_key).toBe('a');
    expect(item.prompt).toBe('a');
    expect(item.is_correct).toBe(true);
    expect(typeof item.position).toBe('number');
  });

  test('fires onItemMarked again when a letter is unmarked', () => {
    const onItemMarked = jest.fn();
    const { getByText, getByLabelText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        onComplete={jest.fn()}
        onItemMarked={onItemMarked}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('a, idle'));
    fireEvent.press(getByLabelText('a, correct'));

    expect(onItemMarked).toHaveBeenCalledTimes(2);
    expect(onItemMarked.mock.calls[1][0].is_correct).toBe(false);
  });
});

describe('LetterSoundsQuestion — visible mark + grid layout', () => {
  test('marked letter has a visually distinct backgroundColor from idle', () => {
    const { getByText, getByLabelText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    const idleBg = StyleSheet.flatten(
      (getByLabelText('a, idle') as { props: { style?: unknown } }).props.style,
    ) as { backgroundColor?: string } | undefined;
    fireEvent.press(getByLabelText('a, idle'));
    const markedBg = StyleSheet.flatten(
      (getByLabelText('a, correct') as { props: { style?: unknown } }).props.style,
    ) as { backgroundColor?: string } | undefined;

    expect(markedBg?.backgroundColor).toBeTruthy();
    expect(markedBg?.backgroundColor).not.toBe(idleBg?.backgroundColor);
  });

  test('active-phase letter rows lay out children horizontally', () => {
    const { getByText, getByTestId } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    const row = getByTestId('letter-row-0');
    const style = StyleSheet.flatten(row.props.style) as {
      flexDirection?: string;
    };
    expect(style.flexDirection).toBe('row');
  });
});

describe('LetterSoundsQuestion — itemSet override validation', () => {
  test('falls back to bundled default when override lacks item_set_id', () => {
    const onComplete = jest.fn();
    const incomplete = {
      rows: [['fixture-only-invalid-letter']],
      stop_rule: null,
    };
    const { getByText, queryByText } = render(
      <LetterSoundsQuestion
        language="en"
        instructions="."
        durationSec={60}
        itemSet={incomplete}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(queryByText('fixture-only-invalid-letter')).toBeNull();
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Reached the end'));

    expect(onComplete.mock.calls[0][0].item_set_id).toBeDefined();
  });

  test('accepts a fully-formed override', () => {
    const onComplete = jest.fn();
    const goodOverride = {
      item_set_id: 'custom@1.0.en',
      question_code: 'custom',
      language: 'en',
      question_version: '1.0',
      rows: [['x', 'y']],
      stop_rule: null,
    };
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        instructions="."
        durationSec={60}
        itemSet={goodOverride}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('x')).toBeTruthy();
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Reached the end'));

    expect(onComplete.mock.calls[0][0].item_set_id).toBe('custom@1.0.en');
  });
});

describe('LetterSoundsQuestion — fixture item set hygiene', () => {
  test('fixture item_set_id is clearly marked as fixture', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        itemSet={FIXTURE_LETTER_SOUNDS_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Reached the end'));

    const { item_set_id } = onComplete.mock.calls[0][0];
    expect(item_set_id).toBe('letter_sounds@fixture.en');
  });
});
