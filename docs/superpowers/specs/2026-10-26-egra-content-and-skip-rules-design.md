# One set of reading content everywhere, and WelaPLUS skip rules

**Date:** 2026-10-26
**Status:** Draft for Jim's review
**Branch:** `docs/egra-content-skip-rules` (from `main` at aca2ad8, after step-by-step marking #107)
**Mockup (approved 2026-10-26):** `design/mockups-2026-10-skip-rules/skip-card.html`, option A
**Replaces:** the two follow-on specs in `documentation/ROADMAP.md` §8 ("the EGRA content inside
WelaPLUS" and "skip rules, with a server-side switch"). Jim asked for one spec (2026-10-26).
**Reviewers:** the EGRA session reviews §5 (Full EGRA), the `letterExtensions.ts` retirement and
old `-masi60` results.

## 1. Why

Masi assesses reading in three places: the WelaPLUS Battery, Full EGRA and the two quick tests
(Letter Sounds, Word Reading). Today each uses different letters, words and stories. A child's
letter score from WelaPLUS cannot be compared with one from Full EGRA. EAs carry different cards
for each. The Grade 1 EGRA forms need a Masi-only 20-letter extension to reach 60 letters.

Jim's decision (2026-10-25): **the letters, words, story and story questions are identical
everywhere**, taken from the DBE EGRA forms already in `content/egra/`. One instrument that matches
DBE's EGRA, one Reading Card per language, and one score that means the same thing in every report.

The second problem is the child's experience. A child who cannot read a single letter is still
taken through reading words, sentences, a story and three writing tasks. Jim: children should not be
made to feel stupid. **WelaPLUS stops the reading and writing Questions once a child shows they
cannot do them**, and tells the EA why so the EA is not confused.

## 2. Goals, non-goals, anti-goals

**Goals**

- One item set per Question per language for letters, words, story and story questions, used by
  WelaPLUS, Full EGRA and the quick tests alike.
- A new WelaPLUS version that uses that content, adds Story questions after the story, and applies
  the skip rules in §4.
- Full EGRA becomes one assessment per language with no form picker.
- The quick tests use the same content and the same stop rule.
- Results already saved keep their versions and stay readable.

**Non-goals (deferred to the roadmap, Jim 2026-10-26)**

- **The skip-rule switch.** In this release the skip rules are always on in the new WelaPLUS
  version. Later: Head Office sets each EA's setting on the server (default on) and can lock it;
  an unlocked EA can change it in Profile → Settings; the change syncs; each assessment records the
  setting it started with; the website gets an admin screen for it. This reverses the earlier
  "never an EA setting" note, because partner organisations may want to choose for themselves.
- **Skip rules for Full EGRA.** Government-funded schools sometimes need every Question, especially
  in Full EGRA. Without the switch there would be no way to give them every Question, so Full EGRA's
  skip rules arrive with the switch.
- **Revisiting "ending early doesn't count"** (§4.2). Jim is not fully sure of it; keep it for now.
- Comparable forms for midline and endline, and forms per grade.
- The story first-line stop rule, score bands for the story and story questions, isiZulu letter
  mastery order. These stay on the roadmap as they are.

**Anti-goals**

- Any change to a result that is already saved, or to what an old version's score means.
- A skip that leaves the EA wondering whether they did something wrong.
- Different content for the same Question in two places.

## 3. The shared content

All content comes from `content/egra/egra-assessments.json` and is never edited by hand. Item order,
case and repeats stay exactly as printed. Practice items are shown in the instructions, never scored.

| Language | Letters | Words, story, story questions |
|---|---|---|
| isiXhosa | `dbe-egra-xh-hl-3-v1`: 100 letters, 10 per row | `dbe-egra-xh-hl-1-v1`: 80 words, 8 per row; 53-word story; 5 questions |
| English | `dbe-egra-en-hl-3-v1`: 100 letters, 10 per row | `dbe-egra-en-hl-1-v1` (**Home Language**): 80 words, 8 per row; 111-word story; 5 questions |
| Afrikaans | `dbe-egra-af-hl-3-v1`: 100 letters, 10 per row | `dbe-egra-af-hl-1-v1`: 80 words, 8 per row; 64-word story; 5 questions |
| isiZulu | `smrs-egra-zu-1-v1`: 110 letters, 10 per row | `smrs-egra-zu-1-v1`: 50 words, 5 per row; 43-word story; 5 questions |

- **Question codes:** `letter_sounds`, `word_reading`, `oral_reading`, `reading_comprehension`, the
  codes Full EGRA uses today. WelaPLUS moves to these codes for its letters, words and story, so its
  results feed the same rankings and history as Full EGRA and the quick tests.
- **Versions:** each shared item set gets a new `question_version`, the same string across languages
  (exact strings are the builder's call; never reuse `2026.2`, `2026.1` or a form id). Each item set
  records the pack form id it came from.
- **Stop rule:** "first row all wrong" for letters and words everywhere (the first row is 10 letters,
  8 words, or 5 words for isiZulu). No "10 wrong in a row" rule remains for new assessments.
- **Timers:** 60 seconds for letters, words and the story, as in the pack.
- **Story questions:** the existing `reading_comprehension` screen, marked step by step with the
  answer guide (built in #107). Questions after an early end are not reached and do not count.

## 4. The new WelaPLUS version

### 4.1 Questions

WelaPLUS `2026.1` (my call on the string), English and isiXhosa only. The other Questions have no
Afrikaans or isiZulu content.

| # | Question | Code | What changes |
|---|---|---|---|
| 1 | Letter sounds | `letter_sounds` | 100-letter chart; first-row stop replaces 10-in-a-row |
| 2 | Listen to a story | `wela_plus_listen_and_answer_story` | none |
| 3 | First sounds | `wela_plus_first_sound` | none |
| 4 | Blending sounds | `wela_plus_phoneme_blend` | none |
| 5 | Letter writing | `wela_plus_letter_writing` | none |
| 6 | Reading words | `word_reading` | Form 1 words (80, 8 per screen); first-row stop |
| 7 | Reading sentences | `wela_plus_read_sentences` | none |
| 8 | Reading a story | `oral_reading` | Form 1 story |
| 9 | Story questions | `reading_comprehension` | **new** |
| 10 | Writing words | `wela_plus_write_cvcs` | none (was Q9) |
| 11 | Writing sentences | `wela_plus_write_sentences_dictation` | none (was Q10) |
| 12 | Story writing | `wela_plus_story_writing` | none (was Q11) |

Unchanged Questions keep their `2024.1` item sets and versions; only the Battery is new.
"About" time goes up by the story questions (builder estimates; around 2 minutes).

### 4.2 Skip rules (Jim, 2026-10-26)

**Triggers.** A trigger is a Question whose **whole first row is marked wrong**: every item in the
first row is saved as reached and incorrect. The app reads this from the saved per-item marks, not
from how the Question ended. For Q1 and Q6 the first-row stop fires on exactly that mark, so the two
always agree. Only Q1, Q5 and Q6 are triggers; a child who gets every sentence wrong in Q7 still
goes on to the story.

- Q1 Letter sounds: all 10 letters of the first row wrong. This is the first-row stop itself.
- Q5 Letter writing: all 6 letters of the Writing Sheet's first printed row wrong (items 1–6:
  a f k o s w in both languages). The EA is expected to mark all 26 letters, but nothing forces it;
  the check runs once Q5 is saved. If any of the first 6 is left unmarked (the EA ended early), it is
  not a trigger.
- Q6 Reading words: all 8 words of the first row wrong. This is the first-row stop itself.

**Effect.** Once any trigger fires, **every reading and writing Question after it is skipped**:

- Q1 or Q5 → skip Q6–Q12.
- Q6 → skip Q7–Q12.
- Q2–Q5 always run. The child always tries listen to a story, first sounds, blending sounds and
  letter writing.
- Q9 Story questions also keeps Full EGRA's rule: skipped if the child read no words of the story,
  or if the EA skipped the story by hand. (A child who never read a story can't answer questions on
  it, so this one rule does follow a manual skip.)
- When more than one trigger is true (Q1 fired and Q5 also has a wrong first row), the **earliest**
  trigger owns the skips and their labels. Q5 still runs and is marked as usual.

Every trigger comes before every Question it skips, so a skip never removes a Question the child
has already started.

**What does not trigger.** Only a first row marked wrong from start to finish counts. If the EA taps
End before the first row is complete, or skips Q1, Q5 or Q6 by hand (child refused, tired), nothing
is triggered. Note that the current evaluator treats a skipped dependency (score `null`) as unmet;
the new rule must not. Jim is not fully sure about early endings; they stay non-triggers for now
and are on the roadmap to revisit.

**Saved results.** Each skipped Question saves the existing `skipped_prerequisite_unmet` reason, so
reports already tell "skipped by rule" apart from "skipped by the EA". No server or schema change is
needed. The EA cannot undo an automatic skip, the same as a skip they choose.

**Materials.** The Writing Sheet is always used (Q5 always runs), so the run-code tick before
finalize stays. Picture Cards are not needed when Q12 is skipped.

### 4.3 The skip card (mockup option A)

When a save creates at least one automatic skip, the assessment's question list shows a bottom
sheet once, straight after the Question that triggered it. The list underneath already shows the
skipped rows. The sheet waits for **Got it**. It never names a pronoun for the child.

| Trigger | Title | Body |
|---|---|---|
| Q1 | No reading or writing today | `{first name}` got every letter in the first row wrong. So `{first name}` won't be asked to read or write words, sentences or a story. This is normal. Carry on with the next Question. |
| Q5 | No reading or writing today | `{first name}` got every letter in the first row of the Writing Sheet wrong. So `{first name}` won't be asked to read or write words, sentences or a story. This is normal. Carry on with the next Question. |
| Q6 | No more reading or writing today | `{first name}` got every word in the first row wrong. So `{first name}` won't be asked to read sentences or a story, or to write. This is normal. |

Under the body, two short lists: **Still to do** (undecided Questions not skipped) and **Skipped**
(the Questions this trigger skipped). After a Q6 trigger nothing is left, so the list's main button
is **Review and finalize**. If a later trigger has nothing left to skip (Q1 already fired), no
second card appears.

Skipped rows read `Skipped · Letters first row wrong`, `Skipped · Letter writing first row wrong`
or `Skipped · Words first row wrong`, replacing today's "Not reached" for these rows. Q9 skipped by
its own story rule reads `Skipped · No story words read`, in WelaPLUS and Full EGRA. The label
comes from the trigger, which the app can work out from the saved results; nothing extra is stored.
A run resumed later shows the same row labels; the card itself is not shown again.

## 5. Full EGRA

- **One Full EGRA per language** (Jim), still called "Full EGRA": isiXhosa, English (Home Language),
  Afrikaans and isiZulu, with the §3 content. Questions: Letter sounds, Familiar words, Reading a
  story, Story questions, as today.
- **No form picker.** The Full EGRA card's Start goes straight to choosing a child, and the assessment
  opens in the child's class language. If the class has no language, the existing language sheet
  offers the four. A class language that is not one of the four shows the same "Not available in
  … yet" note WelaPLUS shows for Afrikaans. English classes, including First Additional Language
  ones, get the English Home Language content (Jim, 2026-10-25; the pack has no FAL Form 1 to use).
- **In code (my call):** a single Battery `egra@2026.1` with languages xh, en, af and zu, and no
  `fixedLanguage`. The child-select screen already starts a multi-language Battery in the class
  language (`chooseBatteryLanguage`), and `battery_runs.language` keeps the languages apart in
  reports, so the EA sees exactly one Full EGRA per language. Host work: the card skips the picker,
  and the bundled item-set lookup covers the shared sets.
- **Skip behaviour is unchanged:** only the story questions are skipped after a story with no words
  read. Letters and words use the first-row stop as today.
- **The 13 forms** stop being offered for new assessments. Unfinished ones can still be resumed and
  finalized, and saved results stay readable with their own versions, including `-masi60` letter
  sets. `letterExtensions.ts` stays only as long as reading those old results needs it; the EGRA
  session decides how to retire it.

## 6. The quick tests

- **Letter Sounds** and **Word Reading** use the §3 item sets in the child's class language. isiZulu
  joins English, isiXhosa and Afrikaans because the content now exists.
- **Stop rule:** first row all wrong. The instructions change from "After 10 wrong in a row, the test
  stops" to the first-row wording Full EGRA uses.
- **isiZulu letter mastery** has no letter order yet. An isiZulu Letter Sounds result must save and
  show its score without breaking the mastery screens; it simply does not feed mastery until the
  order exists.

## 7. Rollout, printing and reporting

- **Versions sit side by side.** WelaPLUS `2024.1`, the 13 EGRA forms and the old quick-test sets stay
  registered so unfinished assessments finish and history reads correctly.
- **The WelaPLUS switch is a server change:** Head Office sets the literacy programme's
  `default_battery_version` to `2026.1` once the reprinted Reading Cards are in the field.
  Unfinished `2024.1` assessments finish on `2024.1`.
- **Full EGRA and the quick tests** change when the app update ships (open question for Jim, §9).
- **One Reading Card per language** serves WelaPLUS, Full EGRA and the quick tests: letters (10 × 10,
  or 11 × 10 for isiZulu), words (rows of 8, or 5 for isiZulu) and the story. WelaPLUS's sentences
  also need a place on the card. `documentation/welaplus-printout-pack.md` is updated with the new
  layout, footers that name the language and content version rather than WelaPLUS alone, and
  physical proofs; it supersedes the Grid A 6 × 10 and the 5 × 8 Side B reprint. Writing Sheet and
  Picture Cards do not change.
- **Reporting.** WelaPLUS letters and words now feed the Letters and Words rankings alongside Full
  EGRA and the quick tests. Letter score bands stay as they are (correct letters in 60 seconds per
  grade). Rankings already combine every version of a Question (they read by Question code), and
  they keep doing so: the measure is correct items in 60 seconds. No reporting change is in this
  spec.

## 8. Left to the builder

- Exact version strings, item-set file layout, and how the adapter builds shared item sets from the
  pack (one adapter, used by all three hosts).
- How the evaluator expresses "first row all wrong" triggers and "skip everything after" (the
  current `PrerequisiteRule` allows one dependency and a minimum score; it needs extending). It stays
  a pure function with table-driven tests.
- How the overview detects "this save created skips" to show the card once.
- Sentence placement on the printed card, settled with the printout pack update and a physical proof.
- Tests: every trigger and non-trigger (end early, manual skip, timer before the row is done, Q5 with
  later letters right), resume after force-quit, both languages, and Full EGRA's story-questions rule
  in its new form.

## 9. Open for Jim

1. **When do Full EGRA and the quick tests switch to the new cards?** WelaPLUS waits for Head
   Office's server change, but Full EGRA and the quick tests would change the moment EAs update the
   app. If EAs still hold the old cards then, they will read from the wrong card. My recommendation:
   ship the app update only once the new cards are printed, or tie all three to the same programme
   switch.

## 10. Documents this changes

- `documentation/ROADMAP.md` §7–8: replace the two follow-on specs with this spec; add the deferred
  items in §2; drop the 60-letter Grade 1 card printing (superseded); note the skip-switch decision
  (Head Office default and lock, EA Profile toggle).
- `documentation/welaplus-printout-pack.md`: new Reading Card layout per §7.
- `CONTEXT.md`: "skip rule" and "first row all wrong" as domain terms, if not already there.
- `docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md`: a dated amendment note pointing
  here (Release 1 said "no auto-skip").
