import { resolveDatabase } from '../db/repositories/repositoryRuntime';
import { getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { programmesRepository } from '../db/repositories/referenceDataRepository';

/**
 * Resolve whether the signed-in EA has an active programme assignment, and which
 * programme it is. This front-loads the data layer's existing fail-safe: a
 * session/assessment write resolves its programme from the active assignment and
 * throws when there is none (legacy fallback stays off for production capture).
 * The capture surfaces call this on entry so an unassigned EA sees an actionable
 * empty-state instead of a form that fails at save.
 *
 * `hasActiveProgramme` tracks whether an active assignment exists — that alone is
 * what lets the data layer write (it only needs the programme id). `programme` is
 * the resolved record for display, or null if it is not cached locally.
 */
export async function getActiveProgrammeGate({ userId } = {}) {
  if (!userId) return { hasActiveProgramme: false, programme: null };

  const db = await resolveDatabase();
  const programmeId = await getActiveProgrammeId(db, userId);
  if (!programmeId) return { hasActiveProgramme: false, programme: null };

  const programmes = await programmesRepository.getAll();
  const programme = programmes.find((p) => p.id === programmeId) || null;
  return { hasActiveProgramme: true, programme };
}
