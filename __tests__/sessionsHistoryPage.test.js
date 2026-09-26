// __tests__/sessionsHistoryPage.test.js
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const SCOPE = 'session_history_pull:user-1:programme-a';
const serverSession = (overrides = {}) => ({
  id: 's-1', user_id: 'user-9', programme_id: 'programme-a', class_id: 'class-1',
  session_date: '2026-09-01', started_at: null, ended_at: null,
  activities: { letters_focused: ['a'] }, notes: 'server note',
  created_at: '2026-09-01T08:00:00.123456+00:00', updated_at: '2026-09-01T08:05:00.654321+00:00',
  group_id: null, state: 'completed',
  ...overrides,
});
const serverAttendee = (overrides = {}) => ({
  id: 'a-1', session_id: 's-1', child_id: 'child-1', group_id: null, attendance_status: 'present',
  grade_snapshot: '1', notes: null,
  created_at: '2026-09-01T08:00:00.1+00:00', updated_at: '2026-09-01T08:00:00.1+00:00',
  child_first_name: 'Amahle', child_last_name: 'Dlamini', child_preferred_name: null,
  ...overrides,
});
const pullState = (cursor = { updatedAt: '2026-09-01T08:05:00.654321+00:00', id: 's-1' }) => ({
  lastPulledAt: null,
  cursor: JSON.stringify({ ...cursor, windowStart: '2026-01-15', complete: false }),
});

describe('sessionsRepository.saveHistoryPage', () => {
  let db; let repo;
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    repo = createSessionsRepository({ database: db });
  });
  afterEach(async () => { await db.closeAsync(); });

  test('persists parent, attendees, a reference child, and the cursor atomically without outbox rows', async () => {
    const result = await repo.saveHistoryPage([{ session: serverSession(), attendees: [serverAttendee()] }], { scope: SCOPE, pullState: pullState() });
    expect(result).toEqual({ savedFamilies: 1 });
    expect(await db.getFirstAsync("select sync_status, server_updated_at, updated_at from sessions where id = 's-1'"))
      .toEqual({ sync_status: 'synced', server_updated_at: '2026-09-01T08:05:00.654321+00:00', updated_at: '2026-09-01T08:05:00.654321+00:00' });
    expect(await db.getFirstAsync("select first_name, history_reference, sync_status from children where id = 'child-1'"))
      .toEqual({ first_name: 'Amahle', history_reference: 1, sync_status: 'synced' });
    expect((await db.getFirstAsync('select count(*) as n from sync_outbox')).n).toBe(0);
    expect(JSON.parse((await db.getFirstAsync('select cursor from sync_state where scope = ?', SCOPE)).cursor).updatedAt)
      .toBe('2026-09-01T08:05:00.654321+00:00');
  });

  test('a throw mid-page persists nothing and leaves the cursor unchanged', async () => {
    const bad = serverAttendee({ id: 'a-2', attendance_status: 'teleported' }); // violates the CHECK
    let caught;
    try {
      await repo.saveHistoryPage([{ session: serverSession(), attendees: [serverAttendee(), bad] }], { scope: SCOPE, pullState: pullState() });
    } catch (error) { caught = error; }
    expect(caught).toBeDefined();
    expect(caught?.message).toMatch(/CHECK constraint/i);
    expect((await db.getFirstAsync('select count(*) as n from sessions')).n).toBe(0);
    expect((await db.getFirstAsync('select count(*) as n from children where id = ?', 'child-1')).n).toBe(0);
    expect(await db.getFirstAsync('select * from sync_state where scope = ?', SCOPE)).toBeNull();
  });

  test('a pending local session wins and its attendees are left alone', async () => {
    await createChildrenRepository({ database: db }).saveChildRecord({ id: 'child-1', first_name: 'Amahle', last_name: 'D', class_id: 'class-1', synced: true, sync_status: 'synced' });
    await repo.saveSession({ id: 's-1', user_id: 'user-1', programme_id: 'programme-a', session_date: '2026-09-01', notes: 'local', children_ids: ['child-1'], synced: false });
    await repo.saveHistoryPage([{ session: serverSession(), attendees: [serverAttendee()] }], { scope: SCOPE, pullState: pullState() });
    expect((await db.getFirstAsync("select notes, sync_status from sessions where id = 's-1'"))).toEqual({ notes: 'local', sync_status: 'pending' });
  });

  test('a present child is untouched and a later full-row save upgrades a reference child', async () => {
    await createChildrenRepository({ database: db }).saveChildRecord({ id: 'child-2', first_name: 'Sipho', last_name: 'M', class_id: 'class-1', synced: true, sync_status: 'synced' });
    await repo.saveHistoryPage([{ session: serverSession(), attendees: [
      serverAttendee(),
      serverAttendee({ id: 'a-2', child_id: 'child-2', child_first_name: 'SERVER-NAME' }),
    ] }], { scope: SCOPE, pullState: pullState() });
    expect(await db.getFirstAsync("select first_name, history_reference from children where id = 'child-2'"))
      .toEqual({ first_name: 'Sipho', history_reference: 0 });
  });

  test('missing class and group references are stored as null instead of failing the page', async () => {
    await repo.saveHistoryPage([{
      session: serverSession({ class_id: 'class-not-on-phone' }),
      attendees: [serverAttendee({ group_id: 'group-not-on-phone' })],
    }], { scope: SCOPE, pullState: pullState() });
    expect((await db.getFirstAsync("select class_id from sessions where id = 's-1'")).class_id).toBeNull();
    expect((await db.getFirstAsync("select group_id from session_attendees where id = 'a-1'")).group_id).toBeNull();
  });

  test('a parent with zero attendees persists and absence never deletes a local attendee', async () => {
    await repo.saveHistoryPage([{ session: serverSession(), attendees: [serverAttendee()] }], { scope: SCOPE, pullState: pullState() });
    await repo.saveHistoryPage([{ session: serverSession({ notes: 'edited' }), attendees: [] }], { scope: SCOPE, pullState: pullState() });
    expect((await db.getFirstAsync("select notes from sessions where id = 's-1'")).notes).toBe('edited');
    expect((await db.getFirstAsync("select count(*) as n from session_attendees where session_id = 's-1'")).n).toBe(1);
  });

  test('an admission check that fails inside the transaction commits nothing', async () => {
    let caught;
    try {
      await repo.saveHistoryPage([{ session: serverSession(), attendees: [serverAttendee()] }], { scope: SCOPE, pullState: pullState(), admit: () => false });
    } catch (error) { caught = error; }
    expect(caught?.kind).toBe('cancelled');
    expect((await db.getFirstAsync('select count(*) as n from sessions')).n).toBe(0);
    expect(await db.getFirstAsync('select * from sync_state where scope = ?', SCOPE)).toBeNull();
  });

  test('an actor change after admission but before COMMIT rolls the whole page back', async () => {
    let checks = 0;
    let caught;
    try {
      await repo.saveHistoryPage([{ session: serverSession(), attendees: [serverAttendee()] }], {
        scope: SCOPE, pullState: pullState(), admit: () => { checks += 1; return checks === 1; },
      });
    } catch (error) { caught = error; }
    expect(checks).toBe(2);
    expect(caught?.kind).toBe('cancelled');
    expect((await db.getFirstAsync('select count(*) as n from sessions')).n).toBe(0);
    expect((await db.getFirstAsync('select count(*) as n from children')).n).toBe(0);
    expect(await db.getFirstAsync('select * from sync_state where scope = ?', SCOPE)).toBeNull();
  });

  test('server fields outside SESSION_COLUMNS are dropped without failing persistence', async () => {
    await repo.saveHistoryPage([{
      session: serverSession({ group_id: 'group-not-on-phone', state: 'server-state-not-stored' }),
      attendees: [],
    }], { scope: SCOPE, pullState: pullState() });
    expect(await db.getFirstAsync("select group_id, state from sessions where id = 's-1'"))
      .toEqual({ group_id: null, state: 'completed' });
  });

  test('lastPulledAt is written only when the caller passes it', async () => {
    await repo.saveHistoryPage([], { scope: SCOPE, pullState: { lastPulledAt: '2026-09-25T10:00:00.000Z', cursor: pullState().cursor } });
    expect((await db.getFirstAsync('select last_pulled_at from sync_state where scope = ?', SCOPE)).last_pulled_at)
      .toBe('2026-09-25T10:00:00.000Z');
  });
});
