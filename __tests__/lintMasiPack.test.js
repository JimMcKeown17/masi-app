import vectors from '../src/constants/contracts/decodability-v1.json';
import { lintSequence } from '../src/utils/decodability/index.js';
import { lintMasiPack, MASI_LINT_OPTIONS, PACK_LANGUAGE_CODES, PACK_CHANNELS } from '../src/lessonPlan/packs/lintMasiPack';

const codes = r => r.errors.map(e => e.split(':')[0]);
const validPack = () => {
  const pack = JSON.parse(JSON.stringify(vectors.sequence));
  pack.letter_steps[0].readers = ['xh-test-r01'];
  return { ...pack, id: 'test-pack-v1', language: 'isixhosa', channel: 'release',
    readers: { 'xh-test-r01': { title: 'Molo, Lolo!', step: 1, tricky_words: [], pages: ['Molo, Lolo!', 'Mmm… lala.'] } },
    word_bank: [{ text: 'molo', syllables: 'mo-lo', step: 1 }, { text: 'umama', syllables: 'u-ma-ma', step: 2 },
      { text: 'thina', syllables: 'thi-na', step: 13 }],
    reader_details: { 'xh-test-r01': { retired: false,
      speakers: { malo: { name: 'Malo', colour: 'red' }, lolo: { name: 'Lolo', colour: 'blue' } },
      page_lines: [[{ speaker: 'malo', text: 'Molo, Lolo!' }], [{ speaker: 'lolo', text: 'Mmm… lala.' }]] } } };
};

test('a valid pack passes', () => {
  expect(lintMasiPack(validPack())).toEqual({ ok: true, errors: [] });
});

test('pack language names map to the Masi codes', () => {
  expect(PACK_LANGUAGE_CODES).toEqual({ isixhosa: 'xh', english: 'en', afrikaans: 'af' });
  expect(Object.isFrozen(PACK_LANGUAGE_CODES)).toBe(true);
});

test.each(['english', 'afrikaans'])('a %s pack passes', name => {
  const pack = validPack();
  pack.language = name;
  expect(lintMasiPack(pack)).toEqual({ ok: true, errors: [] });
});

test('a letters-only pack passes', () => {
  const pack = validPack();
  pack.sound_inventory = [...'abcdefghijklmnopqrstuvwxyz'];
  pack.sound_steps = [];
  pack.letter_steps[0].readers = [];
  pack.readers = {};
  pack.word_bank = [];
  pack.reader_details = {};
  expect(pack.letter_steps).toHaveLength(12);
  expect(lintMasiPack(pack)).toEqual({ ok: true, errors: [] });
});

test('two lines on one page join with a newline', () => {
  const pack = validPack();
  pack.readers['xh-test-r01'].pages = ['Molo!\nMolo!'];
  pack.reader_details['xh-test-r01'].page_lines = [[
    { speaker: 'malo', text: 'Molo!' }, { speaker: 'lolo', text: 'Molo!' },
  ]];
  expect(lintMasiPack(pack)).toEqual({ ok: true, errors: [] });
});

test.each([null, undefined, [], 'pack', 42, {}])('never throws on %p', input => {
  expect(() => lintMasiPack(input)).not.toThrow();
  expect(lintMasiPack(input).ok).toBe(false);
});

test('shared lint errors surface with their code', () => {
  const pack = validPack();
  pack.letter_steps[11].new_letters = ['j'];
  expect(codes(lintMasiPack(pack))).toContain('permutation');
});

test.each([
  ['pack_id', p => { p.id = ''; }],
  ['pack_language', p => { p.language = 'English'; }],
  ['pack_language', p => { p.language = 'xh'; }],
  ['pack_language', p => { p.language = 'af'; }],
  ['pack_language', p => { p.language = 'constructor'; }],
  ['pack_channel', p => { p.channel = 'beta'; }],
  ['pack_channel', p => { delete p.channel; }],
  ['word_bank_shape', p => { delete p.word_bank; }],
  ['word_bank_shape', p => { p.word_bank[0].step = '1'; }],
  ['word_bank_not_normalized', p => { p.word_bank[0].text = 'Molo'; }],
  ['word_bank_not_normalized', p => { p.word_bank[0].text = 'mo-lo'; }],
  ['word_bank_duplicate', p => { p.word_bank.push({ text: 'molo', step: 1 }); }],
  ['word_bank_step', p => { p.word_bank[0].step = 2; }],
  ['word_bank_step', p => { p.word_bank[2].step = 4; }],
  ['word_bank_step', p => { p.word_bank.push({ text: 'kêrel', step: 6 }); }],
  ['word_bank_syllables', p => { p.word_bank[0].syllables = 'mo-la'; }],
  ['reader_details_shape', p => { p.reader_details['xh-test-r01'].retired = 'no'; }],
  ['reader_details_shape', p => { p.reader_details['xh-test-r01'].speakers.malo.colour = ''; }],
  ['reader_details_unknown_reader', p => { p.reader_details['xh-ghost'] = p.reader_details['xh-test-r01']; }],
  ['reader_details_missing', p => { delete p.reader_details['xh-test-r01']; }],
  ['reader_details_text', p => { p.reader_details['xh-test-r01'].page_lines[0][0].text = 'Molo Lolo!'; }],
  ['reader_details_text', p => { p.reader_details['xh-test-r01'].page_lines.push([]); }],
  ['reader_details_speaker', p => { p.reader_details['xh-test-r01'].page_lines[1][0].speaker = 'kiki'; }],
  ['step_blend_length', p => { p.letter_steps[0].blends = ['mo', 'ma', 'lam']; }],
  ['step_blend_length', p => { p.letter_steps[1].blends = ['u']; }],
])('%s', (code, mutate) => {
  const pack = validPack();
  mutate(pack);
  const result = lintMasiPack(pack);
  expect(result.ok).toBe(false);
  expect(codes(result)).toContain(code);
});

test('step_blend_length catches a three-letter blend that the shared lint accepts', () => {
  const pack = validPack();
  pack.letter_steps[0].blends = ['mo', 'ma', 'lam'];
  expect(lintSequence(pack, MASI_LINT_OPTIONS)).toEqual({ errors: [], warnings: [] });
  expect(lintMasiPack(pack)).toEqual({ ok: false,
    errors: ['step_blend_length: Step 1 blend "lam" has 3 letters; letter-step blends must have exactly 2.'] });
});

test('two-letter blends pass', () => {
  const pack = validPack();
  pack.letter_steps[0].blends = ['mo', 'ma', 'lo', 'la'];
  pack.letter_steps[1].blends = ['ku', 'ka', 'ko', 'mu', 'lu'];
  expect(lintMasiPack(pack)).toEqual({ ok: true, errors: [] });
});

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('does not mutate its input and accepts a deeply frozen pack', () => {
  const pack = validPack();
  const before = JSON.parse(JSON.stringify(pack));
  expect(lintMasiPack(pack)).toEqual({ ok: true, errors: [] });
  expect(pack).toEqual(before);
  expect(lintMasiPack(deepFreeze(pack))).toEqual({ ok: true, errors: [] });
  expect(pack).toEqual(before);
});

test('never throws when a pack property cannot be read', () => {
  const pack = validPack();
  Object.defineProperty(pack, 'id', { get() { throw new Error('unreadable'); } });
  expect(() => lintMasiPack(pack)).not.toThrow();
  expect(codes(lintMasiPack(pack))).toContain('malformed');
});

test('never throws on a revoked proxy', () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  expect(() => lintMasiPack(proxy)).not.toThrow();
  expect(codes(lintMasiPack(proxy))).toContain('malformed');
});

test('keeps shared errors when a later Masi field cannot be read', () => {
  const pack = validPack();
  pack.letter_steps[11].new_letters = ['j'];
  Object.defineProperty(pack, 'id', { get() { throw new Error('unreadable'); } });
  const sharedErrors = lintSequence(pack, MASI_LINT_OPTIONS).errors
    .map(issue => `${issue.code}: ${issue.message}`);
  const result = lintMasiPack(pack);
  expect(result.errors.slice(0, sharedErrors.length)).toEqual(sharedErrors);
  expect(result.errors[sharedErrors.length]).toBe('malformed: Content pack could not be read.');
});

test('channels and lint options are frozen and contain the exact contract values', () => {
  expect(PACK_CHANNELS).toEqual(['release', 'preview']);
  expect(Object.isFrozen(PACK_CHANNELS)).toBe(true);
  expect(MASI_LINT_OPTIONS).toEqual({
    trackerLetters: [...'abcdefghijklmnopqrstuvwxyz'], vowels: ['a', 'e', 'i', 'o', 'u'],
  });
  expect(Object.isFrozen(MASI_LINT_OPTIONS)).toBe(true);
  expect(Object.isFrozen(MASI_LINT_OPTIONS.trackerLetters)).toBe(true);
  expect(Object.isFrozen(MASI_LINT_OPTIONS.vowels)).toBe(true);
});

test('preview packs and omitted or null syllables pass', () => {
  const pack = validPack();
  pack.channel = 'preview';
  delete pack.word_bank[0].syllables;
  pack.word_bank[1].syllables = null;
  expect(lintMasiPack(pack)).toEqual({ ok: true, errors: [] });
});

test('shared errors retain their order and precede Masi errors', () => {
  const pack = validPack();
  pack.letter_steps[11].new_letters = ['j'];
  pack.id = '';
  const sharedErrors = lintSequence(pack, MASI_LINT_OPTIONS).errors
    .map(issue => `${issue.code}: ${issue.message}`);
  const result = lintMasiPack(pack);
  expect(result.errors.slice(0, sharedErrors.length)).toEqual(sharedErrors);
  expect(result.errors.slice(sharedErrors.length)).toEqual(['pack_id: id must be a non-empty string.']);
});

test.each([
  ['inventory not an array', p => { p.sound_inventory = null; }],
  ['mixed inventory', p => { p.sound_inventory.push(null, 42); }],
  ['letter steps not an array', p => { p.letter_steps = null; }],
  ['null letter step', p => { p.letter_steps[0] = null; }],
  ['non-object letter step', p => { p.letter_steps[0] = 'step'; }],
  ['missing letter step number', p => { delete p.letter_steps[0].step; }],
  ['non-integer letter step', p => { p.letter_steps[0].step = 1.5; }],
  ['missing letter units', p => { delete p.letter_steps[0].new_letters; }],
  ['null letter units', p => { p.letter_steps[0].new_letters = null; }],
  ['mixed letter units', p => { p.letter_steps[0].new_letters.push(42); }],
  ['sound steps not an array', p => { p.sound_steps = {}; }],
  ['null sound step', p => { p.sound_steps[0] = null; }],
  ['non-integer sound step', p => { p.sound_steps[0].step = '13'; }],
  ['missing sound units', p => { delete p.sound_steps[0].new_sounds; }],
  ['mixed sound units', p => { p.sound_steps[0].new_sounds.push(null); }],
  ['blends not an array', p => { p.letter_steps[0].blends = 'lam'; }],
  ['non-string blends', p => { p.letter_steps[0].blends = [null, 42, {}]; }],
  ['readers not an object', p => { p.readers = []; }],
  ['null reader', p => { p.readers['xh-test-r01'] = null; }],
  ['missing reader pages', p => { delete p.readers['xh-test-r01'].pages; }],
])('malformed teaching data is reported safely: %s', (_name, mutate) => {
  const pack = validPack();
  mutate(pack);
  const before = JSON.parse(JSON.stringify(pack));
  const sharedErrors = lintSequence(pack, MASI_LINT_OPTIONS).errors
    .map(issue => `${issue.code}: ${issue.message}`);
  const result = lintMasiPack(deepFreeze(pack));
  expect(result.ok).toBe(false);
  expect(codes(result)).toContain('malformed');
  expect(result.errors.slice(0, sharedErrors.length)).toEqual(sharedErrors);
  expect(pack).toEqual(before);
});

test.each([
  ['word_bank_shape', p => { p.word_bank = {}; }],
  ['word_bank_shape', p => { p.word_bank[0] = null; }],
  ['word_bank_shape', p => { p.word_bank[0].text = 42; }],
  ['word_bank_shape', p => { p.word_bank[0].step = 0; }],
  ['word_bank_shape', p => { p.word_bank[0].step = 1.5; }],
  ['word_bank_shape', p => { p.word_bank[0].syllables = []; }],
  ['word_bank_not_normalized', p => { p.word_bank[0].text = "mo'lo"; }],
  ['word_bank_step', p => { p.word_bank[0].text = ''; }],
  ['reader_details_shape', p => { delete p.reader_details; }],
  ['reader_details_shape', p => { p.reader_details = null; }],
  ['reader_details_shape', p => { p.reader_details = []; }],
  ['reader_details_shape', p => { p.reader_details['xh-test-r01'] = null; }],
  ['reader_details_shape', p => { delete p.reader_details['xh-test-r01'].retired; }],
  ['reader_details_shape', p => { p.reader_details['xh-test-r01'].speakers = []; }],
  ['reader_details_shape', p => { p.reader_details['xh-test-r01'].speakers.malo = null; }],
  ['reader_details_shape', p => { p.reader_details['xh-test-r01'].speakers.malo.name = ''; }],
  ['reader_details_shape', p => { p.reader_details['xh-test-r01'].page_lines = null; }],
  ['reader_details_shape', p => { p.reader_details['xh-test-r01'].page_lines = [null]; }],
  ['reader_details_shape', p => { p.reader_details['xh-test-r01'].page_lines = [[null]]; }],
  ['reader_details_shape', p => { p.reader_details['xh-test-r01'].page_lines[0][0].speaker = 42; }],
  ['reader_details_shape', p => { p.reader_details['xh-test-r01'].page_lines[0][0].text = 42; }],
  ['reader_details_text', p => { p.reader_details['xh-test-r01'].page_lines.pop(); }],
  ['reader_details_speaker', p => { p.reader_details['xh-test-r01'].page_lines[0][0].speaker = 'constructor'; }],
  ['pack_language', p => { p.language = '__proto__'; }],
  ['pack_language', p => { p.language = 'toString'; }],
])('rejects further malformed fields with %s', (code, mutate) => {
  const pack = validPack();
  mutate(pack);
  const result = lintMasiPack(pack);
  expect(result.ok).toBe(false);
  expect(codes(result)).toContain(code);
});

test('inherited reader and detail keys do not satisfy reader references', () => {
  const pack = validPack();
  pack.reader_details.constructor = pack.reader_details['xh-test-r01'];
  expect(codes(lintMasiPack(pack))).toContain('reader_details_unknown_reader');
  delete pack.reader_details.constructor;
  pack.reader_details = Object.create(pack.reader_details);
  expect(codes(lintMasiPack(pack))).toContain('reader_details_missing');
});

test('blend length uses normalized Unicode code points and checks letter steps only', () => {
  const pack = validPack();
  pack.letter_steps[0].blends = ['“MO!”', 'ma-ma', '𐐨a'];
  pack.sound_steps[0].blends = ['tha'];
  const blendErrors = lintMasiPack(pack).errors.filter(error => error.startsWith('step_blend_length:'));
  expect(blendErrors).toEqual([
    'step_blend_length: Step 1 blend "ma-ma" has 4 letters; letter-step blends must have exactly 2.',
  ]);
});

test('three-letter sound-step syllables pass', () => {
  const pack = validPack();
  pack.sound_steps[0].blends = ['tha'];
  expect(lintMasiPack(pack)).toEqual({ ok: true, errors: [] });
});

test('assessment outcome words are not supplied to the shared lint', () => {
  const pack = validPack();
  pack.outcomeForms = [{ id: 'outcome', words: ['molo'] }];
  expect(lintMasiPack(pack)).toEqual({ ok: true, errors: [] });
});
