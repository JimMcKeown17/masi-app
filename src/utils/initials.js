export function getInitials(firstName, lastName) {
  return [firstName, lastName]
    .map((name) => (Array.from(String(name ?? '').trim())[0] || '').toUpperCase())
    .join('');
}
