import { getLetterAssessmentRanking, getWordAssessmentRanking } from '../src/utils/dashboardStats';

// Codex P2 regression guard + Letters/Words toggle: the assessment ranking screen
// switches between a "letters correct" ranking (60-letter scale, grade-referenced
// colours) and a "words correct" ranking. Each mode must consider only its own
// assessment type, so letter cuts are never applied to word scores and vice versa.
// Letters mode treats legacy rows (no assessment_type) as letters, per the
// (assessment_type || 'letter_egra') === 'letter_egra' idiom used elsewhere.

const lettersCorrect = (n) =>
  Array.from({ length: n }, (_, i) => ({ index: i, letter: 'x' }));

describe('getLetterAssessmentRanking — ranks letters only, ignores word assessments', () => {
  test('ranks by the latest LETTER assessment even when a word assessment is more recent', () => {
    const children = [{ id: 'c1', first_name: 'A', last_name: 'B', class_id: 'cls1' }];
    const assessments = [
      {
        id: 'l1', child_id: 'c1', assessment_type: 'letter_egra',
        date_assessed: '2026-05-01', created_at: '2026-05-01T10:00:00Z',
        accuracy: 80, correct_letters: lettersCorrect(22), last_letter_attempted: { index: 29 },
      },
      {
        id: 'w1', child_id: 'c1', assessment_type: 'word_egra',
        date_assessed: '2026-05-10', created_at: '2026-05-10T10:00:00Z',
        accuracy: 50, correct_letters: lettersCorrect(5), last_letter_attempted: { index: 9 },
      },
    ];

    const ranked = getLetterAssessmentRanking(children, assessments);

    expect(ranked[0].correct).toBe(22);        // the letter assessment, not the later word (5)
    expect(ranked[0].assessment.id).toBe('l1');
  });

  test('a child with only word assessments shows as not assessed here', () => {
    const children = [{ id: 'c2', first_name: 'C', class_id: 'cls1' }];
    const assessments = [
      {
        id: 'w2', child_id: 'c2', assessment_type: 'word_egra',
        date_assessed: '2026-05-10', created_at: '2026-05-10T10:00:00Z',
        accuracy: 70, correct_letters: lettersCorrect(8),
      },
    ];

    const ranked = getLetterAssessmentRanking(children, assessments);

    expect(ranked[0].accuracy).toBeNull();
    expect(ranked[0].assessment).toBeNull();
  });

  test('treats a missing assessment_type as a letter assessment (legacy rows)', () => {
    const children = [{ id: 'c3', first_name: 'D', class_id: 'cls1' }];
    const assessments = [
      {
        id: 'legacy', child_id: 'c3',
        date_assessed: '2026-05-05', created_at: '2026-05-05T10:00:00Z',
        accuracy: 90, correct_letters: lettersCorrect(2), last_letter_attempted: { index: 1 },
      },
    ];

    const ranked = getLetterAssessmentRanking(children, assessments);

    expect(ranked[0].assessment.id).toBe('legacy');
  });
});

describe('getWordAssessmentRanking — ranks words only, ignores letter assessments', () => {
  test('ranks by the latest WORD assessment even when a letter assessment is more recent', () => {
    const children = [{ id: 'c1', first_name: 'A', last_name: 'B', class_id: 'cls1' }];
    const assessments = [
      {
        id: 'w1', child_id: 'c1', assessment_type: 'word_egra',
        date_assessed: '2026-05-01', created_at: '2026-05-01T10:00:00Z',
        accuracy: 60, correct_letters: lettersCorrect(12), last_letter_attempted: { index: 19 },
      },
      {
        id: 'l1', child_id: 'c1', assessment_type: 'letter_egra',
        date_assessed: '2026-05-10', created_at: '2026-05-10T10:00:00Z',
        accuracy: 90, correct_letters: lettersCorrect(40), last_letter_attempted: { index: 49 },
      },
    ];

    const ranked = getWordAssessmentRanking(children, assessments);

    expect(ranked[0].correct).toBe(12);        // the word assessment, not the later letter (40)
    expect(ranked[0].assessment.id).toBe('w1');
  });

  test('legacy rows without assessment_type are NOT words (excluded from word mode)', () => {
    const children = [{ id: 'c3', first_name: 'D', class_id: 'cls1' }];
    const assessments = [
      {
        id: 'legacy', child_id: 'c3',
        date_assessed: '2026-05-05', created_at: '2026-05-05T10:00:00Z',
        accuracy: 90, correct_letters: lettersCorrect(2),
      },
    ];

    const ranked = getWordAssessmentRanking(children, assessments);

    expect(ranked[0].accuracy).toBeNull();     // legacy defaults to letter, so not assessed here
    expect(ranked[0].assessment).toBeNull();
  });
});
