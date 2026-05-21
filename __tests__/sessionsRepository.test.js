jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
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
});
