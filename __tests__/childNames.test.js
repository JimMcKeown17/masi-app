import { formatNameList } from '../src/utils/childNames';

test.each([
  [[], '', ''],
  [['Anelisa'], 'Anelisa', 'Anelisa'],
  [['Anelisa', 'Athenkosi'], 'Anelisa & Athenkosi', 'Anelisa and Athenkosi'],
  [['A', 'B', 'C'], 'A, B & C', 'A, B and C'],
  [['A', 'B', 'C', 'D', 'E'], 'A, B, C, D & E', 'A, B, C, D and E'],
])('%j', (names, written, spoken) => {
  expect(formatNameList(names)).toBe(written);
  expect(formatNameList(names, { spoken: true })).toBe(spoken);
});
