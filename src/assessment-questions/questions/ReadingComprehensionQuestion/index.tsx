import React from 'react';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ReadingComprehensionItemSet } from './types';
import { MissingItemSet } from '../../progress/MissingItemSet';
import { StoryQuestionsCapture } from '../../progress/StoryQuestionsCapture';

function isItemSet(value: unknown): value is ReadingComprehensionItemSet {
  if (!value || typeof value !== 'object') return false;
  const set = value as ReadingComprehensionItemSet;
  return [set.item_set_id, set.question_code, set.question_version, set.language, set.passage]
    .every(text => typeof text === 'string' && text.trim().length > 0) &&
    Array.isArray(set.questions) && set.questions.length > 0 && set.questions.every(q =>
      q && [q.item_key, q.prompt, q.answer_guide].every(text => typeof text === 'string' && text.trim().length > 0));
}
export function ReadingComprehensionQuestion(props: QuestionProps) {
  if (!isItemSet(props.itemSet)) return <MissingItemSet language={props.language} />;
  return <Content {...props} itemSet={props.itemSet} />;
}
function Content({ itemSet, ...props }: QuestionProps & { itemSet: ReadingComprehensionItemSet }) {
  return <StoryQuestionsCapture {...props} itemSet={itemSet} story={itemSet.passage}
    questions={itemSet.questions.map(question => ({
      item_key: question.item_key, prompt: question.prompt, guide: `Answer guide: ${question.answer_guide}`,
    }))}
    storyButton="Show story" intro={{ startLabel: 'Ask the questions', showStory: false }} />;
}
