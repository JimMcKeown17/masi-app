export const formatChildName = child => [child.first_name?.trim(), child.last_name?.trim()].filter(Boolean).join(' ');

export const compareChildNames = (a, b) => formatChildName(a).localeCompare(formatChildName(b), undefined, { sensitivity: 'base' });

export function formatNameList(names, { spoken = false } = {}) {
  if (names.length < 2) return names[0] || '';
  const joiner = spoken ? ' and ' : ' & ';
  return names.slice(0, -1).join(', ') + joiner + names[names.length - 1];
}
