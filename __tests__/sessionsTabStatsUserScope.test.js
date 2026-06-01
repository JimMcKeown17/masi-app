import { getSessionsTabStats, toDateString } from '../src/utils/dashboardStats';

// #10: on a shared/rotated device another EA's same-programme sessions stay cached
// locally after sign-out. getSessions is programme-scoped, so those rows reach the
// Sessions tab stats. The stats must count only the signed-in EA's sessions
// (mirroring the Sessions Today ring fix in #4). The user filter applies to every
// aggregation the function computes, so asserting thisMonth/avgPerChild proves the
// scoping for thisWeek / not-seen too (they iterate the same filtered list).

describe('getSessionsTabStats — scoped to the signed-in EA (#10)', () => {
  const today = toDateString(new Date());
  const children = [{ id: 'c1' }, { id: 'c2' }];
  const mixed = [
    { user_id: 'ea-1', session_date: today, children_ids: ['c1'] },
    { user_id: 'ea-2', session_date: today, children_ids: ['c2'] }, // another EA, same programme, cached locally
  ];

  test("excludes another EA's same-programme sessions when a userId is given", () => {
    const stats = getSessionsTabStats(mixed, children, 'ea-1');

    expect(stats.thisMonth).toBe(1);     // only ea-1's session, not ea-2's
    expect(stats.avgPerChild).toBe(0.5); // 1 session / 2 children
  });

  test('without a userId, counts all sessions (single-user devices unaffected)', () => {
    const stats = getSessionsTabStats(mixed, children);

    expect(stats.thisMonth).toBe(2);
  });
});
