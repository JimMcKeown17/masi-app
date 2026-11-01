import { isGroupMastered } from '../utils/groupMastery';

/** Curriculum = { edition, skills: Skill[] }
 *  Skill = { key, label, hint, group: 'main'|'counting', slot: 'warm_up'|'activity', steps: Step[] }
 *  Step = { key, skill, label, size, goal, activities: Activity[], tick_when, comes_after: string[], note_for_partner }
 *  Activity = { name, minutes, how, needs, source, source_ref }
 *  KnownState = 'assessment' | 'ticked' | 'implied'
 */

/** Any known state counts; missing knowledge counts as knowing nothing. */
export function childKnows(knownByChild, childId, stepKey) {
  const steps = knownByChild instanceof Map ? knownByChild.get(childId) : null;
  return steps instanceof Map && steps.has(stepKey);
}

/**
 * Derive group knowledge and ready group steps from distinct present children.
 * @returns {{ presentIds: string[], groupKnown: string[], groupStepBySkill: Map<string, string | null>, readySteps: string[] }}
 */
export function groupStepState({ curriculum, presentChildIds, knownByChild }) {
  const presentIds = [...new Set(Array.isArray(presentChildIds) ? presentChildIds : [])];
  const steps = curriculum.skills.flatMap((skill) => skill.steps);
  const groupKnown = steps.filter((step) => isGroupMastered(
    presentIds.filter((id) => childKnows(knownByChild, id, step.key)).length,
    presentIds.length,
  )).map((step) => step.key);
  const known = new Set(groupKnown);
  const groupStepBySkill = new Map(curriculum.skills.map((skill) => [
    skill.key,
    [...skill.steps].sort((a, b) => a.size - b.size).find((step) => !known.has(step.key))?.key ?? null,
  ]));
  const groupSteps = new Set(groupStepBySkill.values());
  const readySteps = steps.filter((step) => groupSteps.has(step.key)
    && step.comes_after.every((key) => known.has(key))).map((step) => step.key);
  return { presentIds, groupKnown, groupStepBySkill, readySteps };
}
