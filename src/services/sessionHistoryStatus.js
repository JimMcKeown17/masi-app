import { isStaleActorError } from '../session/staleActor';
import { useSyncExternalStore } from 'react';
import {
  resetSessionHistoryState,
  runSessionHistoryPull,
  sessionHistoryScope,
} from './sessionHistoryPull';
import { resolveDatabase } from '../db/repositories/repositoryRuntime';
import { getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { createSyncStateRepository } from '../db/repositories/syncStateRepository';

export const createSessionHistoryStore = ({
  database,
  repositories,
  state,
  client,
  enqueueRequest,
  referenceDataReady,
} = {}) => {
  let snapshot = { running: false, pageVersion: 0, runVersion: 0, lastResult: null };
  const listeners = new Set();
  let statusGeneration = 0;
  const publish = (next) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };
  const start = async ({ userId, force = false } = {}) => {
    if (!userId) return null;
    const token = statusGeneration;
    const publishIfCurrent = (next) => { if (token === statusGeneration) publish(next); };
    // Failed prerequisites never write a history failure marker or publish a completed run.
    if (referenceDataReady) await referenceDataReady();
    publishIfCurrent({ running: true });
    try {
      const result = await runSessionHistoryPull({
        userId, force,
        deps: {
          database, repositories, state, client, enqueueRequest,
          onPageSaved: () => publishIfCurrent({ pageVersion: snapshot.pageVersion + 1 }),
        },
      });
      publishIfCurrent({ lastResult: result });
      return result;
    } catch (error) {
      if (isStaleActorError(error)) throw error;
      publishIfCurrent({ lastResult: { status: 'transport', pages: 0 } });
      return null;
    } finally {
      publishIfCurrent({ running: false, runVersion: snapshot.runVersion + 1 });
    }
  };
  const reset = () => {
    statusGeneration += 1;
    if (state) resetSessionHistoryState(state);
    publish({ running: false, lastResult: null, runVersion: snapshot.runVersion + 1 });
  };
  const getPullState = async (userId) => {
    if (!userId) return null;
    const db = await resolveDatabase(database);
    const programmeId = await getActiveProgrammeId(db, userId);
    const stateRepo = repositories?.syncState || createSyncStateRepository({ database });
    return programmeId ? stateRepo.getPullState(sessionHistoryScope(userId, programmeId)) : null;
  };
  return {
    start, reset, getPullState,
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
};

export const useSessionHistoryStatus = () => {
  const { useSignedInEA } = require('../context/SignedInEAContext');
  const { services } = useSignedInEA();
  const { store } = services.sessionHistory;
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
};
