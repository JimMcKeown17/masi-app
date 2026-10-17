global.__MASI_NO_DEFAULT_HANDLE__ = true;

import * as sqlite from '../test-support/expoSQLiteRealEngine';
import { runMigrations } from '../src/db/migrations';
import {
  createSupportIncidentRepository, incidentRepeatKey, enqueueSupportIncident,
} from '../src/db/repositories/supportIncidentRepository';
import { runRepositoryTransaction } from '../src/db/repositories/repositoryRuntime';

const A = '11111111-1111-4111-8111-111111111111';
let db;
beforeEach(async () => {
  await sqlite.__resetMockDatabases();
  db = await sqlite.openDatabaseAsync(`masi-${A}.db`);
  await runMigrations(db);
});
afterEach(() => sqlite.__resetMockDatabases());

test('enqueue stores a pending incident once per kind and repeat key', async () => {
  const repo = createSupportIncidentRepository({ database: db });
  const incident = { kind: 'left_behind_unsent_work', repeatKey: 'u1:o1', payload: { unsentByTable: { children: 1 } } };
  expect(await repo.enqueue(incident)).toEqual({ queued: true });
  expect(await repo.enqueue(incident)).toEqual({ queued: false, reason: 'duplicate' });
  const pending = await repo.listPending();
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({ kind: 'left_behind_unsent_work', repeatKey: 'u1:o1', payload: incident.payload, attempts: 0 });
});

test('unknown kinds are refused by the table check', async () => {
  const repo = createSupportIncidentRepository({ database: db });
  await expect(repo.enqueue({ kind: 'child_names', repeatKey: 'k', payload: {} })).rejects.toBeTruthy();
});

test('a payload over 8192 UTF-8 bytes is not queued', async () => {
  const repo = createSupportIncidentRepository({ database: db });
  const result = await repo.enqueue({ kind: 'foreign_owner_in_file', repeatKey: 'big', payload: { p: 'é'.repeat(4100) } });
  expect(result).toEqual({ queued: false, reason: 'too_large' });
});

test('at 200 rows the oldest sent rows make room; 200 pending rows refuse a new one', async () => {
  const repo = createSupportIncidentRepository({ database: db });
  for (let i = 0; i < 200; i += 1) {
    await repo.enqueue({ kind: 'left_behind_unsent_work', repeatKey: `k${String(i).padStart(3, '0')}`, payload: {} });
  }
  expect(await repo.enqueue({ kind: 'left_behind_unsent_work', repeatKey: 'overflow', payload: {} }))
    .toEqual({ queued: false, reason: 'full' });
  const [first] = await repo.listPending({ limit: 1 });
  await repo.markSent(first.id);
  expect(await repo.enqueue({ kind: 'left_behind_unsent_work', repeatKey: 'overflow', payload: {} }))
    .toEqual({ queued: true });
  const count = await db.getFirstAsync('select count(*) as n from support_incident_queue');
  expect(count.n).toBe(200);
});

test('markAttemptFailed backs the row off; markRejected and markSent remove it from pending', async () => {
  const repo = createSupportIncidentRepository({ database: db });
  await repo.enqueue({ kind: 'left_behind_unsent_work', repeatKey: 'a', payload: {} });
  await repo.enqueue({ kind: 'left_behind_unsent_work', repeatKey: 'b', payload: {} });
  const [a, b] = await repo.listPending();
  const failedAt = '2026-10-17T10:00:00.000Z';
  await repo.markAttemptFailed(a.id, 'Network request failed', { now: failedAt });
  await repo.markRejected(b.id, '22023');
  // Backed off for 5 s after the first failure: not due at +4 s, due at +5 s.
  expect(await repo.listPending({ now: '2026-10-17T10:00:04.000Z' })).toEqual([]);
  expect(await repo.countDue({ now: '2026-10-17T10:00:04.000Z' })).toBe(0);
  const due = await repo.listPending({ now: '2026-10-17T10:00:05.000Z' });
  expect(due.map((row) => row.id)).toEqual([a.id]);
  expect(due[0].attempts).toBe(1);
  expect(await repo.countDue({ now: '2026-10-17T10:00:05.000Z' })).toBe(1);
  // The second failure backs off 15 s (5 s × 3).
  await repo.markAttemptFailed(a.id, 'Network request failed', { now: '2026-10-17T10:00:05.000Z' });
  expect(await repo.countDue({ now: '2026-10-17T10:00:19.000Z' })).toBe(0);
  expect(await repo.countDue({ now: '2026-10-17T10:00:20.000Z' })).toBe(1);
  await repo.markSent(a.id);
  expect(await repo.listPending({ now: '2026-10-17T10:00:20.000Z' })).toEqual([]);
  expect(await repo.countDue({ now: '2026-10-17T10:00:20.000Z' })).toBe(0);
});

test('incidentRepeatKey is deterministic, opaque, and sensitive to every part', () => {
  const key = incidentRepeatKey('u1', 'children:c-secret-child-id:update', '2026-10-15T00:00:00.000Z');
  expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(key).toBe(incidentRepeatKey('u1', 'children:c-secret-child-id:update', '2026-10-15T00:00:00.000Z'));
  expect(key).not.toContain('c-secret-child-id');
  expect(key).not.toBe(incidentRepeatKey('u1', 'children:c-secret-child-id:update', '2026-10-16T00:00:00.000Z'));
  // Part boundaries matter: ('ab', 'c') and ('a', 'bc') are different situations.
  expect(incidentRepeatKey('ab', 'c')).not.toBe(incidentRepeatKey('a', 'bc'));
});

test.each([['é', 4092], ['😀', 2046]])('a payload exactly 8192 UTF-8 bytes is accepted (%s)', async (char, count) => {
  const repo = createSupportIncidentRepository({ database: db });
  const payload = { p: char.repeat(count) };
  expect(Buffer.byteLength(JSON.stringify(payload), 'utf8')).toBe(8192);
  expect(await repo.enqueue({ kind: 'foreign_owner_in_file', repeatKey: 'boundary', payload }))
    .toEqual({ queued: true });
  expect((await repo.listPending())[0].payload).toEqual(payload);
  expect(await repo.enqueue({ kind: 'foreign_owner_in_file', repeatKey: 'over', payload: { p: payload.p + 'x' } }))
    .toEqual({ queued: false, reason: 'too_large' });
});

test('caller-owned transactions enqueue atomically without nesting or domain outbox writes', async () => {
  const repo = createSupportIncidentRepository({ database: db });
  const incident = { kind: 'foreign_owner_in_file', repeatKey: 'first', payload: { unsentByTable: { children: 1 } } };
  const abort = new Error('roll back the integrity scan');
  await expect(runRepositoryTransaction(db, async (txn) => {
    expect(await enqueueSupportIncident(txn, incident)).toEqual({ queued: true });
    expect(await repo.enqueue({ ...incident, repeatKey: 'second' }, { transaction: txn }))
      .toEqual({ queued: true });
    throw abort;
  })).rejects.toBe(abort);
  expect(await repo.listPending()).toEqual([]);
  await runRepositoryTransaction(db, async (txn) => {
    expect(await repo.enqueue(incident, { transaction: txn })).toEqual({ queued: true });
  });
  expect(await repo.listPending()).toHaveLength(1);
  expect(await db.getFirstAsync('select count(*) as n from sync_outbox')).toEqual({ n: 0 });
});

test('sent and rejected rows retain deduplication until pruned; kind is part of the identity', async () => {
  const repo = createSupportIncidentRepository({ database: db });
  const sent = { kind: 'left_behind_unsent_work', repeatKey: 'same', payload: {} };
  const rejected = { ...sent, kind: 'legacy_shared_file_unsent' };
  expect(await repo.enqueue(sent)).toEqual({ queued: true });
  expect(await repo.enqueue(rejected)).toEqual({ queued: true });
  const pending = await repo.listPending();
  await repo.markSent(pending.find(row => row.kind === sent.kind).id);
  await repo.markRejected(pending.find(row => row.kind === rejected.kind).id, '22023');
  expect(await repo.enqueue(sent)).toEqual({ queued: false, reason: 'duplicate' });
  expect(await repo.enqueue(rejected)).toEqual({ queued: false, reason: 'duplicate' });
  expect(await repo.listPending()).toEqual([]);
});

test('retry delay caps at 900000 ms and increments attempts once per failure', async () => {
  const repo = createSupportIncidentRepository({ database: db });
  await repo.enqueue({ kind: 'left_behind_unsent_work', repeatKey: 'retry', payload: {} });
  const [pending] = await repo.listPending();
  let now = '2026-10-17T10:00:00.000Z';
  const delays = [5000, 15000, 45000, 135000, 405000, 900000, 900000];
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    await repo.markAttemptFailed(pending.id, 'Network request failed', { now });
    const dueAt = new Date(Date.parse(now) + delays[attempt]).toISOString();
    expect(await repo.countDue({ now: new Date(Date.parse(dueAt) - 1).toISOString() })).toBe(0);
    expect(await repo.listPending({ now: dueAt })).toEqual([
      expect.objectContaining({ id: pending.id, attempts: attempt + 1 }),
    ]);
    now = dueAt;
  }
});
