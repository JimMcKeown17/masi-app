import { v4 as uuid } from 'uuid';
import { resetSkipNoticeSeen } from '../src/utils/skipNoticeSeen';
import { egraBatteryFor } from '../src/assessment-questions/egra';
import { buildRunView, formatRunStart, materialsLine, runCode, skipNoticeFor, TRIGGER_LABELS } from '../src/utils/batteryRun';
import { MANUAL_SKIP_REASONS, WELA_PLUS_FULL_2024_1, WELA_PLUS_FULL_2026_1 } from '../src/assessment-questions';

beforeEach(() => resetSkipNoticeSeen());

const battery = WELA_PLUS_FULL_2024_1;
const run = {
  id: '9f3c2a10-5b7e-4c1d-8e2f-0123456789ab',
  status: 'in_progress',
  started_here: 1,
  programme_id: 'programme-a',
  language: 'en',
  results: [],
};
const access = { activeProgrammeId: 'programme-a', childAssigned: true };
const decided = count => battery.questions.slice(0, count).map(question => ({
  question_code: question.question_code, stopped_reason: 'completed', score: 5,
  total_items: 10, derived: {},
}));
const view = (changes = {}, options = access) => buildRunView(battery, { ...run, ...changes }, options);

test.each([
  ['00000000-0000-4000-8000-000000000000', '000-000'],
  ['ffffffff-ffff-4fff-bfff-ffffffffffff', 'ZZZ-ZZZ'],
  ['9f3c2a10-5b7e-4c1d-8e2f-0123456789ab', 'KWY-2M4'],
  ['A3E1B7C4-0D2F-4A6B-9C8D-7E6F5A4B3C2D', 'MFG-VFH'],
])('runCode(%s) = %s', (id, code) => expect(runCode(id)).toBe(code));

test('runCode never emits I, L, O or U', () => {
  for (let i = 0; i < 500; i += 1) {
    const code = runCode(uuid());
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{3}-[0-9A-HJKMNP-TV-Z]{3}$/);
    expect(code).not.toMatch(/[ILOU]/);
  }
});

test('runCode uses only the first 30 bits, with case-insensitive hex', () => {
  expect(runCode('9f3c2a13-ffff-4fff-bfff-ffffffffffff')).toBe('KWY-2M4');
  expect(runCode(run.id.toUpperCase())).toBe('KWY-2M4');
});

test('fresh run: Q1 is next, nothing decided, no reminder', () => {
  const state = view();
  expect(state).toMatchObject({
    code: 'KWY-2M4', decidedCount: 0, totalCount: 11, eligibleToFinalize: false,
    autoSkips: [], writable: true, readOnlyReason: null,
    writingSheetReminder: false, hasWritingSheet: true,
  });
  expect(state.next).toBe(battery.questions[0]);
  expect(state.rows).toHaveLength(11);
  expect(state.rows.map(row => row.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  state.rows.forEach((row, index) => {
    expect(row.question).toBe(battery.questions[index]);
    expect(row.state).toBe(index === 0 ? 'next' : 'not_started');
    expect(row.scoreText).toBeNull();
  });
  expect(state.rows[0].detail).toBe('Next · Reading Card');
  expect(state.rows[1].detail).toBe('Not started');
});

test('done row shows score / max using derived.max when present', () => {
  const state = view({ results: [
    { question_code: battery.questions[0].question_code, stopped_reason: 'timer', score: 34, total_items: 60, derived: {} },
    { question_code: battery.questions[10].question_code, stopped_reason: 'completed', score: 9, total_items: 4, derived: { max: 16, questions_asked: 3 } },
  ] });
  expect(state.rows[0]).toMatchObject({ state: 'done', detail: 'Done', scoreText: '34 / 60' });
  expect(state.rows[10]).toMatchObject({ state: 'done', detail: 'Done', scoreText: '9 / 16' });
  expect(state.decidedCount).toBe(2);
  expect(state.next).toBe(battery.questions[1]);
  expect(state.rows[1].detail).toBe('Next');
});

test('skipped row uses the package label', () => {
  for (const { reason, label } of MANUAL_SKIP_REASONS) {
    const state = view({ results: [{
      question_code: battery.questions[0].question_code,
      stopped_reason: reason, score: 0, total_items: 60, derived: {},
    }] });
    expect(state.rows[0]).toMatchObject({ state: 'skipped', detail: `Skipped · ${label}`, scoreText: null, skipCause: null });
    expect(state.decidedCount).toBe(1);
  }
  expect(view({ results: [{
    question_code: battery.questions[0].question_code,
    stopped_reason: 'skipped_prerequisite_unmet', score: null, total_items: 0, derived: {},
  }] }).rows[0]).toMatchObject({ state: 'skipped', detail: 'Skipped · Not reached', scoreText: null, skipCause: null });
});

const firstRowSkips = [
  'word_reading', 'wela_plus_read_sentences', 'oral_reading', 'reading_comprehension',
  'wela_plus_write_cvcs', 'wela_plus_write_sentences_dictation', 'wela_plus_story_writing',
];
const markedResult = (question_code, length, correct = false) => ({
  question_code, stopped_reason: 'completed', score: correct ? length : 0,
  total_items: length, derived: {},
  items: Array.from({ length }, (_, position) => ({
    position, is_correct: correct, metadata: { reached: true },
  })),
});
const savedSkip = question_code => ({
  question_code, stopped_reason: 'skipped_prerequisite_unmet', score: null,
  total_items: 0, derived: {}, items: [],
});
const currentView = results => buildRunView(WELA_PLUS_FULL_2026_1, { ...run, results }, access);

test('trigger labels export the approved EA wording', () => {
  expect(TRIGGER_LABELS).toEqual({
    letter_sounds: 'Letters first row wrong',
    wela_plus_letter_writing: 'Letter writing first row wrong',
    word_reading: 'Words first row wrong',
  });
});

test.each([
  ['letter_sounds', 0, 10, firstRowSkips, 'Letters first row wrong'],
  ['wela_plus_letter_writing', 4, 6, firstRowSkips, 'Letter writing first row wrong'],
  ['word_reading', 5, 8, firstRowSkips.slice(1), 'Words first row wrong'],
])('2026.1 resumed run labels every saved skip from %s', (trigger, index, length, skippedCodes, label) => {
  const results = [
    ...WELA_PLUS_FULL_2026_1.questions.slice(0, index).map(question => markedResult(question.question_code, 10, true)),
    markedResult(trigger, length),
    ...skippedCodes.map(savedSkip),
  ];
  const state = currentView(results);
  expect(state.firedTrigger).toBe(trigger);
  expect(state.autoSkips).toEqual([]);
  expect(state.rows.filter(row => row.state === 'skipped').map(row => row.question.question_code)).toEqual(skippedCodes);
  state.rows.forEach(row => {
    if (skippedCodes.includes(row.question.question_code)) {
      expect(row).toMatchObject({ state: 'skipped', detail: `Skipped · ${label}`,
        skipCause: { kind: 'first_row', trigger }, scoreText: null });
    } else {
      expect(row.skipCause).toBeNull();
    }
  });
});

test('2026.1 Q1 item evidence proposes Q6–Q12 auto-skips before they are saved', () => {
  const state = currentView([markedResult('letter_sounds', 10)]);
  expect(state.firedTrigger).toBe('letter_sounds');
  expect(state.autoSkips).toEqual(firstRowSkips.map(question_code => ({
    question_code, reason: 'skipped_prerequisite_unmet', trigger: 'letter_sounds',
  })));
  expect(state.decidedCount).toBe(1);
  expect(state.next).toBe(WELA_PLUS_FULL_2026_1.questions[1]);
  expect(state.rows.filter(row => firstRowSkips.includes(row.question.question_code))
    .every(row => row.state === 'not_started' && row.skipCause === null)).toBe(true);
});

test('an old EGRA saved comprehension skip explains that no story words were read', () => {
  const egra = egraBatteryFor('egra', 'dbe-egra-en-hl-1-v1');
  const state = buildRunView(egra, { ...run, results: [
    markedResult('oral_reading', 10), savedSkip('reading_comprehension'),
  ] }, access);
  expect(state.firedTrigger).toBeNull();
  expect(state.rows[3]).toMatchObject({ state: 'skipped', detail: 'Skipped · No story words read',
    skipCause: { kind: 'prerequisite', depends_on: 'oral_reading' } });
});

test('a manual Q2 skip keeps its EA reason beside Q1-triggered saved skips', () => {
  const state = currentView([
    markedResult('letter_sounds', 10),
    { ...savedSkip('wela_plus_listen_and_answer_story'), stopped_reason: 'skipped_tired' },
    ...firstRowSkips.map(savedSkip),
  ]);
  expect(state.firedTrigger).toBe('letter_sounds');
  expect(state.rows[1]).toMatchObject({ state: 'skipped', detail: 'Skipped · Child is tired', skipCause: null });
  expect(state.rows.filter(row => row.skipCause !== null).map(row => row.question.question_code)).toEqual(firstRowSkips);
  for (const row of state.rows.filter(row => firstRowSkips.includes(row.question.question_code))) {
    expect(row).toMatchObject({ detail: 'Skipped · Letters first row wrong',
      skipCause: { kind: 'first_row', trigger: 'letter_sounds' } });
  }
});

test('writing-sheet reminder only before the first writing-sheet Question', () => {
  const first = view({ results: decided(4) });
  expect(first.next).toBe(battery.questions[4]);
  expect(first.writingSheetReminder).toBe(true);
  expect(first.rows[4].detail).toBe('Next · Writing Sheet');
  expect(view({ results: decided(5) }).writingSheetReminder).toBe(false);
  expect(view({ results: decided(8) }).writingSheetReminder).toBe(false);
});

test('not-started timed Question says the minutes', () => {
  expect(view().rows[5]).toMatchObject({ state: 'not_started', detail: 'Not started · 1 min' });
  expect(view().rows[7].detail).toBe('Not started · 1 min');
});

test('all decided -> eligibleToFinalize, next null', () => {
  const results = decided(11);
  results[3] = { ...results[3], stopped_reason: 'skipped_tired', score: null };
  const state = view({ results });
  expect(state).toMatchObject({ decidedCount: 11, totalCount: 11, eligibleToFinalize: true,
    next: null, autoSkips: [], writingSheetReminder: false });
  expect(state.rows.every(row => row.state === 'done' || row.state === 'skipped')).toBe(true);
});

test.each([
  [{ started_here: 0 }, 'other_phone'],
  [{ status: 'completed' }, 'closed'],
  [{ status: 'abandoned' }, 'closed'],
  [{ started_here: true }, 'other_phone'],
])('pulled or terminal run is not writable (%p)', (changes, reason) => {
  expect(view(changes)).toMatchObject({ writable: false, readOnlyReason: reason });
});

test.each([
  { activeProgrammeId: 'programme-a', childAssigned: false },
  { activeProgrammeId: null, childAssigned: true },
  { activeProgrammeId: undefined, childAssigned: true },
  { activeProgrammeId: 'programme-b', childAssigned: true },
])('lost child or programme is read-only "unassigned" (%p)', options => {
  expect(view({}, options)).toMatchObject({ writable: false, readOnlyReason: 'unassigned' });
});

test('read-only reasons prefer closed, then other_phone, then unassigned', () => {
  const unassigned = { activeProgrammeId: null, childAssigned: false };
  expect(view({ status: 'completed', started_here: 0 }, unassigned).readOnlyReason).toBe('closed');
  expect(view({ started_here: 0 }, unassigned).readOnlyReason).toBe('other_phone');
});

test('materialsLine: oral null; card with side; sheet without side', () => {
  expect(materialsLine(battery.questions[1], 'en', battery)).toBeNull();
  expect(materialsLine(battery.questions[5], 'xh', battery)).toEqual({
    item: 'Reading Card', side: 'side B', footer: 'WelaPLUS 2024.1 · XH · side B',
  });
  expect(materialsLine(battery.questions[4], 'en', battery)).toEqual({
    item: 'Writing Sheet', side: null, footer: 'WelaPLUS 2024.1 · EN · Writing Sheet',
  });
  expect(materialsLine(battery.questions[10], 'xh', battery)).toEqual({
    item: 'Picture Cards', side: null, footer: 'WelaPLUS 2024.1 · XH · Picture Cards',
  });
});

test('formatRunStart: same local day -> "Today 09:12"; earlier -> "Tue 14:05"', () => {
  const now = new Date(2026, 9, 23, 18, 0);
  const today = new Date(2026, 9, 23, 9, 12);
  const earlier = new Date(2026, 9, 20, 14, 5);
  expect(formatRunStart(today.toISOString(), now)).toBe('Today 09:12');
  const weekday = earlier.toLocaleDateString('en-US', { weekday: 'short' });
  expect(formatRunStart(earlier.toISOString(), now)).toBe(`${weekday} 14:05`);
});

test('formatRunStart compares full local dates and zero-pads midnight', () => {
  const now = new Date(2026, 0, 1, 0, 5);
  const midnight = new Date(2026, 0, 1, 0, 0);
  expect(formatRunStart(midnight.toISOString(), now)).toBe('Today 00:00');
  const yesterday = new Date(2025, 11, 31, 23, 59);
  expect(formatRunStart(yesterday.toISOString(), now))
    .toBe(`${yesterday.toLocaleDateString('en-US', { weekday: 'short' })} 23:59`);
});

test('formatRunStart shows the date, not a weekday, once a run is older than six days', () => {
  const now = new Date(2026, 0, 1, 0, 5);
  const sixDays = new Date(2025, 11, 26, 8, 0);
  expect(formatRunStart(sixDays.toISOString(), now))
    .toBe(`${sixDays.toLocaleDateString('en-US', { weekday: 'short' })} 08:00`);
  expect(formatRunStart(new Date(2025, 11, 25, 8, 0).toISOString(), now)).toBe('25 Dec 08:00');
  expect(formatRunStart(new Date(2025, 0, 1, 0, 5).toISOString(), now)).toBe('1 Jan 00:05');
  expect(formatRunStart(new Date(2025, 11, 1, 0, 5).toISOString(), now)).toBe('1 Dec 00:05');
});

const genericBattery = {
  title: 'Another battery', battery_code: 'custom', battery_version: '3.2', aboutMinutes: 2,
  languages: ['zu'],
  questions: [
    { title: 'First', question_code: 'alpha', question_version: '1', materials: null },
    { title: 'Gated', question_code: 'beta', question_version: '1', materials: { item: 'writing_sheet' } },
    { title: 'Last', question_code: 'gamma', question_version: '1', materials: null },
  ],
  prerequisites: { beta: { depends_on: 'alpha', minScore: 10, on_unmet_reason: 'skipped_prerequisite_unmet' } },
};

test('prerequisite autoSkips pass through without counting as persisted decisions', () => {
  const results = [{ question_code: 'alpha', stopped_reason: 'completed', score: 4, total_items: 10, derived: {} }];
  const state = buildRunView(genericBattery, { ...run, language: 'zu', results }, access);
  expect(state).toMatchObject({ decidedCount: 1, totalCount: 3, eligibleToFinalize: false,
    autoSkips: [{ question_code: 'beta', reason: 'skipped_prerequisite_unmet' }], writingSheetReminder: false });
  expect(state.next).toBe(genericBattery.questions[2]);
  expect(state.rows.map(row => row.state)).toEqual(['done', 'not_started', 'next']);
});

test('the view uses generic battery order and materials, including no writing-sheet battery', () => {
  const reordered = { ...genericBattery, prerequisites: {}, questions: [genericBattery.questions[1], genericBattery.questions[0]] };
  expect(buildRunView(reordered, run, access)).toMatchObject({ totalCount: 2, writingSheetReminder: true, hasWritingSheet: true });
  expect(materialsLine(reordered.questions[0], 'zu', reordered)).toEqual({
    item: 'Writing Sheet', side: null, footer: 'Another battery 3.2 · ZU · Writing Sheet',
  });
  const oral = { ...reordered, questions: [genericBattery.questions[0]] };
  expect(buildRunView(oral, run, access)).toMatchObject({ hasWritingSheet: false, writingSheetReminder: false });
});

test('result mapping agrees with evaluator for duplicate and unrelated result codes', () => {
  const state = view({ results: [
    { question_code: battery.questions[0].question_code, stopped_reason: 'completed', score: 1, total_items: 60 },
    { question_code: 'unrelated', stopped_reason: 'completed', score: 10, total_items: 10 },
    { question_code: battery.questions[0].question_code, stopped_reason: 'skipped_tired', score: null, total_items: 0 },
  ] });
  expect(state.decidedCount).toBe(1);
  expect(state.next).toBe(battery.questions[1]);
  expect(state.rows[0]).toMatchObject({ state: 'skipped', detail: 'Skipped · Child is tired', scoreText: null });
});

test('score formatting preserves zero and handles missing parsed derived data', () => {
  const result = { question_code: battery.questions[0].question_code, stopped_reason: 'completed', score: 0, total_items: 60, derived: null };
  expect(view({ results: [result] }).rows[0].scoreText).toBe('0 / 60');
  expect(view({ results: [{ ...result, derived: { max: 0 } }] }).rows[0].scoreText).toBe('—');
  expect(view({ results: [{ ...result, score: null, derived: { max: 0 } }] }).rows[0].scoreText).toBe('—');
});

test('building a view and materials lines does not mutate inputs', () => {
  const inputBattery = JSON.parse(JSON.stringify(battery));
  const inputRun = { ...run, results: decided(4) };
  const inputAccess = { ...access };
  const before = JSON.stringify([inputBattery, inputRun, inputAccess]);
  buildRunView(inputBattery, inputRun, inputAccess);
  materialsLine(inputBattery.questions[4], inputRun.language, inputBattery);
  expect(JSON.stringify([inputBattery, inputRun, inputAccess])).toBe(before);
});

test('comprehension-like done row uses derived.questions_asked for 2 / 3 rather than total_items 5', () => {
  const state = view({ results: [{
    question_code: battery.questions[1].question_code,
    stopped_reason: 'completed', score: 2, total_items: 5, derived: { questions_asked: 3 },
  }] });
  expect(state.rows[1]).toMatchObject({ state: 'done', detail: 'Done', scoreText: '2 / 3' });
});

test.each([
  [{ status: 'abandoned' }, access],
  [{ status: 'completed' }, access],
  [{ started_here: 0 }, access],
  [{}, { ...access, childAssigned: false }],
])('read-only undecided rows say Not started, preserving timed minutes and the returned next (%p, %p)', (changes, options) => {
  const state = view(changes, options);
  expect(state.writable).toBe(false);
  expect(state.next).toBe(battery.questions[0]);
  expect(state.rows.every(row => row.state === 'not_started')).toBe(true);
  expect(state.rows[0].detail).toBe('Not started · 1 min');
  expect(state.rows[1].detail).toBe('Not started');
  expect(state.rows[4].detail).toBe('Not started');
  expect(state.rows[5].detail).toBe('Not started · 1 min');
  expect(state.rows.some(row => row.detail.startsWith('Next'))).toBe(false);
});


test('EGRA: nothing asked then End shows "—" in the Battery summary', () => {
  const egra = egraBatteryFor('egra', 'dbe-egra-en-fal-2-v1');
  const state = buildRunView(egra, { ...run, results: [{ question_code: 'reading_comprehension',
    stopped_reason: 'ea_ended', score: 0, total_items: 5, derived: { questions_asked: 0 } }] }, access);
  expect(state.rows[3]).toMatchObject({ state: 'done', scoreText: '—' });
});

test('2026.1 reading cards name shared content while all other materials retain the battery footer', () => {
  const { WELA_PLUS_FULL_2026_1: current } = require('../src/assessment-questions');
  expect(materialsLine(current.questions[0], 'xh', current)).toEqual({
    item: 'Reading Card', side: 'side A', footer: 'Reading Card 2026.3 · XH · side A',
  });
  expect(materialsLine(battery.questions[0], 'xh', battery).footer).toBe('WelaPLUS 2024.1 · XH · side A');
  for (const [index, side] of [[5, 'B'], [6, 'D'], [7, 'C']]) {
    expect(materialsLine(current.questions[index], 'en', current).footer).toBe(`Reading Card 2026.3 · EN · side ${side}`);
  }
  expect(materialsLine(current.questions[4], 'xh', current).footer).toBe('WelaPLUS 2026.1 · XH · Writing Sheet');
  expect(materialsLine(current.questions[11], 'xh', current).footer).toBe('WelaPLUS 2026.1 · XH · Picture Cards');
  expect(materialsLine(current.questions[8], 'xh', current)).toBeNull();
});

test.each([
  ['letter_sounds', 0, 10, firstRowSkips, 'No reading or writing today',
    "Lwazi got every letter in the first row wrong. So Lwazi won't be asked to read or write words, sentences or a story. This is normal.",
    ['Listen to a story', 'First sounds', 'Blending sounds', 'Letter writing']],
  ['wela_plus_letter_writing', 4, 6, firstRowSkips, 'No reading or writing today',
    "Lwazi got every letter in the first row of the Writing Sheet wrong. So Lwazi won't be asked to read or write words, sentences or a story. This is normal.", []],
  ['word_reading', 5, 8, firstRowSkips.slice(1), 'No more reading or writing today',
    "Lwazi got every word in the first row wrong. So Lwazi won't be asked to read sentences or a story, or to write. This is normal.", []],
])('skipNoticeFor derives exact copy and lists from saved %s results', (trigger, index, length, codes, title, body, stillToDo) => {
  const state = currentView([
    ...WELA_PLUS_FULL_2026_1.questions.slice(0, index).map(question => markedResult(question.question_code, 10, true)),
    markedResult(trigger, length), ...codes.map(savedSkip),
  ]);
  expect(skipNoticeFor({ battery: WELA_PLUS_FULL_2026_1, view: state, firstName: 'Lwazi' })).toEqual({
    trigger, title, body: `${body} ${stillToDo.length ? 'Carry on with the next Question.' : 'Tap Review and finalize to finish.'}`,
    stillToDo, skipped: WELA_PLUS_FULL_2026_1.questions.filter(question => codes.includes(question.question_code)).map(question => question.title),
  });
});

test('skipNoticeFor is null without a trigger, before any skip is saved, or with prerequisite skips alone', () => {
  for (const results of [[], [markedResult('letter_sounds', 10)], [
    markedResult('oral_reading', 10), savedSkip('reading_comprehension'),
  ]]) {
    expect(skipNoticeFor({ battery: WELA_PLUS_FULL_2026_1, view: currentView(results), firstName: 'Lwazi' })).toBeNull();
  }
});

test('skipNoticeFor lists only first-row skips in a run mixing manual, prerequisite and first-row skips', () => {
  // Production WelaPLUS has just one prerequisite, whose cause is superseded by a first-row trigger.
  // Add a prerequisite on a non-target Question to exercise all three causes together through the real evaluator.
  const mixedBattery = { ...WELA_PLUS_FULL_2026_1, prerequisites: {
    ...WELA_PLUS_FULL_2026_1.prerequisites,
    wela_plus_first_sound: { depends_on: 'wela_plus_listen_and_answer_story', minScore: 1,
      on_unmet_reason: 'skipped_prerequisite_unmet' },
  } };
  const state = buildRunView(mixedBattery, { ...run, results: [
    markedResult('letter_sounds', 10),
    { ...savedSkip('wela_plus_listen_and_answer_story'), stopped_reason: 'skipped_tired' },
    savedSkip('wela_plus_first_sound'), ...firstRowSkips.map(savedSkip),
  ] }, access);
  expect(state.rows[1].skipCause).toBeNull();
  expect(state.rows[2].skipCause).toEqual({ kind: 'prerequisite', depends_on: 'wela_plus_listen_and_answer_story' });
  const notice = skipNoticeFor({ battery: mixedBattery, view: state, firstName: 'Lwazi' });
  expect(notice.skipped).toEqual(WELA_PLUS_FULL_2026_1.questions.slice(5).map(question => question.title));
  expect(notice.stillToDo).toEqual(['Blending sounds', 'Letter writing']);
});

test.each([
  ['letter_sounds', 10, 'every letter in the first row', 'read or write words, sentences or a story'],
  ['wela_plus_letter_writing', 6, 'every letter in the first row of the Writing Sheet', 'read or write words, sentences or a story'],
  ['word_reading', 8, 'every word in the first row', 'read sentences or a story, or to write'],
])('missing first name uses This child and this child for %s, with no pronoun', (trigger, length, wrong, activity) => {
  const state = currentView([markedResult(trigger, length), ...firstRowSkips.filter(code => code !== trigger).map(savedSkip)]);
  expect(skipNoticeFor({ battery: WELA_PLUS_FULL_2026_1, view: state }).body)
    .toBe(`This child got ${wrong} wrong. So this child won't be asked to ${activity}. This is normal. Carry on with the next Question.`);
});
