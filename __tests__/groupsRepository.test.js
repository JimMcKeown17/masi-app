jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { groupEaAssignmentDomainId } from '../src/db/repositories/domainRepositoryUtils';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import {
  createGroupsRepository,
  repairGroupOwnershipForSync,
} from '../src/db/repositories/groupsRepository';
import { createGroupingVersionsRepository } from '../src/db/repositories/groupingVersionsRepository';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { sharedClassId } from '../src/utils/groupHelpers';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

const FIXED_NOW = new Date('2026-05-21T08:00:00.000Z');

describe('groupsRepository', () => {
  describe('createGroupWithMembers', () => {
    let db, repository;
    const joinedAt = '2026-05-21T08:00:00.000Z';
    const group = (id = 'new-group', classId = 'class-1') => ({
      id, name: 'Group 3', class_id: classId, created_by: 'user-1',
    });
    const snapshot = () => Promise.all(['groups', 'group_ea_assignments', 'child_group_memberships', 'sync_outbox']
      .map(table => db.getAllAsync(`select * from ${table} order by id`)));
    const priorMembership = async ({
      removedAt = null, unassignedAt = null, userId = 'user-1', syncStatus = 'synced',
      archivedAt = null, programmeId = 'programme-a',
    } = {}) => {
      await db.runAsync(`insert into groups (id, name, programme_id, created_by, archived_at, sync_status)
        values ('prior', 'Group 1', ?, 'head-office', ?, 'synced')`, programmeId, archivedAt);
      await db.runAsync(`insert into group_ea_assignments
        (id, group_id, ea_user_id, programme_id, assigned_at, unassigned_at, sync_status)
        values ('prior-ea', 'prior', ?, ?, '2026-01-15', ?, ?)`, userId, programmeId, unassignedAt, syncStatus);
      await db.runAsync(`insert into child_group_memberships
        (id, child_id, group_id, joined_at, removed_at, sync_status)
        values ('prior-member', 'c2', 'prior', '2026-01-15', ?, ?)`, removedAt, syncStatus);
    };
    beforeEach(async () => {
      db = await createMigratedDatabase(runMigrations);
      await seedCoreData(db);
      await db.runAsync("insert into classes (id, school_id, name, grade, academic_year_id) values ('class-2', 'school-1', 'Other', '1', 'year-2026')");
      for (const id of ['c1', 'c2', 'c3', 'c4']) await db.runAsync(
        "insert into children (id, first_name, last_name, class_id, sync_status) values (?, 'Test', 'Child', ?, 'synced')",
        id, id === 'c4' ? 'class-2' : 'class-1'
      );
      repository = createGroupsRepository({ database: db });
    });
    afterEach(async () => { jest.restoreAllMocks(); await db.closeAsync(); });

    test('a new group, its assignment and its members commit together with outbox rows in push order', async () => {
      expect(await repository.createGroupWithMembers({ group: group(), childIds: ['c1', 'c2'], joinedAt })).toBe(true);
      expect(await repository.getGroups({ userId: 'user-1' })).toEqual([
        expect.objectContaining({ ...group(), programme_id: 'programme-a', sync_status: 'pending' }),
      ]);
      expect(await db.getAllAsync('select group_id, ea_user_id, programme_id from group_ea_assignments')).toEqual([
        { group_id: 'new-group', ea_user_id: 'user-1', programme_id: 'programme-a' },
      ]);
      const members = await repository.getChildrenGroups();
      expect(members).toHaveLength(2);
      expect(members.map(row => row.child_id).sort()).toEqual(['c1', 'c2']);
      expect(new Set(members.map(row => row.id)).size).toBe(2);
      for (const member of members) expect(member).toMatchObject({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/i), group_id: 'new-group', created_by: 'user-1',
        joined_at: joinedAt, sync_status: 'pending',
      });
      const outbox = await db.getAllAsync('select table_name, operation, payload, owner_user_id from sync_outbox order by rowid');
      expect(outbox.map(row => [row.table_name, row.operation])).toEqual([
        ['groups', 'insert'], ['group_ea_assignments', 'insert'],
        ['child_group_memberships', 'insert'], ['child_group_memberships', 'insert'],
      ]);
      expect(outbox.every(row => row.owner_user_id === 'user-1')).toBe(true);
      expect(outbox.slice(2).map(row => JSON.parse(row.payload).joined_at)).toEqual([joinedAt, joinedAt]);
      const { supabaseClient, calls } = createSupabaseMock();
      const engine = createOutboxSyncEngine({ database: db, supabaseClient, enqueueRequest: task => task(),
        getAuthSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) });
      expect(await engine.syncAll()).toMatchObject({ totalSynced: 4, totalFailed: 0 });
      expect(calls.map(call => call.tableName)).toEqual([
        'groups', 'group_ea_assignments', 'child_group_memberships', 'child_group_memberships',
      ]);
      expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
    });

    test('the shared class is recorded; children in different classes give class_id null', async () => {
      for (const [id, childIds, expected] of [
        ['same-class', ['c1', 'c2'], 'class-1'], ['mixed-class', ['c3', 'c4'], null],
      ]) {
        const childrenById = await createChildrenRepository({ database: db }).getChildrenByIds(childIds);
        await repository.createGroupWithMembers({ group: group(id, sharedClassId(Object.values(childrenById))), childIds });
        expect(await db.getFirstAsync('select class_id from groups where id = ?', id)).toEqual({ class_id: expected });
      }
    });

    test('a failure on the second member rolls back the group and the first member', async () => {
      await db.execAsync(`create temp trigger fail_second_member before insert on child_group_memberships
        when new.child_id = 'c2' begin select raise(abort, 'second member refused'); end;`);
      const before = await snapshot();
      await expect(repository.createGroupWithMembers({ group: group(), childIds: ['c1', 'c2'] }))
        .rejects.toMatchObject({ message: 'second member refused', code: 'SQLITE_CONSTRAINT_TRIGGER' });
      expect(await snapshot()).toEqual(before);
    });

    test('a child already in another of my groups is refused and nothing is written', async () => {
      await priorMembership();
      const before = await snapshot();
      const writes = jest.spyOn(db, 'runAsync');
      await expect(repository.createGroupWithMembers({ group: group(), childIds: ['c1', 'c2'] }))
        .rejects.toThrow('Child already in one of your groups');
      expect(writes).not.toHaveBeenCalled();
      expect(await snapshot()).toEqual(before);
    });

    test('a pending active membership also refuses a second group before writing', async () => {
      await priorMembership({ syncStatus: 'pending' });
      const before = await snapshot();
      await expect(repository.createGroupWithMembers({ group: group(), childIds: ['c2'] })).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    });

    test.each([
      ['removed membership', { removedAt: joinedAt }],
      ['ended group assignment', { unassignedAt: joinedAt }],
      ['another EA\'s group', { userId: 'user-2' }],
      ['an archived group still assigned', { archivedAt: joinedAt }],
      ['another programme\'s group', { programmeId: 'programme-b' }],
    ])('%s does not refuse a new group', async (_name, options) => {
      await priorMembership(options);
      // The picker offers exactly the children this accepts.
      const visible = await repository.getVisibleChildrenGroups({ userId: 'user-1' });
      expect(visible.map(row => row.child_id)).not.toContain('c2');
      expect(await repository.createGroupWithMembers({ group: group(), childIds: ['c2'] })).toBe(true);
      expect(await repository.getGroups({ userId: 'user-1' })).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'new-group' }),
      ]));
    });

    test('concurrent group creations check membership under the same writer lock', async () => {
      const outcomes = await Promise.allSettled([
        repository.createGroupWithMembers({ group: group('first'), childIds: ['c1'] }),
        repository.createGroupWithMembers({ group: group('second'), childIds: ['c1'] }),
      ]);
      expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toEqual([{ status: 'fulfilled', value: true }]);
      expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
      expect(await db.getAllAsync('select id from groups')).toHaveLength(1);
      expect(await db.getAllAsync('select id from child_group_memberships')).toHaveLength(1);
      expect(await db.getAllAsync('select id from sync_outbox')).toHaveLength(3);
    });
  });

  describe('authoritative group programme convergence', () => {
    test.each(['synced', 'terminal'])('a %s cached group converges to the server programme, returns to the roster and takes its session', async (status) => {
      const db = await createMigratedDatabase(runMigrations);
      try {
        await seedCoreData(db);
        const repository = createGroupsRepository({ database: db });
        const cached = {
          id: 'stale-programme-group', name: 'Cached group', programme_id: 'programme-b',
          class_id: 'class-1', created_by: 'head-office', sync_status: status, row_version: 2,
        };
        await repository.saveGroup(cached);
        // The assignment is authoritative A data; the group's cached Programme is stale.
        await db.runAsync(`insert into group_ea_assignments
          (id, group_id, ea_user_id, programme_id, created_by, sync_status)
          values (?, ?, 'user-1', 'programme-a', 'head-office', 'synced')`,
        groupEaAssignmentDomainId({ groupId: cached.id }), cached.id);
        expect(await repository.getGroups({ userId: 'user-1', programmeId: 'programme-a' })).toEqual([]);

        const result = await repository.saveServerGroupRows([{
          ...cached, name: 'Authoritative group', programme_id: 'programme-a', sync_status: 'synced', row_version: 3,
        }]);
        expect(result).toEqual(expect.objectContaining({ applied: 1, skipped: 0, failed: 0, fallbackUsed: false }));
        expect(await repository.getGroups({ userId: 'user-1', programmeId: 'programme-a' })).toEqual([
          expect.objectContaining({ id: cached.id, programme_id: 'programme-a', sync_status: 'synced', row_version: 3 }),
        ]);
        expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);

        await createChildrenRepository({ database: db }).saveChildRecord({
          id: 'child-1', first_name: 'Test', last_name: 'Child', created_by: 'head-office', synced: true,
        });
        const sessions = createSessionsRepository({ database: db });
        expect(await sessions.saveSession({
          id: 'programme-a-session', user_id: 'user-1', programme_id: 'programme-a',
          session_date: '2026-05-21', group_id: cached.id, children_ids: ['child-1'], synced: false,
        })).toBe(true);
        expect(await sessions.getSessions({ userId: 'user-1', programmeId: 'programme-a' })).toEqual([
          expect.objectContaining({ id: 'programme-a-session', programme_id: 'programme-a', group_id: cached.id }),
        ]);
        expect(await db.getAllAsync('select table_name from sync_outbox order by table_name'))
          .toEqual([{ table_name: 'session_attendees' }, { table_name: 'sessions' }]);
      } finally {
        await db.closeAsync();
      }
    });

    test.each(['pending', 'failed'])('a pull does not overwrite a %s group or its owed payload', async (status) => {
      const db = await createMigratedDatabase(runMigrations);
      try {
        await seedCoreData(db);
        const repository = createGroupsRepository({ database: db });
        const local = {
          id: 'owed-group', name: 'Local group', programme_id: 'programme-b',
          created_by: 'user-1', sync_status: status, row_version: 2,
        };
        await repository.saveGroup(local);
        await db.runAsync('update sync_outbox set status = ?', status);
        const groupBefore = await db.getAllAsync('select * from groups');
        const outboxBefore = await db.getAllAsync('select * from sync_outbox order by id');
        expect(outboxBefore).toHaveLength(1);
        expect(JSON.parse(outboxBefore[0].payload).programme_id).toBe('programme-b');
        const result = await repository.saveServerGroupRows([{
          ...local, name: 'Server group', programme_id: 'programme-a', sync_status: 'synced', row_version: 3,
        }]);
        expect(result).toEqual(expect.objectContaining({ applied: 0, skipped: 1, failed: 0, fallbackUsed: false }));
        expect(await db.getAllAsync('select * from groups')).toEqual(groupBefore);
        expect(await db.getAllAsync('select * from sync_outbox order by id')).toEqual(outboxBefore);
      } finally {
        await db.closeAsync();
      }
    });

    test('an older server version cannot change an acknowledged group programme', async () => {
      const db = await createMigratedDatabase(runMigrations);
      try {
        await seedCoreData(db);
        const repository = createGroupsRepository({ database: db });
        const local = {
          id: 'newer-local-group', name: 'Acknowledged group', programme_id: 'programme-b',
          created_by: 'head-office', sync_status: 'synced', row_version: 5,
        };
        await repository.saveGroup(local);
        const before = await db.getAllAsync('select * from groups');
        expect(await repository.saveServerGroupRows([{
          ...local, programme_id: 'programme-a', row_version: 4,
        }])).toEqual(expect.objectContaining({ applied: 0, skipped: 1, failed: 0, fallbackUsed: false }));
        expect(await db.getAllAsync('select * from groups')).toEqual(before);
        expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
      } finally {
        await db.closeAsync();
      }
    });
  });

  describe('fixed group programme', () => {
    test.each([
      ['updateGroup', 'synced'], ['updateGroup', 'pending'],
      ['saveGroup', 'synced'], ['saveGroup', 'pending'],
    ])('%s refuses a programme change on a %s group without changing rows or outbox', async (method, status) => {
      const db = await createMigratedDatabase(runMigrations);
      try {
        await seedCoreData(db);
        const repository = createGroupsRepository({ database: db });
        const group = {
          id: 'fixed-group', name: 'Original group', programme_id: 'programme-a',
          class_id: 'class-1', created_by: 'user-1', sync_status: status,
        };
        await repository.saveGroup(group);
        const snapshot = async () => Promise.all(['groups', 'group_ea_assignments', 'sync_outbox']
          .map(table => db.getAllAsync(`select * from ${table} order by id`)));
        const before = await snapshot();
        let caught;
        try {
          const updates = { programme_id: 'programme-b', name: 'Refused change' };
          if (method === 'updateGroup') await repository.updateGroup(group.id, updates);
          else await repository.saveGroup({ ...group, ...updates, sync_status: 'pending' });
        } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(Error);
        expect(caught?.message).toBe('groups.programme_id cannot be changed after insert');
        expect(await snapshot()).toEqual(before);
      } finally {
        await db.closeAsync();
      }
    });

    test.each(['updateGroup', 'saveGroup'])('%s accepts an unchanged programme', async (method) => {
      const db = await createMigratedDatabase(runMigrations);
      try {
        await seedCoreData(db);
        const repository = createGroupsRepository({ database: db });
        const group = {
          id: 'fixed-group', name: 'Original group', programme_id: 'programme-a',
          class_id: 'class-1', created_by: 'user-1', synced: true,
        };
        await repository.saveGroup(group);
        const updates = { programme_id: 'programme-a', name: 'Renamed group' };
        const result = method === 'updateGroup'
          ? await repository.updateGroup(group.id, updates)
          : await repository.saveGroup({ ...group, ...updates, synced: false });
        expect(result).toBe(true);
        expect(await db.getFirstAsync('select name, programme_id from groups where id = ?', group.id))
          .toEqual({ name: 'Renamed group', programme_id: 'programme-a' });
        const rows = await db.getAllAsync("select operation, payload from sync_outbox where table_name = 'groups'");
        expect(rows).toHaveLength(1);
        expect(rows[0].operation).toBe(method === 'updateGroup' ? 'update' : 'insert');
        expect(JSON.parse(rows[0].payload)).toEqual(expect.objectContaining(updates));
      } finally {
        await db.closeAsync();
      }
    });

    test('a name-only edit keeps the programme and enqueues its update', async () => {
      const db = await createMigratedDatabase(runMigrations);
      try {
        await seedCoreData(db);
        const repository = createGroupsRepository({ database: db });
        await repository.saveGroup({
          id: 'fixed-group', name: 'Original group', programme_id: 'programme-a', created_by: 'user-1', synced: true,
        });
        expect(await repository.updateGroup('fixed-group', { name: 'Renamed only' })).toBe(true);
        expect(await db.getFirstAsync("select name, programme_id from groups where id = 'fixed-group'"))
          .toEqual({ name: 'Renamed only', programme_id: 'programme-a' });
        expect(await db.getAllAsync("select table_name, operation from sync_outbox"))
          .toEqual([{ table_name: 'groups', operation: 'update' }]);
      } finally {
        await db.closeAsync();
      }
    });
  });

  test('editing a full mapped synced group ignores caller sync bookkeeping and queues one update', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createGroupsRepository({ database: db });
      await repository.saveGroup({
        id: 'group-synced', name: 'Synced group', programme_id: 'programme-a',
        class_id: 'class-1', created_by: 'user-1', synced: true,
      });
      const [current] = await repository.getGroups();
      expect(current).toEqual(expect.objectContaining({ sync_status: 'synced', synced: true }));
      expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);

      await repository.updateGroup(current.id, {
        ...current,
        name: 'Updated group',
        last_sync_error: 'stale caller error',
      });

      const [updated] = await repository.getGroups();
      expect(updated).toEqual(expect.objectContaining({
        name: 'Updated group', sync_status: 'pending', synced: false, last_sync_error: null,
      }));
      const outbox = await db.getAllAsync('select table_name, record_id, operation, payload from sync_outbox');
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toEqual(expect.objectContaining({
        table_name: 'groups', record_id: current.id, operation: 'update',
      }));
      expect(JSON.parse(outbox[0].payload)).toEqual(expect.objectContaining({
        name: 'Updated group', sync_status: 'pending', synced: false, last_sync_error: null,
      }));
    } finally {
      await db.closeAsync();
    }
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('grouping version save enforces one active grouping version per class/year', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createGroupingVersionsRepository({ database: db });

      await repository.save({
        id: 'grouping-1',
        class_id: 'class-1',
        academic_year_id: 'year-2026',
        version_number: 1,
        status: 'active',
      });

      await expect(repository.save({
        id: 'grouping-2',
        class_id: 'class-1',
        academic_year_id: 'year-2026',
        version_number: 2,
        status: 'active',
      })).rejects.toThrow(/unique/i);
    } finally {
      await db.closeAsync();
    }
  });

  test('group save, membership operations, and archive are transactional', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      }, { actorUserId: 'user-1' });
      const groupsRepository = createGroupsRepository({ database: db });

      await groupsRepository.saveGroup({
        id: 'group-1',
        name: 'Group 1',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await groupsRepository.addChildToGroup({
        id: 'membership-1',
        child_id: 'child-1',
        group_id: 'group-1',
        synced: false,
      });

      await groupsRepository.archiveGroup('group-1', {
        actorUserId: 'user-1',
        archivedAt: '2026-05-25T00:00:00.000Z',
      });

      expect(await db.getFirstAsync('select archived_at from groups where id = ?', 'group-1'))
        .toEqual({ archived_at: '2026-05-25T00:00:00.000Z' });
      expect(await db.getFirstAsync('select unassigned_at from group_ea_assignments where group_id = ?', 'group-1'))
        .toEqual({ unassigned_at: '2026-05-25T00:00:00.000Z' });
      expect(await db.getFirstAsync('select removed_at from child_group_memberships where id = ?', 'membership-1'))
        .toEqual({ removed_at: '2026-05-25T00:00:00.000Z' });
    } finally {
      await db.closeAsync();
    }
  });

  test('mobile-created group saves owner and group EA assignment for sync', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const groupsRepository = createGroupsRepository({ database: db });

      await groupsRepository.saveGroup({
        id: 'group-1',
        name: 'Group 1',
        staff_id: 'user-1',
        synced: false,
      });

      expect(await db.getFirstAsync(`
        select id, programme_id, created_by, sync_status
        from groups
        where id = 'group-1'
      `)).toEqual({
        id: 'group-1',
        programme_id: 'programme-a',
        created_by: 'user-1',
        sync_status: 'pending',
      });

      const assignment = await db.getFirstAsync(`
        select id, group_id, ea_user_id, programme_id, created_by, sync_status
        from group_ea_assignments
        where group_id = 'group-1'
      `);
      expect(assignment).toEqual({
        id: groupEaAssignmentDomainId({ groupId: 'group-1' }),
        group_id: 'group-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        created_by: 'user-1',
        sync_status: 'pending',
      });

      const outboxTables = await db.getAllAsync(`
        select table_name, operation
        from sync_outbox
        where record_id = 'group-1'
           or table_name = 'group_ea_assignments'
        order by table_name
      `);
      expect(outboxTables).toEqual([
        { table_name: 'group_ea_assignments', operation: 'insert' },
        { table_name: 'groups', operation: 'insert' },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('ownership repair reactivates an archived deterministic group EA row without duplicating it', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const groupsRepository = createGroupsRepository({ database: db });
      const groupId = 'group-archived-assignment';
      const assignmentId = groupEaAssignmentDomainId({ groupId });

      await groupsRepository.saveGroup({
        id: groupId,
        name: 'Archived Assignment Group',
        staff_id: 'user-1',
        synced: false,
      });
      await db.runAsync(
        'update group_ea_assignments set unassigned_at = ? where id = ?',
        '2026-05-25T00:00:00.000Z',
        assignmentId
      );
      await db.runAsync('update groups set created_by = null where id = ?', groupId);

      await repairGroupOwnershipForSync({ database: db });

      const assignments = await db.getAllAsync(`
        select id, group_id, ea_user_id, programme_id, created_by, unassigned_at, sync_status
        from group_ea_assignments
        where group_id = ?
      `, groupId);
      expect(assignments).toEqual([
        {
          id: assignmentId,
          group_id: groupId,
          ea_user_id: 'user-1',
          programme_id: 'programme-a',
          created_by: 'user-1',
          unassigned_at: null,
          sync_status: 'pending',
        },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('child group membership derives owner and grouping version from group', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      }, { actorUserId: 'user-1' });
      await createGroupingVersionsRepository({ database: db }).save({
        id: 'grouping-1',
        class_id: 'class-1',
        academic_year_id: 'year-2026',
        version_number: 1,
        status: 'active',
        created_by: 'user-1',
        synced: false,
      });

      const groupsRepository = createGroupsRepository({ database: db });
      await groupsRepository.saveGroup({
        id: 'group-1',
        name: 'Group 1',
        programme_id: 'programme-a',
        class_id: 'class-1',
        grouping_version_id: 'grouping-1',
        created_by: 'user-1',
        synced: false,
      });

      await groupsRepository.addChildToGroup({
        id: 'membership-1',
        child_id: 'child-1',
        group_id: 'group-1',
        synced: false,
      });

      const membership = await db.getFirstAsync(`
        select id, child_id, group_id, grouping_version_id, created_by, sync_status
        from child_group_memberships
        where id = 'membership-1'
      `);
      expect(membership).toEqual({
        id: 'membership-1',
        child_id: 'child-1',
        group_id: 'group-1',
        grouping_version_id: 'grouping-1',
        created_by: 'user-1',
        sync_status: 'pending',
      });

      const outbox = await db.getFirstAsync(`
        select payload
        from sync_outbox
        where table_name = 'child_group_memberships'
          and record_id = 'membership-1'
      `);
      expect(JSON.parse(outbox.payload)).toEqual(expect.objectContaining({
        created_by: 'user-1',
        grouping_version_id: 'grouping-1',
      }));
    } finally {
      await db.closeAsync();
    }
  });

  test('deleteGroup archives synced groups with dependents instead of creating a sync orphan', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      }, { actorUserId: 'user-1' });
      const groupsRepository = createGroupsRepository({ database: db });

      await groupsRepository.saveGroup({
        id: 'group-1',
        name: 'Group 1',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await groupsRepository.addChildToGroup({
        id: 'membership-1',
        child_id: 'child-1',
        group_id: 'group-1',
        synced: false,
      });
      await db.runAsync("update groups set sync_status = 'synced' where id = 'group-1'");
      await db.runAsync('delete from sync_outbox');

      await groupsRepository.deleteGroup('group-1', {
        actorUserId: 'user-1',
        archivedAt: '2026-05-26T00:00:00.000Z',
      });

      expect(await db.getFirstAsync('select id, archived_at from groups where id = ?', 'group-1'))
        .toEqual({ id: 'group-1', archived_at: '2026-05-26T00:00:00.000Z' });
      expect(await db.getFirstAsync('select unassigned_at from group_ea_assignments where group_id = ?', 'group-1'))
        .toEqual({ unassigned_at: '2026-05-26T00:00:00.000Z' });
      expect(await db.getFirstAsync('select removed_at from child_group_memberships where id = ?', 'membership-1'))
        .toEqual({ removed_at: '2026-05-26T00:00:00.000Z' });
      expect(await db.getFirstAsync(`
        select table_name, record_id, operation
        from sync_outbox
        where table_name = 'groups'
          and record_id = 'group-1'
      `)).toEqual({
        table_name: 'groups',
        record_id: 'group-1',
        operation: 'archive',
      });
    } finally {
      await db.closeAsync();
    }
  });

  test('getChildrenGroups excludes removed memberships by default', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      }, { actorUserId: 'user-1' });
      const groupsRepository = createGroupsRepository({ database: db });

      await groupsRepository.saveGroup({
        id: 'group-1',
        name: 'Group 1',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await groupsRepository.addChildToGroup({
        id: 'membership-1',
        child_id: 'child-1',
        group_id: 'group-1',
        synced: false,
      });

      expect(await groupsRepository.getChildrenGroups()).toEqual([
        expect.objectContaining({ id: 'membership-1' }),
      ]);

      await groupsRepository.removeChildFromGroup('child-1', 'group-1', {
        removedAt: '2026-05-27T00:00:00.000Z',
      });

      expect(await groupsRepository.getChildrenGroups()).toEqual([]);
      expect(await groupsRepository.getChildrenGroups({ includeRemoved: true })).toEqual([
        expect.objectContaining({ id: 'membership-1', removed_at: '2026-05-27T00:00:00.000Z' }),
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('visible membership reads exclude active rows for groups the EA cannot see', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      }, { actorUserId: 'user-1' });
      const repository = createGroupsRepository({ database: db });

      for (const [id, name] of [
        ['group-visible', 'A Visible Group'],
        ['group-ended', 'B Ended Assignment'],
        ['group-archived', 'C Archived Group'],
      ]) {
        await repository.saveGroup({
          id,
          name,
          programme_id: 'programme-a',
          class_id: 'class-1',
          created_by: 'user-1',
          synced: false,
        });
        await repository.addChildToGroup({
          id: `membership-${id}`,
          child_id: 'child-1',
          group_id: id,
          created_by: 'user-1',
          synced: false,
        });
      }
      await db.runAsync(`
        update group_ea_assignments
        set unassigned_at = '2026-05-22T00:00:00.000Z'
        where group_id = 'group-ended'
      `);
      await db.runAsync(`
        update groups
        set archived_at = '2026-05-22T00:00:00.000Z'
        where id = 'group-archived'
      `);

      expect((await repository.getChildrenGroups())
        .map((membership) => membership.id).sort()).toEqual([
        'membership-group-archived',
        'membership-group-ended',
        'membership-group-visible',
      ]);
      expect((await repository.getVisibleChildrenGroups({
        userId: 'user-1',
        programmeId: 'programme-a',
      })).map((membership) => membership.id)).toEqual([
        'membership-group-visible',
      ]);
      expect(await db.getAllAsync(`
        select id, removed_at
        from child_group_memberships
        order by id
      `)).toEqual([
        { id: 'membership-group-archived', removed_at: null },
        { id: 'membership-group-ended', removed_at: null },
        { id: 'membership-group-visible', removed_at: null },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('group saves require an active programme assignment when programme_id is omitted', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await db.runAsync("update staff_programme_assignments set ended_at = '2026-05-21T00:00:00.000Z'");
      const repository = createGroupsRepository({ database: db });

      await expect(repository.saveGroup({
        id: 'group-without-programme',
        name: 'Group Without Programme',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      })).rejects.toThrow(/No active programme assignment/i);

      expect(await db.getFirstAsync('select count(*) as count from groups')).toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('user-scoped group reads only return groups in the active programme', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createGroupsRepository({ database: db });

      await repository.saveGroup({
        id: 'group-literacy',
        name: 'Literacy Group',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await repository.saveGroup({
        id: 'group-numeracy',
        name: 'Numeracy Group',
        programme_id: 'programme-b',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });

      expect((await repository.getGroups()).map(group => group.id))
        .toEqual(['group-literacy', 'group-numeracy']);
      expect(await repository.getGroups({ userId: 'user-1' })).toEqual([
        expect.objectContaining({ id: 'group-literacy', programme_id: 'programme-a' }),
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('user-scoped group reads require an active assignment for that EA', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createGroupsRepository({ database: db });

      await repository.saveGroup({
        id: 'group-visible',
        name: 'A Visible Group',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await repository.saveGroup({
        id: 'group-ended',
        name: 'B Ended Assignment',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await repository.saveGroup({
        id: 'group-unassigned',
        name: 'C Never Assigned',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-2',
        synced: false,
      });
      await repository.saveGroup({
        id: 'group-archived',
        name: 'D Archived Group',
        programme_id: 'programme-a',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      });
      await db.runAsync(`
        update group_ea_assignments
        set unassigned_at = '2026-05-22T00:00:00.000Z'
        where group_id = 'group-ended'
      `);
      await db.runAsync(`
        update groups
        set archived_at = '2026-05-22T00:00:00.000Z'
        where id = 'group-archived'
      `);

      expect((await repository.getGroups({
        userId: 'user-1',
        programmeId: 'programme-a',
      })).map((group) => group.id)).toEqual(['group-visible']);

      expect((await repository.getGroups()).map((group) => group.id)).toEqual([
        'group-visible',
        'group-ended',
        'group-unassigned',
      ]);
    } finally {
      await db.closeAsync();
    }
  });
});
