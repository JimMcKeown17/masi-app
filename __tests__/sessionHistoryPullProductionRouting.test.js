global.__MASI_NO_DEFAULT_HANDLE__ = true;
import { requestOpen, resetHandleRegistryForTests } from '../src/session/signedInHandle';
import { runSessionHistoryPull, createSessionHistoryState, sessionHistoryScope } from '../src/services/sessionHistoryPull';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import * as engine from '../test-support/expoSQLiteRealEngine';

beforeEach(async () => { await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); });
afterEach(async () => { await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); });
test('a failed run records lastFailureAt through the writer, never the read-only reader', async () => {
  const handle = await requestOpen({ userId: '11111111-1111-4111-8111-111111111111', openDatabase: engine.openDatabaseAsync });
  const writer = await engine.openDatabaseAsync(handle.fileName);
  await seedCoreData(writer);
  const client = { rpc: () => ({ abortSignal: () => Promise.resolve({ data: null, error: { message: 'boom', code: 'XX000' } }) }) };
  const result = await runSessionHistoryPull({ userId: 'user-1', deps: { database: handle, state: createSessionHistoryState(), client, enqueueRequest: (task) => task() } });
  expect(result.status).toBe('query');
  const row = await (await handle.getReader()).getFirstAsync('select cursor from sync_state where scope = ?', sessionHistoryScope('user-1', 'programme-a'));
  expect(JSON.parse(row.cursor).lastFailureAt).toEqual(expect.any(String));
  await expect((await handle.getReader()).runAsync("update sync_state set cursor=null")).rejects.toMatchObject({ message: expect.stringMatching(/readonly/) });
});
