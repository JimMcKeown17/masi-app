jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {} }));

import { isCoverageWalkComplete, isSessionHistoryComplete } from '../src/services/pullCoverage';
import { runMigrations } from '../src/db/migrations';
import { runSessionHistoryPull, createSessionHistoryState } from '../src/services/sessionHistoryPull';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const walked = { windowStart: '2026-01-15', complete: true, lastFailureAt: null, rescanChildIds: ['child-a', 'child-b'] };

test('a finished walk covering every present child of this year is complete', () => {
  expect(isCoverageWalkComplete(walked, { childIds: ['child-a', 'child-b'], windowStart: '2026-01-15' })).toBe(true);
  expect(isCoverageWalkComplete(JSON.stringify(walked), { childIds: ['child-a'] })).toBe(true);
});
test('an unfinished walk, a failure since the last success, last year, or an uncovered child is not', () => {
  expect(isCoverageWalkComplete({ ...walked, complete: false }, { childIds: ['child-a'] })).toBe(false);
  expect(isCoverageWalkComplete({ ...walked, lastFailureAt: '2026-10-20T07:00:00.000Z' }, { childIds: ['child-a'] })).toBe(false);
  expect(isCoverageWalkComplete(walked, { childIds: ['child-a'], windowStart: '2027-01-13' })).toBe(false);
  expect(isCoverageWalkComplete(walked, { childIds: ['child-a', 'child-c'] })).toBe(false);
});
test('anything malformed fails closed', () => {
  for (const bad of [null, undefined, '', 'not json', '[]', 42, { complete: true }]) {
    expect(isCoverageWalkComplete(bad, { childIds: ['child-a'] })).toBe(false);
  }
});

test('malformed coverage fields fail closed even with no present children', () => {
  for (const patch of [{ complete: 1 }, { lastFailureAt: undefined }, { rescanChildIds: null },
    { rescanChildIds: ['child-a', null] }, { rescanChildIds: 'child-a' }]) {
    expect(isCoverageWalkComplete({ ...walked, ...patch })).toBe(false);
  }
  expect(isCoverageWalkComplete({ ...walked, windowStart: undefined })).toBe(true);
});

describe('isSessionHistoryComplete', () => {
  let db;
  const wall = Date.parse('2026-10-20T08:00:00.000Z');
  const addDeliveryChild = async (childId) => {
    await db.runAsync("insert into children (id, first_name, last_name, class_id, sync_status) values (?, 'New', 'Child', 'class-1', 'synced')", childId);
    await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, sync_status) values (?, 'user-1', ?, 'synced')", `cea-${childId}`, childId);
  };
  const pull = (client) => runSessionHistoryPull({
    userId: 'user-1', force: true,
    deps: { state: createSessionHistoryState(), database: db, client, enqueueRequest: (task) => task(),
      wallNow: () => wall, random: () => 0.5 },
  });
  const emptyServer = { rpc: () => ({ abortSignal: () => Promise.resolve({ data: [], error: null }) }) };
  const failingServer = { rpc: () => ({ abortSignal: () => Promise.resolve({ data: null, error: { message: 'boom', code: 'XX000' } }) }) };

  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    await addDeliveryChild('child-a');
    await addDeliveryChild('child-b');
    await db.runAsync("insert into children (id, first_name, last_name, class_id, sync_status) values ('child-g', 'Group', 'Only', 'class-1', 'synced')");
  });
  afterEach(async () => { await db.closeAsync(); });

  const complete = (childIds) => isSessionHistoryComplete({ database: db, userId: 'user-1', childIds });

  test('before any walk, history is incomplete', async () => {
    expect(await complete(['child-a'])).toBe(false);
  });
  test('a finished walk makes its children complete, and only them', async () => {
    await pull(emptyServer);
    expect(await complete(['child-a', 'child-b'])).toBe(true);
    expect(await complete(['child-a', 'child-g'])).toBe(false); // uncovered child (group-only member)
  });
  test('a child newly assigned between walks is incomplete until the next walk', async () => {
    await pull(emptyServer);
    await addDeliveryChild('child-c');
    expect(await complete(['child-a', 'child-c'])).toBe(false);
    await pull(emptyServer);
    expect(await complete(['child-a', 'child-c'])).toBe(true);
  });
  test('a year rollover before the next pull makes last year’s walk incomplete', async () => {
    await pull(emptyServer);
    await db.runAsync('update academic_years set is_active = 0');
    await db.runAsync(`insert into academic_years (id, label, starts_on, ends_on, is_active)
      values ('year-2027', '2027', '2027-01-13', '2027-12-10', 1)`);
    expect(await complete(['child-a'])).toBe(false);
    expect(await isSessionHistoryComplete({ database: db, userId: 'user-1', childIds: ['child-a'], academicYearStart: '2026-01-15' })).toBe(true); // explicit year wins
    await pull(emptyServer);
    expect(await complete(['child-a'])).toBe(true);
  });
  test('a failure since the last success is incomplete until a page succeeds', async () => {
    await pull(emptyServer);
    await pull(failingServer);
    expect(await complete(['child-a'])).toBe(false);
    await pull(emptyServer);
    expect(await complete(['child-a'])).toBe(true);
  });
  test('another programme’s walk does not count', async () => {
    await pull(emptyServer);
    expect(await isSessionHistoryComplete({ database: db, userId: 'user-1', programmeId: 'programme-b', childIds: ['child-a'] })).toBe(false);
  });

  test('missing programme or academic year is incomplete', async () => {
    await pull(emptyServer);
    await db.runAsync("update staff_programme_assignments set ended_at = '2026-10-20T08:00:00.000Z'");
    expect(await complete(['child-a'])).toBe(false);
    expect(await isSessionHistoryComplete({ database: db, userId: 'user-1', programmeId: 'programme-a' })).toBe(true);
    await db.runAsync('update academic_years set is_active = 0');
    expect(await isSessionHistoryComplete({ database: db, userId: 'user-1', programmeId: 'programme-a' })).toBe(false);
  });

  test('empty childIds gives the walk-level answer without changing stored state', async () => {
    expect(await complete([])).toBe(false);
    await pull(emptyServer);
    const before = await db.getAllAsync('select * from sync_state');
    expect(await complete([])).toBe(true);
    expect(await complete(['child-g'])).toBe(false);
    expect(await db.getAllAsync('select * from sync_state')).toEqual(before);
  });
});
