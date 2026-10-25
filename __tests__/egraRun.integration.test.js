jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
import { v4 as uuid } from 'uuid';
import { runMigrations } from '../src/db/migrations';
import { createMigratedDatabase } from '../test-support/sqliteRepositoryTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createBatteryRunsRepository } from '../src/db/repositories/batteryRunsRepository';
import { EGRA_FORMS, adaptEgraForm, egraBatteryFor, egraFormFor } from '../src/assessment-questions/egra';
import { validateResult } from '../src/assessment-questions/contractTest/validateResult';
import { assertSubmitShape, toSubmitArgs } from '../src/services/assessmentFamilyPayload';
import { computeAssessmentMastery } from '../src/utils/letterMastery';
import { buildEgraResult } from '../test-support/egraResults';
import { batteryFor, bundledItemSetFor } from '../src/assessment-questions';

test.each(EGRA_FORMS)('$title starts, saves four host-resolved results and finalizes with pending outbox families in real SQLite', async form => {
  const battery = batteryFor('egra', form.id);
  expect(battery).toBe(egraBatteryFor('egra', form.id));
  const runId = uuid();
  await runs.startRun({ id: runId, userId, childId, batteryCode: 'egra', batteryVersion: form.id, language: battery.fixedLanguage });
  for (const question of battery.questions) {
    const set = bundledItemSetFor(question.question_code, question.question_version, battery.fixedLanguage);
    const result = buildEgraResult(set, { correct: [0],
      responses: ['correct', 'incorrect', 'correct'], notReached: 2 });
    expect(validateResult(result, { stopRule: set.stop_rule }).valid).toBe(true);
    await assessments.saveQuestionResult({ assessmentId: uuid(), userId, childId, batteryRunId: runId, result });
  }
  const resumed = await createBatteryRunsRepository({ database: db }).getRunWithResults(runId);
  expect(resumed.results).toHaveLength(4);
  expect(resumed.language).toBe(form.languageCode);
  expect(resumed.results.find(row => row.question_code === 'reading_comprehension'))
    .toMatchObject({ score: 2, total_items: 5, derived: { questions_asked: 3 } });
  await runs.finalizeRun(runId, {
    questionCodes: egraBatteryFor('egra', form.id).questions.map(question => question.question_code),
  });
  expect((await runs.getRunWithResults(runId)).status).toBe('completed');
  const outbox = await db.getAllAsync('select table_name, status, payload from sync_outbox');
  expect(outbox).toHaveLength(5);
  expect(outbox.filter(row => row.table_name === 'battery_runs')).toHaveLength(1);
  const families = outbox.filter(row => row.table_name === 'assessments');
  expect(families).toHaveLength(4);
  expect(outbox.every(row => row.status === 'pending')).toBe(true);
  for (const row of families) expect(() => assertSubmitShape(JSON.parse(row.payload))).not.toThrow();
});

let db, userId, childId, programmeId, assessments, runs;
beforeEach(async () => {
  db = await createMigratedDatabase(runMigrations);
  userId = uuid(); childId = uuid(); programmeId = uuid();
  bindTestActor(db, userId);
  await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', programmeId, 'literacy', 'Literacy');
  await db.runAsync("insert into staff_programme_assignments (id, user_id, programme_id, assigned_at) values (?, ?, ?, '2026-01-15')", uuid(), userId, programmeId);
  await db.runAsync('insert into children (id, first_name, last_name) values (?, ?, ?)', childId, 'Test', 'Child');
  const year = new Date().getFullYear();
  await db.runAsync('insert into academic_years (id, label, starts_on, ends_on, is_active) values (?, ?, ?, ?, 1)', uuid(), String(year), `${year}-01-01`, `${year}-12-31`);
  assessments = createAssessmentsRepository({ database: db });
  runs = createBatteryRunsRepository({ database: db });
});
afterEach(async () => { await db?.closeAsync(); });

test('every form and section validates and saves a complete immutable family through real SQLite', async () => {
  for (const form of EGRA_FORMS) {
    for (const set of Object.values(adaptEgraForm(form).itemSets)) {
      const result = buildEgraResult(set);
      expect(validateResult(result)).toEqual({ valid: true, errors: [] });
      await assessments.saveQuestionResult({ assessmentId: uuid(), userId, childId, result });
    }
  }
  const rows = await db.getAllAsync("select payload, status from sync_outbox where table_name = 'assessments'");
  expect(rows).toHaveLength(52);
  for (const row of rows) {
    const family = JSON.parse(row.payload);
    expect(() => assertSubmitShape(family)).not.toThrow();
    expect(toSubmitArgs(family).p_items).toHaveLength(family.total_items);
    expect(row.status).toBe('pending');
  }
});

test('English FAL 2 resumes four decided Questions, finalizes offline and supplies letter evidence', async () => {
  const { form, itemSets } = adaptEgraForm(egraFormFor('dbe-egra-en-fal-2-v1'));
  const runId = uuid();
  await runs.startRun({ id: runId, userId, childId, batteryCode: 'egra', batteryVersion: form.id, language: 'en' });
  const results = [
    buildEgraResult(itemSets.letter_sounds, { reason: 'stop_rule', attempted: form.letters.columns }),
    buildEgraResult(itemSets.word_reading, { reason: 'timer', attempted: 9, correct: [0, 1, 4] }),
    buildEgraResult(itemSets.oral_reading, { reason: 'ea_ended', attempted: 12, correct: [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11], durationMs: 30000 }),
    buildEgraResult(itemSets.reading_comprehension, { responses: ['correct', 'incorrect', 'correct'], notReached: 2 }),
  ];
  const ids = [];
  for (const result of results) {
    expect(validateResult(result, { stopRule: itemSets[result.question_code].stop_rule }).valid).toBe(true);
    const id = uuid(); ids.push(id);
    await assessments.saveQuestionResult({ assessmentId: id, userId, childId, batteryRunId: runId, result });
  }
  runs = createBatteryRunsRepository({ database: db });
  assessments = createAssessmentsRepository({ database: db });
  const resumed = await runs.getRunWithResults(runId);
  expect(resumed).toMatchObject({ battery_code: 'egra', battery_version: form.id, language: 'en' });
  expect(resumed.results).toHaveLength(4);
  for (const [i, id] of ids.entries()) {
    const saved = resumed.results.find(result => result.id === id);
    expect(saved.items.map(({ position, item_key, prompt, is_correct, metadata, response }) => ({ position, item_key, prompt, is_correct, metadata, ...(response === null ? {} : { response }) }))).toEqual(results[i].items.map(item => ({ ...item, metadata: item.metadata ?? {} })));
    expect(saved.derived).toEqual(results[i].derived);
  }
  try {
    await assessments.saveQuestionResult({ assessmentId: uuid(), userId, childId, batteryRunId: runId, result: results[0] });
    throw new Error('duplicate should have been rejected');
  } catch (error) { expect(error.code).toBe('QUESTION_ALREADY_DECIDED'); }
  // Plan 3: finalize requires every battery Question decided.
  // From the battery, as the host does, so this also proves the saved results cover it.
  await runs.finalizeRun(runId, {
    questionCodes: egraBatteryFor('egra', form.id).questions.map(question => question.question_code),
  });
  expect((await runs.getRunWithResults(runId)).status).toBe('completed');
  const outbox = await db.getAllAsync('select * from sync_outbox');
  expect(outbox).toHaveLength(5);
  expect(outbox.filter(row => row.table_name === 'battery_runs')).toHaveLength(1);
  const families = outbox.filter(row => row.table_name === 'assessments');
  expect(families).toHaveLength(4);
  expect(outbox.every(row => row.status === 'pending')).toBe(true);
  for (const row of families) {
    const family = JSON.parse(row.payload);
    assertSubmitShape(family);
    expect(toSubmitArgs(family).p_items).toHaveLength(family.total_items);
  }
  const latest = await assessments.latestLetterResult({ userId, childId, language: 'en' });
  expect(latest.id).toBe(ids[0]);
  expect(computeAssessmentMastery(latest, Array.from('abcdefghijklmnopqrstuvwxyz'))).toEqual(new Set());

  // A later complete EGRA letter attempt proves repeated reached letters must all be correct.
  const prompts = itemSets.letter_sounds.rows.flat();
  const repeated = prompts.find(letter => prompts.filter(p => p.toLowerCase() === letter.toLowerCase()).length > 1).toLowerCase();
  const wrong = prompts.findIndex(letter => letter.toLowerCase() === repeated);
  const correct = prompts.map((_, i) => i).filter(i => i !== wrong);
  const later = buildEgraResult(itemSets.letter_sounds, { correct });
  const evidenceId = uuid();
  await assessments.saveQuestionResult({ assessmentId: evidenceId, userId, childId, result: later });
  const evidence = await assessments.latestLetterResult({ userId, childId, language: 'en' });
  expect(evidence.id).toBe(evidenceId);
  const mastered = computeAssessmentMastery(evidence, Array.from('abcdefghijklmnopqrstuvwxyz'));
  expect(mastered.has(repeated)).toBe(false);
  expect(mastered.size).toBe(new Set(prompts.map(p => p.toLowerCase())).size - 1);
});
