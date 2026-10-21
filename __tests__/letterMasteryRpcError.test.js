jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { PostgrestClient } from '@supabase/postgrest-js';
import { createFamilySyncFixture } from '../test-support/assessmentFamilySyncTestUtils';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';

describe('letter mastery RPC errors through real postgrest-js', () => {
  let f, mastery;
  beforeEach(async () => {
    f = await createFamilySyncFixture();
    mastery = createMasteryRepository({ database: f.db });
  });
  afterEach(async () => { await f.db.closeAsync(); });

  test.each([
    ['MA001', 'terminal', 1, 0], ['28000', 'failed', 0, 1],
  ])('%s survives RPC error parsing and is classified as %s', async (code, status, terminal, retriable) => {
    const written = await mastery.setLetterMastery({ childId: f.childId, letter: 'k', language: 'en', confirmed: true });
    const fetch = jest.fn(async () => ({
      ok: false, status: 400, statusText: 'Bad Request',
      text: async () => JSON.stringify({ code, message: `RPC refused: ${code}`, details: null, hint: null }),
    }));
    const client = new PostgrestClient('https://example.invalid/rest/v1', { fetch });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 0, totalTerminal: terminal, totalRetriable: retriable });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe('https://example.invalid/rest/v1/rpc/set_letter_mastery');
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      p_correction_id: written.correction_id, p_child_id: f.childId, p_letter: 'k', p_language: 'en',
      p_confirmed: true, p_changed_at: written.changed_at,
    });
    expect(await f.outbox.getById(`letter_mastery:${written.id}:update`))
      .toMatchObject({ status, last_error: expect.stringContaining(code) });
    expect(await f.db.getFirstAsync('select sync_status from letter_mastery')).toEqual({ sync_status: status });
  });

  test('a 200 applied response is synced after parsing the returned winner', async () => {
    const written = await mastery.setLetterMastery({ childId: f.childId, letter: 'k', language: 'en', confirmed: true });
    const changedAt = '2026-10-21T07:00:00.123456+00:00';
    const fetch = jest.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      headers: { get: () => null },
      text: async () => JSON.stringify([{
        outcome: 'applied', confirmed: true, changed_at: changedAt,
        correction_id: written.correction_id, changed_by: f.userId,
      }]),
    }));
    const client = new PostgrestClient('https://example.invalid/rest/v1', { fetch });
    expect(await f.engine(client).syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(String(fetch.mock.calls[0][0])).toBe('https://example.invalid/rest/v1/rpc/set_letter_mastery');
    expect(await f.db.getFirstAsync('select sync_status, changed_at, server_changed_at from letter_mastery'))
      .toEqual({ sync_status: 'synced', changed_at: changedAt, server_changed_at: changedAt });
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });
});
