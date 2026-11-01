jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { v4 as uuid } from 'uuid';
import { createFamilySyncFixture } from '../test-support/assessmentFamilySyncTestUtils';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { createSkillMasteryRepository } from '../src/db/repositories/skillMasteryRepository';
import { AUTHENTICATED_DENIAL_MARKER } from '../src/services/offlineSync';

const MON = '2026-10-19T08:00:00.000Z';
const TUE = '2026-10-20T08:00:00.000Z';
// Keep sub-millisecond precision and the server's offset syntax intact.
const SERVER_TIME = '2026-10-20T08:00:00.123456+00:00';
const OTHER_EA = '00000000-0000-4000-8000-000000000909';
const winner = (overrides = {}) => ({
  outcome: 'applied', confirmed: true, changed_at: SERVER_TIME,
  correction_id: uuid(), changed_by: OTHER_EA, ...overrides,
});
const reply = result => ({ data: [result], error: null });

describe('skill mastery correction sync', () => {
  let f, mastery, client;
  beforeEach(async () => {
    f = await createFamilySyncFixture({ withDelivery: true });
    mastery = createSkillMasteryRepository({ database: f.db });
    ({ supabaseClient: client } = createSupabaseMock({ rpcResults: {
      set_skill_mastery: reply(winner()),
    } }));
  });
  afterEach(async () => { jest.useRealTimers(); await f.db.closeAsync(); });
  const write = overrides => mastery.setSkillMastery({
    childId: f.childId, stepKey: 'add.5', confirmed: true, ...overrides,
  });
  const read = () => f.db.getFirstAsync("select * from skill_mastery where step_key = 'add.5'");

  test('one tick is one set_skill_mastery call with exactly its five arguments', async () => {
    const written = await write();
    client.rpc.mockResolvedValueOnce(reply(winner({ correction_id: written.correction_id, changed_by: f.userId })));
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(client.rpc).toHaveBeenCalledWith('set_skill_mastery', {
      p_correction_id: written.correction_id, p_child_id: f.childId, p_step_key: 'add.5',
      p_confirmed: true, p_changed_at: written.changed_at,
    });
    expect(Object.keys(client.rpc.mock.calls[0][1]).sort()).toEqual(['p_changed_at', 'p_child_id', 'p_confirmed', 'p_correction_id', 'p_step_key']);
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc.mock.calls[0][1]).not.toHaveProperty('updated_at');
    expect(client.from).not.toHaveBeenCalled();
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });

  test('applied writes the returned record and the server ordering columns', async () => {
    const written = await write();
    const result = winner({ correction_id: written.correction_id, changed_by: f.userId });
    client.rpc.mockResolvedValueOnce(reply(result));
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1 });
    expect(await read()).toMatchObject({
      confirmed: 1, changed_at: SERVER_TIME, correction_id: written.correction_id, changed_by: f.userId,
      server_changed_at: SERVER_TIME, server_correction_id: written.correction_id,
      sync_status: 'synced', last_sync_error: null, programme_id: f.programmeId,
    });
    expect(await mastery.getSkillMastery({ childId: f.childId }))
      .toEqual([expect.objectContaining({ confirmed: true, changed_at: SERVER_TIME })]);
  });

  test('superseded shows the winner at once', async () => {
    await write();
    const result = winner({ outcome: 'superseded', confirmed: false });
    client.rpc.mockResolvedValueOnce(reply(result));
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1 });
    expect(await read()).toMatchObject({
      confirmed: 0, changed_at: SERVER_TIME, correction_id: result.correction_id, changed_by: OTHER_EA,
      server_changed_at: SERVER_TIME, server_correction_id: result.correction_id,
      sync_status: 'synced', programme_id: null,
    });
    expect(await mastery.getSkillMastery({ childId: f.childId }))
      .toEqual([expect.objectContaining({ confirmed: false, changed_by: OTHER_EA })]);
  });

  test('acknowledged deletes the local row', async () => {
    await write();
    client.rpc.mockResolvedValueOnce(reply({
      outcome: 'acknowledged', confirmed: null, changed_at: null, correction_id: null, changed_by: null,
    }));
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1 });
    expect(await read()).toBeNull();
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });

  test('a newer tick made while the call is in flight survives the acknowledgement', async () => {
    const first = await write({ changedAt: MON });
    let newer;
    client.rpc.mockImplementationOnce(async () => {
      newer = await write({ confirmed: false, changedAt: TUE });
      return reply(winner({ correction_id: first.correction_id, changed_at: MON, changed_by: f.userId }));
    });
    const engine = f.engine(client);
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 1 });
    expect(await read()).toMatchObject({
      confirmed: 0, correction_id: newer.correction_id, changed_at: TUE, sync_status: 'pending',
      server_changed_at: MON, server_correction_id: first.correction_id,
    });
    const [slot] = await f.db.getAllAsync('select * from sync_outbox');
    expect(slot.status).toBe('pending');
    expect(JSON.parse(slot.payload).correction_id).toBe(newer.correction_id);
    client.rpc.mockResolvedValueOnce(reply(winner({ confirmed: false, correction_id: newer.correction_id, changed_at: TUE, changed_by: f.userId })));
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 1 });
    expect(client.rpc.mock.calls[1][1].p_correction_id).toBe(newer.correction_id);
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });

  test('two steps are two calls; skill_mastery is never batched or upserted', async () => {
    await write(); await write({ stepKey: 'add.10' });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 2, totalFailed: 0 });
    expect(client.rpc).toHaveBeenCalledTimes(2);
    expect(client.rpc.mock.calls.map(([, args]) => args.p_step_key).sort()).toEqual(['add.10', 'add.5']);
    expect(client.from).not.toHaveBeenCalled();
  });

  test('42501 stays retriable while the child assignment is pending, then terminal with the authenticated marker', async () => {
    await write();
    const { id: assignmentId } = await f.db.getFirstAsync(
      'select id from child_ea_assignments where child_id = ? and user_id = ? and unassigned_at is null', f.childId, f.userId);
    await f.db.runAsync("update child_ea_assignments set sync_status = 'pending' where id = ?", assignmentId);
    await f.outbox.enqueue({ tableName: 'child_ea_assignments', recordId: assignmentId, operation: 'insert', payload: { id: assignmentId, user_id: f.userId, child_id: f.childId } });
    client.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'RLS denied' } });
    const engine = f.engine(client);
    expect(await engine.syncAll({ tableName: 'skill_mastery' })).toMatchObject({ totalRetriable: 1, totalTerminal: 0 });
    expect(await read()).toMatchObject({ sync_status: 'failed' });
    await f.db.runAsync("delete from sync_outbox where table_name = 'child_ea_assignments'");
    await f.db.runAsync("update child_ea_assignments set sync_status = 'synced' where id = ?", assignmentId);
    expect(await engine.syncAll({ tableName: 'skill_mastery', force: true })).toMatchObject({ totalTerminal: 1 });
    expect(await read()).toMatchObject({ sync_status: 'terminal', last_sync_error: `${AUTHENTICATED_DENIAL_MARKER} RLS denied` });
  });

  test('a failure after the outbox delete rolls back the write-back', async () => {
    const written = await write({ changedAt: MON });
    const [slot] = await f.db.getAllAsync('select * from sync_outbox');
    // Fail content acknowledgement, after the outbox CAS and sync bookkeeping.
    await f.db.runAsync(`create trigger refuse_mastery_ack before update of confirmed on skill_mastery
      begin select raise(abort, 'ack write-back refused'); end`);
    client.rpc.mockResolvedValueOnce(reply(winner({ confirmed: false })));
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 0, totalRetriable: 1 });
    expect(await read()).toMatchObject({
      confirmed: 1, changed_at: MON, correction_id: written.correction_id, changed_by: f.userId,
      server_changed_at: null, server_correction_id: null,
    });
    // The existing engine then records retry/backoff; the slot and its payload survive.
    expect(await f.db.getFirstAsync('select * from sync_outbox')).toMatchObject({
      id: slot.id, payload: slot.payload, status: 'failed', last_error: expect.stringContaining('ack write-back refused'),
    });
  });
  test.each(['MA001', '22023', 'UNEXPECTED_RPC_RESULT'])('%s is terminal', async code => {
    await write();
    client.rpc.mockResolvedValueOnce(code === 'UNEXPECTED_RPC_RESULT'
      ? { data: [{ outcome: 'bogus' }], error: null }
      : { data: null, error: { code, message: 'refused correction' } });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalTerminal: 1, totalSynced: 0 });
    expect(await read()).toMatchObject({ sync_status: 'terminal', server_changed_at: null });
    expect(await mastery.getSkillMastery({ childId: f.childId })).toEqual([]);
    expect(await f.db.getFirstAsync('select error_code from sync_outbox')).toEqual({ error_code: code });
  });

  test('a malformed outbox payload becomes terminal 22023 without a request', async () => {
    const written = await write();
    for (const malformed of [{ step_key: '' }, { step_key: null }, { child_id: '' },
      { correction_id: '' }, { changed_at: '' }, { confirmed: 1 }, { changed_at: 'not a date' }]) {
      await f.db.runAsync("update sync_outbox set payload = ?, status = 'pending' where table_name = 'skill_mastery'",
        JSON.stringify({ ...written, ...malformed }));
      expect(await f.engine(client).syncAll({ force: true })).toMatchObject({ totalTerminal: 1, totalSynced: 0 });
      expect(await f.db.getFirstAsync('select error_code from sync_outbox')).toEqual({ error_code: '22023' });
    }
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  test('a 23505 never marks a tick synced without the acknowledgement', async () => {
    await write();
    client.rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate correction' } });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 0, totalTerminal: 1 });
    expect(await read()).toMatchObject({ sync_status: 'terminal', server_changed_at: null });
    expect(await f.db.getAllAsync('select * from sync_outbox')).toHaveLength(1);
  });

  test('letter and skill corrections in one pass each reach their own RPC and acknowledgement', async () => {
    const skill = await write();
    const { createMasteryRepository } = require('../src/db/repositories/masteryRepository');
    const letter = await createMasteryRepository({ database: f.db }).setLetterMastery({
      childId: f.childId, letter: 'k', language: 'en', confirmed: true,
    });
    client.rpc.mockImplementation(async name => reply(winner({
      correction_id: name === 'set_letter_mastery' ? letter.correction_id : skill.correction_id,
      changed_by: f.userId,
    })));
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 2, totalFailed: 0,
      tableResults: { letter_mastery: expect.anything(), skill_mastery: expect.anything() } });
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(['set_letter_mastery', 'set_skill_mastery']);
    expect(await read()).toMatchObject({ sync_status: 'synced', server_changed_at: SERVER_TIME });
    expect(await f.db.getFirstAsync('select sync_status, server_changed_at from letter_mastery'))
      .toEqual({ sync_status: 'synced', server_changed_at: SERVER_TIME });
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });
});
