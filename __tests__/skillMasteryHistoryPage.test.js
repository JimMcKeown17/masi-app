jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ ...require('../test-support/supabaseTestConfig'), supabase: {} }));
import { runMigrations } from '../src/db/migrations';
import { createSkillMasteryRepository, deleteUndeliveredSkillMastery, skillMasteryHistoryScope } from '../src/db/repositories/skillMasteryRepository';
import { skillMasteryDomainId } from '../src/db/domainId';
import { runRepositoryTransaction } from '../src/db/repositories/repositoryRuntime';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';
import { createCountingSqliteTestDatabase } from '../test-support/countingSqliteAdapter';

const T1 = '2026-10-20T08:00:00.000001+00:00';
const T2 = '2026-10-20T08:00:00.000002+00:00';
const T3 = '2026-10-20T08:00:00.000003+00:00';
const LOW = '10000000-0000-4000-8000-000000000000';
const MID = '80000000-0000-4000-8000-000000000000';
const HIGH = 'e0000000-0000-4000-8000-000000000000';
const scope = 'skill_mastery_pull:user-1';
const pageOptions = () => ({ scope, pullState: { lastPulledAt: T3, cursor: 'durable-cursor' }, admit: () => true });
const pulled = (extra = {}) => {
  const row = { child_id: 'child-1', step_key: 'add.5', confirmed: true,
    changed_at: T1, correction_id: HIGH, changed_by: 'user-2', programme_id: null,
    created_at: T1, updated_at: T2, child_first_name: 'Server', child_last_name: 'Child', child_preferred_name: null,
    ...extra };
  return { ...row, id: skillMasteryDomainId(row.child_id, row.step_key) };
};

describe('skill mastery history page', () => {
  let db;
  let mastery;
  const read = () => db.getFirstAsync('select * from skill_mastery where id = ?', pulled().id);
  const write = () => mastery.setSkillMastery({ childId: 'child-1', stepKey: 'add.5', confirmed: false });
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    bindTestActor(db, 'user-1');
    await seedCoreData(db);
    await db.runAsync("insert into children (id, first_name, last_name) values ('child-1', 'Local', 'Child')");
    await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, assigned_at, sync_status) values ('cea-1', 'user-1', 'child-1', '2026-01-15', 'synced')");
    mastery = createSkillMasteryRepository({ database: db });
  });
  afterEach(async () => { await db.closeAsync(); });

  test('absent rows insert with their server tuple; an unknown child becomes a reference child', async () => {
    const row = pulled({ child_id: 'unknown-child', confirmed: false });
    expect(await mastery.saveHistoryPage([row], pageOptions())).toEqual({ inserted: 1, applied: 0, skipped: 0 });
    expect(await db.getFirstAsync('select confirmed, server_changed_at, server_correction_id, sync_status, server_updated_at from skill_mastery where id = ?', row.id))
      .toEqual({ confirmed: 0, server_changed_at: T1, server_correction_id: HIGH, sync_status: 'synced', server_updated_at: T2 });
    expect(await db.getFirstAsync("select first_name, history_reference from children where id = 'unknown-child'"))
      .toEqual({ first_name: 'Server', history_reference: 1 });
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });
  test('a pending local tick is left alone', async () => {
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
      // An equal immutable tuple carries the same accepted value; a lower tuple may differ.
      expect(await mastery.saveHistoryPage([pulled({ confirmed: correction_id === HIGH, correction_id })], pageOptions())).toEqual({ inserted: 0, applied: 0, skipped: 1 });
      expect(await read()).toEqual(before);
    }
    expect(await mastery.saveHistoryPage([pulled({ confirmed: false, changed_at: T2, correction_id: MID })], pageOptions())).toEqual({ inserted: 0, applied: 1, skipped: 0 });
    expect(await read()).toMatchObject({ confirmed: 0, server_changed_at: T2, server_correction_id: MID });
  });

  test('an in-flight correction blocks the merge', async () => {
    await write();
    await db.runAsync("update sync_outbox set status = 'in_flight'");
    // Acknowledgement ordering alone may be known while the newer local slot is still owed.
    await db.runAsync("update skill_mastery set sync_status = 'synced'");
    const before = await read();
    const outbox = await db.getAllAsync('select * from sync_outbox');
    expect(await mastery.saveHistoryPage([pulled({ changed_at: T3 })], pageOptions())).toMatchObject({ skipped: 1 });
    expect(await read()).toEqual(before);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual(outbox);
  });
  test('a null server tuple is lowest and a higher id wins an equal-time tie', async () => {
    await mastery.saveHistoryPage([pulled({ correction_id: LOW })], pageOptions());
    expect(await mastery.saveHistoryPage([pulled({ correction_id: HIGH, confirmed: false })], pageOptions()))
      .toMatchObject({ applied: 1 });
    expect((await read()).confirmed).toBe(0);
    await db.runAsync('update skill_mastery set server_changed_at = null, server_correction_id = null');
    expect(await mastery.saveHistoryPage([pulled({ correction_id: LOW })], pageOptions())).toMatchObject({ applied: 1 });
    expect(await read()).toMatchObject({ confirmed: 1, server_changed_at: T1, server_correction_id: LOW });
    const before = await read();
    await mastery.saveHistoryPage([], pageOptions());
    expect(await read()).toEqual(before);
  });

  test('the delete helper uses at most four statements and drops coverage even when nothing is deleted', async () => {
    const counted = createCountingSqliteTestDatabase();
    try {
      await runMigrations(counted);
      await seedCoreData(counted);
      const repo = createSkillMasteryRepository({ database: counted });
      await repo.saveHistoryPage([pulled()], { ...pageOptions(), pullState: { cursor: JSON.stringify({
        rescanChildIds: ['child-1'], rewalkChildIds: ['child-1'], firstWalkChildIds: ['child-1'],
      }) } });
      await counted.runAsync("update skill_mastery set sync_status = 'terminal'");
      counted.resetQueryLog();
      expect(await runRepositoryTransaction(counted, (txn) => deleteUndeliveredSkillMastery(txn, {
        userId: 'user-1', childIds: ['child-1'],
      }))).toBe(0);
      expect(counted.getQueryLog().filter(({ method }) => method !== 'transaction').length).toBeLessThanOrEqual(4);
      expect(JSON.parse((await counted.getFirstAsync('select cursor from sync_state where scope = ?', scope)).cursor))
        .toEqual({ rescanChildIds: [], rewalkChildIds: [], firstWalkChildIds: [] });
      expect(await counted.getFirstAsync('select sync_status from skill_mastery')).toEqual({ sync_status: 'terminal' });
    } finally { await counted.closeAsync(); }
  });

  test('a well-formed step key outside the bundled edition is stored, not rejected', async () => {
    const row = pulled({ step_key: 'add.25' });
    expect(await mastery.saveHistoryPage([row], pageOptions())).toEqual({ inserted: 1, applied: 0, skipped: 0 });
    expect(await mastery.getSkillMastery({ childId: 'child-1' })).toEqual([expect.objectContaining({ step_key: 'add.25' })]);
  });
  test('a malformed step key rejects the page whole', async () => {
    await mastery.saveHistoryPage([], pageOptions());
    const before = await db.getAllAsync('select * from sync_state');
    let error;
    try { await mastery.saveHistoryPage([pulled(), pulled({ step_key: 'Add.5' })], pageOptions()); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(TypeError);
    expect(error.kind).toBe('query');
    expect(await db.getAllAsync('select * from skill_mastery')).toEqual([]);
    expect(await db.getAllAsync('select * from sync_state')).toEqual(before);
  });
  test('a terminal row takes a newer or equal tuple without touching its terminal slot', async () => {
    await write();
    await db.runAsync("update sync_outbox set status = 'terminal'");
    await db.runAsync("update skill_mastery set sync_status = 'terminal', server_changed_at = ?, server_correction_id = ?", T1, HIGH);
    const outbox = await db.getAllAsync('select * from sync_outbox');
    for (const changed_at of [T1, T2]) {
      await db.runAsync("update skill_mastery set sync_status = 'terminal'");
      expect(await mastery.saveHistoryPage([pulled({ changed_at })], pageOptions())).toMatchObject({ applied: 1 });
      expect(await read()).toMatchObject({ sync_status: 'synced', server_changed_at: changed_at });
      expect(await db.getAllAsync('select * from sync_outbox')).toEqual(outbox);
    }
  });
  test('cancellation after the rows rolls back rows and cursor together', async () => {
    await mastery.saveHistoryPage([], pageOptions());
    const before = await db.getAllAsync('select * from sync_state');
    let admissions = 0, error;
    try {
      await mastery.saveHistoryPage([pulled({ child_id: 'unknown-child' })], {
        ...pageOptions(), admit: () => ++admissions === 1,
        pullState: async txn => {
          expect(await txn.getFirstAsync('select count(*) n from skill_mastery')).toEqual({ n: 1 });
          return { cursor: 'new-cursor' };
        },
      });
    } catch (caught) { error = caught; }
    expect(error).toMatchObject({ kind: 'cancelled' });
    expect(await db.getAllAsync('select * from skill_mastery')).toEqual([]);
    expect(await db.getAllAsync('select * from sync_state')).toEqual(before);
    expect(await db.getFirstAsync("select id from children where id = 'unknown-child'")).toBeNull();
  });
});
