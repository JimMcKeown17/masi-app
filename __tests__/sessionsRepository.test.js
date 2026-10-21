jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { validate as uuidValidate } from 'uuid';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

describe('sessionsRepository', () => {
  describe('session group capture', () => {
    let db;
    let repository;
    const lesson = {
      id: 'session-group', user_id: 'user-1', programme_id: 'programme-a',
      session_date: '2026-10-19', group_id: 'group-1',
      children_ids: ['child-1', 'child-2'], synced: false,
    };
    beforeEach(async () => {
      db = await createMigratedDatabase(runMigrations);
      await seedCoreData(db);
      await db.execAsync(`
        insert into children (id, first_name, last_name) values
          ('child-1', 'First', 'Child'), ('child-2', 'Second', 'Child');
        insert into groups (id, name, programme_id, class_id) values
          ('group-1', 'Group 1', 'programme-a', 'class-1'),
          ('group-2', 'Group 2', 'programme-a', 'class-1'),
          ('group-numeracy', 'Numeracy group', 'programme-b', 'class-1');
        insert into child_group_memberships (id, child_id, group_id)
          values ('membership-2', 'child-2', 'group-2');
      `);
      repository = createSessionsRepository({ database: db });
    });
    afterEach(async () => db.closeAsync());

    test('a group session stores its group on the session and every attendee, including a child from another group', async () => {
      expect(await repository.saveSession(lesson)).toBe(true);
      expect(await db.getFirstAsync("select group_id from sessions where id = 'session-group'"))
        .toEqual({ group_id: 'group-1' });
      expect(await db.getAllAsync('select child_id, group_id from session_attendees order by child_id'))
        .toEqual([{ child_id: 'child-1', group_id: 'group-1' }, { child_id: 'child-2', group_id: 'group-1' }]);
      expect(await db.getAllAsync("select group_id, removed_at from child_group_memberships where child_id = 'child-2'"))
        .toEqual([{ group_id: 'group-2', removed_at: null }]);
      const outbox = await db.getAllAsync('select table_name, payload from sync_outbox order by table_name, record_id');
      expect(outbox.map(({ table_name }) => table_name)).toEqual(['session_attendees', 'session_attendees', 'sessions']);
      for (const { payload } of outbox) expect(JSON.parse(payload).group_id).toBe('group-1');
    });

    test('a session without group_id stores null, and group_ids is no longer read', async () => {
      const { group_id, ...withoutGroup } = lesson;
      await repository.saveSession({ ...withoutGroup, group_ids: ['group-1'] });
      expect(await db.getFirstAsync("select group_id from sessions where id = 'session-group'"))
        .toEqual({ group_id: null });
      expect(await db.getAllAsync('select child_id, group_id from session_attendees order by child_id'))
        .toEqual([{ child_id: 'child-1', group_id: null }, { child_id: 'child-2', group_id: null }]);
      const outbox = await db.getFirstAsync("select payload from sync_outbox where table_name = 'sessions'");
      expect(JSON.parse(outbox.payload)).toHaveProperty('group_id', null);
    });

    const expectRefused = async (groupId, message) => {
      let caught;
      try {
        await repository.saveSession({ ...lesson, group_id: groupId });
      } catch (error) { caught = error; }
      expect(caught?.message).toBe(message);
      for (const table of ['sessions', 'session_attendees', 'sync_outbox']) {
        expect(await db.getFirstAsync(`select count(*) as count from ${table}`)).toEqual({ count: 0 });
      }
    };

    test('a group that is not on this phone is refused before anything is written', async () => {
      await expectRefused('group-missing', 'sessions.group_id must reference a group on this phone');
    });

    test('a group from another programme is refused', async () => {
      await expectRefused('group-numeracy', 'sessions.group_id must belong to the session programme');
    });

    test('a deleted group still takes its lesson', async () => {
      await createGroupsRepository({ database: db }).archiveGroup('group-1');
      await repository.saveSession(lesson);
      expect(await db.getFirstAsync("select group_id from sessions where id = 'session-group'"))
        .toEqual({ group_id: 'group-1' });
    });
  });

  test('sessions are insert-only on this phone: the repository has no edit method', async () => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      // Session inserts are insert-or-ignore (B2 Task 6): the server would ignore a re-saved edit
      // of an acknowledged session. Saved-session editing must add an `update` operation.
      expect(createSessionsRepository({ database: db }).updateSession).toBeUndefined();
    } finally {
      await db.closeAsync();
    }
  });

  test('session save writes parent and attendees in one transaction and returns screen-ready children_ids', async () => {
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

      const repository = createSessionsRepository({ database: db });
      await repository.saveSession({
        id: 'session-1',
        user_id: 'user-1',
        programme_id: 'programme-a',
        class_id: 'class-1',
        session_date: '2026-05-21',
        children_ids: ['child-1'],
        group_ids: [],
        activities: { letters_focused: ['a'] },
        notes: 'Good session',
        synced: false,
      });

      expect(await db.getFirstAsync('select id, programme_id from sessions where id = ?', 'session-1'))
        .toEqual({ id: 'session-1', programme_id: 'programme-a' });
      expect(await db.getFirstAsync('select session_id, child_id from session_attendees'))
        .toEqual({ session_id: 'session-1', child_id: 'child-1' });
      const attendee = await db.getFirstAsync('select id from session_attendees');
      expect(uuidValidate(attendee.id)).toBe(true);
      expect(attendee.id).not.toContain(':');
      const attendeeOutbox = await db.getFirstAsync(`
        select record_id, payload
        from sync_outbox
        where table_name = 'session_attendees'
      `);
      expect(uuidValidate(attendeeOutbox.record_id)).toBe(true);
      expect(uuidValidate(JSON.parse(attendeeOutbox.payload).id)).toBe(true);
      expect(await repository.getSessions()).toEqual([
        expect.objectContaining({
          id: 'session-1',
          children_ids: ['child-1'],
          group_ids: [],
          activities: { letters_focused: ['a'] },
          synced: false,
        }),
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('session outbox payload strips local-only legacy fields while the local row can still restore them', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createSessionsRepository({ database: db });

      await repository.saveSession({
        id: 'session-legacy',
        user_id: 'user-1',
        programme_id: 'programme-a',
        session_date: '2026-05-21',
        children_ids: [],
        activities: { letters_focused: ['a'] },
        session_type_id: 'job-title-1',
        pendingSessionTypeCode: 'literacy',
        synced: false,
      });

      const row = await db.getFirstAsync('select activities from sessions where id = ?', 'session-legacy');
      expect(JSON.parse(row.activities).__legacySession).toEqual(expect.objectContaining({
        session_type_id: 'job-title-1',
        pendingSessionTypeCode: 'literacy',
      }));

      const outbox = await db.getFirstAsync(`
        select payload
        from sync_outbox
        where table_name = 'sessions'
          and record_id = 'session-legacy'
      `);
      expect(JSON.parse(outbox.payload).activities).toEqual({ letters_focused: ['a'] });
    } finally {
      await db.closeAsync();
    }
  });

  test('legacy programme fallback is local terminal state, not a pushable reference row', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      const repository = createSessionsRepository({ database: db });

      await expect(repository.saveSession({
        id: 'session-local',
        user_id: 'user-without-programme',
        session_date: '2026-05-21',
        children_ids: [],
        synced: false,
      })).rejects.toThrow(/No active programme assignment/i);

      expect(await db.getFirstAsync('select count(*) as count from sessions')).toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
      expect(await db.getFirstAsync('select id from programmes where id = ?', 'local-legacy-programme'))
        .toBeNull();
    } finally {
      await db.closeAsync();
    }
  });

  test('saveSession throws when user_id is missing (RLS contract guard)', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createSessionsRepository({ database: db });

      await expect(repository.saveSession({
        id: 'session-no-user',
        programme_id: 'programme-a',
        session_date: '2026-05-21',
        children_ids: [],
        synced: false,
      })).rejects.toThrow(/sessions\.user_id is required/i);

      expect(await db.getFirstAsync('select count(*) as count from sessions')).toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('user-scoped session reads only return sessions in the active programme', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createSessionsRepository({ database: db });

      await repository.saveSession({
        id: 'session-literacy',
        user_id: 'user-1',
        programme_id: 'programme-a',
        session_date: '2026-05-21',
        children_ids: [],
        synced: false,
      });
      await repository.saveSession({
        id: 'session-numeracy',
        user_id: 'user-1',
        programme_id: 'programme-b',
        session_date: '2026-05-22',
        children_ids: [],
        synced: false,
      });

      expect((await repository.getSessions()).map(session => session.id))
        .toEqual(['session-literacy', 'session-numeracy']);
      expect(await repository.getSessions({ userId: 'user-1' })).toEqual([
        expect.objectContaining({ id: 'session-literacy', programme_id: 'programme-a' }),
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('session reads use id as the deterministic final ordering key', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createSessionsRepository({ database: db });
      const sharedTuple = {
        user_id: 'user-1',
        programme_id: 'programme-a',
        session_date: '2026-08-27',
        created_at: '2026-08-27T10:00:00.123Z',
        updated_at: '2026-08-27T10:00:00.123Z',
        children_ids: [],
        synced: false,
      };

      await repository.saveSession({ ...sharedTuple, id: 'session-b' });
      await repository.saveSession({ ...sharedTuple, id: 'session-a' });

      expect((await repository.getSessions({ order: 'asc' })).map(({ id }) => id))
        .toEqual(['session-a', 'session-b']);
      expect((await repository.getSessions({ order: 'desc' })).map(({ id }) => id))
        .toEqual(['session-b', 'session-a']);
    } finally {
      await db.closeAsync();
    }
  });
});
