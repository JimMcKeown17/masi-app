import type { BatteryConfig, BatteryState, DecidedResult } from '../types/BatteryConfig';
import { firedTrigger, skipCauseFor } from './skipRules';

export function evaluateBatteryState(battery: BatteryConfig, decidedResults: DecidedResult[]): BatteryState {
  const order = battery.questions.map((q) => q.question_code);
  const byCode = new Map(decidedResults.filter((d) => order.includes(d.question_code)).map((d) => [d.question_code, d]));
  const decided = order.filter((c) => byCode.has(c));
  const results = [...byCode.values()];
  const autoSkips: BatteryState['autoSkips'] = [];
  for (const code of order) {
    if (byCode.has(code)) continue;
    const cause = skipCauseFor(battery, results, code);
    if (!cause) continue;
    autoSkips.push({ question_code: code, reason: 'skipped_prerequisite_unmet',
      trigger: cause.kind === 'first_row' ? cause.trigger : null });
  }
  const skipped = new Set(autoSkips.map((a) => a.question_code));
  const undecided = order.filter((c) => !byCode.has(c) && !skipped.has(c));
  const nextCode = undecided[0] ?? null;
  return {
    nextQuestion: nextCode ? battery.questions.find((q) => q.question_code === nextCode)! : null,
    decided,
    undecided,
    autoSkips,
    firedTrigger: firedTrigger(battery, results),
    eligibleToFinalize: decided.length === order.length,
  };
}
