import type { ItemSet } from '../types/ItemSet';
import type { ReadPassageItemSet } from '../questions/ReadPassageQuestion/types';
import { buildPassage } from './buildPassage';

export const WELA_PLUS_READ_PASSAGE_EN: ItemSet<ReadPassageItemSet> = {
  item_set_id: 'wela_plus_read_passage@2024.1.en',
  question_code: 'wela_plus_read_passage',
  question_version: '2024.1',
  language: 'en',
  ...buildPassage([
    'Sam was running down the street with her friends. She fell down and cut her knee. It hurt a lot. She started to cry.',
    'Thandi stopped to help her. She picked Sam up and they walked back to her house.',
    "Sam's mother gave her a big hug. Then she walked into the kitchen. When she came back out, she was holding two bowls of ice cream.",
    'Sam and Thandi sat down to eat some ice cream. Everyone felt much better.',
  ]),
};
