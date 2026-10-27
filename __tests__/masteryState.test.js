jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { v4 as uuid } from 'uuid';
import { loadMasteryState, countMastered, pendingChangesLanguageCode } from '../src/utils/masteryState';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { createFamilySyncFixture, questionResult } from '../test-support/assessmentFamilySyncTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';

describe('loadMasteryState', () => {
  let f, repositories;
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
    f = await createFamilySyncFixture({ withDelivery: true });
    await f.db.runAsync(`insert into academic_years (id, label, starts_on, ends_on, is_active)
      values ('year-2026', '2026', '2026-01-15', '2026-12-15', 1)`);
    repositories = {
      assessments: f.assessments, mastery: createMasteryRepository({ database: f.db }),
    };
  });
  afterEach(async () => { await f.db.closeAsync(); jest.useRealTimers(); });
  const load = languageCode => loadMasteryState({
    repositories, userId: f.userId, childId: f.childId, languageCode,
  });
  const confirm = (letter, language, confirmed = true) => repositories.mastery.setLetterMastery({
    childId: f.childId, letter, language, confirmed,
  });
  const insertRow = async (overrides) => {
    const row = {
      id: uuid(), child_id: f.childId, letter: 'a', language: 'en', confirmed: 1,
      changed_at: '2026-10-20T08:00:00.000Z', correction_id: uuid(), changed_by: f.userId,
      programme_id: f.programmeId, sync_status: 'synced', ...overrides,
    };
    await f.db.runAsync(`insert into letter_mastery
      (id, child_id, letter, language, confirmed, changed_at, correction_id, changed_by, programme_id, sync_status)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id, row.child_id, row.letter, row.language, row.confirmed, row.changed_at,
    row.correction_id, row.changed_by, row.programme_id, row.sync_status);
  };

  test('isiZulu has no mastery order and does not read results or confirmations', async () => {
    const resultsRead = jest.spyOn(repositories.assessments, 'letterEvidenceFor');
    const masteryRead = jest.spyOn(repositories.mastery, 'getLetterMastery');
    const state = await load('zu');
    expect(state).toEqual({
      assessmentMastered: new Set(), pedagogicalOrder: null,
      latestAssessment: null, taughtRecords: [],
    });
    expect(resultsRead).not.toHaveBeenCalled();
    expect(masteryRead).not.toHaveBeenCalled();
  });

  test('picks the latest LETTER assessment even when a word assessment is newer', async () => {
    const { id } = await f.save(1, { result: questionResult(1, {
      items: [{ position: 0, item_key: 'a', prompt: 'A', is_correct: true }],
    }) });
    const word = await f.save(1, { result: questionResult(1, { question_code: 'word_reading', item_set_id: 'word_reading@2026.1.en' }) });
    await f.db.runAsync("update assessments set assessment_date = '2099-01-01' where id = ?", word.id);
    const latest = jest.spyOn(repositories.assessments, 'letterEvidenceFor');
    const state = await load('en');
    expect(latest).toHaveBeenCalledWith({ userId: f.userId, childId: f.childId, language: 'en' });
    expect(state.latestAssessment.id).toBe(id);
    expect(state.assessmentMastered).toEqual(new Set(['a']));
  });

  test('legacy summaries do not provide evidence without stored Question result items', async () => {
    const id = uuid();
    await f.db.runAsync(`insert into assessments (id, user_id, child_id, programme_id, assessment_type, assessment_date)
      values (?, ?, ?, ?, 'letter_egra', '2026-07-01')`, id, f.userId, f.childId, f.programmeId);
    await f.db.runAsync(`insert into assessment_items (id, assessment_id, item_key, metadata)
      values (?, ?, '__summary__', ?)`, uuid(), id, JSON.stringify({
      letter_language: 'English', last_letter_attempted: { index: 0 }, correct_letters: [{ index: 0, letter: 'a' }],
    }));
    const state = await load('en');
    expect(state.latestAssessment).toBeNull();
    expect(state.assessmentMastered).toEqual(new Set());
  });

  test('taught records exclude unconfirmed rows and other languages', async () => {
    const active = await confirm('a', 'en', true);
    await confirm('b', 'en', false);
    await confirm('c', 'xh', true);
    const state = await load('en');
    expect(state.taughtRecords.map(r => r.id)).toEqual([active.id]);
  });

  test('confirmations from any EA and any programme count; unconfirmed, terminal and other-language rows do not', async () => {
    await f.db.runAsync("insert into programmes (id, code, name) values ('programme-b', 'other', 'Other Programme')");
    await confirm('a', 'en', true);
    await insertRow({ letter: 'b', language: 'en', confirmed: 1, changed_by: 'other-ea', programme_id: 'programme-b', sync_status: 'synced' });
    await insertRow({ letter: 'c', language: 'en', confirmed: 0, changed_by: 'other-ea', sync_status: 'synced' });
    await insertRow({ letter: 'd', language: 'en', confirmed: 1, sync_status: 'terminal' });
    await confirm('e', 'xh', true);
    const read = jest.spyOn(repositories.mastery, 'getLetterMastery');
    const state = await load('en');
    expect(read).toHaveBeenCalledWith({ childId: f.childId, language: 'en' });
    expect(state.taughtRecords.map(r => r.letter)).toEqual(['a', 'b']);
  });

  test('an Afrikaans child reads Afrikaans results and confirmations only', async () => {
    const af = await f.save(4, { result: questionResult(4, {
      question_version: '2026.2', item_set_id: 'letter_sounds@2026.2.af', language: 'af',
      items: ['l', 'a', 'm', 'E'].map((prompt, position) => ({
        position, item_key: String(position), prompt, is_correct: position !== 1, metadata: { row: 0, reached: true },
      })),
    }) });
    const en = await f.save(1, { result: questionResult(1, {
      items: [{ position: 0, item_key: '0', prompt: 'z', is_correct: true, metadata: { reached: true } }],
    }) });
    await f.db.runAsync("update assessments set assessment_date = '2099-01-01' where id = ?", en.id);
    await confirm('k', 'af', true);
    await confirm('s', 'en', true);
    const state = await load('af');
    expect(state.pedagogicalOrder).toEqual(['a','s','m','e','k','i','r','o','n','t','d','l','p','u','b','g','h','v','w','y','f','j','c','z','x','q']);
    expect(state.latestAssessment.id).toBe(af.id);
    expect(state.assessmentMastered).toEqual(new Set(['l', 'm', 'e']));
    expect(state.taughtRecords.map(r => [r.letter, r.language])).toEqual([['k', 'af']]);
    expect(countMastered({ ...state, taughtLetters: new Set(state.taughtRecords.map(r => r.letter)) })).toBe(4);
  });

  test.each([null, undefined, 'zu', 'klingon'])('unsupported language %p returns no evidence without repository calls', async language => {
    const latest = jest.spyOn(repositories.assessments, 'letterEvidenceFor');
    const mastery = jest.spyOn(repositories.mastery, 'getLetterMastery');
    const state = await load(language);
    expect(state.assessmentMastered.size).toBe(0);
    expect(state.taughtRecords).toEqual([]);
    expect(state.latestAssessment).toBeNull();
    expect(latest).not.toHaveBeenCalled();
    expect(mastery).not.toHaveBeenCalled();
  });

  test('battery Q1 evidence recorded by another EA unions with this EA’s isiXhosa confirmation', async () => {
    const otherUserId = uuid();
    await f.db.runAsync(`insert into staff_programme_assignments (id, user_id, programme_id, assigned_at)
      values (?, ?, ?, '2026-01-15T00:00:00.000Z')`, uuid(), otherUserId, f.programmeId);
    bindTestActor(f.db, otherUserId);
    const run = await f.start({ userId: otherUserId, language: 'xh' });
    const { id } = await f.save(3, {
      userId: otherUserId, batteryRunId: run.id,
      result: questionResult(3, {
        language: 'xh', item_set_id: 'letter_sounds@2026.1.xh',
        items: [
          { position: 9, item_key: 'a1', prompt: 'A', is_correct: true, metadata: { reached: true } },
          { position: 2, item_key: 'a2', prompt: 'a', is_correct: true },
          { position: 8, item_key: 'b', prompt: 'b', is_correct: true, metadata: { reached: false } },
        ],
      }),
    });
    bindTestActor(f.db, f.userId);
    await confirm('e', 'xh', true);
    await confirm('z', 'en', true);
    const state = await load('xh');
    expect(state.latestAssessment).toMatchObject({ id, user_id: otherUserId, battery_run_id: run.id, language: 'xh' });
    expect(state.assessmentMastered).toEqual(new Set(['a']));
    expect(state.taughtRecords.map(r => [r.letter, r.language])).toEqual([['e', 'xh']]);
    expect(countMastered({
      ...state, taughtLetters: new Set(state.taughtRecords.map(r => r.letter)),
    })).toBe(2);
  });
});

describe('countMastered', () => {
  const pedagogicalOrder = ['a', 'b', 'c', 'd'];
  const change = (mastered, languageCode = 'en', madeAt = '2026-10-19T08:00:00.000Z') => ({ mastered, languageCode, madeAt });

  test('counts assessment, pending-add, and stored-taught; pending-remove wins over stored', () => {
    const count = countMastered({
      assessmentMastered: new Set(['a']),
      taughtLetters: new Set(['b', 'c']),
      pendingChanges: { c: change(false), d: change(true) },
      pedagogicalOrder,
    });
    // a (assessment) + b (stored) + d (pending add); c removed by pending false
    expect(count).toBe(3);
  });

  test('preserves the old bottom-sheet count helper semantics', () => {
    const count = countMastered({
      assessmentMastered: new Set(),
      taughtLetters: new Set(['a', 's']),
      pendingChanges: { m: change(true), s: change(false) },
      pedagogicalOrder: ['a', 'm', 's'],
    });
    expect(count).toBe(2);
  });

  test('returns the language of the first pending change', () => {
    expect(pendingChangesLanguageCode({ a: change(true, 'xh') })).toBe('xh');
  });

  test('returns null when there are no pending changes', () => {
    expect(pendingChangesLanguageCode({})).toBeNull();
    expect(pendingChangesLanguageCode(undefined)).toBeNull();
  });
});
