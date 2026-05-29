import { resolveDatabase } from '../db/repositories/repositoryRuntime';
import { getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { programmesRepository } from '../db/repositories/referenceDataRepository';
import { sessionsRepository } from '../db/repositories/sessionsRepository';
import { getSessionGoal, filterTodaysSessionsForProgramme } from '../utils/sessionGoal';

/**
 * Resolve the EA's Sessions Today goal for their active programme.
 *
 * This is the wiring layer for the Sessions Today ring: it resolves the active
 * programme, loads its sessions, narrows them to today, and runs the pure
 * `getSessionGoal`. The screen calls this on focus and hands the result
 * straight to <SessionsTodayRing goal={...} />.
 *
 * Returns `null` when there is no active programme to measure against (e.g. an
 * EA with no open programme assignment) — the caller hides the ring.
 *
 * `now` is injectable so this stays deterministic in tests.
 */
export async function getSessionsTodayGoal({ userId, now = new Date() } = {}) {
  if (!userId) return null;

  const db = await resolveDatabase();
  const programmeId = await getActiveProgrammeId(db, userId);
  if (!programmeId) return null;

  const programmes = await programmesRepository.getAll();
  const programme = programmes.find((p) => p.id === programmeId);
  if (!programme) return null;

  // Re-filter by programmeId here (not just today) so the result is correct even
  // if getSessions ever stops scoping by programme — the ring must never count
  // another programme's sessions.
  const sessions = await sessionsRepository.getSessions({ userId, programmeId });
  const todaysSessions = filterTodaysSessionsForProgramme(sessions, programmeId, now);

  return getSessionGoal(programme, todaysSessions);
}
