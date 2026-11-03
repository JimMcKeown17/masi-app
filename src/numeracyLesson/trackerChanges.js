import { STEP_KEY_PATTERN } from '../db/repositories/skillMasteryRepository';

export const toggleStepChange = ({ storedConfirmed, locked, pending, stepKey, nowIso }) => {
  if (locked) return pending;
  const next = { ...pending };
  if (Object.prototype.hasOwnProperty.call(pending, stepKey)) delete next[stepKey];
  else next[stepKey] = { mastered: !storedConfirmed, madeAt: nowIso };
  return next;
};
export const toggleChipChange = ({ known, pending, stepKey, nowIso }) => {
  if (Object.prototype.hasOwnProperty.call(pending, stepKey)) {
    const next = { ...pending };
    delete next[stepKey];
    return next;
  }
  if (known) return pending;
  return { ...pending, [stepKey]: { mastered: true, madeAt: nowIso } };
};

/** Validate syntax only: retired curriculum keys remain valid draft changes. */
export function assertStepChanges(changesByChild) {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const invalid = () => { throw Object.assign(new Error('Invalid step tracker change'), { code: 'TRACKER_CHANGE_INVALID' }); };
  if (!object(changesByChild)) invalid();
  for (const changes of Object.values(changesByChild)) {
    if (!object(changes)) invalid();
    for (const [stepKey, change] of Object.entries(changes)) {
      if (!STEP_KEY_PATTERN.test(stepKey) || !object(change) || typeof change.mastered !== 'boolean'
        || typeof change.madeAt !== 'string' || !Number.isFinite(Date.parse(change.madeAt))) invalid();
    }
  }
}
