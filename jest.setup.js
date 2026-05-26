// Mock AsyncStorage for test environment
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock expo-sqlite with a real better-sqlite3-backed database by default.
// Individual SQLite foundation tests can still reset and replace this factory.
jest.mock('expo-sqlite', () => require('./test-support/expoSQLiteMock'));

// Suppress MaterialCommunityIcon font-loading warnings in tests
jest.mock('react-native-paper/src/components/MaterialCommunityIcon', () => {
  const { Text } = require('react-native');
  return ({ name, ...props }) => <Text {...props}>{name}</Text>;
});

jest.mock('expo-constants', () => ({
  expoConfig: {
    version: 'test',
    ios: { buildNumber: 'test-ios' },
    android: { versionCode: 1 },
    runtimeVersion: { policy: 'appVersion' },
    updates: { url: 'https://u.expo.dev/test' },
    extra: {
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
    },
  },
}), { virtual: true });

const AsyncStorage = require('@react-native-async-storage/async-storage');
const expoSQLiteMock = require('expo-sqlite');
const { createBetterSqliteTestDatabase } = require('./test-support/betterSqliteAdapter');
const { resetDatabaseConnectionForTests } = require('./src/db/client');

let sqliteTestDatabase = null;

const resetSqliteTestDatabase = async () => {
  if (sqliteTestDatabase) {
    try {
      await sqliteTestDatabase.closeAsync();
    } catch {
      // Test databases may already be closed by focused SQLite tests.
    }
  }

  resetDatabaseConnectionForTests();
  expoSQLiteMock.__reset();
  sqliteTestDatabase = createBetterSqliteTestDatabase();
  expoSQLiteMock.__setDatabaseFactory(async () => sqliteTestDatabase);
};

const originalAsyncStorageClear = AsyncStorage.clear.bind(AsyncStorage);
AsyncStorage.clear = jest.fn(async (...args) => {
  const result = await originalAsyncStorageClear(...args);
  await resetSqliteTestDatabase();
  return result;
});

resetSqliteTestDatabase();
