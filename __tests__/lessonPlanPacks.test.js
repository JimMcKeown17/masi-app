import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BUNDLED_PACKS, CURRENT_PACK_IDS, PACK_LANGUAGE_CODES, getPackById, getPackForOrder, packLetterOrderId, lintMasiPack, createPackRegistry }
  from '../src/lessonPlan/packs';
import { LANGUAGE_LABELS, languageCodeForHomeLanguage } from '../src/utils/assessmentRegistry';

import { resolveTeachingOrder, MASI_LETTER_ORDER_EDITIONS } from '../src/utils/letterOrders';

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
  'isixhosa-interim-letters-v2': '45e0d71f045124572058e24d6d065e26754cacd6baa370220f9d6851fd4980c7',
  'english-interim-letters-v2': '54a73d3ccc783136565db39eb6baae4274db991debf694b907faa35eaaf3ae49',
  'afrikaans-interim-letters-v2': '92d837fde5fd89c7703fb65980fe05aab2af8dbbda23b47938200779213b3b16',
  // Draft words (25 per step), blends and books: books commit fbe909f, npm run app-pack.
  'isixhosa-draft-content-v3': 'c4e150f4bfbc4d483b6501d655351d8a9fee11fcb9df83390430063b03db921d',
  'english-draft-content-v2': '870bb192b715fa1b8561d3950e04dd60a97229560c71324ad93118363e27c2fa',
  'afrikaans-draft-content-v2': '2eedf3f3af969636f31cafaad010c7f4eb5e624b6320e4b1e550d68f55566c4b',
  // Book 3 is now "Molo, mama!": books commit 4665444, npm run app-pack -- --version 4 --language isixhosa.
  'isixhosa-draft-content-v4': '5463646c9a24d49543c31d2cd2d0ac4d8d2b5f80cfb96777c7054a0e7562d328',
};

// The current draft content release per language; trimmed to 25 words per step on 2026-11-05.
const DRAFT_CONTENT = { isixhosa: 'isixhosa-draft-content-v4', english: 'english-draft-content-v2', afrikaans: 'afrikaans-draft-content-v2' };

const PREVIEW_PACK_SHA256 = {
  'isixhosa-candidates-preview-v2': '7d12be70ad6061e4f243854c7375785ab287ff0c963cd43bfb728ad830b89366',
  'english-candidates-preview-v1': 'e430d4887104a04db6295bfd407891c3b0a4911c6ba99ab1d243684613364abd',
  'afrikaans-candidates-preview-v1': '76d4aec38b0bd8748bd9bdfd9e9aaa0df3bbaae3c3671d0c4086977cbe800ba7',
};

test('current packs are selected by letter order', () => {
  expect(CURRENT_PACK_IDS).toEqual({
    release: {
      'isixhosa-order-2026-10-23': 'isixhosa-draft-content-v4',
      'english-order-2026-10-23': 'english-draft-content-v2',
      'afrikaans-order-2026-10-23': 'afrikaans-draft-content-v2',
    },
    preview: {},
  });
});

test.each([['xh', 'isixhosa'], ['en', 'english'], ['af', 'afrikaans']])(
  'a pilot build teaches %s from the draft content release pack, with words and blends', (code, name) => {
    const teachingOrder = resolveTeachingOrder('2026-10-23', code);
    const pack = getPackForOrder(teachingOrder.id);
    expect(pack).toMatchObject({ id: DRAFT_CONTENT[name], language: name, channel: 'release',
      letter_order: teachingOrder.id });
    expect(order(pack)).toBe(teachingOrder.letters.join(' '));
    // At most 25 words per step (Jim, 2026-11-05), all of them in the preview's candidate list.
    const perStep = {};
    for (const entry of pack.word_bank) perStep[entry.step] = (perStep[entry.step] ?? 0) + 1;
    expect(Math.max(...Object.values(perStep))).toBeLessThanOrEqual(25);
    expect(pack.word_bank.length).toBeGreaterThan(300);
    expect(pack.letter_steps[0].blends.length).toBeGreaterThan(0);
    expect(pack.letter_steps[0].words.length).toBeGreaterThan(0);
    // Words are a subset of the preview it was built from; blends are unchanged.
    const preview = getPackById(pack.generated_from.from_preview.file.replace(/\.json$/, ''), { allowPreview: true });
    const candidates = new Set(preview.word_bank.map(entry => `${entry.step}:${entry.text}`));
    expect(pack.word_bank.every(entry => candidates.has(`${entry.step}:${entry.text}`))).toBe(true);
    expect(pack.letter_steps.map(s => s.blends)).toEqual(preview.letter_steps.map(s => s.blends));
    expect(pack.generated_from.curation).toMatchObject({ words_per_step: 25, kept: pack.word_bank.length });
  }
);

test('a pilot build has two isiXhosa books at each of steps 1 to 3', () => {
  const pack = getPackForOrder('isixhosa-order-2026-10-23');
  expect(pack.letter_steps.slice(0, 3).map(step => step.readers)).toEqual([
    ['xh-int-v1-r01', 'xh-int-v1-r02'], ['xh-int-v1-r03', 'xh-int-v1-r04'], ['xh-int-v1-r05', 'xh-int-v1-r06'],
  ]);
  expect(pack.letter_steps.slice(3).every(step => step.readers.length === 0)).toBe(true);
  expect(pack.readers['xh-int-v1-r01']).toMatchObject({ title: 'Molo, Lolo!', step: 1 });
  for (const id of Object.keys(pack.readers)) expect(pack.reader_details[id].retired).toBe(false);
});

test.each([['xh', 'isixhosa'], ['en', 'english'], ['af', 'afrikaans']])(
  'the %s v2 release pack teaches the new edition order, letters only', (code, name) => {
    const teachingOrder = resolveTeachingOrder('2026-10-23', code);
    const pack = getPackById(`${name}-interim-letters-v2`);
    expect(pack).toMatchObject({ language: name, channel: 'release', letter_order: teachingOrder.id });
    expect(order(pack)).toBe(teachingOrder.letters.join(' '));
    expect(pack.sound_inventory).toEqual([...'abcdefghijklmnopqrstuvwxyz']);
    expect(pack.letter_steps.map(step => step.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(pack.letter_steps.map(step => step.new_letters.length)).toEqual([4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    for (const step of pack.letter_steps) {
      expect([step.blends, step.words, step.readers]).toEqual([[], [], []]);
      expect(has(step, 'size_exception')).toBe(false);
    }
    expect([pack.sound_steps, pack.readers, pack.word_bank, pack.reader_details]).toEqual([[], {}, [], {}]);
  }
);

test.each(Object.entries(PREVIEW_PACK_SHA256))('preview %s matches the books export byte for byte', (id, hash) => {
  // books 6cd5e64 exports/app-preview
  const bytes = fs.readFileSync(path.join(packsFolder, `${id}.json`));
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(hash);
});

test('every Masi edition and supported language has a matching release pack', () => {
  for (const edition of MASI_LETTER_ORDER_EDITIONS) for (const code of ['xh', 'en', 'af']) {
    const teachingOrder = resolveTeachingOrder(edition, code);
    const pack = getPackForOrder(teachingOrder.id);
    expect(pack).not.toBeNull();
    expect(pack.channel).toBe('release');
    expect(packLetterOrderId(pack)).toBe(teachingOrder.id);
  }
});

test.each(['isixhosa-interim-letters-v1', 'english-interim-letters-v1', 'afrikaans-interim-letters-v1',
  'isixhosa-candidates-preview-v1'])('retained pack %s still resolves by id', id => {
  expect(getPackById(id, { allowPreview: true })).toMatchObject({ id });
});

test('a legacy order has no current pack', () => {
  expect(getPackForOrder('english-order-legacy')).toBeNull();
});

test.each([['isixhosa', 2], ['english', 1], ['afrikaans', 1]])(
  '%s previews resolve by id only with explicit permission; every build teaches the release', (name, version) => {
    const orderId = `${name}-order-2026-10-23`;
    const previewId = `${name}-candidates-preview-v${version}`;
    const release = getPackById(DRAFT_CONTENT[name]);
    for (const options of [undefined, null, { allowPreview: false }, { allowPreview: 'yes' }, { allowPreview: 1 }]) {
      expect(getPackForOrder(orderId, options)).toBe(release);
      expect(getPackById(previewId, options)).toBeNull();
    }
    expect(getPackForOrder(orderId, { allowPreview: true })).toBe(release);
    expect(getPackById(previewId, { allowPreview: true })).toMatchObject({ id: previewId, channel: 'preview' });
  }
);

test('a mapped preview is chosen only with explicit permission (registry fixture)', () => {
  // No order has a preview mapping today; keep the selection rule tested for the next one.
  const release = getPackById('isixhosa-draft-content-v4');
  const preview = getPackById('isixhosa-candidates-preview-v2', { allowPreview: true });
  const registry = createPackRegistry([release, preview], {
    release: { 'isixhosa-order-2026-10-23': release.id },
    preview: { 'isixhosa-order-2026-10-23': preview.id },
  });
  for (const options of [undefined, null, { allowPreview: false }, { allowPreview: 'yes' }, { allowPreview: 1 }]) {
    expect(registry.getPackForOrder('isixhosa-order-2026-10-23', options)).toBe(release);
    expect(registry.getPackById(preview.id, options)).toBeNull();
  }
  expect(registry.getPackForOrder('isixhosa-order-2026-10-23', { allowPreview: true })).toBe(preview);
});

test('pack letter order ids use the explicit field before the frozen legacy mapping', () => {
  const { LEGACY_PACK_LETTER_ORDERS } = require('../src/lessonPlan/packs/packLetterOrder');
  expect(LEGACY_PACK_LETTER_ORDERS).toEqual({
    'isixhosa-interim-letters-v1': 'isixhosa-order-2026-10-18',
    'isixhosa-candidates-preview-v1': 'isixhosa-order-2026-10-18',
    'english-interim-letters-v1': 'english-order-legacy',
    'afrikaans-interim-letters-v1': 'afrikaans-order-legacy',
  });
  expect(Object.isFrozen(LEGACY_PACK_LETTER_ORDERS)).toBe(true);
  expect(packLetterOrderId({ id: 'english-interim-letters-v1' })).toBe('english-order-legacy');
  expect(packLetterOrderId({ id: 'english-interim-letters-v1', letter_order: 'english-order-2026-10-23' }))
    .toBe('english-order-2026-10-23');
  for (const pack of [null, undefined, {}, { id: 'constructor' }, { id: '__proto__' }]) {
    expect(packLetterOrderId(pack)).toBeNull();
  }
});

test('registry construction rejects a current pack mapped under another order', () => {
  const pack = getPackById('english-interim-letters-v1');
  expect(() => createPackRegistry([pack], { release: { 'isixhosa-order-2026-10-23': pack.id }, preview: {} }))
    .toThrow();
});

test.each([null, undefined, '', 'xh', 'constructor', '__proto__', 7, {}])('getPackForOrder(%p) is null', id => {
  expect(getPackForOrder(id)).toBeNull();
});

test('pack language names resolve like class languages in the assessment registry', () => {
  // 'afrikaans' resolves to null until track AF adds 'af' to the registry, and then it must resolve to 'af'.
  for (const [name, code] of Object.entries(PACK_LANGUAGE_CODES)) {
    expect(languageCodeForHomeLanguage(name)).toBe(has(LANGUAGE_LABELS, code) ? code : null);
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

test('every current id resolves to a bundled pack of that order and channel', () => {
  for (const [channel, ids] of Object.entries(CURRENT_PACK_IDS)) {
    for (const [orderId, id] of Object.entries(ids)) {
      const pack = getPackById(id, { allowPreview: true });
      expect(BUNDLED_PACKS).toContain(pack);
      expect(packLetterOrderId(pack)).toBe(orderId);
      expect(pack.channel).toBe(channel);
      if (channel === 'release') expect(getPackById(id)).toBe(pack);
    }
  }
});

test.each([undefined, null, '', 'isixhosa-integrated-v1', 'integrated-sequence-isixhosa-v1', 'xh', 'constructor', '__proto__', 7])(
  'getPackById(%p) is null', id => { expect(getPackById(id)).toBeNull(); });

test('getPackById resolves every bundled release pack', () => {
  for (const pack of BUNDLED_PACKS.filter(p => p.channel === 'release')) {
    expect(getPackById(pack.id)).toBe(pack);
  }
});

test('a new current release keeps the old release resolvable and both versions frozen and unchanged', () => {
  const oldPack = JSON.parse(JSON.stringify(getPackById('english-interim-letters-v1')));
  const newPack = { ...JSON.parse(JSON.stringify(oldPack)), id: 'english-interim-letters-v2', letter_order: 'english-order-legacy' };
  const before = JSON.parse(JSON.stringify([newPack, oldPack]));
  const registry = createPackRegistry([newPack, oldPack], {
    release: { [newPack.letter_order]: newPack.id }, preview: {},
  });

  expect(registry.getPackForOrder(newPack.letter_order)).toBe(newPack);
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
  expect(registry.getPackForOrder(newPack.letter_order)).toBe(newPack);
  expect(registry.getPackById(oldPack.id)).toBe(oldPack);
});

test('returned packs are deeply frozen', () => {
  const pack = getPackById('english-interim-letters-v1');
  expect(Object.isFrozen(pack.letter_steps[0].new_letters)).toBe(true);
  expect(() => pack.letter_steps.sort()).toThrow(TypeError);
  expect(() => pack.word_bank.push({ text: 'x', step: 1 })).toThrow(TypeError);
  expect(getPackById('english-interim-letters-v1').letter_steps[0].new_letters).toEqual(['a', 'm', 's', 't']);
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

test('language-only pack lookup is no longer exported', () => {
  expect(require('../src/lessonPlan/packs').getPack).toBeUndefined();
});
