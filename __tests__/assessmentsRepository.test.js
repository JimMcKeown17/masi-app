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

  test('typed result reads preserve programme scope, ordering and stored parent values', async () => {
    const otherProgramme = uuid();
    await f.db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', otherProgramme, 'numeracy', 'Numeracy');
    const first = await f.save(2);
    const other = await f.save(2);
    await f.db.runAsync("update assessments set assessment_date = '2026-05-21' where id = ?", first.id);
    await f.db.runAsync("update assessments set programme_id = ?, assessment_date = '2026-05-22' where id = ?",
      otherProgramme, other.id);
    expect((await f.assessments.getQuestionResults()).map(assessment => assessment.id)).toEqual([first.id, other.id]);
    const scoped = await f.assessments.getQuestionResults({ userId: f.userId });
    expect(scoped).toEqual([
      expect.objectContaining({ id: first.id, programme_id: f.programmeId,
        assessment_date: '2026-05-21', score: 1, total_items: 2, language: 'en',
        derived: expect.objectContaining({ total_correct: 1 }), items: expect.any(Array) }),
    ]);
    expect(scoped[0].items).toHaveLength(2);
    expect(scoped[0].date_assessed).toBeUndefined();
    expect(scoped[0].correct_letters).toBeUndefined();
  });

  test('retires all summary-row reader and untyped count APIs', () => {
    expect(f.assessments.getAssessments).toBeUndefined();
    expect(f.assessments.countAssessments).toBeUndefined();
    expect(f.assessments.getUnsyncedRecords).toBeUndefined();
  });

  test('missing user identity refuses the save without writing a family', async () => {
    await expect(f.save(2, { userId: undefined })).rejects.toThrow(/No active programme assignment/i);
    expect(await f.db.getFirstAsync('select count(*) as count from assessments')).toEqual({ count: 0 });
    expect(await f.db.getFirstAsync('select count(*) as count from assessment_items')).toEqual({ count: 0 });
    expect(await f.db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });
});
