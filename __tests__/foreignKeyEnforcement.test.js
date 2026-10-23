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
import { saveLesson } from '../src/services/lessonSave';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { createLessonDraftsRepository } from '../src/db/repositories/lessonDraftsRepository';
import { runRepositoryTransaction } from '../src/db/repositories/repositoryRuntime';
import { lessonDraftInput } from '../test-support/lessonSaveFixtures';
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

    // --- Save a lesson (group → session → attendees → mastery; draft deleted) ---
    await createGroupsRepository({ database: db }).saveGroup({ id: 'lesson-group', name: 'Group 1', programme_id: programmeId, class_id: 'class-1', created_by: userId });
    const draft = await createLessonDraftsRepository({ database: db }).create(lessonDraftInput({
      programme_id: programmeId, group_id: 'lesson-group', lesson_date: '2026-06-16',
      attendance: { childIds: [childId], absentChildIds: [], addedChildIds: [] }, reading_level_changes: {},
      tracker_changes: {
        [childId]: {
          a: { mastered: true, languageCode: 'en', madeAt: '2026-06-16T08:55:00.000Z' },
          m: { mastered: true, languageCode: 'en', madeAt: '2026-06-16T08:56:00.000Z' },
        },
      },
    }));
    const handle = { userId, withTransaction: task => runRepositoryTransaction(db, task) };
    await saveLesson({ handle, draft, sessionTypeFields: {},
      nowIso: '2026-06-16T09:00:00.000Z',
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
    expect(await db.getAllAsync('select id from sessions where id = ?', draft.session_id)).toHaveLength(1);
    const attendees = await db.getAllAsync(
      'select session_id, child_id from session_attendees where session_id = ?', draft.session_id
    );
    expect(attendees).toHaveLength(1);
    expect(attendees[0]).toMatchObject({ session_id: draft.session_id, child_id: childId });
    expect(await db.getAllAsync('select * from lesson_drafts')).toEqual([]);
    expect(await db.getAllAsync(
      "select letter, language, confirmed from letter_mastery where child_id = ? order by letter", childId
    )).toEqual([
      { letter: 'a', language: 'en', confirmed: 1 },
      { letter: 'm', language: 'en', confirmed: 1 },
    ]);

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
