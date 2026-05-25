const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-sqlite', () => require('./test-support/expoSQLiteMock'));

jest.mock('react-native-paper/src/components/MaterialCommunityIcon', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ name, ...props }) => React.createElement(Text, props, name);
});

const AsyncStorage = require('@react-native-async-storage/async-storage');
const expoSQLiteMock = require('expo-sqlite');
const { createBetterSqliteTestDatabase } = require('./test-support/betterSqliteAdapter');
const { resetDatabaseConnectionForTests } = require('./src/db/client');

const integrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-sqlite-integration-'));
let sqliteTestDatabase = null;
let sqliteTestDatabasePath = null;

const removeDatabaseFiles = (filename) => {
  if (!filename) return;

  for (const candidate of [filename, `${filename}-wal`, `${filename}-shm`, `${filename}-journal`]) {
    try {
      fs.unlinkSync(candidate);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
};

const resetSqliteIntegrationDatabase = async () => {
  if (sqliteTestDatabase) {
    try {
      await sqliteTestDatabase.closeAsync();
    } catch {
      // Tests may close the database explicitly before the global reset runs.
    }
  }

  removeDatabaseFiles(sqliteTestDatabasePath);
  resetDatabaseConnectionForTests();
  expoSQLiteMock.__reset();

  sqliteTestDatabasePath = path.join(
    integrationDir,
    `integration-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`
  );
  sqliteTestDatabase = createBetterSqliteTestDatabase(sqliteTestDatabasePath);
  expoSQLiteMock.__setDatabaseFactory(async () => sqliteTestDatabase);
};

const originalAsyncStorageClear = AsyncStorage.clear.bind(AsyncStorage);
AsyncStorage.clear = jest.fn(async (...args) => {
  const result = await originalAsyncStorageClear(...args);
  await resetSqliteIntegrationDatabase();
  return result;
});

process.once('exit', () => {
  if (sqliteTestDatabase?.raw?.open) {
    sqliteTestDatabase.raw.close();
  }
  removeDatabaseFiles(sqliteTestDatabasePath);
  try {
    fs.rmdirSync(integrationDir);
  } catch {
    // Leaving a temp directory behind is less harmful than masking test output.
  }
});

resetSqliteIntegrationDatabase();
