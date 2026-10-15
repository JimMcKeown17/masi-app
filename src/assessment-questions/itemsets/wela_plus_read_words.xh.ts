import type { ItemSet } from '../types/ItemSet';
import type { ReadWordsItemSet } from '../questions/ReadWordsQuestion/types';

export const WELA_PLUS_READ_WORDS_XH: ItemSet<ReadWordsItemSet> = {
  item_set_id: 'wela_plus_read_words@2024.1.xh',
  question_code: 'wela_plus_read_words',
  question_version: '2024.1',
  language: 'xh',
  row_lengths: [7, 7, 7, 7, 7, 5],
  words: 'le yam lo wam eli inja bona funa igama ndi ewe nini ikhaya thanda mama jonga hayi emva into ixesha imini ubhuti yiza izolo zisa ibali ibhola baleka nceda ilanga onke omkhulu phezulu inkulu bomvu bantu amanzi izinto usapho kakhulu'.split(' ').map((word) => ({ item_key: word, word })),
};
