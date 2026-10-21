import { useSyncExternalStore } from 'react';
import { isStaleActorError } from '../session/staleActor';
import {
  createAssessmentHistoryStates, runBatteryRunHistoryPull, runAssessmentHistoryPull,
  runLetterMasteryHistoryPull, batteryRunHistoryScope, assessmentHistoryScope, letterMasteryHistoryScope,
} from './assessmentHistoryPull';
import { resetHistoryWalkState } from './historyWalk';
import { resolveDatabase } from '../db/repositories/repositoryRuntime';
import { getActiveAcademicYear, getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { createSyncStateRepository } from '../db/repositories/syncStateRepository';

const emptyResults = () => ({ batteryRuns: null, assessments: null, mastery: null });
const walks = [
  ['batteryRuns', runBatteryRunHistoryPull],
  ['assessments', runAssessmentHistoryPull],
  ['mastery', runLetterMasteryHistoryPull],
];

export const createAssessmentHistoryStore = ({
  database, repositories, states = createAssessmentHistoryStates(), client, enqueueRequest,
  referenceDataReady, refreshReferenceData,
} = {}) => {
  let snapshot = { running: false, pageVersion: 0, runVersion: 0, lastResults: emptyResults() };
  let generation = 0;
  let flight = null;
  const listeners = new Set();
  const publish = next => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach(listener => listener());
  };
  const runPass = async ({ userId, force }, token) => {
    // Reference failures do not stamp a history failure or a completed pass.
    if (referenceDataReady) await referenceDataReady();
    if (token !== generation) return null;
    const publishIfCurrent = next => { if (token === generation) publish(next); };
    publishIfCurrent({ running: true });
    const results = { ...snapshot.lastResults };
    let refreshed = false;
    try {
      for (let index = 0; index < walks.length; index += 1) {
        const [key, walk] = walks[index];
        const run = () => walk({ userId, force, deps: {
          database, repositories, state: states[key], client, enqueueRequest,
          onPageSaved: () => publishIfCurrent({ pageVersion: snapshot.pageVersion + 1 }),
        } });
        let result = await run();
        if (token !== generation) return null;
        if (result.status === 'year_mismatch' && !refreshed) {
          refreshed = true;
          const db = await resolveDatabase(database);
          const previousYear = await getActiveAcademicYear(db);
          let ready = false;
          try {
            await refreshReferenceData();
            ready = true;
          } catch (error) {
            if (isStaleActorError(error)) throw error;
            console.warn('[AssessmentHistory] reference refresh failed', error?.message || 'Unknown error');
          }
          if (token !== generation) return null;
          if (ready) {
            const year = await getActiveAcademicYear(db);
            if (year?.id !== previousYear?.id || year?.starts_on !== previousYear?.starts_on) {
              // A run completed earlier in this pass belongs to the old year too.
              results.batteryRuns = null;
              results.assessments = null;
              publishIfCurrent({ lastResults: { ...results } });
              index = -1;
              continue;
            }
            result = await run();
          }
        }
        if (token !== generation) return null;
        results[key] = result;
        publishIfCurrent({ lastResults: { ...results } });
        if (result.status === 'cancelled') break;
      }
      return results;
    } finally {
      publishIfCurrent({ running: false, runVersion: snapshot.runVersion + 1 });
    }
  };

  const launch = options => {
    const job = { token: generation, trailing: null, promise: null };
    // Reserve the flight before prerequisites or the first walk can suspend.
    job.promise = Promise.resolve().then(() => runPass(options, job.token)).finally(() => {
      if (flight !== job) return;
      flight = null;
      if (job.trailing) {
        const waiting = job.trailing;
        launch(waiting.options).then(waiting.resolve, waiting.reject);
      }
    });
    flight = job;
    return job.promise;
  };
  const start = ({ userId, force = false } = {}) => {
    if (!userId) return Promise.resolve(null);
    if (!flight) return launch({ userId, force });
    // One pending pass, not one per caller. A later force request upgrades it.
    if (!flight.trailing) {
      const waiting = { options: { userId, force }, resolve: null, reject: null };
      waiting.promise = new Promise((resolve, reject) => { waiting.resolve = resolve; waiting.reject = reject; });
      flight.trailing = waiting;
    } else {
      flight.trailing.options.force ||= force;
    }
    return flight.trailing.promise;
  };
  const reset = () => {
    generation += 1;
    for (const state of Object.values(states)) resetHistoryWalkState(state);
    // Callers waiting for the revoked actor's trailing pass must not hang or launch later.
    flight?.trailing?.resolve(null);
    flight = null;
    publish({ running: false, lastResults: emptyResults(), runVersion: snapshot.runVersion + 1 });
  };
  const getPullStates = async userId => {
    if (!userId) return emptyResults();
    const db = await resolveDatabase(database);
    const programmeId = await getActiveProgrammeId(db, userId);
    const year = await getActiveAcademicYear(db);
    const stateRepo = repositories?.syncState || createSyncStateRepository({ database });
    const [batteryRuns, assessments, mastery] = await Promise.all([
      programmeId ? stateRepo.getPullState(batteryRunHistoryScope(userId, programmeId)) : null,
      programmeId ? stateRepo.getPullState(assessmentHistoryScope(userId, programmeId)) : null,
      stateRepo.getPullState(letterMasteryHistoryScope(userId)),
    ]);
    // Read-time context only: preserve durable cursors and session-history semantics.
    const withYear = state => state ? { ...state, expectedWindowStart: year?.starts_on ?? null } : null;
    return { batteryRuns: withYear(batteryRuns), assessments: withYear(assessments), mastery };
  };
  return { start, reset, getPullStates, getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
};

export const useAssessmentHistoryStatus = () => {
  const { useSignedInEA } = require('../context/SignedInEAContext');
  const { services } = useSignedInEA();
  const { store } = services.assessmentHistory;
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
};
