import { createHash } from 'crypto';
import { adaptEgraForm, EGRA_FORMS } from '..';

// Captured from the adapter before the shared-content refactor (2026-10-26 plan, Task 1 Step 0).
// Run with --ci and never update this snapshot: it proves the 13 old forms still adapt exactly as
// they did. Question titles are left out because the old Q4 is renamed to "Story comprehension".
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, canonical(record[key])]));
  }
  return value;
};

test.each(EGRA_FORMS.map(form => [form.id, form] as const))('%s adapts exactly as before the shared-content refactor', (_id, form) => {
  const { itemSets, battery } = adaptEgraForm(form);
  const stable = {
    itemSets,
    battery: { ...battery, questions: battery.questions.map(({ title: _title, ...question }) => question) },
  };
  expect(createHash('sha256').update(JSON.stringify(canonical(stable))).digest('hex')).toMatchSnapshot();
});
