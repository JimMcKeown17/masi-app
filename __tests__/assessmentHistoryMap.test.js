import { buildAssessmentMap } from '../src/utils/assessmentHistoryMap';

describe('buildAssessmentMap', () => {
  test('builds latest-row summaries and attempt counts in one pass', () => {
    const rows = [
      { child_id: 'c1', question_code: 'letter_sounds', assessment_date: '2026-06-01', created_at: '2026-06-01T08:00:00Z', score: 30, total_items: 60 },
      { child_id: 'c2', question_code: 'letter_sounds', assessment_date: '2026-06-03', created_at: '2026-06-03T08:00:00Z', score: 42, total_items: 60 },
      { child_id: 'c1', question_code: 'letter_sounds', assessment_date: '2026-06-02', created_at: '2026-06-02T08:00:00Z', score: 48, total_items: 60 },
      { child_id: 'c1', question_code: 'word_reading', assessment_date: '2026-06-04', created_at: '2026-06-04T08:00:00Z', score: 45, total_items: 50 },
    ];
    let indexedReads = 0;
    const observedRows = new Proxy(rows, {
      get(target, property, receiver) {
        if (/^\d+$/.test(String(property))) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    expect(buildAssessmentMap(observedRows, 'letter_sounds')).toEqual({
      c1: { assessment_date: '2026-06-02', score: 48, total_items: 60, attemptCount: 2 },
      c2: { assessment_date: '2026-06-03', score: 42, total_items: 60, attemptCount: 1 },
    });
    expect(indexedReads).toBeLessThanOrEqual(rows.length + 1);
  });
});

test('skips refusals, includes battery Questions and breaks same-date ties by created_at', () => {
  expect(buildAssessmentMap([
    { child_id: 'c1', question_code: 'letter_sounds', assessment_date: '2026-06-01', created_at: '2026-06-01T11:00:00Z', score: 9, total_items: 60, battery_run_id: 'run' },
    { child_id: 'c1', question_code: 'letter_sounds', assessment_date: '2026-06-01', created_at: '2026-06-01T10:00:00Z', score: 5, total_items: 60 },
    { child_id: 'c1', question_code: 'letter_sounds', assessment_date: '2026-06-02', stopped_reason: 'skipped_tired', score: 0, total_items: 0 },
  ], 'letter_sounds')).toEqual({
    c1: { assessment_date: '2026-06-01', score: 9, total_items: 60, attemptCount: 2 },
  });
});
