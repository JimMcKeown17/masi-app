jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
const mockConsume = jest.fn(() => false);
const mockRefresh = jest.fn(async () => {});
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({
  isOnline: true, isSyncing: false, refreshSyncStatus: mockRefresh,
  consumeReconcileBreakerAuthorization: mockConsume,
}) }));
jest.mock('../src/services/observability', () => ({ captureOperationalError: jest.fn() }));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createClassEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { createGroupEaAssignmentsRepository } from '../src/db/repositories/groupEaAssignmentsRepository';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createSyncStateRepository } from '../src/db/repositories/syncStateRepository';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { pullReconcileAcknowledgments, pullPreloadedChildData, persistPreloadedChildData } from '../src/services/preloadedChildData';
import { describeReconcileBreakerNote } from '../src/utils/syncStatusPresenter';

const PULLED_AT = '2026-10-23T12:00:00.000Z';
let db;
let repositories;
let raw;
let dataset;
let client;
let signedIn;
const snapshot = (overrides = {}) => ({
  schema_version: 1, complete: true, user_id: 'user-1', active_programme_id: 'programme-a',
  child_ea_assignment_ids: [], assigned_child_ids: [], visible_child_ids: [],
  child_programme_enrollment_ids: [], child_class_membership_ids: [],
  class_ea_assignment_ids: ['class-grant'], class_ids: ['class-1'],
  group_ea_assignment_ids: [], group_ids: [], child_group_membership_ids: [],
  roster_class_ids: ['class-1'], roster_membership_ids: [], ...overrides,
});
const seedMembership = async (id, status = 'synced', classId = 'class-1') => {
  await db.runAsync('insert into children (id, first_name, last_name, class_id) values (?, ?, ?, ?)',
    `child-${id}`, id, 'Roster', classId);
  await db.runAsync(`insert into child_class_memberships
    (id, child_id, class_id, academic_year_id, enrolled_at, sync_status)
    values (?, ?, ?, 'year-2026', '2026-01-15T00:00:00Z', ?)`, id, `child-${id}`, classId, status);
};
const read = () => db.getAllAsync('select id, child_id, exited_at, sync_status from child_class_memberships order by id');
const classOptions = (overrides = {}) => ({
  rosterClassIds: ['class-1'], rosterMembershipIds: [], deliveryChildIds: [], pulledAt: PULLED_AT, ...overrides,
});
const classPass = options => repositories.children.withTransaction(txn => (
  repositories.children.buildClassRosterMembershipReconcile(classOptions(options))(txn)
));
const decode = () => pullReconcileAcknowledgments({ userId: 'user-1', supabaseClient: client, enqueueRequest: task => task() });
const pull = () => pullPreloadedChildData({ userId: 'user-1', supabaseClient: client, enqueueRequest: task => task() });
const persist = (pulled, authorizedBreakerScopes) => persistPreloadedChildData({
  pulled, repositories, userId: 'user-1', authorizedBreakerScopes,
});
const makeClient = () => ({
  rpc: jest.fn(async () => ({ data: raw, error: null })),
  from: table => {
    let select = '';
    const filters = [];
    const builder = {
      select: value => { select = value; return builder; },
      eq: (key, value) => { filters.push([key, value]); return builder; },
      is: () => builder, in: () => builder, order: () => builder, limit: () => builder,
      then: (resolve, reject) => Promise.resolve().then(() => {
        if (table === 'staff_programme_assignments') return { data: [{ programme_id: 'programme-a' }], error: null };
        if (dataset.failedRoster && table === 'class_ea_assignments') return { data: null, error: { code: '42501', message: 'Roster failed' } };
        if (table === 'class_ea_assignments') return { data: [{ id: 'class-grant', class_id: 'class-1',
          ea_user_id: 'user-1', programme_id: 'programme-a', unassigned_at: null, classes: {
            id: 'class-1', school_id: 'school-1', name: 'Held class', grade: '1', academic_year_id: 'year-2026',
          } }], error: null };
        if (table === 'child_class_memberships' && dataset.missingChild) return { data: [{
          id: 'unhydrated', child_id: 'unhydrated-child', class_id: 'class-1', academic_year_id: 'year-2026',
          enrolled_at: '2026-01-15', exited_at: null, classes: {
            id: 'class-1', school_id: 'school-1', name: 'Held class', grade: '1', academic_year_id: 'year-2026',
          },
        }], error: null };
        return { data: [], error: null };
      }).then(resolve, reject),
    };
    return builder;
  },
});
const wrapper = ({ children }) => <SignedInEAContext.Provider value={signedIn}>
  <ChildrenProvider>{children}</ChildrenProvider>
</SignedInEAContext.Provider>;

beforeEach(async () => {
  db = await createMigratedDatabase(runMigrations);
  await seedCoreData(db);
  repositories = {
    children: createChildrenRepository({ database: db }), classes: createClassesRepository({ database: db }),
    classEaAssignments: createClassEaAssignmentsRepository({ database: db }),
    groups: createGroupsRepository({ database: db }), groupEaAssignments: createGroupEaAssignmentsRepository({ database: db }),
    syncOutbox: createSyncOutboxRepository({ database: db }), syncState: createSyncStateRepository({ database: db }),
  };
  raw = snapshot(); dataset = {};
  client = makeClient();
  const history = () => ({ start: async () => {}, store: { reset: () => {} } });
  signedIn = { repositories, handle: { userId: 'user-1', isCurrent: () => true,
    dataClient: client, enqueueRequest: task => task() }, services: {
    referenceDataReady: async () => {}, sessionHistory: history(), assessmentHistory: history(),
  } };
  mockConsume.mockReset().mockReturnValue(false);
  mockRefresh.mockClear();
});
afterEach(async () => { jest.restoreAllMocks(); await db.closeAsync(); });

it('ends the last departed control membership in a still-held class without outbox work', async () => {
  await seedMembership('last-control');
  expect(await classPass()).toEqual({ ended: 1, reconcileCompleted: true });
  expect(await read()).toEqual([expect.objectContaining({ id: 'last-control', exited_at: PULLED_AT, sync_status: 'synced' })]);
  expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
});

it('does not invent membership exits when a class assignment is lost', async () => {
  await seedMembership('lost-class');
  expect(await classPass({ rosterClassIds: [] })).toEqual({ ended: 0, reconcileCompleted: true });
  expect((await read())[0].exited_at).toBeNull();
});

it('never ends pending, failed, terminal, already closed, or delivery-owned rows', async () => {
  for (const status of ['synced', 'pending', 'failed', 'terminal']) await seedMembership(status, status);
  await seedMembership('delivery');
  await seedMembership('closed');
  await db.runAsync("update child_class_memberships set exited_at = '2026-06-01' where id = 'closed'");
  expect(await classPass({ deliveryChildIds: ['child-delivery'] })).toEqual({ ended: 1, reconcileCompleted: true });
  expect((await read()).filter(row => ['pending', 'failed', 'terminal', 'delivery'].includes(row.id)).every(row => row.exited_at === null)).toBe(true);
  expect((await read()).find(row => row.id === 'closed').exited_at).toBe('2026-06-01');
});

it('keeps another EA delivery child in a shared class while the server membership is open', async () => {
  await seedMembership('other-ea');
  await seedMembership('departed');
  await db.runAsync("insert into child_ea_assignments (id, child_id, user_id) values ('other-ea-delivery', 'child-other-ea', 'other-ea')");
  expect(await classPass({ rosterMembershipIds: ['other-ea'] })).toEqual({ ended: 1, reconcileCompleted: true });
  expect((await read()).find(row => row.id === 'other-ea').exited_at).toBeNull();
});

it.each(['delivery-first', 'class-first'])('preserves all 12 withheld delivery removals in a 40-child class, %s', async order => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  for (let index = 0; index < 40; index += 1) await seedMembership(`member-${index}`);
  const deliveryChildIds = Array.from({ length: 12 }, (_, index) => `child-member-${index}`);
  for (let index = 0; index < 12; index += 1) {
    await db.runAsync('insert into child_ea_assignments (id, user_id, child_id) values (?, ?, ?)',
      `assignment-${index}`, 'user-1', deliveryChildIds[index]);
    await db.runAsync('insert into child_programme_enrollments (id, child_id, programme_id) values (?, ?, ?)',
      `enrollment-${index}`, deliveryChildIds[index], 'programme-a');
  }
  expect(await repositories.children.getMyChildren('user-1')).toHaveLength(12);
  const controlIds = Array.from({ length: 28 }, (_, index) => `member-${index + 12}`);
  const results = await repositories.children.withTransaction(async txn => {
    const passes = {
      delivery: repositories.children.buildClassMembershipReconcile({ acknowledgedIds: [], acknowledgedChildIds: deliveryChildIds, pulledAt: PULLED_AT }),
      class: repositories.children.buildClassRosterMembershipReconcile(classOptions({ deliveryChildIds, rosterMembershipIds: controlIds })),
    };
    const output = {};
    for (const name of order === 'delivery-first' ? ['delivery', 'class'] : ['class', 'delivery']) output[name] = await passes[name](txn);
    return output;
  });
  expect(results.delivery).toEqual({ ended: 0, reconcileCompleted: false });
  expect(results.class).toEqual({ ended: 0, reconcileCompleted: true });
  expect((await read()).every(row => row.exited_at === null)).toBe(true);
  expect(await repositories.syncState.getReconcileBreakerNotes()).toEqual([
    expect.objectContaining({ scope: 'childClassMemberships', candidateCount: 12, wouldEndCount: 12 }),
  ]);
});

it('trips its own breaker for a control mass exit, then applies only with explicit authorization', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  for (let index = 0; index < 20; index += 1) await seedMembership(`control-${index}`);
  expect(await classPass()).toEqual({ ended: 0, reconcileCompleted: false });
  const [note] = await repositories.syncState.getReconcileBreakerNotes();
  expect(note).toEqual(expect.objectContaining({ scope: 'classRosterMemberships', candidateCount: 20, wouldEndCount: 20 }));
  expect(describeReconcileBreakerNote(note)).toEqual(expect.objectContaining({ scope: 'classRosterMemberships', actionLabel: 'Apply' }));
  expect((await read()).every(row => row.exited_at === null)).toBe(true);
  expect(await classPass({ bypassBreaker: true })).toEqual({ ended: 20, reconcileCompleted: true });
  expect(await repositories.syncState.getReconcileBreakerNotes()).toEqual([]);
});

it.each(['rosterClassIds', 'rosterMembershipIds'])('skips absent %s instead of treating it as an empty array', async key => {
  await seedMembership('kept');
  const options = classOptions(); delete options[key];
  await repositories.children.withTransaction(txn => repositories.children.buildClassRosterMembershipReconcile(options)(txn));
  expect((await read())[0].exited_at).toBeNull();
});

it('decodes optional keys without making them mandatory, preserving undefined versus []', async () => {
  const decoded = await decode();
  expect(decoded.ok).toBe(true);
  expect(decoded.data.rosterClassIds).toEqual(['class-1']);
  expect(decoded.data.rosterMembershipIds).toEqual([]);
  delete raw.roster_class_ids; delete raw.roster_membership_ids;
  const old = await decode();
  expect(old.ok).toBe(true);
  expect(old.data.rosterClassIds).toBeUndefined();
  expect(old.data.rosterMembershipIds).toBeUndefined();
});

for (const path of ['preloaded', 'provider']) {
  it.each(['old-server', 'empty-roster', 'incomplete-after-persist', 'empty-class-set'])(`wires raw %s JSON through the decoder and ${path} path`, async scenario => {
    await seedMembership('control');
    await repositories.syncState.setPullState('pull_reconcile_breaker:classRosterMemberships', {
      cursor: JSON.stringify({ scope: 'classRosterMemberships', candidateCount: 40, wouldEndCount: 40 }),
    });
    if (scenario === 'old-server') { delete raw.roster_class_ids; delete raw.roster_membership_ids; }
    if (scenario === 'empty-class-set') raw.roster_class_ids = [];
    if (scenario === 'incomplete-after-persist') dataset.missingChild = true;
    if (path === 'preloaded') {
      const pulled = await pull();
      expect(pulled.scopes.classRoster.complete).toBe(true);
      const result = await persist(pulled);
      if (scenario === 'incomplete-after-persist') expect(result.scopes.classRoster.complete).toBe(false);
    } else {
      const { result } = renderHook(useChildren, { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
    }
    const rows = await read();
    expect(rows.find(row => row.id === 'control').exited_at !== null).toBe(scenario === 'empty-roster');
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
    expect(await repositories.syncState.getReconcileBreakerNotes()).toHaveLength(
      ['old-server', 'incomplete-after-persist'].includes(scenario) ? 1 : 0
    );
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
}

it('consumes classRosterMemberships authorization in ChildrenContext and refreshes attention state after applying', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  for (let index = 0; index < 20; index += 1) await seedMembership(`authorized-${index}`);
  mockConsume.mockImplementation(scope => scope === 'classRosterMemberships');
  const { result } = renderHook(useChildren, { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(mockConsume).toHaveBeenCalledWith('classRosterMemberships');
  expect((await read()).every(row => row.exited_at !== null)).toBe(true);
  expect(mockRefresh).toHaveBeenCalledWith({ autoTrigger: false });
});

it('rolls back both live-path membership passes together if the class pass hits a real SQL error', async () => {
  await seedMembership('delivery');
  await seedMembership('control');
  raw.visible_child_ids = ['child-delivery'];
  const before = await read();
  const build = repositories.children.buildClassRosterMembershipReconcile;
  jest.spyOn(repositories.children, 'buildClassRosterMembershipReconcile').mockImplementation(options => async txn => {
    await build(options)(txn);
    await txn.runAsync(`insert into child_class_memberships (id, child_id, class_id, academic_year_id)
      values ('fault', 'missing-child', 'class-1', 'year-2026')`);
  });
  let caught;
  try { await persist(await pull()); } catch (error) { caught = error; }
  expect(caught?.code).toBe('SQLITE_CONSTRAINT_FOREIGNKEY');
  expect(await read()).toEqual(before);
  expect(await db.getFirstAsync("select * from sync_state where scope = 'child_data_pull'")).toBeNull();
});

it('keeps controls when the roster fetch fails even though the decoded acknowledgment is complete', async () => {
  await seedMembership('control');
  dataset.failedRoster = true;
  const result = await persist(await pull());
  expect(result.scopes.classRoster.complete).toBe(false);
  expect((await read())[0].exited_at).toBeNull();
});

it('accepts a preloaded class-scope authorization without authorizing the delivery breaker', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  for (let index = 0; index < 12; index += 1) await seedMembership(`delivery-${index}`);
  for (let index = 0; index < 20; index += 1) await seedMembership(`control-${index}`);
  raw.visible_child_ids = Array.from({ length: 12 }, (_, index) => `child-delivery-${index}`);
  await persist(await pull(), new Set(['classRosterMemberships']));
  const rows = await read();
  expect(rows.filter(row => row.id.startsWith('delivery-')).every(row => row.exited_at === null)).toBe(true);
  expect(rows.filter(row => row.id.startsWith('control-')).every(row => row.exited_at !== null)).toBe(true);
  expect(await repositories.syncState.getReconcileBreakerNotes()).toEqual([
    expect.objectContaining({ scope: 'childClassMemberships', wouldEndCount: 12 }),
  ]);
});
