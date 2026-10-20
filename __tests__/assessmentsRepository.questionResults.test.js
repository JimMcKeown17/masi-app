jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { v4 as uuid } from 'uuid';
import { runMigrations } from '../src/db/migrations';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { assessmentItemDomainId } from '../src/db/repositories/domainRepositoryUtils';
import { createMigratedDatabase } from '../test-support/sqliteRepositoryTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';
import { runContractTest } from '../src/assessment-questions/contractTest/runContractTest';
import * as fixtures from '../src/assessment-questions/testFixtures';
import { LetterSoundsQuestion } from '../src/assessment-questions/questions/LetterSoundsQuestion';
import { CURRENT_ITEM_SETS } from '../src/assessment-questions/itemsets/current';
import { ReadWordsQuestion } from '../src/assessment-questions/questions/ReadWordsQuestion';
import { ReadSentencesQuestion } from '../src/assessment-questions/questions/ReadSentencesQuestion';
import { ReadPassageQuestion } from '../src/assessment-questions/questions/ReadPassageQuestion';
import { ListenFirstSoundQuestion } from '../src/assessment-questions/questions/ListenFirstSoundQuestion';
import { ListenPhonemeBlendQuestion } from '../src/assessment-questions/questions/ListenPhonemeBlendQuestion';
import { ListenAndAnswerStoryQuestion } from '../src/assessment-questions/questions/ListenAndAnswerStoryQuestion';
import { LetterWritingFromPicturesQuestion } from '../src/assessment-questions/questions/LetterWritingFromPicturesQuestion';
import { WriteCvcsQuestion } from '../src/assessment-questions/questions/WriteCvcsQuestion';
import { WriteSentencesFromDictationQuestion } from '../src/assessment-questions/questions/WriteSentencesFromDictationQuestion';
import { StoryWritingRubricQuestion } from '../src/assessment-questions/questions/StoryWritingRubricQuestion';
import { NullQuestion } from '../src/assessment-questions/questions/NullQuestion';

const assertShape = payload => require('../src/services/assessmentFamilyPayload').assertSubmitShape(payload);
const resultFor = (overrides = {}) => ({
  question_code: 'letter_sounds', question_version: '2026.1',
  item_set_id: 'letter_sounds@2026.1.en', language: 'en',
  duration_ms: 1000, stopped_reason: 'completed',
  items: [{ position: 0, item_key: 'a', prompt: 'a', is_correct: true }],
  derived: { total_correct: 1, total_attempted: 1, percent: 100, last_attempted_position: 0 },
  ...overrides,
});
const press = (rendered, ...labels) => labels.forEach(label => fireEvent.press(rendered.getByText(label)));
const endSequential = rendered => {
  fireEvent.press(rendered.getByTestId('letter-end'));
  fireEvent.press(within(rendered.getByTestId('end-confirmation')).getByText('End test'));
};

// Use the same real components, fixtures and verdict as the package contract tests.
// The wrapper also captures the emitted Result for the repository round trip.
const emitResult = async (Component, itemSet, interact) => {
  let emitted;
  const Capture = props => React.createElement(Component, {
    ...props,
    onComplete: result => { emitted = result; props.onComplete(result); },
  });
  const { rendered, verdict } = runContractTest(Capture, { language: 'en', itemSet, instructions: '.' });
  try {
    interact(rendered);
    expect(await verdict).toEqual({ valid: true, errors: [] });
    return emitted;
  } finally {
    rendered.unmount();
  }
};

const componentCases = [
  ['LetterSoundsQuestion', LetterSoundsQuestion, fixtures.FIXTURE_LETTER_SOUNDS_EN,
    r => { press(r, 'Start', 'Correct'); endSequential(r); }],
  ['ReadWordsQuestion', ReadWordsQuestion, fixtures.FIXTURE_READ_WORDS_EN,
    r => { press(r, 'Start'); fireEvent.press(r.getByLabelText('cat, idle')); press(r, 'End', 'Reached the end'); }],
  ['ReadSentencesQuestion', ReadSentencesQuestion, fixtures.FIXTURE_READ_SENTENCES_EN,
    r => { press(r, 'Start'); fireEvent.press(r.getByLabelText('The, idle')); press(r, 'Finish', 'Yes, finish'); }],
  ['ReadPassageQuestion', ReadPassageQuestion, fixtures.FIXTURE_READ_PASSAGE_EN,
    r => { press(r, 'Start'); fireEvent.press(r.getByTestId('pill-p1.w1')); press(r, 'End', 'Reached the end'); }],
  ['ListenFirstSoundQuestion', ListenFirstSoundQuestion, fixtures.FIXTURE_FIRST_SOUND_EN,
    r => { press(r, 'Start'); fireEvent.press(r.getByLabelText('apple, idle')); press(r, 'Finish', 'Yes, finish'); }],
  ['ListenPhonemeBlendQuestion', ListenPhonemeBlendQuestion, fixtures.FIXTURE_PHONEME_BLEND_EN,
    r => { press(r, 'Start'); fireEvent.press(r.getByLabelText('s-u-n, idle')); press(r, 'Finish', 'Yes, finish'); }],
  ['ListenAndAnswerStoryQuestion', ListenAndAnswerStoryQuestion, fixtures.FIXTURE_LISTEN_AND_ANSWER_STORY_EN,
    r => { press(r, "I've finished reading"); fireEvent.press(r.getByLabelText('What was the name of the bird?, idle')); press(r, 'Finish', 'Yes, finish'); }],
  ['LetterWritingFromPicturesQuestion', LetterWritingFromPicturesQuestion, fixtures.FIXTURE_LETTER_WRITING_EN,
    r => { press(r, 'Start'); fireEvent.press(r.getByTestId('cell-q5.item_1')); press(r, 'Finish', 'Yes, finish'); }],
  ['WriteCvcsQuestion', WriteCvcsQuestion, fixtures.FIXTURE_WRITE_CVCS_EN,
    r => { press(r, 'Start'); fireEvent.press(r.getByLabelText('jam letter 1 j, idle')); press(r, 'Finish', 'Yes, finish'); }],
  ['WriteSentencesFromDictationQuestion', WriteSentencesFromDictationQuestion, fixtures.FIXTURE_WRITE_SENTENCES_DICTATION_EN,
    r => { press(r, 'Start'); fireEvent.press(r.getByLabelText('Mom, idle')); press(r, 'Finish', 'Yes, finish'); }],
  ['StoryWritingRubricQuestion', StoryWritingRubricQuestion, fixtures.FIXTURE_STORY_WRITING_EN,
    r => {
      press(r, 'Start');
      ['meaning_making', 'length', 'vocabulary'].forEach(d => fireEvent.press(r.getByTestId(`chip-${d}-4`)));
      press(r, 'Finish', 'Yes, finish');
    }],
  ['NullQuestion', NullQuestion, undefined, () => {}],
];

describe('question result persistence through real SQLite', () => {
  let db, repository, userId, childId, programmeId;
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    userId = uuid(); childId = uuid(); programmeId = uuid();
    bindTestActor(db, userId);
    await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', programmeId, 'literacy', 'Literacy');
    await db.runAsync(`insert into staff_programme_assignments (id, user_id, programme_id, assigned_at)
      values (?, ?, ?, '2026-01-15T00:00:00.000Z')`, uuid(), userId, programmeId);
    await db.runAsync('insert into children (id, first_name, last_name, created_by) values (?, ?, ?, ?)', childId, 'Test', 'Child', userId);
    repository = createAssessmentsRepository({ database: db });
  });
  afterEach(async () => { await db?.closeAsync(); jest.useRealTimers(); });
  const save = (args = {}) => repository.saveQuestionResult({
    assessmentId: uuid(), result: resultFor(), userId, childId, ...args,
  });
  const outbox = async () => (await db.getAllAsync('select * from sync_outbox order by id'))
    .map(row => ({ ...row, payload: JSON.parse(row.payload) }));
  const snapshot = async () => Promise.all(['assessments', 'assessment_items', 'sync_outbox']
    .map(table => db.getAllAsync(`select * from ${table} order by id`)));
  const startRun = async () => {
    const id = uuid();
    await db.runAsync(`insert into battery_runs
      (id, user_id, child_id, programme_id, battery_code, battery_version, language, started_at, started_here)
      values (?, ?, ?, ?, 'wela_plus', '2026.1', 'en', '2026-10-20T10:00:00.000Z', 1)`,
    id, userId, childId, programmeId);
    return id;
  };

  test('a stop-rule result after a backward clock jump saves a valid ten-second outbox family', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-20T12:00:00Z'));
    const onComplete = jest.fn();
    const screen = render(<LetterSoundsQuestion language="en" durationSec={60} onComplete={onComplete} />);
    try {
      press(screen, 'Start');
      act(() => jest.advanceTimersByTime(10000));
      act(() => jest.setSystemTime(Date.now() - 3600000));
      for (let i = 0; i < 10; i += 1) press(screen, 'Incorrect');
      act(() => jest.advanceTimersByTime(90000));
      press(screen, 'Save result');
      expect(onComplete).toHaveBeenCalledTimes(1);
      const result = onComplete.mock.calls[0][0];
      const assessmentId = uuid();
      await expect(save({ assessmentId, result, captureMode: 'sequential' })).resolves.toEqual({ id: assessmentId });
      const [read] = await repository.getQuestionResults({ userId, assessmentId });
      expect(read).toMatchObject({ duration_ms: 10000, stopped_reason: 'stop_rule',
        derived: { total_attempted: 10, total_correct: 0, last_attempted_position: 9 } });
      expect(read.items).toHaveLength(60);
      const rows = await outbox();
      expect(rows).toHaveLength(1);
      expect(rows[0].payload).toMatchObject({ duration_ms: 10000, stopped_reason: 'stop_rule' });
      expect(rows[0].payload.items).toHaveLength(60);
      expect(() => assertShape(rows[0].payload)).not.toThrow();
    } finally {
      screen.unmount();
    }
  });

  test('a full mixed-case Grid A run keeps every result key and persisted id unique', async () => {
    const itemSet = CURRENT_ITEM_SETS.letter_sounds.en;
    const result = await emitResult(LetterSoundsQuestion, itemSet, r => {
      press(r, 'Start');
      for (let position = 0; position < 60; position += 1) press(r, 'Correct');
    });
    expect(result).toMatchObject({ question_version: '2026.2', stopped_reason: 'completed',
      derived: { total_correct: 60, total_attempted: 60, last_attempted_position: 59 } });
    expect(new Set(result.items.map(item => item.item_key)).size).toBe(60);
    const assessmentId = uuid();
    expect(await save({ assessmentId, result, captureMode: 'sequential' })).toEqual({ id: assessmentId });
    const [parents, items] = await snapshot();
    expect(parents).toHaveLength(1);
    expect(items).toHaveLength(60);
    expect(parents[0]).toMatchObject({
      id: assessmentId, sync_status: 'pending', assessment_type: 'letter_sounds',
      assessment_purpose: 'progress_check', assessment_window_id: null, battery_run_id: null,
      capture_mode: 'sequential', total_items: 60, items_tested: null,
    });
    expect(items.every(i => i.sync_status === 'pending' && i.item_key !== '__summary__')).toBe(true);
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: `assessments:${assessmentId}:insert`, table_name: 'assessments', owner_user_id: userId });
    expect(rows[0].payload.items).toHaveLength(60);
    expect(new Set(rows[0].payload.items.map(item => item.item_key)).size).toBe(60);
    expect(new Set(rows[0].payload.items.map(item => item.id.toLowerCase())).size).toBe(60);
    expect(rows[0].payload).not.toHaveProperty('items_tested');
    expect(rows[0].payload.items.every(i => typeof i.is_correct === 'boolean')).toBe(true);
    expect(() => assertShape(rows[0].payload)).not.toThrow();
  });

  test('saving an existing id throws its error code and leaves the family unchanged', async () => {
    const assessmentId = uuid();
    await save({ assessmentId });
    const before = await snapshot();
    await expect(save({ assessmentId })).rejects.toMatchObject({
      code: 'ASSESSMENT_ALREADY_SAVED', message: expect.stringContaining('ASSESSMENT_ALREADY_SAVED'),
    });
    expect(await snapshot()).toEqual(before);
  });

  test('concurrent saves of one presentation persist exactly one family', async () => {
    const assessmentId = uuid();
    const attempts = await Promise.allSettled([save({ assessmentId }), save({ assessmentId })]);
    expect(attempts.filter(a => a.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.find(a => a.status === 'rejected').reason.code).toBe('ASSESSMENT_ALREADY_SAVED');
    const [parents, items, queued] = await snapshot();
    expect([parents.length, items.length, queued.length]).toEqual([1, 1, 1]);
  });

  test('capture stamps the programme local day and defaults null metadata to an object', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-20T23:30:00.000Z'));
    const result = resultFor();
    result.items[0].metadata = null;
    await save({ result });
    const [read] = await repository.getQuestionResults({ userId });
    expect(read).toMatchObject({
      assessment_date: '2026-10-21', created_at: '2026-10-20T23:30:00.000Z',
      updated_at: '2026-10-20T23:30:00.000Z',
    });
    expect(read.items[0].metadata).toEqual({});
    expect((await outbox())[0].payload.items[0].metadata).toEqual({});
  });

  test('a second decision for the same run and Question is refused; the partial index backs it', async () => {
    const batteryRunId = await startRun();
    await save({ batteryRunId });
    const before = await snapshot();
    await expect(save({ batteryRunId })).rejects.toMatchObject({
      code: 'QUESTION_ALREADY_DECIDED', message: expect.stringContaining('QUESTION_ALREADY_DECIDED'),
    });
    expect(await snapshot()).toEqual(before);
    await expect(db.runAsync(`insert into assessments (id, user_id, child_id, programme_id,
      assessment_type, assessment_date, battery_run_id, question_code)
      values (?, ?, ?, ?, 'letter_sounds', '2026-10-20', ?, 'letter_sounds')`,
    uuid(), userId, childId, programmeId, batteryRunId)).rejects.toMatchObject({
      code: 'SQLITE_CONSTRAINT_UNIQUE', message: expect.stringContaining('UNIQUE'),
    });
  });

  test('a skipped result has zero items and still passes the complete shape check', async () => {
    const { id } = await save({ result: resultFor({ stopped_reason: 'skipped_tired', items: [] }) });
    expect(await db.getFirstAsync('select total_items from assessments where id = ?', id)).toEqual({ total_items: 0 });
    expect((await outbox())[0].payload.items).toEqual([]);
    const [row] = await outbox();
    expect(() => assertShape(row.payload)).not.toThrow();
  });

  test.each(componentCases)('%s round-trips its emitted Result, without identity collisions', async (name, Component, fixture, interact) => {
    const result = await emitResult(Component, fixture, interact);
    const { id } = await save({ result });
    const [row] = await outbox();
    expect(() => assertShape(row.payload)).not.toThrow();
    expect(row.payload.items).toHaveLength(result.items.length);
    expect(new Set(row.payload.items.map(i => i.id)).size).toBe(result.items.length);
    result.items.forEach((item, index) => {
      expect(row.payload.items[index]).toMatchObject({
        ...item, metadata: item.metadata ?? {},
        id: assessmentItemDomainId({ assessmentId: id, position: item.position, isCorrect: item.is_correct }),
      });
    });
    const [read] = await repository.getQuestionResults({ userId, includeSkipped: true });
    expect(read.derived).toEqual(result.derived);
    expect(read.items.map(i => i.position)).toEqual(result.items.map(i => i.position).sort((a, b) => a - b));
    expect(read.items.every(i => typeof i.is_correct === 'boolean')).toBe(true);
    if (name === 'StoryWritingRubricQuestion') {
      expect(read.items.map(i => i.position)).toEqual([0, 2, 3]);
      expect(read.score).toBe(12);
      expect(row.payload.score).toBe(12);
    }
    if (name === 'ListenAndAnswerStoryQuestion') {
      expect(result.items.every(i => i.metadata === undefined)).toBe(true);
      expect(read.items.every(i => JSON.stringify(i.metadata) === '{}')).toBe(true);
    }
  });

  test.each([
    ['package validation', () => ({ result: resultFor({ items: [{ position: 0 }] }) }), /is_correct/],
    ['required assessment id', () => ({ assessmentId: undefined }), /id/],
    ['UUID parent field', () => ({ userId: 'not-a-uuid' }), /user_id/],
    ['shape validation on skipped family', () => ({ result: resultFor({ stopped_reason: 'skipped_tired', items: [], language: 'English' }) }), /language/],
    ['item metadata', () => ({ result: resultFor({ items: [{ position: 0, item_key: 'a', prompt: 'a', is_correct: true, metadata: [] }] }) }), /metadata/],
    ['fractional score', () => ({ result: resultFor({ derived: { ...resultFor().derived, total_correct: 1.5 } }) }), /score/],
  ])('%s fails without leaving any family or outbox rows', async (_label, args, message) => {
    // Give the deliberately malformed user an assignment so the shape guard is exercised.
    await db.runAsync('insert into staff_programme_assignments (id, user_id, programme_id) values (?, ?, ?)', uuid(), 'not-a-uuid', programmeId);
    await expect(save(args())).rejects.toThrow(message);
    expect(await snapshot()).toEqual([[], [], []]);
  });

  test('no active programme refuses the save and reads return no results', async () => {
    await db.runAsync("update staff_programme_assignments set ended_at = '2026-10-20'");
    await expect(save()).rejects.toThrow(/No active programme assignment/);
    expect(await repository.getQuestionResults({ userId })).toEqual([]);
    expect(await repository.countResults({ userId, childId, questionCode: 'letter_sounds' })).toBe(0);
    expect(await snapshot()).toEqual([[], [], []]);
  });

  test('an outbox failure rolls back the parent and every item, and the same id can be retried', async () => {
    await db.execAsync("create trigger fail_family before insert on sync_outbox begin select raise(abort, 'outbox unavailable'); end");
    const assessmentId = uuid();
    // The native SQLite error constructor can belong to another Jest suite's realm.
    await expect(save({ assessmentId })).rejects.toMatchObject({
      code: 'SQLITE_CONSTRAINT_TRIGGER', message: 'outbox unavailable',
    });
    expect(await snapshot()).toEqual([[], [], []]);
    await db.execAsync('drop trigger fail_family');
    expect(await save({ assessmentId })).toEqual({ id: assessmentId });
  });

  test('a caller-owned transaction includes the family and rolls it back on failure', async () => {
    await expect(db.withExclusiveTransactionAsync(async txn => {
      await save({ transaction: txn });
      throw new Error('outer failure');
    })).rejects.toThrow('outer failure');
    expect(await snapshot()).toEqual([[], [], []]);
  });

  test('letter reads include standalone and battery Q1, excluding other tests and skipped results by default', async () => {
    const standalone = await save();
    const battery = await save({ batteryRunId: await startRun() });
    await save({ result: resultFor({ question_code: 'word_reading' }) });
    const skipped = await save({ result: resultFor({ items: [], stopped_reason: 'skipped_other' }) });
    expect((await repository.getLetterResults({ userId })).map(r => r.id).sort()).toEqual([standalone.id, battery.id].sort());
    expect((await repository.getLetterResults({ userId, questionCodes: ['word_reading'] })).map(r => r.id).sort())
      .toEqual([standalone.id, battery.id].sort());
    expect((await repository.getLetterResults({ userId, includeSkipped: true })).map(r => r.id).sort())
      .toEqual([standalone.id, battery.id, skipped.id].sort());
    expect(await repository.countResults({ userId, childId, questionCode: 'letter_sounds' })).toBe(2);
    expect(await repository.countResults({ userId, childId, questionCode: 'word_reading' })).toBe(1);
  });

  test('exposes only the Question result write API', () => {
    expect(repository.saveAssessment).toBeUndefined();
    expect(repository.saveQuestionResult).toEqual(expect.any(Function));
  });

  test('reads one saved family by assessmentId without crossing programme scope', async () => {
    const first = await save();
    const second = await save();
    expect((await repository.getQuestionResults({ userId, assessmentId: second.id })).map(row => row.id))
      .toEqual([second.id]);
    expect(await repository.getQuestionResults({ userId, assessmentId: uuid() })).toEqual([]);
    const otherProgramme = uuid();
    await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', otherProgramme, 'other-id', 'Other');
    await db.runAsync('update assessments set programme_id = ? where id = ?', otherProgramme, first.id);
    expect(await repository.getQuestionResults({ userId, assessmentId: first.id })).toEqual([]);
  });

  test('typed result reads and counts exclude legacy summary assessments', async () => {
    await db.runAsync(`insert into assessments (id, user_id, child_id, programme_id, assessment_type, assessment_date)
      values (?, ?, ?, ?, 'letter_egra', '2026-10-20')`, uuid(), userId, childId, programmeId);
    expect(await repository.getQuestionResults({ userId, includeSkipped: true })).toEqual([]);
    expect(await repository.countResults({ userId, childId, questionCode: 'letter_sounds' })).toBe(0);
  });

  test('reads apply every filter, programme scope, ordering, and hydrate sparse items', async () => {
    const first = await save({ result: resultFor({ items: [
      { position: 4, item_key: 'm', prompt: 'm', is_correct: false, metadata: { reached: false } },
      { position: 1, item_key: 'a', prompt: 'a', is_correct: true, metadata: { reached: true } },
    ] }) });
    const second = await save();
    const other = await save();
    const otherProgramme = uuid(), otherChild = uuid(), otherUser = uuid();
    await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', otherProgramme, 'other', 'Other');
    await db.runAsync('insert into children (id, first_name, last_name) values (?, ?, ?)', otherChild, 'Other', 'Child');
    await db.runAsync("update assessments set assessment_date = '2026-10-18', created_at = '2026-10-18T08:00:00Z' where id = ?", first.id);
    await db.runAsync("update assessments set assessment_date = '2026-10-19', child_id = ?, user_id = ?, language = 'xh' where id = ?", otherChild, otherUser, second.id);
    await db.runAsync('update assessments set programme_id = ? where id = ?', otherProgramme, other.id);
    expect((await repository.getQuestionResults({ userId, order: 'desc' })).map(r => r.id)).toEqual([second.id, first.id]);
    expect((await repository.getQuestionResults({ userId, order: 'asc' })).map(r => r.id)).toEqual([first.id, second.id]);
    expect((await repository.getQuestionResults({ userId, programmeId: otherProgramme })).map(r => r.id)).toEqual([other.id]);
    const [read] = await repository.getQuestionResults({
      userId, childId: otherChild, childIds: [otherChild], language: 'xh', sinceDate: '2026-10-19',
      questionCodes: ['letter_sounds'], recordedByUserId: otherUser,
    });
    expect(read.id).toBe(second.id);
    for (const filters of [{ childIds: [] }, { questionCodes: [] }, { language: 'zu' },
      { childId: uuid() }, { childIds: [uuid()] }, { questionCodes: ['word_reading'] },
      { recordedByUserId: uuid() }, { sinceDate: '2026-10-20' }]) {
      expect(await repository.getQuestionResults({ userId, ...filters })).toEqual([]);
    }
    const [sparse] = await repository.getQuestionResults({ userId, childId });
    expect(sparse.items.map(i => [i.position, i.is_correct, i.metadata.reached])).toEqual([[1, true, true], [4, false, false]]);
  });

  test('latest letter evidence skips newer skipped, empty and unreached families; date then creation time and language decide', async () => {
    const old = await save();
    const newest = await save();
    const xh = await save({ result: resultFor({ language: 'xh' }) });
    const skipped = await save({ result: resultFor({ items: [], stopped_reason: 'skipped_tired' }) });
    const unreached = await save({ result: resultFor({ items: [{ position: 0, item_key: 'a', prompt: 'a', is_correct: false, metadata: { reached: false } }] }) });
    const empty = await save({ result: resultFor({ items: [] }) });
    for (const [id, date, created] of [
      [old.id, '2026-10-18', '2026-10-20T23:00:00Z'],
      [newest.id, '2026-10-19', '2026-10-19T10:00:00Z'],
      [xh.id, '2026-10-19', '2026-10-19T11:00:00Z'],
      ...[skipped, unreached, empty].map(r => [r.id, '2026-10-20', '2026-10-20T12:00:00Z']),
    ]) await db.runAsync('update assessments set assessment_date = ?, created_at = ? where id = ?', date, created, id);
    expect((await repository.latestLetterResult({ userId, childId })).id).toBe(xh.id);
    expect((await repository.latestLetterResult({ userId, childId, language: 'en' })).id).toBe(newest.id);
    expect(await repository.latestLetterResult({ userId, childId, language: 'zu' })).toBeNull();
  });
});

const validPayload = () => {
  const id = uuid();
  return {
    id, user_id: uuid(), child_id: uuid(), programme_id: uuid(),
    assessment_type: 'letter_sounds', assessment_date: '2026-10-20',
    assessment_purpose: 'progress_check', question_code: 'letter_sounds', question_version: '2026.1',
    item_set_id: 'letter_sounds@2026.1.en', language: 'en', stopped_reason: 'completed',
    derived: {}, total_items: 1, score: 1, duration_ms: 1000,
    items: [{ id: uuid(), assessment_id: id, position: 2, item_key: 'a', is_correct: true, metadata: {} }],
  };
};
describe('assertSubmitShape RPC shape mirror', () => {
  test('a valid flat family, sparse positions, negative score and nullable optional fields pass', () => {
    const payload = validPayload();
    Object.assign(payload, { score: -1, capture_mode: null, notes: null, created_at: '2026-10-20T12:00:00.123+02:00',
      assessment_tool_id: uuid(), battery_run_id: null, assessment_window_id: null, grade_snapshot: '1', teacher_name_snapshot: null });
    Object.assign(payload.items[0], { prompt: null, response: 'a', created_at: null });
    expect(() => assertShape(payload)).not.toThrow();
    payload.items = []; payload.total_items = 0; payload.stopped_reason = 'skipped_other';
    delete payload.score; delete payload.duration_ms;
    expect(() => assertShape(payload)).not.toThrow();
  });
  test.each([null, [], 'family', new Date()])('rejects non-plain payload %p', value => {
    expect(() => assertShape(value)).toThrow(TypeError);
    expect(() => assertShape(value)).toThrow(/payload/);
  });
  test.each(['completed', 'timer', 'ea_ended', 'stop_rule', 'skipped_child_refused', 'skipped_tired',
    'skipped_time', 'skipped_age', 'skipped_prerequisite_unmet', 'skipped_other'])('accepts server stopped_reason %s', reason => {
    expect(() => assertShape({ ...validPayload(), stopped_reason: reason })).not.toThrow();
  });
  test('all optional values may be null and zero/false are preserved', () => {
    const payload = validPayload();
    for (const field of ['assessment_tool_id', 'battery_run_id', 'assessment_window_id', 'created_at',
      'capture_mode', 'notes', 'grade_snapshot', 'teacher_name_snapshot', 'score', 'duration_ms']) {
      payload[field] = null;
    }
    Object.assign(payload.items[0], { position: 0, is_correct: false, prompt: null, response: null, created_at: null });
    expect(() => assertShape(payload)).not.toThrow();
  });
  test.each(['2026-10-20T12:34Z', '2026-10-20T12:34:00+0200', '2026-10-20T24:00:00Z',
    '2026-10-20T12:34:00+15:59'])(
    'accepts parseable ISO timestamp %s for parent and item', createdAt => {
      const payload = validPayload();
      payload.created_at = createdAt;
      payload.items[0].created_at = createdAt;
      expect(() => assertShape(payload)).not.toThrow();
    }
  );
  const required = ['id', 'user_id', 'child_id', 'programme_id', 'assessment_type', 'assessment_date',
    'assessment_purpose', 'question_code', 'question_version', 'item_set_id', 'language', 'stopped_reason'];
  test.each(required.flatMap(field => [undefined, null, '', ' \t ', 3].map(value => [field, value])))('rejects required %s = %p', (field, value) => {
    const payload = { ...validPayload(), [field]: value };
    expect(() => assertShape(payload)).toThrow(TypeError);
    expect(() => assertShape(payload)).toThrow(field);
  });
  const optional = ['assessment_tool_id', 'battery_run_id', 'assessment_window_id', 'created_at',
    'capture_mode', 'notes', 'grade_snapshot', 'teacher_name_snapshot'];
  test.each(optional)('rejects a non-string optional %s', field => {
    expect(() => assertShape({ ...validPayload(), [field]: 42 })).toThrow(TypeError);
    expect(() => assertShape({ ...validPayload(), [field]: 42 })).toThrow(field);
  });
  const invalidCases = [
    ...['id', 'user_id', 'child_id', 'programme_id', 'assessment_tool_id', 'battery_run_id', 'assessment_window_id']
      .map(field => [field, p => { p[field] = 'not-a-uuid'; }]),
    ...['2026-02-30', '2026-13-01', '20/10/2026', '0000-01-01'].map(value => ['assessment_date', p => { p.assessment_date = value; }]),
    ...['invalid', '2026-02-30T10:00:00Z', '2026-10-20'].map(value => ['created_at', p => { p.created_at = value; }]),
    ...['2026-10-20T12:34:00+16:00', '2026-10-20T12:34:00-16:00', '2026-10-20T24:00:00.0001Z']
      .map(value => ['created_at', p => { p.created_at = value; }]),
    ['language', p => { p.language = 'EN'; }],
    ['stopped_reason', p => { p.stopped_reason = 'unknown'; }],
    ...[null, [], '{}', new Date()].map(value => ['derived', p => { p.derived = value; }]),
    ...[-1, 1.5, '1', null, 2, 2147483648].map(value => ['total_items', p => { p.total_items = value; }]),
    ...[1.5, '1', NaN, Infinity, 2147483648, -2147483649].map(value => ['score', p => { p.score = value; }]),
    ...[-1, 1.5, '1', 2147483648].map(value => ['duration_ms', p => { p.duration_ms = value; }]),
    ...[null, {}, '[]'].map(value => ['items', p => { p.items = value; }]),
    ['items[0]', p => { p.items[0] = []; }],
    ['items[0]', p => { p.items = new Array(1); }],
    ['items[0].id', p => { p.items[0].id = 'bad'; }],
    ['items[0].assessment_id', p => { p.items[0].assessment_id = uuid(); }],
    ['items[0].assessment_id', p => { p.items[0].assessment_id = 3; }],
    ...[-1, 1.5, '1', 2147483648].map(value => ['items[0].position', p => { p.items[0].position = value; }]),
    ['items[1].position', p => { p.items.push({ ...p.items[0], id: uuid() }); p.total_items = 2; }],
    ['items[1].id', p => { p.items.push({ ...p.items[0], position: 3 }); p.total_items = 2; }],
    ['items[1].id', p => { p.items.push({ ...p.items[0], id: p.items[0].id.toUpperCase(), position: 3 }); p.total_items = 2; }],
    ...['  ', 3, null].map(value => ['items[0].item_key', p => { p.items[0].item_key = value; }]),
    ...[0, 1, null].map(value => ['items[0].is_correct', p => { p.items[0].is_correct = value; }]),
    ...[undefined, null, [], '{}'].map(value => ['items[0].metadata', p => { p.items[0].metadata = value; }]),
    ...['prompt', 'response', 'created_at'].map(field => [`items[0].${field}`, p => { p.items[0][field] = 3; }]),
    ['items[0].created_at', p => { p.items[0].created_at = 'invalid'; }],
    ['items[0].created_at', p => { p.items[0].created_at = '2026-02-30T10:00:00Z'; }],
    ['items[0].created_at', p => { p.items[0].created_at = '2026-10-20T12:34:00+16:00'; }],
  ];
  test.each(invalidCases)('rejects malformed %s (#%#)', (field, mutate) => {
    const payload = validPayload(); mutate(payload);
    expect(() => assertShape(payload)).toThrow(TypeError);
    expect(() => assertShape(payload)).toThrow(field);
  });
});
