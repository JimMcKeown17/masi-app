import { EVIDENCE_MAP, computeStepEvidence } from '../src/numeracy/evidence';
import { buildNumeracyCurriculumFixture } from '../test-support/numeracyCurriculumFixture';

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};
const item = (skill, band, correct, extra = {}) => ({
  is_correct: correct, metadata: { skill, band, reached: true, ...extra },
});
const result = ({ id, code, date, created = `${date}T09:00:00.000Z`, version = 'masi-egma-en-2026-1', stopped = 'completed', items }) => ({
  id, question_code: code, assessment_date: date, created_at: created,
  question_version: version, stopped_reason: stopped, items,
});
const curriculum = buildNumeracyCurriculumFixture();
const ev = (results) => computeStepEvidence({ results: deepFreeze(results), curriculum });
const read = (id, date, items, extra = {}) => result({ id, date, code: 'maths_read_numbers', items, ...extra });
const outcome = (shown, resultId, date) => ({ shown, resultId, date });

test('fixture follows the spec order rules', () => {
  const steps = curriculum.skills.flatMap((s) => s.steps);
  const step = (key) => steps.find((s) => s.key === key);
  expect(steps).toHaveLength(37);
  expect(steps.filter((s) => s.comes_after.length === 0).map((s) => s.key))
    .toEqual(['finger_flash.5', 'count.5', 'read_numbers.5', 'count_aloud.10']);
  expect(step('add.15').comes_after).toEqual(['add.10', 'count.20']);
  expect(step('compare.20').comes_after).toEqual(['compare.10', 'count.20']);
  expect(step('compare.50').comes_after).toEqual(['compare.20', 'read_numbers.50']);
  expect(step('before_after.5').comes_after).toEqual(['read_numbers.5']);
  expect(step('subtract.20').comes_after).toEqual(['add.20', 'count.20', 'subtract.15']);
  expect(step('number_pairs.5').comes_after).toEqual(['add.5', 'count.5', 'finger_flash.5']);
  expect(step('skip_count.5s').comes_after).toEqual(['count_aloud.50', 'skip_count.2s']);
  expect(curriculum.skills.map((s) => s.key)).toEqual([
    'finger_flash', 'count', 'read_numbers', 'compare', 'before_after', 'add', 'subtract', 'number_pairs', 'count_aloud', 'skip_count',
  ]);
  const assertFrozen = (value) => {
    if (value && typeof value === 'object') {
      expect(Object.isFrozen(value)).toBe(true);
      Object.values(value).forEach(assertFrozen);
    }
  };
  assertFrozen(curriculum);
  const activities = deepFreeze({ 'count.5': [{ name: 'Replacement', minutes: 3, how: 'Try.', needs: 'Cards', source: 'new', source_ref: 'Test' }] });
  const replaced = buildNumeracyCurriculumFixture({ activities });
  expect(replaced.skills[1].steps[0].activities).toEqual(activities['count.5']);
  assertFrozen(replaced);
  expect(step('count.5').activities.map((a) => [a.name, a.minutes])).toEqual([['count.5 A', 5], ['count.5 B', 7]]);
});

test('EVIDENCE_MAP is the spec §7.2 table', () => {
  expect(Object.isFrozen(EVIDENCE_MAP)).toBe(true);
  Object.values(EVIDENCE_MAP).forEach((tag) => expect(Object.isFrozen(tag)).toBe(true));
  expect(EVIDENCE_MAP).toEqual({
    'finger_flash.5': { skill: 'quick_see', band: 5 },
    'finger_flash.10': { skill: 'quick_see', band: 10 },
    'count.5': { skill: 'count_out', band: 5 },
    'count.10': { skill: 'count_out', band: 10 },
    'count.20': { skill: 'count_out', band: 20 },
    'read_numbers.5': { skill: 'read_numbers', band: 5 },
    'read_numbers.10': { skill: 'read_numbers', band: 10 },
    'read_numbers.20': { skill: 'read_numbers', band: 20 },
    'read_numbers.50': { skill: 'read_numbers', band: 50 },
    'read_numbers.100': { skill: 'read_numbers', band: 100 },
    'compare.5': { skill: 'compare_numbers', band: 5 },
    'compare.10': { skill: 'compare_numbers', band: 10 },
    'compare.20': { skill: 'compare_numbers', band: 20 },
    'compare.50': { skill: 'compare_numbers', band: 50 },
    'compare.100': { skill: 'compare_numbers', band: 100 },
    'before_after.5': { skill: 'number_neighbours', band: 5 },
    'before_after.10': { skill: 'number_neighbours', band: 10 },
    'before_after.20': { skill: 'number_neighbours', band: 20 },
    'add.5': { skill: 'add_objects', band: 5 },
    'add.10': { skill: 'add_objects', band: 10 },
    'add.20': { skill: 'add', band: 20 },
    'subtract.5': { skill: 'subtract_objects', band: 5 },
    'subtract.10': { skill: 'subtract_objects', band: 10 },
    'subtract.20': { skill: 'subtract', band: 20 },
    'number_pairs.5': { skill: 'number_bonds', band: 5 },
    'number_pairs.10': { skill: 'number_bonds', band: 10 },
    'count_aloud.10': { skill: 'count_aloud', band: 10 },
    'count_aloud.20': { skill: 'count_aloud', band: 20 },
    'count_aloud.50': { skill: 'count_aloud', band: 50 },
    'count_aloud.100': { skill: 'count_aloud', band: 100 },
  });
  const unmapped = curriculum.skills.flatMap((s) => s.steps).map((s) => s.key).filter((k) => !(k in EVIDENCE_MAP));
  expect(unmapped).toEqual(['before_after.50', 'before_after.100', 'add.15', 'subtract.15', 'skip_count.2s', 'skip_count.5s', 'skip_count.10s']);
});

test('a reached step with every item right is shown', () => {
  expect(ev([read('r1', '2026-11-02', Array.from({ length: 3 }, () => item('read_numbers', 10, true)))]).get('read_numbers.10'))
    .toEqual(outcome(true, 'r1', '2026-11-02'));
});

test('one wrong reached item means not shown', () => {
  expect(ev([read('r1', '2026-11-02', [item('read_numbers', 10, true), item('read_numbers', 10, false), item('read_numbers', 10, true)])]).get('read_numbers.10'))
    .toEqual(outcome(false, 'r1', '2026-11-02'));
});

test('the newest result that reached the step decides', () => {
  for (const newestRight of [false, true]) {
    expect(ev([
      read('r1', '2026-11-01', [item('read_numbers', 10, !newestRight)]),
      read('r2', '2026-11-05', [item('read_numbers', 10, newestRight)]),
    ]).get('read_numbers.10')).toEqual(outcome(newestRight, 'r2', '2026-11-05'));
  }
});

test('a newer result that never reached the step keeps older evidence', () => {
  expect(ev([
    read('r1', '2026-11-01', [item('read_numbers', 10, true)]),
    read('r2', '2026-11-05', [item('read_numbers', 10, false, { reached: false })]),
  ]).get('read_numbers.10')).toEqual(outcome(true, 'r1', '2026-11-01'));
});

test('unreached items inside the deciding result are ignored', () => {
  expect(ev([read('r1', '2026-11-02', [item('read_numbers', 10, true),
    item('read_numbers', 10, false, { reached: false }), item('read_numbers', 10, false, { reached: false })])]).get('read_numbers.10'))
    .toEqual(outcome(true, 'r1', '2026-11-02'));
});

test('same date: the later created_at is newer', () => {
  const older = read('r1', '2026-11-05', [item('read_numbers', 10, true)]);
  const newer = read('r2', '2026-11-05', [item('read_numbers', 10, false)], { created: '2026-11-05T10:00:00.000Z' });
  for (const results of [[older, newer], [newer, older]]) {
    expect(ev(results).get('read_numbers.10')).toEqual(outcome(false, 'r2', '2026-11-05'));
  }
});

test('counters answers count only with count_on or known', () => {
  for (const [strategies, shown] of [
    [['count_on', 'known', 'count_all'], false],
    [['count_on', 'known', 'count_on'], true],
    [['count_all', 'count_all', 'count_all'], false],
  ]) {
    for (const [skill, code, key] of [['add_objects', 'maths_add_counters', 'add.5'], ['subtract_objects', 'maths_subtract_counters', 'subtract.5']]) {
      expect(ev([result({ id: 'r1', code, date: '2026-11-02', items: strategies.map((strategy) => item(skill, 5, true, { strategy })) })]).get(key))
        .toEqual(outcome(shown, 'r1', '2026-11-02'));
    }
  }
});

test('draft question versions are ignored', () => {
  expect(ev([read('r1', '2026-11-02', [item('read_numbers', 10, true)], { version: 'masi-egma-en-2026-1-draft' })])).toEqual(new Map());
});

test('skipped results are ignored', () => {
  expect(ev([read('r1', '2026-11-02', [item('read_numbers', 10, true)], { stopped: 'skipped_prerequisite_unmet' })])).toEqual(new Map());
});

test('core addition feeds only up to 20', () => {
  const evidence = ev([result({ id: 'r1', code: 'egma_addition_l1', date: '2026-11-02', items: [5, 10, 20].map((band) => item('add', band, true)) })]);
  expect([...evidence.keys()]).toEqual(['add.20']);
  expect(evidence.get('add.20')).toEqual(outcome(true, 'r1', '2026-11-02'));
});

test('a step is shown when any source Question shows it', () => {
  for (const olderRight of [true, false]) {
    expect(ev([
      read('r2', '2026-11-05', [item('read_numbers', 20, false)]),
      result({ id: 'r1', code: 'egma_number_id', date: '2026-11-01', items: [item('read_numbers', 20, olderRight)] }),
    ]).get('read_numbers.20')).toEqual(olderRight ? outcome(true, 'r1', '2026-11-01') : outcome(false, 'r2', '2026-11-05'));
  }
});

test('only steps in the given curriculum appear', () => {
  const limited = deepFreeze({ ...curriculum, skills: curriculum.skills.map((skill) => ({ ...skill, steps: skill.steps.filter((s) => s.key !== 'read_numbers.100') })) });
  const results = deepFreeze([read('r1', '2026-11-02', [item('read_numbers', 100, true)])]);
  expect(computeStepEvidence({ results, curriculum }).has('read_numbers.100')).toBe(true);
  expect(computeStepEvidence({ results, curriculum: limited }).has('read_numbers.100')).toBe(false);
});

test('odd metadata and non-maths results are ignored', () => {
  const oddMetadata = [null, undefined, [], 'text', 10, new Date('2026-11-01'), Object.assign([], { skill: 'read_numbers', band: 10 })];
  const results = [result({ id: 'letters', code: 'letter_sounds', date: '2026-11-02', items: [{ is_correct: true, metadata: { reached: true } }] }),
    read('r1', '2026-11-02', [...oddMetadata.map((metadata) => ({ is_correct: true, metadata })),
      {}, null, item('read_numbers', '10', true)]),
    null, {}, { items: 'bad', question_version: 42 },
    { items: [], assessment_date: 42, created_at: {} },
  ];
  expect(ev(results)).toEqual(new Map());
  for (const invalid of [null, undefined, {}, 'bad', 42]) expect(ev(invalid)).toEqual(new Map());
});
