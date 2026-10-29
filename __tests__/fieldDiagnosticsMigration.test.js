jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { readUnsentSummary } from '../src/db/repositories/syncOutboxRepository';
import { MIGRATIONS, runMigrations } from '../src/db/migrations';
import { getDefaultTestHandle, TEST_ACTOR_ID } from '../test-support/defaultTestHandle';
import { openDefaultTestHandle, getTestWriter } from '../test-support/testDatabase';
import { resetHandleRegistryForTests } from '../src/session/signedInHandle';
import { databaseNameForUser } from '../src/db/client';
import * as engine from '../test-support/expoSQLiteRealEngine';

const prepareV19 = async () => {
  await resetHandleRegistryForTests();
  await engine.__resetMockDatabases();
  const db = await engine.openDatabaseAsync(databaseNameForUser(TEST_ACTOR_ID));
  for (const m of MIGRATIONS.filter(m => m.version <= 19)) {
    await db.execAsync(m.sql);
    if (m.transform) await m.transform(db);
    await db.runAsync('insert into schema_migrations (version, name) values (?, ?)', m.version, m.name);
  }
  await db.execAsync('PRAGMA user_version = 19; PRAGMA foreign_keys = ON');
  for (const status of ['pending', 'sent', 'rejected']) {
    await db.runAsync(`insert into support_incident_queue
      (id, kind, repeat_key, payload, status, attempts, next_attempt_at, last_error, created_at, updated_at)
      values (?, 'left_behind_unsent_work', ?, ?, ?, 3, '2099-01-01', 'raw error', '2026-01-01', '2026-02-01')`,
    status, status, JSON.stringify({ raw: status }), status);
  }
  for (const status of ['pending', 'failed', 'terminal']) {
    await db.runAsync(`insert into sync_outbox
      (id, table_name, record_id, operation, payload, owner_user_id, status, created_at)
      values (?, 'children', ?, 'insert', ?, ?, ?, '2026-01-01')`,
    status, status, JSON.stringify({ id: status }), TEST_ACTOR_ID, status);
  }
  return db;
};

test('public open upgrades populated v19 without changing incidents or replaying domain work', async () => {
  const old = await prepareV19();
  const incidents = await old.getAllAsync('select * from support_incident_queue order by id');
  const outbox = await old.getAllAsync('select * from sync_outbox order by id');
  await old.closeAsync();
  await openDefaultTestHandle();
  const db = await getDefaultTestHandle().getReader();
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 20 });
  expect(await db.getAllAsync('select * from support_incident_queue order by id')).toEqual(
    incidents.map(row => expect.objectContaining({ ...row, schema_version: 1, observed: null,
      first_observed: null, first_seen_at: null, last_seen_at: null, last_sent_at: null, last_sent_release: null, bundle_state: 'none', bundle_attempts: 0 })));
  expect(await db.getAllAsync('select * from sync_outbox order by id')).toEqual(outbox.map(row => ({
    ...row, error_class: row.status === 'terminal' ? 'terminal' : row.status === 'failed' ? 'retryable' : null,
    error_code: row.status === 'pending' ? null : 'OTHER',
  })));
  expect((await readUnsentSummary(db)).total).toBe(3);
  expect(await (await getTestWriter()).getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
  await expect(getDefaultTestHandle().withTransaction(txn => txn.runAsync(
    "insert into child_ea_assignments (id, user_id, child_id) values ('bad-fk', ?, 'missing-child')", TEST_ACTOR_ID
  ))).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
});

test('a failed upgrade rolls back the rebuild and version, restores FK, and can retry once', async () => {
  const db = await prepareV19();
  const before = await db.getAllAsync('select * from support_incident_queue order by id');
  const run = db.runAsync.bind(db);
  db.runAsync = async (sql, ...args) => {
    if (sql.includes('insert or ignore into schema_migrations')) throw new Error('history admission failed');
    return run(sql, ...args);
  };
  await expect(runMigrations(db)).rejects.toThrow('history admission failed');
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 19 });
  expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
  expect(await db.getAllAsync('select * from support_incident_queue order by id')).toEqual(before);
  expect((await db.getAllAsync('PRAGMA table_info(sync_outbox)')).map(c => c.name)).not.toContain('error_class');
  db.runAsync = run;
  await db.closeAsync();
  await openDefaultTestHandle();
  const writer = await getTestWriter();
  const after = await writer.getAllAsync('select * from support_incident_queue order by id');
  await runMigrations(writer);
  expect(await writer.getAllAsync('select * from support_incident_queue order by id')).toEqual(after);
  expect(await writer.getAllAsync('select version from schema_migrations where version = 20')).toEqual([{ version: 20 }]);
});

test('new queue defaults, ten kinds, dedupe and disposition constraints are enforced by SQLite', async () => {
  const handle = getDefaultTestHandle();
  await handle.withTransaction(async txn => {
    const kinds = ['upload_terminal', 'upload_backlog_stale', 'reconcile_breaker_tripped', 'pull_failing',
      'app_error_caught', 'ea_report', 'diagnostics_sent', 'left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent'];
    for (const kind of kinds) await txn.runAsync(
      'insert into support_incident_queue (id, kind, repeat_key, payload) values (?, ?, ?, ?)', kind, kind, 'key', '{}');
    await expect(txn.runAsync("insert into support_incident_queue (id, kind, repeat_key, payload) values ('duplicate', 'ea_report', 'key', '{}')")).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_UNIQUE' });
    for (const [column, value] of [['kind', 'unknown'], ['status', 'unknown'], ['bundle_state', 'unknown']]) {
      await expect(txn.runAsync(`update support_incident_queue set ${column} = ? where id = 'ea_report'`, value)).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
    }
    await txn.runAsync(`insert into sync_outbox (id, table_name, record_id, operation, owner_user_id)
      values ('check', 'children', 'child', 'insert', ?)`, TEST_ACTOR_ID);
    for (const value of ['', 'lower', 'WITH-DASH', 'A'.repeat(41), 'Ä', 'A B', 'A\u0000lower']) {
      await expect(txn.runAsync("update sync_outbox set error_code = ? where id = 'check'", value)).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
    }
    for (const value of ['retryable', 'needs_parent', 'needs_reauth', 'terminal', null]) {
      await txn.runAsync("update sync_outbox set error_class = ?, error_code = ? where id = 'check'", value, 'A'.repeat(40));
    }
    await expect(txn.runAsync("update sync_outbox set error_class = 'unknown' where id = 'check'")).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
  });
  expect(await (await handle.getReader()).getFirstAsync("select schema_version, report_generation, occurrence_count, has_unsent_changes, bundle_state, bundle_attempts from support_incident_queue where id = 'ea_report'"))
    .toEqual({ schema_version: 2, report_generation: 1, occurrence_count: 1, has_unsent_changes: 0, bundle_state: 'none', bundle_attempts: 0 });
});
