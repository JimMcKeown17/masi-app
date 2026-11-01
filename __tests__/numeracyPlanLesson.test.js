import { NUMERACY_ENGINE_VERSION, planNumeracyLesson } from '../src/numeracy/planLesson';
import { groupStepState } from '../src/numeracy/groupSteps';
import { isGroupMastered } from '../src/utils/groupMastery';
import { buildNumeracyCurriculumFixture } from '../test-support/numeracyCurriculumFixture';

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    if (value instanceof Map) {
      value.forEach((entry, key) => { deepFreeze(key); deepFreeze(entry); });
      // Object.freeze alone does not prevent Map.set/delete/clear.
      ['set', 'delete', 'clear'].forEach((method) => Object.defineProperty(value, method, {
        value: () => { throw new Error('Frozen input Map'); },
      }));
    } else Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};
const fixture = buildNumeracyCurriculumFixture();
const base = deepFreeze({
  curriculum: fixture, presentChildIds: ['c1', 'c2', 'c3'], knownByChild: new Map(),
  history: [], activityCardCount: 2, lessonDate: '2026-11-05',
  complete: { history: true, ticks: true, evidence: true },
});
const lesson = (date, taught, { createdAt = `${date}T08:00:00.000Z`, id = `s-${date}` } = {}) => (
  { date, createdAt, id, taught }
);
const taught = (step_key, activity = `${step_key} A`, slot = 'activity') => ({ slot, step_key, activity });
const steps = (plan) => plan.cards.map((c) => [c.slot, c.step_key]);
const activitySteps = (plan) => plan.cards.filter((c) => c.slot === 'activity').map((c) => c.step_key);
const known = (...keys) => new Map(keys.map((key) => [key, 'ticked']));
const allKnow = (keys) => new Map(base.presentChildIds.map((id) => [id, known(...keys)]));
const keysIn = (...skills) => fixture.skills.filter((s) => skills.includes(s.key)).flatMap((s) => s.steps.map((st) => st.key));
const activity = (name, minutes = 5) => ({ name, minutes, how: 'Try together.', needs: 'Counters', source: 'new', source_ref: 'Fixture' });
const expectOnlyReady = (input, plan) => {
  const { groupKnown } = groupStepState(input);
  plan.cards.forEach((card) => {
    expect(card.readyCount + card.needHelp.length).toBe(card.presentCount);
    // Every card, review warm-ups included, has enough ready children.
    expect(isGroupMastered(card.readyCount, card.presentCount)).toBe(true);
    expect(card.slot === 'warm_up' ? [...plan.readySteps, ...groupKnown] : plan.readySteps).toContain(card.step_key);
    expect(Object.keys(card).sort()).toEqual(['slot', 'step_key', 'activity', 'readyCount', 'presentCount', 'needHelp', 'canHelp'].sort());
  });
  expect(Object.keys(plan).sort()).toEqual(['engine_version', 'cards', 'reason', 'readySteps'].sort());
};
// Every planner call freezes the complete input and checks the readiness invariant.
const planFor = (changes = {}) => {
  const input = deepFreeze({ ...base, ...changes });
  const plan = planNumeracyLesson(input);
  expectOnlyReady(input, plan);
  return plan;
};

test('a first lesson: a warm-up and two activities from the starting steps', () => {
  const plan = planFor();
  expect(NUMERACY_ENGINE_VERSION).toBe(1);
  expect(plan).toMatchObject({ engine_version: 1, reason: 'ok', readySteps: ['finger_flash.5', 'count.5', 'read_numbers.5', 'count_aloud.10'] });
  expect(steps(plan)).toEqual([['warm_up', 'finger_flash.5'], ['activity', 'count.5'], ['activity', 'read_numbers.5']]);
  expect(plan.cards.map((c) => c.activity)).toEqual(['finger_flash.5 A', 'count.5 A', 'read_numbers.5 A']);
  plan.cards.forEach((c) => expect(c).toMatchObject({ readyCount: 3, presentCount: 3, needHelp: [], canHelp: [] }));
  // Pools come from the curriculum, including editions that change a skill's slot.
  const curriculum = { ...fixture, skills: fixture.skills.map((s) => ({ ...s, slot: s.key === 'count' ? 'warm_up' : 'activity' })) };
  expect(steps(planFor({ curriculum }))).toEqual([['warm_up', 'count.5'], ['activity', 'finger_flash.5'], ['activity', 'read_numbers.5']]);
});

test('never-taught skills first, then the oldest, ties in curriculum order', () => {
  const knownByChild = allKnow(['count.5', 'read_numbers.5']);
  expect(activitySteps(planFor({ knownByChild, history: [lesson('2026-11-02', [taught('read_numbers.10')]), lesson('2026-11-03', [taught('count.10')])] }))).toEqual(['compare.5', 'before_after.5']);
  expect(activitySteps(planFor({ knownByChild, history: [
    lesson('2026-11-04', [taught('count.10')]),
    lesson('2026-11-01', [taught('before_after.5'), taught('add.5')]),
    lesson('2026-11-03', [taught('read_numbers.10')]), lesson('2026-11-02', [taught('compare.5')]),
  ] }))).toEqual(['before_after.5', 'add.5']);
});

test('the activity done least recently comes first', () => {
  const curriculum = buildNumeracyCurriculumFixture({ activities: { 'finger_flash.5': ['X', 'Y', 'Z'].map((name) => activity(name)) } });
  const knownByChild = allKnow(keysIn('count_aloud', 'skip_count'));
  let history = [];
  ['X', 'Y', 'Z', 'X'].forEach((expected, index) => {
    const date = `2026-11-0${index + 1}`;
    const plan = planFor({ curriculum, knownByChild, history, lessonDate: date });
    expect(plan.cards[0].step_key).toBe('finger_flash.5');
    expect(plan.cards[0].activity).toBe(expected);
    history = [...history, lesson(date, [plan.cards[0]])];
  });
});

test('the warm-up uses an activity of 5 minutes or less', () => {
  const curriculum = buildNumeracyCurriculumFixture({ activities: { 'finger_flash.5': [activity('Long', 7), activity('Short', 5)] } });
  expect(planFor({ curriculum }).cards[0].activity).toBe('Short');
  const fallback = buildNumeracyCurriculumFixture({ activities: { 'finger_flash.5': [activity('Long', 7), activity('Longer', 8)] } });
  expect(planFor({ curriculum: fallback }).cards[0].activity).toBe('Long');
});

test('with no ready warm-up skill, the warm-up reviews a known step', () => {
  const knownByChild = allKnow(keysIn('finger_flash', 'count_aloud', 'skip_count'));
  expect(planFor({ knownByChild, history: [lesson('2026-11-03', [taught('finger_flash.10')]), lesson('2026-11-02', [taught('count_aloud.100')])] }).cards[0].step_key).toBe('skip_count.10s');
  expect(planFor({ knownByChild }).cards[0].step_key).toBe('finger_flash.10');
  const curriculum = { ...fixture, skills: fixture.skills.filter((s) => s.slot === 'activity') };
  expect(steps(planFor({ curriculum }))).toEqual([['activity', 'count.5'], ['activity', 'read_numbers.5']]);
});

test('a review warm-up is a step enough children are ready for', () => {
  // Codex review, 2026-11-01: every warm-up skill is group-known, but only c2 knows both
  // skip_count.5s and count_aloud.100, so skip_count.10s is not ready (1 of 3).
  const knownByChild = new Map([
    ['c1', known(...keysIn('finger_flash', 'count_aloud'))],
    ['c2', known(...keysIn('finger_flash', 'count_aloud', 'skip_count'))],
    ['c3', known(...keysIn('finger_flash', 'skip_count'))],
  ]);
  const history = [lesson('2026-11-03', [taught('finger_flash.10')]), lesson('2026-11-02', [taught('count_aloud.100')])];
  const warm = planFor({ knownByChild, history }).cards[0];
  expect(warm).toMatchObject({ slot: 'warm_up', step_key: 'skip_count.2s', readyCount: 2, presentCount: 3, needHelp: ['c3'] });
});

test('a group that knows every ready activity step gets no activity card', () => {
  const knownByChild = allKnow(fixture.skills.flatMap((s) => s.steps.map((st) => st.key)));
  const plan = planFor({ knownByChild });
  expect(plan.reason).toBe('no_ready_activity');
  expect(plan.readySteps).toEqual([]);
  expect(steps(plan)).toEqual([['warm_up', 'finger_flash.10']]);
  expect(planFor({ knownByChild, complete: { history: false, ticks: true, evidence: true } }).reason).toBe('incomplete_inputs');
});

test('a split group stays on the step half of them still need', () => {
  const plan = planFor({ presentChildIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], knownByChild: allKnow(['count.5']) });
  expect(plan.cards.find((c) => c.step_key === 'count.5')).toMatchObject({ readyCount: 6, needHelp: [], canHelp: ['c1', 'c2', 'c3'] });
  ['count.10', 'compare.5', 'add.5'].forEach((key) => expect(plan.cards.map((c) => c.step_key)).not.toContain(key));
});

test('extra help lists children still on the step below; can-help lists children who know the step', () => {
  const presentChildIds = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
  const knownByChild = new Map(presentChildIds.slice(0, 5).map((id, i) => [id, known('count.5', ...(i < 2 ? ['count.10'] : []))]));
  const plan = planFor({ presentChildIds, knownByChild });
  expect(plan.cards.find((c) => c.step_key === 'count.10')).toMatchObject({ readyCount: 5, presentCount: 6, needHelp: ['c6'], canHelp: ['c1', 'c2'] });
  const duplicate = planFor({ presentChildIds: [...presentChildIds, 'c1'], knownByChild });
  expect(duplicate).toEqual(plan);
});

test('need extra help lists exactly the children who are not ready', () => {
  const presentChildIds = ['c10', 'c9', 'c8', 'c7', 'c6', 'c5', 'c4', 'c3', 'c2', 'c1'];
  const prerequisites = ['add.5', 'count.5', 'finger_flash.5'];
  const knownByChild = new Map(presentChildIds.map((id) => [id, known(
    ...prerequisites.filter((key) => !(id === 'c9' && key === 'finger_flash.5')
      && !(id === 'c8' && key === 'add.5')),
  )]));
  const plan = planFor({ presentChildIds, knownByChild, activityCardCount: 7 });
  const card = plan.cards.find((c) => c.step_key === 'number_pairs.5');
  expect(fixture.skills.flatMap((s) => s.steps).find((s) => s.key === card.step_key).comes_after)
    .toEqual(prerequisites);
  expect(card).toMatchObject({ readyCount: 8, presentCount: 10, needHelp: ['c9', 'c8'], canHelp: [] });
  plan.cards.forEach((c) => expect(c.readyCount + c.needHelp.length).toBe(c.presentCount));
});

test('groups smaller than 3 need everyone', () => {
  const plan = planFor({ presentChildIds: ['c1', 'c2'], knownByChild: new Map([['c1', known('count.5')]]) });
  expect(plan.cards.find((c) => c.step_key === 'count.5')).toMatchObject({ canHelp: ['c1'] });
});

test('the activity-card count is an input', () => {
  expect(steps(planFor({ activityCardCount: 1 }))).toEqual([['warm_up', 'finger_flash.5'], ['activity', 'count.5']]);
  expect(activitySteps(planFor({ activityCardCount: 3 }))).toEqual(['count.5', 'read_numbers.5']);
});

test('no present children', () => {
  const expected = { engine_version: 1, cards: [], reason: 'no_children', readySteps: [] };
  expect(planFor({ presentChildIds: [] })).toEqual(expected);
  expect(planFor({ presentChildIds: [], complete: {} })).toEqual(expected);
});

test('incomplete inputs still plan, and say so', () => {
  const completePlan = planFor();
  const cases = [{ ...base.complete, ticks: false }, {}, null, ...['history', 'ticks', 'evidence'].flatMap((key) => [false, undefined, 1, 'true'].map((value) => ({ ...base.complete, [key]: value })))];
  cases.forEach((complete) => {
    const plan = planFor({ complete });
    expect(plan.reason).toBe('incomplete_inputs');
    expect(plan.cards).toEqual(completePlan.cards);
  });
});

test('retired steps and renamed activities in history are harmless', () => {
  const history = [lesson('2026-11-04', [taught('add.30', 'Old game'), taught('count.5', 'Renamed')])];
  const plan = planFor({ history });
  expect(plan.cards.find((c) => c.step_key === 'count.5').activity).toBe('count.5 A');
  expect(activitySteps(plan)).toEqual(['read_numbers.5', 'count.5']);
  // The retired key still makes Add recently taught, even though no current step has that key.
  expect(activitySteps(planFor({ history, knownByChild: allKnow(['count.5', 'read_numbers.5']), activityCardCount: 5 }))).toEqual(['read_numbers.10', 'compare.5', 'before_after.5', 'count.10', 'add.5']);
  const oddHistory = [...history, null, 12, {}, { date: 42, taught: [] }, { date: '2026-11-04', taught: {} }, lesson('2026-11-04', [null, {}, { step_key: 42 }, { step_key: 'unknown.5', activity: {} }], { createdAt: null, id: {} })];
  expect(planFor({ history: oddHistory })).toEqual(plan);
});

test('two lessons on one day keep their order', () => {
  const curriculum = buildNumeracyCurriculumFixture({ activities: { 'finger_flash.5': [activity('X'), activity('Y')] } });
  const knownByChild = allKnow(keysIn('count_aloud', 'skip_count'));
  const early = lesson('2026-11-03', [taught('finger_flash.5', 'Y')], { createdAt: '2026-11-03T09:00:00.000Z', id: 'early' });
  const late = lesson('2026-11-03', [taught('finger_flash.5', 'X')], { createdAt: '2026-11-03T10:00:00.000Z', id: 'late' });
  [[late, early], [early, late]].forEach((history) => {
    const plan = planFor({ curriculum, knownByChild, history });
    expect(plan.cards[0].step_key).toBe('finger_flash.5');
    expect(plan.cards[0].activity).toBe('Y');
    // A date-only activity rank ties, retaining X first in the curriculum file.
    const dateOnly = [...curriculum.skills[0].steps[0].activities].sort((a, b) => {
      const lastDate = (name) => history.filter((h) => h.taught.some((t) => t.activity === name)).map((h) => h.date).sort().pop();
      return lastDate(a.name).localeCompare(lastDate(b.name));
    });
    expect(dateOnly[0].name).toBe('X');
    expect(dateOnly[0].name).not.toBe(plan.cards[0].activity);
  });
  // The id decides when both date and createdAt tie.
  expect(planFor({ curriculum, knownByChild, history: [early, { ...late, createdAt: early.createdAt }] }).cards[0].activity).toBe('Y');
});

test('history after the lesson date is ignored', () => {
  const plan = planFor({ history: [lesson('2026-11-10', [taught('count.5')])] });
  expect(plan.cards.find((c) => c.step_key === 'count.5').activity).toBe('count.5 A');
  expect(activitySteps(plan)).toEqual(['count.5', 'read_numbers.5']);
  expect(activitySteps(planFor({ history: [lesson(base.lessonDate, [taught('count.5')])] }))).toEqual(['read_numbers.5', 'count.5']);
});

test('same input, same plan', () => {
  expect(planFor()).toEqual(planFor());
});
