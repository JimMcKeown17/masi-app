'use strict';

// Additive source catalog only. Importing it never activates or registers a form.
// Static require lets Metro/Next bundle the JSON for offline use.
const catalog = require('./egra-assessments.json');

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const egraCatalog = deepFreeze(catalog);

/** Exact ISO language/variant matching; omitted filters include all forms. */
function listEgraAssessments({ languageCode, variant } = {}) {
  return Object.freeze(egraCatalog.assessments.filter(assessment =>
    (languageCode === undefined || assessment.languageCode === languageCode) &&
    (variant === undefined || assessment.variant === variant)
  ));
}

/** Unknown IDs return null. Never fall back to another language or legacy form. */
function getEgraAssessment(id) {
  return egraCatalog.assessments.find(assessment => assessment.id === id) || null;
}

module.exports = { egraCatalog, listEgraAssessments, getEgraAssessment };
