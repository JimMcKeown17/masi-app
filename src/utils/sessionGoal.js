/**
 * Pure session-goal logic for the Sessions Today ring.
 *
 * Data-driven: reads the daily target/ceiling straight off the programme row,
 * so it is correct for whatever programmes exist (no hardcoded programme codes).
 * Clock-free: the caller pre-filters `todaysSessions` to today + the active
 * programme, keeping this module a pure function of its inputs.
 */
export function getSessionGoal(programme, todaysSessions) {
  const target = programme.daily_session_target ?? null;
  const ceiling = programme.daily_session_ceiling ?? target;
  const count = todaysSessions.length;

  let state;
  if (target == null) state = 'no_target';
  else if (count < target) state = 'below';
  else if (count > ceiling) state = 'exceeded';
  else state = 'met';

  return { target, ceiling, count, state };
}
