export const TIER_HIGH = 'high';
export const TIER_LOW = 'low';
export const TIER_STATIC = 'static';

const GIB = 1024 ** 3;

// Ported from Zazi: expo-device reports OS-visible RAM below the nominal size.
export function classifyTier({ platform, deviceYearClass, totalMemory, reduceMotion = false } = {}) {
  if (reduceMotion) return TIER_STATIC;
  if (platform === 'ios') return TIER_HIGH;
  const hasMemory = typeof totalMemory === 'number' && totalMemory > 0;
  const hasYear = typeof deviceYearClass === 'number' && deviceYearClass > 0;
  if (hasMemory && totalMemory < 1.5 * GIB) return TIER_STATIC;
  if (hasYear && deviceYearClass < 2019) return TIER_LOW;
  if (hasMemory && totalMemory < 3 * GIB) return TIER_LOW;
  if (!hasYear && !hasMemory) return TIER_LOW;
  return TIER_HIGH;
}

export function motionLevelForTier(tier) {
  return tier === TIER_STATIC ? 'still' : tier === TIER_LOW ? 'calm' : 'full';
}
