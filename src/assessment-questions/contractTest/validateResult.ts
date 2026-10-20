export interface ValidationVerdict {
  valid: boolean;
  errors: string[];
}

const REQUIRED_FIELDS = [
  'question_code',
  'question_version',
  'item_set_id',
  'language',
  'duration_ms',
  'stopped_reason',
  'items',
  'derived',
] as const;

const STRING_FIELDS = [
  'question_code',
  'question_version',
  'item_set_id',
  'language',
] as const;

const DERIVED_REQUIRED_FIELDS = [
  'total_correct',
  'total_attempted',
  'percent',
  'last_attempted_position',
] as const;

const STOPPED_REASONS = [
  'completed',
  'timer',
  'ea_ended',
  'stop_rule',
  'skipped_child_refused',
  'skipped_tired',
  'skipped_time',
  'skipped_age',
  'skipped_prerequisite_unmet',
  'skipped_other',
] as const;

export function validateResult(result: unknown, opts?: { stopAt?: number }): ValidationVerdict {
  if (typeof result !== 'object' || result === null) {
    return { valid: false, errors: ['result must be an object'] };
  }

  const r = result as Record<string, unknown>;
  const errors: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (r[field] === undefined || r[field] === null) {
      errors.push(`${field}: required field is missing`);
    }
  }

  if (r.duration_ms !== undefined && typeof r.duration_ms !== 'number') {
    errors.push(`duration_ms: must be a number, got ${typeof r.duration_ms}`);
  }

  for (const field of STRING_FIELDS) {
    if (r[field] !== undefined && typeof r[field] !== 'string') {
      errors.push(`${field}: must be a string, got ${typeof r[field]}`);
    }
  }

  if (
    r.stopped_reason !== undefined &&
    !STOPPED_REASONS.includes(r.stopped_reason as never)
  ) {
    errors.push(
      `stopped_reason: ${String(r.stopped_reason)} is not one of ${STOPPED_REASONS.join(', ')}`
    );
  }

  if (r.items !== undefined && !Array.isArray(r.items)) {
    errors.push('items: must be an array');
  } else if (Array.isArray(r.items)) {
    r.items.forEach((item, idx) => {
      if (typeof item !== 'object' || item === null) {
        errors.push(`items[${idx}]: must be an object`);
        return;
      }
      const it = item as Record<string, unknown>;
      if (typeof it.position !== 'number') {
        errors.push(`items[${idx}].position: must be a number`);
      }
      if (typeof it.prompt !== 'string') {
        errors.push(`items[${idx}].prompt: must be a string`);
      }
      if (typeof it.is_correct !== 'boolean') {
        errors.push(`items[${idx}].is_correct: must be a boolean`);
      }
    });
  }

  const derived = r.derived;
  const derivedIsObject = derived !== null && typeof derived === 'object';
  const derivedObj = derivedIsObject
    ? (derived as Record<string, unknown>)
    : null;

  if (derivedObj !== null) {
    for (const field of DERIVED_REQUIRED_FIELDS) {
      if (derivedObj[field] === undefined) {
        errors.push(`derived.${field}: required field is missing`);
      }
    }
  }

  const positionMissing =
    derivedObj === null ||
    derivedObj.last_attempted_position === null ||
    derivedObj.last_attempted_position === undefined;

  if (r.stopped_reason === 'timer' && positionMissing) {
    errors.push(
      'last_attempted_position: required for timed Questions (stopped_reason=timer) — null means "not reached" is indistinguishable from "wrong"'
    );
  }

  // A skipped Question never presented its items, so it has no progress to report:
  // skips are the only exemption from the timed-progress rule.
  const isSkip =
    typeof r.stopped_reason === 'string' && r.stopped_reason.startsWith('skipped_');
  if (derivedObj?.was_timed === true && !isSkip && positionMissing) {
    errors.push(
      'last_attempted_position: required when derived.was_timed is true (only skipped_* results are exempt)'
    );
  }

  if (derivedObj?.tracks_progress === true) {
    const p = derivedObj.last_attempted_position;
    const itemCount = Array.isArray(r.items) ? r.items.length : 0;
    if (typeof p !== 'number' || !Number.isInteger(p) || p < -1 || p >= Math.max(itemCount, 1)) {
      errors.push('last_attempted_position: tracks_progress requires an integer in [-1, items.length)');
    }
  }

  if (r.stopped_reason === 'stop_rule' && opts?.stopAt !== undefined) {
    const stopAt = opts.stopAt;
    const lastPosition = derivedObj?.last_attempted_position;
    const reached = (Array.isArray(r.items) ? r.items : [])
      .filter((item): item is Record<string, unknown> => (
        item !== null && typeof item === 'object' &&
        typeof item.position === 'number' && typeof lastPosition === 'number' &&
        item.position <= lastPosition && item.metadata?.reached !== false
      ))
      .sort((a, b) => (a.position as number) - (b.position as number))
      .slice(-stopAt);
    if (
      !Number.isInteger(stopAt) || stopAt <= 0 ||
      reached.length !== stopAt ||
      reached[reached.length - 1]?.position !== lastPosition ||
      reached.some((item) => item.is_correct !== false)
    ) {
      errors.push(`stop_rule: the last ${stopAt} reached items ending at last_attempted_position must all be wrong`);
    }
  }

  return { valid: errors.length === 0, errors };
}
