import { WELA_PLUS_FULL_2024_1 as B } from '../wela_plus_full';
import { CURRENT_ITEM_SETS } from '../../itemsets/current';

test('2024.1 battery shape', () => {
  expect(B.battery_code).toBe('wela_plus_full');
  expect(B.battery_version).toBe('2024.1');
  expect(B.languages).toEqual(['en', 'xh']);
  expect(B.prerequisites).toEqual({});
  expect(B.questions.map((q) => q.question_code)).toEqual([
    'letter_sounds', 'wela_plus_listen_and_answer_story', 'wela_plus_first_sound',
    'wela_plus_phoneme_blend', 'wela_plus_letter_writing', 'wela_plus_read_words',
    'wela_plus_read_sentences', 'wela_plus_read_passage', 'wela_plus_write_cvcs',
    'wela_plus_write_sentences_dictation', 'wela_plus_story_writing',
  ]);
  for (const language of ['en', 'xh'] as const) {
    expect(B.questions[0].question_version)
      .toBe(CURRENT_ITEM_SETS.letter_sounds[language].question_version);
  }
  expect(B.questions[0].question_version).toBe('2026.2');
  expect(B.questions.slice(1).every((q) => q.question_version === '2024.1')).toBe(true);
  expect(B.questions.filter((q) => q.paper_marked).map((q) => q.question_code)).toEqual([
    'wela_plus_letter_writing', 'wela_plus_write_cvcs', 'wela_plus_write_sentences_dictation', 'wela_plus_story_writing',
  ]);
  expect(B.questions.filter((q) => q.durationSec !== undefined).map((q) => [q.question_code, q.durationSec])).toEqual([
    ['letter_sounds', 60], ['wela_plus_read_words', 60], ['wela_plus_read_passage', 60],
  ]);
});

test('Q6 and Q8 instructions include the one-minute stop and passage marker', () => {
  const words = B.questions.find((q) => q.question_code === 'wela_plus_read_words')!;
  const passage = B.questions.find((q) => q.question_code === 'wela_plus_read_passage')!;
  for (const language of B.languages) {
    expect(words.instructions![language]).toBe('Hand the child Reading Card side B. Point to each word and ask the child to read it. If the child gets an item correct, tap it (it turns green). If they get it wrong, leave it blank. STOP immediately if the child gets 5 in a row wrong, or clearly does not know any. Otherwise STOP at 1 minute.');
    expect(passage.instructions![language]).toBe('Hand the child Reading Card side C. Ask the child to read the story. Tap each word they read correctly. STOP at 1 minute, then mark the last word they attempted.');
  }
});

test('materials per question match the printout pack (spec 9)', () => {
  const m = Object.fromEntries(B.questions.map((q) => [q.question_code, q.materials]));
  expect(m.letter_sounds).toEqual({ item: 'reading_card', side: 'A' });
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
