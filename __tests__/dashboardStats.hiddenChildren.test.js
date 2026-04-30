import { getAssessmentsTabStats } from '../src/utils/dashboardStats';

// Verifies the user's product decision: hidden children are excluded from
// dashboard stats. The active list passed in is what useChildren().children
// would return — already filtered. Assessments belonging to ids NOT in that
// active set must be ignored when computing totalAssessments and avgAccuracy.

describe('getAssessmentsTabStats — hidden children excluded from stats', () => {
  test('totalAssessments counts only assessments for active children', () => {
    const activeChildren = [
      { id: 'c1', first_name: 'A' },
      { id: 'c2', first_name: 'B' },
    ];
    const assessments = [
      { id: 'a1', child_id: 'c1', accuracy: 80, date_assessed: '2026-04-29', created_at: '2026-04-29T10:00:00Z' },
      { id: 'a2', child_id: 'c2', accuracy: 60, date_assessed: '2026-04-29', created_at: '2026-04-29T11:00:00Z' },
      // Hidden child's assessment — c3 is NOT in activeChildren
      { id: 'a3', child_id: 'c3', accuracy: 30, date_assessed: '2026-04-29', created_at: '2026-04-29T12:00:00Z' },
    ];

    const stats = getAssessmentsTabStats(activeChildren, assessments);

    expect(stats.totalAssessments).toBe(2); // only a1 and a2 count
  });

  test('avgAccuracy is computed only over active children, not hidden ones', () => {
    const activeChildren = [
      { id: 'c1' },
      { id: 'c2' },
    ];
    const assessments = [
      { id: 'a1', child_id: 'c1', accuracy: 100, date_assessed: '2026-04-29', created_at: '2026-04-29T10:00:00Z' },
      { id: 'a2', child_id: 'c2', accuracy: 80, date_assessed: '2026-04-29', created_at: '2026-04-29T11:00:00Z' },
      // Hidden child's low accuracy must NOT pull the average down
      { id: 'a3', child_id: 'c3', accuracy: 0, date_assessed: '2026-04-29', created_at: '2026-04-29T12:00:00Z' },
    ];

    const stats = getAssessmentsTabStats(activeChildren, assessments);

    expect(stats.avgAccuracy).toBe(90); // (100 + 80) / 2 — hidden c3 excluded
  });

  test('percentAssessed denominator reflects only active children', () => {
    const activeChildren = [
      { id: 'c1' },
      { id: 'c2' }, // not assessed
    ];
    const assessments = [
      { id: 'a1', child_id: 'c1', accuracy: 80, date_assessed: '2026-04-29', created_at: '2026-04-29T10:00:00Z' },
      // Assessment for hidden child should NOT make percentAssessed jump
      { id: 'a2', child_id: 'c3', accuracy: 80, date_assessed: '2026-04-29', created_at: '2026-04-29T10:00:00Z' },
    ];

    const stats = getAssessmentsTabStats(activeChildren, assessments);

    expect(stats.percentAssessed).toBe(50); // 1 of 2 active children assessed
  });

  test('latest-per-child logic uses only active assessments', () => {
    const activeChildren = [{ id: 'c1' }];
    const assessments = [
      // Earlier assessment for c1
      { id: 'a1', child_id: 'c1', accuracy: 50, date_assessed: '2026-04-20', created_at: '2026-04-20T10:00:00Z' },
      // Later assessment for c1 — should win
      { id: 'a2', child_id: 'c1', accuracy: 80, date_assessed: '2026-04-29', created_at: '2026-04-29T10:00:00Z' },
      // Hidden child assessment — must be ignored even though it's the latest overall
      { id: 'a3', child_id: 'cHidden', accuracy: 10, date_assessed: '2026-04-30', created_at: '2026-04-30T10:00:00Z' },
    ];

    const stats = getAssessmentsTabStats(activeChildren, assessments);

    // Most recent c1 assessment is 80% — that's the average since c1 is the only active child
    expect(stats.avgAccuracy).toBe(80);
  });

  test('handles empty active children gracefully', () => {
    const stats = getAssessmentsTabStats([], [
      { id: 'a1', child_id: 'cHidden', accuracy: 80, date_assessed: '2026-04-29' },
    ]);

    expect(stats.totalAssessments).toBe(0);
    expect(stats.avgAccuracy).toBe(0);
    expect(stats.percentAssessed).toBe(0);
  });
});
