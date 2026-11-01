import { v5 as uuidv5 } from 'uuid';

export const MASI_DOMAIN_ID_NAMESPACE = '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2';
export const SKILL_MASTERY_ID_NAMESPACE = '20002406-1d97-4087-b350-a8d41515dd39';

export const deterministicDomainId = (...parts) => uuidv5(
  parts.map((part) => String(part ?? '')).join('\u001f'),
  MASI_DOMAIN_ID_NAMESPACE
);

export const letterMasteryDomainId = ({ childId, letter, language }) => (
  deterministicDomainId('letter_mastery', String(childId).toLowerCase(), letter, language)
);

export const skillMasteryDomainId = (childId, stepKey) => uuidv5(
  ['skill_mastery', String(childId).toLowerCase(), stepKey].join('\u001f'),
  SKILL_MASTERY_ID_NAMESPACE
);
