// setupFilesAfterEnv: hooks must be registered after Jest installs its test API.
const TEST_ACTOR_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  if (global.__MASI_NO_DEFAULT_HANDLE__) return;
  require('./legacyHandleMocks').restoreMockedFactories();
  const { resetHandleRegistryForTests } = require('../src/session/signedInHandle');
  const { enableAmbientHandleForTests } = require('../src/db/repositories/repositoryRuntime');
  const engine = require('./expoSQLiteRealEngine');
  const sqlite = require('expo-sqlite');
  await resetHandleRegistryForTests();
  await engine.__resetMockDatabases();
  sqlite.__setDatabaseFactory?.(engine.openDatabaseAsync);
  await require('./testDatabase').openDefaultTestHandle();
  enableAmbientHandleForTests();
  require('../src/session/signedInHandle').setLatestAuthSession({ user: { id: TEST_ACTOR_ID }, access_token: 'test-token' });
});
afterEach(async () => {
  if (global.__MASI_NO_DEFAULT_HANDLE__) return;
  const { requestClose, resetHandleRegistryForTests } = require('../src/session/signedInHandle');
  const { disableAmbientHandleForTests } = require('../src/db/repositories/repositoryRuntime');
  const engine = require('./expoSQLiteRealEngine');
  disableAmbientHandleForTests();
  await requestClose({ reason: 'test cleanup' });
  await resetHandleRegistryForTests();
  await engine.__resetMockDatabases();
});

module.exports = { TEST_ACTOR_ID, getDefaultTestHandle: () => require('../src/session/signedInHandle').requireCurrentHandle() };

afterAll(async () => {
  const state = globalThis.__MASI_SUPABASE_CLIENT_STATE__;
  if (state) {
    await state.autoRefreshOperation;
    await state.client.auth.stopAutoRefresh();
    state.appStateSubscription?.remove();
    delete globalThis.__MASI_SUPABASE_CLIENT_STATE__;
  }
});
