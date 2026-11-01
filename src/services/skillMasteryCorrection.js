export const toSetSkillMasteryArgs = (payload) => {
  for (const field of ['correction_id', 'child_id', 'step_key', 'changed_at']) {
    if (typeof payload?.[field] !== 'string' || payload[field].trim().length === 0) {
      throw new TypeError(`${field} must be a non-empty string`);
    }
  }
  if (typeof payload.confirmed !== 'boolean') throw new TypeError('confirmed must be a boolean');
  if (!Number.isFinite(Date.parse(payload.changed_at))) throw new TypeError('changed_at must be a valid date string');
  return {
    p_correction_id: payload.correction_id,
    p_child_id: payload.child_id,
    p_step_key: payload.step_key,
    p_confirmed: payload.confirmed,
    p_changed_at: payload.changed_at,
  };
};

export { parseSetLetterMasteryResult as parseSetSkillMasteryResult } from './letterMasteryCorrection';
