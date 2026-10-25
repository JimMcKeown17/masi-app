jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { v4 as uuid } from 'uuid';
import { createFamilySyncFixture } from '../test-support/assessmentFamilySyncTestUtils';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { AUTHENTICATED_DENIAL_MARKER } from '../src/services/offlineSync';
import { loadMasteryState } from '../src/utils/masteryState';

const MON = '2026-10-19T08:00:00.000Z';
const TUE = '2026-10-20T08:00:00.000Z';
const WED = '2026-10-21T08:00:00.000Z';
// Keep sub-millisecond precision and the server's offset syntax intact.
const SERVER_TIME = '2026-10-20T08:00:00.123456+00:00';
const OTHER_EA = '00000000-0000-4000-8000-000000000909';
const winner = (overrides = {}) => ({
  outcome: 'applied', confirmed: true, changed_at: SERVER_TIME,
  correction_id: uuid(), changed_by: OTHER_EA, ...overrides,
});
const reply = result => ({ data: [result], error: null });

describe('letter mastery correction sync', () => {
  let f, mastery, client;
  beforeEach(async () => {
    f = await createFamilySyncFixture({ withDelivery: true });
    mastery = createMasteryRepository({ database: f.db });
    ({ supabaseClient: client } = createSupabaseMock({ rpcResults: {
      set_letter_mastery: reply(winner()),
    } }));
  });
  afterEach(async () => { jest.useRealTimers(); await f.db.closeAsync(); });
  const write = overrides => mastery.setLetterMastery({
    childId: f.childId, letter: 'k', language: 'en', confirmed: true, ...overrides,
  });
  const read = () => f.db.getFirstAsync("select * from letter_mastery where letter = 'k'");

  test('one correction is one set_letter_mastery call with exactly its six arguments', async () => {
    const written = await write();
    client.rpc.mockResolvedValueOnce(reply(winner({ correction_id: written.correction_id, changed_by: f.userId })));
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(client.rpc).toHaveBeenCalledWith('set_letter_mastery', {
      p_correction_id: written.correction_id, p_child_id: f.childId, p_letter: 'k', p_language: 'en',
      p_confirmed: true, p_changed_at: written.changed_at,
    });
    expect(client.rpc.mock.calls[0][1]).not.toHaveProperty('row_version');
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
    expect(await mastery.getLetterMastery({ childId: f.childId, language: 'en' }))
      .toEqual([expect.objectContaining({ confirmed: true, changed_at: SERVER_TIME })]);
  });

  test('superseded: the phone shows the winner at once', async () => {
    await write();
    const result = winner({ outcome: 'superseded', confirmed: false });
    client.rpc.mockResolvedValueOnce(reply(result));
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1 });
    expect(await read()).toMatchObject({
      confirmed: 0, changed_at: SERVER_TIME, correction_id: result.correction_id, changed_by: OTHER_EA,
      server_changed_at: SERVER_TIME, server_correction_id: result.correction_id,
      sync_status: 'synced', programme_id: null,
    });
    expect(await mastery.getLetterMastery({ childId: f.childId }))
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

  test('a newer change made while the call is in flight survives the acknowledgement', async () => {
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

  test('a newer change also survives an acknowledged reply with no readable winner', async () => {
    await write({ changedAt: MON });
    let newer;
    client.rpc.mockImplementationOnce(async () => {
      newer = await write({ confirmed: false, changedAt: TUE });
      return reply({ outcome: 'acknowledged', confirmed: null, changed_at: null, correction_id: null, changed_by: null });
    });
    await f.engine(client).syncAll();
    expect(await read()).toMatchObject({ correction_id: newer.correction_id, confirmed: 0, sync_status: 'pending', server_changed_at: null });
    expect(await f.db.getAllAsync('select status from sync_outbox')).toEqual([{ status: 'pending' }]);
  });

  test('on, off, on offline is one call with the last correction id', async () => {
    await write(); await write({ confirmed: false });
    const last = await write();
    client.rpc.mockResolvedValueOnce(reply(winner({ correction_id: last.correction_id, changed_by: f.userId })));
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1 });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith('set_letter_mastery', expect.objectContaining({ p_correction_id: last.correction_id, p_confirmed: true }));
  });

  test("an older save never replaces this phone's newer unsent correction, and the newer one uploads", async () => {
    const tuesday = await write({ confirmed: false, changedAt: TUE });
    const kept = await write({ changedAt: MON });
    expect(kept).toMatchObject({ confirmed: false, changed_at: TUE, correction_id: tuesday.correction_id });
    const slots = await f.db.getAllAsync("select payload from sync_outbox where table_name = 'letter_mastery'");
    expect(slots.map(s => JSON.parse(s.payload))).toEqual([
      expect.objectContaining({ confirmed: false, changed_at: TUE, correction_id: tuesday.correction_id }),
    ]);
    client.rpc.mockResolvedValueOnce(reply(winner({ confirmed: false, changed_at: TUE, correction_id: tuesday.correction_id, changed_by: f.userId })));
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith('set_letter_mastery', expect.objectContaining({ p_correction_id: tuesday.correction_id, p_confirmed: false, p_changed_at: TUE }));
    expect(await read()).toMatchObject({ confirmed: 0, sync_status: 'synced' });
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });

  test('an older save made while the newer correction is in flight is kept back too', async () => {
    const tuesday = await write({ confirmed: false, changedAt: TUE });
    client.rpc.mockImplementationOnce(async () => {
      expect(await write({ changedAt: MON })).toMatchObject({ correction_id: tuesday.correction_id });
      return reply(winner({ confirmed: false, changed_at: TUE, correction_id: tuesday.correction_id, changed_by: f.userId }));
    });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1 });
    expect(await read()).toMatchObject({ confirmed: 0, changed_at: TUE, sync_status: 'synced', server_changed_at: TUE, server_correction_id: tuesday.correction_id });
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  test('two letters are two calls; letter_mastery is never batched or upserted', async () => {
    await write(); await write({ letter: 'a' });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 2, totalFailed: 0 });
    expect(client.rpc).toHaveBeenCalledTimes(2);
    expect(client.rpc.mock.calls.map(([, args]) => args.p_letter).sort()).toEqual(['a', 'k']);
    expect(client.from).not.toHaveBeenCalled();
  });

  test("a Monday mark saved on Wednesday is sent with Monday's time and shows Tuesday's winning correction", async () => {
    jest.useFakeTimers({ now: Date.parse(WED) });
    await write({ changedAt: MON });
    client.rpc.mockResolvedValueOnce(reply(winner({ outcome: 'superseded', confirmed: false, changed_at: TUE })));
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1 });
    expect(client.rpc).toHaveBeenCalledWith('set_letter_mastery', expect.objectContaining({ p_changed_at: MON }));
    expect(await read()).toMatchObject({ confirmed: 0, changed_at: TUE, sync_status: 'synced' });
  });

  test('42501 stays retriable while the child assignment is pending, then terminal with the authenticated marker', async () => {
    await write();
    const { id: assignmentId } = await f.db.getFirstAsync(
      'select id from child_ea_assignments where child_id = ? and user_id = ? and unassigned_at is null', f.childId, f.userId);
    await f.db.runAsync("update child_ea_assignments set sync_status = 'pending' where id = ?", assignmentId);
    await f.outbox.enqueue({ tableName: 'child_ea_assignments', recordId: assignmentId, operation: 'insert', payload: { id: assignmentId, user_id: f.userId, child_id: f.childId } });
    client.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'RLS denied' } });
    const engine = f.engine(client);
    expect(await engine.syncAll({ tableName: 'letter_mastery' })).toMatchObject({ totalRetriable: 1, totalTerminal: 0 });
    expect(await read()).toMatchObject({ sync_status: 'failed' });
    await f.db.runAsync("delete from sync_outbox where table_name = 'child_ea_assignments'");
    await f.db.runAsync("update child_ea_assignments set sync_status = 'synced' where id = ?", assignmentId);
    expect(await engine.syncAll({ tableName: 'letter_mastery', force: true })).toMatchObject({ totalTerminal: 1 });
    expect(await read()).toMatchObject({ sync_status: 'terminal', last_sync_error: `${AUTHENTICATED_DENIAL_MARKER} RLS denied` });
  });

  test.each([
    ['MA001', { data: null, error: { code: 'MA001', message: 'correction changed' } }],
    ['22023', { data: null, error: { code: '22023', message: 'invalid correction' } }],
    ['UNEXPECTED_RPC_RESULT', { data: [], error: null }],
  ])('a refused correction is terminal and never shows as mastery (%s)', async (code, response) => {
    const written = await write();
    client.rpc.mockResolvedValueOnce(response);
    const engine = f.engine(client);
    expect(await engine.syncAll()).toMatchObject({ totalTerminal: 1, totalSynced: 0 });
    expect(await read()).toMatchObject({ sync_status: 'terminal' });
    expect(await mastery.getLetterMastery({ childId: f.childId })).toEqual([]);
    // Task 5 migrates the loader's old userId argument. Adapt only that call here;
    // exclusion itself still runs through the real repository and SQLite.
    const state = await loadMasteryState({
      userId: f.userId, childId: f.childId, languageCode: 'en',
      repositories: { assessments: f.assessments, mastery: {
        getLetterMastery: ({ childId, language }) => mastery.getLetterMastery({ childId, language }),
      } },
    });
    expect(state.taughtRecords).toEqual([]);
    expect((await engine.getSyncStatus()).needsAttentionItems).toEqual([
      expect.objectContaining({ table: 'letter_mastery', id: written.id, terminal: true, reason: expect.stringContaining(code === 'UNEXPECTED_RPC_RESULT' ? 'unexpected result' : response.error.message) }),
    ]);
  });

  test.each([
    {}, { confirmed: 1 }, { changed_at: 'not a date' }, { correction_id: null },
    { child_id: null }, { letter: null }, { language: null },
  ])('a malformed payload is refused locally as 22023 without a network call (%j)', async malformed => {
    const written = await write();
    const payload = { ...written, ...malformed };
    if (Object.keys(malformed).length === 0) delete payload.changed_at;
    await f.db.runAsync("update sync_outbox set payload = ? where table_name = 'letter_mastery'", JSON.stringify(payload));
    expect(await f.engine(client).syncAll()).toMatchObject({ totalTerminal: 1, totalSynced: 0 });
    expect((await f.db.getFirstAsync('select last_error from sync_outbox')).last_error).toMatch(/22023|must/);
    expect(client.rpc).not.toHaveBeenCalled(); expect(client.from).not.toHaveBeenCalled();
  });

  test.each([
    null, {}, [], [winner(), winner()], [{ ...winner(), outcome: 'other' }],
    [{ ...winner(), confirmed: 1 }], [{ ...winner(), changed_at: null }],
    [{ ...winner(), correction_id: null }], [{ ...winner(), changed_by: null }],
    [{ outcome: 'acknowledged', confirmed: false, changed_at: null, correction_id: null, changed_by: null }],
    [{ outcome: 'acknowledged' }],
  ])('an invalid acknowledgement never marks the correction synced (%j)', async data => {
    await write(); client.rpc.mockResolvedValueOnce({ data, error: null });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalTerminal: 1, totalSynced: 0 });
    expect(await read()).toMatchObject({ confirmed: 1, sync_status: 'terminal', server_changed_at: null });
  });

  test('a failure after the outbox delete rolls back the write-back', async () => {
    const written = await write({ changedAt: MON });
    const [slot] = await f.db.getAllAsync('select * from sync_outbox');
    // Fail content acknowledgement, after the outbox CAS and sync bookkeeping.
    await f.db.runAsync(`create trigger refuse_mastery_ack before update of confirmed on letter_mastery
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
});
