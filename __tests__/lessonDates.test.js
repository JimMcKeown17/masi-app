import { lastSeenLabel, startedLabel, lessonHeaderSeenLabel, joinDetail } from '../src/utils/lessonDates';

const today = '2026-10-22';
test('today reads Today ✓', () => expect(lastSeenLabel(today, today)).toBe('Today ✓'));
test("yesterday reads the weekday", () => expect(lastSeenLabel('2026-10-21', today)).toBe('Wed'));
test('6 days ago reads the weekday', () => expect(lastSeenLabel('2026-10-16', today)).toBe('Fri'));
test('7 days ago reads the short date', () => expect(lastSeenLabel('2026-10-15', today)).toBe('Thu 15 Oct'));
test('never reads Not seen yet', () => expect(lastSeenLabel(null, today)).toBe('Not seen yet'));
test('startedLabel is null for today', () => expect(startedLabel(today, today)).toBeNull());
test('startedLabel keeps the start date', () => expect(startedLabel('2026-10-19', today)).toBe('Started Mon 19 Oct'));
test('lastSeenLabel handles a year boundary without a timezone shift', () => {
  expect(lastSeenLabel('2025-12-31', '2026-01-01')).toBe('Wed');
});
test('lessonRowDetail leaves out letters when there are none', () => {
  const { lessonRowDetail } = require('../src/utils/lessonDates');
  expect(lessonRowDetail('Mon', ['a', 'm'])).toBe('Mon ·\u00a0letters\u00a0a\u00a0m');
  expect(lessonRowDetail('Not seen yet', [])).toBe('Not\u00a0seen\u00a0yet');
});


test.each([
  [null, 'not seen yet'],
  ['2026-10-22', 'seen today'],
  ['2026-10-19', 'last seen Mon'],
  ['2026-10-16', 'last seen Fri'],
  ['2026-10-15', 'last seen Thu 15 Oct'],
  ['2026-10-12', 'last seen Mon 12 Oct'],
])('lesson header labels %s as %s', (seen, expected) => {
  expect(lessonHeaderSeenLabel(seen, today)).toBe(expected);
});

test('joinDetail binds each dot to the next detail, keeps details whole and skips missing parts', () => {
  const detail = joinDetail(['Gr 2', null, 'isiXhosa', undefined, '', 'last seen Mon']);
  expect(detail).toBe('Gr\u00a02 ·\u00a0isiXhosa ·\u00a0last\u00a0seen\u00a0Mon');
  // The only break opportunities are before a dot, so no line can end on one.
  expect(detail).not.toMatch(/· /);
  expect(detail.split(' ')).toEqual(['Gr\u00a02', '·\u00a0isiXhosa', '·\u00a0last\u00a0seen\u00a0Mon']);
  expect(joinDetail([])).toBe('');
});
