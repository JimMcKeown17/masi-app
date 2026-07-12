jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

const liveTestSession = async () => ({
  data: { session: { user: { id: 'user-1' } } },
});

// #35 (write-path root-cause fix): a class change must keep children.class_id and
// the active child_class_memberships row in sync, so getChildrenInClass and the
// roster query (which joins memberships ON exited_at IS NULL) never disagree.

const FIXED_NOW = new Date('2026-05-21T08:00:00.000Z');

const seedTwoClasses = async (db) => {
  await seedCoreData(db); // school-1, programme-a, year-2026 (active), class-1
  await db.runAsync(`
    insert into classes (id, school_id, name, grade, academic_year_id, created_by)
    values ('class-2', 'school-1', 'Grade 1B', '1', 'year-2026', 'user-1')
  `);
};

const saveChildInClass1 = async (repo) => {
  await repo.save(
    { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1', created_by: 'user-1' },
    { actorUserId: 'user-1' }
  );
};

// A Supabase double whose "server" is a second migrated SQLite database. Reusing the
// real schema means the active-membership partial unique index
// (idx_child_class_memberships_active_unique) and NOT NULL constraints are enforced
// exactly as on the backend — the device-only constraints a hand-rolled mock would hide.
const toPgError = (error) => {
  const message = String(error?.message || error);
  if (/UNIQUE constraint failed/i.test(message)) return { code: '23505', message };
  if (/NOT NULL constraint failed/i.test(message)) return { code: '23502', message };
  if (/FOREIGN KEY constraint failed/i.test(message)) return { code: '23503', message };
  return { code: 'SQLITE_ERROR', message };
};

const createServerBackedSupabase = (serverDb) => {
  const calls = [];
  const applyUpsert = async (tableName, row) => {
    const cols = Object.keys(row);
    const quoted = cols.map((c) => `"${c}"`).join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    const updates = cols.filter((c) => c !== 'id').map((c) => `"${c}" = excluded."${c}"`);
    const conflict = updates.length ? `do update set ${updates.join(', ')}` : 'do nothing';
    await serverDb.runAsync(
      `insert into ${tableName} (${quoted}) values (${placeholders}) on conflict(id) ${conflict}`,
      ...cols.map((c) => row[c])
    );
  };
  const supabaseClient = {
    from: (tableName) => ({
      upsert: async (payload) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        try {
          for (const row of rows) {
            calls.push({ tableName, id: row.id, operation: 'upsert' });
            await applyUpsert(tableName, row);
          }
          return { error: null };
        } catch (error) {
          return { error: toPgError(error) };
        }
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: async () => ({ data: true, error: null }),
  };
  return { supabaseClient, calls };
};

const serverActiveMemberships = (serverDb) => serverDb.getAllAsync(
  'select id, class_id from child_class_memberships where exited_at is null order by class_id'
);

describe('updateChild — a class change keeps the active membership in sync (#35)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('changing class archives an already-synced membership and inserts a new active one', async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedTwoClasses(db);
    const repo = createChildrenRepository({ database: db });
    await saveChildInClass1(repo);

    // Simulate the original class-1 membership having already synced: a successful sync
    // deletes its outbox insert and marks the row synced. (When that insert is still
    // pending in the outbox, the unsynced-coalescing path applies instead — covered in
    // the offline describe block below.)
    const original = await db.getFirstAsync(
      "select id from child_class_memberships where child_id = 'child-1' and class_id = 'class-1'"
    );
    await db.runAsync(
      "delete from sync_outbox where table_name = 'child_class_memberships' and record_id = ? and operation = 'insert'",
      original.id
    );
    await db.runAsync("update child_class_memberships set sync_status = 'synced' where id = ?", original.id);

    await repo.updateChild('child-1', { class_id: 'class-2' }, { actorUserId: 'user-1' });

    // Denormalized column updated.
    expect((await db.getFirstAsync('select class_id from children where id = ?', 'child-1')).class_id).toBe('class-2');

    // Old membership archived (exited_at set); a new active membership for class-2.
    const memberships = await db.getAllAsync(
      'select class_id, exited_at from child_class_memberships order by class_id'
    );
    expect(memberships).toEqual([
      { class_id: 'class-1', exited_at: expect.any(String) }, // archived
      { class_id: 'class-2', exited_at: null },               // new active
    ]);

    // The already-synced old membership is archived remotely; the new one inserted active.
    const ops = (await db.getAllAsync(
      "select operation from sync_outbox where table_name = 'child_class_memberships' order by operation"
    )).map((r) => r.operation);
    expect(ops).toEqual(['archive', 'insert']);
  });

  test('does not churn memberships when the class is unchanged', async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedTwoClasses(db);
    const repo = createChildrenRepository({ database: db });
    await saveChildInClass1(repo);

    await repo.updateChild('child-1', { first_name: 'Renamed' }, { actorUserId: 'user-1' });

    const memberships = await db.getAllAsync('select class_id, exited_at from child_class_memberships');
    expect(memberships).toEqual([{ class_id: 'class-1', exited_at: null }]); // still the one active membership
  });
});

// #35 P1 (offline-first outbox coalescing): when a child is created/assigned offline and
// then reassigned BEFORE the original membership insert has synced, the reassignment must
// not queue a separate archive against an insert that is still a payload snapshot in the
// outbox. The outbox sorts membership archives before inserts, so the stale insert would
// recreate the old membership active → two active memberships / unique-constraint failure.
describe('updateChild — offline create → reassign → sync coalesces the unsynced membership (#35)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('the whole outbox syncs cleanly, leaving exactly one active membership (the new class)', async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedTwoClasses(db);
    const repo = createChildrenRepository({ database: db });

    // Offline: create + assign to class-1, then reassign to class-2 before any sync.
    await saveChildInClass1(repo);
    await repo.updateChild('child-1', { class_id: 'class-2' }, { actorUserId: 'user-1' });

    // Now sync the whole outbox against a real-schema "server" seeded with the same
    // reference/parent data (FKs are enforced, so children/memberships need their parents).
    const serverDb = await createMigratedDatabase(runMigrations);
    await seedTwoClasses(serverDb);
    const { supabaseClient } = createServerBackedSupabase(serverDb);
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    // The whole outbox drains: no archive against a never-synced row, no insert race on
    // the active-membership unique index. (Buggy path always leaves the old membership's
    // archive failing on NOT NULL, plus one insert dying on the unique index.)
    expect(result.failedRecords).toEqual([]);

    // The brief class-1 stint reaches the server already-exited; class-2 is the sole active.
    const serverMemberships = await serverDb.getAllAsync(
      'select class_id, exited_at from child_class_memberships order by class_id'
    );
    expect(serverMemberships).toEqual([
      { class_id: 'class-1', exited_at: expect.any(String) }, // history kept, already exited
      { class_id: 'class-2', exited_at: null },               // sole active membership
    ]);
  });

  test('coalesces by rewriting the pending insert to exited rather than queuing an archive', async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedTwoClasses(db);
    const repo = createChildrenRepository({ database: db });

    await saveChildInClass1(repo);
    await repo.updateChild('child-1', { class_id: 'class-2' }, { actorUserId: 'user-1' });

    const memberships = await db.getAllAsync(
      'select id, class_id, exited_at from child_class_memberships order by class_id'
    );
    const oldMembership = memberships.find((m) => m.class_id === 'class-1');
    const newMembership = memberships.find((m) => m.class_id === 'class-2');

    // Local rows: old exited, new active.
    expect(oldMembership.exited_at).toEqual(expect.any(String));
    expect(newMembership.exited_at).toBeNull();

    // The old membership keeps a single op — its insert, rewritten to carry exited_at —
    // and crucially NO archive op (which would fail/duplicate on sync).
    const oldOps = await db.getAllAsync(
      "select operation, payload from sync_outbox where table_name = 'child_class_memberships' and record_id = ? order by operation",
      oldMembership.id
    );
    expect(oldOps.map((o) => o.operation)).toEqual(['insert']);
    expect(JSON.parse(oldOps[0].payload).exited_at).toEqual(expect.any(String));

    // The new membership is a plain active insert.
    const newOps = await db.getAllAsync(
      "select operation, payload from sync_outbox where table_name = 'child_class_memberships' and record_id = ?",
      newMembership.id
    );
    expect(newOps.map((o) => o.operation)).toEqual(['insert']);
    expect(JSON.parse(newOps[0].payload).exited_at ?? null).toBeNull();
  });
});
