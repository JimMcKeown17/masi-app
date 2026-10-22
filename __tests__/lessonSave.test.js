global.__MASI_NO_DEFAULT_HANDLE__ = true;
jest.mock('expo-updates', () => ({ channel: null }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { requestOpen, resetHandleRegistryForTests } from '../src/session/signedInHandle';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { lessonDraftInput, MON, WED } from '../test-support/lessonSaveFixtures';
import { saveLesson, LessonSaveError } from '../src/services/lessonSave';
import { loadKnownLetters } from '../src/lessonPlan/inputs/knownLetters';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { masteryRow, deferred } from '../test-support/assessmentHistoryServer';
import { hasActiveProgrammeAssignment } from '../src/db/repositories/domainRepositoryUtils';
import { buildSessionTypeFields } from '../src/utils/sessionTypeResolver';

const USER = '11111111-1111-4111-8111-111111111111';
const T0 = '2026-10-19T08:00:00.000Z', T2 = '2026-10-19T10:00:00.000Z';
let handle, repositories, draft, writer, dir, statements, transport;
const write = task => handle.withTransaction(task);
const read = async (sql, ...params) => (await handle.getReader()).getAllAsync(sql, ...params);
const snapshot = async () => {
  const tables = await read("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name");
  return JSON.stringify(Object.fromEntries(await Promise.all(tables.map(async ({ name }) => [name, await read(`select * from "${name}" order by rowid`)]))));
};
const save = extra => saveLesson({ handle, draft, sessionTypeFields: buildSessionTypeFields({ jobTitlesCache: [] }), nowIso: WED, ...extra });
const rejectSave = async (code, extra) => {
  const before = await snapshot();
  const start = statements.length;
  let caught;
  try { await save(extra); } catch (error) { caught = error; }
  expect(caught).toBeDefined(); expect(caught).toBeInstanceOf(LessonSaveError); expect(caught.code).toBe(code);
  if (['NO_CHILDREN', 'NO_PLAN', 'PROGRAMME_NOT_ACTIVE', 'CHILD_NOT_WRITABLE', 'CHANGES_NOT_WRITABLE'].includes(code)) {
    expect(statements.slice(start).filter(row => row.method === 'runAsync')).toEqual([]);
  }
  expect(await snapshot()).toBe(before);
  return caught;
};
const noChanges = () => ({ ...draft, tracker_changes: {}, reading_level_changes: {} });
const endDirect = childId => write(txn => txn.runAsync('update child_ea_assignments set unassigned_at = ? where child_id = ?', MON, childId));
const classGrant = async (childId = 'c1') => write(async txn => {
  await txn.runAsync("insert or ignore into class_ea_assignments (id, class_id, ea_user_id, programme_id, assigned_at, sync_status) values ('class-grant', 'class-1', ?, 'programme-b', '2026-01-15', 'pending')", USER);
  await txn.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, sync_status) values (?, ?, 'class-1', 'year-2026', '2026-01-15', 'pending')", `class-${childId}`, childId);
});
const mark = (confirmed, changedAt = T2) => repositories.mastery.setLetterMastery({ childId: 'c1', letter: 'a', language: 'en', confirmed, changedAt, programmeId: 'programme-a' });
const masterySnapshot = () => Promise.all([
  read('select * from letter_mastery order by id'), read("select * from sync_outbox where table_name = 'letter_mastery' order by id"),
]);
beforeEach(async () => {
  statements = [];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-lesson-save-'));
  transport = jest.fn(async () => { throw new Error('saveLesson must not make a request'); });
  handle = await requestOpen({ userId: USER, fetchImpl: transport, openDatabase: async (name, options) => {
    const db = createBetterSqliteTestDatabase(path.join(dir, name), { honorQueryOnly: true });
    if (!options?.useNewConnection) writer = db;
    for (const method of ['getFirstAsync', 'getAllAsync', 'runAsync']) {
      const original = db[method];
      db[method] = async (sql, ...params) => { statements.push({ method, sql }); return original(sql, ...params); };
    }
    return db;
  } });
  repositories = handle.repositories;
  await write(async txn => {
    await seedCoreData(txn);
    await txn.runAsync('update staff_programme_assignments set user_id = ?', USER);
    for (const id of ['c1', 'c2']) {
      await txn.runAsync("insert into children (id, first_name, last_name, class_id, created_by, reading_level, sync_status) values (?, 'Test', 'Child', 'class-1', 'head-office', '2 Letter Blends', 'synced')", id);
      await txn.runAsync("insert into child_ea_assignments (id, user_id, child_id, assigned_at, sync_status) values (?, ?, ?, '2026-01-15', 'synced')", `direct-${id}`, USER, id);
    }
    await txn.runAsync("insert into groups (id, name, programme_id, class_id, created_by, sync_status) values ('group-1', 'Group 1', 'programme-a', 'class-1', ?, 'synced')", USER);
    await txn.runAsync("insert into group_ea_assignments (id, group_id, ea_user_id, programme_id, assigned_at, sync_status) values ('group-grant', 'group-1', ?, 'programme-a', '2026-01-15', 'synced')", USER);
  });
  draft = await repositories.lessonDrafts.create(lessonDraftInput());
});
afterEach(async () => {
  expect(transport).not.toHaveBeenCalled();
  jest.restoreAllMocks(); await resetHandleRegistryForTests(); fs.rmSync(dir, { recursive: true, force: true });
});

test('session, attendees with the group id, class id, marks and outbox commit, and the draft is gone', async () => {
  statements.length = 0;
  expect(await save()).toEqual({ sessionId: draft.session_id });
  const firstReads = statements.filter(row => row.method !== 'runAsync');
  expect(firstReads[0].sql).toMatch(/staff_programme_assignments/);
  expect(firstReads[1].sql).toMatch(/child_ea_assignments/);
  expect(statements.findIndex(row => row.method === 'runAsync')).toBeGreaterThan(1);
  const saved = (await repositories.sessions.getSessions({ userId: USER }))[0];
  expect({ ...saved, children_ids: [...saved.children_ids].sort() }).toMatchObject({
    id: draft.session_id, group_id: 'group-1', class_id: 'class-1', children_ids: ['c1', 'c2'],
    activities: { child_reading_levels: { c1: '3 Letter Blends', c2: '2 Letter Blends' } },
  });
  expect(await read('select child_id, group_id from session_attendees order by child_id')).toEqual([
    { child_id: 'c1', group_id: 'group-1' }, { child_id: 'c2', group_id: 'group-1' },
  ]);
  expect(await read('select letter, language, changed_at from letter_mastery')).toEqual([{ letter: 'a', language: 'en', changed_at: MON }]);
  expect((await read('select table_name from sync_outbox')).map(row => row.table_name).sort())
    .toEqual(['children', 'letter_mastery', 'session_attendees', 'session_attendees', 'sessions']);
  expect(await repositories.lessonDrafts.getActive()).toBeNull();
});

test('a failed save keeps the draft and its session id; the retry inserts once with that id', async () => {
  await writer.execAsync(`create temp trigger refuse_mark_outbox before insert on sync_outbox
    when new.table_name = 'letter_mastery' begin select raise(abort, 'mark outbox failed'); end;`);
  const before = await snapshot(); let caught;
  try { await save(); } catch (error) { caught = error; }
  expect(caught).toMatchObject({ message: 'mark outbox failed', code: 'SQLITE_CONSTRAINT_TRIGGER' });
  expect(await snapshot()).toBe(before);
  expect((await repositories.lessonDrafts.getActive()).session_id).toBe(draft.session_id);
  await writer.execAsync('drop trigger refuse_mark_outbox');
  expect(await save()).toEqual({ sessionId: draft.session_id });
  expect(await read('select id from sessions')).toEqual([{ id: draft.session_id }]);
  await rejectSave('ALREADY_SAVED');
});

test('an untouched old draft leaves a newer pulled reading level alone and snapshots it', async () => {
  await write(txn => txn.runAsync("update children set reading_level = 'Word Reading' where id = 'c1'"));
  await save({ draft: noChanges() });
  expect(await read("select reading_level, sync_status from children where id = 'c1'"))
    .toEqual([{ reading_level: 'Word Reading', sync_status: 'synced' }]);
  expect((await repositories.sessions.getSessions({ userId: USER }))[0].activities.child_reading_levels.c1).toBe('Word Reading');
  expect(await read("select * from sync_outbox where table_name = 'children'")).toEqual([]);
});
test('a reading-level change equal to SQLite does not enqueue a child update', async () => {
  await save({ draft: { ...draft, tracker_changes: {}, reading_level_changes: { c1: '2 Letter Blends' } } });
  expect(await read("select * from sync_outbox where table_name = 'children'")).toEqual([]);
});
test('absent children neither block authority nor receive changes', async () => {
  await endDirect('c1');
  await save({ draft: { ...draft, attendance: { ...draft.attendance, absentChildIds: ['c1'] } } });
  expect(await read('select child_id from session_attendees')).toEqual([{ child_id: 'c2' }]);
  expect(await read("select * from sync_outbox where table_name in ('children', 'letter_mastery')")).toEqual([]);
});
test('a Monday mark saved on Wednesday keeps its tap time when nothing newer is stored', async () => {
  await save();
  expect((await read('select changed_at from letter_mastery'))[0].changed_at).toBe(MON);
  expect(JSON.parse((await read("select payload from sync_outbox where table_name = 'letter_mastery'"))[0].payload).changed_at).toBe(MON);
});
test('no present children: NO_CHILDREN and nothing written', async () => {
  await rejectSave('NO_CHILDREN', { draft: { ...draft, attendance: { ...draft.attendance, absentChildIds: ['c1', 'c2'] } } });
});
test('a missing plan: NO_PLAN and nothing written', async () => { await rejectSave('NO_PLAN', { draft: { ...draft, plan: null } }); });
test('group row gone from the phone: GROUP_MISSING, nothing written, draft kept', async () => {
  await write(txn => txn.runAsync("delete from groups where id = 'group-1'"));
  await rejectSave('GROUP_MISSING');
});
test('an archived group still takes the lesson', async () => {
  await write(txn => txn.runAsync("update groups set archived_at = ? where id = 'group-1'", MON));
  expect(await save()).toEqual({ sessionId: draft.session_id });
});
test('a present child with no direct, class or group access: CHILD_NOT_WRITABLE, nothing written, draft kept', async () => {
  await endDirect('c1');
  expect((await rejectSave('CHILD_NOT_WRITABLE')).childIds).toEqual(['c1']);
});
test('direct assignment ended but class access remains: attendance saves; marks for them give CHANGES_NOT_WRITABLE', async () => {
  await endDirect('c1'); await classGrant();
  expect((await rejectSave('CHANGES_NOT_WRITABLE')).childIds).toEqual(['c1']);
  expect(await save({ draft: { ...draft, tracker_changes: {} } })).toEqual({ sessionId: draft.session_id });
});
test('the same child with marks and level change cleared: the lesson saves with them as an attendee', async () => {
  await endDirect('c1'); await classGrant(); await save({ draft: noChanges() });
  expect((await read('select child_id from session_attendees')).map(row => row.child_id).sort()).toEqual(['c1', 'c2']);
});
test('access removed after the screen check but before the writer lock: Save rolls back, draft kept', async () => {
  const entered = deferred(), release = deferred();
  const roster = write(async txn => { entered.resolve(); await release.promise;
    await txn.runAsync("update child_ea_assignments set unassigned_at = ? where child_id = 'c1'", MON); });
  await entered.promise;
  expect((await repositories.children.getWriteAuthority({ userId: USER, childIds: ['c1'] })).c1.attend).toBe(true);
  const saving = save().then(value => ({ value }), error => ({ error }));
  release.resolve(); await roster;
  const before = await snapshot();
  expect((await saving).error).toMatchObject({ name: 'LessonSaveError', code: 'CHILD_NOT_WRITABLE', childIds: ['c1'] });
  expect(await snapshot()).toBe(before);
});

test('a newer pulled correction (synced) beats an older draft mark; a newer unsent one too', async () => {
  await repositories.mastery.saveHistoryPage([masteryRow('c1', 'a', T2, { confirmed: false })], { scope: 'fixture', pullState: { cursor: '{}' } });
  await mark(false, T2); // Another unsent letter is also protected below.
  await repositories.mastery.setLetterMastery({ childId: 'c1', letter: 'm', language: 'en', confirmed: false, changedAt: T2, programmeId: 'programme-a' });
  await write(txn => txn.runAsync("update letter_mastery set sync_status = 'synced' where letter = 'a'"));
  await write(txn => txn.runAsync("delete from sync_outbox where record_id in (select id from letter_mastery where letter = 'a')"));
  const before = await masterySnapshot();
  const changes = { c1: { ...draft.tracker_changes.c1, m: { mastered: true, languageCode: 'en', madeAt: MON } } };
  await save({ draft: { ...draft, tracker_changes: changes } });
  expect(await masterySnapshot()).toEqual(before);
  expect(await loadKnownLetters({ repositories, userId: USER, childIds: ['c1'], languageCode: 'en' })).toEqual({ c1: [] });
});
test('a newer terminal correction and its outbox payload are unchanged after saving an older draft mark', async () => {
  await mark(false);
  await write(async txn => {
    await txn.runAsync("update letter_mastery set sync_status = 'terminal'");
    await txn.runAsync("update sync_outbox set status = 'terminal'");
  });
  const before = await masterySnapshot(); await save(); expect(await masterySnapshot()).toEqual(before);
});
test('T0 accepted, T1 draft mark, T2 refused, a pull restores T0: saving the draft leaves T2\'s payload and terminal status unchanged', async () => {
  const accepted = masteryRow('c1', 'a', T0);
  await repositories.mastery.saveHistoryPage([accepted], { scope: 'fixture', pullState: { cursor: '{}' } });
  const correction = await mark(false);
  const { supabaseClient } = createSupabaseMock({ rpcResults: {
    set_letter_mastery: { data: null, error: { code: 'MA001', message: 'correction refused' } },
  } });
  const engine = createOutboxSyncEngine({ database: handle, supabaseClient, enqueueRequest: task => task(),
    getAuthSession: async () => ({ data: { session: { user: { id: USER } } } }) });
  expect(await engine.syncAll()).toMatchObject({ totalTerminal: 1 });
  await repositories.mastery.saveHistoryPage([accepted], { scope: 'fixture', pullState: { cursor: '{}' } });
  expect((await read('select changed_at from letter_mastery'))[0].changed_at).toBe(T0);
  const before = await masterySnapshot(); await save(); expect(await masterySnapshot()).toEqual(before);
  const outbox = (await read("select status, payload from sync_outbox where table_name = 'letter_mastery'"))[0];
  expect(outbox.status).toBe('terminal');
  expect(JSON.parse(outbox.payload)).toMatchObject({ correction_id: correction.correction_id, changed_at: T2 });
});

test('getWriteAuthority matches the server rules for each of the three grant kinds and ended rows', async () => {
  await endDirect('c2'); await classGrant('c2');
  await write(async txn => {
    for (const id of ['c3', 'creator', 'ended', 'other']) await txn.runAsync(
      "insert into children (id, first_name, last_name, created_by) values (?, 'Test', 'Child', ?)", id, id === 'creator' ? USER : 'head-office');
    await txn.runAsync("insert into child_group_memberships (id, child_id, group_id, joined_at) values ('m3', 'c3', 'group-1', '2026-01-15')");
    await txn.runAsync("insert into child_ea_assignments (id, child_id, user_id, assigned_at, unassigned_at) values ('ended-ea', 'ended', ?, '2026-01-15', ?), ('other-ea', 'other', 'another-ea', '2026-01-15', null)", USER, MON);
  });
  const yes = { attend: true, deliver: true, level: true }, indirect = { attend: true, deliver: false, level: true }, no = { attend: false, deliver: false, level: false };
  expect(await repositories.children.getWriteAuthority({ userId: USER, childIds: ['c1', 'c2', 'c3', 'creator', 'ended', 'other', 'missing'] }))
    .toEqual({ c1: yes, c2: indirect, c3: indirect, creator: { ...no, level: true }, ended: no, other: no, missing: no });
  await write(async txn => {
    await txn.runAsync('update child_class_memberships set exited_at = ?', MON);
    await txn.runAsync('update child_group_memberships set removed_at = ?', MON);
  });
  expect(await repositories.children.getWriteAuthority({ userId: USER, childIds: ['c2', 'c3'] })).toEqual({ c2: no, c3: no });
  await write(async txn => {
    await txn.runAsync('update child_class_memberships set exited_at = null');
    await txn.runAsync('update child_group_memberships set removed_at = null');
    await txn.runAsync('update class_ea_assignments set unassigned_at = ?', MON);
    await txn.runAsync('update group_ea_assignments set unassigned_at = ?', MON);
  });
  expect(await repositories.children.getWriteAuthority({ userId: USER, childIds: ['c2', 'c3'] })).toEqual({ c2: no, c3: no });
});
test('direct assignment ended, class or group access remains: a reading-level change still saves', async () => {
  await endDirect('c1'); await endDirect('c2'); await classGrant('c1');
  await write(txn => txn.runAsync("insert into child_group_memberships (id, child_id, group_id, joined_at) values ('m2', 'c2', 'group-1', '2026-01-15')"));
  await save({ draft: { ...draft, tracker_changes: {}, reading_level_changes: { c1: 'Word Reading', c2: '3 Letter Blends' } } });
  expect(await read('select id, reading_level from children order by id')).toEqual([{ id: 'c1', reading_level: 'Word Reading' }, { id: 'c2', reading_level: '3 Letter Blends' }]);
});
test('an old-programme draft whose staff assignment ended: PROGRAMME_NOT_ACTIVE, nothing written, draft kept', async () => {
  await write(async txn => {
    await txn.runAsync('update staff_programme_assignments set ended_at = ?', MON);
    await txn.runAsync("insert into staff_programme_assignments (id, user_id, programme_id, assigned_at) values ('new-programme', ?, 'programme-b', ?)", USER, MON);
  });
  expect(await write(txn => hasActiveProgrammeAssignment(txn, USER, 'programme-b'))).toBe(true);
  await rejectSave('PROGRAMME_NOT_ACTIVE');
});
test('discard finds no draft: ALREADY_SAVED and nothing written', async () => {
  await repositories.lessonDrafts.discard(draft.id); await rejectSave('ALREADY_SAVED');
});
test('an equal-time draft mark is applied; only strictly older marks are skipped', async () => {
  await mark(false, MON); await save();
  expect((await read('select confirmed from letter_mastery'))[0].confirmed).toBe(1);
});
test('getCorrectionTimes keeps a newer row when its outbox is older and scopes by language', async () => {
  await mark(false, T2);
  const xhosaTime = '2026-10-19T11:00:00.000Z';
  await repositories.mastery.setLetterMastery({ childId: 'c1', letter: 'a', language: 'xh', confirmed: true,
    changedAt: xhosaTime, programmeId: 'programme-a' });
  await write(txn => txn.runAsync(`update sync_outbox set payload = json_set(payload, '$.changed_at', ?)
    where table_name = 'letter_mastery' and json_extract(payload, '$.language') = 'en'`, T0));
  expect(await repositories.mastery.getCorrectionTimes({ childIds: ['c1'], language: 'en' })).toEqual({ c1: { a: T2 } });
  expect(await repositories.mastery.getCorrectionTimes({ childIds: ['c1'], language: 'xh' })).toEqual({ c1: { a: xhosaTime } });
  const before = await masterySnapshot(); await save(); expect(await masterySnapshot()).toEqual(before);
});
test.each(['pending', 'failed', 'in_flight', 'terminal'])('getCorrectionTimes includes a newer %s outbox payload and preserves microseconds', async status => {
  await mark(false, T0);
  const newer = '2026-10-19T09:00:00.000001+00:00';
  await write(txn => txn.runAsync("update sync_outbox set status = ?, payload = json_set(payload, '$.changed_at', ?) where table_name = 'letter_mastery'", status, newer));
  expect(await repositories.mastery.getCorrectionTimes({ childIds: ['c1', 'c2'], language: 'en' }))
    .toEqual({ c1: { a: newer }, c2: {} });
  const before = await masterySnapshot(); await save(); expect(await masterySnapshot()).toEqual(before);
});
