import { resolveDatabase } from '../db/repositories/repositoryRuntime';
import { getActiveAcademicYear, getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { createSyncStateRepository } from '../db/repositories/syncStateRepository';
import { sessionHistoryScope } from './sessionHistoryPull';
import {
  assessmentHistoryScope, letterMasteryHistoryScope, readAssessmentScope, readMasteryScope,
} from './assessmentHistoryPull';

// Read-only coverage answers; the pull owns the cursor and its lifecycle.
export const isCoverageWalkComplete = (cursor, { childIds = [], windowStart = null } = {}) => {
  let state = cursor;
  if (typeof state === 'string') {
    try { state = JSON.parse(state); } catch { return false; }
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)
    || state.complete !== true || state.lastFailureAt !== null
    || !Array.isArray(state.rescanChildIds)
    || !state.rescanChildIds.every((id) => typeof id === 'string' && id.length > 0)
    || !Array.isArray(childIds)
    || !childIds.every((id) => typeof id === 'string' && id.length > 0)) return false;
  if (windowStart !== null && state.windowStart !== windowStart) return false;
  const covered = new Set(state.rescanChildIds);
  return childIds.every((id) => covered.has(id));
};

export const isSessionHistoryComplete = async ({
  database, userId, programmeId, childIds = [], academicYearStart,
}) => {
  if (!userId) return false;
  const db = await resolveDatabase(database);
  const programme = programmeId === undefined ? await getActiveProgrammeId(db, userId) : programmeId;
  const windowStart = academicYearStart === undefined
    ? (await getActiveAcademicYear(db))?.starts_on : academicYearStart;
  if (!programme || !windowStart) return false;
  const pullState = await createSyncStateRepository({ database }).getPullState(sessionHistoryScope(userId, programme));
  return isCoverageWalkComplete(pullState?.cursor, { childIds, windowStart });
};

export const isMasteryInputsComplete = async ({ database, userId, programmeId, childIds = [] }) => {
  if (!userId) return false;
  const db = await resolveDatabase(database);
  const programme = programmeId === undefined ? await getActiveProgrammeId(db, userId) : programmeId;
  const year = await getActiveAcademicYear(db);
  if (!programme || !year?.id || !year.starts_on) return false;

  const stateRepository = createSyncStateRepository({ database });
  const [assessmentState, masteryState] = await Promise.all([
    stateRepository.getPullState(assessmentHistoryScope(userId, programme)),
    stateRepository.getPullState(letterMasteryHistoryScope(userId)),
  ]);
  if (!isCoverageWalkComplete(assessmentState?.cursor, { childIds, windowStart: year.starts_on })
    || !isCoverageWalkComplete(masteryState?.cursor, { childIds, windowStart: null })) return false;

  // Completed coverage alone cannot detect a grant lost since the last walk wrote.
  const [assessmentScope, masteryScope] = await Promise.all([
    readAssessmentScope(db, { userId, academicYearId: year.id }),
    readMasteryScope(db, { userId }),
  ]);
  const assessmentChildren = new Set(assessmentScope.childIds);
  const deliveryChildren = new Set(masteryScope.childIds);
  return childIds.every(id => assessmentChildren.has(id) && deliveryChildren.has(id));
};
