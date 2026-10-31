'use strict';

// Static require bundles the complete offline catalog; importing never registers a form.
const catalog = require('./egma-assessments.json');

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const egmaCatalog = deepFreeze(catalog);

/** Exact language matching; omitted filters include all forms. */
function listEgmaAssessments({ languageCode } = {}) {
  return Object.freeze(egmaCatalog.assessments.filter(form =>
    languageCode === undefined || form.languageCode === languageCode
  ));
}

/** Unknown IDs return null. Never fall back to another language or form. */
function getEgmaAssessment(id) {
  return egmaCatalog.assessments.find(form => form.id === id) || null;
}

module.exports = { egmaCatalog, listEgmaAssessments, getEgmaAssessment };
