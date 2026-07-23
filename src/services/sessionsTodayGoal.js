import { resolveDatabase } from '../db/repositories/repositoryRuntime';
import { getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { programmesRepository } from '../db/repositories/referenceDataRepository';
import { sessionsRepository } from '../db/repositories/sessionsRepository';
import { getSessionGoal } from '../utils/sessionGoal';
import { toLocalDateString } from '../utils/localDate';

/**
 * Resolve the EA's Sessions Today goal for their active programme.
 *
 * This is the wiring layer for the Sessions Today ring: it resolves the active
 * programme, loads its sessions, narrows them to today, and runs the pure
 * `getSessionGoal`. The screen calls this on focus and hands the result
 * straight to either daily-progress presenter.
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

  const count = await sessionsRepository.countSessionsOnDate({
    userId,
    programmeId,
    date: toLocalDateString(now),
  });
  return getSessionGoal(programme, Array(count));
}
