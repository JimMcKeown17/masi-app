// Zazi's provisional, unreviewed afrikaans_words_50, per lesson-plan spec C21.
// Source: Zazi f0c9ee49 src/constants/egraConstants.js:187-200.
import type { ItemSet } from '../types/ItemSet';
import type { ReadWordsItemSet, ReadWordsPrompt } from '../questions/ReadWordsQuestion/types';

const words: ReadWordsPrompt[] = [
  'die','en','is','in','op','nie','ek','jy','sy','hy',
  'ons','dit','was','het','kan','man','kat','mat','sit','pot',
  'bal','vis','bed','rok','son','maan','boom','boek','huis','muis',
  'koei','skool','water','appel','lekker','mamma','pappa','baba','hond','bok',
  'tafel','stoel','deur','venster','kamer','tuin','brood','melk','eier','vrug',
].map((word, index) => ({ item_key: String(index), word }));
words.forEach(Object.freeze);
Object.freeze(words);

export const WORD_READING_2026_1_AF: ItemSet<ReadWordsItemSet> = {
  item_set_id: 'word_reading@2026.1.af',
  question_code: 'word_reading',
  question_version: '2026.1',
  language: 'af',
  row_lengths: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  words,
};
Object.freeze(WORD_READING_2026_1_AF);
