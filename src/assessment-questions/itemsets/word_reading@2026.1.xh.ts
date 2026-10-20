import type { ItemSet } from '../types/ItemSet';
import type { ReadWordsItemSet } from '../questions/ReadWordsQuestion/types';

export const WORD_READING_2026_1_XH: ItemSet<ReadWordsItemSet> = {
  item_set_id: 'word_reading@2026.1.xh',
  question_code: 'word_reading',
  question_version: '2026.1',
  language: 'xh',
  row_lengths: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  words: [
    'inja', 'amanzi', 'umama', 'ubaba', 'indlu',
    'isikolo', 'umntana', 'inkomo', 'intaka', 'ilanga',
    'inyoka', 'imbali', 'isisu', 'ubuso', 'umlomo',
    'amehlo', 'indlela', 'isango', 'ilitye', 'umthi',
    'inkwenkwe', 'intombi', 'inyama', 'isonka', 'ubisi',
    'itafile', 'isitulo', 'incwadi', 'ipensile', 'ibhola',
    'ikatsu', 'inguruma', 'isiketi', 'ibhatyi', 'ihempe',
    'ibhulukhwe', 'umnqwazi', 'izihlangu', 'unyawo', 'isandla',
    'indlebe', 'impumlo', 'intloko', 'amadolo', 'imilenze',
    'iminwe', 'amazinyo', 'ulwimi', 'isikhalo', 'uthando',
  ].map((word, index) => ({ item_key: String(index), word })),
};
