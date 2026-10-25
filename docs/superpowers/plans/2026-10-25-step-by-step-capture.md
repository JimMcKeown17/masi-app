# Step-by-step marking for every Question — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution in this repo (standing rule):** Codex builds each task (`--model gpt-6.1-sol --effort high`). Claude reviews the diff, runs the gates and commits. Codex cannot commit, so every "Commit" step is Claude's. Adversarial reviews use `--model gpt-6-astra`.

**Goal:** Every Question in WelaPLUS and Full EGRA except the Story Writing rubric is marked one way: a ring on the current item, **Correct** / **Incorrect** / **Back**, tap-to-flip, a review step before **Finish**, and one "End this question?" sheet.

**Architecture:** `SequentialCapture` becomes the one capture engine. It owns the reducer, the clock, the phases (intro → active → review → finished), the decision bar, the stop card, the end sheet, the flip notice and the base `Result`. Each Question supplies only data: its items (prompt, shown text, accessible label, gloss or caption, extra item metadata), a body description (`grid`, `cards` or `groups`), its copy (noun, position line, item name) and an optional `finalizeResult` that adds its own derived fields. There is one shared story-questions screen for WelaPLUS Q2 and EGRA story questions. The flowing passage is the `groups` body without cards, so it needs no fourth renderer.

**Tech Stack:** React Native / Expo SDK 54, TypeScript inside `src/assessment-questions/` (the in-place OSS package; it must not import host code), Jest with React Native Testing Library, the host app in JavaScript.

**Spec:** `docs/superpowers/specs/2026-10-25-step-by-step-capture-design.md` (approved by Jim 2026-10-25). Mockups: `design/mockups-2026-10-step-by-step/step-by-step.html`. Code map: `docs/superpowers/specs/2026-10-25-step-by-step-capture-code-map.md`.

## Global Constraints

- **Order:** start after PR #106 (`fix/egra-story-last-word`, the other EGRA session's last-word fix) merges to `main`, then rebase this branch onto `main`. If it is still open, Tasks 1–10 may proceed, but the branch must rebase onto it before Task 11, which rewrites the passage and retires the last-word sheet that the fix touches.
- **Test commands:**
  - Jest needs Node 20: `JEST="env PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest"`.
  - Types: `npm run test:types`.
  - Every task ends with the full `$JEST` run and `npm run test:types`, both green, before its commit.
- **RED means RED:** every new test must fail against the code before the task's implementation step, and the run must show that.
- **Package boundary:** nothing under `src/assessment-questions/` imports host code (`__tests__/boundary.test.ts`). The flip notice is a package component, not the host toast.
- **Frozen:** 60 s timers, `Countdown`, `progress/clock.ts`, the deadline guard, paging maths (`ui/paginate.ts` `paginate`), tile sizes, Bold Red tokens, `SkipReasonPicker` and `battery/skippedResult.ts`. The Story Writing rubric (`StoryWritingRubricQuestion`) and `NullQuestion` are untouched.
- **Clock:** the clock rules come from today's engine (`SequentialCapture.tsx:57-66,104-154`). The only new rules are:
  - entering review freezes the clock at the last mark;
  - Back from review resumes it and moves the start by the time spent in review, the same way Undo does today.
- **Stops:** a stop is evaluated only on `decide`. A flip never stops a test. The validator's `stop_rule` checks (`contractTest/validateResult.ts:145-176`) do not change.
- **Exact copy** (spec §3, §4, §6.3; mockups 2–8):
  - Marking sentence: `Mark each ${noun} Correct or Incorrect. The black ring shows which ${noun} you're on.`
  - Review line: **`All ${N} marked`**` · ${C} correct. Tap any ${noun} to change it.`
  - End sheet:
    - title `End this question?` (or `End this test?`);
    - message `${M} marked. The ${U} not marked won't count towards the score.`;
    - confirm **End question** (or **End test**), danger tone;
    - cancel **Keep marking**.
  - End link: **End question** inside a Battery and in the gallery; **End test** on the standalone quick tests.
  - Flip notice: `${ItemName} changed to Correct|Incorrect`, shown for 3000 ms and announced to screen readers.
  - Marked tile label: `${label}, correct. Double-tap to change to incorrect` (or the reverse). Current tile: `${label}, current`. Not reached: `${label}, not reached`.
  - Q6 stop copy: `The test stops by itself after 10 wrong in a row`.
  - EGRA story questions use **Incorrect**, never "Wrong".
- **Nouns and position lines** (spec §12.6, the builder's proposal; Jim sees them on the device gate):

  | Question | noun | position line | item name (flip notice) |
  |---|---|---|---|
  | Letter sounds (Q1, EGRA letters, quick test) | letter | Letter **12 of 60** | Letter 12 |
  | Story questions (Q2, EGRA) | question | Question **2 of 5** | Question 2 |
  | First sounds (Q3), Blending (Q4) | word | Word **2 of 10** | Word 2 |
  | Letter writing (Q5) | letter | Letter **3 of 26** | Letter 3 |
  | Reading words (Q6, EGRA words, quick test) | word | Word **6 of 40** | Word 6 |
  | Reading sentences (Q7), Writing sentences (Q10) | word | Sentence **2** · word **2 of 3** | Word 2 of sentence 2 |
  | Passage (Q8, EGRA story) | word | Word **6 of 42** | Word 6 |
  | Writing words (Q9) | letter | Word **2** · letter **3 of 4** | Letter 3 of word 2 |

- **Result meaning** (spec §7):
  - `total_attempted` = reached.
  - `percent` = correct / reached.
  - `last_attempted_position` = cursor − 1, or −1 if nothing is marked.
  - `tracks_progress`, `capture_mode: 'sequential'`, `correction_count` and `max_consecutive_wrong` are always written.
  - Every item is emitted with `metadata.reached`.
  - A skip saves `items: []` as today.
- **Identity is the position:** item keys and words repeat in shipped sets. Every new tile `testID` is `tile-${position}`, scoped inside the body `testID`. No testID or label may rely on `item_key` being unique.
- **Docs ship in this branch** (spec §10). Bottom sheets, not dialogs. npm only, no new dependencies.

## Review Focus

These input classes are the most likely to bite an EA but are not obviously covered by the spec's own test list. Each line names the owning task's test.

1. **Rapid double taps on the last item.** Two queued **Correct** presses decide once and open review; they never save or decide past the end. (Task 3, `rapid double Correct on the last item decides once and opens review`.)
2. **Back from review with almost no time left.** The clock resumes, and the next 250 ms check saves `timer` with the reading time at the deadline. It never saves a negative or over-long duration. (Task 3, `Back from review with under 250 ms left saves timer at the deadline`.)
3. **A long list at font scale 1.3 on a 360 dp screen.** The ring must stay on screen as it moves (prompt cards, sentence groups, the passage). The offset maths is unit-tested; the wiring is checked on the device gate. (Task 4, `scrollOffsetFor keeps the target inside the viewport with a margin`; Task 13 step 3.)
4. **TalkBack.** Marked tiles are buttons with the double-tap hint; the current and not-reached tiles are not buttons; the flip notice is announced. (Task 2, `FlipNotice announces its text and hides after 3000 ms`; Task 3, `current and not-reached tiles are not buttons; marked tiles are buttons with the double-tap hint`.)
5. **Repeated words and keys.** Two identical words in one sentence or passage stay independent through mark, flip, Back and the saved items. (Tasks 10 and 11, `repeated words keep independent marks through flip and Back`.)

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `progress/stepByStep.ts` | Reducer: add `flip` | 1 |
| `ui/ConfirmSheet.tsx` | Add `message` prop (body text under the title) | 2 |
| `ui/PositionLine.tsx` (new) | One muted line of `LinePart`s, bold where `strong` | 2 |
| `ui/FlipNotice.tsx` (new) | Ink notice above the bottom bar, 3000 ms, announced | 2 |
| `ui/MarkTile.tsx` | Prompt cards: ✓/✕ corner mark when filled; faded when `notReached` | 2 |
| `ui/PageIndicator.tsx` | Optional `labelFor` override | 2 |
| `ui/FollowScrollView.tsx` (new) | ScrollView that keeps a focused child in view; pure `scrollOffsetFor` | 4 |
| `progress/captureTypes.ts` (new) | `CaptureItem`, `CaptureBody`, `CaptureCopy`, `LinePart` | 3 |
| `progress/captureCopy.ts` (new) | `flatCopy`, `nestedCopy`, `reviewLine`, `endMessage` | 3 |
| `progress/CaptureBody.tsx` (new) | Renders `grid` / `cards` / `groups`, using a memoised `CaptureTile` | 3 (grid), 4 (cards, groups) |
| `progress/SequentialCapture.tsx` | Engine: phases, clock, review, flip, end sheet, notice, Result | 3 |
| `ui/ActionBar.tsx` | `DecisionBar` review mode (Finish + Back + Skip); `ToggleBar` stays, because the Q11 rubric still uses it | 3 |
| `types/QuestionProps.ts` | `endNoun?: 'question' \| 'test'` | 3 |
| `contractTest/validateResult.ts` | Sequential invariants | 5 |
| `progress/StoryQuestionsCapture.tsx` (new) | Shared story-questions screen | 6 |
| `battery/markingSentence.ts` (new) | `markingSentence(noun)` | 6 |
| `questions/*/index.tsx` | Each Question becomes data + engine | 6–11 |
| `itemsets/wela_plus_read_words@2024.2.{en,xh}.ts` (new) | Q6 stop rule | 8 |
| `src/utils/batteryRun.js` | "—" instead of "0 / 0" | 6 |
| `test-support/egraResults.js` | Synthetic EGRA results match the engine | 6, 10 |
| `src/screens/assessments/StandaloneTestScreen.js` | `endNoun="test"`, drop `captureMode` prop | 3, 8 |
| `__tests__/removedCopy.test.ts` (new, package) | Guard that the old copy is gone | 12 |
| `CONTEXT.md`, `documentation/design-system.md`, `documentation/build-log.md`, `documentation/ROADMAP.md` | Docs | 12 |

All `progress/`, `ui/`, `questions/`, `battery/`, `itemsets/` and `contractTest/` paths are under `src/assessment-questions/`.

---

### Task 1: Reducer `flip`

**Files:**
- Modify: `src/assessment-questions/progress/stepByStep.ts`
- Test: `src/assessment-questions/progress/__tests__/stepByStep.test.ts`

**Interfaces:**
- Produces:
  - `StepAction` gains `{ type: 'flip'; position: number }`.
  - `stepReducer(state, { type: 'flip', position }, ctx)` returns `state` unchanged (same reference) when `state.stopped`, when `position` is not an integer, or when `position < 0 || position >= state.cursor`.
  - Otherwise it inverts `decisions[position]`, adds 1 to `correctionCount`, recomputes `maxConsecutiveWrong` from the marks, and leaves `cursor` and `stopped` (false) unchanged.
  - `decide`, `back` and `undoStop` are unchanged.

- [ ] **Step 1: Write the failing tests** in `stepByStep.test.ts`:

```ts
const ctx = { totalItems: 5, stopRule: { kind: 'consecutive_wrong', stop_at: 3 } as const };
const run = (...actions: StepAction[]) => actions.reduce((s, a) => stepReducer(s, a, ctx), initStepState());
const D = (correct: boolean) => ({ type: 'decide', correct } as const);

test('flip inverts a marked item below the cursor and counts one correction', () => {
  const s = run(D(true), D(false), { type: 'flip', position: 0 });
  expect(s).toMatchObject({ cursor: 2, decisions: { 0: false, 1: false }, correctionCount: 1, stopped: false, maxConsecutiveWrong: 2 });
});
test.each([[-1], [2], [7], [1.5]])('flip at %p is ignored', (position) => {
  const before = run(D(true), D(true));
  expect(stepReducer(before, { type: 'flip', position }, ctx)).toBe(before);
});
test('flip is ignored while stopped', () => {
  const stopped = run(D(false), D(false), D(false));
  expect(stopped.stopped).toBe(true);
  expect(stepReducer(stopped, { type: 'flip', position: 0 }, ctx)).toBe(stopped);
});
test('a flip never stops; the next decide re-checks the run from the marks', () => {
  const flipped = run(D(false), D(false), D(true), { type: 'flip', position: 2 });
  expect(flipped.stopped).toBe(false);
  expect(stepReducer(flipped, D(false), ctx).stopped).toBe(true); // run of 4 >= 3
});
test('a flip that leaves the first row all wrong does not stop retroactively', () => {
  const firstRow = { totalItems: 6, stopRule: { kind: 'first_row_all_wrong', first_row_length: 3 } as const };
  let s = [D(false), D(false), D(true), D(true)].reduce((x, a) => stepReducer(x, a, firstRow), initStepState());
  s = stepReducer(s, { type: 'flip', position: 2 }, firstRow);
  expect(s.stopped).toBe(false);
  expect(stepReducer(s, D(false), firstRow).stopped).toBe(false); // first-row check only when the ring leaves row 1
});
```

- [ ] **Step 2:** Run `$JEST src/assessment-questions/progress/__tests__/stepByStep.test.ts`. Expected: FAIL (`flip` is not handled, so the state never changes).
- [ ] **Step 3:** Implement the `flip` case in `stepReducer` in `progress/stepByStep.ts`, returning early before the shared back/undo tail.
- [ ] **Step 4:** Re-run the file (PASS), then the full `$JEST` and `npm run test:types`.
- [ ] **Step 5: Commit** `feat(capture): reducer flip action for tap-to-flip`.

---

### Task 2: UI parts: end-sheet message, position line, flip notice, prompt-card marks, page label

**Files:**
- Modify:
  - `ui/ConfirmSheet.tsx`
  - `ui/MarkTile.tsx`
  - `ui/PageIndicator.tsx`
  - `ui/index.ts`
- Create:
  - `ui/PositionLine.tsx`
  - `ui/FlipNotice.tsx`
  - `progress/captureTypes.ts`, holding only `LinePart` for now (the rest arrives in Task 3)
- Test:
  - `ui/__tests__/ConfirmSheet.test.tsx`
  - `ui/__tests__/MarkTile.test.tsx`
  - `ui/__tests__/PageIndicator.test.tsx`
  - `ui/__tests__/PositionLine.test.tsx` (new)
  - `ui/__tests__/FlipNotice.test.tsx` (new)

**Interfaces:**
- Produces:
  - `type LinePart = { text: string; strong?: boolean }` (`progress/captureTypes.ts`).
  - `ConfirmSheet` gains `message?: string`, rendered as `UiText variant="body"` (tone ink) directly under the title and before the buttons.
  - `PositionLine({ parts, testID }: { parts: ReadonlyArray<LinePart>; testID?: string })`:
    - one centred `UiText variant="caption" tone="muted"`, with strong parts as `captionStrong` ink;
    - its `accessibilityLabel` is the joined text.
  - `FlipNotice({ notice }: { notice: { id: number; text: string } | null })`:
    - renders `testID="flip-notice"` with `accessibilityLiveRegion="polite"`;
    - calls `AccessibilityInfo.announceForAccessibility(text)` once per `id`;
    - hides 3000 ms after the latest `id`;
    - style: ink background, onInk `captionStrong` text, `radius.tile`, 10/14 padding, absolute, 16 dp side insets, sitting just above its parent's bottom edge (mockup 3).
  - `MarkTile`, `promptCard` variant only:
    - when `state` is `correct` or `incorrect`, a `testID="tile-mark"` `Icon` (`check` / `cross`, onInk, 14 dp) sits top-right 10/8 dp (mockup `.mk`);
    - when `state === 'notReached'`, the tile has `opacity: 0.55` (mockup `.pcard.dim`).

    Other variants are unchanged.
  - `PageIndicator` gains `labelFor?: (page: Page, count: number) => ReadonlyArray<LinePart>`. The default is today's label as `[{ text: cardRows, strong: true }, { text: ' · ' + rest }]`.

- [ ] **Step 1: Write the failing tests:**
  - `ConfirmSheet shows its message under the title and above the buttons`: the order in the tree is heading → message text → confirm button.
  - `PositionLine renders strong parts bold and joins them for screen readers`: `getByLabelText('Word 2 · letter 3 of 4')`, and the `2` part has `captionStrong` font weight.
  - `FlipNotice announces its text and hides after 3000 ms`: spy on `AccessibilityInfo.announceForAccessibility` and use fake timers.
    - The announcement is made once with `'Question 1 changed to Incorrect'`.
    - The notice is visible at 2999 ms and gone at 3000 ms.
    - A new `id` restarts the 3000 ms.
  - `prompt cards show a check or cross mark only when filled, and fade when not reached`:
    - `tile-mark` is present for correct and incorrect, absent for idle, current and notReached;
    - the notReached style has opacity 0.55;
    - a `letter` tile in state notReached has no opacity override.
  - `PageIndicator uses labelFor when given`: `labelFor={() => [{ text: 'Page 1 of 3' }]}` makes `getByTestId('page-label')` read `Page 1 of 3`.
- [ ] **Step 2:** Run `$JEST src/assessment-questions/ui`. Expected: FAIL on each new test.
- [ ] **Step 3:** Implement the props and components above. Export `PositionLine` and `FlipNotice` from `ui/index.ts`.
- [ ] **Step 4:** Re-run (PASS), then the full `$JEST`, `npm run test:types`, and `__tests__/rawHexGuard.test.ts` / `styleGuard.test.ts` (tokens only, no raw hex).
- [ ] **Step 5: Commit** `feat(capture-ui): end-sheet message, position line, flip notice, prompt-card marks`.

---

### Task 3: The engine — review, flip, end sheet, notice, copy, Result hook (grid body); migrate letter sounds and word reading

This is the heart of the change. It keeps the suite green by moving the engine's two current callers (`LetterSoundsQuestion`, `ReadWordsQuestion` sequential mode) in the same task.

**Files:**
- Modify:
  - `progress/captureTypes.ts`
  - `progress/SequentialCapture.tsx`
  - `ui/ActionBar.tsx` (`DecisionBar`)
  - `types/QuestionProps.ts`
  - `questions/LetterSoundsQuestion/index.tsx`
  - `questions/ReadWordsQuestion/index.tsx` (sequential branch only; grid mode goes in Task 8)
  - `src/screens/assessments/StandaloneTestScreen.js` (`endNoun="test"`)
  - `src/screens/dev/QuestionGalleryRunScreen.js` (`endNoun="test"` for standalone entries)
  - `progress/MissingItemSet.tsx` (`reason?: 'language' | 'empty'`)
- Create:
  - `progress/captureCopy.ts`
  - `progress/CaptureBody.tsx` (grid only in this task)
- Test:
  - `progress/__tests__/SequentialCapture.review.test.tsx` (new)
  - `progress/__tests__/captureCopy.test.ts` (new)
  - `progress/__tests__/SequentialCapture.renderCount.test.tsx` (keep passing; update props)
  - the existing letter-sounds and `ReadWordsQuestion.stepByStep.test.tsx` suites
  - `__tests__/readingDuration.test.tsx` (sequential branch)
  - `__tests__/clockJump.test.tsx`
  - `__tests__/itemSetResolution.test.tsx`
  - `egra/__tests__/capture.test.tsx` (letters and words)
  - `ui/__tests__/ActionBar.test.tsx`
  - host `__tests__/assessmentsRepository.questionResults.test.js` (`endSequential` helper), `__tests__/StandaloneTestScreen.test.js`, `__tests__/QuestionGalleryScreen.test.js`

**Interfaces:**
- Consumes: Task 1 `flip`; Task 2 `LinePart`, `ConfirmSheet.message`, `PositionLine`, `FlipNotice`, `PageIndicator.labelFor`.
- Produces (`progress/captureTypes.ts`):

```ts
export interface CaptureItem {
  item_key: string;
  prompt: string;                      // saved as ResultItem.prompt
  text?: string;                       // shown on the tile; default prompt
  label?: string;                      // accessible name; default prompt
  gloss?: string;                      // cards body only
  caption?: string;                    // picture tiles only
  metadata?: Record<string, unknown>;  // saved beside `reached` in ResultItem.metadata
}
export interface CaptureCopy {
  noun: string;                                             // 'letter' | 'word' | 'question'
  position: (position: number) => ReadonlyArray<LinePart>;  // marking line for the current item
  itemName: (position: number) => string;                   // capitalised flip-notice subject
}
export type CaptureBody =
  | { kind: 'grid'; rows: number[][]; layout: PageLayout; variant: 'letter' | 'word' | 'picture'; testID: string;
      rowTestID?: (cardRow: number) => string; labelFor?: (page: Page, count: number) => ReadonlyArray<LinePart> }
  | { kind: 'cards'; testID: string }
  | { kind: 'groups'; testID: string; card: boolean; variant: 'letter' | 'pill'; tileWidth?: number;
      groups: ReadonlyArray<{ key: string; heading?: string; testID?: string; positions: ReadonlyArray<number> }> };
```

- `SequentialCapture(props: QuestionProps & { itemSet: ItemSetMeta; items: ReadonlyArray<CaptureItem>; body: CaptureBody; stopRule: StopRule | null; testIDPrefix: string; copy: CaptureCopy; intro?: { startLabel?: string; testID?: string; content?: React.ReactNode }; aboveBody?: React.ReactNode; finalizeResult?: (base: Result) => Result })`
- `buildSequentialCard(rows: ReadonlyArray<ReadonlyArray<Omit<CaptureItem, 'metadata'> & { metadata?: Record<string, unknown> }>>): { items: CaptureItem[]; rows: number[][] }`. It puts `row: rowIndex` first in each item's `metadata`, so letter and word results stay exactly `{ row, reached }`.
- `QuestionProps.endNoun?: 'question' | 'test'`, default `'question'`.
- `DecisionBar` gains `mode?: 'deciding' | 'review'` (default `'deciding'`) and `onFinish?: () => void`.
  - **Review mode:** one `PrimaryButton` **Finish** (`testID ${p}-finish`), **Back** under it, and the navigation row with **Skip question** only (no end link). This matches mockup 7.
  - **Deciding mode:** unchanged, with `endLabel` passed by the engine.
- `progress/captureCopy.ts`:
  - `flatCopy(noun: 'letter' | 'word' | 'question', total: number): CaptureCopy` gives position `[{text: 'Word '}, {text: '6 of 40', strong: true}]` and itemName `Word 6`.
  - `nestedCopy(outer: 'Word' | 'Sentence', inner: 'letter' | 'word', groups: ReadonlyArray<ReadonlyArray<number>>): CaptureCopy` gives position `Sentence **2** · word **2 of 3**` and itemName `Word 2 of sentence 2` / `Letter 3 of word 2`.
  - `reviewLine(total: number, correct: number, noun: string): LinePart[]`.
  - `endMessage(marked: number, total: number): string`.

**Engine behaviour** (the implementer writes the body; these are the decisions):
- **Phases:** `'intro' | 'active' | 'review' | 'end-confirmation' | 'skip-picker' | 'finished'`, kept in `phaseRef` as today.
- **Actions:** `dispatch` accepts actions in `active` and `review`. A `decide` that makes `cursor === items.length` without stopping freezes `stopTimeMsRef = now` and transitions to `review`. It never calls `finish`.
- **Back from review:** a `back` dispatched in `review` shifts `startTimeMsRef += now - stopTimeMsRef`, clears `stopTimeMsRef`, and transitions to `active`.
- **Expiry check:** `finishIfExpired` runs only in `active`, as today.
- **Finish** in review calls `finish('completed')` with the frozen stop time. **End** is not offered in review.
- **Tiles:** the engine computes each tile's state.
  - `current` is `position === cursor` in active and not stopped.
  - `correct` / `incorrect` come from the marks.
  - Every other tile is `idle`, except in the `cards` body, where it is `notReached`.
- **Tappable tiles:** a tile is tappable when `position < cursor`, the phase is active or review, and the test is not stopped. A tappable tile dispatches `flip`.
- **Labels:** `${label}, current` / `${label}, not reached` / `${label}, correct. Double-tap to change to incorrect` (and the reverse). A non-tappable marked tile reads `${label}, correct`.
- **Flip side effects:** each flip sets the notice `{ id: n + 1, text: \`${copy.itemName(p)} changed to ${'Correct' | 'Incorrect'}\` }`. `onItemMarked` fires on `decide` (as today) and on `flip` with the new value (plan call 8). It does not fire on Back or Undo.
- **Position line:** sits directly above the `DecisionBar`, and is hidden while stopped.
  - Active: `copy.position(cursor)`.
  - Review: `reviewLine(items.length, correctCount, copy.noun)`.
- **Grid paging in review:**
  - `PageIndicator` gets `onPrevious` / `onNext` driving a local `reviewPage`.
  - Entering review sets `reviewPage` to the last item's page.
  - In active, the page always follows the cursor, as today.
- **End sheet:**
  - `ConfirmSheet testID="end-confirmation"`;
  - title `End this ${endNoun}?`;
  - `message={endMessage(cursor, items.length)}`;
  - confirm `End ${endNoun}` with `confirmTone="danger"`;
  - cancel `Keep marking`.

  The bar's end link reads `End ${endNoun}`, capitalised (`End question` / `End test`).
- **Result:**
  - Each item is `{ position, item_key, prompt, is_correct: position < cursor && decisions[position] === true, metadata: { ...item.metadata, reached: position < cursor } }`.
  - The derived fields are exactly today's (`SequentialCapture.tsx:90-100`).
  - The engine emits `finalizeResult ? finalizeResult(base) : base`.
- **Tiles render through** `const CaptureTile = React.memo(...)`, with props `{ variant, state, text, gloss, caption, accessibilityLabel, tappable, position, onTapPosition, width, height }`. `onTapPosition` is one stable callback (`useCallback` over refs), so only changed tiles re-render and Countdown ticks re-render none.
- **Skip from review:** **Skip question** is accepted in `active` and `review`. The picker remembers the phase it came from. **Cancel** returns to that phase with the clock exactly as it was: still frozen when it came from review, so no expiry check runs. Choosing a reason saves the skip as today.
- **Empty item sets:** when `items.length === 0`, the engine renders `<MissingItemSet language reason="empty" />` and never calls `onStart`. `MissingItemSet` gains `reason?: 'language' | 'empty'`, where `'empty'` reads `This test's card has no items.` and keeps the same testID. This replaces the test `an empty word override can still start and End without a page` (`ReadWordsQuestion.stepByStep.test.tsx:256`).
- **Intro:** `intro.testID ?? \`${testIDPrefix}-intro\``, with `intro.startLabel` and `intro.content` as `QuestionIntro` children.
- **`aboveBody`:** renders inside the covered view, above the body.
- **Letter sounds** passes `copy={flatCopy('letter', items.length)}` and `body={{ kind: 'grid', rows, layout: LETTER_PAGE_LAYOUT, variant: 'letter', testID: 'letter-grid', rowTestID: r => \`letter-row-${r}\` }}`. **Word reading** passes the same with `'word'` / `WORD_PAGE_LAYOUT`.

- [ ] **Step 1: Write the failing engine tests** in `SequentialCapture.review.test.tsx`.

  Use a local `renderCapture(overrides)` that renders 3 letters `a b c` in one grid row, with `copy=flatCopy('letter', 3)` and an `onComplete` mock. Use the fake `monotonicNow` from `__tests__/readingDuration.test.tsx`'s clock mock pattern. Tests:
  - `the last mark opens review instead of saving`:
    - press Correct ×3;
    - `onComplete` has not been called;
    - `getByText('Finish')` exists;
    - there is no `Correct`, `Incorrect` or `End question` text;
    - `getByLabelText('All 3 marked · 3 correct. Tap any letter to change it.')`.
  - `Finish saves completed with the final marks`:
    - press Correct, Incorrect, Correct, then Finish;
    - `stopped_reason: 'completed'`;
    - items `is_correct` are `[true, false, true]`;
    - every item has `metadata.reached === true`;
    - derived matches `{ total_correct: 2, total_attempted: 3, percent: 67, last_attempted_position: 2, tracks_progress: true, capture_mode: 'sequential', correction_count: 0 }`.
  - `a flip in review changes the saved mark and adds one correction`:
    - press Correct ×3, then tap the tile labelled `b, correct. Double-tap to change to incorrect`, then Finish;
    - items are `[true, false, true]`;
    - `correction_count` is 1;
    - `percent` is 67.
  - `Back from review clears the last mark and returns to marking`: after Back, `c, current` exists, `Correct` exists, and the review line is gone.
  - `a flip keeps the ring on the current item and shows "Letter 1 changed to Incorrect" for 3 s`:
    - press Correct (a), then tap `a, correct. Double-tap…`;
    - `b, current` still exists;
    - `getByTestId('flip-notice')` has that text;
    - it is gone after `jest.advanceTimersByTime(3000)`.
  - `current and not-reached tiles are not buttons; marked tiles are buttons with the double-tap hint`:
    - after one Correct, `within(getByTestId('letter-grid')).getAllByRole('button')` has length 1, with name `a, correct. Double-tap to change to incorrect`;
    - `getByLabelText('c, not reached')` has role `text`.
  - `End opens "End this question?" with marked and unmarked counts; End question saves ea_ended with the tail not reached`:
    - press Correct, then `letter-end`;
    - the sheet shows `End this question?` and `1 marked. The 2 not marked won't count towards the score.`;
    - press `End question`;
    - `stopped_reason: 'ea_ended'`;
    - `items.map(i => i.metadata.reached)` is `[true, false, false]`;
    - `total_attempted` is 1 and `percent` is 100.
  - `Keep marking returns to marking with marks kept`.
  - `endNoun "test" reads End test and End this test?`.
  - `timed: reading time stops at the last mark and review time is not counted`:
    - with `durationSec={60}`, mark all three at t = 20 000 ms;
    - advance to 50 000 ms, then Finish;
    - `duration_ms` is 20000 and `was_timed` is true.
  - `timed: Back from review resumes the remaining time`:
    - mark all at 20 000 ms, then Back at 50 000 ms;
    - Countdown shows `40s`;
    - advance to 90 000 ms;
    - `stopped_reason: 'timer'` and `duration_ms` is 60000.
  - `timer end saves at once with no review`: 60 000 ms elapse with 1 mark, and the result is `timer` with `last_attempted_position` 0.
  - `review → Skip → Cancel returns to review with marks and the frozen time kept`:
    - timed, mark all at 20 000 ms, Skip question, wait until 70 000 ms (past the original deadline), Cancel;
    - no `onComplete` call;
    - Finish is shown, and a flip still works;
    - then Finish gives `duration_ms` 20000.
  - `active → Skip → Cancel returns to marking as today`.
  - `an empty item set shows the no-items card and never starts` (flat and grouped bodies): `missing-item-set-en` with `This test's card has no items.`; no `Start`; `onStart` is not called.
  - `rapid double Correct on the last item decides once and opens review`: after two marks, call `fireEvent.press` on Correct twice in one `act`; no `onComplete` call, and `getByText('Finish')` exists. (Review Focus 1.)
  - `Back from review with under 250 ms left saves timer at the deadline`:
    - mark all at 59 900 ms, Back at 70 000 ms, advance 250 ms;
    - `timer`, with `duration_ms` 60000. (Review Focus 2.)
  - `paged: in review the arrows browse every page; Back returns to the current item's page`: use 25 letters with `LETTER_PAGE_LAYOUT` (two pages).
    - Mark all, press `Previous page`, and flip a page-1 tile.
    - Press Back: the page label returns to the last page, and `y, current` (the 25th letter) shows.
  - `finalizeResult receives the base Result and its return is emitted`.
  - `onItemMarked fires on decide and on flip with the new value, not on Back`.
- [ ] **Step 2:** Write the failing `captureCopy.test.ts`:
  - `flatCopy('word', 40).position(5)` → `[{ text: 'Word ' }, { text: '6 of 40', strong: true }]`, and `itemName(5)` → `'Word 6'`;
  - `nestedCopy('Word', 'letter', [[0,1,2,3],[4,5,6,7]]).position(6)` → `Word **2** · letter **3 of 4**`, and `itemName(6)` → `'Letter 3 of word 2'`;
  - `nestedCopy('Sentence', 'word', …).itemName` → `'Word 2 of sentence 1'`;
  - `reviewLine(18, 15, 'letter')` → `[{ text: 'All 18 marked', strong: true }, { text: ' · 15 correct. Tap any letter to change it.' }]`;
  - `endMessage(2, 5)` → `"2 marked. The 3 not marked won't count towards the score."`.
- [ ] **Step 3:** Run `$JEST src/assessment-questions/progress`. Expected: FAIL (no review phase, no copy module).
- [ ] **Step 4:** Implement `captureTypes.ts`, `captureCopy.ts`, `CaptureBody.tsx` (grid), the engine changes and `DecisionBar` review mode. Move `LetterSoundsQuestion` and the `ReadWordsQuestion` sequential branch to the new props. Add `endNoun` to `QuestionProps`, and pass `endNoun="test"` from `StandaloneTestScreen.js` and from the gallery run screen for standalone entries.
- [ ] **Step 5:** Update the existing tests that pinned the old engine:
  - **Instant save:** these tests now press **Finish** after the last mark:
    - `ReadWordsQuestion.stepByStep.test.tsx:40` and `:149`;
    - `itemSetResolution.test.tsx:95-120`;
    - the letter-sounds suites;
    - `egra/__tests__/capture.test.tsx` (letters and words).
  - **End copy:** `End test` → `End question`, and `Cancel` → `Keep marking`. This covers `ReadWordsQuestion.stepByStep.test.tsx:64,196,210,223` and `readingDuration.test.tsx`'s sequential branch.
  - **Host helper:** in `assessmentsRepository.questionResults.test.js:37-40`, `endSequential` becomes `endSequential(r, prefix = 'letter')`. It presses `${prefix}-end`, then `End question` inside `end-confirmation`. Tasks 6–11 reuse it.
  - **Buttons in the grid:** `ReadWordsQuestion.stepByStep.test.tsx:123` now expects zero buttons before any mark and one after the first mark.
  - **Standalone:** `StandaloneTestScreen.test.js` asserts the `End test` link.
  - **Host Grid A test:** `assessmentsRepository.questionResults.test.js:148-153` marks all 60 letters and awaits `onComplete`. It now presses **Finish** after the 60th mark, keeping its persisted-identity and uniqueness assertions. Run this host suite before the Task 3 gate.
  - **Render count:** `SequentialCapture.renderCount.test.tsx` uses the new props, and still asserts that a Countdown tick reads no prompt.
- [ ] **Step 6:** Run the full `$JEST` and `npm run test:types`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(capture): review step, tap-to-flip, End question sheet and flip notice in the shared engine`.

---

### Task 4: Scrolling bodies — prompt cards and groups that follow the ring

**Files:**
- Create: `ui/FollowScrollView.tsx`
- Modify: `progress/CaptureBody.tsx`, `ui/index.ts`
- Test: `ui/__tests__/FollowScrollView.test.tsx` (new), `progress/__tests__/CaptureBody.test.tsx` (new)

**Interfaces:**
- Consumes: Task 3 `CaptureBody`, `CaptureTile`.
- Produces:
  - `scrollOffsetFor(target: { y: number; height: number }, viewport: { offset: number; height: number }, margin: number): number | null`:
    - returns `null` when the target is fully inside `[offset + margin, offset + height − margin]`;
    - otherwise returns the smallest offset (≥ 0) that brings it inside, aligning the top when scrolling up and the bottom when scrolling down;
    - a target taller than the viewport aligns its top.
  - `FollowScrollView({ testID, focus, contentContainerStyle, children })` and `FollowTarget({ index, children })`:
    - each target registers a `View` ref (`collapsable={false}`) by index through context;
    - when `focus` changes, the view measures `targets[focus]` with `measureLayout` against the content view and calls `scrollTo({ y, animated: true })` when `scrollOffsetFor(…, margin = tokens.space.lg)` is not null;
    - the viewport comes from `onLayout` and `onScroll` (`scrollEventThrottle={16}`).
  - `CaptureBody` `cards`:
    - `FollowScrollView testID={body.testID}`, `contentContainerStyle={{ padding: tokens.space.lg, gap: 10 }}` (today's prompt-card styling, pinned by Q2/Q3/Q4 tests);
    - one `MarkTile variant="promptCard"` with `gloss` per item;
    - focus is the cursor in active, and none in review.
  - `CaptureBody` `groups`: today's `TileGroups` look (card or plain, heading, wrapping row, `space.sm` gaps), rendered inside a `FollowScrollView`, with `tileWidth` passed to `letter` tiles. `TileGroups` itself stays for the rubric's use or is deleted in Task 12 if unused.

- [ ] **Step 1: Write the failing tests:**
  - `scrollOffsetFor keeps the target inside the viewport with a margin`. With viewport `{ offset: 0, height: 600 }` and margin 16:
    - `{ y: 100, height: 72 }` → `null`;
    - `{ y: 700, height: 72 }` → `188`;
    - `{ y: 10, height: 72 }` at offset 300 → `0`;
    - `{ y: 400, height: 900 }` → `384`.
  - `cards body renders prompt cards with gloss, faded not-reached cards and the ring on the current card`.
  - `groups body renders headings, card groups and letter tiles at tileWidth`:
    - `within(getByTestId('prompt-scroll'))`;
    - heading `1. jam`;
    - tile width 52.
  - `groups body without cards renders paragraphs as wrapping pills` (`paragraph-0` has `flexWrap: 'wrap'` and is not a card).
- [ ] **Step 2:** Run `$JEST src/assessment-questions/ui/__tests__/FollowScrollView.test.tsx src/assessment-questions/progress/__tests__/CaptureBody.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full `$JEST` and `npm run test:types`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(capture): prompt-card and grouped bodies that keep the ring in view`.

---

### Task 5: Validator — sequential invariants

**Files:**
- Modify: `contractTest/validateResult.ts`
- Test: `__tests__/validateResult.test.ts`

**Interfaces:**
- Produces: when `derived.capture_mode === 'sequential'` and the result is not a skip, `validateResult` adds errors unless all four hold:
  - (a) `tracks_progress === true`;
  - (b) items with `metadata.reached === true` are exactly positions `0..k-1`, so unreached items form a tail;
  - (c) `last_attempted_position === k - 1`;
  - (d) every unreached item has `is_correct === false`.

  Error strings:
  - `capture_mode sequential: tracks_progress must be true`
  - `capture_mode sequential: reached items must be a prefix`
  - `capture_mode sequential: last_attempted_position must be the last reached position`
  - `capture_mode sequential: an unreached item cannot be correct`

- [ ] **Step 1: Write the failing tests:**
  - one valid sequential result passes;
  - each of the four violations yields exactly its error;
  - a skipped sequential result with `items: []` passes;
  - a non-sequential result is unaffected.
- [ ] **Step 2:** Run `$JEST src/assessment-questions/__tests__/validateResult.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement beside the existing `tracks_progress` rule (`validateResult.ts:137-143`).
- [ ] **Step 4:** Run the full `$JEST` (letter and word results from Task 3 must already satisfy it) and `npm run test:types`.
- [ ] **Step 5: Commit** `feat(contract): validate sequential capture invariants`.

---

### Task 6: One story-questions screen for WelaPLUS Q2 and EGRA story questions

**Files:**
- Create:
  - `progress/StoryQuestionsCapture.tsx`
  - `battery/markingSentence.ts`
- Modify:
  - `questions/ListenAndAnswerStoryQuestion/index.tsx`
  - `questions/ReadingComprehensionQuestion/index.tsx`
  - `battery/wela_plus_full.ts` (Q2 instructions)
  - `egra/adapter.ts:101` (story-questions instructions)
  - `src/utils/batteryRun.js:47-48`
  - `src/screens/dev/QuestionGalleryRunScreen.js:41`
  - `test-support/egraResults.js` (comprehension branch)
- Test:
  - both Questions' unit and contract tests (rewrite)
  - `egra/__tests__/capture.test.tsx:64-79`
  - `__tests__/egraRun.integration.test.js:21-31,86`
  - `__tests__/QuestionGalleryScreen.test.js:181-196`
  - `__tests__/batteryRun.test.js`
  - `__tests__/BatteryRunSummaryScreen.test.js`
  - `__tests__/onStartContract.test.tsx:72-98`
  - `__tests__/oneTerminalCallback.test.tsx`
  - `__tests__/clockJump.test.tsx`
  - host `__tests__/assessmentsRepository.questionResults.test.js:73-74,258-261`

**Interfaces:**
- Consumes: Tasks 3–4 engine, `cards` body, `flatCopy('question', n)`.
- Produces:
  - `markingSentence(noun: 'letter' | 'word' | 'question'): string`, returning the exact Global Constraints sentence.
  - `StoryQuestionsCapture(props: QuestionProps & { itemSet: ItemSetMeta; story: string; questions: ReadonlyArray<{ item_key: string; prompt: string; guide: string }>; storyButton: 'Re-read story' | 'Show story'; intro: { startLabel: string; testID?: string; showStory: boolean } })`. It renders `SequentialCapture` with:
    - `testIDPrefix="story"`;
    - `body={{ kind: 'cards', testID: 'prompt-scroll' }}`;
    - `durationSec={undefined}` (always untimed);
    - an `aboveBody` holding the `SecondaryButton` (16 dp padding as today) and the `FullScreenSheet` with the story;
    - `finalizeResult = storyQuestionsResult`.
  - `storyQuestionsResult(base: Result): Result` sets each item's `metadata.asked` = `metadata.reached`, and sets `derived.questions_asked = derived.total_attempted`.
  - **Q2 wiring:** `story` = the item set's story; guide = `acceptable_answers.join(', ')`; `storyButton 'Re-read story'`; intro `{ startLabel: "I've finished reading", testID: 'intro-story', showStory: true }` (the story renders as `ContentText size="story"` intro content).
  - **EGRA wiring:** `story` = `passage`; guide = `` `Answer guide: ${answer_guide}` ``; `storyButton 'Show story'`; intro `{ startLabel: 'Ask the questions', showStory: false }`. Items no longer carry `response`. `AssessmentChoiceCard` becomes unused; it is deleted in Task 12.
  - **`batteryRun.js`:** when `max === 0`, `scoreText` is `'—'` (spec §12 call 7). `QuestionGalleryRunScreen` shows `—` when `total_attempted === 0`.
  - **Copy:**
    - Q2 instructions append `Then ask each question. ${markingSentence('question')}`.
    - EGRA story questions become `Ask the story questions. Use the answer guide to decide. ${markingSentence('question')}`.

- [ ] **Step 1: Write the failing tests** (rewrite the two Questions' suites; the old toggle and "Not asked" tests are deleted):
  - `Q2: the ring starts on question 1, and later questions are faded`:
    - `What was the name of the bird?, current`;
    - the second card is in state notReached.
  - `Q2: Correct, Incorrect, End question saves asked for reached questions only`:
    - press Correct, Incorrect, then End question → End question;
    - items' `metadata` are `[{reached:true, asked:true}, {reached:true, asked:true}, {reached:false, asked:false}, …]`;
    - derived matches `{ total_correct: 1, total_attempted: 2, questions_asked: 2, percent: 50, last_attempted_position: 1, tracks_progress: true, capture_mode: 'sequential' }`;
    - `validateResult` returns valid.
  - `Q2: Re-read story keeps marks and the ring` (keep today's intent: open, Close, then `…, current` is unchanged).
  - `Q2: was_timed is false even when the host passes durationSec`, and no Countdown renders.
  - `EGRA: three questions marked then Finish save correct out of asked`:
    - press Ask the questions, then Correct, Incorrect, Correct, Finish;
    - `questions_asked: 3`, `total_correct: 2`;
    - no `response` on any item.
  - `EGRA: Show story opens the passage and Close returns to the same question`.
  - `EGRA: nothing asked then End shows "—" in the Battery summary` (via `buildRunView` in `batteryRun.test.js`, with `questions_asked: 0` → `scoreText: '—'`).
  - `repeated item keys keep independent positional marks` (Q2; rewrite of the test at :623).
- [ ] **Step 2:** Run `$JEST src/assessment-questions/questions/ListenAndAnswerStoryQuestion src/assessment-questions/questions/ReadingComprehensionQuestion __tests__/batteryRun.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. Rewrite `test-support/egraResults.js`'s comprehension branch to build engine-shaped items from `responses: Array<'correct' | 'incorrect'>` (reached) plus `notReached: number` (tail). Update `egraRun.integration.test.js` fixtures to tail-only `['correct','incorrect','correct']` + 2 not reached, expecting `score: 2, total_items: 5, derived.questions_asked: 3`.
- [ ] **Step 4:** Update the cross-cutting drivers:
  - `onStartContract.test.tsx:72-98`: re-read, end-sheet Keep marking, then complete; still exactly one onStart.
  - The `QuestionGalleryScreen` EGRA test: End question → `ea_ended` → `—`.
  - The host repository row: `press(r, "I've finished reading", 'Correct'); endSequential(r, 'story')`. `:258-261` now expects `reached` and `asked` metadata.
- [ ] **Step 5:** Run the full `$JEST` and `npm run test:types`.
- [ ] **Step 6: Commit** `feat(capture): one step-by-step story-questions screen for WelaPLUS and EGRA`.

---

### Task 7: First sounds (Q3) and Blending sounds (Q4)

**Files:**
- Modify:
  - `questions/ListenFirstSoundQuestion/index.tsx`
  - `questions/ListenPhonemeBlendQuestion/index.tsx`
  - `battery/wela_plus_full.ts` (Q3, Q4 instructions: `${MARK}` → `markingSentence('word')`)
- Test:
  - both Questions' unit and contract suites (rewrite)
  - host repository rows `:69-72`
  - `__tests__/oneTerminalCallback.test.tsx`, `__tests__/clockJump.test.tsx` (should pass unchanged)

**Interfaces:**
- Consumes: the engine, the `cards` body, `flatCopy('word', n)`, `markingSentence`.
- Produces:
  - **Q3:** items `{ item_key, prompt }`, `testIDPrefix="first-sound"`, `durationSec={undefined}`.
  - **Q4:** items `{ item_key, prompt: segmented, gloss: \`(${word})\`, metadata: { word } }`, `testIDPrefix="blend"`, `durationSec={undefined}`.
  - Both use `body={{ kind: 'cards', testID: 'prompt-scroll' }}`.
  - Both keep their item-set validators and `MissingItemSet` handling unchanged.

- [ ] **Step 1: Write the failing tests:**
  - `Q3: Start shows the ring on the first word and Word 1 of 10`;
  - `Q3: ten Correct then Finish saves 10 / 10 with every item reached`;
  - `Q3: End after two marks saves ea_ended with total_attempted 2`;
  - `Q4: items keep metadata.word beside reached` (`toEqual({ word: 'sun', reached: true })`);
  - `Q4: the gloss (sun) stays under s-u-n and is plain, not italic`;
  - `Q3/Q4: prompt cards keep padding lg, gap 10, radius tile, and turn solid green when marked`;
  - `Q3/Q4: was_timed is false even when the host passes durationSec`.
- [ ] **Step 2:** Run both Questions' test directories. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Update the host repository rows to `press(r, 'Start', 'Correct'); endSequential(r, 'first-sound')` (and `'blend'`). Run the full `$JEST` and `npm run test:types`.
- [ ] **Step 5: Commit** `feat(capture): first sounds and blending sounds step by step`.

---

### Task 8: Reading words (Q6) — sequential only, with the new stop rule

**Files:**
- Create: `itemsets/wela_plus_read_words@2024.2.en.ts`, `itemsets/wela_plus_read_words@2024.2.xh.ts`
- Modify:
  - `questions/ReadWordsQuestion/index.tsx`: delete the grid path (`ReadWordsQuestionContent`, `markingPolarity`, `captureMode`, `keyFor`, toggle, `ToggleBar`, `LastAttemptedSheet` use); the default bundled set becomes 2024.2
  - `itemsets/index.ts`
  - `battery/bundledItemSets.ts` (add `'wela_plus_read_words@2024.2'`; keep `@2024.1`)
  - `battery/wela_plus_full.ts` (Q6 `question_version: '2024.2'`, copy)
  - `battery/questionComponents.ts:35` (`word_reading` `extraProps: {}`)
  - `src/screens/assessments/StandaloneTestScreen.js:61` (drop `captureMode="sequential"`; keep the persisted `captureMode: 'sequential'` at `:41`)
- Test:
  - delete `ReadWordsQuestion.test.tsx` (grid); extend `ReadWordsQuestion.stepByStep.test.tsx`; rewrite `ReadWordsQuestion.contract.test.tsx`
  - `__tests__/readingDuration.test.tsx` (Q6 case moves to the sequential branch)
  - `__tests__/clockJump.test.tsx:120-151` (delete the grid describe)
  - `__tests__/itemSetResolution.test.tsx:134-160`; `__tests__/itemSetIntegrity.test.tsx:12` (bundled-set count 28 → 30) and `:96-99` (label `inja, current`)
  - typed callers that still pass `captureMode` (TS2322 once the prop goes): `__tests__/clockJump.test.tsx:65`, `__tests__/itemSetResolution.test.tsx:48,58,101`, `ReadWordsQuestion.stepByStep.test.tsx:24`. Delete the prop at each call site.
  - `__tests__/letterTestContent.test.ts:140-145`: the exact Q1 instruction string, in both languages, becomes the new wording below
  - `battery/__tests__/wela_plus_full.test.ts:28-35`, `battery/__tests__/questionComponents.test.ts`, `battery/__tests__/registry.test.ts`
  - host `__tests__/QuestionGalleryScreen.test.js:118-126`, `__tests__/StandaloneTestScreen.test.js:96-106`, repository row `:61-62`

**Interfaces:**
- Produces:
  - `WELA_PLUS_READ_WORDS_2024_2_EN` / `_XH` = the 2024.1 set spread with `item_set_id: 'wela_plus_read_words@2024.2.<lang>'`, `question_version: '2024.2'` and `stop_rule: { kind: 'consecutive_wrong', stop_at: 10 }`. The words and `row_lengths` are unchanged.
  - `ReadWordsQuestion(props: QuestionProps)`: there are no extra props.
  - **Q6 copy** (plan call 3): `Hand the child Reading Card side B. Point to each word and ask the child to read it. ${markingSentence('word')} The test stops by itself after 10 wrong in a row or at 1 minute.`
  - **Q1 copy** gets the same fix (`…Mark each letter Correct or Incorrect. The black ring shows which letter you're on. The test stops by itself after 10 wrong in a row or at 1 minute.`).

- [ ] **Step 1: Write the failing tests:**
  - `Q6 stops by itself after 10 wrong in a row`:
    - Battery set 2024.2, Incorrect ×10 → StopCard `got 10 in a row wrong`;
    - Save result → `stop_rule`;
    - `validateResult(result, { stopRule })` is valid.
  - `Q6: Undo after the stop re-opens marking, and the next Incorrect stops again`.
  - `Q6 pages are one 7-word card row each and the line reads Word 1 of 40` (shipped sets: 40 words, `row_lengths [7,7,7,7,7,5]`).
  - `the 2024.1 and 2024.2 sets have identical words and row_lengths, and only 2024.2 carries the stop rule`.
  - `the WelaPLUS Battery points Q6 at 2024.2 and both sets resolve` (`bundledItemSetFor('wela_plus_read_words', '2024.2', 'xh')`).
  - `the Word Reading quick test keeps word_reading@2026.1 with no stop rule`.
  - `ReadWordsQuestion has no grid mode`: rendering with a stray `captureMode="grid"` still shows the ring. Pass the prop through a `// @ts-expect-error captureMode was removed` line, so the type gate passes and also proves the prop is gone.
- [ ] **Step 2:** Run `$JEST src/assessment-questions/questions/ReadWordsQuestion src/assessment-questions/battery`. Expected: FAIL.
- [ ] **Step 3:** Implement. Delete the grid tests and the clock-correction describe they pin.
- [ ] **Step 4:** Update the remaining drivers listed above. `readingDuration.test.tsx` needs a driver rewrite, not just a branch move:
  - each case declares `marks`, a prefix strictly shorter than its fixture: **3** for the four-letter Q1 fixture (`:25-31`), 5 for Q6 and Q8. `startReading` makes exactly that many marks, so early-End and timer tests stay in active marking rather than review. Score and WPM expectations derive from `marks`;
  - the End helper splits into `openEnd(prefix)` (presses `letter-end` / `word-end`, and `passage-end` in Task 11) and `confirmEnd()` (presses `End question` in `end-confirmation`). This keeps the delayed-confirmation (`:128-139`) and cancellation (`:144-180`) cases intact; Cancel becomes `Keep marking`. An End pressed after the deadline still saves `timer` at once, with no sheet, as today;
  - marked tiles are found by their new labels (`…, correct. Double-tap to change to incorrect`);
  - the `:151-157` page browsing during active capture is removed, since paging is cursor-led until review;
  - a separate `all items marked: review freezes the reading time` case covers the review path.

  Task 11 reuses the same driver for Q8. Run the full `$JEST` and `npm run test:types`.
- [ ] **Step 5: Commit** `feat(capture): reading words marked step by step with a 10-in-a-row stop`.

---

### Task 9: Letter writing (Q5)

**Files:**
- Modify: `questions/LetterWritingFromPicturesQuestion/index.tsx`, `battery/wela_plus_full.ts` (Q5 copy)
- Test: the Question's unit and contract suites (rewrite), host repository row `:75-76`

**Interfaces:**
- Produces:
  - **Items:** `{ item_key, prompt: \`${alt} → ${letter}\`, text: letter, caption: alt }`, with no extra metadata (plan call 9).
  - **Body:** `{ kind: 'grid', rows: [[0..n-1]], layout: { columns, capacity: itemsPerPage, breakAtCardRow: false }, variant: 'picture', testID: 'picture-grid', labelFor: (page, count) => [{ text: \`Page ${page.index + 1}\`, strong: true }, { text: \` of ${count}\` }] }`.
  - **Copy:** `flatCopy('letter', n)`; `testIDPrefix="letter-writing"`; `durationSec={undefined}`.
  - The invalid `itemsPerPage`/`columns` guard (`index.tsx:66-73`) stays in the Question.
  - **Instructions:** `…When the child has finished, mark their sheet here, in order. ${markingSentence('letter')}`.

- [ ] **Step 1: Write the failing tests:**
  - `Q5 steps through the sheet in order across pages`:
    - Correct ×12 → page 2;
    - on the shipped xh set, `getByLabelText(/^icephe \(spoon\) → c, current/)` (position 12);
    - the line reads `Letter 13 of 26`;
    - Correct ×9 more reaches `iroboti (traffic light) → r, current` with `Letter 22 of 26`.
  - `Q5: shipped sets show 12 pictures per page in three columns` (keep the size and layout asserts; the label is `Page 1 of 3`; there are zero buttons before any mark).
  - `Q5: in review, Previous page browses back and a flip on page 1 is saved`.
  - `Q5: long isiXhosa picture names still wrap to two lines`.
  - `Q5: %s rejects 0, -1, 1.5 and NaN without starting` (kept).
- [ ] **Step 2:** Run the Question's test directory. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Update the host row. Run the full `$JEST` and `npm run test:types`.
- [ ] **Step 5: Commit** `feat(capture): letter writing marked step by step from the child's sheet`.

---

### Task 10: Writing words (Q9) and Writing sentences (Q10)

**Files:**
- Modify:
  - `questions/WriteCvcsQuestion/index.tsx`
  - `questions/WriteSentencesFromDictationQuestion/index.tsx`
  - `battery/wela_plus_full.ts` (Q9 `markingSentence('letter')`, Q10 `markingSentence('word')`, replacing the "Tap each … correctly" sentences)
- Test: both Questions' unit and contract suites (rewrite), host repository rows `:77-80`

**Interfaces:**
- Produces:
  - **Q9 items:** `{ item_key: \`${word.item_key}.l${i+1}\`, prompt: letter, label: \`${word} letter ${i+1} ${letter}\`, metadata: { word, word_index, letter_index } }`.
  - **Q9 body:** `{ kind: 'groups', testID: 'prompt-scroll', card: true, variant: 'letter', tileWidth: 52, groups: words.map((w, i) => ({ key: String(i), heading: \`${i+1}. ${w.word}\`, positions })) }`.
  - **Q9 copy:** `nestedCopy('Word', 'letter', positionsByWord)`; `testIDPrefix="cvc"`.
  - **Q9 `finalizeResult`:** adds `per_word: rows.map(row => ({ word, correct: reached && correct in row, total: reached in row }))`, or `[]` on a skip (plan call 4).
  - **Q10 items:** `{ item_key, prompt: word, metadata: { sentence_index, word_index } }`.
  - **Q10 body:** `{ kind: 'groups', testID: 'prompt-scroll', card: true, variant: 'pill', groups: sentences.map((s, i) => ({ key: String(i), heading: \`${i+1}.\`, positions })) }`.
  - **Q10 copy:** `nestedCopy('Sentence', 'word', …)`; `testIDPrefix="dictation"`.
  - **Q10 `finalizeResult`:** adds `per_sentence: [{ correct, total: reached in sentence }]`, or `[]` on a skip.
  - Both are `durationSec={undefined}`.

- [ ] **Step 1: Write the failing tests:**
  - `Q9: the ring steps letter by letter and the line reads Word 2 · letter 3 of 4` (xh set: lala, sela, …).
  - `Q9: End mid-word saves per_word over reached letters only`:
    - mark 5 letters of en `jam hut fin net` (3 C, 2 I), then End;
    - `per_word` is `[{ word: 'jam', correct: 2, total: 3 }, { word: 'hut', correct: 1, total: 2 }, { word: 'fin', correct: 0, total: 0 }, { word: 'net', correct: 0, total: 0 }]`.
  - `Q9: a flip shows "Letter 3 of word 2 changed to Correct"`.
  - `Q9: the widest shipped word still fits one card row at 360 dp` (kept).
  - `Q10: word by word with Sentence 1 · word 2 of 8; per_sentence counts reached words`.
  - `Q9/Q10: repeated words keep independent marks through flip and Back` (Review Focus 5).
  - `Q9/Q10: items keep their metadata beside reached` (exact `toEqual`).
- [ ] **Step 2:** Run both test directories. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Update the host rows. Run the full `$JEST` and `npm run test:types`.
- [ ] **Step 5: Commit** `feat(capture): writing words and sentences marked step by step`.

---

### Task 11: Reading sentences (Q7) and the passage (Q8, EGRA story)

Rebase onto `fix/egra-story-last-word` before this task if it has not been done yet (Global Constraints).

**Files:**
- Modify:
  - `questions/ReadSentencesQuestion/index.tsx` (drop `markingPolarity`)
  - `questions/ReadPassageQuestion/index.tsx` (drop `markingPolarity`, `LastAttemptedSheet`, `applyProgress`, toggle)
  - `battery/questionComponents.ts:23` (`oral_reading` `extraProps: {}`)
  - `battery/wela_plus_full.ts` (Q7, Q8 copy)
  - `egra/adapter.ts:100` (passage copy)
  - `test-support/egraResults.js` (oral_reading branch)
- Test:
  - both Questions' unit and contract suites (rewrite)
  - `__tests__/readingDuration.test.tsx` (Q8 joins the Task 8 driver with prefix `passage`; delete the non-sequential branch)
  - `__tests__/clockJump.test.tsx`
  - `egra/__tests__/capture.test.tsx:44`, plus the Cancel/reopen and timer tests PR #106 added there. **Replace** those with step-by-step equivalents (Keep marking keeps the marks; the timer saves at once); do not delete them.
  - `egra/__tests__/defaults.test.ts:16-17`
  - `__tests__/egraRun.integration.test.js:85`
  - host repository rows `:63-68`

**Interfaces:**
- Produces:
  - **Q7 items:** `{ item_key, prompt: word, metadata: { sentence_index, word_index } }`.
  - **Q7 body:** `{ kind: 'groups', testID: 'sentence-scroll', card: true, variant: 'pill', groups: sentences.map(s => ({ key, testID: \`sentence-row-${s.item_key}\`, positions })) }`, with no headings, as today.
  - **Q7 copy:** `nestedCopy('Sentence', 'word', …)`; `testIDPrefix="sentences"`.
  - **Q7 `finalizeResult`:** sets `per_sentence_percent[i] = reached > 0 ? Math.round(correct / reached * 100) : null` (plan call 4); `[]` on a skip.
  - **Passage items:** `{ item_key, prompt: word }`.
  - **Passage body:** `{ kind: 'groups', testID: 'passage-scroll', card: false, variant: 'pill', groups: paragraphs.map((p, i) => ({ key: String(i), testID: \`paragraph-${i}\`, positions })) }`.
  - **Passage copy:** `flatCopy('word', n)`; `testIDPrefix="passage"`.
  - **Passage `finalizeResult`:** when `was_timed` and not skipped, adds `correct_words_per_minute = duration_ms > 0 ? Math.round(total_correct / duration_ms * 60000) : 0`, as today (`index.tsx:167-170`).
  - **Copy:**
    - Q7: `Reading Card side B, sentences. Ask the child to read each sentence. ${markingSentence('word')}`.
    - Q8: `Hand the child Reading Card side C. Ask the child to read the story. ${markingSentence('word')} The test stops by itself at 1 minute.`
    - EGRA passage: `Ask the child to read the story aloud. ${markingSentence('word')} The test stops by itself when the time is up.`

- [ ] **Step 1: Write the failing tests:**
  - `passage: the ring follows the child word by word; the timer saves at once with the last marked word as last_attempted_position`:
    - 5 marks, then 60 s;
    - `timer`;
    - `last_attempted_position: 4`;
    - items 5.. are `reached: false`;
    - `correct_words_per_minute` comes from the frozen 60000 ms.
  - `passage: no "Last item attempted" sheet appears on End or timer`.
  - `passage: an error-free reader who reached 12 words saves 12 correct` (the case behind the live EGRA bug).
  - `passage: Countdown ticks do not re-read or render passage word data` (keep the `ReadPassageQuestion.test.tsx:314` getter test against the engine).
  - `EGRA oral reading: Incorrect marks render red and score only Correct marks` (rewrite of `capture.test.tsx:44`, equal to the rewritten `buildEgraResult`).
  - `EGRA: the story-questions gate still needs one word marked Correct` (an adapter-level `evaluateBatteryState` test: `total_correct` 0 with 3 reached → story questions auto-skip; 1 → not skipped).
  - `Q7: per_sentence_percent counts reached words and is null for a sentence never reached`.
  - `Q7/passage: repeated words keep independent marks through flip and Back` (Review Focus 5).
  - `the oral_reading registry entry has no extra props`.
- [ ] **Step 2:** Run both Questions' directories, `src/assessment-questions/egra` and `src/assessment-questions/__tests__/readingDuration.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement. Rewrite `egraResults.js`'s oral branch to the engine shape: `capture_mode`, `correction_count: 0`, `max_consecutive_wrong`, and `{ reached }` on every item.
- [ ] **Step 4:** Update the remaining drivers. Run the full `$JEST` and `npm run test:types`.
- [ ] **Step 5: Commit** `feat(capture): reading sentences and the passage marked word by word in both batteries`.

---

### Task 12: Remove the old paths, guard the old copy, update the docs

**Files:**
- Delete:
  - `hooks/useToggleMark.ts` and `hooks/__tests__/useToggleMark.test.ts`
  - `progress/LastAttemptedSheet.tsx` and its test
  - `progress/applyProgress.ts` and its test
  - `ui/AssessmentChoiceCard.tsx`
  - `TileGroups` if `grep` shows no user after Task 11 (else keep)
- Modify:
  - `ui/index.ts`
  - `__tests__/boundary.test.ts:44` (replace the `useToggleMark` example with another package module)
  - `battery/wela_plus_full.ts` (delete `MARK`)
  - `egra/adapter.ts:82-83` (`timedInstructions`)
- Create: `src/assessment-questions/__tests__/removedCopy.test.ts`
- Docs:
  - `CONTEXT.md`
  - `documentation/design-system.md` (`## Assessment capture`)
  - `documentation/build-log.md`
  - `documentation/ROADMAP.md`

**Interfaces:**
- Produces:
  - **EGRA `timedInstructions(noun, section)`** becomes `` `Ask the child to read the ${noun} in order. ${markingSentence(item)} The test stops by itself if every ${item} in the first row is wrong, or when the time is up.${practice(section)}` ``, where `item` is `'letter'` or `'word'`.
  - **`removedCopy.test.ts`** walks `src/assessment-questions/{questions,progress,battery,egra,ui,hooks}/**/*.{ts,tsx}`, excluding `__tests__` and `questions/StoryWritingRubricQuestion/` (Q11 is frozen and keeps its own "dimensions unscored — finish anyway?" sheet). It fails if any file contains any of these exact phrases:
    - `items unmarked`
    - `questions not marked`
    - `Not asked`
    - `finish anyway`
    - `Yes, finish`
    - `it turns green`
    - `Tap each word`
    - `Tap each letter`
    - `Tap words read incorrectly`
    - `mark the last word`
    - `Last item attempted`
    - `Reached the end`
    - `Nothing attempted`
    - `tap_wrong`
    - `markingPolarity`
    - `useToggleMark`
  - **Positive fixtures in the same file:** the guard still allows the copy that must survive. It asserts that Q11 still contains `dimensions unscored — finish anyway?` and that Q5's child-facing paper instruction still contains `just leave it blank`.
  - **Marking-sentence guard:** a second test asserts that every WelaPLUS question except `wela_plus_story_writing`, and every EGRA question for every bundled form, has instructions that contain `markingSentence(<its noun>)`.

- [ ] **Step 1: Write the failing guard tests.**
- [ ] **Step 2:** Run `$JEST src/assessment-questions/__tests__/removedCopy.test.ts`. Expected: FAIL (`MARK`, `timedInstructions` and the dead modules still exist).
- [ ] **Step 3:** Delete and modify as listed. Run the full `$JEST` and `npm run test:types`. Expected: PASS.
- [ ] **Step 4: Docs** (spec §10):
  - **`CONTEXT.md`:**
    - "Capture mode" (`:237`): step-by-step is the mechanic for every Question except the Story Writing rubric; `capture_mode` null marks results saved by the old toggle and last-word paths.
    - "Stop rule": Q6 now has `consecutive_wrong` 10.
    - "EGRA form" (`:205`): story questions are marked Correct / Incorrect step by step; unasked questions are the not-reached tail.
    - Rewrite the Pattern D (`:317`) and Pattern F (`:322`) decisions: one mechanic (the engine), `useToggleMark` gone, Q2 shows all cards with a ring rather than one card at a time.
  - **`design-system.md`:** a "Step-by-step marking" subsection covering:
    - ring and states (including faded prompt cards and ✓/✕ marks);
    - Correct / Incorrect / Back;
    - tap-to-flip and the flip notice;
    - the position line;
    - the review step;
    - the end sheet copy;
    - End question vs End test.
  - **`build-log.md`:** the build entry with the gates and results.
  - **`ROADMAP.md`:** an open item "EA usability check of step-by-step marking on a preview build (spec §11; Jim decides)".
- [ ] **Step 5:** Run the full `$JEST` and `npm run test:types`.
- [ ] **Step 6: Commit** `chore(capture): remove the toggle and last-word paths; guard old copy; docs`.

---

### Task 13: Gates and device check

Not a Codex task: Claude runs it and Jim does the iPhone pass.

- [ ] **Step 1: Automated gates.**
  - Run the full `$JEST`, `npm run test:types`, `npm run test:integration` and `npm run test:content`.
  - Push the branch so the PostgreSQL CI suite runs; check it with `gh pr checks`.
  - Record the suite counts in the build log.
- [ ] **Step 2: Branch review.** Run a Codex adversarial review (`--model gpt-6-astra --base origin/main`) of the whole branch against the spec. Fix the findings and re-run the review per the standing review-loop rule.
- [ ] **Step 3: A03 at 360 dp** (`wm density 320`), font scale 1.0 and 1.3, on a preview build from this branch, signed in as TestB. Coordinate with the other session before taking the A03.
  - Run one full WelaPLUS assessment and one Full EGRA (isiXhosa HL), each with a flip, an early end and a stop. Q6: 10 Incorrect, then Undo, then continue.
  - Capture screencaps of every Question in marking, review and the end sheet into a contact sheet. Compare them with mockups 1–8 for ring weight, the ✓/✕ marks, the faded cards, the position-line weight, the notice placement above the bar and the scrolling of the ring at font scale 1.3.
  - Confirm TalkBack reads a marked tile with the double-tap hint and announces the flip notice.
- [ ] **Step 4: Staging rows.** Use the `sqlite-staging-sql` helper, read-only, and confirm `project_ref=segygjzpujphwvrubusm`.
  - Select the new runs' `assessments.capture_mode`: every Question is `sequential` except `wela_plus_story_writing` (Q11, unchanged, so null).
  - Check the items' `metadata.reached` tails and Q6's `item_set_id` `wela_plus_read_words@2024.2.*`.
- [ ] **Step 5: Hand Jim the iPhone checklist** (the same flows) and the build-log entry. Merging waits for Jim's go.

---

## Calls made in this plan (Jim to check)

1. **The WelaPLUS Battery stays `2024.1`.** The server default points at it (`supabase/migrations/20261021120000_assessment_results_contract.sql:109`), and each result already says how it was marked (Q6's new item-set version and `capture_mode`). Moving it would need a data migration for no reporting gain.
2. **One clock rule for every Question.** Reading time stops at the last mark, and review time never counts, untimed Questions included. So `duration_ms` on an untimed Question means "time to the last mark".
3. **Copy no longer tells the EA to stop by hand where the app stops by itself.**
   - Q1 and Q6: "…after 10 wrong in a row or at 1 minute".
   - Q8: "The test stops by itself at 1 minute".
   - EGRA: "…or when the time is up".
4. **Per-group totals count reached items only.**
   - `per_word.total` and `per_sentence.total` = reached.
   - `per_sentence_percent` is `null` for a sentence the child never reached, so "not reached" never reads as "0%".
5. **Nouns and position lines** follow the table in Global Constraints. Q5's noun is "letter", since the EA marks the letter the child wrote.
6. **Prompt cards show ✓/✕ corner marks** when marked, as in mockups 2, 3 and 8. Colour is never the only signal.
7. **Story questions with nothing asked show "—"** in the Battery summary and the gallery.
8. **`onItemMarked` fires on Correct, Incorrect and flips**, but not on Back or Undo. No host passes it today.
9. **Q5 items keep no extra metadata.** The picture name and letter are already in `prompt`.
10. **Q10 keeps today's "1." and "2." headings.** Mockup 5's "Sentence 1" was placeholder art, and the spec keeps today's layout.
11. **The paged Questions get the position line too** (Q1, Q5, Q6, EGRA letters and words), so every Question reads the same. Tiles shrink by one caption line; the device gate checks the fit.
12. **`ReadWordsQuestion` loses its `captureMode` prop** instead of keeping a prop that does nothing.
