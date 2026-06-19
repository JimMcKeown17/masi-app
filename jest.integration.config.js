const packageJson = require('./package.json');

module.exports = {
  ...packageJson.jest,
  setupFiles: ['./jest.integration.setup.js'],
  testMatch: [
    '<rootDir>/test-support/integration/sqliteRuntime.integration.js',
    '<rootDir>/__tests__/sqliteFoundation.test.js',
    '<rootDir>/__tests__/debugExport.test.js',
    '<rootDir>/__tests__/syncOutboxRepository.test.js',
    '<rootDir>/__tests__/offlineSyncOutbox.test.js',
    '<rootDir>/__tests__/storage-classes.test.js',
    '<rootDir>/__tests__/childrenRepository.test.js',
    '<rootDir>/__tests__/classesRepository.test.js',
    '<rootDir>/__tests__/sessionsRepository.test.js',
    '<rootDir>/__tests__/assessmentsRepository.test.js',
    '<rootDir>/__tests__/timeEntriesRepository.test.js',
    '<rootDir>/__tests__/useTimeTracking.integration.test.js',
    '<rootDir>/__tests__/referenceDataRepository.test.js',
    '<rootDir>/__tests__/ChildrenContext.test.js',
    '<rootDir>/__tests__/ClassesContext.plan5.test.js',
    // Sync-reliability slice — file-backed SQLite (better-sqlite3) integration tests.
    '<rootDir>/__tests__/migrationsForeignKeysOff.test.js',
    '<rootDir>/__tests__/foreignKeyEnforcement.test.js',
    '<rootDir>/__tests__/clientReadOnlyReader.test.js',
    '<rootDir>/__tests__/bulkFinalize.test.js',
    '<rootDir>/__tests__/batchFailureSemantics.test.js',
    '<rootDir>/__tests__/syncErrorGuard.test.js',
    '<rootDir>/__tests__/syncContractCompleteness.test.js',
  ],
};
