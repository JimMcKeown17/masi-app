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
