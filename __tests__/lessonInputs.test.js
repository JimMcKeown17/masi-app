global.__MASI_NO_DEFAULT_HANDLE__ = true;
jest.mock('expo-updates', () => ({ channel: null }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { requestOpen, resetHandleRegistryForTests } from '../src/session/signedInHandle';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { serverFamily } from '../test-support/assessmentHistoryFixtures';
import { loadKnownLetters } from '../src/lessonPlan/inputs/knownLetters';
import * as domainReads from '../src/db/repositories/domainRepositoryUtils';
import * as pickerInputs from '../src/lessonPlan/inputs/lessonInputs';
import { loadLessonBase, loadPickerRanking, loadPickerLetters, loadLessonParticipants, presentLessonInput } from '../src/lessonPlan/inputs/lessonInputs';
import { computeLessonPlan, rankGroups } from '../src/lessonPlan/engine';
import * as lessonClasses from '../src/lessonPlan/engine/lessonClass';
import * as groupEngine from '../src/lessonPlan/engine/groups';
import { getPack } from '../src/lessonPlan/packs';
import { packIndexFor } from '../src/lessonPlan/inputs/packIndexCache';
import * as previewContent from '../src/lessonPlan/packs/previewContent';
import { PEDAGOGICAL_ORDERS } from '../src/utils/assessmentRegistry';

const today = '2026-10-22';
const USER = '11111111-1111-4111-8111-111111111111';
let handle, repositories, services, dir, statements, transport;
const write = task => handle.withTransaction(task);
const addChild = (id, classId = 'class-1') => write(async db => {
  await db.runAsync("insert into children (id, first_name, last_name, class_id, reading_level, created_by, sync_status) values (?, ?, 'Child', ?, 'Letter Knowledge', ?, 'synced')", id, id === 'c1' ? 'Amahle' : 'Lulu', classId, USER);
  await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, assigned_at, sync_status) values (?, ?, ?, '2026-01-15', 'synced')", `ea-${id}`, USER, id);
  await db.runAsync("insert into child_programme_enrollments (id, child_id, programme_id, enrolled_at, sync_status) values (?, ?, 'programme-a', '2026-01-15', 'synced')", `enrol-${id}`, id);
  await db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, sync_status) values (?, ?, ?, 'year-2026', '2026-01-15', 'synced')", `class-${id}`, id, classId);
});
const addGroup = (id, name, childIds, classId = null) => write(async db => {
  await db.runAsync("insert into groups (id, name, programme_id, class_id, created_by, sync_status) values (?, ?, 'programme-a', ?, ?, 'synced')", id, name, classId, USER);
  await db.runAsync("insert into group_ea_assignments (id, group_id, ea_user_id, programme_id, assigned_at, sync_status) values (?, ?, ?, 'programme-a', '2026-01-15', 'synced')", `ea-${id}`, id, USER);
  for (const childId of childIds) await db.runAsync("insert into child_group_memberships (id, child_id, group_id, joined_at, sync_status) values (?, ?, ?, '2026-01-15', 'synced')", `${id}-${childId}`, childId, id);
});
const completeWalks = async () => {
  const childIds = (await repositories.children.getChildren()).map(child => child.id);
  for (const [scope, windowStart] of [
    [`session_history_pull:${USER}:programme-a`, '2026-01-15'],
    [`assessment_history_pull:${USER}:programme-a`, '2026-01-15'],
    [`letter_mastery_pull:${USER}`, null],
  ]) await repositories.syncState.setPullState(scope, { cursor: JSON.stringify({
    complete: true, lastFailureAt: null, windowStart, rescanChildIds: childIds,
  }) });
};
const roster = async () => {
  const [groups, children, childrenGroups] = await Promise.all([
    repositories.groups.getGroups({ userId: handle.userId }), repositories.children.getMyChildren(handle.userId),
    repositories.groups.getVisibleChildrenGroups({ userId: handle.userId }),
  ]);
  return { groups, children, childrenGroups, getChildrenInGroup: groupId => children.filter(child => childrenGroups.some(
    member => member.group_id === groupId && member.child_id === child.id && !member.removed_at
  )) };
};
const lesson = (extra = {}) => ({ groupId: 'g2', upNextGroupId: 'g2', languageCode: 'en',
  packId: null, isEcd: false, presentChildIds: ['c1', 'c2'], ...extra });
const base = () => loadLessonBase({ handle, repositories, today });
const input = async (extra = {}) => {
  const selected = lesson(extra);
  const loadedBase = await base();
  const loaded = await loadLessonParticipants({ handle, repositories, services, programmeId: loadedBase.programmeId,
    languageCode: selected.languageCode, packId: selected.packId, participantChildIds: selected.presentChildIds });
  return presentLessonInput({ base: loadedBase, lesson: selected, loaded, presentChildIds: selected.presentChildIds });
};
const fullPicker = async options => {
  const ranking = await loadPickerRanking({ handle, repositories, ...options });
  const letters = await loadPickerLetters({ handle, repositories, services, base: ranking.base, ranking });
  return { ...ranking, historyComplete: letters.historyComplete,
    rows: ranking.rows.map(row => ({ ...row, ...letters.lettersByGroup[row.groupId] })) };
};
const picker = async () => fullPicker({ today, ...await roster() });
const result = async (n, childId, letters, extra = {}) => {
  const family = { ...serverFamily(n, { childId, items: letters.length }), user_id: USER,
    programme_id: 'programme-a', language: 'xh', ...extra };
  family.items.forEach((item, i) => { item.prompt = letters[i]; });
  await write(async db => {
    await db.runAsync(`insert into assessments
      (id, user_id, child_id, programme_id, assessment_type, assessment_date, question_code,
       question_version, item_set_id, language, stopped_reason, total_items, created_at, updated_at, sync_status)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
    family.id, family.user_id, family.child_id, family.programme_id, family.assessment_type, family.assessment_date,
    family.question_code, family.question_version, family.item_set_id, family.language, family.stopped_reason,
    family.total_items, family.created_at, family.updated_at);
    for (const item of family.items) await db.runAsync(`insert into assessment_items
      (id, assessment_id, position, item_key, prompt, response, is_correct, metadata, sync_status)
      values (?, ?, ?, ?, ?, ?, ?, ?, 'synced')`, item.id, family.id, item.position, item.item_key,
    item.prompt, item.response, item.is_correct ? 1 : 0, JSON.stringify(item.metadata));
  });
};
const confirm = (childId, letter, language = 'xh', confirmed = true) => repositories.mastery.setLetterMastery({ childId, letter, language, confirmed });
const saveSession = (id, childId, extra = {}) => repositories.sessions.saveSession({
  id, user_id: USER, programme_id: 'programme-a', session_date: today,
  children_ids: [childId], activities: { lesson: { version: 1 } }, synced: false,
  created_at: `${today}T08:00:00Z`, ...extra,
});

beforeEach(async () => {
  statements = [];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-lesson-inputs-'));
  transport = jest.fn(async () => { throw new Error('Lesson inputs must stay offline'); });
  handle = await requestOpen({ userId: USER, fetchImpl: transport, openDatabase: async name => {
    const db = createBetterSqliteTestDatabase(path.join(dir, name), { honorQueryOnly: true });
    for (const method of ['getFirstAsync', 'getAllAsync']) {
      const original = db[method];
      db[method] = async (...args) => { statements.push(args[0]); return original(...args); };
    }
    return db;
  } });
  repositories = handle.repositories;
  services = handle.services;
  await write(async db => {
    await seedCoreData(db);
    await db.runAsync('update staff_programme_assignments set user_id = ?', USER);
    await db.runAsync("update classes set home_language = 'English', sync_status = 'synced'");
    await db.runAsync("insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, assigned_at, sync_status) values ('held', 'class-1', ?, 'programme-a', '2026-01-15', 'synced')", USER);
  });
  await addChild('c1'); await addChild('c2');
  await addGroup('g2', 'Group 2', ['c1']); await addGroup('g10', 'Group 10', ['c2']);
  await completeWalks();
});
afterEach(async () => {
  expect(transport).not.toHaveBeenCalled();
  jest.restoreAllMocks();
  await resetHandleRegistryForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('known letters come from the current-year result and confirmations', async () => {
  await result(1, 'c1', ['s'], { assessment_date: '2025-12-01' });
  await result(2, 'c1', ['k'], { assessment_date: '2026-02-01' });
  await result(3, 'c1', ['O', 'm'], { assessment_date: '2026-03-01' });
  await result(4, 'c2', ['o', 'm']);
  await result(5, 'c1', ['z'], { language: 'en', assessment_date: '2026-10-01' });
  await confirm('c1', 'l'); await confirm('c1', 'a'); await confirm('c1', 'b', 'xh', false);
  await confirm('c2', 'a', 'en');
  const assessments = jest.spyOn(repositories.assessments, 'getLetterEvidenceResults');
  const mastery = jest.spyOn(repositories.mastery, 'getLetterMastery');
  expect(await loadKnownLetters({ repositories, userId: handle.userId, childIds: ['c1', 'c2'], languageCode: 'xh' }))
    .toEqual({ c1: ['a', 'o', 'l', 'm'], c2: ['o', 'm'] });
  expect(assessments).toHaveBeenCalledTimes(1);
  expect(assessments).toHaveBeenCalledWith({ userId: USER, childIds: ['c1', 'c2'] });
  expect(mastery).toHaveBeenCalledTimes(1);
  expect(mastery).toHaveBeenCalledWith({ childIds: ['c1', 'c2'], language: 'xh' });
});

test('reads do not grow with the number of children', async () => {
  const ids = ['c1', 'c2'];
  for (let i = 3; i <= 20; i += 1) { ids.push(`c${i}`); await addChild(`c${i}`); }
  for (const [i, id] of ids.entries()) await result(i + 1, id, ['a'], { language: 'en' });
  await completeWalks();
  const loadedBase = await base();
  const measure = async task => { statements.length = 0; await task(); return statements.length; };
  const known = childIds => loadKnownLetters({ repositories, userId: handle.userId, childIds, languageCode: 'en' });
  const load = participantChildIds => loadLessonParticipants({ handle, repositories, services,
    programmeId: loadedBase.programmeId, languageCode: 'en', packId: null, participantChildIds });
  const data = await roster();
  const loadPicker = childIds => fullPicker({ base: loadedBase,
    ...data, groups: [data.groups[0]], getChildrenInGroup: () => data.children.filter(child => childIds.includes(child.id)) });
  for (const run of [known, load, loadPicker]) {
    const two = await measure(() => run(ids.slice(0, 2)));
    const twenty = await measure(() => run(ids));
    expect(two).toBeGreaterThan(0);
    expect(twenty).toBe(two);
  }
});

test('isZulu or no language gives no letters and no reads', async () => {
  for (const languageCode of ['zu', null]) {
    statements.length = 0;
    expect(await loadKnownLetters({ repositories, userId: handle.userId, childIds: ['c1', 'c2'], languageCode }))
      .toEqual({ c1: [], c2: [] });
    expect(statements).toEqual([]);
  }
});

test('a child in an English group and an isiXhosa group gets each group\'s own letters', async () => {
  await write(async db => {
    await db.runAsync("insert into classes (id, school_id, name, home_language, grade, academic_year_id) values ('xh-class', 'school-1', 'Xhosa', 'isiXhosa', '1', 'year-2026')");
    await db.runAsync("update groups set class_id = 'class-1' where id = 'g2'");
    await db.runAsync("update groups set class_id = 'xh-class' where id = 'g10'");
    await db.runAsync("update child_group_memberships set child_id = 'c1' where group_id = 'g10'");
  });
  await confirm('c1', 'a', 'en'); await confirm('c1', 'm', 'en');
  await confirm('c1', 'o', 'xh');
  const resolveClass = jest.spyOn(lessonClasses, 'resolveLessonClass');
  const rank = jest.spyOn(groupEngine, 'rankGroups');
  const model = await picker();
  expect(resolveClass).toHaveBeenCalledTimes(2); // Once per group, across loading and shaping.
  expect(rank).toHaveBeenCalledTimes(3); // One ordering pass, then one per language.
  for (const row of model.rows) {
    const loaded = await input({ groupId: row.groupId, languageCode: row.languageCode, presentChildIds: ['c1'] });
    const plan = computeLessonPlan(loaded);
    expect(row.nextLetters).toEqual(plan.suggested_letters);
    expect(row.lettersReason).toBe(plan.reason);
    expect(loaded.presentChildren[0].knownLetters).toEqual(row.languageCode === 'en' ? ['a', 'm'] : ['o']);
  }
  expect(model.rows[0].nextLetters).not.toEqual(model.rows[1].nextLetters);
});

test('participants come from SQLite, including a handed-over child and a fresh reading level saved offline', async () => {
  const staleRoster = await roster();
  await repositories.children.updateChild('c1', { reading_level: '3 Letter Blends' });
  await write(async db => {
    await db.runAsync("update child_ea_assignments set unassigned_at = '2026-10-21' where child_id = 'c2'");
    await db.runAsync("update children set history_reference = 1, hidden_at = '2026-10-21' where id = 'c2'");
  });
  const loaded = await input({ presentChildIds: ['c2', 'c1'] });
  expect(staleRoster.children.find(child => child.id === 'c1').reading_level).toBe('Letter Knowledge');
  expect(loaded.presentChildren).toEqual([
    { id: 'c2', readingLevel: 'Letter Knowledge', knownLetters: [], historyComplete: true, masteryComplete: false },
    { id: 'c1', readingLevel: '3 Letter Blends', knownLetters: [], historyComplete: true, masteryComplete: true },
  ]);
});

test('engine sessions include another EA\'s session for my child and my pending lesson, not another programme or last year', async () => {
  await saveSession('other-ea', 'c1', { user_id: 'user-2', synced: true });
  await saveSession('pending', 'c2');
  await saveSession('other-programme', 'c1', { programme_id: 'programme-b', synced: true });
  await saveSession('last-year', 'c1', { session_date: '2025-12-01', synced: true });
  const loaded = await input();
  expect(loaded.sessions.map(session => session.id).sort()).toEqual(['other-ea', 'pending']);
  expect(loaded.sessions.find(session => session.id === 'other-ea').children_ids).toEqual(['c1']);
  expect(loaded.sessions.find(session => session.id === 'pending').sync_status).toBe('pending');
  expect(computeLessonPlan(loaded).reason).toBe('ok');
});

test('picker rows follow rankGroups order; a never-seen group is Up next; a group taught today is not', async () => {
  await saveSession('today', 'c1');
  const model = await picker();
  const loadedBase = await base();
  const expected = rankGroups({ ...loadedBase, groups: [
    { id: 'g2', name: 'Group 2', displayNumber: 2, memberIds: ['c1'], languageCode: 'en', pack: getPack('en') },
    { id: 'g10', name: 'Group 10', displayNumber: 10, memberIds: ['c2'], languageCode: 'en', pack: getPack('en') },
  ], children: {} });
  expect(model.upNextGroupId).toBe('g10');
  expect(model.rows.map(row => row.groupId)).toEqual(expected.rows.map(row => row.groupId));
  expect(model.rows.find(row => row.groupId === 'g2')).toMatchObject({ taughtToday: true, lastSeenOn: today });
});

test('a child in a class the EA does not hold still resolves its class and language', async () => {
  await write(async db => {
    await db.runAsync("insert into classes (id, school_id, name, grade, home_language, academic_year_id) values ('unheld', 'school-1', 'Unheld', 'ECD', 'isiXhosa', 'year-2026')");
    await db.runAsync("update children set class_id = 'unheld' where id = 'c1'");
    await db.runAsync("update child_class_memberships set class_id = 'unheld' where child_id = 'c1'");
  });
  expect((await repositories.classes.getClasses({ userId: USER })).map(row => row.id)).not.toContain('unheld');
  const row = (await picker()).rows.find(group => group.groupId === 'g2');
  expect(row).toMatchObject({ classId: 'unheld', languageCode: 'xh', isEcd: true });
  expect(row.nextLetters.length).toBeGreaterThan(0);
  expect((await input({ presentChildIds: ['c1'], languageCode: 'xh' })).presentChildren[0].masteryComplete).toBe(false);
});

test('a mixed-class group has classId null and no letters until the class is chosen', async () => {
  await write(async db => {
    await db.runAsync("insert into classes (id, school_id, name, grade, home_language, academic_year_id) values ('other', 'school-1', 'Other', '1', 'isiXhosa', 'year-2026')");
    await db.runAsync("update children set class_id = 'other' where id = 'c2'");
    await db.runAsync("update child_group_memberships set group_id = 'g2' where child_id = 'c2'");
  });
  expect((await picker()).rows.find(row => row.groupId === 'g2'))
    .toMatchObject({ classId: null, languageCode: null, nextLetters: [], lettersReason: 'no_pack' });
  expect((await input({ languageCode: 'en' })).pack).toBe(getPack('en'));
});

test('lesson base reports missing dependencies and honours an explicit programme', async () => {
  expect(await loadLessonBase({ handle, repositories, today, programmeId: 'programme-b' }))
    .toEqual({ today, academicYear: expect.objectContaining({ id: 'year-2026', starts_on: '2026-01-15' }),
      academicYearStart: '2026-01-15', programmeId: 'programme-b', sessions: [] });
  await write(db => db.runAsync('update staff_programme_assignments set ended_at = assigned_at'));
  expect(await base()).toEqual({ missing: 'programme' });
  await write(db => db.runAsync('update academic_years set is_active = 0'));
  expect(await loadLessonBase({ handle, repositories, today, programmeId: 'programme-a' })).toEqual({ missing: 'academic_year' });
});

test('lesson input uses a pinned pack and respects preview eligibility and unsupported languages', async () => {
  jest.spyOn(previewContent, 'isPreviewContentEnabled').mockReturnValue(true);
  expect((await input({ languageCode: 'xh', packId: 'isixhosa-interim-letters-v1' })).pack.id).toBe('isixhosa-interim-letters-v1');
  const loadedPreview = await input({ languageCode: 'xh' });
  expect(loadedPreview.pack.id).toBe('isixhosa-candidates-preview-v1');
  expect(loadedPreview.packIndex).toBe(packIndexFor(loadedPreview.pack));
  previewContent.isPreviewContentEnabled.mockReturnValue(false);
  expect((await input({ languageCode: 'xh', packId: 'isixhosa-candidates-preview-v1' })).pack).toBeNull();
  for (const languageCode of ['zu', null]) {
    const loaded = await input({ languageCode });
    expect(loaded.pack).toBeNull(); expect(loaded.alphabet).toBeNull();
    expect(loaded.presentChildren.map(child => child.knownLetters)).toEqual([[], []]);
  }
  expect((await input({ languageCode: 'af' })).alphabet).toEqual(PEDAGOGICAL_ORDERS.af);
});


test('participant facts include absentees and project present children in screen order without reads', async () => {
  await confirm('c2', 'm', 'en');
  const loadedBase = await base();
  const loaded = await loadLessonParticipants({ handle, repositories, services, programmeId: loadedBase.programmeId,
    languageCode: 'en', packId: null, participantChildIds: ['c1', 'c2'] });
  expect(loaded.participants.map(child => child.id)).toEqual(['c1', 'c2']);
  expect(loaded.participants[1].knownLetters).toEqual(['m']);
  statements.length = 0;
  const projected = presentLessonInput({ base: loadedBase, lesson: lesson(), loaded, presentChildIds: ['c2', 'c1'] });
  expect(projected.presentChildren).toEqual([loaded.participants[1], loaded.participants[0]]);
  expect(projected.packIndex).toBe(loaded.packIndex);
  expect(presentLessonInput({ base: loadedBase, lesson: lesson(), loaded, presentChildIds: ['c1'] }).presentChildren)
    .toEqual([loaded.participants[0]]);
  expect(() => presentLessonInput({ base: loadedBase, lesson: lesson(), loaded, presentChildIds: ['missing'] }))
    .toThrow('Lesson participant facts missing: missing');
  expect(statements).toEqual([]);
});

const seedPickerBudget = async () => {
  for (let i = 3; i <= 25; i += 1) await addChild(`c${i}`);
  await write(async db => {
    await db.runAsync('delete from child_group_memberships');
    await db.runAsync('delete from group_ea_assignments');
    await db.runAsync('delete from groups');
  });
  for (let i = 0; i < 8; i += 1) {
    const ids = Array.from({ length: 25 }, (_, n) => `c${n + 1}`).filter((_, n) => n % 8 === i);
    await addGroup(`budget-${i}`, `Group ${i + 1}`, ids, 'class-1');
  }
  for (let i = 1; i <= 25; i += 1) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await result(i * 3 + attempt, `c${i}`, Array.from({ length: 60 }, (_, n) => n % 2 ? 'm' : 'a'),
        { language: 'en', assessment_date: `2026-0${attempt + 2}-01` });
    }
  }
  for (let i = 0; i < 80; i += 1) await saveSession(`budget-session-${i}`, `c${i % 25 + 1}`,
    { session_date: '2026-10-19' });
  await completeWalks();
  return roster();
};
const countPickerReads = async task => {
  const reader = await handle.getReader();
  const calls = [];
  const countedReader = Object.fromEntries(['getAllAsync', 'getFirstAsync', 'runAsync'].map(method => [method,
    async (...args) => {
      const value = await reader[method](...args);
      calls.push({ sql: args[0], rows: Array.isArray(value) ? value.length : method === 'getFirstAsync' && value ? 1 : 0 });
      return value;
    },
  ]));
  const spy = jest.spyOn(handle, 'getReader').mockResolvedValue(countedReader);
  try {
    const value = await task();
    return { value, statements: calls.length, rows: calls.reduce((sum, call) => sum + call.rows, 0), calls };
  } finally { spy.mockRestore(); }
};

test('picker ranking stays within six statements and shares programme and year with letters', async () => {
  const data = await seedPickerBudget();
  const programme = jest.spyOn(domainReads, 'getActiveProgrammeId');
  const year = jest.spyOn(domainReads, 'getActiveAcademicYear');
  const ranked = await countPickerReads(() => pickerInputs.loadPickerRanking({ handle, repositories, today, ...data }));
  expect(ranked.statements).toBeLessThanOrEqual(6);
  expect(ranked.value.rows).toHaveLength(8);
  expect(ranked.value.rows.every(row => row.nextLetters === null)).toBe(true);
  expect(ranked.calls.some(call => /from (children|classes|assessments|assessment_items|letter_mastery|sync_state)\b/i.test(call.sql))).toBe(false);
  const letters = await countPickerReads(() => pickerInputs.loadPickerLetters({ handle, repositories, services,
    base: ranked.value.base, ranking: ranked.value }));
  expect(Object.keys(letters.value.lettersByGroup)).toHaveLength(8);
  expect(letters.value.historyComplete).toBe(true);
  expect(programme).toHaveBeenCalledTimes(1);
  expect(year).toHaveBeenCalledTimes(1);
  console.log('D5 split picker', { ranking: { statements: ranked.statements, rows: ranked.rows },
    letters: { statements: letters.statements, rows: letters.rows } });
});
