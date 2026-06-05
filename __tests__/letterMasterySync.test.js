jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { runMigrations } from '../src/db/migrations';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { letterMasteryDomainId } from '../src/db/repositories/domainRepositoryUtils';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

const expectedDomainId = () => letterMasteryDomainId({
  userId: LOGICAL_KEY.user_id,
  childId: LOGICAL_KEY.child_id,
  programmeId: LOGICAL_KEY.programme_id,
  letter: LOGICAL_KEY.letter,
  language: LOGICAL_KEY.language,
  source: LOGICAL_KEY.source,
});

// letter_mastery sync identity: a row's identity is its logical key, so every push carries a
// deterministic logical-key id (buildSyncPayload maps it). The same record gets the same id on
// every device/install → insert-by-id is idempotent and the 23505 collision is impossible by
// construction (no runtime adoption). The one precondition: legacy random-id server rows must be
// cleaned first (see the REGRESSION GUARD below) — that's the mandatory deploy-time staging step.

const LOGICAL_KEY = {
  user_id: 'user-1',
  child_id: 'child-1',
  programme_id: 'programme-a',
  letter: 'a',
  language: 'isiXhosa',
  source: 'taught',
};

// A Supabase double whose "server" is a second migrated SQLite DB, so the real NOT NULL +
// idx_letter_mastery_unique_active constraints are enforced exactly as on the backend.
const toPgError = (error) => {
  const message = String(error?.message || error);
  if (/UNIQUE constraint failed/i.test(message)) return { code: '23505', message };
  if (/NOT NULL constraint failed/i.test(message)) return { code: '23502', message };
  if (/FOREIGN KEY constraint failed/i.test(message)) return { code: '23503', message };
  return { code: 'SQLITE_ERROR', message };
};

const createServerBackedSupabase = (serverDb) => {
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

  const from = (tableName) => {
    const filters = [];
    const builder = {
      select() { return builder; },
      eq(col, val) { filters.push({ col, val, isNull: false }); return builder; },
      is(col, val) { filters.push({ col, val, isNull: val === null }); return builder; },
      limit() { return builder; },
      maybeSingle: async () => {
        const clauses = filters.map((f) => (f.isNull ? `"${f.col}" is null` : `"${f.col}" = ?`));
        const params = filters.filter((f) => !f.isNull).map((f) => f.val);
        const row = await serverDb.getFirstAsync(
          `select id from ${tableName} where ${clauses.join(' and ')} limit 1`,
          ...params
        );
        return { data: row || null, error: null };
      },
      upsert: async (payload) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        try {
          for (const row of rows) await applyUpsert(tableName, row);
          return { error: null };
        } catch (error) {
          return { error: toPgError(error) };
        }
      },
    };
    return builder;
  };

  return { supabaseClient: { from, rpc: async () => ({ data: true, error: null }) } };
};

const seedChild = async (db) => {
  await db.runAsync(`
    insert into children (id, first_name, last_name, class_id, created_by, sync_status)
    values ('child-1', 'Amahle', 'Dlamini', 'class-1', 'user-1', 'synced')
  `);
};

const insertMastery = async (db, id, { exited = false } = {}) => {
  await db.runAsync(`
    insert into letter_mastery (id, user_id, child_id, programme_id, letter, language, source, mastered_at, deleted_at, sync_status)
    values (?, ?, ?, ?, ?, ?, ?, '2026-05-21T08:00:00.000Z', ?, 'pending')
  `, id, LOGICAL_KEY.user_id, LOGICAL_KEY.child_id, LOGICAL_KEY.programme_id,
     LOGICAL_KEY.letter, LOGICAL_KEY.language, LOGICAL_KEY.source, exited ? '2026-05-21T09:00:00.000Z' : null);
};

describe('letter_mastery sync — deterministic logical-key push ids (idempotent, no adoption)', () => {
  test('a letter_mastery push is mapped to its deterministic logical-key id', async () => {
    const RANDOM_LOCAL_ID = '11111111-1111-1111-1111-111111111111';
    const db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    await seedChild(db);
    await insertMastery(db, RANDOM_LOCAL_ID); // active row under a random (pre-fix) id
    await createSyncOutboxRepository({ database: db }).enqueue({
      tableName: 'letter_mastery',
      recordId: RANDOM_LOCAL_ID,
      operation: 'insert',
      payload: {
        id: RANDOM_LOCAL_ID, ...LOGICAL_KEY,
        mastered_at: '2026-05-21T08:00:00.000Z', deleted_at: null,
        created_at: '2026-05-21T08:00:00.000Z', updated_at: '2026-05-21T08:00:00.000Z',
      },
    });

    const serverDb = await createMigratedDatabase(runMigrations);
    await seedCoreData(serverDb);
    await seedChild(serverDb);
    const { supabaseClient } = createServerBackedSupabase(serverDb);
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.failedRecords).toEqual([]);
    // The server row is keyed by the deterministic logical-key id, not the device-local id.
    expect(await serverDb.getAllAsync('select id from letter_mastery'))
      .toEqual([{ id: expectedDomainId() }]);
  });

  test('a letter taught then untaught offline syncs as exited, not stale-active (coalesced, ordering-safe)', async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    await seedChild(db);

    // Real flow: taught then untaught, all offline before the first sync.
    const repo = createMasteryRepository({ database: db });
    const savedId = await repo.saveLetterMasteryRecord({ ...LOGICAL_KEY, synced: false });
    await repo.removeLetterMasteryRecord(savedId);

    // Coalesced: exactly one queued op (the insert, rewritten to exited) — no separate archive
    // that could sort ahead of the insert and resurrect the row active on sync.
    const ops = await db.getAllAsync(
      "select operation, payload from sync_outbox where table_name = 'letter_mastery'"
    );
    expect(ops.map((o) => o.operation)).toEqual(['insert']);
    expect(JSON.parse(ops[0].payload).deleted_at).toEqual(expect.any(String));

    const serverDb = await createMigratedDatabase(runMigrations);
    await seedCoreData(serverDb);
    await seedChild(serverDb);
    const { supabaseClient } = createServerBackedSupabase(serverDb);
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.failedRecords).toEqual([]);
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });

    // The server reflects the EA's net intent: the letter is NOT active.
    expect(await serverDb.getFirstAsync(
      'select count(*) as count from letter_mastery where deleted_at is null'
    )).toEqual({ count: 0 });
  });

  test('two installs of the same letter converge on one server row (deterministic ids are idempotent)', async () => {
    // The whole point of prevention: any device computes the same id for the same logical key,
    // so a second writer upserts the SAME row instead of colliding — no reconciliation needed.
    const serverDb = await createMigratedDatabase(runMigrations);
    await seedCoreData(serverDb);
    await seedChild(serverDb);
    const { supabaseClient } = createServerBackedSupabase(serverDb);

    for (const tag of ['install-a', 'install-b']) {
      const db = await createMigratedDatabase(runMigrations);
      await seedCoreData(db);
      await seedChild(db);
      await createMasteryRepository({ database: db }).saveLetterMasteryRecord({ ...LOGICAL_KEY, synced: false });
      const engine = createOutboxSyncEngine({ database: db, supabaseClient });
      const result = await engine.syncAll();
      expect(result.failedRecords).toEqual([]); // second install does not 23505
      await db.closeAsync();
    }

    // Exactly one active server row under the deterministic id — no duplicate, no collision.
    expect(await serverDb.getAllAsync('select id from letter_mastery where deleted_at is null'))
      .toEqual([{ id: expectedDomainId() }]);
  });

  test('REGRESSION GUARD: a deterministic push 23505-collides with a legacy random-id active row — why the Task 0 staging cleanup is mandatory', async () => {
    const LEGACY_SERVER_ID = 'ff17e146-9493-4476-9d26-5731101ab6b9';
    const RANDOM_LOCAL_ID = '22222222-2222-2222-2222-222222222222';

    const db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    await seedChild(db);
    await insertMastery(db, RANDOM_LOCAL_ID);
    await createSyncOutboxRepository({ database: db }).enqueue({
      tableName: 'letter_mastery',
      recordId: RANDOM_LOCAL_ID,
      operation: 'insert',
      payload: {
        id: RANDOM_LOCAL_ID, ...LOGICAL_KEY,
        mastered_at: '2026-05-21T08:00:00.000Z', deleted_at: null,
        created_at: '2026-05-21T08:00:00.000Z', updated_at: '2026-05-21T08:00:00.000Z',
      },
    });

    // A NOT-cleaned legacy random-id active row for the same logical key.
    const serverDb = await createMigratedDatabase(runMigrations);
    await seedCoreData(serverDb);
    await seedChild(serverDb);
    await insertMastery(serverDb, LEGACY_SERVER_ID);

    const { supabaseClient } = createServerBackedSupabase(serverDb);
    const engine = createOutboxSyncEngine({ database: db, supabaseClient });

    const result = await engine.syncAll();

    // Adoption is gone, so this is a hard failure — documenting WHY legacy rows must be cleaned
    // before the deterministic build ships.
    expect(result.failedRecords).toEqual([
      expect.objectContaining({
        table: 'letter_mastery',
        reason: expect.stringMatching(/unique constraint/i),
      }),
    ]);
  });
});
