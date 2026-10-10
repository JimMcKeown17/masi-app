import type { ItemSet } from '../types/ItemSet';
import type { StoryWritingRubricItemSet } from '../questions/StoryWritingRubricQuestion/types';

// PLACEHOLDER content — English used until pedagogy supplies isiXhosa via #34.
export const WELA_PLUS_STORY_WRITING_XH: ItemSet<StoryWritingRubricItemSet> = {
  item_set_id: 'wela_plus_story_writing@stub-2026-06-04.xh',
  question_code: 'wela_plus_story_writing',
  question_version: 'stub-2026-06-04',
  language: 'xh',
  picture: {
    source: null,
    alt: 'A child playing under a tree on a sunny day.',
  },
  dimensions: [
    {
      code: 'meaning_making',
      label: 'Meaning Making',
      end_anchor_gloss: 'no attempt → partial → sophisticated',
      anchors: [
        { score: 0, text: 'no attempt' },
        { score: 1, text: 'fragment, unclear' },
        { score: 2, text: 'partial idea, some development' },
        { score: 3, text: 'clear and developed' },
        { score: 4, text: 'sophisticated, fully developed' },
      ],
    },
    {
      code: 'spelling',
      label: 'Spelling',
      end_anchor_gloss: 'unreadable → mostly correct → conventional',
      anchors: [
        { score: 0, text: 'unreadable / no attempt' },
        { score: 1, text: 'many invented spellings' },
        { score: 2, text: 'some invented, some conventional' },
        { score: 3, text: 'mostly conventional' },
        { score: 4, text: 'conventional throughout' },
      ],
    },
    {
      code: 'length',
      label: 'Length',
      end_anchor_gloss: 'one word or less → multiple sentences',
      anchors: [
        { score: 0, text: 'no writing' },
        { score: 1, text: 'one word or fragment' },
        { score: 2, text: 'one sentence' },
        { score: 3, text: 'two to three sentences' },
        { score: 4, text: 'four or more sentences' },
      ],
    },
    {
      code: 'vocabulary',
      label: 'Vocabulary',
      end_anchor_gloss: 'limited → varied → precise',
      anchors: [
        { score: 0, text: 'no writing' },
        { score: 1, text: 'very limited word choice' },
        { score: 2, text: 'common words only' },
        { score: 3, text: 'some varied vocabulary' },
        { score: 4, text: 'precise and varied vocabulary' },
      ],
    },
  ],
};
