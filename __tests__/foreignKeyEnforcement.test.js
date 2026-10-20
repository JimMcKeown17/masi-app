import { v4 as uuid } from 'uuid';
import { questionResult } from '../test-support/assessmentFamilySyncTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { persistLiteracySession } from '../src/services/literacySessionPersistence';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

// runMigrations leaves foreign_keys ON (Task 2 ensures migrations run outside the
// BEGIN/COMMIT wrapper, so the PRAGMA applied at the end of runMigrations is in
// effect for the connection). No manual PRAGMA flip needed here.
const migrated = async () => {
  const db = bindTestActor(createBetterSqliteTestDatabase(':memory:'), 'user-1');
  await runMigrations(db);
  return db;
};

it('NEGATIVE: inserting a child row before its parent fails with an FK error', async () => {
  const db = await migrated();
  let caught;
  try {
    await db.runAsync(
      `insert into session_attendees (id, session_id, child_id, created_at, updated_at)
       values ('att1', 'no-such-session', 'no-such-child', '2026-06-16', '2026-06-16')`
    );
  } catch (e) {
    caught = e;
  } finally {
    await db.closeAsync();
  }
  expect(caught).toBeDefined();
  expect(String(caught.message)).toMatch(/FOREIGN KEY/i);
});

it('POSITIVE: real capture flows commit through public interfaces with FK ON', async () => {
  const db = await migrated();

  try {
    await seedCoreData(db);
    const userId = uuid(), childId = uuid(), programmeId = uuid(), assessmentId = uuid();
    bindTestActor(db, userId);
    await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', programmeId, 'family-fk', 'Family FK');
    await db.runAsync('insert into staff_programme_assignments (id, user_id, programme_id) values (?, ?, ?)', uuid(), userId, programmeId);

    // --- Save a child (children → child_ea_assignments → child_programme_enrollments → child_class_memberships) ---
    await createChildrenRepository({ database: db }).save({
      id: childId,
      first_name: 'Amahle',
      last_name: 'Dlamini',
      class_id: 'class-1',
      created_by: userId,
      synced: false,
    }, { actorUserId: userId });

    // --- Persist a literacy session (sessions → session_attendees → letter_mastery) ---
    await persistLiteracySession({
      database: db,
      session: {
        id: 'session-1',
        user_id: userId,
        programme_id: programmeId,
        class_id: 'class-1',
        session_date: '2026-06-16',
        children_ids: [childId],
        group_ids: [],
        activities: { letters_focused: ['a', 'm'] },
        synced: false,
      },
      trackerLanguageCode: 'en',
      letterTrackerChanges: {
        [childId]: {
          a: true,
          m: true,
        },
      },
      nowIso: '2026-06-16T09:00:00.000Z',
      idFactory: (() => {
        let n = 0;
        return () => `mastery-fk-test-${++n}`;
      })(),
    });

    // --- Save an assessment (assessments → assessment_items) ---
    await createAssessmentsRepository({ database: db }).saveQuestionResult({
      assessmentId, userId, childId,
      result: questionResult(2, { items: [
        { position: 0, item_key: 'a', prompt: 'a', is_correct: true },
        { position: 1, item_key: 'm', prompt: 'm', is_correct: false },
      ] }),
    });

    // Each ordered parent→child chain must commit fully, including every actual item.
    // sessions → session_attendees → letter_mastery
    expect(await db.getAllAsync("select id from sessions where id = 'session-1'")).toHaveLength(1);
    const attendees = await db.getAllAsync(
      "select session_id, child_id from session_attendees where session_id = 'session-1'"
    );
    expect(attendees).toHaveLength(1);
    expect(attendees[0]).toMatchObject({ session_id: 'session-1', child_id: childId });
    const masteryLetters = (await db.getAllAsync(
      "select letter from letter_mastery where child_id = ?", childId
    )).map((row) => row.letter).sort();
    expect(masteryLetters).toEqual(['a', 'm']); // both tracked letters committed under this child

    // assessments → assessment_items
    expect(await db.getAllAsync('select id from assessments where id = ?', assessmentId)).toHaveLength(1);
    const items = await db.getAllAsync(
      'select assessment_id, item_key from assessment_items where assessment_id = ? order by position', assessmentId
    );
    expect(items).toHaveLength(2);
    expect(items).toEqual([
      { assessment_id: assessmentId, item_key: 'a' },
      { assessment_id: assessmentId, item_key: 'm' },
    ]);
  } finally {
    await db.closeAsync();
  }
});
