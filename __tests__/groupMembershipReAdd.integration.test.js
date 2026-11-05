// E4 (plan O2 item 5; MA-BUG-20261104-016): removing a child from a Head Office group and adding
// them back, or moving them to a sibling group of the same grouping version, before the first upload.
// The active unique index is (child_id, grouping_version_id), so the old membership must never be
// active on the server when the new one arrives. Real handle, real SQLite, real supabase-js; the
// network is test-support/lifecycleServer.js.
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
import {
  childEaAssignmentDomainId, childProgrammeEnrollmentDomainId, classEaAssignmentDomainId, groupEaAssignmentDomainId,
} from '../src/db/repositories/domainRepositoryUtils';
import { createLifecycleServer } from '../test-support/lifecycleServer';

const USER = '11111111-1111-4111-8111-111111111111';
const HO = '99999999-9999-4999-8999-999999999999';
const SCHOOL = 'a0000000-0000-4000-8000-000000000001';
const PROG = 'a0000000-0000-4000-8000-000000000002';
const YEAR = 'a0000000-0000-4000-8000-000000000003';
const CLASS = 'a0000000-0000-4000-8000-000000000004';
const VERSION = 'a0000000-0000-4000-8000-000000000008';
const G1 = 'a0000000-0000-4000-8000-000000000011';
const G2 = 'a0000000-0000-4000-8000-000000000012';
const C = 'c0000000-0000-4000-8000-000000000001';
const M1 = 'cb000000-0000-4000-8000-000000000001';
const M2 = 'cb000000-0000-4000-8000-000000000002';
const T_SEED = '2026-01-15T00:00:00.000Z';

let handle;
let repos;
let server;
let dir;
const read = async (sql, ...params) => (await handle.getReader()).getAllAsync(sql, ...params);
const tick = () => jest.setSystemTime(Date.now() + 1000);
const sync = (options) => handle.services.syncEngine.syncAll(options);
const memberships = () => server.all('child_group_memberships')
  .map(row => ({ id: row.id, group: row.group_id === G1 ? 'G1' : 'G2', ended: row.removed_at != null }))
  .sort((a, b) => a.id.localeCompare(b.id));

const seed = async () => {
  const rows = [
    ['schools', { id: SCHOOL, name: 'Masi Primary' }],
    ['programmes', { id: PROG, code: 'literacy', name: 'Literacy' }],
    ['academic_years', { id: YEAR, label: '2026', starts_on: '2026-01-15', ends_on: '2026-12-15', is_active: 1 }],
    ['staff_programme_assignments', { id: 'spa-1', user_id: USER, programme_id: PROG, school_id: SCHOOL, assigned_at: T_SEED }],
    ['classes', { id: CLASS, school_id: SCHOOL, name: 'Grade 1A', grade: '1', academic_year_id: YEAR, created_by: HO }],
    ['class_ea_assignments', {
      id: classEaAssignmentDomainId({ classId: CLASS, eaUserId: USER, programmeId: PROG }),
      class_id: CLASS, ea_user_id: USER, programme_id: PROG, assigned_at: T_SEED, created_by: HO,
    }],
    ['grouping_versions', { id: VERSION, class_id: CLASS, academic_year_id: YEAR, version_number: 1, status: 'active', created_by: HO }],
    ...[G1, G2].flatMap((groupId, index) => [
      ['groups', { id: groupId, name: `Group ${index + 1}`, programme_id: PROG, class_id: CLASS, grouping_version_id: VERSION, created_by: HO }],
      ['group_ea_assignments', {
        id: groupEaAssignmentDomainId({ groupId }), group_id: groupId, ea_user_id: USER, programme_id: PROG, assigned_at: T_SEED, created_by: HO,
      }],
    ]),
    ['children', { id: C, first_name: 'Thandi', last_name: 'Mokoena', class_id: CLASS, created_by: HO }],
    ['child_ea_assignments', {
      id: childEaAssignmentDomainId({ userId: USER, childId: C }), user_id: USER, child_id: C, assigned_at: T_SEED, created_by: HO,
    }],
    ['child_programme_enrollments', {
      id: childProgrammeEnrollmentDomainId({ childId: C, programmeId: PROG }), child_id: C, programme_id: PROG, enrolled_at: T_SEED, created_by: HO,
    }],
    ['child_class_memberships', { id: 'cc000000-0000-4000-8000-000000000001', child_id: C, class_id: CLASS, academic_year_id: YEAR, enrolled_at: T_SEED, created_by: HO }],
  ];
  const REFERENCE = new Set(['schools', 'programmes', 'academic_years']);
  const UNSYNCED = new Set(['schools', 'programmes', 'academic_years', 'staff_programme_assignments']);
  await handle.withTransaction(async (txn) => {
    for (const [table, row] of rows) {
      const full = UNSYNCED.has(table) ? row : { ...row, sync_status: 'synced' };
      await txn.runAsync(
        `insert into ${table} (${Object.keys(full).join(', ')}) values (${Object.keys(full).map(() => '?').join(', ')})`,
        ...Object.values(full),
      );
    }
  });
  for (const [table, row] of rows) if (!REFERENCE.has(table)) server.seed(table, row);
};

const add = async (id, groupId) => {
  await repos.groups.addChildToGroup({ id, child_id: C, group_id: groupId, created_by: USER, synced: false });
  tick();
};
const remove = async (groupId) => {
  await repos.groups.removeChildFromGroup(C, groupId);
  tick();
};

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: [
    'nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    'queueMicrotask', 'hrtime', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
    'requestIdleCallback', 'cancelIdleCallback',
  ] });
  jest.setSystemTime(new Date('2026-10-21T09:30:00.000Z'));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-group-readd-'));
  server = createLifecycleServer({ actor: USER });
  setLatestAuthSession({ user: { id: USER }, access_token: 'test-token' });
  handle = await requestOpen({
    userId: USER, fetchImpl: server.fetchImpl,
    openDatabase: async (name) => createBetterSqliteTestDatabase(path.join(dir, name), { honorQueryOnly: true }),
  });
  repos = handle.repositories;
  await seed();
});
afterEach(async () => {
  await resetHandleRegistryForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  jest.useRealTimers();
});

test.each([
  ['re-added to the same group', G1, 'G1'],
  ['moved to a sibling group of the same grouping version', G2, 'G2'],
])('a child added, removed and %s before the first upload lands once, with no duplicate refusal', async (_label, target, targetName) => {
  await add(M1, G1);
  await remove(G1);
  await add(M2, target);

  // The never-acknowledged membership's INSERT now carries its end; no separate archive is queued.
  const queued = await read(`
    select record_id, operation, json_extract(payload, '$.removed_at') is not null as ended
    from sync_outbox order by created_at, id
  `);
  expect(queued).toEqual([
    { record_id: M1, operation: 'insert', ended: 1 },
    { record_id: M2, operation: 'insert', ended: 0 },
  ]);

  const pass = await sync();
  expect(pass.totalTerminal).toBe(0);
  expect(server.summary().filter(line => line.includes('23505'))).toEqual([]);
  expect(memberships()).toEqual([
    { id: M1, group: 'G1', ended: true },
    { id: M2, group: targetName, ended: false },
  ]);
  expect(await read('select * from sync_outbox')).toEqual([]);
});

test('a membership the server already holds is ended first, then the re-add lands', async () => {
  await add(M1, G1);
  await sync();
  expect(memberships()).toEqual([{ id: M1, group: 'G1', ended: false }]);
  await remove(G1);
  await add(M2, G1);
  expect((await read('select record_id, operation from sync_outbox order by created_at, id')).map(row => `${row.record_id}:${row.operation}`))
    .toEqual([`${M1}:archive`, `${M2}:insert`]);

  const pass = await sync();
  expect(pass.totalTerminal).toBe(0);
  expect(memberships()).toEqual([
    { id: M1, group: 'G1', ended: true },
    { id: M2, group: 'G1', ended: false },
  ]);
  expect(await read('select * from sync_outbox')).toEqual([]);
});
