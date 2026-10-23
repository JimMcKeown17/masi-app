import { egraCatalog, listEgraAssessments } from '../../../content/egra';
import { adaptEgraForm } from './adapter';

export { adaptEgraForm } from './adapter';
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
  const entry = adapted.find(value => value.form.id === questionVersion && value.form.languageCode === language);
  if (!entry || !Object.prototype.hasOwnProperty.call(entry.itemSets, questionCode)) return null;
  return entry.itemSets[questionCode as keyof typeof entry.itemSets];
}
