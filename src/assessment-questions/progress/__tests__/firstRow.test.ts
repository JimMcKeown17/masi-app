import { initStepState, stepReducer } from '../stepByStep';
import { validateResult } from '../../contractTest/validateResult';

test.each([5, 6, 8, 10])('first row of width %i stops exactly once and supports undo and Back', width => {
  const ctx = { totalItems: width * 3, stopRule: { kind: 'first_row_all_wrong' as const, first_row_length: width } };
  let state = initStepState();
  for (let i = 0; i < width; i++) {
    expect(state.stopped).toBe(false);
    state = stepReducer(state, { type: 'decide', correct: false }, ctx);
  }
  expect(state).toMatchObject({ cursor: width, stopped: true });
  expect(stepReducer(state, { type: 'back' }, ctx)).toBe(state);
  state = stepReducer(state, { type: 'undoStop' }, ctx);
  expect(state).toMatchObject({ cursor: width - 1, stopped: false, correctionCount: 1 });
  state = stepReducer(state, { type: 'back' }, ctx);
  expect(state.cursor).toBe(width - 2);
  state = stepReducer(state, { type: 'decide', correct: true }, ctx);
  while (state.cursor < ctx.totalItems) state = stepReducer(state, { type: 'decide', correct: false }, ctx);
  expect(state.stopped).toBe(false);
});

test('validator requires precisely the reached wrong first row', () => {
  const stopRule = { kind: 'first_row_all_wrong' as const, first_row_length: 5 };
  const result = {
    question_code: 'letter_sounds', question_version: 'test', item_set_id: 'test.en', language: 'en',
    duration_ms: 1, stopped_reason: 'stop_rule',
    items: Array.from({ length: 10 }, (_, position) => ({ position, prompt: 'a', is_correct: false, metadata: { reached: position < 5 } })),
    derived: { total_correct: 0, total_attempted: 5, percent: 0, last_attempted_position: 4 },
  };
  expect(validateResult(result, { stopRule }).valid).toBe(true);
  expect(validateResult({ ...result, derived: { ...result.derived, last_attempted_position: 5 } }, { stopRule }).valid).toBe(false);
  for (const change of [{ is_correct: true }, { metadata: { reached: false } }, { position: 8 }]) {
    expect(validateResult({ ...result, items: result.items.map((item, i) => i === 2 ? { ...item, ...change } : item) }, { stopRule }).valid).toBe(false);
  }
});
