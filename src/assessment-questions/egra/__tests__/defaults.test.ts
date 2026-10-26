import { CURRENT_ITEM_SETS } from '../../itemsets/current';
import { WELA_PLUS_FULL_2024_1 } from '../../battery/wela_plus_full';
import { questionComponentFor } from '../../battery/questionComponents';
import { ReadPassageQuestion } from '../../questions/ReadPassageQuestion';
import { ReadingComprehensionQuestion } from '../../questions/ReadingComprehensionQuestion';

test('EGRA remains additive to all standalone item-set identities', () => {
  expect(Object.fromEntries(Object.entries(CURRENT_ITEM_SETS).map(([code, sets]) => [code,
    Object.fromEntries(Object.entries(sets).map(([language, set]) => [language, set.item_set_id])),
  ]))).toEqual({
    letter_sounds: { en: 'letter_sounds@2026.2.en', xh: 'letter_sounds@2026.2.xh', af: 'letter_sounds@2026.2.af' },
    word_reading: { en: 'word_reading@2026.1.en', xh: 'word_reading@2026.1.xh', af: 'word_reading@2026.1.af' },
  });
  expect(WELA_PLUS_FULL_2024_1.questions).toHaveLength(11);
  expect(WELA_PLUS_FULL_2024_1.questions.some(q => q.question_code === 'oral_reading' || q.question_code === 'reading_comprehension')).toBe(false);
  expect(questionComponentFor('wela_plus_read_passage')).toEqual({ Component: ReadPassageQuestion, extraProps: {} });
  expect(questionComponentFor('oral_reading')).toEqual({ Component: ReadPassageQuestion, extraProps: {} });
  expect(questionComponentFor('reading_comprehension')).toEqual({ Component: ReadingComprehensionQuestion, extraProps: {} });
});

test('the oral_reading registry entry has no extra props', () => {
  expect(questionComponentFor('oral_reading')).toEqual({ Component: ReadPassageQuestion, extraProps: {} });
});
