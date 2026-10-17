global.__MASI_NO_DEFAULT_HANDLE__ = true;

import { requestOpen, requestClose, resetHandleRegistryForTests, setLatestAuthSession } from '../../src/session/signedInHandle';
import * as engine from '../../test-support/expoSQLiteRealEngine';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const CHILD_A = '33333333-3333-4333-8333-333333333333';
const CHILD_B = '44444444-4444-4444-8444-444444444444';
const uploaded = [];
const transport = jest.fn(async (url, init) => {
  uploaded.push({ table: new URL(url).pathname.split('/').pop(), body: JSON.parse(init.body), auth: new Headers(init.headers).get('Authorization') });
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
});
const open = async (userId) => {
  setLatestAuthSession({ user: { id: userId }, access_token: `token-${userId}` });
  return requestOpen({ userId, openDatabase: engine.openDatabaseAsync, fetchImpl: transport });
};
beforeEach(async () => { await engine.__resetMockDatabases(); uploaded.length = 0; transport.mockClear(); });
afterEach(async () => { await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); });

test('review focus 4: real engine A → B → A preserves offline children and uploads A exactly once only on return', async () => {
  expect(engine.__usesRealEngine).toBe(true);
  const a = await open(A);
  await a.repositories.children.saveChildRecord({ id: CHILD_A, first_name: 'A', last_name: 'Child', created_by: A });
  await requestClose({ reason: 'switch offline' });
  expect(uploaded).toEqual([]);
  const b = await open(B);
  expect(await b.repositories.children.getChildren()).toEqual([]);
  await b.repositories.children.saveChildRecord({ id: CHILD_B, first_name: 'B', last_name: 'Child', created_by: B });
  expect(await b.repositories.children.getChildren()).toEqual([expect.objectContaining({ id: CHILD_B })]);
  const again = await open(A);
  expect(await again.repositories.children.getChildren()).toEqual([expect.objectContaining({ id: CHILD_A })]);
  expect(await again.services.syncEngine.syncAll()).toMatchObject({ success: true, totalSynced: 1 });
  expect(await again.services.syncEngine.syncAll()).toMatchObject({ success: true, totalSynced: 0 });
  expect(uploaded).toEqual([{ table: 'children', body: expect.objectContaining({ id: CHILD_A }), auth: `Bearer token-${A}` }]);
  const bAgain = await open(B);
  expect(await bAgain.repositories.children.getChildren()).toEqual([expect.objectContaining({ id: CHILD_B, sync_status: 'pending' })]);
  expect(await (await bAgain.getReader()).getAllAsync('select record_id, status from sync_outbox')).toEqual([{ record_id: CHILD_B, status: 'pending' }]);
});
