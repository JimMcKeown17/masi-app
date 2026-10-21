import { assertTrackerChanges } from '../utils/masteryState';
import { createSessionsRepository } from '../db/repositories/sessionsRepository';
import { createChildrenRepository } from '../db/repositories/childrenRepository';
import { createMasteryRepository } from '../db/repositories/masteryRepository';
import { runRepositoryTransaction } from '../db/repositories/repositoryRuntime';
import { resolveProgrammeId } from '../db/repositories/domainRepositoryUtils';

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

    for (const [childId, changes] of Object.entries(attendeeTrackerChanges)) {
      for (const [letter, change] of Object.entries(changes)) {
        await masteryRepository.setLetterMastery({
          childId,
          letter,
          language: change.languageCode,
          confirmed: change.mastered,
          changedAt: change.madeAt,
          programmeId,
          transaction,
        });
      }
    }
  });

  return true;
}
