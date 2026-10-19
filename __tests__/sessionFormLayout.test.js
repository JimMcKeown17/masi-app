import { rosterRowHeight, stepScrollOffset } from '../src/utils/sessionFormLayout';

test.each([[1, 64], [1.3, 74], [0.85, 64], [2, 102]])('roster height at font scale %s is %s', (scale, height) => {
  expect(rosterRowHeight(scale)).toBe(height);
});

const layout = { paddingTop: 28, headerHeight: 400, childrenSectionY: 140, bodyHeight: 3 * 64, footerSectionY: { 3: 0, 4: 520 } };
test.each([
  [2, 28 + 140 - 12],
  [3, 28 + 400 + 192 - 12],
  [4, 28 + 400 + 192 + 520 - 12],
])('step %s lands 12 below the header hairline', (step, expected) => {
  expect(stepScrollOffset({ ...layout, step })).toBe(expected);
});

test('an empty roster uses the measured empty-row height', () => {
  expect(stepScrollOffset({ ...layout, step: 3, bodyHeight: 58 })).toBe(28 + 400 + 58 - 12);
});

test('a negative offset clamps to zero', () => {
  expect(stepScrollOffset({ ...layout, step: 2, paddingTop: 0, childrenSectionY: 0 })).toBe(0);
});
