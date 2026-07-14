# Design Foundation Spec: Shared BottomSheet, Capture Chrome, Roster Virtualization

**Date:** 2026-07-13
**Scope:** audit finding #8 (session-form roster performance) and roadmap item 12 (component APIs). This is the mini-spec the roadmap requires before item 12 is built.
**Why now:** Jim is about to do visual design work. Today the same modal scaffolding is copy-pasted four times, seven Paper `Dialog` pickers contradict the bottom-sheets preference, and the two capture screens duplicate their chrome. Designing on that foundation means doing every polish pass two or three times, and each new WelaPLUS capture pattern multiplies the cost.
**Explicitly out of scope:** the typography token rollout (roadmap item 15), any visual redesign, the group-centric feature, WelaPLUS patterns, and audit items #13/#16/#17/#21. This sprint changes structure, not looks, with the two deliberate exceptions named in section B.

## What the survey found (2026-07-13, verified in code)

- **Four** copies of the sheet scaffolding, not three: `GroupPickerBottomSheet`, `LetterTrackerBottomSheet`, `LastAttemptedBottomSheet`, and an **inline class picker in `EditChildScreen.js` (~L316-372)** that nobody had inventoried.
- The four have drifted: backdrop `absoluteFillObject` at 0.5 opacity vs `flex: 1` at 0.4; handle 36x4 vs 40x4; `colors.surface` vs `colors.background`; `borderRadius.lg` vs a literal `20`; `spacing.lg` vs `spacing.md` bottom padding; `KeyboardAvoidingView` present in one, absent in three; `maxHeight: '80%'` in one, absent in the others.
- **Ten** Paper `Dialog` instances across five files: **nine pickers** (three in CreateClass and three in EditClass for school, grade and home language; two reading-level pickers in LiteracySessionForm; the assessment language picker) and **one confirmation** (`ClockInBeforeSessionDialog`). With the inline EditChild sheet, that is **ten picker conversions**.
- The two capture screens share 16 byte-identical style keys, a character-identical "End Assessment?" alert, an identical timer/page-dots header (differing only in the word "Page" vs "Grid"), and an identical instructions shell (differing only in the step list).
- `ChildSelector` renders a `FlatList` with `scrollEnabled={false}` inside the form's `ScrollView` (`:99`, `:123`), which defeats virtualization completely. `renderItem` is inline, and it runs `classes.find(...)` per row.
- `nextGroupNumber`, `compareGroups`, and `getGroupColor` are **named exports of `GroupPickerBottomSheet`**, imported by `EditChildScreen`, `ClassDetailScreen`, `__tests__/groupHelpers.test.js`, and re-provided by `EditChildScreen.test.js`'s module mock.

## A. The BottomSheet primitive

**`src/components/common/BottomSheet.js`** owns all modal scaffolding. Every sheet in the app renders through it.

```js
<BottomSheet
  visible                 // bool
  onDismiss               // () => void, fired by backdrop tap and hardware back
  title                   // string
  subtitle                // string, optional
  dismissLabel            // string, a11y label for the backdrop (each caller keeps its existing copy)
  headerExtras            // node, optional; renders under the subtitle, above the body (LetterTracker's legend)
  footer                  // node, optional; pinned below the scroll area with a top border (LastAttempted's Confirm row)
  scrollable = true       // false renders the body in a plain View (LetterTracker's grid)
  keyboardAvoiding = true
  maxHeight = '80%'       // EditChild's class picker keeps its 60%
  bodyContentStyle        // contentContainerStyle for the scroll body (LastAttempted centers its grid)
  scrollViewProps         // e.g. showsVerticalScrollIndicator: false (LastAttempted)
>
  {children}
</BottomSheet>
```

`maxHeight`, `bodyContentStyle` and `scrollViewProps` exist because the four real sheets need them: without `maxHeight` the EditChild class picker would silently grow from 60% to 80%, and without the other two `LastAttempted` would silently regain a scroll indicator and lose its centered grid. A primitive that forces silent visual changes on its callers is the wrong primitive.

**Canonical chrome** (the majority shape, which three of the four already use): `absoluteFillObject` backdrop at 0.5 opacity, 36x4 handle, `colors.surface`, `borderTopRadius: borderRadius.lg`, `maxHeight: 80%`, `paddingBottom: Math.max(insets.bottom, spacing.lg)`, `paddingHorizontal: spacing.lg` on the content area, left-aligned title.

**Deliberate visual changes (the two exceptions to "structure, not looks"):** `LastAttemptedBottomSheet` currently diverges on backdrop opacity, background colour, corner radius, bottom padding, and a centered title. Those are drift, not design, and they get normalized to the canonical chrome. This is the consistency-full-rollout rule, not a redesign.

**Constraint to preserve:** `LetterTrackerBottomSheet` computes its tile size from `screenWidth - spacing.lg * 2`. The primitive's `spacing.lg` horizontal content padding keeps that arithmetic valid. Do not change the padding without changing that math.

## B. Pickers become sheets; the one confirmation stays a dialog

**`src/components/common/SelectSheet.js`**, built on `BottomSheet`, is the single-select list every picker uses.

```js
<SelectSheet
  visible onDismiss title subtitle dismissLabel
  options            // [{ key, label, description?, accessibilityLabel? }]
  selectedKey        // string | null
  onSelect           // (key) => void
  confirmLabel       // string, optional. Absent = tap-to-select-and-close (the common case).
                     // Present = two-step: tap highlights, footer button commits.
  cancelLabel        // string, optional. Renders a visible Cancel in the footer that dismisses
                     // WITHOUT committing. Four current pickers show a Cancel button, and the
                     // spec's "preserve every user-visible string" rule means backdrop dismissal
                     // is not an acceptable substitute for a control the user can see.
  emptyMessage       // string, optional. EditChild's class picker shows
                     // "No classes available. Create a class first."
/>
```

Rows are a memoized child component taking scalar props, so a 40-school list does not re-render on every keystroke elsewhere.

**Conversions: ten picker instances** (nine Paper `Dialog` pickers plus the inline `EditChildScreen` sheet). The count matters because it is the completion gate, and the first draft of this spec said "six" by counting picker *kinds* rather than *instances*:

| Picker (instances) | Sheet behavior |
| --- | --- |
| CreateClass: school, grade, home language (3) | tap-to-select-and-close; school keeps its visible `cancelLabel="Cancel"` |
| EditClass: school, grade, home language (3) | same; school keeps its Cancel, and selecting a school still sets both `schoolId` and `schoolName` |
| LiteracySessionForm: session reading level (1) | tap-to-select-and-close, no Cancel (matches today) |
| LiteracySessionForm: per-child reading level (1) | tap-to-select-and-close; keeps its `openChildLevelMenu` id-carrying visibility and its visible Cancel |
| AssessmentChildSelectScreen: assessment language (1) | **two-step: `confirmLabel="Start"` plus a visible Cancel.** Cancel must retain the drafted language for the next opening, which is today's behavior; pin it with a cancel-and-reopen test |
| EditChildScreen: the inline class picker (1) | tap-to-select-and-close; keeps its 60% height and its "No classes available. Create a class first." empty state, via `maxHeight` and `emptyMessage` |

The assessment language picker keeps its confirm step deliberately. Tapping it starts a 60-second timed assessment on a real child, so an accidental tap is expensive. Everything else is cheap to undo and should cost one tap, not two.

**`ClockInBeforeSessionDialog` stays a Paper `Dialog`.** It is a three-way *decision* ("Clock In Now" / "Continue Anyway" / dismiss), not a selection from a list. The standing preference is bottom sheets **over dialogs for pickers**; confirmations are the case dialogs are for. Converting it would be cargo-culting the rule past its purpose.

## C. Capture chrome extraction

Three components in `src/components/assessment/`, consumed by both capture screens:

- **`AssessmentInstructions`** — props `{ title, childName, language, attemptNumber, steps: string[], onStart, onCancel }`. Owns the whole pre-start shell. The two screens differ only in `steps` (5 grid steps vs 4 sequential steps) and `title`.
- **`CaptureHeader`** — props `{ getElapsedMs, pageLabel, currentPage, totalPages }`. Owns the `CountdownTimer` row and the page dots. `pageLabel` is `'Page'` for the grid and `'Grid'` for sequential, which is the only difference today.
- **`EndAssessmentButton`** — props `{ onEnd }`. Owns the trigger button and the exact Alert copy ("End Assessment?" / "End the assessment now and record current results?" / Cancel + destructive End). The copy is currently character-identical in both files, so it becomes a single source.

The 16 shared style keys move into the components that own them. `CountdownTimer`'s render isolation must survive: the timer still re-renders only itself, not the screen. The existing render-count tests are the guard.

## D. Roster virtualization (audit #8) — REVISED after the plan review

The failure has two independent halves, and the first draft of this section got both fixes wrong. The corrected design:

**Half 1: the list must be the only vertical scroller.** A `VirtualizedList` nested inside a same-axis `ScrollView` is explicitly warned against by React Native itself ("VirtualizedLists should never be nested inside plain ScrollViews with the same orientation because it can break windowing"), and bounding its height does not save it: with the default `windowSize` of 21, a six-row viewport still spans roughly 126 row-heights, so a 60-child roster stays entirely inside the render window. Nothing gets virtualized.

**Decision: `LiteracySessionForm`'s root scroller becomes the roster `FlatList` itself.** Everything above the roster moves into `ListHeaderComponent`, everything below it into `ListFooterComponent`. This is the officially supported pattern, it is what the audit itself suggested, and it **preserves the current visual layout and scroll feel exactly**: the form still reads as one continuous scrolling page. Set `initialNumToRender` and `windowSize` deliberately against the measured row height rather than accepting the defaults.

*(Design note for Jim, not this sprint: the other legitimate answer is to move child selection into its own full-height sheet, with the form showing only a summary of who is selected. That is a real UX improvement and it would reuse the primitive this sprint builds, but it is a design decision, not a performance fix, so it belongs in the redesign rather than here.)*

**Half 2: the row callback must have stable identity.** Memoizing a row is useless if it receives a function prop that changes on every selection. `onToggle` keyed on the selection Set gets a new identity every time a child is picked, so every mounted row would see changed props and re-render, and the "one row" assertion could never pass. A memo comparator that ignores the callback is not the answer either, because rows then hold stale selection closures.

**Decision: `ChildSelector` keeps the current selection, the children lookup, and `onSelectionChange` in refs.** Its `onToggle` has permanently stable identity and reads those refs at press time. Every row receives that same function. Selection changes reach rows through `isSelected` (a scalar) and an explicit `extraData` dependency, so only the toggled row re-renders.

The rest of the recipe stands:
- **A memoized row.** `ChildSelectorRow` is `React.memo`'d with **scalar props only** (`id`, `name`, `className`, `isSelected`, `onToggle`), the recipe that worked for `LetterTile`.
- **A class-name Map**, built once per render, replaces the per-row `classes.find(...)`.
- The form's `handleChildrenChange` is wrapped in `useCallback`, so typing a comment cannot change `ChildSelector`'s props.

**Proof:** render-count tests, the same instrument used for the letter grid. Selecting one child re-renders exactly one row. Typing a character in the comment field re-renders zero rows. Note honestly what these prove: they prove the re-render cascade is dead. They do **not** prove native windowing, which only a low-end Android device can show. The device gate covers that.

## E. Group helpers move out of the component

`nextGroupNumber`, `compareGroups`, and `getGroupColor` are domain helpers living inside a component file, imported by two screens and two test files. They move to **`src/utils/groupHelpers.js`** (a module that its own test file, `groupHelpers.test.js`, already implies should exist). Every import site and the `EditChildScreen.test.js` module mock update with it. This is mechanical, but it must be one atomic change or the mock breaks.

## F. What must not change

- **Every accessibility label is preserved verbatim**, including the four backdrop labels ("Dismiss group picker", "Dismiss letter tracker", "Dismiss last attempted selector", "Dismiss class picker"), the group row labels, the letter-tile mastery labels, and the `accessibilityState` flags. Several are directly test-pinned.
- **Every user-visible string is preserved**, including the literal double space in `"+  Add Group 3"`, which a test matches.
- **`LastAttemptedBottomSheet` keeps its `onConfirm`/`onCancel` pair.** Cancel is load-bearing: `LetterAssessmentScreen` saves with `lastTappedIndexRef` on cancel and with `selectedIndex` on confirm. It must not be collapsed into a generic `onDismiss`.
- **No behavior change in capture, sync, storage, or navigation.** No repository, sync-engine, schema, RLS, or payload changes. This sprint is components only.
- The existing suites that pin rendered text and a11y labels stay green **unmodified** wherever possible. A test that must change is a signal to re-read this spec, not to edit the test.

## G. Definition of done

- One shared `BottomSheet`, one `SelectSheet`, four sheets rendering through them, **ten picker instances converted**, one confirmation deliberately left as a dialog, capture chrome extracted, roster virtualized (form root scroller = the roster list), group helpers relocated.
- Render-count proofs for the roster (one row per selection, zero rows per keystroke) and preserved render isolation for the capture timer.
- Full unit and integration gates green.
- Device gate (Jim): open session capture with a real roster on a low-end Android and feel the difference; open every converted picker and confirm it slides up as a sheet with the same options and the same result; run one full assessment in each capture mode; confirm the clock-in prompt still behaves as a three-way decision.
