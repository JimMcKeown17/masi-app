jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations, CURRENT_SCHEMA_VERSION } from '../src/db/migrations';

const EXPECTED_INDEXES = [
  'idx_session_attendees_session',      // sessionsRepository.mapSession per-session hydration
  'idx_assessment_items_assessment',    // assessmentsRepository.mapAssessment per-row summary
  'idx_assessments_programme_child',    // getAssessments: where programme_id = ? [and child_id = ?]
  'idx_sessions_programme_date',        // getSessions: where programme_id = ? order by session_date
  'idx_letter_mastery_user_child',      // getLetterMastery({ userId, childId })
  'idx_child_group_memberships_group',  // getChildrenInGroup group lookups
  'idx_sync_outbox_ready',              // getReadyRecords: where status in (...) and next_retry_at <= ?
  'idx_time_entries_user_signin',       // getActiveTimeEntry: where user_id = ? order by sign_in_time desc
];

describe('hot-path covering indexes (migration v5)', () => {
  let db;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('schema version is 6', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(6);
  });

  test('all covering indexes exist after migration', async () => {
    const rows = await db.getAllAsync("select name from sqlite_master where type = 'index'");
    const names = rows.map((row) => row.name);
    for (const index of EXPECTED_INDEXES) {
      expect(names).toContain(index);
    }
  });

  test('the session_attendees hydration probe uses its covering index', async () => {
    const plan = await db.getAllAsync(
      "explain query plan select child_id, group_id from session_attendees where session_id = 'session-1'"
    );
    expect(JSON.stringify(plan)).toContain('idx_session_attendees_session');
  });

  test('the per-child assessments lookup uses its covering index', async () => {
    const plan = await db.getAllAsync(
      "explain query plan select * from assessments where programme_id = 'p-1' and child_id = 'c-1' order by assessment_date, created_at"
    );
    expect(JSON.stringify(plan)).toContain('idx_assessments_programme_child');
  });

  test('the per-child mastery lookup uses its covering index', async () => {
    const plan = await db.getAllAsync(
      "explain query plan select * from letter_mastery where user_id = 'u-1' and child_id = 'c-1'"
    );
    expect(JSON.stringify(plan)).toContain('idx_letter_mastery_user_child');
  });
});
