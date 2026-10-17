// __tests__/homeAttentionStore.integration.test.js
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { runRepositoryTransaction } from '../src/db/repositories/repositoryRuntime';
import { createHomeAttentionStore } from '../src/services/homeAttentionStore';

const entry = { id: 'time-1', user_id: 'user-1', sign_in_time: '2026-10-14T06:00:00.000Z' };

describe('homeAttentionStore', () => {
  let db;
  let store;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    store = createHomeAttentionStore({ database: db });
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('records the notice under the entry owner and loads it back', async () => {
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
    expect(await store.loadAutoClockOutNotice('user-1')).toEqual(recorded);
    expect(await store.loadAutoClockOutNotice('user-2')).toBeNull();
    expect(await store.loadAutoClockOutNotice(null)).toBeNull();
  });

  test('dismiss only applies to the matching entry', async () => {
    await runRepositoryTransaction(db, (txn) => store.recordAutoClockOutNotice(txn, {
      entry: { ...entry, id: 'time-2' },
      detectedAt: '2026-10-15T05:30:00.000Z',
    }));

    expect(await store.dismissAutoClockOutNotice('user-1', 'time-1', '2026-10-15T07:00:00.000Z')).toBe(false);
    expect((await store.loadAutoClockOutNotice('user-1')).dismissedAt).toBeNull();

    expect(await store.dismissAutoClockOutNotice('user-1', 'time-2', '2026-10-15T07:00:00.000Z')).toBe(true);
    expect((await store.loadAutoClockOutNotice('user-1')).dismissedAt).toBe('2026-10-15T07:00:00.000Z');
  });

  test('assessment dismissal is stored per user as a local date', async () => {
    expect(await store.getAssessmentDismissedOn('user-1')).toBeNull();
    await store.dismissAssessmentForDay('user-1', '2026-10-17');
    expect(await store.getAssessmentDismissedOn('user-1')).toBe('2026-10-17');
    expect(await store.getAssessmentDismissedOn('user-2')).toBeNull();
  });
});
