import { sharedInstructionsFor } from '../assessment-questions';
import { ENGLISH_PEDAGOGICAL_ORDER, ISIXHOSA_PEDAGOGICAL_ORDER, AFRIKAANS_PEDAGOGICAL_ORDER } from '../constants/egraConstants';

export const LETTER_EVIDENCE_CODES = ['letter_sounds'];

export const LANGUAGE_LABELS = { en: 'English', xh: 'isiXhosa', zu: 'isiZulu', af: 'Afrikaans' };

export function languageList(codes) {
  const labels = codes.map(code => LANGUAGE_LABELS[code] ?? code);
  if (labels.length < 2) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}

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

function instructionsFor(code) {
  return Object.fromEntries(['xh', 'en', 'af', 'zu'].map(language => {
    const text = sharedInstructionsFor(code, language);
    if (text === null) throw new TypeError(`Missing shared instructions: ${code}/${language}`);
    return [language, text];
  }));
}

export const STANDALONE_TESTS = [
  {
    code: 'letter_sounds',
    title: 'Letter Sounds',
    durationSec: 60,
    component: 'LetterSoundsQuestion',
    instructions: instructionsFor('letter_sounds'),
  },
  {
    code: 'word_reading',
    title: 'Word Reading',
    durationSec: 60,
    component: 'ReadWordsQuestion',
    instructions: instructionsFor('word_reading'),
  },
];
