import { v4 as uuid } from 'uuid';
import { questionResult } from '../test-support/assessmentFamilySyncTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { persistLiteracySession } from '../src/services/literacySessionPersistence';
import { createCountingSqliteTestDatabase } from '../test-support/countingSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const createDatabase = async () => {
  const db = bindTestActor(createCountingSqliteTestDatabase(':memory:'), 'user-1');
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
    await db.runAsync(`insert into child_ea_assignments (id, child_id, user_id, sync_status)
      values (?, ?, 'user-1', 'synced')`, `delivery-${index}`, `child-${index}`);
  }
};

const compactSql = sql => sql.replace(/\s+/g, ' ').trim().toLowerCase();

describe('completion-path statement budgets', () => {
  let db;

  afterEach(async () => {
    await db?.closeAsync();
    db = null;
  });

  test('a 61-item assessment writes each item once and one family outbox, without owner-resolution reads', async () => {
    db = await createDatabase();
    const userId = uuid(), childId = uuid(), programmeId = uuid();
    bindTestActor(db, userId);
    await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', programmeId, 'family-budget', 'Family budget');
    await db.runAsync('insert into staff_programme_assignments (id, user_id, programme_id) values (?, ?, ?)', uuid(), userId, programmeId);
    await db.runAsync("insert into children (id, first_name, last_name, created_by) values (?, 'Child', 'One', ?)", childId, userId);
    db.resetQueryLog();

    await createAssessmentsRepository({ database: db }).saveQuestionResult({
      assessmentId: uuid(), userId, childId, result: questionResult(61),
    });

    const log = db.getQueryLog();
    expect(log.filter(query => query.method === 'runAsync')).toHaveLength(63);
    expect(log.filter(query => query.method === 'transaction')).toHaveLength(1);
    const reads = log.filter(query => !['runAsync', 'transaction'].includes(query.method));
    expect(reads).toHaveLength(2);
    expect(reads.map(query => compactSql(query.sql))).toEqual([
      expect.stringMatching(/select \* from staff_programme_assignments/),
      'select id from assessments where id = ?',
    ]);

    db.resetQueryLog();
    const owners = await db.getAllAsync(`
      select distinct owner_user_id
      from sync_outbox
      where table_name in ('assessments', 'assessment_items')
    `);
    expect(owners).toEqual([{ owner_user_id: userId }]);
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

  test('literacy persistence writes each tracker change with one keyed read, one record and one outbox upsert', async () => {
    db = await createDatabase();
    await seedChildren(db, 2);
    const mastery = createMasteryRepository({ database: db });
    for (const [letter, confirmed] of [['a', false], ['s', true]]) {
      await mastery.setLetterMastery({
        childId: 'child-0', programmeId: 'programme-a', letter, language: 'en',
        confirmed, changedAt: '2026-07-11T09:00:00.000Z',
      });
    }
    db.resetQueryLog();
    const writes = jest.spyOn(db, 'runAsync');

    await persistLiteracySession({
      database: db,
      session: {
        id: 'session-mastery', user_id: 'user-1', programme_id: 'programme-a',
        session_date: '2026-07-12', children_ids: ['child-0'], synced: false,
      },
      letterTrackerChanges: { 'child-0': {
        a: { mastered: true, languageCode: 'en', madeAt: '2026-07-12T09:55:00.000Z' },
        m: { mastered: true, languageCode: 'en', madeAt: '2026-07-12T09:56:00.000Z' },
        s: { mastered: false, languageCode: 'en', madeAt: '2026-07-12T09:57:00.000Z' },
      } },
      nowIso: '2026-07-12T10:00:00.000Z',
      idFactory: () => 'unused',
    });

    const log = db.getQueryLog();
    const masteryReads = log.filter(query => (
      query.method === 'getFirstAsync' && compactSql(query.sql).includes('from letter_mastery')
    ));
    expect(masteryReads).toHaveLength(3);
    for (const query of masteryReads) expect(compactSql(query.sql)).toContain('where lm.id = ?');
    expect(log.filter(query => query.method === 'getAllAsync' && compactSql(query.sql).includes('from letter_mastery'))).toHaveLength(0);
    const masteryWrites = writes.mock.calls.filter(([sql, ...params]) =>
      /(?:into|update) "letter_mastery"/i.test(sql) || (sql.includes('sync_outbox') && params.includes('letter_mastery')));
    expect(masteryWrites.length).toBeLessThanOrEqual(6);
    writes.mockRestore();

    expect(await db.getAllAsync("select letter, language, confirmed from letter_mastery where child_id = 'child-0' order by letter"))
      .toEqual([
        { letter: 'a', language: 'en', confirmed: 1 },
        { letter: 'm', language: 'en', confirmed: 1 },
        { letter: 's', language: 'en', confirmed: 0 },
      ]);
    const slots = await db.getAllAsync("select operation, payload from sync_outbox where table_name = 'letter_mastery'");
    expect(slots.map(row => row.operation)).toEqual(['update', 'update', 'update']);
    expect(slots.map(row => JSON.parse(row.payload))).toEqual(expect.arrayContaining([
      expect.objectContaining({ letter: 'a', language: 'en', confirmed: true }),
      expect.objectContaining({ letter: 'm', language: 'en', confirmed: true }),
      expect.objectContaining({ letter: 's', language: 'en', confirmed: false }),
    ]));
  });
});
