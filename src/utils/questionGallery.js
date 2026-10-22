import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { WELA_PLUS_FULL_2024_1, testFixtures } from '../assessment-questions';
import { STANDALONE_TESTS } from './assessmentRegistry';

export function isQuestionGalleryEnabled() {
  // OTA cannot change the binary's native channel (pilot: preview; production: production).
  // Development/preview have no channel; only an embedded launch guarantees binary build-time extra.
  // Every OTA hides the gallery, including on preview builds, by design.
  return __DEV__ || (Updates.isEmbeddedLaunch === true && !Updates.channel && Constants.expoConfig?.extra?.questionGallery === true);
}

const batteryTitles = {
  letter_sounds: 'Letter Sounds',
  wela_plus_listen_and_answer_story: 'Listening Comprehension',
  wela_plus_first_sound: 'First Sound',
  wela_plus_phoneme_blend: 'Phoneme Blending',
  wela_plus_letter_writing: 'Letter Writing',
  wela_plus_read_words: 'Read Words',
  wela_plus_read_sentences: 'Read Sentences',
  wela_plus_read_passage: 'Read Passage',
  wela_plus_write_cvcs: 'Write CVCs',
  wela_plus_write_sentences_dictation: 'Write Sentences from Dictation',
  wela_plus_story_writing: 'Story Writing',
};

const fixtures = new Map([
  ['letter_sounds', testFixtures.FIXTURE_LETTER_SOUNDS_EN],
  ['word_reading', testFixtures.FIXTURE_READ_WORDS_EN],
  ['wela_plus_listen_and_answer_story', testFixtures.FIXTURE_LISTEN_AND_ANSWER_STORY_EN],
  ['wela_plus_first_sound', testFixtures.FIXTURE_FIRST_SOUND_EN],
  ['wela_plus_phoneme_blend', testFixtures.FIXTURE_PHONEME_BLEND_EN],
  ['wela_plus_letter_writing', testFixtures.FIXTURE_LETTER_WRITING_EN],
  ['wela_plus_read_words', testFixtures.FIXTURE_READ_WORDS_EN],
  ['wela_plus_read_sentences', testFixtures.FIXTURE_READ_SENTENCES_EN],
  ['wela_plus_read_passage', testFixtures.FIXTURE_READ_PASSAGE_EN],
  ['wela_plus_write_cvcs', testFixtures.FIXTURE_WRITE_CVCS_EN],
  ['wela_plus_write_sentences_dictation', testFixtures.FIXTURE_WRITE_SENTENCES_DICTATION_EN],
  ['wela_plus_story_writing', testFixtures.FIXTURE_STORY_WRITING_EN],
]);

export const STANDALONE_GALLERY_ENTRIES = STANDALONE_TESTS.map(test => ({
  entryKey: `standalone:${test.code}`, questionCode: test.code, title: test.title,
  durationSec: test.durationSec, instructions: test.instructions, standalone: true,
}));
export const BATTERY_GALLERY_ENTRIES = WELA_PLUS_FULL_2024_1.questions.map((question, index) => ({
  entryKey: `battery:${question.question_code}`, questionCode: question.question_code,
  title: `Q${index + 1} · ${batteryTitles[question.question_code]}`,
  durationSec: question.durationSec, instructions: question.instructions, standalone: false,
}));
const entries = new Map([...STANDALONE_GALLERY_ENTRIES, ...BATTERY_GALLERY_ENTRIES,
  { entryKey: 'null_question', questionCode: 'null_question', title: 'Null Question' },
].map(entry => [entry.entryKey, entry]));

export function questionGalleryEntry(entryKey) {
  return entries.get(entryKey) ?? null;
}
export function questionGalleryFixture(questionCode) {
  return fixtures.get(questionCode);
}
