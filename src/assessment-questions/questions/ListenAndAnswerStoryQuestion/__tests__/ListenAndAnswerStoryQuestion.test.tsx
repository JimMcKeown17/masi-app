import React from 'react';
import { StyleSheet } from 'react-native';
import { FollowScrollView } from '../../../ui/FollowScrollView';
import { Countdown } from '../../../progress/Countdown';
import { validateResult } from '../../../contractTest/validateResult';
import { tokens } from '../../../theme/tokens';
import { render, fireEvent, within } from '@testing-library/react-native';
import { ListenAndAnswerStoryQuestion } from '..';
import { FIXTURE_LISTEN_AND_ANSWER_STORY_EN } from '../../../testFixtures';

describe('ListenAndAnswerStoryQuestion — intro phase', () => {
  test('renders the story script + an "I\'ve finished reading" primary action', () => {
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="Read the story aloud."
        onComplete={jest.fn()}
      />,
    );

    // Frozen story content from FIXTURE_LISTEN_AND_ANSWER_STORY_EN.
    expect(getByText(/Once upon a time/)).toBeTruthy();
    expect(getByText(/I've finished reading/)).toBeTruthy();
  });

  test('story is rendered inside a vertical scroll container so long scripts stay reachable', () => {
    const { getByTestId } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    const scroller = getByTestId('intro-story-scroll');
    expect(scroller.props.horizontal).not.toBe(true);
  });

  test('"I\'ve finished reading" button still renders even when story is long', () => {
    // Long story override — sanity-check the button doesn't get hidden by the
    // story consuming all vertical space (i.e., must be outside the scroller).
    const longOverride = {
      item_set_id: 'custom@1.0.en',
      question_code: 'custom',
      language: 'en',
      question_version: '1.0',
      story: Array.from({ length: 200 }, (_, i) => `Line ${i}.`).join(' '),
      questions: [
        { item_key: 'k', prompt: 'p', acceptable_answers: ['a'] },
      ],
    };
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        itemSet={longOverride}
        onComplete={jest.fn()}
      />,
    );
    expect(getByText("I've finished reading")).toBeTruthy();
  });
});

describe('ListenAndAnswerStoryQuestion — active phase', () => {
  test('"I\'ve finished reading" advances to active and renders all 5 comprehension prompts', () => {
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));

    expect(getByText('What was the name of the bird?')).toBeTruthy();
    expect(getByText('How did Pip feel at the end?')).toBeTruthy();
  });

  test('each prompt shows acceptable_answers as a comma-joined gloss', () => {
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));

    // Gloss for item_2 (3 answers) and item_5 (2 answers) are unique strings
    // that can only come from the acceptable_answers join.
    expect(getByText('a tree, in a tree, tree')).toBeTruthy();
    expect(getByText('happy, glad')).toBeTruthy();
  });
});

describe('ListenAndAnswerStoryQuestion — marking', () => {
  test('Correct marks the current prompt and advances the ring', () => {
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));

    expect(getByLabelText('What was the name of the bird?, Pip, current')).toBeTruthy();
    fireEvent.press(getByText('Correct'));
    expect(getByLabelText('What was the name of the bird?, Pip, correct. Double-tap to change to incorrect')).toBeTruthy();
  });

  test('tap a marked prompt flips it to incorrect', () => {
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));

    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByLabelText('What was the name of the bird?, Pip, correct. Double-tap to change to incorrect'));
    expect(getByLabelText('What was the name of the bird?, Pip, incorrect. Double-tap to change to correct')).toBeTruthy();
    expect(getByLabelText('Where did Pip live?, a tree, in a tree, tree, current')).toBeTruthy();
  });
});

describe('ListenAndAnswerStoryQuestion — Re-read story modal', () => {
  test('"Re-read story" pill is visible in the active phase', () => {
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));

    expect(getByText('Re-read story')).toBeTruthy();
  });

  test('tapping "Re-read story" opens a modal showing the story text', () => {
    const { getByText, queryAllByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    // Intro is unmounted by now, so /Once upon a time/ must be absent…
    expect(queryAllByText(/Once upon a time/)).toHaveLength(0);

    fireEvent.press(getByText('Re-read story'));
    // …until the modal opens.
    expect(getByText(/Once upon a time/)).toBeTruthy();
    expect(getByText('Close')).toBeTruthy();
  });

  test('dismissing the modal preserves marks made before opening it', () => {
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));

    // Mark a card, open re-read, dismiss, verify mark survives.
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('Re-read story'));
    fireEvent.press(getByText('Close'));

    expect(getByLabelText('What was the name of the bird?, Pip, correct. Double-tap to change to incorrect')).toBeTruthy();
  });
});

describe('ListenAndAnswerStoryQuestion — Finish flow', () => {
  test('End with nothing marked shows the exact marked and unreached counts', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('End question'));

    expect(getByText("0 marked. The 5 not marked won't count towards the score.")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('Keep marking returns from End without emitting', () => {
    const onComplete = jest.fn();
    const { getByText, queryByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('Keep marking'));

    expect(queryByText('End this question?')).toBeNull();
    expect(getByLabelText('What was the name of the bird?, Pip, current')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('End confirmation emits Result with stopped_reason=ea_ended', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.stopped_reason).toBe('ea_ended');
    expect(result.derived.total_correct).toBe(1);
    expect(result.items[0].item_key).toBe('q2.story.item_1');
    expect(result.question_code).toBe('wela_plus_listen_and_answer_story');
  });

  test('Finish from fully marked review emits without another confirmation', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    [
      'What was the name of the bird?',
      'Where did Pip live?',
      'What did Pip want to find?',
      'What colour was the bush?',
      'How did Pip feel at the end?',
    ].forEach((p) => {
      fireEvent.press(getByText('Correct'));
    });
    fireEvent.press(getByText('Finish'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].derived.total_correct).toBe(5);
  });
});

describe('ListenAndAnswerStoryQuestion — Skip flow', () => {
  test('Skip question button opens a reason picker with 5 reasons', () => {
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('Skip question'));

    expect(getByText(/Why are you skipping this question/i)).toBeTruthy();
    expect(getByText('Child refused')).toBeTruthy();
    expect(getByText('Other reason')).toBeTruthy();
  });

  test('selecting a reason emits Result with that stopped_reason', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
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
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('Skip question'));
    fireEvent.press(getByText('Cancel'));

    expect(onComplete).not.toHaveBeenCalled();
    expect(getByLabelText('What was the name of the bird?, Pip, current')).toBeTruthy();
  });
});

describe('ListenAndAnswerStoryQuestion — itemSet override validation', () => {
  test('falls back to bundled default when override is missing item_set_id', () => {
    const onComplete = jest.fn();
    const incomplete = {
      story: 'pretend story text',
      questions: [{ item_key: 'k', prompt: 'pretend?', acceptable_answers: ['a'] }],
    };
    const { getByText, queryByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        itemSet={incomplete}
        onComplete={onComplete}
      />,
    );
    expect(queryByText('pretend story text')).toBeNull();
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    expect(onComplete.mock.calls[0][0].item_set_id).toBeDefined();
  });

  test('falls back when override has malformed inner question (acceptable_answers as string)', () => {
    const onComplete = jest.fn();
    const malformed = {
      item_set_id: 'custom@1.0.en',
      question_code: 'custom',
      language: 'en',
      question_version: '1.0',
      story: 'Looks fine at the top level.',
      questions: [
        // acceptable_answers is a string, not a string[] — would crash at .join()
        { item_key: 'k', prompt: 'p', acceptable_answers: 'broken' },
      ],
    };
    const { getByText, queryByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        itemSet={malformed}
        onComplete={onComplete}
      />,
    );
    expect(queryByText('Looks fine at the top level.')).toBeNull();
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    expect(onComplete.mock.calls[0][0].item_set_id).not.toBe('custom@1.0.en');
  });

  test('falls back when override question is missing item_key', () => {
    const onComplete = jest.fn();
    const malformed = {
      item_set_id: 'custom@1.0.en',
      question_code: 'custom',
      language: 'en',
      question_version: '1.0',
      story: 'Fine.',
      questions: [{ prompt: 'p', acceptable_answers: ['a'] }],
    };
    const { queryByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        itemSet={malformed}
        onComplete={onComplete}
      />,
    );
    expect(queryByText('Fine.')).toBeNull();
  });

  test('falls back when override has wrong shape (story not a string)', () => {
    const onComplete = jest.fn();
    const malformed = {
      item_set_id: 'custom@1.0.en',
      question_code: 'custom',
      language: 'en',
      question_version: '1.0',
      story: 12345, // wrong type
      questions: [{ item_key: 'k', prompt: 'p', acceptable_answers: ['a'] }],
    };
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        itemSet={malformed}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    expect(onComplete.mock.calls[0][0].item_set_id).not.toBe('custom@1.0.en');
  });

  test('accepts a fully-formed override', () => {
    const onComplete = jest.fn();
    const goodOverride = {
      item_set_id: 'custom@1.0.en',
      question_code: 'custom',
      language: 'en',
      question_version: '1.0',
      story: 'A unique story about a frog.',
      questions: [
        { item_key: 'k1', prompt: 'Where does the frog live?', acceptable_answers: ['pond'] },
        { item_key: 'k2', prompt: 'What colour is it?', acceptable_answers: ['green'] },
      ],
    };
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        itemSet={goodOverride}
        onComplete={onComplete}
      />,
    );
    expect(getByText(/A unique story about a frog/)).toBeTruthy();
    fireEvent.press(getByText("I've finished reading"));
    expect(getByText('Where does the frog live?')).toBeTruthy();
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    expect(onComplete.mock.calls[0][0].item_set_id).toBe('custom@1.0.en');
  });
});

describe('ListenAndAnswerStoryQuestion — Pattern F is untimed', () => {
  test('was_timed is false in the emitted Result even when host passes durationSec', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('End question'));
    fireEvent.press(getByText('End question'));

    expect(onComplete.mock.calls[0][0].derived.was_timed).toBe(false);
    expect(onComplete.mock.calls[0][0].derived.last_attempted_position).toBe(0);
  });
});

describe('ListenAndAnswerStoryQuestion — onItemMarked', () => {
  test('fires per-tap with the item shape', () => {
    const onItemMarked = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={jest.fn()}
        onItemMarked={onItemMarked}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('Correct'));

    expect(onItemMarked).toHaveBeenCalledTimes(1);
    const item = onItemMarked.mock.calls[0][0];
    expect(item.item_key).toBe('q2.story.item_1');
    expect(item.prompt).toBe('What was the name of the bird?');
    expect(item.is_correct).toBe(true);
  });

  test('flip fires onItemMarked with is_correct=false', () => {
    const onItemMarked = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
        instructions="."
        onComplete={jest.fn()}
        onItemMarked={onItemMarked}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByLabelText('What was the name of the bird?, Pip, correct. Double-tap to change to incorrect'));

    expect(onItemMarked).toHaveBeenCalledTimes(2);
    expect(onItemMarked.mock.calls[1][0].is_correct).toBe(false);
  });
});

describe('ListenAndAnswerStoryQuestion — questions.length not hardcoded', () => {
  test('renders fewer or more comprehension prompts when itemset overrides it', () => {
    const onComplete = jest.fn();
    const override = {
      item_set_id: 'custom@1.0.en',
      question_code: 'custom',
      language: 'en',
      question_version: '1.0',
      story: 'A short story.',
      questions: [
        { item_key: 'a', prompt: 'Only one question here?', acceptable_answers: ['yes'] },
      ],
    };
    const { getByText, queryByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        itemSet={override}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));

    expect(getByText('Only one question here?')).toBeTruthy();
    // Defaults from bundled itemset must NOT leak
    expect(queryByText('What was the name of the bird?')).toBeNull();

    fireEvent.press(getByText('Correct'));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(getByText('Finish'));

    const result = onComplete.mock.calls[0][0];
    expect(result.items).toHaveLength(1);
    expect(result.derived.total_attempted).toBe(1);
  });
});


test('prompt cards are rounded, full width, and solid green when marked', () => {
  const r = render(
    <ListenAndAnswerStoryQuestion language="en" itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
      instructions="." onComplete={jest.fn()} />,
  );
  fireEvent.press(r.getByText("I've finished reading"));
  expect(StyleSheet.flatten(r.UNSAFE_getByType(FollowScrollView).props.contentContainerStyle))
    .toMatchObject({ padding: tokens.space.lg, gap: 10 });
  expect(r.getByLabelText('What was the name of the bird?, Pip, current')).toHaveStyle({
    borderRadius: tokens.radius.tile,
    alignSelf: 'stretch',
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.ink,
  });
  fireEvent.press(r.getByText('Correct'));
  expect(r.getByLabelText('What was the name of the bird?, Pip, correct. Double-tap to change to incorrect')).toHaveStyle({
    borderRadius: tokens.radius.tile,
    alignSelf: 'stretch',
    backgroundColor: tokens.color.marked,
    borderColor: tokens.color.marked,
  });
  expect(r.getByText('What was the name of the bird?')).toHaveStyle({ color: tokens.color.onMarked });
});


test('End confirmation preserves the active scroller and hides its controls until Keep marking', () => {
  const onComplete = jest.fn();
  const onItemMarked = jest.fn();
  const r = render(
    <ListenAndAnswerStoryQuestion language="en" itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN}
      instructions="." onComplete={onComplete} onItemMarked={onItemMarked} />,
  );
  fireEvent.press(r.getByText("I've finished reading"));
  fireEvent.press(r.getByText('Correct'));
  const scroller = r.getByTestId('prompt-scroll');
  const markedLabel = 'What was the name of the bird?, Pip, correct. Double-tap to change to incorrect';
  fireEvent.press(r.getByTestId('story-end'));
  const sheet = r.getByTestId('end-confirmation');
  expect(StyleSheet.flatten(sheet.props.style)).toMatchObject({
    ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: tokens.color.scrim,
  });
  expect(sheet.props.accessibilityViewIsModal).toBe(true);
  expect(r.getByTestId('prompt-scroll', { includeHiddenElements: true })).toBe(scroller);
  expect(within(r.getByTestId('prompt-scroll', { includeHiddenElements: true })).getByTestId('tile-0', { includeHiddenElements: true }).props.accessibilityLabel)
    .toBe('What was the name of the bird?, Pip, correct');
  expect(r.queryByLabelText('What was the name of the bird?, Pip, correct. Double-tap to change to incorrect')).toBeNull();
  expect(r.queryByText('Finish')).toBeNull();
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
  expect(r.getByLabelText(markedLabel)).toBeTruthy();
  expect(activeView?.props.accessibilityElementsHidden).toBe(false);
  expect(activeView?.props.importantForAccessibility).toBe('auto');
  expect(activeView?.props.pointerEvents).toBe('auto');
  expect(onComplete).not.toHaveBeenCalled();
  expect(onItemMarked).toHaveBeenCalledTimes(1);
});

test('repeated item keys keep independent positional marks', () => {
  const onComplete = jest.fn(), onItemMarked = jest.fn();
  const r = render(<ListenAndAnswerStoryQuestion language="en"
    itemSet={{ ...FIXTURE_LISTEN_AND_ANSWER_STORY_EN, questions: [
      { item_key: 'same', prompt: 'same prompt', acceptable_answers: ['one'] },
      { item_key: 'same', prompt: 'same prompt', acceptable_answers: ['two'] },
    ] }} onComplete={onComplete} onItemMarked={onItemMarked} />);
  fireEvent.press(r.getByText("I've finished reading"));
  const body = within(r.getByTestId('prompt-scroll'));
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(r.getByText('Incorrect'));
  fireEvent.press(body.getByTestId('tile-0'));
  fireEvent.press(r.getByText('Back'));
  expect(body.getByTestId('tile-1').props.accessibilityLabel).toBe('same prompt, two, current');
  fireEvent.press(r.getByText('Correct'));
  expect(onItemMarked.mock.calls.map(([item]) => [item.position, item.item_key, item.is_correct]))
    .toEqual([[0, 'same', true], [1, 'same', false], [0, 'same', false], [1, 'same', true]]);
  fireEvent.press(r.getByText('Finish'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0].items.map((item: any) => [item.position, item.item_key, item.is_correct]))
    .toEqual([[0, 'same', false], [1, 'same', true]]);
  expect(onComplete.mock.calls[0][0].derived).toMatchObject({ total_correct: 1, total_attempted: 2, correction_count: 2 });
});

test('the answer screen starts the Re-read story control 16dp below the header', () => {
  const r = render(<ListenAndAnswerStoryQuestion language="en" onComplete={jest.fn()} />);
  fireEvent.press(r.getByText("I've finished reading"));
  let wrapper = r.getByRole('button', { name: 'Re-read story' }).parent;
  while (wrapper && typeof wrapper.type !== 'string') wrapper = wrapper.parent;
  expect(wrapper).toHaveStyle({ paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.lg });
});


test('Q2: the ring starts on question 1, and later questions are faded', () => {
  const r = render(<ListenAndAnswerStoryQuestion language="en" itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN} onComplete={jest.fn()} />);
  fireEvent.press(r.getByText("I've finished reading"));
  expect(r.getByLabelText('What was the name of the bird?, Pip, current')).toBeTruthy();
  const second = within(r.getByTestId('prompt-scroll')).getByTestId('tile-1');
  expect(second.props.accessibilityLabel).toBe('Where did Pip live?, a tree, in a tree, tree, not reached');
  expect(second).toHaveStyle({ opacity: 0.55 });
});

test('Q2: Correct, Incorrect, End question saves asked for reached questions only', () => {
  const onComplete = jest.fn();
  const r = render(<ListenAndAnswerStoryQuestion language="en" itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN} onComplete={onComplete} />);
  fireEvent.press(r.getByText("I've finished reading"));
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(r.getByText('Incorrect'));
  fireEvent.press(r.getByTestId('story-end'));
  fireEvent.press(r.getByText('End question'));
  const result = onComplete.mock.calls[0][0];
  expect(result.items.map((item: any) => item.metadata)).toEqual([
    { reached: true, asked: true }, { reached: true, asked: true },
    { reached: false, asked: false }, { reached: false, asked: false }, { reached: false, asked: false },
  ]);
  expect(result.derived).toMatchObject({ total_correct: 1, total_attempted: 2, questions_asked: 2,
    percent: 50, last_attempted_position: 1, tracks_progress: true, capture_mode: 'sequential' });
  expect(validateResult(result)).toEqual({ valid: true, errors: [] });
});

test('Q2: Re-read story keeps marks and the ring', () => {
  const r = render(<ListenAndAnswerStoryQuestion language="en" itemSet={FIXTURE_LISTEN_AND_ANSWER_STORY_EN} onComplete={jest.fn()} />);
  fireEvent.press(r.getByText("I've finished reading"));
  fireEvent.press(r.getByText('Correct'));
  fireEvent.press(r.getByText('Re-read story'));
  fireEvent.press(r.getByText('Close'));
  expect(r.getByLabelText('What was the name of the bird?, Pip, correct. Double-tap to change to incorrect')).toBeTruthy();
  expect(r.getByLabelText('Where did Pip live?, a tree, in a tree, tree, current')).toBeTruthy();
});

test('Q2: was_timed is false even when the host passes durationSec', () => {
  const onComplete = jest.fn();
  const r = render(<ListenAndAnswerStoryQuestion language="en" durationSec={60} onComplete={onComplete} />);
  fireEvent.press(r.getByText("I've finished reading"));
  expect(r.UNSAFE_queryByType(Countdown)).toBeNull();
  fireEvent.press(r.getByTestId('story-end'));
  fireEvent.press(r.getByText('End question'));
  expect(onComplete.mock.calls[0][0].derived.was_timed).toBe(false);
});
