jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

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
  const db = createBetterSqliteTestDatabase(':memory:');
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
    // --- Seed shared parents (schools, programmes, academic_years, classes, staff assignment) ---
    await seedCoreData(db);

    // --- Save a child (children → child_ea_assignments → child_programme_enrollments → child_class_memberships) ---
    await createChildrenRepository({ database: db }).save({
      id: 'child-1',
      first_name: 'Amahle',
      last_name: 'Dlamini',
      class_id: 'class-1',
      created_by: 'user-1',
      synced: false,
    }, { actorUserId: 'user-1' });

    // --- Persist a literacy session (sessions → session_attendees → letter_mastery) ---
    await persistLiteracySession({
      database: db,
      session: {
        id: 'session-1',
        user_id: 'user-1',
        programme_id: 'programme-a',
        class_id: 'class-1',
        session_date: '2026-06-16',
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
        },
      },
      nowIso: '2026-06-16T09:00:00.000Z',
      idFactory: (() => {
        let n = 0;
        return () => `mastery-fk-test-${++n}`;
      })(),
    });

    // --- Save an assessment (assessments → assessment_items) ---
    await createAssessmentsRepository({ database: db }).saveAssessment({
      id: 'assessment-1',
      user_id: 'user-1',
      child_id: 'child-1',
      programme_id: 'programme-a',
      assessment_type: 'letter_egra',
      date_assessed: '2026-06-16',
      items_tested: ['a', 'm'],
      correct_letters: [{ index: 0, letter: 'a' }],
      incorrect_letters: [{ index: 1, letter: 'm' }],
      letters_attempted: 2,
      correct_responses: 1,
      accuracy: 50,
      letter_language: 'isiXhosa',
      attempt_number: 1,
      synced: false,
    });

    // All three ordered chains must have committed rows
    expect((await db.getAllAsync('select id from session_attendees')).length).toBeGreaterThan(0);
    expect((await db.getAllAsync('select id from letter_mastery')).length).toBeGreaterThan(0);
    expect((await db.getAllAsync('select id from assessment_items')).length).toBeGreaterThan(0);
  } finally {
    await db.closeAsync();
  }
});
