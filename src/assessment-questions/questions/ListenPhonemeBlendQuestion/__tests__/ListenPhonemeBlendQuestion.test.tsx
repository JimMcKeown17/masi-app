import React from 'react';
import { StyleSheet } from 'react-native';
import { tokens } from '../../../theme/tokens';
import { render, fireEvent, within, act } from '@testing-library/react-native';
import { FollowScrollView } from '../../../ui/FollowScrollView';
import { Countdown } from '../../../progress/Countdown';
import { ListenPhonemeBlendQuestion } from '..';
import { FIXTURE_PHONEME_BLEND_EN } from '../../../testFixtures';

test('Q4: items keep metadata.word beside reached', () => {
  const onComplete = jest.fn();
  const r = render(<ListenPhonemeBlendQuestion language="en" itemSet={FIXTURE_PHONEME_BLEND_EN} onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(r.getByTestId('blend-end'));
  fireEvent.press(r.getByText('End question'));
  const items = onComplete.mock.calls[0][0].items;
  expect(items[0].metadata).toEqual({ word: 'sun', reached: true });
  expect(items[1].metadata).toEqual({ word: 'cat', reached: false });
});

test('Q4: the gloss (sun) stays under s-u-n and is plain, not italic', () => {
  const r = render(<ListenPhonemeBlendQuestion language="en" itemSet={FIXTURE_PHONEME_BLEND_EN} onComplete={jest.fn()} />);
  fireEvent.press(r.getByText('Start'));
  const card = within(within(r.getByTestId('prompt-scroll')).getByTestId('tile-0'));
  expect(card.getByText('s-u-n')).toBeTruthy();
  expect(card.getByText('(sun)')).toBeTruthy();
  expect(StyleSheet.flatten(card.getByText('(sun)').props.style).fontStyle).toBeUndefined();
  const textNodes = card.getAllByText(/^(s-u-n|\(sun\))$/);
  expect(textNodes.map(node => node.props.children)).toEqual(['s-u-n', '(sun)']);
  fireEvent.press(r.getByText('Correct'));
  expect(StyleSheet.flatten(r.getByText('(sun)').props.style).fontStyle).toBeUndefined();
});

test('Q4: prompt cards keep padding lg, gap 10, radius tile, and turn solid green when marked', () => {
  const r = render(<ListenPhonemeBlendQuestion language="en" itemSet={FIXTURE_PHONEME_BLEND_EN} onComplete={jest.fn()} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByText('Correct'));
  const scroller = r.getByTestId('prompt-scroll');
  expect(scroller.props.horizontal).not.toBe(true);
  expect(StyleSheet.flatten(r.UNSAFE_getByType(FollowScrollView).props.contentContainerStyle))
    .toMatchObject({ padding: tokens.space.lg, gap: 10 });
  expect(within(scroller).getByTestId('tile-0')).toHaveStyle({ borderRadius: tokens.radius.tile,
    alignSelf: 'stretch', backgroundColor: tokens.color.marked, borderColor: tokens.color.marked });
  expect(r.getByText('s-u-n')).toHaveStyle({ color: tokens.color.onMarked });
});

test('Q4: was_timed is false even when the host passes durationSec', () => {
  jest.useFakeTimers();
  try {
    const onComplete = jest.fn();
    const r = render(<ListenPhonemeBlendQuestion language="en" durationSec={60} itemSet={FIXTURE_PHONEME_BLEND_EN} onComplete={onComplete} />);
    fireEvent.press(r.getByText('Start'));
    expect(r.UNSAFE_queryByType(Countdown)).toBeNull();
    act(() => jest.advanceTimersByTime(61000));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(r.getByTestId('blend-end'));
    fireEvent.press(r.getByText('End question'));
    expect(onComplete.mock.calls[0][0].derived.was_timed).toBe(false);
  } finally { jest.useRealTimers(); }
});

describe('ListenPhonemeBlendQuestion — intro and active phases', () => {
  test('renders instructions + Start; Start transitions to active showing segmented prompts', () => {
    const { getByText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        itemSet={FIXTURE_PHONEME_BLEND_EN}
        instructions="Say each segmented prompt; child blends."
        onComplete={jest.fn()}
      />,
    );

    expect(getByText(/segmented prompt/i)).toBeTruthy();
    fireEvent.press(getByText('Start'));
    expect(getByText('s-u-n')).toBeTruthy();
    expect(getByText('m-a-p')).toBeTruthy();
  });

  test('renders the word gloss below every segmented prompt (always visible)', () => {
    const { getByText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        itemSet={FIXTURE_PHONEME_BLEND_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    expect(getByText('(sun)')).toBeTruthy();
    expect(getByText('(cat)')).toBeTruthy();
  });

  test('Correct marks the current prompt and advances the ring; second tap clears', () => {
    const { getByText, getByLabelText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        itemSet={FIXTURE_PHONEME_BLEND_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    expect(getByLabelText('s-u-n, (sun), current')).toBeTruthy();
    fireEvent.press(getByText('Correct'));
    expect(getByLabelText('s-u-n, (sun), correct. Double-tap to change to incorrect')).toBeTruthy();
    fireEvent.press(getByLabelText('s-u-n, (sun), correct. Double-tap to change to incorrect'));
    expect(getByLabelText('s-u-n, (sun), incorrect. Double-tap to change to correct')).toBeTruthy();
  });
});

describe('ListenPhonemeBlendQuestion — review and End flow', () => {
  test('End before any marks shows all eight excluded from scoring', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        itemSet={FIXTURE_PHONEME_BLEND_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('End question'));

    expect(getByText("0 marked. The 8 not marked won't count towards the score.")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('End emits ea_ended and question_code=wela_plus_phoneme_blend', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        itemSet={FIXTURE_PHONEME_BLEND_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.stopped_reason).toBe('ea_ended');
    expect(result.question_code).toBe('wela_plus_phoneme_blend');
    expect(result.derived.total_correct).toBe(2);
    expect(result.items[0].item_key).toBe('q4.phoneme_blend.item_1');
  });
});

describe('ListenPhonemeBlendQuestion — scrollable list', () => {
  test('active-phase list is wrapped in a ScrollView so all cards remain reachable', () => {
    const { getByText, getByTestId } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        itemSet={FIXTURE_PHONEME_BLEND_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    const scroller = getByTestId('prompt-scroll');
    expect(scroller.props.horizontal).not.toBe(true);
  });
});

describe('ListenPhonemeBlendQuestion — Skip flow', () => {
  test('Skip question → reason → Result with that stopped_reason', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        itemSet={FIXTURE_PHONEME_BLEND_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Skip question'));
    fireEvent.press(getByText('Child is tired'));

    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('skipped_tired');
  });
});

describe('ListenPhonemeBlendQuestion — itemSet override validation', () => {
  test('falls back to bundled default when override lacks item_set_id', () => {
    const onComplete = jest.fn();
    const incomplete = {
      prompts: [{ item_key: 'k', segmented: 'a-b', word: 'ab' }],
    };
    const { getByText, queryByText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        instructions="."
        itemSet={incomplete}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(queryByText('a-b')).toBeNull();
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    expect(onComplete.mock.calls[0][0].item_set_id).toBeDefined();
  });

  test('falls back when an itemSet shaped like Q3 (no segmented field) is passed by mistake', () => {
    const onComplete = jest.fn();
    const q3Shape = {
      item_set_id: 'wela_plus_first_sound@fixture.en',
      question_code: 'wela_plus_first_sound',
      language: 'en',
      question_version: 'fixture',
      prompts: [{ item_key: 'k', prompt: 'apple' }],
    };
    const { getByText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        instructions="."
        itemSet={q3Shape}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    expect(onComplete.mock.calls[0][0].item_set_id).not.toBe(
      'wela_plus_first_sound@fixture.en',
    );
  });
});

describe('ListenPhonemeBlendQuestion — Pattern B is untimed', () => {
  test('was_timed is false even when host passes durationSec', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        itemSet={FIXTURE_PHONEME_BLEND_EN}
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

describe('ListenPhonemeBlendQuestion — word gloss preserved in metadata', () => {
  test('items[i].metadata.word matches the prompt word for analytics reconstruction', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        itemSet={FIXTURE_PHONEME_BLEND_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    const items = onComplete.mock.calls[0][0].items;
    expect(items[0].metadata).toEqual({ word: 'sun', reached: true });
    expect(items[1].metadata).toEqual({ word: 'cat', reached: true });
  });

  test('onItemMarked also receives the word in metadata', () => {
    const onItemMarked = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        itemSet={FIXTURE_PHONEME_BLEND_EN}
        instructions="."
        onComplete={jest.fn()}
        onItemMarked={onItemMarked}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Correct'));

    expect(onItemMarked.mock.calls[0][0].metadata).toEqual({ word: 'sun', reached: true });
  });
});

describe('ListenPhonemeBlendQuestion — onItemMarked', () => {
  test('fires per-tap with the segmented form as prompt and the stable item_key', () => {
    const onItemMarked = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        itemSet={FIXTURE_PHONEME_BLEND_EN}
        instructions="."
        onComplete={jest.fn()}
        onItemMarked={onItemMarked}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Correct'));

    expect(onItemMarked).toHaveBeenCalledTimes(1);
    const item = onItemMarked.mock.calls[0][0];
    expect(item.item_key).toBe('q4.phoneme_blend.item_1');
    expect(item.prompt).toBe('s-u-n');
    expect(item.is_correct).toBe(true);
  });
});


test('prompt cards are rounded, full width, and solid green when marked', () => {
  const r = render(
    <ListenPhonemeBlendQuestion language="en" itemSet={FIXTURE_PHONEME_BLEND_EN}
      instructions="." onComplete={jest.fn()} />,
  );
  fireEvent.press(r.getByText('Start'));
  expect(StyleSheet.flatten(r.UNSAFE_getByType(FollowScrollView).props.contentContainerStyle))
    .toMatchObject({ padding: tokens.space.lg, gap: 10 });
  expect(r.getByLabelText('s-u-n, (sun), current')).toHaveStyle({
    borderRadius: tokens.radius.tile,
    alignSelf: 'stretch',
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.ink,
  });
  fireEvent.press(r.getByText('Correct'));
  expect(r.getByLabelText('s-u-n, (sun), correct. Double-tap to change to incorrect')).toHaveStyle({
    borderRadius: tokens.radius.tile,
    alignSelf: 'stretch',
    backgroundColor: tokens.color.marked,
    borderColor: tokens.color.marked,
  });
  expect(r.getByText('s-u-n')).toHaveStyle({ color: tokens.color.onMarked });
});


test('the phoneme gloss is plain, not italic', () => {
  const r = render(
    <ListenPhonemeBlendQuestion language="en" itemSet={FIXTURE_PHONEME_BLEND_EN}
      instructions="." onComplete={jest.fn()} />,
  );
  fireEvent.press(r.getByText('Start'));
  expect(StyleSheet.flatten(r.getByText('(sun)').props.style).fontStyle).toBeUndefined();
  fireEvent.press(r.getByText('Correct'));
  expect(StyleSheet.flatten(r.getByText('(sun)').props.style).fontStyle).toBeUndefined();
});


test('End confirmation preserves the active scroller and hides its controls until Keep marking', () => {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(
    <ListenPhonemeBlendQuestion language="en" itemSet={FIXTURE_PHONEME_BLEND_EN}
      instructions="." onComplete={onComplete} onItemMarked={onItemMarked} />,
  );
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByText('Correct'));
  const scroller = r.getByTestId('prompt-scroll');
  fireEvent.press(r.getByTestId('blend-end'));
  const sheet = r.getByTestId('end-confirmation');
  expect(StyleSheet.flatten(sheet.props.style)).toMatchObject({
    ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: tokens.color.scrim,
  });
  expect(sheet.props.accessibilityViewIsModal).toBe(true);
  expect(r.getByTestId('prompt-scroll', { includeHiddenElements: true })).toBe(scroller);
  expect(within(r.getByTestId('prompt-scroll', { includeHiddenElements: true })).getByTestId('tile-0', { includeHiddenElements: true }).props.accessibilityLabel).toBe('s-u-n, (sun), correct');
  expect(r.queryByLabelText('s-u-n, (sun), correct. Double-tap to change to incorrect')).toBeNull();
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
  expect(r.getByLabelText('s-u-n, (sun), correct. Double-tap to change to incorrect')).toBeTruthy();
  expect(activeView?.props.accessibilityElementsHidden).toBe(false);
  expect(activeView?.props.importantForAccessibility).toBe('auto');
  expect(activeView?.props.pointerEvents).toBe('auto');
  expect(onComplete).not.toHaveBeenCalled();
  expect(onItemMarked).toHaveBeenCalledTimes(1);
});

test('repeated item keys keep independent positional marks and result identities through flip and Back', () => {
  const onComplete = jest.fn(), onItemMarked = jest.fn();
  const r = render(<ListenPhonemeBlendQuestion language="en"
    itemSet={{ ...FIXTURE_PHONEME_BLEND_EN, prompts: [
      { item_key: 'same', segmented: 'same prompt', word: 'one' },
      { item_key: 'same', segmented: 'same prompt', word: 'two' },
    ] }} instructions="." onComplete={onComplete} onItemMarked={onItemMarked} />);
  fireEvent.press(r.getByText('Start'));
  const body = within(r.getByTestId('prompt-scroll'));
  fireEvent.press(r.getByText('Correct'));
  expect(body.getByTestId('tile-1').props.accessibilityLabel).toBe('same prompt, (two), current');
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(body.getByTestId('tile-0'));
  expect(body.getByTestId('tile-0').props.accessibilityLabel).toBe('same prompt, (one), incorrect. Double-tap to change to correct');
  expect(body.getByTestId('tile-1').props.accessibilityLabel).toBe('same prompt, (two), correct. Double-tap to change to incorrect');
  fireEvent.press(r.getByText('Back'));
  expect(body.getByTestId('tile-1').props.accessibilityLabel).toBe('same prompt, (two), current');
  fireEvent.press(r.getByText('Correct'));
  expect(onItemMarked.mock.calls.map(([item]) => [item.position, item.item_key, item.is_correct]))
    .toEqual([[0, 'same', true], [1, 'same', true], [0, 'same', false], [1, 'same', true]]);
  fireEvent.press(r.getByText('Finish'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0].items.map((item: any) => [item.position, item.item_key, item.is_correct, item.metadata.reached]))
    .toEqual([[0, 'same', false, true], [1, 'same', true, true]]);
  expect(onComplete.mock.calls[0][0].derived).toMatchObject({ total_correct: 1, total_attempted: 2, correction_count: 2 });
});
