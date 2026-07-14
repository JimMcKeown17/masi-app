import { GROUP_COLORS } from '../constants/groupColors';

/**
 * Get color for a group based on its index in the sorted groups array.
 */
export function getGroupColor(groupIndex) {
  return GROUP_COLORS[groupIndex % GROUP_COLORS.length];
}

/**
 * Regex matching the preset "Group N" format, where N is a positive integer.
 * Used for numeric sorting and next-number computation.
 */
const NUMBERED_GROUP = /^Group (\d+)$/;

/**
 * Compute the next group number for the "+ Add Group N" button.
 * Returns max(existing numbered) + 1, or 1 if no numbered groups exist.
 * Monotonic, so it does not fill gaps from deleted groups.
 * Ignores legacy free-text names.
 */
export function nextGroupNumber(groups) {
  const nums = groups
    .map((g) => g.name.match(NUMBERED_GROUP))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/**
 * Comparator for sorting groups:
 *   1. Numbered groups ("Group N") first, sorted numerically.
 *   2. Legacy free-text names after, sorted alphabetically.
 * Solves the "Group 10 before Group 2" lexicographic gotcha.
 */
export function compareGroups(a, b) {
  const ma = a.name.match(NUMBERED_GROUP);
  const mb = b.name.match(NUMBERED_GROUP);
  if (ma && mb) return parseInt(ma[1], 10) - parseInt(mb[1], 10);
  if (ma) return -1;
  if (mb) return 1;
  return a.name.localeCompare(b.name);
}
