/** @jest-environment-options {"customExportConditions": ["node", "node-addons"]} */
global.__MASI_NO_DEFAULT_HANDLE__ = true;

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const YAML = require('yaml');
const { parseArgs, readBooksRepo, readSourceCommit, buildTestPack, runCli } = require('../scripts/build-isixhosa-test-pack.cjs');
const { lintMasiPack } = require('../src/lessonPlan/packs/lintMasiPack');

const sourceCommit = 'a'.repeat(40);
const fixture = () => ({
  languagePack: {
    code: 'xh', trackerLetters: [...'abcdefghijklmnopqrstuvwxyz'], vowels: ['a', 'e', 'i', 'o', 'u'],
    letterSteps: ['omla', 'ku', 'en', 'it', 'sd', 'fb', 'yc', 'zp', 'qw', 'vg', 'xh', 'jr']
      .map((letters, index) => ({ step: index + 1, letters: [...letters],
        ...(index === 0 ? { sizeException: 'Four letters at step 1.' } : {}) })),
    soundSteps: ['th', 'ph', 'kh', 'ny', 'hl', 'bh', 'nc', 'dl', 'ty', 'sh', 'tsh']
      .map((sound, index) => ({ step: index + 13, sound })),
  },
  wordbankRows: [
    { word: 'ma', syllables: 'ma', decodable_step: '1', corpus_2024_count: '300', status: 'candidate' },
    { word: 'molo', syllables: 'mo-lo', decodable_step: '1', corpus_2024_count: '54', status: 'candidate' },
    { word: 'mama', syllables: 'ma-ma', decodable_step: '1', corpus_2024_count: '10', status: 'candidate' },
    { word: 'lala', syllables: 'la-la', decodable_step: '1', corpus_2024_count: '8', status: 'candidate' },
    { word: 'umama', syllables: 'u-ma-ma', decodable_step: '2', corpus_2024_count: '2', status: 'candidate' },
    { word: 'thina', syllables: 'thi-na', decodable_step: '13', corpus_2024_count: '1', status: 'candidate' },
    { word: 'kaka', syllables: 'ka-ka', decodable_step: '2', corpus_2024_count: '50', status: 'rejected' },
  ],
  cast: { characters: [
    { id: 'malo', names: { xh: { name: 'Malo' } } },
    { id: 'lolo', names: { xh: { name: 'Lolo' } } },
  ] },
  books: [{
    id: 'xh-int-v1-r01', series: 'isixhosa-integrated', title: 'Molo, Lolo!', step: 1, status: 'draft',
    voices: { a: 'malo', b: 'lolo' }, tricky_words: [],
    pages: ['Molo, Lolo!', 'Mmm.', 'Lolo! Molo!', 'Mmm… lala.', 'Molo, Malo!']
      .map((text, index) => ({ lines: [{ speaker: index % 2 ? 'lolo' : 'malo', text }] })),
  }],
});
const build = (input = fixture()) => buildTestPack({ ...input, version: 1, sourceCommit });
const temporaryDirectories = [];
const tempDir = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-xh-pack-'));
  temporaryDirectories.push(directory);
  return directory;
};
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

test('builds a preview pack that passes lintMasiPack', () => {
  const pack = build();
  expect(pack).toEqual(expect.objectContaining({ id: 'isixhosa-candidates-preview-v1', language: 'isixhosa', channel: 'preview' }));
  expect(pack.generated_from).toEqual({ repo: 'early-reader-books', commit: sourceCommit });
  expect(Object.keys(pack)).toEqual(['id', 'language', 'channel', 'generated_from', 'sound_inventory',
    'letter_steps', 'sound_steps', 'readers', 'word_bank', 'reader_details']);
  expect(lintMasiPack(pack)).toEqual({ ok: true, errors: [] });
});
test('refuses a language pack whose code is not xh', () => {
  const input = fixture(); input.languagePack.code = 'zu';
  expect(() => build(input)).toThrow(/zu/);
});
test('letter steps are J1 and the inventory adds the 11 sounds', () => {
  const pack = build();
  expect(pack.letter_steps.flatMap(step => step.new_letters).join(' '))
    .toBe('o m l a k u e n i t s d f b y c z p q w v g x h j r');
  expect(pack.letter_steps[0].size_exception).toBe('Four letters at step 1.');
  expect(pack.sound_inventory).toHaveLength(37);
  expect(pack.sound_inventory.slice(-11)).toEqual(['th', 'ph', 'kh', 'ny', 'hl', 'bh', 'nc', 'dl', 'ty', 'sh', 'tsh']);
  expect(pack.sound_steps.map(step => step.new_sounds)).toEqual(pack.sound_inventory.slice(-11).map(sound => [sound]));
});
test('step 1 blends are the consonant-vowel syllables of o m l a', () => {
  expect(build().letter_steps[0].blends).toEqual(['mo', 'ma', 'lo', 'la']);
});
test('step 2 blends are the syllables that use k or u', () => {
  expect(build().letter_steps[1].blends).toEqual(['mu', 'lu', 'ko', 'ka', 'ku']);
});
test('headline words skip 2-letter items, rank by corpus count and keep syllable hyphens', () => {
  expect(build().letter_steps[0].words).toEqual(['mo-lo', 'ma-ma', 'la-la']);
  expect(build().sound_steps[0].words).toEqual(['thi-na']);
});
test('the word bank keeps candidates, drops rejected words and sorts by step then text', () => {
  const pack = build();
  expect(pack.word_bank.map(entry => entry.text)).toEqual(['lala', 'ma', 'mama', 'molo', 'umama', 'thina']);
  expect(pack.word_bank.find(entry => entry.text === 'thina').step).toBe(13);
});
test('refuses when a CSV step disagrees with the vendored checker', () => {
  const input = fixture(); input.wordbankRows[1].decodable_step = '2';
  expect(() => build(input)).toThrow(/molo/);
});
test('refuses an order that is not J1', () => {
  const input = fixture();
  [input.languagePack.letterSteps[0].letters, input.languagePack.letterSteps[1].letters]
    = [input.languagePack.letterSteps[1].letters, input.languagePack.letterSteps[0].letters];
  expect(() => build(input)).toThrow(/J1/);
});
test('refuses a speaker missing from the cast', () => {
  const input = fixture(); input.books[0].pages[0].lines[0].speaker = 'kiki';
  expect(() => build(input)).toThrow(/kiki/);
});
test('readers join lines with a newline and carry speakers and colours', () => {
  const input = fixture();
  input.books[0].pages[1].lines.push({ speaker: 'malo', text: 'Molo!' });
  const pack = build(input);
  expect(pack.readers['xh-int-v1-r01'].pages[0]).toBe('Molo, Lolo!');
  expect(pack.readers['xh-int-v1-r01'].pages[1]).toBe('Mmm.\nMolo!');
  expect(pack.reader_details['xh-int-v1-r01'].speakers).toEqual({
    malo: { name: 'Malo', colour: 'red' }, lolo: { name: 'Lolo', colour: 'blue' },
  });
  expect(pack.reader_details['xh-int-v1-r01'].retired).toBe(false);
  expect(pack.letter_steps[0].readers).toEqual(['xh-int-v1-r01']);
});
test('the same inputs give byte-identical output', () => {
  const input = fixture(); const before = JSON.parse(JSON.stringify(input));
  expect(JSON.stringify(build(input))).toBe(JSON.stringify(build(input)));
  expect(input).toEqual(before);
});
test.each([[[]], [['--books-repo', '/b']], [['--books-repo', '/b', '--out', 'x.json', '--version', '0']],
  [['--books-repo', '/b', '--out', 'x.json', '--version', '1', '--bogus']]])('parseArgs rejects %j', argv => {
  expect(() => parseArgs(argv)).toThrow();
});
test('runCli refuses a books repo with uncommitted content and writes nothing', () => {
  const directory = tempDir(); const out = path.join(directory, 'pack.json');
  expect(() => runCli(['--books-repo', path.join(directory, 'missing'), '--out', out, '--version', '1'], {
    readSource: () => { throw new Error('uncommitted content'); },
  })).toThrow('uncommitted content');
  expect(fs.existsSync(out)).toBe(false);
});

test('parseArgs returns the required paths and a positive integer version', () => {
  expect(parseArgs(['--books-repo', '/b', '--out', 'x.json', '--version', '2']))
    .toEqual({ booksRepo: '/b', out: 'x.json', version: 2 });
});
test.each(['--books-repo', '--out', '--version'])('parseArgs rejects duplicate %s', flag => {
  expect(() => parseArgs(['--books-repo', '/b', '--out', 'x.json', '--version', '1', flag, '2']))
    .toThrow(/duplicate/i);
});
test.each(['-1', '1.5', 'NaN'])('parseArgs rejects version %s', version => {
  expect(() => parseArgs(['--books-repo', '/b', '--out', 'x.json', '--version', version])).toThrow(/version/);
});
test('reports all words with a missing or mismatched checker step', () => {
  const input = fixture();
  input.wordbankRows[1].decodable_step = '2';
  input.wordbankRows.push({ word: 'kêrel', syllables: 'kê-rel', decodable_step: '6', status: 'candidate' });
  expect(() => build(input)).toThrow(/molo.*kêrel/s);
});
test('headlines cap at 12, use code-unit tie ordering and fall back to text without syllables', () => {
  const input = fixture();
  // Synthetic rule probes, not claims about isiXhosa vocabulary.
  const texts = Array.from({ length: 14 }, (_, index) => `m${'a'.repeat(index + 2)}`);
  input.wordbankRows.push(...texts.map(word => ({ word, syllables: '', decodable_step: '1', corpus_2024_count: '100', status: 'candidate' })));
  expect(build(input).letter_steps[0].words).toEqual([...texts].sort().slice(0, 12));
});
test('other cast speakers are grey and reader ids are sorted within their step', () => {
  const input = fixture();
  input.cast.characters.push({ id: 'narrator', names: { xh: { name: 'Narrator' } } });
  input.books[0].pages[0].lines[0].speaker = 'narrator';
  input.books.unshift({ ...input.books[0], id: 'xh-int-v1-r02' });
  const pack = build(input);
  expect(pack.reader_details['xh-int-v1-r01'].speakers.narrator).toEqual({ name: 'Narrator', colour: 'grey' });
  expect(pack.letter_steps[0].readers).toEqual(['xh-int-v1-r01', 'xh-int-v1-r02']);
});

function writeFixture(input = fixture()) {
  const directory = tempDir();
  fs.mkdirSync(path.join(directory, 'languages/xh'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'cast'));
  fs.mkdirSync(path.join(directory, 'books/xh-int-v1-r01'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'books/other-series'));
  fs.writeFileSync(path.join(directory, 'languages/xh/pack.yaml'), YAML.stringify(input.languagePack));
  const fields = ['word', 'syllables', 'decodable_step', 'corpus_2024_count', 'status'];
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  fs.writeFileSync(path.join(directory, 'languages/xh/wordbank.csv'), `${fields.join(',')}\n${input.wordbankRows.map(row => fields.map(field => quote(row[field])).join(',')).join('\n')}\n`);
  fs.writeFileSync(path.join(directory, 'cast/cast.yaml'), YAML.stringify(input.cast));
  fs.writeFileSync(path.join(directory, 'books/xh-int-v1-r01/book.yaml'), YAML.stringify(input.books[0]));
  fs.writeFileSync(path.join(directory, 'books/other-series/book.yaml'), YAML.stringify({ ...input.books[0], series: 'other-series' }));
  return directory;
}

test('readBooksRepo reads YAML 1.2 and CSV and selects only the integrated series', () => {
  const input = fixture();
  const directory = writeFixture(input);
  const read = readBooksRepo(directory);
  expect(read).toEqual(input);
  expect(read.languagePack.trackerLetters).toContain('y');
  expect(read.languagePack.trackerLetters).toContain('n');
});
test.each(['', ' M languages/xh/wordbank.csv\n'])('readSourceCommit checks scoped Git status %j', status => {
  const git = jest.spyOn(childProcess, 'execFileSync')
    .mockReturnValueOnce(`${sourceCommit}\n`).mockReturnValueOnce(status);
  try {
    jest.isolateModules(() => {
      const readSource = require('../scripts/build-isixhosa-test-pack.cjs').readSourceCommit;
      if (status) expect(() => readSource('/books')).toThrow(/uncommitted/);
      else expect(readSource('/books')).toBe(sourceCommit);
    });
    expect(git).toHaveBeenNthCalledWith(1, 'git', ['-C', '/books', 'rev-parse', 'HEAD'], expect.objectContaining({ encoding: 'utf8' }));
    expect(git).toHaveBeenNthCalledWith(2, 'git', ['-C', '/books', 'status', '--porcelain', '--', 'languages/xh', 'books', 'cast'], expect.objectContaining({ encoding: 'utf8' }));
  } finally { git.mockRestore(); }
});
test('runCli writes canonical JSON only after validating all source content', () => {
  const input = fixture(); const booksRepo = writeFixture(input);
  const out = path.join(booksRepo, 'output.json');
  const readSource = jest.fn(() => sourceCommit);
  runCli(['--books-repo', booksRepo, '--out', out, '--version', '1'], { readSource });
  expect(readSource).toHaveBeenCalledWith(booksRepo);
  expect(fs.readFileSync(out, 'utf8')).toBe(`${JSON.stringify(build(input), null, 2)}\n`);
});
test('runCli refuses duplicate step ids in its final lint and preserves existing output', () => {
  const input = fixture();
  input.languagePack.letterSteps[11].step = 11;
  const booksRepo = writeFixture(input); const out = path.join(booksRepo, 'output.json');
  fs.writeFileSync(out, 'existing output');
  expect(() => runCli(['--books-repo', booksRepo, '--out', out, '--version', '1'], { readSource: () => sourceCommit }))
    .toThrow(/step_id_duplicate: letter_steps\[11\]\.step/);
  expect(fs.readFileSync(out, 'utf8')).toBe('existing output');
});
test('runCli refuses an empty reader in its final lint and preserves existing output', () => {
  const input = fixture();
  input.books[0].pages = [];
  const booksRepo = writeFixture(input); const out = path.join(booksRepo, 'output.json');
  fs.writeFileSync(out, 'existing output');
  expect(() => runCli(['--books-repo', booksRepo, '--out', out, '--version', '1'], { readSource: () => sourceCommit }))
    .toThrow(/reader_empty: readers\["xh-int-v1-r01"\]\.pages/);
  expect(fs.readFileSync(out, 'utf8')).toBe('existing output');
});
test.each(['checker step', 'lint'])('runCli leaves an existing output unchanged on %s failure', failure => {
  const input = fixture();
  if (failure === 'checker step') input.wordbankRows[1].decodable_step = '2';
  else input.wordbankRows[1].syllables = 'mo-la';
  const booksRepo = writeFixture(input); const out = path.join(booksRepo, 'output.json');
  fs.writeFileSync(out, 'existing output');
  expect(() => runCli(['--books-repo', booksRepo, '--out', out, '--version', '1'], { readSource: () => sourceCommit })).toThrow();
  expect(fs.readFileSync(out, 'utf8')).toBe('existing output');
});
