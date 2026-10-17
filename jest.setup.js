process.env.TZ = 'Africa/Johannesburg';

// The native SDK starts navigation cleanup intervals at import time. Telemetry
// behavior has its own explicit mocks; ordinary suites never start native Sentry.
jest.mock('@sentry/react-native', () => require('./test-support/sentryMock'));

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

// Legacy component suites run inside the default test actor. Production and every
// binding/lifecycle suite use the real provider and cannot take this test-only path.
jest.mock('./src/context/SignedInEAContext', () => {
  const actual = jest.requireActual('./src/context/SignedInEAContext');
  return {
    ...actual,
    useSignedInEA: () => {
      const value = require('react').useContext(actual.SignedInEAContext);
      if (value) return value;
      if (global.__MASI_NO_DEFAULT_HANDLE__) return actual.useSignedInEA();
      const handle = require('./src/session/signedInHandle').requireCurrentHandle();
      return { handle, repositories: require('./test-support/legacyHandleMocks').repositoriesForTest(handle), services: require('./test-support/legacyHandleMocks').servicesForTest(handle) };
    },
  };
});

jest.mock('./src/session/handleDataClient', () => {
  const actual = jest.requireActual('./src/session/handleDataClient');
  return { ...actual, createHandleDataClient: (options) => {
    if (global.__MASI_NO_DEFAULT_HANDLE__) return actual.createHandleDataClient(options);
    const { supabase } = require('./src/services/supabaseClient');
    if (supabase && !supabase.realtime && (supabase.from || supabase.rpc)) return supabase;
    return actual.createHandleDataClient(options);
  } };
});
