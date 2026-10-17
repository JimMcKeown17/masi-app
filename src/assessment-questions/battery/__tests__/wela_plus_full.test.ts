import { WELA_PLUS_FULL_2024_1 as B } from '../wela_plus_full';

test('2024.1 battery shape', () => {
  expect(B.battery_code).toBe('wela_plus_full');
  expect(B.battery_version).toBe('2024.1');
  expect(B.languages).toEqual(['en', 'xh']);
  expect(B.prerequisites).toEqual({});
  expect(B.questions.map((q) => q.question_code)).toEqual([
    'wela_plus_letter_sounds', 'wela_plus_listen_and_answer_story', 'wela_plus_first_sound',
    'wela_plus_phoneme_blend', 'wela_plus_letter_writing', 'wela_plus_read_words',
    'wela_plus_read_sentences', 'wela_plus_read_passage', 'wela_plus_write_cvcs',
    'wela_plus_write_sentences_dictation', 'wela_plus_story_writing',
  ]);
  expect(B.questions.every((q) => q.question_version === '2024.1')).toBe(true);
  expect(B.questions.filter((q) => q.paper_marked).map((q) => q.question_code)).toEqual([
    'wela_plus_letter_writing', 'wela_plus_write_cvcs', 'wela_plus_write_sentences_dictation', 'wela_plus_story_writing',
  ]);
  expect(B.questions.filter((q) => q.durationSec !== undefined).map((q) => [q.question_code, q.durationSec])).toEqual([['wela_plus_letter_sounds', 60]]);
});

test('materials per question match the printout pack (spec 9)', () => {
  const m = Object.fromEntries(B.questions.map((q) => [q.question_code, q.materials]));
  expect(m.wela_plus_letter_sounds).toEqual({ item: 'reading_card', side: 'A' });
  expect(m.wela_plus_read_words).toEqual({ item: 'reading_card', side: 'B' });
  expect(m.wela_plus_read_sentences).toEqual({ item: 'reading_card', side: 'B' });
  expect(m.wela_plus_read_passage).toEqual({ item: 'reading_card', side: 'C' });
  expect(m.wela_plus_story_writing).toEqual({ item: 'picture_cards' });
  for (const c of ['wela_plus_letter_writing', 'wela_plus_write_cvcs', 'wela_plus_write_sentences_dictation']) {
    expect(m[c]).toEqual({ item: 'writing_sheet' });
  }
  for (const c of ['wela_plus_listen_and_answer_story', 'wela_plus_first_sound', 'wela_plus_phoneme_blend']) {
    expect(m[c]).toBeNull();
  }
});

test('every question has en and xh instructions', () => {
  for (const q of B.questions) {
    expect(typeof q.instructions?.en).toBe('string');
    expect(typeof q.instructions?.xh).toBe('string');
    expect(q.instructions!.en.length).toBeGreaterThan(20);
  }
});
