import { batteryFor, bundledItemSetFor, FULL_EGRA_2026_1 } from '../..';
import type { LetterSoundsItemSet } from '../..';
import { EGRA_BATTERIES, sharedInstructionsFor, SHARED_READING_VERSION } from '..';

test('Full EGRA 2026.1 resolves all four shared questions in all four languages', () => {
  const battery = batteryFor('egra', '2026.1');
  expect(battery).toBeDefined();
  expect(battery).not.toBeNull();
  expect(battery).toBe(FULL_EGRA_2026_1);
  expect(battery).toMatchObject({
    title: 'Full EGRA', battery_code: 'egra', battery_version: '2026.1', aboutMinutes: 6,
    languages: ['xh', 'en', 'af', 'zu'], readingCard: 'Reading Card 2026.3',
  });
  expect(battery).not.toHaveProperty('fixedLanguage');
  expect(battery).not.toHaveProperty('skipRule');
  expect(battery!.prerequisites).toEqual(EGRA_BATTERIES[0].prerequisites);
  expect(battery!.questions.map(q => [q.question_code, q.title, q.materials, q.durationSec])).toEqual([
    ['letter_sounds', 'Letter sounds', { item: 'reading_card', side: 'A' }, 60],
    ['word_reading', 'Familiar words', { item: 'reading_card', side: 'B' }, 60],
    ['oral_reading', 'Reading a story', { item: 'reading_card', side: 'C' }, 60],
    ['reading_comprehension', 'Story comprehension', null, undefined],
  ]);
  for (const question of battery!.questions) {
    expect(question.question_version).toBe(SHARED_READING_VERSION);
    expect(Object.keys(question.instructions!)).toEqual(['xh', 'en', 'af', 'zu']);
    for (const language of battery!.languages) {
      expect(question.instructions![language]).toBe(sharedInstructionsFor(question.question_code, language));
      const set = bundledItemSetFor(question.question_code, question.question_version, language);
      expect(set).toMatchObject({
        question_code: question.question_code, question_version: '2026.3', language,
        item_set_id: `${question.question_code}@2026.3.${language}`,
      });
      if (language === 'zu' && question.question_code === 'word_reading') {
        expect(set).toMatchObject({ row_lengths: Array(10).fill(5) });
      }
      if (language === 'zu' && question.question_code === 'letter_sounds') {
        expect((set?.rows as LetterSoundsItemSet['rows']).flat()).toHaveLength(110);
      }
    }
  }
});

test('all 13 old EGRA Batteries still resolve with the Story comprehension title', () => {
  expect(EGRA_BATTERIES).toHaveLength(13);
  for (const battery of EGRA_BATTERIES) {
    expect(batteryFor('egra', battery.battery_version)).toBe(battery);
    expect(battery.questions[3].title).toBe('Story comprehension');
  }
});


test.each(['letter_sounds', 'word_reading', 'oral_reading', 'reading_comprehension'].flatMap(code =>
  ['xh', 'en', 'af', 'zu'].map(language => ({ code, language }))))('missing $code instructions in $language fail at module load', ({ code, language }) => {
  try {
    jest.isolateModules(() => {
      jest.doMock('../sharedReading', () => {
        const actual = jest.requireActual<typeof import('../sharedReading')>('../sharedReading');
        return { ...actual, sharedInstructionsFor: (questionCode: string, lang: string) =>
          questionCode === code && lang === language ? null : actual.sharedInstructionsFor(questionCode, lang) };
      });
      expect(() => require('../fullEgra')).toThrow(new TypeError(`Missing shared reading instructions: ${code}`));
    });
  } finally {
    jest.dontMock('../sharedReading');
  }
});
