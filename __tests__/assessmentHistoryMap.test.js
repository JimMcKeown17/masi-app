import { buildAssessmentMap } from '../src/utils/assessmentHistoryMap';

describe('buildAssessmentMap', () => {
  test('builds latest-row summaries and attempt counts in one pass', () => {
    const rows = [
      { child_id: 'c1', assessment_type: 'letter_egra', date_assessed: '2026-06-01', created_at: '2026-06-01T08:00:00Z', accuracy: 50 },
      { child_id: 'c2', assessment_type: 'letter_egra', date_assessed: '2026-06-03', created_at: '2026-06-03T08:00:00Z', accuracy: 70 },
      { child_id: 'c1', assessment_type: 'letter_egra', date_assessed: '2026-06-02', created_at: '2026-06-02T08:00:00Z', accuracy: 80 },
      { child_id: 'c1', assessment_type: 'word_egra', date_assessed: '2026-06-04', created_at: '2026-06-04T08:00:00Z', accuracy: 90 },
    ];
    let indexedReads = 0;
    const observedRows = new Proxy(rows, {
      get(target, property, receiver) {
        if (/^\d+$/.test(String(property))) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    expect(buildAssessmentMap(observedRows, 'letter_egra')).toEqual({
      c1: { date_assessed: '2026-06-02', accuracy: 80, attemptCount: 2 },
      c2: { date_assessed: '2026-06-03', accuracy: 70, attemptCount: 1 },
    });
    expect(indexedReads).toBeLessThanOrEqual(rows.length + 1);
  });
});
