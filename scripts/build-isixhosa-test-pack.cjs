const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const YAML = require('yaml');
const { parseCsvFile } = require('./lib/parseCsv.js');
const { analyzeToken } = require('../src/utils/decodability/index.js');
const { lintMasiPack } = require('../src/lessonPlan/packs/lintMasiPack.js');
const interimPack = require('../src/lessonPlan/packs/isixhosa-interim-letters-v1.json');

const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function parseArgs(argv) {
  const names = { '--books-repo': 'booksRepo', '--out': 'out', '--version': 'version' };
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!Object.hasOwn(names, flag)) throw new Error(`Unknown flag ${flag}.`);
    const name = names[flag];
    if (Object.hasOwn(args, name)) throw new Error(`Duplicate flag ${flag}.`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    args[name] = value;
  }
  for (const [flag, name] of Object.entries(names)) {
    if (!Object.hasOwn(args, name)) throw new Error(`Required flag ${flag}.`);
  }
  args.version = Number(args.version);
  if (!Number.isSafeInteger(args.version) || args.version < 1) throw new Error('--version must be a positive integer.');
  return args;
}

function readBooksRepo(booksRepo) {
  const readYaml = relativePath => YAML.parse(fs.readFileSync(path.join(booksRepo, relativePath), 'utf8'));
  const books = fs.readdirSync(path.join(booksRepo, 'books'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join('books', entry.name, 'book.yaml'))
    .filter(file => fs.existsSync(path.join(booksRepo, file)))
    .sort(compareText).map(readYaml).filter(book => book.series === 'isixhosa-integrated');
  return {
    languagePack: readYaml('languages/xh/pack.yaml'),
    wordbankRows: parseCsvFile(path.join(booksRepo, 'languages/xh/wordbank.csv')),
    cast: readYaml('cast/cast.yaml'), books,
  };
}

function readSourceCommit(booksRepo) {
  const commit = execFileSync('git', ['-C', booksRepo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const status = execFileSync('git', ['-C', booksRepo, 'status', '--porcelain', '--', 'languages/xh', 'books', 'cast'], { encoding: 'utf8' });
  if (status.trim()) throw new Error(`Books repo has uncommitted content:\n${status}`);
  return commit;
}

function buildTestPack({ languagePack, wordbankRows, cast, books, version, sourceCommit }) {
  if (languagePack.code !== 'xh') throw new Error(`Expected language code xh, received ${languagePack.code}.`);
  const letter_steps = languagePack.letterSteps.map(entry => ({
    step: entry.step, new_letters: [...entry.letters],
    ...(entry.sizeException === undefined ? {} : { size_exception: entry.sizeException }),
    blends: [], words: [], readers: [],
  }));
  const sound_steps = [...languagePack.soundSteps].sort((a, b) => a.step - b.step).map(entry => ({
    step: entry.step, new_sounds: [entry.sound], words: [], readers: [],
  }));
  if (letter_steps.flatMap(entry => entry.new_letters).join('')
    !== interimPack.letter_steps.flatMap(entry => entry.new_letters).join('')) {
    throw new Error('Letter order must match the isiXhosa interim pack (J1).');
  }
  const pack = {
    id: `isixhosa-candidates-preview-v${version}`,
    language: 'isixhosa', channel: 'preview',
    generated_from: { repo: 'early-reader-books', commit: sourceCommit },
    sound_inventory: [...languagePack.trackerLetters, ...sound_steps.flatMap(entry => entry.new_sounds)],
    letter_steps, sound_steps, readers: {}, word_bank: [], reader_details: {},
  };
  const invalidWords = [];
  const entries = wordbankRows.filter(row => row.status !== 'rejected').map(row => {
    const step = analyzeToken(row.word, pack).step;
    if (step === null || step !== Number(row.decodable_step)) invalidWords.push(row.word);
    return { text: row.word, syllables: row.syllables || null, step, count: Number(row.corpus_2024_count) || 0 };
  });
  if (invalidWords.length) throw new Error(`Missing or mismatched checker steps: ${invalidWords.join(', ')}`);
  entries.sort((a, b) => a.step - b.step || compareText(a.text, b.text));
  pack.word_bank = entries.map(({ text, syllables, step }) => ({ text, syllables, step }));
  const known = [];
  for (const entry of letter_steps) {
    known.push(...entry.new_letters);
    const consonants = known.filter(letter => languagePack.trackerLetters.includes(letter) && !languagePack.vowels.includes(letter));
    const vowels = known.filter(letter => languagePack.vowels.includes(letter));
    entry.blends = consonants.flatMap(consonant => vowels
      .filter(vowel => entry.new_letters.includes(consonant) || entry.new_letters.includes(vowel))
      .map(vowel => consonant + vowel));
  }
  for (const entry of [...letter_steps, ...sound_steps]) {
    entry.words = entries.filter(word => word.step === entry.step && [...word.text].length >= 3)
      .sort((a, b) => b.count - a.count || compareText(a.text, b.text))
      .slice(0, 12).map(word => word.syllables || word.text);
  }
  for (const book of [...books].sort((a, b) => compareText(a.id, b.id))) {
    const page_lines = book.pages.map(page => page.lines.map(({ speaker, text }) => ({ speaker, text })));
    const speakers = {};
    for (const speaker of new Set(page_lines.flatMap(page => page.map(line => line.speaker)))) {
      const character = cast.characters.find(entry => entry.id === speaker);
      if (!character) throw new Error(`Speaker ${speaker} is missing from the cast.`);
      speakers[speaker] = {
        name: character.names.xh.name,
        colour: speaker === book.voices.a ? 'red' : speaker === book.voices.b ? 'blue' : 'grey',
      };
    }
    pack.readers[book.id] = {
      title: book.title, step: book.step, tricky_words: [...book.tricky_words],
      pages: page_lines.map(page => page.map(line => line.text).join('\n')),
    };
    const entry = [...letter_steps, ...sound_steps].find(step => step.step === book.step);
    if (!entry) throw new Error(`Reader ${book.id} has unknown step ${book.step}.`);
    entry.readers.push(book.id);
    pack.reader_details[book.id] = { retired: false, speakers, page_lines };
  }
  return pack;
}

function runCli(argv, { readSource = readSourceCommit } = {}) {
  const { booksRepo, out, version } = parseArgs(argv);
  const sourceCommit = readSource(booksRepo);
  const pack = buildTestPack({ ...readBooksRepo(booksRepo), version, sourceCommit });
  const lint = lintMasiPack(pack);
  if (!lint.ok) throw new Error(`Generated pack failed lintMasiPack:\n${lint.errors.join('\n')}`);
  fs.writeFileSync(out, JSON.stringify(pack, null, 2) + '\n');
}

module.exports = { parseArgs, readBooksRepo, readSourceCommit, buildTestPack, runCli };

if (require.main === module) runCli(process.argv.slice(2))
