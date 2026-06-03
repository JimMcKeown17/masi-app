import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ListenAndAnswerStoryQuestion } from '..';

describe('ListenAndAnswerStoryQuestion — intro phase', () => {
  test('renders the story script + an "I\'ve finished reading" primary action', () => {
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="Read the story aloud."
        onComplete={jest.fn()}
      />,
    );

    // Stub story content from wela_plus_listen_and_answer_story.en.ts
    expect(getByText(/Once upon a time/)).toBeTruthy();
    expect(getByText(/I've finished reading/)).toBeTruthy();
  });
});

describe('ListenAndAnswerStoryQuestion — active phase', () => {
  test('"I\'ve finished reading" advances to active and renders all 5 comprehension prompts', () => {
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
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
  test('tap a prompt card marks it correct (accessibility flips)', () => {
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));

    expect(getByLabelText('What was the name of the bird?, idle')).toBeTruthy();
    fireEvent.press(getByLabelText('What was the name of the bird?, idle'));
    expect(getByLabelText('What was the name of the bird?, correct')).toBeTruthy();
  });

  test('second tap clears the mark', () => {
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));

    fireEvent.press(getByLabelText('What was the name of the bird?, idle'));
    fireEvent.press(getByLabelText('What was the name of the bird?, correct'));
    expect(getByLabelText('What was the name of the bird?, idle')).toBeTruthy();
  });
});

describe('ListenAndAnswerStoryQuestion — Re-read story modal', () => {
  test('"Re-read story" pill is visible in the active phase', () => {
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
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
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));

    // Mark a card, open re-read, dismiss, verify mark survives.
    fireEvent.press(getByLabelText('What was the name of the bird?, idle'));
    fireEvent.press(getByText('Re-read story'));
    fireEvent.press(getByText('Close'));

    expect(getByLabelText('What was the name of the bird?, correct')).toBeTruthy();
  });
});

describe('ListenAndAnswerStoryQuestion — Finish flow', () => {
  test('Finish with all unmarked shows a confirmation listing unmarked count', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('Finish'));

    expect(getByText(/5 items unmarked/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('Cancel from confirmation returns to active without emitting', () => {
    const onComplete = jest.fn();
    const { getByText, queryByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Cancel'));

    expect(queryByText(/items unmarked/i)).toBeNull();
    expect(getByLabelText('What was the name of the bird?, idle')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('Yes from confirmation emits Result with stopped_reason=completed', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByLabelText('What was the name of the bird?, idle'));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.stopped_reason).toBe('completed');
    expect(result.derived.total_correct).toBe(1);
    expect(result.items[0].item_key).toBe('q2.story.item_1');
    expect(result.question_code).toBe('wela_plus_listen_and_answer_story');
  });

  test('Finish with all marked emits immediately (no confirmation)', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
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
      fireEvent.press(getByLabelText(`${p}, idle`));
    });
    fireEvent.press(getByText('Finish'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].derived.total_correct).toBe(5);
  });
});

describe('ListenAndAnswerStoryQuestion — Abandon flow', () => {
  test('Abandon button opens a reason picker with 6 reasons', () => {
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('Abandon'));

    expect(getByText(/Why are you abandoning/i)).toBeTruthy();
    expect(getByText('Child refused')).toBeTruthy();
    expect(getByText('Other')).toBeTruthy();
  });

  test('selecting a reason fires onAbandon and emits Result with that stopped_reason', () => {
    const onComplete = jest.fn();
    const onAbandon = jest.fn();
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
        onAbandon={onAbandon}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('Abandon'));
    fireEvent.press(getByText('Child refused'));

    expect(onAbandon).toHaveBeenCalledWith('skipped_child_refused');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe(
      'skipped_child_refused',
    );
  });

  test('Cancel from abandon-picker returns to active without emitting', () => {
    const onComplete = jest.fn();
    const onAbandon = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
        onAbandon={onAbandon}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('Abandon'));
    fireEvent.press(getByText('Cancel'));

    expect(onAbandon).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(getByLabelText('What was the name of the bird?, idle')).toBeTruthy();
  });
});

describe('ListenAndAnswerStoryQuestion — itemSet override validation', () => {
  test('falls back to bundled default when override is missing item_set_id', () => {
    const onComplete = jest.fn();
    const incomplete = {
      story: 'pretend story text',
      questions: [{ item_key: 'k', prompt: 'pretend?', acceptable_answers: ['a'] }],
    };
    const { getByText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        itemSet={incomplete}
        onComplete={onComplete}
      />,
    );
    // Bundled default story appears (not the override's "pretend" text)
    expect(getByText(/Once upon a time/)).toBeTruthy();
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

    expect(onComplete.mock.calls[0][0].item_set_id).toMatch(
      /^wela_plus_listen_and_answer_story@stub/,
    );
  });

  test('falls back when override has wrong shape (story not a string)', () => {
    const onComplete = jest.fn();
    const malformed = {
      item_set_id: 'custom@1.0.en',
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
    expect(getByText(/Once upon a time/)).toBeTruthy();
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

    expect(onComplete.mock.calls[0][0].item_set_id).toMatch(
      /^wela_plus_listen_and_answer_story@stub/,
    );
  });

  test('accepts a fully-formed override', () => {
    const onComplete = jest.fn();
    const goodOverride = {
      item_set_id: 'custom@1.0.en',
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
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

    expect(onComplete.mock.calls[0][0].item_set_id).toBe('custom@1.0.en');
  });
});

describe('ListenAndAnswerStoryQuestion — Pattern F is untimed', () => {
  test('was_timed is false in the emitted Result even when host passes durationSec', () => {
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        durationSec={60}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByLabelText('What was the name of the bird?, idle'));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));

    expect(onComplete.mock.calls[0][0].derived.was_timed).toBe(false);
    expect(onComplete.mock.calls[0][0].derived.last_attempted_position).toBeNull();
  });
});

describe('ListenAndAnswerStoryQuestion — onItemMarked', () => {
  test('fires per-tap with the item shape', () => {
    const onItemMarked = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
        onItemMarked={onItemMarked}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByLabelText('What was the name of the bird?, idle'));

    expect(onItemMarked).toHaveBeenCalledTimes(1);
    const item = onItemMarked.mock.calls[0][0];
    expect(item.item_key).toBe('q2.story.item_1');
    expect(item.prompt).toBe('What was the name of the bird?');
    expect(item.is_correct).toBe(true);
  });

  test('untap fires onItemMarked with is_correct=false', () => {
    const onItemMarked = jest.fn();
    const { getByText, getByLabelText } = render(
      <ListenAndAnswerStoryQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
        onItemMarked={onItemMarked}
      />,
    );
    fireEvent.press(getByText("I've finished reading"));
    fireEvent.press(getByLabelText('What was the name of the bird?, idle'));
    fireEvent.press(getByLabelText('What was the name of the bird?, correct'));

    expect(onItemMarked).toHaveBeenCalledTimes(2);
    expect(onItemMarked.mock.calls[1][0].is_correct).toBe(false);
  });
});

describe('ListenAndAnswerStoryQuestion — questions.length not hardcoded', () => {
  test('renders fewer or more comprehension prompts when itemset overrides it', () => {
    const onComplete = jest.fn();
    const override = {
      item_set_id: 'custom@1.0.en',
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

    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText(/1 items? unmarked/));
    fireEvent.press(getByText('Yes, finish'));

    const result = onComplete.mock.calls[0][0];
    expect(result.items).toHaveLength(1);
    expect(result.derived.total_attempted).toBe(1);
  });
});
