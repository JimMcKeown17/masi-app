import fs from 'fs';
import path from 'path';
import { WELA_PLUS_FULL_2024_1 } from '../battery/wela_plus_full';
import { markingSentence } from '../battery/markingSentence';
import { EGRA_BATTERIES } from '../egra';

const ROOT = path.resolve(__dirname, '..');
const REMOVED_COPY = [
  'items unmarked',
  'questions not marked',
  'Not asked',
  'finish anyway',
  'Yes, finish',
  'it turns green',
  'Tap each word',
  'Tap each letter',
  'Tap words read incorrectly',
  'mark the last word',
  'Last item attempted',
  'Reached the end',
  'Nothing attempted',
  'tap_wrong',
  'markingPolarity',
  'useToggleMark',
];

function sources(dir: string): string[] {
  if (!fs.existsSync(dir)) return []; // Retired source directories may no longer exist.
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || file === path.join(ROOT, 'questions/StoryWritingRubricQuestion')
        ? [] : sources(file);
    }
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

test('removed marking copy and paths are gone while rubric and child-facing paper copy survive', () => {
  const violations = ['questions', 'progress', 'battery', 'egra', 'ui', 'hooks']
    .flatMap(dir => sources(path.join(ROOT, dir)))
    .flatMap(file => {
      const source = fs.readFileSync(file, 'utf8');
      return REMOVED_COPY.filter(phrase => source.includes(phrase))
        .map(phrase => ({ file: path.relative(ROOT, file), phrase }));
    });
  expect(violations).toEqual([]);

  // These phrases belong to the frozen rubric and the child's paper task.
  expect(fs.readFileSync(path.join(ROOT, 'questions/StoryWritingRubricQuestion/index.tsx'), 'utf8'))
    .toContain('dimensions unscored — finish anyway?');
  const letterWriting = WELA_PLUS_FULL_2024_1.questions.find(q => q.question_code === 'wela_plus_letter_writing')!;
  for (const language of WELA_PLUS_FULL_2024_1.languages) {
    expect(letterWriting.instructions?.[language]).toContain('just leave it blank');
  }
});

test('every WelaPLUS question except the rubric and every bundled EGRA question contains its marking sentence', () => {
  const nouns: Record<string, Parameters<typeof markingSentence>[0]> = {
    letter_sounds: 'letter',
    wela_plus_listen_and_answer_story: 'question',
    wela_plus_first_sound: 'word',
    wela_plus_phoneme_blend: 'word',
    wela_plus_letter_writing: 'letter',
    wela_plus_read_words: 'word',
    wela_plus_read_sentences: 'word',
    wela_plus_read_passage: 'word',
    wela_plus_write_cvcs: 'letter',
    wela_plus_write_sentences_dictation: 'word',
    word_reading: 'word',
    oral_reading: 'word',
    reading_comprehension: 'question',
  };
  const violations: string[] = [];
  for (const battery of [WELA_PLUS_FULL_2024_1, ...EGRA_BATTERIES]) {
    for (const question of battery.questions) {
      if (question.question_code === 'wela_plus_story_writing') continue;
      const noun = nouns[question.question_code];
      for (const language of battery.languages) {
        if (!noun || !question.instructions?.[language]?.includes(markingSentence(noun))) {
          violations.push(`${battery.battery_code}@${battery.battery_version}/${question.question_code}/${language}`);
        }
      }
    }
  }
  expect(violations).toEqual([]);
});
