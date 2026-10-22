import { ENGLISH_PEDAGOGICAL_ORDER, ISIXHOSA_PEDAGOGICAL_ORDER, AFRIKAANS_PEDAGOGICAL_ORDER } from '../constants/egraConstants';

export const LETTER_EVIDENCE_CODES = ['letter_sounds'];

export const LANGUAGE_LABELS = { en: 'English', xh: 'isiXhosa', zu: 'isiZulu', af: 'Afrikaans' };

export function languageCodeForHomeLanguage(text) {
  if (typeof text !== 'string') return null;
  switch (text.trim().toLowerCase()) {
    case 'english': return 'en';
    case 'xhosa':
    case 'isixhosa': return 'xh';
    case 'zulu':
    case 'isizulu': return 'zu';
    case 'afrikaans': return 'af';
    default: return null;
  }
}

export const PEDAGOGICAL_ORDERS = {
  en: ENGLISH_PEDAGOGICAL_ORDER,
  xh: ISIXHOSA_PEDAGOGICAL_ORDER,
  af: AFRIKAANS_PEDAGOGICAL_ORDER,
};

export const STANDALONE_TESTS = [
  {
    code: 'letter_sounds',
    title: 'Letter Sounds',
    durationSec: 60,
    component: 'LetterSoundsQuestion',
    instructions: '1. Tap Start to begin the 60-second timer.\n'
      + '2. The highlighted letter is the one the child is reading.\n'
      + '3. Tap Correct or Incorrect. The next letter is highlighted automatically.\n'
      + '4. Tap Back to fix a mistake.\n'
      + '5. After 10 wrong in a row, the test stops.',
  },
  {
    code: 'word_reading',
    title: 'Word Reading',
    durationSec: 60,
    component: 'ReadWordsQuestion',
    instructions: '1. Tap Start to begin the 60-second timer.\n'
      + '2. The highlighted word is the one the child is reading.\n'
      + '3. Tap Correct or Incorrect. The next word is highlighted automatically.\n'
      + '4. Tap Back to fix a mistake.',
  },
];
