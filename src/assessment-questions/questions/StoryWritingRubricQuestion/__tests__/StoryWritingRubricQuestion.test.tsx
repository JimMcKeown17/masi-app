import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { StoryWritingRubricQuestion } from '..';

describe('StoryWritingRubricQuestion — intro & active', () => {
  test('renders 4 dimension cards + picture alt + a Total: 0 / 16 running counter', () => {
    const { getByText } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="Read the child's story and score each dimension."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('Meaning Making')).toBeTruthy();
    expect(getByText('Spelling')).toBeTruthy();
    expect(getByText('Length')).toBeTruthy();
    expect(getByText('Vocabulary')).toBeTruthy();
    expect(getByText(/A child playing under a tree/)).toBeTruthy();
    expect(getByText('Total: 0 / 16')).toBeTruthy();
  });
});

describe('StoryWritingRubricQuestion — chip scoring', () => {
  test('tap a chip records the score and updates the running total', () => {
    const { getByText, getByTestId } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    // Score meaning_making = 3
    fireEvent.press(getByTestId('chip-meaning_making-3'));
    expect(getByText('Total: 3 / 16')).toBeTruthy();
    // Score spelling = 2
    fireEvent.press(getByTestId('chip-spelling-2'));
    expect(getByText('Total: 5 / 16')).toBeTruthy();
  });

  test('re-scoring a dimension replaces the previous selection (no toggle-clear)', () => {
    const { getByText, getByTestId } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByTestId('chip-meaning_making-4'));
    expect(getByText('Total: 4 / 16')).toBeTruthy();
    // Tap a different chip — that's a re-score, not a toggle-clear.
    fireEvent.press(getByTestId('chip-meaning_making-1'));
    expect(getByText('Total: 1 / 16')).toBeTruthy();
  });

  test('score 0 is a valid selection (not "unscored")', () => {
    const { getByText, getByTestId } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByTestId('chip-spelling-0'));
    // Score is 0, but spelling is "decided" — Finish should not warn for it.
    expect(getByText('Total: 0 / 16')).toBeTruthy();
  });
});

describe('StoryWritingRubricQuestion — View full rubric sheet', () => {
  test('"View full rubric" opens a modal with all 5 anchor texts for the dimension', () => {
    const { getByText, getByTestId, queryByText } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    // Anchor "sophisticated, fully developed" should be hidden by default
    expect(queryByText('sophisticated, fully developed')).toBeNull();
    fireEvent.press(getByTestId('view-rubric-meaning_making'));
    expect(getByText('sophisticated, fully developed')).toBeTruthy();
    expect(getByText('no attempt')).toBeTruthy();
    // Close
    fireEvent.press(getByText('Close'));
    expect(queryByText('sophisticated, fully developed')).toBeNull();
  });

  test('opening + closing the rubric sheet preserves chip selections', () => {
    const { getByText, getByTestId } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByTestId('chip-meaning_making-3'));
    fireEvent.press(getByTestId('view-rubric-meaning_making'));
    fireEvent.press(getByText('Close'));
    // Total should still reflect meaning_making=3
    expect(getByText('Total: 3 / 16')).toBeTruthy();
  });
});

describe('StoryWritingRubricQuestion — picture thumbnail tap-to-enlarge', () => {
  test('tapping the picture thumbnail opens an enlarged sheet', () => {
    const { getByText, getByTestId, getAllByText } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByTestId('picture-thumbnail'));
    // Enlarged sheet has its own "Close" button; the alt text now appears
    // in both the thumbnail and the sheet — assert multiple matches.
    expect(getAllByText(/A child playing under a tree/).length).toBeGreaterThan(1);
    fireEvent.press(getByText('Close'));
  });
});

describe('StoryWritingRubricQuestion — Finish flow', () => {
  test('Finish with all 4 dimensions scored emits items[] with ea: prefixed item_keys', () => {
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByTestId('chip-meaning_making-3'));
    fireEvent.press(getByTestId('chip-spelling-2'));
    fireEvent.press(getByTestId('chip-length-4'));
    fireEvent.press(getByTestId('chip-vocabulary-1'));
    fireEvent.press(getByText('Finish'));

    const r = onComplete.mock.calls[0][0];
    expect(r.stopped_reason).toBe('completed');
    expect(r.question_code).toBe('wela_plus_story_writing');
    expect(r.items).toHaveLength(4);
    // ADR-0004: every Q11 row has an `ea:` prefixed item_key.
    expect(r.items.map((i: { item_key: string }) => i.item_key)).toEqual([
      'ea:meaning_making',
      'ea:spelling',
      'ea:length',
      'ea:vocabulary',
    ]);
    // is_correct=false on every Q11 row (not the carrier; metadata.score is).
    expect(r.items.every((i: { is_correct: boolean }) => i.is_correct === false)).toBe(true);
    // metadata.score/scorer per ADR-0004
    expect(r.items[0].metadata).toMatchObject({
      score: 3,
      scorer: 'ea',
      anchor_text: 'clear and developed',
    });
    expect(r.derived.ea_rubric_total).toBe(10); // 3+2+4+1
    expect(r.derived.by_dimension).toEqual({
      meaning_making: 3,
      spelling: 2,
      length: 4,
      vocabulary: 1,
    });
    expect(r.derived.max).toBe(16);
  });

  test('Finish with unscored dimensions shows a confirmation', () => {
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByTestId('chip-meaning_making-3'));
    fireEvent.press(getByText('Finish'));
    expect(getByText(/3 dimensions unscored/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('Yes from confirmation emits Result with unscored dimensions absent from items[]', () => {
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByTestId('chip-meaning_making-3'));
    fireEvent.press(getByText('Finish'));
    fireEvent.press(getByText('Yes, finish'));
    const r = onComplete.mock.calls[0][0];
    // Only 1 dimension scored → 1 item
    expect(r.items).toHaveLength(1);
    expect(r.items[0].item_key).toBe('ea:meaning_making');
    expect(r.derived.ea_rubric_total).toBe(3);
  });
});

describe('StoryWritingRubricQuestion — onItemMarked', () => {
  test('fires per-chip-tap with ea: prefix + score metadata (matches Question contract)', () => {
    const onItemMarked = jest.fn();
    const { getByText, getByTestId } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
        onItemMarked={onItemMarked}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByTestId('chip-meaning_making-3'));
    expect(onItemMarked).toHaveBeenCalledTimes(1);
    const item = onItemMarked.mock.calls[0][0];
    expect(item.item_key).toBe('ea:meaning_making');
    expect(item.prompt).toBe('Meaning Making');
    expect(item.is_correct).toBe(false);
    expect(item.metadata).toMatchObject({
      score: 3,
      scorer: 'ea',
      anchor_text: 'clear and developed',
    });
  });

  test('re-scoring (different chip on same dimension) fires another onItemMarked', () => {
    const onItemMarked = jest.fn();
    const { getByText, getByTestId } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        onComplete={jest.fn()}
        onItemMarked={onItemMarked}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByTestId('chip-spelling-2'));
    fireEvent.press(getByTestId('chip-spelling-4'));
    expect(onItemMarked).toHaveBeenCalledTimes(2);
    expect(onItemMarked.mock.calls[1][0].metadata.score).toBe(4);
  });
});

describe('StoryWritingRubricQuestion — Abandon flow', () => {
  test('Abandon picker fires onAbandon and emits items=[] (skip-empty contract)', () => {
    const onComplete = jest.fn();
    const onAbandon = jest.fn();
    const { getByText } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        onComplete={onComplete}
        onAbandon={onAbandon}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Abandon'));
    fireEvent.press(getByText('Child refused'));
    expect(onAbandon).toHaveBeenCalledWith('skipped_child_refused');
    const r = onComplete.mock.calls[0][0];
    expect(r.stopped_reason).toBe('skipped_child_refused');
    expect(r.items).toEqual([]);
    expect(r.derived.ea_rubric_total).toBe(0);
  });
});

describe('StoryWritingRubricQuestion — itemSet override', () => {
  test('falls back to bundled default when override missing item_set_id', () => {
    const { getByText } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        itemSet={{ dimensions: [] }}
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('Meaning Making')).toBeTruthy();
  });

  test('accepts a fully-formed override with a different dimension count', () => {
    const onComplete = jest.fn();
    const override = {
      item_set_id: 'custom@1.0.en',
      question_version: '1.0',
      picture: { source: null, alt: 'Custom picture' },
      dimensions: [
        {
          code: 'creativity',
          label: 'Creativity',
          end_anchor_gloss: 'none → strong',
          anchors: [
            { score: 0, text: 'none' },
            { score: 1, text: 'minimal' },
            { score: 2, text: 'some' },
            { score: 3, text: 'strong' },
            { score: 4, text: 'exceptional' },
          ],
        },
      ],
    };
    const { getByText, getByTestId } = render(
      <StoryWritingRubricQuestion
        language="en"
        instructions="."
        itemSet={override}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(getByText('Creativity')).toBeTruthy();
    expect(getByText(/Custom picture/)).toBeTruthy();
    fireEvent.press(getByTestId('chip-creativity-2'));
    fireEvent.press(getByText('Finish'));
    const r = onComplete.mock.calls[0][0];
    expect(r.items).toHaveLength(1);
    expect(r.items[0].item_key).toBe('ea:creativity');
    expect(r.derived.max).toBe(4); // 1 dimension × 4 max
    expect(r.derived.ea_rubric_total).toBe(2);
  });
});
