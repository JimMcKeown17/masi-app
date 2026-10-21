# WelaPLUS Release 1 — Design

> **Status note — 2026-10-20:** The [Assessment Results and Letter Test design](./2026-10-19-assessment-results-and-letter-test-design.md)
> supersedes this document's §7 storage/upload design, D4's Q1 stop-rule decision and D10's
> ADR-0007 enforcement/transport design. Q1 is now `letter_sounds`, sharing the standalone Letter Sounds item sets
> and complete-result write contract. Assessment Results Plan 1, Tasks 1–12, implements that
> upload/phone cutover; mastery confirmation re-keying and history pull remain its Plans 2 and 3.
> The original body below is preserved as the 2026-10-14 design record.

> **Status update — 2026-10-21 (lesson-plan AF):** The WelaPLUS host (Plan 3) must not offer
> WelaPLUS to an Afrikaans class until the battery has Afrikaans (`battery/wela_plus_full.ts:49`
> lists `en`, `xh`). Start shows "Not available in Afrikaans yet", and the WelaPLUS language picker
> lists only the battery's languages (lesson-plan spec C22). The package now uses `MissingItemSet`
> rather than an English fallback: an Afrikaans run would show a missing card on every Question
> and have no instructions.

**Date:** 2026-10-14
**Status:** Design approved in conversation (Jim, 2026-10-14). Codex adversarial review: three rounds (9 → 4 → 1 findings, all verified and addressed; the last round still returned needs-attention before its single fix). Written spec approved by Jim 2026-10-14.
**Parent PRD:** [`documentation/wela-plus-battery-prd-2026.md`](../../../documentation/wela-plus-battery-prd-2026.md)
(design-complete, four Codex reviews). This spec does **not** restate the PRD. It records what
Release 1 builds, the decisions taken on 2026-10-14 that change or narrow the PRD, and the
2024 source-content facts the PRD did not have.

## 1. Goal

Make the whole WelaPLUS battery (11 Questions) a selectable assessment in the Masi app for Core
Literacy R–3 EAs. Results are marked on the tablet, saved offline-first, and synced. The field
team must know exactly what to print.

Success means:

- A Core Literacy R–3 EA can start a WelaPLUS run for a child, administer all 11 Questions,
  resume an unfinished run, skip a Question with a reason, finalize, and see per-Question
  scores.
- Each completed Question is saved in one SQLite transaction and syncs to `masi-app-sqlite`.
  The rows match the PRD's three-level shape: `battery_runs` → `assessments` →
  `assessment_items`.
- The printout pack (section 9) is precise enough for Masi's designer to produce it from the
  existing 2024 InDesign files without asking engineering anything.

## 2. Decisions taken on 2026-10-14

| # | Decision | Effect on the PRD |
|---|---|---|
| D1 | **The child reads Q1, Q6, Q7, and Q8 from a printed card.** The tablet is the EA's private marking view. | Changes the PRD's reading layouts. Drops the "Assessment text size" Settings row and the first-reading-Question font hint. Marking layouts mirror the card row by row. |
| D2 | **Paper first, photos next.** Release 1 ships with no photo capture. EAs keep handing in the written sheets for Q5, Q9, Q10, and Q11, as today. | Defers to Release 2: `battery_run_artifacts`, the `battery-run-photos` bucket and its RLS, `photo_upload_queue`, the photo upload lane, the "Sync photos over cellular" Settings row, and the missing-photo warning. |
| D3 | **Core Literacy R–3 only.** Access comes through `programmes.default_battery_code`/`default_battery_version`. | Matches the PRD's programme → battery mapping. No battery picker. |
| D4 | **No prerequisite auto-skip in Release 1.** Stop rules are soft, shown as copy, as on paper. | The battery config keeps a `prerequisite_gates` list, **empty in 2024.1**. Turning on "skip reading if Q1 < N" later is a config change plus a new battery version, not a code change. Jim confirmed this rule is wanted in future. |
| D5 | **Q10 is scored one mark per correctly written word.** | English max = 15, isiXhosa max = 9. Replaces the paper's "/12" (section 4.3). |
| D6 | **Language comes from the child's class `home_language`, with a picker fallback**, reusing EGRA's `AssessmentChildSelectScreen` behaviour. | None. |
| D7 | **Approach A: the PRD's three-level data model**, with the run row created at run start and a per-Question atomic save. | None (confirms the PRD). |
| D8 | **No window tagging at run start in Release 1.** Every run is saved as `assessment_purpose = 'progress_check'` with `assessment_window_id = null`. Window attribution happens at reporting time from `started_at` and the child's academic year. | Changes PRD "host tags the active Window". Local `assessment_windows` contains a trigger-generated baseline spanning the whole academic year (`src/db/migrations.js` `ensure_active_year_baseline_window_*`). Overlaps are allowed, so tagging on the device would mislabel runs. Revisit once windows are authoritative and non-overlapping. Recorded after Codex review round 1; confirmed by Jim 2026-10-14. |
| D9 | **No identity change. ADR-0007 supersedes it.** `assessmentItemDomainId` stays as it is. Q11 EA rows use positions 1–4; HQ calibration rows (future) use positions 5–8. | Removes the "ADR-0004 identity change" prerequisite that the merge commit and ROADMAP §8 carried. Accepted ADR-0007 (2026-09-23) keeps the id because submitted answers are immutable. Q11's EA/HQ disambiguation is achieved by distinct positions plus the `ea:`/`hq:` `item_key` prefix, without rehashing. |
| D10 | **ADR-0007 enforcement is a prerequisite.** EAs cannot UPDATE or DELETE `assessments`/`assessment_items`, and the family pushes as insert-or-ignore. | If the planned assessment-history slice has not landed this by the time WelaPLUS needs it, WelaPLUS Slice 1 lands it. |

## 3. Scope

**In Release 1:**

- ADR-0007 enforcement for the assessment family (D10, section 7.1), unless already landed.
- An additive Supabase migration and SQLite schema v10 for `battery_runs`, the `assessments`
  Run-era columns, and the `programmes` battery columns (section 7).
- Battery definition `wela_plus_full@2024.1` and a pure battery-state evaluator (section 6).
- Real 2024 content for all 11 Questions, in English and isiXhosa (section 4).
- Component changes driven by D1, D5, and the source content (section 5.3).
- Host Run flow: Assessments-tab entry, child select, Battery overview, Question host, skip,
  finalize, abandon, and summary (section 5).
- The printout pack specification (section 9).

**Not in Release 1:** photos and everything in D2, prerequisite auto-skip, window tagging (D8),
any change to item identity (D9), pulling or hydrating
`battery_runs` to other devices, the HQ dashboard and HQ calibration RPC, OSS package
extraction or publication (#37), Settings UX (#26), migrating EGRA to the new components, and a
child-profile entry point. The PRD's primary entry is the child profile, but the app has no
child profile screen today. The Assessments tab is the Release 1 entry, and a child-profile
entry can be added when that screen exists.

## 4. Source content (2024 booklet) and corrections

Source: the 2024 WelaPLUS booklet, handout, and instruction sheet, in English and isiXhosa, in
Jim's Drive under *Literacy Programme Materials / Masi WelaPLUS Literacy Assessment 2024 Folder
/ … – FINAL*. Version label for this content: **`2024.1`**. Every item set's `question_version`
moves from `stub-*` to `2024.1`.

### 4.1 What the paper does, by Question

| Q | Code | Child-facing material on paper | EN max | XH max |
|---|---|---|---|---|
| 1 | `wela_plus_letter_sounds` | Handout letter grid, 5 rows × 12 | 60 | 60 |
| 2 | `wela_plus_listen_and_answer_story` | None. The EA reads the story aloud once | 5 | 5 |
| 3 | `wela_plus_first_sound` | None (oral) | 10 | 10 |
| 4 | `wela_plus_phoneme_blend` | None (oral) | 8 | 8 |
| 5 | `wela_plus_letter_writing` | Booklet page: 26 pictures; the child writes each first letter | 26 | 26 |
| 6 | `wela_plus_read_words` | Booklet page: 40 words in 6 rows | 40 | 40 |
| 7 | `wela_plus_read_sentences` | Booklet page: 4 sentences | 20 | 11 |
| 8 | `wela_plus_read_passage` | Handout passage | 80 | 45 |
| 9 | `wela_plus_write_cvcs` | Booklet page: 4 pictures; the child writes each word | 12 | 18 (whole word scored, Jim 2026-10-19; see 4.2) |
| 10 | `wela_plus_write_sentences_dictation` | Booklet lines; the EA dictates 2 sentences | 15 (D5) | 9 (D5) |
| 11 | `wela_plus_story_writing` | Picture cards; the child writes a story | 16 | 16 |

The `question_code` values above are the codes the merged item sets already use (verified on
`main` at `da5ee91`). They are stored on every row, so they must not be renamed.

Maximum scores are always **derived from the item set**, never hard-coded, because English and
isiXhosa differ.

### 4.2 Content (verbatim from the 2024 PDFs)

**Q1 letters.**
- EN rows: `a n i t m s p e b c i u` / `f l d h o k g f r u f s` / `e s i a y u w c z m o f` /
  `n p q j t v x y a n t n` / `k b m s p e b l d g a d`.
- XH rows: `l a m e s n l s m e y i` / `k n d h f u h v f y c i` / `t k d z f d t z o j p r` /
  `c w p o w a e x q l g o` / `u z x r v b j b q u r g`.
- Stop rule: "If the child gets an entire row wrong, STOP immediately. Otherwise, STOP at 1
  minute." Timer: 60 s. Score letter **sounds**, not names.

**Q2 story (EA reads once, about one word per second).**
- EN: "A girl was out for a walk. She was wearing her new running shoes. There were so many
  trees around her. She looked up at the trees, they were tall and beautiful. Then suddenly,
  she heard someone crying. She walked towards the sound and saw a boy lying on the ground
  under a tree. Next to him was a broken branch. The boy was bleeding from a wound on his knee
  and there was a big scratch on his elbow."
- EN questions, with acceptable answers:
  1. What did the girl have on her feet? (running shoes)
  2. What did she hear? (crying)
  3. Where do you think she was? (near trees / in a forest / park)
  4. What happened to the boy? (he fell from a tree)
  5. What do you think the girl felt when she saw the boy? (she felt sorry for him / sad, or
     similar)
- XH story: "Intombazana ethile yayihambahamba phandle. Yayinxibe izihlangu zayo zokubaleka
  ezitsha. Kwakukho imithi emininzi, emide emihle, kuloo ndawo yayihamba kuyo. Ngequbuliso,
  yeva umntu okhalayo. Yahamba yaya kwelo cala sasivela ngakulo isikhalo yaze yabona
  inkwenkwe iphantsi komthi. Ecaleni kwayo kwakukho isebe lomthi elaphukileyo. Inkwenkwe le
  yayisopha inenxeba edolweni kwaye igruzukile nasengqinibeni."
- XH questions, with acceptable answers:
  1. Yayinxibe ntoni ezinyaweni intombazana? (izihlangu zokubaleka)
  2. Yeva ntoni? (umntu okhalayo)
  3. Ucinga ukuba yayiphi? (ngasemithini / ehlathini / epakhini)
  4. Kwakwenzeke ntoni enkwenkweni? (inkwenkwe yawa emthini)
  5. Ucinga yeva njani intombazana xa ibona inkwenkwe? (yayiselza / yakhathazeka, okanye
     nayiphi impendulo efana nezi)
- The English source has the typo "he felt from a tree"; use "fell". The isiXhosa source has
  "imtombazana" in question 5; pedagogy confirms the spelling ("intombazana" is assumed).

**Q3 first sound.**
- Practice script is in the instruction sheet.
- EN: walk read dance paint cut sing jump hug look talk.
- XH: hamba funda danisa baleka lala cula sika mamela zoba vuka.

**Q4 phoneme blend.** The EA says the segmented form; the gloss is shown to the EA only.
- EN: s-u-n (sun), b-oo-k (book), m-ee (me), u-p (up), o-n (on), s-ee (see), f-or-k (fork),
  j-a-m (jam).
- XH: y-a-m (yam), k-u-m (kum), l-o (lo), y-a (ya), ke (ke), x-a (xa), b-a-m (bam),
  s-a-m (sam).

**Q5 letter writing.**
- 26 cells, one per letter a–z, in the booklet's grid order (rows of 6).
- **The letter order is the same in both languages:** `a f k o s w / b g l p t x / c h m q u y
  / d i n r v z / e j`. This was read from the EN and XH booklet pages at 110 dpi on
  2026-10-14.
- EN pictures:
  - Row 1: apple, fish, key, orange, sun, whale.
  - Row 2: bed, gate, leaf, pot, table, x-ray (a child holding a chest **x**-ray).
  - Row 3: cat, hat, moon, queen (crowned figure, **q**), umbrella, yo-yo.
  - Row 4: dog, insect, net, ring, van, zebra.
  - Row 5: elephant, jacket.
- XH pictures differ but keep the same letters:
  - Row 1: apple (i-apile), tortoise (ufudo), cat (ikati), orange, bread, watch.
  - Row 2: milk, drum, sun, pear, table, and an x cell with no picture in the 2024 booklet. The
    x cell is scored; new artwork shows a clock (*ixesha*) (Jim, 2026-10-19).
  - Row 3: spoon, pig, car, egg, tree, medicine.
  - Row 4: duck, dog, nest, traffic light, van, axe.
  - Row 5: bucket, jug.
- The XH picture names are isiXhosa with an English gloss (Jim, 2026-10-19), for example
  `ufudo (tortoise)`. g (drum), n (nest) and z (axe) keep English placeholders while the Masi team
  chooses better pictures (4.3 #1). The EA, not the child, reads them.
- The app needs only the **expected letter** and the **picture name** per cell. It shows no
  images (D1/D2).

**Q6 words.**
- EN, 40 words, rows of 7:
  - the and in of be run bus
  - not are we like can but an
  - have that for what was your why
  - there how there how come with my
  - up green box happy play every week
  - farm table boy new old
- XH, 40 words:
  - le yam lo wam eli inja bona
  - funa igama ndi ewe nini ikhaya thanda
  - mama jonga hayi emva into ixesha imini
  - ubhuti yiza izolo zisa ibali ibhola baleka
  - nceda ilanga onke omkhulu phezulu inkulu bomvu
  - bantu amanzi izinto usapho kakhulu
- The English list contains **"there how" twice**. Keep it verbatim. Item identity is by
  `position`, and `item_key` is not unique within a Question (section 7.4).
- Stop rule: "If they get 5 in a row wrong, or clearly do not know any, stop immediately."
- **Q6 is timed at one minute** (Jim, 2026-10-19), although the paper has no timer. The stop rule
  still applies; the instruction ends "Otherwise STOP at 1 minute."

**Q7 sentences, scored per word.**
- EN: "A cat ran" / "The pot was red" / "The car was driving very fast" / "Who wants to come
  with me today?" (20 words).
- XH: "Usana luyalila" / "Umakhulu upheka ipapa" / "Ndivuka kusasa ndaxukuxa" / "Amakhwenkwe
  adlala ibhola" (11 words).

**Q8 passage.**
- EN "Sam" passage, 80 words: "Sam was running down the street with her friends. She fell down
  and cut her knee. It hurt a lot. She started to cry. Thandi stopped to help her. She picked
  Sam up and they walked back to her house. Sam's mother gave her a big hug. Then she walked
  into the kitchen. When she came back out, she was holding two bowls of ice cream. Sam and
  Thandi sat down to eat some ice cream. Everyone felt much better."
- XH "uSihle" passage, 45 words: "USihle wayethanda kakhulu ukubaleka. Izolo uthe esadlala
  ebaleni ebaleka, wasuka wakhubeka wawa. Uye walila kakhulu uSihle, waphakama wagoduka
  eqhwalela. UThando uhambe naye wamgodusa emgonile. Bathe bakufika ekhaya umama
  wamthuthuzela uSihle. Emva kokuba ethule, umama uye wampha amaqebengwana amnandi. Uye
  wawavuyela kakhulu amaqebengwana, babelana ngawo noThando."
- Paragraph breaks follow the handout. **Q8 is timed at one minute** (Jim, 2026-10-19), so
  correct-words-per-minute is reported. When the minute ends, the EA marks the last word
  attempted.

**Q9 CVC writing, scored per letter.**
- The EA says each picture name twice.
- **Numbered order (authoritative for the item set, the EA prompts, and the writing sheet):**
  - EN: 1 jam, 2 hut, 3 fin, 4 net (4 × 3 = 12). This is the order of the instruction sheet.
    The 2024 booklet lays them out in two blocks: jam over hut on the left, fin over net on the
    right.
  - XH: 1 lala, 2 sela, 3 imali, 4 idolo. The 2024 XH booklet orders them the same way
    (sleeping over drinking on the left, money over knee on the right).
- **Scoring units are explicit in the content.** Each word lists the letters that score.
  EN: `j a m`, `h u t`, `f i n`, `n e t` (12). XH: `l a l a`, `s e l a`, `i m a l i`,
  `i d o l o` (18). The whole word is scored, including the noun-prefix `i` of *imali* and
  *idolo* (Jim, 2026-10-19), so the 2024 booklet's /16 is superseded and the printed sheet
  changes to /18. Changing a scoring unit is a content edit, not a code change.
- The writing sheet prints the numbers 1–4 beside each picture (section 9.3), so reading order on
  the paper can never be ambiguous.

**Q10 dictation, scored per word (D5).** The EA reads each sentence twice and must not repeat it
while the child writes.
- EN: "Mom got a cat from a pet shop." / "It drinks milk and sleeps with us."
- XH: "Ikati yam isela ubisi" / "Ithanda inyama kwaye ihlala elangeni."

**Q11 story writing.**
- The EA script is verbatim from the booklet ("Show the child the Picture cards and ask: What
  can you see in these pictures? …").
- Rubric dimensions: Meaning Making, Spelling, Length, Vocabulary. **Interim scale (Jim,
  2026-10-19): each scored 1–4, total /16, with no anchor descriptions.** The score range is
  item-set data (`score_range`), not code, because the rubric is expected to be redesigned.

### 4.3 Open content items (pedagogy; none blocks building)

Jim answered the 2026-10-14 list on 2026-10-19: Q5 EN x = x-ray and q = queen; Q5 XH names as in
4.2, with the x cell scored as a clock (*ixesha*); Q9 XH scores the whole word (/18); Q6 and Q8
are timed at one minute; Q11 uses an interim 1–4 scale without anchors. Still open:

1. **Q5 pictures:** the Masi team chooses better pictures, with isiXhosa names, for g (drum),
   n (nest) and z (axe), and draws the clock artwork for x.
2. **Q11 rubric:** the interim 1–4 scale has no anchor descriptions and no isiXhosa labels. Jim
   expects to redesign the rubric; a new scale is a content change (`score_range`).
3. **isiXhosa spelling check** of all transcribed strings by a first-language reviewer.

Items 1 and 3 must be closed before the pilot build, and are tracked under #34.

## 5. EA flow (host app)

### 5.1 Entry

- **Assessments tab.** A **WelaPLUS** card is shown only when the EA's active programme has
  `default_battery_code = 'wela_plus_full'`. Gating reuses the existing `activeProgrammeGate`.
  The card has two actions:
  - **Start**, which goes to `AssessmentChildSelectScreen` in a WelaPLUS mode, with D6 language
    resolution.
  - **Unfinished runs**, which lists this EA's runs with `status = 'in_progress'` on this
    device. Each row shows the child's name, how many Questions are decided out of 11, and when
    it was started. Tapping a row resumes the run.
- **Starting a run** writes the `battery_runs` row immediately (status `in_progress`, saved as a
  progress check per D8), so a run survives a force-quit before Q1.
- **Run code.** Every run shows a short, human-copyable **run code** derived deterministically
  from its UUID: the first 6 base-32 characters, shown as `K7Q-4MD`. No new column is needed.
  It appears on the Battery overview and the summary. It is the only paper-to-run link in
  Release 1 (section 9.3). Head Office matches a sheet by run code plus child name. Two runs
  for the same child sharing a 6-character prefix is negligible, and the child name breaks any
  tie.
- **One unfinished run per child per EA.** If the EA picks a child who already has an
  unfinished run, they get a bottom sheet: "Resume unfinished run" or "Abandon it and start
  new". The PRD allows multiple runs per child per window (latest is canonical); this rule only
  prevents accidental parallel open runs.

### 5.2 Battery overview

- A list of the 11 Questions in battery order. Each shows its state: not started, done (with
  score / max), or skipped (with reason).
- The primary action is **Start next**: the first undecided Question in battery order.
- An undecided Question's row menu offers **Skip with reason**. The reasons are the PRD's
  manual skip set: `skipped_child_refused`, `skipped_tired`, `skipped_time`, `skipped_age`,
  `skipped_other`. Skipping writes the PRD's skipped-row shape.
- Once every Question is decided, **Finalize run** is enabled.
- **Abandon run** is a secondary, confirmed action.
- Linearity comes from the evaluator (section 6), not the screen. Switching later to a free
  picker is a config change.

### 5.3 Question host and component changes

The Question host wraps one Question component.
- It supplies `language`, `itemSet`, `instructions`, and `durationSec` from the battery
  definition.
- **Exactly one terminal outcome per Question presentation.** This changes the merged
  components: today ReadWords, ReadSentences, and WriteCvcs call `onAbandon(reason)` **and then**
  `onComplete` for one skip (`ReadWordsQuestion/index.tsx` around lines 227–230).
  - **Complete or skip inside the Question** → exactly one `onComplete(result)`. A skip carries
    `stopped_reason ∈ {skipped_child_refused, skipped_tired, skipped_time, skipped_age,
    skipped_other}` and empty `items`. The host saves it with `saveQuestionResult` (completed)
    or `saveSkippedQuestion` (skipped).
  - **Cancel** (the EA backs out of the Question screen) is a **host** action. No component
    callback fires, nothing is written, and the Question stays undecided. `onAbandon` is removed
    from the component contract, or kept as a notification that never precedes `onComplete`.
  - `skipped_prerequisite_unmet` is removed from the components' manual skip picker. It is
    reserved for host auto-skips (D4).
- Force-quit during a Question restarts that Question, per the PRD.

Each Question's **intro screen** shows:
- the EA script and practice lines;
- the stop rule;
- a **"Hand the child …" materials line** naming the exact printed item, side, and language
  (section 9), or "No materials — oral" for Q2, Q3, and Q4.

Required component changes. Each keeps the OSS boundary and passes the contract test.

| Q | Change |
|---|---|
| 1 | Marking grid mirrors the card: **5 rows × 12**, one scroll view, no 20-per-page pagination. |
| 1, 6, 8 | **Explicit last-attempted marker.** Today Q1 derives `last_attempted_position` from the last displayed page, and Q6/Q8 advance it only on correct taps (`LetterSoundsQuestion/index.tsx` ~91–112; `ReadWordsQuestion` ~199–209). Both are wrong once pagination and timers change. When one of these Questions ends by End, stop rule, or timer, the EA taps the **last item the child attempted** in a sheet that also offers "Reached the end" and "Nothing attempted". This reuses the EGRA `LastAttemptedBottomSheet` interaction, rebuilt inside the package because of the OSS boundary. Positions stay **zero-based**, as the merged components emit them. `derived.total_attempted = last_attempted_position + 1`. **`-1` means nothing attempted**, the sentinel the existing contract validator and `ReadWordsQuestion` already use; `null` is reserved for Questions that do not track progress. Items after it are "not reached" (`is_correct = false`, `metadata.reached = false`), not wrong. `derived.tracks_progress = true` makes the validator require a numeric position. Pinned cases: nothing attempted, first item only, a row boundary, and the final item, each checked on the emitted and the persisted values. |
| 7 | Q7 has no early-stop rule on paper, so it gets no marker sheet. **Finish** means every sentence was presented: `tracks_progress = true` and `last_attempted_position` = the last word. A skip emits no items. |
| 6 | Rows mirror the card (6 rows of up to 7). Timed at 60 s per 4.2. |
| 1, 6, 8 | **Reading time freezes when reading stops**: at End, or at the exact 60 s deadline. `duration_ms` and Q8's `correct_words_per_minute` never include the time the EA spends on the last-attempted sheet; cancelling an End clears the stop. |
| 7 | Structure unchanged (per-word pills grouped by sentence); content plus the Finish rule above. |
| 8 | Paragraphs mirror the handout. Timed at 60 s per 4.2 (`durationSec: 60` in the battery). An omitted `durationSec` still means untimed, so the timing is battery data. `correct_words_per_minute` is reported, and `last_attempted_position` records where the child stopped. |
| 1, 6–8 | Remove the child-facing font-size dependency. Pills use a fixed EA marking size from design tokens; `useChildReadingFontSize` is removed or returns a constant. |
| 5 | Cells show **picture name + expected letter** (for example, "apple → a"). No image. |
| 9 | **Per-letter marking**: each word is a row of letter cells. Items are letters with `item_key` like `w1.l2`; `prompt` is the letter; metadata holds the word. |
| 10 | **Per-word marking** grouped by sentence (Q7's layout shell). Items are words. |
| 11 | No picture thumbnail (the EA holds the physical cards). The chip range and any anchors come from the item set (`score_range`, interim 1–4; 4.3 #2). Totals and items stay as built (ADR-0004 `ea:` keys). |
| All | Raw hex colours replaced with Masi design tokens. This is the ROADMAP §8 conformance pass, scoped to the 11 Questions. |

### 5.4 Finalize and summary

- **Finalize** sets `completed_at`, `status = 'completed'`, and locks the run.
- The summary shows each Question's score / max (or its skip reason), plus a paper checklist
  the EA must tick before leaving the screen:
  - *"Write run code **K7Q-4MD** and the child's name on the Writing Sheet."*
  - *"File the sheet for Head Office with this week's sheets."*
- The run code is also shown on the Battery overview **before Q5**, the first written Question,
  so the EA can write it on the sheet while handing it over.
- With no photos in Release 1, finalize has no photo step.

## 6. Battery definition and evaluator (OSS package)

**`batteries/wela_plus_full.ts`, version `2024.1`:**
- an ordered list of 11 `question_code`s;
- per Question: `instructions` copy (EN/XH), an optional `durationSec` (Q1, Q6 and Q8, each 60), a
  `materials` descriptor `{ item: 'reading_card' | 'picture_cards' | 'writing_sheet' | null,
  side?: 'A' | 'B' | 'C', section? }`, and `paper_marked: boolean` (Q5, Q9, Q10, Q11; consumed
  by Release 2 photos);
- `prerequisite_gates: []` (D4);
- `languages: ['en', 'xh']`.

**`evaluateBatteryState(battery, decidedResults)`** is pure. It returns:
- `{ nextQuestion, decided, undecided, autoSkips, eligibleToFinalize }`;
- `autoSkips` is always empty in 2024.1, but it is fully implemented and unit-tested against a
  test battery that has a gate, so D4's future change is config only.

This is the PRD's "deep module" and gets exhaustive unit tests.

## 7. Data

All of section 7 follows PRD §2 (*Migrations and rollout*, *Masi storage mapping*, *Local
SQLite mirror*, *Sync outbox ordering*) **except** where noted here.

### 7.1 Prerequisite: ADR-0007 enforcement for the assessment family (D10)

Accepted ADR-0007 makes submitted assessments immutable but is **not yet enforced**. Hosted RLS
still grants EA UPDATE/DELETE on `assessments` and `assessment_items`
(`supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql` ~1013–1085). The outbox's
insert-or-ignore path covers only `IMMUTABLE_ASSIGNMENT_TABLES`
(`src/services/offlineSync.js` ~306, ~704–726). WelaPLUS depends on immutability. Without it, a
finalized run's scores could be edited, and an owned assessment could be re-pointed at another
run. So if the planned assessment-history slice has not already done this, WelaPLUS Slice 1 does
exactly what ADR-0007 *Consequences* lists:

- remove EA UPDATE and DELETE policies on both tables;
- push both tables as insert-or-ignore by `id`, by adding them to the immutable-insert set;
- `saveAssessment` and `saveQuestionResult` refuse an id that already exists locally;
- tests: real-SQLite duplicate refusal, a PostgreSQL harness case for direct UPDATE/DELETE
  denial, and a replay of an already-landed row succeeding as a no-op.

**No identity change (D9).** `assessmentItemDomainId` stays as it is. The merged
`__tests__/assessmentItemDomainId.contract.test.js` stays as the guard. Its comment that it
"flips when the fix lands" is updated to cite ADR-0007, and ADR-0004 gets a dated note:
HQ calibration rows use **positions 5–8**, so EA (1–4) and HQ rows never share
`(assessment_id, position)`. This also satisfies the unique index
`idx_assessment_items_unique_position`. No staging rekey, device reset, or wipe is required by
this release. The separately decided staging wipe (ROADMAP §0) is unaffected.

### 7.2 Supabase migration (additive, one file)

- `battery_runs`, per PRD §2, plus `assessment_purpose`, with the same purpose/window CHECK
  shape as `assessments`. Release 1 always writes `progress_check` / `null` (D8); the columns
  exist so window attribution can be added without a migration.
- `assessments`: `battery_run_id`, `question_code`, `question_version`, `item_set_id`,
  `stopped_reason` (10-value CHECK), `language`, `duration_ms`, `ea_rubric_total`,
  `hq_rubric_total`. Add a partial unique index on `(battery_run_id, question_code)` where
  `battery_run_id is not null`.
- `programmes`: `default_battery_code`, `default_battery_version`, with a both-or-neither CHECK.
  A data statement sets Core Literacy R–3 to `wela_plus_full` / `2024.1`; the target programme
  row is located by its code, verified in a read-only preflight first.
- The PRD's `assessment_items.is_correct` default false and the EGRA `question_code` backfill.
- **Not in this migration (D2):** `battery_run_artifacts`, the storage bucket, and Storage RLS.

### 7.3 RLS

**Design principle (from Codex round 1).** An EA can finish and finalize a whole run offline.
The outbox then delivers the run's latest state, which may already be `completed`, and pushes
by table before creation time (`offlineSync.js` ~931–944). So the server **must accept a
Question that arrives after its run is finalized**. Run status therefore gates only the run row
itself, never its descendants. Descendant integrity comes from immutability (7.1) and identity
consistency, not from status.

**`battery_runs`:**
- SELECT: owner, plus the same child-read helper scope as `assessments`.
- INSERT: `user_id = (select auth.uid())`, active child assignment, and active programme
  assignment.
- UPDATE: RLS checks **ownership only** (`USING`/`WITH CHECK user_id = (select auth.uid())`).
  A `BEFORE UPDATE` trigger enforces the lifecycle:
  - identity columns (`id`, `user_id`, `child_id`, `programme_id`, `class_id`,
    `battery_code`, `battery_version`, `language`, `started_at`) are immutable;
  - `in_progress` → `in_progress` (no status change), `completed` (requires `completed_at`),
    or `abandoned` are allowed;
  - **an identical replay of a terminal row is a no-op success.** Same status and same
    `completed_at` returns `OLD` and changes nothing. This makes a lost-acknowledgement retry
    safe;
  - any other change to a terminal row (reopen, different terminal status, different
    `completed_at`) is rejected with SQLSTATE `23514`. The sync engine classifies that as
    terminal, as it already does for immutable assignments.
- Retry-safe creation: the run is pushed by upsert. A replayed insert of an existing
  `in_progress` row is an identical update, so it is a no-op.

**`assessments` with a non-null `battery_run_id`** (INSERT `WITH CHECK`, in addition to the
existing owner, child, and programme checks): the referenced run exists, has
`user_id = auth.uid()`, and has the **same `child_id` and `programme_id`** as the assessment.
There is **no status condition** (design principle above). Re-pointing an existing assessment
to another run is impossible because ADR-0007 removes UPDATE (7.1).

**Consequence, accepted:** the server cannot stop a modified client from adding a Question to a
finalized run of its own. The app prevents it locally (the overview never offers a decided
Question, and a finalized run is read-only), and the partial unique index prevents duplicates.
Reporting treats the run's Questions as whatever has arrived.

**PostgreSQL harness cases:**
- own versus another EA's run;
- revoked child assignment;
- reopening or changing a terminal run (rejected);
- identical terminal replay (no-op success);
- a Question inserted after its run is `completed` (accepted);
- a Question whose `child_id` differs from its run (rejected);
- direct UPDATE/DELETE of assessments and items (rejected, 7.1).

### 7.4 SQLite v10, repository, outbox

- **Schema v10** mirrors 7.2, using `LOCAL_SYNC_COLUMNS` for `battery_runs`. The PRD's "bump 1 →
  2" text is stale: the current version is 9.
- **`batteryRunsRepository`**: `startRun`, `getUnfinishedRunsForUser`,
  `getUnfinishedRunForChild`, `finalizeRun`, `abandonRun`, and `getRunWithResults`. Each write
  enqueues its outbox row in the same transaction.
- **`assessmentsRepository.saveQuestionResult({ result, batteryRun })`** follows the PRD
  mapping table. It writes one `assessments` row, N `assessment_items` rows, and their outbox
  rows in one transaction. Item identity is by `position`; `item_key` is not unique within a
  Question (Q1 repeats letters; the English Q6 repeats words).
- **`assessmentsRepository.saveSkippedQuestion({ batteryRun, questionCode, reason })`** follows
  the PRD skipped-row shape.
- **Outbox order:** `battery_runs` → `assessments` → `assessment_items`. Add entries to
  `PUSH_ORDER`/`TABLE_DEPENDENCIES` and the `SERVER_COLUMNS` allowlist. The run's outbox row
  carries its *latest* state, so a run finalized offline arrives as `completed` before its
  Questions. 7.3 makes that safe, so no operation-aware reordering is needed.
- **Push semantics for `battery_runs`, by outbox operation:**
  - **`insert`** (the run has never been acknowledged by the server) uses upsert. An offline
    run that is started and finalized before its first sync coalesces into this one insert,
    carrying its terminal state. The insert passes the active-assignment INSERT check because
    the EA was assigned when they ran it. If the assignment was revoked before the first sync,
    rejection is correct: the server never accepted that run.
  - **`update`** (any lifecycle transition after the insert was acknowledged) uses
    **UPDATE-by-id of the lifecycle columns only** (`status`, `completed_at`, `updated_at`),
    and must acknowledge exactly one row. This mirrors the existing `archive` path
    (`offlineSync.js` ~675–697), which uses UPDATE to stay authorized after assignment
    changes. It passes the ownership-only UPDATE policy even after the child or programme
    assignment is revoked. An identical replay hits the trigger's no-op and still
    acknowledges one row.
  - **Unknown-outcome recovery.** "Not acknowledged locally" does not prove "the server never
    accepted it". The server may have committed the insert before a crash or a lost response.
    PostgreSQL applies INSERT `WITH CHECK` even when an upsert conflicts, so a revoked
    assignment would reject that retry. Before classifying a `battery_runs` **insert**'s
    `42501`/RLS rejection as terminal:
    1. read the run back by `id`; the owner can still SELECT it;
    2. if it exists **and** its immutable identity columns match the local row, re-send the
       lifecycle columns as an UPDATE-by-id that must acknowledge exactly one row, and treat
       success as acknowledgement of the insert;
    3. if it is absent, owned by someone else, or has mismatched identity, the rejection stands
       as terminal. Authorization is never relaxed for genuinely new runs.

    This also covers an insert refreshed after a stale compare-and-swap acknowledgement
    (`offlineSync.js` ~746–781). Tests (real SQLite plus PostgreSQL) cover four cases, asserting
    convergence with no quarantine in the first and denial in the last two:
    - server commit, then lost acknowledgement, then revocation, then abandon;
    - the same with a client crash in place of the lost acknowledgement;
    - a genuinely absent run;
    - another EA's run with the same id.
  - The repository chooses the operation from the run's local sync state. A transition while
    the insert is still pending coalesces into that insert. A transition racing an in-flight
    insert follows the engine's existing compare-and-swap rules. Test: insert in flight,
    transition enqueued, both land, final server state terminal.
- `assessments` and `assessment_items` use insert-or-ignore (7.1).
- **Dependency evidence, not just order.** `computeEvidencePending` decides whether
  `23503`/`42501` is temporary using only `PARENT_FK_COLUMNS` and `GRANT_SUBJECTS`
  (`offlineSync.js` ~224–274, ~404–469). Without entries, a valid write can be quarantined as
  terminal. Add:
  - `PARENT_FK_COLUMNS.battery_runs`: `child_id → children`, `class_id → classes`;
  - `PARENT_FK_COLUMNS.assessments`: `battery_run_id → battery_runs`, alongside the existing
    entries;
  - `GRANT_SUBJECTS.battery_runs`: the run's `child_id`, covered by pending
    `child_ea_assignments`, mirroring how `assessments` is covered today.
- **Cross-pass tests.** Each case must show the whole family draining automatically, without
  terminal quarantine and without a manual Sync Now:
  - the child's assignment upload fails, then succeeds;
  - the run is backed off while its Questions are attempted.
- `programmes.default_battery_*` is added to the reference-data pull allowlist.
- **No pull or reconcile for `battery_runs` in Release 1.** Runs are push-only, like
  assessments today. The contract map records this explicitly.

### 7.5 Existing assessment readers (choke point)

Twelve modules read `assessments` and assume EGRA shapes:
- `AssessmentHistoryScreen` → `AssessmentDetailScreen` → `AssessmentDetailGrid`. This one
  **throws** on a WelaPLUS row: `items_tested` is an object, and the grid calls `letters.map`;
- `AssessmentsScreen`, `HomeScreen`, `ChildrenListScreen`, and `ChildResultsScreen`;
- the insight rankings;
- `dashboardStats`, `assessmentScoring`, and `masteryState`;
- `useAssessmentSession` and `AssessmentChildSelectScreen`.

Rather than patching each one:

- **`assessmentsRepository.getAssessments` (and any sibling reader) excludes
  `battery_run_id IS NOT NULL` rows by default.** WelaPLUS code opts in with
  `includeBatteryRuns: true`. Existing EGRA readers stay correct without edits, and future
  readers are safe by default.
- **History:** `AssessmentHistoryScreen` additionally lists the EA's **WelaPLUS runs** from
  `batteryRunsRepository`, one row per run with its status. Tapping one opens the run summary
  (section 5.4), read-only. WelaPLUS Question rows never reach `AssessmentDetailScreen`.
- **Regression test:** with mixed EGRA and WelaPLUS data (completed and skipped Questions),
  every one of the twelve readers renders and computes. View History opens each EGRA result and
  each WelaPLUS run. EGRA stats and rankings are numerically unchanged by the WelaPLUS rows.

### 7.6 Windows (D8)

Release 1 does not tag windows on the device.
- Runs and their Questions are written as `assessment_purpose = 'progress_check'` with
  `assessment_window_id = null`.
- Reporting attributes a run to a window at query time from `battery_runs.started_at` and the
  child's academic year. Server-side windows can be corrected after the fact, which device-time
  tagging could not.

Device-side tagging is blocked by the local window data: a trigger generates a baseline spanning
the whole active academic year, and windows may overlap (`src/db/migrations.js`
`ensure_active_year_baseline_window_*`; uniqueness is only on `(academic_year_id,
window_type)`). Revisit when windows are authoritative and non-overlapping. That is a config
and repository change, because the columns already exist.

## 8. Error handling

- **Save failure on `onComplete`.** The transaction rolls back, and the EA sees "Couldn't save
  — try again" with the result kept in memory. Retrying re-runs the same save. Item IDs are
  deterministic, so a retry after a partial failure cannot duplicate rows.
- **Duplicate-Question guard.** The partial unique index plus a repository pre-check stop a
  second result for the same `(run, question)`. The overview never offers a decided Question.
- **Sync rejection** (RLS, or a non-identical terminal-run edit, `23514`) surfaces through the
  existing needs-attention path. No new UI. Lost-acknowledgement replays are no-ops by design
  (7.3) and never reach needs-attention.
- **Missing child or programme** at resume (for example, the assignment was ended). The run
  opens read-only with "This child is no longer assigned to you — you can abandon this run."

## 9. Printout pack (Release 1)

Three items. Each is produced in **English and isiXhosa** and carries a footer
**`WelaPLUS 2024.1 · <EN|XH> · <item + side>`** that matches the app's content version.

### 9.1 Child Reading Card

Reusable. Laminate it. One set per EA per language they assess in.

| Side | Content | Layout rule |
|---|---|---|
| A | Q1 letter grid | 5 rows × 12, exactly as on the 2024 handout |
| B | Q6 words (40), then the Q7 sentences (4, numbered) | Words in 6 rows of up to 7, as in the booklet |
| C | Q8 passage | Paragraphs exactly as on the 2024 handout |

Side A and Side C are today's handout. **Side B is new**: the Q6/Q7 content used to sit on the
EA's booklet pages. Two A4 cards, double-sided (A/B and C/blank), or one A3 folded. The
designer chooses.

**The rows on the card are a contract with the app.** The tablet marking grid uses the same
rows, so any re-layout of the card requires a new content version.

### 9.2 Q11 Picture Cards

Reusable. One set per EA. These are the existing 2024 picture cards, unchanged, plus the footer.

### 9.3 Child Writing Sheet

Consumable. **One per child per run.** It replaces the 2024 booklet as the child's paper.

- **Header:** child's name, school, grade, date, EA name, and a boxed **Run code** field
  (`___-___`), copied from the app (sections 5.1 and 5.4). The run code is what lets Head
  Office match this sheet to the exact run, including Q11 calibration, when the same child
  has more than one run on a day.
- **Q5:** the 26-picture grid, as in the 2024 booklet, with an empty writing box in each cell.
- **Q9:** the 4 pictures, **printed with the numbers 1–4**, in the authoritative order from
  section 4.2 (EN: 1 jam, 2 hut, 3 fin, 4 net; XH: 1 lala, 2 sela, 3 imali, 4 idolo). Each has
  a writing box.
- **Q10:** two numbered writing lines.
- **Q11:** ruled story lines, plus a small **"Head Office use only"** rubric strip (Meaning
  Making / Spelling / Length / Vocab / Total /16) for HQ calibration scoring on paper.
- **Removed from the 2024 booklet:**
  - all EA marking aids, meaning every "Total: __ / N" box except HQ's Q11 strip;
  - the Q1–Q4 and Q6–Q8 pages;
  - all EA instructions, which are now on the tablet.

### 9.4 Retired

- The 2024 EA marking booklet (the answer sheet pages).
- The 2024 instruction sheet. Its scripts, stories, prompts, and dictation words are now on the
  tablet.

### 9.5 Quantities per EA

- 1 Reading Card set per language assessed.
- 1 Picture Card set.
- Writing Sheets = children to assess × expected runs, plus 10 % spare.

### 9.6 Production

Masi's designer adapts the existing 2024 InDesign files (booklet, handout, and instructions,
EN/XH) to section 9. Engineering does not generate the PDFs. This section is the brief.

## 10. Testing and verification

- **Unit:** the evaluator, exhaustively, including gate behaviour on a test battery; every
  changed Question component (contract test, plus Q9 per-letter and Q10 per-word results);
  item-set integrity (max scores derived, EN/XH parity of structure, `question_version` is
  `2024.1`, no stubs left).
- **Real-SQLite integration:**
  - `startRun`, `saveQuestionResult`, and `saveSkippedQuestion` are atomic, rolling back on an
    injected failure;
  - outbox order;
  - the duplicate-Question guard;
  - finalize and abandon transitions;
  - **offline finalize**: a run started, completed, and finalized with no network, then
    synced, lands every Question even though the run row arrives as `completed` first;
  - **partial offline abandon**, the same shape;
  - **lost acknowledgement**: replaying an already-landed completed run and its Questions
    and items is a no-op, with no needs-attention entry;
  - runs and Questions are written as `progress_check` with no window (D8);
  - duplicate-id refusal (7.1);
  - v10 migration from v9 with existing data.
- **Component and host:** one terminal callback per presentation (cancel → no write; skip →
  exactly one skipped row); and the last-attempted marker on Q1/Q6/Q8 (and Q7's Finish rule) for an all-wrong first
  row, correct-then-wrong, early stop, and timer expiry. Each case checks both the emitted
  `derived` values and the persisted row.
- **PostgreSQL RLS harness:** the cases in 7.3.
- **Contract map:** `battery_runs` and the new `assessments` columns added, with test references.
- **Device check (Android tablet, sqlite-staging build):** a full EN run and a full XH run
  with real cards; a force-quit mid-Question; resume; skip; finalize; offline then online sync.
  Verify rows in staging with the `sqlite-staging-sql` skill.
- **Gates:** `npm test`, `npm run test:integration`, `npm run test:types`, and the PostgreSQL
  harness, all green in CI.

## 11. Delivery slices

The slices are delivered as **three implementation plans**, re-sequenced on 2026-10-14 after
planning found the sync layer mid-redesign:

- **Plan 1 — Question package** (slice 4): the battery definition and evaluator, the 2024.1
  content (EN/XH), and the component changes in 5.3. Everything stays inside
  `src/assessment-questions/` with no sync dependency, so it starts now from `main`.
  Plan: `docs/superpowers/plans/2026-10-14-welaplus-plan-1-question-package.md`.
- **Plan 2 — Data foundation** (slices 1–3): ADR-0007 enforcement, the schema, RLS and the run
  lifecycle trigger, the SQLite mirror, repositories, sync, and the reader choke point. It is
  written against the code it will run on: after `feat/upload-path-correctness` (which adds
  UPDATE-by-id and claims SQLite v10, so WelaPLUS takes **v11**) and the actor-lifecycle plans
  that follow it (one database per EA, handle-scoped transactions, actor-stamped outbox owner).
  Writing it earlier would plan against interfaces that are being replaced.
- **Plan 3 — Host Run flow and docs** (slices 5–6): the entry card, child select mode,
  overview, Question host, skip, finalize, abandon, summary, and history, followed by the
  device check, the docs updates, and the printout pack published for the field team.

Per `AGENTS.md`, Codex implements each task. Claude specifies, reviews the diff and tests, and
verifies.

## 12. Risks

- **Card ↔ app drift.** Mitigated by the version footer, the intro-screen materials line, and the
  "rows are a contract" rule (9.1).
- **Q11 interim scale.** Jim chose a 1–4 scale without anchors for Release 1 (2026-10-19), so
  scores between EAs will be less consistent until the rubric is redesigned.
- **Paper handling in Release 1.** Sheets can still be lost, as today. Release 2 photos close
  this gap.
- **Device-local unfinished runs.** If a device is lost or the app reinstalled, unfinished runs
  are lost; their completed Questions are already synced. This is accepted for Release 1, and
  history hydration comes later.
