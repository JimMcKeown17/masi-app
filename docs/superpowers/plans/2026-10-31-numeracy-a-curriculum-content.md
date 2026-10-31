# Numeracy Track A: Curriculum Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the numeracy curriculum as a bundled, deep-frozen content file (`content/numeracy-curriculum/`) with a loader, a verify script that enforces the spec's content rules, and a render script that regenerates the partner's readable document from the JSON.

**Architecture:** One JSON file per edition (only `2026.1-draft` now), loaded by a CommonJS `index.js` with a static `require` so Metro bundles it offline, the same pattern as `content/egra/index.js`. `verify.cjs` is a `node:test` file holding a pure `checkCurriculum(curriculum) → string[]` checker plus its tests. Broken fixtures are built in-test by cloning the bundled edition and mutating it, so there are no fixture files. `render.cjs` exports a pure renderer, and `verify.cjs` asserts that the committed readable doc equals the render, so the doc can't drift from the JSON.

**Tech Stack:** Node 20 `node:test` + `node:assert/strict`, plain CommonJS, TypeScript declarations only (`index.d.ts`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-numeracy-tracker-and-lessons-design.md` (§4 is this plan; §13 "Content" names the required fixtures).

**Execution model:** Codex builds each task (`--model gpt-6.1-sol --effort high`); Claude reviews the diff and test output; the orchestrator commits, because Codex's sandbox can't commit. Run every command from the worktree root.

**Downstream:** Track B (`skillMasteryRepository` validates step keys with `listStepKeys(getCurriculum())`), Track C (planner and evidence), and the later Track D (screens) consume Task 1's **Produces** block. None of them import anything else from this folder.

## Global Constraints

- **Do not edit `content/egra/` in any way.** That pack is byte-identical across four repos and hash-pinned.
- Branch: `feat/numeracy-curriculum-content`. **Precondition:** the seed JSON and the spec exist only on `docs/numeracy-tracker-design` (commit `691855b5`), which is not on `origin/main` yet. Branch off `origin/main` after that docs branch merges. If it hasn't merged, branch off `origin/main` and cherry-pick `691855b5`.
- Edition string: `'2026.1-draft'`. The file is `content/numeracy-curriculum/curriculum-2026.1-draft.json`. A frozen edition (no `-draft` suffix) is never edited in place. A wording fix gets a new edition, and a changed step meaning gets a new step key (§4.4).
- Step key: `<skill>.<size>` (for example `add.10`), except skip count: `skip_count.2s | skip_count.5s | skip_count.10s`, with sizes 20 / 50 / 100. Every key must also match the server's shape regex, `^[a-z_]+\.[0-9a-z]+$` (Track B).
- Skill order, slot and group (§4.1, §9.3): `finger_flash`(main, warm_up), `count`(main, activity), `read_numbers`(main, activity), `compare`(main, activity), `before_after`(main, activity), `add`(main, activity), `subtract`(main, activity), `number_pairs`(main, activity), `count_aloud`(counting, warm_up), `skip_count`(counting, warm_up).
- Activities: 2–3 per step. Minutes are a whole number from **4 to 8**. This is the orchestrator contract, matching the drafted content: the spec's §4.3 says 5–8, but the draft has 16 four-minute activities and Appendix A says 4–8. Task 1 Step 8 corrects §4.3 to 4–8. Every warm_up-slot step needs at least one activity of ≤ 5 minutes.
- Tick when: exactly 3 `ask` and 3 `expected` strings. `rule` is exactly `"All 3 right? Tick it."`.
- **EA-facing fields:** `Skill.label`, `Skill.hint`, `Step.label`, `Step.goal`, `Activity.name`, `Activity.how[]`, `Activity.needs`, `TickWhen.setup`, `ask[]`, `expected[]` and `rule`. These are **not** EA-facing: keys, `slot`, `group`, `size`, `comes_after`, `source`, `source_ref`, `note_for_partner` and `edition`.
- Banned words in EA-facing fields (§2, §4.4): counting on / count on, counting all / count all, subitise / subitize (any ending), number bond(s), rung(s), ladder(s), band(s), strategy (any ending). The match ignores case and respects word boundaries.
- Commands use Node 20: prefix `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`. Use npm, not pnpm.
- `test:content` becomes `node --test content/egra/verify.cjs content/numeracy-curriculum/verify.cjs`. The EGMA branch appends `content/egma/verify.cjs` to the same line, so the merge conflict is trivial: keep all three.

## Review Focus

1. **Partner copy-back mistakes** (a misspelt field such as `tick_When`, a number typed as `"5"`, a missing `tick_when` or `activities`): verify must name the step and field, never crash with a `TypeError`. Pinned in Task 2 test `structure: a broken key, size order, slot or field name is caught without throwing`.
2. **Google Doc paste artefacts** (empty strings, leading or trailing spaces): these must be rejected with the field named, because they end up on EA screens. Pinned in Task 2 test `text: no empty or space-padded strings`.
3. **Banned words in other cases, forms and word parts** ("Counting On", "BANDS", "Subitizing" caught; "husband", "abandon", "bandage" and partner notes allowed). Pinned in the two Task 2 plain-words tests.
4. **Duplicate activity names within one step:** the rotation and `taught` records name activities by `name` (§8.2), so a duplicate silently breaks rotation. Pinned in Task 2 test `activities: 2 to 3 per step, 4 to 8 minutes, unique names, a short one for warm-ups`.
5. **Lookups with retired, misspelt or non-string keys** (old phones send keys a newer edition retired, §8.1): `getStep` returns `null` and never normalises case or whitespace or falls back; returned content and arrays can't be mutated by one reader for the next. Pinned in Task 1 tests `getStep never normalises or falls back` and `content is deep-frozen for every reader`.

---

## File Structure

| File | Responsibility |
|---|---|
| `content/numeracy-curriculum/curriculum-2026.1-draft.json` | The content: 10 skills, 37 steps, reshaped from the seed. |
| `content/numeracy-curriculum/index.js` | Loader: `CURRENT_EDITION`, `getCurriculum`, `getStep`, `listStepKeys`. No side effects. |
| `content/numeracy-curriculum/index.d.ts` | Readonly types (the cross-plan contract). |
| `content/numeracy-curriculum/verify.cjs` | `checkCurriculum` and its sub-checkers, edition-file checks, and all `node:test` tests for this folder. |
| `content/numeracy-curriculum/render.cjs` | `renderCurriculumMarkdown`, `readableDocPath`, and a CLI that writes the readable doc. |
| `content/numeracy-curriculum/README.md` | Loader use, editions and freezing, verify rules, and the partner round. |
| `package.json` | Extend `test:content`; add `content:numeracy-doc`. |
| `docs/numeracy/curriculum-draft-2026.1.json` | **Deleted**: superseded by the content file (one source of truth). |
| `docs/numeracy/curriculum-draft-2026.1.md` | Unchanged bytes; from Task 4 on it is generated and tested for sync. |
| `docs/superpowers/specs/2026-10-31-numeracy-tracker-and-lessons-design.md:142, 541-542` | The Appendix A pointer moves to the new JSON path, and §4.3's minutes become 4–8 (anti-drift). |
| `documentation/build-log.md` | Verification and Decision register rows. |

---

### Task 1: Content file and loader

**Files:**
- Create: `content/numeracy-curriculum/curriculum-2026.1-draft.json`, `content/numeracy-curriculum/index.js`, `content/numeracy-curriculum/index.d.ts`, `content/numeracy-curriculum/verify.cjs`, `content/numeracy-curriculum/README.md`
- Modify: `package.json` (`test:content`: line 43 in this worktree, 44 on `origin/main`); `docs/superpowers/specs/2026-10-31-numeracy-tracker-and-lessons-design.md:541-542`
- Delete: `docs/numeracy/curriculum-draft-2026.1.json`

**Interfaces:**
- Consumes: the seed, `docs/numeracy/curriculum-draft-2026.1.json` (`{ edition, status, skills: [{ skill, skill_label, steps: [{ id, label, goal, activities, tick_when, comes_after, note_for_partner }] }] }`).
- Produces (`require('<rel>/content/numeracy-curriculum')`; TS named imports work too):
  - `CURRENT_EDITION: '2026.1-draft'`
  - `getCurriculum(): Curriculum`: the bundled edition, deep-frozen, and the same reference on every call.
  - `getStep(curriculum: Curriculum, stepKey: string): Step | null`
  - `listStepKeys(curriculum: Curriculum): readonly string[]`: a frozen array with skills in file order and steps in size order.
  - Types in `index.d.ts`:

```ts
export type Curriculum = { readonly edition: string; readonly skills: readonly Skill[] };
export type Skill = { readonly key: string; readonly label: string; readonly hint: string;
  readonly group: 'main' | 'counting'; readonly slot: 'warm_up' | 'activity'; readonly steps: readonly Step[] };
export type Step = { readonly key: string; readonly skill: string; readonly label: string; readonly size: number | null;
  readonly goal: string; readonly activities: readonly Activity[]; readonly tick_when: TickWhen;
  readonly comes_after: readonly string[]; readonly note_for_partner: string };
export type Activity = { readonly name: string; readonly minutes: number; readonly how: readonly string[];
  readonly needs: string; readonly source: 'partner' | 'adapted' | 'new'; readonly source_ref: string };
export type TickWhen = { readonly setup: string; readonly ask: readonly [string, string, string];
  readonly expected: readonly [string, string, string]; readonly rule: string };
export const CURRENT_EDITION: '2026.1-draft';
export function getCurriculum(): Curriculum;
export function getStep(curriculum: Curriculum, stepKey: string): Step | null;
export function listStepKeys(curriculum: Curriculum): readonly string[];
```

- [ ] **Step 1: Write `curriculum-2026.1-draft.json` by reshaping the seed**

Use a throwaway script in the scratchpad; it is not committed. Every string, number, array and array order is carried over unchanged. Output is `JSON.stringify(c, null, 2) + '\n'` with keys in this order:

| Target | From seed |
|---|---|
| top level `{ edition, skills }` | `edition` (`"2026.1-draft"`); **drop** `status` |
| skill `{ key, label, hint, group, slot, steps }` | `key` ← `skill`, `label` ← `skill_label`; `hint`/`group`/`slot` from the table below |
| step `{ key, skill, label, size, goal, activities, tick_when, comes_after, note_for_partner }` | `key` ← `id`; `skill` ← parent key; `size` ← the number in the key (skip count: `2s`→20, `5s`→50, `10s`→100); the rest unchanged |
| activity `{ name, minutes, how, needs, source, source_ref }` | unchanged |

Row hints (EA copy, ellipsis is U+2026). The tracker mockup fixed add, subtract, read numbers and count aloud; the rest are this plan's call:

| skill | hint | | skill | hint |
|---|---|---|---|---|
| finger_flash | `up to…` | | add | `totals to…` |
| count | `up to…` | | subtract | `within…` |
| read_numbers | `up to…` | | number_pairs | `that make…` |
| compare | `up to…` | | count_aloud | `to…` |
| before_after | `up to…` | | skip_count | `in…` |

- [ ] **Step 2: Prove the reshape changed no content**

Run:
```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH node -e '
const a=require("./docs/numeracy/curriculum-draft-2026.1.json"), b=require("./content/numeracy-curriculum/curriculum-2026.1-draft.json");
const norm=c=>c.skills.map(s=>({k:s.skill??s.key,l:s.skill_label??s.label,steps:s.steps.map(({id,key,skill,size,...t})=>({key:id??key,...t}))}));
require("assert").deepStrictEqual(norm(b),norm(a)); console.log("content unchanged", b.edition)'
```
Expected: `content unchanged 2026.1-draft`

- [ ] **Step 3: Write the failing loader tests in `verify.cjs`**

`'use strict'`, `const { test } = require('node:test')`, `assert = require('node:assert/strict')`, `require('./index')`.

```js
test('the bundled edition is 2026.1-draft with ten skills and 37 steps in curriculum order', () => {
  const c = getCurriculum();
  assert.equal(CURRENT_EDITION, '2026.1-draft');
  assert.equal(c.edition, CURRENT_EDITION);
  assert.equal(getCurriculum(), c);
  assert.deepEqual(c.skills.map(s => s.key), ['finger_flash', 'count', 'read_numbers', 'compare',
    'before_after', 'add', 'subtract', 'number_pairs', 'count_aloud', 'skip_count']);
  const keys = listStepKeys(c);
  assert.equal(keys.length, 37);
  assert.deepEqual(keys.slice(0, 5), ['finger_flash.5', 'finger_flash.10', 'count.5', 'count.10', 'count.20']);
  assert.deepEqual(keys.slice(-3), ['skip_count.2s', 'skip_count.5s', 'skip_count.10s']);
});

test('each skill carries its EA label, row hint, group and slot', () => {
  assert.deepEqual(getCurriculum().skills.map(s => [s.key, s.label, s.hint, s.group, s.slot]), [
    ['finger_flash', 'Finger flash', 'up to…', 'main', 'warm_up'],
    ['count', 'Count objects', 'up to…', 'main', 'activity'],
    ['read_numbers', 'Read numbers', 'up to…', 'main', 'activity'],
    ['compare', 'Compare', 'up to…', 'main', 'activity'],
    ['before_after', 'Before & after', 'up to…', 'main', 'activity'],
    ['add', 'Add', 'totals to…', 'main', 'activity'],
    ['subtract', 'Take away', 'within…', 'main', 'activity'],
    ['number_pairs', 'Number pairs', 'that make…', 'main', 'activity'],
    ['count_aloud', 'Count aloud', 'to…', 'counting', 'warm_up'],
    ['skip_count', 'Skip count', 'in…', 'counting', 'warm_up'],
  ]);
});

test('getStep finds a step with its skill, size, label and order', () => {
  const c = getCurriculum();
  const add10 = getStep(c, 'add.10');
  assert.deepEqual([add10.key, add10.skill, add10.label, add10.size], ['add.10', 'add', 'up to 10', 10]);
  assert.deepEqual(add10.comes_after, ['add.5', 'count.10']);
  assert.deepEqual([getStep(c, 'skip_count.5s').size, getStep(c, 'skip_count.5s').label], [50, '5s to 50']);
  assert.equal(getStep(c, 'number_pairs.10').label, 'pairs that make 10');
  assert.equal(getStep(c, 'add.5').tick_when.ask[0], '2 + 3');
});

test('getStep never normalises or falls back', () => {
  const c = getCurriculum();
  for (const key of ['add.7', 'ADD.10', ' add.10', 'add', 'skip_count.5', '', undefined, null]) {
    assert.equal(getStep(c, key), null, String(key));
  }
  const other = { edition: 'x', skills: [{ key: 'k', steps: [{ key: 'k.1' }] }] };
  assert.equal(getStep(other, 'k.1').key, 'k.1');
  assert.deepEqual(listStepKeys(other), ['k.1']);
});

test('content is deep-frozen for every reader', () => {
  const c = getCurriculum();
  assert.throws(() => { getStep(c, 'add.5').tick_when.ask[0] = '9 + 9'; }, TypeError);
  assert.throws(() => { getStep(c, 'add.5').activities.push({}); }, TypeError);
  assert.throws(() => { c.skills.pop(); }, TypeError);
  assert.throws(() => { listStepKeys(c).push('x.1'); }, TypeError);
  assert.equal(getStep(getCurriculum(), 'add.5').tick_when.ask[0], '2 + 3');
});
```

- [ ] **Step 4: Run the tests to make sure they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH node --test content/numeracy-curriculum/verify.cjs`
Expected: FAIL with `Cannot find module './index'`.

- [ ] **Step 5: Implement `index.js` and `index.d.ts`**

`index.js` is CommonJS with a **literal** `require('./curriculum-2026.1-draft.json')` (Metro needs it static). Copy the `deepFreeze` helper from `content/egra/index.js`; don't import across packs. `getStep` returns `null` for anything that isn't an exact key match. `listStepKeys` returns `Object.freeze([...])`. `index.d.ts` is the block in Interfaces.

- [ ] **Step 6: Run the tests and the type check**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH node --test content/numeracy-curriculum/verify.cjs`
Expected: PASS, 5 tests.
Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx tsc --noEmit --strict content/numeracy-curriculum/index.d.ts`
Expected: exit 0, no output.

- [ ] **Step 7: Wire `test:content` and run it**

Set `"test:content": "node --test content/egra/verify.cjs content/numeracy-curriculum/verify.cjs"`.
Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:content`
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 8: Retire the seed, point the spec at the new file, start the README**

- `git rm docs/numeracy/curriculum-draft-2026.1.json`.
- Spec lines 541–542 become: ``- `content/numeracy-curriculum/curriculum-2026.1-draft.json`: the same content, structured: the `2026.1-draft` content file (§4.4). It moved here from `docs/numeracy/` when Track A was built.``
- Spec line 142 (§4.3): `minutes (5–8)` becomes `minutes (4–8)`. This matches Appendix A ("every activity 4–8 minutes") and the verify rule, so the spec no longer contradicts itself (anti-drift).
- README sections: **What this is** (bundled numeracy curriculum; not shared with other repos, unlike `content/egra`; the EGMA-to-step mapping lives in code, not here, per spec §7.2); **Loading** (a `require` example of the four exports, and the `null`-on-unknown rule); **Editions** (what the draft suffix means; frozen editions are never edited; a wording fix gets a new edition; a changed meaning gets a new step key; changing `CURRENT_EDITION` means changing the literal `require` too).

- [ ] **Step 9: Orchestrator commits**

```bash
git add content/numeracy-curriculum/curriculum-2026.1-draft.json content/numeracy-curriculum/index.js content/numeracy-curriculum/index.d.ts content/numeracy-curriculum/verify.cjs content/numeracy-curriculum/README.md package.json docs/superpowers/specs/2026-10-31-numeracy-tracker-and-lessons-design.md
git commit -m "feat(numeracy): bundle the 2026.1-draft curriculum with a frozen loader"
```

The seed's deletion is already staged by Step 8's `git rm`. Don't name it in `git add`: a path that is gone from both the index and the working tree makes `git add` fail with `pathspec ... did not match any files`, and then nothing at all is staged.

---

### Task 2: Verify the structure, editions and plain words

**Files:**
- Modify: `content/numeracy-curriculum/verify.cjs`, `content/numeracy-curriculum/README.md`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces (module-internal to `verify.cjs`; Task 3 extends them):
  - `checkCurriculum(curriculum, options = {}): string[]`: every problem, as `"<owner> <field path>: <problem>"`. `<owner>` is the step key (or skill key, or `curriculum`). The field path, such as `goal` or `activities[1].how[2]`, is left out for whole-object problems (`"add.10: unknown field \"tick_When\""`). It returns `[]` when the curriculum is clean and **never throws** on malformed input. In this task it runs `checkStructure` and `checkPlainWords`.
  - `checkEditionFiles(dir: string, frozen: Record<string, string>): string[]`
  - `SKILLS`: an ordered array of `{ key, group, slot }` (the Global Constraints list); `FROZEN_EDITIONS = Object.freeze({})` (edition → sha256 of the file); `BANNED_WORDS` (below).
  - Test helper `broken(mutate) → string[]`: `const c = structuredClone(getCurriculum()); mutate(c); return checkCurriculum(c);`

Rules `checkStructure` enforces (messages must contain the quoted fragments the tests match):
- Exact key sets at every level: unknown field → `unknown field "<name>"`; missing → `<name> is missing`. Wrong types are reported, not thrown.
- Skill keys, order, group and slot equal `SKILLS`; `step.skill === skill.key`.
- `size` is a positive integer (`null` is rejected in this edition). The key equals `` `${skill}.${size}` `` or, on skip_count only, `` `${skill}.${size / 10}s` ``; otherwise → `key does not match its size`. Keys are unique (`appears more than once`) and match `^[a-z_]+\.[0-9a-z]+$`. Sizes within a skill strictly increase (`steps are not in size order`).
- Activities: 2 or 3 (`needs 2 or 3 activities`); minutes (`minutes must be a whole number from 4 to 8`); `how` is a non-empty string array; `source` in `partner|adapted|new`; unique names (`activity name "<n>" is used twice`); a warm_up-slot step with no activity of ≤ 5 minutes → `warm-up step needs an activity of 5 minutes or less`.
- `tick_when`: `ask` and `expected` are arrays of exactly 3 (`needs exactly 3`); `rule` → `rule must be "All 3 right? Tick it."`.
- Every string field (EA-facing, plus `note_for_partner` and `source_ref`): empty → `is empty`; padded → `starts or ends with a space`.
- `comes_after` is an array of strings (its meaning is Task 3).
- Edition matches `^\d{4}\.\d+(-draft)?$`.

`checkPlainWords` scans only the EA-facing fields:

```js
const BANNED_WORDS = [/\bcount(?:ing)? on\b/i, /\bcount(?:ing)? all\b/i, /\bsubiti[sz]\w*/i, /\bnumber bonds?\b/i,
  /\brungs?\b/i, /\bladders?\b/i, /\bbands?\b/i, /\bstrateg\w*/i];
// message: `${where}: uses the banned word "${match[0]}"`
```

`checkEditionFiles` covers every `curriculum-*.json` in `dir`: the file name must be `` `curriculum-${edition}.json` `` (`file name does not match edition`). A non-draft edition missing from `frozen` → `frozen edition <e> is not pinned`. A hash mismatch → `edition <e> changed after it was frozen`. An entry in `frozen` with no file → `pinned edition <e> has no file`.

- [ ] **Step 1: Write the failing tests**

```js
test('every bundled edition passes every check', () => {
  const files = readdirSync(__dirname).filter(f => /^curriculum-.*\.json$/.test(f));
  assert.ok(files.includes(`curriculum-${CURRENT_EDITION}.json`));
  for (const f of files) {
    const errors = checkCurriculum(JSON.parse(readFileSync(join(__dirname, f), 'utf8')));
    assert.equal(errors.length, 0, `${f}:\n${errors.join('\n')}`);
  }
  assert.deepEqual(checkEditionFiles(__dirname, FROZEN_EDITIONS), []);
});

test('editions: file names match, and a frozen edition is pinned by hash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'numeracy-'));
  const body = JSON.stringify({ ...structuredClone(getCurriculum()), edition: '2026.1' });
  writeFileSync(join(dir, 'curriculum-2026.1.json'), body);
  assert.match(checkEditionFiles(dir, {}).join('\n'), /frozen edition 2026\.1 is not pinned/);
  assert.match(checkEditionFiles(dir, { '2026.1': '0'.repeat(64) }).join('\n'), /edition 2026\.1 changed after it was frozen/);
  const sha = createHash('sha256').update(body).digest('hex');
  assert.deepEqual(checkEditionFiles(dir, { '2026.1': sha }), []);
  assert.match(checkEditionFiles(dir, { '2026.1': sha, '2027.1': sha }).join('\n'), /pinned edition 2027\.1 has no file/);
  writeFileSync(join(dir, 'curriculum-2026.2.json'), body);
  assert.match(checkEditionFiles(dir, { '2026.1': sha }).join('\n'), /file name does not match edition/);
});

test('structure: a broken key, size order, slot or field name is caught without throwing', () => {
  assert.match(broken(c => { c.skills[5].steps[1].key = 'add.5'; }).join('\n'), /add\.5.*appears more than once/);
  assert.match(broken(c => { const s = c.skills[5].steps; [s[1], s[2]] = [s[2], s[1]]; }).join('\n'), /add.*steps are not in size order/);
  assert.match(broken(c => { c.skills[5].steps[1].size = 11; }).join('\n'), /add\.10.*key does not match its size/);
  assert.match(broken(c => { c.skills[1].slot = 'warm_up'; }).join('\n'), /count.*slot/);
  const typo = broken(c => { const t = c.skills[5].steps[1]; t.tick_When = t.tick_when; delete t.tick_when; }).join('\n');
  assert.match(typo, /add\.10.*unknown field "tick_When"/);
  assert.match(typo, /add\.10.*tick_when is missing/);
  assert.match(broken(c => { c.skills[5].steps[1].activities[0].minutes = '5'; }).join('\n'), /add\.10.*minutes must be a whole number from 4 to 8/);
  assert.doesNotThrow(() => broken(c => { delete c.skills[5].steps[1].tick_when; delete c.skills[5].steps[2].activities; c.skills[6].steps = null; }));
  assert.ok(broken(c => { c.skills[6].steps = null; }).length > 0);
});

test('activities: 2 to 3 per step, 4 to 8 minutes, unique names, a short one for warm-ups', () => {
  assert.match(broken(c => { c.skills[5].steps[1].activities[0].minutes = 3; }).join('\n'), /add\.10.*from 4 to 8/);
  assert.match(broken(c => { c.skills[5].steps[1].activities[0].minutes = 9; }).join('\n'), /add\.10.*from 4 to 8/);
  assert.match(broken(c => { c.skills[5].steps[1].activities.length = 1; }).join('\n'), /add\.10.*needs 2 or 3 activities/);
  assert.match(broken(c => { const a = c.skills[5].steps[1].activities; a.push(a[0], a[1]); }).join('\n'), /add\.10.*needs 2 or 3 activities/);
  assert.match(broken(c => { const a = c.skills[5].steps[1].activities; a[1].name = a[0].name; }).join('\n'), /add\.10.*activity name ".+" is used twice/);
  assert.match(broken(c => { c.skills[0].steps[0].activities.forEach(a => { a.minutes = 6; }); }).join('\n'), /finger_flash\.5.*warm-up step needs an activity of 5 minutes or less/);
  assert.match(broken(c => { c.skills[9].steps[0].activities.forEach(a => { a.minutes = 6; }); }).join('\n'), /skip_count\.2s.*warm-up step/);
  assert.doesNotMatch(broken(c => { c.skills[3].steps[0].activities.forEach(a => { a.minutes = 6; }); }).join('\n'), /warm-up step/);
});

test('tick when: exactly three items with answers and the fixed rule', () => {
  assert.match(broken(c => { c.skills[5].steps[0].tick_when.ask.length = 2; }).join('\n'), /add\.5.*ask.*needs exactly 3/);
  assert.match(broken(c => { c.skills[5].steps[0].tick_when.expected.push('6'); }).join('\n'), /add\.5.*expected.*needs exactly 3/);
  assert.match(broken(c => { c.skills[5].steps[0].tick_when.rule = 'Tick it.'; }).join('\n'), /add\.5.*rule must be "All 3 right\? Tick it\."/);
});

test('text: no empty or space-padded strings', () => {
  assert.match(broken(c => { c.skills[5].steps[1].goal = ''; }).join('\n'), /add\.10 goal: is empty/);
  assert.match(broken(c => { c.skills[5].steps[1].label = 'up to 10 '; }).join('\n'), /add\.10 label: starts or ends with a space/);
  assert.match(broken(c => { c.skills[5].steps[1].activities[0].how[0] = '  Hide'; }).join('\n'), /add\.10 activities\[0\]\.how\[0\]: starts or ends with a space/);
  assert.match(broken(c => { c.skills[5].hint = ''; }).join('\n'), /add hint: is empty/);
});

test('plain words: banned words are caught in every EA-facing field, whatever the case', () => {
  const cases = [
    [c => { c.skills[5].label = 'Strategies'; }, /add label: uses the banned word "Strategies"/],
    [c => { c.skills[5].hint = 'BANDS'; }, /add hint: uses the banned word "BANDS"/],
    [c => { c.skills[5].steps[1].label = 'Counting On'; }, /add\.10 label: uses the banned word "Counting On"/],
    [c => { c.skills[5].steps[1].goal = 'Children start subitising.'; }, /add\.10 goal: uses the banned word "subitising"/],
    [c => { c.skills[5].steps[1].activities[0].name = 'Number bonds'; }, /activities\[0\]\.name: uses the banned word "Number bonds"/],
    [c => { c.skills[5].steps[1].activities[0].how[1] = 'Pick a strategy.'; }, /activities\[0\]\.how\[1\]: uses the banned word "strategy"/],
    [c => { c.skills[5].steps[1].activities[0].needs = 'A ladder'; }, /activities\[0\]\.needs: uses the banned word "ladder"/],
    [c => { c.skills[5].steps[1].tick_when.setup = 'They count all of them.'; }, /tick_when\.setup: uses the banned word "count all"/],
    [c => { c.skills[5].steps[1].tick_when.ask[0] = 'Subitize 3 + 2'; }, /tick_when\.ask\[0\]: uses the banned word "Subitize"/],
    [c => { c.skills[5].steps[1].tick_when.expected[0] = '8, rung 2'; }, /tick_when\.expected\[0\]: uses the banned word "rung"/],
  ];
  for (const [mutate, pattern] of cases) assert.match(broken(mutate).join('\n'), pattern);
});

test('plain words: ordinary words that contain a banned word, and partner notes, are allowed', () => {
  const errors = broken(c => {
    const t = c.skills[5].steps[1];
    t.goal = 'Her husband brought a bandage. Do not abandon the game. Count to 10.';
    t.note_for_partner = 'Use a rubber band. Which strategy do you teach?';
    t.activities[0].source_ref = 'band W1';
  });
  assert.equal(errors.filter(e => /banned/.test(e)).length, 0, errors.join('\n'));
});
```

Imports added at the top: `readdirSync, readFileSync, writeFileSync, mkdtempSync` from `node:fs`, `join` from `node:path`, `tmpdir` from `node:os`, `createHash` from `node:crypto`.

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH node --test content/numeracy-curriculum/verify.cjs`
Expected: the 8 new tests FAIL with `checkCurriculum is not defined`; the 5 Task 1 tests pass.

- [ ] **Step 3: Implement `checkCurriculum`, `checkStructure`, `checkPlainWords` and `checkEditionFiles` in `verify.cjs`**

Read fields defensively, for example with a `fieldsOf(value)` helper that returns `{}` for non-objects, so malformed input yields messages, never a `TypeError`. The where-prefix is the step key when a step is in scope, otherwise the skill key. `checkCurriculum` accepts `options` now but ignores it until Task 3.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH node --test content/numeracy-curriculum/verify.cjs`
Expected: PASS, 13 tests. If `every bundled edition passes every check` fails on the real content, stop and report the message: the draft was script-checked, so a failure means either the rule or the draft is wrong, and Claude decides which.

- [ ] **Step 5: README: the "What verify checks" section**

List the rules above in plain words, the EA-facing field list, the banned words (noting that "rubber band" in `needs` would be rejected: write "elastic"), and the freeze procedure: copy the draft to `curriculum-<edition>.json`, set its `edition`, point `CURRENT_EDITION` and the literal `require` at it, and add its sha256 to `FROZEN_EDITIONS` in the same commit.

- [ ] **Step 6: Orchestrator commits**

```bash
git add content/numeracy-curriculum/verify.cjs content/numeracy-curriculum/README.md
git commit -m "test(numeracy): verify curriculum structure, editions and plain words"
```

---

### Task 3: Verify the order rules, starting steps and tick maths

**Files:**
- Modify: `content/numeracy-curriculum/verify.cjs`, `content/numeracy-curriculum/README.md`

**Interfaces:**
- Consumes: Task 2's `checkCurriculum`, `broken`, and the error format.
- Produces (internal):
  - `expectedComesAfter(curriculum, step): string[]`: the rule-derived prerequisites, in no particular order.
  - `applyOrderOverride(expected: string[], override?: { add?: string[], remove?: string[] }) → string[]`: exported from verify.cjs; checkCurriculum and the bundled-content test both use it.
  - `ORDER_OVERRIDES = Object.freeze({})`: shape `{ [stepKey]: { add?: string[], remove?: string[] } }`. This is how the partner overrides a single arrow (spec §4.2): the JSON change and the override entry land in the same commit, so the deviation is visible in review.
  - `checkOrder(curriculum, overrides): string[]`, `checkTicks(curriculum): string[]`.
  - `checkCurriculum(curriculum, { orderOverrides = ORDER_OVERRIDES } = {})` now also runs both.

The rule derivation (§4.2). The signature doesn't determine it:

```js
// size(k) = the step's size; has(k) = key exists; prev = previous step in the same skill.
expected = prev ? [prev.key] : [];
if (['add', 'subtract', 'compare', 'number_pairs'].includes(skill)) {
  const c = smallest count step with size >= N;   // add.15 / subtract.15 -> count.20
  if (c) expected.push(c.key);
  if (N > 20) expected.push(`read_numbers.${N}`);
}
if (skill === 'before_after') expected.push(`read_numbers.${N}`);
if (skill === 'subtract' || skill === 'number_pairs') expected.push(`add.${N}`);
if (step.key === 'number_pairs.5') expected.push('finger_flash.5');
if (skill === 'skip_count') expected.push(`count_aloud.${N}`);   // N = 20 / 50 / 100
```

`checkOrder` does four things:
1. Every `comes_after` key exists (`"<k>" is not a step`).
2. Compare as sets against `expected` with overrides applied (add the `add` keys, drop the `remove` keys): `missing "<k>"` / `unexpected "<k>"`.
3. No loops, found by DFS (`loop: a → b → a`).
4. The steps with empty `comes_after` are exactly the starting steps (`starting steps must be exactly finger_flash.5, count.5, read_numbers.5, count_aloud.10`).

`checkTicks` parses the text; the contract has no structured tick fields. For each item *i* (1-based in messages, `tick item i`):
- **Range:** every integer (`/\d+/g`) in `ask[i]` and `expected[i]` is ≤ `size` → otherwise `<n> is bigger than <size>`.
- **add:** find `/(\d+)\s*\+\s*(\d+)/` in `ask`; the first integer in `expected` must equal the sum → `a + b is s, not x`. No match → `can't find a sum like "2 + 3"`.
- **subtract:** `/(\d+)\s+take away\s+(\d+)/` → `a take away b is d, not x`; no match → `can't find a sum like "5 take away 2"`.
- **number_pairs:** `/I have (\d+)\b[\s\S]*?\bsee (\d+)/i`. The total must equal `size` (`must make <size>`); the expected first integer must equal `total − seen` → `<total> with <seen> seen leaves d, not x`; no match → `can't find "I have 5. You see 2."`.

- [ ] **Step 1: Write the failing tests**

```js
const sorted = a => [...a].sort();
const step = key => getStep(getCurriculum(), key);

test('order: the expected arrows follow the four rules', () => {
  const c = getCurriculum();
  const cases = {
    'finger_flash.5': [], 'read_numbers.20': ['read_numbers.10'], 'add.10': ['add.5', 'count.10'],
    'add.15': ['add.10', 'count.20'], 'compare.50': ['compare.20', 'read_numbers.50'],
    'before_after.5': ['read_numbers.5'], 'subtract.15': ['add.15', 'count.20', 'subtract.10'],
    'number_pairs.5': ['add.5', 'count.5', 'finger_flash.5'], 'skip_count.2s': ['count_aloud.20'],
    'skip_count.10s': ['count_aloud.100', 'skip_count.5s'],
  };
  for (const [key, want] of Object.entries(cases)) assert.deepEqual(sorted(expectedComesAfter(c, step(key))), sorted(want), key);
  // the bundled content is checked WITH its declared overrides applied, so an accepted partner change passes
  for (const key of listStepKeys(c)) assert.deepEqual(sorted(step(key).comes_after), sorted(applyOrderOverride(expectedComesAfter(c, step(key)), ORDER_OVERRIDES[key])), key);
});

test('order: a missing or extra arrow is caught unless an override records it', () => {
  const drop = c => { c.skills[5].steps[1].comes_after = ['add.5']; };
  assert.match(broken(drop).join('\n'), /add\.10.*missing "count\.10"/);
  assert.match(broken(c => { c.skills[5].steps[1].comes_after.push('compare.5'); }).join('\n'), /add\.10.*unexpected "compare\.5"/);
  const c = structuredClone(getCurriculum()); drop(c);
  assert.deepEqual(checkCurriculum(c, { orderOverrides: { 'add.10': { remove: ['count.10'] } } }), []);
});

test('order: the documented partner edit (JSON change plus override entry) passes every content check', () => {
  // clone, drop count.10 from add.10, declare the override, then run the same checks test:content runs on bundled content
  // (checkCurriculum and the override-aware per-step comparison); an undeclared change to another step still fails
});

test('order: an unknown key or a loop is caught', () => {
  assert.match(broken(c => { c.skills[5].steps[1].comes_after.push('add.7'); }).join('\n'), /add\.10.*"add\.7" is not a step/);
  const c = structuredClone(getCurriculum());
  c.skills[5].steps[0].comes_after.push('add.10');
  assert.match(checkCurriculum(c, { orderOverrides: { 'add.5': { add: ['add.10'] } } }).join('\n'), /loop: .*add\.5.*add\.10/);
});

test('order: exactly the four starting steps', () => {
  const c = getCurriculum();
  assert.deepEqual(listStepKeys(c).filter(k => step(k).comes_after.length === 0),
    ['finger_flash.5', 'count.5', 'read_numbers.5', 'count_aloud.10']);
  const fifth = structuredClone(c); fifth.skills[3].steps[0].comes_after = [];
  assert.match(checkCurriculum(fifth, { orderOverrides: { 'compare.5': { remove: ['count.5'] } } }).join('\n'),
    /starting steps must be exactly finger_flash\.5, count\.5, read_numbers\.5, count_aloud\.10/);
});

test('ticks: the sums are checked for add, take away and number pairs', () => {
  assert.match(broken(c => { c.skills[5].steps[1].tick_when.expected[1] = '11'; }).join('\n'), /add\.10 tick item 2: 6 \+ 4 is 10, not 11/);
  assert.match(broken(c => { c.skills[6].steps[0].tick_when.expected[0] = '4'; }).join('\n'), /subtract\.5 tick item 1: 5 take away 2 is 3, not 4/);
  assert.match(broken(c => { c.skills[7].steps[1].tick_when.expected[2] = '7'; }).join('\n'), /number_pairs\.10 tick item 3: 10 with 2 seen leaves 8, not 7/);
  assert.match(broken(c => { c.skills[7].steps[1].tick_when.ask[0] = 'I have 5. You see 3. How many are under the paper?'; }).join('\n'), /number_pairs\.10 tick item 1: must make 10/);
  assert.match(broken(c => { c.skills[5].steps[0].tick_when.ask[0] = 'two plus three'; }).join('\n'), /add\.5 tick item 1: can't find a sum like "2 \+ 3"/);
});

test('ticks: every number in a tick item is within the step size', () => {
  assert.match(broken(c => { const t = c.skills[5].steps[0].tick_when; t.ask[2] = '4 + 3'; t.expected[2] = '7'; }).join('\n'), /add\.5 tick item 3: 7 is bigger than 5/);
  assert.match(broken(c => { c.skills[2].steps[2].tick_when.ask[0] = 'Card 21'; }).join('\n'), /read_numbers\.20 tick item 1: 21 is bigger than 20/);
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH node --test content/numeracy-curriculum/verify.cjs`
Expected: the 6 new tests FAIL (`expectedComesAfter is not defined`, or no matching error); the earlier 13 pass.

- [ ] **Step 3: Implement `expectedComesAfter`, `checkOrder`, `checkTicks` and the `orderOverrides` option**

Each must tolerate whatever malformed shapes `checkStructure` already reports (skip a step or item it can't read; never throw).

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH node --test content/numeracy-curriculum/verify.cjs`
Expected: PASS, 19 tests.

- [ ] **Step 5: README: the "Order" section**

Cover the four rules in plain words, the "smallest Count step at or above N" reading of rule 2, how to override one arrow with `ORDER_OVERRIDES`, and the tick wording the sum checks need ("a + b", "a take away b", "I have N. You see M.").

- [ ] **Step 6: Orchestrator commits**

```bash
git add content/numeracy-curriculum/verify.cjs content/numeracy-curriculum/README.md
git commit -m "test(numeracy): verify curriculum order rules, starting steps and tick sums"
```

---

### Task 4: Render the readable doc, keep it in sync, close out

**Files:**
- Create: `content/numeracy-curriculum/render.cjs`
- Modify: `content/numeracy-curriculum/verify.cjs`, `content/numeracy-curriculum/README.md`, `package.json` (scripts), `documentation/build-log.md`
- Test (unchanged bytes): `docs/numeracy/curriculum-draft-2026.1.md`

**Interfaces:**
- Consumes: Task 1 `getCurriculum`, `CURRENT_EDITION`.
- Produces: `renderCurriculumMarkdown(curriculum: Curriculum): string`; `readableDocPath(edition: string): string`, which resolves to `<repo>/docs/numeracy/curriculum-draft-${edition.replace(/-draft$/, '')}.md`; and the CLI `node content/numeracy-curriculum/render.cjs`, which writes the current edition's doc and prints its path. npm script: `"content:numeracy-doc": "node content/numeracy-curriculum/render.cjs"`.

The output format is the existing `docs/numeracy/curriculum-draft-2026.1.md`, **byte for byte**. A prototype renderer built while writing this plan reproduced it exactly, with no extra trailing newline. Fixed copy:
- Intro: lines 1–19 of the existing file verbatim, with `2026.1-draft` in the title replaced by `${curriculum.edition}`. Then `## Contents`, one line per skill: `- **<label>**: <step labels joined by ' · '>`. Then `---`.
- Per skill: `## <label>`; per step: `### <skill label> · <step label>`, `**Goal:** …`, `**Comes after:** <"<skill label> <step label>" joined by ', ', in file order>`, or `Nothing: this is a starting step`. Then a `**Tick when**` blockquote: setup, `>`, then `> i. <ask> → *<expected>*`, `>`, `> **<rule>**`. Then `**How to teach it**`, and per activity `**<name>** (<minutes> min) · <source>` with the source as `Partner activity (<ref>)`, `Partner activity, adapted (<ref>)` or `New` (ref not shown), followed by the numbered `how` lines and `*You need:* <needs>`. Then `**Note for the partner:** …`. Blocks are separated by a blank line; skills by `---`; the file ends with exactly one `\n`.

- [ ] **Step 1: Write the failing tests in `verify.cjs`**

```js
const { renderCurriculumMarkdown, readableDocPath } = require('./render.cjs');

test('the readable doc for the partner matches the JSON', () => {
  const onDisk = readFileSync(readableDocPath(CURRENT_EDITION), 'utf8');
  assert.equal(onDisk, renderCurriculumMarkdown(getCurriculum()),
    'docs/numeracy is out of date: run npm run content:numeracy-doc');
});

test('the readable doc path drops the -draft suffix and changes with the content', () => {
  assert.ok(readableDocPath('2026.1-draft').endsWith(join('docs', 'numeracy', 'curriculum-draft-2026.1.md')));
  assert.ok(readableDocPath('2026.2').endsWith(join('docs', 'numeracy', 'curriculum-draft-2026.2.md')));
  const c = structuredClone(getCurriculum()); c.skills[5].steps[1].goal = 'Children add up to 10.';
  assert.match(renderCurriculumMarkdown(c), /### Add · up to 10\n\n\*\*Goal:\*\* Children add up to 10\.\n/);
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH node --test content/numeracy-curriculum/verify.cjs`
Expected: FAIL with `Cannot find module './render.cjs'`.

- [ ] **Step 3: Implement `render.cjs`**

CommonJS. It exports both functions, and runs the CLI only when `require.main === module`. It writes UTF-8 and only to `readableDocPath(CURRENT_EDITION)`. Add the npm script.

- [ ] **Step 4: Run the tests, then prove the CLI changes no bytes**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH node --test content/numeracy-curriculum/verify.cjs`
Expected: PASS, 21 tests.
Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run content:numeracy-doc && git diff --exit-code docs/numeracy/curriculum-draft-2026.1.md`
Expected: prints the doc path and exits 0 (no diff).

- [ ] **Step 5: README: the "Partner round" section**

1. `npm run content:numeracy-doc` → paste the doc into the Google Doc. 2. The partner suggests and comments there. 3. Masi copies the accepted changes into the JSON by hand (there is no Doc-to-JSON converter, per spec §4.4). 4. `npm run test:content` until it's clean. 5. Re-render for the next round. 6. Content-only changes ship as an OTA update on the preview channel.

- [ ] **Step 6: Final gate**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:content`
Expected: `# pass 26` (EGRA 5 + numeracy 21), `# fail 0`. If the EGMA branch merged first, `content/egma/verify.cjs` is on the same line, and the pass count is 26 plus EGMA's test count. Either way, `# fail 0`.
Run: `git diff --stat origin/main -- content/egra`
Expected: no output (the EGRA pack is untouched).

- [ ] **Step 7: Build log**

In `documentation/build-log.md`, add **Verification Register** rows (Date | Command/Check | Result | Notes) for the reshape-equivalence check, the `tsc` declaration check, the `test:content` count, the zero-byte render diff, and the EGRA-untouched diff, each with its exact command. Add one **Decision Register** row (Date | Decision | Rationale | Revisit Trigger) covering four decisions: verify recomputes `comes_after` from the four rules, with `ORDER_OVERRIDES` as the only way to deviate; row hints for the six skills the mockup didn't name; the seed JSON was deleted in favour of the content file; and the readable doc is generated and sync-tested. The revisit trigger is partner review rounds becoming frequent (a Doc-to-JSON converter) or a second edition running side by side.

- [ ] **Step 8: Orchestrator commits**

```bash
git add content/numeracy-curriculum/render.cjs content/numeracy-curriculum/verify.cjs content/numeracy-curriculum/README.md package.json documentation/build-log.md
git commit -m "feat(numeracy): render the partner's readable curriculum doc from the JSON and keep it in sync"
```
