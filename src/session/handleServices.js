import { createChildrenRepository } from '../db/repositories/childrenRepository';
import { createClassesRepository } from '../db/repositories/classesRepository';
import { createGroupsRepository } from '../db/repositories/groupsRepository';
import { createClassEaAssignmentsRepository } from '../db/repositories/classEaAssignmentsRepository';
import { createGroupEaAssignmentsRepository } from '../db/repositories/groupEaAssignmentsRepository';
import { createChildClassMembershipsRepository } from '../db/repositories/childClassMembershipsRepository';
import { createClassOnboardingRepository } from '../db/repositories/classOnboardingRepository';
import { createClassGroupingStateRepository } from '../db/repositories/classGroupingStateRepository';
import { createGroupingVersionsRepository } from '../db/repositories/groupingVersionsRepository';
import { createSessionsRepository } from '../db/repositories/sessionsRepository';
import { createAssessmentsRepository } from '../db/repositories/assessmentsRepository';
import { createMasteryRepository } from '../db/repositories/masteryRepository';
import { createTimeEntriesRepository } from '../db/repositories/timeEntriesRepository';
import { createReferenceDataRepository, createSchoolsRepository } from '../db/repositories/referenceDataRepository';
import { createSyncOutboxRepository } from '../db/repositories/syncOutboxRepository';
import { createSupportIncidentRepository } from '../db/repositories/supportIncidentRepository';
import { createSyncStateRepository } from '../db/repositories/syncStateRepository';
import { createLocalStateRepository } from '../db/repositories/localStateRepository';
import { createOutboxSyncEngine, ensureReferenceData, pullReferenceData, fetchAndCacheSchools } from '../services/offlineSync';
import { pullPreloadedChildData, persistPreloadedChildData, pullClassData } from '../services/preloadedChildData';
import { createSessionHistoryState } from '../services/sessionHistoryPull';
import { createSessionHistoryStore } from '../services/sessionHistoryStatus';
import { getLatestAuthSession } from './signedInHandle';
import { StaleActorError } from './staleActor';

// Construct once, before publication. Every closure captures this handle, never the registry.
export const createHandleServices = (handle) => {
  const options = { database: handle };
  const repositories = {
    children: createChildrenRepository(options),
    classes: createClassesRepository(options),
    groups: createGroupsRepository(options),
    classEaAssignments: createClassEaAssignmentsRepository(options),
    groupEaAssignments: createGroupEaAssignmentsRepository(options),
    childClassMemberships: createChildClassMembershipsRepository(options),
    classGroupingState: createClassGroupingStateRepository(options),
    groupingVersions: createGroupingVersionsRepository(options),
    sessions: createSessionsRepository(options),
    assessments: createAssessmentsRepository(options),
    mastery: createMasteryRepository(options),
    timeEntries: createTimeEntriesRepository(options),
    schools: createSchoolsRepository(options),
    syncOutbox: createSyncOutboxRepository(options),
    supportIncidents: createSupportIncidentRepository(options),
    syncState: createSyncStateRepository(options),
    localState: createLocalStateRepository(options),
  };
  // Bind the composite graph to the same actor as its leaf repositories.
  repositories.classOnboarding = createClassOnboardingRepository({
    ...options, classes: repositories.classes, localState: repositories.localState,
  });
  const referenceRepositories = { schools: repositories.schools };
  for (const [name, tableName] of Object.entries({
    jobTitles: 'job_titles', programmes: 'programmes', staffProgrammeAssignments: 'staff_programme_assignments',
    assessmentTools: 'assessment_tools', academicYears: 'academic_years', assessmentWindows: 'assessment_windows', teachers: 'teachers',
  })) {
    repositories[name] = createReferenceDataRepository({ ...options, tableName });
    referenceRepositories[tableName] = repositories[name];
  }
  const barrier = { ready: false, promise: null };
  const referenceOptions = {
    userId: handle.userId, supabaseClient: handle.dataClient, enqueueRequest: handle.enqueueRequest,
    repositories: referenceRepositories, localStateRepository: repositories.localState, barrier,
  };
  const assertCurrent = () => {
    if (!handle.isOpen() || !handle.isCurrent()) throw new StaleActorError();
  };
  const referenceDataReady = () => {
    try { assertCurrent(); } catch (error) { return Promise.reject(error); }
    return ensureReferenceData(referenceOptions);
  };
  const pullOptions = {
    userId: handle.userId, supabaseClient: handle.dataClient,
    enqueueRequest: handle.enqueueRequest, repositories,
  };
  const store = createSessionHistoryStore({
    ...options, repositories, state: createSessionHistoryState(),
    client: handle.dataClient, enqueueRequest: handle.enqueueRequest, referenceDataReady,
  });
  handle.onClose(() => store.reset());
  return {
    repositories,
    syncEngine: createOutboxSyncEngine({
      ...options, supabaseClient: handle.dataClient, enqueueRequest: handle.enqueueRequest,
      outboxRepository: repositories.syncOutbox, stateRepository: repositories.syncState,
      getAuthSession: async () => {
        const s = getLatestAuthSession();
        return { data: { session: s?.user?.id === handle.userId ? s : null } };
      },
    }),
    referenceDataReady,
    pullReferenceData: () => { assertCurrent(); return pullReferenceData(referenceOptions); },
    pullRoster: async ({ authorizedBreakerScopes } = {}) => {
      await referenceDataReady();
      const pulled = await pullPreloadedChildData(pullOptions);
      assertCurrent();
      return persistPreloadedChildData({ ...pullOptions, pulled, authorizedBreakerScopes });
    },
    pullClasses: async ({ bypassBreaker = false } = {}) => {
      await referenceDataReady();
      return pullClassData({ ...pullOptions, bypassBreaker });
    },
    pullLookups: async () => {
      const { data, error } = await handle.enqueueRequest(() => handle.dataClient.from('job_titles')
        .select('*').order('sort_order', { ascending: true }));
      if (error) throw error;
      await repositories.jobTitles.replaceFromServer(data || []);
      return data || [];
    },
    fetchAndCacheSchools: () => fetchAndCacheSchools(referenceOptions),
    sessionHistory: { start: ({ force = false } = {}) => store.start({ userId: handle.userId, force }), store },
    deviceProfile: {
      get: () => repositories.localState.get('user_profile', null),
      save: (profile) => repositories.localState.set('user_profile', profile),
    },
  };
};
