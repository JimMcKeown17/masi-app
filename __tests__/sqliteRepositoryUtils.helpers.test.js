import { chunkArray, sqlPlaceholders } from '../src/db/repositories/sqliteRepositoryUtils';

describe('chunkArray', () => {
  it('splits into chunks of the given size', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('returns [] for an empty array', () => {
    expect(chunkArray([], 200)).toEqual([]);
  });
  it('defaults to a 200 chunk size', () => {
    const arr = Array.from({ length: 201 }, (_, i) => i);
    const chunks = chunkArray(arr);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(200);
    expect(chunks[1]).toHaveLength(1);
  });
});

describe('sqlPlaceholders', () => {
  it('produces N comma-separated ? marks', () => {
    expect(sqlPlaceholders(3)).toBe('?, ?, ?');
  });
  it('returns an empty string for 0', () => {
    expect(sqlPlaceholders(0)).toBe('');
  });
});

describe('chunkArray input validation', () => {
  it.each([0, -1, 1.5, NaN, Infinity])('throws RangeError for invalid size %p', (bad) => {
    expect(() => chunkArray([1, 2, 3], bad)).toThrow(RangeError);
  });
  it('still chunks normally with a valid size', () => {
    expect(chunkArray([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
});

describe('sqlPlaceholders input validation', () => {
  it.each([-1, 2.5, NaN])('throws RangeError for invalid count %p', (bad) => {
    expect(() => sqlPlaceholders(bad)).toThrow(RangeError);
  });
  it('still returns "" for 0 (valid)', () => {
    expect(sqlPlaceholders(0)).toBe('');
  });
});
