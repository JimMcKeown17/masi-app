import { getEgraAssessment } from '../../../content/egra';
import type { EgraAssessment } from '../../../content/egra';
import type { ItemSet } from '../types/ItemSet';
import { markingSentence } from '../battery/markingSentence';
import {
  buildLetterSet, buildWordSet, buildPassageSet, buildComprehensionSet, timedInstructions,
} from './adapter';

export const SHARED_READING_VERSION = '2026.3';
type SharedLanguage = 'xh' | 'en' | 'af' | 'zu';

export const SHARED_READING_FORMS: Record<SharedLanguage, { letters: string; reading: string }> = {
  xh: { letters: 'dbe-egra-xh-hl-3-v1', reading: 'dbe-egra-xh-hl-1-v1' },
  // English HL 3 never asks q, v, x or z; FAL 3 has all 26 (Jim, 2026-10-27).
  en: { letters: 'dbe-egra-en-fal-3-v1', reading: 'dbe-egra-en-hl-1-v1' },
  af: { letters: 'dbe-egra-af-hl-3-v1', reading: 'dbe-egra-af-hl-1-v1' },
  zu: { letters: 'smrs-egra-zu-1-v1', reading: 'smrs-egra-zu-1-v1' },
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

deepFreeze(SHARED_READING_FORMS);

function requiredForm(id: string): EgraAssessment {
  const form = getEgraAssessment(id);
  if (!form) throw new TypeError(`Shared reading form is missing from the EGRA pack: ${id}`);
  return form;
}

function byLanguage<T>(build: (language: SharedLanguage) => T): Record<SharedLanguage, T> {
  return { xh: build('xh'), en: build('en'), af: build('af'), zu: build('zu') };
}

const forms = byLanguage(language => ({
  letters: requiredForm(SHARED_READING_FORMS[language].letters),
  reading: requiredForm(SHARED_READING_FORMS[language].reading),
}));

function sourced<T extends object>(set: T, form: EgraAssessment): T & Record<string, unknown> & { source_form_id: string } {
  return { ...set, source_form_id: form.id };
}

// Build once, without the Masi letter extensions. Preserve every printed position and repeat.
export const SHARED_READING_SETS = deepFreeze({
  letter_sounds: byLanguage(language => sourced(buildLetterSet(forms[language].letters, SHARED_READING_VERSION), forms[language].letters)),
  word_reading: byLanguage(language => sourced(buildWordSet(forms[language].reading, SHARED_READING_VERSION), forms[language].reading)),
  oral_reading: byLanguage(language => sourced(buildPassageSet(forms[language].reading, SHARED_READING_VERSION), forms[language].reading)),
  reading_comprehension: byLanguage(language => sourced(buildComprehensionSet(forms[language].reading, SHARED_READING_VERSION), forms[language].reading)),
});

const instructions = byLanguage(language => ({
  letter_sounds: `Hand the child Reading Card side A. ${timedInstructions('letter sounds', forms[language].letters.letters)}`,
  word_reading: `Hand the child Reading Card side B. ${timedInstructions('words', forms[language].reading.words)}`,
  oral_reading: `Hand the child Reading Card side C. Ask the child to read the story aloud. ${markingSentence('word')} The test stops by itself when the time is up.`,
  reading_comprehension: `Ask the story questions. Use the answer guide to decide. ${markingSentence('question')}`,
}));

type SharedCode = keyof typeof SHARED_READING_SETS;
const isSharedCode = (code: string): code is SharedCode => Object.prototype.hasOwnProperty.call(SHARED_READING_SETS, code);
const isSharedLanguage = (language: string): language is SharedLanguage => Object.prototype.hasOwnProperty.call(SHARED_READING_FORMS, language);

export function sharedItemSetFor(questionCode: string, questionVersion: string, language: string): (ItemSet & { source_form_id: string }) | null {
  if (questionVersion !== SHARED_READING_VERSION || !isSharedCode(questionCode) || !isSharedLanguage(language)) return null;
  return SHARED_READING_SETS[questionCode][language];
}

export function sharedInstructionsFor(questionCode: string, language: string): string | null {
  if (!isSharedCode(questionCode) || !isSharedLanguage(language)) return null;
  return instructions[language][questionCode];
}
