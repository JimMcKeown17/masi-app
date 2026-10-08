import { useSyncExternalStore } from 'react';
import {
  resetSessionHistoryForActorChange,
  runSessionHistoryPull,
  sessionHistoryScope,
} from './sessionHistoryPull';
import { resolveDatabase } from '../db/repositories/repositoryRuntime';
import { getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { syncStateRepository } from '../db/repositories/syncStateRepository';

let snapshot = { running: false, pageVersion: 0, runVersion: 0, lastResult: null };
const listeners = new Set();
const publish = (next) => { snapshot = { ...snapshot, ...next }; listeners.forEach((listener) => listener()); };

// A run started for a signed-out EA must never publish into the next EA's status.
let statusGeneration = 0;

export const startSessionHistoryPull = async ({ userId, force = false } = {}) => {
  if (!userId) return null;
  const token = statusGeneration;
  const publishIfCurrent = (next) => { if (token === statusGeneration) publish(next); };
  publishIfCurrent({ running: true });
  try {
    const result = await runSessionHistoryPull({
      userId,
      force,
      deps: { onPageSaved: () => publishIfCurrent({ pageVersion: snapshot.pageVersion + 1 }) },
    });
    publishIfCurrent({ lastResult: result });
    return result;
  } catch (error) {
    publishIfCurrent({ lastResult: { status: 'transport', pages: 0 } });
    return null;
  } finally {
    publishIfCurrent({ running: false, runVersion: snapshot.runVersion + 1 });
  }
};

export const resetSessionHistoryStatusForActorChange = () => {
  statusGeneration += 1;
  resetSessionHistoryForActorChange();
  publish({ running: false, lastResult: null, runVersion: snapshot.runVersion + 1 });
};

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const useSessionHistoryStatus = () => useSyncExternalStore(subscribe, () => snapshot);

// Screens read persisted completeness through this helper so they never touch SQLite directly.
export const getSessionHistoryPullState = async (userId) => {
  if (!userId) return null;
  const db = await resolveDatabase();
  const programmeId = await getActiveProgrammeId(db, userId);
  return programmeId ? syncStateRepository.getPullState(sessionHistoryScope(userId, programmeId)) : null;
};
