jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { enqueueDomainOutbox } from '../src/db/repositories/domainRepositoryUtils';

describe('outbox ownership at enqueue', () => {
  let db;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    await db.runAsync("insert into programmes (id, code, name) values ('programme-1', 'literacy', 'Literacy')");
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('stamps a session insert from its domain owner', async () => {
    await db.runAsync(`
      insert into sessions (id, user_id, programme_id, session_date)
      values ('session-1', 'ea-1', 'programme-1', '2026-07-12')
    `);

    await enqueueDomainOutbox(db, 'sessions', 'session-1', 'insert', {
      id: 'session-1',
      user_id: 'ea-1',
    });

    expect(await db.getFirstAsync(
      "select owner_user_id from sync_outbox where id = 'sessions:session-1:insert'"
    )).toEqual({ owner_user_id: 'ea-1' });
  });

  test('resolves a session attendee owner through its parent session', async () => {
    await db.runAsync("insert into children (id, first_name, last_name) values ('child-1', 'A', 'Child')");
    await db.runAsync(`
      insert into sessions (id, user_id, programme_id, session_date)
      values ('session-1', 'ea-1', 'programme-1', '2026-07-12')
    `);
    await db.runAsync(`
      insert into session_attendees (id, session_id, child_id)
      values ('attendee-1', 'session-1', 'child-1')
    `);

    await enqueueDomainOutbox(db, 'session_attendees', 'attendee-1', 'insert', {
      id: 'attendee-1',
      session_id: 'session-1',
    });

    expect(await db.getFirstAsync(
      "select owner_user_id from sync_outbox where id = 'session_attendees:attendee-1:insert'"
    )).toEqual({ owner_user_id: 'ea-1' });
  });

  test('stores NULL when no owner can be resolved', async () => {
    await enqueueDomainOutbox(db, 'schools', 'school-no-owner', 'insert', {
      id: 'school-no-owner',
      name: 'No Owner School',
    });

    expect(await db.getFirstAsync(
      "select owner_user_id from sync_outbox where id = 'schools:school-no-owner:insert'"
    )).toEqual({ owner_user_id: null });
  });

  test('stamps a partial child archive from the current domain row', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by)
      values ('child-1', 'A', 'Child', 'ea-child')
    `);

    await enqueueDomainOutbox(db, 'children', 'child-1', 'archive', {
      id: 'child-1',
      archived_at: '2026-07-12T00:00:00.000Z',
    });

    expect(await db.getFirstAsync(
      "select owner_user_id from sync_outbox where id = 'children:child-1:archive'"
    )).toEqual({ owner_user_id: 'ea-child' });
  });

  test('stamps a partial assignment archive from the current domain row', async () => {
    await db.runAsync("insert into children (id, first_name, last_name) values ('child-1', 'A', 'Child')");
    await db.runAsync(`
      insert into child_ea_assignments (id, user_id, child_id)
      values ('assignment-1', 'ea-assignment', 'child-1')
    `);

    await enqueueDomainOutbox(db, 'child_ea_assignments', 'assignment-1', 'archive', {
      id: 'assignment-1',
      unassigned_at: '2026-07-12T00:00:00.000Z',
    });

    expect(await db.getFirstAsync(
      "select owner_user_id from sync_outbox where id = 'child_ea_assignments:assignment-1:archive'"
    )).toEqual({ owner_user_id: 'ea-assignment' });
  });
});
