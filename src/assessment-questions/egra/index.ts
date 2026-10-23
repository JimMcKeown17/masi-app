import { egraCatalog, listEgraAssessments } from '../../../content/egra';
import { adaptEgraForm } from './adapter';

export { adaptEgraForm } from './adapter';
export { EGRA_LETTER_EXTENSIONS, EGRA_MIN_LETTERS } from './letterExtensions';
export type { EgraBattery } from './adapter';
export const EGRA_FORMS = egraCatalog.assessments;
const adapted = EGRA_FORMS.map(adaptEgraForm);
export const EGRA_BATTERIES = adapted.map(entry => entry.battery);
export function egraFormFor(id: string) {
  return EGRA_FORMS.find(form => form.id === id) ?? null;
}
export function listEgraForms(filters: { languageCode?: string; variant?: string } = {}) {
  return listEgraAssessments(filters);
}
export function egraBatteryFor(code: string, version: string) {
  return EGRA_BATTERIES.find(battery => battery.battery_code === code && battery.battery_version === version) ?? null;
}
export function egraItemSetFor(questionCode: string, questionVersion: string, language: string) {
  for (const entry of adapted) {
    if (!Object.prototype.hasOwnProperty.call(entry.itemSets, questionCode)) continue;
    const set = entry.itemSets[questionCode as keyof typeof entry.itemSets];
    if (set.question_version === questionVersion && set.language === language) return set;
  }
  return null;
}
