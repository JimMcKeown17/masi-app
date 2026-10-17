import type { BatteryConfig, BatteryState, DecidedResult } from '../types/BatteryConfig';

export function evaluateBatteryState(battery: BatteryConfig, decidedResults: DecidedResult[]): BatteryState {
  const order = battery.questions.map((q) => q.question_code);
  const byCode = new Map(decidedResults.filter((d) => order.includes(d.question_code)).map((d) => [d.question_code, d]));
  const decided = order.filter((c) => byCode.has(c));
  const autoSkips: BatteryState['autoSkips'] = [];
  for (const code of order) {
    if (byCode.has(code)) continue;
    const rule = battery.prerequisites[code];
    if (!rule) continue;
    const dep = byCode.get(rule.depends_on);
    if (!dep) continue; // prerequisite not decided yet: no verdict
    if (dep.score === null || dep.score < rule.minScore) {
      autoSkips.push({ question_code: code, reason: rule.on_unmet_reason });
    }
  }
  const skipped = new Set(autoSkips.map((a) => a.question_code));
  const undecided = order.filter((c) => !byCode.has(c) && !skipped.has(c));
  const nextCode = undecided[0] ?? null;
  return {
    nextQuestion: nextCode ? battery.questions.find((q) => q.question_code === nextCode)! : null,
    decided,
    undecided,
    autoSkips,
    eligibleToFinalize: decided.length === order.length,
  };
}
