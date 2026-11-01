export const PROGRAMME_SUBJECTS = Object.freeze({ numeracy: 'maths' });

export function programmeSubject(programme) {
  if (programme == null) return null;
  return Object.prototype.hasOwnProperty.call(PROGRAMME_SUBJECTS, programme.code)
    ? PROGRAMME_SUBJECTS[programme.code] : 'reading';
}

export function isMathsProgramme(programme) {
  return programmeSubject(programme) === 'maths';
}

// Signed-in EAs whose latest successful programme read was maths, shared by every screen.
// Hiding literacy is always safe, so a failed read anywhere falls back to known maths; only
// when nothing is known does a screen fall back to literacy behaviour.
const knownMaths = new WeakSet();

/** Record a successful programme read for this signed-in EA and return its subject. */
export function rememberProgrammeSubject(handle, programme) {
  const subject = programmeSubject(programme);
  if (subject === 'maths') knownMaths.add(handle); else knownMaths.delete(handle);
  return subject;
}

export function isKnownMaths(handle) {
  return knownMaths.has(handle);
}
