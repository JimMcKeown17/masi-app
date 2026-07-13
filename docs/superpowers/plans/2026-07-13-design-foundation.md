# Design Foundation Implementation Plan (audit #8 + roadmap item 12)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or the repo TDD skill) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** implement `docs/superpowers/specs/2026-07-13-design-foundation-design.md`. Read the spec FIRST; its decisions are binding, especially section F (what must not change).

**Architecture:** one `BottomSheet` primitive owns all modal scaffolding; one `SelectSheet` (built on it) owns every single-select picker; the four existing sheets, the nine Paper `Dialog` pickers, and the inline EditChild picker (ten conversions) render through them; the one genuine confirmation stays a `Dialog`; the two capture screens share extracted chrome; the session form's root scroller becomes the roster list, with a memoized, ref-backed row.

**Branch:** `improvement/design-foundation` (worktree).

## Verified anchors (2026-07-13, against main `a144b68`; locate by pattern if lines drift)

- **Four sheet copies:** `src/components/children/GroupPickerBottomSheet.js` (reference shape: Modal + TouchableWithoutFeedback backdrop + KeyboardAvoidingView + sheetWrapper + sheet + handle + title/subtitle + ScrollView), `src/components/session/LetterTrackerBottomSheet.js` (no KeyboardAvoidingView, no maxHeight, non-scrolling grid body, legend row between header and body), `src/components/assessment/LastAttemptedBottomSheet.js` (backdrop `flex:1` at 0.4 opacity, no sheetWrapper, 40x4 handle, `colors.background`, literal radius 20, `spacing.md` bottom padding, centered title, ScrollView body, footer with "Selected: ..." + `Confirm` button, `onConfirm`/`onCancel` NOT `onDismiss`), and an inline class picker in `src/screens/children/EditChildScreen.js` (~`:316-372`, styles prefixed `classPicker*`).
- **Ten Dialogs (nine pickers + one confirmation):** `src/components/sessions/ClockInBeforeSessionDialog.js` (CONFIRMATION: "Clock In Now" / "Continue Anyway", copy `SESSION_CLOCK_WARNING` from `src/hooks/useSessionLaunchGuard.js`); `src/screens/assessments/AssessmentChildSelectScreen.js` (`:158-172`, language RadioButton.Group + Cancel/Start, two-step); `src/screens/children/CreateClassScreen.js` (`:175-240`, three: school with `Dialog.ScrollArea` + Cancel, grade and language with NO actions row, immediate select); `src/screens/children/EditClassScreen.js` (`:227-292`, the same three, structurally identical, school also sets `schoolName`); `src/screens/sessions/LiteracySessionForm.js` (`:549-588`, two: session reading level with no actions, per-child reading level whose visibility is the id-carrying `openChildLevelMenu !== null` and which has a lone Cancel).
- **Capture chrome:** `src/screens/assessments/LetterAssessmentScreen.js` (334 lines) and `SequentialAssessmentScreen.js` (150 lines). Instructions phase identical except the step list (5 grid steps vs 4 sequential) and title; header identical except the label word ("Page" vs "Grid"); End-Assessment Alert copy character-identical in both; 16 byte-identical style keys. `currentPage` is `useState` in Letter, derived (`Math.floor(displayCursor / lettersPerPage)`) in Sequential.
- **Roster (#8):** `src/components/children/ChildSelector.js` — `FlatList` at `:99` with `scrollEnabled={false}` at `:123`, inline `renderItem` at `:102`, per-row `classes.find(...)` at `:107`, consumed by `src/screens/sessions/LiteracySessionForm.js`.
- **Group helpers:** `nextGroupNumber`, `compareGroups`, `getGroupColor` are named exports of `GroupPickerBottomSheet.js` (`:32`, `:48`, `:62`), imported by `src/screens/children/EditChildScreen.js:17`, `src/screens/children/ClassDetailScreen.js:14`, `__tests__/groupHelpers.test.js`, and re-provided by the module mock in `__tests__/EditChildScreen.test.js:30-34`.
- **Tests that pin internals (do not casually edit):** `GroupPickerBottomSheet.test.js` (rendered text incl. the literal `"+  Add Group 3"` double space), `groupHelpers.test.js` (named-export import path), `LetterTrackerBottomSheet.plan5.test.js` (a11y label `` `${letter}, mastered from assessment` ``), `EditChildScreen.test.js` (module mock re-providing `getGroupColor`/`compareGroups`), `LetterAssessmentScreen.{expiry,plan5,renderCount,renderIsolation}.test.js` and `SequentialAssessmentScreen.{expiry,renderCount}.test.js` (pin "Start Assessment", "Finish", "Correct", tile a11y labels), `CreateClassScreen.test.js` (drives pickers by option text: presses `'Sunrise Primary'`, `'Grade 1'`, `'isiXhosa'`), `LiteracySessionForm.test.js` (presses `'Select a level'` then a `READING_LEVELS[0]` option; pins that a session reading level alone makes the form dirty).
- `CountdownTimer` (`src/components/assessment/CountdownTimer.js`) is an isolated 1 Hz leaf; its render isolation is guarded by the renderCount/renderIsolation suites.
- Node 20: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`; unit `npx jest --silent --maxWorkers=4`; integration `npm run test:integration`.

## Design decisions (locked; the spec governs)

1. `BottomSheet` props exactly as the spec's section A defines them: `visible, onDismiss, title, subtitle, dismissLabel, headerExtras, footer, scrollable, keyboardAvoiding`, **plus `maxHeight`, `bodyContentStyle`, `scrollViewProps` (R4)**. Canonical chrome = the majority shape (absoluteFill backdrop at 0.5, 36x4 handle, `colors.surface`, `borderRadius.lg`, 80% default maxHeight, `Math.max(insets.bottom, spacing.lg)`, `spacing.lg` horizontal content padding applied EXACTLY ONCE, left-aligned title).
2. `LastAttemptedBottomSheet`'s divergent chrome is normalized to canonical (a deliberate, accepted visual change). Its `onConfirm`/`onCancel` prop pair is PRESERVED and must not collapse into `onDismiss`: cancel saves with `lastTappedIndexRef`, confirm saves with `selectedIndex`.
3. `SelectSheet` props exactly as the spec's section B defines them, **including `cancelLabel` (R3), `emptyMessage` (R4), and a `maxHeight` passthrough to `BottomSheet`** (EditChild's picker needs 60%). Absent `confirmLabel` = tap-to-select-and-close; present = two-step with a footer commit button.
4. TEN picker instances convert (R5); the assessment language picker keeps a confirm step (`confirmLabel="Start"`); `ClockInBeforeSessionDialog` stays a Paper `Dialog` (it is a three-way decision, not a picker).
5. Capture chrome extracts to `AssessmentInstructions`, `CaptureHeader`, `EndAssessmentButton` with the prop shapes in spec section C. `pageLabel` carries the only header difference. The End-Assessment Alert copy becomes a single source.
6. **(SUPERSEDED BY R1 AND R2 — the dispositions win.)** Roster fix = the form's root scroller BECOMES the roster `FlatList` (header/footer components carry the rest of the form; no vertical list nested in a vertical ScrollView) + memoized `ChildSelectorRow` with scalar props + class-name Map + a REF-BACKED, permanently-stable `onToggle` + `extraData` + memoized `ChildSelector` + `useCallback` on the form's `handleChildrenChange`. The form's state model and visual layout are unchanged.
7. Group helpers move to `src/utils/groupHelpers.js` in one atomic change including the `EditChildScreen.test.js` mock.
8. Section F of the spec is binding: every a11y label and user-visible string preserved verbatim; no capture, sync, storage, navigation, schema, or RLS change. A test that must change is a signal to re-read the spec, not to edit the test.

## Codex plan review dispositions (2026-07-13, R1-R8) — BINDING

Adversarial review (gpt-5.6-sol, high effort, read-only) against the current tree; verdict REDESIGN; all eight findings verified and accepted. The spec's sections B and D were rewritten in response. **Where a disposition conflicts with task or decision text, the disposition wins.**

- **R1 (BLOCKER, roster architecture; spec section D rewritten):** a bounded `FlatList` inside the form's same-axis `ScrollView` is the pattern React Native explicitly warns against ("VirtualizedLists should never be nested inside plain ScrollViews with the same orientation"), and bounding the height does not fix windowing: with the default `windowSize: 21`, a six-row viewport spans about 126 row-heights, so a 60-child roster stays fully inside the render window and nothing is virtualized. **Amendment: `LiteracySessionForm`'s root scroller becomes the roster `FlatList` itself**, with everything above the roster in `ListHeaderComponent` and everything below in `ListFooterComponent`, preserving the current visual layout and scroll feel exactly. Set `initialNumToRender` and `windowSize` deliberately against the measured row height. Do NOT claim native virtualization from a Jest rendered-row count; that claim belongs to the device gate.
- **R2 (BLOCKER, callback identity; spec section D rewritten):** `onToggle` keyed on the selection Set gets a NEW identity on every selection, so every mounted memoized row sees changed props and re-renders. The "one row" assertion could never pass, and a memo comparator that ignores the callback would leave rows holding stale closures. **Amendment: `ChildSelector` holds the current selection, the children lookup, and `onSelectionChange` in refs; `onToggle` has permanently stable identity and reads the refs at press time; selection reaches rows via the scalar `isSelected` plus an explicit `extraData`.** The form's `handleChildrenChange` (currently recreated every render, `LiteracySessionForm.js:259`) is wrapped in `useCallback`.
- **R3 (MAJOR, four Cancels would silently vanish):** the locked `SelectSheet` API had no cancel action, but four converted pickers render a visible `Cancel` button today (CreateClass school, EditClass school, LiteracySessionForm per-child reading level, AssessmentChildSelect language). Backdrop dismissal is not the same visible interface, and no existing test queries them, so the suite would stay green while the spec's "preserve every user-visible string" rule was violated. **Amendment: `SelectSheet` gains `cancelLabel`; those four pass `cancelLabel="Cancel"`.** Also pin the assessment picker's cancel-and-reopen semantics: today Cancel RETAINS the drafted language for the next opening, and an internal draft state must not silently reset it.
- **R4 (MAJOR, primitive contract too thin):** without `maxHeight`, EditChild's class picker silently grows from 60% to 80%; without `bodyContentStyle`/`scrollViewProps`, LastAttempted silently regains a scroll indicator and loses its centered grid; `SelectSheet` needs `emptyMessage` for EditChild's "No classes available. Create a class first." **Amendment: add all four props.** Also: `LetterTracker` currently supplies its own `paddingHorizontal: spacing.lg` on the grid (`:171`) and its tile math assumes exactly one layer (`:52`); when the primitive supplies the canonical padding, **remove the grid's own padding** so `spacing.lg` is applied exactly once.
- **R5 (MAJOR, wrong count):** the tree has TEN picker instances (three in CreateClass, three in EditClass, two in LiteracySessionForm, one in AssessmentChildSelect, plus the inline EditChild sheet) plus one retained confirmation. Every "six pickers" completion claim is replaced by **"ten picker conversions; one Paper confirmation Dialog remains."**
- **R6 (MAJOR, conversions have no screen-level proof):** `EditClassScreen.test.js` never opens a picker; `EditChildScreen.test.js` never opens the class picker; nothing proves EditClass school selection sets both `schoolId` and `schoolName`, that EditChild calls `updateChild(childId, { class_id })`, that the per-child reading level commits against the correct child id, that the four Cancels survive, or that the empty state survives. A green full suite would prove none of it. **Amendment: add screen-level tests for each of those, asserting resulting state or repository calls, not merely that an option label renders.**
- **R7 (MINOR, two false preservation claims):** `GroupPickerBottomSheet.test.js:88` matches `/\+\s+Add Group 3/`, which a single space satisfies, so the double-space invariant can regress green. **Tighten it to the exact string `'+  Add Group 3'`.** And `LastAttemptedBottomSheet` has NO visible Cancel button (its cancel paths are backdrop press and hardware back). **Task 3's wording changes to: backdrop press and `onRequestClose` call `onCancel`; no visible Cancel button is added; Confirm calls `onConfirm(selectedIndex)`.**
- **R8 (MINOR, PRD tracking):** repo guidance requires the progress checklist when work STARTS. **Create the PRD Development Progress entry before Task 1** and tick it at each task boundary; Task 8 closes it rather than creating it.
Convergence pass (verdict BUILD-WITH-FIXES; all applied to the text above on 2026-07-13):
- **R9 (NEW, would have shipped a bug): the FlatList header and footer must be hoisted, stable component types.** RN renders a component-valued header as `<ListHeaderComponent />`, so a render-local function becomes a new component type on every keystroke, remounting the subtree and dropping focus from the comment TextInput while the EA types. `useCallback` on `comments` does not save it. Hoist `FormHeader`/`FormFooter` to module scope; pin with a focus-and-text-preserved test.
- **R10:** the render-count spy must instrument `ChildSelectorRow`'s own render, not `renderItem` (FlatList can call `renderItem` without the memoized row re-rendering, which would make the test lie).
- **R11:** EditChild's class picker has NO visible Cancel today (`EditChildScreen.js:317`); the earlier task text demanded a test for one. Removed; it must not gain one.
- **R12:** `SelectSheet` needs a `maxHeight` passthrough (EditChild's 60%); the file lists for Tasks 4 and 5 must include the suites their RED steps modify; "tests pass unmodified" now names its authorized exceptions.
- Review-confirmed (no change needed): the form contains no other VirtualizedList and no KeyboardAvoidingView, so the restructure is safe; the calendar and letter grid are plain mapped Views; the existing `LiteracySessionForm.test.js` queries all survive the restructure; the existing option-text tests (`CreateClassScreen`, `LiteracySessionForm`) WILL survive the Dialog-to-sheet conversion, because RN `Modal` renders children into the tree when visible and RNTL walks from the queried `Text` to the nearest pressable ancestor, provided each option label is a descendant of its row's press target. Task 1 is genuinely atomic. `CaptureHeader` keeps the timer's render isolation as long as it renders `<CountdownTimer getElapsedMs={getElapsedMs} />` directly with no inline wrapper functions (`getElapsedMs` is already a stable `useCallback`), and is itself `React.memo`'d.

## Global Constraints

- Node 20 prefix on every jest/npm command; full-suite runs with `--maxWorkers=4`.
- Strict red-green per step; commit per task; NEVER push; no PR.
- Commit messages `type(scope): message`; no co-author line; no em dashes anywhere.
- Components only. No repository, sync-engine, schema, RLS, payload, or navigation changes.
- The worktree's `node_modules` is a symlink; never `npm ci`/`npm install`.
- If a step cannot be executed as written, apply the smallest faithful adaptation, record it, continue; flag behavior-affecting conflicts instead of guessing.

---

### Task 0: PRD progress entry (R8: tracking starts with the work, not after it)

- [x] Add the Development Progress checklist for this sprint to `PRD.md` (one line per task below). Tick it at each task boundary as you go.
- [x] Commit: `docs(prd): design-foundation progress checklist`

### Task 1: Group helpers move out (atomic, unblocks the sheet refactor)

**Files:** create `src/utils/groupHelpers.js`; modify `src/components/children/GroupPickerBottomSheet.js`, `src/screens/children/EditChildScreen.js`, `src/screens/children/ClassDetailScreen.js`, `__tests__/groupHelpers.test.js`, `__tests__/EditChildScreen.test.js` (its module mock).

- [x] RED: point `__tests__/groupHelpers.test.js` at `src/utils/groupHelpers` (fails: module not found).
- [x] GREEN: move `nextGroupNumber`, `compareGroups`, `getGroupColor` (and `GROUP_COLORS` usage) verbatim; update the three import sites and the `EditChildScreen.test.js` mock in the SAME commit.
- [x] Full unit suite green. Commit: `refactor(groups): move group helpers out of the picker component`

### Task 2: The `BottomSheet` primitive

**Files:** create `src/components/common/BottomSheet.js`, `__tests__/BottomSheet.test.js`.

**Produces:** the component the next three tasks consume.

- [x] RED: new suite pins the primitive's contract — renders `title`/`subtitle`/children when `visible`; renders nothing when not; backdrop press fires `onDismiss` and carries the `dismissLabel` a11y label; hardware back (`onRequestClose`) fires `onDismiss`; `headerExtras` renders between subtitle and body; `footer` renders below the body; `scrollable={false}` renders the body without a ScrollView; `keyboardAvoiding={false}` omits the KeyboardAvoidingView.
- [x] GREEN: implement with the canonical chrome from locked decision 1.
- [x] Commit: `feat(ui): shared BottomSheet primitive`

### Task 3: The three real sheets render through the primitive

**Files:** modify `src/components/children/GroupPickerBottomSheet.js`, `src/components/session/LetterTrackerBottomSheet.js`, `src/components/assessment/LastAttemptedBottomSheet.js`; `__tests__/GroupPickerBottomSheet.test.js` (ONE authorized edit: tighten the loose regex per R7) and `__tests__/LetterTrackerBottomSheet.plan5.test.js` (no edits). Apart from the R7 tightening and the new pins listed below, the existing assertions must pass unchanged.

- [x] RED: extend each sheet's suite (or add one for `LastAttemptedBottomSheet`, which has none) with a pin that its backdrop a11y label and dismiss wiring survive: "Dismiss group picker", "Dismiss letter tracker", "Dismiss last attempted selector". For `LastAttemptedBottomSheet` (R7): **backdrop press and Modal `onRequestClose` call `onCancel`; no visible Cancel button is added**; the footer's Confirm calls `onConfirm(selectedIndex)`. The primitive must receive `onDismiss={onCancel}` so both dismissal paths preserve the load-bearing cancel save.
- [x] RED (R7): tighten `GroupPickerBottomSheet.test.js`'s loose `/\+\s+Add Group 3/` to the exact string `'+  Add Group 3'`, so the double-space invariant cannot regress green.
- [x] GREEN: rewrite all three to render through `BottomSheet`, deleting their scaffolding and duplicated styles. `LetterTracker` passes its legend as `headerExtras` and `scrollable={false}`, and **its grid's own `paddingHorizontal: spacing.lg` is REMOVED** now that the primitive supplies it, so its tile math (`screenWidth - spacing.lg * 2`) stays valid with the padding applied exactly once (R4). `LastAttempted` passes its "Selected: ..." + Confirm row as `footer`, its centered grid via `bodyContentStyle`, its hidden scroll indicator via `scrollViewProps`, and `onDismiss={onCancel}`.
- [x] `LetterTrackerBottomSheet.plan5.test.js` passes **unmodified**; `GroupPickerBottomSheet.test.js` passes with only the R7 regex tightening.
- [x] Commit: `refactor(ui): sheets render through the shared primitive`

### Task 4: `SelectSheet` + the four class/child pickers

**Files:** create `src/components/common/SelectSheet.js`, `__tests__/SelectSheet.test.js`; modify `src/screens/children/CreateClassScreen.js`, `src/screens/children/EditClassScreen.js`, `src/screens/children/EditChildScreen.js` (its inline class picker); ADD the missing screen-level picker coverage (R6) to `__tests__/EditClassScreen.test.js` and `__tests__/EditChildScreen.test.js`; leave `__tests__/CreateClassScreen.test.js` unmodified (its option-text presses should reach the sheet; if they cannot, fix the sheet).

- [x] RED (`SelectSheet`): renders one row per option with its label and optional description; pressing a row fires `onSelect(key)` and (with no `confirmLabel`) dismisses; with `confirmLabel`, pressing a row highlights it and does NOT dismiss, and the footer button commits; **`cancelLabel` renders a visible Cancel that dismisses WITHOUT committing** (R3); **`emptyMessage` renders when `options` is empty** (R4); **`maxHeight` passes through to the primitive** (R4); the selected row carries `accessibilityState={{ selected: true }}`; rows are memoized (render-count spy: re-rendering the sheet with an unchanged option list re-renders zero rows).
- [x] RED (screens, R6: these conversions currently have NO screen-level proof): `CreateClassScreen.test.js`'s existing flow (press the field, press `'Sunrise Primary'` / `'Grade 1'` / `'isiXhosa'`) passes against sheets, unmodified. NEW: EditClass school selection sets both `schoolId` and `schoolName`; EditClass grade and language selection survive; EditChild class selection calls `updateChild(childId, { class_id })`; EditChild with zero classes shows "No classes available. Create a class first."; the visible Cancel survives on **CreateClass school and EditClass school only** (EditChild's picker has NO visible Cancel today, `EditChildScreen.js:317`, and must not gain one). Assert resulting state or repository calls, not merely that an option label renders. If a press cannot reach an option, fix the SHEET, not the test.
- [x] GREEN: implement `SelectSheet` (with `cancelLabel` and `emptyMessage`); convert the six school/grade/language dialog instances in CreateClass and EditClass (school pickers keep `cancelLabel="Cancel"`); convert `EditChildScreen`'s inline class picker (bespoke `classPicker*` styles die; "Dismiss class picker" label, the **60% `maxHeight`**, and the empty-state string all survive).
- [x] Commit: `refactor(ui): class and child pickers use the shared select sheet`

### Task 5: The session-form and assessment pickers

**Files:** modify `src/screens/sessions/LiteracySessionForm.js` (session reading level, per-child reading level), `src/screens/assessments/AssessmentChildSelectScreen.js` (language, two-step); ADD the new coverage (R6) to `__tests__/LiteracySessionForm.test.js` (the per-child id-carrying case) and to the assessment-launch suite (`__tests__/assessmentEntryRouting.test.js` or a new `AssessmentChildSelectScreen` suite; there is no existing language-dialog test).

- [x] RED: `LiteracySessionForm.test.js`'s existing flow (press `'Select a level'`, press `READING_LEVELS[0]`, form becomes dirty) passes against the sheet, unmodified. NEW (R6): the per-child picker commits against the CORRECT child id (open it for child B while child A is also selected, choose a level, assert only B's level changed) and keeps its visible Cancel. NEW for the assessment language sheet: tapping a language does NOT navigate; pressing `Start` navigates with the chosen language; **pressing Cancel and reopening RETAINS the drafted language** (today's behavior, R3).
- [x] GREEN: convert all three. The assessment language sheet uses `confirmLabel="Start"` plus `cancelLabel="Cancel"`; the session reading level is tap-to-select-and-close with no Cancel (matching today); the per-child reading level is tap-to-select-and-close with `cancelLabel="Cancel"` and keeps its `openChildLevelMenu` id-carrying visibility.
- [x] Commit: `refactor(ui): session and assessment pickers use the shared select sheet`

### Task 6: Capture chrome extraction

**Files:** create `src/components/assessment/AssessmentInstructions.js`, `CaptureHeader.js`, `EndAssessmentButton.js` (+ suites); modify `src/screens/assessments/LetterAssessmentScreen.js`, `SequentialAssessmentScreen.js`.

- [ ] RED: `AssessmentInstructions` renders the title, child name, "language - Attempt #N", each step in order, and fires `onStart`/`onCancel`; `CaptureHeader` renders the countdown, `"{pageLabel} {n} of {total}"`, and `total` dots with the active one marked; `EndAssessmentButton` fires the Alert with the exact copy ("End Assessment?", "End the assessment now and record current results?", Cancel + destructive End) and calls `onEnd` only on End.
- [ ] GREEN: extract; both capture screens consume the three components; the 16 duplicated style keys move with them.
- [ ] The existing capture suites (`expiry`, `plan5`, `renderCount`, `renderIsolation` for Letter; `expiry`, `renderCount` for Sequential) must pass **unmodified**, including the timer's render isolation.
- [ ] Commit: `refactor(assessment): extract shared capture chrome`

### Task 7: Roster virtualization (audit #8) — REVISED per R1 and R2

**Files:** modify `src/components/children/ChildSelector.js`, `src/screens/sessions/LiteracySessionForm.js` (root scroller becomes the roster FlatList; `handleChildrenChange` gets a `useCallback`); create `__tests__/ChildSelector.renderCount.test.js`.

**The two halves, per the revised spec section D:**
- **(a) The list becomes the form's only vertical scroller.** `LiteracySessionForm`'s outer `ScrollView` is replaced by the roster `FlatList`: everything currently above the roster moves into `ListHeaderComponent`, everything below it into `ListFooterComponent`. The visual layout and scroll feel must be unchanged (one continuous page). Set `initialNumToRender` and `windowSize` explicitly against the row height rather than taking the defaults. Do NOT nest a vertical list inside a vertical ScrollView (R1).
  - **CRITICAL (convergence review): the header and footer must be HOISTED, STABLE component types.** RN renders a component-valued header as `<ListHeaderComponent />`, so a render-local function is a NEW component type on every keystroke, which remounts the subtree and **drops focus from the comment TextInput mid-typing**. A `useCallback` keyed on `comments` is NOT sufficient. Define `FormHeader` and `FormFooter` at module scope and pass them as elements (`ListHeaderComponent={<FormHeader ... />}`) or as stable memoized types. Pin this with a test: typing several characters into the comment field keeps focus and preserves the text.
  - **Composition:** the search bar, the "Select by Group" menu, the roster, and the selected-child chips currently live together inside `ChildSelector` (`ChildSelector.js:61`), itself inside one Paper `Card` (`LiteracySessionForm.js:390`). Splitting them across header/items/footer needs an explicit Card-chrome strategy: the header carries the Card's top (and the search + group controls), the footer carries the chips and the Card's bottom. Keep the rendered card visually identical.
  - `LetterTrackerBottomSheet`, the picker sheets, and the Snackbar stay siblings OUTSIDE the list, exactly as they are outside the current ScrollView today.
- **(b) The row callback gets permanently stable identity.** `ChildSelector` keeps the current selection, the children lookup, and `onSelectionChange` in refs; `onToggle` reads those refs at press time and never changes identity; selection reaches rows through the scalar `isSelected` plus an explicit `extraData` (R2). No memo comparator that ignores the callback.

- [ ] RED (render counts, the instrument used for `LetterTile`): with a 60-child roster, selecting one child re-renders exactly ONE row; typing a character in the comment field re-renders ZERO rows. Both fail today, and (per R2) the one-row case will keep failing until `onToggle` is ref-backed. **Instrument `ChildSelectorRow`'s own render function, NOT `renderItem`** (FlatList may invoke `renderItem` without the memoized row actually re-rendering; counting those invocations would make the test lie).
- [ ] RED (focus, per the convergence review): typing several characters into the comment field keeps focus and preserves the typed text. This fails if the header/footer are render-local component types.
- [ ] GREEN: memoized `ChildSelectorRow` with scalar props only (`id`, `name`, `className`, `isSelected`, `onToggle`); class-name `Map` built once per render; ref-backed stable `onToggle`; `extraData`; `React.memo` on `ChildSelector`; the form restructured onto the FlatList root with header/footer components; `handleChildrenChange` wrapped in `useCallback`.
- [ ] `LiteracySessionForm.test.js` must pass unmodified (selection, dirty state, letter chips, reading-level picker, save). Restructuring the form is exactly the kind of change that breaks these; if one fails, fix the restructure, not the test.
- [ ] Report honestly: these tests prove the re-render cascade is dead. They do NOT prove native windowing. That is the device gate's job.
- [ ] Commit: `perf(sessions): virtualize the roster and stop the keystroke re-render cascade`

### Task 8: Wrap

- [ ] Full gates: unit and integration, exact counts reported.
- [ ] `documentation/LEARNING.md`: a short addendum on why the primitive plus a memoized scalar-prop row is the recipe (tie it to `LetterTile`), and why one dialog deliberately survived.
- [ ] PRD progress entry; tick this plan's checkboxes.
- [ ] Commit: `docs(design-foundation): wrap - checklists, learning note`

**Device gate (Jim, after merge):** open session capture with a real roster on a low-end Android and feel the difference; open every converted picker (school, grade, language, reading level, class, assessment language) and confirm it slides up as a sheet with the same options and the same outcome; run one full assessment in each capture mode; confirm the clock-in prompt still offers all three choices.
