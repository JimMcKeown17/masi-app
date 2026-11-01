import { getCurriculum } from '../content/numeracy-curriculum';
import { buildNumeracyCurriculumFixture } from '../test-support/numeracyCurriculumFixture';
import { buildTrackerModel, TRACKER_COLUMNS, formatTickedOn, tickedByLine } from '../src/numeracyLesson/trackerModel';
import { masteryStateColors } from '../src/constants/masteryStateColors';
import { letterStateColors } from '../src/constants/letterStateColors';

const curriculum = getCurriculum();
const tick = (step_key, changed_by = 'ea') => ({ step_key, confirmed: true, changed_by, changed_at: '2026-11-02T22:30:00.000Z' });
const row = (model, key) => model.sections.flatMap(s => s.rows).find(r => r.skillKey === key);
const tile = (model, key) => model.sections.flatMap(s => s.rows).flatMap(r => r.tiles).find(t => t.stepKey === key);
const build = (options = {}) => buildTrackerModel({ curriculum, userId: 'ea', ...options });

test('header count and sections follow the curriculum', () => {
  const model = build({ ticks: [tick('add.10')] });
  expect(model.knownCount).toBe(2);
  expect(model.total).toBe(37);
  expect(model.sections.map(s => [s.key, s.title])).toEqual([['main', null], ['counting', 'Counting']]);
  expect(model.sections[1].rows.map(r => r.skillKey)).toEqual(['count_aloud', 'skip_count']);
  expect(model.sections.flatMap(s => s.rows).map(r => r.skillKey)).toEqual(curriculum.skills.map(s => s.key));
  expect(row(model, 'add')).toMatchObject({ label: 'Add', hint: curriculum.skills.find(s => s.key === 'add').hint, nextStepKey: 'add.15' });
  const finished = build({ ticks: curriculum.skills.find(s => s.key === 'add').steps.map(s => tick(s.key)) });
  expect(row(finished, 'add').nextStepKey).toBeNull();
  expect(build({ curriculum: { ...curriculum, skills: curriculum.skills.filter(s => s.group === 'main') } }).sections).toHaveLength(1);
  expect(masteryStateColors).toBe(letterStateColors);
});

test('equal sizes share a column across rows', () => {
  const model = build();
  expect(TRACKER_COLUMNS).toEqual([5, 10, 15, 20, 50, 100]);
  expect(Object.isFrozen(TRACKER_COLUMNS)).toBe(true);
  for (const key of ['count.10', 'add.10', 'read_numbers.10']) expect(tile(model, key).column).toBe(1);
  expect(tile(model, 'skip_count.2s')).toMatchObject({ sizeLabel: '2s', column: 3 });
  expect(tile(model, 'skip_count.5s').column).toBe(4);
  expect(tile(model, 'skip_count.10s').column).toBe(5);
  const custom = { skills: [{ key: 'test', group: 'main', steps: [7, 200].map(size => ({ key: `test.${size}`, size, comes_after: [] })) }] };
  expect(row(build({ curriculum: custom }), 'test').tiles.map(t => t.column)).toEqual([1, 5]);
});

test('implied tiles come from a higher tick and pending changes apply first', () => {
  const pending = { 'add.10': { mastered: true, madeAt: '2026-11-03T08:00:00Z' } };
  const model = build({ pending });
  expect(tile(model, 'add.5')).toMatchObject({ state: 'implied', pending: false, tickedBy: null, tickedOn: null });
  expect(tile(model, 'add.10')).toMatchObject({ state: 'ticked', pending: true, tickedBy: 'you', tickedOn: '2026-11-03' });
  const ticks = [tick('add.10')];
  const removal = { 'add.10': { mastered: false, madeAt: '2026-11-03T08:00:00Z' } };
  const removed = build({ ticks, pending: removal });
  expect(removed.knownCount).toBe(0);
  expect(tile(removed, 'add.5').state).toBe('not_yet');
  expect(tile(removed, 'add.10')).toMatchObject({ state: 'not_yet', pending: true });
  expect(tile(build({ ticks, pending: removal, evidence: new Map([['add.10', { shown: true }]]) }), 'add.10').state).toBe('assessment');
  expect(ticks).toEqual([tick('add.10')]);
  expect(pending['add.10'].mastered).toBe(true);
});

test('only a ready next step gets the dashed outline', () => {
  for (const content of [curriculum, buildNumeracyCurriculumFixture()]) {
    const empty = build({ curriculum: content });
    expect(row(empty, 'count').nextStepKey).toBe('count.5');
    expect(tile(empty, 'count.5').next).toBe(true);
    expect(row(empty, 'add').nextStepKey).toBe('add.5');
    expect(tile(empty, 'add.5').next).toBe(false);
    const ready = build({ curriculum: content, ticks: [tick('count.5')] });
    expect(tile(ready, 'add.5').next).toBe(true);
    expect(tile(ready, 'add.10').next).toBe(false);
  }
});

test('ticked-by reads you or another EA', () => {
  const model = build({ ticks: [tick('add.5'), tick('count.5', 'other')] });
  expect(tile(model, 'add.5').tickedBy).toBe('you');
  expect(tile(model, 'count.5').tickedBy).toBe('another');
  expect(tickedByLine(tile(model, 'add.5'))).toBe('Ticked by you · 3 Nov');
  expect(tickedByLine(tile(model, 'count.5'))).toBe('Ticked by another EA · 3 Nov');
  expect(formatTickedOn('2026-01-09')).toBe('9 Jan');
  expect(tickedByLine(tile(model, 'add.10'))).toBeNull();
});
