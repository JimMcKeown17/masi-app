import { storage, STORAGE_KEYS } from '../utils/storage';

const TASK_VERSIONS = {
  childrenLegacyKeysStripped: 1,
  sessionsEnriched: 2,
};

const CHILD_LEGACY_KEYS = ['class', 'school', 'teacher'];

const shouldRunTask = (taskState, taskName) => (
  !taskState?.done || taskState.taskVersion < TASK_VERSIONS[taskName]
);

const completeTaskState = (taskName) => ({
  done: true,
  taskVersion: TASK_VERSIONS[taskName],
  completedAt: new Date().toISOString(),
});

const attemptedTaskState = (taskName) => ({
  done: false,
  taskVersion: TASK_VERSIONS[taskName],
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
  const name = (session.pendingSessionTypeName || session.session_type)?.trim().toLowerCase();
  if (!name) return null;
  return jobTitles.find(title => title.name?.trim().toLowerCase() === name) || null;
};

const enrichSessions = async (jobTitlesCache) => {
  const sessions = await storage.getSessions();
  let mutated = 0;
  let unresolvedUnsynced = false;

  const enriched = sessions.map(session => {
    if (session.synced !== false) return session;

    const hadLegacySessionType = Object.prototype.hasOwnProperty.call(session, 'session_type');
    const jobTitle = findJobTitleForSession(jobTitlesCache, session);
    const next = { ...session };

    if (!next.session_type_id && jobTitle?.id) {
      next.session_type_id = jobTitle.id;
    }

    if (hadLegacySessionType) {
      if (!next.session_type_id && !next.pendingSessionTypeName && session.session_type) {
        next._pendingJobTitleResolve = true;
        next.pendingSessionTypeName = session.session_type;
      }
      delete next.session_type;
    }

    if (!next.session_type_id) {
      unresolvedUnsynced = true;
    }

    if (
      next.session_type_id !== session.session_type_id ||
      hadLegacySessionType ||
      next._pendingJobTitleResolve !== session._pendingJobTitleResolve ||
      next.pendingSessionTypeName !== session.pendingSessionTypeName
    ) {
      mutated++;
    }

    return next;
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

  return {
    mutated,
    done: !unresolvedUnsynced,
    ...(unresolvedUnsynced ? { lastAttemptAt: new Date().toISOString() } : {}),
  };
};

export const runSanitizer = async ({ userId, jobTitlesCache = [] }) => {
  const state = await storage.getSanitizerState(userId);
  const nextState = { ...state };
  const result = {};

  if (shouldRunTask(state.childrenLegacyKeysStripped, 'childrenLegacyKeysStripped')) {
    result.childrenLegacyKeysStripped = await stripChildrenLegacyKeys(userId);
    nextState.childrenLegacyKeysStripped = completeTaskState('childrenLegacyKeysStripped');
  } else {
    result.childrenLegacyKeysStripped = { skipped: true };
  }

  if (shouldRunTask(state.sessionsEnriched, 'sessionsEnriched')) {
    result.sessionsEnriched = await enrichSessions(jobTitlesCache);
    nextState.sessionsEnriched = result.sessionsEnriched.done
      ? completeTaskState('sessionsEnriched')
      : attemptedTaskState('sessionsEnriched');
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
