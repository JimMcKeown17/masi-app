import { createSessionsRepository } from '../db/repositories/sessionsRepository';
import { createChildrenRepository } from '../db/repositories/childrenRepository';
import { createSkillMasteryRepository } from '../db/repositories/skillMasteryRepository';
import { createLessonDraftsRepository, presentChildIds } from '../db/repositories/lessonDraftsRepository';
import { hasActiveProgrammeAssignment, getProgrammeById } from '../db/repositories/domainRepositoryUtils';
import { compareServerTimestamps } from '../utils/serverTimestamps';
import { isMathsProgramme } from '../utils/programmeSubject';
import { getCurriculum, listStepKeys } from '../../content/numeracy-curriculum';
import { buildNumeracySessionRecord } from '../numeracyLesson/numeracyRecord';
import { assertStepChanges } from '../numeracyLesson/trackerChanges';
import { LessonSaveError } from './lessonSave';

export const saveNumeracyLesson = async ({ handle, draft, sessionTypeFields, nowIso = new Date().toISOString() }) => {
  const childIds = presentChildIds(draft.attendance);
  if (childIds.length === 0) throw new LessonSaveError('NO_CHILDREN');
  if (!draft.plan) throw new LessonSaveError('NO_PLAN');
  const present = new Set(childIds);
  assertStepChanges(Object.fromEntries(Object.entries(draft.tracker_changes).filter(([id]) => present.has(id))));
  const options = { database: handle };
  const children = createChildrenRepository(options);
  const sessions = createSessionsRepository(options);
  const mastery = createSkillMasteryRepository(options);
  const lessonDrafts = createLessonDraftsRepository(options);
  const stepKeys = new Set(listStepKeys(getCurriculum()));

  return handle.withTransaction(async transaction => {
    if (!await hasActiveProgrammeAssignment(transaction, handle.userId, draft.programme_id)) {
      throw new LessonSaveError('PROGRAMME_NOT_ACTIVE');
    }
    if (!isMathsProgramme(await getProgrammeById(transaction, draft.programme_id))) {
      throw new LessonSaveError('PROGRAMME_NOT_NUMERACY');
    }
    const authority = await children.getWriteAuthority({ userId: handle.userId, childIds, transaction });
    const cannotAttend = childIds.filter(id => !authority[id]?.attend);
    if (cannotAttend.length) throw new LessonSaveError('CHILD_NOT_WRITABLE', { childIds: cannotAttend });
    const cannotChange = childIds.filter(id => Object.keys(draft.tracker_changes[id] ?? {}).length > 0 && !authority[id].deliver);
    if (cannotChange.length) throw new LessonSaveError('CHANGES_NOT_WRITABLE', { childIds: cannotChange });
    const { session, stepChanges } = buildNumeracySessionRecord({ draft, userId: handle.userId, sessionTypeFields, nowIso });
    try {
      await sessions.saveSession(session, { transaction });
    } catch (error) {
      if (error.message === 'sessions.group_id must reference a group on this phone') {
        throw new LessonSaveError('GROUP_MISSING', { cause: error });
      }
      throw error;
    }
    let keptBack = 0;
    const times = await mastery.getSkillCorrectionTimes({ childIds, transaction });
    for (const [childId, changes] of Object.entries(stepChanges)) {
      for (const [stepKey, change] of Object.entries(changes)) {
        if (!stepKeys.has(stepKey) || compareServerTimestamps(change.madeAt, times[childId]?.[stepKey]) === -1) {
          keptBack += 1;
          continue;
        }
        const result = await mastery.setSkillMastery({ childId, stepKey, confirmed: change.mastered,
          changedAt: change.madeAt, programmeId: draft.programme_id, transaction });
        if (result === null) keptBack += 1;
      }
    }
    if (!await lessonDrafts.discard(draft.id, { transaction })) throw new LessonSaveError('ALREADY_SAVED');
    return { sessionId: draft.session_id, keptBack };
  });
};
