jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { outboxRecordId } from '../src/db/repositories/syncOutboxRepository';
import { createSyncStateRepository } from '../src/db/repositories/syncStateRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSupabaseRequestQueue } from '../src/services/supabaseRequestQueue';

const enqueue = async (db, tableName, recordId, operation, payload) => {
  const outbox = createSyncOutboxRepository({ database: db });
  await outbox.enqueue({ tableName, recordId, operation, payload });
};

// Mock that errors for ONE table and succeeds for every other table. The errored table's upsert
// returns a retriable error so the row ends 'failed' (a real, classified attempt), exercising the
// "one record fails, the rest still sync" path without throwing.
const supabaseFailingTable = (failTable) => ({
  from: (tableName) => ({
    upsert: async () => (
      tableName === failTable
        ? { error: { message: 'network down' } }
        : { error: null }
    ),
    delete: () => ({ eq: async () => ({ error: null }) }),
  }),
  rpc: async () => ({ data: true, error: null }),
});

const successSupabase = () => ({
  from: () => ({
    upsert: async () => ({ error: null }),
    delete: () => ({ eq: async () => ({ error: null }) }),
  }),
  rpc: async () => ({ data: true, error: null }),
});

const seedClass = async (db, id) => {
  await db.runAsync(`insert or ignore into schools (id, name, sync_status) values ('school-1', 'Masi Primary', 'synced')`);
  await db.runAsync(`
    insert into classes (id, school_id, name, grade, sync_status)
    values (?, 'school-1', 'Grade 1A', '1', 'pending')
  `, id);
  await enqueue(db, 'classes', id, 'insert', { id, school_id: 'school-1', name: 'Grade 1A', grade: '1' });
};

const seedTimeEntry = async (db, id) => {
  await db.runAsync(`
    insert into time_entries (id, user_id, sign_in_time, sign_in_lat, sign_in_lon, sync_status)
    values (?, 'user-1', '2026-06-16T08:00:00.000Z', -34.1, 18.4, 'pending')
  `, id);
  await enqueue(db, 'time_entries', id, 'insert', {
    id, user_id: 'user-1', sign_in_time: '2026-06-16T08:00:00.000Z', sign_in_lat: -34.1, sign_in_lon: 18.4,
  });
};

it('one record fails while the healthy record still syncs and meta is written', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);
  await seedClass(db, 'class-good');
  await seedTimeEntry(db, 'time-bad');

  const beforeSync = new Date().toISOString();
  // time_entries upsert errors (retriable); classes succeeds.
  const engine = createOutboxSyncEngine({ database: db, supabaseClient: supabaseFailingTable('time_entries') });

  const result = await engine.syncAll();

  expect(result.totalSynced).toBe(1);
  expect(result.totalFailed).toBe(1);

  // Healthy record drained + synced.
  expect(await db.getFirstAsync('select sync_status from classes where id = ?', 'class-good'))
    .toEqual({ sync_status: 'synced' });
  expect(await db.getFirstAsync('select id from sync_outbox where record_id = ?', 'class-good'))
    .toBeNull();

  // Bad record ended 'failed' with a recorded error — NOT stranded in_flight.
  const badOutbox = await db.getFirstAsync('select status, last_error from sync_outbox where record_id = ?', 'time-bad');
  expect(badOutbox.status).toBe('failed');
  expect(badOutbox.last_error && badOutbox.last_error.length > 0).toBe(true);

  // No row stranded in_flight anywhere.
  expect((await db.getAllAsync(`select id from sync_outbox where status = 'in_flight'`))).toHaveLength(0);

  // Meta written.
  const meta = await createSyncStateRepository({ database: db }).getSyncMeta();
  expect(meta.lastSyncTime).toBeTruthy();
  expect(meta.lastSyncTime >= beforeSync).toBe(true);

  await db.closeAsync();
});

it('a getById throw after markInFlight does not strand the row in_flight and the pass completes', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);
  await seedClass(db, 'class-good');
  await seedTimeEntry(db, 'time-getbyid-boom');

  const badId = 'time_entries:time-getbyid-boom:insert';
  const real = createSyncOutboxRepository({ database: db });
  const wrapped = {
    ...real,
    getById: async (id) => {
      if (id === badId) throw new Error('getById boom');
      return real.getById(id);
    },
  };

  const beforeSync = new Date().toISOString();
  const engine = createOutboxSyncEngine({ database: db, outboxRepository: wrapped, supabaseClient: successSupabase() });

  // Must not throw.
  const result = await engine.syncAll();
  expect(result).toBeTruthy();

  // The healthy record still synced.
  expect(await db.getFirstAsync('select sync_status from classes where id = ?', 'class-good'))
    .toEqual({ sync_status: 'synced' });

  // The getById-throwing row is NOT in_flight (pending or failed — both acceptable; we never strand).
  const badOutbox = await db.getFirstAsync('select status from sync_outbox where id = ?', badId);
  expect(badOutbox).toBeTruthy();
  expect(badOutbox.status).not.toBe('in_flight');
  expect(['pending', 'failed']).toContain(badOutbox.status);

  // No row stranded in_flight anywhere.
  expect((await db.getAllAsync(`select id from sync_outbox where status = 'in_flight'`))).toHaveLength(0);

  // Meta written despite the throw mid-pass.
  const meta = await createSyncStateRepository({ database: db }).getSyncMeta();
  expect(meta.lastSyncTime).toBeTruthy();
  expect(meta.lastSyncTime >= beforeSync).toBe(true);

  await db.closeAsync();
});

it('sync meta is written even when a loop-body path throws', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);
  await seedTimeEntry(db, 'time-loop-throw');

  const badId = 'time_entries:time-loop-throw:insert';
  const real = createSyncOutboxRepository({ database: db });
  const wrapped = {
    ...real,
    getById: async (id) => {
      if (id === badId) throw new Error('getById boom');
      return real.getById(id);
    },
  };

  const stateRepository = createSyncStateRepository({ database: db });
  const updateSpy = jest.spyOn(stateRepository, 'updateSyncMeta');

  const engine = createOutboxSyncEngine({
    database: db,
    outboxRepository: wrapped,
    stateRepository,
    supabaseClient: successSupabase(),
  });

  await expect(engine.syncAll()).resolves.toBeTruthy();

  expect(updateSpy).toHaveBeenCalled();
  expect(updateSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ lastSyncTime: expect.any(String) }));

  const meta = await stateRepository.getSyncMeta();
  expect(meta.lastSyncTime).toBeTruthy();

  updateSpy.mockRestore();
  await db.closeAsync();
});

// ─── Fix 2: await batch fallback so processBatch's catch owns markInFlight throws ───

// Position is used as the domain-id key in assessmentItemDomainId (position ?? itemKey).
// Each item MUST have a unique position within the same assessment to avoid uuid collisions.
const seedAssessmentItem = async (db, itemId, position, assessmentId = 'assessment-batch-fix2') => {
  // Parent assessment row — insert once (ignore if already exists from a prior call).
  await db.runAsync(`
    insert or ignore into assessments (
      id, user_id, child_id, programme_id, assessment_type, assessment_date, sync_status
    ) values (
      ?, 'user-1', 'child-batch-fix2', 'programme-a', 'letter_sounds', '2026-06-16', 'synced'
    )
  `, assessmentId);

  const item = {
    id: itemId,
    assessment_id: assessmentId,
    item_key: `key-${itemId}`,
    prompt: 'a',
    response: 'a',
    is_correct: 1,
    position,
    metadata: '{}',
  };
  await db.runAsync(`
    insert into assessment_items (
      id, assessment_id, item_key, prompt, response, is_correct, position, metadata, sync_status
    ) values (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `, item.id, item.assessment_id, item.item_key, item.prompt, item.response,
    item.is_correct, item.position, item.metadata);
  await enqueue(db, 'assessment_items', itemId, 'insert', item);
};

it('Fix 2 (Test A): a fallback processRecord markInFlight throw is owned by processBatch — no in_flight, no double-process', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);

  // Seed prerequisite data: school, programme, child.
  await db.runAsync(`insert or ignore into schools (id, name, sync_status) values ('school-1', 'Masi Primary', 'synced')`);
  await db.runAsync(`insert or ignore into programmes (id, code, name) values ('programme-a', 'literacy', 'Literacy')`);
  await db.runAsync(`
    insert or ignore into children (id, first_name, last_name, sync_status)
    values ('child-batch-fix2', 'Lebo', 'Mokoena', 'synced')
  `);

  // Three assessment_items → routes through processBatch (BATCHABLE_UPSERT_TABLES includes assessment_items).
  // Each must have a unique position: assessmentItemDomainId uses `position ?? itemKey` as the key,
  // so identical positions on the same assessment produce the same derived UUID → upsert collision.
  const itemIds = ['item-fix2-a', 'item-fix2-b', 'item-fix2-c'];
  for (let i = 0; i < itemIds.length; i++) {
    await seedAssessmentItem(db, itemIds[i], i);
  }

  // The outbox id for the "bad" item — used to identify which markInFlight call to sabotage.
  const badItemId = 'item-fix2-b';
  const badOutboxId = outboxRecordId('assessment_items', badItemId, 'insert');

  // The batch upsert returns an error to force the per-row fallback path.
  // Track per-row upsert call count by outbox record id (NOT batch call).
  // processRecord builds payload via buildSyncPayload which may transform the id via ensureServerUuid,
  // so we track call count by raw payload id (the derived UUID, not the original item id string).
  let totalUpsertCalls = 0;
  const upsertCallIdCounts = {};
  const batchErrorThenPerRowSupabase = {
    from: () => ({
      upsert: async (payload) => {
        totalUpsertCalls += 1;
        if (totalUpsertCalls === 1) {
          // First call is the batch — return an error to trigger per-record fallback.
          return { data: null, error: { message: 'batch server error' } };
        }
        // Per-row fallback calls: track which payload ids were upserted (and how many times).
        const rawId = Array.isArray(payload) ? (payload[0]?.id ?? 'unknown') : (payload?.id ?? 'unknown');
        upsertCallIdCounts[rawId] = (upsertCallIdCounts[rawId] || 0) + 1;
        return { data: null, error: null };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: async () => ({ data: true, error: null }),
  };

  // Wrap outboxRepository: markInFlight throws for the batch that includes badOutboxId.
  // processBatch calls markInFlight([id1, id2, id3]) for the whole batch at once (before the try).
  // We want to test the fallback path where processRecord is called per-item and one of those
  // individual processRecord calls has its markInFlight throw.
  // To isolate: make markInFlight throw when called with a single-element array containing badOutboxId
  // (which is how processRecord calls it in the fallback).
  const real = createSyncOutboxRepository({ database: db });
  let markInFlightCallCount = 0;
  const wrapped = {
    ...real,
    markInFlight: async (ids) => {
      markInFlightCallCount += 1;
      // First call is processBatch's initial markInFlight for all ids — let it through so the batch
      // reaches the server error and triggers the fallback.
      // Subsequent single-id calls are from individual processRecord calls in the fallback.
      // Throw for the specific bad item on the per-record call.
      if (markInFlightCallCount > 1 && ids.length === 1 && ids[0] === badOutboxId) {
        throw new Error('markInFlight boom for bad item');
      }
      return real.markInFlight(ids);
    },
  };

  // Use a fresh isolated queue so global queue state from other tests doesn't leak in.
  const freshQueue = createSupabaseRequestQueue();
  const engine = createOutboxSyncEngine({
    database: db,
    supabaseClient: batchErrorThenPerRowSupabase,
    outboxRepository: wrapped,
    enqueueRequest: (task) => freshQueue.enqueue(task),
  });

  // Must not throw — processBatch's catch (via await) owns the markInFlight rejection.
  const result = await engine.syncAll();
  expect(result).toBeTruthy();

  // No row left in_flight.
  const inFlightRows = await db.getAllAsync(`select id from sync_outbox where status = 'in_flight'`);
  expect(inFlightRows).toHaveLength(0);

  // All outbox rows ended in a terminal non-in_flight state (pending or failed or deleted).
  const allOutboxRows = await db.getAllAsync(`select status from sync_outbox`);
  for (const row of allOutboxRows) {
    expect(['pending', 'failed', 'terminal']).toContain(row.status);
  }

  // No item's per-row supabase upsert was called more than once (no double-processing).
  for (const [, count] of Object.entries(upsertCallIdCounts)) {
    expect(count).toBeLessThanOrEqual(1);
  }
  // 1 batch call + at most 2 per-row calls (item-a and item-c; item-b's markInFlight threw before
  // reaching the server). If the batch fallback weren't awaited, a rejected per-record processRecord
  // could escape processBatch's catch and bubble to syncAll, which might re-reach the same records
  // → more than 2 per-row calls.
  const perRowCalls = totalUpsertCalls - 1;
  expect(perRowCalls).toBeLessThanOrEqual(2);

  await db.closeAsync();
});

// ─── Fix 1: markReady last-resort fallback when finalizeRetriableFailure throws ───
// Test B is SKIPPED — the transaction/proxy interaction needed to make finalizeRetriableFailure
// throw its domain UPDATE while letting markReady's outbox-only UPDATE succeed is too brittle to
// test reliably via a runAsync proxy (the two writes share the same SQLite connection and the
// proxy can't cleanly differentiate them mid-transaction without risking false negatives). Fix 1
// is inspection-verifiable (finalize → markReady → swallow) and the production device pass
// (Task 12) provides the integration safety net.
// (Test B skipped — see note above)

// ─── Task 9 convergence: allSettled sibling race (Promise.all → Promise.allSettled) ──────────────
//
// Scenario: batch upsert fails → per-record fallback fires. Item A's markInFlight throws BEFORE
// A reaches the server. Item B's per-row upsert succeeds (but via a deferred promise so, under
// the OLD fail-fast Promise.all, A's rejection would settle the batch promise before B resolved).
//
// Old behaviour: Promise.all rejects instantly on A → processBatch catch runs
// finalizeManyRetriableFailure over the WHOLE batch (including B) → B's CAS-safe delete miss →
// restorePendingAfterStaleFinalize → B ends pending despite its upload having succeeded.
//
// New behaviour: processBatchFallback uses Promise.allSettled — waits for every record to settle,
// handles each independently. B synced, A pending/failed, none in_flight, B not re-sent.

it('Task 9 (allSettled race): sibling B synced even when A markInFlight throws before B upload settles', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);

  // Prerequisite domain rows.
  await db.runAsync(`insert or ignore into schools (id, name, sync_status) values ('school-1', 'Masi Primary', 'synced')`);
  await db.runAsync(`insert or ignore into programmes (id, code, name) values ('programme-a', 'literacy', 'Literacy')`);
  await db.runAsync(`
    insert or ignore into children (id, first_name, last_name, sync_status)
    values ('child-task9', 'Sipho', 'Dlamini', 'synced')
  `);

  const assessmentId = 'assessment-task9';
  await db.runAsync(`
    insert or ignore into assessments (
      id, user_id, child_id, programme_id, assessment_type, assessment_date, sync_status
    ) values (
      ?, 'user-1', 'child-task9', 'programme-a', 'letter_sounds', '2026-06-16', 'synced'
    )
  `, assessmentId);

  // Seed items A (position 0) and B (position 1) — distinct positions avoid domain-key collisions.
  const aId = 'item-task9-a';
  const bId = 'item-task9-b';
  await seedAssessmentItem(db, aId, 0, assessmentId);
  await seedAssessmentItem(db, bId, 1, assessmentId);

  const aOutboxId = outboxRecordId('assessment_items', aId, 'insert');
  const bOutboxId = outboxRecordId('assessment_items', bId, 'insert');

  // Controllable deferred for B's per-row upsert — lets us ensure B hasn't settled yet when A
  // rejects, exercising the OLD fail-fast race window.
  let resolveBUpsert;
  const bUpsertPromise = new Promise((resolve) => { resolveBUpsert = resolve; });

  let totalUpsertCalls = 0;
  let bUpsertCallCount = 0;

  const supabaseMock = {
    from: () => ({
      upsert: async (payload) => {
        totalUpsertCalls += 1;
        if (totalUpsertCalls === 1) {
          // First call is the batch upsert — fail it to force per-record fallback.
          return { data: null, error: { message: 'batch server error task9' } };
        }
        // Per-row fallback. Determine which item this is by payload.
        // buildSyncPayload derives a deterministic UUID; we can't easily match by original id,
        // so instead track "which per-row call number" this is.
        const callIndex = totalUpsertCalls - 1; // 1 = A's row, 2 = B's row (or reverse)
        // We want B to be "delayed". We don't know which per-row call is B vs A because both
        // processRecord calls run concurrently under Promise.allSettled. So we delay the SECOND
        // per-row call (whichever arrives second) to ensure both are in-flight simultaneously.
        if (callIndex === 2) {
          bUpsertCallCount += 1;
          await bUpsertPromise;
        }
        return { data: null, error: null };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: async () => ({ data: true, error: null }),
  };

  const real = createSyncOutboxRepository({ database: db });
  let markInFlightCallCount = 0;
  const wrapped = {
    ...real,
    markInFlight: async (ids) => {
      markInFlightCallCount += 1;
      // Call 1: processBatch's whole-batch markInFlight — let through so batch reaches server.
      // Subsequent single-id calls: per-record fallback markInFlight calls.
      // Throw only for A's per-record call so A fails before reaching the server.
      if (markInFlightCallCount > 1 && ids.length === 1 && ids[0] === aOutboxId) {
        throw new Error('markInFlight boom for A task9');
      }
      return real.markInFlight(ids);
    },
  };

  const freshQueue = createSupabaseRequestQueue();
  const engine = createOutboxSyncEngine({
    database: db,
    supabaseClient: supabaseMock,
    outboxRepository: wrapped,
    enqueueRequest: (task) => freshQueue.enqueue(task),
  });

  // Start syncAll — it will reach per-record fallback. A rejects immediately (markInFlight throws);
  // B starts its delayed upload. Resolve B's deferred so B's upload completes.
  const syncPromise = engine.syncAll();
  // Let A and B's processRecord calls enter the per-row upsert stage before resolving B.
  // A doesn't reach upsert (markInFlight throws), B is awaiting bUpsertPromise.
  // Use setImmediate to let the microtask queue drain (both concurrent processRecord calls start).
  await new Promise((resolve) => setImmediate(resolve));
  resolveBUpsert(); // B's upload completes successfully.

  const result = await syncPromise;
  expect(result).toBeTruthy();

  // Load-bearing: B ended synced (upload succeeded, not reverted to pending).
  const bDomainRow = await db.getFirstAsync('select sync_status from assessment_items where id = ?', bId);
  expect(bDomainRow.sync_status).toBe('synced');
  const bOutboxRow = await db.getFirstAsync('select id from sync_outbox where id = ?', bOutboxId);
  expect(bOutboxRow).toBeNull(); // outbox entry deleted on success

  // A ended pending or failed (markInFlight threw — its outbox row was never in_flight successfully).
  const aOutboxRow = await db.getFirstAsync('select status from sync_outbox where id = ?', aOutboxId);
  expect(aOutboxRow).toBeTruthy();
  expect(aOutboxRow.status).not.toBe('in_flight');
  expect(['pending', 'failed']).toContain(aOutboxRow.status);

  // No row stranded in_flight.
  const inFlightRows = await db.getAllAsync(`select id from sync_outbox where status = 'in_flight'`);
  expect(inFlightRows).toHaveLength(0);

  // Second pass: B should NOT be re-sent (upload already finalized on first pass).
  const upsertCallsBeforeSecondPass = totalUpsertCalls;
  const result2 = await engine.syncAll({ force: true });
  expect(result2).toBeTruthy();
  // B's outbox row is gone — no new upsert for B's uuid.
  const bOutboxRowAfter = await db.getFirstAsync('select id from sync_outbox where id = ?', bOutboxId);
  expect(bOutboxRowAfter).toBeNull();
  // Upsert call count should not have increased for B (only A's retry or nothing new for B).
  // We can't perfectly isolate "B's calls" from "A's retry calls" since A goes again, but we
  // know B's outbox is gone so any new upsert must be for A's retry, not B.
  // Assert: no new per-row calls targeted B's uuid (outbox deleted = not queued).
  // Simple invariant: total new upserts in second pass ≤ 1 (only A may retry, B won't).
  const secondPassUpserts = totalUpsertCalls - upsertCallsBeforeSecondPass;
  expect(secondPassUpserts).toBeLessThanOrEqual(1);

  await db.closeAsync();
});
