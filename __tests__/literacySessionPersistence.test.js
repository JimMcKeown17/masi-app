jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { persistLiteracySession } from '../src/services/literacySessionPersistence';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

describe('literacySessionPersistence', () => {
  test('saves a session and tracker changes in one SQLite transaction', async () => {
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

      const masteryRepository = createMasteryRepository({ database: db });
      await masteryRepository.saveLetterMasteryRecord({
        id: 'mastery-deleted-a',
        user_id: 'user-1',
        child_id: 'child-1',
        programme_id: 'programme-a',
        letter: 'a',
        language: 'English',
        source: 'taught',
        _deleted: true,
        synced: false,
      });
      await masteryRepository.saveLetterMasteryRecord({
        id: 'mastery-active-s',
        user_id: 'user-1',
        child_id: 'child-1',
        programme_id: 'programme-a',
        letter: 's',
        language: 'English',
        source: 'taught',
        synced: false,
      });

      await persistLiteracySession({
        database: db,
        session: {
          id: 'session-1',
          user_id: 'user-1',
          programme_id: 'programme-a',
          class_id: 'class-1',
          session_date: '2026-05-21',
          children_ids: ['child-1'],
          group_ids: [],
          activities: { letters_focused: ['a', 'm'] },
          synced: false,
        },
        trackerLanguageKey: 'english',
        letterTrackerChanges: {
          'child-1': {
            a: true,
            m: true,
            s: false,
          },
        },
        nowIso: '2026-05-21T09:30:00.000Z',
        idFactory: () => 'mastery-new-m',
      });

      expect(await db.getFirstAsync('select id from sessions where id = ?', 'session-1'))
        .toEqual({ id: 'session-1' });
      expect(await db.getFirstAsync('select session_id, child_id from session_attendees where session_id = ?', 'session-1'))
        .toEqual({ session_id: 'session-1', child_id: 'child-1' });
      // Rows are keyed by their natural logical key now (deterministic ids), so assert by letter.
      expect(await db.getFirstAsync("select deleted_at from letter_mastery where letter = 'a'"))
        .toEqual({ deleted_at: null }); // previously soft-deleted 'a' re-taught → active again
      expect(await db.getFirstAsync("select child_id, letter, deleted_at from letter_mastery where letter = 'm'"))
        .toEqual({ child_id: 'child-1', letter: 'm', deleted_at: null }); // newly taught
      expect((await db.getFirstAsync("select deleted_at from letter_mastery where letter = 's'")).deleted_at)
        .toBe('2026-05-21T09:30:00.000Z'); // previously active 's' untaught → soft-deleted
      expect(await db.getAllAsync('select table_name from sync_outbox order by table_name, record_id'))
        .toEqual(expect.arrayContaining([
          { table_name: 'sessions' },
          { table_name: 'session_attendees' },
          { table_name: 'letter_mastery' },
        ]));
    } finally {
      await db.closeAsync();
    }
  });

  test('rolls back the session when tracker persistence fails', async () => {
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

      await expect(persistLiteracySession({
        database: db,
        session: {
          id: 'session-rollback',
          user_id: 'user-1',
          programme_id: 'programme-a',
          class_id: 'class-1',
          session_date: '2026-05-21',
          children_ids: ['child-1'],
          group_ids: [],
          activities: { letters_focused: ['m'] },
          synced: false,
        },
        trackerLanguageKey: 'english',
        letterTrackerChanges: {
          'missing-child': {
            m: true,
          },
        },
        nowIso: '2026-05-21T09:30:00.000Z',
        idFactory: () => {
          throw new Error('id generation failed');
        },
      })).rejects.toThrow('id generation failed');

      expect(await db.getFirstAsync('select id from sessions where id = ?', 'session-rollback'))
        .toBeNull();
      expect(await db.getFirstAsync('select id from session_attendees where session_id = ?', 'session-rollback'))
        .toBeNull();
      expect(await db.getFirstAsync('select id from sync_outbox where record_id = ?', 'session-rollback'))
        .toBeNull();
    } finally {
      await db.closeAsync();
    }
  });

  test('tracker persistence never reuses mastery rows from another programme', async () => {
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

      const masteryRepository = createMasteryRepository({ database: db });
      await masteryRepository.saveLetterMasteryRecord({
        id: 'mastery-numeracy-deleted',
        user_id: 'user-1',
        child_id: 'child-1',
        programme_id: 'programme-b',
        letter: 'z',
        language: 'English',
        source: 'taught',
        _deleted: true,
        synced: false,
      });

      await persistLiteracySession({
        database: db,
        session: {
          id: 'session-programme-scoped',
          user_id: 'user-1',
          class_id: 'class-1',
          session_date: '2026-05-21',
          children_ids: ['child-1'],
          group_ids: [],
          activities: { letters_focused: ['z'] },
          synced: false,
        },
        trackerLanguageKey: 'english',
        letterTrackerChanges: {
          'child-1': {
            z: true,
          },
        },
        nowIso: '2026-05-21T09:30:00.000Z',
        idFactory: () => 'mastery-literacy-z',
      });

      // The numeracy (programme-b) deleted 'z' row is NOT reused for the literacy session;
      // a separate active 'z' row is created under programme-a (distinct deterministic ids).
      expect(await db.getFirstAsync(
        "select programme_id, deleted_at from letter_mastery where letter = 'z' and programme_id = 'programme-b'"
      )).toEqual({
        programme_id: 'programme-b',
        deleted_at: expect.any(String),
      });
      expect(await db.getFirstAsync(
        "select programme_id, deleted_at from letter_mastery where letter = 'z' and programme_id = 'programme-a'"
      )).toEqual({
        programme_id: 'programme-a',
        deleted_at: null,
      });
    } finally {
      await db.closeAsync();
    }
  });
});
