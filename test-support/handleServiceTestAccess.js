// Explicit actor-bound entry points for legacy service tests. No production imports this.
const current = () => require('../src/session/signedInHandle').requireCurrentHandle();
const referenceOptions = () => {
  const handle = current(); const repos = require('./legacyHandleMocks').repositoriesForTest(handle);
  const mocks = require('./handleServiceMocks');
  return { supabaseClient: handle.dataClient,
    localStateRepository: repos.localState,
    enqueueRequest: mocks.enqueueSupabaseRequest || handle.enqueueRequest,
    repositories: { schools: repos.schools, job_titles: repos.jobTitles, programmes: repos.programmes,
      academic_years: repos.academicYears, assessment_windows: repos.assessmentWindows,
      teachers: repos.teachers, staff_programme_assignments: repos.staffProgrammeAssignments } };
};
const barriers = new WeakMap();
exports.resetReferenceDataBarrierForTests = () => barriers.delete(current());
for (const name of ['syncAll','syncTableByName','getSyncStatus','requeueTerminalRlsFailures','retryFailedItem']) {
  exports[name] = (...args) => current().services.syncEngine[name](...args);
}
for (const name of ['fetchAndCacheSchools','pullReferenceData','ensureReferenceData']) {
  exports[name] = (options = {}) => {
    const handle = current();
    if (!barriers.has(handle)) barriers.set(handle, { ready: false, promise: null });
    return require('../src/services/offlineSync')[name]({ ...referenceOptions(), barrier: barriers.get(handle), ...options });
  };
}
