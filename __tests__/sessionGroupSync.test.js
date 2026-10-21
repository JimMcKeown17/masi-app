jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { runMigrations } from '../src/db/migrations';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { childEaAssignmentDomainId, groupEaAssignmentDomainId } from '../src/db/repositories/domainRepositoryUtils';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { createSessionGroupServer } from '../test-support/sessionGroupServer';

const liveTestSession = async () => ({ data: { session: { user: { id: 'user-1' } } } });
const LESSON = {
  id: 'lesson-1', user_id: 'user-1', programme_id: 'programme-a', class_id: 'class-1',
  session_date: '2026-10-19', group_id: 'group-1', children_ids: ['child-1', 'child-2'], synced: false,
};
const GROUP_ASSIGNMENT_ID = groupEaAssignmentDomainId({ groupId: 'group-1' });

describe('session group sync', () => {
  let db;
  let server;
  let engine;
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    const initialRows = {
      children: ['child-1', 'child-2'].map(id => ({
        id, first_name: 'Test', last_name: id, created_by: 'head-office',
      })),
      child_ea_assignments: ['child-1', 'child-2'].map(childId => ({
        id: childEaAssignmentDomainId({ userId: 'user-1', childId }),
        user_id: 'user-1', child_id: childId, created_by: 'head-office', unassigned_at: null,
      })),
      groups: [{ id: 'group-1', name: 'Group 1', programme_id: 'programme-a', class_id: 'class-1', created_by: 'head-office' }],
      group_ea_assignments: [{
        id: GROUP_ASSIGNMENT_ID, group_id: 'group-1', ea_user_id: 'user-1',
        programme_id: 'programme-a', created_by: 'head-office', unassigned_at: null,
      }],
      child_group_memberships: [{
        id: 'membership-1', child_id: 'child-1', group_id: 'group-1', created_by: 'head-office', removed_at: null,
      }],
    };
    for (const [table, records] of Object.entries(initialRows)) {
      for (const row of records) {
        const syncedRow = { ...row, sync_status: 'synced' };
        await db.runAsync(
          `insert into ${table} (${Object.keys(syncedRow).join(', ')}) values (${Object.keys(syncedRow).map(() => '?').join(', ')})`,
          ...Object.values(syncedRow)
        );
      }
    }
    // Retain evidence even if a later operation removes the outbox row.
    await db.execAsync(`
      create temp table terminal_observations (id text);
      create temp trigger observe_terminal_outbox after update of status on sync_outbox
      when new.status = 'terminal'
      begin insert into terminal_observations (id) values (new.id); end;
    `);
    server = createSessionGroupServer({ initialRows });
    engine = createOutboxSyncEngine({
      enqueueRequest: task => task(), getAuthSession: liveTestSession,
      database: db, supabaseClient: server.supabaseClient,
    });
  });
  afterEach(async () => db.closeAsync());

  const expectUploadedFamily = async () => {
    expect(server.rows.sessions.get('lesson-1').group_id).toBe('group-1');
    expect([...server.rows.session_attendees.values()]
      .map(({ child_id, group_id }) => ({ child_id, group_id }))
      .sort((a, b) => a.child_id.localeCompare(b.child_id)))
      .toEqual([{ child_id: 'child-1', group_id: 'group-1' }, { child_id: 'child-2', group_id: 'group-1' }]);
    expect(await db.getAllAsync(
      "select sync_status from sessions where id = 'lesson-1' union all select sync_status from session_attendees where session_id = 'lesson-1'"
    )).toEqual([{ sync_status: 'synced' }, { sync_status: 'synced' }, { sync_status: 'synced' }]);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
    expect(await db.getAllAsync('select * from terminal_observations')).toEqual([]);
  };

  test('save offline, delete the group, reconnect: the session and attendees upload with the group id', async () => {
    await createSessionsRepository({ database: db }).saveSession(LESSON);
    await createGroupsRepository({ database: db }).deleteGroup('group-1');
    await engine.syncAll();
    await expectUploadedFamily();
    expect(server.rows.groups.get('group-1').archived_at).toBeTruthy();
    expect(server.rows.group_ea_assignments.get(GROUP_ASSIGNMENT_ID).unassigned_at).toBeTruthy();
  });

  test('half-uploaded family: the session was sent, the group is deleted, the attendees still upload with the group id', async () => {
    await createSessionsRepository({ database: db }).saveSession(LESSON);
    await engine.syncAll({ tableName: 'sessions' });
    expect(await db.getAllAsync("select status from sync_outbox where table_name = 'sessions'")).toEqual([]);
    expect(await db.getAllAsync("select status from sync_outbox where table_name = 'session_attendees'"))
      .toEqual([{ status: 'pending' }, { status: 'pending' }]);
    expect(server.rows.session_attendees.size).toBe(0);
    await createGroupsRepository({ database: db }).deleteGroup('group-1');
    await engine.syncAll();
    await expectUploadedFamily();
  });

  test('Head Office ended the assignment while the phone was offline: the lesson still uploads with its group', async () => {
    await createSessionsRepository({ database: db }).saveSession(LESSON);
    server.endAssignment('group-1');
    await engine.syncAll();
    await expectUploadedFamily();
  });

  test('a session queued before the update, without group_id, uploads unchanged', async () => {
    const payload = { id: 'old-1', user_id: 'user-1', programme_id: 'programme-a', session_date: '2026-10-19' };
    await db.runAsync(`insert into sessions (id, user_id, programme_id, session_date, sync_status)
      values ('old-1', 'user-1', 'programme-a', '2026-10-19', 'pending')`);
    await createSyncOutboxRepository({ database: db }).enqueue({
      tableName: 'sessions', recordId: 'old-1', operation: 'insert', payload,
    });
    await engine.syncAll();
    const call = server.calls.find(({ tableName }) => tableName === 'sessions');
    expect(call.payload).not.toHaveProperty('group_id');
    expect(server.rows.sessions.get('old-1')).not.toHaveProperty('group_id');
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });
});
