import type { BatteryConfig, BatteryQuestion } from '../types/BatteryConfig';

import { markingSentence } from './markingSentence';

const V = '2024.1';
const both = (text: string) => ({ en: text, xh: text });

const Q: BatteryQuestion[] = [
  { title: 'Letter sounds', question_code: 'letter_sounds', question_version: '2026.2', durationSec: 60,
    materials: { item: 'reading_card', side: 'A' },
    instructions: both(`Hand the child Reading Card side A. Point to each letter and ask the child for its sound. ${markingSentence('letter')} The test stops by itself after 10 wrong in a row or at 1 minute.`) },
  { title: 'Listen to a story', question_code: 'wela_plus_listen_and_answer_story', question_version: V, materials: null,
    instructions: both('Say: "I am going to read you a short story aloud ONCE and then ask you some questions. Please listen carefully and answer the questions as best you can. Do you understand what you must do? Ready, let\'s begin." Read the story slowly, about one word per second. You may only read it once.' + ` Then ask each question. ${markingSentence('question')}`) },
  { title: 'First sounds', question_code: 'wela_plus_first_sound', question_version: V, materials: null,
    instructions: {
      en: `Practise first! Say: "Look, I am sitting. Listen carefully. Can you hear that 'sit' starts with the sound sss?" Then say each word and ask: "What sound does this word start with?" ${markingSentence('word')}`,
      xh: `Zama ukuqala uziqhelanise! Thetha nomntwana uthi: "Jonga, ndiyasela. Mamela, ndiyasela. Phulaphula ngenyameko. Uyeva ukuba u 'sela' uqala ngesandi u s?" Then say each word and ask which sound it starts with. ${markingSentence('word')}`,
    } },
  { title: 'Blending sounds', question_code: 'wela_plus_phoneme_blend', question_version: V, materials: null,
    instructions: {
      en: `Practise first! Say: "Listen carefully to these sounds: /c/ /a/ /t/ … this says 'cat'! /sh/ /o/ /p/ … this says 'shop'!" Then say each word's sounds with a one-second pause between them, and never say the whole word. ${markingSentence('word')}`,
      xh: `Qala ngokuziqhelanisa! Thetha nomntwana uthi: "Phulaphula ezi zandi ngenyameko: /x/ /a/ … eli gama ngu 'xa'! /Nk/ /o/ … eli gama ngu 'Nko'!" Then say each word's sounds with a one-second pause between them, and never say the whole word. ${markingSentence('word')}`,
    } },
  { title: 'Letter writing', question_code: 'wela_plus_letter_writing', question_version: V, paper_marked: true,
    materials: { item: 'writing_sheet' },
    instructions: both('Give the child the Writing Sheet. Say: "Look at the apple … \'apple\' starts with /a/. Can you write /a/?" Work left to right. Say the letter SOUND, not the letter name. If the child does not know a letter, say: "Don\'t worry, just leave it blank. Let\'s try another letter." When the child has finished, mark their sheet here, in order.' + ` ${markingSentence('letter')}`) },
  { title: 'Reading words', question_code: 'wela_plus_read_words', question_version: V, durationSec: 60,
    materials: { item: 'reading_card', side: 'B' },
    instructions: both(`Hand the child Reading Card side B. Point to each word and ask the child to read it. ${markingSentence('word')} The test stops by itself at 1 minute.`) },
  { title: 'Reading sentences', question_code: 'wela_plus_read_sentences', question_version: V,
    materials: { item: 'reading_card', side: 'B' },
    instructions: both(`Reading Card side B, sentences. Ask the child to read each sentence. ${markingSentence('word')}`) },
  { title: 'Reading a story', question_code: 'wela_plus_read_passage', question_version: V, durationSec: 60,
    materials: { item: 'reading_card', side: 'C' },
    instructions: both(`Hand the child Reading Card side C. Ask the child to read the story. ${markingSentence('word')} The test stops by itself at 1 minute.`) },
  { title: 'Writing words', question_code: 'wela_plus_write_cvcs', question_version: V, paper_marked: true,
    materials: { item: 'writing_sheet' },
    instructions: both(`Writing Sheet, pictures 1–4. Say the name of each picture TWICE and ask the child to write the word. ${markingSentence('letter')}`) },
  { title: 'Writing sentences', question_code: 'wela_plus_write_sentences_dictation', question_version: V, paper_marked: true,
    materials: { item: 'writing_sheet' },
    instructions: both(`Writing Sheet, lines 1–2. Read the first sentence TWICE and let the child write it. Then do the same for the second sentence. Do NOT repeat a sentence while the child is writing. ${markingSentence('word')}`) },
  { title: 'Story writing', question_code: 'wela_plus_story_writing', question_version: V, paper_marked: true,
    materials: { item: 'picture_cards' },
    instructions: both('Show the child the Picture Cards and ask: "What can you see in these pictures?" You may ask, for example, "Where are the children?" or "Why is the little girl crying?". Then say: "Can you write a story about the pictures? Don\'t worry if you can\'t spell some words, just do your best." If the child cannot write sentences, encourage a few words. When they finish say: "This is a lovely story. Can you think of anything more to write?" Then score the story here.') },
];

export const WELA_PLUS_FULL_2024_1: BatteryConfig = {
  title: 'WelaPLUS',
  aboutMinutes: 30,
  battery_code: 'wela_plus_full',
  battery_version: V,
  languages: ['en', 'xh'],
  questions: Q,
  prerequisites: {},
};
