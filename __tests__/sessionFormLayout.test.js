import { rosterRowHeight } from '../src/utils/sessionFormLayout';

test.each([[1, 64], [1.3, 74], [0.85, 64], [2, 102]])('roster height at font scale %s is %s', (scale, height) => {
  expect(rosterRowHeight(scale)).toBe(height);
});
