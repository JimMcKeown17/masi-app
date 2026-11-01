import { knownStepsForChild } from '../src/numeracy/knownSteps';
import { buildNumeracyCurriculumFixture } from '../test-support/numeracyCurriculumFixture';

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};
const curriculum = buildNumeracyCurriculumFixture();
const known = (input = {}) => knownStepsForChild(deepFreeze({ curriculum, ...input }));

test('assessment evidence wins over a tick', () => {
  const result = known({
    evidence: new Map([['add.10', { shown: true, resultId: 'r1', date: '2026-11-02' }]]),
    ticks: [{ step_key: 'add.10', confirmed: true }],
  });
  expect(Object.fromEntries(result)).toEqual({ 'add.5': 'implied', 'add.10': 'assessment' });
});

test('a confirmed tick is ticked and an unticked row is not known', () => {
  const result = known({ ticks: [
    { step_key: 'add.5', confirmed: true },
    { step_key: 'count.5', confirmed: false },
  ] });
  expect(Object.fromEntries(result)).toEqual({ 'add.5': 'ticked' });
});

test('steps below a known step are implied', () => {
  const result = known({ ticks: [{ step_key: 'add.15', confirmed: true }] });
  expect(Object.fromEntries(result)).toEqual({
    'add.5': 'implied', 'add.10': 'implied', 'add.15': 'ticked',
  });
});

test('implied never replaces a step known on its own', () => {
  const result = known({
    evidence: new Map([['add.5', { shown: true, resultId: 'r1', date: '2026-11-02' }]]),
    ticks: [{ step_key: 'add.15', confirmed: true }],
  });
  expect(Object.fromEntries(result)).toEqual({
    'add.5': 'assessment', 'add.10': 'implied', 'add.15': 'ticked',
  });
});

test('unticking the top step brings lower steps back to their own state', () => {
  const result = known({ ticks: [
    { step_key: 'add.10', confirmed: false },
    { step_key: 'add.5', confirmed: true },
  ] });
  expect(Object.fromEntries(result)).toEqual({ 'add.5': 'ticked' });
});

test('evidence that is not shown is not known', () => {
  const result = known({
    evidence: new Map([['count.10', { shown: false, resultId: 'r1', date: '2026-11-02' }]]),
  });
  expect(Object.fromEntries(result)).toEqual({});
});

test('implied stays inside its skill', () => {
  const result = known({ ticks: [{ step_key: 'add.20', confirmed: true }] });
  expect(Object.fromEntries(result)).toEqual({
    'add.5': 'implied', 'add.10': 'implied', 'add.15': 'implied', 'add.20': 'ticked',
  });
});

test('ticks for steps this edition does not have are ignored', () => {
  const result = known({ ticks: [
    { step_key: 'add.30', confirmed: true },
    { step_key: 'multiply.5', confirmed: true },
  ] });
  expect(Object.fromEntries(result)).toEqual({});
});

test('entries come in curriculum order', () => {
  const result = known({ ticks: [
    { step_key: 'count_aloud.10', confirmed: true },
    { step_key: 'finger_flash.5', confirmed: true },
    { step_key: 'add.5', confirmed: true },
  ] });
  expect([...result.keys()]).toEqual(['finger_flash.5', 'add.5', 'count_aloud.10']);
});

test('missing and odd ticks or evidence are tolerated independently', () => {
  for (const odd of [undefined, null, {}, 'bad', 42, false]) {
    expect(Object.fromEntries(known({ ticks: odd, evidence: odd }))).toEqual({});
    expect(Object.fromEntries(known({ ticks: odd,
      evidence: new Map([['add.5', { shown: true, resultId: 'r1', date: '2026-11-02' }]]),
    }))).toEqual({ 'add.5': 'assessment' });
    expect(Object.fromEntries(known({ evidence: odd,
      ticks: [{ step_key: 'add.5', confirmed: true }],
    }))).toEqual({ 'add.5': 'ticked' });
  }
  expect(Object.fromEntries(known({ evidence: [], ticks: [null, undefined, {}, 'bad'] }))).toEqual({});
});

test('any confirmed duplicate tick is enough and extra fields are ignored', () => {
  const confirmed = { step_key: 'add.5', confirmed: true, child_id: 'c1', shown: false, state: 'implied' };
  const unticked = { step_key: 'add.5', confirmed: false };
  for (const ticks of [[confirmed, unticked], [unticked, confirmed]]) {
    expect(Object.fromEntries(known({ ticks }))).toEqual({ 'add.5': 'ticked' });
  }
});

test('only literal true flags and evidence keys in the curriculum count', () => {
  const result = known({
    ticks: [{ step_key: 'add.10', confirmed: 'true' }, { step_key: 'count.10', confirmed: 1 },
      { step_key: 'add.5', confirmed: true }],
    evidence: new Map([
      ['add.30', { shown: true, resultId: 'r1', date: '2026-11-02' }],
      ['multiply.5', { shown: true, resultId: 'r1', date: '2026-11-02' }],
      ['add.5', { shown: false, resultId: 'r1', date: '2026-11-02' }],
      ['add.10', { shown: 'true' }], ['count.10', { shown: 1 }], ['subtract.20', null],
    ]),
  });
  expect(Object.fromEntries(result)).toEqual({ 'add.5': 'ticked' });
});
