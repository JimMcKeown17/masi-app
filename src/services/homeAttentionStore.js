// src/services/homeAttentionStore.js
import { runRepositoryTransaction } from '../db/repositories/repositoryRuntime';
import { decodeJson } from '../db/repositories/sqliteRepositoryUtils';

// Device-local Home attention records. Never synced; isolated by the EA database file.
export const AUTO_CLOCK_OUT_NOTICE_TTL_MS = 24 * 60 * 60 * 1000;

const autoClockOutKey = 'home_attention.auto_clock_out';
const assessmentDismissedKey = 'home_attention.assessment_due_dismissed_on';

export const createHomeAttentionStore = ({ database, localState }) => {
  const recordAutoClockOutNotice = async (txn, { entry, detectedAt }) => {
    const notice = {
      entryId: entry.id,
      userId: entry.user_id,
      signInTime: entry.sign_in_time,
      detectedAt,
      dismissedAt: null,
    };
    await localState.set(autoClockOutKey, notice, { transaction: txn });
    return notice;
  };

  const loadAutoClockOutNotice = async () => {
    return localState.get(autoClockOutKey, null);
  };

  const dismissAutoClockOutNotice = (entryId, dismissedAt) => runRepositoryTransaction(
    database,
    async (txn) => {
      const row = await txn.getFirstAsync(
        'select value from local_state where key = ?',
        autoClockOutKey
      );
      const current = row ? decodeJson(row.value, null) : null;
      if (!current || current.entryId !== entryId) {
        return false;
      }
      await localState.set(autoClockOutKey, { ...current, dismissedAt }, { transaction: txn });
      return true;
    }
  );

  const getAssessmentDismissedOn = async () => {
    return localState.get(assessmentDismissedKey, null);
  };

  const dismissAssessmentForDay = async (localDate) => {
    await localState.set(assessmentDismissedKey, localDate);
  };

  return {
    recordAutoClockOutNotice,
    loadAutoClockOutNotice,
    dismissAutoClockOutNotice,
    getAssessmentDismissedOn,
    dismissAssessmentForDay,
  };
};
