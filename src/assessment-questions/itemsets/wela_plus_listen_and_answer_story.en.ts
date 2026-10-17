import type { ItemSet } from '../types/ItemSet';
import type { ListenAndAnswerStoryItemSet } from '../questions/ListenAndAnswerStoryQuestion/types';

export const WELA_PLUS_LISTEN_AND_ANSWER_STORY_EN: ItemSet<ListenAndAnswerStoryItemSet> = {
  item_set_id: 'wela_plus_listen_and_answer_story@2024.1.en',
  question_code: 'wela_plus_listen_and_answer_story',
  question_version: '2024.1',
  language: 'en',
  story: 'A girl was out for a walk. She was wearing her new running shoes. There were so many trees around her. She looked up at the trees, they were tall and beautiful. Then suddenly, she heard someone crying. She walked towards the sound and saw a boy lying on the ground under a tree. Next to him was a broken branch. The boy was bleeding from a wound on his knee and there was a big scratch on his elbow.',
  questions: [
    { item_key: 'q2.item_1', prompt: 'What did the girl have on her feet?', acceptable_answers: ['running shoes'] },
    { item_key: 'q2.item_2', prompt: 'What did she hear?', acceptable_answers: ['crying'] },
    { item_key: 'q2.item_3', prompt: 'Where do you think she was?', acceptable_answers: ['near trees', 'in a forest', 'park'] },
    { item_key: 'q2.item_4', prompt: 'What happened to the boy?', acceptable_answers: ['he fell from a tree'] },
    { item_key: 'q2.item_5', prompt: 'What do you think the girl felt when she saw the boy?', acceptable_answers: ['she felt sorry for him', 'sad', 'or similar answers'] },
  ],
};
