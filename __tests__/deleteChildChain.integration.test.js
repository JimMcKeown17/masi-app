// Delete child through the server (plan O2 item 2, docs/superpowers/plans/2026-11-04-lifecycle-safety.md).
// Real signed-in EA handle, real better-sqlite3, real repositories, lessonSave and production sync
// engine; only the network is fake (test-support/lifecycleServer.js: the post-server-batch contract,
// real supabase-js on top). Asserts the decided target behaviour:
// - history and the child's relationship INSERTs are delivered while the deletion waits;
// - a children hard_delete is never a parent (never a blocker, never FK retry evidence);
// - a genuinely unacknowledged child INSERT blocks its family, including while it backs off;
// - the hard_delete runs after its relationship INSERTs, and a refused one releases it once it
//   leaves the outbox (O1's receipt-gated exit, simulated by deleting the row).
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
import { EGRA_FORMS } from '../src/assessment-questions/egra';
import { batteryFor, bundledItemSetFor } from '../src/assessment-questions';
import { buildEgraResult } from '../test-support/egraResults';
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
const RUN = 'b0000000-0000-4000-8000-000000000001';
const assessmentId = (n) => `ab000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T_SEED = '2026-01-15T00:00:00.000Z';
const FIXTURE = path.join(__dirname, '../scripts/fixtures/lifecycle-ota/delete-child-offline-chain.wire.json');

let handle;
let repos;
let server;
let dir;
const read = async (sql, ...params) => (await handle.getReader()).getAllAsync(sql, ...params);
const write = task => handle.withTransaction(task);
const sync = (options) => handle.services.syncEngine.syncAll(options);
const outbox = () => read('select id, table_name, record_id, operation, status, error_code, retry_count from sync_outbox order by created_at, id');
const statuses = async () => Object.fromEntries((await outbox()).map(row => [row.id, row.status]));
const isDataRequest = (line) => !line.includes('report_mobile_support_incident');
// Stable request sequence: fixed ids keep their names, generated ids are numbered by first use.
const normalizedSequence = (lines, named) => {
  const labels = new Map(Object.entries(named).map(([name, id]) => [id, name]));
  return lines.map(line => line.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => {
    if (!labels.has(id)) labels.set(id, `id${labels.size - Object.keys(named).length + 1}`);
    return labels.get(id);
  }));
};
const passRequests = (from) => server.summary(from).filter(isDataRequest);
const tick = () => jest.setSystemTime(Date.now() + 1000);
const elapseBackoff = () => jest.setSystemTime(Date.now() + 20 * 60 * 1000);

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

// A child Head Office set up and this EA already holds (every row acknowledged).
const serverChildRows = (childId, { otherEaClass = false, otherEaNumeracy = false } = {}) => [
  ['children', { id: childId, first_name: 'Thandi', last_name: 'Mokoena', class_id: CLASS, created_by: HO }],
  ['child_ea_assignments', {
    id: childEaAssignmentDomainId({ userId: USER, childId }), user_id: USER, child_id: childId, assigned_at: T_SEED, created_by: HO,
  }],
  ['child_programme_enrollments', {
    id: childProgrammeEnrollmentDomainId({ childId, programmeId: PROG }), child_id: childId, programme_id: PROG, enrolled_at: T_SEED, created_by: HO,
  }],
  ['child_class_memberships', {
    id: `cc${childId.slice(2)}`, child_id: childId, class_id: CLASS, academic_year_id: YEAR, enrolled_at: T_SEED, created_by: HO,
  }],
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

const recordLesson = async (childId, { tick = true } = {}) => {
  const base = lessonDraftInput();
  const draft = await repos.lessonDrafts.create(lessonDraftInput({
    programme_id: PROG, group_id: GROUP, class_id: CLASS,
    attendance: { childIds: [childId], absentChildIds: [], addedChildIds: [] },
    plan: { ...base.plan, present_child_ids: [childId], up_next_group_id: GROUP },
    tracker_changes: tick ? { [childId]: { a: { mastered: true, languageCode: 'en', madeAt: MON } } } : {},
    reading_level_changes: {},
  }));
  return saveLesson({ handle, draft, sessionTypeFields: buildSessionTypeFields({ jobTitlesCache: [] }), nowIso: WED });
};

const recordClassBatteryRun = async (childId) => {
  const form = EGRA_FORMS[0];
  const battery = batteryFor('egra', form.id);
  await repos.batteryRuns.startRun({
    id: RUN, userId: USER, childId, classId: CLASS, batteryCode: 'egra', batteryVersion: form.id, language: battery.fixedLanguage,
  });
  for (const [index, question] of battery.questions.entries()) {
    const set = bundledItemSetFor(question.question_code, question.question_version, battery.fixedLanguage);
    const result = buildEgraResult(set, { correct: [0], responses: ['correct', 'incorrect', 'correct'], notReached: 2 });
    await repos.assessments.saveQuestionResult({ assessmentId: assessmentId(index + 1), userId: USER, childId, batteryRunId: RUN, result });
  }
  await repos.batteryRuns.finalizeRun(RUN, { questionCodes: battery.questions.map(question => question.question_code) });
};

// The all-offline chain: create a child, add them to a group, record a lesson with a tick and a
// class-scoped Battery Run, then Delete child. Nothing has reached the server.
const buildOfflineChain = async () => {
  await seedBoth(baseRows());
  await repos.children.save({
    id: C, first_name: 'Thandi', last_name: 'Mokoena', class_id: CLASS, created_by: USER, synced: false,
  }, { actorUserId: USER });
  tick();
  await repos.groups.addChildToGroup({ id: MEMBERSHIP, child_id: C, group_id: GROUP, created_by: USER, synced: false });
  tick();
  await recordLesson(C);
  tick();
  await recordClassBatteryRun(C);
  tick();
  expect(await repos.children.removeChild(C)).toBe(true);
  tick();
};

const RELATIONSHIP_TABLES = ['child_ea_assignments', 'child_programme_enrollments', 'child_class_memberships', 'child_group_memberships'];
const activeServerRelationships = (childId) => RELATIONSHIP_TABLES.flatMap((table) => server.all(table)
  .filter(row => row.child_id === childId)
  .filter(row => row[{ child_ea_assignments: 'unassigned_at', child_programme_enrollments: 'ended_at',
    child_class_memberships: 'exited_at', child_group_memberships: 'removed_at' }[table]] == null)
  .map(row => `${table}:${row.user_id || row.programme_id || row.class_id || row.group_id}`));

beforeEach(async () => {
  // Only the clock is faked; tick() steps it between actions and elapseBackoff jumps past backoff.
  jest.useFakeTimers({ doNotFake: [
    'nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    'queueMicrotask', 'hrtime', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
    'requestIdleCallback', 'cancelIdleCallback',
  ] });
  jest.setSystemTime(new Date('2026-10-21T09:30:00.000Z'));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-delete-child-chain-'));
  server = createLifecycleServer({ actor: USER });
  setLatestAuthSession({ user: { id: USER }, access_token: 'test-token' });
  handle = await requestOpen({
    userId: USER, fetchImpl: server.fetchImpl,
    openDatabase: async (name) => createBetterSqliteTestDatabase(path.join(dir, name), { honorQueryOnly: true }),
  });
  repos = handle.repositories;
});
afterEach(async () => {
  await resetHandleRegistryForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  jest.useRealTimers();
});

test('all-offline chain with a failed first pass: history and relationships land first, the removal runs last and leaves no grant', async () => {
  await buildOfflineChain();
  const seed = server.snapshot();
  const queued = (await outbox()).map(row => `${row.table_name}:${row.operation}`);
  expect(queued).toEqual(expect.arrayContaining([
    'children:insert', 'child_ea_assignments:insert', 'child_programme_enrollments:insert', 'child_class_memberships:insert',
    'child_group_memberships:insert', 'sessions:insert', 'session_attendees:insert', 'letter_mastery:update',
    'battery_runs:insert', 'assessments:insert', 'children:hard_delete',
  ]));
  expect(queued.filter(op => op.endsWith(':archive'))).toEqual([]);

  // Pass 1: the phone is offline. Every attempted upload fails and backs off.
  server.state.down = true;
  const pass1 = await sync();
  server.state.down = false;
  expect(pass1.totalTerminal).toBe(0);
  expect(server.log).toEqual([]);

  // Pass 2, ordinary, still inside the backoff: the unacknowledged child INSERT keeps blocking its
  // family while it backs off, and the waiting deletion does not run.
  let mark = server.log.length;
  const pass2 = await sync();
  expect(pass2.totalTerminal).toBe(0);
  expect(passRequests(mark)).toEqual([]);

  // Pass 3, Sync now: the child, its relationships and all its history land. The deletion still
  // waits: it is checked before its relationship INSERTs are acknowledged in this pass.
  mark = server.log.length;
  const pass3 = await sync({ force: true });
  expect(pass3.totalTerminal).toBe(0);
  const pass3Requests = passRequests(mark);
  expect(pass3Requests.some(line => line.startsWith('rpc/delete_child_if_no_history'))).toBe(false);
  expect(pass3Requests.filter(line => !line.endsWith('-> ok'))).toEqual([]);
  expect(Object.values(await statuses())).toEqual(['pending']);
  expect(activeServerRelationships(C).sort()).toEqual([
    `child_class_memberships:${CLASS}`, `child_ea_assignments:${USER}`,
    `child_group_memberships:${GROUP}`, `child_programme_enrollments:${PROG}`,
  ]);

  // Pass 4, ordinary: the removal runs last and the server ends every grant (sole holder).
  mark = server.log.length;
  const pass4 = await sync();
  expect(pass4.totalTerminal).toBe(0);
  expect(passRequests(mark)).toEqual([`rpc/delete_child_if_no_history:${C} -> ok`]);
  expect(await outbox()).toEqual([]);

  const dataRequests = server.summary().filter(isDataRequest);
  expect(dataRequests[dataRequests.length - 1]).toBe(`rpc/delete_child_if_no_history:${C} -> ok`);
  expect(server.all('session_attendees').map(row => row.child_id)).toEqual([C]);
  expect(server.all('letter_mastery').map(row => row.child_id)).toEqual([C]);
  expect(server.all('battery_runs').map(row => [row.id, row.class_id])).toEqual([[RUN, CLASS]]);
  expect(server.all('assessments').map(row => row.battery_run_id)).toEqual(
    batteryFor('egra', EGRA_FORMS[0].id).questions.map(() => RUN)
  );
  expect(activeServerRelationships(C)).toEqual([]);
  expect(server.t('children').get(C)).toMatchObject({ archive_reason: 'removed_by_ea', archived_by_user_id: USER });
  expect(server.otherActiveHolder(C)).toBe(false);

  // The recorded wire, for G1's replay into PostgreSQL with the server batch.
  const wire = {
    label: 'O2-delete-child-offline-chain',
    note: 'Recorded by __tests__/deleteChildChain.integration.test.js (plan O2). Regenerate with WRITE_LIFECYCLE_OTA_WIRE=1.',
    actor: USER, headOffice: HO,
    ids: { SCHOOL, PROG, YEAR, CLASS, GROUP, SPA, C },
    seed, hoActions: [],
    requests: server.log.map(({ seq, method, target, prefer, onConflict, query, body, fake }) => ({
      seq, method, target, prefer, onConflict, query, body, fake,
    })),
    sequence: normalizedSequence(server.summary(), { USER, C, MEMBERSHIP, RUN, CLASS, GROUP }),
  };
  if (process.env.WRITE_LIFECYCLE_OTA_WIRE === '1') {
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, `${JSON.stringify(wire, null, 2)}\n`);
  }
  const committed = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  expect(committed.sequence).toEqual(wire.sequence);
});

test('repeated ordinary and forced passes: the family and history progress while the deletion waits, and the deletion completes once they land', async () => {
  await buildOfflineChain();
  // A transient failure for the group membership INSERT and the lesson attendee on the first upload.
  const failedOnce = new Set();
  server.state.refuse = ({ method, target, body }) => {
    const key = `${method} ${target}`;
    if (['POST child_group_memberships', 'POST session_attendees'].includes(key) && !failedOnce.has(key)) {
      failedOnce.add(key);
      return { status: 503, code: 'PGRST000', message: 'upstream request timeout' };
    }
    return null;
  };

  const pass1 = await sync();
  expect(pass1.totalTerminal).toBe(0);
  // The deletion is not a blocked parent: the child's other relationships and history landed.
  expect(activeServerRelationships(C).sort()).toEqual([
    `child_class_memberships:${CLASS}`, `child_ea_assignments:${USER}`, `child_programme_enrollments:${PROG}`,
  ]);
  expect(server.all('letter_mastery').map(row => row.child_id)).toEqual([C]);
  expect(server.all('assessments')).toHaveLength(batteryFor('egra', EGRA_FORMS[0].id).questions.length);
  expect(server.all('session_attendees')).toEqual([]);

  // Ordinary passes inside the backoff send nothing and the deletion keeps waiting.
  for (let pass = 0; pass < 3; pass += 1) {
    const mark = server.log.length;
    expect((await sync()).totalTerminal).toBe(0);
    expect(passRequests(mark)).toEqual([]);
  }
  expect(await statuses()).toEqual(expect.objectContaining({
    [`children:${C}:hard_delete`]: 'pending',
    [`child_group_memberships:${MEMBERSHIP}:insert`]: 'failed',
  }));

  // Sync now lands the membership and the attendee; the deletion was checked before them.
  let mark = server.log.length;
  expect((await sync({ force: true })).totalTerminal).toBe(0);
  expect(passRequests(mark)).toEqual(expect.arrayContaining([
    `POST child_group_memberships:${MEMBERSHIP} -> ok`, expect.stringMatching(/^POST session_attendees.* -> ok$/),
  ]));
  expect(passRequests(mark).some(line => line.startsWith('rpc/delete_child_if_no_history'))).toBe(false);

  // Another forced pass and an ordinary pass after the backoff: the deletion completes exactly once.
  mark = server.log.length;
  expect((await sync({ force: true })).totalTerminal).toBe(0);
  elapseBackoff();
  expect((await sync()).totalTerminal).toBe(0);
  expect(passRequests(mark)).toEqual([`rpc/delete_child_if_no_history:${C} -> ok`]);
  expect(await outbox()).toEqual([]);
  expect(activeServerRelationships(C)).toEqual([]);
  expect(server.all('session_attendees').map(row => row.child_id)).toEqual([C]);
});

// Combined-OTA review (2026-11-05, MEDIUM): the deletion waits only for owed (non-terminal)
// relationship INSERTs. A refused one of a removed child is never sent again by any path, so it
// cannot land after the removal and re-create a grant; it blocks nothing, and it clears under the
// delivered-receipt rule like a refused lifecycle row.
const statusItems = async () => (await handle.services.syncEngine.getSyncStatus()).needsAttentionItems;

test('a relationship INSERT the server keeps refusing does not hold the deletion, and is never sent again', async () => {
  await repos.localState.set('support_auto_bundle_last_at', '2099-01-01T00:00:00.000Z');
  await buildOfflineChain();
  // The programme enrollment INSERT is refused every time (42501), with no pending evidence left.
  server.state.refuse = ({ method, target }) => (
    method === 'POST' && target === 'child_programme_enrollments'
      ? { status: 403, code: '42501', message: 'new row violates row-level security policy for table "child_programme_enrollments"' }
      : null
  );

  for (const force of [false, true, false, true]) {
    elapseBackoff();
    await sync({ force });
  }
  // The removal ran once the INSERT was refused; everything else for the child landed.
  expect(server.summary().filter(line => line.startsWith('rpc/delete_child_if_no_history'))).toEqual([
    `rpc/delete_child_if_no_history:${C} -> ok`,
  ]);
  expect(server.all('session_attendees').map(row => row.child_id)).toEqual([C]);
  expect(server.all('letter_mastery').map(row => row.child_id)).toEqual([C]);
  const refusedInsert = (await outbox()).find(row => row.table_name === 'child_programme_enrollments');
  expect(refusedInsert).toMatchObject({ operation: 'insert', status: 'terminal', error_code: '42501' });
  // Once refused for good, forced passes never send it again.
  const sends = () => server.summary().filter(line => line.startsWith('POST child_programme_enrollments')).length;
  const sentBefore = sends();
  await sync({ force: true });
  await sync({ force: true });
  expect(sends()).toBe(sentBefore);

  // Its receipt is delivered, so it clears by itself.
  await statusItems();
  await sync();
  await statusItems();
  await sync();
  expect(await outbox()).toEqual([]);
  expect(activeServerRelationships(C)).toEqual([]);
});

test('an acknowledged child whose relationship INSERT is permanently refused: the deletion completes and the refused INSERT never re-creates a grant', async () => {
  await repos.localState.set('support_auto_bundle_last_at', '2099-01-01T00:00:00.000Z');
  await seedBoth([...baseRows(), ...serverChildRows(C)]);
  // Offline, the EA puts the child in a group, records a lesson, then deletes the child.
  await repos.groups.addChildToGroup({ id: MEMBERSHIP, child_id: C, group_id: GROUP, created_by: USER, synced: false });
  tick();
  await recordLesson(C);
  tick();
  expect(await repos.children.removeChild(C)).toBe(true);
  tick();
  // Meanwhile Head Office ended this EA's access to the child: their direct assignment and their
  // class assignment (the class path would otherwise still grant write access).
  const endedAt = '2026-10-21T08:00:00.000Z';
  const assignment = server.t('child_ea_assignments').get(childEaAssignmentDomainId({ userId: USER, childId: C }));
  server.t('child_ea_assignments').set(assignment.id, { ...assignment, unassigned_at: endedAt });
  const classGrantId = classEaAssignmentDomainId({ classId: CLASS, eaUserId: USER, programmeId: PROG });
  server.t('class_ea_assignments').set(classGrantId, { ...server.t('class_ea_assignments').get(classGrantId), unassigned_at: endedAt });
  expect(server.writeForChild(C)).toBe(false);

  for (const force of [false, true, false, true, false]) {
    elapseBackoff();
    await sync({ force });
  }
  expect(server.summary().filter(line => line.startsWith('rpc/delete_child_if_no_history'))).toEqual([
    `rpc/delete_child_if_no_history:${C} -> ok`,
  ]);
  // The lesson is history: it landed although access had ended (held on the day, S2).
  expect(server.all('session_attendees').map(row => row.child_id)).toEqual([C]);
  expect(server.summary().filter(line => line.startsWith(`POST child_group_memberships:${MEMBERSHIP}`))).toHaveLength(1);

  // Head Office reopens access: a Sync now still does not send the refused membership INSERT.
  server.t('child_ea_assignments').set(assignment.id, { ...server.t('child_ea_assignments').get(assignment.id), unassigned_at: null });
  await sync({ force: true });
  expect(server.summary().filter(line => line.startsWith(`POST child_group_memberships:${MEMBERSHIP}`))).toHaveLength(1);
  expect(server.all('child_group_memberships').filter(row => row.child_id === C)).toEqual([]);
});

// Reviewer repro zzReviewX4: the receipt can never prove delivery (rejected as too large).
test('a refused relationship INSERT whose receipt is rejected neither holds the deletion nor clears', async () => {
  await repos.localState.set('support_auto_bundle_last_at', '2099-01-01T00:00:00.000Z');
  await seedBoth([...baseRows(), ...serverChildRows(C)]);
  await repos.groups.addChildToGroup({ id: MEMBERSHIP, child_id: C, group_id: GROUP, created_by: USER, synced: false });
  tick();
  await recordLesson(C);
  tick();
  expect(await repos.children.removeChild(C)).toBe(true);
  const endedAt = '2026-10-21T08:00:00.000Z';
  const assignment = server.t('child_ea_assignments').get(childEaAssignmentDomainId({ userId: USER, childId: C }));
  server.t('child_ea_assignments').set(assignment.id, { ...assignment, unassigned_at: endedAt });
  const classGrantId = classEaAssignmentDomainId({ classId: CLASS, eaUserId: USER, programmeId: PROG });
  server.t('class_ea_assignments').set(classGrantId, { ...server.t('class_ea_assignments').get(classGrantId), unassigned_at: endedAt });
  server.state.refuse = ({ target }) => (target === 'rpc/report_mobile_support_incident_v2'
    ? { status: 400, code: '22023', message: 'Envelope exceeds 65536 bytes' } : null);
  for (let pass = 0; pass < 10; pass += 1) {
    elapseBackoff();
    await sync({ force: pass % 2 === 1 });
    await statusItems();
  }
  expect(server.summary().filter(line => line.startsWith('rpc/delete_child_if_no_history'))).toEqual([
    `rpc/delete_child_if_no_history:${C} -> ok`,
  ]);
  // Nothing is left waiting; the refused INSERT stays visible as a support case.
  expect((await outbox()).map(row => `${row.table_name}:${row.operation}:${row.status}`)).toEqual([
    'child_group_memberships:insert:terminal',
  ]);
  expect((await handle.services.syncEngine.getSyncStatus()).waitingCount).toBe(0);
  expect((await statusItems()).find(item => item.table === 'child_group_memberships'))
    .toMatchObject({ delivery: 'support', canRemove: false, canRetry: false });
});

test.each([
  ['a class-path co-held child (another EA holds the class)', { otherEaClass: true }],
  ['an other-programme co-held child (a numeracy EA also teaches them)', { otherEaNumeracy: true }],
])('Delete child of %s sends only its history and the removal; shared rows stay open', async (_label, shape) => {
  await seedBoth([...baseRows(), ...serverChildRows(C, shape)]);
  await recordLesson(C);
  tick();
  expect(await repos.children.removeChild(C)).toBe(true);
  tick();
  // Nothing shared ends on this phone either.
  expect(await read(`
    select 'enrollment' as row, ended_at as ended from child_programme_enrollments where child_id = ?
    union all select 'class membership', exited_at from child_class_memberships where child_id = ?
  `, C, C)).toEqual([{ row: 'enrollment', ended: null }, { row: 'class membership', ended: null }]);

  await sync();
  elapseBackoff();
  await sync();

  // Nothing waits here (no relationship INSERT is owed), so the removal may run before the history
  // in the same pass; history is never gated and lands as held on the day (S2).
  const requests = server.summary().filter(isDataRequest);
  expect(requests.filter(line => /^(PATCH|POST) (children|child_)/.test(line))).toEqual([]);
  expect(requests.filter(line => line.startsWith('rpc/delete_child_if_no_history'))).toEqual([
    `rpc/delete_child_if_no_history:${C} -> ok`,
  ]);
  expect(requests.filter(line => !line.endsWith('-> ok'))).toEqual([]);
  expect(server.all('session_attendees').map(row => row.child_id)).toEqual([C]);
  expect(server.all('letter_mastery').map(row => row.child_id)).toEqual([C]);
  expect(await outbox()).toEqual([]);
  // The server's actor-scoped removal: only this EA's grant ended; the child stays for the other EA.
  expect(server.t('children').get(C).archived_at).toBeUndefined();
  expect(server.otherActiveHolder(C)).toBe(true);
  expect(activeServerRelationships(C).sort()).toEqual([
    `child_class_memberships:${CLASS}`,
    ...(shape.otherEaNumeracy ? [`child_ea_assignments:${OTHER_EA}`] : []),
    `child_programme_enrollments:${PROG}`,
    ...(shape.otherEaNumeracy ? [`child_programme_enrollments:${NUMERACY}`] : []),
  ].sort());
});

// Reviewer repros zzReviewX2 / X2b: a flaky upload of the EA's own group assignment lets the
// removal land before the EA holds the group on the server. The server ends memberships in groups
// the caller holds, or created and nobody else holds (the corrected S3 rule the fake models), so
// no membership survives for the removed child either way.
const G2 = 'a0000000-0000-4000-8000-0000000000aa';
const M2 = 'cb000000-0000-4000-8000-0000000000aa';
const flakyGroupAssignment = () => {
  let failed = false;
  server.state.refuse = ({ method, target }) => {
    if (method === 'POST' && target === 'group_ea_assignments' && !failed) {
      failed = true;
      return { status: 503, code: 'PGRST000', message: 'upstream timeout' };
    }
    return null;
  };
};

test('Delete child landing before the EA\'s new group assignment still ends the child\'s membership in that group', async () => {
  await seedBoth(baseRows());
  await repos.groups.saveGroup({ id: G2, name: 'New group', programme_id: PROG, class_id: CLASS, created_by: USER, synced: false });
  tick();
  await repos.children.save({ id: C, first_name: 'Thandi', last_name: 'Mokoena', class_id: CLASS, created_by: USER, synced: false }, { actorUserId: USER });
  tick();
  await repos.groups.addChildToGroup({ id: M2, child_id: C, group_id: G2, created_by: USER, synced: false });
  tick();
  expect(await repos.children.removeChild(C)).toBe(true);
  tick();
  flakyGroupAssignment();
  await sync();
  await sync();
  elapseBackoff();
  await sync();
  expect(await outbox()).toEqual([]);
  expect(server.t('children').get(C).archived_at).toBeTruthy();
  expect(server.all('child_group_memberships').filter(row => row.child_id === C && row.removed_at == null)).toEqual([]);
  expect(server.writeForChild(C)).toBe(false);
  // The EA still holds the group they created.
  expect(server.all('group_ea_assignments').filter(row => row.group_id === G2 && row.unassigned_at == null))
    .toEqual([expect.objectContaining({ ea_user_id: USER })]);
});

test('for a co-held child, Delete child landing before the EA\'s new group assignment leaves no group path for the EA', async () => {
  await seedBoth([...baseRows(), ...serverChildRows(C, { otherEaNumeracy: true })]);
  await repos.groups.saveGroup({ id: G2, name: 'New group', programme_id: PROG, class_id: CLASS, created_by: USER, synced: false });
  tick();
  await repos.groups.addChildToGroup({ id: M2, child_id: C, group_id: G2, created_by: USER, synced: false });
  tick();
  await recordLesson(C);
  tick();
  expect(await repos.children.removeChild(C)).toBe(true);
  tick();
  flakyGroupAssignment();
  await sync();
  await sync();
  elapseBackoff();
  await sync();
  expect(await outbox()).toEqual([]);
  // Another EA still teaches the child, so the child stays; this EA's direct and group paths end.
  expect(server.t('children').get(C).archived_at).toBeUndefined();
  expect(server.all('child_group_memberships').filter(row => row.child_id === C && row.removed_at == null)).toEqual([]);
  expect(server.all('child_ea_assignments').filter(row => row.child_id === C && row.unassigned_at == null))
    .toEqual([expect.objectContaining({ user_id: OTHER_EA })]);
});

test('Delete child leaves the child in a group this EA created but another EA now holds', async () => {
  const handedOver = groupEaAssignmentDomainId({ groupId: GROUP });
  await seedBoth([...baseRows(), ...serverChildRows(C, { otherEaNumeracy: true }),
    ['child_group_memberships', { id: MEMBERSHIP, child_id: C, group_id: GROUP, joined_at: T_SEED, created_by: USER }]]);
  // Head Office handed this EA's group to another EA: this EA's assignment ended, a successor holds it.
  server.t('group_ea_assignments').set(handedOver, { ...server.t('group_ea_assignments').get(handedOver), unassigned_at: '2026-10-20T08:00:00.000Z' });
  server.seed('group_ea_assignments', { id: 'ge-successor', group_id: GROUP, ea_user_id: OTHER_EA, programme_id: PROG,
    assigned_at: '2026-10-20T08:00:00.000Z', created_by: HO });
  expect(await repos.children.removeChild(C)).toBe(true);
  await sync();
  expect(server.summary().filter(line => line.startsWith('rpc/delete_child_if_no_history'))).toEqual([
    `rpc/delete_child_if_no_history:${C} -> ok`,
  ]);
  expect(server.t('child_group_memberships').get(MEMBERSHIP).removed_at).toBeUndefined();
});
