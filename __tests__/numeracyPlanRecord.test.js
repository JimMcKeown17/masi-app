import { storeNumeracyPlan, isNumeracyPlanSuperseded, savedNumeracyPlan } from '../src/numeracy/planRecord';
import { planNumeracyLesson } from '../src/numeracy/planLesson';
import { buildNumeracyCurriculumFixture } from '../test-support/numeracyCurriculumFixture';

const curriculum = buildNumeracyCurriculumFixture();
const complete = { history: true, ticks: false, evidence: true };
const lessonDate = '2026-11-05';
const presentChildIds = ['c2', 'c1', 'c3', 'c2'];
const plan = planNumeracyLesson({ curriculum, presentChildIds, knownByChild: new Map(), history: [], activityCardCount: 2, lessonDate, complete });
const store = (changes = {}) => storeNumeracyPlan({ plan, curriculumEdition: curriculum.edition, lessonDate, presentChildIds, complete, ...changes });

test('a stored plan carries made_on, present ids, edition and completeness', () => {
  expect(store()).toEqual({ ...plan, curriculum_edition: '2026.1-draft', made_on: lessonDate, present_child_ids: ['c2', 'c1', 'c3'], complete });
  expect(store({ complete: { history: 1, ticks: 'true', evidence: true } }).complete).toEqual({ history: false, ticks: false, evidence: true });
  expect(store({ complete: undefined }).complete).toEqual({ history: false, ticks: false, evidence: false });
});

test('supersession needs as complete on all three and more on one', () => {
  expect(isNumeracyPlanSuperseded(store(), { history: true, ticks: true, evidence: true })).toBe(true);
  expect(isNumeracyPlanSuperseded(store(), { history: true, ticks: true, evidence: false })).toBe(false);
  expect(isNumeracyPlanSuperseded(store(), complete)).toBe(false);
  const flags = ['history', 'ticks', 'evidence'];
  for (let s = 0; s < 8; s += 1) {
    for (let n = 0; n < 8; n += 1) {
      const states = (bits) => Object.fromEntries(flags.map((key, i) => [key, Boolean(bits & (1 << i))]));
      expect(isNumeracyPlanSuperseded({ complete: states(s) }, states(n))).toBe((n & s) === s && n !== s);
    }
  }
  expect(isNumeracyPlanSuperseded(undefined, { ticks: true })).toBe(true);
  expect(isNumeracyPlanSuperseded({}, { ticks: 'true' })).toBe(false);
  expect(isNumeracyPlanSuperseded(store(), undefined)).toBe(false);
});

test('a back-dated save drops the plan with past_date', () => {
  expect(savedNumeracyPlan({ stored: store(), lessonDate: '2026-11-04' })).toEqual({ plan: null, plan_reason: 'past_date' });
  expect(savedNumeracyPlan({ stored: store(), lessonDate: '2026-11-06' })).toEqual({ plan: null, plan_reason: 'past_date' });
});

test('a same-day save keeps the suggestion and reasons', () => {
  expect(savedNumeracyPlan({ stored: store(), lessonDate })).toEqual({
    plan: {
      engine_version: 1,
      suggested: [
        { slot: 'warm_up', step_key: 'finger_flash.5', activity: 'finger_flash.5 A' },
        { slot: 'activity', step_key: 'count.5', activity: 'count.5 A' },
        { slot: 'activity', step_key: 'read_numbers.5', activity: 'read_numbers.5 A' },
      ],
      reasons: {
        reason: 'incomplete_inputs', made_on: lessonDate, complete,
        cards: [
          { slot: 'warm_up', step_key: 'finger_flash.5', ready_count: 3, present_count: 3 },
          { slot: 'activity', step_key: 'count.5', ready_count: 3, present_count: 3 },
          { slot: 'activity', step_key: 'read_numbers.5', ready_count: 3, present_count: 3 },
        ],
      },
    }, plan_reason: null,
  });
});
