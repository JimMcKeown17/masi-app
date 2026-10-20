jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createTimeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';
import { createCountingSqliteTestDatabase } from '../test-support/countingSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const createDatabase = async () => {
  const db = createCountingSqliteTestDatabase(':memory:');
  await runMigrations(db);
  await seedCoreData(db);
  return db;
};

const normalizedSql = db => db.getQueryLog().map(query => (
  query.sql.replace(/\s+/g, ' ').trim().toLowerCase()
));

const seedChildren = async (db, count) => {
  for (let index = 0; index < count; index += 1) {
    await db.runAsync(`
      insert into children (id, first_name, last_name, class_id, created_by, sync_status)
      values (?, 'Child', ?, 'class-1', 'user-1', 'synced')
    `, `child-${index}`, String(index));
  }
};

describe('repository read-path query budgets', () => {
  let db;

  afterEach(async () => {
    await db?.closeAsync();
    db = null;
  });

  test('getSessions batches 30 attendee hydrations and applies scope, cutoff, and descending order in SQL', async () => {
    db = await createDatabase();
    await seedChildren(db, 30);
    await db.runAsync(`
      insert into groups (id, name, programme_id, class_id, created_by, sync_status)
      values
        ('group-0', 'Group 0', 'programme-a', 'class-1', 'user-1', 'synced'),
        ('group-1', 'Group 1', 'programme-a', 'class-1', 'user-1', 'synced')
    `);
    for (let index = 0; index < 30; index += 1) {
      const day = String(index + 1).padStart(2, '0');
      await db.runAsync(`
        insert into sessions (id, user_id, programme_id, session_date, created_at, sync_status)
        values (?, 'user-1', 'programme-a', ?, ?, 'synced')
      `, `session-${index}`, `2026-06-${day}`, `2026-06-${day}T10:00:00.000Z`);
      await db.runAsync(`
        insert into session_attendees (id, session_id, child_id, group_id, created_at, sync_status)
        values (?, ?, ?, ?, ?, 'synced')
      `, `attendee-${index}`, `session-${index}`, `child-${index}`, `group-${index % 2}`, `2026-06-${day}T10:01:00.000Z`);
    }
    await db.runAsync(`
      insert into sessions (id, user_id, programme_id, session_date, created_at, sync_status)
      values ('other-ea', 'user-2', 'programme-a', '2026-06-30', '2026-06-30T11:00:00.000Z', 'synced')
    `);
    db.resetQueryLog();

    const rows = await createSessionsRepository({ database: db }).getSessions({
      userId: 'user-1',
      recordedByUserId: 'user-1',
      sinceDate: '2026-06-01',
      order: 'desc',
    });

    expect(rows).toHaveLength(30);
    expect(rows[0]).toEqual(expect.objectContaining({
      id: 'session-29',
      children_ids: ['child-29'],
      group_ids: ['group-1'],
    }));
    expect(rows.at(-1).id).toBe('session-0');
    expect(db.getQueryCount()).toBeLessThanOrEqual(4);
    expect(normalizedSql(db).filter(sql => sql.includes('from session_attendees'))).toHaveLength(1);
    expect(normalizedSql(db).some(sql => sql.includes('session_date >= ?') && sql.includes('user_id = ?'))).toBe(true);
  });

  test('getQuestionResults batches stored items and applies scope, dates and parent values', async () => {
    db = await createDatabase();
    await seedChildren(db, 30);
    for (let index = 0; index < 30; index += 1) {
      const day = String(index + 1).padStart(2, '0');
      await db.runAsync(`
        insert into assessments (
          id, user_id, child_id, programme_id, assessment_type,
          assessment_date, score, created_at, sync_status, question_code, derived
        ) values (?, 'user-1', ?, 'programme-a', 'letter_sounds', ?, 1, ?, 'synced', 'letter_sounds', '{"total_correct":1}')
      `, `assessment-${index}`, `child-${index}`, `2026-06-${day}`, `2026-06-${day}T10:00:00.000Z`);
      await db.runAsync(`
        insert into assessment_items (
          id, assessment_id, item_key, prompt, position, is_correct, metadata, created_at, sync_status
        ) values (?, ?, 'a', 'a', 4, 1, ?, ?, 'synced')
      `, `item-${index}`, `assessment-${index}`, JSON.stringify({ row: 2, reached: true }),
      `2026-06-${day}T10:01:00.000Z`);
    }
    await db.runAsync(`
      insert into assessments (
        id, user_id, child_id, programme_id, assessment_type,
        assessment_date, created_at, sync_status, question_code
      ) values ('other-ea', 'user-2', 'child-0', 'programme-a', 'letter_sounds',
        '2026-06-30', '2026-06-30T11:00:00.000Z', 'synced', 'letter_sounds')
    `);
    db.resetQueryLog();

    const rows = await createAssessmentsRepository({ database: db }).getQuestionResults({
      userId: 'user-1',
      recordedByUserId: 'user-1',
      sinceDate: '2026-06-01',
      order: 'desc',
    });

    expect(rows).toHaveLength(30);
    expect(rows[0]).toEqual(expect.objectContaining({
      id: 'assessment-29',
      score: 1,
      derived: { total_correct: 1 },
      assessment_date: '2026-06-30',
      items: [expect.objectContaining({ prompt: 'a', position: 4, is_correct: true, metadata: { row: 2, reached: true } })],
    }));
    expect(rows[1].assessment_date).toBe('2026-06-29');
    expect(db.getQueryCount()).toBeLessThanOrEqual(4);
    expect(normalizedSql(db).filter(sql => sql.includes('from assessment_items'))).toHaveLength(1);
    expect(normalizedSql(db).some(sql => sql.includes('assessment_date >= ?') && sql.includes('user_id = ?'))).toBe(true);
  });

  test('getTimeEntries applies the UTC cutoff and newest-first limit in SQL', async () => {
    db = await createDatabase();
    for (let index = 0; index < 5; index += 1) {
      await db.runAsync(`
        insert into time_entries (
          id, user_id, sign_in_time, sign_in_lat, sign_in_lon,
          sign_out_time, created_at, sync_status
        ) values (?, 'user-1', ?, -34.1, 18.4, ?, ?, 'synced')
      `, `time-${index}`, `2026-06-0${index + 1}T08:00:00.000Z`, `2026-06-0${index + 1}T09:00:00.000Z`, `2026-06-0${index + 1}T08:00:00.000Z`);
    }
    db.resetQueryLog();

    const rows = await createTimeEntriesRepository({ database: db }).getTimeEntries({
      userId: 'user-1',
      sinceIso: '2026-06-02T00:00:00.000Z',
      limit: 2,
    });

    expect(rows.map(row => row.id)).toEqual(['time-4', 'time-3']);
    expect(db.getQueryCount()).toBe(1);
    expect(normalizedSql(db)[0]).toContain('sign_in_time >= ?');
    expect(normalizedSql(db)[0]).toMatch(/order by sign_in_time desc.*limit \?/);
  });

  test('aggregate reads stay bounded and resolve the active academic year for assessment counts', async () => {
    db = await createDatabase();
    await seedChildren(db, 2);
    await db.runAsync(`
      insert into sessions (id, user_id, programme_id, session_date, created_at, sync_status)
      values
        ('s1', 'user-1', 'programme-a', '2026-07-01', '2026-07-01T08:00:00Z', 'synced'),
        ('s2', 'user-2', 'programme-a', '2026-07-01', '2026-07-01T09:00:00Z', 'synced'),
        ('s3', 'user-1', 'programme-a', '2026-07-02', '2026-07-02T08:00:00Z', 'synced')
    `);
    await db.runAsync(`
      insert into assessments (
        id, user_id, child_id, programme_id, assessment_type,
        assessment_date, created_at, sync_status, question_code
      ) values
        ('a1', 'user-1', 'child-1', 'programme-a', 'letter_sounds', '2026-07-01', '2026-07-01T08:00:00Z', 'synced', 'letter_sounds'),
        ('a2', 'user-2', 'child-1', 'programme-a', 'word_reading', '2026-07-02', '2026-07-02T08:00:00Z', 'synced', 'word_reading'),
        ('a3', 'user-2', 'child-0', 'programme-a', 'letter_sounds', '2026-07-03', '2026-07-03T08:00:00Z', 'synced', 'letter_sounds')
    `);
    const sessions = createSessionsRepository({ database: db });
    const assessments = createAssessmentsRepository({ database: db });

    db.resetQueryLog();
    await expect(sessions.getSessionCountsSince({
      programmeId: 'programme-a',
      sinceDate: '2026-07-01',
    })).resolves.toEqual([
      { session_date: '2026-07-01', count: 2 },
      { session_date: '2026-07-02', count: 1 },
    ]);
    expect(db.getQueryCount()).toBe(1);

    db.resetQueryLog();
    await expect(assessments.getAssessmentCountsSince({
      programmeId: 'programme-a',
    })).resolves.toEqual([
      { child_id: 'child-0', count: 1 },
      { child_id: 'child-1', count: 1 },
    ]);
    expect(db.getQueryCount()).toBe(2); // Active-year lookup plus the bounded aggregate.

    db.resetQueryLog();
    await expect(sessions.countSessionsOnDate({
      userId: 'user-1',
      programmeId: 'programme-a',
      date: '2026-07-01',
    })).resolves.toBe(1);
    expect(db.getQueryCount()).toBe(1);

    db.resetQueryLog();
    await Promise.all([
      sessions.getSessionCountsSince({ userId: 'user-1', sinceDate: '2026-07-01' }),
      assessments.getAssessmentCountsSince({ userId: 'user-1' }),
      createTimeEntriesRepository({ database: db }).getTimeEntries({
        userId: 'user-1',
        sinceIso: '2026-06-30T22:00:00.000Z',
        completedOnly: true,
      }),
    ]);
    expect(db.getQueryCount()).toBeLessThanOrEqual(7); // Adds one active-year lookup.
  });

  test('countResults resolves active programme and counts one Question code in two queries', async () => {
    db = await createDatabase();
    await seedChildren(db, 1);
    await db.runAsync(`
      insert into assessments (
        id, user_id, child_id, programme_id, assessment_type,
        assessment_date, created_at, sync_status, question_code
      ) values
        ('a1', 'user-1', 'child-0', 'programme-a', 'letter_sounds', '2026-07-01', '2026-07-01T08:00:00Z', 'synced', 'letter_sounds'),
        ('a2', 'user-2', 'child-0', 'programme-a', 'letter_sounds', '2026-07-02', '2026-07-02T08:00:00Z', 'synced', 'letter_sounds'),
        ('a3', 'user-1', 'child-0', 'programme-a', 'letter_sounds', '2026-07-03', '2026-07-03T08:00:00Z', 'synced', 'letter_sounds'),
        ('a4', 'user-1', 'child-0', 'programme-a', 'word_reading', '2026-07-04', '2026-07-04T08:00:00Z', 'synced', 'word_reading')
    `);
    db.resetQueryLog();

    await expect(createAssessmentsRepository({ database: db }).countResults({
      userId: 'user-1',
      childId: 'child-0',
      questionCode: 'letter_sounds',
    })).resolves.toBe(3);

    expect(db.getQueryCount()).toBe(2);
    expect(normalizedSql(db).some(sql => (
      sql.includes('question_code = ?')
    ))).toBe(true);
  });
});
