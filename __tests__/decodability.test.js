import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  analyzeToken,
  buildSoundStepIndex,
  lintSequence,
  normalizeToken,
  splitSounds,
} from '../src/utils/decodability/index.js';
import vectors from '../src/constants/contracts/decodability-v1.json';

// Vendored from early-reader-books 1c301cf (checker last changed 3685c49). Never edit the copies:
// re-vendor per checker/README.md, then update this commit and every hash together.
const VENDORED_SHA256 = {
  'src/utils/decodability/index.js': '72c644e4ea4386f01ac79f2c2404f0425a92144d3328761e13255c3a6e183614',
  'src/utils/decodability/lint.js': '5996751b5bf9b178cee16f00a69a86d038c6c983f690891d6e631f03098fff50',
  'src/utils/decodability/normalize.js': 'b25cad3e410c3ba7865563e6fd19e11851c08dcfb7c962de432d7e9b7923892d',
  'src/utils/decodability/sounds.js': '38ed7e34b387b833bba27e43396f00eabff0e04e351c0534e69b3cc5c6e2663e',
  'src/constants/contracts/decodability-v1.json': '598fd3ca538abdbf88ddf48ceedf6f5f83955e8950d2ed28810a1b1494732842',
};

function matches(issue, match) {
  return issue.code === match.code
    && (match.step === undefined || issue.step === match.step)
    && (match.item === undefined || issue.item === match.item)
    && (match.readerId === undefined || issue.readerId === match.readerId);
}

test('the vendored checker and vectors are byte-identical to the pinned books copy', () => {
  for (const [file, expected] of Object.entries(VENDORED_SHA256)) {
    const contents = fs.readFileSync(path.join(__dirname, '..', file));
    const actual = crypto.createHash('sha256').update(contents).digest('hex');
    expect(actual).toBe(expected);
  }

  expect(fs.readdirSync(path.join(__dirname, '..', 'src/utils/decodability')).sort())
    .toEqual(['index.js', 'lint.js', 'normalize.js', 'sounds.js']);
});

describe('shared decodability vectors v1', () => {
  test('pins the contract version', () => {
    expect(vectors.version).toBe(1);
  });

  test.each(vectors.normalize_cases)('normalizeToken("$raw") → "$token"', ({ raw, token }) => {
    expect(normalizeToken(raw)).toBe(token);
  });

  test.each(vectors.token_cases)('analyzeToken("$token") → $step', ({ token, sounds, step }) => {
    const result = analyzeToken(token, vectors.sequence);
    expect(result.sounds).toEqual(sounds);
    expect(result.step).toBe(step);
    // splitSounds on the normalised token must agree with analyzeToken.
    expect(splitSounds(normalizeToken(token), vectors.sequence.sound_inventory)).toEqual(sounds);
  });

  test('has exactly one <sound>a vector per inventory sound, at its teaching step', () => {
    const index = buildSoundStepIndex(vectors.sequence);
    for (const sound of vectors.sequence.sound_inventory) {
      const probe = sound === 'a' ? 'a' : `${sound}a`;
      const matchingCases = vectors.token_cases.filter(c => c.token === probe);
      expect(matchingCases).toHaveLength(1);
      expect(matchingCases[0].step).toBe(index.get(sound));
    }
  });

  test('includes the brief and sound-inventory ruling cases with unique names', () => {
    const names = vectors.lint_cases.map(entry => entry.name);
    expect(names.length).toBeGreaterThanOrEqual(20);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining([
      'valid_sequence', 'missing_tracker_letter', 'duplicated_tracker_letter',
      'step1_three_letters', 'step1_no_vowel', 'step3_three_letters', 'step3_size_exception',
      'step1_undecodable_word', 'reader_undecodable_token', 'reader_tricky_word',
      'reader_step_mismatch', 'reader_listed_twice', 'reader_undefined', 'reader_unlisted',
      'duplicate_normalised_words', 'reader_outcome_overlap',
      'taught_sound_not_in_inventory', 'sound_taught_twice', 'inventory_sound_untaught',
      'normalised_tricky_word', 'missing_tricky_words', 'missing_pages_keeps_references',
      'null_reader', 'bad_word_items', 'bad_blend_items', 'duplicate_inventory_entry',
    ]));
  });

  test('the valid lint case uses exactly the top-level sequence', () => {
    const valid = vectors.lint_cases.find(entry => entry.name === 'valid_sequence');
    expect(valid.sequence).toEqual(vectors.sequence);
  });

  test.each([
    ['step3_three_letters', 'step3_size_exception'],
    ['reader_undecodable_token', 'reader_tricky_word'],
    ['reader_undecodable_token', 'normalised_tricky_word'],
  ])('%s and %s differ only in the exception being exercised', (failingName, passingName) => {
    const failing = vectors.lint_cases.find(entry => entry.name === failingName);
    const passing = vectors.lint_cases.find(entry => entry.name === passingName);
    const sequence = JSON.parse(JSON.stringify(passing.sequence));
    if (passingName === 'step3_size_exception') delete sequence.letter_steps[2].size_exception;
    else sequence.readers['xh-int-v1-r01'].tricky_words = [];
    expect(sequence).toEqual(failing.sequence);
    expect(passing.opts).toEqual(failing.opts);
    expect(passing.forbid_errors.length).toBeGreaterThan(0);
  });

  test.each(vectors.lint_cases)('lintSequence: $name ($mutate)', entry => {
    const { errors, warnings } = lintSequence(entry.sequence, entry.opts);
    // Mutations may cause secondary errors. Only the named matches are required
    // or forbidden, but warning codes (including repetition) must match exactly.
    for (const match of entry.expect_errors) {
      expect(errors.filter(issue => matches(issue, match))).not.toEqual([]);
    }
    for (const match of entry.forbid_errors) {
      expect(errors.filter(issue => matches(issue, match))).toEqual([]);
    }
    expect(warnings.map(issue => issue.code).sort())
      .toEqual(entry.expect_warnings.map(match => match.code).sort());
    for (const match of entry.expect_warnings) {
      expect(warnings.filter(issue => matches(issue, match))).not.toEqual([]);
    }
    if (entry.name === 'valid_sequence') {
      expect(errors).toEqual([]);
      expect(warnings).toEqual([]);
    }
  });
});
