import React from 'react';
import { StyleSheet } from 'react-native';
import { tokens } from '../../../theme/tokens';
import { render, fireEvent, within, act } from '@testing-library/react-native';
import { FollowScrollView } from '../../../ui/FollowScrollView';
import { Countdown } from '../../../progress/Countdown';
import { validateResult } from '../../../contractTest/validateResult';
import { ListenFirstSoundQuestion } from '..';
import { FIXTURE_FIRST_SOUND_EN } from '../../../testFixtures';

test('Q3: Start shows the ring on the first word and Word 1 of 10', () => {
  const r = render(<ListenFirstSoundQuestion language="en" itemSet={FIXTURE_FIRST_SOUND_EN} onComplete={jest.fn()} />);
  fireEvent.press(r.getByText('Start'));
  const body = within(r.getByTestId('prompt-scroll'));
  expect(r.getByLabelText('apple, current').props.accessibilityState).toEqual({ selected: true });
  expect(within(body.getByTestId('tile-0')).getByTestId('current-ring', { includeHiddenElements: true }))
    .toHaveStyle({ borderWidth: 3, borderColor: tokens.color.ink });
  expect(body.getByTestId('tile-1')).toHaveStyle({ opacity: 0.55 });
  expect(r.getByText('Word 1 of 10')).toBeTruthy();
});

test('Q3: ten Correct then Finish saves 10 / 10 with every item reached', () => {
  const onComplete = jest.fn();
  const r = render(<ListenFirstSoundQuestion language="en" itemSet={FIXTURE_FIRST_SOUND_EN} onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  for (let i = 0; i < 10; i += 1) fireEvent.press(r.getByText('Correct'));
  expect(onComplete).not.toHaveBeenCalled();
  expect(r.getByText('All 10 marked · 10 correct. Tap any word to change it.')).toBeTruthy();
  fireEvent.press(r.getByText('Finish'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  const result = onComplete.mock.calls[0][0];
  expect(result.stopped_reason).toBe('completed');
  expect(result.derived).toMatchObject({ total_correct: 10, total_attempted: 10, percent: 100,
    last_attempted_position: 9, tracks_progress: true, capture_mode: 'sequential', correction_count: 0, max_consecutive_wrong: 0 });
  expect(result.items).toEqual(FIXTURE_FIRST_SOUND_EN.prompts.map((p, position) => ({
    ...p, position, is_correct: true, metadata: { reached: true },
  })));
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
});

test('Q3: End after two marks saves ea_ended with total_attempted 2', () => {
  const onComplete = jest.fn();
  const r = render(<ListenFirstSoundQuestion language="en" itemSet={FIXTURE_FIRST_SOUND_EN} onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(r.getByText('Incorrect'));
  fireEvent.press(r.getByTestId('first-sound-end'));
  expect(r.getByText("2 marked. The 8 not marked won't count towards the score.")).toBeTruthy();
  fireEvent.press(r.getByText('End question'));
  const result = onComplete.mock.calls[0][0];
  expect(result.stopped_reason).toBe('ea_ended');
  expect(result.derived).toMatchObject({ total_correct: 1, total_attempted: 2, percent: 50, last_attempted_position: 1 });
  expect(result.items.map((item: any) => [item.is_correct, item.metadata.reached])).toEqual([
    [true, true], [false, true], ...Array.from({ length: 8 }, () => [false, false]),
  ]);
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
});

test('Q3: prompt cards keep padding lg, gap 10, radius tile, and turn solid green when marked', () => {
  const r = render(<ListenFirstSoundQuestion language="en" itemSet={FIXTURE_FIRST_SOUND_EN} onComplete={jest.fn()} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByText('Correct'));
  const scroller = r.getByTestId('prompt-scroll');
  expect(scroller.props.horizontal).not.toBe(true);
  expect(StyleSheet.flatten(r.UNSAFE_getByType(FollowScrollView).props.contentContainerStyle))
    .toMatchObject({ padding: tokens.space.lg, gap: 10 });
  expect(within(scroller).getByTestId('tile-0')).toHaveStyle({ borderRadius: tokens.radius.tile,
    alignSelf: 'stretch', backgroundColor: tokens.color.marked, borderColor: tokens.color.marked });
  expect(r.getByText('apple')).toHaveStyle({ color: tokens.color.onMarked });
});

test('Q3: was_timed is false even when the host passes durationSec', () => {
  jest.useFakeTimers();
  try {
    const onComplete = jest.fn();
    const r = render(<ListenFirstSoundQuestion language="en" durationSec={60} itemSet={FIXTURE_FIRST_SOUND_EN} onComplete={onComplete} />);
    fireEvent.press(r.getByText('Start'));
    expect(r.UNSAFE_queryByType(Countdown)).toBeNull();
    act(() => jest.advanceTimersByTime(61000));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(r.getByTestId('first-sound-end'));
    fireEvent.press(r.getByText('End question'));
    expect(onComplete.mock.calls[0][0].derived.was_timed).toBe(false);
  } finally { jest.useRealTimers(); }
});

describe('ListenFirstSoundQuestion — intro and active phases', () => {
  test('renders instructions + Start; Start transitions to active showing prompts', () => {
    const { getByText } = render(
      <ListenFirstSoundQuestion
        language="en"
        itemSet={FIXTURE_FIRST_SOUND_EN}
        instructions="Read each word aloud; child says first sound."
        onComplete={jest.fn()}
      />,
    );

    expect(getByText(/Read each word aloud/)).toBeTruthy();
    fireEvent.press(getByText('Start'));
    expect(getByText('apple')).toBeTruthy();
    expect(getByText('jug')).toBeTruthy();
  });

  test('Correct marks the current prompt and advances the ring', () => {
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        itemSet={FIXTURE_FIRST_SOUND_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    expect(getByLabelText('apple, current')).toBeTruthy();
    fireEvent.press(getByText('Correct'));
    expect(getByLabelText('apple, correct. Double-tap to change to incorrect')).toBeTruthy();
  });

  test('tap on a marked prompt flips it to Incorrect', () => {
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        itemSet={FIXTURE_FIRST_SOUND_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByLabelText('apple, correct. Double-tap to change to incorrect'));
    expect(getByLabelText('apple, incorrect. Double-tap to change to correct')).toBeTruthy();
  });
});

describe('ListenFirstSoundQuestion — review and End flow', () => {
  test('End before any marks shows the count excluded from scoring', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ListenFirstSoundQuestion
        language="en"
        itemSet={FIXTURE_FIRST_SOUND_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('End question'));

    expect(getByText("0 marked. The 10 not marked won't count towards the score.")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('Keep marking returns from End confirmation without emitting', () => {
    const onComplete = jest.fn();
    const { getByText, queryByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        itemSet={FIXTURE_FIRST_SOUND_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('Keep marking'));

    expect(queryByText('End this question?')).toBeNull();
    expect(getByLabelText('apple, current')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('End confirmation emits ea_ended and preserves the marked item identity', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        itemSet={FIXTURE_FIRST_SOUND_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.stopped_reason).toBe('ea_ended');
    expect(result.derived.total_correct).toBe(1);
    expect(result.items[0].item_key).toBe('q3.first_sound.item_1');
  });

  test('Finish from fully-marked review saves without another confirmation', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        itemSet={FIXTURE_FIRST_SOUND_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    [
      'apple',
      'ball',
      'cat',
      'dog',
      'egg',
      'fish',
      'goat',
      'hat',
      'ink',
      'jug',
    ].forEach((p) => {
      fireEvent.press(getByText('Correct'));
    });
    fireEvent.press(getByText('Finish'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].derived.total_correct).toBe(10);
  });
});

describe('ListenFirstSoundQuestion — scrollable list', () => {
  test('active-phase list is wrapped in a ScrollView so all cards remain reachable', () => {
    const { getByText, getByTestId } = render(
      <ListenFirstSoundQuestion
        language="en"
        itemSet={FIXTURE_FIRST_SOUND_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    const scroller = getByTestId('prompt-scroll');
    expect(scroller.props.horizontal).not.toBe(true);
  });
});

describe('ListenFirstSoundQuestion — Skip flow', () => {
  test('Skip question button opens a reason picker', () => {
    const { getByText } = render(
      <ListenFirstSoundQuestion
        language="en"
        itemSet={FIXTURE_FIRST_SOUND_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Skip question'));

    expect(getByText(/Why are you skipping this question/i)).toBeTruthy();
    expect(getByText('Child refused')).toBeTruthy();
    expect(getByText('Other reason')).toBeTruthy();
  });

  test('selecting a reason emits Result with that stopped_reason', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ListenFirstSoundQuestion
        language="en"
        itemSet={FIXTURE_FIRST_SOUND_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Skip question'));
    fireEvent.press(getByText('Child refused'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe(
      'skipped_child_refused',
    );
  });

  test('Cancel from skip-picker returns to active without emitting', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        itemSet={FIXTURE_FIRST_SOUND_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Skip question'));
    fireEvent.press(getByText('Cancel'));

    expect(onComplete).not.toHaveBeenCalled();
    expect(getByLabelText('apple, current')).toBeTruthy();
  });
});

describe('ListenFirstSoundQuestion — itemSet override validation', () => {
  test('falls back to bundled default when override is missing item_set_id', () => {
    const onComplete = jest.fn();
    const incomplete = { prompts: [{ item_key: 'k', prompt: 'pretend' }] };
    const { getByText, queryByText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        itemSet={incomplete}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(queryByText('pretend')).toBeNull();
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    expect(onComplete.mock.calls[0][0].item_set_id).toBeDefined();
  });

  test('accepts a fully-formed override', () => {
    const onComplete = jest.fn();
    const goodOverride = {
      item_set_id: 'custom@1.0.en',
      question_code: 'custom',
      language: 'en',
      question_version: '1.0',
      prompts: [
        { item_key: 'k1', prompt: 'zebra' },
        { item_key: 'k2', prompt: 'queen' },
      ],
    };
    const { getByText } = render(
      <ListenFirstSoundQuestion
        language="en"
        instructions="."
        itemSet={goodOverride}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('zebra')).toBeTruthy();
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    expect(onComplete.mock.calls[0][0].item_set_id).toBe('custom@1.0.en');
  });
});

describe('ListenFirstSoundQuestion — Pattern B is untimed', () => {
  test('was_timed is false in the emitted Result even when host passes durationSec', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        itemSet={FIXTURE_FIRST_SOUND_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    expect(onComplete.mock.calls[0][0].derived.was_timed).toBe(false);
  });
});

describe('ListenFirstSoundQuestion — onItemMarked', () => {
  test('fires per-tap with the item shape', () => {
    const onItemMarked = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenFirstSoundQuestion
        language="en"
        itemSet={FIXTURE_FIRST_SOUND_EN}
        instructions="."
        onComplete={jest.fn()}
        onItemMarked={onItemMarked}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Correct'));

    expect(onItemMarked).toHaveBeenCalledTimes(1);
    const item = onItemMarked.mock.calls[0][0];
    expect(item.item_key).toBe('q3.first_sound.item_1');
    expect(item.prompt).toBe('apple');
    expect(item.is_correct).toBe(true);
  });
});


test('prompt cards are rounded, full width, and solid green when marked', () => {
  const r = render(
    <ListenFirstSoundQuestion language="en" itemSet={FIXTURE_FIRST_SOUND_EN}
      instructions="." onComplete={jest.fn()} />,
  );
  fireEvent.press(r.getByText('Start'));
  expect(StyleSheet.flatten(r.UNSAFE_getByType(FollowScrollView).props.contentContainerStyle))
    .toMatchObject({ padding: tokens.space.lg, gap: 10 });
  expect(r.getByLabelText('apple, current')).toHaveStyle({
    borderRadius: tokens.radius.tile,
    alignSelf: 'stretch',
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.ink,
  });
  fireEvent.press(r.getByText('Correct'));
  expect(r.getByLabelText('apple, correct. Double-tap to change to incorrect')).toHaveStyle({
    borderRadius: tokens.radius.tile,
    alignSelf: 'stretch',
    backgroundColor: tokens.color.marked,
    borderColor: tokens.color.marked,
  });
  expect(r.getByText('apple')).toHaveStyle({ color: tokens.color.onMarked });
});


test('End confirmation preserves the active scroller and hides its controls until Keep marking', () => {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(
    <ListenFirstSoundQuestion language="en" itemSet={FIXTURE_FIRST_SOUND_EN}
      instructions="." onComplete={onComplete} onItemMarked={onItemMarked} />,
  );
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByText('Correct'));
  const scroller = r.getByTestId('prompt-scroll');
  fireEvent.press(r.getByTestId('first-sound-end'));
  const sheet = r.getByTestId('end-confirmation');
  expect(StyleSheet.flatten(sheet.props.style)).toMatchObject({
    ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: tokens.color.scrim,
  });
  expect(sheet.props.accessibilityViewIsModal).toBe(true);
  expect(r.getByTestId('prompt-scroll', { includeHiddenElements: true })).toBe(scroller);
  expect(within(r.getByTestId('prompt-scroll', { includeHiddenElements: true })).getByTestId('tile-0', { includeHiddenElements: true }).props.accessibilityLabel).toBe('apple, correct');
  expect(r.queryByLabelText('apple, correct. Double-tap to change to incorrect')).toBeNull();
  expect(r.queryByText('Correct')).toBeNull();
  expect(r.queryByText('Back')).toBeNull();
  let activeView = scroller.parent;
  while (activeView && activeView.props.accessibilityElementsHidden === undefined) {
    activeView = activeView.parent;
  }
  expect(activeView?.props.accessibilityElementsHidden).toBe(true);
  expect(activeView?.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(activeView?.props.pointerEvents).toBe('none');
  fireEvent.press(r.getByText('Keep marking'));
  expect(r.queryByTestId('end-confirmation')).toBeNull();
  expect(r.getByTestId('prompt-scroll')).toBe(scroller);
  expect(r.getByLabelText('apple, correct. Double-tap to change to incorrect')).toBeTruthy();
  expect(activeView?.props.accessibilityElementsHidden).toBe(false);
  expect(activeView?.props.importantForAccessibility).toBe('auto');
  expect(activeView?.props.pointerEvents).toBe('auto');
  expect(onComplete).not.toHaveBeenCalled();
  expect(onItemMarked).toHaveBeenCalledTimes(1);
});

test('repeated item keys keep independent positional marks and result identities through flip and Back', () => {
  const onComplete = jest.fn(), onItemMarked = jest.fn();
  const r = render(<ListenFirstSoundQuestion language="en"
    itemSet={{ ...FIXTURE_FIRST_SOUND_EN, prompts: [
      { item_key: 'same', prompt: 'same prompt' },
      { item_key: 'same', prompt: 'same prompt' },
    ] }} instructions="." onComplete={onComplete} onItemMarked={onItemMarked} />);
  fireEvent.press(r.getByText('Start'));
  const body = within(r.getByTestId('prompt-scroll'));
  fireEvent.press(r.getByText('Correct'));
  expect(body.getByTestId('tile-1').props.accessibilityLabel).toBe('same prompt, current');
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(body.getByTestId('tile-0'));
  expect(body.getByTestId('tile-0').props.accessibilityLabel).toBe('same prompt, incorrect. Double-tap to change to correct');
  expect(body.getByTestId('tile-1').props.accessibilityLabel).toBe('same prompt, correct. Double-tap to change to incorrect');
  fireEvent.press(r.getByText('Back'));
  expect(body.getByTestId('tile-1').props.accessibilityLabel).toBe('same prompt, current');
  fireEvent.press(r.getByText('Correct'));
  expect(onItemMarked.mock.calls.map(([item]) => [item.position, item.item_key, item.is_correct]))
    .toEqual([[0, 'same', true], [1, 'same', true], [0, 'same', false], [1, 'same', true]]);
  fireEvent.press(r.getByText('Finish'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0].items.map((item: any) => [item.position, item.item_key, item.is_correct, item.metadata.reached]))
    .toEqual([[0, 'same', false, true], [1, 'same', true, true]]);
  expect(onComplete.mock.calls[0][0].derived).toMatchObject({ total_correct: 1, total_attempted: 2, correction_count: 2 });
});
