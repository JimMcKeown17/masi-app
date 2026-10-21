export const toSetLetterMasteryArgs = (payload) => {
  for (const field of ['correction_id', 'child_id', 'letter', 'language', 'changed_at']) {
    if (typeof payload?.[field] !== 'string' || payload[field].trim().length === 0) {
      throw new TypeError(`${field} must be a non-empty string`);
    }
  }
  if (typeof payload.confirmed !== 'boolean') throw new TypeError('confirmed must be a boolean');
  if (!Number.isFinite(Date.parse(payload.changed_at))) throw new TypeError('changed_at must be a valid date string');
  return {
    p_correction_id: payload.correction_id,
    p_child_id: payload.child_id,
    p_letter: payload.letter,
    p_language: payload.language,
    p_confirmed: payload.confirmed,
    p_changed_at: payload.changed_at,
  };
};

export const parseSetLetterMasteryResult = (data) => {
  if (!Array.isArray(data) || data.length !== 1 || !data[0]) return null;
  const { outcome, confirmed, changed_at, correction_id, changed_by } = data[0];
  if (outcome === 'acknowledged') {
    if ([confirmed, changed_at, correction_id, changed_by].some(value => value !== null)) return null;
  } else if (outcome === 'applied' || outcome === 'superseded') {
    if (typeof confirmed !== 'boolean'
      || [changed_at, correction_id, changed_by].some(value => typeof value !== 'string')) return null;
  } else {
    return null;
  }
  // Preserve the raw PostgREST timestamp, including its precision and offset.
  return { outcome, confirmed, changed_at, correction_id, changed_by };
};
