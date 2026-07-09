jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { runMigrations } from '../src/db/migrations';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

const liveTestSession = async () => ({
  data: { session: { user: { id: 'test-user' } } },
});

const quote = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;

const toPgError = (error) => {
  const message = String(error?.message || error);
  if (/UNIQUE constraint failed/i.test(message)) return { code: '23505', message };
  if (/NOT NULL constraint failed/i.test(message)) return { code: '23502', message };
  if (/FOREIGN KEY constraint failed/i.test(message)) return { code: '23503', message };
  return { code: 'SQLITE_ERROR', message };
};

// This harness runs no RLS. It covers same-school reconcile behavior, but not the R3
// cross-school RLS-denied archive boundary. Task 8 documents that sync contract boundary.
const createServerBackedSupabase = (serverDb, { throwOnSelect = false } = {}) => {
  const calls = [];

  const applyUpsert = async (tableName, row) => {
    const cols = Object.keys(row);
    const quoted = cols.map(quote).join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    const updates = cols.filter((c) => c !== 'id').map((c) => `${quote(c)} = excluded.${quote(c)}`);
    const conflict = updates.length ? `do update set ${updates.join(', ')}` : 'do nothing';
    await serverDb.runAsync(
      `insert into ${quote(tableName)} (${quoted}) values (${placeholders}) on conflict(id) ${conflict}`,
      ...cols.map((c) => row[c])
    );
  };

  const buildWhere = (filters) => {
    const clauses = filters.map((filter) => {
      if (filter.isNull) return `${quote(filter.col)} is null`;
      return `${quote(filter.col)} = ?`;
    });
    const params = filters.filter((filter) => !filter.isNull).map((filter) => filter.val);
    return { clauses, params };
  };

  const makeSelectBuilder = (tableName, columns) => {
    const filters = [];
    let limitValue = null;
    const selected = columns === '*' ? '*' : columns.split(',').map((col) => quote(col.trim())).join(', ');

    const execute = async () => {
      calls.push({ type: 'select', tableName, columns, filters: [...filters], limit: limitValue });
      if (throwOnSelect) throw new Error('server read failed');
      const { clauses, params } = buildWhere(filters);
      const where = clauses.length ? ` where ${clauses.join(' and ')}` : '';
      const limit = limitValue == null ? '' : ` limit ${limitValue}`;
      const data = await serverDb.getAllAsync(
        `select ${selected} from ${quote(tableName)}${where}${limit}`,
        ...params
      );
      return { data, error: null };
    };

    const builder = {
      eq(col, val) { filters.push({ col, val, isNull: false }); return builder; },
      is(col, val) { filters.push({ col, val, isNull: val === null }); return builder; },
      limit(value) { limitValue = value; return builder; },
      then(onFulfilled, onRejected) { return execute().then(onFulfilled, onRejected); },
    };
    return builder;
  };

  const makeUpdateBuilder = (tableName, values) => {
    const filters = [];
    const execute = async () => {
      calls.push({ type: 'update', tableName, values, filters: [...filters] });
      try {
        const cols = Object.keys(values);
        const assignments = cols.map((col) => `${quote(col)} = ?`).join(', ');
        const { clauses, params } = buildWhere(filters);
        await serverDb.runAsync(
          `update ${quote(tableName)} set ${assignments} where ${clauses.join(' and ')}`,
          ...cols.map((col) => values[col]),
          ...params
        );
        return { error: null };
      } catch (error) {
        return { error: toPgError(error) };
      }
    };

    const builder = {
      eq(col, val) { filters.push({ col, val, isNull: false }); return builder; },
      then(onFulfilled, onRejected) { return execute().then(onFulfilled, onRejected); },
    };
    return builder;
  };

  const from = (tableName) => ({
    select: (columns) => makeSelectBuilder(tableName, columns),
    update: (values) => makeUpdateBuilder(tableName, values),
    upsert: async (payload) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      try {
        for (const row of rows) {
          calls.push({ type: 'upsert', tableName, payload: row });
          await applyUpsert(tableName, row);
        }
        return { error: null };
      } catch (error) {
        return { error: toPgError(error) };
      }
    },
    delete: () => ({ eq: async () => ({ error: null }) }),
  });

  return { supabaseClient: { from, rpc: async () => ({ data: true, error: null }) }, calls };
};

const seedTwoClassesAndChild = async (db) => {
  await seedCoreData(db);
  await db.runAsync(`
    insert into classes (id, school_id, name, grade, academic_year_id, created_by)
    values ('class-2', 'school-1', 'Grade 1B', '1', 'year-2026', 'user-1')
  `);
  await db.runAsync(`
    insert into children (id, first_name, last_name, class_id, created_by, sync_status)
    values ('child-1', 'Amahle', 'Dlamini', 'class-2', 'user-1', 'synced')
  `);
};

const insertMembership = async (db, {
  id,
  classId,
  exitedAt = null,
  syncStatus = 'pending',
}) => {
  await db.runAsync(`
    insert into child_class_memberships (
      id, child_id, class_id, academic_year_id, enrolled_at, exited_at,
      created_by, created_at, updated_at, sync_status
    )
    values (?, 'child-1', ?, 'year-2026', '2026-05-21T08:00:00.000Z', ?,
      'user-1', '2026-05-21T08:00:00.000Z', '2026-05-21T08:00:00.000Z', ?)
  `, id, classId, exitedAt, syncStatus);
};

const enqueueMembershipInsert = async (db, id, classId) => {
  await createSyncOutboxRepository({ database: db }).enqueue({
    tableName: 'child_class_memberships',
    recordId: id,
    operation: 'insert',
    payload: {
      id,
      child_id: 'child-1',
      class_id: classId,
      academic_year_id: 'year-2026',
      enrolled_at: '2026-05-21T08:00:00.000Z',
      exited_at: null,
      created_by: 'user-1',
      created_at: '2026-05-21T08:00:00.000Z',
      updated_at: '2026-05-21T08:00:00.000Z',
    },
  });
};

describe('child_class_memberships sync reconcile-before-upsert (#47)', () => {
  test('archives a conflicting server-active row before inserting the device membership', async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedTwoClassesAndChild(db);
    await insertMembership(db, { id: 'device-class-b-membership', classId: 'class-2' });
    await enqueueMembershipInsert(db, 'device-class-b-membership', 'class-2');

    const serverDb = await createMigratedDatabase(runMigrations);
    await seedTwoClassesAndChild(serverDb);
    await insertMembership(serverDb, {
      id: 'server-class-a-membership',
      classId: 'class-1',
      syncStatus: 'synced',
    });

    const { supabaseClient, calls } = createServerBackedSupabase(serverDb);
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll({ tableName: 'child_class_memberships' });

    expect(result.failedRecords).toEqual([]);
    expect(calls.filter((call) => call.type === 'update')).toEqual([
      expect.objectContaining({
        tableName: 'child_class_memberships',
        values: { exited_at: expect.any(String) },
      }),
    ]);
    expect(await db.getFirstAsync(
      "select status from sync_outbox where table_name = 'child_class_memberships' and record_id = ?",
      'device-class-b-membership'
    )).toBeNull();
    expect(await serverDb.getAllAsync(
      'select id, class_id, exited_at from child_class_memberships order by class_id'
    )).toEqual([
      { id: 'server-class-a-membership', class_id: 'class-1', exited_at: expect.any(String) },
      { id: 'device-class-b-membership', class_id: 'class-2', exited_at: null },
    ]);
  });

  test('inserts normally when no conflicting server-active row exists', async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedTwoClassesAndChild(db);
    await insertMembership(db, { id: 'device-class-b-membership', classId: 'class-2' });
    await enqueueMembershipInsert(db, 'device-class-b-membership', 'class-2');

    const serverDb = await createMigratedDatabase(runMigrations);
    await seedTwoClassesAndChild(serverDb);

    const { supabaseClient, calls } = createServerBackedSupabase(serverDb);
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll({ tableName: 'child_class_memberships' });

    expect(result.failedRecords).toEqual([]);
    expect(calls.filter((call) => call.type === 'update')).toEqual([]);
    expect(await serverDb.getAllAsync(
      'select id, class_id, exited_at from child_class_memberships'
    )).toEqual([
      { id: 'device-class-b-membership', class_id: 'class-2', exited_at: null },
    ]);
  });

  test('falls back to the normal upsert when the server read fails', async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedTwoClassesAndChild(db);
    await insertMembership(db, { id: 'device-class-b-membership', classId: 'class-2' });
    await enqueueMembershipInsert(db, 'device-class-b-membership', 'class-2');

    const serverDb = await createMigratedDatabase(runMigrations);
    await seedTwoClassesAndChild(serverDb);
    await insertMembership(serverDb, {
      id: 'server-class-a-membership',
      classId: 'class-1',
      syncStatus: 'synced',
    });

    const { supabaseClient, calls } = createServerBackedSupabase(serverDb, { throwOnSelect: true });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll({ tableName: 'child_class_memberships' });

    expect(result.failedRecords).toEqual([
      expect.objectContaining({
        table: 'child_class_memberships',
        id: 'device-class-b-membership',
        reason: expect.stringMatching(/unique constraint/i),
      }),
    ]);
    expect(calls.filter((call) => call.type === 'select')).toHaveLength(1);
    expect(calls.filter((call) => call.type === 'update')).toEqual([]);
    expect(await db.getFirstAsync(
      "select status from sync_outbox where table_name = 'child_class_memberships' and record_id = ?",
      'device-class-b-membership'
    )).toEqual({ status: 'terminal' });
    expect(await serverDb.getAllAsync(
      'select id, class_id, exited_at from child_class_memberships'
    )).toEqual([
      { id: 'server-class-a-membership', class_id: 'class-1', exited_at: null },
    ]);
  });
});
