// __tests__/sessionHistoryReaders.test.js
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { getSessionCountRanking } from '../src/utils/dashboardStats';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const family = (id, userId, childId, name) => ({
  session: {
    id, user_id: userId, programme_id: 'programme-a', class_id: 'class-1', session_date: '2026-09-01',
    activities: {}, notes: null, created_at: '2026-09-01T08:00:00+00:00', updated_at: '2026-09-01T08:00:00+00:00',
  },
  attendees: [{
    id: `${id}-a`, session_id: id, child_id: childId, group_id: null, attendance_status: 'present',
    grade_snapshot: null, notes: null, created_at: '2026-09-01T08:00:00+00:00', updated_at: '2026-09-01T08:00:00+00:00',
    child_first_name: name, child_last_name: 'X', child_preferred_name: null,
  }],
});
const pullState = { lastPulledAt: null, cursor: '{}' };

describe('readers after history hydration', () => {
  let db;
  beforeEach(async () => { db = await createMigratedDatabase(runMigrations); await seedCoreData(db); });
  afterEach(async () => { await db.closeAsync(); });

  test('getChildren and getMyChildren never show a history reference child', async () => {
    await createSessionsRepository({ database: db }).saveHistoryPage([family('s-1', 'user-9', 'child-ref', 'Ref')], { scope: 's', pullState });
    const children = createChildrenRepository({ database: db });
    expect((await children.getChildren()).map((c) => c.id)).not.toContain('child-ref');
    expect((await children.getMyChildren('user-1')).map((c) => c.id)).not.toContain('child-ref');
  });

  test('History reads only sessions the EA recorded; the ranking counts every session my children attended', async () => {
    const children = createChildrenRepository({ database: db });
    await children.saveChildRecord({ id: 'child-1', first_name: 'Amahle', last_name: 'D', class_id: 'class-1', synced: true, sync_status: 'synced' });
    const sessions = createSessionsRepository({ database: db });
    await sessions.saveHistoryPage([family('s-mine', 'user-1', 'child-1', 'Amahle'), family('s-prev', 'user-9', 'child-1', 'Amahle')], { scope: 's', pullState });

    const history = await sessions.getSessions({ userId: 'user-1', recordedByUserId: 'user-1', sinceDate: '2026-01-01', order: 'desc' });
    expect(history.map((s) => s.id)).toEqual(['s-mine']);

    const all = await sessions.getSessions({ userId: 'user-1' });
    const ranking = getSessionCountRanking([{ id: 'child-1', first_name: 'Amahle', last_name: 'D' }], all);
    expect(ranking.find((r) => r.child.id === 'child-1').count).toBe(2);
  });
});
