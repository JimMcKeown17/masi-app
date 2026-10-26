import type { BatteryConfig, DecidedResult } from '../types/BatteryConfig';

export type SkipCause =
  | { kind: 'first_row'; trigger: string }
  | { kind: 'prerequisite'; depends_on: string };

export function firstRowWrong(result: DecidedResult, length: number): boolean {
  if (result.stopped_reason.startsWith('skipped_') || !result.items) return false;
  const byPosition = new Map(result.items.map(item => [item.position, item]));
  for (let position = 0; position < length; position += 1) {
    const item = byPosition.get(position);
    if (item?.metadata?.reached !== true || item.is_correct !== false) return false;
  }
  return true;
}

export function firedTrigger(battery: BatteryConfig, decided: DecidedResult[]): string | null {
  if (!battery.skipRule) return null;
  const byCode = new Map(decided.map(result => [result.question_code, result]));
  for (const question of battery.questions) {
    const rule = battery.skipRule.triggers.find(trigger => trigger.question_code === question.question_code);
    const result = byCode.get(question.question_code);
    if (rule && result && firstRowWrong(result, rule.first_row_length)) return question.question_code;
  }
  return null;
}

/** Re-derive the cause from evidence even when the skipped result is already saved. */
export function skipCauseFor(battery: BatteryConfig, decided: DecidedResult[], questionCode: string): SkipCause | null {
  const trigger = firedTrigger(battery, decided);
  const order = battery.questions.map(question => question.question_code);
  if (trigger !== null && battery.skipRule?.skips.includes(questionCode)
    && order.indexOf(questionCode) > order.indexOf(trigger)) {
    return { kind: 'first_row', trigger };
  }
  const rule = battery.prerequisites[questionCode];
  if (!rule || !order.includes(rule.depends_on)) return null;
  const dependency = new Map(decided.map(result => [result.question_code, result])).get(rule.depends_on);
  if (dependency && (dependency.score === null || dependency.score < rule.minScore)) {
    return { kind: 'prerequisite', depends_on: rule.depends_on };
  }
  return null;
}
