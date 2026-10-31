export const PROGRAMME_SUBJECTS = Object.freeze({ numeracy: 'maths' });

export function programmeSubject(programme) {
  if (programme == null) return null;
  return Object.prototype.hasOwnProperty.call(PROGRAMME_SUBJECTS, programme.code)
    ? PROGRAMME_SUBJECTS[programme.code] : 'reading';
}

export function isMathsProgramme(programme) {
  return programmeSubject(programme) === 'maths';
}
