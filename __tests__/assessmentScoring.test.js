import { computeAssessmentResult, buildAssessmentRecord } from '../src/utils/assessmentScoring';

const letterSet = { id: 'eng-1', language: 'english', letters: ['a', 'b', 'c', 'd'] };

describe('computeAssessmentResult', () => {
  test('returns zeros when nothing attempted (lastTappedIndex < 0)', () => {
    expect(computeAssessmentResult({}, -1, letterSet.letters)).toEqual({
      lettersAttempted: 0, correctResponses: 0, incorrectLetters: [], correctLetters: [], accuracy: 0,
    });
  });

  test('scores up to and including lastTappedIndex', () => {
    const r = computeAssessmentResult({ 0: true, 2: true }, 2, letterSet.letters);
    expect(r.lettersAttempted).toBe(3);
    expect(r.correctResponses).toBe(2);
    expect(r.accuracy).toBe(67);
    expect(r.correctLetters).toEqual([{ index: 0, letter: 'a' }, { index: 2, letter: 'c' }]);
    expect(r.incorrectLetters).toEqual([{ index: 1, letter: 'b' }]);
  });
});

describe('buildAssessmentRecord', () => {
  const now = new Date('2026-06-18T09:30:00.000Z');
  const base = {
    id: 'rec-1', userId: 'u1', childId: 'c1', assessmentType: 'letter_egra',
    letterSet, attemptNumber: 2, elapsedSeconds: 60, finalLastIndex: 2,
    letterStates: { 0: true, 2: true }, now,
  };

  test('produces Masi record shape with capture_mode + correction_count', () => {
    const rec = buildAssessmentRecord({ ...base, captureMode: 'sequential', correctionCount: 3 });
    expect(rec).toMatchObject({
      id: 'rec-1', user_id: 'u1', child_id: 'c1', assessment_type: 'letter_egra',
      capture_mode: 'sequential', correction_count: 3,
      items_tested: ['a', 'b', 'c', 'd'], attempt_number: 2,
      letter_set_id: 'eng-1', letter_language: 'english', completion_time: 60,
      letters_attempted: 3, correct_responses: 2, accuracy: 67,
      last_letter_attempted: { index: 2, letter: 'c' },
      date_assessed: '2026-06-18', device_info: {}, synced: false,
    });
    expect(rec.created_at).toBe(now.toISOString());
    expect(rec.updated_at).toBe(now.toISOString());
  });

  test('correctionCount defaults to 0 (grid mode)', () => {
    const rec = buildAssessmentRecord({ ...base, captureMode: 'grid' });
    expect(rec.correction_count).toBe(0);
    expect(rec.capture_mode).toBe('grid');
  });

  test('last_letter_attempted is null when finalLastIndex < 0', () => {
    const rec = buildAssessmentRecord({ ...base, captureMode: 'grid', finalLastIndex: -1, letterStates: {} });
    expect(rec.last_letter_attempted).toBeNull();
    expect(rec.letters_attempted).toBe(0);
  });

  test('attributes an assessment to the South African programme day', () => {
    const rec = buildAssessmentRecord({
      ...base,
      captureMode: 'sequential',
      now: new Date('2026-06-30T22:30:00.000Z'),
    });

    expect(rec.date_assessed).toBe('2026-07-01');
  });
});
