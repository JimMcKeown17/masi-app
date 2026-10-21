import { LANGUAGE_LABELS } from '../utils/assessmentRegistry';
import { assertTrackerChanges } from '../utils/masteryState';
import { createSessionsRepository } from '../db/repositories/sessionsRepository';
import { createChildrenRepository } from '../db/repositories/childrenRepository';
import { createMasteryRepository } from '../db/repositories/masteryRepository';
import { runRepositoryTransaction } from '../db/repositories/repositoryRuntime';
import { resolveProgrammeId } from '../db/repositories/domainRepositoryUtils';

const findMasteryRecord = (records, { childId, letter, language, programmeId, deleted }) => records.find(
  (record) => record.child_id === childId &&
    record.programme_id === programmeId &&
    record.letter === letter &&
    record.language === language &&
    (deleted ? record._deleted : !record._deleted) &&
    (record.source || 'taught') === 'taught'
);

export async function persistLiteracySession({
  handle,
  database = handle,
  session,
  letterTrackerChanges = {},
  nowIso = new Date().toISOString(),
  idFactory,
}) {
  const sessionsRepository = createSessionsRepository({ database });
  const childrenRepository = createChildrenRepository({ database });
  const masteryRepository = createMasteryRepository({ database });
  const attendeeIds = new Set(session.children_ids || []);
  const attendeeTrackerChanges = Object.fromEntries(
    Object.entries(letterTrackerChanges)
      .filter(([childId]) => attendeeIds.has(childId))
  );
  assertTrackerChanges(attendeeTrackerChanges);

  await runRepositoryTransaction(database, async (transaction) => {
    const programmeId = await resolveProgrammeId(transaction, {
      programmeId: session.programme_id,
      userId: session.user_id,
    });
    const childReadingLevels = Object.fromEntries(
      Object.entries(session.activities?.child_reading_levels || {})
        .filter(([childId]) => attendeeIds.has(childId))
    );
    const programmeScopedSession = {
      ...session,
      programme_id: programmeId,
      activities: {
        ...(session.activities || {}),
        child_reading_levels: childReadingLevels,
      },
    };

    await sessionsRepository.saveSession(programmeScopedSession, { transaction });

    for (const [childId, readingLevel] of Object.entries(childReadingLevels)) {
      if (!readingLevel) continue;
      const existingChild = await transaction.getFirstAsync(
        'select reading_level from children where id = ?',
        childId
      );
      if (!existingChild || existingChild.reading_level === readingLevel) continue;
      await childrenRepository.updateChild(childId, {
        reading_level: readingLevel,
        updated_at: nowIso,
        synced: false,
      }, {
        actorUserId: programmeScopedSession.user_id,
        transaction,
      });
    }

    if (Object.keys(attendeeTrackerChanges).length === 0) {
      return;
    }

    const changedChildIds = Object.keys(attendeeTrackerChanges);
    const allMastery = await masteryRepository.getLetterMastery({
      transaction,
      userId: programmeScopedSession.user_id,
      programmeId,
      childIds: changedChildIds,
    });

    for (const [childId, changes] of Object.entries(attendeeTrackerChanges)) {
      for (const [letter, change] of Object.entries(changes)) {
        // Plan 2 re-keys letter_mastery to codes
        const confirmationLanguage = LANGUAGE_LABELS[change.languageCode];
        if (change.mastered === true) {
          const existingDeleted = findMasteryRecord(allMastery, {
            childId,
            letter,
            language: confirmationLanguage,
            programmeId,
            deleted: true,
          });

          if (existingDeleted) {
            await masteryRepository.updateLetterMasteryRecord(existingDeleted.id, {
              _deleted: false,
              deleted_at: null,
              synced: false,
              updated_at: nowIso,
            }, { transaction });
            existingDeleted._deleted = false;
            existingDeleted.deleted_at = null;
          } else {
            const record = {
              id: idFactory(),
              user_id: programmeScopedSession.user_id,
              child_id: childId,
              programme_id: programmeId,
              letter,
              source: 'taught',
              language: confirmationLanguage,
              synced: false,
              created_at: nowIso,
              updated_at: nowIso,
            };
            const savedId = await masteryRepository.saveLetterMasteryRecord(record, { transaction });
            allMastery.push({ ...record, id: savedId });
          }
        } else if (change.mastered === false) {
          const existing = findMasteryRecord(allMastery, {
            childId,
            letter,
            language: confirmationLanguage,
            programmeId,
            deleted: false,
          });

          if (existing) {
            await masteryRepository.updateLetterMasteryRecord(existing.id, {
              _deleted: true,
              deleted_at: nowIso,
              synced: false,
              updated_at: nowIso,
            }, { transaction });
            existing._deleted = true;
            existing.deleted_at = nowIso;
          }
        }
      }
    }
  });

  return true;
}
