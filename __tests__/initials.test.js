import { getInitials } from '../src/utils/initials';

describe('getInitials', () => {
  test.each([
    ['Amahle', 'Dlamini', 'AD'],
    ['amahle', 'dlamini', 'AD'],
    ['  sipho ', ' ndlovu', 'SN'],
    ['Lwazi', '', 'L'],
    ['Lwazi', null, 'L'],
    ['', 'Booi', 'B'],
    [undefined, undefined, ''],
    ['   ', '  ', ''],
  ])('getInitials(%p, %p) is %p', (first, last, expected) => {
    expect(getInitials(first, last)).toBe(expected);
  });
});
