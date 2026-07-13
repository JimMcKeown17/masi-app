const LOCAL_TIME_ZONE = 'Africa/Johannesburg';

function asDate(value) {
  if (value instanceof Date) return value;
  return new Date(value);
}

export function toLocalDateString(value) {
  if (!value) return null;
  if (typeof value === 'string' && !value.includes('T')) return value.slice(0, 10);

  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function formatDisplayDate(value, options = {}) {
  if (!value) return '';
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    timeZone: LOCAL_TIME_ZONE,
    ...options,
  });
}
