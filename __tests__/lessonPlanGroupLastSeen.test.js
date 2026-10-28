import { groupLastSeenOn, rankGroups } from '../src/lessonPlan/engine';

const base = { today: '2026-10-22', academicYearStart: '2026-01-15', programmeId: 'p' };
const session = (id, date, childIds, programmeId = 'p') => ({
  id, session_date: date, children_ids: childIds, programme_id: programmeId,
});

test('groupLastSeenOn is the date rankGroups reports for the same members', () => {
  const sessions = [
    session('s1', '2026-10-19', ['c1']),
    session('s2', '2026-10-20', ['c2', 'c9']),
    session('later', '2026-10-23', ['c1']), // after today
    session('other-programme', '2026-10-21', ['c1'], 'q'),
    session('last-year', '2025-11-30', ['c1']),
  ];
  const groups = [{ id: 'g', name: 'Group 1', memberIds: ['c1', 'c2'], languageCode: null, pack: null }];
  const [row] = rankGroups({ ...base, groups, children: {}, sessions }).rows;
  expect(row.lastSeenOn).toBe('2026-10-20');
  expect(groupLastSeenOn({ ...base, sessions, memberIds: ['c1', 'c2'] })).toBe(row.lastSeenOn);
});

test('groupLastSeenOn is null when none of the children were seen this year', () => {
  expect(groupLastSeenOn({ ...base, sessions: [session('s', '2026-10-01', ['other'])], memberIds: ['c1'] })).toBeNull();
  expect(groupLastSeenOn({ ...base, sessions: [], memberIds: [] })).toBeNull();
});
