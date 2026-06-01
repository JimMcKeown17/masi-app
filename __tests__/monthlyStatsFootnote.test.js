import { getMonthlyStatsFootnote } from '../src/utils/dashboardStats';

describe('getMonthlyStatsFootnote — context for the Home monthly figures', () => {
  test('names the current month and year for the monthly stats', () => {
    const footnote = getMonthlyStatsFootnote(new Date(2026, 4, 15)); // May 2026
    expect(footnote).toMatch(/May 2026/);
    // Makes clear which figures are the monthly ones.
    expect(footnote).toMatch(/days worked/i);
    expect(footnote).toMatch(/sessions/i);
  });

  test('reflects a different month', () => {
    expect(getMonthlyStatsFootnote(new Date(2026, 0, 3))).toMatch(/January 2026/);
  });
});
