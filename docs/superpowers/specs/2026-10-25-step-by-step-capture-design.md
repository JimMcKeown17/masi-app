# Step-by-step marking for every Question

**Date:** 2026-10-25
**Status:** Approved by Jim 2026-10-25
**Branch:** `docs/step-by-step-capture` (from `main` at 9708186, after #100, #101, #104 and #105)
**Mockups (approved 2026-10-25):** `design/mockups-2026-10-step-by-step/step-by-step.html`
**Amends:** `2026-10-21-assessment-capture-style-design.md` (§2 non-goal, §3.1–3.2, §6 pattern table,
the free-toggle tile rule and the frozen-behaviour list) and the EGRA story-questions marking in
`2026-10-23-egra-content-pack-integration` work (Correct / Wrong / Not asked). See §10.

## 1. Why

Field staff found WelaPLUS hard to follow after Question 1. Question 1 (Letter sounds) asks one item at
a time with **Correct** and **Incorrect** buttons, which they understood straight away. Questions 2–10
switch to "tap green for correct, leave blank for wrong". On those, the Finish button shows
"4 items unmarked — finish anyway?" whenever a child gets anything wrong. A normal result therefore
looks like the EA's mistake (Jim's screenshots, 2026-10-25).

The underlying problem is in the data. A two-state toggle (marked or blank) records three meanings:
right, wrong and not yet decided. The finish warning tries to recover the third meaning from data that
never stored it.

Jim's rule for the redesign: **workflows must be clear to Education Assistants who get little or no
training.** One marking method that EAs learn once matters more than a faster screen on some
Questions. It also matters more than matching how DBE administers EGRA on paper (Jim, 2026-10-25).
The children assessed now are beginners who read very slowly, if at all, so a tap per item keeps up.

## 2. Goals, non-goals, anti-goals

**Goals**

- Every Question in WelaPLUS and Full EGRA except the Story Writing rubric (WelaPLUS Q11) uses one
  marking method: a ring on the current item, **Correct** / **Incorrect** / **Back**, and tap-to-flip
  for items already marked.
- Every screen keeps today's layout. Only the marking changes (Jim: "it should still be displayed the
  way it is on the screen").
- A saved result says plainly what happened to every item: marked correct, marked incorrect, or not
  reached.
- No message suggests the EA did something wrong when they didn't.

**Non-goals**

- The Story Writing rubric (Q11) does not change.
- No new content, item sets or translations, apart from the Q6 stop rule (§6.3).
- No change to timing: the 60 s timers, Countdown, the clock and the deadline guard stay as they are.
- No change to paging rules, tile sizes or the Bold Red look set by the 2026-10-21 spec, except
  where §5 needs a new layout (prompt cards, word-in-sentence and flowing passage).
- No server-side marking mode is built now (§8).

**Anti-goals**

- Any EA-facing switch or setting between marking styles.
- Changing what a saved score means without recording that it changed (§7).
- A faster screen that only trained staff understand.

## 3. The rule an EA learns once

> A black ring shows the item to mark. Tap **Correct** or **Incorrect** and the ring moves on. Made a
> mistake? Tap **Back**, or tap any marked item to flip it. Ended early? Anything not marked is left
> out of the score.

Every Question's instructions end with one marking sentence. It replaces `MARK` in
`battery/wela_plus_full.ts:4` and the per-Question "Tap each … correctly" lines:

> Mark each ⟨item⟩ **Correct** or **Incorrect**. The black ring shows which ⟨item⟩ you're on.

⟨item⟩ is the Question's own noun: letter, word, question, sound or sentence word. The builder sets
the noun per Question (§12).

## 4. Shared behaviour (every converted Question)

These all live in the shared step-by-step engine (`progress/stepByStep.ts`, `progress/SequentialCapture.tsx`,
`ui/ActionBar.tsx` `DecisionBar`, `ui/MarkTile.tsx`), generalised as §9 describes. Question 1 and the
EGRA letter and word parts get the new parts (flip, review, end copy) too.

### 4.1 Marking

- The current item carries the existing 3 dp ink ring (`MarkTile` `current`). Items marked correct
  fill with `marked` green and items marked incorrect with `error` red, as Question 1 does today.
  Items not reached yet stay `idle` (today's untouched look). On prompt-card Questions they are also
  faded (mockup 2) so the current card stands out.
- **Correct** / **Incorrect** mark the current item and move the ring to the next item in reading order
  (left to right, top to bottom, sentence by sentence).
- **Back** clears the previous mark and moves the ring onto it, exactly as today
  (2026-10-21 spec §3.1, "Back clears the previous decision").
- The screen keeps the current item in view: it turns the page or scrolls when the ring moves off
  screen.
- A position line sits between the content and the buttons, in the Question's own terms (mockups 2,
  4–6): "Question 2 of 5", "Word 2 · letter 3 of 4", "Sentence 2 · word 2 of 3", "Word 6 of 42".

### 4.2 Tap-to-flip

- Tapping an item that is already marked flips it between correct and incorrect.
- The ring does **not** move (mockup 3). The EA carries on where they were.
- The current item and items not reached are not tappable, so there is no accidental skipping ahead.
- **Paged Questions** (Q1, Q5, Q6 and EGRA letters and words): during marking, flips work on the page
  being shown, which is always the current item's page. Back still reaches any earlier item. In the
  review step (§4.4), the page arrows are live, so the EA can browse every page and flip anything.
  Pressing Back in review returns to the current item's page. (My call; see §12.)
- After a flip, a short confirmation appears for about 3 s: "⟨Item⟩ changed to Incorrect", for example
  "Question 1 changed to Incorrect" or "Letter 3 of word 2 changed to Correct". It is announced to
  screen readers. The Question package may not import host code, so this is a package component, not
  the host toast.
- A marked tile is a button whose accessibility label says its state and the action, for example
  "a, correct. Double-tap to change to incorrect". Tests that pin "no buttons in the grid" change
  accordingly.
- Flips, Back and Undo each add 1 to `correction_count`.
- Everything derived from the marks is recomputed from the marks after every change, never kept as a
  running counter: the current run of wrong answers, `max_consecutive_wrong`, totals and `percent`.

### 4.3 Stop rules and flips

- A stop happens only when **Correct** or **Incorrect** is pressed, using today's checks:
  - **Consecutive wrong:** the run of wrong marks ending at the item just marked. The run is computed
    from the marks, so an earlier flip inside that run counts.
  - **EGRA first row:** checked only at the moment the ring leaves the first row.
- A flip never starts a stop. In particular, a later flip that leaves the first row all wrong does not
  stop the test retroactively, and no answers already given are thrown away. The validator rules for
  `stop_rule` (`contractTest/validateResult.ts:145-176`) stay unchanged. (My call; see §12.)
- While the stop card is up, the items are covered and not tappable, as today. **Undo last mark**
  remains the only way back into marking. It deletes the triggering mark and re-opens capture, which
  already lifts an EGRA first-row stop (`stepByStep.ts:54-67`).
- **Save result** on the stop card saves straight away, as today. There is no review step after a stop.

### 4.4 After the last item: review, then Finish (mockup 7)

- When the last item is marked, the ring disappears and **Correct** / **Incorrect** give way to one
  **Finish** button, with **Back** under it. The position line reads "All ⟨N⟩ marked · ⟨C⟩ correct. Tap
  any ⟨item⟩ to change it."
- Taps still flip. Back clears the last mark and returns to normal marking.
- **Finish** saves with `stopped_reason: 'completed'`.
- This replaces today's instant save when the last item is marked (`SequentialCapture.tsx:146`). It
  applies to Question 1 and the EGRA letter and word parts too.
- **Timed Questions:**
  - If every item is marked before the timer ends, the reading time stops at the last mark, and the
    review step runs untimed. Flips in review change the marks, and every score, including correct
    words per minute, is computed from the final marks. Only the reading time is frozen.
  - **Back** from review resumes the clock with the time that was left. The review time is not counted,
    in the same way the stop card's Undo already moves the deadline (`SequentialCapture.tsx:129`).
  - If the timer ends first, the Question saves straight away with `stopped_reason: 'timer'`, as today,
    and there is no review step.

### 4.5 Ending early (mockup 8)

- **End question** (bottom link, danger tone) opens a sheet:
  - Title: "End this question?"
  - Body: "⟨M⟩ marked. The ⟨U⟩ not marked won't count towards the score."
  - Buttons: **End question** (danger), **Keep marking**.
- Ending saves with `stopped_reason: 'ea_ended'`. Every item not marked is saved as not reached (§7.1).
- This replaces "⟨N⟩ items unmarked — finish anyway?" in the seven toggle Questions and EGRA's
  "Save them as Not asked?". Neither sheet remains. The sheet appears only when the EA chooses to end
  early, never because a child got answers wrong.
- In a Battery the link reads **End question**. The standalone quick tests keep **End test**, because
  there the test is the whole thing (`DecisionBar` `endLabel` already allows this).
- **Skip question** is unchanged: the reason picker, then a `skipped_*` reason and `items: []`, saved
  exactly as today (`battery/skippedResult.ts`).

## 5. Per-Question changes

| Question | Used by | Layout (unchanged unless noted) | One step is | Notes |
|---|---|---|---|---|
| Letter sounds | WelaPLUS Q1, EGRA letters, quick test | Paged card grid | a letter | Gains flip, review and end copy. Stop rules unchanged: WelaPLUS 10 in a row; EGRA first row all wrong. |
| Listen to a story | WelaPLUS Q2 | Prompt cards with answer guide; **Re-read story** stays | a question | Mockups 2, 3 and 8. The story stays in the intro and Re-read opens it, as today. |
| First sounds | WelaPLUS Q3 | Prompt cards | a word | — |
| Blending sounds | WelaPLUS Q4 | Prompt cards with the "(sun)" gloss | a word | `metadata.word` stays on each item. |
| Letter writing | WelaPLUS Q5 | Today's 12-per-page picture grid | a cell, in sheet order | Marked from the child's paper after they finish. |
| Reading words | WelaPLUS Q6, EGRA words, quick test | Paged card grid (`captureMode: 'sequential'`) | a word | Q6 moves from the grid-and-last-word mode to the existing sequential mode. **New: Q6 stops by itself after 10 wrong in a row** (§6.3). |
| Reading sentences | WelaPLUS Q7 | Word pills grouped by sentence, no paging | a word | Same shape as mockup 5, read aloud. |
| Reading a story (passage) | WelaPLUS Q8, EGRA story | The whole passage as flowing word pills that scroll with the ring | a word | Mockup 6. Timed 60 s. **The "tap the last word" sheet is removed** (§6.4). EGRA moves off `tap_wrong`. |
| Writing words | WelaPLUS Q9 | Today's word cards (Jim's screenshot) | a letter | Mockup 4. |
| Writing sentences | WelaPLUS Q10 | Today's sentence cards with word tiles | a word | Mockup 5. |
| Story questions | EGRA | Prompt cards with answer guide; **Show story** stays | a question | Same screen as WelaPLUS Q2 (§6.5). The Not asked pill goes; "Wrong" becomes "Incorrect". |
| Story writing | WelaPLUS Q11 | Rubric chips | — | **Unchanged.** |

The `NullQuestion` placeholder is unchanged.

## 6. Decisions on specific Questions

### 6.1 Written work (Q5, Q9, Q10)

Jim chose step-by-step here too (2026-10-25). The screen keeps today's layout, with all words visible.
The ring steps through it: Q9 letter by letter, left to right and top to bottom; Q10 word by word.
Q5 steps through the picture grid in sheet order.

### 6.2 No "Not asked" button

Jim: "It can be assumed if someone ends before marking each one." Any item left when the EA ends
early is **not reached**. That is not wrong, and it does not count towards the score (§7). This
covers EGRA's story questions, which follow the order of the story: the unasked tail is exactly the
questions the child didn't reach.

### 6.3 Question 6 stops by itself

> **Superseded 2026-10-25 (Jim, later the same day):** one stop rule everywhere, "first row all wrong" (DBE/EGRA), for letters and words in WelaPLUS, Full EGRA and the quick tests. It arrives with the follow-on change that puts the EGRA content into WelaPLUS (see `documentation/ROADMAP.md`). This build therefore adds no Q6 stop rule; Q6 keeps its current item set and only drops the unenforced "5 in a row" instruction. The paragraph below is kept as the original decision.

Q6 stops after **10 wrong in a row**, the same rule as Question 1 (Jim, 2026-10-25). Stop rules live
in the item set (CONTEXT, "Stop rule"), so `wela_plus_read_words` en and xh get a new item-set
version carrying `{ kind: 'consecutive_wrong', stop_at: 10 }`. The content is unchanged. The WelaPLUS
Battery points Q6 at the new version, and Q6's instructions change from "STOP … 5 in a row" to
"The test stops by itself after 10 wrong in a row", matching Q1. The standalone Word Reading quick
test keeps its current set, with no stop rule.

### 6.4 Passage reading goes word by word, in both batteries

Jim chose step-by-step for the passage in both WelaPLUS and EGRA. One method matters more than DBE's
tap-the-mistakes administration, and today's readers are slow (2026-10-25).

- The ring follows the child word by word. When the minute is up, the **last word marked** is the last
  word reached. The ringed word is the next one, not yet reached. `last_attempted_position` is the last
  marked position (`cursor - 1`), as for Question 1.
- `LastAttemptedSheet` is no longer reached by any converted Question (§9.4).
- The other EGRA session flagged a known cost: a fluent reader can outpace one tap per word, and a tap
  after the beep is dropped. The fix if that matters later is the server-assigned version in §8, not
  a switch.
- **EGRA story-questions gate:** EGRA skips Story questions when the story scored below 1
  (`egra/adapter.ts:94-96`). Under step-by-step, `total_correct` counts only words marked Correct, so
  the gate still means "read at least one word correctly". It is stricter only for a child whose words
  the EA never reached before the beep.

### 6.5 One story-questions screen for both batteries

WelaPLUS Q2 (`ListenAndAnswerStoryQuestion`) and EGRA Story questions (`ReadingComprehensionQuestion`)
should share one step-by-step prompt-card screen, so a change lands in both. It must keep:

- The intro or story affordances: WelaPLUS reads the story in the intro and shows **Re-read story**;
  EGRA shows **Show story**.
- The answer guide under each question (the gloss), as today.
- EGRA's result fields: each item carries `metadata.asked` (true if reached, false if not reached),
  `derived.questions_asked` = the number reached, and the score is correct out of asked. WelaPLUS Q2
  writes the same fields, so both batteries' story scores mean the same thing. (My call; see §12.)

## 7. What a saved result means after this change

This deliberately amends the 2026-10-21 spec's "every Question's `Result` output is frozen". It is
cheapest now. WelaPLUS is not in the field yet, EGRA merged today, and the `masi-app-sqlite` backend
holds only test data.

### 7.1 Items

Every converted Question saves its items the way `SequentialCapture` does today (`SequentialCapture.tsx:74-80`):

- Marked correct: `is_correct: true`, `metadata.reached: true`.
- Marked incorrect: `is_correct: false`, `metadata.reached: true`.
- Not reached (left when ended early, or when the timer ended): `is_correct: false`,
  `metadata.reached: false`. Story questions also write `metadata.asked: false`.
- Positions stay the identity of each item, because item keys repeat in several sets
  (`domainRepositoryUtils.js:20-30`).

### 7.2 Totals

- `total_correct` = items marked correct.
- `total_attempted` = items reached. Today the toggle Questions count every item.
- `percent` = `total_correct / total_attempted`, as Question 1 does today.
- `last_attempted_position` = the last marked position, or `-1` if nothing was marked.
- `correction_count` and `max_consecutive_wrong` are saved for every converted Question (§4.2).
- Per-group fields (`per_sentence_percent`, `per_word`, `per_sentence`) count **reached** items only.
  Correct words per minute = `total_correct` over the reading time (§4.4).
- The Battery summary keeps its denominator rule: `derived.max ?? derived.questions_asked ?? total_items`
  (`src/utils/batteryRun.js:47`). Story questions therefore show correct out of asked; every other
  Question shows correct out of all items, so "8 / 60" still means 8 of the card's 60. When
  `questions_asked` is 0, the summary must not show "0 / 0" (§12).

### 7.3 Telling old results from new

Results saved before this change from the toggle Questions have `capture_mode` null
(`BatteryQuestionScreen.js:91`). Every converted Question now saves `capture_mode: 'sequential'`, a
value both databases already allow (`src/db/migrations.js:580-583`;
`supabase/migrations/20260618120000_masi_assessments_capture_mode.sql:17-18`). So results from the old toggle, grid and last-word paths are always distinguishable from their
replacements, with no new content versions and no schema migration.

For Question 1 and EGRA letters and words, which were already `sequential`, item meanings do not
change. Only the review step and flips are added, and both show up in `correction_count`. If an
analysis ever needs to separate them, the app release recorded with each result does that. The only new
item-set version is Q6's stop rule (§6.3). The plan decides whether the WelaPLUS Battery version
itself moves on (§12).

The contract validator (`contractTest/validateResult.ts`) is updated in step: `tracks_progress` and
`last_attempted_position` rules apply to every converted Question.

## 8. Future: a different passage method arrives as a new version, never as a switch

Jim (2026-10-25): if a faster method is needed later, for stronger readers or partner organisations,
it should be "an entirely new run or WelaPLUS version" assigned from the server, not a setting.

- The server already assigns a Battery per programme: `programmes.default_battery_code` and
  `_version` (`supabase/migrations/20261021120000_assessment_results_contract.sql:90-101`).
- A future tap-the-mistakes passage would ship as a new Battery version whose passage Question is
  configured that way. Head Office assigns it to a programme, and each saved result's version records
  how it was marked.
- Nothing for this is built now. Today `BatteryQuestion` has no capture setting
  (`types/BatteryConfig.ts:3-11`) and `extraProps` are fixed per `question_code`
  (`battery/questionComponents.ts:21-41`). The plan should keep the per-Question configuration in one
  place, so adding a per-version setting later is a small change.

## 9. Shared machinery: what changes

From the 2026-10-25 code map (Appendix A):

1. **Reducer** (`progress/stepByStep.ts`): add a `flip` action for any position below the cursor, plus
   positions up to the last one during review. Derive run lengths, totals and `max_consecutive_wrong`
   from the marks. Keep `decide`, `back` and `undoStop` semantics. A stop is evaluated only in
   `decide`.
2. **SequentialCapture**:
   - add the review phase (§4.4) and the end sheet (§4.5);
   - stop reading time at the last mark;
   - make marked tiles tappable;
   - add a slot for intro content and Question-level extra controls (Re-read story, Show story);
   - accept item metadata (gloss, `word`, sentence and letter indexes) so each Question's result
     fields survive;
   - make the page label per Question, since today it always says "Card row …"
     (`ui/paginate.ts:70-75`).
3. **Renderers:** add three layouts beside today's paged letter, word and picture grid:
   - prompt cards (story, first sound, blending);
   - grouped tiles (Q9 letters in words, Q10 and Q7 words in sentences);
   - a flowing passage that scrolls with the ring (Q8, EGRA story).
4. **Removed once nothing uses them:**
   - the toggle marking path (`hooks/useToggleMark.ts`, `ToggleBar` where unused);
   - the "items unmarked" sheets;
   - `markingPolarity` in ReadWords, ReadSentences and ReadPassage;
   - the ReadWords grid mode;
   - `LastAttemptedSheet` and `applyProgress`.

   Git history keeps them for a future version (§8). (My call; see §12.)
5. **Copy:** §3 marking sentence; "End question" / "End this question?" / "Keep marking"; the position
   lines; the flip confirmation; "Incorrect" instead of "Wrong" in EGRA. Also fix EGRA's letter and
   word instructions, which tell the EA to stop and end by hand although the app does both
   (`egra/adapter.ts:82-83`).

## 10. Documents this changes (same branch as the build)

- `2026-10-21-assessment-capture-style-design.md`: a dated status note at the top pointing here. Its
  body is historical and is not rewritten.
- `CONTEXT.md`, in the build branch:
  - "Capture mode": step-by-step becomes the mechanic for every Question except the Story Writing
    rubric.
  - "Stop rule": Q6 now has `consecutive_wrong` 10.
  - "EGRA form": story questions are no longer marked Correct / Wrong / Not asked.
  - The Pattern D and Pattern F decisions ("unified tap-correct convention", `useToggleMark`).
- `documentation/design-system.md`: the step-by-step marking pattern, the review step and the end
  sheet.
- `documentation/build-log.md`: an entry for this spec, crediting the EGRA capture audit (Appendix B).

## 11. Verification

- **Unit and contract tests** for every converted Question. Every RED test must fail against today's
  code. Cover:
  - Correct, Incorrect and Back;
  - flip (ring stays, the right label, `correction_count`, and derived totals recomputed);
  - review then Finish;
  - an early end, with not-reached items and the correct totals;
  - a timer end, and the review not changing `duration_ms`;
  - stop then Undo then the next press re-checking the rule;
  - the Q6 stop at 10;
  - EGRA story `asked` fields and the prerequisite gate.
- **Removed copy:** tests that the "items unmarked — finish anyway?" and "Save them as Not asked?" copy
  no longer exists anywhere.
- **Full jest suite, `npm run test:types`, and the PostgreSQL CI suite.**
- **Device gate:**
  - Galaxy A03 at 360 dp, font scale 1.0 and 1.3, and Jim's iPhone.
  - One full WelaPLUS assessment and one Full EGRA, each with a flip, an early end and a stop.
  - Check the saved rows in staging.
- **Recommended before field rollout:** five or six EAs try the new screens on a practice child, using
  a preview build, while someone watches. This answers "is it clear?" more directly than any test.
  (Jim decides.)

## 12. Calls made in this document (Jim to check)

These were not discussed; each is the author's call:

1. WelaPLUS Q2 writes `metadata.asked` and `questions_asked` like EGRA, so both story scores show
   correct out of asked (§6.5).
2. The review step applies to every converted Question, including Question 1 and EGRA letters and
   words. For timed Questions the reading time stops at the last mark (§4.4).
3. Inside a Battery the end link says **End question**; quick tests keep **End test** (§4.5).
4. The old marking paths are deleted rather than kept switchable (§9.4).
5. Whether the WelaPLUS Battery version itself moves on (for example to `2024.2`) is left to the plan.
   The new Q6 item-set version and `capture_mode: 'sequential'` already make every result
   self-describing (§7.3).
6. The ⟨item⟩ noun and the position line wording per Question (§3, §4.1). The builder proposes them
   and Jim sees them on the device gate.
7. A story-questions result where nothing was reached shows "Not started" (or "—") instead of
   "0 / 0" (§7.2).
8. Paged Questions flip only on the shown page during marking; any page can be browsed and flipped in
   review (§4.2).
9. Flips never stop a test retroactively. Stops are checked only on Correct or Incorrect, with today's
   rules (§4.3).
10. In timed review only the reading time is frozen; scores use the final marks. Back from review
    resumes the remaining time (§4.4).

## Appendix A. Code map (2026-10-25, main 4b3efd6; question components identical at 9708186)

A read-only map of all 13 Question components, the shared capture machinery and the Battery wiring,
with path:line evidence. Summary:

- Step-by-step today: Letter sounds (WelaPLUS Q1, EGRA letters, quick test) and ReadWords in
  `sequential` mode (EGRA words, quick test).
- Toggle-correct, where blank means wrong and counts as attempted: Q2, Q3, Q4, Q5, Q7, Q9, Q10. All
  seven show "⟨N⟩ items unmarked — finish anyway?" whenever anything is blank.
- Grid plus a last-word sheet: Q6 (tap correct). Passage plus a last-word sheet: Q8 (tap correct) and
  EGRA story (`tap_wrong`, where untouched words count as correct).
- Three-state Correct / Wrong / Not asked, all on one page: EGRA story questions.
- Rubric chips: Q11.
- Marking instructions live in `battery/wela_plus_full.ts` (`MARK` at `:4`), `egra/adapter.ts:82-83` and
  fixed component strings. Item sets carry none.
- The stop card is covered while stopped, and tiles have no `onPress` today
  (`SequentialCapture.tsx:169-173,186`). `MarkTile` already renders `correct` and `incorrect` as
  pressable when given `onPress` (`MarkTile.tsx:69-71`).

The full map is in `2026-10-25-step-by-step-capture-code-map.md`, beside this spec.

## Appendix B. EGRA capture audit (other session, verified at main 9708186)

The EGRA session ran a separate audit: 60 claims checked, 49 confirmed and 11 refined. The full audit
is in `2026-10-25-step-by-step-capture-egra-audit.md`. Findings used here:

- EGRA letters and words already share the step-by-step screen, so changes in §4 reach them the same
  day.
- EGRA story questions score correct out of asked (`ReadingComprehensionQuestion/index.tsx:40-57`).
- After any flip, the stop rule must be re-checked from all marks (§4.3).
- Known bug, fixed separately on `fix/egra-story-last-word`: under tap-the-mistakes, the last-word sheet
  pre-selected the last wrong word, so an error-free reader saved as 1 word. That sheet leaves the
  converted Questions (§9.4); the fix protects test builds until then.
- Drift to fix with the build:
  - EGRA instructions telling the EA to stop and end by hand (`egra/adapter.ts:83`);
  - Q6's "5 in a row" that the app doesn't enforce;
  - "1 items" pluralisation in the toggle sheets;
  - `CONTEXT.md:322` describing Q2 as one card at a time.
