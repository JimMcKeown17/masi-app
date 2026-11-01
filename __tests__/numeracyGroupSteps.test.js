import { childKnows, groupStepState } from '../src/numeracy/groupSteps';
import { knownStepsForChild } from '../src/numeracy/knownSteps';
import { buildNumeracyCurriculumFixture } from '../test-support/numeracyCurriculumFixture';

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    if (value instanceof Map) {
      value.forEach((entry, key) => { deepFreeze(key); deepFreeze(entry); });
      for (const method of ['set', 'delete', 'clear']) {
        Object.defineProperty(value, method, { value: () => { throw new Error('Frozen Map'); } });
      }
    } else Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};
const curriculum = buildNumeracyCurriculumFixture();
const known = (...keys) => new Map(keys.map((k) => [k, 'ticked']));
const present = ['c1', 'c2', 'c3'];
const state = (input = {}) => groupStepState(deepFreeze({
  curriculum, presentChildIds: present, knownByChild: new Map(), ...input,
}));

test('first lesson: only the four starting steps are ready', () => {
  const result = state();
  expect(result.readySteps).toEqual(['finger_flash.5', 'count.5', 'read_numbers.5', 'count_aloud.10']);
  expect(result.groupStepBySkill.get('add')).toBe('add.5');
});

test('fewer than 3 present: everyone must know it', () => {
  const input = { presentChildIds: ['c1', 'c2'], knownByChild: new Map([['c1', known('count.5')]]) };
  expect(state(input).readySteps).toContain('count.5');
  expect(state(input).readySteps).not.toContain('compare.5');
  const both = state({ ...input, knownByChild: new Map([
    ['c1', known('count.5')], ['c2', known('count.5')],
  ]) });
  for (const key of ['count.10', 'compare.5', 'add.5']) expect(both.readySteps).toContain(key);
});

test('3 or more present: 80% or all but one', () => {
  const presentChildIds = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
  const input = { presentChildIds, knownByChild: new Map(
    presentChildIds.slice(0, 5).map((id) => [id, known('count.5')]),
  ) };
  expect(state(input).groupKnown).toContain('count.5');
  expect(state({ ...input, knownByChild: new Map(
    presentChildIds.slice(0, 4).map((id) => [id, known('count.5')]),
  ) }).groupKnown).not.toContain('count.5');
});

test('a child with no data counts as knowing nothing', () => {
  const input = { presentChildIds: ['c1', 'c2', 'c3', 'c4'], knownByChild: new Map([
    ['c1', known('count.5')], ['c2', known('count.5')],
  ]) };
  expect(() => state(input)).not.toThrow();
  expect(state(input).groupKnown).not.toContain('count.5');
});

test('the same child twice counts once', () => {
  const result = state({ presentChildIds: ['c1', 'c1', 'c2'],
    knownByChild: new Map([['c1', known('count.5')]]) });
  expect(result.presentIds).toEqual(['c1', 'c2']);
  expect(result.groupKnown).not.toContain('count.5');
});

test('a finished skill has no group step', () => {
  const result = state({ knownByChild: new Map(present.map((id) => [
    id, known('finger_flash.5', 'finger_flash.10'),
  ])) });
  expect(result.groupStepBySkill.get('finger_flash')).toBeNull();
  expect(result.readySteps.filter((key) => key.startsWith('finger_flash.'))).toEqual([]);
});

test('out-of-order ticks with implied steps', () => {
  const result = state({ knownByChild: new Map(present.map((id) => [id,
    knownStepsForChild(deepFreeze({ curriculum, ticks: [
      { step_key: 'count.20', confirmed: true }, { step_key: 'add.10', confirmed: true },
    ], evidence: new Map() })),
  ])) });
  expect(result.groupStepBySkill.get('add')).toBe('add.15');
  expect(result.readySteps).toContain('add.15');
  expect(result.readySteps).toContain('subtract.5');
  expect(result.readySteps).not.toContain('add.5');
});

test('childKnows accepts every known state and safely handles missing children', () => {
  const knownByChild = deepFreeze(new Map([['c1', new Map([
    ['count.5', 'assessment'], ['count.10', 'ticked'], ['count.20', 'implied'],
  ])]]));
  for (const key of ['count.5', 'count.10', 'count.20']) {
    expect(childKnows(knownByChild, 'c1', key)).toBe(true);
  }
  expect(childKnows(knownByChild, 'c1', 'add.5')).toBe(false);
  expect(childKnows(knownByChild, 'missing', 'count.5')).toBe(false);
});

test('missing or malformed knowledge and attendance are treated as empty independently', () => {
  for (const odd of [undefined, null, {}, 'bad', 42, false, []]) {
    expect(childKnows(deepFreeze(odd), 'c1', 'count.5')).toBe(false);
    expect(state({ knownByChild: odd }).groupKnown).toEqual([]);
  }
  for (const odd of [undefined, null, {}, 'c1', 42, false, new Map()]) {
    const result = state({ presentChildIds: odd,
      knownByChild: new Map([['c1', known('count.5')]]) });
    expect(result.presentIds).toEqual([]);
    expect(result.groupKnown).toEqual([]);
  }
});

test('no present children means no group-known steps', () => {
  const result = state({ presentChildIds: [], knownByChild: new Map(
    present.map((id) => [id, known(...curriculum.skills.flatMap((skill) => skill.steps.map((s) => s.key)))]),
  ) });
  expect(result.groupKnown).toEqual([]);
  expect(result.readySteps).toEqual(['finger_flash.5', 'count.5', 'read_numbers.5', 'count_aloud.10']);
});

test('a prerequisite missing from the curriculum is not known', () => {
  const changed = { ...curriculum, skills: curriculum.skills.map((skill) => ({
    ...skill, steps: skill.steps.map((step) => step.key === 'count.5'
      ? { ...step, comes_after: ['retired.5'] } : step),
  })) };
  const result = state({ curriculum: changed,
    knownByChild: new Map(present.map((id) => [id, known('retired.5')])) });
  expect(result.groupKnown).not.toContain('retired.5');
  expect(result.readySteps).not.toContain('count.5');
});

test('outputs retain curriculum order and present ids retain first-seen order', () => {
  const result = state({ presentChildIds: ['c2', 'c1', 'c2', 'c3', 'c1'],
    knownByChild: new Map(present.map((id) => [id, known('count_aloud.10', 'count.5', 'finger_flash.5')])) });
  expect(result.presentIds).toEqual(['c2', 'c1', 'c3']);
  expect(result.groupKnown).toEqual(['finger_flash.5', 'count.5', 'count_aloud.10']);
  expect([...result.groupStepBySkill.keys()]).toEqual(curriculum.skills.map((skill) => skill.key));
  expect(result.readySteps).toEqual([
    'finger_flash.10', 'count.10', 'read_numbers.5', 'compare.5', 'add.5', 'count_aloud.20',
  ]);
});
