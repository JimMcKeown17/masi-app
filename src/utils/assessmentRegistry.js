import { ENGLISH_PEDAGOGICAL_ORDER, ISIXHOSA_PEDAGOGICAL_ORDER } from '../constants/egraConstants';

export const LETTER_EVIDENCE_CODES = ['letter_sounds'];

export const LANGUAGE_LABELS = { en: 'English', xh: 'isiXhosa', zu: 'isiZulu' };

export function languageCodeForHomeLanguage(text) {
  if (typeof text !== 'string') return null;
  switch (text.trim().toLowerCase()) {
    case 'english': return 'en';
    case 'xhosa':
    case 'isixhosa': return 'xh';
    case 'zulu':
    case 'isizulu': return 'zu';
    default: return null;
  }
}

export const PEDAGOGICAL_ORDERS = {
  en: ENGLISH_PEDAGOGICAL_ORDER,
  xh: ISIXHOSA_PEDAGOGICAL_ORDER,
};

export const STANDALONE_TESTS = [
  { code: 'letter_sounds', title: 'Letter Sounds', durationSec: 60, component: 'LetterSoundsQuestion' },
  { code: 'word_reading', title: 'Word Reading', durationSec: 60, component: 'ReadWordsQuestion' },
];
