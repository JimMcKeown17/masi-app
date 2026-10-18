// __tests__/homeAttentionStore.integration.test.js
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { runRepositoryTransaction } from '../src/db/repositories/repositoryRuntime';
import { createLocalStateRepository } from '../src/db/repositories/localStateRepository';
import { createHomeAttentionStore } from '../src/services/homeAttentionStore';

const entry = { id: 'time-1', user_id: 'user-1', sign_in_time: '2026-10-14T06:00:00.000Z' };

describe('homeAttentionStore', () => {
  let db;
  let store;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    store = createHomeAttentionStore({ database: db, localState: createLocalStateRepository({ database: db }) });
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('records the notice in the EA file and retains owner metadata', async () => {
    const recorded = await runRepositoryTransaction(db, (txn) => store.recordAutoClockOutNotice(txn, {
      entry,
      detectedAt: '2026-10-15T05:30:00.000Z',
    }));

    expect(recorded).toEqual({
      entryId: 'time-1',
      userId: 'user-1',
      signInTime: '2026-10-14T06:00:00.000Z',
      detectedAt: '2026-10-15T05:30:00.000Z',
      dismissedAt: null,
    });
    expect(await store.loadAutoClockOutNotice()).toEqual(recorded);
    expect(await db.getFirstAsync("select key from local_state where key = 'home_attention.auto_clock_out'")).not.toBeNull();
  });

  test('another EA database has no notice or dismissal from the first EA', async () => {
    await runRepositoryTransaction(db, (txn) => store.recordAutoClockOutNotice(txn, {
      entry, detectedAt: '2026-10-15T05:30:00.000Z',
    }));
    await store.dismissAssessmentForDay('2026-10-17');
    const otherDb = createBetterSqliteTestDatabase();
    try {
      await runMigrations(otherDb);
      const other = createHomeAttentionStore({
        database: otherDb, localState: createLocalStateRepository({ database: otherDb }),
      });
      expect(await other.loadAutoClockOutNotice()).toBeNull();
      expect(await other.getAssessmentDismissedOn()).toBeNull();
    } finally {
      await otherDb.closeAsync();
    }
  });

  test('dismiss only applies to the matching entry', async () => {
    await runRepositoryTransaction(db, (txn) => store.recordAutoClockOutNotice(txn, {
      entry: { ...entry, id: 'time-2' },
      detectedAt: '2026-10-15T05:30:00.000Z',
    }));

    expect(await store.dismissAutoClockOutNotice('time-1', '2026-10-15T07:00:00.000Z')).toBe(false);
    expect((await store.loadAutoClockOutNotice()).dismissedAt).toBeNull();

    expect(await store.dismissAutoClockOutNotice('time-2', '2026-10-15T07:00:00.000Z')).toBe(true);
    expect((await store.loadAutoClockOutNotice()).dismissedAt).toBe('2026-10-15T07:00:00.000Z');
  });

  test('assessment dismissal uses the EA file and a local date', async () => {
    expect(await store.getAssessmentDismissedOn()).toBeNull();
    await store.dismissAssessmentForDay('2026-10-17');
    expect(await store.getAssessmentDismissedOn()).toBe('2026-10-17');
    expect(await db.getFirstAsync("select key from local_state where key = 'home_attention.assessment_due_dismissed_on'")).not.toBeNull();
  });
});
