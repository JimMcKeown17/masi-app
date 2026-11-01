/** Curriculum = { edition, skills: Skill[] }
 *  Skill = { key, label, hint, group: 'main'|'counting', slot: 'warm_up'|'activity', steps: Step[] }
 *  Step = { key, skill, label, size, goal, activities: Activity[], tick_when, comes_after: string[], note_for_partner }
 *  Activity = { name, minutes, how, needs, source, source_ref }
 */

/** EGMA tags from spec §7.2. Unmapped steps have no direct assessment evidence. */
export const EVIDENCE_MAP = Object.freeze({
  'finger_flash.5': Object.freeze({ skill: 'quick_see', band: 5 }),
  'finger_flash.10': Object.freeze({ skill: 'quick_see', band: 10 }),
  'count.5': Object.freeze({ skill: 'count_out', band: 5 }),
  'count.10': Object.freeze({ skill: 'count_out', band: 10 }),
  'count.20': Object.freeze({ skill: 'count_out', band: 20 }),
  'read_numbers.5': Object.freeze({ skill: 'read_numbers', band: 5 }),
  'read_numbers.10': Object.freeze({ skill: 'read_numbers', band: 10 }),
  'read_numbers.20': Object.freeze({ skill: 'read_numbers', band: 20 }),
  'read_numbers.50': Object.freeze({ skill: 'read_numbers', band: 50 }),
  'read_numbers.100': Object.freeze({ skill: 'read_numbers', band: 100 }),
  'compare.5': Object.freeze({ skill: 'compare_numbers', band: 5 }),
  'compare.10': Object.freeze({ skill: 'compare_numbers', band: 10 }),
  'compare.20': Object.freeze({ skill: 'compare_numbers', band: 20 }),
  'compare.50': Object.freeze({ skill: 'compare_numbers', band: 50 }),
  'compare.100': Object.freeze({ skill: 'compare_numbers', band: 100 }),
  'before_after.5': Object.freeze({ skill: 'number_neighbours', band: 5 }),
  'before_after.10': Object.freeze({ skill: 'number_neighbours', band: 10 }),
  'before_after.20': Object.freeze({ skill: 'number_neighbours', band: 20 }),
  'add.5': Object.freeze({ skill: 'add_objects', band: 5 }),
  'add.10': Object.freeze({ skill: 'add_objects', band: 10 }),
  'add.20': Object.freeze({ skill: 'add', band: 20 }),
  'subtract.5': Object.freeze({ skill: 'subtract_objects', band: 5 }),
  'subtract.10': Object.freeze({ skill: 'subtract_objects', band: 10 }),
  'subtract.20': Object.freeze({ skill: 'subtract', band: 20 }),
  'number_pairs.5': Object.freeze({ skill: 'number_bonds', band: 5 }),
  'number_pairs.10': Object.freeze({ skill: 'number_bonds', band: 10 }),
  'count_aloud.10': Object.freeze({ skill: 'count_aloud', band: 10 }),
  'count_aloud.20': Object.freeze({ skill: 'count_aloud', band: 20 }),
  'count_aloud.50': Object.freeze({ skill: 'count_aloud', band: 50 }),
  'count_aloud.100': Object.freeze({ skill: 'count_aloud', band: 100 }),
});

const STRICT_SKILLS = Object.freeze(['add_objects', 'subtract_objects']);
const ACCEPTED_STRATEGIES = Object.freeze(['count_on', 'known']);
const text = (value) => typeof value === 'string' ? value : '';
const isPlainObject = (value) => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const itemShows = (item) => item.is_correct === true
  && (!STRICT_SKILLS.includes(item.metadata.skill) || ACCEPTED_STRATEGIES.includes(item.metadata.strategy));

/**
 * One child's results, bounded to the active year and programme by the caller.
 * The newest reached result decides within each Question; any showing Question wins.
 * @returns {Map<string, { shown: boolean, resultId: string, date: string }>}
 */
export function computeStepEvidence(input = {}) {
  const { results, curriculum } = input ?? {};
  const ordered = (Array.isArray(results) ? results : []).filter((result) => (
    result && Array.isArray(result.items)
    && !text(result.question_version).endsWith('-draft')
    && !text(result.stopped_reason).startsWith('skipped_')
  )).sort((a, b) => (
    text(b.assessment_date).localeCompare(text(a.assessment_date))
    || text(b.created_at).localeCompare(text(a.created_at))
  ));
  const out = new Map();
  const skills = Array.isArray(curriculum?.skills) ? curriculum.skills : [];
  for (const skill of skills) {
    for (const step of Array.isArray(skill?.steps) ? skill.steps : []) {
      const tag = Object.prototype.hasOwnProperty.call(EVIDENCE_MAP, step?.key) ? EVIDENCE_MAP[step.key] : null;
      if (!tag) continue;
      const deciding = [];
      for (const result of ordered) {
        if (deciding.some((d) => d.result.question_code === result.question_code)) continue;
        const items = result.items.filter((item) => (
          isPlainObject(item?.metadata) && item.metadata.reached !== false
          && item.metadata.skill === tag.skill
          && typeof item.metadata.band === 'number' && item.metadata.band === tag.band
        ));
        if (items.length === 0) continue;
        deciding.push({ result, shown: items.every(itemShows) });
      }
      if (deciding.length === 0) continue;
      const pick = deciding.find((d) => d.shown) ?? deciding[0];
      out.set(step.key, { shown: pick.shown, resultId: pick.result.id, date: pick.result.assessment_date });
    }
  }
  return out;
}
