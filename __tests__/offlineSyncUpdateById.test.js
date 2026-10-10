jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { runMigrations } from '../src/db/migrations';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { letterMasteryDomainId } from '../src/db/repositories/domainRepositoryUtils';

const HEAD_OFFICE = 'head-office-1';
const liveTestSession = async () => ({ data: { session: { user: { id: 'user-1' } } } });

const enqueue = async (db, tableName, recordId, operation, payload) => {
  const outbox = createSyncOutboxRepository({ database: db });
  await outbox.enqueue({ tableName, recordId, operation, payload });
};

const seedHeadOfficeChild = async (db, id = 'child-ho-1') => {
  await db.runAsync(`
    insert into children (id, first_name, last_name, reading_level, created_by, sync_status)
    values (?, 'Amahle', 'Dlamini', 'words', ?, 'pending')
  `, id, HEAD_OFFICE);
  return {
    id,
    first_name: 'Amahle',
    last_name: 'Dlamini',
    reading_level: 'words',
    created_by: HEAD_OFFICE,
    created_at: '2026-10-01T08:00:00.000Z',
    updated_at: '2026-10-10T08:00:00.000Z',
  };
};

describe('edits are sent as UPDATE by id (spec §6.5)', () => {
  let db;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    await db.runAsync("insert into programmes (id, code, name, sync_status) values ('programme-1', 'lit', 'Literacy', 'synced')");
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('a Head Office-created child edit is an UPDATE without provenance columns', async () => {
    const child = await seedHeadOfficeChild(db);
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.totalSynced).toBe(1);
    const childCalls = calls.filter((call) => call.tableName === 'children');
    expect(childCalls).toEqual([expect.objectContaining({ type: 'update', column: 'id', value: child.id })]);
    expect(childCalls[0].payload).toEqual(expect.objectContaining({ reading_level: 'words' }));
    for (const column of ['id', 'created_by', 'created_at', 'user_id', 'archived_by_user_id']) {
      expect(childCalls[0].payload).not.toHaveProperty(column);
    }
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test('zero acknowledged rows is UPDATE_NOT_APPLIED and terminal when nothing is pending', async () => {
    const child = await seedHeadOfficeChild(db);
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient } = createSupabaseMock({ updateResults: { children: { data: [], error: null } } });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.totalTerminal).toBe(1);
    const row = await db.getFirstAsync("select status, last_error from sync_outbox where record_id = ?", child.id);
    expect(row.status).toBe('terminal');
    expect(row.last_error).toContain('did not acknowledge exactly one');
  });

  test('a letter_mastery update targets the re-derived deterministic id, not a legacy local id', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-m', 'Lebo', 'Mokoena', 'user-1', 'synced')
    `);
    const legacyLocalId = '0f0f0f0f-0000-4000-8000-000000000001';
    const payload = {
      id: legacyLocalId,
      user_id: 'user-1',
      child_id: 'child-m',
      programme_id: 'programme-1',
      letter: 'a',
      language: 'isiXhosa',
      source: 'taught',
      deleted_at: null,
    };
    await enqueue(db, 'letter_mastery', legacyLocalId, 'update', payload);
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll();

    const expectedId = letterMasteryDomainId({
      userId: 'user-1', childId: 'child-m', programmeId: 'programme-1',
      letter: 'a', language: 'isiXhosa', source: 'taught',
    });
    expect(calls.filter((call) => call.tableName === 'letter_mastery'))
      .toEqual([expect.objectContaining({ type: 'update', column: 'id', value: expectedId })]);
  });

  test('updates for UPDATE-by-id tables are never batched with inserts', async () => {
    const child = await seedHeadOfficeChild(db, 'child-own-1');
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-new-1', 'Zola', 'Ndlovu', 'user-1', 'pending')
    `);
    await enqueue(db, 'children', 'child-new-1', 'insert', {
      id: 'child-new-1', first_name: 'Zola', last_name: 'Ndlovu', created_by: 'user-1',
    });
    await enqueue(db, 'children', child.id, 'update', child);
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll();

    const childCalls = calls.filter((call) => call.tableName === 'children');
    expect(childCalls.map((call) => call.type).sort()).toEqual(['update', 'upsert']);
    const upsertCall = childCalls.find((call) => call.type === 'upsert');
    const upserted = Array.isArray(upsertCall.payload) ? upsertCall.payload : [upsertCall.payload];
    expect(upserted.map((row) => row.id)).toEqual(['child-new-1']);
  });
});
