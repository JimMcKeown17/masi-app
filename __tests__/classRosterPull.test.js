jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({
  isOnline: true, isSyncing: false, refreshSyncStatus: jest.fn(),
}) }));
jest.mock('../src/services/observability', () => ({ captureOperationalError: jest.fn() }));

import React from 'react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPathDatabaseOpener, openTestHandle, TEST_ACTOR_ID } from '../test-support/actorTestUtils';
import { resetHandleRegistryForTests } from '../src/session/signedInHandle';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import * as childrenContextExports from '../src/context/ChildrenContext';
import * as classesContextExports from '../src/context/ClassesContext';
import { useAssessableChildren } from '../src/hooks/useAssessableChildren';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { ClassesProvider, useClasses } from '../src/context/ClassesContext';
import { pullPreloadedChildData, persistPreloadedChildData, PULL_SCOPE_COMPLETENESS_LIMIT } from '../src/services/preloadedChildData';
import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createClassEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import { createGroupEaAssignmentsRepository } from '../src/db/repositories/groupEaAssignmentsRepository';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createSyncStateRepository } from '../src/db/repositories/syncStateRepository';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const remoteClass = (id = 'class-remote') => ({
  id, school_id: 'school-1', name: id, grade: 'R', home_language: 'xh',
  academic_year_id: 'year-2026', created_by: 'head-office', row_version: 1,
});
const assignment = (classId = 'class-remote', overrides = {}) => ({
  id: `grant-${classId}`, class_id: classId, ea_user_id: 'user-1', programme_id: 'programme-a',
  unassigned_at: null, assigned_at: '2026-01-01T00:00:00Z', created_by: 'head-office', ...overrides,
});
const control = (id = 'control', classId = 'class-remote') => ({
  id, class_id: classId, first_name: id, last_name: 'Full child', preferred_name: 'Preferred',
  date_of_birth: '2020-03-02', gender: 'female', reading_level: 'Word Reading',
  created_by: 'head-office', row_version: 2,
});
const member = (id = 'membership-control', childId = 'control', classId = 'class-remote', overrides = {}) => ({
  id, child_id: childId, class_id: classId, academic_year_id: 'year-2026',
  enrolled_at: '2026-02-01T08:00:00.000Z', exited_at: null, row_version: 2,
  updated_at: '2026-06-01T08:00:00.000Z', ...overrides,
});
let db;
let repositories;
let dataset;
let client;
let handle;
let signedIn;

// A fake PostgREST boundary that honors the actual query filters and joins.
// SQLite and every repository/provider below remain real.
const makeClient = () => {
  const requests = [];
  const joinedMember = row => ({ ...row, classes: Object.hasOwn(row, 'classes')
    ? row.classes : dataset.classes.find(item => item.id === row.class_id) || null });
  const read = query => {
    const failure = dataset.fail?.(query);
    if (failure) return { data: null, error: failure };
    let rows = [];
    if (query.table === 'staff_programme_assignments') rows = [{ programme_id: 'programme-a', user_id: dataset.userId || 'user-1', ended_at: null }];
    if (query.table === 'class_ea_assignments') rows = dataset.assignments.map(row => ({
      ...row, classes: dataset.classes.find(item => item.id === row.class_id) || null,
    }));
    if (query.table === 'classes') rows = dataset.classes.filter(row => dataset.assignments.some(grant => (
      grant.class_id === row.id && grant.ea_user_id === (dataset.userId || 'user-1') && grant.programme_id === 'programme-a' && grant.unassigned_at == null
    ))).map(row => ({ ...row, class_ea_assignments: dataset.assignments.filter(grant => grant.class_id === row.id && grant.ea_user_id === (dataset.userId || 'user-1') && grant.programme_id === 'programme-a' && grant.unassigned_at == null) }));
    if (query.table === 'children' && !query.select.includes('child_ea_assignments')) rows = dataset.children;
    if (query.table === 'child_class_memberships') rows = dataset.memberships.map(joinedMember);
    for (const [op, key, value] of query.filters) {
      if (key.includes('.') && key !== 'academic_years.is_active') continue;
      if (key === 'academic_years.is_active') {
        rows = rows.filter(row => row.academic_year_id === 'year-2026');
      } else if (op === 'eq') rows = rows.filter(row => row[key] === value);
      else if (op === 'is') rows = rows.filter(row => (row[key] ?? null) === value);
      else if (op === 'in') rows = rows.filter(row => value.includes(row[key]));
    }
    return { data: rows.slice(0, dataset.limit ?? Infinity), error: null };
  };
  return {
    requests,
    rpc: jest.fn(async () => ({ data: {
      schema_version: 1, complete: true, user_id: dataset.userId || 'user-1', active_programme_id: 'programme-a',
      child_ea_assignment_ids: [], assigned_child_ids: [], visible_child_ids: [],
      child_programme_enrollment_ids: [], child_class_membership_ids: [],
      class_ea_assignment_ids: dataset.assignments.filter(row => !row.unassigned_at).map(row => row.id),
      class_ids: dataset.assignments.filter(row => !row.unassigned_at).map(row => row.class_id),
      group_ea_assignment_ids: [], group_ids: [], child_group_membership_ids: [],
    }, error: null })),
    from: table => {
      const query = { table, select: '', filters: [] };
      const builder = {
        select: columns => { query.select = columns; return builder; },
        eq: (key, value) => { query.filters.push(['eq', key, value]); return builder; },
        is: (key, value) => { query.filters.push(['is', key, value]); return builder; },
        in: (key, value) => { query.filters.push(['in', key, value]); return builder; },
        order: () => builder, limit: () => builder,
        then: (resolve, reject) => Promise.resolve().then(() => { requests.push(query); return read(query); }).then(resolve, reject),
      };
      return builder;
    },
  };
};
const pull = () => pullPreloadedChildData({ userId: dataset.userId || 'user-1', supabaseClient: client, enqueueRequest: handle.enqueueRequest });
const persist = pulled => persistPreloadedChildData({ pulled, userId: 'user-1', repositories });
const assessable = () => repositories.children.getAssessableChildren('user-1');
const wrapper = ({ children }) => <SignedInEAContext.Provider value={signedIn}>
  <ChildrenProvider><ClassesProvider>{children}</ClassesProvider></ChildrenProvider>
</SignedInEAContext.Provider>;
const useBoth = () => ({ children: useChildren(), classes: useClasses() });

beforeEach(async () => {
  db = await createMigratedDatabase(runMigrations);
  await seedCoreData(db);
  repositories = {
    children: createChildrenRepository({ database: db }), classes: createClassesRepository({ database: db }),
    classEaAssignments: createClassEaAssignmentsRepository({ database: db }),
    groups: createGroupsRepository({ database: db }), groupEaAssignments: createGroupEaAssignmentsRepository({ database: db }),
    syncOutbox: createSyncOutboxRepository({ database: db }), syncState: createSyncStateRepository({ database: db }),
    schools: { getAll: async () => [] }, classOnboarding: { getPendingClassId: async () => null },
  };
  dataset = { classes: [remoteClass()], assignments: [assignment()], children: [control()], memberships: [member()] };
  client = makeClient();
  handle = { userId: 'user-1', isCurrent: () => true, enqueueRequest: jest.fn(task => task()), dataClient: client };
  const history = () => ({ start: jest.fn(async () => {}), store: { reset: jest.fn() } });
  signedIn = { handle, repositories, services: {
    referenceDataReady: async () => {}, fetchAndCacheSchools: async () => [],
    sessionHistory: history(), assessmentHistory: history(),
  } };
});
afterEach(async () => { jest.restoreAllMocks(); await db.closeAsync(); });

it('downloads a fresh class-only roster without cached assignments and keeps delivery scope unchanged', async () => {
  expect(await repositories.classEaAssignments.getAll()).toEqual([]);
  const pulled = await pull();
  expect(pulled.scopes.classRoster).toEqual(expect.objectContaining({ ok: true, complete: true }));
  await persist(pulled);
  expect(await assessable()).toEqual([expect.objectContaining({ id: 'control', is_delivery: false,
    preferred_name: 'Preferred', date_of_birth: '2020-03-02', grade: 'R', home_language: 'xh' })]);
  expect(await repositories.children.getMyChildren('user-1')).toEqual([]);
  expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  expect(await db.getAllAsync('pragma foreign_key_check')).toEqual([]);
  const rosterQueries = client.requests.filter(query => query.table === 'child_class_memberships' && query.filters.some(([, key]) => key === 'class_id'));
  expect(rosterQueries.map(query => query.filters.find(([, key]) => key === 'class_id')[2])).toEqual([['class-remote']]);
  expect(client.requests.find(query => query.table === 'class_ea_assignments').filters).toEqual(expect.arrayContaining([
    ['eq', 'ea_user_id', 'user-1'], ['eq', 'programme_id', 'programme-a'], ['is', 'unassigned_at', null],
  ]));
});

it('promotes a history reference to a full child through server hydration', async () => {
  await db.runAsync("insert into children (id, first_name, last_name, history_reference, sync_status) values ('control', 'Stub', 'Name', 1, 'synced')");
  await persist(await pull());
  expect(await assessable()).toEqual([expect.objectContaining({ id: 'control', history_reference: 0, first_name: 'control', reading_level: 'Word Reading' })]);
});

it('persists an open prior-year roster child and exposes it in the read model', async () => {
  await db.runAsync("insert into academic_years (id, label, starts_on, ends_on) values ('year-2025', '2025', '2025-01-01', '2025-12-31')");
  dataset.memberships = [member(undefined, undefined, undefined, { academic_year_id: 'year-2025' })];
  await persist(await pull());
  expect(await assessable()).toEqual([expect.objectContaining({ id: 'control', membership_id: 'membership-control' })]);
});

it.each([false, true])('handles a missing joined class for closed history, cached locally: %s', async cached => {
  dataset.memberships.push(member('old-a', 'control', 'class-old', { exited_at: '2026-02-01T08:00:00.000Z', classes: null }));
  if (cached) await repositories.classes.saveClass({ ...remoteClass('class-old'), synced: true });
  const result = await persist(await pull());
  expect(result.scopes.classRoster.complete).toBe(true);
  expect(result.scopes.classRoster.rows.memberships.some(row => row.id === 'old-a')).toBe(cached);
  expect(await db.getFirstAsync("select id from child_class_memberships where id = 'old-a'")).toEqual(cached ? { id: 'old-a' } : null);
  expect((await assessable()).map(row => row.id)).toEqual(['control']);
});

it('marks missing open parents incomplete while retaining safely fetched rows', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  dataset.classes = [];
  const pulled = await pull();
  expect(pulled.scopes.classRoster.complete).toBe(false);
  const result = await persist(pulled);
  expect(result.scopes.classRoster.complete).toBe(false);
  expect(await db.getFirstAsync("select first_name from children where id = 'control'")).toEqual({ first_name: 'control' });
  expect(await db.getAllAsync('pragma foreign_key_check')).toEqual([]);
});

it('keeps downloaded classes and children when the move-membership query errors', async () => {
  dataset.fail = query => query.filters.some(([, key]) => key === 'academic_years.is_active')
    ? { code: '42501', message: 'move query denied' } : null;
  const result = await persist(await pull());
  expect(result.scopes.classRoster).toEqual(expect.objectContaining({ ok: false, complete: false, failureKind: 'query' }));
  expect((await assessable()).map(row => row.id)).toEqual(['control']);
  expect(await db.getFirstAsync("select * from sync_state where scope = 'child_data_pull'")).toBeNull();
});

it('chunks every roster in-list at 200 and treats any query-limit hit as incomplete', async () => {
  dataset.classes = Array.from({ length: 201 }, (_, index) => remoteClass(`class-${index}`));
  dataset.assignments = dataset.classes.map(row => assignment(row.id));
  dataset.children = dataset.classes.map((row, index) => control(`child-${index}`, row.id));
  dataset.memberships = dataset.classes.map((row, index) => member(`member-${index}`, `child-${index}`, row.id));
  const result = await pull();
  expect(result.scopes.classRoster.complete).toBe(true);
  expect(result.scopes.classRoster.rows.children).toHaveLength(201);
  expect(client.requests.flatMap(query => query.filters.filter(([op]) => op === 'in').map(([, , ids]) => ids.length))
    .every(size => size <= 200)).toBe(true);
  dataset.memberships = Array.from({ length: PULL_SCOPE_COMPLETENESS_LIMIT }, (_, index) => member(`limit-${index}`, 'child-0', 'class-0'));
  expect((await pull()).scopes.classRoster.complete).toBe(false);
});

it.each(['children', 'classes'])('converges through the real providers when %s persistence completes first', async first => {
  const held = deferred();
  const reached = deferred();
  if (first === 'children') {
    const save = repositories.classes.saveServerClassRows;
    jest.spyOn(repositories.classes, 'saveServerClassRows').mockImplementation(async rows => {
      if (rows.some(row => row.id === 'class-remote')) { reached.resolve(); await held.promise; }
      return save(rows);
    });
  } else {
    const transaction = repositories.children.withTransaction;
    jest.spyOn(repositories.children, 'withTransaction').mockImplementationOnce(async task => {
      reached.resolve(); await held.promise; return transaction(task);
    });
  }
  const { result } = renderHook(useBoth, { wrapper });
  await act(async () => { await reached.promise; });
  await waitFor(() => expect(first === 'children' ? result.current.children.rosterVersion : result.current.classes.assignmentsVersion).toBeGreaterThan(0));
  await act(async () => { held.resolve(); });
  await waitFor(() => {
    expect(result.current.children.loading).toBe(false);
    expect(result.current.classes.loading).toBe(false);
    expect(result.current.children.rosterVersion).toBeGreaterThan(0);
    expect(result.current.classes.assignmentsVersion).toBeGreaterThan(0);
  });
  expect((await assessable()).map(row => row.id)).toEqual(['control']);
  expect(result.current.children.children).toEqual([]);
  expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
});

it('pulls a newly assigned class after the class provider publishes a changed assignment version', async () => {
  const { result } = renderHook(useBoth, { wrapper });
  await waitFor(() => {
    expect(result.current.children.loading).toBe(false);
    expect(result.current.classes.loading).toBe(false);
    expect(result.current.classes.assignmentsVersion).toBeGreaterThan(0);
    expect(result.current.children.rosterVersion).toBeGreaterThan(0);
  });
  const before = result.current.classes.assignmentsVersion;
  const rosterBefore = result.current.children.rosterVersion;
  dataset.classes.push(remoteClass('class-new'));
  dataset.assignments.push(assignment('class-new'));
  dataset.children.push(control('new-control', 'class-new'));
  dataset.memberships.push(member('new-member', 'new-control', 'class-new'));
  await act(async () => { await result.current.classes.loadClasses(); });
  await waitFor(() => {
    expect(result.current.children.rosterVersion).toBeGreaterThan(rosterBefore);
    expect(result.current.children.loading).toBe(false);
    expect(result.current.classes.loading).toBe(false);
  });
  expect((await assessable()).map(row => row.id).sort()).toEqual(['control', 'new-control']);
  expect(result.current.classes.assignmentsVersion).toBeGreaterThan(before);
  const settled = result.current.classes.assignmentsVersion;
  await act(async () => { await result.current.classes.loadClasses(); });
  expect(result.current.classes.assignmentsVersion).toBe(settled);
});

it('rolls all four row kinds back together if a server child fails local validation', async () => {
  dataset.children[0].gender = 'invalid-gender';
  let caught;
  try { await persist(await pull()); } catch (error) { caught = error; }
  expect(caught?.code).toBe('SQLITE_CONSTRAINT_CHECK');
  expect(await db.getFirstAsync("select id from classes where id = 'class-remote'")).toBeNull();
  expect(await repositories.classEaAssignments.getAll()).toEqual([]);
  expect(await db.getAllAsync('select * from children')).toEqual([]);
  expect(await db.getAllAsync('select * from child_class_memberships')).toEqual([]);
  expect(await db.getFirstAsync('pragma defer_foreign_keys')).toEqual({ defer_foreign_keys: 0 });
  expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
});

it('never queries a roster from broad cached or readable classes when no assignment is held', async () => {
  dataset.assignments = [];
  const result = await persist(await pull());
  expect(result.scopes.classRoster).toEqual(expect.objectContaining({ ok: true, complete: true }));
  expect(result.scopes.classRoster.rows.memberships).toEqual([]);
  expect(client.requests.some(query => query.table === 'child_class_memberships')).toBe(false);
  expect(await assessable()).toEqual([]);
});

it('retains successful roster chunks when another chunk errors', async () => {
  dataset.classes = Array.from({ length: 201 }, (_, index) => remoteClass(`chunk-${index}`));
  dataset.assignments = dataset.classes.map(row => assignment(row.id));
  dataset.children = [control('kept', 'chunk-0')];
  dataset.memberships = [member('kept', 'kept', 'chunk-0')];
  dataset.fail = query => query.table === 'child_class_memberships'
    && query.filters.some(([op, key, ids]) => op === 'in' && key === 'class_id' && ids.includes('chunk-200'))
    ? { code: '42501', message: 'second chunk failed' } : null;
  const result = await persist(await pull());
  expect(result.scopes.classRoster.complete).toBe(false);
  expect(result.scopes.classRoster.rows.children.map(row => row.id)).toEqual(['kept']);
  expect((await assessable()).map(row => row.id)).toEqual(['kept']);
});

it('persists the roster through a real signed-in handle writer facade on a fresh database', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-class-roster-'));
  try {
    const realHandle = await openTestHandle({ userId: TEST_ACTOR_ID, openDatabase: createPathDatabaseOpener(directory) });
    dataset.userId = TEST_ACTOR_ID;
    dataset.assignments = dataset.assignments.map(row => ({ ...row, ea_user_id: TEST_ACTOR_ID }));
    await realHandle.withTransaction(async txn => {
      await seedCoreData(txn);
      await txn.runAsync('update staff_programme_assignments set user_id = ?', TEST_ACTOR_ID);
    });
    await persistPreloadedChildData({ pulled: await pull(), userId: TEST_ACTOR_ID, repositories: realHandle.repositories });
    expect((await realHandle.repositories.children.getAssessableChildren(TEST_ACTOR_ID)).map(row => row.id)).toEqual(['control']);
    expect(await realHandle.repositories.classEaAssignments.getAll()).toEqual([
      expect.objectContaining({ id: 'grant-class-remote', sync_status: 'synced' }),
    ]);
    const reader = await realHandle.getReader();
    expect(await reader.getAllAsync('select * from sync_outbox')).toEqual([]);
  } finally {
    await resetHandleRegistryForTests();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('reloads the assessable hook for each version signal without changing either context list identity', async () => {
  await persist(await pull());
  const childrenValue = { children: [], rosterVersion: 0 };
  const classesValue = { classes: [], assignmentsVersion: 0 };
  jest.spyOn(childrenContextExports, 'useChildren').mockImplementation(() => childrenValue);
  jest.spyOn(classesContextExports, 'useClasses').mockImplementation(() => classesValue);
  const navigation = { isFocused: () => true, addListener: () => () => {} };
  const hookWrapper = ({ children }) => <SignedInEAContext.Provider value={signedIn}>
    <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>
  </SignedInEAContext.Provider>;
  const { result, rerender } = renderHook(useAssessableChildren, { wrapper: hookWrapper });
  await waitFor(() => expect(result.current.all).toHaveLength(1));
  dataset.children[0].first_name = 'After roster version';
  await persist(await pull());
  childrenValue.rosterVersion += 1;
  rerender({});
  await waitFor(() => expect(result.current.all[0].first_name).toBe('After roster version'));
  dataset.children[0].first_name = 'After assignments version';
  await persist(await pull());
  classesValue.assignmentsVersion += 1;
  rerender({});
  await waitFor(() => expect(result.current.all[0].first_name).toBe('After assignments version'));
});
