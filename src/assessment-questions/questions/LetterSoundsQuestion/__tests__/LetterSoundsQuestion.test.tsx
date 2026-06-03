import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { LetterSoundsQuestion } from '..';
import { ChildReadingFontSizeProvider } from '../../../hooks/useChildReadingFontSize';

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
  test('Start transitions to active phase and renders letters from the bundled English item set', () => {
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
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
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));

    act(() => {
      jest.advanceTimersByTime(60000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.stopped_reason).toBe('timer');
    expect(result.derived.was_timed).toBe(true);
    expect(typeof result.derived.last_attempted_position).toBe('number');
    expect(result.question_code).toBe('wela_plus_letter_sounds');
    expect(result.language).toBe('en');
  });

  test('does not double-emit if the timer is somehow advanced twice', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));

    act(() => {
      jest.advanceTimersByTime(120000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('LetterSoundsQuestion — End button and finalization', () => {
  test('pressing End during active phase emits a Result with stopped_reason=ea_ended', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('End'));

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

    expect(onComplete.mock.calls[0][0].derived.total_correct).toBe(3);
  });
});

describe('LetterSoundsQuestion — pagination', () => {
  test('Next advances to a second page showing later letters', () => {
    const { getByText, queryByText } = render(
      <LetterSoundsQuestion
        language="en"
        instructions="."
        durationSec={60}
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    expect(queryByText('u')).toBeNull();
    fireEvent.press(getByText('Next'));
    expect(getByText('u')).toBeTruthy();
    expect(queryByText('a')).toBeNull();
  });

  test('Prev returns to the previous page', () => {
    const { getByText, queryByText } = render(
      <LetterSoundsQuestion
        language="en"
        instructions="."
        durationSec={60}
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Next'));
    fireEvent.press(getByText('Prev'));

    expect(getByText('a')).toBeTruthy();
    expect(queryByText('u')).toBeNull();
  });

  test('last_attempted_position reflects the last visible index on the highest page visited', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Next'));
    fireEvent.press(getByText('End'));

    // Bundled English set has 25 letters; on page 2 the last visible index is 24
    expect(onComplete.mock.calls[0][0].derived.last_attempted_position).toBe(24);
  });
});

describe('LetterSoundsQuestion — childReadingFontSize token', () => {
  test('letter font size scales with the provider value (2.0x = double)', () => {
    const props = {
      language: 'en',
      instructions: '.',
      onComplete: jest.fn(),
    } as const;

    const { getByText: get1 } = render(<LetterSoundsQuestion {...props} />);
    fireEvent.press(get1('Start'));
    const baseSize = fontSizeOf(get1('a'));

    const { getByText: get2 } = render(
      <ChildReadingFontSizeProvider value={2.0}>
        <LetterSoundsQuestion {...props} />
      </ChildReadingFontSizeProvider>,
    );
    fireEvent.press(get2('Start'));
    const scaledSize = fontSizeOf(get2('a'));

    expect(baseSize).toBeGreaterThan(0);
    expect(scaledSize).toBe((baseSize as number) * 2);
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

  test('active-phase container lays out children as a row-wrapped grid', () => {
    const { getByText, getByTestId } = render(
      <LetterSoundsQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    const grid = getByTestId('letter-grid');
    const style = StyleSheet.flatten(grid.props.style) as {
      flexDirection?: string;
      flexWrap?: string;
    };
    expect(style.flexDirection).toBe('row');
    expect(style.flexWrap).toBe('wrap');
  });
});

describe('LetterSoundsQuestion — itemSet override validation', () => {
  test('falls back to bundled default when override lacks item_set_id', () => {
    const onComplete = jest.fn();
    const incomplete = { letters: ['z'], lettersPerPage: 1, columns: 1 };
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        instructions="."
        durationSec={60}
        itemSet={incomplete}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('a')).toBeTruthy();
    fireEvent.press(getByText('End'));

    expect(onComplete.mock.calls[0][0].item_set_id).toMatch(
      /^wela_plus_letter_sounds@stub/,
    );
  });

  test('accepts a fully-formed override', () => {
    const onComplete = jest.fn();
    const goodOverride = {
      item_set_id: 'custom@1.0.en',
      question_version: '1.0',
      letters: ['x', 'y'],
      lettersPerPage: 20,
      columns: 5,
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

    expect(onComplete.mock.calls[0][0].item_set_id).toBe('custom@1.0.en');
  });
});

describe('LetterSoundsQuestion — stub item set hygiene', () => {
  test('bundled stub item_set_id is clearly marked as stub (not the real WelaPLUS version)', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <LetterSoundsQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('End'));

    const { item_set_id } = onComplete.mock.calls[0][0];
    expect(item_set_id).toMatch(/stub/i);
  });
});
