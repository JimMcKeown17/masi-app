export type StopRule = { kind: 'consecutive_wrong'; stop_at: number };

export type StepState = {
  cursor: number;
  decisions: Record<number, boolean>;
  correctionCount: number;
  stopped: boolean;
  maxConsecutiveWrong: number;
};

export type StepAction =
  | { type: 'decide'; correct: boolean }
  | { type: 'back' }
  | { type: 'undoStop' };

export function initStepState(): StepState {
  return {
    cursor: 0,
    decisions: {},
    correctionCount: 0,
    stopped: false,
    maxConsecutiveWrong: 0,
  };
}

export function stepReducer(
  state: StepState,
  action: StepAction,
  ctx: { totalItems: number; stopRule: StopRule | null },
): StepState {
  switch (action.type) {
    case 'decide': {
      if (state.stopped || state.cursor >= ctx.totalItems) return state;

      const decisions = { ...state.decisions, [state.cursor]: action.correct };
      const cursor = state.cursor + 1;
      const run = consecutiveWrong(decisions, cursor);
      return {
        ...state,
        cursor,
        decisions,
        stopped: ctx.stopRule !== null && run >= ctx.stopRule.stop_at,
        maxConsecutiveWrong: longestConsecutiveWrong(decisions, cursor),
      };
    }
    case 'back':
      if (state.stopped || state.cursor === 0) return state;
      break;
    case 'undoStop':
      if (!state.stopped) return state;
      break;
  }

  const cursor = state.cursor - 1;
  const decisions = { ...state.decisions };
  delete decisions[cursor];
  return {
    ...state,
    cursor,
    decisions,
    correctionCount: state.correctionCount + 1,
    stopped: false,
    maxConsecutiveWrong: longestConsecutiveWrong(decisions, cursor),
  };
}

/** Recompute from kept decisions so corrected marks do not affect the result. */
function longestConsecutiveWrong(
  decisions: Record<number, boolean>,
  cursor: number,
): number {
  let longest = 0;
  let run = 0;
  for (let index = 0; index < cursor; index += 1) {
    run = decisions[index] === false ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

/** The cursor is the next undecided item; only explicit false decisions count. */
export function consecutiveWrong(
  decisions: Record<number, boolean>,
  cursor: number,
): number {
  let count = 0;
  for (let index = cursor - 1; index >= 0; index -= 1) {
    if (decisions[index] !== false) break;
    count += 1;
  }
  return count;
}
