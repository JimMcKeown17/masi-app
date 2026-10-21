import { normalizeToken } from '../../utils/decodability';

export const windowSessions = (sessions, { programmeId, academicYearStart, today }) => {
  const seen = new Set();
  return (Array.isArray(sessions) ? sessions : []).filter((session) => {
    if (seen.has(session?.id)) return false;
    seen.add(session?.id);
    return session?.programme_id === programmeId
      && academicYearStart <= session?.session_date
      && session?.session_date <= today;
  });
};

const newestFirst = (left, right) => {
  for (const key of ['session_date', 'created_at', 'id']) {
    const a = left[key] ?? '';
    const b = right[key] ?? '';
    if (a !== b) return a > b ? -1 : 1;
  }
  return 0;
};

export const sessionsByChild = (windowed) => {
  const ordered = [...windowed].sort(newestFirst);
  return (childId) => ordered.filter((session) => (
    Array.isArray(session.children_ids) && session.children_ids.includes(childId)
  ));
};

export const isLessonPlanSession = (session) => {
  const lesson = session?.activities?.lesson;
  return lesson !== null && typeof lesson === 'object' && !Array.isArray(lesson);
};

export const lessonBlends = (session) => {
  if (!isLessonPlanSession(session)) return [];
  const blends = session.activities.lesson.blends_done;
  return Array.isArray(blends)
    ? blends.filter((text) => typeof text === 'string').map(normalizeToken)
    : [];
};

export const lessonBookIds = (session) => {
  if (!isLessonPlanSession(session)) return [];
  const books = session.activities.lesson.books_read;
  return Array.isArray(books)
    ? books.map((book) => book?.id).filter((id) => typeof id === 'string' && id.length > 0)
    : [];
};
