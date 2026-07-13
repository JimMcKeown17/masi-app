export function buildAssessmentMap(assessments, assessmentType) {
  const map = {};
  for (const assessment of assessments) {
    if ((assessment.assessment_type || 'letter_egra') !== assessmentType) continue;
    const existing = map[assessment.child_id];
    const attemptCount = (existing?.attemptCount || 0) + 1;
    const isLatest = !existing
      || assessment.date_assessed > existing.date_assessed
      || (
        assessment.date_assessed === existing.date_assessed
        && assessment.created_at > existing.created_at
      );
    map[assessment.child_id] = isLatest
      ? {
        date_assessed: assessment.date_assessed,
        created_at: assessment.created_at,
        accuracy: assessment.accuracy,
        attemptCount,
      }
      : { ...existing, attemptCount };
  }

  for (const value of Object.values(map)) {
    delete value.created_at;
  }
  return map;
}
