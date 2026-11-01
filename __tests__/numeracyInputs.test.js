global.__MASI_NO_DEFAULT_HANDLE__ = true;
jest.mock('expo-updates', () => ({ channel: null }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { requestOpen, resetHandleRegistryForTests } from '../src/session/signedInHandle';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { MATHS_EVIDENCE_CODES } from '../src/utils/assessmentRegistry';
import { getEgmaAssessment } from '../content/egma';
import { getCurriculum } from '../content/numeracy-curriculum';
import { confirmNumeracyProgramme } from '../src/services/numeracyProgramme';
import { rememberProgrammeSubject, isKnownMaths } from '../src/utils/programmeSubject';
import { getProgrammeById } from '../src/db/repositories/domainRepositoryUtils';
import { loadKnownSteps, loadNumeracyCompleteness, numeracyHistoryForGroup,
  loadNumeracyLessonInputs, numeracyPlanInput } from '../src/numeracyLesson/inputs/numeracyInputs';

let handle, repositories, services, dir;
const curriculum = getCurriculum();
const userId = '11111111-1111-4111-8111-111111111111';
const write = task => handle.withTransaction(task);
const base = () => ({ programmeId: 'programme-b', academicYear: { id: 'year-2026', starts_on: '2026-01-15', ends_on: '2026-12-15' },
  sessions: [], sessionHistoryCoveredChildIds: new Set(['c1']) });
const known = (childIds = ['c1'], extra = {}) => loadKnownSteps({ repositories, userId, childIds, curriculum, ...extra });
const result = async (id, extra = {}) => write(async db => {
  const row = { date: '2026-06-01', programme: 'programme-b', version: 'masi-egma-en-2026-1', ...extra };
  await db.runAsync(`insert into assessments (id, user_id, child_id, programme_id, assessment_type,
    assessment_date, question_code, question_version, stopped_reason, sync_status)
    values (?, ?, 'c1', ?, 'maths_read_numbers', ?, 'maths_read_numbers', ?, 'completed', 'synced')`,
  id, userId, row.programme, row.date, row.version);
  for (let i = 0; i < 3; i++) await db.runAsync(`insert into assessment_items
    (id, assessment_id, position, item_key, is_correct, metadata, sync_status) values (?, ?, ?, ?, 1, ?, 'synced')`,
  `${id}-${i}`, id, i, String(i), JSON.stringify({ skill: 'read_numbers', band: 10, reached: true }));
});
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-numeracy-inputs-'));
  handle = await requestOpen({ userId, openDatabase: async name => createBetterSqliteTestDatabase(path.join(dir, name), { honorQueryOnly: true }) });
  repositories = handle.repositories; services = handle.services;
  await write(async db => {
    await seedCoreData(db, { includeStaffProgrammeAssignment: false });
    await db.runAsync("insert into staff_programme_assignments (id, user_id, programme_id, assigned_at) values ('spa', '11111111-1111-4111-8111-111111111111', 'programme-b', '2026-01-15')");
    for (const id of ['c1', 'c2', 'c3']) {
      await db.runAsync("insert into children (id, first_name, last_name, sync_status) values (?, 'Test', 'Child', 'synced')", id);
      await db.runAsync("insert into child_ea_assignments (id, child_id, user_id, sync_status) values (?, ?, '11111111-1111-4111-8111-111111111111', 'synced')", `ea-${id}`, id);
    }
  });
});
afterEach(async () => {
  jest.restoreAllMocks(); await resetHandleRegistryForTests(); fs.rmSync(dir, { recursive: true, force: true });
});

test('MATHS_EVIDENCE_CODES is every EGMA question code once', () => {
  const codes = getEgmaAssessment('masi-egma-en-2026-1-draft').questions.map(q => q.questionCode);
  expect(MATHS_EVIDENCE_CODES).toHaveLength(17);
  expect([...MATHS_EVIDENCE_CODES].sort()).toEqual([...new Set(codes)].sort());
  expect(Object.isFrozen(MATHS_EVIDENCE_CODES)).toBe(true);
});
test('maths evidence results stay inside the academic year and programme', async () => {
  await result('before', { date: '2026-01-14' }); await result('first', { date: '2026-01-15' });
  await result('last', { date: '2026-12-15' }); await result('after', { date: '2026-12-16' });
  await result('other', { programme: 'programme-a' });
  expect((await repositories.assessments.getMathsEvidenceResults({ userId, childIds: ['c1'] })).map(r => r.id)).toEqual(['first', 'last']);
  expect(await repositories.assessments.getMathsEvidenceResults({ userId, childIds: [] })).toEqual([]);
  expect(await repositories.assessments.getMathsEvidenceResults({ userId, academicYear: null })).toEqual([]);
});
test('confirmNumeracyProgramme returns the id only for an active maths programme', async () => {
  expect(await confirmNumeracyProgramme({ handle, userId })).toBe('programme-b');
  expect(await getProgrammeById(await handle.getReader(), 'programme-b')).toEqual({ id: 'programme-b', code: 'numeracy' });
  await write(async db => {
    expect(await getProgrammeById(db, 'missing')).toBeNull();
    await db.runAsync("update staff_programme_assignments set programme_id = 'programme-a'");
  });
  expect(await confirmNumeracyProgramme({ handle, userId })).toBeNull();
  await write(db => db.runAsync("update staff_programme_assignments set ended_at = '2026-11-01'"));
  expect(await confirmNumeracyProgramme({ handle, userId })).toBeNull();
});
test('confirmNumeracyProgramme ignores cached maths after a move to literacy', async () => {
  rememberProgrammeSubject(handle, { code: 'numeracy' });
  await write(db => db.runAsync("update staff_programme_assignments set programme_id = 'programme-a'"));
  expect(await confirmNumeracyProgramme({ handle, userId })).toBeNull();
  expect(isKnownMaths(handle)).toBe(true);
  const error = new Error('read failed');
  jest.spyOn(handle.repositories.programmes, 'getAll').mockRejectedValue(error);
  let caught; try { await confirmNumeracyProgramme({ handle, userId }); } catch (e) { caught = e; }
  expect(caught).toBe(error);
});
test('a draft EGMA result loads but gives no known step', async () => {
  await result('draft', { version: 'masi-egma-en-2026-1-draft' });
  expect(await repositories.assessments.getMathsEvidenceResults({ userId })).toHaveLength(1);
  expect((await known()).get('c1')).toEqual(new Map());
});
test('a final-version result and a tick combine with implied steps', async () => {
  await result('final');
  await repositories.skillMastery.setSkillMastery({ childId: 'c1', stepKey: 'add.10', confirmed: true });
  expect((await known()).get('c1')).toEqual(new Map([
    ['read_numbers.5', 'implied'], ['read_numbers.10', 'assessment'], ['add.5', 'implied'], ['add.10', 'ticked'],
  ]));
});
test('a child with no rows still gets an empty map', async () => {
  await result('final');
  const loaded = await known(['c1', 'c3']);
  expect(loaded.has('c3')).toBe(true); expect(loaded.get('c3')).toEqual(new Map());
});
test('group history keeps only this group\'s numeracy sessions', () => {
  const taught = [{ slot: 'activity', step_key: 'add.5', activity: 'Add' }];
  const session = { id: 's1', group_id: 'g1', session_date: '2026-06-01', created_at: 'stamp', activities: { numeracy: { taught } } };
  expect(numeracyHistoryForGroup([session, { ...session, group_id: 'g2' }, { ...session, activities: { lesson: {} } },
    { ...session, activities: { numeracy: { taught: null } } }], 'g1')).toEqual([{ id: 's1', date: '2026-06-01', createdAt: 'stamp', taught }]);
});
test('planner input marks history incomplete when one present child is uncovered', () => {
  const loaded = { knownByChild: new Map(), completeByChild: { ticks: { c1: true, c2: true }, evidence: { c1: true, c2: false } } };
  const input = numeracyPlanInput({ base: base(), loaded, groupId: 'g1', presentChildIds: ['c1', 'c2', 'c1'], lessonDate: '2026-11-01', curriculum });
  expect(input).toEqual({ curriculum, knownByChild: loaded.knownByChild, presentChildIds: ['c1', 'c2'], history: [],
    lessonDate: '2026-11-01', activityCardCount: 2, complete: { history: false, ticks: true, evidence: false } });
});
test('planner history and its completeness come from one base', () => {
  const loaded = { knownByChild: new Map(), completeByChild: { ticks: { c1: true, c2: true }, evidence: { c1: true, c2: true } } };
  const old = base(), newer = { ...base(), sessionHistoryCoveredChildIds: new Set(['c1', 'c2']),
    sessions: [{ id: 'new', group_id: 'g1', session_date: '2026-11-01', created_at: 'stamp', activities: { numeracy: { taught: [] } } }] };
  const make = b => numeracyPlanInput({ base: b, loaded, groupId: 'g1', presentChildIds: ['c1', 'c2'], lessonDate: '2026-11-01' });
  expect(make(old).history).toEqual([]); expect(make(old).complete.history).toBe(false);
  expect(make(newer).history.map(s => s.id)).toEqual(['new']); expect(make(newer).complete.history).toBe(true);
});
test('lesson inputs read completeness before known steps and do not read sessions', async () => {
  const order = [];
  const tickCoverage = jest.spyOn(services.assessmentHistory, 'skillMasteryCompletenessByChild').mockImplementation(async () => { order.push('coverage'); return { c1: true }; });
  jest.spyOn(repositories.skillMastery, 'getSkillMastery').mockImplementation(async () => { order.push('ticks'); return []; });
  const sessionRead = jest.spyOn(repositories.sessions, 'getSessions');
  const loaded = await loadNumeracyLessonInputs({ handle, repositories, services, base: base(), participantChildIds: ['c1', 'c1'] });
  expect(order).toEqual(['coverage', 'ticks']); expect(tickCoverage).toHaveBeenCalledWith({ childIds: ['c1'] });
  expect(loaded.knownByChild.get('c1')).toEqual(new Map()); expect(loaded.completeByChild.ticks).toEqual({ c1: true });
  expect(sessionRead).not.toHaveBeenCalled();
  expect(await loadNumeracyCompleteness({ services, childIds: ['c1'], programmeId: 'programme-b', academicYear: base().academicYear }))
    .toEqual({ ticks: { c1: true }, evidence: { c1: false } });
});
