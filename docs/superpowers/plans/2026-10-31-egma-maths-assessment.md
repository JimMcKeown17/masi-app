# Maths Assessment (Early Number Questions and Core EGMA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Numeracy EAs assess children with one English Maths assessment. Nine early number Questions gate the eight Core EGMA Questions, and every item is saved with `{skill, band}` tags. Numeracy EAs see only numeracy screens.

**Architecture:**
- A new content pack, `content/egma/`, holds one form per language, starting with English. An adapter (`src/assessment-questions/egma/`) turns that form into 17 item sets and the `masi_maths@2026.1-draft` Battery.
- Two new Question components render those item sets: a grid Question and a cards Question.
- `SequentialCapture` gains two opt-in features. **Choices** are "how they got it" buttons, and re-tapping an item opens them again. **Observation** is an end-of-task strategy step.
- The host gains:
  - one programme-subject helper, which hides literacy surfaces from numeracy EAs;
  - a "Not ready yet" skip label, materials labels and the rate in score text;
  - a maths result validator on save;
  - a data migration that makes the draft Battery the numeracy default.

**Tech Stack:** React Native (Expo), the TypeScript package under `src/assessment-questions/`, JavaScript host screens, Jest with RNTL, real-SQLite integration tests (better-sqlite3), `node:test` content verification, and Supabase CLI migrations.

**Spec:** `docs/superpowers/specs/2026-10-31-egma-maths-assessment-design.md`, approved by Jim 2026-10-31. Read it first. Its Appendix A holds every item.

## Global Constraints

- **Node 20 for every command:** prefix `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- **The worktree has no `node_modules`.** Task 0 runs `npm ci`.
- **Gates at the end of every task:** `npx jest --silent` and `npm run test:types`. Add `npm run test:content` from Task 1 on, and `npm run test:integration` from Task 9 on.
- **Leave the EGRA pack alone.** Never edit `content/egra/` or any shipped literacy Battery, item set or result. `npm run test:content` must keep the EGRA hash.
- **English only.** The Battery sets `languages: ['en']` and `fixedLanguage: 'en'`. The form id is `masi-egma-en-2026-1-draft` and the Battery identity is `masi_maths@2026.1-draft`. This plan never creates the frozen ids; that is the Freeze appendix, after Jim's release gates.
- **Stop rules:**
  - Count aloud: `consecutive_wrong{stop_at:1}`.
  - Other early number Questions: `consecutive_wrong{stop_at:3}`.
  - Every Core EGMA Question, including the timed ones: `consecutive_wrong{stop_at:4}`.
  - Keep these values in named constants in `egma/adapter.ts`. Jim may revisit the timed rule.
- **Gates, from spec §4.3:**
  - Read numbers ≥ 7 → Read big numbers.
  - Which is more ≥ 7 → Bigger number.
  - Before and after ≥ 7 → Missing number.
  - Add with counters ≥ 4 → Addition 1 and Word problems.
  - Take away ≥ 4 → Subtraction 1.
  - Addition 1 ≥ 1 → Addition 2; Subtraction 1 ≥ 1 → Subtraction 2.
  - Every rule has `unmet_label: 'Not ready yet'`.
- **Copy:**
  - The UI never says "run"; use "assessment".
  - Use plain names, never task numbers.
  - Strategy keys: `count_all | count_on | known` (per item) and `head | fingers | counters | paper | not_seen` (per task).
- **The style guard applies.** Style keys and `Text`/`Pressable` imports are allowed only in `src/assessment-questions/ui/` and `theme/`. Colours come from `theme/tokens.ts`.
- **No new dependencies.**
- **Supabase:** never run raw `supabase` from the repo root. Staging uses `scripts/sqlite-staging.cjs`. Pushing a migration needs Jim's go.
- **Build path (AGENTS.md):** Codex builds each task (`--model gpt-6.1-sol --effort high`), and Claude reviews the diff and tests before the next task. Codex can't commit, so the orchestrator stages only the task's files and commits.
- **Commits:**
  - End every commit message with the session's attribution lines.
  - Use `Refs #N`, never `Closes #N`.
- **Docs ship in this branch** (Task 14).

## Review Focus

1. **Gated out of Addition 1 means never offered Addition 2.** The child must not see Addition 2 even for one screen load. (Task 2 `chained prerequisite skips in the same pass`; Task 8 `masi_maths gates chain through the real battery`.)
2. **The strategy step after a stop card or End.** The stop card or End sheet must be gone, `onComplete` fires once, and the duration is the one frozen at the stop. (Task 5 `observation opens after StopCard save with no modal left` and `End then observation keeps the frozen duration`.)
3. **Back or Undo after a choice-marked item.** The item's strategy must be cleared, and re-marking it with a different choice saves only the new one. (Task 3 `back clears the choice`; Task 5 `back then a new choice saves only the new strategy`.)
4. **A programme read that errors or is slow.** Screens must not hang on a spinner (the Record button especially), and must fall back to today's behaviour. (Task 10 `useActiveProgrammeSubject settles on error`; Task 11 `SessionForm shows the lesson flow fallback when the subject is unknown`.)
5. **Tags must survive the round trip.** `metadata.skill/band/strategy` and `derived.strategies/correct_per_minute` must come back unchanged after save → outbox → history-pull re-store. The pull path re-stringifies JSON. (Task 9 `maths metadata survives save, outbox and history re-store`.)

---

### Task 0: Worktree setup and baseline

**Files:** none.

- [ ] **Step 1:** In `/Users/jimmckeown/Development/masi-app-egma`, run `npm ci`. Expected: exit 0.
- [ ] **Step 2:** Run `npx jest --silent`, `npm run test:types` and `npm run test:content`. Expected: all green. Record the suite and test counts for the build log.

---

### Task 1: Content pack `content/egma/`

**Files:**
- Create:
  - `content/egma/egma-assessments.json`
  - `content/egma/index.js`
  - `content/egma/index.d.ts`
  - `content/egma/verify.cjs`
  - `content/egma/README.md`
- Modify: `package.json` (`test:content`), changing it to `"node --test content/egra/verify.cjs content/egma/verify.cjs"`.

**Interfaces:**
- Produces (`index.d.ts`, all fields `readonly`):
  ```ts
  export type EgmaBand = 5 | 10 | 20 | 50 | 100 | 1000;
  export type EgmaSource = 'rti-2014-printed' | 'masi-2026';
  interface EgmaItemBase { id: string; answer: number; skill: string; band: EgmaBand; source: EgmaSource; label?: string }
  export type EgmaItem = EgmaItemBase & (
    | { kind: 'number'; value: number }
    | { kind: 'pair'; left: number; right: number }
    | { kind: 'sequence'; slots: readonly (number | null)[] }        // exactly one null
    | { kind: 'equation'; a: number; op: '+' | '-'; b: number }
    | { kind: 'counters'; a: number; op: '+' | '-'; b: number }
    | { kind: 'checkpoint'; upTo: number }
    | { kind: 'fingers'; mode: 'flash' | 'make'; shown: number; total?: 5 | 10 }
    | { kind: 'count_out'; target: number }
    | { kind: 'neighbour'; relation: 'before' | 'after'; n: number }
    | { kind: 'word_problem'; problemType: string; phrases: readonly string[] });
  export interface EgmaQuestion { questionCode: string; title: string; instructions: string; items: readonly EgmaItem[];
    practiceItems: readonly string[]; timeLimitSeconds: number | null; numberCardPage: number | null }
  export interface EgmaForm { id: string; title: string; languageCode: 'en'; languageName: string;
    questions: readonly EgmaQuestion[]; sourceNotes: readonly string[] }
  export interface EgmaCatalog { formatVersion: 1; contentVersion: string; title: string; description: string;
    sources: readonly { id: string; title: string; fileName: string; sha256: string }[]; assessments: readonly EgmaForm[] }
  export const egmaCatalog: EgmaCatalog;
  export function listEgmaAssessments(filters?: { languageCode?: string }): readonly EgmaForm[];
  export function getEgmaAssessment(id: string): EgmaForm | null;
  ```
- `index.js` mirrors `content/egra/index.js`: a static `require`, `deepFreeze`, no fallback.

**The JSON content.**
- One form, `masi-egma-en-2026-1-draft`.
- 17 questions in spec §4.2 order, with `questionCode` and `title` exactly as in that table.
- Items exactly as in spec Appendix A, with `skill` from spec §8.1 and `source` from spec §5.4.
- `timeLimitSeconds` is 60 for `egma_number_id`, `egma_addition_l1` and `egma_subtraction_l1`, and null for the rest.
- `numberCardPage` values: `maths_read_numbers` 1, `maths_which_more` 2, `egma_number_id` 3, `egma_number_discrimination` 4, `egma_missing_number` 5, `egma_addition_l1` 6, `egma_subtraction_l1` 7, `egma_addition_l2` 8, `egma_subtraction_l2` 9. All others are null.
- Item kinds: Make 5 and make 10 uses `fingers` with `mode:'make'`; Finger flash uses `fingers` with `mode:'flash'`.
- `answer` by kind:
  - `checkpoint`: `upTo`.
  - `fingers` flash: `shown`. `fingers` make: `total − shown`.
  - `count_out`: `target`.
  - `pair`: the larger of the two.
  - `neighbour`: `n ± 1`.
- `instructions`: plain English EA copy, one string per Question. It is built from the spec Appendix A "Say:" lines and the §6.3 rules. Paper and pencil goes in the instructions for Addition 2, Subtraction 2 and Word problems. Mark the instructions draft in `sourceNotes`; the partner approves them before the freeze.
- `sourceNotes` record the Word Problems 6-vs-5 discrepancy, the clock-starts-on-Start note, the timed stop-rule deviation, and the fact that Masi authored Addition and Subtraction 1 items 6–20.

- [ ] **Step 1: Write `verify.cjs`** (`node:test`, in the `content/egra/verify.cjs` style). Tests:
  - `'the bundled JSON is the pinned draft transcription'`: the SHA-256 of the file equals the pinned constant, and `listEgmaAssessments().length === 1`.
  - `'each Question has the agreed item count'`: in order, `[5,6,9,9,20,9,10,9,10,6,6,6,20,5,20,5,6]`, 161 items in total.
  - `'ids run 1..n within each Question'`.
  - `'every band is the smallest band at or above the largest number in the item'`:
    - Numbers counted: operands, shown numbers, `answer`, and `total` for `fingers` make.
    - A `checkpoint` uses `upTo`.
    - A `word_problem` uses the largest integer in its phrases and its answer.
  - `'every answer is correct'`: arithmetic, the larger of each pair, the missing term (one `null` per sequence), neighbours, and fingers.
  - `'Addition 1 follows its spec'`: no addend over 10 and no sum over 19.
  - `'Subtraction 1 is Addition 1 inverted'`: item i is `a+b` minus `a` or `b`.
  - `'printed items match the toolkit'`: the three printed Core lists and the five printed samples, compared value by value with spec Appendix A.
  - `'number card pages are 1..9, each used once'`.
  - `'unknown ids and languages return nothing'`.
  - `'content is frozen against mutation'`.
- [ ] **Step 2:** Run `node --test content/egma/verify.cjs`. It should FAIL, because the pack doesn't exist yet. Run it directly, since `test:content` doesn't include the EGMA verifier until Step 3.
- [ ] **Step 3:** Write the JSON, `index.js`, `index.d.ts` and the `package.json` script. Pin the hash last.
- [ ] **Step 4:** Run `npm run test:content`. Expected: EGRA and EGMA both pass.
- [ ] **Step 5:** Write `README.md` with sections mirroring `content/egra/README.md`:
  - draft id and freeze rule (spec §5.2);
  - data contract;
  - band rule;
  - provenance;
  - discrepancies;
  - "never edit a frozen form in place".
- [ ] **Step 6:** Commit with `feat(egma): English maths content pack (draft form)`.

---

### Task 2: Battery types, copy nouns, stop-card copy and chained gates

**Files:**
- Modify:
  - `src/assessment-questions/types/BatteryConfig.ts`
  - `src/assessment-questions/progress/captureCopy.ts`
  - `src/assessment-questions/battery/markingSentence.ts`
  - `src/assessment-questions/progress/StopCard.tsx`
  - `src/assessment-questions/battery/evaluateBatteryState.ts` (and `skipRules.ts` if the helper goes there)
- Test:
  - `battery/__tests__/evaluateBatteryState.test.ts`
  - `progress/__tests__/captureCopy.test.ts`
  - `progress/__tests__/StopCard.test.tsx` (create one if there isn't one)

**Interfaces:**
- Produces:
  ```ts
  export type MaterialItem = 'reading_card' | 'picture_cards' | 'writing_sheet' | 'number_card' | 'counters';
  export interface Materials { item: MaterialItem; side?: 'A' | 'B' | 'C' | 'D'; page?: number }
  export interface PrerequisiteRule { depends_on: string; minScore: number; on_unmet_reason: 'skipped_prerequisite_unmet'; unmet_label?: string }
  // BatteryConfig gains: numberCard?: string
  export function flatCopy(noun: 'letter' | 'word' | 'question' | 'number' | 'pair' | 'problem' | 'item', total: number): CaptureCopy
  ```
  `markingSentence` takes the same noun union.

- [ ] **Step 1: Write the failing tests.**
  - `chained prerequisite skips in the same pass`: a Battery where q2 needs q1 ≥ 1 and q3 needs q2 ≥ 1, with decided results containing only q0 (q1 depends on q0 ≥ 5, and q0 scored 0). Expect `autoSkips` codes `['q1','q2','q3']` in Battery order, with `nextQuestion` null or the next independent Question.
  - `a decided dependency still gates as before`: the existing `GATED` case is unchanged.
  - `flatCopy('number', 9).itemName(2) === 'Number 3'`, and the same for `pair`, `problem` and `item`.
  - StopCard: with `stop_at: 1`, the title is `'Amahle made a mistake. The test has stopped.'`. With `stop_at: 4` the title is unchanged: `'Amahle got 4 in a row wrong. The test has stopped.'`.
- [ ] **Step 2:** Run `npx jest src/assessment-questions/battery src/assessment-questions/progress`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - Widen the unions and add the optional fields.
  - In `evaluateBatteryState`, walk `battery.questions` in order and carry a set of codes auto-skipped *in this pass*. A prerequisite whose `depends_on` is in that set counts as unmet. `skipCauseFor` keeps its signature.
  - Add the StopCard branch for `stop_at === 1`.
- [ ] **Step 4:** Run `npx jest --silent` and `npm run test:types`. **If any existing literacy Battery test changes its expected auto-skips, stop and report to the controller. Don't edit that test.** The chain fix must not change WelaPLUS or EGRA behaviour, except by skipping in one pass what would be skipped a pass later anyway.
- [ ] **Step 5:** Commit with `feat(battery): chained prerequisites skip in one pass; maths material and copy types`.

---

### Task 3: Strategy choices in the step reducer

**Files:**
- Modify: `src/assessment-questions/progress/stepByStep.ts`
- Test: `progress/__tests__/stepByStep.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StepState = { cursor: number; decisions: Record<number, boolean>; choices: Record<number, string>;
    correctionCount: number; stopped: boolean; maxConsecutiveWrong: number };
  export type StepAction =
    | { type: 'decide'; correct: boolean; choice?: string }
    | { type: 'set'; position: number; correct: boolean; choice?: string }
    | { type: 'flip'; position: number } | { type: 'back' } | { type: 'undoStop' };
  ```
  `initStepState()` returns `choices: {}`.

- [ ] **Step 1: Write the failing tests.**
  - `decide with a choice records it`: `run(D(true,'count_on'))` gives `choices` `{0:'count_on'}`.
  - `a wrong decide records no choice`.
  - `set changes a reached item and its choice`: `run(D(false), set(0,true,'known'))` gives `decisions {0:true}`, `choices {0:'known'}` and `correctionCount 1`.
  - `set to wrong clears the choice`.
  - `set with no change is a no-op`: the same state object comes back (`toBe`).
  - `set never stops`: with `stop_at:1`, `run(D(true), set(0,false))` gives `stopped:false`.
  - `set outside [0,cursor) or while stopped is ignored` (`test.each` over -1, cursor, 1.5).
  - `back clears the choice`.
  - `undoStop clears the choice of the undone item`.
  - `flip clears the choice at that position`.
- [ ] **Step 2:** Run `npx jest src/assessment-questions/progress/__tests__/stepByStep.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. `set` recomputes `maxConsecutiveWrong` and adds 1 to `correctionCount` only when the decision or the choice changed. The back/undoStop tail deletes `choices[cursor-1]`.
- [ ] **Step 4:** Run `npx jest --silent` and `npm run test:types`. Existing reducer tests that use `toEqual` on whole states need only `choices: {}` added.
- [ ] **Step 5:** Commit with `feat(capture): per-item choices in the step reducer`.

---

### Task 4: UI primitives (decision choices, chips, observation panel, sum tile, layouts)

**Files:**
- Modify:
  - `src/assessment-questions/ui/ActionBar.tsx`
  - `ui/MarkTile.tsx`
  - `ui/PagedGrid.tsx`
  - `ui/paginate.ts`
  - `ui/index.ts`
  - `progress/captureTypes.ts`
- Create: `ui/SelectChip.tsx`, `ui/ObservationPanel.tsx`
- Test:
  - `ui/__tests__/ActionBar.test.tsx`
  - `ui/__tests__/SelectChip.test.tsx`
  - `ui/__tests__/ObservationPanel.test.tsx`
  - `ui/__tests__/MarkTile.test.tsx`
  - `ui/__tests__/paginate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // DecisionBar gains (all optional; absent = today's render, byte-for-byte):
  correctChoices?: ReadonlyArray<{ key: string; label: string }>;
  onChoose?: (key: string) => void;
  correcting?: { title: string; onCancel: () => void };
  export function SelectChip(p: { label: string; selected: boolean; onPress: () => void; testID: string; accessibilityLabel?: string }): JSX.Element
  export function ObservationPanel(p: { title: string; options: ReadonlyArray<{ key: string; label: string; exclusive?: boolean }>;
    confirmLabel: string; onConfirm: (keys: string[]) => void; testID: string }): JSX.Element
  export const THREE_BY_THREE_LAYOUT: PageLayout = { columns: 3, capacity: 9, breakAtCardRow: true };
  // TileVariant and the grid variant unions (MarkTile, CaptureBody, PagedGrid) gain 'sum'; GRID_TILE_HEIGHTS.sum = 58 (the word height); PagedGrid treats sum exactly like word (same 40 dp floor). The gloss renders on the same line after the text, muted, as "6 + 2  = 8"
  ```

- [ ] **Step 1: Write the failing tests.**
  - ActionBar:
    - `default buttons are unchanged`: the existing order test still passes.
    - `choices replace Correct with one marked button per choice, then Incorrect`: labels `['Counted from 1','Started from the first number','Just knew','Incorrect']`, each with testID `${p}-choice-${key}`, and pressing one calls `onChoose(key)`.
    - `correcting shows the title and Cancel, and hides Back, End and Skip`.
  - SelectChip: `selected chip is ink and reports selected state`, asserting `accessibilityState.selected`, the ink background and the tokens.
  - ObservationPanel:
    - `confirm is disabled until a chip is ticked`.
    - `an exclusive option clears the others and is cleared by them`.
    - `onConfirm receives keys in option order`.
  - MarkTile: `sum tile shows its answer on the same line, muted`, with height equal to `GRID_TILE_HEIGHTS.word`.
  - PagedGrid: `sum tiles use word geometry`. For the same pages, layout and viewport, a `sum` grid's tile sizes and frame height equal a `word` grid's. Word grids already fit 10 per page on the A03, so parity is the guarantee; the device gate confirms it at 360 dp.
  - paginate:
    - `THREE_BY_THREE_LAYOUT puts 9 items on one page`.
- [ ] **Step 2:** Run `npx jest src/assessment-questions/ui`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - Choice buttons are `PrimaryButton tone="marked" icon="check"`. Stack them vertically when there are more than two, and keep `Incorrect` (`tone="error"`) last.
  - SelectChip reuses ScoreChip's look, with a text label and a 48 dp minimum height.
  - ObservationPanel is a full-screen surface: `UiText heading` for the title, a wrapping chip row, and a `PrimaryButton` for confirm.
- [ ] **Step 4:** Run `npx jest --silent` and `npm run test:types`. That includes `styleGuard` and `rawHexGuard`.
- [ ] **Step 5:** Commit with `feat(ui): decision choices, select chips, observation panel, sum tiles`.

---

### Task 5: SequentialCapture: choices, re-open on tap, observation phase

**Files:**
- Modify: `src/assessment-questions/progress/SequentialCapture.tsx`
- Test: create `progress/__tests__/SequentialCapture.choices.test.tsx` and `progress/__tests__/SequentialCapture.observation.test.tsx`.

**Interfaces:**
- Consumes: Task 3's `StepAction` (`decide` with `choice`, and `set`), and Task 4's `DecisionBar` props and `ObservationPanel`.
- Produces two new optional `SequentialCapture` props:
  ```ts
  choices?: ReadonlyArray<{ key: string; label: string }>;
  observation?: { options: ReadonlyArray<{ key: string; label: string; exclusive?: boolean }> };
  ```
  - **Choices mode:**
    - A tap on a reached tile opens correcting mode for that position, with title `` `Change ${copy.itemName(p)}` ``. It never flips.
    - Choosing a choice dispatches `set(p, true, key)`; Incorrect dispatches `set(p, false)`; Cancel closes.
    - Correcting works in both active and review. **In review, `dispatch` must accept `set`** (today only `back` and `flip` are allowed, `SequentialCapture.tsx:139`). `onItemMarked` must also fire for `set`, with the new `is_correct` and `strategy` (today only `decide` and `flip`, `:158-163`).
    - Tile hint: `'. Double-tap to change'`.
    - `finish` and `onItemMarked` add `metadata.strategy = state.choices[p]` for reached correct items only.
  - **Observation:**
    - `finish(reason)` builds the base result first; the duration is frozen as it is today.
    - If `observation` is set, the reason isn't `skipped_*`, and `total_correct > 0`: store the base, set phase `'observation'`, and render only `ObservationPanel` (no Canvas, so no StopCard or End Modals). Its title is `` `How did ${childName ?? 'the child'} work these out? Tick all you saw.` `` and its confirm label is `'Save'`.
    - On confirm, emit `{...base, derived: {...base.derived, strategies: keys}}` through `finalizeResult`.
    - If `observation` is set and `total_correct === 0` (not skipped): emit at once with `strategies: []`.
    - Skipped results never carry `strategies`.
    - `onComplete` fires exactly once.

- [ ] **Step 1: Write the failing tests**, in the `SequentialCapture.review.test.tsx` style.
  - Choices:
    - `choices replace Correct and a choice is saved as strategy`.
    - `tapping a reached tile opens correcting mode; Wrong → Right saves the chosen strategy`.
    - `Right → Right changes the strategy`.
    - `Right → Incorrect drops the strategy`.
    - `back then a new choice saves only the new strategy`.
    - `correcting works in review and Finish returns after Cancel`.
    - `a review correction is saved`:
      - complete capture;
      - in review, change item 1's strategy and change item 2 from Right to Incorrect;
      - Finish;
      - the emitted items carry the replaced strategy and no strategy on item 2;
      - `derived.correction_count` is 2;
      - `onItemMarked` received both `set` payloads.
    - `without choices, tile taps still flip` (regression).
  - Observation:
    - `observation opens after review Finish and saves the ticked strategies`.
    - `observation opens after StopCard save with no modal left`: `queryByTestId('stop-card')` is null while the panel shows.
    - `End then observation keeps the frozen duration`: advance timers while the panel is open, and the saved `duration_ms` doesn't grow.
    - `timer expiry opens observation`.
    - `zero correct skips observation and saves strategies []`.
    - `a skipped Question never asks and has no strategies key`.
    - `onComplete fires once`.
    - `finalizeResult runs after strategies are set`: a `finalizeResult` that copies `derived.strategies` to `derived.seen` sees them.
- [ ] **Step 2:** Run `npx jest src/assessment-questions/progress`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement. Keep `onTapPosition` stable, using a ref for the mode, so the `renderCount` test still passes. Add `'observation'` to `Phase`.
- [ ] **Step 4:** Run `npx jest --silent` and `npm run test:types`. All existing `SequentialCapture` tests must stay green.
- [ ] **Step 5:** Commit with `feat(capture): strategy choices with re-open, and an end-of-task observation step`.

---

### Task 6: Maths strategies, rate and validator

**Files:**
- Create:
  - `src/assessment-questions/egma/strategies.ts`
  - `egma/rate.ts`
  - `egma/validateMathsResult.ts`
- Test:
  - `egma/__tests__/rate.test.ts`
  - `egma/__tests__/validateMathsResult.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // strategies.ts
  export const ADD_CHOICES = [{ key: 'count_all', label: 'Counted from 1' }, { key: 'count_on', label: 'Started from the first number' }, { key: 'known', label: 'Just knew' }] as const;
  export const TAKE_AWAY_CHOICES = [{ key: 'count_all', label: 'Counted what was left' }, { key: 'count_on', label: 'Counted back' }, { key: 'known', label: 'Just knew' }] as const;
  export const ITEM_STRATEGY_KEYS = ['count_all', 'count_on', 'known'] as const;
  export const OBSERVATION_OPTIONS = [{ key: 'head', label: 'In their head' }, { key: 'fingers', label: 'Fingers' }, { key: 'counters', label: 'Counters' },
    { key: 'paper', label: 'Paper' }, { key: 'not_seen', label: "Couldn't tell", exclusive: true }] as const;
  export const COUNTERS_QUESTION_CODES = ['maths_add_counters', 'maths_take_away_counters'] as const;
  export const CORE_ARITHMETIC_CODES = ['egma_addition_l1', 'egma_addition_l2', 'egma_subtraction_l1', 'egma_subtraction_l2', 'egma_word_problems'] as const;
  export const MATHS_BANDS = [5, 10, 20, 50, 100, 1000] as const;
  // rate.ts
  export function withRate(base: Result, durationSec: number): Result
  // validateMathsResult.ts
  export function isMathsQuestionCode(code: string): boolean   // 'maths_' or 'egma_' prefix
  export function validateMathsResult(result: unknown): ValidationVerdict
  ```

- [ ] **Step 1: Write the failing tests.**
  - `withRate`:
    - `completed early scales the rate`: 15 correct in 30000 ms gives `correct_per_minute: 30` and `seconds_remaining: 30`.
    - `timer, stop_rule and ea_ended use the raw count`: `correct_per_minute === total_correct`, `seconds_remaining === 0`.
    - `a skipped result is unchanged`.
    - `a completed result with duration 0 uses the raw count`.
    - The rate is rounded to 1 decimal place and `seconds_remaining` to an integer.
  - `validateMathsResult`:
    - A non-maths code is valid.
    - A skipped maths result with `items: []` is valid.
    - Every maths item needs `metadata.skill` (a string) and `metadata.band` (in `MATHS_BANDS`).
    - Counters Questions: a reached correct item without a valid `strategy` is invalid; a strategy on a wrong or unreached item is invalid.
    - Core arithmetic, not skipped:
      - `derived.strategies` is required;
      - `[]` only when `total_correct === 0`;
      - otherwise either `['not_seen']` or a non-empty, duplicate-free subset of `head|fingers|counters|paper`;
      - `not_seen` can't appear alongside another key.
    - Strategy keys on any other maths Question are invalid.
- [ ] **Step 2:** Run `npx jest src/assessment-questions/egma`. Expected: FAIL.
- [ ] **Step 3:** Implement. `validateMathsResult` never throws, and returns every error, like `validateResult`.
- [ ] **Step 4:** Run `npx jest --silent` and `npm run test:types`.
- [ ] **Step 5:** Commit with `feat(egma): strategy constants, rate fields and maths result validator`.

---

### Task 7: Maths Question components

**Files:**
- Create:
  - `src/assessment-questions/questions/MathsGridQuestion/{index.tsx,types.ts}`
  - `questions/MathsCardsQuestion/{index.tsx,types.ts}`
  - `src/assessment-questions/testFixtures/maths.ts` (export it from `testFixtures/index.ts`)
- Test:
  - `questions/MathsGridQuestion/__tests__/MathsGridQuestion.contract.test.tsx` and `.test.tsx`
  - `questions/MathsCardsQuestion/__tests__/MathsCardsQuestion.contract.test.tsx` and `.test.tsx`
- Modify: `contractTest/runContractTest.tsx`. Add an optional third argument `opts?: { stopRule?: StopRule; extraValidators?: Array<(r: Result) => ValidationVerdict> }`, used in addition to `validateResult(result, { stopRule })`.

**Interfaces:**
- Consumes:
  - Task 4's layouts and the `sum` variant.
  - Task 5's `choices` and `observation`.
  - Task 6's constants, `withRate` and `validateMathsResult`.
- Produces:
  ```ts
  export interface MathsCaptureItem { item_key: string; prompt: string; gloss?: string; skill: string; band: number }
  export interface MathsGridItemSet extends ItemSetMeta { kind: 'maths_grid'; layout: 'three_by_three' | 'five_by_four' | 'two_by_five';
    tile: 'number' | 'sum'; noun: 'number' | 'item'; items: MathsCaptureItem[]; stop_rule: StopRule | null; strategy_step: boolean }
  export interface MathsCardsItemSet extends ItemSetMeta { kind: 'maths_cards'; noun: 'item' | 'pair' | 'number' | 'problem';
    items: MathsCaptureItem[]; stop_rule: StopRule | null; choices: 'add' | 'take_away' | null; strategy_step: boolean }
  export function MathsGridQuestion(props: QuestionProps): JSX.Element
  export function MathsCardsQuestion(props: QuestionProps): JSX.Element
  export const FIXTURE_MATHS_GRID_TIMED_EN: MathsGridItemSet; export const FIXTURE_MATHS_CARDS_COUNTERS_EN: MathsCardsItemSet;
  export const FIXTURE_MATHS_CARDS_PLAIN_EN: MathsCardsItemSet;
  ```
- Behaviour:
  - Both Questions guard the item set (`isMathsGridItemSet` / `isMathsCardsItemSet`), with **no bundled fallback**. They render `MissingItemSet` if the set is missing or invalid.
  - Each passes `metadata: { skill, band }` on its capture items.
  - Grid layout map: `three_by_three` → `THREE_BY_THREE_LAYOUT`, `five_by_four` → `LETTER_PAGE_LAYOUT`, `two_by_five` → `WORD_PAGE_LAYOUT` (10 per page, so 20 equations are two pages; the page follows the cursor as it does for words). Variant: `tile==='sum'` → `'sum'`, otherwise `'letter'`.
  - The grid sets `finalizeResult = base => withRate(base, durationSec)` when `durationSec` is set.
  - Cards map `choices` to `ADD_CHOICES` or `TAKE_AWAY_CHOICES`.
  - Both pass `observation: { options: OBSERVATION_OPTIONS }` when `strategy_step`.
  - `copy = flatCopy(noun, n)`; `testIDPrefix` is `'maths'`.

- [ ] **Step 1: Write the failing tests.** Contract tests use `runContractTest(Component, props, { stopRule, extraValidators: [validateMathsResult] })`.
  - Grid:
    - `timed grid: End mid-way gives a contract-valid result with rate fields`.
    - `timed grid: all items before the timer gives completed with a scaled rate`.
    - `stop at 4 on a timed grid then the strategy step saves`.
    - `skip path is contract-valid`.
    - `sum tiles show the answer`.
    - `items carry skill and band`.
  - Cards:
    - `counters: each choice saves its strategy`.
    - `counters: re-open changes a strategy`.
    - `plain cards show prompt and gloss`.
    - `stop at 3`.
    - `count aloud stops at the first mistake with the one-mistake copy`.
    - `invalid item set shows MissingItemSet`.
- [ ] **Step 2:** Run `npx jest src/assessment-questions/questions/Maths`. Expected: FAIL.
- [ ] **Step 3:** Implement the components, the types and the fixtures. Fixtures are small: 3–5 items each.
- [ ] **Step 4:** Run `npx jest --silent` and `npm run test:types`.
- [ ] **Step 5:** Commit with `feat(egma): maths grid and cards Questions`.

---

### Task 8: EGMA adapter, the draft Battery and registration

**Files:**
- Create:
  - `src/assessment-questions/egma/adapter.ts`
  - `egma/index.ts`
- Modify:
  - `battery/registry.ts` (add the batteries to `BATTERIES`)
  - `battery/bundledItemSets.ts` (append `?? egmaItemSetFor(...)`)
  - `battery/questionComponents.ts` (17 entries)
  - `src/assessment-questions/index.ts` (`export * from './egma'`, plus the two Questions and their types)
  - `__tests__/oneTerminalCallback.test.tsx` (add the maths cases)
- Test:
  - `egma/__tests__/adapter.test.ts`
  - `egma/__tests__/capture.test.tsx`
  - `battery/__tests__/registry.test.ts`
  - `battery/__tests__/questionComponents.test.ts` (a new test walking the maths Battery)

**Interfaces:**
- Consumes: Task 1's `EgmaForm`, Task 7's item-set types, and Task 2's types.
- Produces:
  ```ts
  export type MathsQuestionCode = 'maths_count_aloud' | 'maths_quick_see' | 'maths_count_out' | 'maths_read_numbers' | 'egma_number_id'
    | 'maths_which_more' | 'egma_number_discrimination' | 'maths_neighbours' | 'egma_missing_number' | 'maths_add_counters'
    | 'maths_take_away_counters' | 'maths_make_five_ten' | 'egma_addition_l1' | 'egma_addition_l2' | 'egma_subtraction_l1'
    | 'egma_subtraction_l2' | 'egma_word_problems';
  export const EARLY_STOP_AT = 3; export const CORE_STOP_AT = 4; export const COUNT_ALOUD_STOP_AT = 1;
  export const MATHS_BATTERY_CODE = 'masi_maths';
  export function adaptEgmaForm(form: EgmaForm): { form: EgmaForm; battery: BatteryConfig; itemSets: Record<MathsQuestionCode, MathsGridItemSet | MathsCardsItemSet> }
  export const EGMA_FORMS: readonly EgmaForm[];
  export const MASI_MATHS_BATTERIES: readonly BatteryConfig[];       // [masi_maths@2026.1-draft]
  export const MASI_MATHS_2026_1_DRAFT: BatteryConfig;
  export function egmaItemSetFor(questionCode: string, questionVersion: string, language: string): MathsGridItemSet | MathsCardsItemSet | null
  export const MATHS_QUESTION_CODES: readonly MathsQuestionCode[];
  ```
- **Display mapping** (prompt / gloss):

  | Kind | Prompt | Gloss |
  |---|---|---|
  | `number` | the numeral | none |
  | `pair` | `` `${left}   ${right}` `` | larger |
  | `sequence` | slots joined by two spaces, with `__` for the empty slot | answer |
  | `equation` / `counters` | `` `${a} + ${b}` `` or `` `${a} − ${b}` `` (U+2212) | answer |
  | `checkpoint` | `` `Counts to ${upTo}` `` | none |
  | `fingers` flash | `` `${shown} fingers` `` | answer |
  | `fingers` make | `` `${shown} up` `` | `` `${answer} down` `` |
  | `count_out` | `` `Give ${target}` `` | none |
  | `neighbour` | `` `${relation} ${n}` `` | answer |
  | `word_problem` | phrases joined with `'\n(pause)\n'` | answer |

  An item's `label`, when the pack has one, overrides the prompt.
- **Body per Question:**
  - Grid: Read numbers (`three_by_three`, `number`), Read big numbers (`five_by_four`, `number`), Addition 1 and Subtraction 1 (`two_by_five`, `sum`).
  - Cards: everything else.
  - `choices`: `'add'` for Add with counters, `'take_away'` for Take away with counters.
  - `strategy_step: true` for `CORE_ARITHMETIC_CODES` only.
- **Battery:**
  - `{ battery_code:'masi_maths', battery_version:'2026.1-draft', title:'Maths assessment', aboutMinutes: 20, languages:['en'], fixedLanguage:'en', numberCard:'Number Card 2026.1' }`.
  - Questions in spec §4.2 order, with `question_version = form.id`.
  - `durationSec` 60 on the three timed Questions.
  - Materials: `{item:'number_card', page}` where there is a page; `{item:'counters'}` for count out, add, take away and word problems; otherwise null.
  - `instructions: { en: question.instructions + practice text }`, using EGRA's "Practice first (not scored): …" form.
  - `prerequisites`: exactly as in Global Constraints.
  - The adapter throws `TypeError('<form.id>: <message>')` on a bad form.

- [ ] **Step 1: Write the failing tests.**
  - Adapter:
    - `the draft form adapts to 17 item sets matching the pack exactly`: order, counts, `item_set_id` `` `${code}@masi-egma-en-2026-1-draft.en` ``, and every item's `skill` and `band`.
    - `the battery matches the spec`: a `toEqual` on codes, titles, durations, materials and prerequisites.
    - `stop rules use the named constants`.
    - `display mapping` (`test.each` over one item of each kind).
    - `a bad form throws with its id`: non-sequential ids, or a sequence with two nulls.
  - Registry:
    - `batteryFor('masi_maths','2026.1-draft')` is `MASI_MATHS_2026_1_DRAFT`, and so is `batteryForNewRun`.
    - For every question, `bundledItemSetFor(code, version, 'en')` is `egmaItemSetFor(...)`, and it is null for `'xh'`.
    - `validateResult(skippedResult(q,'en','skipped_prerequisite_unmet')).valid`, and `validateMathsResult` of the same result is valid.
  - `questionComponents`: every maths question code maps to `MathsGridQuestion` or `MathsCardsQuestion` per the body table.
  - Capture:
    - `every maths Question renders its registered component and saves a valid result`: `test.each` over all 17, Start then End. Both validators valid, and every item has `skill` and `band`.
    - `masi_maths gates chain through the real battery`: decided `maths_add_counters` score 3 means `autoSkips` contains `egma_addition_l1`, `egma_addition_l2` and `egma_word_problems` in one pass.
  - `oneTerminalCallback`: add the maths cases.
- [ ] **Step 2:** Run `npx jest src/assessment-questions`. Expected: FAIL.
- [ ] **Step 3:** Implement. Check that `export * from './egma'` adds no name that `./egra` already exports.
- [ ] **Step 4:** Run `npx jest --silent`, `npm run test:types` and `npm run test:content`.
- [ ] **Step 5:** Commit with `feat(egma): adapter, masi_maths 2026.1-draft battery and registration`.

---

### Task 9: Host Battery screens, save validation and the real-SQLite round trip

**Files:**
- Modify:
  - `src/utils/batteryRun.js`
  - `src/components/assessments/MaterialsBlock.js`
  - `src/db/repositories/assessmentsRepository.js` (call `validateMathsResult` beside `validateResult`, `:126`)
  - `jest.integration.config.js` (add the new file)
- Create: `__tests__/mathsRun.integration.test.js`
- Test:
  - `__tests__/batteryRun.test.js`
  - `__tests__/BatteryQuestionScreen.test.js`
  - `__tests__/BatteryRunSummaryScreen.test.js`
  - `__tests__/assessmentsRepository.test.js`

**Interfaces:**
- Consumes: Task 8's `MASI_MATHS_2026_1_DRAFT`, `bundledItemSetFor` and `validateMathsResult`.
- Behaviour:
  - `MATERIAL_LABELS` gains `number_card: 'Number Card'` and `counters: 'Counters'`.
  - `materialsLine`:
    - `number_card`: footer `` `${battery.numberCard} · ${LANG} · page ${page}` ``.
    - `counters`: `{ item: 'Counters', side: null, footer: null }`.
  - `MaterialsBlock` omits the Footer line when `footer` is null.
  - Skip label: when `skipCause.kind === 'prerequisite'` and `battery.prerequisites[code].unmet_label` is set, use it. Keep the `oral_reading` special case and the "Not reached" fallback.
  - `scoreText` appends `` ` · ${Math.round(derived.correct_per_minute)} per minute` `` when `correct_per_minute` is a number.
  - **Validation failures are non-retryable.** `saveQuestionResult` throws an error with `code: 'INVALID_QUESTION_RESULT'` when `validateResult` *or* `validateMathsResult` fails, keeping the `'Invalid Question result: …'` message. `BatteryQuestionScreen`'s `FATAL_CODES` gains `'INVALID_QUESTION_RESULT'`. The existing fatal path then takes over: nothing is saved, the EA leaves the Question, and the overview offers it again as next. The EA never retries the same invalid result.

- [ ] **Step 1: Write the failing tests.**
  - `batteryRun`:
    - `a gated-out maths Question reads Not ready yet`.
    - `a timed maths result shows the rate`: `'14 / 20 · 18 per minute'`.
    - `two equal raw scores with different early finishes show different rates`.
    - `number card materials line names the page`.
    - `counters have no footer`.
    - `literacy rows are unchanged`: the existing `'Not reached'` and `'34 / 60'` tests stay.
  - `BatteryQuestionScreen`: `every maths Question reaches capture with its exact item set`, a `test.each` over `MASI_MATHS_2026_1_DRAFT.questions`, in the EGRA pattern at `:24-38`.
  - `BatteryRunSummaryScreen`: `the summary row reads the rate`, `getByRole('text', { name: '5. Read big numbers, Done, 14 / 20 · 18 per minute' })`.
  - `assessmentsRepository`: `a maths result without strategies is refused before any write`. Expect the error `code` `'INVALID_QUESTION_RESULT'`, and no row or outbox entry written.
  - `BatteryQuestionScreen`: `an invalid result is fatal, not retried`. Make the save reject with `INVALID_QUESTION_RESULT`. There is no "try again" control, `saveQuestionResult` is called once, and the EA is returned to the overview, in the same way the existing `QUESTION_ALREADY_DECIDED` test asserts.
  - `mathsRun.integration.test.js` (real SQLite, modelled on `egraRun.integration.test.js`; set the fixture's programme code to `numeracy`):
    - `a full maths assessment saves, gates and finalizes`: build each result from its real item set, including a counters result with strategies, a Core arithmetic result with `derived.strategies`, a timed result with the rate, and gated skips from `evaluateBatteryState`. Then `finalizeRun`. Count the outbox by `table_name`: one `battery_runs` header and one `assessments` family per Question. Apply `assertSubmitShape` only to the `assessments` payloads, as `egraRun.integration.test.js:39-42` does. Check the `battery_runs` payload separately for `battery_code: 'masi_maths'` and `battery_version: '2026.1-draft'`.
    - `maths metadata survives save, outbox and history re-store`:
      - read the stored items and check `metadata.skill`, `band` and `strategy` and `derived.strategies` / `correct_per_minute` exactly;
      - **re-store into a second database.** Decode each `assessments` outbox payload into the history-page row shape (the keys in contract map `:238`). Feed it to `saveHistoryPage` on a **second** `createMigratedDatabase`, seeded with the same child, programme and delivery. Same-database re-feeding is a no-op (`assessmentsRepository.js:313-325`), so it would prove nothing.
      - Then assert: `inserted > 0`, `present === 0`, the rows are `synced`, no outbox rows exist in the second database, and the re-read `metadata` and `derived` deep-equal the originals.
- [ ] **Step 2:** Run `npx jest __tests__/batteryRun.test.js __tests__/BatteryQuestionScreen.test.js __tests__/BatteryRunSummaryScreen.test.js __tests__/assessmentsRepository.test.js`, then `npm run test:integration -- mathsRun`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx jest --silent`, `npm run test:types` and `npm run test:integration`.
- [ ] **Step 5:** Commit with `feat(assessments): maths skip label, materials, rate and save validation`.

---

### Task 10: Programme subject, and the Assessments, Home and Children gating

**Files:**
- Create: `src/utils/programmeSubject.js`, `src/hooks/useActiveProgrammeSubject.js`
- Modify:
  - `src/screens/main/AssessmentsScreen.js`
  - `src/screens/main/HomeScreen.js` (assessment coverage and the retained lesson-draft card, `:90-100`, `:143-155`)
  - `src/screens/main/ChildrenListScreen.js`
- Test:
  - create `__tests__/programmeSubject.test.js` and `__tests__/useActiveProgrammeSubject.test.js`
  - modify `__tests__/AssessmentsScreen.test.js`, `__tests__/HomeScreen.test.js` and `__tests__/ChildrenListScreen.test.js`

**Interfaces:**
- Produces:
  ```js
  export const PROGRAMME_SUBJECTS = Object.freeze({ numeracy: 'maths' });
  export function programmeSubject(programme) // → 'maths' | 'reading' | null (null when programme is null/undefined)
  export function isMathsProgramme(programme) // → boolean
  export function useActiveProgrammeSubject() // → { subject: 'maths'|'reading'|null, isMaths: boolean, loading: boolean }
  ```
- The hook calls `getActiveProgrammeGate({ handle, userId })` in `useFocusEffect`, with the `handle.isCurrent()` publish guard from `AssessmentsScreen.js:52`. On error it publishes `{ subject: null, isMaths: false, loading: false }`.
- No other file compares programme codes.

- [ ] **Step 1: Write the failing tests.**
  - `programmeSubject`:
    - `numeracy → maths`.
    - `literacy, zazi_izandi, unknown code → reading`.
    - `null → null`.
  - `useActiveProgrammeSubject`:
    - `resolves the subject`.
    - `useActiveProgrammeSubject settles on error`: `loading` becomes false and `subject` is null.
    - `a stale handle never publishes`.
  - `AssessmentsScreen`:
    - `a numeracy EA sees the Maths card and no stats, Full EGRA or quick assessments`: the headers are exactly `['Maths assessment']`, and `getLetterResults` is never called.
    - `a numeracy EA on a build without the Battery sees only the update note`.
    - `literacy is unchanged`: the existing header-order and `SurfaceCard`-count tests pass unchanged.
    - Rewrite the `:230-248` table so its cases are literacy programmes.
  - `HomeScreen`:
    - `a numeracy EA is never told children need assessing`: no `'children to assess'`, and `getAssessmentCountsSince` is not called.
    - `a retained literacy lesson draft is not offered to a numeracy EA`:
      - the EA changed programme with a `lessonDrafts.getActive` draft still on the phone;
      - no "Lesson in progress" card appears, so there is no route to Lesson;
      - the draft isn't deleted.
    - The literacy case still shows the resume card.
    - The literacy case still shows `'2 children to assess'`.
  - `ChildrenListScreen`:
    - `a numeracy EA sees no Unassessed stat`: `getLetterResults` is not called.
    - The literacy case is unchanged.
- [ ] **Step 2:** Run `npx jest __tests__/programmeSubject.test.js __tests__/useActiveProgrammeSubject.test.js __tests__/AssessmentsScreen.test.js __tests__/HomeScreen.test.js __tests__/ChildrenListScreen.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. AssessmentsScreen and Home reuse their existing gate result through `isMathsProgramme(gate.programme)`; ChildrenList uses the hook. Skip the letter loads, not just their render.
- [ ] **Step 4:** Run `npx jest --silent` and `npm run test:types`.
- [ ] **Step 5:** Commit with `feat(numeracy): numeracy EAs see no literacy assessment surfaces`.

---

### Task 11: Class rows, Edit Child, Insights and Record

**Files:**
- Modify:
  - `src/components/children/ClassChildRow.js`
  - `src/screens/children/ClassDetailScreen.js`
  - `src/screens/children/EditChildScreen.js`
  - `src/screens/main/InsightsScreen.js`
  - `src/screens/sessions/SessionFormScreen.js`
- Test:
  - `__tests__/ClassChildRow.test.js`
  - `__tests__/ClassDetailScreen.test.js`
  - `__tests__/EditChildScreen.test.js`
  - `__tests__/InsightsScreen.test.js`
  - `__tests__/SessionFormScreen.test.js`

**Interfaces:**
- Consumes: Task 10's `useActiveProgrammeSubject`.
- Behaviour:
  - `ClassChildRow`: `onPressLetterTracker` and `onPressResults` (the real prop, `ClassChildRow.js:12, 20`) become optional. The tracker icon renders only when `onPressLetterTracker` is passed, and the name is a plain, non-pressable label when `onPressResults` is absent. Update the existing literacy fixtures (`ClassChildRow.test.js:47-55`) to pass both callbacks explicitly.
  - `ClassDetailScreen` omits both for maths.
  - `EditChildScreen`: for maths, hide the reading-level field, helper and picker. Save leaves `reading_level` exactly as loaded.
  - `InsightsScreen`: rows gain `literacyOnly: true` for "Letter mastery" and "Assessment scores", and maths filters them out.
  - `SessionFormScreen`:
    - While `loading`, show the existing loading state; if there is none, a centred `ActivityIndicator`.
    - Otherwise the lesson flow appears only when `jobTitle === LITERACY_COACH && !isMaths`.
    - Everyone else gets today's "Session forms for {name} are coming soon." For maths, `{name}` is "Numeracy", whatever the job title.

- [ ] **Step 1: Write the failing tests.**
  - ClassChildRow: `without tracker or results handlers the row has 2 buttons and a plain name`. The existing 4-button test is kept.
  - ClassDetail:
    - `numeracy rows have no letter tracker and no results tap`.
    - The literacy test at `:221-230` is unchanged.
  - EditChild:
    - `numeracy hides reading level`.
    - `saving keeps the stored reading level`: the update payload `reading_level` equals the loaded value.
  - Insights:
    - `numeracy shows only Session count`.
    - The literacy test is unchanged.
  - SessionForm:
    - `a literacy coach in numeracy gets coming soon`.
    - `SessionForm shows the lesson flow fallback when the subject is unknown`: `subject null` and `loading false` give the lesson picker stub for a literacy coach, which is today's behaviour.
    - `loading shows a spinner, not the picker`.
- [ ] **Step 2:** Run the five test files. Expected: FAIL.
- [ ] **Step 3:** Implement. Add the hook mock to each test's setup.
- [ ] **Step 4:** Run `npx jest --silent` and `npm run test:types`.
- [ ] **Step 5:** Commit with `feat(numeracy): numeracy EAs see only numeracy screens`.

---

### Task 12: Number Card generator

**Files:**
- Create: `scripts/number-card.cjs`, `__tests__/numberCard.test.js`
- Output: `design/number-card/number-card-masi-egma-en-2026-1-draft.html` (committed)

**Interfaces:**
- Produces:
  ```js
  module.exports = { renderNumberCard(form) /* → HTML string */ };
  // CLI: node scripts/number-card.cjs <formId> writes design/number-card/number-card-<formId>.html
  ```
- Layout:
  - A4 pages, one per `numberCardPage`, each `<section data-page="N">`.
  - Large numerals, in the toolkit's layouts: 3 × 3, pairs side by side, sequences with an empty box, 5 × 4, and equations in 2 columns.
  - Only a small page number as heading.
  - Print CSS: `page-break-after: always`.

- [ ] **Step 1: Write the failing tests.**
  - `one section per number card page, 1..9 in order`.
  - `each section shows every item numeral of its Question`.
  - `sections contain only numerals, + − and blank boxes`: the section text matches `/^[0-9+−\s□]*$/` once the page number is removed.
  - `the committed HTML matches the generator`: re-render and compare with the file.
- [ ] **Step 2:** Run `npx jest __tests__/numberCard.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. Run the CLI and commit the output.
- [ ] **Step 4:** Run `npx jest --silent`.
- [ ] **Step 5:** Commit with `feat(egma): Number Card generated from the pack`.

---

### Task 13: Numeracy default migration (draft)

**Files:**
- Create:
  - `supabase/migrations/20261031120000_numeracy_maths_draft_default.sql`
  - `__tests__/mathsDefaultMigration.test.js`

**Interfaces:**
- The migration, exactly:
  ```sql
  SET lock_timeout = '10s';
  SET statement_timeout = '60s';

  -- 2026-10-31 maths spec §7.1: numeracy EAs get the draft Maths assessment; preserve any Head Office choice.
  update public.programmes set default_battery_code = 'masi_maths', default_battery_version = '2026.1-draft' where code = 'numeracy' and default_battery_code is null;

  RESET statement_timeout;
  RESET lock_timeout;
  ```

- [ ] **Step 1: Write the failing test.** `the numeracy default migration sets only an unset numeracy default`: strip the comments, split on `;`, and expect the five statements exactly, in the `welaPlus2026Run.integration.test.js:19-29` style. It is a unit test, like `letterOrderMigration.test.js`.
- [ ] **Step 2:** Run `npx jest __tests__/mathsDefaultMigration.test.js`. Expected: FAIL.
- [ ] **Step 3:** Write the migration. **Don't apply it.** Applying it is Task 15, after Jim's go.
- [ ] **Step 4:** Run `npx jest --silent`. If Postgres is available locally, also run `npm run verify:assessment-results:postgres`; otherwise CI runs it. The migration must be a no-op when the numeracy row is missing or already has a default.
- [ ] **Step 5:** Commit with `feat(numeracy): draft maths battery as the numeracy default (migration, not applied)`.

---

### Task 14: Documentation

**Files:**
- Modify:
  - `CONTEXT.md`
  - `documentation/rls-sync-contract-map.md`
  - `docs/agent-context/wela-assessment-component-build.md`
  - `documentation/ROADMAP.md`
  - `documentation/build-log.md`
  - `docs/superpowers/specs/2026-10-31-egma-maths-assessment-design.md`
- Create: `docs/adr/0012-maths-assessment-gates-core-egma.md`

- [ ] **Step 1: `CONTEXT.md`.**
  - Add glossary entries (`**Term**:`, a paragraph, then an `_Avoid_:` line): **Maths Battery**, **early number Question**, **Core EGMA Question**, **Number Card**, **band**, **strategy observation**.
  - Append a `**2026-10-31:**` clause to the one-Battery-per-Programme entry (`:396`).
  - Amend Full EGRA (`:250`) to say it is offered to literacy EAs only.
  - Add the rule "numeracy EAs see only numeracy screens", naming `programmeSubject`.
- [ ] **Step 2: Contract map.** After `:281`, add a subsection, "Maths Question metadata and derived keys". It lists the keys and allowed values from spec §8.2. The server validates only that they are objects; the phone enforces the values with `validateMathsResult`.
- [ ] **Step 3: ADR 0012**, in 0011's format:
  - Context, and a Decision section that covers: gating Core EGMA behind early number Questions, counting gated-out tasks as 0 in evaluation, the §6.4 deviations (with stop at 4 "accepted for now", per Jim), fine-grained skill tags, and draft and frozen identities.
  - Consequences.
  - Considered alternatives: Core EGMA alone, a re-levelled EGMA, and a split assessment.
- [ ] **Step 4: Agent context.** Update `wela-assessment-component-build.md`'s dated status paragraph and `:24` to say the package now covers numeracy (EGMA).
- [ ] **Step 5: ROADMAP.** Under §7, add two items:
  - Maths assessment release gates and freeze (spec §10, the Freeze appendix below).
  - Later maths work: isiXhosa form, alternate Core form, maths coverage and stats, maths Child Results, and revisiting the timed stop rule.
- [ ] **Step 6: Spec fixes.**
  - §6.2 item 3: already updated in planning (plain labels, per Jim's plain-words rule). Check it matches `strategies.ts`.
  - §6.2 item 7: drop the `AssessmentResultsScreen` "Stopped" line, which maths never reaches.
  - §4.1: drop the about line. The card shows the existing "All 17 Questions · English · about 20 min".
- [ ] **Step 7: Build log.** Add a `###` entry for each task's verification commands and counts, plus Decision Register rows: the programme-code subject, the chained gates, one form per language, and the materials simplification.
- [ ] **Step 8:** Commit with `docs: maths assessment terms, contract keys, ADR 0012, roadmap and build log`.

---

### Task 15: Controller gate (Claude; staging and device steps need Jim's go)

- [ ] **Step 1:** Run the full gates in the worktree: `npx jest --silent`, `npm run test:types`, `npm run test:content` and `npm run test:integration`. Record the counts.
- [ ] **Step 2:** Run a whole-branch Codex adversarial review: `--model gpt-6-astra`, `--base origin/main`, a fresh thread. First check `git log --oneline origin/main..HEAD`. Fix findings on merit, then judge whether another round is worth running.
- [ ] **Step 3:** Run the staging precondition, read-only, and confirm `project_ref=segygjzpujphwvrubusm`:
  ```bash
  npm run sqlite:staging:query -- "select count(*) from staff_programme_assignments spa join programmes p on p.id = spa.programme_id where p.code = 'numeracy' and spa.ended_at is null;"
  ```
  - If any of those assignments belongs to a field EA, stop and ask Jim.
- [ ] **Step 4:** With Jim's go, run `npm run sqlite:staging:dry-run`, then `npm run sqlite:staging:push`. Verify read-only that the numeracy row has `masi_maths / 2026.1-draft`.
- [ ] **Step 5:** With Jim's go, make an EAS Android preview build and run the A03 device check (spec §10 gate 4) at default text size and 360 dp:
  - every Question;
  - the answer-key tiles;
  - the choice bar and its re-open;
  - the strategy step after a stop and after End;
  - a "Not ready yet" skip;
  - the count-aloud stop;
  - the rate badge's width;
  - save and sync;
  - one numeracy EA walk through Home, Children, a class, Edit Child, Insights and Record, showing no literacy surfaces;
  - one literacy EA, unchanged.
  Also do a timed pass with real counters and the printed Number Card. Then run a read-only staging check of the stored item metadata.
- [ ] **Step 6:** Update the build log. Merge waits for Jim.

---

## Appendix: Freeze (not part of this build; run after Jim confirms the spec §10 gates 1–3)

1. Rename the form id to `masi-egma-en-2026-1` and update the pinned hash in `verify.cjs`. The draft form stays in the pack under its own id.
2. Add `masi_maths@2026.1` (frozen form), and keep `@2026.1-draft` registered.
3. Add `['masi_maths@2026.1-draft', 'masi_maths@2026.1']` to `SUPERSEDED_VERSIONS`.
4. Write the second migration, which sets the numeracy default to `2026.1` where it is `2026.1-draft`.
5. Write the spec §12 freeze upgrade tests: draft resume stays on the draft identity, no draft score gates a frozen Question, a new assessment starts on `2026.1`, and a draft-only build shows "Update the app".
6. Record the build-log entry with the partner approval and the English copy check.
