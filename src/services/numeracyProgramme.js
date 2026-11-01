import { getActiveProgrammeGate } from './activeProgrammeGate';
import { isMathsProgramme } from '../utils/programmeSubject';

// Capture requires a fresh programme read; the display subject cache is not authority.
export const confirmNumeracyProgramme = async ({ handle, userId }) => {
  const gate = await getActiveProgrammeGate({ handle, userId });
  return isMathsProgramme(gate.programme) ? gate.programme.id : null;
};
