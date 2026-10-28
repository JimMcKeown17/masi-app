import { formatChildName, compareChildNames, formatNameList } from '../src/utils/childNames';

test.each([
  [{ first_name: ' Amanda ', last_name: ' Manqina ' }, 'Amanda Manqina'],
  [{ first_name: 'Aviwe', last_name: null }, 'Aviwe'],
  [{ first_name: null, last_name: ' McKeown ' }, 'McKeown'],
  [{}, ''],
])('full names trim missing and supplied parts: %j', (child, expected) => {
  expect(formatChildName(child)).toBe(expected);
});

test('child names use locale order, ignoring accents and case, with surnames breaking ties', () => {
  const names = [
    { first_name: 'Xola' }, { first_name: 'Ênê' }, { first_name: 'Aviwe', last_name: 'Zulu' },
    { first_name: 'aviwe', last_name: 'McKeown' },
  ];
  expect([...names].sort(compareChildNames).map(formatChildName)).toEqual(['aviwe McKeown', 'Aviwe Zulu', 'Ênê', 'Xola']);
  expect(compareChildNames({ first_name: 'Ênê' }, { first_name: 'ene' })).toBe(0);
});

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
