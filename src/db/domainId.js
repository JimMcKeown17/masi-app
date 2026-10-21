import { v5 as uuidv5 } from 'uuid';

export const MASI_DOMAIN_ID_NAMESPACE = '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2';

export const deterministicDomainId = (...parts) => uuidv5(
  parts.map((part) => String(part ?? '')).join('\u001f'),
  MASI_DOMAIN_ID_NAMESPACE
);

export const letterMasteryDomainId = ({ childId, letter, language }) => (
  deterministicDomainId('letter_mastery', String(childId).toLowerCase(), letter, language)
);
