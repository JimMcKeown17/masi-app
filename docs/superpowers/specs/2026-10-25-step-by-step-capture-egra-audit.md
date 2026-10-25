<!-- Copied 2026-10-25 from the EGRA session's audit (implementing-dbe-egras) for Appendix B of 2026-10-25-step-by-step-capture-design.md. Point-in-time evidence; do not update. -->

# How the EA marks each question: Full EGRA and WelaPLUS

Verified 2026-10-25 against `main` 9708186 (the worktree tree is identical). File:line references are at that commit.
How it was checked: five code readers fed a summary step. Skeptic agents then checked each of its 60 claims against the code. 49 were confirmed and 11 were "partly" right. The corrections are folded in below; none changed the answer. Claude then re-read the key code paths by hand.

## Short answer

**No.** In a Full EGRA, only Letter sounds and Familiar words use step-by-step Correct / Incorrect.
- **Reading a story:** the EA taps only the words the child gets wrong, then picks the last word read.
- **Story questions:** all five questions are on one page, each with Correct / Wrong / Not asked.

In WelaPLUS today, only Letter sounds is step-by-step.

**What "step-by-step" means in the app today:** the EA does *not* see one item alone. They see one page of the card with a ring around the current item: up to 20 letters (two 10-letter card rows), or one 8-word card row as 4 lines of 2. They tap the big green **Correct** or red **Incorrect** button; the tiles themselves can't be tapped. **Back** undoes the last mark only. Under it are **Skip question** and **End test**. Evidence: `SequentialCapture.tsx:177-197`, `ui/ActionBar.tsx:19-27`, `ui/paginate.ts:2-3`, `MarkTile.tsx:69-71`.

## Full EGRA: the four parts

| Part | How the EA marks it | What the EA sees and taps | Same as WelaPLUS? | Evidence |
|---|---|---|---|---|
| 1 · Letter sounds | **Step-by-step** | 60 s countdown. Pages of 20 letters, current letter ringed, Correct / Incorrect. Pages turn by themselves. The app stops by itself if all 10 letters of the first card row are Incorrect: a stop card offers "Save result" or "Undo last mark". At the timer it saves straight away; the last letter marked counts as the last attempted. Every card is at least 60 letters: the four 40-letter forms get 20 Masi letters, so 3 pages. | **Yes**, same screen. Only the stop rule differs: EGRA stops on a first row all wrong; WelaPLUS stops after 10 wrong in a row. | `questionComponents.ts:24`; `LetterSoundsQuestion/index.tsx:41`; `egra/adapter.ts:34-39,56`; `SequentialCapture.tsx:94,104-110,146,199-201` |
| 2 · Familiar words | **Step-by-step** (EGRA turns it on with `captureMode:'sequential'`) | Same screen and buttons as letters. One 8-word card row per page (6 on English FAL 2; isiZulu fits two 5-word rows). The app stops by itself if the whole first card row is Incorrect. No last-word step at the timer, and a tap after the beep is dropped. | **No.** WelaPLUS words use the same component in grid mode: tap the right words, page arrows, then pick the last word. | `questionComponents.ts:35` vs `:29`; `ReadWordsQuestion/index.tsx:95-106`; `egra/adapter.ts:61`; `SequentialCapture.tsx:124` |
| 3 · Reading a story | **Tap the wrong words** (`markingPolarity:'tap_wrong'`) | 60 s timer. The whole story (43 to 137 words) as word pills. The EA taps a misread word (red); untapped words count as correct up to the last word read. At the timer or End, the story is replaced by "Last item attempted": pick the word, then Confirm, or "Reached the end" / "Nothing attempted". Cancel appears only after End, not after the timer. No stop rule and no Back. Score: correct words per minute. | **No.** WelaPLUS uses the same component the opposite way: tap the *right* words (green). | `questionComponents.ts:23` vs `:31`; `ReadPassageQuestion/index.tsx:107,154-160,276-292`; `LastAttemptedSheet.tsx`; `applyProgress.ts:7-8` |
| 4 · Story questions | **All questions on one page** | "Show story" button, then 5 cards. Each card shows the question and an answer guide, with three pills: Correct / Wrong / Not asked. Whichever pill is selected fills dark; there's no green or red. Finish: if any are blank, it asks "Save them as Not asked?". No timer. Score: correct out of the questions asked. Skipped automatically if the story score was 0. | **No.** WelaPLUS "Listen to a story" is a different component (see Q2 below). | `questionComponents.ts:22`; `ReadingComprehensionQuestion/index.tsx:14-16,40-57,85-92`; `AssessmentChoiceCard.tsx:32`; `egra/adapter.ts:94-95` |

## WelaPLUS: the 11 questions today

| # | Question | How the EA marks it | Evidence |
|---|---|---|---|
| 1 | Letter sounds | **Step-by-step** (the same screen as EGRA). Stops after 10 wrong in a row. 60 s. | `questionComponents.ts:24`; `letter_sounds@2026.2.en.ts:10` |
| 2 | Listen to a story | Tap the right answers: all 5 question cards on one page, and a tap turns a card green. A blank card means wrong; there's no Wrong or Not asked button. Finish asks "N items unmarked — finish anyway?" every time a child gets one wrong. The file header and CONTEXT.md say "one at a time", but the code shows all 5 at once. | `ListenAndAnswerStoryQuestion/index.tsx:4-5,226-251`; `CONTEXT.md:322` |
| 3 | First sounds | Tap the right answers: a list of word cards and Finish. No timer. | `ListenFirstSoundQuestion/index.tsx:192-216` |
| 4 | Blending sounds | Tap the right answers: a list of cards ("s-u-n (sun)") and Finish. No timer. | `ListenPhonemeBlendQuestion/index.tsx:200-225` |
| 5 | Letter writing | Tap the right answers, marked from the paper: a paged picture grid of 12 per page. | `LetterWritingFromPicturesQuestion/index.tsx:249-272` |
| 6 | Reading words | Tap the right words: a paged 2-column grid, End, then pick the last word. 60 s. The instructions say "STOP if 5 in a row wrong", but the app doesn't enforce it, so the EA has to count. | `questionComponents.ts:29`; `ReadWordsQuestion/index.tsx:108-340`; `wela_plus_full.ts:28` |
| 7 | Reading sentences | Tap the right words: one card of word pills per sentence, then Finish. No timer. | `ReadSentencesQuestion/index.tsx:284-308` |
| 8 | Reading a story | Tap the right words (green): the whole story, End, then pick the last word. 60 s. | `questionComponents.ts:31`; `ReadPassageQuestion/index.tsx:107` |
| 9 | Writing words | Tap the right letters, marked from paper. | `WriteCvcsQuestion/index.tsx:267-281` |
| 10 | Writing sentences | Tap the right words, marked from paper. | `WriteSentencesFromDictationQuestion/index.tsx:273-287` |
| 11 | Story writing | Rubric: a 1–4 score chip for each of 4 parts. Correct / Incorrect doesn't fit here. | `StoryWritingRubricQuestion/index.tsx:304-349` |

So WelaPLUS already teaches three methods: step-by-step (Q1), tap the right ones (Q2–Q10) and a rubric (Q11). A Full EGRA uses three: step-by-step, tap the wrong words, and all questions on one page.

## What a WelaPLUS rework carries to EGRA automatically

- **Carries over the same day: EGRA Letter sounds and Familiar words.** Both draw the shared step-by-step screen: `SequentialCapture.tsx`, the `stepByStep.ts` reducer (marks, Back, stop rules), `StopCard.tsx`, the Correct/Incorrect bar (`ui/ActionBar.tsx`), and `MarkTile` / `PagedGrid` / `paginate`. Any change to those files reaches both EGRA parts, including a change to "one big item alone on screen". To make WelaPLUS words identical to EGRA words, change one line (`questionComponents.ts:29` → `{captureMode:'sequential'}`) and add a stop rule to the WelaPLUS word item sets.
- **Same component, but not the step-by-step screen: EGRA Reading a story.** It is `ReadPassageQuestion`, shared with WelaPLUS Q8; only the tap meaning differs. A change to its *default* reaches EGRA. A new opt-in mode reaches EGRA only if `questionComponents.ts:23` opts in too.
- **Needs its own change: EGRA Story questions.** `ReadingComprehensionQuestion` and `AssessmentChoiceCard` are used by nothing else. WelaPLUS Q2 is a different component. They move together only if both are pointed at one new shared step-by-step question screen.
- **No device or user setting** switches the marking method. It is fixed per question in `questionComponents.ts`, and the quick test hard-codes step-by-step (`StandaloneTestScreen.js:61`). `CONTEXT.md:238` records that the old setting was removed. No server or schema change is needed either way: the host saves whatever `capture_mode` the result reports (`BatteryQuestionScreen.js:91`).

## Recommendation per EGRA part (decisions for Jim)

1. **Letter sounds: leave it.** It already matches WelaPLUS. Fix the instructions, which tell the EA to stop and end by hand although the app does both (`egra/adapter.ts:83`).
   *Decision:* keep the pure first-row stop for EGRA (recommended; it is the DBE rule)? EAs learn one tapping method and two stop rules, but the app enforces both, so nobody counts.
2. **Familiar words: leave EGRA as it is.** To match, move WelaPLUS Q6 onto the same screen and make its "5 in a row" stop automatic.
   *Cost:* Q6 loses its pick-the-last-word step. At the beep, the word the child was reading is lost unless it was already marked. That changes what Q6's data means, so it needs a version bump.
   *Decision:* accept "no last-word step at the beep" for words in both batteries?
3. **Reading a story: don't make it step-by-step.** Make WelaPLUS Q8 tap-the-wrong-words instead, so both batteries use one story method. The rule to teach becomes: "Single items: Correct or Incorrect, one at a time. Stories: tap only the mistakes, then the last word read."
   *Why:* the score is reading speed. Fluent readers say 60 to 100+ words in 60 s, so one tap per word means 1–2 taps a second while listening. Taps after the beep are dropped, so any lag is scored as words not reached. The score would then measure the EA's thumb, and the error is worst for the best readers. The current step-by-step layout would also chop a 111-word story into about 12 pages of 2 columns. Tap-the-mistakes is how paper EGRA is marked, and the EGRA plan chose it on purpose (`docs/superpowers/plans/2026-10-23-egra-content-pack-integration.md:53`).
   *Decisions:* (a) accept stories as the one exception to step-by-step? (b) switch WelaPLUS Q8 to tap-the-wrong-words, with a version bump?
4. **Story questions: make them step-by-step**, one question per screen with green Correct / red Incorrect, Back, "Question 2 of 5" and Show story. Build it as a shared question screen and point both EGRA Story questions and WelaPLUS Q2 (later Q3 and Q4) at it, so one change lands in both batteries.
   *What it needs:* the shared screen has no question-card layout, no paging-free mode and no story slot today. The reducer stores only yes/no, but EGRA needs **Not asked for each question** (saved with `metadata.asked: false`; the score stays correct out of asked).
   *Decisions:* (a) Not asked as a third, smaller button on each question (recommended), or only from End test? (b) A review step after the last question, so a slip on Q5 can be fixed? (c) Same piece of work as the WelaPLUS Q2 rework?

**Also ask Jim:** does the WelaPLUS rework mean "one big item alone on screen"? If so, the shared step-by-step screen changes, and EGRA letters and words change with it. That's good for consistency, but it is a different screen from today's.

## Bugs and drift found (none fixed yet)

- **Story score trap (EGRA, before field use).** Under tap-the-wrong-words, the last-word screen pre-selects the last word marked *wrong*, or word 1 if nothing was marked (`ReadPassageQuestion/index.tsx:250-255,276-282`; `LastAttemptedSheet.tsx:20,57`). A child who read with no mistakes is saved as 1 word attempted if the EA just taps Confirm. A reader reproduced it with a throwaway test, and Claude confirmed the code path by hand. The existing test always taps "Reached the end", so it misses this (`egra/__tests__/capture.test.tsx:53`). Suggested fix: pre-select nothing and require a tap.
- **After the timer the story disappears and Cancel is gone**, so an EA a few words behind can't add the last error marks. The last-word screen also hides the red marks (`ReadPassageQuestion/index.tsx:283-289`; `LastAttemptedSheet.tsx:42`).
- **EGRA instructions are out of date:** "Stop if every item in the first row is wrong. End when the child finishes." The app does both by itself (`egra/adapter.ts:83`).
- **WelaPLUS Q6 "STOP if 5 in a row wrong"** is in the instructions only; the app doesn't enforce it (`wela_plus_full.ts:28`).
- **In tap-the-right-ones questions, a blank means both wrong and not yet marked**, so "N items unmarked — finish anyway?" shows whenever a child gets anything wrong. For one item it says "1 items". This is in 7 WelaPLUS questions (Q2–Q5, Q7, Q9, Q10).
- **EGRA story-question pills** use the same dark fill for every answer and say "Wrong" where step-by-step says "Incorrect" (`AssessmentChoiceCard.tsx:32`; `ReadingComprehensionQuestion/index.tsx:15`).
- **Doc drift:** `CONTEXT.md:322` and the Q2 file header say "one at a time". `CONTEXT.md:238` doesn't mention that EGRA words are step-by-step. Grid questions save `capture_mode` as null, not 'grid'.

## Requirements for the step-by-step spec, if EGRA joins it

- Not asked for each question (`metadata.asked: false`), with the score correct out of asked. Today this already holds at `ReadingComprehensionQuestion/index.tsx:40-57`.
- If tap-to-flip is added, the stop rule must be re-checked from all the marks after every flip, not only after the latest tap. Otherwise flipping a first-row letter can leave a stop in place that should have lifted, or miss a stop that should now fire. Today a stop is set only when a new mark is made (`stepByStep.ts:34-47`) and lifted only by Undo on the stop card (`:54-67`).
- Keep the first-row stop available per item set. An item set holds at most one stop rule (`LetterSoundsQuestion/types.ts:6`, `ReadWordsQuestion/types.ts:11`).
- Keep the timer and the "a tap after the deadline is dropped" guard (`SequentialCapture.tsx:124`). Decide whether timed step-by-step parts get a last-item step at the beep.
- Keep the minimum of 60 letters per card: the four 40-letter forms use versions `<form id>-masi60` (`egra/letterExtensions.ts`).
