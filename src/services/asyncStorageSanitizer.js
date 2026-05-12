import { storage, STORAGE_KEYS } from '../utils/storage';

const TASK_VERSIONS = {
  childrenLegacyKeysStripped: 1,
  sessionsEnriched: 1,
};

const CHILD_LEGACY_KEYS = ['class', 'school', 'teacher'];

const shouldRunTask = (taskState, taskName) => (
  !taskState?.done || taskState.taskVersion < TASK_VERSIONS[taskName]
);

const completeTaskState = () => ({
  done: true,
  taskVersion: 1,
  completedAt: new Date().toISOString(),
});

const attemptedTaskState = () => ({
  done: false,
  taskVersion: 1,
  lastAttemptAt: new Date().toISOString(),
});

const clearRetryMetadata = async (table, id) => {
  await storage.clearRetryAttempts(table, id);
  await storage.clearLastSyncError(table, id);
  await storage.removeFailedItem(table, id);
};

const appendReviewLog = async (entries) => {
  if (entries.length === 0) return;
  const current = await storage.getItem('@sanitizer_review_log') || [];
  await storage.setItem('@sanitizer_review_log', [...current, ...entries]);
};

const stripChildrenLegacyKeys = async (userId) => {
  const children = await storage.getChildren();
  const reviewEntries = [];
  let mutated = 0;

  const sanitized = children.map(child => {
    const hasLegacyKeys = CHILD_LEGACY_KEYS.some(key => Object.prototype.hasOwnProperty.call(child, key));
    if (!hasLegacyKeys || child.synced !== false) return child;

    const next = { ...child };
    CHILD_LEGACY_KEYS.forEach(key => {
      delete next[key];
    });
    mutated++;

    if (!next.class_id) {
      reviewEntries.push({
        table: 'children',
        id: child.id,
        userId,
        reason: 'class_id_missing_after_legacy_key_strip',
        loggedAt: new Date().toISOString(),
      });
    }

    return next;
  });

  if (mutated > 0) {
    await storage.setItem(STORAGE_KEYS.CHILDREN, sanitized);
    for (const child of children) {
      const hasLegacyKeys = CHILD_LEGACY_KEYS.some(key => Object.prototype.hasOwnProperty.call(child, key));
      if (child.synced === false && hasLegacyKeys) {
        await clearRetryMetadata('CHILDREN', child.id);
      }
    }
    await appendReviewLog(reviewEntries);
  }

  return { mutated, done: true };
};

const findJobTitleForSession = (jobTitles, session) => {
  const name = session.session_type?.trim().toLowerCase();
  if (!name) return null;
  return jobTitles.find(title => title.name?.trim().toLowerCase() === name) || null;
};

const enrichSessions = async (jobTitlesCache) => {
  if (!jobTitlesCache || jobTitlesCache.length === 0) {
    return { mutated: 0, done: false, lastAttemptAt: new Date().toISOString() };
  }

  const sessions = await storage.getSessions();
  let mutated = 0;
  const enriched = sessions.map(session => {
    if (session.synced !== false || session.session_type_id) return session;

    const jobTitle = findJobTitleForSession(jobTitlesCache, session);
    if (!jobTitle?.id) return session;

    mutated++;
    return {
      ...session,
      session_type_id: jobTitle.id,
    };
  });

  if (mutated > 0) {
    await storage.setItem(STORAGE_KEYS.SESSIONS, enriched);
    for (const session of sessions) {
      if (session.synced !== false || session.session_type_id) continue;
      const jobTitle = findJobTitleForSession(jobTitlesCache, session);
      if (jobTitle?.id) {
        await clearRetryMetadata('SESSIONS', session.id);
      }
    }
  }

  return { mutated, done: true };
};

export const runSanitizer = async ({ userId, jobTitlesCache = [] }) => {
  const state = await storage.getSanitizerState(userId);
  const nextState = { ...state };
  const result = {};

  if (shouldRunTask(state.childrenLegacyKeysStripped, 'childrenLegacyKeysStripped')) {
    result.childrenLegacyKeysStripped = await stripChildrenLegacyKeys(userId);
    nextState.childrenLegacyKeysStripped = completeTaskState();
  } else {
    result.childrenLegacyKeysStripped = { skipped: true };
  }

  if (shouldRunTask(state.sessionsEnriched, 'sessionsEnriched')) {
    result.sessionsEnriched = await enrichSessions(jobTitlesCache);
    nextState.sessionsEnriched = result.sessionsEnriched.done
      ? completeTaskState()
      : attemptedTaskState();
  } else {
    result.sessionsEnriched = { skipped: true };
  }

  if (
    result.childrenLegacyKeysStripped.skipped !== true ||
    result.sessionsEnriched.skipped !== true
  ) {
    await storage.saveSanitizerState(userId, nextState);
  }

  return result;
};
