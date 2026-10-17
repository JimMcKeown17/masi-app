import { evaluateBatteryState } from '../evaluateBatteryState';
import type { BatteryConfig } from '../../types/BatteryConfig';

const q = (code: string) => ({ question_code: code, question_version: '1', materials: null });
const LINEAR: BatteryConfig = { battery_code: 'b', battery_version: '1', languages: ['en'], questions: [q('q1'), q('q2'), q('q3')], prerequisites: {} };
const GATED: BatteryConfig = { ...LINEAR, prerequisites: { q3: { depends_on: 'q1', minScore: 10, on_unmet_reason: 'skipped_prerequisite_unmet' } } };

test('fresh run: next is the first question; not eligible', () => {
  const s = evaluateBatteryState(LINEAR, []);
  expect(s.nextQuestion?.question_code).toBe('q1');
  expect(s.undecided).toEqual(['q1', 'q2', 'q3']);
  expect(s.eligibleToFinalize).toBe(false);
});
test('skips count as decided', () => {
  const s = evaluateBatteryState(LINEAR, [{ question_code: 'q1', stopped_reason: 'skipped_tired', score: null }]);
  expect(s.decided).toEqual(['q1']);
  expect(s.nextQuestion?.question_code).toBe('q2');
});
test('all decided: eligible, no next', () => {
  const all = ['q1', 'q2', 'q3'].map((c) => ({ question_code: c, stopped_reason: 'completed', score: 5 }));
  const s = evaluateBatteryState(LINEAR, all);
  expect(s.nextQuestion).toBeNull();
  expect(s.eligibleToFinalize).toBe(true);
});
test('decided results not in the battery are ignored', () => {
  const s = evaluateBatteryState(LINEAR, [{ question_code: 'zz', stopped_reason: 'completed', score: 1 }]);
  expect(s.decided).toEqual([]);
});
test('gate: unmet prerequisite produces an autoSkip and next skips past it', () => {
  const s = evaluateBatteryState(GATED, [
    { question_code: 'q1', stopped_reason: 'completed', score: 4 },
    { question_code: 'q2', stopped_reason: 'completed', score: 3 },
  ]);
  expect(s.autoSkips).toEqual([{ question_code: 'q3', reason: 'skipped_prerequisite_unmet' }]);
  expect(s.nextQuestion).toBeNull();
  expect(s.eligibleToFinalize).toBe(false); // the host must persist the auto-skip first
});
test('gate: a skipped prerequisite (null score) is unmet', () => {
  const s = evaluateBatteryState(GATED, [{ question_code: 'q1', stopped_reason: 'skipped_child_refused', score: null }]);
  expect(s.autoSkips.map((a) => a.question_code)).toEqual(['q3']);
});
test('gate: met prerequisite → no autoSkip', () => {
  const s = evaluateBatteryState(GATED, [{ question_code: 'q1', stopped_reason: 'completed', score: 10 }]);
  expect(s.autoSkips).toEqual([]);
});
test('gate: undecided prerequisite → gated question stays undecided, no autoSkip', () => {
  const s = evaluateBatteryState(GATED, []);
  expect(s.autoSkips).toEqual([]);
  expect(s.undecided).toContain('q3');
});
