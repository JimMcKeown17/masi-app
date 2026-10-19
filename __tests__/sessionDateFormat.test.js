import { formatSessionDate, parseDateKey, dateKeyFromParts } from '../src/utils/sessionDateFormat';

test.each([
  ['field', 'Mon 12 Oct 2026', '2026-10-12'],
  ['fieldToday', 'Today · Thu 15 Oct', '2026-10-15'],
  ['calendarLabel', 'Thu 15 October 2026', '2026-10-15'],
  ['pill', 'Tue 13 Oct', '2026-10-13'],
  ['spoken', 'Tuesday 13 October', '2026-10-13'],
  ['field', 'Fri 1 Jan 2027', '2027-01-01'],
])('%s → %s', (style, expected, key) => {
  expect(formatSessionDate(key, style)).toBe(expected);
});

test('never reads the device timezone', () => {
  const original = process.env.TZ;
  try {
    for (const tz of ['Pacific/Auckland', 'America/New_York', 'Africa/Johannesburg']) {
      process.env.TZ = tz;
      expect(formatSessionDate('2026-10-18', 'field')).toBe('Sun 18 Oct 2026');
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test.each([[new Date(2026, 9, 18)], ['2026-10-18T00:00:00Z'], ['18/10/2026'], ['2026-02-30'], [null]])(
  'rejects %p', (input) => {
    expect(() => formatSessionDate(input, 'field')).toThrow(TypeError);
    expect(() => formatSessionDate(input, 'field')).toThrow('formatSessionDate expects a YYYY-MM-DD key');
    expect(() => parseDateKey(input)).toThrow(TypeError);
  },
);
test('rejects an unknown style', () => {
  expect(() => formatSessionDate('2026-10-18', 'long')).toThrow(RangeError);
});
test('key helpers round-trip and zero-pad', () => {
  expect(dateKeyFromParts(2026, 0, 5)).toBe('2026-01-05');
  expect(parseDateKey('2026-12-31')).toEqual({ year: 2026, monthIndex: 11, day: 31 });
});

describe('formatSessionDate pill and spoken styles', () => {
  const originalTimeZone = process.env.TZ;
  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  test.each(['Africa/Johannesburg', 'Pacific/Auckland', 'America/New_York'])('is the same day in %s', (zone) => {
    process.env.TZ = zone;
    expect(formatSessionDate('2026-10-13', 'pill')).toBe('Tue 13 Oct');
    expect(formatSessionDate('2026-10-13', 'spoken')).toBe('Tuesday 13 October');
    expect(formatSessionDate('2026-10-18', 'pill')).toBe('Sun 18 Oct');
  });
});
