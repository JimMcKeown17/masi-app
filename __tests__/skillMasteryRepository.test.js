jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createSkillMasteryRepository, applyCorrectionAcknowledgement } from '../src/db/repositories/skillMasteryRepository';
import { skillMasteryDomainId } from '../src/db/domainId';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const NOW = '2026-10-21T09:30:00.000Z';
const MON = '2026-10-19T08:00:00.000Z';
const TUE = '2026-10-20T08:00:00.000Z';
const RAW_SERVER_TIME = '2026-10-20T08:00:00.123456+00:00';
const WINNER_ID = '10000000-0000-4000-8000-000000000001';
const key = { childId: 'child-1', stepKey: 'add.5' };
const winner = (outcome = 'superseded') => ({
  outcome, confirmed: false, changed_at: RAW_SERVER_TIME,
  correction_id: WINNER_ID, changed_by: 'user-2',
});
const acknowledged = { outcome: 'acknowledged', confirmed: null, changed_at: null, correction_id: null, changed_by: null };
let db;
let repository;

beforeEach(async () => {
  db = await createMigratedDatabase(runMigrations);
  await seedCoreData(db);
  await db.runAsync("insert into children (id, first_name, last_name) values ('child-1', 'Test', 'Child')");
  await db.runAsync(`insert into child_ea_assignments (id, child_id, user_id, sync_status)
    values ('delivery-user-1', 'child-1', 'user-1', 'synced')`);
  repository = createSkillMasteryRepository({ database: db });
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  await db.closeAsync();
});
const readRow = () => db.getFirstAsync('select * from skill_mastery');
const readOutbox = () => db.getAllAsync('select * from sync_outbox order by id');
const change = (overrides = {}) => repository.setSkillMastery({ ...key, confirmed: true, ...overrides });
const seedRow = async (overrides = {}) => {
  const row = {
    id: skillMasteryDomainId(key.childId, key.stepKey), child_id: key.childId, step_key: key.stepKey,
    confirmed: 1, changed_at: MON, correction_id: 'seed-correction', changed_by: 'user-1',
    programme_id: 'programme-a', created_at: MON, updated_at: MON, sync_status: 'synced',
    last_sync_error: null, server_updated_at: RAW_SERVER_TIME,
    server_changed_at: MON, server_correction_id: 'server-before',
    ...overrides,
  };
  if (!Object.hasOwn(overrides, 'id')) row.id = skillMasteryDomainId(row.child_id, row.step_key);
  await db.runAsync(`insert into skill_mastery (${Object.keys(row).join(', ')})
    values (${Object.keys(row).map(() => '?').join(', ')})`, ...Object.values(row));
  return row;
};
const ack = (sent, result, outboxDeleted = true) => db.withExclusiveTransactionAsync(async (txn) => {
  if (outboxDeleted) await txn.runAsync('delete from sync_outbox where record_id = ?', sent.id);
  return applyCorrectionAcknowledgement(txn, {
    recordId: sent.id, sentCorrectionId: sent.correction_id, result, outboxDeleted,
  });
});

const rejection = async (promise) => {
  try { await promise; } catch (error) { return error; }
  throw new Error('Expected rejection');
};

test('setSkillMastery stores one pending record under the uuidv5 id and queues one update slot', async () => {
  const result = await change();                       // confirmed: true
  const id = skillMasteryDomainId('child-1', 'add.5');
  expect(result).toMatchObject({ id, step_key: 'add.5', confirmed: true, changed_by: 'user-1', programme_id: 'programme-a', sync_status: 'pending' });
  const [slot] = await readOutbox();
  expect(slot).toMatchObject({ id: `skill_mastery:${id}:update`, record_id: id, operation: 'update', owner_user_id: 'user-1' });
  expect(JSON.parse(slot.payload)).toEqual({ id, child_id: 'child-1', step_key: 'add.5', confirmed: true,
    changed_at: result.changed_at, correction_id: result.correction_id, changed_by: 'user-1', programme_id: 'programme-a' });
  expect(Object.keys(repository).sort()).toEqual(['getSkillCorrectionTimes', 'getSkillMastery', 'saveHistoryPage', 'setSkillMastery']);
});

test('each change gets a new correction id and replaces the single slot', async () => {
  const changes = [];
  for (const confirmed of [true, false, true]) changes.push(await change({ confirmed }));
  expect(new Set(changes.map(row => row.correction_id)).size).toBe(3);
  changes.forEach(row => expect(row.correction_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
  expect(await readOutbox()).toHaveLength(1);
  expect(JSON.parse((await readOutbox())[0].payload)).toMatchObject({ confirmed: true, correction_id: changes[2].correction_id });
  expect(await readRow()).toMatchObject({ confirmed: 1, correction_id: changes[2].correction_id });
});

test('a step key outside the bundled curriculum is refused before any write', async () => {
  for (const stepKey of ['add.25', 'unknown.5', 'Add.5']) {
    const error = await rejection(change({ stepKey }));
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toBe('stepKey must be a step in the bundled curriculum');
    expect(await readRow()).toBeNull();
    expect(await readOutbox()).toEqual([]);
  }
});

test('a child without active delivery is refused with NOT_DELIVERY_CHILD', async () => {
  await db.runAsync('update child_ea_assignments set unassigned_at = assigned_at');
  expect(await rejection(change())).toMatchObject({ code: 'NOT_DELIVERY_CHILD', message: 'Skill mastery requires an active delivery assignment' });
  expect(await readRow()).toBeNull();
  expect(await readOutbox()).toEqual([]);
});

test('an older tap never replaces a newer owed correction', async () => {
  const tuesday = await change({ confirmed: false, changedAt: TUE });
  const before = await readRow();
  const slots = await readOutbox();
  expect(await change({ changedAt: MON })).toEqual(tuesday);
  expect(await readRow()).toEqual(before);
  expect(await readOutbox()).toEqual(slots);
});

test('a future tap is clamped to now', async () => {
  jest.useFakeTimers({ now: new Date(NOW) });
  expect(await change({ changedAt: '2026-10-22T09:30:00.000Z' })).toMatchObject({ changed_at: NOW });
  expect(await readRow()).toMatchObject({ changed_at: NOW });
  expect(JSON.parse((await readOutbox())[0].payload).changed_at).toBe(NOW);
});

test('getSkillMastery reads every EA and Programme, hides terminal rows, rejects user and programme filters', async () => {
  await seedRow({ step_key: 'add.10', changed_by: 'user-2', programme_id: 'programme-b' });
  await seedRow({ confirmed: 0 });
  await seedRow({ step_key: 'add.20', sync_status: 'terminal' });
  await db.runAsync("insert into children (id, first_name, last_name) values ('child-2', 'Other', 'Child'), ('child-3', 'Third', 'Child')");
  await seedRow({ child_id: 'child-2' });
  await seedRow({ child_id: 'child-3' });
  expect((await repository.getSkillMastery({ childId: 'child-1' })).map(row => [row.step_key, row.confirmed, row.changed_by, row.programme_id]))
    .toEqual([['add.10', true, 'user-2', 'programme-b'], ['add.5', false, 'user-1', 'programme-a']]);
  expect(await repository.getSkillMastery({ childIds: [] })).toEqual([]);
  const childIds = ['child-3', ...Array.from({ length: 999 }, (_, i) => 'missing-' + i), 'child-1'];
  childIds[501] = 'child-2';
  expect((await repository.getSkillMastery({ childIds })).map(row => [row.child_id, row.step_key]))
    .toEqual([['child-1', 'add.10'], ['child-1', 'add.5'], ['child-2', 'add.5'], ['child-3', 'add.5']]);
  expect(await repository.getSkillMastery()).toHaveLength(4);
  expect(await repository.getSkillMastery({ childIds: ['child-1', 'child-1'] })).toHaveLength(2);
  for (const filter of [{ userId: 'user-1' }, { programmeId: 'programme-a' }, { userId: undefined }, { programmeId: undefined }]) {
    expect(await rejection(repository.getSkillMastery(filter))).toBeInstanceOf(TypeError);
  }
});

test('getSkillCorrectionTimes takes the newer of row and owed payload per child and step', async () => {
  await change({ changedAt: TUE });
  await db.runAsync("update skill_mastery set changed_at = ?, sync_status = 'terminal'", MON);
  await db.runAsync("update sync_outbox set status = 'terminal'");
  await seedRow({ step_key: 'add.10', changed_at: TUE });
  expect(await repository.getSkillCorrectionTimes({ childIds: ['child-1', 'missing'] }))
    .toEqual({ 'child-1': { 'add.5': TUE, 'add.10': TUE }, missing: {} });
  await db.runAsync('update skill_mastery set changed_at = ? where step_key = ?', RAW_SERVER_TIME, 'add.5');
  expect(await repository.getSkillCorrectionTimes({ childIds: ['child-1'], transaction: db }))
    .toEqual({ 'child-1': { 'add.5': RAW_SERVER_TIME, 'add.10': TUE } });
  expect(await repository.getSkillCorrectionTimes({ childIds: [] })).toEqual({});
});

test('applyCorrectionAcknowledgement: applied and superseded write the winner; superseded clears programme context', async () => {
  for (const outcome of ['applied', 'superseded']) {
    const sent = await change();
    await db.runAsync("update skill_mastery set last_sync_error = 'old error'");
    expect(await ack(sent, winner(outcome))).toBe('written');
    expect(await readRow()).toMatchObject({
      confirmed: 0, changed_at: RAW_SERVER_TIME, correction_id: WINNER_ID, changed_by: 'user-2',
      server_changed_at: RAW_SERVER_TIME, server_correction_id: WINNER_ID,
      sync_status: 'synced', last_sync_error: null, programme_id: outcome === 'superseded' ? null : 'programme-a',
    });
  }
});

test('applyCorrectionAcknowledgement: acknowledged deletes the row only when the CAS deleted the slot', async () => {
  const sent = await change();
  const before = await readRow();
  const slots = await readOutbox();
  expect(await ack(sent, acknowledged, false)).toBe('none');
  expect(await readRow()).toEqual(before);
  expect(await readOutbox()).toEqual(slots);
  expect(await ack(sent, acknowledged)).toBe('deleted');
  expect(await readRow()).toBeNull();
  expect(await readOutbox()).toEqual([]);
  expect(await ack(sent, acknowledged)).toBe('none');
});

test('applyCorrectionAcknowledgement: a newer owed slot keeps content and takes only server ordering', async () => {
  const sent = await change();
  const newer = await change({ confirmed: false });
  const before = await readRow();
  const slots = await readOutbox();
  for (const outboxDeleted of [false, true]) {
    expect(await applyCorrectionAcknowledgement(db, {
      recordId: sent.id, sentCorrectionId: sent.correction_id, result: winner(), outboxDeleted,
    })).toBe('ordering_only');
    expect(await readRow()).toEqual({ ...before, server_changed_at: RAW_SERVER_TIME, server_correction_id: WINNER_ID });
    expect((await readRow()).correction_id).toBe(newer.correction_id);
    expect(await readOutbox()).toEqual(slots);
    expect(await applyCorrectionAcknowledgement(db, {
      recordId: sent.id, sentCorrectionId: sent.correction_id, result: acknowledged, outboxDeleted,
    })).toBe('none');
    expect(await readOutbox()).toEqual(slots);
  }
});

test('the signed-in handle exposes repositories.skillMastery bound to its EA', async () => {
  const { getDefaultTestHandle } = require('../test-support/defaultTestHandle');
  const handle = getDefaultTestHandle();
  await handle.withTransaction(async txn => {
    await seedCoreData(txn, { includeStaffProgrammeAssignment: false });
    await txn.runAsync("insert into children (id, first_name, last_name) values ('child-1', 'Test', 'Child')");
    await txn.runAsync("insert into child_ea_assignments (id, child_id, user_id, sync_status) values ('delivery', 'child-1', ?, 'synced')", handle.userId);
  });
  const bound = handle.services.repositories.skillMastery;
  expect(bound).toBe(handle.repositories.skillMastery);
  expect(Object.keys(bound).sort()).toEqual(['getSkillCorrectionTimes', 'getSkillMastery', 'saveHistoryPage', 'setSkillMastery']);
  const result = await bound.setSkillMastery({ ...key, confirmed: true });
  expect(result.changed_by).toBe(handle.userId);
  const reader = await handle.getReader();
  expect(await reader.getFirstAsync('select changed_by from skill_mastery')).toEqual({ changed_by: handle.userId });
  expect(await reader.getFirstAsync('select owner_user_id from sync_outbox')).toEqual({ owner_user_id: handle.userId });
  expect(await readRow()).toBeNull();
});
