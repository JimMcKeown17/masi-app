import fs from 'fs';
import path from 'path';
import * as engine from '../src/lessonPlan/engine';

const DIR = path.resolve(__dirname, '../src/lessonPlan/engine/vectors');
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};
const { version: packsVersion, packs } = deepFreeze(require(path.join(DIR, 'packs.json')));
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.vectors.json')).sort();
const PLAN_KEYS = ['engine_version', 'made_on', 'reason', 'history_complete', 'mastery_complete',
  'present_child_ids', 'known_letters', 'suggested_letters', 'review_letters', 'unlocked_letters',
  'blend_tier', 'suggested_blends', 'suggested_book', 'up_next_group_id'];

const packFor = (name) => {
  if (name === null) return null;
  if (!Object.prototype.hasOwnProperty.call(packs, name)) throw new Error(`Unknown fixture pack "${name}"`);
  return packs[name];
};
const resolveInput = (input) => {
  const out = { ...input };
  if ('pack' in out) out.pack = packFor(out.pack);
  if (Array.isArray(out.groups)) out.groups = out.groups.map((g) => ('pack' in g ? { ...g, pack: packFor(g.pack) } : g));
  return out;
};
const inputFor = (file, c) => deepFreeze(resolveInput({ ...(file.defaults?.[c.fn] ?? {}), ...(c.input ?? {}) }));
const call = (file, c) => {
  const fn = engine[c.fn];
  if (typeof fn !== 'function') throw new Error(`${c.fn} is not exported by the engine`);
  const copy = (value) => deepFreeze(JSON.parse(JSON.stringify(value)));
  if (c.args) return fn(...copy(c.args));
  return c.options ? fn(inputFor(file, c), copy(c.options)) : fn(inputFor(file, c));
};
const summary = (choices) => ({
  tiers: choices.tiers.map((t) => ({ tier: t.tier, childIds: t.childIds, suggested: t.suggested.map((i) => i.text), pool: t.pool.map((i) => i.text) })),
  books: choices.books.map(({ id, readable, suggested, lastReadOn }) => ({ id, readable, suggested, lastReadOn })),
  contentAvailable: choices.contentAvailable,
  letterChoices: choices.letterChoices,
});

test('fixture packs pin the engine version', () => {
  expect(packsVersion).toBe(engine.ENGINE_VERSION);
});

describe.each(FILES)('%s', (name) => {
  const file = require(path.join(DIR, name));
  test('pins the engine version', () => expect(file.version).toBe(engine.ENGINE_VERSION));
  test.each(file.cases.map((c) => [c.name, c]))('%s', (_, c) => {
    expect(typeof c.spec).toBe('string');
    if (c.throws) { expect(() => call(file, c)).toThrow(c.throws); return; }
    let result = call(file, c);
    if (c.fn === 'computeLessonPlan') expect(Object.keys(result)).toEqual(PLAN_KEYS);
    if (c.view === 'summary') result = summary(result);
    if (c.exact || typeof c.expect !== 'object' || c.expect === null) expect(result).toEqual(c.expect);
    else expect(result).toMatchObject(c.expect);
  });
});

const PLAN_CASES = FILES.flatMap((name) => {
  const file = require(path.join(DIR, name));
  return file.cases.filter((c) => c.fn === 'computeLessonPlan' && !c.throws).map((c) => [`${name}: ${c.name}`, file, c]);
});
test.each(PLAN_CASES)('plan and choices agree: %s', (_, file, c) => {
  const input = inputFor(file, c);
  const plan = engine.computeLessonPlan(input);
  const choices = engine.computeLessonChoices(input);
  expect(plan.blend_tier).toBe(choices.tiers[0]?.tier ?? null);
  expect(plan.suggested_blends).toEqual((choices.tiers[0]?.suggested ?? []).map((i) => i.text));
  expect(plan.suggested_blends.length).toBeLessThanOrEqual(engine.BLEND_SUGGESTION_COUNT);
  expect(choices.books.filter((b) => b.suggested).map((b) => b.id)).toEqual(plan.suggested_book ? [plan.suggested_book] : []);
  expect(engine.computeLessonChoices(input, { plan })).toEqual(choices);          // the frozen-plan anchor is the identity on its own plan
});
