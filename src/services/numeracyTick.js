import { createSkillMasteryRepository } from '../db/repositories/skillMasteryRepository';
import { hasActiveProgrammeAssignment, getProgrammeById } from '../db/repositories/domainRepositoryUtils';
import { isMathsProgramme } from '../utils/programmeSubject';

export class NumeracyTickError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NumeracyTickError';
    this.code = code;
  }
}

export async function tickStepNow({ handle, programmeId, childId, stepKey, confirmed }) {
  const mastery = createSkillMasteryRepository({ database: handle });
  return handle.withTransaction(async transaction => {
    if (!await hasActiveProgrammeAssignment(transaction, handle.userId, programmeId)
      || !isMathsProgramme(await getProgrammeById(transaction, programmeId))) {
      throw new NumeracyTickError('PROGRAMME_CHANGED');
    }
    return mastery.setSkillMastery({ childId, stepKey, confirmed, programmeId, transaction });
  });
}
