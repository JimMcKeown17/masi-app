jest.mock('../src/db/repositories/repositoryRuntime', () => ({
  resolveDatabase: jest.fn(async () => ({})),
}));
jest.mock('../src/db/repositories/domainRepositoryUtils', () => ({
  getActiveProgrammeId: jest.fn(),
}));
jest.mock('../src/db/repositories/referenceDataRepository', () => ({
  programmesRepository: { getAll: jest.fn() },
}));
jest.mock('../src/db/repositories/sessionsRepository', () => ({
  sessionsRepository: { getSessions: jest.fn() },
}));

import { getSessionsTodayGoal } from '../src/services/sessionsTodayGoal';
import { getActiveProgrammeId } from '../src/db/repositories/domainRepositoryUtils';
import { programmesRepository } from '../src/db/repositories/referenceDataRepository';
import { sessionsRepository } from '../src/db/repositories/sessionsRepository';

describe('getSessionsTodayGoal', () => {
  // 2026-05-29 local
  const now = new Date(2026, 4, 29);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("computes the goal from only today's active-programme sessions", async () => {
    getActiveProgrammeId.mockResolvedValue('prog-literacy');
    programmesRepository.getAll.mockResolvedValue([
      { id: 'prog-literacy', code: 'literacy', daily_session_target: 3, daily_session_ceiling: 5 },
      { id: 'prog-other', code: 'numeracy', daily_session_target: 5, daily_session_ceiling: 5 },
    ]);
    sessionsRepository.getSessions.mockResolvedValue([
      { id: 's1', user_id: 'ea-1', programme_id: 'prog-literacy', session_date: '2026-05-29' }, // today + active → counts
      { id: 's2', user_id: 'ea-1', programme_id: 'prog-literacy', session_date: '2026-05-28' }, // active, yesterday → excluded
      { id: 's3', user_id: 'ea-1', programme_id: 'prog-other', session_date: '2026-05-29' },    // today, other programme → excluded
    ]);

    const goal = await getSessionsTodayGoal({ userId: 'ea-1', now });

    // count === 1 proves only s1 survived the today + active-programme filter
    expect(goal).toEqual({ target: 3, ceiling: 5, count: 1, state: 'below' });
  });

  test("excludes another EA's sessions cached on a shared device", async () => {
    getActiveProgrammeId.mockResolvedValue('prog-literacy');
    programmesRepository.getAll.mockResolvedValue([
      { id: 'prog-literacy', code: 'literacy', daily_session_target: 3, daily_session_ceiling: 5 },
    ]);
    sessionsRepository.getSessions.mockResolvedValue([
      { id: 's1', user_id: 'ea-1', programme_id: 'prog-literacy', session_date: '2026-05-29' }, // mine
      { id: 's2', user_id: 'ea-2', programme_id: 'prog-literacy', session_date: '2026-05-29' }, // another EA, same programme/day
    ]);

    const goal = await getSessionsTodayGoal({ userId: 'ea-1', now });

    expect(goal.count).toBe(1); // only the signed-in EA's session counts toward the ring
  });

  test('returns null when the EA has no active programme', async () => {
    getActiveProgrammeId.mockResolvedValue(null);

    const goal = await getSessionsTodayGoal({ userId: 'ea-1', now });

    expect(goal).toBeNull();
  });
});
