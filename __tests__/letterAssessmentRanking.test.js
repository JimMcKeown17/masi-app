import { getLetterScoreRanking, getWordAssessmentRanking } from '../src/utils/dashboardStats';

// Each ranking selects its Question and uses stored raw scores across both entry points.

describe('getLetterScoreRanking — ranks letters only, ignores word assessments', () => {
  test('ranks by the latest LETTER assessment even when a word assessment is more recent', () => {
    const children = [{ id: 'c1', first_name: 'A', last_name: 'B', class_id: 'cls1' }];
    const assessments = [
      {
        id: 'l1', child_id: 'c1', question_code: 'letter_sounds',
        assessment_date: '2026-05-01', created_at: '2026-05-01T10:00:00Z',
        score: 22, total_items: 30,
      },
      {
        id: 'w1', child_id: 'c1', question_code: 'word_reading',
        assessment_date: '2026-05-10', created_at: '2026-05-10T10:00:00Z',
        score: 5, total_items: 10,
      },
    ];

    const ranked = getLetterScoreRanking(children, assessments);

    expect(ranked[0].score).toBe(22);        // the letter assessment, not the later word (5)
    expect(ranked[0].assessment.id).toBe('l1');
  });

  test('a child with only word results is excluded from the letter ranking', () => {
    const children = [{ id: 'c2', first_name: 'C', class_id: 'cls1' }];
    const assessments = [
      {
        id: 'w2', child_id: 'c2', question_code: 'word_reading',
        assessment_date: '2026-05-10', created_at: '2026-05-10T10:00:00Z',
        score: 8, total_items: 50,
      },
    ];

    const ranked = getLetterScoreRanking(children, assessments);

    expect(ranked).toEqual([]);
  });

  test('does not invent a Question for a row with no question_code', () => {
    const children = [{ id: 'c3', first_name: 'D', class_id: 'cls1' }];
    const assessments = [
      {
        id: 'legacy', child_id: 'c3',
        assessment_date: '2026-05-05', created_at: '2026-05-05T10:00:00Z',
        score: 2, total_items: 2,
      },
    ];

    const ranked = getLetterScoreRanking(children, assessments);

    expect(ranked).toEqual([]);
  });
});

describe('getWordAssessmentRanking — ranks words only, ignores letter assessments', () => {
  test('ranks by the latest WORD assessment even when a letter assessment is more recent', () => {
    const children = [{ id: 'c1', first_name: 'A', last_name: 'B', class_id: 'cls1' }];
    const assessments = [
      {
        id: 'w1', child_id: 'c1', question_code: 'word_reading',
        assessment_date: '2026-05-01', created_at: '2026-05-01T10:00:00Z',
        score: 12, total_items: 20,
      },
      {
        id: 'l1', child_id: 'c1', question_code: 'letter_sounds',
        assessment_date: '2026-05-10', created_at: '2026-05-10T10:00:00Z',
        score: 40, total_items: 50,
      },
    ];

    const ranked = getWordAssessmentRanking(children, assessments);

    expect(ranked[0].score).toBe(12);        // the word assessment, not the later letter (40)
    expect(ranked[0].assessment.id).toBe('w1');
  });

  test('legacy rows without question_code are NOT words (excluded from word mode)', () => {
    const children = [{ id: 'c3', first_name: 'D', class_id: 'cls1' }];
    const assessments = [
      {
        id: 'legacy', child_id: 'c3',
        assessment_date: '2026-05-05', created_at: '2026-05-05T10:00:00Z',
        score: 2, total_items: 50,
      },
    ];

    const ranked = getWordAssessmentRanking(children, assessments);

    expect(ranked).toEqual([]);
  });
});

const classes = [
  { id: 'old', grade: 'Grade R', home_language: 'English' },
  { id: 'current', grade: 'Grade 2', home_language: 'isiXhosa' },
];
const child = { id: 'c1', class_id: 'current' };
const memberships = [
  { child_id: 'c1', class_id: 'old', enrolled_at: '2026-01-10T23:59:59Z', exited_at: '2026-06-01T12:00:00Z' },
  { child_id: 'c1', class_id: 'current', enrolled_at: '2026-06-01T12:00:00Z', exited_at: null },
];
const result = (overrides = {}) => ({
  id: 'letter', child_id: 'c1', question_code: 'letter_sounds', language: 'xh',
  assessment_date: '2026-05-31', created_at: '2026-05-31T12:00:00Z',
  score: 20, total_items: 61, stopped_reason: 'completed', ...overrides,
});

test.each([
  ['2026-01-10', 'Grade 2', 'okay'], // 23:59 UTC enrolls on January 11 in SAST
  ['2026-01-11', 'Grade R', 'great'], // local enrollment DATE included
  ['2026-05-31', 'Grade R', 'great'],
  ['2026-06-01', 'Grade 2', 'okay'], // exit DATE excluded; replacement enrollment DATE included
  ['2026-01-09', 'Grade 2', 'okay'], // outside both memberships: current class fallback
])('grade and raw-score band use the class membership DATE window on %s', (assessment_date, grade, band) => {
  const [ranked] = getLetterScoreRanking([child], [result({ assessment_date })], classes, memberships);
  expect(ranked).toMatchObject({ score: 20, total: 61, grade, band, date: assessment_date });
});

test.each([
  ['2026-03-31', 'Grade R', 'great'],
  ['2026-04-01', 'Grade 2', 'okay'],
])('a 01:30 SAST class move uses the local exit day for a result dated %s', (assessment_date, grade, band) => {
  const originalTimeZone = process.env.TZ;
  try {
    process.env.TZ = 'Africa/Johannesburg';
    const move = '2026-03-31T23:30:00.000Z'; // April 1, 01:30 SAST.
    const localMemberships = [
      { child_id: child.id, class_id: 'old', enrolled_at: '2026-01-01T00:00:00Z', exited_at: move },
      { child_id: child.id, class_id: 'current', enrolled_at: move, exited_at: null },
    ];
    const [ranked] = getLetterScoreRanking([child], [result({ assessment_date })], classes, localMemberships);
    expect(ranked).toMatchObject({ grade, band });
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test('battery Questions qualify, skipped results do not, and latest date then created_at wins', () => {
  const latest = result({ id: 'battery', battery_run_id: 'run', score: 9, total_items: 60 });
  const ranked = getLetterScoreRanking([child, { id: 'skipped' }], [
    latest,
    result({ id: 'older-same-day', created_at: '2026-05-31T10:00:00Z', score: 50 }),
    result({ id: 'older-day', assessment_date: '2026-05-30', created_at: '2026-05-31T23:00:00Z', score: 60 }),
    result({ id: 'skip', child_id: 'skipped', stopped_reason: 'skipped_child_refused', score: 0, total_items: 0 }),
  ], classes, memberships);
  expect(ranked).toHaveLength(1);
  expect(ranked[0]).toMatchObject({ score: 9, total: 60, assessment: latest });
});

test('word scores retain their own scale and have no invented letter benchmark', () => {
  const [ranked] = getWordAssessmentRanking([child], [result({ question_code: 'word_reading', total_items: 43 })], classes, memberships);
  expect(ranked).toMatchObject({ score: 20, total: 43, band: 'unknown' });
});
