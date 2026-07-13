jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { persistLiteracySession } from '../src/services/literacySessionPersistence';
import { createCountingSqliteTestDatabase } from '../test-support/countingSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const createDatabase = async () => {
  const db = createCountingSqliteTestDatabase(':memory:');
  await runMigrations(db);
  await seedCoreData(db);
  return db;
};

const seedChildren = async (db, count) => {
  for (let index = 0; index < count; index += 1) {
    await db.runAsync(`
      insert into children (id, first_name, last_name, class_id, created_by, sync_status)
      values (?, 'Child', ?, 'class-1', 'user-1', 'synced')
    `, `child-${index}`, String(index));
  }
};

const compactSql = sql => sql.replace(/\s+/g, ' ').trim().toLowerCase();

describe('completion-path statement budgets', () => {
  let db;

  afterEach(async () => {
    await db?.closeAsync();
    db = null;
  });

  test('a 61-item assessment keeps two writes per item and performs no owner-resolution reads', async () => {
    db = await createDatabase();
    await seedChildren(db, 1);
    const correctLetters = Array.from({ length: 60 }, (_, index) => ({
      index,
      letter: `letter-${index}`,
    }));
    db.resetQueryLog();

    await createAssessmentsRepository({ database: db }).saveAssessment({
      id: 'assessment-61',
      user_id: 'user-1',
      child_id: 'child-0',
      programme_id: 'programme-a',
      assessment_type: 'letter_egra',
      date_assessed: '2026-07-12',
      correct_letters: correctLetters,
      synced: false,
    });

    const log = db.getQueryLog();
    expect(log.filter(query => query.method === 'runAsync')).toHaveLength(124);
    expect(log.filter(query => query.method === 'transaction')).toHaveLength(1);
    expect(log.filter(query => !['runAsync', 'transaction'].includes(query.method))).toHaveLength(0);
    expect(log.some(query => /select .* from (assessment_items|assessments)/i.test(compactSql(query.sql))))
      .toBe(false);

    db.resetQueryLog();
    const owners = await db.getAllAsync(`
      select distinct owner_user_id
      from sync_outbox
      where table_name in ('assessments', 'assessment_items')
    `);
    expect(owners).toEqual([{ owner_user_id: 'user-1' }]);
  });

  test('a 10-attendee session keeps two writes per row and performs no owner-resolution reads', async () => {
    db = await createDatabase();
    await seedChildren(db, 10);
    db.resetQueryLog();

    await createSessionsRepository({ database: db }).saveSession({
      id: 'session-10',
      user_id: 'user-1',
      programme_id: 'programme-a',
      session_date: '2026-07-12',
      children_ids: Array.from({ length: 10 }, (_, index) => `child-${index}`),
      synced: false,
    });

    const log = db.getQueryLog();
    expect(log.filter(query => query.method === 'runAsync')).toHaveLength(22);
    expect(log.filter(query => query.method === 'transaction')).toHaveLength(1);
    expect(log.filter(query => !['runAsync', 'transaction'].includes(query.method))).toHaveLength(0);
    expect(log.some(query => /select .* from (session_attendees|sessions)/i.test(compactSql(query.sql))))
      .toBe(false);

    db.resetQueryLog();
    const owners = await db.getAllAsync(`
      select distinct owner_user_id
      from sync_outbox
      where table_name in ('sessions', 'session_attendees')
    `);
    expect(owners).toEqual([{ owner_user_id: 'user-1' }]);
  });

  test('literacy persistence prefetches only changed children and preserves mastery transitions', async () => {
    db = await createDatabase();
    await seedChildren(db, 2);
    const mastery = createMasteryRepository({ database: db });
    await mastery.saveLetterMasteryRecord({
      id: 'deleted-a', user_id: 'user-1', child_id: 'child-0', programme_id: 'programme-a',
      letter: 'a', language: 'English', source: 'taught', _deleted: true, synced: true,
    });
    await mastery.saveLetterMasteryRecord({
      id: 'active-s', user_id: 'user-1', child_id: 'child-0', programme_id: 'programme-a',
      letter: 's', language: 'English', source: 'taught', synced: true,
    });
    db.resetQueryLog();

    await persistLiteracySession({
      database: db,
      session: {
        id: 'session-mastery', user_id: 'user-1', programme_id: 'programme-a',
        session_date: '2026-07-12', children_ids: ['child-0'], synced: false,
      },
      trackerLanguageKey: 'english',
      letterTrackerChanges: { 'child-0': { a: true, m: true, s: false } },
      nowIso: '2026-07-12T10:00:00.000Z',
      idFactory: () => 'ignored-by-deterministic-id',
    });

    const masteryReads = db.getQueryLog().filter(query => (
      query.method === 'getAllAsync' && compactSql(query.sql).includes('from letter_mastery')
    ));
    expect(masteryReads).toHaveLength(1);
    expect(compactSql(masteryReads[0].sql)).toContain('child_id in (?)');
    expect(compactSql(masteryReads[0].sql)).not.toMatch(/from letter_mastery\s+where programme_id = \? and user_id = \?\s+order by/);

    db.resetQueryLog();
    expect(await db.getAllAsync(`
      select letter, deleted_at
      from letter_mastery
      where child_id = 'child-0' and programme_id = 'programme-a'
      order by letter
    `)).toEqual([
      { letter: 'a', deleted_at: null },
      { letter: 'm', deleted_at: null },
      { letter: 's', deleted_at: '2026-07-12T10:00:00.000Z' },
    ]);
    const masteryOutbox = await db.getAllAsync(`
      select operation, payload
      from sync_outbox
      where table_name = 'letter_mastery'
      order by operation
    `);
    expect(masteryOutbox.map(row => row.operation)).toEqual(['archive', 'insert', 'update']);
    expect(masteryOutbox.map(row => JSON.parse(row.payload))).toEqual(expect.arrayContaining([
      expect.objectContaining({ letter: 'a', deleted_at: null }),
      expect.objectContaining({ letter: 'm', deleted_at: null }),
      expect.objectContaining({ letter: 's', deleted_at: '2026-07-12T10:00:00.000Z' }),
    ]));
  });
});
