import type { ValidationVerdict } from '../contractTest/validateResult';
import { CORE_ARITHMETIC_CODES, COUNTERS_QUESTION_CODES, ITEM_STRATEGY_KEYS, MATHS_BANDS, OBSERVATION_OPTIONS } from './strategies';

const countersCodes = new Set<string>(COUNTERS_QUESTION_CODES);
const arithmeticCodes = new Set<string>(CORE_ARITHMETIC_CODES);
const itemStrategies = new Set<unknown>(ITEM_STRATEGY_KEYS);
const observationStrategies = new Set<unknown>(OBSERVATION_OPTIONS.map(option => option.key));
const bands = new Set<unknown>(MATHS_BANDS);
const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export function isMathsQuestionCode(code: string): boolean {
  return code.startsWith('maths_') || code.startsWith('egma_');
}

/** Supplemental maths invariants. Call alongside validateResult for the common Result contract. */
export function validateMathsResult(result: unknown): ValidationVerdict {
  const errors: string[] = [];
  try {
    if (!isRecord(result)) return { valid: false, errors: ['result must be an object'] };
    if (typeof result.question_code !== 'string') {
      return { valid: false, errors: ['question_code: must be a string'] };
    }
    const code = result.question_code;
    if (!isMathsQuestionCode(code)) return { valid: true, errors: [] };
    const skipped = typeof result.stopped_reason === 'string' && result.stopped_reason.startsWith('skipped_');

    if (!Array.isArray(result.items)) {
      errors.push('items: must be an array');
    } else {
      result.items.forEach((item: unknown, index: number) => {
        if (!isRecord(item)) {
          errors.push(`items[${index}]: must be an object`);
          return;
        }
        const metadata = isRecord(item.metadata) ? item.metadata : null;
        const path = `items[${index}].metadata`;
        if (typeof metadata?.skill !== 'string') errors.push(`${path}.skill: must be a string`);
        if (!bands.has(metadata?.band)) errors.push(`${path}.band: must be an allowed maths band`);
        const needsStrategy = countersCodes.has(code) && metadata?.reached === true && item.is_correct === true;
        if (needsStrategy) {
          if (!itemStrategies.has(metadata?.strategy)) errors.push(`${path}.strategy: reached correct counters items require a valid strategy`);
        } else if (metadata && hasOwn(metadata, 'strategy')) {
          errors.push(`${path}.strategy: only reached correct counters items may carry a strategy`);
        }
      });
    }

    const derived = isRecord(result.derived) ? result.derived : null;
    if (!derived) errors.push('derived: must be an object');
    if (skipped || !arithmeticCodes.has(code)) {
      if (derived && hasOwn(derived, 'strategies')) errors.push('derived.strategies: only non-skipped Core arithmetic may carry strategies');
    } else {
      const correct = derived?.total_correct;
      if (typeof correct !== 'number' || !Number.isInteger(correct) || correct < 0) {
        errors.push('derived.total_correct: must be a non-negative integer');
      }
      const strategies = derived?.strategies;
      if (!Array.isArray(strategies)) {
        errors.push('derived.strategies: Core arithmetic requires an array');
      } else {
        if (correct === 0 && strategies.length !== 0) errors.push('derived.strategies: zero correct requires an empty array');
        if (typeof correct === 'number' && correct > 0 && strategies.length === 0) errors.push('derived.strategies: positive total_correct requires an observation');
        if (strategies.some(key => !observationStrategies.has(key))) errors.push('derived.strategies: contains an invalid observation key');
        if (new Set(strategies).size !== strategies.length) errors.push('derived.strategies: duplicate keys are not allowed');
        if (strategies.includes('not_seen') && strategies.length !== 1) errors.push('derived.strategies: not_seen must be exclusive');
      }
    }
  } catch {
    // Unknown input can include getters or proxies. Return a verdict even when it cannot be inspected.
    errors.push('result: could not be inspected');
  }
  return { valid: errors.length === 0, errors };
}
