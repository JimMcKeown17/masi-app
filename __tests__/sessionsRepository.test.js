jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { validate as uuidValidate } from 'uuid';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

describe('sessionsRepository', () => {
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
});
