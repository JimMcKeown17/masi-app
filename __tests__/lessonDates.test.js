import { lastSeenLabel, startedLabel } from '../src/utils/lessonDates';

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
  expect(lessonRowDetail('Mon', ['a', 'm'])).toBe('Mon · letters a m');
  expect(lessonRowDetail('Not seen yet', [])).toBe('Not seen yet');
});
