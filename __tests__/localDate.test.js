import { formatDisplayDate, toLocalDateString } from '../src/utils/localDate';

describe('localDate', () => {
  test.each([
    ['2026-07-11T22:30:00.000Z', '2026-07-12'],
    ['2026-07-12', '2026-07-12'],
    [new Date('2026-07-11T22:30:00.000Z'), '2026-07-12'],
    ['2026-06-30T23:10:00.000Z', '2026-07-01'],
  ])('formats %p as the SAST local date %s', (value, expected) => {
    expect(toLocalDateString(value)).toBe(expected);
  });

  test('formats a display date using local calendar fields', () => {
    expect(formatDisplayDate('2026-07-11T22:30:00.000Z', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })).toBe('Sunday, Jul 12, 2026');
  });
});
