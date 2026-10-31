# Maths assessment: early number Questions and Core EGMA

**Date:** 2026-10-31
**Status:** Approved by Jim 2026-10-31 (English only for now; stop at 4 accepted for now; numeracy EAs see only numeracy screens)
**Branch:** `docs/egma-design` (from `main` at 4bc23d1)
**Research this rests on (local, not committed):** `.superpowers/numeracy/recon-egma.md` (the
toolkit spec per task, engine fit, verifier corrections), `recon-priorart.md` (TaRL, CAPS, LFIN),
`recon-tracker.md` (how letter mastery works), and `egma.txt` (RTI *EGMA Toolkit*, March 2014;
`L###` below means a line in that file).
**How the decisions were made:** Jim chose to skip the brainstorming questions and go straight to
the doc (2026-10-31). Every decision below that isn't quoted from Jim is **Claude's call**, and §11
lists them so Jim can check them while reading.
**Sibling workstream:** a parallel session designs the numeracy curriculum, tracker and
recommendations. This spec delivers tagged results for that work to use. It does not build the
tracker.

## 1. Why

Masi and a partner maths organisation are building a numeracy intervention: Teaching at the Right
Level, small groups, run like Masi Literacy and Zazi iZandi. It needs an assessment that does three
jobs:

1. **Grouping.** Rank children so Head Office can form level groups at the start of the year and
   regroup later (CONTEXT.md "Office grouping", `:91`).
2. **Evaluation.** Baseline and endline scores that can be compared with published Core EGMA data,
   which donors and partners recognise.
3. **Mastery evidence.** Jim's rule (2026-10-31): mastery works like letters. Assessment evidence is
   combined with ticks an EA makes on a tracker. Every assessment item must therefore say which
   skill and number range it is evidence for.

Core EGMA alone can't do jobs 1 and 3 for this programme. It targets Grades 1–3 and reaches 999.
Fewer than 1 in 10 of its items sit in the 1–5 and 6–10 ranges where the partner's Grade 1
curriculum starts. The toolkit itself reports floor effects in Grade 1–2 samples (L1580–1582). A
child in Week 1 ("Numbers 1 to 5": finger flash, counting out, more/fewer) would score 0–3 on
nearly every task. That gives no ranking, no growth signal, and no evidence for the tracker
skills (rote counting, one-to-one counting, more/less, adding with objects, bonds to 10). Most of
those skills Core EGMA doesn't measure at all.

The second reason is the child's experience. Jim's rule from the reading spec
(`2026-10-26-egra-content-and-skip-rules-design.md` §1): **children should not be made to feel
stupid**, so a test stops once a child shows they can't do it, and the EA is told why.

**The design:** one Maths Battery that interleaves short **early number Questions** with the eight
**Core EGMA Questions**. Every child does the early number Questions. Each Core EGMA Question runs
only if the child did well enough on the early number Question beneath it. Every item carries a
`{skill, band}` tag.

## 2. Goals, non-goals, anti-goals

**Goals**

- A Maths Battery in the existing WelaPLUS assessment engine (`src/assessment-questions/`), offered
  to EAs in the `numeracy` programme as their programme Battery.
- Nine early number Questions matched to the partner's Weeks 1–4 activities and the paper tracker.
- The eight Core EGMA Questions administered and scored as the toolkit specifies, except for the
  deviations listed in §6.4.
- A new content pack `content/egma/` holding every item, with its own hash test. The EGRA pack is
  not touched.
- Every item tagged `{skill, band}`. Add and take-away items with counters also record *how* the
  child got the answer.
- A Number Card generated from the pack, so the printed card and the app can't drift apart.
- No Supabase schema migration. Two small data migrations set the numeracy programme's default
  Battery: the draft one, then the frozen one at the freeze.

**Non-goals (later, or owned by another workstream)**

- The numeracy tracker, the evidence rule that unions EGMA results with tracker ticks, and lesson
  recommendations. These belong to the curriculum workstream (§8 is the hand-off).
- Numeracy session forms (ROADMAP `:895-898`).
- Score bands and colours for maths Questions. The toolkit gives no benchmarks (L1383–1385), so
  maths results show "No benchmark" until Masi has field data (ADR-0003).
- Alternate forms for repeat testing. Baseline and endline use the same form at first (§10).
- Assessment windows. Results save as ordinary progress checks (`assessment_purpose =
  'progress_check'`), and evaluation reports select them by date.
- Zazi iZandi, the Masi and ZZ websites, and dashboards. The pack is masi-app-only for now (§5.5).
- Interactive practice items, per-item timers, and recording which language the child answered in.
- isiXhosa, Afrikaans and isiZulu text (§5.3). English only for now.
- Maths stats on the Assessments tab, and maths results on Child Results.

**Anti-goals (it fails even if it works)**

- A child sits through Core EGMA tasks far above their level, getting everything wrong. (The
  gating in §4.3 exists to prevent this.)
- An EA has to do mental arithmetic under a 60-second timer to mark a child. (The answer key in
  §6.2 exists to prevent this.)
- The EGRA pack, or any shipped literacy Battery or result, changes.
- The printed Number Card shows different numbers from the app.
- A tag says an item is evidence for something it doesn't test (for example, a word problem counted
  as evidence for "add with objects").
- Maths results quietly show up in letter stats or literacy reports, or literacy results show up in
  maths ones.

## 3. Who uses it, and how

**EA (numeracy programme).** The EA opens Assessments, sees the **Maths assessment** card (the
programme Battery), picks a child, and works through the Questions. They need a few counters, a
pencil and paper, and the Number Card. Early number Questions are oral or use counters and the
EA's own fingers. A Question the child isn't ready for is skipped automatically, with a plain
reason (§7.3). Unfinished assessments resume, as they do today, so a long assessment can be split
across two sittings.

**Head Office.** Uses the synced results for grouping (rank by early number totals and Core EGMA
scores) and for evaluation (Core EGMA baseline vs endline).

**The curriculum workstream.** Reads `assessment_items.metadata.{skill, band}` for maths Questions
as mastery evidence (§8).

## 4. The Maths Battery

### 4.1 Identity

| Field | Value |
|---|---|
| `battery_code` | `masi_maths` |
| `battery_version` | `2026.1-draft` until the freeze, then `2026.1` (§5.2) |
| Title (user-facing) | **Maths assessment**. The card's subtitle is the existing "All 17 Questions · English · about 20 min" line (no separate about line; changed in the build, 2026-10-31). The UI never says "run" (house rule). |
| `languages` / `fixedLanguage` | `['en']` / `'en'`, English only for now (Jim, 2026-10-31; §5.3) |
| Materials | Number Card, 20 counters, pencil and paper |
| Pack form | `masi-egma-en-2026-1-draft` until the freeze, then `masi-egma-en-2026-1` (§5.2), in `content/egma/` |

### 4.2 Question order

The early number Questions come first within each skill, so the gates (§4.3) can see their scores
before the Core task they guard. Core EGMA keeps the toolkit's relative order (Number ID,
Discrimination, Missing Number, Addition L1, Addition L2, Subtraction L1, Subtraction L2, Word
Problems).

| # | `question_code` | Title (user-facing) | Kind | Items | Timed | Stop rule |
|---|---|---|---|---|---|---|
| 1 | `maths_count_aloud` | Count aloud | early number | 5 checkpoints | no | first mistake |
| 2 | `maths_quick_see` | Finger flash | early number | 6 | no | 3 in a row wrong |
| 3 | `maths_count_out` | Count out counters | early number | 9 | no | 3 in a row wrong |
| 4 | `maths_read_numbers` | Read numbers to 20 | early number | 9 | no | 3 in a row wrong |
| 5 | `egma_number_id` | Read big numbers | Core EGMA | 20 | 60 s | 4 in a row wrong (§6.4) |
| 6 | `maths_which_more` | Which is more? | early number | 9 pairs | no | 3 in a row wrong |
| 7 | `egma_number_discrimination` | Bigger number | Core EGMA | 10 pairs | no | 4 in a row wrong |
| 8 | `maths_neighbours` | Before and after | early number | 9 | no | 3 in a row wrong |
| 9 | `egma_missing_number` | Missing number | Core EGMA | 10 | no | 4 in a row wrong |
| 10 | `maths_add_counters` | Add with counters | early number | 6 | no | 3 in a row wrong |
| 11 | `maths_take_away_counters` | Take away with counters | early number | 6 | no | 3 in a row wrong |
| 12 | `maths_make_five_ten` | Make 5 and make 10 | early number | 6 | no | 3 in a row wrong |
| 13 | `egma_addition_l1` | Addition 1 | Core EGMA | 20 | 60 s | 4 in a row wrong (§6.4) |
| 14 | `egma_addition_l2` | Addition 2 | Core EGMA | 5 | no | 4 in a row wrong |
| 15 | `egma_subtraction_l1` | Subtraction 1 | Core EGMA | 20 | 60 s | 4 in a row wrong (§6.4) |
| 16 | `egma_subtraction_l2` | Subtraction 2 | Core EGMA | 5 | no | 4 in a row wrong |
| 17 | `egma_word_problems` | Word problems | Core EGMA | 6 | no | 4 in a row wrong |

The two code prefixes are deliberate. `egma_` marks the toolkit's tasks, which reports compare with
published EGMA data. `maths_` marks Masi's early number tasks.

### 4.3 Gates (prerequisites)

Each gate is a `PrerequisiteRule {depends_on, minScore}` on the dependency's `score`, which is
`total_correct` (`assessmentsRepository.js:154`). The engine allows one prerequisite per Question
(`types/BatteryConfig.ts:24`, `battery/skipRules.ts:36-41`), and that's all this needs.

**Gates must chain.** Today `evaluateBatteryState` only sees *saved* results. So when Addition 1
is gated out, Addition 2 is still offered until the overview reloads after saving the skip (found
in planning, 2026-10-31). The fix: inside one evaluation, a dependency that is itself auto-skipped
counts as unmet. That way Addition 2 (and Subtraction 2) skip in the same pass.

| Question | Runs only if | Why |
|---|---|---|
| `egma_number_id` | `maths_read_numbers` ≥ 7 of 9 | Mostly secure to 20; Core items 4–20 are 10–989 |
| `egma_number_discrimination` | `maths_which_more` ≥ 7 of 9 | Mostly secure comparing to 20 |
| `egma_missing_number` | `maths_neighbours` ≥ 7 of 9 | Mostly secure on neighbours to 20 |
| `egma_addition_l1` | `maths_add_counters` ≥ 4 of 6 | Mostly secure adding to 10 with counters |
| `egma_addition_l2` | `egma_addition_l1` ≥ 1 | Toolkit rule (L896–898) |
| `egma_subtraction_l1` | `maths_take_away_counters` ≥ 4 of 6 | As for addition |
| `egma_subtraction_l2` | `egma_subtraction_l1` ≥ 1 | Toolkit rule |
| `egma_word_problems` | `maths_add_counters` ≥ 4 of 6 | Word problems use quantities 2–12 |

**These are totals, not per-band guarantees.** A gate reads only the dependency's total
(`skipRules.ts:36-40`). For example, 2 of 3 in each addition band also scores 4 of 6 and passes.
That's intended: the gate's job is to spare a child who clearly can't do the Core task, not to
certify mastery. Band-level judgements belong to the evidence rule (§8.3). Don't extend the
prerequisite engine for this, and never change `score` to fake a band check.

The thresholds are a starting point. Changing one later means a new Battery version
(`masi_maths@2026.2`) registered with supersession, never an edit to `2026.1`.

**What gating costs evaluation.** RTI administers every task to every child. Here, a gated-out
Core task saves as `skipped_prerequisite_unmet`. Evaluation reports **must treat a gated-out Core
task as 0 and say so in the report**. A gated-out child would rarely have scored above 0–3, so the
bias is small, but it's real. The report must also never average only the children who were
allowed to take the task.

### 4.4 Time

The toolkit puts Core EGMA at about 20 minutes (L649–651). The early number Questions are short
(65 items, mostly 2–5 seconds each, with stop rules). The pilot measures actual times from
`duration_ms`. The targets are **about 10 minutes for a child who stays in the early number tasks,
and at most 30 for a child who reaches everything**. If the pilot shows more, the EA splits the
assessment across two sittings using the existing resume. Making the Battery shorter is a new
version.

## 5. Content pack `content/egma/`

### 5.1 Why a separate pack

The EGRA pack's schema is literacy-specific (`letters / words / passage / comprehension`,
`content/egra/index.d.ts:29-53`). Its `verify.cjs` pins a SHA-256 and exact counts, and the pack is
byte-identical in four repos. Editing it would break `npm run test:content` everywhere and break
the rule that a corrected form gets a new id (`content/egra/README.md:42, 70`).

### 5.2 Shape

Mirror `content/egra/`: `egma-assessments.json`, `index.js` (static `require`, deep-freeze,
`listEgmaAssessments`, `getEgmaAssessment`, no fallback across ids or languages), `index.d.ts`,
`verify.cjs`, and `README.md`.

The catalog has `formatVersion`, `contentVersion`, `title`, `sources` (the RTI toolkit, with the
PDF's SHA-256), and `assessments: EgmaForm[]`. **One form per language**, as in the EGRA pack (plan
decision, 2026-10-31). The first form is `masi-egma-en-2026-1-draft`, which becomes
`masi-egma-en-2026-1` at the freeze. A form has `id`, `languageCode`, and:

- **`questions`**: one entry per `question_code` in §4.2. Each holds:
  - `instructions` (the verbatim "Say:" lines);
  - `items`: one-based `id`, content fields for its item kind, `answer`, `skill`, `band`,
    `source`, and an English `label` where the item needs words (for example "after 3");
  - `practiceItems`, `timeLimitSeconds`, and `numberCardPage` where one applies.
- **`sourceNotes`**: provenance and discrepancies (§5.4).

Numerals repeat in each language's form, just as EGRA forms repeat letters.

Item kinds: `number` (a numeral), `pair` (two numerals; the answer is the larger), `sequence` (four
slots, one empty), `equation` (`a`, `op`, `b`), `checkpoint` (count aloud), `fingers` (finger flash
and make 5/10), `counters` (count out, add and take away with counters), `neighbour` (`before` or
`after`, `n`), and `word_problem` (per-language phrase segments).

**Tags.** Every item has `skill` (§8.1) and `band` ∈ `{5, 10, 20, 50, 100, 1000}`, meaning "to N".
The band is **the smallest band at or above the largest number in the item**, counting operands,
shown numbers, the answer, and for Make 5 and 10 the total. `verify.cjs` recomputes every band and fails on a mismatch. A
`checkpoint` item's band is its checkpoint number.

**`source`** per item is `rti-2014-printed` (copied from the toolkit's printed item boxes) or
`masi-2026` (authored to the toolkit's spec, or Masi's early number content).

`verify.cjs` pins the SHA-256, `contentVersion`, and the form count and per-Question item counts.
It checks that ids run 1..n, every band, that each `answer` is correct (arithmetic, larger of the
pair, missing term), that every language in the Battery has complete `text`, and that Addition L1
follows its spec (no addend over 10, no sum over 19, L850–852). It also checks that Subtraction L1
is the inverse: item *i* is Addition L1 item *i*'s sum minus **one of its two addends**. The printed
samples use both (`1+3` → `4−1`, `3+2` → `5−2`), and the authored items subtract the second.
Add it to `package.json:43`:
`"test:content": "node --test content/egra/verify.cjs content/egma/verify.cjs"`.

**Draft id, then freeze.** Until the release gates in §10 pass, the form's id is
`masi-egma-en-2026-1-draft`, and it may change in place. The item sets' `question_version` carries
that id, so every result saved during development and the device check is marked as draft data and
never shares an id with frozen content. **The freeze is a deliberate commit, not a side effect of a
build.** It renames the id to `masi-egma-en-2026-1` and pins the hash, and its build-log entry records
the partner approval and the English copy check. After the freeze, any change means a new form id.
**The Battery is versioned the same way.** Before the freeze it is `masi_maths@2026.1-draft`, and
its Questions use the draft form. The freeze commit does three things:

- It adds `masi_maths@2026.1`, using the frozen form.
- It keeps `2026.1-draft` registered, with the draft form preserved under its own id.
- It adds `masi_maths@2026.1-draft → @2026.1` to `SUPERSEDED_VERSIONS`.

That's the existing registry pattern (`battery/registry.ts:23-45`). An unfinished draft assessment
resumes against its own exact identity (`batteryFor`), so it never mixes draft and frozen Questions
or lets a draft score gate a frozen Question. New assessments start on `2026.1`. A second data
migration then moves the programme default to `2026.1` (§7.1), so a phone still on a draft-only
build shows "Update the app". Pilot builds submit themselves to the test tracks, so reaching the
tracks must never be what freezes the form.

### 5.3 Languages

**English only for now (Jim, 2026-10-31).** The Battery sets `languages: ['en']` and
`fixedLanguage: 'en'`. `fixedLanguage` skips the class-language check
(`AssessmentChildSelectScreen.js:199-201`), so children in isiXhosa and Afrikaans classes can still
be assessed, with English instructions. With `languages: ['en']` alone, those children would show
"Not available in isiXhosa yet" and couldn't start. The toolkit lets a child answer in any language
the assessor understands (L2070–2082), and the instructions say so. That matters here, because many
children will answer number words in isiXhosa, and the EA marks the meaning, not the language.

A later isiXhosa version is **a new `xh` form and a new Battery version**, with a first-language translator and
proofreader. `verify.cjs` requires complete `text` for every language the Battery lists.

### 5.4 Where the items come from

- **Copied from the toolkit's printed boxes** (`rti-2014-printed`): Number ID (20, L719–725),
  Number Discrimination (10 pairs, L761–769), Missing Number (10, L801–843), the 5 Addition L1 and
  5 Subtraction L1 samples (L862–875), and Addition L2 and Subtraction L2 (5 each, L879–891).
- **Authored by Masi to the toolkit's spec** (`masi-2026`): the other 15 Addition L1 items and 15
  Subtraction L1 items, and the six word problems.
- **Masi's own** (`masi-2026`): all nine early number Questions.
- **Practice items:** Missing Number `1 2 _ 4` is recovered from the toolkit prose (L2128–2129).
  Number Discrimination and Word Problems get one authored practice item each. They render as
  instruction text, as EGRA's do (`egra/adapter.ts:70-75`).
- **Word problems: six items, one per toolkit problem type** (L956–978). The toolkit contradicts
  itself (six at L936, five at L1311), and `sourceNotes` records this. Three items reuse numbers
  from Addition L1 items (L937–938). Wording is adapted to local context (minibus taxi, sweets,
  local names), as the toolkit expects (L1132–1135).

Appendix A has every item. Its early number items, authored Addition and Subtraction L1 items and
word problems are **drafts for the partner to approve** before the freeze (§10).

### 5.5 Distribution

masi-app only. If Zazi or a website later consumes maths results, the pack is copied byte-identical
from then on, the same discipline as `content/egra/`.

## 6. Engine changes (`src/assessment-questions/`)

The package's stated purpose widens from literacy to early-grade literacy and numeracy. Update
`docs/agent-context/wela-assessment-component-build.md:24` to match. The boundary test already
allows `content/` imports (`boundary/findForbiddenImports.ts:8-21`).

### 6.1 What already works

`SequentialCapture` handles Correct/Incorrect per item, Back and flip (self-correction: the last
answer counts, L2010–2016), End, Skip with reason, the 60-second deadline from the Start tap, the
early-finish freeze, `consecutive_wrong{stop_at}` stop rules (including `stop_at: 1`, which
`validateResult.ts:170-188` accepts), `finalizeResult`, `cards` bodies with a `promptCard` gloss,
and `grid` bodies. Batteries, prerequisites, supersession and resume all work.

### 6.2 New

1. **Question components and an adapter.** `egma/adapter.ts` turns the pack form into item sets and
   the Battery, following `egra/adapter.ts`. It validates fail-fast and throws `TypeError` with the
   form id. Item sets use the `code@version.lang` id with `question_version` = the form id (`masi-egma-en-2026-1-draft`, then `masi-egma-en-2026-1` after the freeze).
   `bundledItemSetFor` chains to `egmaItemSetFor` (`battery/bundledItemSets.ts:76-77`). Every
   question code goes in the `questionComponents.ts` map, and `questionComponents.test.ts:10`
   already enforces that. **Left to the builder:** how many components. Prefer the fewest that keep
   each Question's copy and capture right; a grid Question, a cards Question and a counters
   Question probably cover all 17.
2. **The answer key on grid tiles.** A grid tile variant for equations that shows the answer on
   the same line, muted ("6 + 2  = 8"), so the EA marks by comparing, not calculating. It uses the
   word tile's geometry, because a second line doesn't fit ten tiles on a 360 dp phone (plan
   review, 2026-10-31). Today the gloss renders only on `promptCard` (`ui/MarkTile.tsx:74`), and grid tile
   heights are fixed (`:19, 28-33`), so the variant renders the gloss inline at word height. Number ID
   and Read numbers tiles show only the numeral, because the answer *is* the numeral.
   - Layouts: Read numbers 9 per page (3 × 3); Number ID 20 per page (5 × 4, as in the toolkit);
     Addition and Subtraction L1 10 per page (2 columns × 5, like words), so 20 equations are two pages and the page follows the child.
     The printed Number Card still shows all 20 on one page. Ten rows of answer-key tiles don't fit a
     360 dp phone (plan review, 2026-10-31).
3. **"How they got it" decisions.** For `maths_add_counters` and `maths_take_away_counters`, the
   decision bar replaces the single Correct button with three marked buttons: **Counted from 1 ·
   Started from the first number · Just knew**, plus **Incorrect**. Take-away uses **Counted what
   was left · Counted back · Just knew**. Plain words only (Jim, 2026-10-31: "even language like
   'counting on' is going to confuse my staff"). One tap per item, with no extra step. The item saves
   `is_correct: true` and a `metadata.strategy`. The stored values, by button:

   | Add with counters | Take away with counters | `strategy` |
   |---|---|---|
   | Counted from 1 | Counted what was left | `count_all` |
   | Started from the first number | Counted back | `count_on` (counts on *or* back) |
   | Just knew | Just knew | `known` |

   **Corrections.** In these two Questions, tapping an already-marked tile doesn't flip it. It
   re-opens the same four-button bar for that tile, so Wrong → Right always picks a strategy, and
   the EA can also change one strategy to another. Strategy state is kept per position. Choosing
   Wrong, Back/Undo and an unreached item all clear it. Other Questions keep today's binary flip
   (`SequentialCapture.tsx:179`, `stepByStep.ts:35-45`).

   **Guard.** A maths validator, run with `validateResult` before saving, rejects a result where any
   reached correct counters item lacks a valid `strategy`, or any other item has one.

   This is the partner's Week 4 teaching move (count all, then count on) and the main mastery
   distinction in prior art (`recon-priorart.md` §5.4).
4. **End-of-task strategy observation.** For the five Core arithmetic Questions (Addition and
   Subtraction L1 and L2, Word Problems): it asks "How did {child} work these out? Tick all you
   saw", with multi-select chips **In their head · Fingers · Counters · Paper · Couldn't tell**.
   **Couldn't tell** clears the other chips and is cleared by them. The details:
   - **When.** It is a new observation phase that intercepts every finish path: review Finish
     (`completed`), timer expiry (`timer`), StopCard Save (`stop_rule`) and End confirmation
     (`ea_ended`, `SequentialCapture.tsx:251-255`). The result, including `stopped_reason` and
     `duration_ms`, is frozen before the phase opens; the timer has already stopped. `onComplete`
     fires exactly once, after the EA confirms. Today `finish()` emits at once (`:81-115`), so this
     is the main engine change.
   - **When it's skipped.** If `total_correct = 0`, including a zero-attempt timer expiry, there is
     nothing to observe. The phase doesn't open, and `derived.strategies = []`. Skipped and gated-out
     Questions never ask, and keep the existing skipped-result shape.
   - **Otherwise** at least one chip is required. The result saves `derived.strategies` as a subset
     of `head | fingers | counters | paper`, or `['not_seen']`.
   - **Why.** This meets the toolkit's "at least one check box" (L2693–2694), which doesn't say
     whether it's per item or per task. One step per task keeps the timed tasks fair.
   - It needs a new multi-select chip; today's `ScoreChip` is single-select (`ui/RubricRow.tsx:7-30`).
5. **Rate fields.** For the three timed Questions, `finalizeResult` adds
   `derived.correct_per_minute` and `derived.seconds_remaining`. The rule: when the child reached
   the last item before the timer (`stopped_reason = 'completed'`), the rate is `total_correct × 60
   ÷ seconds used` and `seconds_remaining = 60 − seconds used`. For `timer`, `stop_rule` or
   `ea_ended`, the rate is `total_correct` and `seconds_remaining = 0`. `score` stays
   `total_correct`, because the server takes only integers (`20261021120000…sql:204-208`). The
   clock starts on the Start tap, not when the child first speaks (L2612). That's the same as EGRA,
   and the pack `sourceNotes` record it.
6. **Tags travel with the result.** Each result item's `metadata` carries `skill` and `band` from
   the pack, plus `strategy` where there is one, alongside the existing `reached`. The host saves
   metadata verbatim, and the server stores and returns it unchanged (`assessmentsRepository.js:166-178`,
   `syncServerColumns.js:82-94`). No migration is needed.
7. **Copy.** Widen the `flatCopy` noun union (`progress/captureCopy.ts:5`) with `number`, `pair`,
   `problem` and `item`. StopCard copy for `stop_at: 1` reads "{child} made a mistake. The test has
   stopped.", not "got 1 in a row wrong" (`progress/StopCard.tsx:14`). Maths results never reach
   the literacy `AssessmentResultsScreen`, so its "Stopped" line is unchanged (corrected in the
   build, 2026-10-31).
8. **Materials.** Add `number_card` and `counters` to `MaterialItem` (`types/BatteryConfig.ts:1`),
   plus an optional `page: number` on `Materials`, because the Number Card has more than four
   sides. Add an optional `numberCard` title on `BatteryConfig` (like `readingCard`), for example
   "Number Card 2026.1". A Question names one item to hand over. "Pencil and paper" for Addition
   and Subtraction 2 and Word Problems goes in their instructions. The host gets labels
   (`src/utils/batteryRun.js:43-47`), and a "page 3" footer.
9. **Scripts.** Instructions stay one string per language (`ui/QuestionIntro.tsx:14`). Word
   problems render as a `promptCard` script: one line per phrase, with "(pause)" between phrases
   (the toolkit's `[pause and check]`, L2202–2216), and the answer as gloss. The EA reads the
   script aloud and may repeat it once (L2203–2204).

### 6.3 Marking rules that are copy, not code

These go in each Question's instructions, verbatim per language:

- Never say "correct" or "wrong" to the child (L1976–1980).
- Number ID: the child must say the number with its place value. "Nine-nine" for 99 is wrong; for
  three-digit numbers they must say "hundred" (L748–749, L2085–2092).
- Discrimination: the child must *say* the bigger number, not point (L757–759). "One five three" is
  accepted here (L2115–2121).
- Missing Number: saying only the missing number is enough (L2124–2138).
- Addition and Subtraction L1 and L2: "You don't have to read the sum aloud" (L2141–2152).
- Hesitation: after about 5 seconds with no answer, say "Go on", mark the item wrong and point to
  the next one (L1965–1967). For word problems, a child who is working with fingers, counters or
  paper may take up to a minute (L2225–2238). Timing is the EA's judgement; the app doesn't time
  items.
- Finger flash: hold your fingers up for about 2 seconds, then hide them.
- Add and take away with counters: put out the first group and cover it with your hand, then
  follow the script (Appendix A). Covering the first group is what lets the EA see counting on.

### 6.4 Deviations from the toolkit, on purpose

| Toolkit | Here | Why |
|---|---|---|
| Timed tasks have no stop rule (L711–713, L849) | 4 in a row wrong on Number ID and Addition and Subtraction L1 | Jim's rule that children aren't made to feel stupid. It is consistent with the untimed tasks, and the rate rule in §6.2 treats a stop as the timer ending, so it doesn't inflate the rate. |
| Every child takes every task | Core tasks are gated (§4.3) | Floor effects, and the same rule as above |
| Clock starts when the child first speaks | Clock starts on the Start tap | Engine behaviour, the same as EGRA |
| Strategy boxes (per item or per task, unclear) | Once per task, multi-select | Fair on timed tasks; the toolkit is ambiguous |

Reports that compare with published EGMA must footnote these.

**Stop at 4 on the timed tasks (Jim, 2026-10-31):** accepted for now. Jim is hesitant to depart
from the toolkit here and may change it later. To keep that cheap, the timed stop rule is **one
constant in the EGMA adapter**, not per item. The stop rule lives in the item set, so changing it
changes how results mean what they mean. The change therefore ships as a new `question_version` for
those three Questions, made by suffixing the form id the way EGRA's `-masi60` sets do
(`egra/adapter.ts:99`), plus a new Battery version. The pack items themselves don't change.

## 7. Host changes (app)

1. **Programme Battery.** Two data migrations, both following
   `20261026120000_welaplus_2026_1_default.sql`:
   - The first sets `programmes.default_battery_code/version = 'masi_maths' / '2026.1-draft'` for
     `numeracy`. This is the **only way to reach the Battery** (`batteryForNewRun` in
     `AssessmentsScreen.js:128-129`), so it runs on `masi-app-sqlite` as soon as a build carrying
     the Battery is on the test tracks. That's before the freeze, so the device check can use it.
   - The second, which ships with the freeze build, moves the default to `'2026.1'`.

   Draft results are marked by their draft `question_version` and Battery version (§5.2).
   **Precondition (both migrations):** a read-only query
   (the `sqlite-staging-sql` skill) confirms that no field EA holds an active `numeracy` staff
   programme assignment. Once November's field retest starts, staging holds field data, so if a
   numeracy field EA exists, stop and ask Jim. A phone without the Battery shows the existing
   "Update the app" note (`AssessmentsScreen.js:156-158`).
2. **Numeracy EAs see only numeracy screens (Jim, 2026-10-31).** Literacy EAs see exactly what they
   see today.

   **Mechanism (plan decision).** One helper, `programmeSubject(programme)`, returns `'maths'` for
   the `numeracy` programme code and `'reading'` for every other programme. It returns `null` when
   no programme row is known yet, and screens treat `null` as today's behaviour. It is keyed on the
   programme, not the Battery: a Battery can be unresolvable on an old or draft build, which would
   bring literacy screens back. The helper lives in one file. Screens never compare programme codes
   themselves.

   A numeracy EA must not see any of these literacy surfaces:
   - the Assessments stats bar;
   - the Full EGRA card;
   - the Letter Sounds and Word Reading quick assessments;
   - Home's "N children to assess";
   - the Children list's Unassessed stat;
   - the class row's letter-tracker icon;
   - the class row's tap through to Child Results (which stays literacy only);
   - Edit Child's reading-level field;
   - the Insights "Letter mastery" and "Assessment scores" rows;
   - Record → the literacy Lesson flow. A numeracy EA gets "Session forms for Numeracy are coming
     soon", whatever their job title.
3. **Skip reasons.** A gated-out maths Question shows the badge "Skipped" with the detail **"Not
   ready yet"**, never a raw code, nothing, or today's generic "Not reached". The copy comes from a
   new optional `unmet_label` on `PrerequisiteRule`, so the label is data, not a code check.
4. **Letter coverage everywhere.** Coverage is letter-only in three places: the Assessments tab
   stats bar (`dashboardStats.js:127-134`), Home's "N children to assess" (`HomeScreen.js:104-116` →
   `assessmentsRepository.getAssessmentCountsSince`, `:99-106` → `homeAttention.js:72-84`), and the
   Children list's Unassessed count (`ChildrenListScreen.js:41-44, 112-117`). A numeracy EA would be
   told their assessed children are unassessed. For a maths programme Battery, hide all three. Maths
   coverage is a later feature. Literacy coverage is unchanged, and tests cover both.
5. **Results.** Maths results appear in Assessment History and in the Battery overview and summary,
   titled from the Battery. These screens show raw `score / items` (`batteryRun.js:95-99`) with the
   existing completion badge (`BatteryOverviewScreen.js:34-45`, `BatteryRunSummaryScreen.js:132-137`),
   and they don't consult score bands. Maths uses that presentation unchanged, with one addition:
   timed Questions show the rate next to the raw count, for example "14 / 20 · 18 per minute". The
   completion badge marks completion for every Battery today, including literacy. Whether it should
   look neutral for a low score is a cross-Battery question, out of scope here. Child Results stays
   letter and word only (§2 non-goals). Maths has no score bands, so the ranking screens would show
   "No benchmark" if maths were ever added to them; this spec doesn't add it.
6. **Nothing else.** No new `stopped_reason`, no `assessment_type` allowlist, no new RPC. Letter
   readers select by `question_code` (`LETTER_EVIDENCE_CODES`), so maths results never reach letter
   mastery or stats.

## 8. Hand-off to the curriculum workstream

### 8.1 Skill keys

These keys are EGMA's own, and deliberately **finer-grained than any tracker cell**. The curriculum
workstream maps `(skill, band)` to its tracker cells and can merge keys, but it never needs to split
one. That lets this pack freeze before the curriculum grid is final.

| `skill` | Measured by | Bands used |
|---|---|---|
| `count_aloud` | `maths_count_aloud` | 5, 10, 20, 50, 100 |
| `quick_see` | `maths_quick_see` | 5, 10 |
| `count_out` | `maths_count_out` | 5, 10, 20 |
| `read_numbers` | `maths_read_numbers`, `egma_number_id` | 5–1000 |
| `compare_numbers` | `maths_which_more`, `egma_number_discrimination` | 5–1000 |
| `number_neighbours` | `maths_neighbours` | 5, 10, 20 |
| `number_patterns` | `egma_missing_number` | 10–1000 |
| `add_objects` | `maths_add_counters` | 5, 10 |
| `subtract_objects` | `maths_take_away_counters` | 5, 10 |
| `number_bonds` | `maths_make_five_ten` | 5, 10 |
| `add` | `egma_addition_l1`, `egma_addition_l2` | 5–100 |
| `subtract` | `egma_subtraction_l1`, `egma_subtraction_l2` | 5–100 |
| `word_problems` | `egma_word_problems` | 5, 10, 20 |

Missing Number items that count by 2s, 5s or 10s keep `number_patterns`. The tracker can choose to
read them as skip-counting evidence.

### 8.2 What a reader can rely on

- For `question_code` in the maths set, every `assessment_items` row has
  `metadata.skill: string` and `metadata.band: number`. `metadata.reached: false` marks items the
  child never got to; those are not evidence.
- `metadata.strategy` ∈ `count_all | count_on | known` is present on every reached correct
  `maths_add_counters` and `maths_take_away_counters` item, and on no other item. The maths
  validator enforces this (§6.2).
- `derived.strategies` is present on every non-skipped Core arithmetic result. It is `[]` when
  `total_correct = 0`, `['not_seen']` when the EA couldn't tell, and otherwise a non-empty subset
  of `head | fingers | counters | paper`.
- Tags are fixed per frozen form id, so a reader can trust them historically. Ignore results whose
  `question_version` ends in `-draft`; they are development data.

### 8.3 Recommendation for the evidence rule (theirs to decide)

Mirror letters (`computeLetterMastery`): for each `(skill, band)`, the newest result that reached
that cell decides, and the cell counts only if every reached item in it was correct. Early number
Questions give three items per band, which meets ASER's "≥ 4 of 5" spirit at this scale. For
`add_objects` and `subtract_objects`, count a cell only when the correct answers were `count_on` or
`known`, never `count_all` alone (prior art: Weitz & Venkat on counting-by-ones inflating Grade 1
scores). Like letter evidence, these results are read live and never written as tracker marks.

## 9. Number Card

One card for all languages: numerals, `+`, `−`, and blank boxes only. The pages are:

1. Read numbers to 20
2. Read big numbers
3. Which is more?
4. Bigger number
5. Missing number
6. Addition 1
7. Addition 2
8. Subtraction 1
9. Subtraction 2

The builder writes a script that generates a printable A4 HTML card from the pack, at
`design/number-card/` (large numerals, page numbers matching `numberCardPage`). A test checks that
every Question with a `numberCardPage` has a page. Masi prints and laminates it. The early number
Questions other than Read numbers and Which is more need no card.

## 10. Rollout and release gates

The order of work:

1. **Build and merge** with the draft form id (§5.2). Pilot builds reach the test tracks
   automatically, which is fine, because draft results are marked.
2. **Programme default migration** on staging, after the precondition check (§7.1).
3. **Device check** (gate 4 below).
4. **Gates 1–3.**
5. **Freeze commit** (§5.2), its build on the test tracks, then the second default migration
   (§7.1).
6. **Pilot** (gate 5).

The gates:

1. **The partner approves** the early number items, the authored Addition and Subtraction L1 items,
   the word problems, the gate thresholds, and the instruction scripts. (Jim owns this
   conversation.) If the partner holds an SA-adapted EGMA or the RTI templates (L1837–1838), Jim
   decides whether that becomes the Core form instead. That would mean new item content under a new
   form id, with the same engine.
2. **English copy check.** Instructions, labels and word problems read naturally for EAs whose
   first language is isiXhosa (plain, short sentences). isiXhosa text is a later version (§5.3).
3. **The curriculum workstream confirms** it can map §8.1's skill keys to its cells. This needs no
   change to the pack.
4. **A device check on the A03**, at default text size: every Question, the answer-key tiles, the
   "how they got it" bar, the strategy step, a gated-out Question's skip reason, a stop at
   `stop_at: 1`, and save and sync. It also needs one timed pass with real counters and the printed
   Number Card.
5. **A small pilot**, after the freeze (a handful of children per grade), to measure time per
   Question and check the gate thresholds aren't badly set. A threshold change is a new Battery
   version. An item change is a new form id.

Repeat testing uses the same form, so baseline-to-endline gains include some practice effect. An
alternate Core form is a later new form id.

## 11. Claude's calls (Jim to check)

Jim skipped the questions, so these were Claude's calls:

1. **All three purposes, one Battery**, with early number Questions gating Core EGMA, rather than
   Core EGMA alone or a re-levelled EGMA.
2. **Masi authors the missing items** to the toolkit's spec. The partner approves them.
3. **Six word problems**, one per type.
4. **Stop at 4 in a row on the timed tasks**, which departs from the toolkit.
5. **Gate thresholds** (§4.3).
6. **English only for now** (Jim confirmed 2026-10-31), with `fixedLanguage` so every class can be assessed.
7. **Strategy:** "how they got it" per item for the counters Questions, and one multi-select per
   task for Core arithmetic.
8. **Skill keys finer than the curriculum's**, with the mapping owned by the curriculum workstream.
9. **One Number Card generated from the pack.**
10. **Gated-out Core tasks count as 0 in evaluation**, with a footnote.
11. **Gates are totals**, not per-band checks (§4.3).
12. **Draft form id until a deliberate freeze commit.** The pilot runs after the freeze (§5.2, §10).
13. **Numeracy EAs don't see literacy surfaces**: Full EGRA, the quick assessments, and letter
    coverage on the Assessments tab, Home and Children (§7).
14. **"Couldn't tell"** on the strategy step, and no step when nothing was answered correctly.

## 12. Testing

- `verify.cjs` (§5.2) runs in `npm run test:content`, including the band rule, answer checks and the
  either-addend inverse rule. Test it against a deliberately wrong band and a wrong inverse.
- An adapter test checks the form becomes 17 item sets per language and a Battery that matches
  §4.2–4.3 exactly. A bad form throws.
- Contract tests per Question with `runContractTest`. Pass the stop-rule options explicitly when
  calling `validateResult`; `runContractTest` calls it without them today. They cover stop rules,
  the timed prefix, and the rate fields in every `stopped_reason` case: completed early, timer, a
  zero-attempt timer expiry, stop_rule, and End after a partial capture.
- **Counters Questions**, through save:
  - Right with each strategy.
  - Wrong → Right picks a strategy.
  - Right → Right changes the strategy.
  - Right → Wrong clears it.
  - Back/Undo clears it.
  - The maths validator rejects a reached correct item with no strategy, and a strategy on a wrong
    item.
- **Strategy step:**
  - It intercepts all four finish paths.
  - `onComplete` fires exactly once.
  - Duration is frozen before the step.
  - It can't confirm with nothing ticked.
  - Couldn't tell is exclusive.
  - It doesn't appear when `total_correct = 0`, or for skipped Questions.
- Answer-key tile rendering.
- Battery tests:
  - Each gate auto-skips at `minScore − 1` and runs at `minScore`.
  - L2 skips when L1 is 0.
  - The counterexample 2 + 2 across the addition bands passes (gates are totals, by design).
- A real-SQLite save and round-trip test (better-sqlite3): a maths result's item `metadata`
  (`skill`, `band`, `strategy`) and `derived` (`strategies`, `correct_per_minute`) survive save,
  outbox payload and history-pull re-store exactly.
- Host tests:
  - Numeracy EAs see the Maths card, and no Full EGRA card or quick assessments.
  - A numeracy roster with completed maths assessments and no letter results shows no letter
    coverage prompts on Assessments, Home or Children.
  - Literacy EAs are unchanged on all of these.
  - Timed maths rows show the rate, and two equal raw scores with different early-finish times
    show different rates.
- Freeze upgrade tests (with the freeze commit):
  - A partly completed draft assessment, and a zero-result one, both resume on
    `masi_maths@2026.1-draft` with draft Questions only.
  - Automatic skips never take a draft score as a frozen prerequisite.
  - A new assessment starts on `2026.1`.
  - A draft-only build that receives the `2026.1` default shows "Update the app".
- A Number Card test (§9).

## 13. Documents this changes (same branch as the code)

- `CONTEXT.md`: new terms **Maths Battery**, **early number Question**, **Core EGMA Question**,
  **Number Card**, **band**, **strategy observation**, plus an update to the one-Battery-per-Programme
  entry (`:396`) and the Full EGRA entry (`:250`, now literacy only).
- `documentation/rls-sync-contract-map.md`: the maths `metadata` and `derived` keys under the
  assessments rows (`:266-280`).
- `docs/adr/0012-…`: "The maths assessment gates Core EGMA behind Masi's early number Questions".
  It records the comparability trade-off and the deviations in §6.4.
- `docs/agent-context/wela-assessment-component-build.md`: the package now covers numeracy.
- `documentation/ROADMAP.md`, `documentation/build-log.md`, and `content/egma/README.md`.

---

## Appendix A: Items (drafts are marked)

Bands are shown as "to N". All early number content, authored L1 items and word problems are
**drafts for partner approval**.

### A.1 Early number Questions (draft)

**1. Count aloud** (`count_aloud`). Say: "Count for me. Start at one." The EA marks each checkpoint
the child passes without a mistake and stops at the first mistake.
Checkpoints: to 5 · to 10 · to 20 · to 50 · to 100.

**2. Finger flash** (`quick_see`). Say: "How many fingers?" Show them for about 2 seconds.
To 5: 3, 5, 2 · To 10: 7, 6, 9.

**3. Count out counters** (`count_out`). Say: "Give me N counters." The item is correct only if the
child stops at N.
To 5: 4, 2, 5 · To 10: 7, 9, 6 · To 20: 12, 15, 18.

**4. Read numbers to 20** (`read_numbers`, Number Card p.1, grid 3 × 3).
To 5: 3, 5, 0 · To 10: 7, 9, 6 · To 20: 13, 17, 20.

**5. Which is more?** (`compare_numbers`, Number Card p.2). The child says the bigger number.
To 5: 2 | 4, 5 | 3, 3 | 4 · To 10: 6 | 9, 8 | 7, 10 | 6 · To 20: 12 | 15, 19 | 13, 11 | 17.

**6. Before and after** (`number_neighbours`, oral). Say: "What number comes after 3?" or "…just
before 5?"
To 5: after 3 (4), before 5 (4), after 1 (2) · To 10: after 6 (7), before 10 (9), after 9 (10) ·
To 20: after 12 (13), before 16 (15), after 19 (20).

**7. Add with counters** (`add_objects`). Put out *a* counters and cover them. Say: "There are *a*
under my hand." Put out *b* more. Say: "How many altogether?"
To 5: 2+1, 3+2, 1+3 · To 10: 4+3, 6+2, 5+4.

**8. Take away with counters** (`subtract_objects`). Put out *a* counters. Say: "Watch." Take *b*
away and cover them. Say: "How many are left?"
To 5: 3−1, 5−2, 4−3 · To 10: 7−2, 9−3, 8−5.

**9. Make 5 and make 10** (`number_bonds`). One hand for 5, two hands for 10. Show some fingers up.
Say: "How many fingers are down?"
To 5: 3 up (2), 1 up (4), 4 up (1) · To 10: 7 up (3), 4 up (6), 8 up (2).

### A.2 Core EGMA

**Read big numbers** (Core EGMA Number Identification; `read_numbers`, 60 s, Number Card p.3, printed L719–725):
2 9 0 12 30 / 22 45 39 23 48 / 91 33 74 87 65 / 108 245 587 731 989.

**Bigger number** (`compare_numbers`, Number Card p.4, printed L761–769):
7 | 5 · 11 | 24 · 39 | 23 · 58 | 49 · 65 | 67 · 94 | 78 · 146 | 153 · 287 | 534 · 623 | 632 ·
867 | 965. Practice (draft): 3 | 8.

**Missing number** (`number_patterns`, Number Card p.5, printed L801–843):
5 6 7 _ · 14 15 _ 17 · 20 _ 40 50 · _ 300 400 500 · 2 4 6 _ · 348 349 _ 351 · 28 _ 24 22 ·
30 35 _ 45 · 550 540 530 _ · 3 8 _ 18. Practice: 1 2 _ 4 (L2128–2129).

**Addition 1** (`add`, 60 s, Number Card p.6). Items 1–5 are printed (L862–875); items 6–20 are
authored (**draft**):
1+3, 3+2, 6+2, 4+5, 3+3, 2+5, 7+1, 4+4, 8+2, 6+4, 9+2, 5+6, 8+4, 7+5, 6+7, 9+5, 8+7, 7+9, 9+8,
10+9.

**Subtraction 1** (`subtract`, 60 s, Number Card p.7). This is the inverse of Addition 1: the sum
minus one addend. The printed items use either addend; the authored items subtract the second.
Items 1–5 are printed; items 6–20 are authored (**draft**):
4−1, 5−2, 8−2, 9−5, 6−3, 7−5, 8−1, 8−4, 10−2, 10−4, 11−2, 11−6, 12−4, 12−5, 13−7, 14−5, 15−7,
16−9, 17−8, 19−9.

**Addition 2** (`add`, Number Card p.8, printed L879–891): 13+6, 18+7, 12+14, 22+37, 38+26.

**Subtraction 2** (`subtract`, Number Card p.9, printed L879–891): 19−6, 25−7, 26−14, 59−37,
64−26.

**Word problems** (`word_problems`, counters and paper allowed). English **draft**; "(pause)" marks
the toolkit's `[pause and check]`.

1. *Change, result unknown* (numbers from Addition 1 #2): "Two children are in a taxi. (pause)
   Three more children get in. (pause) How many children are in the taxi now?" (5)
2. *Combine* (numbers from Addition 1 #3): "There are six children in the taxi. (pause) Two are
   boys. (pause) The rest are girls. (pause) How many girls are in the taxi?" (4)
3. *Compare* (numbers from Addition 1 #6): "Lwazi has two sweets. (pause) Ayanda has seven
   sweets. (pause) How many more sweets does Lwazi need to have the same as Ayanda?" (5)
4. *Change, start unknown* (numbers from Addition 1 #14): "Some children are in a taxi. (pause)
   Five more children get in. (pause) Now there are twelve children in the taxi. (pause) How many
   children were in the taxi at the start?" (7)
5. *Sharing*: "Four children share twelve sweets. (pause) They each get the same number. (pause)
   How many sweets does each child get?" (3)
6. *Multiplying*: "There are five seats in the taxi. (pause) Two children sit on each seat. (pause)
   How many children are in the taxi?" (10)

Practice (draft): "You have one sweet. (pause) I give you one more. (pause) How many sweets do you
have now?" (2)
