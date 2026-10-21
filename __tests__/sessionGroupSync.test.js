jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { runMigrations } from '../src/db/migrations';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { childEaAssignmentDomainId, groupEaAssignmentDomainId } from '../src/db/repositories/domainRepositoryUtils';
import { createOutboxSyncEngine, _testComputeEvidencePending } from '../src/services/offlineSync';
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
  let initialRows;
  const configureServer = (options = {}) => {
    server = createSessionGroupServer({ initialRows, ...options });
    engine = createOutboxSyncEngine({
      enqueueRequest: task => task(), getAuthSession: liveTestSession,
      database: db, supabaseClient: server.supabaseClient,
    });
  };
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    initialRows = {
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
    configureServer();
  });
  afterEach(async () => {
    jest.useRealTimers();
    await db.closeAsync();
  });

  const expectUploadedFamily = async (groupId = 'group-1') => {
    expect(server.rows.sessions.get('lesson-1').group_id).toBe(groupId);
    expect([...server.rows.session_attendees.values()]
      .map(({ child_id, group_id }) => ({ child_id, group_id }))
      .sort((a, b) => a.child_id.localeCompare(b.child_id)))
      .toEqual([{ child_id: 'child-1', group_id: groupId }, { child_id: 'child-2', group_id: groupId }]);
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

  const endLocalAssignment = async (eaUserId = 'user-1') => {
    await db.runAsync(`update group_ea_assignments set assigned_at = '2026-10-19T12:00:00.000Z',
      unassigned_at = '2026-10-20T12:00:00.000Z',
      ea_user_id = ?, sync_status = 'pending' where id = ?`, eaUserId, GROUP_ASSIGNMENT_ID);
  };
  const oweAssignmentInsert = async (status = 'failed') => {
    const outbox = createSyncOutboxRepository({ database: db });
    await outbox.enqueue({
      tableName: 'group_ea_assignments', recordId: GROUP_ASSIGNMENT_ID, operation: 'insert',
      payload: { id: GROUP_ASSIGNMENT_ID, group_id: 'group-1', ea_user_id: 'user-1' },
    });
    await db.runAsync("update sync_outbox set status = ? where table_name = 'group_ea_assignments'", status);
  };
  const evidencePending = (tableName = 'sessions', payload = { group_id: 'group-1' }, includeGrant = true) => (
    _testComputeEvidencePending({
      database: db, outboxRepository: createSyncOutboxRepository({ database: db }),
      outboxRecord: { table_name: tableName, record_id: 'evidence-record', owner_user_id: 'user-1', payload },
      includeGrant,
    })
  );

  test("a session's group grant counts an owed assignment insert even after the local assignment ended", async () => {
    await endLocalAssignment();
    await oweAssignmentInsert();
    expect(await evidencePending()).toBe(true);
    expect(await evidencePending('sessions', { group_id: 'group-1' }, false)).toBe(false);
  });

  test('an acknowledged assignment insert with only its archive owed is not evidence', async () => {
    await endLocalAssignment();
    await createSyncOutboxRepository({ database: db }).enqueue({
      tableName: 'group_ea_assignments', recordId: GROUP_ASSIGNMENT_ID, operation: 'archive',
      id: `group_ea_assignments:${GROUP_ASSIGNMENT_ID}:lifecycle`,
      payload: { id: GROUP_ASSIGNMENT_ID, unassigned_at: '2026-10-20T12:00:00.000Z' },
    });
    expect(await db.getFirstAsync('select id from sync_outbox')).toEqual({
      id: `group_ea_assignments:${GROUP_ASSIGNMENT_ID}:lifecycle`,
    });
    expect(await evidencePending()).toBe(false);
  });

  test('a terminal assignment insert is not evidence', async () => {
    await endLocalAssignment();
    await oweAssignmentInsert('terminal');
    expect(await evidencePending()).toBe(false);
  });

  test("another EA's owed assignment insert is not evidence", async () => {
    await endLocalAssignment('user-2');
    await oweAssignmentInsert();
    expect(await evidencePending()).toBe(false);
  });

  test('attendees use the same held-group evidence', async () => {
    await createSessionsRepository({ database: db }).saveSession({ ...LESSON, synced: true });
    await endLocalAssignment();
    await oweAssignmentInsert();
    expect(await evidencePending('session_attendees', {
      session_id: 'lesson-1', child_id: 'child-2', group_id: 'group-1',
    })).toBe(true);
  });

  test('other tables keep active-only evidence', async () => {
    await endLocalAssignment();
    await oweAssignmentInsert();
    expect(await evidencePending('child_group_memberships', {
      child_id: 'child-2', group_id: 'group-1',
    })).toBe(false);
  });

  const saveNewGroup = (id = 'group-new') => createGroupsRepository({ database: db }).saveGroup({
    id, name: 'Group 2', programme_id: 'programme-a', class_id: 'class-1', created_by: 'user-1', synced: false,
  });
  const startClock = () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-21T10:00:00.000Z'));
  };
  const advancePass = () => jest.setSystemTime(new Date(Date.now() + 16 * 60 * 1000));

  test("the assignment's own insert fails over three passes after the group is deleted; the lesson converges with no manual retry", async () => {
    startClock();
    configureServer({ failGroupAssignmentInserts: 3 });
    await saveNewGroup();
    await createGroupsRepository({ database: db }).addChildToGroup({
      child_id: 'child-1', group_id: 'group-new', synced: false,
    });
    await createSessionsRepository({ database: db }).saveSession({ ...LESSON, group_id: 'group-new' });
    await createGroupsRepository({ database: db }).deleteGroup('group-new');

    let sawRlsRetry = false;
    for (let pass = 1; pass <= 6; pass += 1) {
      await engine.syncAll();
      const lesson = await db.getFirstAsync("select status, last_error from sync_outbox where table_name = 'sessions'");
      if (lesson) {
        expect(['pending', 'failed']).toContain(lesson.status);
        if (lesson.status === 'failed' && /row-level security/.test(lesson.last_error)) sawRlsRetry = true;
      }
      expect(await db.getAllAsync('select * from terminal_observations')).toEqual([]);
      if (!(await db.getFirstAsync('select id from sync_outbox'))) break;
      advancePass();
    }
    expect(sawRlsRetry).toBe(true);
    await expectUploadedFamily('group-new');
    expect(server.rows.groups.get('group-new').archived_at).toBeTruthy();
    expect(server.rows.group_ea_assignments.get(groupEaAssignmentDomainId({ groupId: 'group-new' })).unassigned_at).toBeTruthy();
  });

  test("the group's own insert fails once: its lesson waits in that pass and lands in the next", async () => {
    startClock();
    configureServer({ failGroupInserts: 1 });
    await saveNewGroup();
    await createSessionsRepository({ database: db }).saveSession({ ...LESSON, group_id: 'group-new' });
    await engine.syncAll();
    expect(server.calls.filter(({ tableName }) => tableName === 'sessions')).toEqual([]);
    expect(await db.getFirstAsync("select status, retry_count from sync_outbox where table_name = 'sessions'"))
      .toEqual({ status: 'pending', retry_count: 0 });
    expect(await db.getAllAsync('select * from terminal_observations')).toEqual([]);
    advancePass();
    await engine.syncAll();
    await expectUploadedFamily('group-new');
  });

  test('sessions without a group are not held back by an unrelated failed group', async () => {
    startClock();
    configureServer({ failGroupInserts: 1 });
    await saveNewGroup('group-other');
    for (const [id, classId] of [['lesson-class', 'class-1'], ['lesson-classless', null]]) {
      await createSessionsRepository({ database: db }).saveSession({
        ...LESSON, id, class_id: classId, group_id: null,
      });
    }
    await engine.syncAll();
    expect([...server.rows.sessions.keys()].sort()).toEqual(['lesson-class', 'lesson-classless']);
    expect(await db.getAllAsync("select * from sync_outbox where table_name in ('sessions', 'session_attendees')")).toEqual([]);
    expect(await db.getAllAsync('select * from terminal_observations')).toEqual([]);
  });
});
