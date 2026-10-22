import { serverTimestampMicros, compareServerTimestamps, compareServerTuples } from '../src/utils/serverTimestamps';

const base = Date.UTC(2026, 9, 20, 8, 0, 0) * 1000;
test('server timestamps preserve exact microseconds and normalize offsets', () => {
  expect(serverTimestampMicros('2026-10-20T08:00:00.123456+00:00')).toBe(base + 123456);
  expect(serverTimestampMicros('2026-10-20T08:00:00Z')).toBe(base);
  expect(serverTimestampMicros('2026-10-20T10:00:00.5+02:00')).toBe(base + 500000);
  expect(serverTimestampMicros('nope')).toBeNull();
  expect(compareServerTimestamps('2026-10-20T08:00:00.000001+00:00', '2026-10-20T08:00:00Z')).toBe(1);
  expect(compareServerTuples(['2026-10-20T08:00:00Z', 'b0000000-0000-4000-8000-000000000000'],
    ['2026-10-20T08:00:00+00:00', 'a0000000-0000-4000-8000-000000000000'])).toBe(1);
});
test.each([null, undefined, 123, '', 'nope', '2026-02-30T08:00:00Z', '2026-10-20T08:00:00.1234567Z',
  '2026-10-20T08:60:00Z', '2026-10-20T08:00:00+02:60', '2026-10-20T08:00:00', '9999-01-01T00:00:00Z', '0001-01-01T00:00:00Z'])
('invalid or unsafe server timestamp returns null: %j', (value) => {
  expect(serverTimestampMicros(value)).toBeNull();
  expect(compareServerTimestamps(value, '2026-10-20T08:00:00Z')).toBeNull();
});
test('comparisons handle negative epochs, equivalent offsets, and lowercase UUID ties', () => {
  expect(serverTimestampMicros('1969-12-31T23:59:59.999999Z')).toBe(-1);
  expect(serverTimestampMicros('2026-10-20T07:00:00.000001-01:00')).toBe(base + 1);
  expect(compareServerTimestamps('2026-10-20T10:00:00+02:00', '2026-10-20T08:00:00Z')).toBe(0);
  expect(compareServerTimestamps('2026-10-20T08:00:00Z', '2026-10-20T08:00:00.000001Z')).toBe(-1);
  expect(compareServerTuples(['2026-10-20T08:00:00Z', 'ABC'], ['2026-10-20T08:00:00Z', 'abc'])).toBe(0);
  expect(compareServerTuples([null, 'a'], ['2026-10-20T08:00:00Z', 'b'])).toBeNull();
});
