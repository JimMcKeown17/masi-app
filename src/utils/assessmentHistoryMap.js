export function buildAssessmentMap(assessments, questionCode) {
  const map = {};
  for (const assessment of assessments) {
    if (assessment.question_code !== questionCode || assessment.stopped_reason?.startsWith('skipped_')) continue;
    const existing = map[assessment.child_id];
    const attemptCount = (existing?.attemptCount || 0) + 1;
    const isLatest = !existing
      || assessment.assessment_date > existing.assessment_date
      || (
        assessment.assessment_date === existing.assessment_date
        && assessment.created_at > existing.created_at
      );
    map[assessment.child_id] = isLatest
      ? {
        assessment_date: assessment.assessment_date,
        created_at: assessment.created_at,
        score: assessment.score,
        total_items: assessment.total_items,
        attemptCount,
      }
      : { ...existing, attemptCount };
  }

  for (const value of Object.values(map)) {
    delete value.created_at;
  }
  return map;
}
