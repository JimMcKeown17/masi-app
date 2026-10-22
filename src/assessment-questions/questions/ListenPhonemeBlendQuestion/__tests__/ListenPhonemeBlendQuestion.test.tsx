import React from 'react';
import { StyleSheet } from 'react-native';
import { tokens } from '../../../theme/tokens';
import { render, fireEvent } from '@testing-library/react-native';
import { ListenPhonemeBlendQuestion } from '..';
import { FIXTURE_PHONEME_BLEND_EN } from '../../../testFixtures';

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

  test('tap a prompt marks it correct (accessibility flips); second tap clears', () => {
    const { getByText, getByLabelText } = render(
      <ListenPhonemeBlendQuestion
        language="en"
        itemSet={FIXTURE_PHONEME_BLEND_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));

    expect(getByLabelText('s-u-n, idle')).toBeTruthy();
    fireEvent.press(getByLabelText('s-u-n, idle'));
    expect(getByLabelText('s-u-n, correct')).toBeTruthy();
    fireEvent.press(getByLabelText('s-u-n, correct'));
    expect(getByLabelText('s-u-n, idle')).toBeTruthy();
  });
});

describe('ListenPhonemeBlendQuestion — Finish flow', () => {
  test('Finish with all 8 unmarked shows a confirmation listing the count', () => {
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
    fireEvent.press(getByText('Finish'));

    expect(getByText(/8 items unmarked/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('Yes emits a Result with stopped_reason=completed and question_code=wela_plus_phoneme_blend', () => {
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
    fireEvent.press(getByLabelText('s-u-n, idle'));
    fireEvent.press(getByLabelText('c-a-t, idle'));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.stopped_reason).toBe('completed');
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
    fireEvent.press(getByText('Child tired'));

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
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

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
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

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
    fireEvent.press(getByLabelText('s-u-n, idle'));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

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
    fireEvent.press(getByLabelText('s-u-n, idle'));
    fireEvent.press(getByLabelText('c-a-t, idle'));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

    const items = onComplete.mock.calls[0][0].items;
    expect(items[0].metadata).toEqual({ word: 'sun' });
    expect(items[1].metadata).toEqual({ word: 'cat' });
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
    fireEvent.press(getByLabelText('s-u-n, idle'));

    expect(onItemMarked.mock.calls[0][0].metadata).toEqual({ word: 'sun' });
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
    fireEvent.press(getByLabelText('s-u-n, idle'));

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
  expect(StyleSheet.flatten(r.getByTestId('prompt-scroll').props.contentContainerStyle))
    .toMatchObject({ padding: tokens.space.lg, gap: 10 });
  expect(r.getByLabelText('s-u-n, idle')).toHaveStyle({
    borderRadius: tokens.radius.tile,
    alignSelf: 'stretch',
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.line,
  });
  fireEvent.press(r.getByLabelText('s-u-n, idle'));
  expect(r.getByLabelText('s-u-n, correct')).toHaveStyle({
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
  fireEvent.press(r.getByLabelText('s-u-n, idle'));
  expect(StyleSheet.flatten(r.getByText('(sun)').props.style).fontStyle).toBeUndefined();
});


test('finish confirmation preserves the active scroller and hides its controls until Cancel', () => {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(
    <ListenPhonemeBlendQuestion language="en" itemSet={FIXTURE_PHONEME_BLEND_EN}
      instructions="." onComplete={onComplete} onItemMarked={onItemMarked} />,
  );
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByLabelText('s-u-n, idle'));
  const scroller = r.getByTestId('prompt-scroll');
  const tile = r.getByLabelText('s-u-n, correct');
  fireEvent.press(r.getByText('Finish'));
  const sheet = r.getByTestId('confirm-finish');
  expect(StyleSheet.flatten(sheet.props.style)).toMatchObject({
    ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: tokens.color.scrim,
  });
  expect(sheet.props.accessibilityViewIsModal).toBe(true);
  expect(r.getByTestId('prompt-scroll', { includeHiddenElements: true })).toBe(scroller);
  expect(r.getByLabelText('s-u-n, correct', { includeHiddenElements: true })).toBe(tile);
  expect(r.queryByLabelText('s-u-n, correct')).toBeNull();
  expect(r.queryByText('Finish')).toBeNull();
  let activeView = scroller.parent;
  while (activeView && activeView.props.accessibilityElementsHidden === undefined) {
    activeView = activeView.parent;
  }
  expect(activeView?.props.accessibilityElementsHidden).toBe(true);
  expect(activeView?.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(activeView?.props.pointerEvents).toBe('none');
  fireEvent.press(r.getByText('Cancel'));
  expect(r.queryByTestId('confirm-finish')).toBeNull();
  expect(r.getByTestId('prompt-scroll')).toBe(scroller);
  expect(r.getByLabelText('s-u-n, correct')).toBe(tile);
  expect(activeView?.props.accessibilityElementsHidden).toBe(false);
  expect(activeView?.props.importantForAccessibility).toBe('auto');
  expect(activeView?.props.pointerEvents).toBe('auto');
  expect(onComplete).not.toHaveBeenCalled();
  expect(onItemMarked).toHaveBeenCalledTimes(1);
});

test('repeated item keys keep independent positional marks and result identities', () => {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(
    <ListenPhonemeBlendQuestion language="en"
      itemSet={{ ...FIXTURE_PHONEME_BLEND_EN, prompts: [{ item_key: 'same', segmented: 'first', word: 'one' }, { item_key: 'same', segmented: 'second', word: 'two' }] }}
      instructions="." onComplete={onComplete} onItemMarked={onItemMarked} />,
  );
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByLabelText('first, idle'));
  expect(r.getByLabelText('second, idle')).toBeTruthy();
  fireEvent.press(r.getByLabelText('second, idle'));
  fireEvent.press(r.getByLabelText('first, correct'));
  expect(r.getByLabelText('first, idle')).toBeTruthy();
  expect(r.getByLabelText('second, correct')).toBeTruthy();
  expect(onItemMarked).toHaveBeenCalledTimes(3);
  expect(onItemMarked.mock.calls.map(([item]) => [item.position, item.item_key, item.is_correct]))
    .toEqual([[0, 'same', true], [1, 'same', true], [0, 'same', false]]);
  fireEvent.press(r.getByText('Finish'));
  expect(r.getByText('1 items unmarked — finish anyway?')).toBeTruthy();
  fireEvent.press(r.getByText('Yes, finish'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0].items.map((item: { position: number; item_key: string; is_correct: boolean }) =>
    [item.position, item.item_key, item.is_correct]))
    .toEqual([[0, 'same', false], [1, 'same', true]]);
  expect(onComplete.mock.calls[0][0].derived.total_correct).toBe(1);
});
