const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

const SKILLS = deepFreeze([
  ['finger_flash', 'Finger flash', [5, 10]],
  ['count', 'Count', [5, 10, 20]],
  ['read_numbers', 'Read numbers', [5, 10, 20, 50, 100]],
  ['compare', 'Compare', [5, 10, 20, 50, 100]],
  ['before_after', 'Before & after', [5, 10, 20, 50, 100]],
  ['add', 'Add', [5, 10, 15, 20]],
  ['subtract', 'Take away', [5, 10, 15, 20]],
  ['number_pairs', 'Number pairs', [5, 10]],
  ['count_aloud', 'Count aloud', [10, 20, 50, 100]],
  ['skip_count', 'Skip count', [20, 50, 100]],
]);
const keyFor = (skill, size) => `${skill}.${skill === 'skip_count' ? { 20: '2s', 50: '5s', 100: '10s' }[size] : size}`;

/** A frozen curriculum input, independent of the bundled content edition. */
export function buildNumeracyCurriculumFixture({ activities = {} } = {}) {
  return deepFreeze({
    edition: '2026.1-draft',
    skills: SKILLS.map(([skill, label, sizes]) => ({
      key: skill, label, hint: 'Try together.',
      group: ['count_aloud', 'skip_count'].includes(skill) ? 'counting' : 'main',
      slot: ['finger_flash', 'count_aloud', 'skip_count'].includes(skill) ? 'warm_up' : 'activity',
      steps: sizes.map((size, index) => {
        const key = keyFor(skill, size);
        const comesAfter = index > 0 ? [keyFor(skill, sizes[index - 1])] : [];
        if (['add', 'subtract', 'compare', 'number_pairs'].includes(skill)) {
          comesAfter.push(size > 20 ? `read_numbers.${size}` : `count.${size === 15 ? 20 : size}`);
        }
        if (skill === 'before_after') comesAfter.push(`read_numbers.${size}`);
        if (['subtract', 'number_pairs'].includes(skill)) comesAfter.push(`add.${size}`);
        if (key === 'number_pairs.5') comesAfter.push('finger_flash.5');
        if (skill === 'skip_count') comesAfter.push(`count_aloud.${size}`);
        return {
          key, skill, size,
          label: skill === 'skip_count' ? `${key.split('.')[1]} to ${size}` : `up to ${size}`,
          goal: 'Try these numbers.',
          activities: (activities[key] ?? [
            { name: `${key} A`, minutes: 5, how: 'Try together.', needs: 'Counters', source: 'new', source_ref: 'Fixture' },
            { name: `${key} B`, minutes: 7, how: 'Try in pairs.', needs: 'Cards', source: 'new', source_ref: 'Fixture' },
          ]).map((activity) => ({ ...activity })),
          tick_when: 'All 3 right? Tick it.',
          comes_after: comesAfter.sort(), note_for_partner: 'Review this step.',
        };
      }),
    })),
  });
}
