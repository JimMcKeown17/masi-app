/** Curriculum = { edition, skills: Skill[] }
 *  Skill = { key, label, hint, group: 'main'|'counting', slot: 'warm_up'|'activity', steps: Step[] }
 *  Step = { key, skill, label, size, goal, activities: Activity[], tick_when, comes_after: string[], note_for_partner }
 *  Activity = { name, minutes, how, needs, source, source_ref }
 *  KnownState = 'assessment' | 'ticked' | 'implied'
 */

/**
 * Combine one child's evidence and ticks, implying lower steps within each skill.
 * Implied states are derived on every call and never written back to the inputs.
 * @returns {Map<string, 'assessment' | 'ticked' | 'implied'>}
 */
export function knownStepsForChild({ curriculum, ticks, evidence }) {
  const confirmed = new Set((Array.isArray(ticks) ? ticks : [])
    .filter((row) => row?.confirmed === true).map((row) => row.step_key));
  const assessments = evidence instanceof Map ? evidence : new Map();
  const out = new Map();
  const skills = Array.isArray(curriculum?.skills) ? curriculum.skills : [];
  for (const skill of skills) {
    const steps = Array.isArray(skill?.steps) ? skill.steps : [];
    const states = steps.map((step) => {
      if (assessments.get(step.key)?.shown === true) return 'assessment';
      return confirmed.has(step.key) ? 'ticked' : null;
    });
    let higherKnown = false;
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      if (states[index]) higherKnown = true;
      else if (higherKnown) states[index] = 'implied';
    }
    steps.forEach((step, index) => {
      if (states[index]) out.set(step.key, states[index]);
    });
  }
  return out;
}
