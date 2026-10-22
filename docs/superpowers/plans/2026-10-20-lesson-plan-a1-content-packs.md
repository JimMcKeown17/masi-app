# Lesson Plan A1: Content Pack Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app one way to read teaching content. That means the books project's checker vendored unchanged, a Masi lint on top of it, and a registry of bundled content packs keyed by Masi language code. The registry holds interim letters-only release packs for `xh`, `en` and `af`, plus an isiXhosa preview test pack built from the books repo's candidates. A developer setting turns on preview content, and pilot and production builds refuse it. Nothing is user-visible.

**Architecture:** Packs are immutable JSON files in `src/lessonPlan/packs/`. Each is deep-frozen once and reached only through `getPack(languageCode)` and `getPackById(packId)`, which return `null` instead of throwing. Inside a file, `language` keeps the shared catalogue's name (`isixhosa`, `english`, `afrikaans`; C15). The registry maps that name to the Masi code (`xh`, `en`, `af`; spec §0.1) and keys packs by code. `lintMasiPack` runs the vendored `lintSequence` unchanged, then adds Masi's rules. Every bundled pack must lint in Jest, and released files are hash-pinned. Preview content needs two keys: a build-time setting (`MASI_PREVIEW_CONTENT=1`, which `app.config.js` refuses on EAS for the `pilot` and `production` profiles) and, at runtime, a native update channel that is not a field channel. The support export carries an on-device self-check of the checker vectors, so the Hermes gate can run on a release build.

**Tech Stack:** React Native 0.81 / Expo SDK 54 (Hermes), `expo-constants`, `expo-updates` (`Updates.channel: string | null`), Jest 29 (jest-expo). Scripts run on Node 20.19.4, where `require(esm)` loads the vendored ES-module core (checked 2026-10-20; it prints a harmless `MODULE_TYPELESS_PACKAGE_JSON` warning). `csv-parse` is an existing devDependency, used through `scripts/lib/parseCsv.js`. `yaml@2.8.2` is already in `package-lock.json` as `metro-config`'s dependency; Jim approved declaring it as an exact devDependency on 2026-10-20 (spec J22, Task 5).

**Spec:** `docs/superpowers/specs/2026-10-20-lesson-plan-design.md`, rev 2. This plan covers §0.1 (languages are codes), §4.1 whole, C10's interim letters-only release packs, C12 and C15, with §13 as context. Cross-plan names come from the wave-1 sheet (rev 2). Executors read §0.1, §4.1, C10, C12 and C15 before Task 1.

**Build path:** Codex (gpt-5.6-sol) builds each task; Claude reviews the diff and runs the tests (AGENTS.md). Codex usually cannot run git commit in its sandbox, so the orchestrator runs the commit steps.
**Refreshed:** 2026-10-20 against origin/main f27b347 (#90) and spec rev 2 (2bb103a).

**Codex round 1:** folded in 2026-10-20 (new Masi lint rule `step_blend_length`: every letter-step blend has exactly two letters after normalising, since the shared lint accepts any decodable item there).

## Global Constraints

- Branch `feat/lesson-plan-a1-content-packs`. Make it from the branch that holds the approved spec (`feat/lesson-plan`), or from `main` once that has merged. Commit after every task. Never push without Jim. End every commit message with the session's attribution trailer.
- Run every command under Node 20: prefix it with `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH"`. Unit tests: `npx jest <file>`. Real-SQLite tests: `npm run test:integration -- <file>`. If the worktree has no `node_modules`, run `npm ci` first.
- **The app never invents words.** Every word, syllable and book comes from a pack (spec §4.1). The interim packs hold letters only.
- **The checker is vendored, never edited.** Copy `checker/core/*.js` to `src/utils/decodability/` and `checker/vectors/decodability-v1.json` to `src/constants/contracts/`, byte for byte, from early-reader-books commit `1c301cf`. The checker last changed there in `3685c49`. Vector `version` is `1`. (Books HEAD was still `1c301cf`, clean, on 2026-10-20.)
- The books repo (`/Users/jimmckeown/Development/early-reader-books`) and Zazi are **read-only**. Read them with `git -C <repo> show <commit>:<path>` or plain reads. Never check out, stash or edit there.
- **Languages are codes** (spec §0.1; AR §6.1). `getPack`, `CURRENT_PACK_IDS` and the diagnostics are keyed by exactly `'xh'`, `'en'` and `'af'`. Inside a pack file, `language` is the shared catalogue's name, exactly `'isixhosa'`, `'english'` or `'afrikaans'` (§4.1, C15). `PACK_LANGUAGE_CODES` maps name to code. Pack code does not import `src/utils/assessmentRegistry.js`, so A1 needs nothing from AF, whose `af` entry may land before or after A1 (plan call). Task 3's tests tie the two together.
- Exact letter orders: step 1 is the first four letters, then pairs (C10, J1).
  - isiXhosa `xh` (J1): `o m l a | k u | e n | i t | s d | f b | y c | z p | q w | v g | x h | j r`.
  - English `en` uses today's tracker order: `ENGLISH_PEDAGOGICAL_ORDER` (`src/constants/egraConstants.js:76-80`), served as `PEDAGOGICAL_ORDERS.en` by `src/utils/assessmentRegistry.js:19-22`. It is `a m s t | n i | p c | f d | h o | r b | l k | e g | w v | u j | y z | q x`.
  - Afrikaans `af` uses Zazi's provisional order (`origin/main` `src/constants/egraConstants.js:262-266`). AF copies the same order into `PEDAGOGICAL_ORDERS.af`. It is `a s m e | k i | r o | n t | d l | p u | b g | h v | w y | f j | c z | x q`.
- Channels are exactly `'release'` and `'preview'`. A field build loads release packs only (J17, C12). A field build is one made with EAS profile `pilot` or `production`, or one running on update channel `preview` or `production`.
- An unknown or missing pack returns `null`. These functions never throw on any input: `getPack`, `getPackById`, `lintMasiPack`, `isPreviewContentEnabled` and `getContentDiagnostics` (spec §4.1). Lookups check own properties only (`Object.prototype.hasOwnProperty.call`), so `'constructor'`, `'__proto__'` and `'toString'` are unknown too.
- No change to schema, RLS, payloads, the outbox or sync. `documentation/rls-sync-contract-map.md` is not touched. No screen, copy or navigation change. No local migration, so the `user_version` 15 pins stay as they are.
- Production code reaches SQLite and the server only through the signed-in EA handle (AGENTS.md). A1 touches neither.
- Dependencies: none, apart from the `yaml` devDependency in Task 5, and only if Jim approves it. Stay on npm and `package-lock.json`.
- TDD per `.agents/skills/tdd`: write one failing test, then the code, in vertical slices, tested through the public functions. Keep the whole unit suite green after every task.
- Standing docs ship in the task that changes the behaviour they describe (AGENTS.md anti-drift rule).

## Review Focus

1. **A developer has the preview setting on during an OTA to a field channel.** Example: the developer's shell or `.env.local` holds `MASI_PREVIEW_CONTENT=1` when they publish. On SDK 54, `eas update` without `--environment` reads local `.env` files. A pilot or production phone must still load only release packs. Task 4 pins this with `isPreviewContentAllowed` cases on channels `'preview'` and `'production'`.
2. **A caller passes a name instead of a code, a prototype key, `null` options or an id that isn't bundled.** Examples: `getPack('isixhosa')` (the file's name, not the code), `getPack('English')`, `getPack('constructor')`, `getPack('zu')` (a registry language with no pack), `getPack('xh', null)`, and `getPackById('isixhosa-integrated-v1')` before that pack is adopted. Each call returns `null` or the release pack, and never throws. Pinned in Task 3.
3. **A consumer mutates a returned pack.** Example: it sorts `letter_steps` in place or pushes into `word_bank`. The write must throw, and later reads must be unchanged. Task 3 pins this with deep-freeze tests.
4. **A future books release has a defect.** Examples: a Masi field is missing, `language` is the code `'xh'` instead of the shared name, a reader has no details, a `page_lines` text has drifted from `pages`, a word contains `ê` or an apostrophe, a word's step was computed under another order, or a letter step's `blends` holds a three-letter word such as `lam` (the shared lint accepts any decodable item there). Jest must fail and name the code, and a device must never crash. Pinned in Task 2 (one test per rule) and Task 3 (every bundled pack lints; released files are hash-pinned).
5. **The test-pack generator runs on a drifted books repo, or the checker misbehaves on Hermes.** For the generator: the order differs from J1, `pack.yaml`'s `code` is not `xh`, a CSV step disagrees with the vendored checker, the repo has uncommitted content, or a speaker is not in the cast. The generator refuses, names the rows and writes nothing. Pinned in Task 5. Whether Hermes matches Node on NFC and `\p{L}` is a device question, gated in Task 7. Even if the checker module cannot load on a device, the support export must still succeed and report `content_diagnostics.error`. Pinned in Task 6.

---

### Task 1: Vendor the decodability checker and run its vectors in Jest

**Files:**
- Create (copied, never edited): `src/utils/decodability/index.js`, `lint.js`, `normalize.js`, `sounds.js`
- Create (copied): `src/constants/contracts/decodability-v1.json`
- Create: `documentation/content-packs.md` (section "Vendored checker")
- Test: `__tests__/decodability.test.js`

**Interfaces:**
- Produces, under the checker's own export names from `src/utils/decodability/index.js`:
  - `normalizeToken(raw) → string`
  - `tokenizeText(text) → string[]`
  - `splitSounds(token, inventory) → string[] | null`
  - `buildSoundStepIndex(seq) → Map<string, number>`
  - `analyzeToken(raw, seq) → { token, sounds: string[] | null, step: number | null, unknownChars: string[], untaughtSounds: string[] }`
  - `isDecodableAt(raw, k, seq) → boolean`
  - `lintSequence(input, { trackerLetters, vowels, outcomeForms? }) → { errors: LintIssue[], warnings: LintIssue[] }`, where `LintIssue = { code, message, step?, item?, readerId? }`

  A3's engine imports the tokeniser from here.

- [ ] **Step 1: Write the failing test.** Port the canonical runner, `early-reader-books/checker/test/vectors.test.ts`, to Jest. Add a provenance pin.

```js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { analyzeToken, buildSoundStepIndex, lintSequence, normalizeToken, splitSounds }
  from '../src/utils/decodability/index.js';
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

test('the vendored checker and vectors are byte-identical to the pinned books copy', () => {
  // for each entry: sha256 of fs.readFileSync(path.join(__dirname, '..', file)) equals the pin
  // fs.readdirSync('src/utils/decodability').sort() equals ['index.js','lint.js','normalize.js','sounds.js']
});

describe('shared decodability vectors v1', () => {
  test('pins the contract version', () => { expect(vectors.version).toBe(1); });
  // then, copied from vectors.test.ts with the same names and assertions:
  // - test.each(normalize_cases): normalizeToken(raw) === token
  // - test.each(token_cases): analyzeToken(token, sequence).sounds/.step equal the vector, and
  //   splitSounds(normalizeToken(token), sequence.sound_inventory) equals sounds
  // - one `<sound>a` vector per inventory sound, at buildSoundStepIndex's step
  // - the 26 required lint-case names are present, the names are unique, and there are >= 20 cases
  // - the valid_sequence case deep-equals the top-level sequence
  // - the three "differ only in the exception" pairs
  // - test.each(lint_cases): the expect_errors / forbid_errors / expect_warnings matching rules
  //   (same `matches` helper), and valid_sequence has zero errors and zero warnings
});
```

  Port notes:
  - Do **not** port the test named "the in-memory generator agrees with the committed lint cases". It imports the books repo's TypeScript generator.
  - Replace `structuredClone(x)` with `JSON.parse(JSON.stringify(x))`.
  - Drop vitest's second `expect` argument (the message). Jest's `expect` takes one argument.

- [ ] **Step 2: Run it and confirm it fails.** `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest __tests__/decodability.test.js`. Expected: FAIL, "Cannot find module '../src/utils/decodability/index.js'".
- [ ] **Step 3: Copy the files from the pinned commit.** First check `git -C /Users/jimmckeown/Development/early-reader-books log -1 --format=%h -- checker`. If it no longer prints `3685c49`, stop and tell the orchestrator, because a newer checker may carry a new vector version. Then:

```bash
B=/Users/jimmckeown/Development/early-reader-books
mkdir -p src/utils/decodability src/constants/contracts
for f in index lint normalize sounds; do git -C "$B" show 1c301cf:checker/core/$f.js > src/utils/decodability/$f.js; done
git -C "$B" show 1c301cf:checker/vectors/decodability-v1.json > src/constants/contracts/decodability-v1.json
```

- [ ] **Step 4: Run the test and confirm it passes.** Same command. Expected: PASS, with 16 normalize cases, 56 token cases and 39 lint cases.
- [ ] **Step 5: Write `documentation/content-packs.md`.** Open with a one-paragraph purpose: the pack contract of lesson-plan spec §4.1, with real packs coming from the books project. Then add the section "Vendored checker". It covers:
  - where the files came from (books `1c301cf`, checker `3685c49`);
  - that the copies are never edited;
  - how to re-vendor: run the Step 3 commands at a new commit, then update `VENDORED_SHA256` and the commit in the test, and the vector version assertion if it changed;
  - the one runner test deliberately not ported, and why.
- [ ] **Step 6: Commit.**

```bash
git add src/utils/decodability src/constants/contracts/decodability-v1.json __tests__/decodability.test.js documentation/content-packs.md
git commit -m "feat(lesson-plan): vendor the early reader books decodability checker and run its vectors"
```

---

### Task 2: `lintMasiPack`, the shared lint plus Masi's rules

**Files:**
- Create: `src/lessonPlan/packs/lintMasiPack.js`
- Test: `__tests__/lintMasiPack.test.js`

**Interfaces:**
- Consumes: `lintSequence`, `analyzeToken` and `normalizeToken` from Task 1. Import them as `'../../utils/decodability/index.js'`, with the explicit `index.js`, so that the Node CLI in Task 5 can `require` this module.
- Produces:
  - `PACK_LANGUAGE_CODES = Object.freeze({ isixhosa: 'xh', english: 'en', afrikaans: 'af' })`. It maps the shared file's `language` name to the Masi code.
  - `PACK_CHANNELS = Object.freeze(['release', 'preview'])`
  - `MASI_LINT_OPTIONS = Object.freeze({ trackerLetters: [26 letters 'a'…'z'], vowels: ['a','e','i','o','u'] })`. The same options apply to all three languages (plan call).
  - `lintMasiPack(pack: unknown) → { ok: boolean, errors: string[] }`. Each error is `"<code>: <message>"`. The shared errors come first, in the order `lintSequence` sorts them, followed by Masi's errors. `ok` is `errors.length === 0`. Warnings are ignored. None occur, because no `outcomeForms` are passed (J19: assessment words are ordinary words). It never throws and never mutates its input.
- Masi rules (codes are exact):

| Code | Rule |
|---|---|
| `pack_id` | `id` is a non-empty string |
| `pack_language` | `language` is an own key of `PACK_LANGUAGE_CODES`: the shared name, never the code |
| `pack_channel` | `channel` is in `PACK_CHANNELS` |
| `word_bank_shape` | `word_bank` is an array of `{ text: string, step: integer >= 1, syllables?: string \| null }` |
| `word_bank_not_normalized` | `normalizeToken(text) === text` |
| `word_bank_duplicate` | no `text` appears twice |
| `word_bank_step` | `analyzeToken(text, pack).step === entry.step`. This is the exact first decodable step, so `null` fails too (plan call) |
| `word_bank_syllables` | when `syllables` is a string, `normalizeToken(syllables) === text` |
| `reader_details_shape` | `reader_details` is an object. Each value has a boolean `retired`, `speakers` as `{ [id]: { name, colour } }` with non-empty strings, and `page_lines` as an array of arrays of `{ speaker, text }` strings |
| `reader_details_unknown_reader` | every `reader_details` key is a key of `readers` |
| `reader_details_missing` | every key of `readers` has `reader_details` (plan call: every book must carry the `retired` flag) |
| `reader_details_text` | `page_lines.length === pages.length`, and `page_lines[i].map(l => l.text).join('\n') === pages[i]` |
| `reader_details_speaker` | every line's `speaker` is a key of that reader's `speakers` |
| `step_blend_length` | every string item of every `letter_steps[].blends` has exactly two letters after the vendored normaliser: `[...normalizeToken(item)].length === 2` (C5: a step's blends are the 2-letter tier's syllables, and A3 reads them as such). Message: `Step <step> blend "<item>" has <n> letters; letter-step blends must have exactly 2.` Plan call. |

  `analyzeToken` iterates `letter_steps[].new_letters` without guards. So run the word-bank checks against a sanitized `{ sound_inventory, letter_steps, sound_steps }`, which keeps only entries with an integer `step` and a string-array unit list. This is how `lintSequence` builds its `seq`. A malformed pack then reports `malformed` and can never make `analyzeToken` throw.

  `step_blend_length` reads the raw `letter_steps` the same careful way. It skips a non-array `letter_steps`, a non-object step, a step without an integer `step`, a non-array `blends` and non-string items, because `lintSequence` already reports each of those as `malformed`, and `normalizeToken` throws on a non-string. It checks letter steps only. A sound step's syllable, such as *tha*, has three letters, and sound steps are unused in v1 (C9). Why the rule is needed: the shared lint accepts any decodable item in `blends`, so `lam` in step 1 lints clean (checked against the vendored lint on 2026-10-20).

- [ ] **Step 1: Write the failing tests.** The fixture is the vector sequence (J1 order plus the 11 sounds) with the Masi fields added. It was checked against the real checker on 2026-10-20: `lintSequence` gives zero errors and zero warnings, and the steps are `molo` 1, `umama` 2 and `thina` 13.

```js
import vectors from '../src/constants/contracts/decodability-v1.json';
import { lintSequence } from '../src/utils/decodability/index.js';
import { lintMasiPack, MASI_LINT_OPTIONS, PACK_LANGUAGE_CODES } from '../src/lessonPlan/packs/lintMasiPack';

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

test('a valid pack passes', () => { expect(lintMasiPack(validPack())).toEqual({ ok: true, errors: [] }); });
test('pack language names map to the Masi codes', () => {
  expect(PACK_LANGUAGE_CODES).toEqual({ isixhosa: 'xh', english: 'en', afrikaans: 'af' });
  expect(Object.isFrozen(PACK_LANGUAGE_CODES)).toBe(true);
});
test.each(['english', 'afrikaans'])('a %s pack passes', name => { /* validPack() with language = name → ok */ });
test('a letters-only pack passes', () => { /* a–z inventory, 12 letter steps, sound_steps [], readers {}, word_bank [], reader_details {} → ok */ });
test('two lines on one page join with a newline', () => { /* pages ['Molo!\nMolo!'] with two page_lines entries → ok */ });
test.each([null, undefined, [], 'pack', 42, {}])('never throws on %p', input => {
  expect(() => lintMasiPack(input)).not.toThrow();
  expect(lintMasiPack(input).ok).toBe(false);
});
test('shared lint errors surface with their code', () => { /* remove 'r' from step 12 → codes contain 'permutation' */ });
test.each([
  ['pack_id', p => { p.id = ''; }],
  ['pack_language', p => { p.language = 'English'; }],
  ['pack_language', p => { p.language = 'xh'; }],                 // the code, not the shared name
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
  ['word_bank_step', p => { p.word_bank[2].step = 4; }],            // thina waits for th (step 13)
  ['word_bank_step', p => { p.word_bank.push({ text: 'kêrel', step: 6 }); }],  // ê is not in the inventory
  ['word_bank_syllables', p => { p.word_bank[0].syllables = 'mo-la'; }],
  ['reader_details_shape', p => { p.reader_details['xh-test-r01'].retired = 'no'; }],
  ['reader_details_shape', p => { p.reader_details['xh-test-r01'].speakers.malo.colour = ''; }],
  ['reader_details_unknown_reader', p => { p.reader_details['xh-ghost'] = p.reader_details['xh-test-r01']; }],
  ['reader_details_missing', p => { delete p.reader_details['xh-test-r01']; }],
  ['reader_details_text', p => { p.reader_details['xh-test-r01'].page_lines[0][0].text = 'Molo Lolo!'; }],
  ['reader_details_text', p => { p.reader_details['xh-test-r01'].page_lines.push([]); }],
  ['reader_details_speaker', p => { p.reader_details['xh-test-r01'].page_lines[1][0].speaker = 'kiki'; }],
  ['step_blend_length', p => { p.letter_steps[0].blends = ['mo', 'ma', 'lam']; }],  // three letters, decodable at step 1
  ['step_blend_length', p => { p.letter_steps[1].blends = ['u']; }],                // one letter
])('%s', (code, mutate) => {
  const pack = validPack(); mutate(pack);
  const result = lintMasiPack(pack);
  expect(result.ok).toBe(false);
  expect(codes(result)).toContain(code);
});
test("step_blend_length catches a three-letter blend that the shared lint accepts", () => {
  const pack = validPack();
  pack.letter_steps[0].blends = ['mo', 'ma', 'lam'];      // the vector sequence's steps carry no blends, so assign, never push
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
test('does not mutate its input and accepts a deeply frozen pack', () => { /* deep-equal before/after; frozen copy → ok */ });
```

- [ ] **Step 2: Run the tests and confirm they fail.** `… npx jest __tests__/lintMasiPack.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `lintMasiPack`** with the constants and rules above. Work in vertical slices: make the valid case pass, then add one rule per failing row.
- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command, plus `npx jest __tests__/decodability.test.js`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/lessonPlan/packs/lintMasiPack.js __tests__/lintMasiPack.test.js
git commit -m "feat(lesson-plan): lintMasiPack adds Masi's word bank, reader and blend-length rules to the shared lint"
```

---

### Task 3: Interim letters-only release packs and the pack registry

Each language gets an interim letters-only release pack until its real pack is released (C10, rev 2). The isiXhosa test pack is preview-only (J17), so without its interim pack a pilot build would have no isiXhosa order at all.

**Files:**
- Create: `src/lessonPlan/packs/isixhosa-interim-letters-v1.json`, `english-interim-letters-v1.json`, `afrikaans-interim-letters-v1.json`
- Create: `src/lessonPlan/packs/index.js`
- Modify:
  - `CONTEXT.md`: new term after **Letters focused**, today `:116-118`.
  - `documentation/content-packs.md`.
  - `documentation/README.md`: the standing references table, `:35-46`. The new row goes between `:39` and `:40`.
  - `docs/agent-context/README.md`: the task router, `:19-35`. The new row goes after `:28` (plan call).
- Test: `__tests__/lessonPlanPacks.test.js`

**Interfaces:**
- Consumes: `lintMasiPack` and `PACK_LANGUAGE_CODES` (Task 2).
- Produces, from `src/lessonPlan/packs/index.js` (the module wave 2 imports):
  - `BUNDLED_PACKS`: a frozen array of every bundled pack, each deep-frozen once at module load.
  - `CURRENT_PACK_IDS`: frozen `{ release: { xh: 'isixhosa-interim-letters-v1', en: 'english-interim-letters-v1', af: 'afrikaans-interim-letters-v1' }, preview: {} }`. Its keys are codes. "Current" means the id named here, not the highest version number. Ids from different families, interim and integrated, cannot be ordered by number (plan call).
  - `getPack(languageCode: unknown, options?: { allowPreview?: boolean } | null) → Pack | null`. It returns `CURRENT_PACK_IDS.preview[code]` only when `options?.allowPreview === true` and such a pack exists. Otherwise it returns `CURRENT_PACK_IDS.release[code]`, or `null`. It does own-property lookups only.
  - `getPackById(packId: unknown, options?: { allowPreview?: boolean } | null) → Pack | null`. It searches every bundled pack, so a draft or session that names an older version still resolves. A `channel: 'preview'` pack resolves only when `allowPreview === true`.
  - Re-exports `lintMasiPack` and `PACK_LANGUAGE_CODES`.
- Pack ids keep the shared file's language **name**, like the books' own `isixhosa-integrated-v1`. A pack id is not a language code (plan call; A3 already cites these ids).
  - App-made packs are named `<name>-<kind>-v<N>` and stored as `<id>.json`.
  - A books release keeps its own file name, `integrated-sequence-<name>-v<N>.json`.
  - The registry keys by the in-file `id`.
- Interim pack JSON shape. All three are the same apart from `id`, `language` and the step letters:

```json
{ "id": "english-interim-letters-v1", "language": "english", "channel": "release",
  "sound_inventory": ["a", "…", "z"],
  "letter_steps": [ { "step": 1, "new_letters": ["a","m","s","t"], "blends": [], "words": [], "readers": [] },
                    { "step": 2, "new_letters": ["n","i"], "blends": [], "words": [], "readers": [] } ],
  "sound_steps": [], "readers": {}, "word_bank": [], "reader_details": {} }
```

  `sound_inventory` is the 26 letters in alphabetical order. There are 12 letter steps, using the orders under Global Constraints. There is no `size_exception`: the lint needs none for step 1. All three orders were checked against `lintSequence` on 2026-10-20 and gave zero errors and zero warnings.

- [ ] **Step 1: Write the failing tests.**

```js
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { BUNDLED_PACKS, CURRENT_PACK_IDS, PACK_LANGUAGE_CODES, getPack, getPackById, lintMasiPack }
  from '../src/lessonPlan/packs';
import { LANGUAGE_LABELS, PEDAGOGICAL_ORDERS, languageCodeForHomeLanguage } from '../src/utils/assessmentRegistry';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const order = pack => pack.letter_steps.flatMap(s => s.new_letters).join(' ');
// Append-only: a released pack is never edited or removed (spec §4.1; books §5.8).
// Values: the sha256 of each file, computed in Step 3 (`shasum -a 256`) and pasted here once.
const RELEASE_PACK_SHA256 = { 'isixhosa-interim-letters-v1': '…', 'english-interim-letters-v1': '…', 'afrikaans-interim-letters-v1': '…' };

test.each([
  ['xh', 'isixhosa', 'o m l a k u e n i t s d f b y c z p q w v g x h j r'],
  ['en', 'english', 'a m s t n i p c f d h o r b l k e g w v u j y z q x'],
  ['af', 'afrikaans', 'a s m e k i r o n t d l p u b g h v w y f j c z x q'],
])('the %s release pack teaches the interim order, letters only', (code, name, expected) => {
  const pack = getPack(code);
  expect(pack).toEqual(expect.objectContaining({ language: name, channel: 'release' }));
  expect(order(pack)).toBe(expected);
  expect(pack.letter_steps.map(s => s.new_letters.length)).toEqual([4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  expect([pack.word_bank, pack.readers, pack.reader_details, pack.sound_steps]).toEqual([[], {}, {}, []]);
});
test('current release ids', () => {
  expect(CURRENT_PACK_IDS.release).toEqual({ xh: 'isixhosa-interim-letters-v1', en: 'english-interim-letters-v1', af: 'afrikaans-interim-letters-v1' });
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
test('every JSON file in the packs folder is bundled exactly once, by unique id', () => { /* parse each *.json; ids sorted equal BUNDLED_PACKS ids sorted; no duplicate ids */ });
test('released packs are immutable and never removed', () => { /* every pinned id is bundled; every release pack is pinned; sha256 of its file equals the pin */ });
test('every current id resolves to a bundled pack of that code and channel', () => {
  /* for each [channel, code, id] in CURRENT_PACK_IDS: getPackById(id, { allowPreview: true }) has
     PACK_LANGUAGE_CODES[pack.language] === code and channel === channel; release ids also resolve without the option */
});
test.each([undefined, null, '', 'English', 'english', 'isixhosa', 'isiXhosa', 'XH', ' xh', 'zu',
  'constructor', '__proto__', 'toString', 42, {}])('getPack(%p) is null', key => {
  expect(getPack(key)).toBeNull();
});
test('options may be missing or null', () => { /* getPack('en', null) and (…, undefined) → english-interim-letters-v1 */ });
test('only allowPreview === true asks for preview; with no preview pack the release pack is returned', () => {
  /* getPack('en', { allowPreview: true }).id === 'english-interim-letters-v1'; { allowPreview: 'yes' } → release */
});
test.each([undefined, null, '', 'isixhosa-integrated-v1', 'integrated-sequence-isixhosa-v1', 'xh', 'constructor', '__proto__', 7])(
  'getPackById(%p) is null', id => { expect(getPackById(id)).toBeNull(); });
test('getPackById resolves every bundled release pack', () => { /* each id → same object as in BUNDLED_PACKS */ });
test('returned packs are deeply frozen', () => {
  const pack = getPack('en');
  expect(Object.isFrozen(pack.letter_steps[0].new_letters)).toBe(true);
  expect(() => pack.letter_steps.sort()).toThrow(TypeError);
  expect(() => pack.word_bank.push({ text: 'x', step: 1 })).toThrow(TypeError);
  expect(getPack('en').letter_steps[0].new_letters).toEqual(['a', 'm', 's', 't']);
});
```

  Today `PEDAGOGICAL_ORDERS` holds `en` and `xh`, so the order test checks `en`. Once AF adds `af`, the same test checks it too, with no edit to this file. Both tests pass whether AF lands before or after A1.
- [ ] **Step 2: Run the tests and confirm they fail.** `… npx jest __tests__/lessonPlanPacks.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Write the three JSON files and `index.js`.**
  - Import each JSON statically.
  - Deep-freeze each pack once while building `BUNDLED_PACKS`, and build a private, never-exported id lookup at the same time. `getPack` and `getPackById` only read from those.
  - Compute the pins with `shasum -a 256 src/lessonPlan/packs/*-interim-letters-v1.json` and write them into `RELEASE_PACK_SHA256`.
- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command, plus the Task 1 and Task 2 tests. Expected: PASS.
- [ ] **Step 5: Docs.**
  - `CONTEXT.md`: add this term after **Letters focused**:

```markdown
**Content pack**:
The teaching content for one language at one version: the letter order in steps, per-step
syllables (blends) and headline words, the word bank, and the early readers. It is one immutable
JSON file, produced by the early reader books project (the same file Zazi reads), bundled in the
app and read through `getPack(languageCode)`. Inside the file the language is the shared
catalogue's name (`isixhosa`); the app keys packs by its language code (`xh`). A **release** pack
holds only reviewed content and is the only kind a field build loads; a **preview** pack
(unreviewed candidates) loads only in developer builds. Until a language's real pack is released,
an app-made **interim letters-only pack** supplies its letter order.
_Avoid_: "curriculum" or "sequence file" for the whole pack; confusing it with an **Item set**
(assessment content); editing a pack in place (a change is a new version).
```

  - `documentation/content-packs.md`: add the section "Bundled packs". It covers:
    - the folder and the id rule;
    - names and codes: the file's `language` and `PACK_LANGUAGE_CODES`;
    - `CURRENT_PACK_IDS`, keyed by code;
    - the three interim packs and the source of each order;
    - that released packs are never edited or removed (hash-pinned, append-only);
    - that `getPack` and `getPackById` return `null` rather than throwing.

    Add the section "Adopting a books release" (track D): copy `integrated-sequence-<name>-v<N>.json` unchanged into the folder, add one import, point `CURRENT_PACK_IDS.release[code]` at its id, add its hash pin, and run the tests. A failing lint means the file goes back to the books project. It is never fixed in the app.
  - `documentation/README.md`: add a row for `content-packs.md` to the standing references table.
  - `docs/agent-context/README.md`: add the router row `| Lesson-plan content packs or the decodability checker | documentation/content-packs.md | lesson-plan spec §4.1; early-reader-books checker/README.md |`, with the paths in backticks.
- [ ] **Step 6: Commit.**

```bash
git add src/lessonPlan/packs __tests__/lessonPlanPacks.test.js CONTEXT.md documentation/content-packs.md documentation/README.md docs/agent-context/README.md
git commit -m "feat(lesson-plan): interim letters-only packs and the content pack registry"
```

---

### Task 4: Preview content needs a developer build (C12)

**Files:**
- Create: `config/previewContentConfig.js` (CommonJS, like `config/supabaseProjectConfig.js`)
- Create: `src/lessonPlan/packs/previewContent.js`
- Modify:
  - `app.config.js`: the require at `:1`, and `extra` at `:74-84`.
  - `eas.json`: a new `preview-content` profile after `preview` (`:19-33`).
  - `DEPLOYMENT.md`: below the OTA isolation bullet, `:60-63`.
  - `documentation/content-packs.md`.
- Test: `__tests__/previewContentConfig.test.js`

**Interfaces:**
- Produces, from `config/previewContentConfig.js`:
  - `PREVIEW_CONTENT_ENV = 'MASI_PREVIEW_CONTENT'`
  - `FIELD_BUILD_PROFILES = Object.freeze(['pilot', 'production'])`
  - `FIELD_UPDATE_CHANNELS = Object.freeze(['preview', 'production'])`
  - `resolvePreviewContentBuildConfig({ env = process.env } = {}) → { previewContent: boolean }`.
    - `previewContent` is `env.MASI_PREVIEW_CONTENT === '1'`. Any other value is off.
    - When it is on and `env.EAS_BUILD_PROFILE` is a field profile, it throws `Error('MASI_PREVIEW_CONTENT=1 is refused for the "<profile>" build profile: preview content packs may hold unreviewed words (lesson-plan spec C12).')`.
    - EAS sets `EAS_BUILD_PROFILE` only on its build servers, so the refusal fires when the server evaluates `app.config.js`.
  - `isPreviewContentAllowed({ extra, channel } = {}) → boolean`. It is true only when `extra?.previewContent === true` and `channel` is not in `FIELD_UPDATE_CHANNELS`. A `null` or empty channel means a build with no update channel: development, internal `preview`, or `preview-content`.
- Produces, from `src/lessonPlan/packs/previewContent.js`: `isPreviewContentEnabled() → boolean`. It returns `isPreviewContentAllowed({ extra: Constants.expoConfig?.extra, channel: Updates.channel })`, and catches any error to return `false`. Wave-2 callers pass `{ allowPreview: isPreviewContentEnabled() }` to `getPack` and `getPackById`.
- `app.config.js` adds `...resolvePreviewContentBuildConfig()` to `extra`, so `extra.previewContent` is always a boolean.
- `eas.json` gets a `preview-content` profile (plan call). It is the only cloud route to a test build with candidates (J17).
  - `environment: 'preview'`, `distribution: 'internal'`, `autoIncrement: true` and `android.buildType: 'apk'`.
  - **No channel.**
  - `env` equal to `preview.env` plus `"MASI_PREVIEW_CONTENT": "1"`.
- Why two checks (a gap in the spec): the build check cannot see an OTA update. Pilot phones take OTAs on channel `preview` (`DEPLOYMENT.md:60-63`), and `eas update` evaluates `app.config.js` without `EAS_BUILD_PROFILE`. The runtime check reads the native, build-time channel, which no OTA can change.

- [ ] **Step 1: Write the failing tests.** Follow `__tests__/sentryBuildConfig.test.js` for env and module resets around `require('../app.config')()`. Mock `expo-updates` as `{ channel: null }` for the `isPreviewContentEnabled` cases.

```js
const eas = require('../eas.json');
const { FIELD_BUILD_PROFILES, FIELD_UPDATE_CHANNELS, resolvePreviewContentBuildConfig, isPreviewContentAllowed }
  = require('../config/previewContentConfig');

test.each([[{}, false], [{ MASI_PREVIEW_CONTENT: '1' }, true], [{ MASI_PREVIEW_CONTENT: 'true' }, false],
  [{ MASI_PREVIEW_CONTENT: '0' }, false], [{ MASI_PREVIEW_CONTENT: '' }, false]])('setting %p → %p', (env, on) => {
  expect(resolvePreviewContentBuildConfig({ env })).toEqual({ previewContent: on });
});
test.each(['pilot', 'production'])('the %s profile refuses the setting', profile => {
  expect(() => resolvePreviewContentBuildConfig({ env: { MASI_PREVIEW_CONTENT: '1', EAS_BUILD_PROFILE: profile } }))
    .toThrow(`MASI_PREVIEW_CONTENT=1 is refused for the "${profile}" build profile`);
});
test.each(['development', 'preview', 'preview-content'])('the %s profile allows it', profile => { /* → { previewContent: true } */ });
test('field profiles are exactly the store-distributed eas.json profiles', () => {
  expect(Object.entries(eas.build).filter(([, p]) => p.distribution !== 'internal').map(([n]) => n).sort())
    .toEqual([...FIELD_BUILD_PROFILES].sort());
});
test('field channels are exactly the channels of the field profiles', () => {
  expect([...new Set(FIELD_BUILD_PROFILES.map(n => eas.build[n].channel))].sort()).toEqual([...FIELD_UPDATE_CHANNELS].sort());
});
test('no field profile sets the preview setting', () => { /* pilot.env and production.env lack MASI_PREVIEW_CONTENT */ });
test('preview-content is internal, has no channel, and is the preview env plus the setting', () => {
  expect(eas.build['preview-content']).toEqual(expect.objectContaining({ environment: 'preview', distribution: 'internal' }));
  expect(eas.build['preview-content'].channel).toBeUndefined();
  expect(eas.build['preview-content'].env).toEqual({ ...eas.build.preview.env, MASI_PREVIEW_CONTENT: '1' });
});
test('app.config.js throws for a pilot build with the setting, and exposes a boolean otherwise', () => {
  /* EAS_BUILD_PROFILE=pilot + MASI_PREVIEW_CONTENT=1 → throws; no setting → extra.previewContent === false;
     EAS_BUILD_PROFILE=preview + setting → extra.previewContent === true */
});
test.each([
  [{ previewContent: true }, null, true], [{ previewContent: true }, undefined, true], [{ previewContent: true }, '', true],
  [{ previewContent: true }, 'preview', false], [{ previewContent: true }, 'production', false],
  [{ previewContent: false }, null, false], [{ previewContent: 'true' }, null, false], [undefined, null, false],
])('isPreviewContentAllowed(%p, %p) → %p', (extra, channel, allowed) => {
  expect(isPreviewContentAllowed({ extra, channel })).toBe(allowed);
});
test('isPreviewContentEnabled is false under the default test config', () => { /* jest.setup's expo-constants extra has no previewContent */ });
test('isPreviewContentEnabled is true for a developer build with the setting', () => { /* jest.isolateModules + doMock extra.previewContent true, channel null */ });
```

- [ ] **Step 2: Run the tests and confirm they fail.** `… npx jest __tests__/previewContentConfig.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `config/previewContentConfig.js`, `previewContent.js`, the `app.config.js` spread and the `eas.json` profile.
- [ ] **Step 4: Run the tests and confirm they pass.**
  - Run the same command, plus `npx jest __tests__/releaseGateConfig.test.js __tests__/sentryBuildConfig.test.js __tests__/supabaseProjectConfig.test.js`. Expected: PASS.
  - Then reproduce the server check locally with `EAS_BUILD_PROFILE=pilot MASI_PREVIEW_CONTENT=1 node -e "require('./app.config')()"`. It must exit non-zero and print the refusal message.
- [ ] **Step 5: Docs.**
  - `DEPLOYMENT.md`: below the OTA isolation bullet, add a short "Preview content" note:
    - Never set `MASI_PREVIEW_CONTENT` in an EAS environment.
    - Pilot and production builds refuse it.
    - A field-channel phone ignores it, even if an OTA carries it.
    - Test builds that need candidate words use `--profile preview-content` (Android APK).
  - `documentation/content-packs.md`: add the section "Release and preview". It covers the setting, the two checks and why both exist, and the `preview-content` profile.
- [ ] **Step 6: Commit.**

```bash
git add config/previewContentConfig.js src/lessonPlan/packs/previewContent.js app.config.js eas.json __tests__/previewContentConfig.test.js DEPLOYMENT.md documentation/content-packs.md
git commit -m "feat(lesson-plan): preview content packs load only in developer builds (C12)"
```

---

### Task 5: The isiXhosa preview test pack, generated from the books repo's candidates

**Files:**
- Create: `scripts/build-isixhosa-test-pack.cjs`
- Create (generated, committed): `src/lessonPlan/packs/isixhosa-candidates-preview-v1.json`
- Modify:
  - `src/lessonPlan/packs/index.js`: import the file and set `CURRENT_PACK_IDS.preview.xh`.
  - `package.json`: add the script `"content:xh-test-pack": "node scripts/build-isixhosa-test-pack.cjs"`, and the devDependency `"yaml": "2.8.2"` if Jim approves.
  - `package-lock.json`.
  - `__tests__/lessonPlanPacks.test.js` and `documentation/content-packs.md`.
- Test: `__tests__/buildIsixhosaTestPack.test.js`

**Interfaces:**
- Consumes:
  - `analyzeToken` (Task 1) and `lintMasiPack` (Task 2);
  - `src/lessonPlan/packs/isixhosa-interim-letters-v1.json` (Task 3);
  - `parseCsvFile` (`scripts/lib/parseCsv.js`).

  The script `require`s the ES-module core.
- Produces, exported from the script. It ends with `if (require.main === module) runCli(process.argv.slice(2))`, as `scripts/ea-access.cjs:180` does.
  - `parseArgs(argv) → { booksRepo: string, out: string, version: number }`. `--books-repo`, `--out` and `--version` (a positive integer) are all required. Unknown or duplicate flags throw.
  - `readBooksRepo(booksRepo) → { languagePack, wordbankRows, cast, books }`.
    - It reads `languages/xh/pack.yaml`, `languages/xh/wordbank.csv`, `cast/cast.yaml`, and every `books/*/book.yaml` whose `series` is `'isixhosa-integrated'`.
    - It reads YAML with `yaml`, which follows YAML 1.2, so the letters `y` and `n` stay strings. The books repo reads its own files the same way.
  - `readSourceCommit(booksRepo) → string`. It runs `git -C <repo> rev-parse HEAD`. It throws if `git -C <repo> status --porcelain -- languages/xh books cast` prints anything.
  - `buildTestPack({ languagePack, wordbankRows, cast, books, version, sourceCommit }) → Pack`. Pure.
  - `runCli(argv, { readSource = readSourceCommit } = {})`.
    - It calls `readSource` before reading any file, so a dirty or non-git repo fails fast.
    - It builds the pack, and refuses unless `lintMasiPack(pack).ok`.
    - It writes `JSON.stringify(pack, null, 2) + '\n'` to `--out`.
    - It writes nothing on any failure.
- `buildTestPack` rules (plan calls). They stand in for the books release step until the books project ships its own preview file (spec §13 item 7).
  - Top-level keys come in this order:
    - `id: 'isixhosa-candidates-preview-v<version>'`;
    - `language: 'isixhosa'` (the shared name, never the code);
    - `channel: 'preview'`;
    - `generated_from: { repo: 'early-reader-books', commit }`;
    - `sound_inventory`, `letter_steps`, `sound_steps`, `readers`, `word_bank` and `reader_details`.
  - **Refuse** unless `languagePack.code === 'xh'`. The books `pack.yaml` carries `code: xh`, so this catches a wrong language file.
  - `sound_inventory` is `trackerLetters`, then each sound step's `sound`, in step order.
  - Letter steps come from `letterSteps`. Copy `sizeException` as `size_exception` when it is present. **Refuse** unless the concatenated letters equal the isiXhosa interim pack's order (J1).
  - `word_bank`:
    - It holds every CSV row whose `status` is not `'rejected'`, as `{ text: word, syllables, step }`.
    - It is sorted by step and then by text (code-unit order).
    - `step` comes from the vendored `analyzeToken` against the built sequence. **Refuse**, listing the words, when a step is `null` or differs from the CSV's `decodable_step`.
  - Per letter step `k`, `blends` follow books design §5.8.
    - They are every consonant + vowel pair whose letters are both known by step `k`, with at least one of them new at `k`.
    - Consonants run in teaching order on the outside, and vowels in teaching order on the inside.
    - A consonant is any tracker letter not in `vowels`.
    - Step 1 gives exactly `["mo", "ma", "lo", "la"]`.
  - Per step `k` (letter and sound steps), `words` are up to 12 word-bank entries with `step === k` and at least 3 letters. They are ranked by `corpus_2024_count` (descending) and then by text. Each is written as its `syllables`, or as its text when it has none.
  - Readers:
    - Every book becomes `readers[id] = { title, step, tricky_words, pages }`, where each page is `lines.map(l => l.text).join('\n')`.
    - Each book is listed in its step's `readers`, with ids sorted.
    - `reader_details[id]` is `{ retired: false, speakers, page_lines }`.
    - Each speaker's `name` is the cast's `names.xh.name`.
    - `colour` is `'red'` for `voices.a`, `'blue'` for `voices.b`, and `'grey'` for anyone else.
    - **Refuse** a speaker with no cast entry.

- [ ] **Step 0: Declare the dependency (approved by Jim 2026-10-20, spec J22).**
  - Run `npm install --save-dev --save-exact yaml@2.8.2`. Check that `git diff package-lock.json` changes only the root `devDependencies` entry, and that `npm ls yaml --depth=0` prints `yaml@2.8.2` (the copy already in the lockfile under `metro-config`). If anything else changed, restore the lockfile and stop.
- [ ] **Step 1: Write the failing tests** with small inline fixtures. No books repo is needed:

```js
const { parseArgs, buildTestPack, runCli } = require('../scripts/build-isixhosa-test-pack.cjs');
const { lintMasiPack } = require('../src/lessonPlan/packs/lintMasiPack');
// fixture: languagePack = code 'xh' + J1 letterSteps + soundSteps th…tsh + trackerLetters a–z + vowels a e i o u;
// rows: ma (1, count 300), molo (1, 54), mama (1, 10), lala (1, 8), umama (2), thina (13), kaka (status rejected);
// cast: malo / lolo; one book xh-int-v1-r01 at step 1 with five one-line pages ("Molo, Lolo!" … "Molo, Malo!").

test('builds a preview pack that passes lintMasiPack', () => {
  const pack = buildTestPack({ ...fixture, version: 1, sourceCommit: 'a'.repeat(40) });
  expect(pack).toEqual(expect.objectContaining({ id: 'isixhosa-candidates-preview-v1', language: 'isixhosa', channel: 'preview' }));
  expect(lintMasiPack(pack)).toEqual({ ok: true, errors: [] });
});
test('refuses a language pack whose code is not xh', () => { /* languagePack.code 'zu' → throws naming the code */ });
test('letter steps are J1 and the inventory adds the 11 sounds', () => { /* sound_inventory.length === 37, ends 'sh','tsh' */ });
test('step 1 blends are the consonant-vowel syllables of o m l a', () => {
  expect(buildTestPack(…).letter_steps[0].blends).toEqual(['mo', 'ma', 'lo', 'la']);
});
test('step 2 blends are the syllables that use k or u', () => { /* set equals ['mu','lu','ko','ka','ku'] */ });
test('headline words skip 2-letter items, rank by corpus count and keep syllable hyphens', () => {
  /* letter_steps[0].words === ['mo-lo', 'ma-ma', 'la-la'] */
});
test('the word bank keeps candidates, drops rejected words and sorts by step then text', () => {
  /* texts === ['lala','ma','mama','molo','umama','thina']; thina.step === 13 */
});
test('refuses when a CSV step disagrees with the vendored checker', () => { /* molo decodable_step '2' → throws naming "molo" */ });
test('refuses an order that is not J1', () => { /* swap steps 1 and 2 letters → throws */ });
test('refuses a speaker missing from the cast', () => { /* line speaker kiki → throws */ });
test('readers join lines with a newline and carry speakers and colours', () => {
  /* readers['xh-int-v1-r01'].pages[0] === 'Molo, Lolo!'; reader_details speakers.malo === { name: 'Malo', colour: 'red' }; lolo blue;
     letter_steps[0].readers === ['xh-int-v1-r01'] */
});
test('the same inputs give byte-identical output', () => { /* JSON.stringify twice equal */ });
test.each([[[]], [['--books-repo', '/b']], [['--books-repo', '/b', '--out', 'x.json', '--version', '0']],
  [['--books-repo', '/b', '--out', 'x.json', '--version', '1', '--bogus']]])('parseArgs rejects %j', argv => {
  expect(() => parseArgs(argv)).toThrow();
});
test('runCli refuses a books repo with uncommitted content and writes nothing', () => { /* readSource throws → no file at --out */ });
```

- [ ] **Step 2: Run the tests and confirm they fail.** `… npx jest __tests__/buildIsixhosaTestPack.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement the script.** Work rule by rule, one failing test at a time.
- [ ] **Step 4: Run the tests and confirm they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Generate the committed pack.** The orchestrator runs this if Codex's sandbox cannot read the books repo:
  `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npm run content:xh-test-pack -- --books-repo /Users/jimmckeown/Development/early-reader-books --out src/lessonPlan/packs/isixhosa-candidates-preview-v1.json --version 1`.
  - Expected at books `1c301cf`: 3,328 word-bank entries, 12 letter steps, 11 sound steps and 1 reader (`xh-int-v1-r01`, status `draft`). Every entry is a `candidate`, and every CSV step agrees with the vendored checker (checked on 2026-10-20).
  - If books HEAD has moved, record the new commit and counts.
  - If the repo has uncommitted content, stop and ask Jim. Don't wait it out.
- [ ] **Step 6: Register it, test-first.** Add to `__tests__/lessonPlanPacks.test.js`:

```js
test('isiXhosa preview pack: developer builds only, same letter order as the release pack', () => {
  expect(CURRENT_PACK_IDS.preview).toEqual({ xh: 'isixhosa-candidates-preview-v1' });
  expect(getPack('xh').id).toBe('isixhosa-interim-letters-v1');
  expect(getPack('xh', { allowPreview: true }).id).toBe('isixhosa-candidates-preview-v1');
  expect(getPackById('isixhosa-candidates-preview-v1')).toBeNull();
  expect(getPackById('isixhosa-candidates-preview-v1', { allowPreview: true }).channel).toBe('preview');
  expect(order(getPack('xh', { allowPreview: true }))).toBe(order(getPack('xh')));
});
```

  - Run it and confirm it FAILS.
  - Then add the import and `CURRENT_PACK_IDS.preview.xh` to `index.js`, and run the file again. Expected: PASS.
  - The existing "every bundled pack lints" and "every JSON file is bundled" tests now cover the generated file.
  - Preview packs are not hash-pinned (plan call). A regeneration bumps `--version`, replaces the old preview file and updates the current id.
  - **Accepted risk (orchestrator call, Codex A1 round 2):** a developer-build draft or session pinned to a replaced preview id resolves to `null` and shows the C10 "no content yet" state; nothing crashes or is lost. Old preview versions are not kept because every binary bundles the preview pack (it is only gated at load), so keeping each regeneration would grow field builds for a developer-only case. Spec §4.1's "old versions stay bundled" applies to release packs, which are append-only and hash-pinned.
- [ ] **Step 7: Docs.** In `documentation/content-packs.md`, add the section "isiXhosa test pack". It covers:
  - its inputs and the regeneration command;
  - the generation rules above;
  - the books commit it was built from;
  - that it is preview-only (J17);
  - that it is bundled in every build but resolvable only with `allowPreview` (decision 8).
- [ ] **Step 8: Commit.**

```bash
git add scripts/build-isixhosa-test-pack.cjs src/lessonPlan/packs/isixhosa-candidates-preview-v1.json src/lessonPlan/packs/index.js __tests__/buildIsixhosaTestPack.test.js __tests__/lessonPlanPacks.test.js package.json package-lock.json documentation/content-packs.md
git commit -m "feat(lesson-plan): isiXhosa preview test pack generated from the books repo's candidates"
```

---

### Task 6: Content diagnostics and the on-device checker self-check in the support export

**Files:**
- Create: `src/lessonPlan/packs/contentDiagnostics.js`
- Modify:
  - `src/utils/debugExport.js`: `exportDatabase`'s `exportData`, `:38-57`.
  - `__tests__/debugExport.test.js`:
    - add `jest.mock('expo-updates', () => ({ channel: null }))` beside the mocks at `:4-43`;
    - extend the main export test, `:58-133`;
    - add one export test.
  - `documentation/device-gates-sqlite-backend-2026-07.md`: new section T after S, `:207-215`.
- Test: `__tests__/contentDiagnostics.test.js`

**Interfaces:**
- Consumes:
  - `getPack`, `BUNDLED_PACKS` and `PACK_LANGUAGE_CODES` (Task 3);
  - `isPreviewContentEnabled` (Task 4);
  - `analyzeToken` and `normalizeToken` (Task 1);
  - the vector JSON.
- Produces: `getContentDiagnostics({ allowPreview = isPreviewContentEnabled() } = {})`. It never throws. It returns either `{ error: string }` or:

```js
{
  previewContentAllowed: boolean,
  currentPacks: { xh: string | null, en: string | null, af: string | null }, // keyed by code
  bundledPackIds: string[],
  decodabilitySelfCheck: { vectorVersion: number, passed: number, failed: string[] },
}
```

  The self-check runs every `normalize_cases` and `token_cases` entry through the shipped checker. Those are the parts that depend on Unicode. A failure is labelled `normalize:<raw>` or `token:<token>`.
- `exportDatabase` adds `content_diagnostics` to the JSON through a private `readContentDiagnostics()` in `debugExport.js`.
  - It loads the module with a `require` inside a try/catch, and returns `{ error: String(error) }` when loading or calling throws. This matches `debugDump`'s `{ error: 'Error: …' }` form.
  - Why the require is lazy (plan call): neither the packs nor the 235 KB vector file are evaluated at app start while A1 is inert.
  - Why the try/catch (plan call): a checker that cannot even load on Hermes must not break the export that diagnoses it.

- [ ] **Step 1: Write the failing tests.**

```js
jest.mock('expo-updates', () => ({ channel: null }));
import { getContentDiagnostics } from '../src/lessonPlan/packs/contentDiagnostics';

test('reports the release packs and a clean self-check in a normal build', () => {
  expect(getContentDiagnostics()).toEqual({
    previewContentAllowed: false,
    currentPacks: { xh: 'isixhosa-interim-letters-v1', en: 'english-interim-letters-v1', af: 'afrikaans-interim-letters-v1' },
    bundledPackIds: expect.arrayContaining(['isixhosa-candidates-preview-v1', 'english-interim-letters-v1']),
    decodabilitySelfCheck: { vectorVersion: 1, passed: 72, failed: [] },
  });
});
test('a developer build reports the isiXhosa preview pack', () => {
  expect(getContentDiagnostics({ allowPreview: true }).currentPacks.xh).toBe('isixhosa-candidates-preview-v1');
});
test('returns { error } instead of throwing', () => { /* jest.isolateModules + doMock the decodability index so analyzeToken throws → { error: expect.any(String) } */ });
```

  In `__tests__/debugExport.test.js`:
  - In the first test, assert that `exported.content_diagnostics.decodabilitySelfCheck` equals `{ vectorVersion: 1, passed: 72, failed: [] }` and that `exported.content_diagnostics.previewContentAllowed` is `false`.
  - Add the test `'a content diagnostics module that fails to load does not break the export'`:
    1. Set up a migrated test writer, as the first test does.
    2. Call `jest.doMock('../src/lessonPlan/packs/contentDiagnostics', () => { throw new Error('checker failed to load'); })`.
    3. Call `exportDatabase({ handle: requireCurrentHandle() })`. It resolves to `{ success: true }`, and `content_diagnostics` equals `{ error: 'Error: checker failed to load' }`.
    4. Call `jest.dontMock` on the same path in `finally`.
- [ ] **Step 2: Run the tests and confirm they fail.** `… npx jest __tests__/contentDiagnostics.test.js __tests__/debugExport.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `contentDiagnostics.js` and the one `exportDatabase` change.
- [ ] **Step 4: Run the tests and confirm they pass.** Run `… npx jest __tests__/contentDiagnostics.test.js __tests__/debugExport.test.js __tests__/productionBindingStatic.test.js` and `… npm run test:integration -- __tests__/debugExport.test.js`. Expected: PASS.
- [ ] **Step 5: Docs.** In `documentation/device-gates-sqlite-backend-2026-07.md`, add section **"T. Content packs and the decodability checker (lesson plan A1, 2026-10)"**, with rows T1–T3 worded as in Task 7 Step 6.
- [ ] **Step 6: Commit.**

```bash
git add src/lessonPlan/packs/contentDiagnostics.js src/utils/debugExport.js __tests__/contentDiagnostics.test.js __tests__/debugExport.test.js documentation/device-gates-sqlite-backend-2026-07.md
git commit -m "feat(lesson-plan): content diagnostics and the checker self-check in the support export"
```

---

### Task 7: Final verification, build log, review and device gate

**Files:**
- Modify:
  - `documentation/build-log.md`: a dated subsection at the end of the Verification Register, after the last `### 2026-10-20 — …` subsection and before the `---` at `:1067` that precedes `## Decision Register` (`:1069`). Also one row at the end of the Decision Register table, after `:1222`.
  - `documentation/ROADMAP.md`: §5, `:671`.

- [ ] **Step 1: Run the full suites.** Run `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest` and `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npm run test:integration`. Expected: PASS. Record both counts.
- [ ] **Step 2: Static checks.**
  - `git diff <base> --stat -- supabase src/db src/services src/screens src/components src/utils/assessmentRegistry.js src/constants/egraConstants.js documentation/rls-sync-contract-map.md` must be empty. A1 changes no data layer, no screen and nothing AF owns.
  - `git diff <base> -- src/utils/decodability src/constants/contracts` must show only the five copied files.
  - `grep -rn "lessonPlan/packs" src | grep -v "^src/lessonPlan/"` must show only `src/utils/debugExport.js`.
- [ ] **Step 3: Branch review.** Run `/codex:adversarial-review --base <base>`. Weigh each finding by how likely and how costly it is, fix what is real, and log the findings and what was done with them.
- [ ] **Step 4: Build log.**
  - Add a subsection `### 2026-10-XX — Lesson plan A1: content packs`, in the format of the AR Plan 1 entries above it. It covers what shipped (Tasks 1–6), the suite counts, the vendored commit and hashes, the generator's books commit and counts, the review result, and the device gate once it has run.
  - Add one Decision Register row for this plan's decisions 1–8 below. Its revisit triggers: the books project ships its own preview file; the real isiXhosa pack is released; A2 moves the tracker to packs, taking the `PEDAGOGICAL_ORDERS` agreement test with it.
- [ ] **Step 5: ROADMAP.** In §5, add one open item, or extend it if another lesson-plan slice has already added one: "Lesson plan (spec 2026-10-20): A1 content packs built; the Hermes decodability device check (A1 Task 7) remains open." Remove the device clause once Step 6 passes.
- [ ] **Step 6: Device gate (manual; Jim or the orchestrator, on Jim's devices).**
  - It runs on the first EAS builds that carry A1.
  - It must pass before any slice that runs the checker on a field phone (A2, A3, C2–C4) ships in a pilot build.
  - A1 has no screen, so the text-size checks at 1.0x and 1.3x and the visual checks do not apply. Say so in the log.
  - The export path is Profile → **Support tools** → **Share database** → **Export**.

  The rows:
  - **T1. Android, Hermes, developer path.** Build with `eas build -p android --profile preview-content`, install it on the Galaxy A03s, sign in, and export. Pass means the exported JSON's `content_diagnostics` has `decodabilitySelfCheck` equal to `{ "vectorVersion": 1, "passed": 72, "failed": [] }`, `previewContentAllowed` `true`, and `currentPacks.xh` `"isixhosa-candidates-preview-v1"`.
  - **T2. iOS, Hermes, field path.** Use the next `pilot` TestFlight build on an iPhone, or an iOS `preview` build, and export the same way. Pass means `decodabilitySelfCheck` matches T1 exactly, `previewContentAllowed` is `false`, `currentPacks` is `{ xh, en, af }` with the three `*-interim-letters-v1` ids, and, on a pilot build, the export's `runtimeDiagnostics.update.channel` is `"preview"`.
  - **T3. Build refusal.** With `MASI_PREVIEW_CONTENT=1` and `EAS_BUILD_PROFILE=pilot` set, `node -e "require('./app.config')()"` must exit non-zero with the C12 refusal message. Do not spend an EAS build on this.
  - If T1 or T2 lists failures, or `content_diagnostics` holds `error`, stop. The vendored checker must not be edited. Report the failing cases to Jim and the books project.
- [ ] **Step 7: Commit.**

```bash
git add documentation/build-log.md documentation/ROADMAP.md
git commit -m "docs(lesson-plan): A1 content packs build log, roadmap and device gate"
```

---

## Decisions this plan made (plan calls, for the reviewer)

The interim isiXhosa release pack was a plan call in the first draft. It is now spec (C10, rev 2), so it is no longer listed here.

1. **Ids.** The ids are `<name>-interim-letters-v<N>` and `isixhosa-candidates-preview-v<N>`. They use the shared file's language name, like the books' `<name>-integrated-v<N>`, and can never collide with it. A pack id is not a language code. "Current" is the explicit `CURRENT_PACK_IDS` map, keyed by code, not version arithmetic.
2. **Names map to codes inside A1**, through `PACK_LANGUAGE_CODES`, not `languageCodeForHomeLanguage`. The file's `language` is a strict contract, while a class's `home_language` is free text in any case, and A1 must not wait for AF's `af`. Task 3's tests tie the map and the interim orders to AR's registry, and tighten automatically once AF lands. All lookups are own-property only.
3. **C12 uses two checks.** The build-time setting `MASI_PREVIEW_CONTENT=1` is refused on EAS for the `pilot` and `production` profiles. The runtime gate refuses preview on the native `preview` and `production` update channels, which covers OTAs. A `preview-content` EAS profile exists for test builds. There is no in-app toggle: a toggle could be switched on in a field build, and a build check cannot refuse a runtime switch. (#90 also removed the device-settings module and its Profile section.)
4. **Lint strictness.** A word's `step` must equal its first decodable step. `text` must be normalised, and syllables must match the word. Every reader needs `reader_details`. Every letter step's `blends` item has exactly two letters after normalising (`step_blend_length`, round 1), because C5 makes those items the 2-letter tier's syllables and books design §5.8 defines them as consonant–vowel pairs; the shared lint checks only that they decode. Colours are any non-empty string; C4 maps them to tokens. The lint uses `a–z` and `a e i o u` for all three languages.
5. **Immutability.** Packs are deep-frozen. Release pack files are hash-pinned and never removed, so "old versions stay bundled" holds forever, since saved sessions are permanent. Preview packs are replaced on regeneration and not pinned.
6. **Test pack generation.** Blends follow books design §5.8: consonant-vowel pairs that use a new letter. Headline words are up to 12 of at least 3 letters, ranked by corpus count. Speaker colours are red for voice A, blue for voice B and grey for others. The generator refuses on any drift (language code, order, CSV step, cast) and on a books repo with uncommitted content.
7. **The Hermes check goes in the support export**, not a new screen. The export loads the diagnostics lazily and fences them, so A1 adds nothing to app start and a broken checker cannot break the export.
8. **The preview pack is bundled in every binary, field builds included, but resolves only through `allowPreview`.** C12 and J17 govern what *loads* and *reaches EAs*. Leaving it out of field binaries would need build-time module swapping. Revisit if Jim reads J17 as "not in the binary", or when the books project ships its own preview file.

## Hand-offs

- **AF** needs nothing from A1. When AF adds `af` to `LANGUAGE_LABELS`, `languageCodeForHomeLanguage` and `PEDAGOGICAL_ORDERS`, Task 3's tests check it with no edit: `'afrikaans'` must resolve to `af`, and `PEDAGOGICAL_ORDERS.af` must equal the `af` interim pack's order.
- **A2**:
  - `getTeachingOrder(languageCode)` reads `getPack(languageCode, { allowPreview: isPreviewContentEnabled() })` and concatenates `letter_steps[].new_letters`. With no pack, it falls back to the registry (§4.2).
  - When A2 stops reading `PEDAGOGICAL_ORDERS` for order, it moves Task 3's "registry order equals the interim pack" test with it.
- **A3**:
  - It imports the tokeniser from `src/utils/decodability/index.js`.
  - It takes packs by code: `getPack('xh', { allowPreview: true })` for the preview test pack, and `getPack(code)` for the letters-only cases.
  - Steps may omit `blends`, `words` and `readers`, so default them with `?? []`.
  - In every linted pack, each letter step's `blends` item has exactly two letters (`step_blend_length`). A3's 2-letter tier still checks the length itself, so a pack that skipped this lint cannot offer a longer item there.
- **C3, C4 and C5**:
  - `getPackById(id)` without `allowPreview` returns `null` for a preview pack. A draft or session that names one shows the C10 fallback, never unreviewed content.
  - `lesson.pack_id` stores the in-file id, and `lesson.language` stores the code (§6).

## Decided

- **`yaml@2.8.2` as an exact devDependency: approved by Jim, 2026-10-20 (spec J22).** It is already in `package-lock.json` as `metro-config`'s dependency, so only the root `devDependencies` entry changes. It is the YAML 1.2 parser the books project uses, and only the generator script uses it.
