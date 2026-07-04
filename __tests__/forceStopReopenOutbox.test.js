jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteRealEngine'));

import {
  __resetMockDatabases,
  deleteDatabaseAsync,
  openDatabaseAsync,
} from '../test-support/expoSQLiteRealEngine';
import { runMigrations } from '../src/db/migrations';
import { createTimeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';

const FORCE_STOP_DB = 'masi-forcestop.db';
const CONNECTION_GUARD_DB = 'masi-use-new-connection.db';

const makeTimeEntry = (overrides = {}) => ({
  id: 'te-1',
  user_id: 'user-1',
  sign_in_time: '2026-06-18T06:00:00.000Z',
  sign_in_lat: -34.1,
  sign_in_lon: 18.4,
  sign_out_time: null,
  sign_out_lat: null,
  sign_out_lon: null,
  synced: false,
  created_at: '2026-06-18T06:00:00.000Z',
  updated_at: '2026-06-18T06:00:00.000Z',
  ...overrides,
});

afterEach(async () => {
  await deleteDatabaseAsync(FORCE_STOP_DB);
  await deleteDatabaseAsync(CONNECTION_GUARD_DB);
  await __resetMockDatabases();
});

test('useNewConnection returns a real second handle so query_only does not poison the writer', async () => {
  const writer = await openDatabaseAsync(CONNECTION_GUARD_DB);
  const reader = await openDatabaseAsync(CONNECTION_GUARD_DB, { useNewConnection: true });

  await reader.execAsync('PRAGMA query_only = ON');

  await expect(writer.execAsync('create table writer_probe (id text primary key)'))
    .resolves.toBeUndefined();
  await expect(writer.runAsync('insert into writer_probe (id) values (?)', 'ok'))
    .resolves.toEqual(expect.objectContaining({ changes: 1 }));
  await expect(reader.getFirstAsync('select id from writer_probe where id = ?', 'ok'))
    .resolves.toEqual({ id: 'ok' });

  await reader.closeAsync();
  await writer.closeAsync();
});

test('a pending outbox row survives force-stop close and reopen', async () => {
  let db = await openDatabaseAsync(FORCE_STOP_DB);
  await runMigrations(db);
  await createTimeEntriesRepository({ database: db }).saveTimeEntry(makeTimeEntry());

  await db.closeAsync();

  db = await openDatabaseAsync(FORCE_STOP_DB);
  const outboxRows = await db.getAllAsync(`
    select record_id, operation
    from sync_outbox
    where table_name = 'time_entries'
    order by record_id
  `);
  expect(outboxRows).toEqual([{ record_id: 'te-1', operation: 'insert' }]);

  const timeEntry = await db.getFirstAsync(
    'select id from time_entries where id = ?',
    'te-1'
  );
  expect(timeEntry).toEqual({ id: 'te-1' });

  await db.closeAsync();
});
