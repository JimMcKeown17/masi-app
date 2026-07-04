import { initSequentialState, sequentialReducer } from '../src/utils/sequentialAssessmentReducer';

describe('sequentialReducer', () => {
  test('initial state', () => {
    expect(initSequentialState()).toEqual({ cursor: 0, letterStates: {}, correctionCount: 0 });
  });

  test('decide advances cursor and records correctness at the OLD cursor', () => {
    const s1 = sequentialReducer(initSequentialState(), { type: 'decide', correct: true });
    expect(s1).toEqual({ cursor: 1, letterStates: { 0: true }, correctionCount: 0 });
    const s2 = sequentialReducer(s1, { type: 'decide', correct: false });
    expect(s2).toEqual({ cursor: 2, letterStates: { 0: true, 1: false }, correctionCount: 0 });
  });

  test('decide clamps at totalLetters — a second queued decide at the boundary is a no-op', () => {
    let s = { cursor: 2, letterStates: { 0: true, 1: true }, correctionCount: 0 };
    s = sequentialReducer(s, { type: 'decide', correct: true, totalLetters: 3 }); // cursor 2 -> 3
    expect(s.cursor).toBe(3);
    const s2 = sequentialReducer(s, { type: 'decide', correct: true, totalLetters: 3 }); // clamped
    expect(s2).toBe(s); // unchanged reference: no letterStates[3], no cursor 4
  });

  test('back decrements cursor, deletes the decision, and counts a correction', () => {
    let s = sequentialReducer(initSequentialState(), { type: 'decide', correct: true });
    s = sequentialReducer(s, { type: 'decide', correct: true }); // cursor 2
    s = sequentialReducer(s, { type: 'back' });
    expect(s).toEqual({ cursor: 1, letterStates: { 0: true }, correctionCount: 1 });
  });

  test('back at cursor 0 is a no-op (no negative cursor, no phantom correction)', () => {
    const s0 = initSequentialState();
    expect(sequentialReducer(s0, { type: 'back' })).toBe(s0);
  });

  test('unknown action returns the same state', () => {
    const s0 = initSequentialState();
    expect(sequentialReducer(s0, { type: 'noop' })).toBe(s0);
  });
});
