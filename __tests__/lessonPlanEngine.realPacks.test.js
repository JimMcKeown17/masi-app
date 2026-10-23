import * as engine from '../src/lessonPlan/engine';
import { getPack } from '../src/lessonPlan/packs';
import { analyzeToken, isDecodableAt, normalizeToken, tokenizeText } from '../src/utils/decodability';

const pack = getPack('xh', { allowPreview: true });

const input = ({ languageCode = 'xh', pack: p = pack, known, level = null }) => ({
  today: '2026-10-19',
  academicYearStart: '2026-01-14',
  programmeId: 'p-lit',
  groupId: 'g1',
  upNextGroupId: 'g1',
  languageCode,
  pack: p,
  alphabet: null,
  isEcd: false,
  presentChildren: ['A', 'B'].map((id) => ({
    id,
    readingLevel: level,
    knownLetters: known,
    historyComplete: true,
    masteryComplete: true,
  })),
  sessions: [],
});

const bothWays = (fn, input) => {
  const plain = fn(input);
  expect(fn({ ...input, packIndex: engine.indexPack(input.pack) })).toEqual(plain);
  return plain;
};
const planFor = input => bothWays(engine.computeLessonPlan, input);
const choicesFor = input => bothWays(engine.computeLessonChoices, input);

const nonTrickyTokens = (pack, id) => {
  const reader = pack.readers[id];
  const tricky = new Set(reader.tricky_words.map(normalizeToken));
  return reader.pages.flatMap(tokenizeText).filter((token) => !tricky.has(token));
};

test('isiXhosa first session: the J1 step-1 letters, every suggestion decodable at step 1', () => {
  expect(pack.id).toBe('isixhosa-candidates-preview-v1');
  const plan = planFor(input({ known: [] }));
  expect(plan.reason).toBe('first_session');
  expect(plan.suggested_letters).toEqual(['o', 'm', 'l', 'a']);
  for (const item of plan.suggested_blends) expect(isDecodableAt(item, 1, pack)).toBe(true);
  if (plan.suggested_book) expect(nonTrickyTokens(pack, plan.suggested_book).every((t) => isDecodableAt(t, 1, pack))).toBe(true);
});
test('isiXhosa mid-course: steps 1-3 known → i t, every suggestion decodable at step 4', () => {
  const known = engine.teachingOrderFromPack(pack).slice(0, 8);            // o m l a k u e n
  const plan = planFor(input({ known }));
  expect(plan.suggested_letters).toEqual(['i', 't']);
  for (const item of plan.suggested_blends) expect(isDecodableAt(item, 4, pack)).toBe(true);
  for (const tier of choicesFor(input({ known, level: 'Word Reading' })).tiers)
    for (const item of tier.pool) expect(isDecodableAt(item.text, 4, pack)).toBe(true);
});
test('isiXhosa all letters known: nothing needs a sound step', () => {
  const known = engine.teachingOrderFromPack(pack);
  const plan = planFor(input({ known }));
  expect(plan.reason).toBe('all_letters_known');
  for (const tier of choicesFor(input({ known, level: 'Word Reading' })).tiers)
    for (const item of tier.pool) expect(analyzeToken(item.text, pack).step).toBeLessThanOrEqual(12);
});
test.each([['xh', ['o', 'm', 'l', 'a']], ['en', ['a', 'm', 's', 't']], ['af', ['a', 's', 'm', 'e']]])(
  '%s release pack (interim, letters only): step-1 letters, no blend or book content', (languageCode, step1) => {
    const release = { languageCode, pack: getPack(languageCode), known: [] };
    const plan = planFor(input(release));
    expect(plan.reason).toBe('first_session');
    expect(plan.suggested_letters).toEqual(step1);
    expect(plan.suggested_blends).toEqual([]);
    expect(plan.suggested_book).toBeNull();
    expect(choicesFor(input(release)).contentAvailable).toEqual({ blends: false, books: false });
  });
test.each(Object.entries(engine.PACK_LANGUAGE_BY_CODE))(
  "the engine's %s matches the language of A1's release and preview packs", (languageCode, packLanguage) => {
    expect(getPack(languageCode)?.language).toBe(packLanguage);
    expect(getPack(languageCode, { allowPreview: true })?.language).toBe(packLanguage);
  });
