global.__MASI_NO_DEFAULT_HANDLE__ = true;
import * as sqlite from '../test-support/expoSQLiteRealEngine';
import { runMigrations } from '../src/db/migrations';
import { createSyncOutboxRepository, readUnsentSummary, UNSENT_STATUSES } from '../src/db/repositories/syncOutboxRepository';

const A = '11111111-1111-4111-8111-111111111111';
let db;
const row = (id, table, status, createdAt) => db.runAsync(
  `insert into sync_outbox (id, table_name, record_id, operation, status, owner_user_id, created_at, updated_at)
   values (?, ?, ?, 'insert', ?, ?, ?, ?)`, id, table, `r-${id}`, status, A, createdAt, createdAt);

beforeEach(async () => {
  await sqlite.__resetMockDatabases();
  db = await sqlite.openDatabaseAsync(`masi-${A}.db`);
  await runMigrations(db);
});
afterEach(() => sqlite.__resetMockDatabases());

test('unsent is pending, failed, in_flight and terminal; synced rows are excluded', async () => {
  expect(UNSENT_STATUSES).toEqual(['pending', 'failed', 'in_flight', 'terminal']);
  await row('o2', 'children', 'pending', '2026-10-02T00:00:00.000Z');
  await row('o1', 'children', 'terminal', '2026-10-01T00:00:00.000Z');
  await row('o3', 'time_entries', 'in_flight', '2026-10-03T00:00:00.000Z');
  await row('o4', 'sessions', 'failed', '2026-10-04T00:00:00.000Z');
  expect(await readUnsentSummary(db)).toEqual({
    total: 4, byTable: { children: 2, time_entries: 1, sessions: 1 },
    oldestId: 'o1', oldestCreatedAt: '2026-10-01T00:00:00.000Z',
  });
});

test('an empty outbox reports zero and no oldest row', async () => {
  expect(await readUnsentSummary(db)).toEqual({ total: 0, byTable: {}, oldestId: null, oldestCreatedAt: null });
});

test('a read-only connection summarizes the whole file and breaks oldest timestamp ties by id', async () => {
  const at = '2026-10-01T00:00:00.000Z';
  await row('o2', 'children', 'pending', at);
  await row('o1', 'sessions', 'terminal', at);
  await db.runAsync("update sync_outbox set owner_user_id = ? where id = 'o1'",
    '22222222-2222-4222-8222-222222222222');
  const reader = await sqlite.openDatabaseAsync(`masi-${A}.db`, { useNewConnection: true });
  await reader.execAsync('PRAGMA query_only = ON');
  expect(await readUnsentSummary(reader)).toEqual({
    total: 2, byTable: { children: 1, sessions: 1 }, oldestId: 'o1', oldestCreatedAt: at,
  });
  expect(await createSyncOutboxRepository({ database: db }).countUnsent()).toEqual({
    total: 2, byTable: { children: 1, sessions: 1 },
  });
});
