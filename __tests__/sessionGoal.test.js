import { deriveGoalState, getSessionGoal, filterTodaysSessionsForProgramme } from '../src/utils/sessionGoal';

describe('getSessionGoal', () => {
  test('below target: Core Literacy R-3 with 0 of 3 sessions today', () => {
    const programme = { daily_session_target: 3, daily_session_ceiling: 5 };

    const result = getSessionGoal(programme, []);

    expect(result).toEqual({ target: 3, ceiling: 5, count: 0, state: 'below' });
  });

  test('met: Core Literacy R-3 reaches 3 of 3 sessions today', () => {
    const programme = { daily_session_target: 3, daily_session_ceiling: 5 };

    const result = getSessionGoal(programme, [{}, {}, {}]);

    expect(result).toEqual({ target: 3, ceiling: 5, count: 3, state: 'met' });
  });

  test('met: count between target and ceiling stays met (R-3 with 4 of 3, ceiling 5)', () => {
    const programme = { daily_session_target: 3, daily_session_ceiling: 5 };

    const result = getSessionGoal(programme, [{}, {}, {}, {}]);

    expect(result.state).toBe('met');
  });

  test('exceeded: count past ceiling (R-3 with 6, ceiling 5)', () => {
    const programme = { daily_session_target: 3, daily_session_ceiling: 5 };

    const result = getSessionGoal(programme, [{}, {}, {}, {}, {}, {}]);

    expect(result).toEqual({ target: 3, ceiling: 5, count: 6, state: 'exceeded' });
  });

  test('no_target: 1000 Stories (no target) reports count without a goal', () => {
    const programme = { daily_session_target: null, daily_session_ceiling: null };

    const result = getSessionGoal(programme, [{}, {}]);

    expect(result).toEqual({ target: null, ceiling: null, count: 2, state: 'no_target' });
  });

  test('ceiling defaults to target when unset (ECD target 5, no ceiling)', () => {
    const programme = { daily_session_target: 5 };

    const atTarget = getSessionGoal(programme, [{}, {}, {}, {}, {}]);
    expect(atTarget).toEqual({ target: 5, ceiling: 5, count: 5, state: 'met' });

    const overTarget = getSessionGoal(programme, [{}, {}, {}, {}, {}, {}]);
    expect(overTarget.state).toBe('exceeded');
  });
});

describe('deriveGoalState', () => {
  test.each([
    [{ target: null, ceiling: null, count: 2 }, 'no_target'],
    [{ target: 3, ceiling: 5, count: 0 }, 'below'],
    [{ target: 3, ceiling: 5, count: 2 }, 'below'],
    [{ target: 3, ceiling: 5, count: 3 }, 'met'],
    [{ target: 3, ceiling: 5, count: 5 }, 'met'],
    [{ target: 3, ceiling: 5, count: 6 }, 'exceeded'],
    [{ target: 3, ceiling: 3, count: 4 }, 'exceeded'],
    [{ target: 3, ceiling: null, count: 3 }, 'met'],
    [{ target: 3, ceiling: null, count: 4 }, 'exceeded'],
    [{ target: 1, ceiling: 1, count: 1 }, 'met'],
    [{ target: 3, count: 3 }, 'met'],
    [{ target: 3, count: 4 }, 'exceeded'],
  ])('%o → %s', (input, expected) => {
    expect(deriveGoalState(input)).toBe(expected);
  });

  test('getSessionGoal uses the same rule for every count', () => {
    const programmes = [
      { daily_session_target: 3, daily_session_ceiling: 5 },
      { daily_session_target: 3, daily_session_ceiling: 3 },
      { daily_session_target: 1, daily_session_ceiling: null },
      { daily_session_target: null, daily_session_ceiling: null },
    ];
    for (const programme of programmes) {
      for (let count = 0; count <= 8; count += 1) {
        const goal = getSessionGoal(programme, Array(count));
        expect(goal.state).toBe(deriveGoalState(goal));
      }
    }
  });
});

describe('filterTodaysSessionsForProgramme', () => {
  // 2026-05-29 in LOCAL time (month is 0-indexed → 4 = May). Using a fixed
  // injected `now` keeps the filter a pure function of its inputs.
  const now = new Date(2026, 4, 29);
  const PROG = 'prog-literacy';

  test('keeps only today\'s sessions for the active programme', () => {
    const sessions = [
      { id: 'a', programme_id: PROG, session_date: '2026-05-29' },        // today + active → keep
      { id: 'b', programme_id: 'prog-other', session_date: '2026-05-29' }, // today, other programme → drop
      { id: 'c', programme_id: PROG, session_date: '2026-05-28' },         // active, but yesterday → drop
    ];

    const result = filterTodaysSessionsForProgramme(sessions, PROG, now);

    expect(result.map((s) => s.id)).toEqual(['a']);
  });

  test('treats missing input as empty so the goal never crashes on a non-array', () => {
    expect(filterTodaysSessionsForProgramme(undefined, PROG, now)).toEqual([]);
    expect(filterTodaysSessionsForProgramme(null, PROG, now)).toEqual([]);
  });
});
