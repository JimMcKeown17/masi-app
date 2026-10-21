import { sessionsByChild, windowSessions } from './history';
import { planLetters, usablePack } from './letters';

const compareValues = (left, right) => {
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

const compareRows = (left, right) => (
  Number(right.eligible) - Number(left.eligible)
  || compareValues(left.row.lastSeenOn ?? '', right.row.lastSeenOn ?? '')
  || left.row.sessionsThisWeek - right.row.sessionsThisWeek
  || compareValues(left.group.displayNumber ?? Infinity, right.group.displayNumber ?? Infinity)
  || compareValues(left.group.name, right.group.name)
  || compareValues(left.group.id, right.group.id)
);

const mondayOf = (today) => {
  const dayStart = Date.parse(`${today}T00:00:00Z`);
  const daysSinceMonday = (new Date(dayStart).getUTCDay() + 6) % 7;
  return new Date(dayStart - daysSinceMonday * 86400000).toISOString().slice(0, 10);
};

export const rankGroups = ({ today, academicYearStart, programmeId, groups, children, sessions }) => {
  const windowed = windowSessions(sessions, { programmeId, academicYearStart, today });
  const childSessions = sessionsByChild(windowed);
  const monday = mondayOf(today);
  const ranked = groups.map((group) => {
    const memberIds = [...new Set(group.memberIds)];
    const members = new Set(memberIds);
    const attended = windowed.filter((session) => (
      Array.isArray(session.children_ids) && session.children_ids.some((id) => members.has(id))
    ));
    const lastSeenOn = attended.reduce((latest, session) => (
      latest === null || session.session_date > latest ? session.session_date : latest
    ), null);
    const taughtToday = lastSeenOn === today;
    const letters = planLetters({
      languageCode: group.languageCode,
      pack: usablePack(group),
      alphabet: null,
      children: memberIds.map((id) => children[id] ?? {
        id,
        readingLevel: null,
        knownLetters: [],
        historyComplete: false,
        masteryComplete: false,
      }),
      childSessions,
    });

    return {
      group,
      eligible: memberIds.length > 0 && !taughtToday,
      row: {
        groupId: group.id,
        lastSeenOn,
        taughtToday,
        sessionsThisWeek: attended.filter((session) => session.session_date >= monday).length,
        nextLetters: letters.suggested,
        lettersReason: letters.reason,
      },
    };
  }).sort(compareRows);

  return {
    upNextGroupId: ranked[0]?.eligible ? ranked[0].row.groupId : null,
    rows: ranked.map(({ row }) => row),
  };
};
