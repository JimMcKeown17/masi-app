jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { PostgrestClient } from '@supabase/postgrest-js';
import { createFamilySyncFixture } from '../test-support/assessmentFamilySyncTestUtils';

describe('assessment RPC errors through real postgrest-js', () => {
  let fixture;
  beforeEach(async () => { fixture = await createFamilySyncFixture(); });
  afterEach(async () => { await fixture.db.closeAsync(); });

  test.each([
    ['MA001', 'terminal', 1, 0],
    ['28000', 'failed', 0, 1],
  ])('%s survives RPC error parsing and is classified as %s', async (code, status, terminal, retriable) => {
    const { id } = await fixture.save();
    const fetch = jest.fn(async () => ({
      ok: false, status: 400, statusText: 'Bad Request',
      text: async () => JSON.stringify({ code, message: `RPC refused: ${code}`, details: null, hint: null }),
    }));
    const client = new PostgrestClient('https://example.invalid/rest/v1', { fetch });

    expect(await fixture.engine(client).syncAll()).toMatchObject({
      totalSynced: 0, totalTerminal: terminal, totalRetriable: retriable,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe('https://example.invalid/rest/v1/rpc/submit_assessment');
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      p_assessment: { id, total_items: 3 }, p_items: expect.any(Array),
    });
    expect(await fixture.outbox.getById(`assessments:${id}:insert`)).toMatchObject({
      status, last_error: expect.stringContaining(code),
    });
    expect((await fixture.read(id)).sync_status).toBe(status);
    expect((await fixture.items(id)).every(item => item.sync_status !== 'synced')).toBe(true);
  });
});
