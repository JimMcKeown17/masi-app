import type { EgraAssessment, EgraGrid, EgraItem } from '../../../content/egra';
import type { BatteryConfig, BatteryQuestion } from '../types/BatteryConfig';
import type { ItemSet } from '../types/ItemSet';
import type { LetterSoundsItemSet } from '../questions/LetterSoundsQuestion/types';
import type { ReadWordsItemSet } from '../questions/ReadWordsQuestion/types';
import type { ReadPassageItemSet } from '../questions/ReadPassageQuestion/types';
import type { ReadingComprehensionItemSet } from '../questions/ReadingComprehensionQuestion/types';

export type EgraBattery = BatteryConfig & {
  title: string;
  aboutMinutes: number;
  fixedLanguage: string;
  questions: Array<BatteryQuestion & { title: string }>;
};

export function adaptEgraForm(form: EgraAssessment) {
  const fail = (message: string): never => { throw new TypeError(`${form.id}: ${message}`); };
  const text = (value: string) => { if (typeof value !== 'string' || !value.trim()) fail('empty text'); };
  const ordered = (items: readonly EgraItem[]) => items.forEach((item, position) => {
    if (Number(item.id) !== position + 1) fail('ids must be sequential 1..n');
    text(item.text);
  });
  const grid = (section: EgraGrid) => {
    ordered(section.items);
    if (!Number.isInteger(section.columns) || section.columns <= 0 || section.items.length % section.columns !== 0) {
      fail('items.length must be divisible by columns');
    }
    section.practiceItems.forEach(text);
  };
  grid(form.letters);
  grid(form.words);
  form.letters.items.forEach(item => { if (!/^\p{L}$/u.test(item.text)) fail('letter item must be exactly one Unicode letter'); });
  text(form.passage.text);
  ordered(form.comprehension.questions);
  form.comprehension.questions.forEach(question => {
    text(question.answerText);
    if (question.maxScore !== 1) fail('comprehension maxScore must be 1');
  });
  const meta = (question_code: string) => ({
    question_code, question_version: form.id, language: form.languageCode,
    item_set_id: `${question_code}@${form.id}.${form.languageCode}`,
  });
  const rows: string[][] = [];
  for (let i = 0; i < form.letters.items.length; i += form.letters.columns) {
    rows.push(form.letters.items.slice(i, i + form.letters.columns).map(item => item.text));
  }
  const letter_sounds: LetterSoundsItemSet = {
    ...meta('letter_sounds'), rows,
    stop_rule: { kind: 'first_row_all_wrong', first_row_length: form.letters.columns },
  };
  const word_reading: ItemSet<ReadWordsItemSet> = {
    ...meta('word_reading'), words: form.words.items.map((item, i) => ({ item_key: String(i), word: item.text })),
    row_lengths: Array(form.words.items.length / form.words.columns).fill(form.words.columns),
    stop_rule: { kind: 'first_row_all_wrong', first_row_length: form.words.columns },
  };
  const words: ReadPassageItemSet['words'] = [];
  const paragraph_starts: number[] = [];
  for (const paragraph of form.passage.text.split('\n\n')) {
    paragraph_starts.push(words.length);
    for (const token of paragraph.trim().split(/\s+/u)) {
      if (!/[\p{L}\p{N}]/u.test(token) && words.length > 0) {
        words[words.length - 1].word += ` ${token}`;
      } else {
        words.push({ item_key: String(words.length), word: token });
      }
    }
  }
  const oral_reading: ItemSet<ReadPassageItemSet> = { ...meta('oral_reading'), words, paragraph_starts };
  const reading_comprehension: ReadingComprehensionItemSet = {
    ...meta('reading_comprehension'), passage: form.passage.text,
    questions: form.comprehension.questions.map((q, i) => ({ item_key: String(i), prompt: q.text, answer_guide: q.answerText })),
  };
  const practice = (section: EgraGrid) => section.practiceItems.length
    ? ` Practice first (not scored): ${section.practiceItems.join(', ')}` : '';
  const timedInstructions = (noun: string, section: EgraGrid) =>
    `Ask the child to read the ${noun} in order. Mark each item Correct or Incorrect. Stop if every item in the first row is wrong. End when the child finishes.${practice(section)}`;
  const question = (code: string, title: string, instructions: string, durationSec?: number): BatteryQuestion & { title: string } => ({
    question_code: code, question_version: form.id, title,
    instructions: { [form.languageCode]: instructions },
    ...(durationSec === undefined ? {} : { durationSec }),
    materials: durationSec === undefined ? null : { item: 'reading_card' },
  });
  const battery = {
    battery_code: 'egra', battery_version: form.id, title: form.title, aboutMinutes: 6,
    languages: [form.languageCode], fixedLanguage: form.languageCode, prerequisites: {},
    questions: [
      question('letter_sounds', 'Letter sounds', timedInstructions('letter sounds', form.letters), form.letters.timeLimitSeconds),
      question('word_reading', 'Familiar words', timedInstructions('words', form.words), form.words.timeLimitSeconds),
      question('oral_reading', 'Reading a story', 'Ask the child to read the story aloud. Tap words read incorrectly. At the timer or End, mark the last word read.', form.passage.timeLimitSeconds),
      question('reading_comprehension', 'Story questions', 'Ask the story questions. Use the answer guide to mark each answer Correct, Wrong or Not asked.'),
    ],
  } satisfies EgraBattery;
  return { form, battery, itemSets: { letter_sounds, word_reading, oral_reading, reading_comprehension } };
}
