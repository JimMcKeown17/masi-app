# Code map: how every Question marks today (2026-10-25)

Read-only map produced for `2026-10-25-step-by-step-capture-design.md` (Appendix A). Point-in-time evidence; do not update.

# Step-by-step capture across WelaPLUS and Full EGRA: synthesis of read-only findings

**Tree read:** `.claude/worktrees/list-refresh` is at HEAD `c88bfd3`, on branch `fix/lists-keep-rows-on-refresh`. Its tree is identical to `4b3efd6` (`git diff 4b3efd6 HEAD` is empty).

**Drift you should know about.** The local `origin/main` ref has moved on to `9708186`, "Full EGRA beside WelaPLUS: form picker on the Assessments tab (#104)". `4b3efd6` is an ancestor of it. Under `src/assessment-questions/`, #104 changes only:
- `battery/registry.ts`: now `[WELA_PLUS_FULL_2024_1, ...EGRA_BATTERIES]`
- `battery/bundledItemSets.ts`: falls back to `egraItemSetFor`
- `battery/__tests__/registry.test.ts`

So the input claim that "EGRA reaches only the dev Question Gallery" is **true on 4b3efd6 but stale on the current origin/main**. On 9708186, EGRA batteries run through the real host (`BatteryQuestionScreen`). Question components are byte-identical between the two commits.

---

## 1. Summary table

"Finish confirm" means the `"<N> items unmarked — finish anyway?"` sheet unless stated otherwise.

| Component | Used by | Response type | Capture today | Blank means | Timed | Stop rules | Finish confirm |
|---|---|---|---|---|---|---|---|
| LetterSoundsQuestion → SequentialCapture | WelaPLUS Q1; EGRA letters; quick test Letter Sounds | Oral, one letter at a time, from a card | **Step-by-step** Correct/Incorrect; Back rewinds; no flip (`SequentialCapture.tsx:180-197`) | Not possible before the cursor. After the cursor: `is_correct:false, reached:false`, excluded from `total_attempted` (`SequentialCapture.tsx:74-80`) | 60 s (WelaPLUS, quick test); `letters.timeLimitSeconds` (EGRA) | `consecutive_wrong` 10 (`letter_sounds@2026.2.en.ts:10`); EGRA `first_row_all_wrong` (`egra/adapter.ts:54-57`) | "End the test?" on every End (`SequentialCapture.tsx:202-210`) |
| ListenAndAnswerStoryQuestion | WelaPLUS Q2 | Oral answers to a story read by the EA; all 5 prompts in one list | Toggle-correct (`index.tsx:232`) | `is_correct:false`, counted in `total_attempted` (`index.tsx:120,123`) | No | None | Yes (`index.tsx:170-176,251`) |
| ListenFirstSoundQuestion | WelaPLUS Q3 | Oral; all 10 prompts in one list | Toggle-correct (`index.tsx:198`) | false, counted (`index.tsx:97-104`) | No | None | Yes (`index.tsx:151-157,216`) |
| ListenPhonemeBlendQuestion | WelaPLUS Q4 | Oral; all 8 prompts in one list | Toggle-correct (`index.tsx:206`) | false, counted (`index.tsx:103-111`) | No | None | Yes (`index.tsx:159-165,225`) |
| LetterWritingFromPicturesQuestion | WelaPLUS Q5 (`paper_marked`) | Written on paper, scored afterwards; grid of 26, 12 per page | Toggle-correct (`index.tsx:244`) | false, counted, `total_attempted = 26` (`index.tsx:142-149`) | No | None | Yes (`index.tsx:196-202,272`) |
| ReadWordsQuestion **grid** | WelaPLUS Q6 (`extraProps {}`, `questionComponents.ts:29`) | Oral reading from a card; paged grid | Toggle; `markingPolarity` defaults to `tap_correct` | Up to the last-attempted marker: false (or true under `tap_wrong`). After it: false with `reached:false` (`applyProgress.ts:6-11`) | 60 s | None in code; "5 in a row" exists only as instruction text (`wela_plus_full.ts:28`) | LastAttemptedSheet, no unmarked sheet (`index.tsx:273-290`) |
| ReadWordsQuestion **sequential** | EGRA "Familiar words"; quick test Word Reading (`questionComponents.ts:35`) | Same as above | Step-by-step (SequentialCapture) | Same as LetterSounds | 60 s / `words.timeLimitSeconds` | EGRA `first_row_all_wrong` (`adapter.ts:58-62`); quick-test set has none | "End the test?" |
| ReadSentencesQuestion | WelaPLUS Q7 | Oral reading; about 20 words as pills, grouped by sentence | Toggle; `tap_correct` default (`index.tsx:112`). Under `tap_wrong` a tapped tile still renders `correct` (`index.tsx:290`) | false, counted; `total_attempted = items.length` (`index.tsx:163-178`) | No | None | Yes (`index.tsx:242-248,308`) |
| ReadPassageQuestion | WelaPLUS Q8 (`tap_correct`); EGRA `oral_reading` (`tap_wrong`, `questionComponents.ts:23`) | Oral reading of continuous text; every word visible | Toggle with polarity (`index.tsx:154-155,298`) | Before the cutoff: false under `tap_correct`, **true** under `tap_wrong`. After it: false with `reached:false` (`index.tsx:149-160`) | 60 s | None (no `stop_rule`, `adapter.ts:75`) | LastAttemptedSheet (`index.tsx:276-292`) |
| WriteCvcsQuestion | WelaPLUS Q9 (`paper_marked`) | Written on paper, scored afterwards; one item per letter, grouped by word (12 en / 18 xh) | Toggle-correct (`index.tsx:262`) | false, counted (`index.tsx:138-152`) | No | None | Yes (`index.tsx:214-220,281`) |
| WriteSentencesFromDictationQuestion | WelaPLUS Q10 (`paper_marked`) | Written on paper, scored afterwards; one item per word (15 en / 9 xh) | Toggle-correct (`index.tsx:269`) | false, counted (`index.tsx:145-156`) | No | None | Yes (`index.tsx:221-227,287`) |
| ReadingComprehensionQuestion | EGRA "Story questions" only | Oral answers; all 5 cards in one list | **Explicit three states**: Correct / Wrong / Not asked (`index.tsx:12-16`) | Saved as `not_asked`, `asked:false`, left out of the denominator (`index.tsx:40-57`) | No | Battery prerequisite: skipped if `oral_reading` score < 1 (`adapter.ts:94-96`, `evaluateBatteryState.ts:14`) | "N questions not marked. Save them as Not asked?" (`index.tsx:90-92`) |
| StoryWritingRubricQuestion (**excluded by the goal**) | WelaPLUS Q11 | Paper story scored on a rubric of 4 dimensions × 1–4 | Score chips | Dimension left out of `items[]`; Finish gives `ea_ended` (`index.tsx:174-175,260-266`) | No | None | "N dimensions unscored — finish anyway?" (`index.tsx:347`) |
| NullQuestion | Registry and gallery only | None | None | n/a | No | None | None; completes on mount (`index.tsx:7-25`) |

**Already done for one of the goals.** EGRA comprehension already has the target "Not asked" state: `asked:false` and score = correct/asked (`ReadingComprehensionQuestion/index.tsx:40-57`). The gap is layout (all cards at once, no Back). WelaPLUS Q2 has no Not-asked state.

---

## 2. EA-facing marking instructions and where they live

Item sets carry **no** EA instructions. All marking copy is in the battery file, the EGRA adapter, the quick-test registry, or fixed strings inside components.

**`src/assessment-questions/battery/wela_plus_full.ts`**
- `:4` `MARK` = "If the child gets an item correct, tap it (it turns green). If they get it wrong, leave it blank." It is appended to Q3 (`:15` en, `:16` xh, with the English sentence also in xh), Q4 (`:20`, `:21`) and Q6 (`:28`).
- Q1 `:10`: "…Mark each letter Correct or Incorrect. The test stops by itself after 10 wrong in a row. Otherwise STOP at 1 minute."
- Q2 `:12`: story-reading script only, no marking guidance.
- Q5 `:25`: "…If the child does not know a letter, say: 'Don't worry, just leave it blank…' When the child has finished, mark each cell here from their sheet." Here "leave it blank" is about the child's paper.
- Q6 `:28`: "…${MARK} STOP immediately if the child gets 5 in a row wrong, or clearly does not know any. Otherwise STOP at 1 minute." Nothing in code enforces the stop.
- Q7 `:31`: "…Tap each word they read correctly."
- Q8 `:34`: "…Tap each word they read correctly. STOP at 1 minute, then mark the last word they attempted."
- Q9 `:37`: "…Tap each letter the child wrote correctly."
- Q10 `:40`: "…Tap each word the child wrote correctly."
- Q11 `:43`: "…Then score the story here."
- en and xh share one text through `both()` (`:5`) for every question except Q3 and Q4.

**`src/assessment-questions/egra/adapter.ts`**
- `:82-83` letters and words: "Ask the child to read the {noun} in order. Mark each item Correct or Incorrect. Stop if every item in the first row is wrong. End when the child finishes." plus optional practice items. This conflicts with the 60 s timer, and "Stop if" describes a stop the app makes automatically.
- `:100` oral_reading: "Ask the child to read the story aloud. Tap words read incorrectly. At the timer or End, mark the last word read."
- `:101` comprehension: "Ask the story questions. Use the answer guide to mark each answer Correct, Wrong or Not asked." Note "Wrong" here, against "Incorrect" in `:83`.

**`src/utils/assessmentRegistry.js`** (quick tests, one string not keyed by language)
- `:32-36` Letter Sounds: "Tap Start… The highlighted letter… Tap Correct or Incorrect… Tap Back to fix a mistake. After 10 wrong in a row, the test stops."
- `:43-46` Word Reading: the same, without the stop line.

**Fixed copy inside components**
- `ui/ActionBar.tsx:20-26`: Correct, Incorrect, Back, End test, Skip question. `:32-41`: ToggleBar primary button and Skip question.
- `progress/SequentialCapture.tsx:203`: "End the test?" / "End test" / "Cancel".
- `progress/StopCard.tsx:13-17`: "⟨child⟩ got N in a row wrong. The test has stopped." / "…got every item in the first row wrong…" / "Save result" / "Undo last mark".
- `progress/LastAttemptedSheet.tsx:34-35,51-57`: "Last item attempted" / "Tap the last item the child attempted." / "Reached the end" / "Nothing attempted" / "Cancel" / "Confirm".
- `${N} items unmarked — finish anyway?` / "Yes, finish" / "Cancel", never pluralised, in:
  - ListenAndAnswerStory `:251`
  - ListenFirstSound `:216`
  - ListenPhonemeBlend `:225`
  - LetterWriting `:272`
  - ReadSentences `:308`
  - WriteCvcs `:281`
  - WriteSentencesFromDictation `:287`
- ReadingComprehension `:60` "Ask the questions", `:78` "Answer guide: …", `:90-92` "N question(s) not marked. Save … as Not asked?" / "Save as Not asked". This sheet is pluralised.
- Accessibility-label patterns that tests depend on:
  - `"<prompt>, idle|correct"` on toggle questions
  - `"<prompt>, current|correct|incorrect|not reached"` (`SequentialCapture.tsx:185`)
  - `"<word>, idle|correct|incorrect"` (ReadPassage `:298-306`)

**Polarity mismatch.** `MARK` does not change with `markingPolarity`. A server-side tap-wrong mode for WelaPLUS would need mode-aware copy for Q8: today's "Tap each word they read correctly" (`wela_plus_full.ts:34`) would become wrong.

---

## 3. Shared machinery

### Reusable as is
- **`progress/stepByStep.ts`.** The reducer is item-agnostic and works only on positions and `totalItems` (`:28-70`). It handles untimed and timed runs, and `null` or both stop-rule kinds (`:1-3,44-47`).
- **Undo re-opens a stopped run.** `undoStop` deletes the triggering decision, sets `stopped:false` and adds 1 to `correctionCount` (`:55,59-68`). Back is a no-op while stopped (`:52`).
- **SequentialCapture.** These all work unchanged:
  - clock, pause and deadline shift (`:104-137`)
  - End sheet (`:149-154,202-210`)
  - Skip picker gated by `allowSkip` (`:194-197`)
  - one-terminal guard (`:68-70`)
  - result builder (`:68-102`)
- **`ui/MarkTile.tsx`** already renders `correct` and `incorrect` as a pressable button whenever `onPress` is passed (`:69-71`).
- **`ui/ConfirmSheet.tsx`** and **`skip/SkipReasonPicker`**.

### Must be generalised
1. **Flip action.** There is no reducer action to set a decision at an arbitrary position. The actions are only `decide`, `back` and `undoStop` (`stepByStep.ts:13-16`). A flip must recompute `stopped` and `maxConsecutiveWrong`, and must decide whether it counts toward `correctionCount`.
2. **First-row rule.** `first_row_all_wrong` is evaluated only inside `decide`, at the moment `cursor === first_row_length` (`stepByStep.ts:46-47`). A flip on a row-1 item must clear `stopped` explicitly. Undo gets this via `stepByStep.ts:67`, and nothing else re-evaluates the rule.
3. **Covered grid while stopped.** When `state.stopped`, the main view is `pointerEvents='none'` and hidden from accessibility (`SequentialCapture.tsx:169-173`). Tiles **cannot be tapped while the stop card is up**. Flipping row-1 to re-open a stopped run therefore needs either an uncovered grid or a flip control on the StopCard. `StopCard.tsx:12-17` has only Save and Undo.
4. **Tiles are display-only.** No `onPress` is passed (`SequentialCapture.tsx:186`). Tests pin zero buttons in the grid (LetterSounds `test.tsx:341`; ReadWords `stepByStep.test.tsx:123`). `MarkTile` `accessibilityState` reports only `selected` for `current` (`MarkTile.tsx:61`).
5. **Decisions are a prefix.** Decisions always cover exactly `[0, cursor)` and `total_attempted = cursor` (`SequentialCapture.tsx:79`). The invariant survives a flip only if flips are limited to `position < cursor`.
6. **`onItemMarked`** fires only on `decide` (`SequentialCapture.tsx:140-145`). Flip semantics for it are undefined.
7. **Renderer.**
   - `testIDPrefix: 'letter'|'word'` is used both as the PagedGrid variant and the MarkTile variant (`SequentialCapture.tsx:38,178,186`).
   - `PagedGrid` accepts only `letter|word|picture` (`ui/PagedGrid.tsx:22`), and `GRID_TILE_HEIGHTS` has no `promptCard` (`MarkTile.tsx:18`).
   - There is no pill, wrap or grouped layout for sentences, passages, CVC letters or dictation words.
8. **Item shape.** `SequentialItem` is `{item_key, prompt, row}` only (`SequentialCapture.tsx:15-16`). There is no gloss, answer guide or metadata such as `word`, `sentence_index` or `letter_index` (contrast `WriteCvcs/index.tsx:140-150`, `ListenPhonemeBlend/index.tsx:108`).
9. **Intro and extra controls.** `QuestionIntro` gets no children (`SequentialCapture.tsx:157`), so the story text cannot go there. ListenAndAnswerStory puts it in its intro at `index.tsx:183-193`. There is also no slot for "Re-read story" or "Show story" (`ListenAndAnswerStory/index.tsx:218-225`; `ReadingComprehension/index.tsx:72-75`).
10. **Page label.** It always reads "Card row …" (`ui/paginate.ts:70-75`).
11. **End button.** It is always shown, with fixed copy (`ActionBar.tsx:26`; `SequentialCapture.tsx:203`).
12. **Third state.** There is no "Not asked" option in DecisionBar or the reducer, whose decisions are `Record<number, boolean>` (`stepByStep.ts:7`). EGRA comprehension needs a third value per item.
13. **Toggle hook.** `useToggleMark` is a binary Set (`hooks/useToggleMark.ts:3-23`), shared by every toggle question. It cannot represent "decided incorrect" as distinct from "undecided".
14. **Polarity.** `markingPolarity` is defined separately in three files (ReadWords `:35`, ReadSentences `:31`, ReadPassage `:29`). There is no polarity concept in step-by-step.

### Server-side mode seam (WIRING input, confirmed)
- `BatteryQuestion` has no `captureMode` or `markingPolarity` field (`types/BatteryConfig.ts:3-11`).
- `extraProps` are hard-coded per `question_code` (`questionComponents.ts:21-41`) and merged at `BatteryQuestionScreen.js:125`.
- The only server-delivered setting is `programmes.default_battery_code`/`_version` (`supabase/migrations/20261021120000_assessment_results_contract.sql:90-101`).
- `capture_mode` is constrained to `grid | sequential` in Supabase (`20260618120000_masi_assessments_capture_mode.sql:17-18`) and in SQLite (`src/db/migrations.js:580-583`). A third value such as tap-wrong would need a migration in both.

### 2026-10-21 capture-style spec decisions this change amends
All in `docs/superpowers/specs/2026-10-21-assessment-capture-style-design.md`:
- §2 non-goal: "No change to marking behaviour, scoring, the stop rule, timing, result shapes…" (`:51-52`).
- §6 pattern table: the toggle and last-attempted patterns for Q2–Q10 and EGRA (`:237-251`).
- Free-toggle tile rule: two states, no current outline, no incorrect fill (`:253-255`).
- §4 paging: page controls are left to the builder for free-toggle questions (`:172-174`, `:372`). "Sentence, passage, dictation and CVC Questions do not page" (`:181-182`).
- Toggle ActionBar layout and the "n items unmarked — finish anyway?" sheet (`:227,230`).
- LastAttemptedSheet / applyProgress for Q6 and Q8 (`:234,268,241-242`).
- **Frozen behaviour** (`:261-271`, confirmed): `progress/stepByStep.ts`, the stop rule and stop-card copy, `clock.ts`, `applyProgress.ts`, the Countdown tick, "every Question's `Result` output", and timing refs and phase transitions.
- **Allowed SequentialCapture changes** (`:273-277`): only layout, deriving the page from the cursor, and removing auto-scroll.
- §3.2 action area: Correct/Incorrect/Back/End is specified only for the letter and word tests; the pinned copy includes "Finish" and "Yes, finish" (`:112-125`).
- §3.1: "Back clears the previous decision… becomes current with no fill" (`:83`, `:382-383`).
- ListenAndAnswerStory: story in the intro, accepted answers shown as a gloss (`:248`).
- §8 verification and device-gate lists (`:310-329`).

---

## 4. Per-component conversion notes

### Already step-by-step
- **LetterSounds (WelaPLUS Q1, EGRA letters, quick test).** Missing only flip on decided items and the row-1 re-open path through a covered grid (§3, items 1–5).
- **ReadWords sequential (EGRA words, quick test).** Same gaps as LetterSounds; the engine is shared.

### Straightforward conversion
These are untimed oral items, one decision each, with no stop rule.
- **ListenFirstSound (Q3, 10 items)** and **ListenPhonemeBlend (Q4, 8 items).** Both need a promptCard renderer. Q4 also needs a carrier for `metadata.word`, today on every item (`ListenPhonemeBlend/index.tsx:108`).
- **ReadWords grid → sequential for WelaPLUS Q6.** The component path already exists; the switch is `extraProps` (`questionComponents.ts:29` vs `:35`).
  - **Decision needed:** whether to add `stop_rule {consecutive_wrong, stop_at:5}` to `wela_plus_read_words`, and so a new item-set version, or keep "5 in a row" as instruction text.

### Needs a design decision
- **ListenAndAnswerStory (Q2).** Decision needed: whether to add a "Not asked" state, as EGRA comprehension has; and where the story and Re-read live (blockers 3, 4 and 9 in §3).
- **ReadingComprehension (EGRA).** Decision needed: how a three-state item maps onto step-by-step with a flip. Flip cycles three values, or flip is not allowed for "Not asked".
- **LetterWriting (Q5, paper, 26 items in a 12-per-page grid that "mirrors the paper sheet", `index.tsx:4`).** Decision needed: step through cells in sheet order, or keep a grid that shows a current cell.
- **WriteCvcs (Q9, per letter, grouped by word).** Decision needed: what one step is, a letter or a word, and how word context is shown on each step.
- **WriteSentencesFromDictation (Q10, per word, grouped by sentence).** Decision needed: one word per step or a cursor inside the visible sentence rows, and how sentence context is shown.
- **ReadSentences (Q7, per word, grouped by sentence).** Decision needed: the same word-vs-sentence step choice, and how to handle a public `tap_wrong` prop that no caller uses (`index.tsx:31`; exported at `src/assessment-questions/index.ts:7`).
- **ReadPassage (WelaPLUS Q8 `tap_correct`; EGRA `tap_wrong`).** Decisions needed:
  - whether step-by-step with a cursor replaces LastAttemptedSheet;
  - where the server-side tap-wrong mode is configured, given no server-config path exists today;
  - what a reached-but-undecided word means in tap-wrong mode.
- **StoryWritingRubric (Q11).** Excluded by the goal. Already "re-pick" by design; nothing needed.
- **NullQuestion.** No change. It must stay exempt from any required shell; it never calls `onStart` (`index.tsx:7-23`).

Side observation: every toggle component ignores `allowSkip` and always shows Skip. In `questions/*/index.tsx`, only ReadingComprehension reads it (`index.tsx:88`), and SequentialCapture honours it (`:194`). The quick-test screen passes `allowSkip={false}` (`StandaloneTestScreen.js:60`).

---

## 5. Data-meaning risks

1. **Blank-as-wrong becomes not-reached.**
   - All seven confirm-sheet toggle questions save an untouched item as `is_correct:false` and count it as attempted: `total_attempted = items.length` or `prompts.length`. References: ListenFirstSound `:97-104`, ListenPhonemeBlend `:103-111`, ListenAndAnswerStory `:120-123`, LetterWriting `:146-149`, ReadSentences `:177-178`, WriteCvcs `:144,152`, WriteSentences `:155-156`.
   - SequentialCapture saves unreached items as `reached:false` and leaves them out of `total_attempted` (`:74-80`).
   - So an early End changes `total_attempted`, `percent` and the meaning of `false` against rows already saved.
2. **The `tap_wrong` default is true.**
   - EGRA `oral_reading` saves untouched words before the cutoff as correct (`ReadPassage/index.tsx:155`).
   - Under explicit decisions those words become undecided, so the score definition changes.
   - The EGRA prerequisite gate reads that score: comprehension is skipped if score < 1 (`adapter.ts:95`; `evaluateBatteryState.ts:14`).
   - Host score = `derived.ea_rubric_total ?? derived.total_correct` (`assessmentsRepository.js:154`), which ties the gate to `total_correct`.
3. **`last_attempted_position`.**
   - Toggle questions emit `null` (e.g. ListenFirstSound `:126`; ReadingComp `:57`), except ReadSentences, which emits `items.length-1`.
   - SequentialCapture emits `cursor-1` (`-1` when nothing was marked).
   - `validateResult.ts:116-143` requires a non-null value when `stopped_reason==='timer'` or `was_timed`, and an integer in `[-1, items.length)` when `tracks_progress`.
4. **Stop-rule contract.** The validator requires, for `first_row_all_wrong`, that `last_attempted_position === width-1` and every first-row item is `reached:true, is_correct:false` (`validateResult.ts:166-176`). For `consecutive_wrong`, the last `stop_at` reached items ending at `last_attempted_position` must all be wrong (`:145-163`).
   - Any flip that leaves `stopped_reason:'stop_rule'` with a row-1 item now correct would fail the contract.
   - Flip must therefore clear the stop, or prevent Save.
5. **`capture_mode`.**
   - Toggle questions save `null` (`BatteryQuestionScreen.js:91`).
   - Converting makes them `'sequential'`, adding `correction_count` and `max_consecutive_wrong` (`SequentialCapture.tsx:97-99`).
   - A server tap-wrong mode cannot be expressed: the CHECK allows only `grid|sequential` (`migrations.js:580-583`; Supabase `20260618120000…sql:17-18`).
6. **"Asked" metadata.**
   - Only ReadingComprehension writes `metadata.asked` and `derived.questions_asked` (`index.tsx:42,57`).
   - A repository test asserts ListenAndAnswerStory items have no metadata (`__tests__/assessmentsRepository.questionResults.test.js:258-261`).
   - The battery summary denominator is `derived.max ?? derived.questions_asked ?? total_items` (`src/utils/batteryRun.js:47`), so adding `questions_asked` elsewhere changes the displayed "X / Y". `questions_asked:0` would show "0 / 0".
7. **`total_items`.** It is `items.length` (`assessmentsRepository.js:155`). SequentialCapture keeps unreached items, so N is unchanged. Results screens fall back to `items.filter(reached !== false)` when `total_attempted` is missing (`AssessmentResultsScreen.js:60`; `AssessmentDetailScreen.js:50`).
8. **Derived fields that depend on denominators.**
   - `per_sentence_percent` uses every word in a sentence (`ReadSentences/index.tsx:139-151`).
   - `per_word` (WriteCvcs `:157-165`) and `per_sentence` (WriteSentences `:161-173`) use their own totals.
   - `correct_words_per_minute` uses `total_correct / elapsed` (`ReadPassage/index.tsx:162-170,189-191`).
   - All of these change if undecided items stop counting as false.
9. **Item identity.** `assessment_items` ids derive from `position` plus `is_correct` (`domainRepositoryUtils.js:20-30`, used at `assessmentsRepository.js:167`). Positional keys must stay, because `item_key` repeats in several sets (e.g. `wela_plus_read_words.en.ts:10`; repeated-key tests in each toggle component).
10. **Frozen Result output.** The spec freezes "every Question's `Result` output" (`spec:261-271`), so every point above amends that decision.

---

## 6. Test surfaces needing updates

**Shared engine**
- `progress/__tests__/stepByStep.test.ts`, `SequentialCapture.renderCount.test.tsx`, `firstRow.test.ts`.
- LetterSounds: `test.tsx:223-247` (Back rewind, correction count, `onItemMarked`), `:341` (no grid buttons), `:422-432`.
- ReadWords: `stepByStep.test.tsx:123` (no grid buttons), `:143-194`.
- `egra/__tests__/capture.test.tsx` (comprehension path `:64-79`, which relies on "Save as Not asked").
- `test-support/egraResults.js:2-34`, which duplicates the comprehension Result shape.

**Per component** (unit test plus contract test)
- ListenAndAnswerStory: `test.tsx:63-269,479-658`; `contract.test.tsx:7-62`.
- ListenFirstSound: `test.tsx:25-146,292-406`; `contract.test.tsx:7-51`.
- ListenPhonemeBlend: `test.tsx:40-373`; `contract.test.tsx:7-42`.
- LetterWriting: `test.tsx:29-373`; `contract.test.tsx:7-23`.
- ReadWords grid: `test.tsx:14-486` (paging, marker, the polarity suite at `:333-446`); `contract.test.tsx:7-39`.
- ReadSentences: `test.tsx:8-268`; `contract.test.tsx:7-20`.
- ReadPassage: `test.tsx:41-311`; `contract.test.tsx:7-21`.
- WriteCvcs: `test.tsx:19-274`; `contract.test.tsx:7-20`.
- WriteSentences: `test.tsx:17-243`; `contract.test.tsx:7-23`.
- ReadingComprehension: `test.tsx:15-67`.

**Cross-cutting**
- `src/assessment-questions/__tests__/`:
  - `oneTerminalCallback.test.tsx`
  - `clockJump.test.tsx:37-60`
  - `readingDuration.test.tsx:20-60` (taps `"<label>, idle"` and uses End/Confirm/"Reached the end")
  - `itemSetResolution.test.tsx`
  - `validateResult.test.ts` (if contract rules change)
- `battery/__tests__/`: `questionComponents.test.ts`, `wela_plus_full.test.ts:21-58` (pins the full read_words copy at `:33`).
- `egra/__tests__/defaults.test.ts:15-18` (pins `extraProps {}` vs `tap_wrong`).
- `egra/__tests__/adapter.test.ts:29,122,126` (prerequisite).
- `__tests__/assessmentsRepository.questionResults.test.js:73-74,258-261`.

**Present only on origin/main `9708186` (#104), not on 4b3efd6**
- `__tests__/egraRun.integration.test.js`, `__tests__/BatteryQuestionScreen.test.js`, `battery/__tests__/registry.test.ts` (EGRA skip-provenance `validateResult` checks).
- These touch EGRA run results through the host, so they also need checking.

**Unverified:** host consumers of `onItemMarked`. Grep found none outside `questions/` and `progress/`, and the battery host does not pass it (`BatteryQuestionScreen.js:125-127`).