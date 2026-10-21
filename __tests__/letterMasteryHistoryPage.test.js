jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ ...require('../test-support/supabaseTestConfig'), supabase: {} }));
import { runMigrations } from '../src/db/migrations';
import { createMasteryRepository, applyCorrectionAcknowledgement, deleteUndeliveredLetterMastery, letterMasteryHistoryScope } from '../src/db/repositories/masteryRepository';
import { letterMasteryDomainId } from '../src/db/domainId';
import { runRepositoryTransaction } from '../src/db/repositories/repositoryRuntime';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { createCountingSqliteTestDatabase } from '../test-support/countingSqliteAdapter';

const T1 = '2026-10-20T08:00:00.000001+00:00';
const T2 = '2026-10-20T08:00:00.000002+00:00';
const T3 = '2026-10-20T08:00:00.000003+00:00';
const LOW = '10000000-0000-4000-8000-000000000000';
const MID = '80000000-0000-4000-8000-000000000000';
const HIGH = 'e0000000-0000-4000-8000-000000000000';
const ACCEPTED_BELOW = '00000000-0000-4000-8000-000000000000';
const ACCEPTED_ABOVE = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
const scope = 'letter_mastery_pull:user-1';
const pageOptions = () => ({ scope, pullState: { lastPulledAt: T3, cursor: 'durable-cursor' }, admit: () => true });
const pulled = (extra = {}) => {
  const row = { child_id: 'child-1', letter: 'k', language: 'en', confirmed: true,
    changed_at: T1, correction_id: HIGH, changed_by: 'user-2', programme_id: null,
    created_at: T1, updated_at: T2, child_first_name: 'Server', child_last_name: 'Child', child_preferred_name: null,
    ...extra };
  return { ...row, id: letterMasteryDomainId({ childId: row.child_id, letter: row.letter, language: row.language }) };
};
const session = async () => ({ data: { session: { user: { id: 'user-1' } } } });

describe('letter mastery history page', () => {
  let db;
  let mastery;
  const read = () => db.getFirstAsync('select * from letter_mastery where id = ?', pulled().id);
  const write = () => mastery.setLetterMastery({ childId: 'child-1', letter: 'k', language: 'en', confirmed: false });
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    bindTestActor(db, 'user-1');
    await seedCoreData(db);
    await db.runAsync("insert into children (id, first_name, last_name) values ('child-1', 'Local', 'Child')");
    await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, assigned_at, sync_status) values ('cea-1', 'user-1', 'child-1', '2026-01-15', 'synced')");
    mastery = createMasteryRepository({ database: db });
  });
  afterEach(async () => { await db.closeAsync(); });

  test('absent rows insert with their server tuple; an unknown child becomes a reference child', async () => {
    const row = pulled({ child_id: 'unknown-child', confirmed: false });
    expect(await mastery.saveHistoryPage([row], pageOptions())).toEqual({ inserted: 1, applied: 0, skipped: 0 });
    expect(await db.getFirstAsync('select confirmed, server_changed_at, server_correction_id, sync_status, server_updated_at from letter_mastery where id = ?', row.id))
      .toEqual({ confirmed: 0, server_changed_at: T1, server_correction_id: HIGH, sync_status: 'synced', server_updated_at: T2 });
    expect(await db.getFirstAsync("select first_name, history_reference from children where id = 'unknown-child'"))
      .toEqual({ first_name: 'Server', history_reference: 1 });
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });
  test('a pending local change is left alone', async () => {
    await write();
    const before = await read();
    const outbox = await db.getAllAsync('select * from sync_outbox');
    expect(await mastery.saveHistoryPage([pulled({ changed_at: T3 })], pageOptions())).toEqual({ inserted: 0, applied: 0, skipped: 1 });
    expect(await read()).toEqual(before);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual(outbox);
  });
  test('a synced row takes only a newer server tuple', async () => {
    await mastery.saveHistoryPage([pulled()], pageOptions());
    const before = await read();
    for (const correction_id of [LOW, HIGH]) {
      expect(await mastery.saveHistoryPage([pulled({ confirmed: false, correction_id })], pageOptions())).toEqual({ inserted: 0, applied: 0, skipped: 1 });
      expect(await read()).toEqual(before);
    }
    expect(await mastery.saveHistoryPage([pulled({ confirmed: false, changed_at: T2, correction_id: MID })], pageOptions())).toEqual({ inserted: 0, applied: 1, skipped: 0 });
    expect(await read()).toMatchObject({ confirmed: 0, server_changed_at: T2, server_correction_id: MID });
  });
  test('a stale page applied after a newer acknowledged correction does not roll it back', async () => {
    const stale = pulled({ correction_id: LOW });
    await mastery.saveHistoryPage([stale], pageOptions());
    const local = await write();
    await runRepositoryTransaction(db, async (txn) => {
      await txn.runAsync('delete from sync_outbox where record_id = ?', local.id);
      await applyCorrectionAcknowledgement(txn, { recordId: local.id, sentCorrectionId: local.correction_id,
        outboxDeleted: true, result: { outcome: 'applied', confirmed: false, changed_at: T2, correction_id: MID, changed_by: 'user-1' } });
    });
    await mastery.saveHistoryPage([stale], pageOptions());
    expect(await read()).toMatchObject({ confirmed: 0, changed_at: T2, correction_id: MID, server_changed_at: T2, server_correction_id: MID });
  });
  test('a wrong phone clock does not block convergence', async () => {
    await mastery.saveHistoryPage([pulled({ correction_id: LOW })], pageOptions());
    await db.runAsync("update letter_mastery set changed_at = '2030-01-01T00:00:00Z'");
    await mastery.saveHistoryPage([pulled({ confirmed: false, changed_at: T2, correction_id: MID })], pageOptions());
    expect(await read()).toMatchObject({ confirmed: 0, changed_at: T2, server_changed_at: T2, server_correction_id: MID });
  });
  test.each([['below', ACCEPTED_BELOW], ['above', ACCEPTED_ABOVE]])(
    'a refused correction is restored through the real terminal finalizer (accepted id sorts %s)',
    async (_label, acceptedId) => {
      const id = pulled().id;
      await mastery.saveHistoryPage([pulled({ changed_at: T2, correction_id: acceptedId })], pageOptions());
      await write();
      const { supabaseClient } = createSupabaseMock({ rpcResults: {
        set_letter_mastery: { data: null, error: { code: 'MA001', message: 'correction mismatch' } },
      } });
      const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(), getAuthSession: session, database: db, supabaseClient });
      await engine.syncAll();
      const evidence = await db.getFirstAsync('select * from sync_outbox where table_name = ? and record_id = ?', 'letter_mastery', id);
      expect(evidence.status).toBe('terminal');
      expect((await read()).sync_status).toBe('terminal');
      await mastery.saveHistoryPage([pulled({ changed_at: T2, correction_id: acceptedId })], pageOptions());
      expect(await db.getFirstAsync(`select confirmed, correction_id, sync_status, last_sync_error, server_changed_at, server_correction_id
        from letter_mastery where id = ?`, id)).toEqual({ confirmed: 1, correction_id: acceptedId, sync_status: 'synced',
        last_sync_error: null, server_changed_at: T2, server_correction_id: acceptedId });
      await mastery.saveHistoryPage([pulled({ confirmed: false, changed_at: T1, correction_id: HIGH })], pageOptions());
      expect((await read()).confirmed).toBe(1);
      await mastery.saveHistoryPage([pulled({ confirmed: false, changed_at: T3, correction_id: MID })], pageOptions());
      expect(await read()).toMatchObject({ confirmed: 0, server_changed_at: T3, server_correction_id: MID });
      expect(await db.getFirstAsync('select * from sync_outbox where id = ?', evidence.id)).toEqual(evidence);
      expect((await engine.getSyncStatus()).needsAttentionItems).toEqual([expect.objectContaining({ table: 'letter_mastery', id, terminal: true })]);
    }
  );
  test('an in-flight correction blocks the merge', async () => {
    await write();
    await db.runAsync("update sync_outbox set status = 'in_flight'");
    // Acknowledgement ordering alone may be known while the newer local slot is still owed.
    await db.runAsync("update letter_mastery set sync_status = 'synced'");
    const before = await read();
    const outbox = await db.getAllAsync('select * from sync_outbox');
    expect(await mastery.saveHistoryPage([pulled({ changed_at: T3 })], pageOptions())).toMatchObject({ skipped: 1 });
    expect(await read()).toEqual(before);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual(outbox);
  });
  test('a refused correction never shows as mastery when the pager returns nothing', async () => {
    await write();
    await db.runAsync("update letter_mastery set sync_status = 'terminal'");
    await mastery.saveHistoryPage([], pageOptions());
    expect(await mastery.getLetterMastery({ childId: 'child-1', language: 'en' })).toEqual([]);
    expect((await read()).sync_status).toBe('terminal');
    expect((await db.getFirstAsync('select cursor from sync_state where scope = ?', scope)).cursor).toBe('durable-cursor');
  });
  test('a malformed changed_at rejects the page whole', async () => {
    await expect(mastery.saveHistoryPage([pulled(), pulled({ letter: 'a', changed_at: 'nope' })], pageOptions()))
      .rejects.toMatchObject({ name: 'TypeError', kind: 'query' });
    expect(await db.getAllAsync('select * from letter_mastery')).toEqual([]);
    expect(await db.getAllAsync('select * from sync_state')).toEqual([]);
  });

  test('a null server tuple is lowest and a higher id wins an equal-time tie', async () => {
    await mastery.saveHistoryPage([pulled({ correction_id: LOW })], pageOptions());
    expect(await mastery.saveHistoryPage([pulled({ correction_id: HIGH, confirmed: false })], pageOptions()))
      .toMatchObject({ applied: 1 });
    expect((await read()).confirmed).toBe(0);
    await db.runAsync('update letter_mastery set server_changed_at = null, server_correction_id = null');
    expect(await mastery.saveHistoryPage([pulled({ correction_id: LOW })], pageOptions())).toMatchObject({ applied: 1 });
    expect(await read()).toMatchObject({ confirmed: 1, server_changed_at: T1, server_correction_id: LOW });
    const before = await read();
    await mastery.saveHistoryPage([], pageOptions());
    expect(await read()).toEqual(before);
  });

  test.each(['cancelled', 'resolver'])('a mastery page rolls back its references and cursor on %s', async (failure) => {
    let admissions = 0;
    await expect(mastery.saveHistoryPage([pulled({ child_id: 'unknown-child' })], {
      ...pageOptions(), admit: () => failure !== 'cancelled' || ++admissions === 1,
      pullState: async (txn) => {
        expect(await txn.getFirstAsync('select count(*) as n from letter_mastery')).toEqual({ n: 1 });
        if (failure === 'resolver') throw new Error('bound failed');
        return pageOptions().pullState;
      },
    })).rejects.toMatchObject(failure === 'cancelled' ? { kind: 'cancelled' } : { message: 'bound failed' });
    expect(await db.getAllAsync('select * from letter_mastery')).toEqual([]);
    expect(await db.getAllAsync('select * from sync_state')).toEqual([]);
    expect(await db.getFirstAsync("select id from children where id = 'unknown-child'")).toBeNull();
  });

  test('the delete helper keeps active children covered and empty ids do nothing', async () => {
    expect(letterMasteryHistoryScope('user-1')).toBe(scope);
    await mastery.saveHistoryPage([pulled()], { ...pageOptions(), pullState: { cursor: JSON.stringify({ rescanChildIds: ['child-1'] }) } });
    const before = await db.getFirstAsync('select * from sync_state where scope = ?', scope);
    const row = await read();
    for (const childIds of [[], ['child-1']]) {
      expect(await runRepositoryTransaction(db, (txn) => deleteUndeliveredLetterMastery(txn, { userId: 'user-1', childIds }))).toBe(0);
      expect(await read()).toEqual(row);
      expect(await db.getFirstAsync('select * from sync_state where scope = ?', scope)).toEqual(before);
    }
  });

  test('the delete helper uses at most four statements and drops coverage even when nothing is deleted', async () => {
    const counted = createCountingSqliteTestDatabase();
    try {
      await runMigrations(counted);
      await seedCoreData(counted);
      const repo = createMasteryRepository({ database: counted });
      await repo.saveHistoryPage([pulled()], { ...pageOptions(), pullState: { cursor: JSON.stringify({
        rescanChildIds: ['child-1'], rewalkChildIds: ['child-1'], firstWalkChildIds: ['child-1'],
      }) } });
      await counted.runAsync("update letter_mastery set sync_status = 'terminal'");
      counted.resetQueryLog();
      expect(await runRepositoryTransaction(counted, (txn) => deleteUndeliveredLetterMastery(txn, {
        userId: 'user-1', childIds: ['child-1'],
      }))).toBe(0);
      expect(counted.getQueryLog().filter(({ method }) => method !== 'transaction').length).toBeLessThanOrEqual(4);
      expect(JSON.parse((await counted.getFirstAsync('select cursor from sync_state where scope = ?', scope)).cursor))
        .toEqual({ rescanChildIds: [], rewalkChildIds: [], firstWalkChildIds: [] });
      expect(await counted.getFirstAsync('select sync_status from letter_mastery')).toEqual({ sync_status: 'terminal' });
    } finally { await counted.closeAsync(); }
  });
});
