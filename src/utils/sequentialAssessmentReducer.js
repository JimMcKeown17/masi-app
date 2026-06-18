// Pure cursor/decision state for the sequential capture UI.
// letterStates: { [index]: true|false } — true=correct, false=incorrect.
// cursor: index of the current (undecided) item. finalLastIndex = cursor - 1.
export function initSequentialState() {
  return { cursor: 0, letterStates: {}, correctionCount: 0 };
}

export function sequentialReducer(state, action) {
  switch (action.type) {
    case 'decide':
      // Reducer-level clamp: even if two rapid taps dispatch with a stale cursor, the second
      // application sees cursor === totalLetters and is a no-op — closes the final-item over-count
      // race authoritatively (the component-level guard alone is insufficient under React batching).
      if (action.totalLetters != null && state.cursor >= action.totalLetters) return state;
      return {
        ...state,
        cursor: state.cursor + 1,
        letterStates: { ...state.letterStates, [state.cursor]: action.correct === true },
      };
    case 'back': {
      if (state.cursor === 0) return state;
      const prev = state.cursor - 1;
      const nextStates = { ...state.letterStates };
      delete nextStates[prev];
      return { ...state, cursor: prev, letterStates: nextStates, correctionCount: state.correctionCount + 1 };
    }
    default:
      return state;
  }
}
