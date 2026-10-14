import type { ItemSet } from '../types/ItemSet';
import type { StoryWritingRubricItemSet } from '../questions/StoryWritingRubricQuestion/types';

export const WELA_PLUS_STORY_WRITING_XH: ItemSet<StoryWritingRubricItemSet> = {
  item_set_id: 'wela_plus_story_writing@2024.1.xh',
  question_code: 'wela_plus_story_writing',
  question_version: '2024.1',
  language: 'xh',
  dimensions: [
    { code: 'meaning_making', label: 'Meaning Making', anchors: [], end_anchor_gloss: '' },
    { code: 'spelling', label: 'Spelling', anchors: [], end_anchor_gloss: '' },
    { code: 'length', label: 'Length', anchors: [], end_anchor_gloss: '' },
    { code: 'vocabulary', label: 'Vocabulary', anchors: [], end_anchor_gloss: '' },
  ],
};
