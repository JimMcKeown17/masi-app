jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createMasteryRepository, applyCorrectionAcknowledgement } from '../src/db/repositories/masteryRepository';
import { letterMasteryDomainId } from '../src/db/domainId';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';

const NOW = '2026-10-21T09:30:00.000Z';
const MON = '2026-10-19T08:00:00.000Z';
const TUE = '2026-10-20T08:00:00.000Z';
const RAW_SERVER_TIME = '2026-10-20T08:00:00.123456+00:00';
const WINNER_ID = '10000000-0000-4000-8000-000000000001';
const key = { childId: 'child-1', letter: 'k', language: 'en' };
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
  repository = createMasteryRepository({ database: db });
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  await db.closeAsync();
});
const readRow = () => db.getFirstAsync('select * from letter_mastery');
const readOutbox = () => db.getAllAsync('select * from sync_outbox order by id');
const change = (overrides = {}) => repository.setLetterMastery({ ...key, confirmed: true, ...overrides });
const seedRow = async (overrides = {}) => {
  const row = {
    id: letterMasteryDomainId(key), child_id: key.childId, letter: key.letter, language: key.language,
    confirmed: 1, changed_at: MON, correction_id: 'seed-correction', changed_by: 'user-1',
    programme_id: 'programme-a', created_at: MON, updated_at: MON, sync_status: 'synced',
    last_sync_error: null, server_updated_at: RAW_SERVER_TIME,
    server_changed_at: MON, server_correction_id: 'server-before',
    ...overrides,
  };
  if (!Object.hasOwn(overrides, 'id')) row.id = letterMasteryDomainId({
    childId: row.child_id, letter: row.letter, language: row.language,
  });
  await db.runAsync(`insert into letter_mastery (${Object.keys(row).join(', ')})
    values (${Object.keys(row).map(() => '?').join(', ')})`, ...Object.values(row));
  return row;
};
const ack = (sent, result, outboxDeleted = true) => db.withExclusiveTransactionAsync(async (txn) => {
  if (outboxDeleted) await txn.runAsync('delete from sync_outbox where record_id = ?', sent.id);
  return applyCorrectionAcknowledgement(txn, {
    recordId: sent.id, sentCorrectionId: sent.correction_id, result, outboxDeleted,
  });
});

test('setLetterMastery stores one pending record under the uuidv5 id and queues one update slot', async () => {
  const result = await change();
  const id = letterMasteryDomainId(key);
  expect(result).toMatchObject({ id, confirmed: true, changed_by: 'user-1', programme_id: 'programme-a', sync_status: 'pending' });
  expect(result.correction_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(await readRow()).toMatchObject({ id, confirmed: 1, changed_by: 'user-1', programme_id: 'programme-a' });
  const [slot] = await readOutbox();
  expect(slot).toMatchObject({ id: `letter_mastery:${id}:update`, record_id: id, operation: 'update', owner_user_id: 'user-1' });
  expect(JSON.parse(slot.payload)).toEqual({
    id, child_id: 'child-1', letter: 'k', language: 'en', confirmed: true,
    changed_at: result.changed_at, correction_id: result.correction_id, changed_by: 'user-1', programme_id: 'programme-a',
  });
  expect(Object.keys(repository).sort()).toEqual([
    'getLetterMastery', 'getUnsyncedRecords', 'saveHistoryPage', 'setLetterMastery',
  ]);
});

test('each change gets a new correction id and replaces the single slot', async () => {
  const changes = [];
  for (const confirmed of [true, false, true]) changes.push(await change({ confirmed }));
  expect(new Set(changes.map((r) => r.correction_id)).size).toBe(3);
  expect(await readOutbox()).toHaveLength(1);
  expect(JSON.parse((await readOutbox())[0].payload)).toMatchObject({ confirmed: true, correction_id: changes[2].correction_id });
});

test.each(['pending', 'failed', 'in_flight', 'terminal', 'synced'])(
  'an older save keeps a newer correction that is still owed (%s)', async (status) => {
    const tuesday = await change({ confirmed: false, changedAt: TUE });
    if (status === 'synced') {
      await db.runAsync('delete from sync_outbox');
      await db.runAsync("update letter_mastery set sync_status = 'synced'");
    } else {
      await db.runAsync("update sync_outbox set status = ? where table_name = 'letter_mastery'", status);
      if (['failed', 'terminal'].includes(status)) await db.runAsync('update letter_mastery set sync_status = ?', status);
    }
    const rowBefore = await readRow();
    const outboxBefore = await readOutbox();
    const result = await change({ changedAt: MON });
    expect(result).not.toHaveProperty('outbox_status');
    if (['pending', 'failed', 'in_flight'].includes(status)) {
      expect(result).toMatchObject({ confirmed: false, changed_at: TUE, correction_id: tuesday.correction_id });
      expect(await readRow()).toEqual(rowBefore);
      expect(await readOutbox()).toEqual(outboxBefore);
    } else {
      expect(result).toMatchObject({ confirmed: true, changed_at: MON });
      expect(result.correction_id).not.toBe(tuesday.correction_id);
      expect(await readRow()).toMatchObject({ confirmed: 1, changed_at: MON, sync_status: 'pending' });
      expect((await readOutbox())[0].status).toBe('pending');
      expect(JSON.parse((await readOutbox())[0].payload)).toMatchObject({ confirmed: true, changed_at: MON, correction_id: result.correction_id });
    }
  }
);

test('a tap made now replaces a queued correction stamped ahead of the clock', async () => {
  jest.useFakeTimers({ now: new Date(NOW) });
  const first = await change();
  const ahead = '2026-10-21T10:30:00.000Z';
  await db.runAsync('update letter_mastery set changed_at = ?', ahead);
  await db.runAsync("update sync_outbox set payload = json_set(payload, '$.changed_at', ?)", ahead);
  const result = await change({ confirmed: false });
  expect(result).toMatchObject({ confirmed: false, changed_at: NOW });
  expect(result.correction_id).not.toBe(first.correction_id);
  expect(await readRow()).toMatchObject({ confirmed: 0, changed_at: NOW });
  expect(JSON.parse((await readOutbox())[0].payload)).toMatchObject({ changed_at: NOW, correction_id: result.correction_id });
});

test('on, off, on in one millisecond keeps the last', async () => {
  jest.useFakeTimers({ now: new Date(NOW) });
  await change();
  await change({ confirmed: false });
  const third = await change();
  expect(await readRow()).toMatchObject({ confirmed: 1, changed_at: NOW, correction_id: third.correction_id });
  expect(await readOutbox()).toHaveLength(1);
  expect(JSON.parse((await readOutbox())[0].payload).correction_id).toBe(third.correction_id);
});

test('changedAt is the tap time, never later than now', async () => {
  jest.useFakeTimers({ now: new Date(NOW) });
  for (const [letter, changedAt, expected] of [
    ['a', MON, MON], ['b', '2099-01-01T00:00:00.000Z', NOW], ['c', undefined, NOW],
  ]) {
    expect(await change({ letter, changedAt })).toMatchObject({ changed_at: expected });
  }
  await expect(change({ letter: 'd', changedAt: 'not a time' })).rejects.toMatchObject({ name: 'TypeError', message: expect.stringContaining('changedAt') });
  expect(await db.getAllAsync("select * from letter_mastery where letter = 'd'")).toEqual([]);
  expect(await readOutbox()).toHaveLength(3);
});

test('refuses a letter outside the order, an unknown language, a label and a non-boolean', async () => {
  for (const [patch, field] of [
    [{ letter: 'ch' }, 'letter'], [{ language: 'zu', letter: 'a' }, 'language'],
    [{ language: 'English', letter: 'a' }, 'language'], [{ confirmed: 'yes' }, 'confirmed'],
    [{ childId: '' }, 'childId'], [{ childId: null }, 'childId'],
    [{ childId: 123 }, 'childId'], [{ changedAt: null }, 'changedAt'],
    [{ changedAt: 123 }, 'changedAt'],
  ]) {
    await expect(change(patch)).rejects.toMatchObject({ name: 'TypeError', message: expect.stringContaining(field) });
  }
  expect(await readRow()).toBeNull();
  expect(await readOutbox()).toEqual([]);
});

test('changed_by is the signed-in EA', async () => {
  bindTestActor(db, 'user-2');
  expect(await change()).toMatchObject({ changed_by: 'user-2', programme_id: null });
  expect((await readOutbox())[0].owner_user_id).toBe('user-2');
  bindTestActor(db, null);
  const before = await readRow();
  const outboxBefore = await readOutbox();
  await expect(change()).rejects.toMatchObject({ message: 'letter_mastery.changed_by requires the signed-in EA' });
  expect(await readRow()).toEqual(before);
  expect(await readOutbox()).toEqual(outboxBefore);
});

test('a record written by another EA in another programme is the same record (C23)', async () => {
  const original = await seedRow({ changed_by: 'user-2', programme_id: 'programme-b' });
  const result = await change();
  expect(await db.getAllAsync('select * from letter_mastery')).toHaveLength(1);
  expect(result).toMatchObject({ id: original.id, changed_by: 'user-1', programme_id: 'programme-a' });
  expect(await readRow()).toMatchObject({
    created_at: MON, server_updated_at: RAW_SERVER_TIME, server_changed_at: MON, server_correction_id: 'server-before',
  });
});

test('getLetterMastery has no user or programme filter and hides terminal rows', async () => {
  await seedRow({ letter: 'a', language: 'xh' });
  await seedRow({ letter: 'b', language: 'xh', changed_by: 'user-2', programme_id: 'programme-b' });
  await seedRow({ letter: 'c', language: 'xh', confirmed: 0 });
  await seedRow({ letter: 'd', language: 'xh', sync_status: 'terminal' });
  await seedRow({ letter: 'e', language: 'en' });
  await db.runAsync("insert into children (id, first_name, last_name) values ('child-2', 'Other', 'Child')");
  await seedRow({ child_id: 'child-2', letter: 'a', language: 'xh' });
  const rows = await repository.getLetterMastery({ childId: 'child-1', language: 'xh' });
  expect(rows.map((r) => [r.letter, r.confirmed])).toEqual([['a', true], ['b', true], ['c', false]]);
  expect(await repository.getLetterMastery({ childIds: [] })).toEqual([]);
  for (const filter of [{ userId: 'user-1' }, { programmeId: 'programme-a' }, { userId: undefined }, { programmeId: undefined }]) {
    await expect(repository.getLetterMastery(filter)).rejects.toMatchObject({
      name: 'TypeError', message: 'getLetterMastery takes no userId or programmeId',
    });
  }
});

test('getLetterMastery chunks childIds by 500 and orders the combined result by child_id and letter', async () => {
  await seedRow();
  await db.runAsync("insert into children (id, first_name, last_name) values ('child-2', 'Other', 'Child'), ('child-3', 'Third', 'Child')");
  await seedRow({ child_id: 'child-2', letter: 'b' });
  await seedRow({ child_id: 'child-3', letter: 'a' });
  const get = jest.spyOn(db, 'getAllAsync');
  const childIds = ['child-3', ...Array.from({ length: 999 }, (_, i) => 'missing-' + i), 'child-1'];
  childIds[501] = 'child-2';
  expect((await repository.getLetterMastery({ childIds, language: 'en' })).map((row) => [row.child_id, row.letter]))
    .toEqual([['child-1', 'k'], ['child-2', 'b'], ['child-3', 'a']]);
  const probes = get.mock.calls.filter(([sql]) => /from letter_mastery/i.test(sql));
  expect(probes).toHaveLength(3);
  expect(probes.every(([, ...params]) => params.length <= 501)).toBe(true);
  expect((await repository.getLetterMastery({ childIds: ['child-1', 'child-1'] })).length).toBe(1);
});

test('writes share the caller transaction and roll back the record and outbox together', async () => {
  const failure = new Error('abort caller transaction');
  await expect(db.withExclusiveTransactionAsync(async (transaction) => {
    await change({ transaction });
    throw failure;
  })).rejects.toMatchObject({ message: failure.message });
  expect(await readRow()).toBeNull();
  expect(await readOutbox()).toEqual([]);
  await db.execAsync(`create trigger fail_mastery_outbox before insert on sync_outbox
    when new.table_name = 'letter_mastery' begin select raise(abort, 'outbox refused'); end;`);
  await expect(change()).rejects.toMatchObject({ message: 'outbox refused' });
  expect(await readRow()).toBeNull();
});

test('the write budget is one keyed read and two writes, with an optional programme read', async () => {
  const get = jest.spyOn(db, 'getFirstAsync');
  const run = jest.spyOn(db, 'runAsync');
  await change({ programmeId: 'programme-a', transaction: db, changedAt: TUE });
  expect(get).toHaveBeenCalledTimes(1);
  expect(run).toHaveBeenCalledTimes(2);
  get.mockClear(); run.mockClear();
  await change({ programmeId: 'programme-a', transaction: db, changedAt: MON });
  expect(get).toHaveBeenCalledTimes(1);
  expect(run).not.toHaveBeenCalled();
  get.mockClear();
  await change({ transaction: db });
  expect(get).toHaveBeenCalledTimes(2);
  expect(run).toHaveBeenCalledTimes(2);
});

test('getUnsyncedRecords stays available and maps confirmed as a boolean', async () => {
  await seedRow({ sync_status: 'pending', confirmed: 0 });
  expect(await repository.getUnsyncedRecords()).toEqual([expect.objectContaining({ confirmed: false, sync_status: 'pending' })]);
});

test('superseded replaces the local value with the winner', async () => {
  const sent = await change();
  await db.runAsync("update letter_mastery set last_sync_error = 'old error'");
  expect(await ack(sent, winner())).toBe('written');
  expect(await readRow()).toMatchObject({
    confirmed: 0, changed_at: RAW_SERVER_TIME, correction_id: WINNER_ID, changed_by: 'user-2',
    server_changed_at: RAW_SERVER_TIME, server_correction_id: WINNER_ID,
    sync_status: 'synced', last_sync_error: null, programme_id: null,
  });
});

test('applied writes the returned record and keeps programme context', async () => {
  const sent = await change();
  expect(await ack(sent, { ...winner('applied'), correction_id: sent.correction_id, changed_by: 'user-1' })).toBe('written');
  expect(await readRow()).toMatchObject({ programme_id: 'programme-a', changed_at: RAW_SERVER_TIME, sync_status: 'synced' });
});

test('acknowledged deletes the row when its sent correction was finalized', async () => {
  const sent = await change();
  expect(await ack(sent, acknowledged)).toBe('deleted');
  expect(await readRow()).toBeNull();
});

test.each(['applied', 'superseded', 'acknowledged'])('a missing row returns none for %s', async (outcome) => {
  expect(await applyCorrectionAcknowledgement(db, {
    recordId: 'missing', sentCorrectionId: 'missing', result: outcome === 'acknowledged' ? acknowledged : winner(outcome), outboxDeleted: true,
  })).toBe('none');
});

test.each([false, true])('a newer local correction survives an older acknowledgement (outboxDeleted=%s)', async (outboxDeleted) => {
  const sent = await change();
  const newer = await change({ confirmed: false });
  const before = await readRow();
  const outboxBefore = await readOutbox();
  expect(await applyCorrectionAcknowledgement(db, {
    recordId: sent.id, sentCorrectionId: sent.correction_id, result: winner(), outboxDeleted,
  })).toBe('ordering_only');
  expect(await readRow()).toEqual({ ...before, server_changed_at: RAW_SERVER_TIME, server_correction_id: WINNER_ID });
  expect((await readRow()).correction_id).toBe(newer.correction_id);
  expect(await readOutbox()).toEqual(outboxBefore);
});

test.each(['applied', 'superseded'])('a matching correction without outbox deletion updates only ordering for %s', async (outcome) => {
  const sent = await change();
  const before = await readRow();
  const outboxBefore = await readOutbox();
  expect(await applyCorrectionAcknowledgement(db, {
    recordId: sent.id, sentCorrectionId: sent.correction_id, result: winner(outcome), outboxDeleted: false,
  })).toBe('ordering_only');
  expect(await readRow()).toEqual({ ...before, server_changed_at: RAW_SERVER_TIME, server_correction_id: WINNER_ID });
  expect(await readOutbox()).toEqual(outboxBefore);
});

test.each(['newer', 'not-deleted'])('acknowledged leaves newer work untouched (%s)', async (mode) => {
  const sent = await change();
  if (mode === 'newer') await change({ confirmed: false });
  const before = await readRow();
  const outboxBefore = await readOutbox();
  expect(await applyCorrectionAcknowledgement(db, {
    recordId: sent.id, sentCorrectionId: sent.correction_id, result: acknowledged, outboxDeleted: mode === 'newer',
  })).toBe('none');
  expect(await readRow()).toEqual(before);
  expect(await readOutbox()).toEqual(outboxBefore);
});
