import { createSessionsRepository } from '../db/repositories/sessionsRepository';
import { createChildrenRepository } from '../db/repositories/childrenRepository';
import { createMasteryRepository } from '../db/repositories/masteryRepository';
import { createLessonDraftsRepository, presentChildIds } from '../db/repositories/lessonDraftsRepository';
import { hasActiveProgrammeAssignment } from '../db/repositories/domainRepositoryUtils';
import { compareServerTimestamps } from '../utils/serverTimestamps';
import { buildLessonRecord } from '../lessonPlan/lessonRecord';
import { assertTrackerChanges } from '../utils/masteryState';

export class LessonSaveError extends Error {
  constructor(code, { childIds, cause } = {}) {
    super(code);
    this.name = 'LessonSaveError';
    this.code = code;
    if (childIds) this.childIds = childIds;
    if (cause) this.cause = cause;
  }
}

export const saveLesson = async ({ handle, draft, sessionTypeFields, nowIso = new Date().toISOString() }) => {
  const childIds = presentChildIds(draft.attendance);
  if (childIds.length === 0) throw new LessonSaveError('NO_CHILDREN');
  if (!draft.plan) throw new LessonSaveError('NO_PLAN');
  const present = new Set(childIds);
  assertTrackerChanges(Object.fromEntries(Object.entries(draft.tracker_changes).filter(([id]) => present.has(id))));
  const options = { database: handle };
  const children = createChildrenRepository(options);
  const sessions = createSessionsRepository(options);
  const mastery = createMasteryRepository(options);
  const lessonDrafts = createLessonDraftsRepository(options);

  return handle.withTransaction(async transaction => {
    if (!await hasActiveProgrammeAssignment(transaction, handle.userId, draft.programme_id)) {
      throw new LessonSaveError('PROGRAMME_NOT_ACTIVE');
    }
    const authority = await children.getWriteAuthority({ userId: handle.userId, childIds, transaction });
    const cannotAttend = childIds.filter(id => !authority[id]?.attend);
    if (cannotAttend.length) throw new LessonSaveError('CHILD_NOT_WRITABLE', { childIds: cannotAttend });
    const cannotChange = childIds.filter(id => (
      (Object.keys(draft.tracker_changes[id] ?? {}).length > 0 && !authority[id].deliver)
      || (Object.prototype.hasOwnProperty.call(draft.reading_level_changes, id) && !authority[id].level)
    ));
    if (cannotChange.length) throw new LessonSaveError('CHANGES_NOT_WRITABLE', { childIds: cannotChange });

    const rows = await transaction.getAllAsync(
      'select id, reading_level from children where id in (select value from json_each(?))', JSON.stringify(childIds)
    );
    const currentLevels = Object.fromEntries(rows.map(row => [row.id, row.reading_level]));
    const { session, trackerChanges, readingLevelChanges } = buildLessonRecord({
      draft, userId: handle.userId, currentLevels, sessionTypeFields, nowIso,
    });
    try {
      await sessions.saveSession(session, { transaction });
    } catch (error) {
      if (error.message === 'sessions.group_id must reference a group on this phone') {
        throw new LessonSaveError('GROUP_MISSING', { cause: error });
      }
      throw error;
    }
    for (const [id, level] of Object.entries(readingLevelChanges)) {
      if (level === currentLevels[id]) continue;
      await children.updateChild(id, { reading_level: level, updated_at: nowIso, synced: false }, {
        actorUserId: handle.userId, transaction,
      });
    }
    const times = await mastery.getCorrectionTimes({ childIds, language: draft.language_code, transaction });
    for (const [childId, changes] of Object.entries(trackerChanges)) {
      for (const [letter, change] of Object.entries(changes)) {
        if (compareServerTimestamps(change.madeAt, times[childId]?.[letter]) === -1) continue;
        await mastery.setLetterMastery({ childId, letter, language: change.languageCode,
          confirmed: change.mastered, changedAt: change.madeAt, programmeId: draft.programme_id, transaction });
      }
    }
    if (!await lessonDrafts.discard(draft.id, { transaction })) throw new LessonSaveError('ALREADY_SAVED');
    return { sessionId: draft.session_id };
  });
};
