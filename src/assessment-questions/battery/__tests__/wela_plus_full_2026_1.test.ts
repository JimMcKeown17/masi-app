import { WELA_PLUS_FULL_2026_1 as B } from '../wela_plus_full_2026_1';
import { WELA_PLUS_FULL_2024_1 as OLD } from '../wela_plus_full';
import { SHARED_READING_VERSION, SHARED_READING_SETS, sharedInstructionsFor } from '../../egra/sharedReading';
import { bundledItemSetFor } from '../bundledItemSets';

test('2026.1 has the approved twelve Questions on shared reading content beside unchanged 2024.1 Questions', () => {
  expect(B).toMatchObject({
    battery_code: 'wela_plus_full', battery_version: '2026.1', title: 'WelaPLUS',
    aboutMinutes: 32, languages: ['en', 'xh'], readingCard: 'Reading Card 2026.3',
  });
  expect(B.questions.map(q => [q.title, q.question_code, q.question_version, q.materials, q.durationSec])).toEqual([
    ['Letter sounds', 'letter_sounds', '2026.3', { item: 'reading_card', side: 'A' }, 60],
    ['Listen to a story', 'wela_plus_listen_and_answer_story', '2024.1', null, undefined],
    ['First sounds', 'wela_plus_first_sound', '2024.1', null, undefined],
    ['Blending sounds', 'wela_plus_phoneme_blend', '2024.1', null, undefined],
    ['Letter writing', 'wela_plus_letter_writing', '2024.1', { item: 'writing_sheet' }, undefined],
    ['Reading words', 'word_reading', '2026.3', { item: 'reading_card', side: 'B' }, 60],
    ['Reading sentences', 'wela_plus_read_sentences', '2024.1', { item: 'reading_card', side: 'D' }, undefined],
    ['Reading a story', 'oral_reading', '2026.3', { item: 'reading_card', side: 'C' }, 60],
    ['Story comprehension', 'reading_comprehension', '2026.3', null, undefined],
    ['Writing words', 'wela_plus_write_cvcs', '2024.1', { item: 'writing_sheet' }, undefined],
    ['Writing sentences', 'wela_plus_write_sentences_dictation', '2024.1', { item: 'writing_sheet' }, undefined],
    ['Story writing', 'wela_plus_story_writing', '2024.1', { item: 'picture_cards' }, undefined],
  ]);
  for (const [current, previous] of [[1, 1], [2, 2], [3, 3], [4, 4], [9, 8], [10, 9], [11, 10]]) {
    expect(B.questions[current]).toBe(OLD.questions[previous]);
  }
  expect(B.questions[6]).not.toBe(OLD.questions[6]);
  expect(B.questions[6]).toEqual({
    ...OLD.questions[6], materials: { item: 'reading_card', side: 'D' },
    instructions: Object.fromEntries(['en', 'xh'].map(language =>
      [language, OLD.questions[6].instructions![language].replace('side B', 'side D')])),
  });
  for (const index of [0, 5, 7, 8]) {
    const question = B.questions[index];
    expect(question.question_version).toBe(SHARED_READING_VERSION);
    expect(question.instructions).toEqual({
      en: sharedInstructionsFor(question.question_code, 'en'),
      xh: sharedInstructionsFor(question.question_code, 'xh'),
    });
  }
  expect(B.questions[8]).not.toHaveProperty('durationSec');
  expect(B.prerequisites).toEqual({ reading_comprehension: {
    depends_on: 'oral_reading', minScore: 1, on_unmet_reason: 'skipped_prerequisite_unmet',
  } });
  expect(B.skipRule).toEqual({
    triggers: [
      { question_code: 'letter_sounds', first_row_length: 10 },
      { question_code: 'wela_plus_letter_writing', first_row_length: 6 },
      { question_code: 'word_reading', first_row_length: 8 },
    ],
    skips: ['word_reading', 'wela_plus_read_sentences', 'oral_reading', 'reading_comprehension',
      'wela_plus_write_cvcs', 'wela_plus_write_sentences_dictation', 'wela_plus_story_writing'],
  });
});

test('both WelaPLUS versions resolve through the registry and package entry', () => {
  const entry = require('../../index');
  expect(entry.WELA_PLUS_FULL_2026_1).toBe(B);
  expect(entry.batteryFor('wela_plus_full', '2026.1')).toBe(B);
  expect(entry.batteryFor('wela_plus_full', '2024.1')).toBe(OLD);
});

test.each(['en', 'xh'] as const)('every Question resolves its exact item set and trigger rows match in %s', language => {
  for (const question of B.questions) {
    expect(bundledItemSetFor(question.question_code, question.question_version, language)).toMatchObject({
      question_code: question.question_code, question_version: question.question_version, language,
    });
  }
  const firstRows: Record<string, number> = {
    letter_sounds: SHARED_READING_SETS.letter_sounds[language].rows[0].length,
    word_reading: SHARED_READING_SETS.word_reading[language].row_lengths![0],
    wela_plus_letter_writing: 6,
  };
  for (const trigger of B.skipRule!.triggers) {
    expect(trigger.first_row_length).toBe(firstRows[trigger.question_code]);
  }
  const order = B.questions.map(question => question.question_code);
  for (const code of B.skipRule!.skips) {
    expect(order.indexOf(code)).toBeGreaterThan(order.indexOf('wela_plus_letter_writing'));
  }
});

test.each(['letter_sounds', 'word_reading', 'oral_reading', 'reading_comprehension'].flatMap(code =>
  ['en', 'xh'].map(language => ({ code, language }))))('missing $code instructions in $language throw at module load', ({ code, language }) => {
  try {
    jest.isolateModules(() => {
      jest.doMock('../../egra/sharedReading', () => {
        const actual = jest.requireActual<typeof import('../../egra/sharedReading')>('../../egra/sharedReading');
        return { ...actual, sharedInstructionsFor: (questionCode: string, lang: string) =>
          questionCode === code && lang === language ? null : actual.sharedInstructionsFor(questionCode, lang) };
      });
      expect(() => require('../wela_plus_full_2026_1')).toThrow(new TypeError(`Missing shared reading instructions: ${code}`));
    });
  } finally {
    jest.dontMock('../../egra/sharedReading');
  }
});
