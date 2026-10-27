jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { runMigrations } from '../src/db/migrations';
import { createMigratedDatabase } from '../test-support/sqliteRepositoryTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createBatteryRunsRepository } from '../src/db/repositories/batteryRunsRepository';
import { batteryFor, bundledItemSetFor, questionComponentFor, skippedResult } from '../src/assessment-questions';
import { validateResult } from '../src/assessment-questions/contractTest/validateResult';
import { buildRunView } from '../src/utils/batteryRun';
import { assertSubmitShape } from '../src/services/assessmentFamilyPayload';
import { buildEgraResult } from '../test-support/egraResults';

// Read the PostgreSQL migration as a contract only; never execute it against SQLite or a server.
test('the literacy default migration advances only WelaPLUS 2024.1 and preserves Head Office choices', () => {
  const sql = fs.readFileSync(path.join(__dirname,
    '../supabase/migrations/20261026120000_welaplus_2026_1_default.sql'), 'utf8');
  const statements = sql.replace(/--[^\n]*/g, '').trim().split(';').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
  expect(statements).toEqual([
    "SET lock_timeout = '10s'",
    "SET statement_timeout = '60s'",
    "update public.programmes set default_battery_code = 'wela_plus_full', default_battery_version = '2026.1' where code = 'literacy' and default_battery_code = 'wela_plus_full' and default_battery_version = '2024.1'",
    'RESET statement_timeout',
    'RESET lock_timeout',
  ]);
});

describe('WelaPLUS 2026.1 first-row skips through real SQLite', () => {
  let db, userId, childId, programmeId, assessments, runs;
  const battery = batteryFor('wela_plus_full', '2026.1');
  const questionCodes = battery.questions.map(q => q.question_code);
  const itemSetFor = question => bundledItemSetFor(question.question_code, question.question_version, 'xh');
  const viewFor = run => buildRunView(battery, run, { activeProgrammeId: programmeId, childAssigned: true });

  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    userId = uuid(); childId = uuid(); programmeId = uuid();
    bindTestActor(db, userId);
    await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', programmeId, 'literacy', 'Literacy');
    await db.runAsync("insert into staff_programme_assignments (id, user_id, programme_id, assigned_at) values (?, ?, ?, '2026-01-15')", uuid(), userId, programmeId);
    await db.runAsync('insert into children (id, first_name, last_name) values (?, ?, ?)', childId, 'Test', 'Child');
    await db.runAsync("insert into child_ea_assignments (id, child_id, user_id, assigned_at) values (?, ?, ?, '2026-01-15')", uuid(), childId, userId);
    await db.runAsync("insert into child_programme_enrollments (id, child_id, programme_id, enrolled_at) values (?, ?, ?, '2026-01-15')", uuid(), childId, programmeId);
    const year = new Date().getFullYear();
    await db.runAsync('insert into academic_years (id, label, starts_on, ends_on, is_active) values (?, ?, ?, ?, 1)', uuid(), String(year), `${year}-01-01`, `${year}-12-31`);
    assessments = createAssessmentsRepository({ database: db });
    runs = createBatteryRunsRepository({ database: db });
  });
  afterEach(async () => { await db?.closeAsync(); });

  // Q2-Q5 have no reusable test builder. Capture their actual component output,
  // including item keys, reached metadata, story questions_asked and derived fields.
  function captureUntimed(question, firstRowWrong) {
    const set = itemSetFor(question);
    const { Component, extraProps } = questionComponentFor(question.question_code);
    const onComplete = jest.fn();
    const screen = render(<Component {...extraProps} language="xh" itemSet={set}
      instructions={question.instructions?.xh} onComplete={onComplete} />);
    try {
      fireEvent.press(screen.getByText(set.questions ? "I've finished reading" : 'Start'));
      const count = (set.questions ?? set.prompts).length;
      for (let position = 0; position < count; position += 1) {
        fireEvent.press(screen.getByText(firstRowWrong && position < 6 ? 'Incorrect' : 'Correct'));
      }
      fireEvent.press(screen.getByText('Finish'));
      expect(onComplete).toHaveBeenCalledTimes(1);
      return onComplete.mock.calls[0][0];
    } finally { screen.unmount(); }
  }

  test.each([
    { trigger: 'letter_sounds', width: 10, firstSkipped: 6, label: 'Letters first row wrong' },
    { trigger: 'word_reading', width: 8, firstSkipped: 7, label: 'Words first row wrong' },
    { trigger: 'wela_plus_letter_writing', width: 6, firstSkipped: 6, label: 'Letter writing first row wrong' },
  ])('$trigger saves, resumes labeled skips and finalizes with every pending family', async ({ trigger, width, firstSkipped, label }) => {
    const runId = uuid();
    const save = async (question, result) => {
      expect(validateResult(result, { stopRule: itemSetFor(question).stop_rule })).toEqual({ valid: true, errors: [] });
      await assessments.saveQuestionResult({ assessmentId: uuid(), userId, childId, batteryRunId: runId, result });
    };
    await runs.startRun({ id: runId, userId, childId, batteryCode: battery.battery_code,
      batteryVersion: battery.battery_version, language: 'xh' });
    expect(viewFor(await runs.getRunWithResults(runId))).toMatchObject({ writable: true, decidedCount: 0, autoSkips: [] });
    await expect(runs.finalizeRun(runId, { questionCodes })).rejects.toMatchObject({ code: 'RUN_INCOMPLETE' });

    const q1 = battery.questions[0];
    const q1Result = buildEgraResult(itemSetFor(q1), trigger === 'letter_sounds'
      ? { reason: 'stop_rule', attempted: 10 }
      : { reason: 'ea_ended', attempted: 10, correct: [0] });
    await save(q1, q1Result);

    const applyAutoSkips = async () => {
      // Same public read -> view -> skippedResult -> save sequence as BatteryOverviewScreen.
      const run = await runs.getRunWithResults(runId);
      const view = viewFor(run);
      expect(view.writable).toBe(true);
      expect(view.autoSkips.map(skip => skip.question_code)).toEqual(questionCodes.slice(firstSkipped - 1));
      for (const skip of view.autoSkips) {
        const question = battery.questions.find(q => q.question_code === skip.question_code);
        const result = skippedResult(question, run.language, skip.reason);
        await save(question, result);
        // A second callback gets a fresh id, but the Question decision is immutable.
        await expect(assessments.saveQuestionResult({ assessmentId: uuid(), userId, childId,
          batteryRunId: run.id, result })).rejects.toMatchObject({ code: 'QUESTION_ALREADY_DECIDED' });
      }
    };
    if (trigger === 'letter_sounds') await applyAutoSkips();
    else expect(viewFor(await runs.getRunWithResults(runId)).autoSkips).toEqual([]);

    for (const question of battery.questions.slice(1, 5)) {
      await save(question, captureUntimed(question, question.question_code === trigger));
    }
    if (trigger === 'word_reading') {
      expect(viewFor(await runs.getRunWithResults(runId))).toMatchObject({ autoSkips: [], next: battery.questions[5] });
      const q6 = battery.questions[5];
      await save(q6, buildEgraResult(itemSetFor(q6), { reason: 'stop_rule', attempted: 8 }));
    }
    if (trigger !== 'letter_sounds') await applyAutoSkips();

    // New repository instances read the persisted families, with no shared React snapshot.
    runs = createBatteryRunsRepository({ database: db });
    const resumed = await runs.getRunWithResults(runId);
    expect(resumed).toMatchObject({ battery_code: 'wela_plus_full', battery_version: '2026.1', language: 'xh' });
    expect(resumed.results.map(r => r.question_code).sort()).toEqual([...questionCodes].sort());
    const view = viewFor(resumed);
    expect(view).toMatchObject({ decidedCount: 12, totalCount: 12, eligibleToFinalize: true, next: null, autoSkips: [] });
    expect(view.rows.slice(0, firstSkipped - 1).every(row => row.state === 'done')).toBe(true);
    for (const row of view.rows.slice(firstSkipped - 1)) {
      expect(row).toMatchObject({ state: 'skipped', detail: label,
        skipCause: { kind: 'first_row', trigger } });
      expect(resumed.results.find(result => result.question_code === row.question.question_code))
        .toMatchObject({ stopped_reason: 'skipped_prerequisite_unmet', total_items: 0, items: [] });
    }
    const savedQ1 = resumed.results.find(r => r.question_code === 'letter_sounds');
    expect(savedQ1.items.map(item => item.metadata.reached)).toEqual(q1Result.items.map(item => item.metadata.reached));
    const savedTrigger = resumed.results.find(r => r.question_code === trigger);
    expect(savedTrigger.items.filter(item => item.position < width)).toHaveLength(width);
    expect(savedTrigger.items.filter(item => item.position < width).every(item => item.metadata.reached && !item.is_correct)).toBe(true);
    // The writing rule is based on six marks even when later letters are correct.
    if (trigger === 'wela_plus_letter_writing') expect(savedTrigger.score).toBeGreaterThan(0);

    await runs.finalizeRun(runId, { questionCodes });
    expect((await runs.getRunWithResults(runId)).status).toBe('completed');
    const outbox = await db.getAllAsync('select table_name, status, payload from sync_outbox');
    expect(outbox).toHaveLength(13);
    expect(outbox.every(row => row.status === 'pending')).toBe(true);
    const runFamilies = outbox.filter(row => row.table_name === 'battery_runs');
    expect(runFamilies).toHaveLength(1);
    expect(JSON.parse(runFamilies[0].payload)).toMatchObject({ id: runId, status: 'completed' });
    const questionFamilies = outbox.filter(row => row.table_name === 'assessments').map(row => JSON.parse(row.payload));
    expect(questionFamilies.map(family => family.question_code).sort()).toEqual([...questionCodes].sort());
    for (const family of questionFamilies) {
      expect(() => assertSubmitShape(family)).not.toThrow();
      expect(family).toMatchObject({ battery_run_id: runId, programme_id: programmeId, user_id: userId });
    }
  });
});
