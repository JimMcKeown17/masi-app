# EGRA content pack integration (package and data side)

> **Status 2026-10-23 (after build):** Jim made two changes after this plan was built. (1) The four
> 40-letter Grade 1 letter cards are extended to 60 with fixed Masi letters, versioned
> `<form id>-masi60` (see `src/assessment-questions/egra/letterExtensions.ts`). This replaces the
> plan's "letter version = pack id" for those four forms. (2) Story questions auto-skip when the
> story scored 0 or was skipped, through the battery's `prerequisites`. See CONTEXT.md "EGRA form".

**Date:** 2026-10-23. **Branch:** `feat/egra-content-pack`, stacked on PR #98 (`content/egra-pack`).
**Design source:** Assessment Results spec §12 (`docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md`),
ADR-0009 (one type-agnostic write call), and the pack's `content/egra/README.md`.

## Goal

Make the 13 forms in `content/egra/` runnable as **additional** assessment options through the
existing package architecture, with no change to existing assessments, defaults, ids, saved
results or scoring. Each form becomes **one battery of four Questions**, built from item sets the
existing components already understand, plus one new comprehension component. The host run flow
(Assessments tab, form picker, run overview) comes from WelaPLUS Plan 3 (`feat/welaplus-plan-3`,
in progress). Wiring EGRA into it is a two-line follow-up after Plan 3 merges (see "Follow-up").

## Jim's decisions (2026-10-23)

| # | Decision |
|---|---|
| J1 | Build the package and data side now, and wire the host after Plan 3 merges. |
| J2 | **EGRA letters are `letter_sounds`.** "That letter sounds question is actually just the first part of the EGRA." EGRA letter results feed letter mastery, rankings, bands and "assessed" counts like any letter result. By the same reasoning, EGRA familiar words are `word_reading`. |
| J3 | Letters and words: a 60-second timer, the **EGRA first-row stop rule**, and the EA's End. The timer must stay optional (ECD and Grade R may run untimed later). |
| J4 | Comprehension is marked by the assessor: **Correct / Wrong / Not asked**. |

## Calls made in this plan (reported to Jim)

- **Identity mapping.** Every EGRA item set has:
  - `question_version` = the pack's assessment id (for example `dbe-egra-en-fal-2-v1`);
  - `item_set_id` = `${question_code}@${form.id}.${languageCode}`.

  An item's `position` is zero-based and `item_key = String(position)`, as in every existing letter
  and word set. The pack's one-based `item.id` equals `position + 1`. The adapter asserts this
  rather than assuming it. `(item_set_id, position)` therefore identifies (assessment, section,
  item), which is the pack's persistence rule.
- **Battery identity.** `battery_code = 'egra'` and `battery_version = form.id`. English HL and FAL
  are different forms, with different ids and batteries.
- **Passage and comprehension codes** are new: `oral_reading` and `reading_comprehension`.
- **Passage tokens.** Whitespace tokens of `passage.text`, with paragraphs split on `\n\n`.
  - A token with no letter or digit (the source's spaced `.` in `Lebo .`) is joined to the
    previous token for marking, so the tile reads `Lebo .`. The text itself is never changed.
  - `uNomehlo- mancinane` stays two tokens.
  - The **score is correct words and correct words per minute.** The printed
    `sourceReportedWordCount` and the diagnostic `whitespaceTokenCount` are never used as a
    denominator. `total_items` is the displayed token count.
- **Passage marking is `tap_wrong`.** The EA marks errors, as on the paper EGRA. Any word not
  tapped, up to the last word read, is correct.
- **No first-line rule for the passage.** The pack has no printed line breaks, so a "first line"
  would be invented. The passage uses its timer and End only.
- **Printed-count discrepancies.** The transcribed arrays are the content: 70 Afrikaans form-2
  letters and 60 English FAL form-2 words. `sourceReportedItemCount` is kept as provenance and
  never truncates or pads anything.
- **Practice items** appear in the EA instructions as "Practice first (not scored): …". They are
  never part of the item set or the result.
- **`maxScore`**: the comprehension component scores 1 per question. The adapter throws if any
  pack question has `maxScore !== 1`, so a future form cannot be scored silently with the wrong
  weight.
- **No comprehension prerequisite** (for example, auto-skip when the child read no words). The
  pack has no such rule, and the EA can mark questions Not asked. This is open for Jim.
- **isiZulu letter mastery.** `PEDAGOGICAL_ORDERS` has no `zu` order, so isiZulu letter results
  are stored and counted but yield no mastery cells until an isiZulu 26-letter order exists.
  This is the existing behaviour for unknown languages.

## Work

### A. Stop rule `first_row_all_wrong` (package)

- In `progress/stepByStep.ts`, `StopRule` becomes a union:
  `{ kind: 'consecutive_wrong'; stop_at: number } | { kind: 'first_row_all_wrong'; first_row_length: number }`.
  - After a forward decision, a first-row rule stops when `cursor === first_row_length` and every
    decision in `[0, first_row_length)` is `false`.
  - Back and undoStop behave exactly as for `consecutive_wrong`.
  - The `consecutive_wrong` behaviour must not change at all.
- `StopCard` copy depends on the rule:
  - consecutive: unchanged, "⟨Child⟩ got N in a row wrong. The test has stopped.";
  - first row: "⟨Child⟩ got every item in the first row wrong. The test has stopped."

  Pass the rule rather than `stopAt`, and update `SequentialCapture`.
- `contractTest/validateResult` takes `opts.stopRule?: StopRule`, and keeps `opts.stopAt` working
  as it does today. A first-row `stop_rule` result must:
  - have `last_attempted_position === first_row_length - 1`;
  - have items `0..first_row_length-1` all reached and wrong.
- Tests:
  - the first row all wrong stops at exactly its last item;
  - one correct item in the first row never triggers the stop, even with every later row wrong;
  - row widths 5, 6, 8 and 10;
  - Back and Undo after a stop;
  - a timer expiry before the first row ends is `timer`, not `stop_rule`;
  - validator cases;
  - the existing `consecutive_wrong` tests stay unchanged and green.

### B. EGRA adapter (package, `src/assessment-questions/egra/`)

- Import the catalog only through `content/egra/index.js`. The relative path from the package is
  `../../../content/egra`, and its types come from `content/egra/index.d.ts`. **Never edit
  `content/egra/`**: `npm run test:content` pins its SHA-256.
- `adaptEgraForm(form)` is pure and returns `{ form, battery, itemSets: { letter_sounds, word_reading, oral_reading, reading_comprehension } }`.
  - **letters** → the `LetterSoundsItemSet` shape:
    - `rows` = items chunked by `columns`, text unchanged;
    - `stop_rule: { kind: 'first_row_all_wrong', first_row_length: columns }`.
  - **words** → the `ReadWordsItemSet` shape:
    - `words[i] = { item_key: String(i), word: text }`;
    - `row_lengths` = `columns` repeated;
    - the same first-row stop rule.
  - **passage** → the `ReadPassageItemSet` shape, with `words` and `paragraph_starts`, tokenized as
    in the calls above.
  - **comprehension** → `ReadingComprehensionItemSet { passage, questions: [{ item_key: String(i), prompt: q.text, answer_guide: q.answerText }] }`.
  - **battery** → `{ battery_code: 'egra', battery_version: form.id, title: form.title, aboutMinutes: 6, languages: [form.languageCode], fixedLanguage: form.languageCode, prerequisites: {}, questions }`.
    - Plan 3 Task 6 adds an optional `fixedLanguage` to `BatteryConfig`, confirmed by the Plan 3
      session on 2026-10-23. When it is set, child select skips the class-language gate and runs
      every child in that language.
    - The four questions, in order, are:
      | `question_code` | title |
      |---|---|
      | `letter_sounds` | Letter sounds |
      | `word_reading` | Familiar words |
      | `oral_reading` | Reading a story |
      | `reading_comprehension` | Story questions |
    - Every question has `question_version: form.id` and `instructions: { [lang]: <EA instructions> }`.
    - The timed three have `durationSec: section.timeLimitSeconds` and
      `materials: { item: 'reading_card' }`.
    - Comprehension has no `durationSec` and `materials: null`.
    - Type it as `BatteryConfig & { title: string; aboutMinutes: number; fixedLanguage: string }`, with questions as
      `BatteryQuestion & { title: string }`. It must type-check on `main` (no `title` on the base
      types) and after Plan 3 adds them.
  - **Assertions.** It throws a `TypeError` naming the form for any of these; it never silently
    repairs:
    - ids not sequential `1..n`;
    - `items.length % columns !== 0`;
    - an empty text;
    - `maxScore !== 1`;
    - a letter item that is not exactly one Unicode letter.
- `egra/index.ts` exports these, built once at module load:
  - `EGRA_FORMS` (catalog order);
  - `egraFormFor(id)`, which is null when unknown;
  - `listEgraForms({ languageCode, variant })`, which delegates to the pack's `listEgraAssessments`;
  - `EGRA_BATTERIES` and `egraBatteryFor(code, version)`;
  - `egraItemSetFor(questionCode, questionVersion, language)`, which is null for any mismatch and
    never falls back.

  Re-export them from `src/assessment-questions/index.ts`.
- **`CURRENT_ITEM_SETS` and the standalone Letter Sounds and Word Reading defaults do not change.**

### C. `ReadingComprehensionQuestion` (package, new)

- `questions/ReadingComprehensionQuestion/{index.tsx,types.ts}`.
- Use the package `ui/` primitives and theme tokens only: no raw hex, and the package boundary
  rules apply. Follow the layout patterns of `ListenAndAnswerStoryQuestion`.
- **Intro.** `QuestionIntro` with the instructions, and Start labelled "Ask the questions". Start
  calls `props.onStart?.()` exactly once.
- **Active.**
  - A "Show story" secondary button opens a `FullScreenSheet` with the passage.
  - One card per question shows the prompt, a secondary line "Answer guide: ⟨answer_guide⟩", and
    three choices: **Correct / Wrong / Not asked**. Tapping a choice selects it, and tapping
    another changes it.
  - The answer guide is shown, never matched.
  - The bar has Finish and Skip (`ToggleBar` with `onSkip` → `SkipReasonPicker`).
  - Finish with unmarked questions opens a `ConfirmSheet`: "N questions not marked. Save them as
    Not asked?"
- **Result.**
  - There is one item per question:
    `{ position: i, item_key, prompt, response: 'correct'|'incorrect'|'not_asked', is_correct, metadata: { asked: boolean } }`.
  - `derived` holds:
    - `total_correct`;
    - `total_attempted` = the asked count;
    - `percent` = correct/asked rounded, or 0 when nothing was asked;
    - `last_attempted_position: null`, `was_timed: false`, `tracks_progress: false`;
    - `questions_asked`.
  - A skip emits `items: []`.
  - `question_code`, `question_version` and `item_set_id` come from the item set. There is no
    bundled fallback language: a missing or invalid item set renders `MissingItemSet`.
- **Registration.** In `battery/questionComponents.ts`, register:
  - `reading_comprehension` → `ReadingComprehensionQuestion`;
  - `oral_reading` → `ReadPassageQuestion` with `extraProps: { markingPolarity: 'tap_wrong' }`.
- **Fix in `ReadPassageQuestion`.** A marked word currently renders as `'correct'` even under
  `tap_wrong`. Make the tile state follow the polarity: marked + `tap_wrong` → `'incorrect'`. Its
  accessibility label follows too. `tap_correct` must not change, and WelaPLUS Q8 uses the default.
- Add a test fixture to `testFixtures/`.

### D. Tests through public interfaces (real SQLite where data is involved)

1. **Adapter, all 13 forms.**
   - Item counts equal the pack's arrays (920 letters, 990 words, 65 questions in total).
   - Rows and letter order, case and repeats are preserved exactly: compare a flattened `rows`
     to the pack items.
   - `position + 1 === Number(item.id)`.
   - Ids and versions follow the mapping.
   - English HL and FAL batteries are distinct.
   - `egraItemSetFor` and `egraBatteryFor` return null for unknown codes, versions or languages,
     and for a wrong language on a real form.
   - The `Lebo .` join, and that `uNomehlo-` stays separate.
   - Every passage token joined back equals the passage paragraphs with whitespace collapsed.
   - The source-note cases: AF2 has 70 letters, EFAL2 has 60 words.
2. **Synthetic results for every form × section** pass `validateResult` and the family
   `assertSubmitShape` after `saveQuestionResult`. Build them by rendering the real components,
   or with a small pure builder that mirrors each component's output and is checked against a
   rendered result for one form.
3. **Component tests** (RNTL) for `ReadingComprehensionQuestion`:
   - three states;
   - changing a choice;
   - the unmarked confirm;
   - skip;
   - `onStart` called once;
   - no automatic grading: typed or matching text never changes a mark.

   For the letters and words of one EGRA form: a first-row stop through the real component,
   timed and untimed (`durationSec` undefined → `was_timed: false`, a valid result). For
   `ReadPassageQuestion` `tap_wrong`: the tile state and the result.
4. **Real-SQLite run integration**, one new test file mirroring `__tests__/batteryRunsRepository.test.js`.
   It uses English FAL 2 and covers:
   - `startRun` with `batteryCode 'egra'`, the form version and language `en`;
   - saving letters (`stop_rule`), words (`timer`), passage (`ea_ended`) and comprehension
     (mixed states) through `assessments.saveQuestionResult({ batteryRunId })`;
   - "resume": build fresh repositories on the same database and check that `getRunWithResults`
     returns the 4 decided Questions with items in order;
   - `finalizeRun`;
   - the outbox holds 1 `battery_runs` row and 4 `assessments` family rows, every one still
     `pending` (offline: nothing dispatched);
   - each family round-trips through `toSubmitArgs` with item counts equal to `total_items`;
   - letter mastery: `latestLetterResult` for `en` returns the EGRA letter result, and
     `computeAssessmentMastery` marks a letter mastered only when every reached occurrence is
     correct.
5. **Regression.**
   - The existing Letter Sounds and Word Reading standalone tests are unchanged.
   - `CURRENT_ITEM_SETS` is unchanged (snapshot of ids).
   - The WelaPLUS battery is unchanged.
   - The boundary test and `npm run test:types` pass.

### E. Dev Question gallery

- Add EGRA entries to `src/utils/questionGallery.js`:
  - one per form × section, `entryKey: egra:<formId>:<question_code>`;
  - title `⟨form.title⟩ · ⟨section title⟩`;
  - each entry carries its `itemSet`, `durationSec`, `instructions` and the fixed form language.
- `QuestionGalleryRunScreen` uses `entry.itemSet` when present.
- `QuestionGalleryScreen` groups or labels them so the list stays usable. It offers only the
  form's language for an EGRA entry.
- The gallery never saves. Update `__tests__/questionGallery.test.js` and
  `__tests__/QuestionGalleryScreen.test.js`.

## Non-goals

- Host screens: the Assessments tab, child select, run overview, run summary and navigation. They
  belong to Plan 3 and the follow-up.
- Supabase migrations, RLS, sync engine, outbox, pull: none are needed (ADR-0009).
- Score-band rows for `oral_reading` or `reading_comprehension`.
- Any change to `content/egra/`.

## Follow-up after Plan 3 merges

1. Add `...EGRA_BATTERIES` to Plan 3's `BATTERIES`, and make `bundledItemSetFor` fall through to
   `egraItemSetFor`.
2. Host: a form picker for the 13 forms (English HL and FAL kept distinct).
   - It navigates to `AssessmentChildSelect` with `{ batteryCode: 'egra', batteryVersion: form.id }`.
   - The run language is fixed by `fixedLanguage`, so an English FAL run is valid in an isiXhosa
     class.
   - Child select uses `useAssessableChildren()` from `feat/whole-class-assessment`: "Your
     children", then "Rest of the class".
3. A device gate:
   - one form through selection, capture, save, force-quit resume and finalize;
   - offline, then sync;
   - the results screens.

## Verification commands

```
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest src/assessment-questions
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:types
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:content
```
