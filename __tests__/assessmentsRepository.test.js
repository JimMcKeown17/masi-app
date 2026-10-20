jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { v4 as uuid, validate as uuidValidate } from 'uuid';
import { createFamilySyncFixture, questionResult } from '../test-support/assessmentFamilySyncTestUtils';

describe('assessmentsRepository', () => {
  let f;
  beforeEach(async () => { f = await createFamilySyncFixture(); });
  afterEach(async () => { await f.db.closeAsync(); });

  test('assessment save writes one family transaction with UUID items and one outbox row', async () => {
    const { id } = await f.save(2, { result: questionResult(2, {
      items: [
        { position: 0, item_key: 'a', prompt: 'a', is_correct: true },
        { position: 1, item_key: 'm', prompt: 'm', is_correct: false },
      ],
    }) });
    expect(await f.db.getFirstAsync('select count(*) as count from assessments')).toEqual({ count: 1 });
    const items = await f.items(id);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(uuidValidate(item.id)).toBe(true);
      expect(item.id).not.toContain(':');
    }
    const outbox = await f.db.getAllAsync('select * from sync_outbox');
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ table_name: 'assessments', record_id: id });
    expect(JSON.parse(outbox[0].payload).items).toHaveLength(2);
    expect(await f.assessments.getQuestionResults()).toEqual([
      expect.objectContaining({ id, score: 1, total_items: 2, language: 'en', synced: false }),
    ]);
  });

  test('assessment saves require an active programme assignment', async () => {
    await f.db.runAsync("update staff_programme_assignments set ended_at = '2026-05-21T00:00:00.000Z'");
    await expect(f.save()).rejects.toThrow(/No active programme assignment/i);
    expect(await f.db.getFirstAsync('select count(*) as count from assessments')).toEqual({ count: 0 });
    expect(await f.db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test('legacy summary reads remain programme-scoped until their readers move in Task 12', async () => {
    const otherProgramme = uuid();
    await f.db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', otherProgramme, 'numeracy', 'Numeracy');
    for (const [id, programmeId, date] of [
      ['assessment-literacy', f.programmeId, '2026-05-21'],
      ['assessment-numeracy', otherProgramme, '2026-05-22'],
    ]) {
      await f.db.runAsync(`insert into assessments (id, user_id, child_id, programme_id, assessment_type, assessment_date)
        values (?, ?, ?, ?, 'letter_egra', ?)`, id, f.userId, f.childId, programmeId, date);
      await f.db.runAsync(`insert into assessment_items (id, assessment_id, item_key, metadata)
        values (?, ?, '__summary__', ?)`, uuid(), id, JSON.stringify({
          correct_letters: [{ index: 0, letter: 'a' }], incorrect_letters: [{ index: 1, letter: 'm' }],
          letters_attempted: 2, correct_responses: 1, accuracy: 50, letter_language: 'isiXhosa',
        }));
    }
    expect((await f.assessments.getAssessments()).map(assessment => assessment.id))
      .toEqual(['assessment-literacy', 'assessment-numeracy']);
    expect(await f.assessments.getAssessments({ userId: f.userId })).toEqual([
      expect.objectContaining({ id: 'assessment-literacy', programme_id: f.programmeId,
        date_assessed: '2026-05-21', correct_letters: [{ index: 0, letter: 'a' }],
        incorrect_letters: [{ index: 1, letter: 'm' }], letters_attempted: 2,
        correct_responses: 1, accuracy: 50, letter_language: 'isiXhosa' }),
    ]);
  });

  test('missing user identity refuses the save without writing a family', async () => {
    await expect(f.save(2, { userId: undefined })).rejects.toThrow(/No active programme assignment/i);
    expect(await f.db.getFirstAsync('select count(*) as count from assessments')).toEqual({ count: 0 });
    expect(await f.db.getFirstAsync('select count(*) as count from assessment_items')).toEqual({ count: 0 });
    expect(await f.db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });
});
