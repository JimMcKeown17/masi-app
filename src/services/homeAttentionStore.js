// src/services/homeAttentionStore.js
import { runRepositoryTransaction } from '../db/repositories/repositoryRuntime';
import { createLocalStateRepository } from '../db/repositories/localStateRepository';
import { decodeJson } from '../db/repositories/sqliteRepositoryUtils';

// Device-local Home attention records. Never synced. Keyed by user so one
// phone shared by two EAs keeps them apart; the auto clock-out key uses the
// time entry's own user_id so a late write can only land in its owner's slot.
export const AUTO_CLOCK_OUT_NOTICE_TTL_MS = 24 * 60 * 60 * 1000;

const autoClockOutKey = (userId) => `home_attention.auto_clock_out.${userId}`;
const assessmentDismissedKey = (userId) => `home_attention.assessment_due_dismissed_on.${userId}`;

export const createHomeAttentionStore = ({ database } = {}) => {
  const localState = createLocalStateRepository({ database });

  const recordAutoClockOutNotice = async (txn, { entry, detectedAt }) => {
    const notice = {
      entryId: entry.id,
      userId: entry.user_id,
      signInTime: entry.sign_in_time,
      detectedAt,
      dismissedAt: null,
    };
    await localState.set(autoClockOutKey(entry.user_id), notice, { transaction: txn });
    return notice;
  };

  const loadAutoClockOutNotice = async (userId) => {
    if (!userId) return null;
    return localState.get(autoClockOutKey(userId), null);
  };

  const dismissAutoClockOutNotice = (userId, entryId, dismissedAt) => runRepositoryTransaction(
    database,
    async (txn) => {
      const row = await txn.getFirstAsync(
        'select value from local_state where key = ?',
        autoClockOutKey(userId)
      );
      const current = row ? decodeJson(row.value, null) : null;
      if (!current || current.entryId !== entryId) {
        return false;
      }
      await localState.set(autoClockOutKey(userId), { ...current, dismissedAt }, { transaction: txn });
      return true;
    }
  );

  const getAssessmentDismissedOn = async (userId) => {
    if (!userId) return null;
    return localState.get(assessmentDismissedKey(userId), null);
  };

  const dismissAssessmentForDay = async (userId, localDate) => {
    await localState.set(assessmentDismissedKey(userId), localDate);
  };

  return {
    recordAutoClockOutNotice,
    loadAutoClockOutNotice,
    dismissAutoClockOutNotice,
    getAssessmentDismissedOn,
    dismissAssessmentForDay,
  };
};

export const homeAttentionStore = createHomeAttentionStore();
