import { v4 as uuid } from 'uuid';
import { egraBatteryFor } from '../src/assessment-questions/egra';
import { buildRunView, formatRunStart, materialsLine, runCode } from '../src/utils/batteryRun';
import { MANUAL_SKIP_REASONS, WELA_PLUS_FULL_2024_1 } from '../src/assessment-questions';

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
    expect(state.rows[0]).toMatchObject({ state: 'skipped', detail: `Skipped · ${label}`, scoreText: null });
    expect(state.decidedCount).toBe(1);
  }
  expect(view({ results: [{
    question_code: battery.questions[0].question_code,
    stopped_reason: 'skipped_prerequisite_unmet', score: null, total_items: 0, derived: {},
  }] }).rows[0]).toMatchObject({ state: 'skipped', detail: 'Skipped · Not reached', scoreText: null });
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
