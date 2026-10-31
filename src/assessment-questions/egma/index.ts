import { listEgmaAssessments } from '../../../content/egma';
import type { BatteryConfig } from '../types/BatteryConfig';
import { adaptEgmaForm } from './adapter';

export { adaptEgmaForm, EARLY_STOP_AT, CORE_STOP_AT, COUNT_ALOUD_STOP_AT, MATHS_BATTERY_CODE, MATHS_QUESTION_CODES } from './adapter';
export type { MathsQuestionCode } from './adapter';
export * from './strategies';
export { withRate } from './rate';
export { isMathsQuestionCode, validateMathsResult } from './validateMathsResult';

export const EGMA_FORMS = listEgmaAssessments({languageCode:'en'});
const adapted=EGMA_FORMS.map(adaptEgmaForm);
export const MASI_MATHS_BATTERIES: readonly BatteryConfig[]=adapted.map(entry=>entry.battery);
const draft=adapted.find(entry=>entry.form.id==='masi-egma-en-2026-1-draft');
if (!draft) throw new TypeError('Missing EGMA draft form: masi-egma-en-2026-1-draft');
export const MASI_MATHS_2026_1_DRAFT: BatteryConfig=draft.battery;

export function egmaItemSetFor(questionCode:string,questionVersion:string,language:string) {
  for (const entry of adapted) {
    if (!Object.prototype.hasOwnProperty.call(entry.itemSets,questionCode)) continue;
    const set=entry.itemSets[questionCode as keyof typeof entry.itemSets];
    if (set.question_version===questionVersion && set.language===language) return set;
  }
  return null;
}
