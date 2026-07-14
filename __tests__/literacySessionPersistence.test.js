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
  test('persists current child reading levels with the session snapshot in one SQLite transaction', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const childrenRepository = createChildrenRepository({ database: db });
      await childrenRepository.save({
        id: 'child-reading-level',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: true,
      }, { actorUserId: 'user-1' });
      await db.runAsync('delete from sync_outbox');

      await persistLiteracySession({
        database: db,
        session: {
          id: 'session-reading-level',
          user_id: 'user-1',
          programme_id: 'programme-a',
          class_id: 'class-1',
          session_date: '2026-07-14',
          children_ids: ['child-reading-level'],
          group_ids: [],
          activities: {
            letters_focused: ['a'],
            session_reading_level: 'Sentence Reading',
            child_reading_levels: {
              'child-reading-level': 'Word Reading',
            },
          },
          synced: false,
        },
        trackerLanguageKey: 'english',
        nowIso: '2026-07-14T09:30:00.000Z',
        idFactory: () => 'unused-id',
      });

      expect(await db.getFirstAsync(
        'select reading_level, sync_status from children where id = ?',
        'child-reading-level'
      )).toEqual({
        reading_level: 'Word Reading',
        sync_status: 'pending',
      });
      expect(await db.getFirstAsync(
        'select activities from sessions where id = ?',
        'session-reading-level'
      )).toEqual({
        activities: expect.stringContaining('"child-reading-level":"Word Reading"'),
      });

      const childOutbox = await db.getFirstAsync(
        "select operation, payload from sync_outbox where table_name = 'children' and record_id = ?",
        'child-reading-level'
      );
      expect(childOutbox.operation).toBe('update');
      expect(JSON.parse(childOutbox.payload)).toEqual(expect.objectContaining({
        id: 'child-reading-level',
        reading_level: 'Word Reading',
      }));
      expect(await db.getFirstAsync(
        "select id from sync_outbox where table_name = 'sessions' and record_id = ?",
        'session-reading-level'
      )).not.toBeNull();
    } finally {
      await db.closeAsync();
    }
  });

  test('does not apply a child reading-level update to a non-attendee', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const childrenRepository = createChildrenRepository({ database: db });
      for (const [id, firstName] of [['child-attendee', 'Amahle'], ['child-removed', 'Buhle']]) {
        await childrenRepository.save({
          id,
          first_name: firstName,
          last_name: 'Dlamini',
          class_id: 'class-1',
          created_by: 'user-1',
          synced: true,
        }, { actorUserId: 'user-1' });
      }
      await db.runAsync('delete from sync_outbox');

      await persistLiteracySession({
        database: db,
        session: {
          id: 'session-attendee-scope',
          user_id: 'user-1',
          programme_id: 'programme-a',
          session_date: '2026-07-14',
          children_ids: ['child-attendee'],
          activities: {
            letters_focused: ['a'],
            child_reading_levels: { 'child-removed': 'Word Reading' },
          },
          synced: false,
        },
        trackerLanguageKey: 'english',
        nowIso: '2026-07-14T10:00:00.000Z',
        idFactory: () => 'unused-id',
      });

      expect(await db.getFirstAsync(
        'select reading_level from children where id = ?',
        'child-removed'
      )).toEqual({ reading_level: null });
      expect(await db.getFirstAsync(
        "select id from sync_outbox where table_name = 'children' and record_id = ?",
        'child-removed'
      )).toBeNull();
      const savedSession = await db.getFirstAsync(
        'select activities from sessions where id = ?',
        'session-attendee-scope'
      );
      expect(JSON.parse(savedSession.activities).child_reading_levels).toEqual({});
    } finally {
      await db.closeAsync();
    }
  });

  test('does not apply letter-tracker changes to a non-attendee', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const childrenRepository = createChildrenRepository({ database: db });
      for (const [id, firstName] of [['child-attendee', 'Amahle'], ['child-removed', 'Buhle']]) {
        await childrenRepository.save({
          id,
          first_name: firstName,
          last_name: 'Dlamini',
          class_id: 'class-1',
          created_by: 'user-1',
          synced: true,
        }, { actorUserId: 'user-1' });
      }
      await db.runAsync('delete from sync_outbox');

      await persistLiteracySession({
        database: db,
        session: {
          id: 'session-tracker-attendee-scope',
          user_id: 'user-1',
          programme_id: 'programme-a',
          session_date: '2026-07-14',
          children_ids: ['child-attendee'],
          activities: { letters_focused: ['a'] },
          synced: false,
        },
        trackerLanguageKey: 'english',
        letterTrackerChanges: {
          'child-removed': { a: true },
        },
        nowIso: '2026-07-14T10:15:00.000Z',
        idFactory: () => 'non-attendee-mastery',
      });

      expect(await db.getFirstAsync(
        'select id from letter_mastery where child_id = ?',
        'child-removed'
      )).toBeNull();
      expect(await db.getFirstAsync(
        "select id from sync_outbox where table_name = 'letter_mastery'"
      )).toBeNull();
    } finally {
      await db.closeAsync();
    }
  });

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
          'child-1': {
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
