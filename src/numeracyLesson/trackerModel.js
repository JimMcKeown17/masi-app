import { knownStepsForChild } from '../numeracy/knownSteps';
import { firstUnknownStep } from '../numeracy/cards';
import { childReadyFor, curriculumStepKeys } from '../numeracy/groupSteps';
import { toLocalDateString } from '../utils/localDate';

/** SkillRowModel = { skillKey, label, hint, nextStepKey, tiles: TileModel[] }
 * TileModel = { stepKey, sizeLabel, column, state: 'assessment'|'ticked'|'implied'|'not_yet',
 *   next, pending, tickedBy: 'you'|'another'|null, tickedOn: 'YYYY-MM-DD'|null }
 * Pending changes replace stored ticks before knowledge and implied steps are derived.
 */
export const TRACKER_COLUMNS = Object.freeze([5, 10, 15, 20, 50, 100]);
const CHILD = 'child';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function buildTrackerModel({ curriculum, ticks = [], evidence = new Map(), pending = {}, userId }) {
  const adjusted = new Map(ticks.map(tick => [tick.step_key, tick]));
  for (const [stepKey, { mastered, madeAt }] of Object.entries(pending)) {
    adjusted.set(stepKey, { step_key: stepKey, confirmed: mastered, changed_by: userId, changed_at: madeAt });
  }
  const known = knownStepsForChild({ curriculum, ticks: [...adjusted.values()], evidence });
  const knownByChild = new Map([[CHILD, known]]);
  const stepKeys = curriculumStepKeys(curriculum);
  const sections = [{ key: 'main', title: null }, { key: 'counting', title: 'Counting' }].map(section => ({
    ...section,
    rows: curriculum.skills.filter(skill => skill.group === section.key).map(skill => {
      const nextStepKey = firstUnknownStep({ curriculum, known, skillKey: skill.key });
      return {
        skillKey: skill.key, label: skill.label, hint: skill.hint, nextStepKey,
        tiles: skill.steps.map(step => {
          const state = known.get(step.key) ?? 'not_yet';
          const tick = adjusted.get(step.key);
          const column = TRACKER_COLUMNS.findIndex(size => size >= step.size);
          return {
            stepKey: step.key,
            sizeLabel: step.key.slice(step.key.indexOf('.') + 1),
            column: column < 0 ? TRACKER_COLUMNS.length - 1 : column,
            state,
            next: step.key === nextStepKey && childReadyFor(knownByChild, CHILD, step, stepKeys),
            pending: Object.prototype.hasOwnProperty.call(pending, step.key),
            tickedBy: state === 'ticked' ? (tick.changed_by === userId ? 'you' : 'another') : null,
            tickedOn: state === 'ticked' ? toLocalDateString(tick.changed_at) : null,
          };
        }),
      };
    }),
  })).filter(section => section.rows.length);
  return { knownCount: known.size, total: stepKeys.size, sections };
}

export function formatTickedOn(dateKey) {
  if (!dateKey) return null;
  const [, month, day] = dateKey.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
}

export function tickedByLine(tile) {
  if (tile.state !== 'ticked') return null;
  const who = tile.tickedBy === 'you' ? 'you' : 'another EA';
  const date = formatTickedOn(tile.tickedOn);
  return `Ticked by ${who}${date ? ` · ${date}` : ''}`;
}
