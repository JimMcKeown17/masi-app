import { READING_LEVELS } from '../../constants/literacyConstants';
import { BLEND_TIERS } from './constants';
import { letterCount } from './sounds';

export const tierForLetterCount = (n) => {
  if (n <= 2) return BLEND_TIERS[0];
  if (n === 3) return BLEND_TIERS[1];
  if (n === 4) return BLEND_TIERS[2];
  return BLEND_TIERS[3];
};

export const blendTierForReadingLevel = (level) => {
  const index = READING_LEVELS.indexOf(level);
  return BLEND_TIERS[Math.max(0, Math.min(index - 1, BLEND_TIERS.length - 1))];
};

export const deriveSessionReadingLevel = (blendsDone) => {
  if (!Array.isArray(blendsDone)) return null;
  const longest = blendsDone.reduce((count, text) => Math.max(count, letterCount(text)), 0);
  return longest === 0 ? null : tierForLetterCount(longest);
};
