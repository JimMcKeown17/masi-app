jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { persistLiteracySession } from '../src/services/literacySessionPersistence';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

const MADE_AT = '2026-05-20T08:00:00.000Z';

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
        letterTrackerChanges: {
          'child-removed': { a: { mastered: true, languageCode: null, madeAt: MADE_AT } },
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

  test('saves each tracker change with the language it was made in, stamped with the tap time', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const childrenRepository = createChildrenRepository({ database: db });
      for (const [id, firstName] of [['child-1', 'Amahle'], ['child-2', 'Ben']]) {
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
          id: 'session-mixed',
          user_id: 'user-1',
          programme_id: 'programme-a',
          session_date: '2026-05-21',
          children_ids: ['child-1', 'child-2'],
          activities: { letters_focused: ['a'] },
          synced: false,
        },
        letterTrackerChanges: {
          'child-1': { a: { mastered: true, languageCode: 'xh', madeAt: MADE_AT } },
          'child-2': { m: { mastered: true, languageCode: 'en', madeAt: MADE_AT } },
        },
        nowIso: '2026-05-21T09:30:00.000Z',
        idFactory: () => 'unused-id',
      });

      expect(await db.getAllAsync(
        'select child_id, letter, language, changed_at, confirmed from letter_mastery order by child_id'
      )).toEqual([
        { child_id: 'child-1', letter: 'a', language: 'xh', changed_at: MADE_AT, confirmed: 1 },
        { child_id: 'child-2', letter: 'm', language: 'en', changed_at: MADE_AT, confirmed: 1 },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test.each([
    ['a code with no tracker order', { a: { mastered: true, languageCode: 'zu', madeAt: MADE_AT } }],
    ['a stored label instead of a code', { a: { mastered: true, languageCode: 'English', madeAt: MADE_AT } }],
    ['a missing language', { a: { mastered: true, madeAt: MADE_AT } }],
    ['the old boolean shape', { a: true }],
    ['a missing tap time', { a: { mastered: true, languageCode: 'en' } }],
    ['a letter outside the order', { ch: { mastered: true, languageCode: 'en', madeAt: MADE_AT } }],
    ['a non-boolean mastered', { a: { mastered: 'yes', languageCode: 'en', madeAt: MADE_AT } }],
  ])('refuses the whole save for %s and writes nothing', async (_, changes) => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: true,
      }, { actorUserId: 'user-1' });
      await db.runAsync('delete from sync_outbox');

      let error;
      try {
        await persistLiteracySession({
          database: db,
          session: {
            id: 'session-refused',
            user_id: 'user-1',
            programme_id: 'programme-a',
            session_date: '2026-05-21',
            children_ids: ['child-1'],
            activities: { letters_focused: ['a'] },
            synced: false,
          },
          letterTrackerChanges: { 'child-1': changes },
          nowIso: '2026-05-21T09:30:00.000Z',
          idFactory: () => 'unused-id',
        });
      } catch (caught) {
        error = caught;
      }
      expect(error?.code).toBe('TRACKER_CHANGE_INVALID');
      expect(await db.getAllAsync('select id from sessions')).toEqual([]);
      expect(await db.getAllAsync('select id from letter_mastery')).toEqual([]);
      expect(await db.getAllAsync('select id from sync_outbox')).toEqual([]);
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
      await masteryRepository.setLetterMastery({
        childId: 'child-1', programmeId: 'programme-a', letter: 'a', language: 'en',
        confirmed: false, changedAt: '2026-05-19T08:00:00.000Z',
      });
      await masteryRepository.setLetterMastery({
        childId: 'child-1', programmeId: 'programme-a', letter: 's', language: 'en',
        confirmed: true, changedAt: '2026-05-19T08:00:00.000Z',
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
        letterTrackerChanges: {
          'child-1': {
            a: { mastered: true, languageCode: 'en', madeAt: MADE_AT },
            m: { mastered: true, languageCode: 'en', madeAt: MADE_AT },
            s: { mastered: false, languageCode: 'en', madeAt: MADE_AT },
          },
        },
        nowIso: '2026-05-21T09:30:00.000Z',
        idFactory: () => 'mastery-new-m',
      });

      expect(await db.getFirstAsync('select id from sessions where id = ?', 'session-1'))
        .toEqual({ id: 'session-1' });
      expect(await db.getFirstAsync('select session_id, child_id from session_attendees where session_id = ?', 'session-1'))
        .toEqual({ session_id: 'session-1', child_id: 'child-1' });
      expect(await db.getAllAsync('select letter, language, confirmed, changed_at from letter_mastery order by letter'))
        .toEqual([
          { letter: 'a', language: 'en', confirmed: 1, changed_at: MADE_AT },
          { letter: 'm', language: 'en', confirmed: 1, changed_at: MADE_AT },
          { letter: 's', language: 'en', confirmed: 0, changed_at: MADE_AT },
        ]);
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

      await db.runAsync(`create trigger fail_tracker_outbox before insert on sync_outbox
        when new.table_name = 'letter_mastery'
        begin select raise(abort, 'tracker outbox failed'); end`);
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
        letterTrackerChanges: {
          'child-1': {
            m: { mastered: true, languageCode: 'en', madeAt: MADE_AT },
          },
        },
        nowIso: '2026-05-21T09:30:00.000Z',
        idFactory: () => 'unused',
      })).rejects.toMatchObject({ message: 'tracker outbox failed' });

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

  test('a confirmation recorded under another programme is the same record (C23)', async () => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1',
        created_by: 'user-1', synced: true,
      }, { actorUserId: 'user-1' });
      const mastery = createMasteryRepository({ database: db });
      const previous = await mastery.setLetterMastery({
        childId: 'child-1', programmeId: 'programme-b', letter: 'z', language: 'en',
        confirmed: false, changedAt: '2026-05-19T08:00:00.000Z',
      });
      await persistLiteracySession({
        database: db,
        session: {
          id: 'session-programme-scoped', user_id: 'user-1', programme_id: 'programme-a',
          class_id: 'class-1', session_date: '2026-05-21', children_ids: ['child-1'],
          activities: { letters_focused: ['z'] }, synced: false,
        },
        letterTrackerChanges: { 'child-1': { z: { mastered: true, languageCode: 'en', madeAt: MADE_AT } } },
        nowIso: '2026-05-21T09:30:00.000Z', idFactory: () => 'unused',
      });
      expect(await db.getAllAsync("select id, programme_id, language, confirmed from letter_mastery where letter = 'z'"))
        .toEqual([{ id: previous.id, programme_id: 'programme-a', language: 'en', confirmed: 1 }]);
      expect(await db.getAllAsync("select operation from sync_outbox where table_name = 'letter_mastery'"))
        .toEqual([{ operation: 'update' }]);
    } finally { await db.closeAsync(); }
  });

  test.each([
    ["a Monday mark saved on Wednesday keeps Monday's correction time", true],
    ['an un-mark without a stored record writes a confirmed false correction', false],
  ])('%s', async (_name, confirmed) => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1', first_name: 'Test', last_name: 'Child', created_by: 'user-1', synced: true,
      }, { actorUserId: 'user-1' });
      await db.runAsync('delete from sync_outbox');
      const idFactory = jest.fn(() => 'unused');
      await persistLiteracySession({ database: db,
        session: { id: 'session-wed', user_id: 'user-1', programme_id: 'programme-a', session_date: '2026-10-21',
          children_ids: ['child-1'], activities: { letters_focused: ['a'] }, synced: false },
        letterTrackerChanges: { 'child-1': { m: { mastered: confirmed, languageCode: 'en', madeAt: '2026-10-19T08:00:00.000Z' } } },
        nowIso: '2026-10-21T09:30:00.000Z', idFactory });
      expect(await db.getFirstAsync("select changed_at, confirmed, sync_status from letter_mastery where letter = 'm'"))
        .toEqual({ changed_at: '2026-10-19T08:00:00.000Z', confirmed: confirmed ? 1 : 0, sync_status: 'pending' });
      const { payload } = await db.getFirstAsync("select payload from sync_outbox where table_name = 'letter_mastery'");
      expect(JSON.parse(payload)).toMatchObject({ letter: 'm', confirmed, language: 'en', changed_at: '2026-10-19T08:00:00.000Z' });
      expect(idFactory).not.toHaveBeenCalled();
    } finally { await db.closeAsync(); }
  });

  test("a Monday mark saved on Wednesday leaves this phone's newer unsent Tuesday correction queued", async () => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1', first_name: 'Test', last_name: 'Child', created_by: 'user-1', synced: true,
      }, { actorUserId: 'user-1' });
      await db.runAsync('delete from sync_outbox');
      const mastery = createMasteryRepository({ database: db });
      const tuesday = await mastery.setLetterMastery({ childId: 'child-1', letter: 'm', language: 'en',
        confirmed: false, changedAt: '2026-10-20T08:00:00.000Z' });
      await persistLiteracySession({ database: db,
        session: { id: 'session-wed', user_id: 'user-1', programme_id: 'programme-a', session_date: '2026-10-21',
          children_ids: ['child-1'], activities: { letters_focused: ['a'] }, synced: false },
        letterTrackerChanges: { 'child-1': { m: { mastered: true, languageCode: 'en', madeAt: '2026-10-19T08:00:00.000Z' } } },
        nowIso: '2026-10-21T09:30:00.000Z', idFactory: () => 'unused' });
      expect(await db.getFirstAsync("select changed_at, confirmed, correction_id, sync_status from letter_mastery where letter = 'm'"))
        .toEqual({ changed_at: '2026-10-20T08:00:00.000Z', confirmed: 0, correction_id: tuesday.correction_id, sync_status: 'pending' });
      const slots = await db.getAllAsync("select payload from sync_outbox where table_name = 'letter_mastery'");
      expect(slots.map(s => JSON.parse(s.payload))).toEqual([expect.objectContaining({
        confirmed: false, changed_at: '2026-10-20T08:00:00.000Z', correction_id: tuesday.correction_id })]);
      expect(await db.getFirstAsync("select id from sessions where id = 'session-wed'")).toEqual({ id: 'session-wed' });
    } finally { await db.closeAsync(); }
  });
});
