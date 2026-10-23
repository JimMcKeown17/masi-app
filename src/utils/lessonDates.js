import { formatSessionDate, parseDateKey } from './sessionDateFormat';

const dayNumber = key => {
  const { year, monthIndex, day } = parseDateKey(key);
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime() / 86400000;
};

export const lastSeenLabel = (lastSeenOn, today) => {
  if (lastSeenOn == null) return 'Not seen yet';
  const age = dayNumber(today) - dayNumber(lastSeenOn);
  if (age === 0) return 'Today ✓';
  const shortDate = formatSessionDate(lastSeenOn, 'pill');
  return age > 0 && age <= 6 ? shortDate.split(' ')[0] : shortDate;
};
export const lessonHeaderSeenLabel = (lastSeenOn, today) => {
  if (lastSeenOn == null) return 'not seen yet';
  if (lastSeenOn === today) return 'seen today';
  return `last seen ${lastSeenLabel(lastSeenOn, today)}`;
};
// A group with no suggested letters (isiZulu, a class still to choose) shows only when it was seen.
export const lessonRowDetail = (seen, letters = []) => (letters.length
  ? `${seen} · letters ${letters.join(' ')}` : seen);
export const startedLabel = (lessonDate, today) => lessonDate === today
  ? null : `Started ${formatSessionDate(lessonDate, 'pill')}`;
