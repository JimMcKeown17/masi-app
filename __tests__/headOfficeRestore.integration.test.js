// Head Office `restore child` reaches the phone (lifecycle OTA, work order 6). After an EA's mistaken
// Delete child has been acknowledged, Head Office reopens in place exactly what the removal ended
// (work order 5). The phone must converge on its next normal pull, with no help from the EA.
// Real signed-in EA handle, real better-sqlite3, real repositories, lessonSave, sync engine and the
// handle's pull services (pullPreloadedChildData + persistPreloadedChildData, pullClassData); only
// the network is fake (test-support/lifecycleServer.js: the post-server-batch contract, its pull
// reads and its restore helper, under real supabase-js). Asserts the decided target behaviour:
// - a sole holder's child, removed with or without local history, comes back to My Children with
//   its class and group, stays writable, and keeps its history;
// - a co-held child this EA left comes back to this EA with their group;
// - a refused relationship INSERT stamped REMOVED_WITH_CHILD is never sent again after the restore,
//   blocks nothing, clears under the delivered-receipt rule, and the server's rows win on the phone.
global.__MASI_NO_DEFAULT_HANDLE__ = true;
jest.mock('expo-updates', () => ({ channel: null }));
jest.mock('expo-file-system/next', () => ({ Paths: { availableDiskSpace: 123, totalDiskSpace: 456 } }));
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(async () => ({ type: 'wifi', isConnected: true, isInternetReachable: true })),
  addEventListener: jest.fn(() => () => {}),
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { requestOpen, resetHandleRegistryForTests, setLatestAuthSession } from '../src/session/signedInHandle';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { lessonDraftInput, MON, WED } from '../test-support/lessonSaveFixtures';
import { saveLesson } from '../src/services/lessonSave';
import { buildSessionTypeFields } from '../src/utils/sessionTypeResolver';
import {
  childEaAssignmentDomainId, childProgrammeEnrollmentDomainId, classEaAssignmentDomainId, groupEaAssignmentDomainId,
} from '../src/db/repositories/domainRepositoryUtils';
import { createLifecycleServer } from '../test-support/lifecycleServer';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_EA = '22222222-2222-4222-8222-222222222222';
const HO = '99999999-9999-4999-8999-999999999999';
const SCHOOL = 'a0000000-0000-4000-8000-000000000001';
const PROG = 'a0000000-0000-4000-8000-000000000002';
const YEAR = 'a0000000-0000-4000-8000-000000000003';
const CLASS = 'a0000000-0000-4000-8000-000000000004';
const GROUP = 'a0000000-0000-4000-8000-000000000005';
const SPA = 'a0000000-0000-4000-8000-000000000006';
const NUMERACY = 'a0000000-0000-4000-8000-000000000007';
const C = 'c0000000-0000-4000-8000-000000000001';
const MEMBERSHIP = 'cb000000-0000-4000-8000-000000000001';
const CLASS_MEMBERSHIP = `cc${C.slice(2)}`;
const T_SEED = '2026-01-15T00:00:00.000Z';

let handle;
let repos;
let server;
let dir;
const read = async (sql, ...params) => (await handle.getReader()).getAllAsync(sql, ...params);
const write = task => handle.withTransaction(task);
const sync = (options) => handle.services.syncEngine.syncAll(options);
const outbox = () => read('select id, table_name, record_id, operation, status, error_code from sync_outbox order by created_at, id');
const tick = () => jest.setSystemTime(Date.now() + 1000);
const elapseBackoff = () => jest.setSystemTime(Date.now() + 20 * 60 * 1000);
const statusItems = async () => (await handle.services.syncEngine.getSyncStatus()).needsAttentionItems;
const dataRequests = (from = 0) => server.summary(from).filter(line => !line.includes('report_mobile_support_incident'));
const writes = (from = 0) => dataRequests(from).filter(line => !line.startsWith('GET ') && !line.startsWith('rpc/get_reconcile'));

const seedBoth = async (rows) => {
  const DOMAIN = new Set(['classes', 'class_ea_assignments', 'groups', 'group_ea_assignments', 'children',
    'child_ea_assignments', 'child_programme_enrollments', 'child_class_memberships', 'child_group_memberships']);
  await write(async (txn) => {
    for (const [table, row, where = 'both'] of rows) {
      if (where === 'server') continue;
      const full = DOMAIN.has(table) ? { ...row, sync_status: 'synced' } : row;
      await txn.runAsync(
        `insert into ${table} (${Object.keys(full).join(', ')}) values (${Object.keys(full).map(() => '?').join(', ')})`,
        ...Object.values(full),
      );
    }
  });
  for (const [table, row, where = 'both'] of rows) {
    if (where !== 'local' && !['schools', 'programmes', 'academic_years'].includes(table)) server.seed(table, row);
  }
};

const baseRows = () => [
  ['schools', { id: SCHOOL, name: 'Masi Primary' }],
  ['programmes', { id: PROG, code: 'literacy', name: 'Literacy' }],
  ['programmes', { id: NUMERACY, code: 'numeracy', name: 'Numeracy' }],
  ['academic_years', { id: YEAR, label: '2026', starts_on: '2026-01-15', ends_on: '2026-12-15', is_active: 1 }],
  ['staff_programme_assignments', { id: SPA, user_id: USER, programme_id: PROG, school_id: SCHOOL, assigned_at: T_SEED }],
  ['classes', { id: CLASS, school_id: SCHOOL, name: 'Grade 1A', grade: '1', academic_year_id: YEAR, created_by: HO }],
  ['class_ea_assignments', {
    id: classEaAssignmentDomainId({ classId: CLASS, eaUserId: USER, programmeId: PROG }),
    class_id: CLASS, ea_user_id: USER, programme_id: PROG, assigned_at: T_SEED, created_by: HO,
  }],
  ['groups', { id: GROUP, name: 'Group 1', programme_id: PROG, class_id: CLASS, created_by: USER }],
  ['group_ea_assignments', {
    id: groupEaAssignmentDomainId({ groupId: GROUP }), group_id: GROUP, ea_user_id: USER, programme_id: PROG,
    assigned_at: T_SEED, created_by: USER,
  }],
];

// A child Head Office set up and this EA already holds (every row acknowledged). `group` adds the
// child to this EA's group; `otherEaClass` / `otherEaNumeracy` make another EA a co-holder through
// the class path or a direct numeracy assignment.
const serverChildRows = (childId, { group = false, otherEaClass = false, otherEaNumeracy = false } = {}) => [
  ['children', { id: childId, first_name: 'Thandi', last_name: 'Mokoena', class_id: CLASS, created_by: HO }],
  ['child_ea_assignments', {
    id: childEaAssignmentDomainId({ userId: USER, childId }), user_id: USER, child_id: childId, assigned_at: T_SEED, created_by: HO,
  }],
  ['child_programme_enrollments', {
    id: childProgrammeEnrollmentDomainId({ childId, programmeId: PROG }), child_id: childId, programme_id: PROG, enrolled_at: T_SEED, created_by: HO,
  }],
  ['child_class_memberships', {
    id: CLASS_MEMBERSHIP, child_id: childId, class_id: CLASS, academic_year_id: YEAR, enrolled_at: T_SEED, created_by: HO,
  }],
  ...(group ? [['child_group_memberships', {
    id: MEMBERSHIP, child_id: childId, group_id: GROUP, joined_at: T_SEED, created_by: USER,
  }]] : []),
  ...(otherEaClass ? [['class_ea_assignments', {
    id: classEaAssignmentDomainId({ classId: CLASS, eaUserId: OTHER_EA, programmeId: PROG }),
    class_id: CLASS, ea_user_id: OTHER_EA, programme_id: PROG, assigned_at: T_SEED, created_by: HO,
  }, 'server']] : []),
  ...(otherEaNumeracy ? [
    ['child_ea_assignments', {
      id: childEaAssignmentDomainId({ userId: OTHER_EA, childId }), user_id: OTHER_EA, child_id: childId, assigned_at: T_SEED, created_by: HO,
    }, 'server'],
    ['child_programme_enrollments', {
      id: childProgrammeEnrollmentDomainId({ childId, programmeId: NUMERACY }), child_id: childId, programme_id: NUMERACY, enrolled_at: T_SEED, created_by: HO,
    }, 'server'],
  ] : []),
];

const recordLesson = async (childId, { tick: withTick = true, lessonDate = '2026-10-19' } = {}) => {
  const base = lessonDraftInput();
  const draft = await repos.lessonDrafts.create(lessonDraftInput({
    programme_id: PROG, group_id: GROUP, class_id: CLASS, lesson_date: lessonDate,
    attendance: { childIds: [childId], absentChildIds: [], addedChildIds: [] },
    plan: { ...base.plan, present_child_ids: [childId], up_next_group_id: GROUP },
    tracker_changes: withTick ? { [childId]: { a: { mastered: true, languageCode: 'en', madeAt: MON } } } : {},
    reading_level_changes: {},
  }));
  return saveLesson({ handle, draft, sessionTypeFields: buildSessionTypeFields({ jobTitlesCache: [] }), nowIso: WED });
};

// The app's normal pull: the Classes pull and the roster pull, through the handle's services.
const pull = async () => {
  const classes = await handle.services.pullClasses();
  const roster = await handle.services.pullRoster();
  for (const result of [classes, roster]) {
    expect(result.reconcileAcknowledgments).toMatchObject({ ok: true, complete: true });
    expect(Object.entries(result.scopes).filter(([, scope]) => !scope.ok || scope.complete === false)).toEqual([]);
  }
  return roster;
};
const myChildren = async () => (await repos.children.getMyChildren(USER)).map(child => child.id);
const groupsOf = async childId => (await repos.groups.getVisibleChildrenGroups({ userId: USER }))
  .filter(row => row.child_id === childId).map(row => row.group_id);
const localChild = async () => (await read(
  'select archived_at, archived_by_user_id, archive_reason, first_name from children where id = ?', C,
))[0];
const openClassMemberships = async () => (await read(
  'select class_id from child_class_memberships where child_id = ? and exited_at is null', C,
)).map(row => row.class_id);
const syncPasses = async (forces) => {
  for (const force of forces) {
    elapseBackoff();
    await sync({ force });
  }
};
const serverOpen = (table, column) => server.all(table).filter(row => row.child_id === C && row[column] == null);

// The child is writable again: an edit and a new lesson (attendance and a tick) queue and upload.
const expectWritable = async () => {
  const attendeesBefore = server.all('session_attendees').filter(row => row.child_id === C).length;
  await repos.children.updateChild(C, { first_name: 'Thandeka' }, { actorUserId: USER });
  tick();
  await recordLesson(C, { lessonDate: '2026-10-20' });
  tick();
  const mark = server.log.length;
  await syncPasses([false, false]);
  expect(writes(mark).filter(line => !line.endsWith('-> ok'))).toEqual([]);
  expect((await outbox()).filter(row => row.error_code !== 'REMOVED_WITH_CHILD')).toEqual([]);
  expect(server.t('children').get(C).first_name).toBe('Thandeka');
  expect(server.all('session_attendees').filter(row => row.child_id === C)).toHaveLength(attendeesBefore + 1);
};

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: [
    'nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    'queueMicrotask', 'hrtime', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
    'requestIdleCallback', 'cancelIdleCallback',
  ] });
  jest.setSystemTime(new Date('2026-10-21T09:30:00.000Z'));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-ho-restore-'));
  server = createLifecycleServer({ actor: USER });
  setLatestAuthSession({ user: { id: USER }, access_token: 'test-token' });
  handle = await requestOpen({
    userId: USER, fetchImpl: server.fetchImpl,
    openDatabase: async (name) => createBetterSqliteTestDatabase(path.join(dir, name), { honorQueryOnly: true }),
  });
  repos = handle.repositories;
  // Reference data is already on the phone; only the roster pull is under test.
  await repos.localState.set('reference_data_complete_at', '2026-10-20T00:00:00.000Z');
  server.seed('academic_years', { id: YEAR, label: '2026', starts_on: '2026-01-15', ends_on: '2026-12-15', is_active: true });
});
afterEach(async () => {
  await resetHandleRegistryForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  jest.useRealTimers();
});

test('sole holder, child with local history: after a restore the next pull brings it back with its class and group, writable, history attached', async () => {
  await seedBoth([...baseRows(), ...serverChildRows(C, { group: true })]);
  await pull();
  expect(await myChildren()).toEqual([C]);
  expect(await groupsOf(C)).toEqual([GROUP]);

  await recordLesson(C);
  tick();
  expect(await repos.children.removeChild(C)).toBe(true);
  tick();
  expect(await localChild()).toMatchObject({ archive_reason: 'removed_by_ea', archived_by_user_id: USER });
  await syncPasses([false, false]);
  expect(await outbox()).toEqual([]);
  const removedAt = server.t('children').get(C).archived_at;
  expect(server.t('children').get(C)).toMatchObject({ archived_by_user_id: USER, archive_reason: 'removed_by_ea' });
  // Normal pulls after the removal keep the child gone.
  await pull();
  expect(await myChildren()).toEqual([]);

  expect(server.restoreChild({ eaUserId: USER, childId: C })).toMatchObject({ outcome: 'restored', removedAt, skipped: [] });
  tick();
  await pull();

  expect(await myChildren()).toEqual([C]);
  expect(await groupsOf(C)).toEqual([GROUP]);
  expect(await openClassMemberships()).toEqual([CLASS]);
  expect(await localChild()).toMatchObject({ archived_at: null, archived_by_user_id: null, archive_reason: null });
  // The history recorded before the removal is still on the phone, attached to the child.
  expect(await read('select child_id from session_attendees')).toEqual([{ child_id: C }]);
  expect((await read('select child_id, confirmed from letter_mastery')).map(row => row.child_id)).toEqual([C]);
  await expectWritable();
  // A second pull after the uploads changes nothing.
  await pull();
  expect(await myChildren()).toEqual([C]);
  expect(await groupsOf(C)).toEqual([GROUP]);
});

// A child added offline and deleted before its first upload: its INSERT is acknowledged while the
// removal is still queued, then the removal is acknowledged. Nothing is owed for it any more, so
// the next pull must be free to replace the phone's copy with the server's.
test('sole holder, child added offline and deleted before its first upload: after a restore the next pull brings it back', async () => {
  await seedBoth(baseRows());
  await repos.children.save({
    id: C, first_name: 'Thandi', last_name: 'Mokoena', class_id: CLASS, created_by: USER, synced: false,
  }, { actorUserId: USER });
  tick();
  await repos.groups.addChildToGroup({ id: MEMBERSHIP, child_id: C, group_id: GROUP, created_by: USER, synced: false });
  tick();
  await recordLesson(C);
  tick();
  expect(await repos.children.removeChild(C)).toBe(true);
  tick();
  await syncPasses([false, false, false]);
  expect(await outbox()).toEqual([]);
  expect(server.t('children').get(C)).toMatchObject({ archived_by_user_id: USER, archive_reason: 'removed_by_ea' });
  await pull();
  expect(await myChildren()).toEqual([]);

  server.restoreChild({ eaUserId: USER, childId: C });
  tick();
  await pull();

  expect(await localChild()).toMatchObject({ archived_at: null, archived_by_user_id: null, archive_reason: null });
  expect(await myChildren()).toEqual([C]);
  expect(await groupsOf(C)).toEqual([GROUP]);
  expect(await openClassMemberships()).toEqual([CLASS]);
  expect(await read('select child_id from session_attendees')).toEqual([{ child_id: C }]);
  await expectWritable();
});

test('sole holder, child without local history (deleted outright on the phone): the next pull after a restore brings it back', async () => {
  await seedBoth([...baseRows(), ...serverChildRows(C)]);
  await pull();
  expect(await myChildren()).toEqual([C]);

  expect(await repos.children.removeChild(C)).toBe(true);
  tick();
  expect(await read('select id from children where id = ?', C)).toEqual([]);
  expect((await outbox()).map(row => `${row.table_name}:${row.operation}`)).toEqual(['children:hard_delete']);
  await syncPasses([false]);
  expect(await outbox()).toEqual([]);
  expect(server.t('children').get(C).archived_by_user_id).toBe(USER);
  await pull();
  expect(await myChildren()).toEqual([]);

  server.restoreChild({ eaUserId: USER, childId: C });
  tick();
  await pull();

  expect(await myChildren()).toEqual([C]);
  expect(await openClassMemberships()).toEqual([CLASS]);
  expect(await localChild()).toMatchObject({ archived_at: null, archive_reason: null });
  await expectWritable();
});

test.each([
  ['a co-holder through the class (another EA holds the class)', { otherEaClass: true }],
  ['a co-holder in another programme (a numeracy EA also teaches them)', { otherEaNumeracy: true }],
])('co-held child this EA left, with %s: after a restore this EA gets it back with their group', async (_label, shape) => {
  await seedBoth([...baseRows(), ...serverChildRows(C, { group: true, ...shape })]);
  await pull();
  expect(await myChildren()).toEqual([C]);

  await recordLesson(C);
  tick();
  expect(await repos.children.removeChild(C)).toBe(true);
  tick();
  await syncPasses([false, false]);
  expect(await outbox()).toEqual([]);
  // The server's actor-scoped removal: this EA left; the child stays live for the other EA.
  expect(server.t('children').get(C).archived_at ?? null).toBeNull();
  expect(serverOpen('child_ea_assignments', 'unassigned_at').map(row => row.user_id))
    .toEqual(shape.otherEaNumeracy ? [OTHER_EA] : []);
  expect(serverOpen('child_group_memberships', 'removed_at')).toEqual([]);
  await pull();
  expect(await myChildren()).toEqual([]);
  expect(await groupsOf(C)).toEqual([]);

  const otherEaRowsBefore = JSON.stringify([server.all('child_ea_assignments'), server.all('class_ea_assignments')]
    .map(rows => rows.filter(row => (row.user_id || row.ea_user_id) === OTHER_EA)));
  expect(server.restoreChild({ eaUserId: USER, childId: C })).toMatchObject({ outcome: 'restored', skipped: [] });
  tick();
  await pull();

  expect(await myChildren()).toEqual([C]);
  expect(await groupsOf(C)).toEqual([GROUP]);
  expect(await localChild()).toMatchObject({ archived_at: null, archive_reason: null });
  expect(await read('select child_id from session_attendees')).toEqual([{ child_id: C }]);
  expect(JSON.stringify([server.all('child_ea_assignments'), server.all('class_ea_assignments')]
    .map(rows => rows.filter(row => (row.user_id || row.ea_user_id) === OTHER_EA)))).toBe(otherEaRowsBefore);
  await expectWritable();
});

test('a relationship INSERT refused before the removal and stamped REMOVED_WITH_CHILD: after a restore it is never sent, blocks nothing, clears by itself, and the server rows win', async () => {
  await repos.localState.set('support_auto_bundle_last_at', '2099-01-01T00:00:00.000Z');
  await seedBoth([...baseRows(), ...serverChildRows(C)]);
  await pull();
  // Offline, the EA adds the child to their group and records a lesson, then deletes the child.
  await repos.groups.addChildToGroup({ id: MEMBERSHIP, child_id: C, group_id: GROUP, created_by: USER, synced: false });
  tick();
  await recordLesson(C);
  tick();
  expect(await repos.children.removeChild(C)).toBe(true);
  tick();
  // The server refuses the membership INSERT once; receipts cannot be delivered yet.
  let refusedOnce = false;
  let receiptsDown = true;
  server.state.refuse = ({ method, target }) => {
    if (method === 'POST' && target === 'child_group_memberships' && !refusedOnce) {
      refusedOnce = true;
      return { status: 403, code: '42501', message: 'new row violates row-level security policy for table "child_group_memberships"' };
    }
    if (target === 'rpc/report_mobile_support_incident_v2' && receiptsDown) {
      return { status: 503, code: '54000', message: 'Incident receipt allowance exhausted' };
    }
    return null;
  };
  await syncPasses([false, false]);
  await statusItems();
  expect(server.summary().filter(line => line.startsWith('rpc/delete_child_if_no_history'))).toEqual([
    `rpc/delete_child_if_no_history:${C} -> ok`,
  ]);
  expect((await outbox()).map(row => `${row.table_name}:${row.operation}:${row.status}:${row.error_code}`)).toEqual([
    'child_group_memberships:insert:terminal:REMOVED_WITH_CHILD',
  ]);
  expect(server.t('children').get(C).archive_reason).toBe('removed_by_ea');

  server.restoreChild({ eaUserId: USER, childId: C });
  tick();
  await pull();
  expect(await myChildren()).toEqual([C]);
  // The server never accepted that membership, so the restored child is not in the group on the
  // phone either, even while the refused row still waits for its receipt.
  expect(await groupsOf(C)).toEqual([]);

  // Sync now and pull-to-refresh never send the refused INSERT again, so it cannot re-create a
  // membership the server never accepted.
  const mark = server.log.length;
  await syncPasses([true, false, true]);
  await pull();
  expect(writes(mark).filter(line => line.includes('child_group_memberships'))).toEqual([]);
  expect(server.all('child_group_memberships')).toEqual([]);
  // It blocks nothing: the restored child's edit and new lesson upload past it.
  await expectWritable();
  expect((await outbox()).map(row => `${row.table_name}:${row.status}:${row.error_code}`)).toEqual([
    'child_group_memberships:terminal:REMOVED_WITH_CHILD',
  ]);

  // Once its receipt is delivered it clears by itself (after the receipt's own retry delay).
  receiptsDown = false;
  for (let pass = 0; pass < 2; pass += 1) {
    jest.setSystemTime(Date.now() + 24 * 3600 * 1000);
    await statusItems();
    await sync();
  }
  expect(await outbox()).toEqual([]);
  expect(server.all('child_group_memberships')).toEqual([]);

  // The server's rows win on the phone: the child is in My Children with the group memberships the
  // server holds (none), not the refused one.
  await pull();
  expect(await myChildren()).toEqual([C]);
  expect(await groupsOf(C)).toEqual([]);
});
