import { getDistinctSessionCount, getSessionCountRanking } from '../src/utils/dashboardStats';

describe('session count ranking totals', () => {
  test('20 two-child sessions across 9 children and 4 unattended children stay 20 sessions', () => {
    const children = Array.from({ length: 13 }, (_, i) => ({ id: `child-${i}` }));
    const sessions = Array.from({ length: 20 }, (_, i) => ({
      id: `session-${i}`, children_ids: [`child-${i % 9}`, `child-${(i + 1) % 9}`],
    }));
    const ranking = getSessionCountRanking(children, sessions);
    const childSessions = ranking.reduce((sum, row) => sum + row.count, 0);

    expect(getDistinctSessionCount(children, sessions)).toBe(20);
    expect(childSessions).toBe(40);
    expect(Math.round((childSessions / children.length) * 10) / 10).toBe(3.1);
    expect(ranking.filter(row => row.count === 0)).toHaveLength(4);
  });

  test('counts a shared session once and excludes sessions outside the listed children', () => {
    const children = [{ id: 'child-a' }, { id: 'child-b' }];
    const sessions = [
      { id: 'shared', children_ids: ['child-a', 'child-b'] },
      { id: 'shared', children_ids: ['child-a'] },
      { id: 'other', children_ids: ['outside-roster'] },
      { id: 'empty', children_ids: [] },
      { id: 'no-attendees' },
    ];
    expect(getDistinctSessionCount(children, sessions)).toBe(1);
    expect(getDistinctSessionCount([], sessions)).toBe(0);
    expect(getDistinctSessionCount(children, [])).toBe(0);
  });
});
