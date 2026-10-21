// Adapt legacy module-mocked component tests to a default, explicit test handle.
// Binding/lifecycle suites opt out and never use this fixture.
const modules = {
  children: 'childrenRepository', classes: 'classesRepository', groups: 'groupsRepository',
  classEaAssignments: 'classEaAssignmentsRepository', groupEaAssignments: 'groupEaAssignmentsRepository',
  childClassMemberships: 'childClassMembershipsRepository', classOnboarding: 'classOnboardingRepository',
  classGroupingState: 'classGroupingStateRepository', groupingVersions: 'groupingVersionsRepository',
  sessions: 'sessionsRepository', assessments: 'assessmentsRepository', mastery: 'masteryRepository',
  timeEntries: 'timeEntriesRepository', syncOutbox: 'syncOutboxRepository', syncState: 'syncStateRepository', localState: 'localStateRepository',
  lessonDrafts: 'lessonDraftsRepository',
  ...Object.fromEntries(['schools','jobTitles','programmes','staffProgrammeAssignments','assessmentTools','academicYears','assessmentWindows','teachers'].map((name) => [name, 'referenceDataRepository'])),
};
const getModule = (file) => require(`../src/db/repositories/${file}`);
const restoreMockedFactories = () => {
  for (const file of new Set(Object.values(modules))) {
    const module = getModule(file);
    const actual = jest.requireActual(`../src/db/repositories/${file}`);
    for (const name of Object.keys(actual).filter((name) => /^create.*Repository$/.test(name))) {
      if (jest.isMockFunction(module[name])) module[name].mockImplementation(actual[name]);
    }
  }
};
const repositoriesForTest = (handle) => Object.fromEntries(Object.entries(modules).map(([key, file]) => {
  const singleton = getModule(file)[`${key}Repository`];
  const actual = jest.requireActual(`../src/db/repositories/${file}`)[`${key}Repository`];
  const mocked = singleton && (singleton !== actual || Object.values(singleton).some((fn) => jest.isMockFunction(fn)));
  return [key, mocked ? singleton : handle.repositories[key]];
}));
module.exports = { restoreMockedFactories, repositoriesForTest };

const serviceCache = new WeakMap();
module.exports.servicesForTest = (handle) => {
  const mocks = require('./handleServiceMocks');
  const source = require('../src/services/offlineSync');
  const services = serviceCache.get(handle) || { ...handle.services, syncEngine: { ...handle.services.syncEngine }, sessionHistory: { ...handle.services.sessionHistory, store: { ...handle.services.sessionHistory.store } } };
  for (const name of ['syncAll','syncTableByName','getSyncStatus','requeueTerminalRlsFailures','retryFailedItem']) {
    if (mocks[name]) services.syncEngine[name] = mocks[name];
  }
  if (mocks.pullLookups) services.pullLookups = mocks.pullLookups;
  if (mocks.startSessionHistoryPull) services.sessionHistory.start = mocks.startSessionHistoryPull;
  if (mocks.getSessionHistoryPullState) services.sessionHistory.store.getPullState = mocks.getSessionHistoryPullState;
  if (mocks.resetSessionHistoryStatusForActorChange) services.sessionHistory.store.reset = mocks.resetSessionHistoryStatusForActorChange;
  if (jest.isMockFunction(source.ensureReferenceData)) services.referenceDataReady = source.ensureReferenceData;
  if (jest.isMockFunction(source.fetchAndCacheSchools)) services.fetchAndCacheSchools = source.fetchAndCacheSchools;
  serviceCache.set(handle, services);
  return services;
};
