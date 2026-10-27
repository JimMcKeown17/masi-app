import { UPDATE_APP_LETTERS_MESSAGE } from './letterOrders';
import { formatSessionDate, parseDateKey } from './sessionDateFormat';

// Each dot binds to the detail after it and spaces inside a detail never break, so a wrapped
// line starts with "· 2-letter" instead of ending on a dot or splitting "15 min".
export const joinDetail = parts => parts.filter(Boolean)
  .map(part => String(part).replace(/ /g, '\u00a0')).join(' ·\u00a0');

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
// The update message is a sentence, so it wraps between its words; only its dot stays bound.
export const lessonRowDetail = (seen, letters = [], { needsAppUpdate } = {}) => needsAppUpdate
  ? [joinDetail([seen]), UPDATE_APP_LETTERS_MESSAGE].filter(Boolean).join(' · ')
  : joinDetail([seen, letters.length ? `letters ${letters.join(' ')}` : null]);
export const startedLabel = (lessonDate, today) => lessonDate === today
  ? null : `Started ${formatSessionDate(lessonDate, 'pill')}`;
