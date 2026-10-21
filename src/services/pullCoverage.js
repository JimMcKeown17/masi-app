import { resolveDatabase } from '../db/repositories/repositoryRuntime';
import { getActiveAcademicYear, getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { createSyncStateRepository } from '../db/repositories/syncStateRepository';
import { sessionHistoryScope } from './sessionHistoryPull';

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
