import {
  consecutiveWrong,
  initStepState,
  stepReducer,
} from '../stepByStep';
import type { StepAction, StepState, StopRule } from '../stepByStep';

const STOP_RULE: StopRule = { kind: 'consecutive_wrong', stop_at: 10 };
const TOTAL_ITEMS = 60;

const ctx = { totalItems: 5, stopRule: { kind: 'consecutive_wrong', stop_at: 3 } as const };
const run = (...actions: StepAction[]) => actions.reduce((s, a) => stepReducer(s, a, ctx), initStepState());
const D = (correct: boolean, choice?: string) => ({ type: 'decide', correct, choice } as const);
const S = (position: number, correct: boolean, choice?: string) => ({ type: 'set', position, correct, choice } as const);

test('flip inverts a marked item below the cursor and counts one correction', () => {
  const s = run(D(true), D(false), { type: 'flip', position: 0 });
  expect(s).toMatchObject({ cursor: 2, decisions: { 0: false, 1: false }, correctionCount: 1, stopped: false, maxConsecutiveWrong: 2 });
});
test.each([[-1], [2], [7], [1.5]])('flip at %p is ignored', (position) => {
  const before = run(D(true), D(true));
  expect(stepReducer(before, { type: 'flip', position }, ctx)).toBe(before);
});
test('flip is ignored while stopped', () => {
  const stopped = run(D(false), D(false), D(false));
  expect(stopped.stopped).toBe(true);
  expect(stepReducer(stopped, { type: 'flip', position: 0 }, ctx)).toBe(stopped);
});
test('a flip never stops; the next decide re-checks the run from the marks', () => {
  const flipped = run(D(false), D(false), D(true), { type: 'flip', position: 2 });
  expect(flipped).toMatchObject({ cursor: 3, decisions: { 0: false, 1: false, 2: false }, maxConsecutiveWrong: 3 });
  expect(flipped.stopped).toBe(false);
  expect(stepReducer(flipped, D(false), ctx).stopped).toBe(true);
});
test('a flip that leaves the first row all wrong does not stop retroactively', () => {
  const firstRow = { totalItems: 6, stopRule: { kind: 'first_row_all_wrong', first_row_length: 3 } as const };
  let s = [D(false), D(false), D(true), D(true)].reduce((x, a) => stepReducer(x, a, firstRow), initStepState());
  s = stepReducer(s, { type: 'flip', position: 2 }, firstRow);
  expect(s).toMatchObject({ cursor: 4, decisions: { 0: false, 1: false, 2: false, 3: true } });
  expect(s.stopped).toBe(false);
  expect(stepReducer(s, D(false), firstRow).stopped).toBe(false);
});

test('flipping incorrect to correct recomputes the longest run without mutating prior marks', () => {
  const before = run(D(false), D(false));
  Object.freeze(before.decisions);
  Object.freeze(before);
  expect(stepReducer(before, { type: 'flip', position: 0 }, ctx)).toMatchObject({
    cursor: 2, decisions: { 0: true, 1: false }, correctionCount: 1, stopped: false, maxConsecutiveWrong: 1,
  });
  expect(before.decisions).toEqual({ 0: false, 1: false });
});

function step(
  state: StepState,
  action: StepAction,
  stopRule: StopRule | null = STOP_RULE,
): StepState {
  Object.freeze(state.decisions);
  Object.freeze(state.choices);
  Object.freeze(state);
  return stepReducer(state, action, { totalItems: TOTAL_ITEMS, stopRule });
}

function decideMany(
  state: StepState,
  correct: boolean,
  count: number,
  stopRule: StopRule | null = STOP_RULE,
): StepState {
  for (let i = 0; i < count; i += 1) {
    state = step(state, { type: 'decide', correct }, stopRule);
  }
  return state;
}

describe('step-by-step marking', () => {
  test('stops at exactly 10', () => {
    const initial = initStepState();
    expect(initial).toEqual({
      cursor: 0,
      decisions: {},
      choices: {},
      correctionCount: 0,
      stopped: false,
      maxConsecutiveWrong: 0,
    });
    expect(initStepState().decisions).not.toBe(initial.decisions);
    expect(initStepState().choices).not.toBe(initial.choices);
    expect(consecutiveWrong(initial.decisions, initial.cursor)).toBe(0);

    const ninth = decideMany(initial, false, 9);
    expect(ninth.cursor).toBe(9);
    expect(ninth.stopped).toBe(false);
    expect(ninth.maxConsecutiveWrong).toBe(9);
    expect(consecutiveWrong(ninth.decisions, ninth.cursor)).toBe(9);

    const tenth = step(ninth, { type: 'decide', correct: false });
    expect(tenth.cursor).toBe(10);
    expect(tenth.stopped).toBe(true);
    expect(tenth.maxConsecutiveWrong).toBe(10);
    expect(consecutiveWrong(tenth.decisions, tenth.cursor)).toBe(10);
    expect(ninth.decisions).not.toHaveProperty('9');
    expect(initial.decisions).toEqual({});
  });

  test('a correct answer resets the run', () => {
    const firstRun = decideMany(initStepState(), false, 9);
    const correct = step(firstRun, { type: 'decide', correct: true });
    expect(consecutiveWrong(correct.decisions, correct.cursor)).toBe(0);
    expect(correct.maxConsecutiveWrong).toBe(9);

    const secondRun = decideMany(correct, false, 9);
    expect(secondRun.cursor).toBe(19);
    expect(secondRun.stopped).toBe(false);
    expect(secondRun.maxConsecutiveWrong).toBe(9);
    expect(consecutiveWrong(secondRun.decisions, secondRun.cursor)).toBe(9);
  });

  test('the run crosses rows', () => {
    const firstEight = decideMany(initStepState(), true, 8);
    // Items 8–17 cross the boundary between two 12-item rows.
    const stopped = decideMany(firstEight, false, 10);
    expect(stopped.cursor).toBe(18);
    expect(stopped.stopped).toBe(true);
    expect(stopped.maxConsecutiveWrong).toBe(10);
    expect(consecutiveWrong(stopped.decisions, stopped.cursor)).toBe(10);
    for (let position = 8; position <= 17; position += 1) {
      expect(stopped.decisions[position]).toBe(false);
    }
  });

  test('decisions are ignored while stopped', () => {
    const stopped = decideMany(initStepState(), false, 10);
    expect(step(stopped, { type: 'decide', correct: false })).toBe(stopped);
    expect(step(stopped, { type: 'decide', correct: true })).toBe(stopped);
    expect(step(stopped, { type: 'back' })).toBe(stopped);
  });

  test('undoStop clears the tenth mark', () => {
    const initial = initStepState();
    expect(step(initial, { type: 'undoStop' })).toBe(initial);

    const stopped = decideMany(initial, false, 10);
    const undone = step(stopped, { type: 'undoStop' });
    expect(undone.cursor).toBe(9);
    expect(undone.decisions[9]).toBeUndefined();
    expect(undone.decisions).not.toHaveProperty('9');
    expect(undone.stopped).toBe(false);
    expect(undone.correctionCount).toBe(stopped.correctionCount + 1);
    expect(undone.maxConsecutiveWrong).toBe(9);
    expect(consecutiveWrong(undone.decisions, undone.cursor)).toBe(9);
    expect(consecutiveWrong(undone.decisions, 10)).toBe(0);
    expect(stopped.decisions[9]).toBe(false);
    expect(step(undone, { type: 'undoStop' })).toBe(undone);

    const corrected = step(undone, { type: 'decide', correct: true });
    expect(corrected.stopped).toBe(false);
    expect(corrected.maxConsecutiveWrong).toBe(9);
    expect(corrected.decisions[9]).toBe(true);
    const stoppedAgain = step(undone, { type: 'decide', correct: false });
    expect(stoppedAgain.stopped).toBe(true);
    expect(stoppedAgain.maxConsecutiveWrong).toBe(10);
  });

  test('undoStop reduces the longest kept wrong run from 10 to 9', () => {
    const stopped = decideMany(initStepState(), false, 10);
    expect(stopped.stopped).toBe(true);
    expect(stopped.maxConsecutiveWrong).toBe(10);

    const undone = step(stopped, { type: 'undoStop' });
    expect(undone.stopped).toBe(false);
    expect(undone.cursor).toBe(9);
    expect(undone.maxConsecutiveWrong).toBe(9);
  });

  test('back clears the previous decision', () => {
    const initial = initStepState();
    expect(step(initial, { type: 'back' })).toBe(initial);

    const marked = decideMany(initial, false, 3);
    const backed = step(marked, { type: 'back' });
    expect(backed.cursor).toBe(marked.cursor - 1);
    expect(backed.decisions[2]).toBeUndefined();
    expect(backed.decisions).not.toHaveProperty('2');
    expect(backed.decisions).toEqual({ 0: false, 1: false });
    expect(backed.correctionCount).toBe(marked.correctionCount + 1);
    expect(backed.stopped).toBe(false);
    expect(backed.maxConsecutiveWrong).toBe(2);
    expect(marked.decisions).toEqual({ 0: false, 1: false, 2: false });

    const backedAgain = step(backed, { type: 'back' });
    expect(backedAgain.correctionCount).toBe(2);
    expect(backedAgain.maxConsecutiveWrong).toBe(1);
    const corrected = step(backedAgain, { type: 'decide', correct: true });
    expect(corrected.decisions).toEqual({ 0: false, 1: true });
    expect(corrected.maxConsecutiveWrong).toBe(1);
  });

  test('back reduces the longest kept wrong run from 5 to 4', () => {
    const marked = decideMany(initStepState(), false, 5);
    expect(marked.maxConsecutiveWrong).toBe(5);

    const backed = step(marked, { type: 'back' });
    expect(backed.cursor).toBe(4);
    expect(backed.maxConsecutiveWrong).toBe(4);
  });

  test('no stop rule', () => {
    const state = decideMany(initStepState(), false, 20, null);
    expect(state.cursor).toBe(20);
    expect(state.stopped).toBe(false);
    expect(state.maxConsecutiveWrong).toBe(20);
    expect(consecutiveWrong(state.decisions, state.cursor)).toBe(20);
  });

  test('cursor never passes totalItems', () => {
    const complete = decideMany(initStepState(), true, TOTAL_ITEMS);
    expect(complete.cursor).toBe(TOTAL_ITEMS);
    expect(complete.stopped).toBe(false);
    expect(Object.keys(complete.decisions)).toHaveLength(TOTAL_ITEMS);
    expect(complete.decisions[TOTAL_ITEMS - 1]).toBe(true);
    expect(complete.decisions).not.toHaveProperty(String(TOTAL_ITEMS));
    expect(step(complete, { type: 'decide', correct: false })).toBe(complete);
    expect(step(complete, { type: 'decide', correct: true })).toBe(complete);
  });
});


describe('per-item choices', () => {
  test('decide with a choice records it', () => {
    expect(run(D(true, 'count_on')).choices).toEqual({ 0: 'count_on' });
  });

  test('a wrong decide records no choice', () => {
    expect(run(D(false, 'known')).choices).toEqual({});
  });

  test('set changes a reached item and its choice', () => {
    const before = run(D(false));
    const after = step(before, S(0, true, 'known'));
    expect(after).toMatchObject({ cursor: 1, decisions: { 0: true }, choices: { 0: 'known' },
      correctionCount: 1, maxConsecutiveWrong: 0, stopped: false });
    expect(before.decisions).toEqual({ 0: false });
    expect(before.choices).toEqual({});
  });

  test('set to wrong clears the choice', () => {
    const before = run(D(true, 'count_on'), D(true, 'known'));
    const after = step(before, S(0, false, 'count_all'));
    expect(after).toMatchObject({ cursor: 2, decisions: { 0: false, 1: true }, choices: { 1: 'known' },
      correctionCount: 1, maxConsecutiveWrong: 1 });
    expect(after.choices).not.toHaveProperty('0');
    expect(before.choices).toEqual({ 0: 'count_on', 1: 'known' });
  });

  test('set changes only the strategy on an already correct item', () => {
    const before = run(D(true, 'count_all'));
    const after = step(before, S(0, true, 'known'));
    expect(after).toMatchObject({ cursor: 1, decisions: { 0: true }, choices: { 0: 'known' }, correctionCount: 1 });
    expect(before.choices).toEqual({ 0: 'count_all' });
  });

  test('set without a choice clears a previous choice', () => {
    const after = step(run(D(true, 'known')), S(0, true));
    expect(after.choices).toEqual({});
    expect(after.correctionCount).toBe(1);
  });

  test.each([D(true, 'known'), D(false)])('set with no change is a no-op (%p)', decision => {
    const before = run(decision);
    expect(step(before, S(0, decision.correct, decision.choice))).toBe(before);
  });

  test('set ignores a choice supplied with an unchanged wrong mark', () => {
    const before = run(D(false));
    expect(step(before, S(0, false, 'known'))).toBe(before);
  });

  test('set never stops', () => {
    const oneWrong = { kind: 'consecutive_wrong', stop_at: 1 } as const;
    const marked = step(initStepState(), D(true, 'known'), oneWrong);
    const corrected = step(marked, S(0, false), oneWrong);
    expect(corrected).toMatchObject({ cursor: 1, decisions: { 0: false }, choices: {},
      correctionCount: 1, stopped: false, maxConsecutiveWrong: 1 });
    expect(step(corrected, D(false), oneWrong).stopped).toBe(true);
  });

  test('set recomputes the longest wrong run across reached items', () => {
    const before = run(D(false), D(true, 'known'), D(false));
    const joined = step(before, S(1, false));
    expect(joined.maxConsecutiveWrong).toBe(3);
    expect(joined.stopped).toBe(false);
    const split = step(joined, S(1, true, 'count_on'));
    expect(split.maxConsecutiveWrong).toBe(1);
    expect(split.correctionCount).toBe(2);
  });

  test.each([-1, 2, 1.5])('set outside [0,cursor) is ignored (%p)', position => {
    const before = run(D(true, 'known'), D(true, 'count_on'));
    expect(step(before, S(position, false))).toBe(before);
  });

  test('set while stopped is ignored', () => {
    const stopped = run(D(false), D(false), D(false));
    expect(stopped.stopped).toBe(true);
    expect(step(stopped, S(0, true, 'known'))).toBe(stopped);
  });

  test('back clears the choice', () => {
    const before = run(D(true, 'count_all'), D(true, 'count_on'));
    const backed = step(before, { type: 'back' });
    expect(backed).toMatchObject({ cursor: 1, decisions: { 0: true }, choices: { 0: 'count_all' }, correctionCount: 1 });
    expect(backed.choices).not.toHaveProperty('1');
    const remarked = step(backed, D(true, 'known'));
    expect(remarked.choices).toEqual({ 0: 'count_all', 1: 'known' });
    expect(before.choices).toEqual({ 0: 'count_all', 1: 'count_on' });
  });

  test('undoStop clears the choice of the undone item', () => {
    // A normal wrong-answer stop has no choice on the last item. Seed one to
    // prove the undo transition itself deletes it rather than carrying stale data.
    const stopped = { ...run(D(true, 'count_all'), D(true, 'known')), stopped: true };
    const undone = step(stopped, { type: 'undoStop' });
    expect(undone).toMatchObject({ cursor: 1, decisions: { 0: true }, choices: { 0: 'count_all' },
      correctionCount: 1, stopped: false });
    expect(undone.choices).not.toHaveProperty('1');
    expect(stopped.choices).toEqual({ 0: 'count_all', 1: 'known' });
    const normalStop = run(D(true, 'known'), D(false), D(false), D(false));
    expect(step(normalStop, { type: 'undoStop' }).choices).toEqual({ 0: 'known' });
  });

  test('flip clears the choice at that position', () => {
    const before = run(D(true, 'known'), D(true, 'count_on'));
    const flipped = step(before, { type: 'flip', position: 0 });
    expect(flipped.choices).toEqual({ 1: 'count_on' });
    expect(flipped.choices).not.toHaveProperty('0');
    expect(step(flipped, { type: 'flip', position: 0 }).choices).toEqual({ 1: 'count_on' });
    expect(before.choices).toEqual({ 0: 'known', 1: 'count_on' });
  });
});
