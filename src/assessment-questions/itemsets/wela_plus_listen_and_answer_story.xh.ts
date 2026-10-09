import type { ItemSet } from '../types/ItemSet';
import type { ListenAndAnswerStoryItemSet } from '../questions/ListenAndAnswerStoryQuestion/types';

// PLACEHOLDER content — English text used as a placeholder until pedagogy supplies isiXhosa via #34.
// Stub-marked item_set_id so any captured run is distinguishable.
export const WELA_PLUS_LISTEN_AND_ANSWER_STORY_XH: ItemSet<ListenAndAnswerStoryItemSet> = {
  item_set_id: 'wela_plus_listen_and_answer_story@stub-2026-06-02.xh',
  question_code: 'wela_plus_listen_and_answer_story',
  question_version: 'stub-2026-06-02',
  language: 'xh',
  story:
    'Once upon a time, a small bird named Pip lived in a tree. ' +
    'Pip wanted to find the sweetest berry in the forest. ' +
    'He flew over rivers and hills until he found a red bush. ' +
    'The berries on the red bush were sweet. ' +
    'Pip ate one berry and flew home happy.',
  questions: [
    {
      item_key: 'q2.story.item_1',
      prompt: 'What was the name of the bird?',
      acceptable_answers: ['Pip'],
    },
    {
      item_key: 'q2.story.item_2',
      prompt: 'Where did Pip live?',
      acceptable_answers: ['a tree', 'in a tree', 'tree'],
    },
    {
      item_key: 'q2.story.item_3',
      prompt: 'What did Pip want to find?',
      acceptable_answers: ['the sweetest berry', 'a berry', 'berry'],
    },
    {
      item_key: 'q2.story.item_4',
      prompt: 'What colour was the bush?',
      acceptable_answers: ['red'],
    },
    {
      item_key: 'q2.story.item_5',
      prompt: 'How did Pip feel at the end?',
      acceptable_answers: ['happy', 'glad'],
    },
  ],
};
