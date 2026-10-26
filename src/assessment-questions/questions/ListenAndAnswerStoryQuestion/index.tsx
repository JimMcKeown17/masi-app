import React from 'react';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import { StoryQuestionsCapture } from '../../progress/StoryQuestionsCapture';
import type { ListenAndAnswerStoryItemSet } from './types';
import { WELA_PLUS_LISTEN_AND_ANSWER_STORY_EN } from '../../itemsets/wela_plus_listen_and_answer_story.en';
import { WELA_PLUS_LISTEN_AND_ANSWER_STORY_XH } from '../../itemsets/wela_plus_listen_and_answer_story.xh';

type FullItemSet = ListenAndAnswerStoryItemSet & ItemSetMeta;

function isValidComprehensionQuestion(q: unknown): boolean {
  if (!q || typeof q !== 'object') return false;
  const item = q as Record<string, unknown>;
  if (typeof item.item_key !== 'string') return false;
  if (typeof item.prompt !== 'string') return false;
  if (!Array.isArray(item.acceptable_answers)) return false;
  return item.acceptable_answers.every((a) => typeof a === 'string');
}

// Note: itemset overrides are SINGLE-LANGUAGE by codebase convention,
// matching wela_plus_listen_and_answer_story.{en,xh}.ts. The PRD's
// bilingual story/prompt nesting is the abstract content model;
// `resolveItemSet` picks only the requested per-language file.
function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.story !== 'string') return false;
  if (!Array.isArray(o.questions)) return false;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  return o.questions.every(isValidComprehensionQuestion);
}

export function ListenAndAnswerStoryQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_LISTEN_AND_ANSWER_STORY_EN, xh: WELA_PLUS_LISTEN_AND_ANSWER_STORY_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <ListenAndAnswerStoryQuestionContent {...props} itemSet={itemSet} />;
}

function ListenAndAnswerStoryQuestionContent({ itemSet, ...props }: QuestionProps & { itemSet: FullItemSet }) {
  return <StoryQuestionsCapture {...props} itemSet={itemSet} story={itemSet.story}
    questions={itemSet.questions.map(question => ({
      item_key: question.item_key, prompt: question.prompt, guide: question.acceptable_answers.join(', '),
    }))}
    storyButton="Re-read story"
    intro={{ startLabel: "I've finished reading", testID: 'intro-story', showStory: true }} />;
}
