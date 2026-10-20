import {
  consecutiveWrong,
  initStepState,
  stepReducer,
} from '../stepByStep';
import type { StepAction, StepState, StopRule } from '../stepByStep';

const STOP_RULE: StopRule = { kind: 'consecutive_wrong', stop_at: 10 };
const TOTAL_ITEMS = 60;

function step(
  state: StepState,
  action: StepAction,
  stopRule: StopRule | null = STOP_RULE,
): StepState {
  Object.freeze(state.decisions);
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
      correctionCount: 0,
      stopped: false,
      maxConsecutiveWrong: 0,
    });
    expect(initStepState().decisions).not.toBe(initial.decisions);
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
