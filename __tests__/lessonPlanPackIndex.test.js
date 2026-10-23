import { computeLessonPlan, computeLessonChoices, indexPack } from '../src/lessonPlan/engine';
import { packIndexFor } from '../src/lessonPlan/inputs/packIndexCache';
import { getPack } from '../src/lessonPlan/packs';

const pack = getPack('xh', { allowPreview: true });
const input = (extra = {}) => ({
  today: '2026-10-23', academicYearStart: '2026-01-14', programmeId: 'p-lit',
  groupId: 'g1', languageCode: 'xh', pack, isEcd: false, sessions: [],
  presentChildren: ['A', 'B', 'C'].map(id => ({ id, readingLevel: null,
    knownLetters: [], historyComplete: true, masteryComplete: true })),
  ...extra,
});

test('packIndexFor returns one index per pack', () => {
  expect(packIndexFor(pack)).toBe(packIndexFor(pack));
  expect(packIndexFor(pack).pack).toBe(pack);
  expect(packIndexFor(null)).toBeNull();
  const sameId = { ...pack };
  expect(packIndexFor(sameId)).not.toBe(packIndexFor(pack));
  expect(packIndexFor(sameId).pack).toBe(sameId);
});

test('the engine uses a supplied index', () => {
  const packIndex = indexPack(pack);
  const sentinel = { text: 'olo', display: 'o-lo', tier: '2 Letter Blends',
    normalized: 'olo', sounds: ['o', 'l', 'o'] };
  packIndex.blendTiers[0] = [sentinel];
  const choices = computeLessonChoices(input({ packIndex }));
  expect(choices.tiers[0].pool).toEqual([{ text: 'olo', display: 'o-lo', tier: '2 Letter Blends' }]);
  expect(computeLessonPlan(input({ packIndex })).suggested_blends).toEqual(['olo']);
});

test.each(['other language', 'same id, different object'])('a mismatched index is ignored: %s', mismatch => {
  const other = mismatch === 'other language' ? getPack('en') : { ...pack };
  const packIndex = indexPack(other);
  packIndex.blendTiers[0] = [];
  expect(computeLessonChoices(input({ packIndex }))).toEqual(computeLessonChoices(input()));
  expect(computeLessonPlan(input({ packIndex }))).toEqual(computeLessonPlan(input()));
});

test('an index for an unusable pack is ignored', () => {
  const unusable = input({ languageCode: 'en' });
  expect(computeLessonChoices({ ...unusable, packIndex: indexPack(pack) }))
    .toEqual(computeLessonChoices(unusable));
  expect(computeLessonPlan({ ...unusable, packIndex: indexPack(pack) }))
    .toEqual(computeLessonPlan(unusable));
});
