import { LETTER_SETS } from '../constants/egraConstants';
import { createSessionsRepository } from '../db/repositories/sessionsRepository';
import { createMasteryRepository } from '../db/repositories/masteryRepository';
import { runRepositoryTransaction } from '../db/repositories/repositoryRuntime';

const findMasteryRecord = (records, { childId, letter, language, deleted }) => records.find(
  (record) => record.child_id === childId &&
    record.letter === letter &&
    record.language === language &&
    (deleted ? record._deleted : !record._deleted) &&
    (record.source || 'taught') === 'taught'
);

export async function persistLiteracySession({
  database,
  session,
  trackerLanguageKey,
  letterTrackerChanges = {},
  nowIso = new Date().toISOString(),
  idFactory,
}) {
  const sessionsRepository = createSessionsRepository({ database });
  const masteryRepository = createMasteryRepository({ database });
  const letterSet = LETTER_SETS[trackerLanguageKey];

  await runRepositoryTransaction(database, async (transaction) => {
    await sessionsRepository.saveSession(session, { transaction });

    if (!letterSet || Object.keys(letterTrackerChanges).length === 0) {
      return;
    }

    const allMastery = await masteryRepository.getLetterMastery({ transaction });

    for (const [childId, changes] of Object.entries(letterTrackerChanges)) {
      for (const [letter, value] of Object.entries(changes)) {
        if (value === true) {
          const existingDeleted = findMasteryRecord(allMastery, {
            childId,
            letter,
            language: letterSet.language,
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
              user_id: session.user_id,
              child_id: childId,
              programme_id: session.programme_id,
              letter,
              source: 'taught',
              language: letterSet.language,
              synced: false,
              created_at: nowIso,
              updated_at: nowIso,
            };
            await masteryRepository.saveLetterMasteryRecord(record, { transaction });
            allMastery.push(record);
          }
        } else if (value === false) {
          const existing = findMasteryRecord(allMastery, {
            childId,
            letter,
            language: letterSet.language,
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
