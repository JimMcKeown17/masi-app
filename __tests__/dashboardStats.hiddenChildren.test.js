import { getAssessmentsTabStats, getChildrenTabStats, getAssessmentCoverage, getCoverageFromCounts } from '../src/utils/dashboardStats';

// Verifies the user's product decision: hidden children are excluded from
// dashboard stats. The active list passed in is what useChildren().children
// would return — already filtered. Assessments belonging to ids NOT in that
// active set must be ignored when computing totalAssessments and avgScore.

const academicYear = { is_active: 1, starts_on: '2026-01-01', ends_on: '2026-12-31' };

describe('getAssessmentsTabStats — hidden children excluded from stats', () => {
  test('totalAssessments counts only assessments for active children', () => {
    const activeChildren = [
      { id: 'c1', first_name: 'A' },
      { id: 'c2', first_name: 'B' },
    ];
    const assessments = [
      { id: 'a1', child_id: 'c1', question_code: 'letter_sounds', score: 40, assessment_date: '2026-04-29', created_at: '2026-04-29T10:00:00Z' },
      { id: 'a2', child_id: 'c2', question_code: 'letter_sounds', score: 30, assessment_date: '2026-04-29', created_at: '2026-04-29T11:00:00Z' },
      // Hidden child's assessment — c3 is NOT in activeChildren
      { id: 'a3', child_id: 'c3', question_code: 'letter_sounds', score: 30, assessment_date: '2026-04-29', created_at: '2026-04-29T12:00:00Z' },
    ];

    const stats = getAssessmentsTabStats(activeChildren, assessments, academicYear);

    expect(stats.totalAssessments).toBe(2); // only a1 and a2 count
  });

  test('avgScore is computed only over active children, not hidden ones', () => {
    const activeChildren = [
      { id: 'c1' },
      { id: 'c2' },
    ];
    const assessments = [
      { id: 'a1', child_id: 'c1', question_code: 'letter_sounds', score: 25, assessment_date: '2026-04-29', created_at: '2026-04-29T10:00:00Z' },
      { id: 'a2', child_id: 'c2', question_code: 'letter_sounds', score: 40, assessment_date: '2026-04-29', created_at: '2026-04-29T11:00:00Z' },
      // Hidden child's low score must NOT pull the average down
      { id: 'a3', child_id: 'c3', question_code: 'letter_sounds', score: 0, assessment_date: '2026-04-29', created_at: '2026-04-29T12:00:00Z' },
    ];

    const stats = getAssessmentsTabStats(activeChildren, assessments, academicYear);

    expect(stats.avgScore).toBe(33); // round((25 + 40) / 2) — hidden c3 excluded
  });

  test('percentAssessed denominator reflects only active children', () => {
    const activeChildren = [
      { id: 'c1' },
      { id: 'c2' }, // not assessed
    ];
    const assessments = [
      { id: 'a1', child_id: 'c1', question_code: 'letter_sounds', score: 40, assessment_date: '2026-04-29', created_at: '2026-04-29T10:00:00Z' },
      // Assessment for hidden child should NOT make percentAssessed jump
      { id: 'a2', child_id: 'c3', question_code: 'letter_sounds', score: 40, assessment_date: '2026-04-29', created_at: '2026-04-29T10:00:00Z' },
    ];

    const stats = getAssessmentsTabStats(activeChildren, assessments, academicYear);

    expect(stats.percentAssessed).toBe(50); // 1 of 2 active children assessed
  });

  test('latest-per-child logic uses only active assessments', () => {
    const activeChildren = [{ id: 'c1' }];
    const assessments = [
      // Earlier assessment for c1
      { id: 'a1', child_id: 'c1', question_code: 'letter_sounds', score: 50, assessment_date: '2026-04-20', created_at: '2026-04-20T10:00:00Z' },
      // Later assessment for c1 — should win
      { id: 'a2', child_id: 'c1', question_code: 'letter_sounds', score: 40, assessment_date: '2026-04-29', created_at: '2026-04-29T10:00:00Z' },
      // Hidden child assessment — must be ignored even though it's the latest overall
      { id: 'a3', child_id: 'cHidden', question_code: 'letter_sounds', score: 10, assessment_date: '2026-04-30', created_at: '2026-04-30T10:00:00Z' },
    ];

    const stats = getAssessmentsTabStats(activeChildren, assessments, academicYear);

    // Most recent c1 raw score is 40 — that's the average since c1 is the only active child
    expect(stats.avgScore).toBe(40);
  });

  test('handles empty active children gracefully', () => {
    const stats = getAssessmentsTabStats([], [
      { id: 'a1', child_id: 'cHidden', question_code: 'letter_sounds', score: 40, assessment_date: '2026-04-29' },
    ], academicYear);

    expect(stats.totalAssessments).toBe(0);
    expect(stats.avgScore).toBe(0);
    expect(stats.percentAssessed).toBe(0);
  });
});

const yearResult = (overrides = {}) => ({
  child_id: 'c1', question_code: 'letter_sounds', assessment_date: '2026-06-01',
  created_at: '2026-06-01T12:00:00Z', score: 20, stopped_reason: 'completed', ...overrides,
});

test('counts only non-skipped letter results inside both inclusive academic year DATE edges', () => {
  const children = ['c1', 'c2', 'c3', 'c4'].map(id => ({ id }));
  const rows = [
    yearResult({ assessment_date: academicYear.starts_on, score: 8 }),
    yearResult({ child_id: 'c2', assessment_date: academicYear.ends_on, score: 21, battery_run_id: 'run' }),
    yearResult({ child_id: 'c3', stopped_reason: 'skipped_other' }),
    yearResult({ child_id: 'c4', question_code: 'word_reading' }),
    yearResult({ assessment_date: '2025-12-31', score: 60 }),
    yearResult({ assessment_date: '2027-01-01', score: 60 }),
  ];
  expect(getAssessmentsTabStats(children, rows, academicYear)).toEqual({
    percentAssessed: 50, totalAssessments: 2, avgScore: 15,
  });
  expect(getChildrenTabStats(children, children, [{ id: 'class' }], rows, academicYear)).toEqual({
    childrenCount: 4, classCount: 1, unassessedCount: 2,
  });
  expect(getAssessmentCoverage(children, rows, academicYear)).toEqual({ assessed: 2, total: 4, percent: 50 });
});

test.each([undefined, null, { ...academicYear, is_active: 0 }])('no active academic year means no letter evidence (%s)', (year) => {
  const children = [{ id: 'c1' }];
  const rows = [yearResult()];
  expect(getAssessmentsTabStats(children, rows, year)).toEqual({ percentAssessed: 0, totalAssessments: 0, avgScore: 0 });
  expect(getChildrenTabStats(children, children, [], rows, year).unassessedCount).toBe(1);
  expect(getAssessmentCoverage(children, rows, year)).toEqual({ assessed: 0, total: 1, percent: 0 });
});

test('typed result readers never interpret a missing Question code as a count summary', () => {
  const children = [{ id: 'c1' }];
  const rows = [yearResult({ question_code: undefined, count: 2 })];
  expect(getAssessmentCoverage(children, rows, academicYear)).toEqual({ assessed: 0, total: 1, percent: 0 });
  expect(getChildrenTabStats(children, children, [], rows, academicYear).unassessedCount).toBe(1);
  expect(getAssessmentsTabStats(children, rows, academicYear))
    .toEqual({ percentAssessed: 0, totalAssessments: 0, avgScore: 0 });
});

test('Home coverage explicitly consumes the repository’s already-qualified positive letter counts', () => {
  expect(getCoverageFromCounts([{ id: 'c1' }, { id: 'c2' }], [
    { child_id: 'c1', count: 2 }, { child_id: 'c2', count: 0 }, { child_id: 'hidden', count: 4 },
  ])).toEqual({ assessed: 1, total: 2, percent: 50 });
  expect(getCoverageFromCounts([], [{ child_id: 'hidden', count: 4 }]))
    .toEqual({ assessed: 0, total: 0, percent: 0 });
});

test('average uses the latest qualifying letter score per child with created_at breaking date ties', () => {
  expect(getAssessmentsTabStats([{ id: 'c1' }, { id: 'c2' }], [
    yearResult({ score: 1, created_at: '2026-06-01T10:00:00Z' }),
    yearResult({ score: 40, created_at: '2026-06-01T12:00:00Z' }),
    yearResult({ score: 60, assessment_date: '2026-05-31', created_at: '2026-06-01T23:00:00Z' }),
    yearResult({ child_id: 'c2', score: 9 }),
    yearResult({ score: 50, question_code: 'word_reading', assessment_date: '2026-07-01' }),
    yearResult({ score: 0, stopped_reason: 'skipped_tired', assessment_date: '2026-07-02' }),
  ], academicYear)).toEqual({ percentAssessed: 100, totalAssessments: 4, avgScore: 25 });
});

test('children tab keeps delivery child count, held class count and assessable unassessed count independent', () => {
  const delivery = [{ id: 'delivery' }];
  const assessable = [...delivery, { id: 'control-a' }, { id: 'control-b' }];
  const classes = [{ id: 'delivery-class' }, { id: 'control-class' }];
  const results = [{ child_id: 'delivery', question_code: 'letter_sounds',
    stopped_reason: 'completed', assessment_date: '2026-06-01', score: 20 }];
  expect(getChildrenTabStats(delivery, assessable, classes, results, academicYear)).toEqual({
    childrenCount: 1, classCount: 2, unassessedCount: 2,
  });
});
