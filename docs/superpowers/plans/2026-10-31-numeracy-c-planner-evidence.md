# Numeracy Track C: Evidence, Known Steps and Lesson Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pure functions that turn a child's maths results and ticks into known steps, and a group's
known steps and lesson history into a suggested numeracy lesson (one warm-up and N activity cards).

**Architecture:** Four small pure modules under `src/numeracy/` (evidence reader, known-steps union,
group step state, lesson planner) plus one shared threshold module, `src/utils/groupMastery.js`,
that the literacy engine also imports. The curriculum is always an **input** (a plain object in Track
A's `Curriculum` shape), never an import, so this branch builds and tests before Track A merges. Tick
rows are a plain input array in Track B's `getSkillMastery` row shape; nothing here imports Track B.
The existing engine purity guard is extended to cover the new files.

**Tech Stack:** JavaScript (ES modules, Babel via `jest-expo`), Jest on Node 20. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-numeracy-tracker-and-lessons-design.md` (§5 child
knowledge, §7 EGMA as evidence, §9 lesson suggestions, §13 testing). Read it with this plan.

**Branch:** `feat/numeracy-planner`, off `origin/main`. Orchestrator, before Task 1:
`git fetch origin && git switch -c feat/numeracy-planner origin/main`.

**Who builds:** Codex builds each task (`--model gpt-6.1-sol --effort high`); Claude reviews the diff
and the test run before the next task. Codex's sandbox usually cannot commit, so each task's commit
step is run by the orchestrator.

**Downstream:** Track D (screens) is not planned yet; it waits for `feat/egma-maths-assessment` to
merge. D consumes the **Produces** blocks of Tasks 2–5 exactly as written. D also owns what this plan
deliberately leaves out: loading inputs from repositories and computing the `complete` flags, plan
freezing and `past_date` (§9.4), the `sessions.activities.numeracy` record (§8.2), and every EA-facing
string ("5 of 6 are ready", "still on up to 5", "Use Swap to choose a step").

## Global Constraints

- Files in `src/numeracy/` import only from `src/numeracy/` and `src/utils/groupMastery.js`. No React,
  no repositories, no `content/` imports, no packages (§9: "a pure function").
- No clock reads, randomness, `console`, dynamic imports or module-level mutable state (`let`/`var`,
  module-level `new Map`/`new Set`) — the purity guard (`__tests__/lessonPlanEnginePurity.test.js`)
  enforces it. Module constants are `Object.freeze`d plain objects and arrays.
- Inputs are never mutated: every test deep-freezes its inputs.
- Step key: `<skill>.<size>`, e.g. `add.10`, `skip_count.5s`. A step's skill is the text before the
  first `.`.
- Group threshold (§9.2): fewer than 3 present → everyone; otherwise ≥ 80% (`5·covered ≥ 4·present`)
  or all but one. A child with no data counts as knowing nothing.
- Evidence ignores results whose `question_version` ends in `-draft` (§7.1) and `skipped_*` results.
- `engine_version: 1` on every plan.
- Literacy behaviour is unchanged: the lesson-plan engine vectors, real-pack and purity suites pass
  unmodified apart from the guard's new allowance.
- Do not edit `content/egra/`, `CONTEXT.md`, `documentation/rls-sync-contract-map.md` or
  `documentation/ROADMAP.md`. Track B owns the numeracy terms (including **Known step**), the
  contract rows and the spec §11 roadmap items, so editing them here would collide.
- This plan returns keys and child ids only. Any string added must follow the spec §2 plain-words rule.
- Jest runs on Node 20: prefix every command with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.

## Review Focus

1. **A present child with no entry in `knownByChild`** (just added to the group, data not loaded):
   counts as knowing nothing, never throws. Test in Task 4.
2. **The same child twice in `presentChildIds`** (added "for today" and already on the roster): counted
   once in every threshold and list. Test in Task 4.
3. **History naming a retired step key or a renamed activity** (after a partner edit and a new
   edition): rotation and ranking still work, nothing throws, the skill still counts as taught that
   day. Test in Task 5.
4. **A tick for a step key this edition doesn't have** (sent by a newer phone; the server checks shape
   only, §8.1): ignored, never shown as known. Test in Task 3.
5. **Results with missing or odd item metadata** (a letter result in the same list, `metadata: null`,
   `band: '10'` as text): ignored, no evidence, no throw. Test in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/groupMastery.js` (create) | `isGroupMastered(covered, present)`: the one group threshold, shared by letters and numeracy. |
| `src/lessonPlan/engine/letters.js` (modify) | Import `isGroupMastered`; delete the local `isLetterGroupMastered`. |
| `src/numeracy/evidence.js` (create) | `EVIDENCE_MAP` (§7.2) and `computeStepEvidence` (§7.3). |
| `src/numeracy/knownSteps.js` (create) | `knownStepsForChild`: evidence ∪ ticks ∪ implied (§5). |
| `src/numeracy/groupSteps.js` (create) | Group-known steps, each skill's group step, ready steps (§9.2). |
| `src/numeracy/planLesson.js` (create) | `planNumeracyLesson`: cards, rotation, pools, help lists (§9.3). |
| `test-support/numeracyCurriculumFixture.js` (create) | A 37-step curriculum in Track A's shape, built from spec §4.1–4.2, for tests. |
| `__tests__/lessonPlanEnginePurity.test.js` (modify) | Guard covers `src/utils/groupMastery.js` and `src/numeracy/`. |
| `__tests__/groupMastery.test.js`, `numeracyEvidence.test.js`, `numeracyKnownSteps.test.js`, `numeracyGroupSteps.test.js`, `numeracyPlanLesson.test.js`, `numeracyRealContent.test.js` (create) | One suite per module; the last checks against the real content files (Task 6, gated). |
| `documentation/build-log.md` (modify) | Verification rows (Task 6). |

Shared types, written as JSDoc at the top of each module that uses them (Track A's `index.d.ts`
names them; do not import it):

```js
/** Curriculum = { edition, skills: Skill[] }
 *  Skill = { key, label, hint, group: 'main'|'counting', slot: 'warm_up'|'activity', steps: Step[] }
 *  Step = { key, skill, label, size, goal, activities: Activity[], tick_when, comes_after: string[], note_for_partner }
 *  Activity = { name, minutes, how, needs, source, source_ref }
 *  KnownState = 'assessment' | 'ticked' | 'implied' */
```

---

### Task 1: Shared group threshold

**Files:**
- Create: `src/utils/groupMastery.js`
- Modify: `src/lessonPlan/engine/letters.js:15-19` (delete `isLetterGroupMastered`), `:67` (call site), imports at `:1-5`
- Modify: `__tests__/lessonPlanEnginePurity.test.js` (`ALLOWED` at `:8`; the "engine files are pure" test at `:61`)
- Test: `__tests__/groupMastery.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `isGroupMastered(covered: number, present: number): boolean` from `src/utils/groupMastery.js`.

- [ ] **Step 1: Write the failing test** `__tests__/groupMastery.test.js`

```js
import { isGroupMastered } from '../src/utils/groupMastery';

test.each([
  [0, 0, false], [1, 1, true], [1, 2, false], [2, 2, true],   // fewer than 3: everyone
  [2, 3, true], [1, 3, false], [4, 5, true], [3, 5, false],   // all but one
  [5, 6, true], [4, 6, false], [8, 10, true], [7, 10, false], [9, 10, true], // 80%
])('isGroupMastered(%i covered, %i present) is %s', (covered, present, expected) => {
  expect(isGroupMastered(covered, present)).toBe(expected);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/groupMastery.test.js`
Expected: FAIL, `Cannot find module '../src/utils/groupMastery'`.

- [ ] **Step 3: Implement `isGroupMastered(covered, present)` in `src/utils/groupMastery.js`**

Move the body of `isLetterGroupMastered` unchanged (`letters.js:15-19`). In `letters.js`, import it
(`import { isGroupMastered } from '../../utils/groupMastery';`), use it at the `known` filter, and
delete `isLetterGroupMastered` (nothing else references it: `grep -rn isLetterGroupMastered src __tests__`
returns only `letters.js`). In the purity test add `'src/utils/groupMastery'` to `ALLOWED`, and audit
`path.join(ROOT, 'src/utils/groupMastery.js')` alongside `files(ENGINE)` in the "engine files are pure" test.

- [ ] **Step 4: Run the new test and every literacy engine suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/groupMastery.test.js __tests__/lessonPlanEnginePurity.test.js __tests__/lessonPlanEngine.vectors.test.js __tests__/lessonPlanEngine.realPacks.test.js __tests__/lessonPlanGroupLastSeen.test.js __tests__/lessonPlanSuperseded.test.js`
Expected: PASS, all suites; no vector file changed.

- [ ] **Step 5: Commit**

Orchestrator commits: `git add src/utils/groupMastery.js src/lessonPlan/engine/letters.js __tests__/lessonPlanEnginePurity.test.js __tests__/groupMastery.test.js && git commit -m "refactor(lesson-plan): share the group mastery threshold for numeracy"`

---

### Task 2: Curriculum fixture and the evidence reader

**Files:**
- Create: `test-support/numeracyCurriculumFixture.js`, `src/numeracy/evidence.js`
- Modify: `__tests__/lessonPlanEnginePurity.test.js`
- Test: `__tests__/numeracyEvidence.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `buildNumeracyCurriculumFixture({ activities }?: { activities?: Record<stepKey, Activity[]> }): Curriculum`
    — deep-frozen. Ten skills in spec §4.1 table order (`finger_flash, count, read_numbers, compare,
    before_after, add, subtract, number_pairs, count_aloud, skip_count`), steps in size order, 37 in all.
    `slot`: `warm_up` for `finger_flash, count_aloud, skip_count`, else `activity`. `group`: `counting`
    for `count_aloud, skip_count`, else `main`. `size`: the "up to N" number (skip_count: 20, 50, 100;
    keys `skip_count.2s|5s|10s`). `label`: `'up to N'` (skip_count: `'2s to 20'`, `'5s to 50'`,
    `'10s to 100'`). `comes_after`: direct keys from the four rules of §4.2 (sorted). Default
    activities per step: `[{ name: '<key> A', minutes: 5, … }, { name: '<key> B', minutes: 7, … }]`;
    `activities[stepKey]`, when given, replaces that step's list. Other fields are short placeholders.
  - `EVIDENCE_MAP: Readonly<Record<stepKey, { skill: string, band: number }>>` (frozen, entries frozen).
  - `computeStepEvidence({ results, curriculum }): Map<stepKey, { shown: boolean, resultId: string, date: string }>`
    — `results` are **one child's** results, already bounded to the active year and programme by the
    caller (`getQuestionResults`, `assessmentsRepository.js:209`), each
    `{ id, question_code, question_version, stopped_reason, assessment_date, created_at, items: [{ is_correct, metadata: { skill, band, reached?, strategy? } }] }`.
    Keys appear only for curriculum steps that some eligible result reached, in curriculum order.

- [ ] **Step 1: Write the failing tests** `__tests__/numeracyEvidence.test.js`

Helpers in the test file: `item(skill, band, correct, extra = {})` →
`{ is_correct: correct, metadata: { skill, band, reached: true, ...extra } }`;
`result({ id, code, date, created = `${date}T09:00:00.000Z`, version = 'masi-egma-en-2026-1', stopped = 'completed', items })`.
`const curriculum = buildNumeracyCurriculumFixture();`, `ev = (results) => computeStepEvidence({ results: deepFreeze(results), curriculum })`.

```js
test('fixture follows the spec order rules', () => {
  const step = (key) => curriculum.skills.flatMap((s) => s.steps).find((s) => s.key === key);
  expect(curriculum.skills.flatMap((s) => s.steps)).toHaveLength(37);
  expect(curriculum.skills.flatMap((s) => s.steps).filter((s) => s.comes_after.length === 0).map((s) => s.key))
    .toEqual(['finger_flash.5', 'count.5', 'read_numbers.5', 'count_aloud.10']);
  expect(step('add.15').comes_after).toEqual(['add.10', 'count.20']);
  expect(step('compare.20').comes_after).toEqual(['compare.10', 'count.20']);
  expect(step('compare.50').comes_after).toEqual(['compare.20', 'read_numbers.50']);
  expect(step('before_after.5').comes_after).toEqual(['read_numbers.5']);
  expect(step('subtract.20').comes_after).toEqual(['add.20', 'count.20', 'subtract.15']);
  expect(step('number_pairs.5').comes_after).toEqual(['add.5', 'count.5', 'finger_flash.5']);
  expect(step('skip_count.5s').comes_after).toEqual(['count_aloud.50', 'skip_count.2s']);
});

test('EVIDENCE_MAP is the spec §7.2 table', () => {
  expect(Object.isFrozen(EVIDENCE_MAP)).toBe(true);
  expect(EVIDENCE_MAP).toEqual({
    'finger_flash.5': { skill: 'quick_see', band: 5 }, 'finger_flash.10': { skill: 'quick_see', band: 10 },
    'count.5': { skill: 'count_out', band: 5 }, 'count.10': { skill: 'count_out', band: 10 }, 'count.20': { skill: 'count_out', band: 20 },
    // read_numbers.5/10/20/50/100 → read_numbers; compare.5/10/20/50/100 → compare_numbers;
    // before_after.5/10/20 → number_neighbours; same band as the step size
    'add.5': { skill: 'add_objects', band: 5 }, 'add.10': { skill: 'add_objects', band: 10 }, 'add.20': { skill: 'add', band: 20 },
    'subtract.5': { skill: 'subtract_objects', band: 5 }, 'subtract.10': { skill: 'subtract_objects', band: 10 }, 'subtract.20': { skill: 'subtract', band: 20 },
    'number_pairs.5': { skill: 'number_bonds', band: 5 }, 'number_pairs.10': { skill: 'number_bonds', band: 10 },
    // count_aloud.10/20/50/100 → count_aloud
  }); // written out in full in the test: 30 entries
  const unmapped = curriculum.skills.flatMap((s) => s.steps).map((s) => s.key).filter((k) => !(k in EVIDENCE_MAP));
  expect(unmapped).toEqual(['before_after.50', 'before_after.100', 'add.15', 'subtract.15', 'skip_count.2s', 'skip_count.5s', 'skip_count.10s']);
});
```

Behaviour tests (each asserts the exact map entry or its absence):

| Test name | Input | Assertion |
|---|---|---|
| `a reached step with every item right is shown` | r1 `maths_read_numbers` 2026-11-02, three `read_numbers` band 10 right | `get('read_numbers.10')` equals `{ shown: true, resultId: 'r1', date: '2026-11-02' }` |
| `one wrong reached item means not shown` | same, one wrong | `{ shown: false, resultId: 'r1', … }` |
| `the newest result that reached the step decides` | r1 11-01 all right; r2 11-05 one wrong (same code) | `{ shown: false, resultId: 'r2' }`; swapped right/wrong → `{ shown: true, resultId: 'r2' }` |
| `a newer result that never reached the step keeps older evidence` | r1 11-01 band 10 right; r2 11-05 band 10 items all `reached: false`, wrong | `{ shown: true, resultId: 'r1' }` |
| `unreached items inside the deciding result are ignored` | r1: one band 10 right, two band 10 `reached: false` wrong | `shown: true` |
| `same date: the later created_at is newer` | r1 and r2 both 11-05, r2 created later and wrong | `resultId: 'r2'`, `shown: false` |
| `counters answers count only with count_on or known` | `maths_add_counters` three `add_objects` band 5 right, strategies `count_on`, `known`, `count_all` | `add.5` `shown: false`; all `count_on`/`known` → `true`; all `count_all` → `false` |
| `draft question versions are ignored` | version `'masi-egma-en-2026-1-draft'` | map is empty |
| `skipped results are ignored` | `stopped_reason: 'skipped_prerequisite_unmet'` | map is empty |
| `core addition feeds only up to 20` | `egma_addition_l1`: `add` band 5, 10 and 20 items, all right | keys are exactly `['add.20']` (no `add.5`, `add.10`, `add.15`) |
| `a step is shown when any source Question shows it` | r2 `maths_read_numbers` 11-05 band 20 wrong; r1 `egma_number_id` 11-01 band 20 right | `{ shown: true, resultId: 'r1' }`; with r1 also wrong → `{ shown: false, resultId: 'r2' }` |
| `only steps in the given curriculum appear` | curriculum with `read_numbers.100` filtered out; r1 band 100 right | `has('read_numbers.100')` false |
| `odd metadata and non-maths results are ignored` (Review Focus 5) | a `letter_sounds` result with `metadata: { reached: true }`; an item with `metadata: null`; a `read_numbers` item with `band: '10'` | map is empty; no throw |

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyEvidence.test.js`
Expected: FAIL, cannot find `../src/numeracy/evidence`. (Write the fixture before this run so the
evidence import is the only failure.)

- [ ] **Step 3: Implement the fixture, `EVIDENCE_MAP` and `computeStepEvidence`**

Rule constants (frozen arrays, not Sets): strict skills `['add_objects', 'subtract_objects']`, accepted
strategies `['count_on', 'known']`. The per-source rule is the part the signature doesn't fix:

```js
// eligible: question_version does not end in '-draft', stopped_reason not 'skipped_*', items is an array
// order newest first: assessment_date desc, then created_at desc (as eligibleLetterResults, letterMastery.js:16-27)
// matched(result, tag) = items with a plain-object metadata, metadata.reached !== false,
//                        metadata.skill === tag.skill and metadata.band === tag.band (numbers only)
// itemShows(item) = item.is_correct === true && (skill not strict || strategy is accepted)
for each step of the curriculum, in order, with tag = EVIDENCE_MAP[step.key]:
  deciding = []                                   // newest first, at most one per question_code
  for result of ordered eligible results:
    if deciding already has result.question_code: continue
    items = matched(result, tag); if items is empty: continue
    deciding.push({ result, shown: items.every(itemShows) })
  if deciding is empty: continue                  // no evidence
  pick = deciding.find(d => d.shown) ?? deciding[0]
  out.set(step.key, { shown: pick.shown, resultId: pick.result.id, date: pick.result.assessment_date })
```

In the purity test, generalise `auditEngineSource(source, file)` to
`auditEngineSource(source, file, rules = ENGINE_RULES)` where a rule is `{ root, allowed }`
(`ENGINE_RULES = { root: 'src/lessonPlan/engine/', allowed: ALLOWED }`), and add a test
`'numeracy files are pure'` that audits `files(path.join(ROOT, 'src/numeracy'))` with
`{ root: 'src/numeracy/', allowed: new Set(['src/utils/groupMastery']) }`. The two existing guard tests
keep their default rules and expectations.

- [ ] **Step 4: Run them and see them pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyEvidence.test.js __tests__/lessonPlanEnginePurity.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Orchestrator commits: `git add test-support/numeracyCurriculumFixture.js src/numeracy/evidence.js __tests__/numeracyEvidence.test.js __tests__/lessonPlanEnginePurity.test.js && git commit -m "feat(numeracy): read maths results as step evidence"`

---

### Task 3: Known steps for one child

**Files:**
- Create: `src/numeracy/knownSteps.js`
- Test: `__tests__/numeracyKnownSteps.test.js`

**Interfaces:**
- Consumes: `computeStepEvidence`'s return type (Task 2); `buildNumeracyCurriculumFixture` (Task 2).
- Produces: `knownStepsForChild({ curriculum, ticks, evidence }): Map<stepKey, 'assessment' | 'ticked' | 'implied'>`
  — `ticks`: `Array<{ step_key: string, confirmed: boolean }>` (extra row fields from Track B's
  `getSkillMastery` are ignored); `evidence`: the child's `computeStepEvidence` map. Only known steps
  are present, in curriculum order. `'assessment'` = evidence `shown: true`; else `'ticked'` = a
  `confirmed: true` tick; else `'implied'` = a higher step in the same skill is `'assessment'` or
  `'ticked'` (§5.1–5.2). Keys not in the curriculum are ignored.

- [ ] **Step 1: Write the failing tests** (evidence maps built inline as `new Map([[key, { shown, resultId: 'r1', date: '2026-11-02' }]])`)

| Test name | Input | Assertion (`Object.fromEntries(result)`) |
|---|---|---|
| `assessment evidence wins over a tick` | evidence `add.10` shown; tick `add.10` confirmed | `{ 'add.5': 'implied', 'add.10': 'assessment' }` |
| `a confirmed tick is ticked and an unticked row is not known` | ticks `add.5` true, `count.5` false | `{ 'add.5': 'ticked' }` |
| `steps below a known step are implied` | tick `add.15` | `{ 'add.5': 'implied', 'add.10': 'implied', 'add.15': 'ticked' }` |
| `implied never replaces a step known on its own` | evidence `add.5` shown; tick `add.15` | `{ 'add.5': 'assessment', 'add.10': 'implied', 'add.15': 'ticked' }` |
| `unticking the top step brings lower steps back to their own state` | ticks `add.10` false, `add.5` true | `{ 'add.5': 'ticked' }` |
| `evidence that is not shown is not known` | evidence `count.10` `shown: false` | `{}` |
| `implied stays inside its skill` | tick `add.20` | no `count.*` keys; `add.5`, `add.10`, `add.15` implied |
| `ticks for steps this edition does not have are ignored` (Review Focus 4) | ticks `add.30` true, `multiply.5` true | `{}`; no throw |
| `entries come in curriculum order` | ticks `count_aloud.10`, `finger_flash.5`, `add.5` (that input order) | `[...result.keys()]` equals `['finger_flash.5', 'add.5', 'count_aloud.10']` |

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyKnownSteps.test.js`
Expected: FAIL, cannot find `../src/numeracy/knownSteps`.

- [ ] **Step 3: Implement `knownStepsForChild` in `src/numeracy/knownSteps.js`**

Per skill: mark own states, then walk the steps from the top down, marking every unknown step below
the highest own-known step as `'implied'`.

- [ ] **Step 4: Run them and see them pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyKnownSteps.test.js __tests__/lessonPlanEnginePurity.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Orchestrator commits: `git add src/numeracy/knownSteps.js __tests__/numeracyKnownSteps.test.js && git commit -m "feat(numeracy): union evidence, ticks and implied steps"`

---

### Task 4: The group's step in each skill

**Files:**
- Create: `src/numeracy/groupSteps.js`
- Test: `__tests__/numeracyGroupSteps.test.js`

**Interfaces:**
- Consumes: `isGroupMastered` (Task 1); `knownStepsForChild` (Task 3, used in one test to build inputs).
- Produces:
  - `childKnows(knownByChild: Map<childId, Map<stepKey, KnownState>>, childId, stepKey): boolean` — any state counts; a missing child knows nothing.
  - `groupStepState({ curriculum, presentChildIds, knownByChild }): { presentIds: string[], groupKnown: string[], groupStepBySkill: Map<skillKey, stepKey | null>, readySteps: string[] }`
    — `presentIds`: `presentChildIds` de-duplicated, first-seen order. `groupKnown`: step keys whose
    present-children count passes `isGroupMastered`, curriculum order. `groupStepBySkill`: each
    skill's first step (size order) that isn't group-known, `null` when the skill is finished.
    `readySteps`: group steps whose every `comes_after` key is group-known, curriculum order (a
    `comes_after` key missing from the curriculum counts as not known). With no present children,
    every step is not group-known (`isGroupMastered(0, 0)` is false).

- [ ] **Step 1: Write the failing tests** (`known(...keys)` → `new Map(keys.map((k) => [k, 'ticked']))`)

| Test name | Input | Assertion |
|---|---|---|
| `first lesson: only the four starting steps are ready` | present `c1..c3`, `knownByChild` empty | `readySteps` equals `['finger_flash.5', 'count.5', 'read_numbers.5', 'count_aloud.10']`; `groupStepBySkill.get('add')` is `'add.5'` |
| `fewer than 3 present: everyone must know it` | `c1, c2`; c1 knows `count.5` | `readySteps` contains `count.5`, not `compare.5`; when both know `count.5`: contains `count.10`, `compare.5`, `add.5` |
| `3 or more present: 80% or all but one` | 6 present; 5 know `count.5` | `groupKnown` contains `count.5`; with 4 of 6 it does not |
| `a child with no data counts as knowing nothing` (Review Focus 1) | present `c1..c4`; only c1, c2 in the map, both know `count.5` | `groupKnown` excludes `count.5`; no throw |
| `the same child twice counts once` (Review Focus 2) | present `['c1', 'c1', 'c2']`; c1 knows `count.5` | `presentIds` equals `['c1', 'c2']`; `groupKnown` excludes `count.5` |
| `a finished skill has no group step` | 3 present all know `finger_flash.5`, `finger_flash.10` | `groupStepBySkill.get('finger_flash')` is `null`; no `finger_flash.*` in `readySteps` |
| `out-of-order ticks with implied steps` | 3 children, each `knownStepsForChild` of ticks `count.20` and `add.10` only | `groupStepBySkill.get('add')` is `'add.15'`; `readySteps` contains `add.15` and `subtract.5`, not `add.5` |

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyGroupSteps.test.js`
Expected: FAIL, cannot find `../src/numeracy/groupSteps`.

- [ ] **Step 3: Implement `childKnows` and `groupStepState` in `src/numeracy/groupSteps.js`**

- [ ] **Step 4: Run them and see them pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyGroupSteps.test.js __tests__/lessonPlanEnginePurity.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Orchestrator commits: `git add src/numeracy/groupSteps.js __tests__/numeracyGroupSteps.test.js && git commit -m "feat(numeracy): work out each skill's group step and ready steps"`

---

### Task 5: The lesson planner

**Files:**
- Create: `src/numeracy/planLesson.js`
- Test: `__tests__/numeracyPlanLesson.test.js`

**Interfaces:**
- Consumes: `groupStepState`, `childKnows` (Task 4); `buildNumeracyCurriculumFixture({ activities })` (Task 2).
- Produces: `NUMERACY_ENGINE_VERSION = 1` and
  `planNumeracyLesson(input): Plan` from `src/numeracy/planLesson.js`, where

```js
/** input = { curriculum, presentChildIds: string[], knownByChild: Map<childId, Map<stepKey, KnownState>>,
 *            history: Array<{ date: 'YYYY-MM-DD', createdAt: string /* ISO, the session's created_at */, id: string /* session id */, taught: Array<{ slot, step_key, activity }> }>,
 *            activityCardCount: number,   // 2 in this release
 *            lessonDate: 'YYYY-MM-DD',
 *            complete: { history: boolean, ticks: boolean, evidence: boolean } }
 *  Plan = { engine_version: 1,
 *           cards: Array<{ slot: 'warm_up'|'activity', step_key, activity: string,   // activity = Activity.name
 *                          readyCount: number, presentCount: number, needHelp: string[], canHelp: string[] }>,
 *           reason: 'ok'|'no_children'|'no_ready_activity'|'incomplete_inputs',
 *           readySteps: string[] }   // groupStepState().readySteps, for Swap
 */
```

Decisions this task fixes (D relies on them):
- `cards`: the warm-up card first (at most one), then up to `activityCardCount` activity cards in rank order. Fewer ready activity skills → fewer cards.
- `reason` precedence: `no_children` (no present ids → `cards: []`, `readySteps: []`) > `incomplete_inputs` (any `complete` flag not `true`; **cards are still computed** so the EA can teach) > `no_ready_activity` (zero activity cards) > `ok`.
- Per card, over `presentIds` in order: `presentCount` = their number; `readyCount` = children who know every `comes_after` key of the card's step; `needHelp` = children who don't know the step just below the card's step in the same skill (`[]` for a skill's first step); `canHelp` = children who know the card's step.
- History entries dated after `lessonDate` are ignored; entries on `lessonDate` count.

- [ ] **Step 1: Write the failing tests**

History in the table below is shorthand: build each entry with a test helper `lesson(date, taught, { createdAt = `${date}T08:00:00.000Z`, id = `s-${date}` } = {})`.

Defaults: `base = { curriculum: fixture, presentChildIds: ['c1','c2','c3'], knownByChild: new Map(), history: [], activityCardCount: 2, lessonDate: '2026-11-05', complete: { history: true, ticks: true, evidence: true } }`, all deep-frozen.
`steps(plan)` → `plan.cards.map((c) => [c.slot, c.step_key])`. Every test also runs
`expectOnlyReady(input, plan)`: each activity card's `step_key` is in `plan.readySteps`, and the
warm-up's `step_key` is in `readySteps` or in `groupStepState(input).groupKnown` ("never suggest a
step that isn't ready"). Child maps in these tests are hand-built `'ticked'` maps.

| Test name | Input change | Assertion |
|---|---|---|
| `a first lesson: a warm-up and two activities from the starting steps` | — | `plan` matches `{ engine_version: 1, reason: 'ok', readySteps: ['finger_flash.5','count.5','read_numbers.5','count_aloud.10'] }`; `steps` = `[['warm_up','finger_flash.5'],['activity','count.5'],['activity','read_numbers.5']]`; activities `'finger_flash.5 A'`, `'count.5 A'`, `'read_numbers.5 A'`; every card `readyCount: 3, presentCount: 3, needHelp: [], canHelp: []` |
| `never-taught skills first, then the oldest, ties in curriculum order` | all 3 know `count.5`, `read_numbers.5` (ready activity skills: count, read_numbers, compare, before_after, add); (a) history 11-02 `read_numbers.10`, 11-03 `count.10`; (b) history 11-01 `before_after.5` and `add.5` (one entry), 11-02 `compare.5`, 11-03 `read_numbers.10`, 11-04 `count.10` | (a) activity steps `['compare.5', 'before_after.5']` (never taught, curriculum order); (b) `['before_after.5', 'add.5']` (oldest, tie in curriculum order) |
| `the activity done least recently comes first` | `activities: { 'finger_flash.5': [X 5, Y 5, Z 5] }`; history grows lesson by lesson (11-01 X, 11-02 Y, 11-03 Z) | warm-up activity `X` → `Y` → `Z` → `X` |
| `the warm-up uses an activity of 5 minutes or less` | `activities: { 'finger_flash.5': [{ name: 'Long', minutes: 7 }, { name: 'Short', minutes: 5 }] }` | warm-up activity `'Short'` |
| `with no ready warm-up skill, the warm-up reviews a known step` | all 3 know every `finger_flash`, `count_aloud`, `skip_count` step; history 11-03 `finger_flash.10`, 11-02 `count_aloud.100` | warm-up `step_key` `'skip_count.10s'` (never taught); with empty history → `'finger_flash.10'` |
| `a group that knows every ready activity step gets no activity card` | all 3 know all 37 steps | `reason: 'no_ready_activity'`, `readySteps: []`, `cards` is one warm-up review card |
| `a split group stays on the step half of them still need` | 6 present; c1–c3 know `count.5` | `count.5` card: `readyCount: 6, needHelp: [], canHelp: ['c1','c2','c3']`; no `count.10`, `compare.5` or `add.5` card |
| `extra help lists children still on the step below; can-help lists children who know the step` | 6 present; c1–c5 know `count.5`; c1, c2 also `count.10` | `count.10` card: `readyCount: 5, presentCount: 6, needHelp: ['c6'], canHelp: ['c1','c2']` |
| `groups smaller than 3 need everyone` | present `c1, c2`; only c1 knows `count.5` | a `count.5` card is suggested, with `canHelp: ['c1']` |
| `the activity-card count is an input` | `activityCardCount: 1` | `steps` = `[['warm_up','finger_flash.5'],['activity','count.5']]`; with `3` on a first lesson → still two activity cards |
| `no present children` | `presentChildIds: []` | `toEqual({ engine_version: 1, cards: [], reason: 'no_children', readySteps: [] })` |
| `incomplete inputs still plan, and say so` | `complete.ticks: false` | `reason: 'incomplete_inputs'`; `cards` equal the complete-input plan's cards |
| `retired steps and renamed activities in history are harmless` (Review Focus 3) | history 11-04 `[{ slot: 'activity', step_key: 'add.30', activity: 'Old game' }, { slot: 'activity', step_key: 'count.5', activity: 'Renamed' }]` | no throw; `count.5` card activity `'count.5 A'`; `read_numbers.5` ranks before `count.5` (count was taught 11-04) |
| `two lessons on one day keep their order` | `activities: { 'finger_flash.5': [X 5, Y 5] }`; history (passed shuffled) 11-03 `createdAt 09:00` Y, 11-03 `createdAt 10:00` X | warm-up activity `Y` (X is the most recent, even though X is first in file order and both share a date); the same result with the two entries in either input order |
| `history after the lesson date is ignored` | history 11-10 `count.5` `'count.5 A'` | `count.5` card activity `'count.5 A'`; activity order `['count.5','read_numbers.5']` |
| `same input, same plan` | call twice on frozen input | results `toEqual` |

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyPlanLesson.test.js`
Expected: FAIL, cannot find `../src/numeracy/planLesson`.

- [ ] **Step 3: Implement `planNumeracyLesson` in `src/numeracy/planLesson.js`**

Ranking and rotation are the parts the tests don't name:

```js
// history = entries with date <= lessonDate, in any input order
// recency key of an entry = the tuple (date, createdAt, id), compared in that order, so two lessons on
//   one day still have an order (Codex plan review, 2026-10-31)
// lastTaught(skillKey) = newest recency key of an entry with a taught item whose step_key's skill (text before
//                        the first '.') is skillKey, else null
// rank(skills) = never taught (null) first, then oldest lastTaught; ties keep curriculum order
// lastDone(stepKey, name) = newest recency key of an entry with a taught item of that step_key and activity name
// pickActivity(step, slot): candidates = step.activities, filtered to minutes <= 5 for 'warm_up'
//   (all activities if none qualify); never done first, then oldest lastDone; ties keep file order
// warm-up: top of rank(warm_up skills with a ready group step) → its group step;
//   else top of rank(warm_up skills with a group-known step) → that skill's highest group-known step;
//   else no warm-up card
// activities: first activityCardCount of rank(activity skills with a ready group step) → group steps
```

- [ ] **Step 4: Run them and see them pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyPlanLesson.test.js __tests__/lessonPlanEnginePurity.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Orchestrator commits: `git add src/numeracy/planLesson.js __tests__/numeracyPlanLesson.test.js && git commit -m "feat(numeracy): suggest a warm-up and activities for a group"`

---

### Task 6: Checks against the real content, branch gate and build log

**Gate:** Steps 1–4 need both `content/numeracy-curriculum/` (Track A) and `content/egma/` (the EGMA
branch) on `origin/main`. Check with
`git fetch origin && git ls-tree --name-only origin/main content/numeracy-curriculum/index.js content/egma/index.js`
(two lines = met). If met, rebase: `git rebase origin/main`. If not met, skip to Step 5, record the
deferral, and this task's Steps 1–4 become the first task of Track D's plan.

**Files:**
- Test: `__tests__/numeracyRealContent.test.js`
- Modify: `documentation/build-log.md` (Verification Register, newest row at the bottom)

**Interfaces:**
- Consumes: `getCurriculum()`, `listStepKeys(curriculum)` from `content/numeracy-curriculum` (Track A);
  `egmaCatalog` from `content/egma`; `EVIDENCE_MAP`, `planNumeracyLesson`, `buildNumeracyCurriculumFixture`.
- Produces: nothing new.

- [ ] **Step 1: Write the tests** `__tests__/numeracyRealContent.test.js`

```js
const real = getCurriculum();
const egmaItems = egmaCatalog.assessments.flatMap((f) => f.questions.flatMap((q) => q.items));

test('every evidence step is a step in the bundled edition', () => {
  const keys = listStepKeys(real);
  expect(Object.keys(EVIDENCE_MAP).filter((k) => !keys.includes(k))).toEqual([]);
  expect(keys.filter((k) => !(k in EVIDENCE_MAP))).toEqual(['before_after.50', 'before_after.100', 'add.15', 'subtract.15', 'skip_count.2s', 'skip_count.5s', 'skip_count.10s']);
});
test('every mapped tag appears in the EGMA pack', () => {
  const missing = Object.entries(EVIDENCE_MAP).filter(([, t]) => !egmaItems.some((i) => i.skill === t.skill && i.band === t.band));
  expect(missing).toEqual([]);
});
test('the test fixture has the bundled edition\'s steps and order', () => {
  const shape = (c) => c.skills.flatMap((s) => s.steps.map((st) => [st.key, s.slot, [...st.comes_after].sort()]));
  expect(shape(buildNumeracyCurriculumFixture())).toEqual(shape(real));
});
test('a first lesson on the bundled edition', () => {
  const plan = planNumeracyLesson({ curriculum: real, presentChildIds: ['c1', 'c2', 'c3'], knownByChild: new Map(), history: [], activityCardCount: 2, lessonDate: '2026-12-01', complete: { history: true, ticks: true, evidence: true } });
  expect(plan.readySteps).toEqual(['finger_flash.5', 'count.5', 'read_numbers.5', 'count_aloud.10']);
  expect(plan.cards.map((c) => c.step_key)).toEqual(['finger_flash.5', 'count.5', 'read_numbers.5']);
  const warm = real.skills[0].steps[0].activities.find((a) => a.name === plan.cards[0].activity);
  expect(warm.minutes).toBeLessThanOrEqual(5);
});
```

If the fixture test fails because the partner overrode an arrow in the bundled edition, update the
fixture's rules to match, not the test.

- [ ] **Step 2: Run them**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyRealContent.test.js`
Expected: PASS. A failure here is a real mismatch between Track A, EGMA and this plan: report it,
don't loosen the assertion.

- [ ] **Step 3: Run the whole unit suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand`
Expected: exit 0; note the suite and test counts for the build log.

- [ ] **Step 4: Commit the tests**

Orchestrator commits: `git add __tests__/numeracyRealContent.test.js && git commit -m "test(numeracy): check the planner against the bundled curriculum and EGMA pack"`

- [ ] **Step 5: Append build-log rows**

Verification Register rows (date, command, result, notes) for: the Task 1 literacy engine suites
(threshold extraction, behaviour unchanged), each numeracy suite's count, the purity guard covering
`src/numeracy/`, the Step 3 full-suite counts (run it here if Steps 1–4 were skipped), and either the
real-content checks or the deferral to Track D with the gate output. Note that EGMA's draft form
(`question_version` `masi-egma-en-2026-1-draft`) produces no evidence by design until EGMA freezes a
form.

- [ ] **Step 6: Commit**

Orchestrator commits: `git add documentation/build-log.md && git commit -m "docs(build-log): numeracy planner and evidence (Track C)"`
