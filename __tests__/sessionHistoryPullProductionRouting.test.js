jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createBetterSqliteTestDatabase } = require('../test-support/betterSqliteAdapter');

const file = path.join(os.tmpdir(), `masi-history-routing-${process.pid}-${Date.now()}.db`);
let mockWriter;
let mockReaderBase;
const mockReadOnly = (base) => ({
  getFirstAsync: (...args) => base.getFirstAsync(...args),
  getAllAsync: (...args) => base.getAllAsync(...args),
  runAsync: () => { throw new Error('attempt to write a readonly database'); },
  execAsync: () => { throw new Error('attempt to write a readonly database'); },
});
jest.mock('../src/db/client', () => ({
  getDatabase: async () => mockReadOnly(mockReaderBase),
  getWriter: async () => mockWriter,
  withTransaction: async (task) => require('../src/db/repositories/sqliteRepositoryUtils').runWithTransaction(mockWriter, task),
}));

const { runMigrations } = require('../src/db/migrations');
const { runSessionHistoryPull, sessionHistoryScope } = require('../src/services/sessionHistoryPull');
const { seedCoreData } = require('../test-support/sqliteRepositoryTestUtils');

afterEach(async () => {
  await mockReaderBase?.closeAsync();
  await mockWriter?.closeAsync();
  for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(`${file}${suffix}`, { force: true });
});

test('a failed run records lastFailureAt through the writer, never the read-only reader', async () => {
  mockWriter = createBetterSqliteTestDatabase(file);
  await runMigrations(mockWriter);
  await seedCoreData(mockWriter);
  mockReaderBase = createBetterSqliteTestDatabase(file);
  const client = { rpc: () => ({ abortSignal: () => Promise.resolve({ data: null, error: { message: 'boom', code: 'XX000' } }) }) };
  const result = await runSessionHistoryPull({ userId: 'user-1', deps: { client, enqueueRequest: (task) => task() } });
  expect(result.status).toBe('query');
  const row = await mockWriter.getFirstAsync('select cursor from sync_state where scope = ?', sessionHistoryScope('user-1', 'programme-a'));
  expect(JSON.parse(row.cursor).lastFailureAt).toEqual(expect.any(String));
});
