import { cardReadiness, pickNumeracyActivity, cardHelpLists, firstUnknownStep, stillOnStep, swapOptions } from '../src/numeracy/cards';
import { planNumeracyLesson } from '../src/numeracy/planLesson';
import { buildNumeracyCurriculumFixture } from '../test-support/numeracyCurriculumFixture';

const curriculum = buildNumeracyCurriculumFixture();
const known = (...keys) => new Map(keys.map((key) => [key, 'ticked']));
const base = {
  curriculum, presentChildIds: ['c1', 'c2', 'c3'], knownByChild: new Map(),
  history: [], activityCardCount: 2, lessonDate: '2026-11-05',
  complete: { history: true, ticks: true, evidence: true },
};

test('cardReadiness matches the planner\'s card for the same step', () => {
  const input = { ...base, presentChildIds: ['c3', 'c2', 'c1', 'c3'], knownByChild: new Map([
    ['c1', known('count.5', 'count.10')], ['c2', known('count.5')],
  ]) };
  planNumeracyLesson(input).cards.forEach(({ slot, step_key, activity, ...readiness }) => {
    expect(cardReadiness({ ...input, stepKey: step_key })).toEqual(readiness);
  });
  expect(cardReadiness({ ...input, stepKey: 'count.10' })).toEqual({
    readyCount: 2, presentCount: 3, needHelp: ['c3'], canHelp: ['c1'],
  });
});

test('a child who needs help is never listed as able to help', () => {
  const card = cardReadiness({ ...base, presentChildIds: ['c1'], knownByChild: new Map([
    ['c1', known('add.5', 'add.10')],
  ]), stepKey: 'add.10' });
  expect(card).toEqual({ readyCount: 0, presentCount: 1, needHelp: ['c1'], canHelp: ['c1'] });
  expect(cardHelpLists(card)).toEqual({ needHelp: ['c1'], canHelp: [] });
  expect(card.canHelp).toEqual(['c1']);
});

test('still on, same skill: the first unknown step in that skill', () => {
  expect(stillOnStep({ curriculum, knownByChild: new Map([['c2', known('count.20')]]), childId: 'c2', stepKey: 'add.15' })).toBe('add.5');
});

test('still on, other skill: the first unknown step of the missing skill', () => {
  expect(stillOnStep({ curriculum, knownByChild: new Map([['c1', known('add.5', 'count.5')]]), childId: 'c1', stepKey: 'add.10' })).toBe('count.10');
  // comes_after is alphabetic in the fixture; curriculum order puts Count before Add.
  expect(stillOnStep({ curriculum, knownByChild: new Map(), childId: 'c1', stepKey: 'subtract.5' })).toBe('count.5');
});

test('still on is null for a ready child', () => {
  expect(stillOnStep({ curriculum, knownByChild: new Map([['c3', known('add.5', 'count.10')]]), childId: 'c3', stepKey: 'add.10' })).toBeNull();
});

test('firstUnknownStep skips implied and assessment steps and ends at null', () => {
  const states = new Map([['add.5', 'implied'], ['add.10', 'ticked']]);
  expect(firstUnknownStep({ curriculum, known: states, skillKey: 'add' })).toBe('add.15');
  states.set('add.15', 'assessment');
  states.set('add.20', 'assessment');
  expect(firstUnknownStep({ curriculum, known: states, skillKey: 'add' })).toBeNull();
  expect(firstUnknownStep({ curriculum, skillKey: 'add' })).toBe('add.5');
  expect(firstUnknownStep({ curriculum, skillKey: 'missing' })).toBeNull();
  const reversed = { ...curriculum, skills: curriculum.skills.map((s) => ({ ...s, steps: [...s.steps].reverse() })) };
  expect(firstUnknownStep({ curriculum: reversed, skillKey: 'add' })).toBe('add.5');
});

test('swap options are the ready steps of the card\'s slot, minus taken ones', () => {
  expect(swapOptions({ ...base, slot: 'activity', takenStepKeys: ['count.5'] })).toEqual([{ step_key: 'read_numbers.5', review: false }]);
});

test('swap options fall back to review steps when nothing is ready', () => {
  const keys = curriculum.skills.flatMap((s) => s.steps.map((step) => step.key));
  const input = { ...base, knownByChild: new Map(base.presentChildIds.map((id) => [id, known(...keys)])), slot: 'activity', takenStepKeys: [] };
  const expected = ['count.20', 'read_numbers.100', 'compare.100', 'before_after.100', 'add.20', 'subtract.20', 'number_pairs.10'].map((step_key) => ({ step_key, review: true }));
  expect(swapOptions(input)).toEqual(expected);
  expect(swapOptions({ ...input, takenStepKeys: ['add.20'] })).toEqual(expected.filter((o) => o.step_key !== 'add.20'));
});

test('review options require enough children ready for the same step', () => {
  const keys = curriculum.skills.flatMap((s) => s.steps.map((step) => step.key));
  const knownByChild = new Map([
    ['c1', known(...keys.filter((k) => k !== 'add.15'))],
    ['c2', known(...keys.filter((k) => k !== 'count.20'))],
    ['c3', known(...keys)],
  ]);
  expect(swapOptions({ ...base, knownByChild, slot: 'activity', takenStepKeys: [] })).toContainEqual({ step_key: 'add.15', review: true });
  expect(swapOptions({ ...base, knownByChild, slot: 'activity', takenStepKeys: [] })).not.toContainEqual({ step_key: 'subtract.15', review: true });
});

test('a prerequisite absent from the curriculum is never known', () => {
  const changed = { ...curriculum, skills: curriculum.skills.map((s) => ({ ...s, steps: s.steps.map((step) => step.key === 'add.5' ? { ...step, comes_after: ['retired.5'] } : step) })) };
  const input = { ...base, curriculum: changed, knownByChild: new Map([['c1', known('retired.5')]]), presentChildIds: ['c1'], stepKey: 'add.5' };
  expect(cardReadiness(input).needHelp).toEqual(['c1']);
  expect(stillOnStep({ ...input, childId: 'c1' })).toBeNull();
});

test('activity rotation filters history and compares date, createdAt and id', () => {
  const entry = (date, createdAt, id, activity) => ({ date, createdAt, id, taught: [{ step_key: 'count.5', activity }] });
  const input = { ...base, stepKey: 'count.5', slot: 'activity' };
  expect(pickNumeracyActivity({ ...input, history: [null, {}, entry('', '', '', 'count.5 A'), entry('2026-11-06', '', '', 'count.5 A')] })).toBe('count.5 A');
  const early = entry('2026-11-05', '09:00', 'a', 'count.5 B');
  const late = entry('2026-11-05', '10:00', 'b', 'count.5 A');
  expect(pickNumeracyActivity({ ...input, history: [late, early] })).toBe('count.5 B');
  expect(pickNumeracyActivity({ ...input, history: [early, { ...late, createdAt: '09:00' }] })).toBe('count.5 B');
  expect(pickNumeracyActivity({ ...input, slot: 'warm_up', history: [late] })).toBe('count.5 A');
});

test('the planner is unchanged by the refactor', () => {
  // Literal full outputs captured from the original planner before extracting helpers.
  const first = {
    engine_version: 1,
    cards: [
      { slot: 'warm_up', step_key: 'finger_flash.5', activity: 'finger_flash.5 A', readyCount: 3, presentCount: 3, needHelp: [], canHelp: [] },
      { slot: 'activity', step_key: 'count.5', activity: 'count.5 A', readyCount: 3, presentCount: 3, needHelp: [], canHelp: [] },
      { slot: 'activity', step_key: 'read_numbers.5', activity: 'read_numbers.5 A', readyCount: 3, presentCount: 3, needHelp: [], canHelp: [] },
    ],
    reason: 'ok', readySteps: ['finger_flash.5', 'count.5', 'read_numbers.5', 'count_aloud.10'],
  };
  const rotated = {
    engine_version: 1,
    cards: [
      { slot: 'warm_up', step_key: 'finger_flash.5', activity: 'finger_flash.5 A', readyCount: 3, presentCount: 3, needHelp: [], canHelp: [] },
      { slot: 'activity', step_key: 'read_numbers.5', activity: 'read_numbers.5 A', readyCount: 3, presentCount: 3, needHelp: [], canHelp: [] },
      { slot: 'activity', step_key: 'count.5', activity: 'count.5 B', readyCount: 3, presentCount: 3, needHelp: [], canHelp: [] },
    ],
    reason: 'ok', readySteps: ['finger_flash.5', 'count.5', 'read_numbers.5', 'count_aloud.10'],
  };
  const history = [{ date: '2026-11-04', createdAt: '2026-11-04T09:00:00Z', id: 's1', taught: [{ slot: 'activity', step_key: 'count.5', activity: 'count.5 A' }] }];
  expect(planNumeracyLesson(base)).toEqual(first);
  expect(planNumeracyLesson({ ...base, history })).toEqual(rotated);
  expect(planNumeracyLesson({ ...base, presentChildIds: [] })).toEqual({ engine_version: 1, cards: [], reason: 'no_children', readySteps: [] });
});
