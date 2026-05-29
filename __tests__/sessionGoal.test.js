import { getSessionGoal } from '../src/utils/sessionGoal';

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
