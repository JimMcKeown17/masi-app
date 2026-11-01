import { getCurriculum, listStepKeys } from '../content/numeracy-curriculum';
import { egmaCatalog } from '../content/egma';
import { EVIDENCE_MAP } from '../src/numeracy/evidence';
import { planNumeracyLesson } from '../src/numeracy/planLesson';
import { buildNumeracyCurriculumFixture } from '../test-support/numeracyCurriculumFixture';

const real = getCurriculum();
const egmaItems = egmaCatalog.assessments.flatMap((f) => f.questions.flatMap((q) => q.items));

test('every evidence step is a step in the bundled edition', () => {
  const keys = listStepKeys(real);
  expect(Object.keys(EVIDENCE_MAP).filter((k) => !keys.includes(k))).toEqual([]);
  expect(keys.filter((k) => !(k in EVIDENCE_MAP))).toEqual(['before_after.50', 'before_after.100', 'add.15', 'subtract.15', 'skip_count.2s', 'skip_count.5s', 'skip_count.10s']);
});
test('every mapped tag appears in the EGMA pack', () => {
  const missing = Object.entries(EVIDENCE_MAP).filter(([, t]) => !egmaItems.some((i) => i.skill === t.skill && i.band === t.band));
  expect(missing).toEqual([]);
});
test('the test fixture has the bundled edition\'s steps and order', () => {
  const shape = (c) => c.skills.flatMap((s) => s.steps.map((st) => [st.key, s.slot, [...st.comes_after].sort()]));
  expect(shape(buildNumeracyCurriculumFixture())).toEqual(shape(real));
});
test('a first lesson on the bundled edition', () => {
  const plan = planNumeracyLesson({ curriculum: real, presentChildIds: ['c1', 'c2', 'c3'], knownByChild: new Map(), history: [], activityCardCount: 2, lessonDate: '2026-12-01', complete: { history: true, ticks: true, evidence: true } });
  expect(plan.readySteps).toEqual(['finger_flash.5', 'count.5', 'read_numbers.5', 'count_aloud.10']);
  expect(plan.cards.map((c) => c.step_key)).toEqual(['finger_flash.5', 'count.5', 'read_numbers.5']);
  const warm = real.skills[0].steps[0].activities.find((a) => a.name === plan.cards[0].activity);
  expect(warm.minutes).toBeLessThanOrEqual(5);
});
