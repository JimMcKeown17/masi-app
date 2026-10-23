import { isPlanSuperseded } from '../src/lessonPlan/engine';

const plan = (history, mastery) => ({ history_complete: history, mastery_complete: mastery });
const input = (history, mastery) => ({ presentChildren: [
  { id: 'c1', historyComplete: true, masteryComplete: true },
  { id: 'c2', historyComplete: history, masteryComplete: mastery },
] });

test.each([
  // stored history, stored mastery, input history, input mastery, superseded
  [false, false, false, false, false],
  [false, false, true, false, true],
  [false, false, false, true, true],
  [false, false, true, true, true],
  [true, false, true, true, true],
  [true, false, true, false, false],
  [true, false, false, true, false],
  [false, true, true, false, false],
  [true, true, true, true, false],
  [true, true, false, false, false],
])('stored %p/%p, input %p/%p → %p', (storedHistory, storedMastery, history, mastery, expected) => {
  expect(isPlanSuperseded(plan(storedHistory, storedMastery), input(history, mastery))).toBe(expected);
});

test('repeated writes between two screens with different inputs stop after one step each', () => {
  // Each write must strictly raise completeness, so no pair of inputs can trade writes forever.
  const inputs = [input(true, false), input(false, true), input(true, true)];
  for (const first of inputs) {
    for (const second of inputs) {
      let stored = plan(false, false);
      let writes = 0;
      for (let turn = 0; turn < 10; turn += 1) {
        const next = turn % 2 === 0 ? first : second;
        if (isPlanSuperseded(stored, next)) {
          const [child] = next.presentChildren.slice(1);
          stored = plan(child.historyComplete, child.masteryComplete);
          writes += 1;
        }
      }
      expect(writes).toBeLessThanOrEqual(2);
    }
  }
});

test('with no one present, inputs count as complete, as the plan does', () => {
  expect(isPlanSuperseded(plan(false, false), { presentChildren: [] })).toBe(true);
  expect(isPlanSuperseded(plan(true, true), { presentChildren: [] })).toBe(false);
});
