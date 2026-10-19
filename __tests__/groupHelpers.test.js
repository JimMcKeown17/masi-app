import {
  nextGroupNumber,
  compareGroups,
} from '../src/utils/groupHelpers';

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

import { getGroupDotColor } from '../src/utils/groupHelpers';
import { GROUP_DOT_COLORS } from '../src/constants/groupColors';

describe('getGroupDotColor', () => {
  test('cycles six colours', () => {
    expect(getGroupDotColor(6)).toBe(getGroupDotColor(0));
    expect(getGroupDotColor(7)).toBe(getGroupDotColor(1));
    expect(new Set([0, 1, 2, 3, 4, 5].map(getGroupDotColor)).size).toBe(6);
  });
  test('never returns the dropped pink or amber', () => {
    for (let i = 0; i < 24; i += 1) {
      expect(['#C62828', '#F57F17']).not.toContain(getGroupDotColor(i));
    }
  });
  test('a negative or non-finite index falls back to the first colour', () => {
    expect(getGroupDotColor(-1)).toBe(GROUP_DOT_COLORS[0]);
    expect(getGroupDotColor(NaN)).toBe(GROUP_DOT_COLORS[0]);
  });
});

// Pin the public API so the retired palette cannot acquire new consumers.
test('only the dot colour helper is exported', () => {
  expect(Object.keys(require('../src/utils/groupHelpers')).sort()).toEqual([
    'compareGroups', 'getGroupDotColor', 'nextGroupNumber',
  ]);
});
