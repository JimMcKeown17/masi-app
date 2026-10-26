import { evaluateBatteryState } from '../evaluateBatteryState';
import { firstRowWrong, firedTrigger, skipCauseFor } from '../skipRules';
import { WELA_PLUS_FULL_2024_1 } from '../wela_plus_full';
import { EGRA_BATTERIES } from '../../egra';
import type { BatteryConfig, DecidedResult } from '../../types/BatteryConfig';

const codes = [
  'letter_sounds', 'wela_plus_listen_and_answer_story', 'wela_plus_first_sound',
  'wela_plus_phoneme_blend', 'wela_plus_letter_writing', 'word_reading',
  'wela_plus_read_sentences', 'oral_reading', 'reading_comprehension',
  'wela_plus_write_cvcs', 'wela_plus_write_sentences_dictation', 'wela_plus_story_writing',
];
const readingAndWriting = codes.slice(5);
// Task 3 will build the real Battery. This fixture exercises only evaluator policy.
const battery: BatteryConfig = {
  title: 'WelaPLUS fixture', aboutMinutes: 32, battery_code: 'wela_plus_fixture',
  battery_version: '2026.1', languages: ['en', 'xh'],
  questions: codes.map(question_code => ({
    question_code, question_version: 'fixture', title: question_code, materials: null,
  })),
  prerequisites: {
    reading_comprehension: {
      depends_on: 'oral_reading', minScore: 1, on_unmet_reason: 'skipped_prerequisite_unmet',
    },
  },
  // Deliberately reversed: Battery question order, not rule declaration order, wins.
  skipRule: {
    triggers: [
      { question_code: 'word_reading', first_row_length: 8 },
      { question_code: 'wela_plus_letter_writing', first_row_length: 6 },
      { question_code: 'letter_sounds', first_row_length: 10 },
    ],
    skips: [...readingAndWriting].reverse(),
  },
};
const result = (question_code: string, overrides: Partial<DecidedResult> = {}): DecidedResult => ({
  question_code, stopped_reason: 'completed', score: 1, ...overrides,
});
const marks = (count: number, reached = count, correctFrom = count) =>
  Array.from({ length: count }, (_, position) => ({
    position, is_correct: position >= correctFrom, metadata: { reached: position < reached },
  }));
const wrongRow = (code = 'letter_sounds', length = 10) => result(code, { score: 0, items: marks(length) });
const skips = (questionCodes: string[], trigger: string | null) => questionCodes.map(question_code => ({
  question_code, reason: 'skipped_prerequisite_unmet', trigger,
}));
const savedSkips = (questionCodes: string[]) => questionCodes.map(code =>
  result(code, { stopped_reason: 'skipped_prerequisite_unmet', score: null, items: [] }));

test('Q1 first row wrong skips Q6–Q12 with trigger letter_sounds; Q2–Q5 stay undecided and next is Q2', () => {
  const decided = [wrongRow()];
  expect(evaluateBatteryState(battery, decided)).toEqual({
    nextQuestion: battery.questions[1], decided: ['letter_sounds'], undecided: codes.slice(1, 5),
    autoSkips: skips(readingAndWriting, 'letter_sounds'), firedTrigger: 'letter_sounds', eligibleToFinalize: false,
  });
  expect(firedTrigger(battery, decided)).toBe('letter_sounds');
  for (const code of codes.slice(1, 5)) expect(skipCauseFor(battery, decided, code)).toBeNull();
});

test.each([
  ['Q1 ended by End before the row is complete: no skip', result('letter_sounds', { stopped_reason: 'ea_ended', score: 0, items: marks(10, 7) })],
  ['Q1 skipped by hand: no skip', result('letter_sounds', { stopped_reason: 'skipped_child_refused', score: null, items: [] })],
  ['old saved result without items: no skip', result('letter_sounds', { stopped_reason: 'stop_rule', score: 0 })],
])('%s', (_name, decided) => {
  expect(firstRowWrong(decided, 10)).toBe(false);
  expect(evaluateBatteryState(battery, [decided])).toMatchObject({ autoSkips: [], firedTrigger: null });
  expect(skipCauseFor(battery, [decided], 'word_reading')).toBeNull();
});

test.each([10, 9])('trigger reads marks, not the stop reason: timer with %i reached wrong', reached => {
  const decided = result('letter_sounds', { stopped_reason: 'timer', score: 0, items: marks(10, reached) });
  expect(firstRowWrong(decided, 10)).toBe(reached === 10);
  expect(evaluateBatteryState(battery, [decided])).toMatchObject({
    autoSkips: reached === 10 ? skips(readingAndWriting, 'letter_sounds') : [],
    firedTrigger: reached === 10 ? 'letter_sounds' : null,
  });
});

test('first-row evidence is looked up by position, not array index', () => {
  expect(firstRowWrong(result('letter_sounds', { items: marks(10).reverse() }), 10)).toBe(true);
  const missingPosition = marks(10);
  missingPosition[3] = { ...missingPosition[3], position: 10 };
  expect(firstRowWrong(result('letter_sounds', { items: missingPosition }), 10)).toBe(false);
});

test.each([
  ['a correct mark', { position: 3, is_correct: true, metadata: { reached: true } }],
  ['missing reached metadata', { position: 3, is_correct: false }],
  ['non-boolean reached metadata', { position: 3, is_correct: false, metadata: { reached: 1 } }],
])('first-row evidence rejects %s', (_name, replacement) => {
  const items = marks(10).map(item => item.position === 3 ? replacement : item);
  expect(firstRowWrong(result('letter_sounds', { items }), 10)).toBe(false);
});

test.each(['skipped_child_refused', 'skipped_tired', 'skipped_prerequisite_unmet', 'skipped_future_reason'])(
  '%s never triggers even with wrong reached marks', stopped_reason => {
    expect(firstRowWrong(result('letter_sounds', { stopped_reason, items: marks(10) }), 10)).toBe(false);
  },
);

test.each([true, false])('letter writing first row: all first 6 reached = %s, letters 7–26 right', allReached => {
  const items = marks(26, 26, 6);
  if (!allReached) items[3].metadata.reached = false;
  const decided = [result('wela_plus_letter_writing', { score: 20, items })];
  expect(firstRowWrong(decided[0], 6)).toBe(allReached);
  expect(evaluateBatteryState(battery, decided)).toMatchObject({
    autoSkips: allReached ? skips(readingAndWriting, 'wela_plus_letter_writing') : [],
    firedTrigger: allReached ? 'wela_plus_letter_writing' : null,
  });
});

test('Q1 already fired and Q5 also wrong: earliest Battery trigger owns the skips', () => {
  const decided = [wrongRow('wela_plus_letter_writing', 6), wrongRow()];
  expect(firedTrigger(battery, decided)).toBe('letter_sounds');
  expect(evaluateBatteryState(battery, decided).firedTrigger).toBe('letter_sounds');
  expect(skipCauseFor(battery, decided, 'word_reading')).toEqual({ kind: 'first_row', trigger: 'letter_sounds' });
});

test('Q6 first row wrong skips Q7–Q12; eligibleToFinalize after those skips are saved', () => {
  const decided = [...codes.slice(0, 5).map(code => result(code)), wrongRow('word_reading', 8)];
  expect(evaluateBatteryState(battery, decided)).toMatchObject({
    nextQuestion: null, undecided: [], autoSkips: skips(codes.slice(6), 'word_reading'),
    firedTrigger: 'word_reading', eligibleToFinalize: false,
  });
  expect(skipCauseFor(battery, decided, 'word_reading')).toBeNull();
  expect(evaluateBatteryState(battery, [...decided, ...savedSkips(codes.slice(6))])).toMatchObject({
    nextQuestion: null, undecided: [], autoSkips: [], firedTrigger: 'word_reading', eligibleToFinalize: true,
  });
});

test.each([
  ['story with 0 correct', result('oral_reading', { score: 0 })],
  ['story skipped by hand', result('oral_reading', { stopped_reason: 'skipped_tired', score: null })],
])('Q9 after a %s: prerequisite skip with trigger null', (_name, story) => {
  expect(evaluateBatteryState(battery, [story]).autoSkips).toEqual(skips(['reading_comprehension'], null));
  expect(skipCauseFor(battery, [story], 'reading_comprehension')).toEqual({ kind: 'prerequisite', depends_on: 'oral_reading' });
});

test.each([
  { name: 'undecided', decided: [] },
  { name: 'at threshold', decided: [result('oral_reading', { score: 1 })] },
  { name: 'above threshold', decided: [result('oral_reading', { score: 2 })] },
])(
  'an undecided or met story prerequisite has no skip cause: $name', ({ decided }) => {
    expect(evaluateBatteryState(battery, decided).autoSkips).toEqual([]);
    expect(skipCauseFor(battery, decided, 'reading_comprehension')).toBeNull();
  },
);

test('Q9 inside a trigger range is labelled by the trigger, not the prerequisite', () => {
  const decided = [wrongRow(), result('oral_reading', { score: 0 })];
  expect(evaluateBatteryState(battery, decided).autoSkips).toEqual(
    skips(readingAndWriting.filter(code => code !== 'oral_reading'), 'letter_sounds'),
  );
  expect(skipCauseFor(battery, decided, 'reading_comprehension')).toEqual({ kind: 'first_row', trigger: 'letter_sounds' });
});

const oldBatteries: BatteryConfig[] = [WELA_PLUS_FULL_2024_1, EGRA_BATTERIES[0]];
test.each(oldBatteries)(
  'batteries without skipRule never first-row skip: $battery_code@$battery_version', oldBattery => {
    expect(oldBattery.skipRule).toBeUndefined();
    const decided = [wrongRow()];
    expect(firedTrigger(oldBattery, decided)).toBeNull();
    expect(evaluateBatteryState(oldBattery, decided)).toMatchObject({ autoSkips: [], firedTrigger: null });
    expect(skipCauseFor(oldBattery, decided, 'word_reading')).toBeNull();
  },
);

test.each([0, 3, 7])('skipCauseFor on already-saved skips re-derives the same cause after resume: %i saved', count => {
  const decided = [wrongRow()];
  const resumed = [...decided, ...savedSkips(readingAndWriting.slice(0, count))];
  expect(evaluateBatteryState(battery, resumed)).toMatchObject({
    autoSkips: skips(readingAndWriting.slice(count), 'letter_sounds'), firedTrigger: 'letter_sounds',
  });
  for (const code of readingAndWriting) {
    expect(skipCauseFor(battery, resumed, code)).toEqual(skipCauseFor(battery, decided, code));
    expect(skipCauseFor(battery, resumed, code)).toEqual({ kind: 'first_row', trigger: 'letter_sounds' });
  }
});

test('saved prerequisite skip keeps its cause after resume', () => {
  const decided = [result('oral_reading', { score: 0 })];
  const resumed = [...decided, ...savedSkips(['reading_comprehension'])];
  expect(evaluateBatteryState(battery, resumed).autoSkips).toEqual([]);
  expect(skipCauseFor(battery, resumed, 'reading_comprehension')).toEqual(skipCauseFor(battery, decided, 'reading_comprehension'));
  expect(skipCauseFor(battery, resumed, 'reading_comprehension')).toEqual({ kind: 'prerequisite', depends_on: 'oral_reading' });
});

test('prerequisite causes ignore results outside the Battery, just like the evaluator', () => {
  const externalDependency: BatteryConfig = {
    ...battery,
    prerequisites: {
      reading_comprehension: {
        depends_on: 'outside_battery', minScore: 1, on_unmet_reason: 'skipped_prerequisite_unmet',
      },
    },
  };
  const decided = [result('outside_battery', { score: 0 })];
  expect(evaluateBatteryState(externalDependency, decided).autoSkips).toEqual([]);
  expect(skipCauseFor(externalDependency, decided, 'reading_comprehension')).toBeNull();
});
