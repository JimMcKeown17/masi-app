import { GROUP_DOT_COLORS } from '../constants/groupColors';

export function getGroupDotColor(index) {
  if (!Number.isFinite(index) || index < 0) return GROUP_DOT_COLORS[0];
  return GROUP_DOT_COLORS[Math.trunc(index) % GROUP_DOT_COLORS.length];
}

/**
 * Regex matching the preset "Group N" format, where N is a positive integer.
 * Used for numeric sorting and next-number computation.
 */
const NUMBERED_GROUP = /^Group (\d+)$/;

export function groupNumber(group) {
  return group.display_number ?? (group.name.match(NUMBERED_GROUP) ? Number(group.name.match(NUMBERED_GROUP)[1]) : null);
}

export function ungroupedChildren({ children, childrenGroups }) {
  const grouped = new Set(childrenGroups.filter(member => !member.removed_at).map(member => member.child_id));
  return children.filter(child => !grouped.has(child.id));
}

export function sharedClassId(children) {
  const classId = children[0]?.class_id;
  return classId != null && children.every(child => child.class_id === classId) ? classId : null;
}

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
