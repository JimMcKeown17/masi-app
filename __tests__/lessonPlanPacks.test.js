import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BUNDLED_PACKS, CURRENT_PACK_IDS, PACK_LANGUAGE_CODES, getPack, getPackById, lintMasiPack, createPackRegistry }
  from '../src/lessonPlan/packs';
import { LANGUAGE_LABELS, PEDAGOGICAL_ORDERS, languageCodeForHomeLanguage } from '../src/utils/assessmentRegistry';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const order = pack => pack.letter_steps.flatMap(s => s.new_letters).join(' ');
const packsFolder = path.join(__dirname, '..', 'src/lessonPlan/packs');
const packFiles = () => fs.readdirSync(packsFolder).filter(file => file.endsWith('.json'));
// Append-only: a released pack is never edited or removed (spec §4.1; books §5.8).
// Values: the sha256 of each file, computed in Step 3 (`shasum -a 256`) and pasted here once.
const RELEASE_PACK_SHA256 = {
  'isixhosa-interim-letters-v1': 'caec3389cfed036043ca9421d6980642305bff2df5c9e36a7a11e871ffc379d7',
  'english-interim-letters-v1': '1888157690b4df907d572484a2bbb469e11812cddb8b99b838e8f61a51b8dfc2',
  'afrikaans-interim-letters-v1': '453c0e2b4954496b78e137b4f945f56666fa7f41e5427c145a94a00129383cda',
};

test.each([
  ['xh', 'isixhosa', 'o m l a k u e n i t s d f b y c z p q w v g x h j r'],
  ['en', 'english', 'a m s t n i p c f d h o r b l k e g w v u j y z q x'],
  ['af', 'afrikaans', 'a s m e k i r o n t d l p u b g h v w y f j c z x q'],
])('the %s release pack teaches the interim order, letters only', (code, name, expected) => {
  const pack = getPack(code);
  expect(pack).toEqual(expect.objectContaining({ language: name, channel: 'release' }));
  expect(order(pack)).toBe(expected);
  expect(pack.sound_inventory).toEqual([...'abcdefghijklmnopqrstuvwxyz']);
  expect(pack.letter_steps.map(s => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(pack.letter_steps.map(s => s.new_letters.length)).toEqual([4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  for (const step of pack.letter_steps) {
    expect([step.blends, step.words, step.readers]).toEqual([[], [], []]);
    expect(has(step, 'size_exception')).toBe(false);
  }
  expect([pack.word_bank, pack.readers, pack.reader_details, pack.sound_steps]).toEqual([[], {}, {}, []]);
});

test('current release ids', () => {
  expect(CURRENT_PACK_IDS.release).toEqual({ xh: 'isixhosa-interim-letters-v1', en: 'english-interim-letters-v1', af: 'afrikaans-interim-letters-v1' });
});

test('isiXhosa preview pack: developer builds only, same letter order as the release pack', () => {
  expect(CURRENT_PACK_IDS.preview).toEqual({ xh: 'isixhosa-candidates-preview-v1' });
  expect(getPack('xh').id).toBe('isixhosa-interim-letters-v1');
  expect(getPack('xh', { allowPreview: true }).id).toBe('isixhosa-candidates-preview-v1');
  expect(getPackById('isixhosa-candidates-preview-v1')).toBeNull();
  expect(getPackById('isixhosa-candidates-preview-v1', { allowPreview: true }).channel).toBe('preview');
  expect(order(getPack('xh', { allowPreview: true }))).toBe(order(getPack('xh')));
  for (const allowPreview of [false, 'yes', 1]) {
    expect(getPack('xh', { allowPreview }).id).toBe('isixhosa-interim-letters-v1');
    expect(getPackById('isixhosa-candidates-preview-v1', { allowPreview })).toBeNull();
  }
});

test('pack language names resolve like class languages in the assessment registry', () => {
  // 'afrikaans' resolves to null until track AF adds 'af' to the registry, and then it must resolve to 'af'.
  for (const [name, code] of Object.entries(PACK_LANGUAGE_CODES)) {
    expect(languageCodeForHomeLanguage(name)).toBe(has(LANGUAGE_LABELS, code) ? code : null);
  }
});

test("every registry tracker order except isiXhosa's is its interim pack's order", () => {
  // isiXhosa moves to the books' order (J1) when A2 switches the tracker to packs.
  for (const [code, letters] of Object.entries(PEDAGOGICAL_ORDERS).filter(([c]) => c !== 'xh')) {
    expect(getPack(code)?.letter_steps.flatMap(s => s.new_letters)).toEqual([...letters]);
  }
});

test.each(BUNDLED_PACKS.map(p => [p.id, p]))('%s passes lintMasiPack', (_id, pack) => {
  expect(lintMasiPack(pack)).toEqual({ ok: true, errors: [] });
});

test('every JSON file in the packs folder is bundled exactly once, by unique id', () => {
  const fileIds = packFiles().map(file => JSON.parse(fs.readFileSync(path.join(packsFolder, file), 'utf8')).id);
  const bundledIds = BUNDLED_PACKS.map(pack => pack.id);
  expect(new Set(fileIds).size).toBe(fileIds.length);
  expect(new Set(bundledIds).size).toBe(bundledIds.length);
  expect(fileIds.sort()).toEqual(bundledIds.sort());
});

test('released packs are immutable and never removed', () => {
  const releasedIds = BUNDLED_PACKS.filter(pack => pack.channel === 'release').map(pack => pack.id);
  expect(releasedIds.sort()).toEqual(Object.keys(RELEASE_PACK_SHA256).sort());
  for (const [id, expected] of Object.entries(RELEASE_PACK_SHA256)) {
    const file = packFiles().find(name => JSON.parse(fs.readFileSync(path.join(packsFolder, name), 'utf8')).id === id);
    expect(file).toBeDefined();
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(packsFolder, file))).digest('hex');
    expect(actual).toBe(expected);
  }
});

test('every current id resolves to a bundled pack of that code and channel', () => {
  for (const [channel, ids] of Object.entries(CURRENT_PACK_IDS)) {
    for (const [code, id] of Object.entries(ids)) {
      const pack = getPackById(id, { allowPreview: true });
      expect(BUNDLED_PACKS).toContain(pack);
      expect(PACK_LANGUAGE_CODES[pack.language]).toBe(code);
      expect(pack.channel).toBe(channel);
      if (channel === 'release') expect(getPackById(id)).toBe(pack);
    }
  }
});

test.each([undefined, null, '', 'English', 'english', 'isixhosa', 'isiXhosa', 'XH', ' xh', 'zu',
  'constructor', '__proto__', 'toString', 42, {}])('getPack(%p) is null', key => {
  expect(getPack(key)).toBeNull();
});

test('options may be missing or null', () => {
  for (const options of [undefined, null]) {
    expect(getPack('en', options).id).toBe('english-interim-letters-v1');
    expect(getPackById('english-interim-letters-v1', options)).toBe(getPack('en'));
  }
  expect(getPack('xh', null).id).toBe('isixhosa-interim-letters-v1');
});

test('only allowPreview === true asks for preview; with no preview pack the release pack is returned', () => {
  for (const allowPreview of [true, false, 'yes']) {
    expect(getPack('en', { allowPreview }).id).toBe('english-interim-letters-v1');
  }
});

test.each([undefined, null, '', 'isixhosa-integrated-v1', 'integrated-sequence-isixhosa-v1', 'xh', 'constructor', '__proto__', 7])(
  'getPackById(%p) is null', id => { expect(getPackById(id)).toBeNull(); });

test('getPackById resolves every bundled release pack', () => {
  for (const pack of BUNDLED_PACKS.filter(p => p.channel === 'release')) {
    expect(getPackById(pack.id)).toBe(pack);
  }
});

test('getPack resolves the explicitly current release id for each language', () => {
  for (const [code, id] of Object.entries(CURRENT_PACK_IDS.release)) {
    expect(getPack(code)).toBe(getPackById(id));
  }
});

test('a new current release keeps the old release resolvable and both versions frozen and unchanged', () => {
  const oldPack = JSON.parse(JSON.stringify(getPack('en')));
  const newPack = { ...JSON.parse(JSON.stringify(oldPack)), id: 'english-interim-letters-v2' };
  const before = JSON.parse(JSON.stringify([newPack, oldPack]));
  const registry = createPackRegistry([newPack, oldPack], {
    release: { en: newPack.id }, preview: {},
  });

  expect(registry.getPack('en')).toBe(newPack);
  expect(registry.getPackById(newPack.id)).toBe(newPack);
  expect(registry.getPackById(oldPack.id)).toBe(oldPack);
  expect(registry.BUNDLED_PACKS).toEqual([newPack, oldPack]);
  for (const pack of registry.BUNDLED_PACKS) {
    expect(Object.isFrozen(pack)).toBe(true);
    expect(Object.isFrozen(pack.letter_steps[0].new_letters)).toBe(true);
    expect(() => pack.letter_steps[0].new_letters.push('q')).toThrow(TypeError);
    expect(() => pack.word_bank.push({ text: 'am', step: 1 })).toThrow(TypeError);
  }
  expect(registry.BUNDLED_PACKS).toEqual(before);
  expect(registry.getPack('en')).toBe(newPack);
  expect(registry.getPackById(oldPack.id)).toBe(oldPack);
});

test('returned packs are deeply frozen', () => {
  const pack = getPack('en');
  expect(Object.isFrozen(pack.letter_steps[0].new_letters)).toBe(true);
  expect(() => pack.letter_steps.sort()).toThrow(TypeError);
  expect(() => pack.word_bank.push({ text: 'x', step: 1 })).toThrow(TypeError);
  expect(getPack('en').letter_steps[0].new_letters).toEqual(['a', 'm', 's', 't']);
});

test('the bundled array, current mappings and all nested pack values are frozen', () => {
  const assertFrozen = value => {
    if (value !== null && typeof value === 'object') {
      expect(Object.isFrozen(value)).toBe(true);
      Object.values(value).forEach(assertFrozen);
    }
  };
  assertFrozen(BUNDLED_PACKS);
  assertFrozen(CURRENT_PACK_IDS);
});
