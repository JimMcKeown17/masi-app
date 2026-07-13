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

  test('owner fast paths stamp identically to row and parent resolution', async () => {
    await db.runAsync("insert into children (id, first_name, last_name) values ('child-1', 'A', 'Child')");
    await db.runAsync(`
      insert into sessions (id, user_id, programme_id, session_date)
      values ('session-1', 'ea-owner', 'programme-1', '2026-07-12')
    `);
    await db.runAsync(`
      insert into session_attendees (id, session_id, child_id)
      values ('attendee-row', 'session-1', 'child-1'), ('attendee-fast', 'session-1', 'child-1')
    `);
    await enqueueDomainOutbox(db, 'session_attendees', 'attendee-row', 'insert', {
      id: 'attendee-row', session_id: 'session-1',
    });
    await enqueueDomainOutbox(db, 'session_attendees', 'attendee-fast', 'insert', {
      id: 'attendee-fast', session_id: 'session-1',
    }, { ownerUserId: 'ea-owner' });

    await db.runAsync(`
      insert into assessments (id, user_id, child_id, programme_id, assessment_type, assessment_date)
      values ('assessment-1', 'ea-owner', 'child-1', 'programme-1', 'letter_egra', '2026-07-12')
    `);
    await db.runAsync(`
      insert into assessment_items (id, assessment_id, item_key)
      values ('item-row', 'assessment-1', 'a'), ('item-fast', 'assessment-1', 'b')
    `);
    await enqueueDomainOutbox(db, 'assessment_items', 'item-row', 'insert', {
      id: 'item-row', assessment_id: 'assessment-1',
    });
    await enqueueDomainOutbox(db, 'assessment_items', 'item-fast', 'insert', {
      id: 'item-fast', assessment_id: 'assessment-1',
    }, { ownerUserId: 'ea-owner' });

    await db.runAsync(`
      insert into letter_mastery (id, user_id, child_id, programme_id, letter, language, source)
      values
        ('mastery-row', 'ea-owner', 'child-1', 'programme-1', 'a', 'English', 'taught'),
        ('mastery-fast', 'ea-owner', 'child-1', 'programme-1', 'b', 'English', 'taught')
    `);
    await enqueueDomainOutbox(db, 'letter_mastery', 'mastery-row', 'insert', { id: 'mastery-row' });
    await enqueueDomainOutbox(db, 'letter_mastery', 'mastery-fast', 'insert', { id: 'mastery-fast' }, {
      ownerRow: { id: 'mastery-fast', user_id: 'ea-owner' },
    });

    expect(await db.getAllAsync(`
      select record_id, owner_user_id
      from sync_outbox
      where record_id in ('attendee-row', 'attendee-fast', 'item-row', 'item-fast', 'mastery-row', 'mastery-fast')
      order by record_id
    `)).toEqual([
      { record_id: 'attendee-fast', owner_user_id: 'ea-owner' },
      { record_id: 'attendee-row', owner_user_id: 'ea-owner' },
      { record_id: 'item-fast', owner_user_id: 'ea-owner' },
      { record_id: 'item-row', owner_user_id: 'ea-owner' },
      { record_id: 'mastery-fast', owner_user_id: 'ea-owner' },
      { record_id: 'mastery-row', owner_user_id: 'ea-owner' },
    ]);
  });
});
