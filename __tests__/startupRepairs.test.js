jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createLocalStateRepository } from '../src/db/repositories/localStateRepository';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import {
  createStartupRepairRunner,
  STARTUP_REPAIR_MARKER_KEY,
  STARTUP_REPAIR_VERSION,
} from '../src/services/startupRepairs';

describe('versioned startup repairs', () => {
  let db;
  let localStateRepository;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase(':memory:');
    await runMigrations(db);
    localStateRepository = createLocalStateRepository({ database: db });
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('runs ordered repair recipes exactly once and persists each completed version', async () => {
    const events = [];
    const runner = createStartupRepairRunner({
      database: db,
      localStateRepository,
      repairs: [
        { version: 1, name: 'first', run: jest.fn(async () => events.push('first')) },
        { version: 2, name: 'second', run: jest.fn(async () => events.push('second')) },
      ],
    });

    await expect(runner.run()).resolves.toEqual({
      success: true,
      fromVersion: 0,
      toVersion: 2,
      applied: ['first', 'second'],
    });
    await expect(runner.run()).resolves.toEqual({
      success: true,
      fromVersion: 2,
      toVersion: 2,
      applied: [],
    });

    expect(events).toEqual(['first', 'second']);
    await expect(localStateRepository.get(STARTUP_REPAIR_MARKER_KEY, 0)).resolves.toBe(2);
  });

  test('does not advance past a failed recipe and resumes from the last completed version', async () => {
    const first = jest.fn(async () => true);
    const brokenSecond = jest.fn(async () => {
      throw new Error('repair failed');
    });
    const failedRunner = createStartupRepairRunner({
      database: db,
      localStateRepository,
      repairs: [
        { version: 1, name: 'first', run: first },
        { version: 2, name: 'second', run: brokenSecond },
      ],
    });

    await expect(failedRunner.run()).rejects.toEqual(expect.objectContaining({
      message: 'Startup repair v2 (second) failed: repair failed',
      repairVersion: 2,
      repairName: 'second',
      completedVersion: 1,
    }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(brokenSecond).toHaveBeenCalledTimes(1);
    await expect(localStateRepository.get(STARTUP_REPAIR_MARKER_KEY, 0)).resolves.toBe(1);

    const repairedSecond = jest.fn(async () => true);
    const retryRunner = createStartupRepairRunner({
      database: db,
      localStateRepository,
      repairs: [
        { version: 1, name: 'first', run: first },
        { version: 2, name: 'second', run: repairedSecond },
      ],
    });

    await expect(retryRunner.run()).resolves.toEqual({
      success: true,
      fromVersion: 1,
      toVersion: 2,
      applied: ['second'],
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(repairedSecond).toHaveBeenCalledTimes(1);
  });

  test('rejects duplicate or non-monotonic repair versions before changing data', () => {
    expect(() => createStartupRepairRunner({
      database: db,
      localStateRepository,
      repairs: [
        { version: 2, name: 'second', run: jest.fn() },
        { version: 1, name: 'first', run: jest.fn() },
      ],
    })).toThrow('strictly increasing');
  });

  test('version 1 owns the former per-sync group ownership cutover repair', async () => {
    await seedCoreData(db);
    await createGroupsRepository({ database: db }).saveGroup({
      id: 'group-startup-repair',
      name: 'Group 1',
      staff_id: 'user-1',
      synced: false,
    });
    await db.runAsync(
      'update groups set created_by = null where id = ?',
      'group-startup-repair'
    );

    const runner = createStartupRepairRunner({ database: db, localStateRepository });
    await expect(runner.run()).resolves.toEqual({
      success: true,
      fromVersion: 0,
      toVersion: STARTUP_REPAIR_VERSION,
      applied: ['group_ownership_cutover'],
    });
    await expect(db.getFirstAsync(
      'select created_by from groups where id = ?',
      'group-startup-repair'
    )).resolves.toEqual({ created_by: 'user-1' });
    await expect(localStateRepository.get(STARTUP_REPAIR_MARKER_KEY, 0))
      .resolves.toBe(STARTUP_REPAIR_VERSION);
  });

  test('never downgrades a marker written by newer repair code', async () => {
    await localStateRepository.set(STARTUP_REPAIR_MARKER_KEY, 99);
    const repair = jest.fn(async () => true);
    const runner = createStartupRepairRunner({
      database: db,
      localStateRepository,
      repairs: [{ version: 1, name: 'old-repair', run: repair }],
    });

    await expect(runner.run()).resolves.toEqual({
      success: true,
      fromVersion: 99,
      toVersion: 99,
      applied: [],
    });
    expect(repair).not.toHaveBeenCalled();
    await expect(localStateRepository.get(STARTUP_REPAIR_MARKER_KEY, 0)).resolves.toBe(99);
  });
});
