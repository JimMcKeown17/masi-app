import { CURRENT_ITEM_SETS } from '../../itemsets/current';
import { bundledItemSetFor } from '../../battery/bundledItemSets';
import { SHARED_READING_SETS } from '../sharedReading';
import { WELA_PLUS_FULL_2024_1 } from '../../battery/wela_plus_full';
import { questionComponentFor } from '../../battery/questionComponents';
import { ReadPassageQuestion } from '../../questions/ReadPassageQuestion';
import { ReadingComprehensionQuestion } from '../../questions/ReadingComprehensionQuestion';

test('quick tests use shared 2026.3 identities while historical item sets remain resolvable', () => {
  expect(Object.fromEntries(Object.entries(CURRENT_ITEM_SETS).map(([code, sets]) => [code,
    Object.fromEntries(Object.entries(sets).map(([language, set]) => [language, set.item_set_id])),
  ]))).toEqual({
    letter_sounds: { xh: 'letter_sounds@2026.3.xh', en: 'letter_sounds@2026.3.en', af: 'letter_sounds@2026.3.af', zu: 'letter_sounds@2026.3.zu' },
    word_reading: { xh: 'word_reading@2026.3.xh', en: 'word_reading@2026.3.en', af: 'word_reading@2026.3.af', zu: 'word_reading@2026.3.zu' },
  });
  for (const code of ['letter_sounds', 'word_reading'] as const) {
    for (const language of ['xh', 'en', 'af', 'zu'] as const) {
      const set = CURRENT_ITEM_SETS[code][language];
      expect(set).toBe(SHARED_READING_SETS[code][language]);
      expect(set.stop_rule).toEqual({ kind: 'first_row_all_wrong',
        first_row_length: code === 'word_reading' ? (language === 'zu' ? 5 : 8) : 10 });
    }
    for (const language of ['en', 'xh', 'af']) {
      const version = code === 'letter_sounds' ? '2026.2' : '2026.1';
      expect(bundledItemSetFor(code, version, language)).toMatchObject({
        item_set_id: `${code}@${version}.${language}`, question_version: version, language,
      });
    }
  }
  expect(WELA_PLUS_FULL_2024_1.questions).toHaveLength(11);
  expect(WELA_PLUS_FULL_2024_1.questions.some(q => q.question_code === 'oral_reading' || q.question_code === 'reading_comprehension')).toBe(false);
  expect(questionComponentFor('wela_plus_read_passage')).toEqual({ Component: ReadPassageQuestion, extraProps: {} });
  expect(questionComponentFor('oral_reading')).toEqual({ Component: ReadPassageQuestion, extraProps: {} });
  expect(questionComponentFor('reading_comprehension')).toEqual({ Component: ReadingComprehensionQuestion, extraProps: {} });
});

test('the oral_reading registry entry has no extra props', () => {
  expect(questionComponentFor('oral_reading')).toEqual({ Component: ReadPassageQuestion, extraProps: {} });
});
