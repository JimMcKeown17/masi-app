import { isGroupMastered } from '../src/utils/groupMastery';

test.each([
  [0, 0, false], [1, 1, true], [1, 2, false], [2, 2, true],   // fewer than 3: everyone
  [2, 3, true], [1, 3, false], [4, 5, true], [3, 5, false],   // all but one
  [5, 6, true], [4, 6, false], [8, 10, true], [7, 10, false], [9, 10, true], // 80%
])('isGroupMastered(%i covered, %i present) is %s', (covered, present, expected) => {
  expect(isGroupMastered(covered, present)).toBe(expected);
});
