# WelaPLUS Release 1 — Design

**Date:** 2026-10-14
**Status:** Design approved in conversation (Jim, 2026-10-14); written spec pending review.
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

## 3. Scope

**In Release 1:**

- Slice 0: the ADR-0004 `assessmentItemDomainId` identity change (section 7.1).
- An additive Supabase migration and SQLite schema v10 for `battery_runs`, the `assessments`
  Run-era columns, and the `programmes` battery columns (section 7).
- Battery definition `wela_plus_full@2024.1` and a pure battery-state evaluator (section 6).
- Real 2024 content for all 11 Questions, in English and isiXhosa (section 4).
- Component changes driven by D1, D5, and the source content (section 5.3).
- Host Run flow: Assessments-tab entry, child select, Battery overview, Question host, skip,
  finalize, abandon, and summary (section 5).
- The printout pack specification (section 9).

**Not in Release 1:** photos and everything in D2, prerequisite auto-skip, pulling or hydrating
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
| 9 | `wela_plus_write_cvcs` | Booklet page: 4 pictures; the child writes each word | 12 | 18 (paper says 16, see 4.3) |
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
- EN picture → letter, provisional, read from the booklet image:
  - Row 1: apple a, fish f, key k, orange o, sun s, whale w.
  - Row 2: bed b, gate g, leaf l, pot p, table t, *(unclear figure)*.
  - Row 3: cat c, hat h, moon m, *(unclear figure)*, umbrella u, yo-yo y.
  - Row 4: dog d, insect i, net n, ring r, van v, zebra z.
  - Row 5: elephant e, jacket j.
  - The two unclear cells are q and x in some order.
- **The pedagogy team confirms the full mapping from the InDesign source.**
- XH uses isiXhosa picture names: the script names i-apile /a/, ufudo /f/, ikati /k/. The XH
  booklet may use different pictures, so its picture → letter mapping is a separate pedagogy
  confirmation.
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
- The paper does not time Q6. Release 1 keeps Q6 **untimed** to match the paper; only the stop
  rule applies. This overrides the component's timed default unless pedagogy supplies a
  duration.

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
- Paragraph breaks follow the handout. Paper has no timer. Keep the component's 60 s default
  **off** for Release 1 (untimed, per the paper) unless pedagogy supplies a duration. Without a
  timer, correct-words-per-minute is not reported.

**Q9 CVC writing, scored per letter.**
- The EA says each picture name twice.
- EN: jam, hut, fin, net (4 × 3 = 12).
- XH: lala, sela, imali, idolo (4 + 4 + 5 + 5 = 18).

**Q10 dictation, scored per word (D5).** The EA reads each sentence twice and must not repeat it
while the child writes.
- EN: "Mom got a cat from a pet shop." / "It drinks milk and sleeps with us."
- XH: "Ikati yam isela ubisi" / "Ithanda inyama kwaye ihlala elangeni."

**Q11 story writing.**
- The EA script is verbatim from the booklet ("Show the child the Picture cards and ask: What
  can you see in these pictures? …").
- Rubric dimensions: Meaning Making, Spelling, Length, Vocabulary, each scored 0–4, total /16.

### 4.3 Open content items (pedagogy; none blocks building)

1. **Q5 picture → letter mapping**: confirm all 26 for EN, including the two unclear cells, and
   the XH mapping.
2. **Q9 isiXhosa maximum**: per-letter scoring gives 18, but the paper says /16. Confirm
   whether a different rule applies (for example, syllables or specific letters).
3. **Q11 rubric anchors**: the paper has dimension names only. Pedagogy supplies the five anchor
   descriptions (0–4) per dimension in EN and XH. Until then, the app shows the dimension names
   with the chip numbers and a "Rubric descriptions coming soon" sheet. This **blocks field
   release** of Q11 scoring quality, not the build.
4. **Q6/Q8 timing**: confirm untimed (as on paper) or supply durations.
5. **isiXhosa spelling check** of all transcribed strings by a first-language reviewer.

Items 1–5 must be closed before the pilot build, and are tracked under #34.

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
- **Starting a run** writes the `battery_runs` row immediately (status `in_progress`, window
  tagged per 7.5), so a run survives a force-quit before Q1.
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
- On `onComplete` it calls `saveQuestionResult` (section 7.4) and returns to the overview.
- On `onAbandon` (the EA backs out) nothing is written, and the Question stays undecided.
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
| 6 | Rows mirror the card (6 rows of up to 7). Untimed per 4.2. |
| 7 | Unchanged structure (per-word pills grouped by sentence). Content only. |
| 8 | Paragraphs mirror the handout. Untimed per 4.2. **The component currently falls back to a 60 s timer when `durationSec` is omitted** (`DEFAULT_DURATION_SEC`). Change it so an omitted `durationSec` means untimed, as Q6 already does. Without a timer, `correct_words_per_minute` is omitted from `derived`, and `last_attempted_position` still records where the EA stopped. |
| 1, 6–8 | Remove the child-facing font-size dependency. Pills use a fixed EA marking size from design tokens; `useChildReadingFontSize` is removed or returns a constant. |
| 5 | Cells show **picture name + expected letter** (for example, "apple → a"). No image. |
| 9 | **Per-letter marking**: each word is a row of letter cells. Items are letters with `item_key` like `w1.l2`; `prompt` is the letter; metadata holds the word. |
| 10 | **Per-word marking** grouped by sentence (Q7's layout shell). Items are words. |
| 11 | No picture thumbnail (the EA holds the physical cards). Anchors come from the item set (4.3 #3). Totals and items stay as built (ADR-0004 `ea:` keys). |
| All | Raw hex colours replaced with Masi design tokens. This is the ROADMAP §8 conformance pass, scoped to the 11 Questions. |

### 5.4 Finalize and summary

- **Finalize** sets `completed_at`, `status = 'completed'`, and locks the run.
- The summary shows each Question's score / max (or its skip reason), plus a paper checklist:
  *"Write the child's name on the Writing Sheet. File it for Head Office with this week's
  sheets."*
- With no photos in Release 1, finalize has no photo step.

## 6. Battery definition and evaluator (OSS package)

**`batteries/wela_plus_full.ts`, version `2024.1`:**
- an ordered list of 11 `question_code`s;
- per Question: `instructions` copy (EN/XH), an optional `durationSec` (Q1 only, 60), a
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

### 7.1 Slice 0 — identity change (own PR, first)

- Land the held-back ADR-0004 `assessmentItemDomainId` change: include `itemKey` in the hash
  when `position` is present.
- Flip `__tests__/assessmentItemDomainId.contract.test.js` to the new literal UUIDs.
- Update `documentation/rls-sync-contract-map.md` and the build log.
- **Staging data plan:** `masi-app-sqlite` holds only test or pilot data, and its wipe was
  already decided on 2026-09-23. The wipe happens before or with this slice, so no rekey
  migration is written. A pre-wipe count of `assessment_items` is recorded in the build log.
  Confirm with Jim before running the wipe.
- Every existing local device row is rekeyed on its next re-save. With no field users on this
  backend, that is accepted.

### 7.2 Supabase migration (additive, one file)

- `battery_runs`, per PRD §2. The row includes `assessment_purpose` alongside
  `assessment_window_id`, so the existing window constraint shape applies at the run level as
  well as the Question level.
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

`battery_runs` mirrors `assessments`:
- SELECT: owner, plus the same child-read helper scope.
- INSERT: `user_id = (select auth.uid())`, active child assignment, and active programme
  assignment.
- UPDATE: owner, and only while `old.status = 'in_progress'`. The allowed transitions are to
  `completed` (setting `completed_at`) or `abandoned`. A trigger rejects edits to identity
  columns and any change after a terminal status.

`assessments` rows with a non-null `battery_run_id` must reference a run owned by the caller
with `status = 'in_progress'`. This is the PRD's three-check, enforced in the INSERT policy
`WITH CHECK`.

The cases are added to the disposable PostgreSQL RLS harness: own versus other EA's run,
revoked assignment, terminal-status edit, and a cross-run assessment insert.

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
  `PUSH_ORDER`/`TABLE_DEPENDENCIES` and the `SERVER_COLUMNS` allowlist.
- `programmes.default_battery_*` is added to the reference-data pull allowlist.
- **No pull or reconcile for `battery_runs` in Release 1.** Runs are push-only, like
  assessments today. The contract map records this explicitly.

### 7.5 Window tagging

At run start:
- if today falls inside an `assessment_windows` row for the child's class academic year, the run
  gets `assessment_window_id` = that window and `assessment_purpose = 'official_window'`;
- otherwise it gets `assessment_window_id = null` and `assessment_purpose = 'progress_check'`.

Question rows copy both values from the run. The evaluation is local, against already-pulled
reference data.

## 8. Error handling

- **Save failure on `onComplete`.** The transaction rolls back, and the EA sees "Couldn't save
  — try again" with the result kept in memory. Retrying re-runs the same save. Item IDs are
  deterministic, so a retry after a partial failure cannot duplicate rows.
- **Duplicate-Question guard.** The partial unique index plus a repository pre-check stop a
  second result for the same `(run, question)`. The overview never offers a decided Question.
- **Sync rejection** (RLS or a terminal-status edit) surfaces through the existing
  needs-attention path. No new UI.
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

- **Header:** child's name, school, grade, date, and EA name.
- **Q5:** the 26-picture grid, as in the 2024 booklet, with an empty writing box in each cell.
- **Q9:** the 4 pictures (EN: jam, fin, hut, net; XH per its booklet), each with a writing box.
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
  - window tagging;
  - v10 migration from v9 with existing data.
- **PostgreSQL RLS harness:** the cases in 7.3.
- **Contract map:** `battery_runs` and the new `assessments` columns added, with test references.
- **Device check (Android tablet, sqlite-staging build):** a full EN run and a full XH run
  with real cards; a force-quit mid-Question; resume; skip; finalize; offline then online sync.
  Verify rows in staging with the `sqlite-staging-sql` skill.
- **Gates:** `npm test`, `npm run test:integration`, `npm run test:types`, and the PostgreSQL
  harness, all green in CI.

## 11. Delivery slices (each a PR, in order)

1. **Slice 0:** the identity change and staging wipe (7.1).
2. **Schema:** the Supabase migration, RLS, the SQLite v10 mirror, the contract map, and the RLS
   harness cases.
3. **Repositories:** `batteryRunsRepository`, `saveQuestionResult`, and `saveSkippedQuestion`,
   with integration tests.
4. **Package:** the battery definition and evaluator, the 2024.1 content (EN/XH), and the
   component changes in 5.3.
5. **Host Run flow:** the entry card, child select mode, overview, Question host, skip,
   finalize, abandon, and summary, followed by the device check.
6. **Docs:** update the PRD (status, D1–D7 deltas), ROADMAP §8, `CONTEXT.md` if terms change,
   the build log, and the printout pack (section 9) published for the field team.

Per `AGENTS.md`, Codex implements each slice. Claude specifies, reviews the diff and tests, and
verifies.

## 12. Risks

- **Card ↔ app drift.** Mitigated by the version footer, the intro-screen materials line, and the
  "rows are a contract" rule (9.1).
- **Q11 without anchors.** Calibration data quality depends on 4.3 #3. Field release of Q11
  waits for the anchors. The other 10 Questions do not.
- **Paper handling in Release 1.** Sheets can still be lost, as today. Release 2 photos close
  this gap.
- **Device-local unfinished runs.** If a device is lost or the app reinstalled, unfinished runs
  are lost; their completed Questions are already synced. This is accepted for Release 1, and
  history hydration comes later.
