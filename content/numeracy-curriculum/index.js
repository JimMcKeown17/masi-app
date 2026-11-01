'use strict';

// Static require lets Metro bundle the curriculum for offline use.
const catalog = require('./curriculum-2026.1-draft.json');
const CURRENT_EDITION = '2026.1-draft';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
const curriculum = deepFreeze(catalog);

function getCurriculum() {
  return curriculum;
}

/** Exact key matching only; unknown or retired keys return null. */
function getStep(curriculum, stepKey) {
  if (typeof stepKey !== 'string') return null;
  for (const skill of curriculum.skills) {
    const step = skill.steps.find(step => step.key === stepKey);
    if (step) return step;
  }
  return null;
}

function listStepKeys(curriculum) {
  return Object.freeze(curriculum.skills.flatMap(skill => skill.steps.map(step => step.key)));
}

module.exports = { CURRENT_EDITION, getCurriculum, getStep, listStepKeys };
