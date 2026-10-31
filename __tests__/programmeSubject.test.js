import { PROGRAMME_SUBJECTS, programmeSubject, isMathsProgramme } from '../src/utils/programmeSubject';

test('numeracy → maths', () => {
  expect(programmeSubject({ code: 'numeracy' })).toBe('maths');
  expect(isMathsProgramme({ code: 'numeracy' })).toBe(true);
  expect(Object.isFrozen(PROGRAMME_SUBJECTS)).toBe(true);
});
test.each(['literacy', 'zazi_izandi', 'unknown', 'toString'])('%s → reading', code => {
  expect(programmeSubject({ code })).toBe('reading');
  expect(isMathsProgramme({ code })).toBe(false);
});
test.each([null, undefined])('%s → null', programme => {
  expect(programmeSubject(programme)).toBeNull();
  expect(isMathsProgramme(programme)).toBe(false);
});
