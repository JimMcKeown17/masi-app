export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const KEY_ERROR = 'formatSessionDate expects a YYYY-MM-DD key';

function utcDate(year, monthIndex, day) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  // Date.UTC treats years 00–99 as 1900–1999; calendar keys name the literal year.
  if (year < 100) date.setUTCFullYear(year, monthIndex, day);
  return date;
}

export function parseDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw new TypeError(KEY_ERROR);
  }
  const [year, month, day] = key.split('-').map(Number);
  const monthIndex = month - 1;
  const date = utcDate(year, monthIndex, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) {
    throw new TypeError(KEY_ERROR);
  }
  return { year, monthIndex, day };
}

export function dateKeyFromParts(year, monthIndex, day) {
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatSessionDate(dateKey, style) {
  const { year, monthIndex, day } = parseDateKey(dateKey);
  const weekday = WEEKDAY_NAMES[utcDate(year, monthIndex, day).getUTCDay()];
  const month = MONTH_NAMES[monthIndex];
  const shortDate = `${weekday.slice(0, 3)} ${day} ${month.slice(0, 3)}`;
  switch (style) {
    case 'field': return `${shortDate} ${String(year).padStart(4, '0')}`;
    case 'fieldToday': return `Today · ${shortDate}`;
    case 'calendarLabel': return `${weekday.slice(0, 3)} ${day} ${month} ${String(year).padStart(4, '0')}`;
    case 'pill': return shortDate;
    case 'spoken': return `${weekday} ${day} ${month}`;
    default: throw new RangeError(`Unknown session date style: ${style}`);
  }
}
