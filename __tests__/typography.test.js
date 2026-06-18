import { typography } from '../src/constants/typography';
import { colors } from '../src/constants/colors';

describe('Masi typography tokens', () => {
  it('pins the approved type scale', () => {
    expect(typography.screenTitle.fontSize).toBe(26);
    expect(typography.screenTitle.fontWeight).toBe('800');
    expect(typography.screenTitle.letterSpacing).toBe(-0.5);

    expect(typography.cardTitle.fontSize).toBe(16);
    expect(typography.cardTitle.fontWeight).toBe('800');

    expect(typography.body.fontSize).toBe(14);
    expect(typography.body.fontWeight).toBe('600');

    expect(typography.sectionLabel.textTransform).toBe('uppercase');
    expect(typography.sectionLabel.fontWeight).toBe('800');
    expect(typography.sectionLabel.letterSpacing).toBe(0.5);

    expect(typography.caption.color).toBe(colors.textSecondary);

    expect(typography.statValue.fontSize).toBe(26);
  });

  it('keeps informational text at least 12px', () => {
    Object.values(typography).forEach((entry) => {
      expect(entry.fontSize).toBeGreaterThanOrEqual(12);
    });
  });
});
