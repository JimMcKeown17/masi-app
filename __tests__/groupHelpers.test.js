import {
  nextGroupNumber,
  compareGroups,
} from '../src/components/children/GroupPickerBottomSheet';

describe('nextGroupNumber', () => {
  test('returns 1 for empty array', () => {
    expect(nextGroupNumber([])).toBe(1);
  });

  test('returns max + 1 for numbered-only groups', () => {
    expect(
      nextGroupNumber([{ name: 'Group 1' }, { name: 'Group 2' }])
    ).toBe(3);
  });

  test('is monotonic — skips gaps from deletions', () => {
    // Groups 1 and 3 exist (2 was deleted). Next should be 4, not 2.
    expect(
      nextGroupNumber([{ name: 'Group 1' }, { name: 'Group 3' }])
    ).toBe(4);
  });

  test('ignores legacy free-text names', () => {
    expect(
      nextGroupNumber([
        { name: 'Group 1' },
        { name: 'Group 2' },
        { name: 'Lions' },
      ])
    ).toBe(3);
  });

  test('returns 1 when only legacy names exist', () => {
    expect(
      nextGroupNumber([{ name: 'Lions' }, { name: 'Tigers' }])
    ).toBe(1);
  });

  test('handles double-digit numbers correctly', () => {
    expect(
      nextGroupNumber([
        { name: 'Group 9' },
        { name: 'Group 10' },
        { name: 'Group 2' },
      ])
    ).toBe(11);
  });
});

describe('compareGroups', () => {
  const sortNames = (groups) =>
    [...groups].sort(compareGroups).map((g) => g.name);

  test('sorts numbered groups numerically (not lexicographically)', () => {
    expect(
      sortNames([
        { name: 'Group 2' },
        { name: 'Group 10' },
        { name: 'Group 1' },
      ])
    ).toEqual(['Group 1', 'Group 2', 'Group 10']);
  });

  test('places numbered groups before legacy names', () => {
    expect(
      sortNames([
        { name: 'Lions' },
        { name: 'Group 1' },
        { name: 'Tigers' },
        { name: 'Group 2' },
      ])
    ).toEqual(['Group 1', 'Group 2', 'Lions', 'Tigers']);
  });

  test('sorts legacy names alphabetically when no numbered present', () => {
    expect(
      sortNames([{ name: 'Tigers' }, { name: 'Lions' }])
    ).toEqual(['Lions', 'Tigers']);
  });
});
