import {
  batteryFor,
  bundledItemSetFor,
  skippedResult,
  WELA_PLUS_FULL_2024_1,
  LETTER_SOUNDS_2026_1_EN,
  LETTER_SOUNDS_2026_2_EN,
  WORD_READING_2026_1_AF,
} from '../../index';
import type { ItemSetMeta, StoppedReason } from '../../index';
import * as bundledSets from '../../itemsets';
import { validateResult } from '../../contractTest/validateResult';
import { EGRA_BATTERIES, EGRA_LETTER_EXTENSIONS, egraItemSetFor } from '../../egra';

test.each(EGRA_BATTERIES.flatMap(battery => battery.questions.map(question => ({
  question, language: battery.fixedLanguage,
}))))('EGRA $question.question_code@$question.question_version resolves in $language with valid skip provenance', ({ question, language }) => {
  const set = bundledItemSetFor(question.question_code, question.question_version, language);
  expect(set).not.toBeNull();
  expect(set).toBe(egraItemSetFor(question.question_code, question.question_version, language));
  expect(set).toMatchObject({ question_code: question.question_code,
    question_version: question.question_version, language });
  expect(bundledItemSetFor(question.question_code, question.question_version, 'unknown')).toBeNull();
  for (const otherLanguage of ['en', 'xh', 'af', 'zu'].filter(code => code !== language)) {
    expect(bundledItemSetFor(question.question_code, question.question_version, otherLanguage)).toBeNull();
  }
  expect(validateResult(skippedResult(question, language, 'skipped_prerequisite_unmet')).valid).toBe(true);
});

test.each(Object.keys(EGRA_LETTER_EXTENSIONS))('extended %s exposes only the Masi 60-letter version', id => {
  const battery = batteryFor('egra', id)!;
  expect(bundledItemSetFor('letter_sounds', id, battery.fixedLanguage!)).toBeNull();
  const set = bundledItemSetFor('letter_sounds', `${id}-masi60`, battery.fixedLanguage!) as { rows: string[][] } | null;
  expect(set?.rows.flat()).toHaveLength(60);
});

test('every EGRA form resolves by exact battery identity alongside WelaPLUS', () => {
  expect(EGRA_BATTERIES).toHaveLength(13);
  for (const battery of EGRA_BATTERIES) {
    expect(batteryFor('egra', battery.battery_version)).toBe(battery);
  }
  expect(batteryFor('egra', 'unknown')).toBeNull();
  expect(batteryFor('wela_plus_full', '2024.1')).toBe(WELA_PLUS_FULL_2024_1);
});

test('duplicate battery identities fail loudly when the registry loads', () => {
  try {
    jest.isolateModules(() => {
      jest.doMock('../../egra', () => ({
        EGRA_BATTERIES: [WELA_PLUS_FULL_2024_1],
      }));
      expect(() => require('../registry')).toThrow('Duplicate battery: wela_plus_full@2024.1');
    });
  } finally {
    jest.dontMock('../../egra');
  }
});

test('batteryFor resolves only an exact code and version', () => {
  expect(batteryFor('wela_plus_full', '2024.1')).toBe(WELA_PLUS_FULL_2024_1);
  expect(batteryFor('wela_plus_full', '2099.1')).toBeNull();
  expect(batteryFor(null, null)).toBeNull();
});
test('WelaPLUS 2024.1 titles every Question in battery order', () => {
  expect(WELA_PLUS_FULL_2024_1.title).toBe('WelaPLUS');
  expect(WELA_PLUS_FULL_2024_1.aboutMinutes).toBe(30);
  expect(WELA_PLUS_FULL_2024_1.questions.map(q => q.title)).toEqual([
    'Letter sounds', 'Listen to a story', 'First sounds', 'Blending sounds', 'Letter writing',
    'Reading words', 'Reading sentences', 'Reading a story', 'Writing words',
    'Writing sentences', 'Story writing',
  ]);
});
test.each(WELA_PLUS_FULL_2024_1.languages.flatMap(lang =>
  WELA_PLUS_FULL_2024_1.questions.map(q => [q.question_code, lang] as const)))(
  'bundled item set for %s/%s matches the battery Question', (code, lang) => {
    const q = WELA_PLUS_FULL_2024_1.questions.find(x => x.question_code === code)!;
    const set = bundledItemSetFor(code, q.question_version, lang)!;
    expect(set).toMatchObject({ question_code: code, question_version: q.question_version, language: lang });
  });
test('skippedResult builds a valid zero-item result', () => {
  const q = WELA_PLUS_FULL_2024_1.questions[5];
  const r = skippedResult(q, 'xh', 'skipped_tired');
  expect(r).toMatchObject({ question_code: q.question_code, question_version: q.question_version,
    item_set_id: bundledItemSetFor(q.question_code, q.question_version, 'xh')!.item_set_id, language: 'xh',
    duration_ms: 0, stopped_reason: 'skipped_tired', items: [],
    derived: { total_correct: 0, total_attempted: 0, percent: 0, last_attempted_position: null } });
  expect(validateResult(r).valid).toBe(true);
});
test('skippedResult refuses a non-skip reason and an unknown language', () => {
  const q = WELA_PLUS_FULL_2024_1.questions[1];
  expect(() => skippedResult(q, 'xh', 'completed')).toThrow(TypeError);
  expect(() => skippedResult(q, 'af', 'skipped_other')).toThrow(TypeError);
});
test('bundledItemSetFor is version-aware', () => {
  expect(bundledItemSetFor('letter_sounds', '2026.1', 'en')).toBe(LETTER_SOUNDS_2026_1_EN);
  expect(bundledItemSetFor('letter_sounds', '2026.2', 'en')).toBe(LETTER_SOUNDS_2026_2_EN);
  expect(bundledItemSetFor('word_reading', '2026.1', 'af')).toBe(WORD_READING_2026_1_AF);
  expect(bundledItemSetFor('wela_plus_read_words', '2099.1', 'en')).toBeNull();
  const q = WELA_PLUS_FULL_2024_1.questions[0];
  expect(skippedResult(q, 'af', 'skipped_other').item_set_id)
    .toBe(bundledItemSetFor(q.question_code, q.question_version, 'af')!.item_set_id);
});

test('bundledItemSetFor returns every full exported item set by identity', () => {
  for (const set of Object.values(bundledSets)) {
    if ('item_set_id' in set) {
      const meta: ItemSetMeta = set;
      expect(bundledItemSetFor(meta.question_code, meta.question_version, meta.language)).toBe(set);
    }
  }
});
test('lookups reject unknown, missing and inherited keys without fallback', () => {
  expect(batteryFor(undefined, undefined)).toBeNull();
  expect(batteryFor('unknown', '2024.1')).toBeNull();
  expect(batteryFor('wela_plus_full', undefined)).toBeNull();
  expect(batteryFor('', '')).toBeNull();
  expect(bundledItemSetFor('unknown', '2024.1', 'en')).toBeNull();
  expect(bundledItemSetFor('letter_sounds', '2026.1', 'af')).toBeNull();
  expect(bundledItemSetFor('letter_sounds', '2026.2', 'toString')).toBeNull();
  const q = WELA_PLUS_FULL_2024_1.questions[0];
  expect(() => skippedResult({ ...q, question_version: '2099.1' }, 'en', 'skipped_other')).toThrow(TypeError);
  for (const reason of ['completed', 'timer', 'ea_ended', 'stop_rule'] as const) {
    expect(() => skippedResult(q, 'en', reason)).toThrow(TypeError);
  }
});
test('every battery Question and skip reason produces valid bundled provenance', () => {
  const reasons: StoppedReason[] = [
    'skipped_child_refused', 'skipped_tired', 'skipped_time', 'skipped_age',
    'skipped_prerequisite_unmet', 'skipped_other',
  ];
  for (const q of WELA_PLUS_FULL_2024_1.questions) {
    for (const language of WELA_PLUS_FULL_2024_1.languages) {
      const set = bundledItemSetFor(q.question_code, q.question_version, language)!;
      for (const reason of reasons) {
        const result = skippedResult(q, language, reason);
        expect(result).toEqual({
          question_code: set.question_code, question_version: set.question_version,
          item_set_id: set.item_set_id, language: set.language,
          duration_ms: 0, stopped_reason: reason, items: [],
          derived: { total_correct: 0, total_attempted: 0, percent: 0, last_attempted_position: null },
        });
        expect(validateResult(result)).toEqual({ valid: true, errors: [] });
      }
    }
  }
});
