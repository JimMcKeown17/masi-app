# PRD: WelaPLUS Assessment Battery — In-App, Modular, Open-Source

**Date:** 2026-05-27
**Status:** **Design complete; implementation remains off `main`.** Fourth Codex review revisions applied 2026-05-29. The 11 Question components and tests now exist on `feature/wela-plus-battery-merge` at `fed3175` (34 commits behind `main`, 19 ahead as of 2026-07-23), but host schema, sync, Run lifecycle, packaging/publication, content, and field testing remain open. The old `.claude` worktree no longer exists. Content licensing (CC-BY 4.0 for bundled item sets, picture cards, story scripts, and rubric anchors) remains subject to Masi leadership ratification.

Four adversarial Codex reviews on 2026-05-29 surfaced 35 findings total — 18 in the first pass (`documentation/archive/wela-plus-battery-prd-2026-review.md`: 8 critical, 6 high-priority, 4 medium-priority), 8 in the second pass after the first-pass fixes landed (3 high-priority, 5 medium-priority), 5 in the third pass (2 high-priority, 2 medium-priority, 1 low-priority) focused on the mobile/local sync surface and Storage RLS, and 4 in the fourth pass (2 high-priority, 1 medium-priority, 1 low-priority) on the Storage RLS spec the third pass had just produced. All 35 are addressed in this revision (four changelog tables in *Implementation handoff* below).

Remaining work is **safe branch integration, host implementation, package publication, and pedagogy content**. See *Implementation handoff* and `documentation/ROADMAP.md`.
**Domain glossary:** [`CONTEXT.md`](../CONTEXT.md) — terms **Assessment Question**, **Assessment Battery**, **Battery Run**, **Assessment Window**, **Progress check**, **Marking mode** are first-class and used throughout this PRD.
**Architecture explainer:** [`documentation/learning/assessment_battery_architecture.md`](./learning/assessment_battery_architecture.md) — the three-level Run → Question result → Item hierarchy.
**Agent context for continuation:** [`docs/agent-context/wela-assessment-component-build.md`](../docs/agent-context/wela-assessment-component-build.md) — pointers, decisions log, open questions, and the suggested resumption point.
**Source material:** Masi Wela+ Literacy Assessment 2024 (English) PDF — supplied to the grilling session that produced this draft.
**Implementation branch:** `feature/wela-plus-battery-merge` at `fed3175`; nothing from it is on `main`.

---

## Problem Statement

Masi currently administers two assessments in-app — both EGRA subtests (Letter Sounds and Word Reading). The flagship Masi literacy assessment, **WelaPLUS**, is still run entirely on paper: an EA captures a child's responses on a printed sheet, the sheet is collected by Masi staff, and Head Office staff mark the sheets weeks later. By the time scores reach the field, the moment for acting on them has passed — children cannot be auto-grouped, leaderboards are stale, EAs do not see the result of their own assessment work, and Masi cannot run any data product (dashboards, reports, parent feedback) without a multi-week delay. There is also no path for other literacy NGOs to use Masi's assessment IP, even though WelaPLUS is one of the few open, locally-developed, bilingual (English / isiXhosa) literacy batteries in South Africa.

## Solution

Build an in-app implementation of WelaPLUS as a **modular Assessment Battery** composed of 11 self-contained **Assessment Question** components, hosted by Masi's existing offline-first React Native app and stored in the SQLite/Supabase backend. EAs mark every Question they can mark live (oral-response Questions) directly on the device; for Questions where the child writes on paper, EAs still mark each item on the device as the child works, with a photo of the paper sheet captured for archival and HQ spot-check. Scores are computed locally and visible to the EA immediately on completion. The 11 Question components, the Battery configuration, and the item-set content are designed as a **standalone open-source React Native package** ("`@masinyusane/assessment-questions`" — name TBD) that any literacy organisation can install, configure with their own item content, and host against their own backend, guided by a supplemental setup document and an LLM-agent prompt that wires the package into a fresh project.

The Masi-specific pieces — `battery_runs` and `battery_run_artifacts` tables, RLS policies, Supabase sync, photo upload, programme-to-Battery mapping, Run navigation UX — are **not** part of the OSS package; they are the host's responsibility. The boundary is clean: a Question is a pure capture component that knows nothing about children, EAs, programmes, or storage; it just emits results. The host wires identity, persistence, photos, and sync.

## User Stories

### EA capture stories

1. As an EA assessing Lwazi for the first time, I want to start a WelaPLUS Battery Run from Lwazi's child profile, so that the assessment is naturally framed as "I am assessing this child" rather than "I am doing some abstract assessment work."
2. As an EA who works through Sessions and Assessments together, I want a second entry path to in-progress Runs from the Assessments tab, so that I can resume an unfinished Run without re-navigating to the child.
3. As an EA running Letter Sounds on Lwazi, I want a 60-second timer and a paginated grid of letters with large tap targets, so that I can keep pace with the child while marking accurately.
4. As an EA running any Question with a stop rule, I want the rule's wording shown to me on the Question's instructions screen, so that I am reminded when to stop without the app forcing the decision on me.
4a. As an EA running the Listen-and-Answer Story Question, I want the full story script rendered on the device intro screen with an "I've finished reading" primary action, so that I read from one source of truth and never switch between paper and device mid-administration.
4b. As an EA running the Listen-and-Answer Story Question whose child got distracted, I want a persistent "Re-read story" pill at the top of every question card that opens a modal sheet of the story, so that I can re-read aloud without losing any of the marks I have already made.
4c. As an EA running the Listen-and-Answer Story Question, I want the acceptable-answer rubric shown as a small gloss beneath each comprehension prompt, so that I can judge the child's verbal answer against the rubric without having to recall it from training.
5. As an EA running the Listen-First-Sound Question, I want a single-column list of 10 short prompts with one item large and centered at a time, so that I can move through items at conversational pace without losing my place.
6. As an EA running the Listen-Phoneme-Blend Question, I want each segmented prompt (e.g. `s-u-n`) to be visible at large size with a smaller gloss `(sun)` beneath it for my own reference, so that I do not blank on what the word should be.
7. As an EA reading a passage with the child on the Read-Passage Question, I want words rendered as pills that wrap across the screen, so that I can see the whole passage without paging and the child can read continuously.
8. As an EA whose device font size is too small for a particular child to read comfortably, I want to adjust the assessment font size in app Settings, so that the same Question works at any reading distance.
9. As an EA on my first Read-Passage Question of the day, I want a one-line hint reminding me I can adjust font size in Settings, so that I know the option exists without having to discover it.
10. As an EA scoring any Question, I want tapping an item to mark it correct (green) and leaving it untapped to mean wrong, so that I have one mental model for marking that works across every Question.
11. As an EA who mis-tapped an item, I want a second tap to clear the mark, so that I can correct mistakes without an undo dialog.
12. As an EA who has finished one Question of an 11-Question Battery, I want to return to a Battery overview screen showing each Question's state (not started / in progress / complete / skipped), so that I can resume the next Question with one tap.
13. As an EA whose child refused a Question, I want to skip that Question with a captured reason from a short enum (`skipped_child_refused` / `skipped_tired` / `skipped_time` / `skipped_age` / `skipped_prerequisite_unmet` / `skipped_other`), so that the Run can complete cleanly without lying about why a Question was unscored.
14. As an EA running the WelaPLUS Battery, I want Questions 6, 7, and 8 (the reading Questions) to be auto-skipped with `skipped_prerequisite_unmet` when the child's Letter Sounds score is below a configured threshold, so that I never put a child through a demoralising attempt at a task they cannot do.
15. As an EA who completes a Run, I want a results screen showing each Question's score and a Battery-total summary, so that I can share progress with the child verbally and confirm everything saved.
16. As an EA whose device went offline mid-Run, I want every Question result to save locally and the Run to complete locally, so that connectivity is not a blocker for assessment work.
17. As an EA who has already run WelaPLUS on a child in this Window, I want to be able to run it again (the child was tired the first time, or wants to re-try), so that field reality is not blocked by a one-Run-per-Window restriction. The most recent Run is canonical for reporting; the old Run is retained for audit.
18. As an EA whose Question involves the child writing on paper (Question 5 Letter Writing from Pictures, Question 9 CVC Writing, Question 10 Dictation), I want the EA-marking cadence to fit each Question naturally — batch marking on the device after the child finishes Question 5's sheet, live per-item marking as I dictate for Questions 9 and 10 — so that scoring keeps pace with how each Question is actually administered.
18a. As an EA who has finished a WelaPLUS Run with paper-marked Questions, I want a single end-of-Run photo capture flow that walks me through one photo per paper-marked Question, so that I do not have to remember to take photos during the Run.
18b. As an EA who forgets or skips a photo, I want a soft warning at Run completion listing the missing photos with the option to take them now or finalize without, so that I am never blocked from finishing a Run by camera or storage failures.
18c. As an EA in the field on cellular only, I want photo files to be compressed at capture and upload to default to wifi only, so that my data plan is not exhausted by photo uploads.
18d. As a Masi admin during an Assessment Window, I want to remotely enable cellular photo upload for the duration of the Window, so that photo audit artifacts reach HQ in time for Window roll-up reporting without permanently changing EA data behaviour.
19. As an EA running Story Writing with the rubric, I want to score four dimensions (Meaning Making / Spelling / Length / Vocabulary) on the device while reading the child's handwritten paragraph, with each dimension represented as a row of five tappable chips (0–4) and an end-anchored gloss line beneath, so that I commit each dimension's score in a single tap and can re-score by tapping a different chip — using the same gesture family as the other Questions.
19a. As an EA undecided between two adjacent rubric scores on a dimension, I want a "View full rubric" button per dimension that opens a sheet showing all five anchor descriptions, so that I can read the full anchor wording before committing without cluttering the default scoring screen.
19b. As an EA scoring Q11, I want the picture the child wrote about displayed as a small thumbnail at the top of the scoring screen with tap-to-enlarge, so that I have the prompt's context in view while reading the story without consuming most of the screen.

### Admin / programme stories

20. As a Masi programme admin, I want each Programme to be linked to one canonical Battery (e.g. Core Literacy R-3 → WelaPLUS Full) in the database, so that EAs never have to pick a Battery — the app derives it from their active Programme.
21. As a Masi admin who runs Baseline, Midline, and Endline windows, I want to configure Assessment Windows centrally, so that every Run captured during a window is automatically tagged with that window for roll-up reporting.
22. As a Masi data analyst, I want a child's most-recent Run within a Window to be canonical for reporting, with prior Runs kept for audit, so that latest data wins without losing history.
23. As a Masi pedagogy lead, I want prerequisite gate thresholds (e.g. "Letter Sounds < 10/60 auto-skips Word Reading") to be config-driven on the Battery, so that thresholds can be tuned over time without a code change.

### Data and reporting stories

24. As a Masi data engineer, I want a single `battery_runs` row per Run with FK children in `assessments` and `battery_run_artifacts`, so that the HQ NextJS dashboard can render one row per child per Run without reconstructing from per-Question rows.
25. As an analyst querying the data, I want every `assessments` row to carry both `question_code` and `question_version` (and `item_set_id`), so that I can compare scores across versions of the same Question and detect when a content change made historical comparisons invalid.
26. As an analyst studying Question 11 (Story Writing), I want the EA's total /16 and HQ's total /16 stored as nullable columns on the same `assessments` row (`ea_rubric_total`, `hq_rubric_total`) with per-dimension scores stored as separate `assessment_items` rows tagged with `metadata.scorer ∈ {'ea','hq'}` (4 EA rows + 4 HQ rows when fully calibrated), so that the top-level "did EAs and HQ agree" query is one column subtraction and per-dimension drift queries join through `assessment_items`.

### Open-source stories

27. As an external literacy NGO, I want to install Masi's assessment questions as an npm package, import the components I need, and bring my own item content (letters, words, story, rubric), so that I can run Wela-style assessments in my own app without reinventing the components.
28. As an external NGO setting up the package for the first time, I want a single Markdown setup guide and an LLM-agent prompt I can paste into Claude Code (or similar), so that the agent wires up my SQLite/Postgres schema, RLS, and sync without me needing to read the Masi codebase.
29. As an external developer extending the package, I want each Question to be a self-contained React Native component that accepts an `itemSet` and callback props and emits results via `onComplete`, so that I can replace or add a Question without touching anything else.

## Implementation Decisions

### Vocabulary

The terms **Assessment Question**, **Assessment Battery**, **Battery Run**, **Assessment Window**, **Progress check**, and **Marking mode** are defined in [`CONTEXT.md`](../CONTEXT.md). All decisions in this PRD use those exact terms. The legacy terms **Field Assessment** and **In-App Assessment** are retired in favour of this vocabulary because a Battery can mix marking modes per Question.

### The three-level schema (additive)

The full shape is described in [`documentation/learning/assessment_battery_architecture.md`](./learning/assessment_battery_architecture.md). Summary:

- **`battery_runs` (new table)** — parent. One row per Run. Columns: `id`, `battery_code`, `battery_version`, `child_id`, `user_id`, `programme_id`, `class_id`, `assessment_window_id` (nullable for Progress checks), `language`, `started_at`, `completed_at` (nullable while open), `status` ∈ `{in_progress, completed, abandoned}`, `notes`, sync columns.
- **`assessments` (existing, additive columns)** — middle. One row per Question result within a Run. New columns: `battery_run_id` (FK, nullable for pre-Run-era rows), `question_code`, `question_version`, `item_set_id`, `stopped_reason` (enum), plus two Q11-specific nullable rubric-calibration columns: `ea_rubric_total` (set when the EA finishes Q11, /16) and `hq_rubric_total` (set when HQ marks the paper later, /16; written by the future HQ NextJS dashboard). Both NULL for every non-Q11 row. Old EGRA rows backfill `question_code = 'egra_letter_sound'` and keep `battery_run_id = NULL`.
- **`assessment_items` (existing, no change)** — leaf. One row per item within a Question. `is_correct` is now treated as `boolean DEFAULT false` (any item without an explicit `true` is wrong). For Q11 specifically, the per-dimension rubric scores live here with **scorer-prefixed `item_key`** — EA rows use `item_key ∈ {'ea:meaning_making', 'ea:spelling', 'ea:length', 'ea:vocabulary'}` and HQ rows use `item_key ∈ {'hq:meaning_making', 'hq:spelling', 'hq:length', 'hq:vocabulary'}`, `is_correct = false` on every Q11 row (not the carrier), `metadata = { score: 0–4, scorer: 'ea' | 'hq', anchor_text?: string }`. The EA writes 4 rows when finishing Q11; HQ writes 4 *additional* rows later (not updates to the EA rows), so a fully-calibrated Q11 result has 8 `assessment_items` rows. The `ea:` / `hq:` prefix on `item_key` is load-bearing — without it, the existing `deterministicItemId(assessmentId, position, item_key, is_correct)` helper would collide EA and HQ rows. See ADR-0004 for the full disambiguation rationale.
- **`battery_run_artifacts` (new table)** — sibling of `assessments` under a Run. Photos of paper sheets. Columns: `id`, `battery_run_id`, `question_code` (**NOT NULL** per Pattern D's per-Question photo design — every artifact is bound to exactly one Question; multi-page Questions add more rows with the same `question_code` via the "Add another" affordance), `storage_path` (the path **inside** the `battery-run-photos` Storage bucket, i.e. `'{battery_run_id}/{id}.jpg'`; CHECK enforces this exact shape), `captured_at`, sync columns. The bucket name is **not** part of `storage_path` — `storage.objects.bucket_id` carries it separately, matching Supabase's data model. Codex review (fourth pass) finding 1.

`child_id`, `user_id`, `programme_id` remain denormalised on `assessments` rows to keep RLS policies and per-Question queries simple.

### Definition source — code, not DB

Question, Battery, and Item-set **definitions** live as code-as-config in the OSS package, not as DB lookup tables. The DB stores only string references (`question_code`, `question_version`, `battery_code`, `battery_version`, `item_set_id`). The HQ NextJS dashboard imports the same OSS package to render display names. This makes the OSS package atomically deployable and means an external org installing it gets the definitions for free, with no DB seed required.

### The OSS Question contract

A Question is a **pure capture component**. It accepts:

- `language` — e.g. `'en' | 'xh'`.
- `itemSet` (optional override) — content. Bundled with the Question by default in both languages; overridable for testing or other-org content. Item sets are themselves versioned (`item_set_id = '{question_code}@{question_version}.{language}'`).
- `instructions` — string of EA-facing copy shown on the Question's intro screen, including any stop-rule reminder text.
- `durationSec` (optional) — if set, the Question runs a timer; if omitted, untimed.
- Callbacks: `onItemMarked(item)`, `onComplete(result)`, `onAbandon(reason)`.

A Question does **not** receive `child_id`, `user_id`, `programme_id`, `battery_run_id`, or any Supabase/SQLite client. Those are host concerns. The host wraps the Question, supplies these props, and writes host-relevant fields to its own storage when callbacks fire.

The Question emits results in the shape:

```
{
  question_code: string,
  question_version: string,
  item_set_id: string,
  language: string,
  duration_ms: number,
  stopped_reason: 'completed' | 'timer' | 'ea_ended' | 'stop_rule'
                | 'skipped_child_refused' | 'skipped_tired' | 'skipped_time'
                | 'skipped_age' | 'skipped_prerequisite_unmet' | 'skipped_other',
  items: [{ position, item_key?, prompt, response?, is_correct, metadata? }],
  derived: {
    total_correct: number,
    total_attempted: number,
    percent: number,
    last_attempted_position: number | null,   // for timed/sequential Questions (Q1, Q6, Q8);
                                              // items at position > this value are "not reached",
                                              // distinct from "wrong" — Codex review finding 9.
                                              // null for untimed Questions where the distinction
                                              // does not apply.
    // ... question-specific derived fields
  },
}
```

**The `item_key` field on each item is the Question's stable identifier for that item slot** (Codex review second-pass finding 3). It is the value the host uses for deterministic-ID generation when writing `assessment_items` rows; without it, the host would have to invent a key from `position` or `prompt`, which collides for Questions that re-use prompts across slots. Use cases:

- **Pattern E (Q11 Story Writing rubric):** the Question component sets `item_key ∈ {'ea:meaning_making', 'ea:spelling', 'ea:length', 'ea:vocabulary'}` per item. The `ea:` prefix is load-bearing — see ADR-0004 — to disambiguate EA-scored rows from HQ-scored rows the future HQ NextJS dashboard inserts later with `hq:`-prefixed `item_key`s.
- **Patterns A / C (timed word/letter Questions):** the Question component sets `item_key` to the rendered letter or word (e.g. `'a'`, `'cat'`).
- **Patterns B / F (oral checklists with structured prompts):** the Question component sets `item_key` to a stable per-prompt code (e.g. `'q3.first_sound.item_1'`).

`item_key` is optional in the OSS contract because a one-off external adopter may emit a minimal Question that omits it; in that case the host derives it from `position`. For every WelaPLUS Question the contract test (PRD section 1's *OSS package engineering policies*) **requires** `item_key` to be set, because the storage mapping at PRD section 2 reads `result.items[i].item_key` first.

**The `last_attempted_position` field in `derived` is required for timed and sequentially-presented Questions** — Q1 Letter Sounds (60s grid), Q6 Word Reading (timed), Q8 Read Passage (timed). For these Questions, the "tap = correct, blank = wrong" model would otherwise conflate three semantically distinct states: *correct*, *attempted-wrong*, and *not reached* (the timer expired before the EA tapped that item). Reporting that uses words-correct-per-minute, accuracy-rate, or error-pattern analysis needs the distinction. The Question component tracks the EA's progress through the item list (the position of the last item the EA saw or interacted with before the timer expired) and emits it in `derived.last_attempted_position`. The host's repository writes this value into `assessments.items_tested` (which is JSONB and already holds the full `derived` blob). For untimed Questions where every item is presentable to the child, the field is `null`.

Questions do not persist their own state — no mid-Question resume. Force-quit during a Question restarts the Question from scratch. Between Questions, the Battery Run stays open and resumable; completed Questions are not lost.

### Marking convention (unified across Patterns A, B, C)

**Tap = correct (green); no tap = wrong/blank.** A second tap clears the mark back to blank. `assessment_items.is_correct` is stored as `true` for tapped items and `false` for everything else. The blank-equals-wrong simplification was a deliberate choice during grilling: it removes the three-state cycle the EA would otherwise have to remember, gives one mental model across all Questions that involve marking discrete items, and is consistent with the WelaPLUS paper convention ("blank = wrong, check = correct"). Unified across **Patterns A, B, C, D, and F** — ten of the eleven WelaPLUS Questions. **Pattern E (Q11 rubric) diverges as designed:** the single tap-correct cell is replaced by a row of five tappable chips (0–4) per dimension. The primitive gesture is still tap-once-to-commit; the EA picks one of five values rather than toggling a binary mark, and re-scoring is done by tapping a different chip rather than tapping again to clear. `assessment_items.is_correct` stays `false` for Q11 rows — it is not the carrier of rubric scores; `metadata.score` is.

### Run lifecycle and navigation

- **Battery selection.** One canonical Battery per Programme, set by Masi admin via `programmes.default_battery_code` *and* `programmes.default_battery_version` (the version is mandatory when the code is set — see PRD section 2's *Additive columns on `programmes`* for the reasoning; Codex review third-pass finding 5a). EAs do not see a Battery picker in v1. The schema must be forward-compatible with a future multi-Battery-per-Programme world (e.g. a `programme_batteries` join table) but the v1 UI exposes only the default.
- **Run start.** Primary entry: from a Child profile screen ("Run WelaPLUS" button). Secondary entry: from the Assessments tab as an "in-progress + recent Runs" list. Both paths create the same `battery_runs` row; the host is responsible for tagging the active Window (if one is open) and persisting `started_at`.
- **Question order.** Linear by default — the next un-started Question is the only "Start next" affordance on the Battery overview screen. The data model and UI must not hardcode strict linearity; a future change to a free Battery-overview picker should be config, not refactor.
- **Skipping.** EA can skip any Question with a reason from a short enum (see `stopped_reason` values). Skipped Questions count as "decided" for Run completion. Auto-skip on prerequisite-unmet uses `stopped_reason = 'skipped_prerequisite_unmet'` and presents nothing to the EA.
- **Multiple Runs per child per Window** allowed. Latest-in-Window is canonical for roll-up reporting; prior Runs are retained for audit. Progress checks (`assessment_window_id = NULL`) are excluded from windowed reporting.
- **Run completion lifecycle (clarified — Codex review third-pass finding 2).** The transition from `in_progress` → `completed` is **explicit and EA-triggered**, not automatic. The two-step shape:
  1. **All-Questions-decided → eligible to finalize.** Once every Question in the Battery has either a result row or a skip reason, the Run is *eligible to finalize* but `status` stays `in_progress`. The Battery overview screen surfaces a "Finalize Run" primary action; the End-of-Run photo capture queue is the same screen.
  2. **"Finalize Run" → status transition.** Tapping "Finalize Run" writes `completed_at = now()`, flips `status` to `'completed'`, and locks the Run. After this point, photo INSERT RLS rejects new artifacts (`status` is no longer `'in_progress'`).
  - **Order matters.** Photo capture is part of the eligible-to-finalize window, **not** the post-completion state. The "no photos after completion" rule (PRD's *Missing-photo policy*) is enforced by ordering: the EA captures photos *before* tapping "Finalize Run", because once they tap, RLS blocks further artifact INSERTs.
  - **EA can also abandon a Run**, in which case `status = 'abandoned'`. Abandonment is a separate explicit action from finalization; abandoned Runs cannot have photos added either.

### Pattern A — Timed tap-grid (Question 1: Letter Sounds)

- **Component:** `<LetterSoundsQuestion>` — new pure component, built fresh; existing Masi `LetterAssessmentScreen` remains running for EGRA unchanged.
- **Layout:** paginated grid (default 20 per page, 5 columns × 4 rows); pill size scales with shared `childReadingFontSize` design token.
- **Timer:** 60 seconds, prop `durationSec`.
- **Stop rule:** *not enforced in code.* The Question accepts an `instructions` prop the host fills with stop-rule reminder copy (e.g. "Stop if the child gets a whole row wrong.") or omits. The EA reads it and decides; the existing "End" button finalizes early.
- **Item set:** `WELA_PLUS_LETTER_SOUNDS_EN / _XH` — to be supplied by Masi pedagogy team. The component declares the shape (`{ letters: string[], lettersPerPage, columns }`) and renders an empty state until content is provided.
- **Migration of EGRA Letter Sounds to this component:** out of scope for this PRD; deferred to a follow-up after WelaPLUS is field-proven.

### Pattern B — Oral response checklist (Questions 3, 4)

Per the user's "one component per major question" call, **two distinct components** with similar internals:

- **`<ListenFirstSoundQuestion>`** — Question 3. 10 items. EA reads each prompt aloud, child says first sound, EA taps if correct.
- **`<ListenPhonemeBlendQuestion>`** — Question 4. 8 items. EA reads each segmented prompt aloud (e.g. `s-u-n`), child says blended word, EA taps if correct. Each prompt shows a smaller-text gloss `(sun)` below the segmented form for the EA's reference; the gloss is always visible (default A in Q8d).
- **Layout:** single vertical column; one item large and centred; auto-scroll to next un-marked item as EA progresses.
- **Marking:** two-state (tap = correct, blank = wrong) — unified with Pattern A and Pattern C per the cross-Pattern marking decision.
- **Timer:** none.
- **Completion:** "Finish" prompts on unmarked items: "N items unmarked — finish anyway?"
- **Shared internals:** a `useToggleMark` hook lives inside the OSS package, used by both components, but is not itself a Question. Shared logic, named components.

### Pattern C — Reading Questions (6, 7, 8)

Three distinct components: **`<ReadWordsQuestion>`** (6), **`<ReadSentencesQuestion>`** (7), **`<ReadPassageQuestion>`** (8).

- **Layout:** all three use **pill-shaped tappable word tiles** in a `flex-wrap` container; single scrollable view (no pagination); pill size scales with shared `childReadingFontSize` design token. Sentences in Question 7 are visually grouped (subtle background per sentence row). Question 8 renders as a flowing paragraph.
- **Font-size adjustability:** new global Settings entry — "Assessment text size" — adjusts the shared `childReadingFontSize` token across every reading Question. A one-line hint on the first reading Question of each Run reminds the EA the setting exists.
- **Marking:** unified tap-correct, blank-wrong (matches Patterns A, B). The Question exposes an optional `markingPolarity: 'tap_correct' | 'tap_wrong'` prop as an escape hatch for the passage case; defaults to `'tap_correct'`. Switching the default after field testing is a one-line change.
- **Question 6 (Word Reading):** timed (WelaPLUS-supplied `durationSec` TBD; PDF was incomplete). Pills wrap across the screen. Per-word marking. Scoring: raw correct count out of `itemSet.length`.
- **Question 7 (Sentence Reading):** untimed (the 4-sentence read is too short to need one). Per-word marking grouped visually by sentence. `result.derived` includes per-sentence percentages as a computed field — no separate user input.
- **Question 8 (Read Passage / ORF):** timed (WelaPLUS-supplied `durationSec` TBD; default to 60s if unspecified). **Passage length is variable** — the Question reads its length from the `itemSet`, not from a hardcoded 80. Per-word marking. `result.derived` includes correct-words-per-minute derived from `duration_ms` and `total_correct`.

### Pattern D — Paper-marked Questions with photo capture (Questions 5, 9, 10)

Per the "one component per major question" rule, **three distinct components**:

- **`<LetterWritingFromPicturesQuestion>`** — Question 5. Picture cards on paper; child writes the first letter of each picture's name.
- **`<WriteCvcsQuestion>`** — Question 9. EA dictates a CVC word; child writes from memory.
- **`<WriteSentencesFromDictationQuestion>`** — Question 10. EA dictates a sentence; child writes from memory.

**Marking cadence is mixed by Question, not unified across Pattern D:**

- **Question 5: batch marking.** Child fills in the paper sheet at their own pace (26 items). EA marks on the device after the child finishes, walking the paper visually while tapping cells on the device. Live marking would degrade accuracy on 26 self-paced items.
- **Questions 9 and 10: live marking.** EA dictates one item, child writes it, EA taps to mark, EA dictates the next. The marking cadence is naturally gated by the EA's own dictation pace, so live works cleanly. 12 items each.

**Layout shells** (the marking *mechanic* is shared via `useToggleMark`; only the layout shell differs):

- **Question 5: paginated grid** mirroring the paper sheet's row structure. Each cell shows a **picture thumbnail + a small expected-letter label** (e.g., a thumbnail of an apple with a tiny "a"). Picture supports visual correlation to the paper sheet; the letter label removes EA recall load. WelaPLUS picture card assets are bundled with the OSS package; external organisations override via the `itemSet` prop with their own pictures.
- **Questions 9 and 10: single vertical column auto-scroll** with the prompt large and centred. Identical layout shell to Pattern B (Questions 3, 4).

**Prompt privacy** (Questions 9 and 10 only): Display the prompt prominently in large text. Privacy is the EA's physical responsibility — angle the device away from the child, same discipline as with the paper prompt list today. No tap-to-reveal, no auto-hide, no privacy-by-position-on-screen. Adding any of those adds cognitive load for a Question that is already cognitively demanding.

**Marking convention:** Unified with Patterns A, B, C — tap = correct (green), no tap = wrong/blank. Second tap clears. `assessment_items.is_correct boolean DEFAULT false`.

**Stop rules:** None known in the WelaPLUS PDF for these three Questions. If pedagogy supplies one, it ships as `instructions` copy per the cross-Pattern soft-stop convention.

### Photo capture flow

**Timing — End-of-Run batch.** No per-Question photo prompt during the Run. After the EA finishes marking the last Question of the Battery, the Run-completion screen drives a single capture flow:

```
End-of-Run capture queue:
  → "Take a photo of Question 5's sheet"  → camera → preview → accept
  → "Take a photo of Question 9's sheet"  → camera → preview → accept
  → "Take a photo of Question 10's sheet" → camera → preview → accept
  → [Question 11 photo when Pattern E lands]
  → Run complete.
```

**Mechanism — Expo Image Picker, camera-only.** Uses `expo-image-picker`'s `launchCameraAsync` with `mediaTypes: 'Images'`. Hands off to the OS native camera (which EAs already know from personal phones), with the OS's built-in preview / retake step before the photo is returned to the app. Image lands in the app's `documentDirectory`. No custom camera UI; no in-camera scoring overlays; no paper-detection.

**Unit — One photo per paper-marked Question, can add more.** Default capture is one photo per Question. An "Add another" affordance per Question handles multi-page sheets and re-takes. Every `battery_run_artifacts` row carries a `question_code` (NOT NULL) so HQ filtering by Question is a single indexed query.

**Compression at capture — non-negotiable.** Every photo is resized to **~1080px longest edge** and re-encoded at **~70% JPEG quality** (target ~150–250KB per photo) using `expo-image-manipulator`. The raw camera image is discarded after compression. A WelaPLUS Run with 4 paper-marked Questions produces ~1MB of photo data total. This compression is a hard requirement, not a setting — full-resolution photos would consume 25× more EA data per Run.

**Missing-photo policy — soft warning.** If any paper-marked Question reaches end-of-Run without a photo, the completion screen shows "Missing photos: Question 5, Question 9 — take now or finalize without." The EA can finalize without photos. Once the Run is finalized (`status = 'completed'`), no more photos can be added through this flow — there is no "completed-but-missing-photos" intermediate Run state. The status enum stays at three values (`in_progress`, `completed`, `abandoned`).

### Photo sync architecture — eventually consistent

The photo file and the `battery_run_artifacts` row sync **independently**. The row goes through the main outbox alongside other small Postgres-row writes (assessment scores, items). The photo file uploads through a **separate low-priority sync lane**:

- **`battery_run_artifacts` row** → main outbox. Tiny payload (UUID, `question_code`, `battery_run_id`, `storage_path`, timestamps). Clears in the same first-window-of-connection burst as the scores.
- **Photo file** → separate lane drained when the row is already in Postgres. Independent retry cadence with exponential backoff. No effect on row-sync throughput.

**Effects:**

- HQ sees the row arrive at the same time as the scores. Briefly, the `storage_path` may point at a file that 404s in Supabase Storage; the HQ dashboard handles that gracefully with a "photo uploading…" placeholder.
- Slow or weak connections never block assessment-score sync. Small rows always clear first.
- A failed photo upload retries indefinitely; if the photo never uploads, the row is still there with the scores it accompanies.

**Local file storage:** Photos sit at `${FileSystem.documentDirectory}battery_run_photos/${battery_run_id}/${artifact_id}.jpg` until upload succeeds. The local path is recorded **only** on the local-only `photo_upload_queue.local_path` column (specified in PRD section 2's *Photo upload queue* subsection) — the synced `battery_run_artifacts` row carries no local-path column. A single source of truth for the local file avoids drift between the artifact row and the queue row. Codex review (second pass) finding 2b.

**Supabase Storage path:** the file lives in the dedicated `battery-run-photos` bucket at object key `${battery_run_id}/${artifact_id}.jpg`. The bucket name is the `storage.objects.bucket_id` column, not part of the object key, matching Supabase's data model — the `battery_run_artifacts.storage_path` column stores only the inside-bucket key (`'{run_id}/{id}.jpg'`). RLS shape: producer/owner check that mirrors `assessments` — EA can SELECT and INSERT their own; HQ can SELECT all within their programme scope (the HQ SELECT policy is finalised once the HQ role mechanism lands per the future HQ NextJS dashboard PRD). Photos are write-once from the EA side — no UPDATE or DELETE policy is granted to authenticated users; cleanup is handled by a future service-role orphan job. The full bucket setup, three concrete Storage RLS policies, and the layered-defence architecture are in PRD section 2's *Storage bucket: `battery-run-photos`* and *Storage bucket RLS* subsections; the implementation phase also updates `documentation/rls-sync-contract-map.md`.

**Connection policy — wifi-by-default with Window override.** Photo upload defaults to wifi only via `@react-native-community/netinfo` connection-type detection (the library already present in `package.json`; Codex review second-pass finding 6 — earlier draft text referenced `expo-network`). A Masi-controlled remote feature flag (`photo_upload_over_cellular`) flips uploads to "any connection" during open Assessment Windows so that audit artifacts reach HQ in time for the Window's roll-up reporting. EAs also have an explicit "Upload now over cellular" affordance on a sync screen for one-off override (e.g., they will not be on wifi for weeks but want HQ to have the photo).

**Local retention:** Photo files are deleted from `documentDirectory` after confirmed Storage upload. Device storage stays bounded regardless of Run history. The `photo_upload_queue.local_path` value is cleared (or the queue row deleted, per the photo-queue subsection in PRD section 2) at the same time. The `battery_run_artifacts` row stays as-is — it never held a local path.

### Pattern F — Listen-and-Answer Story (Question 2)

Per the "one component per major question" rule, **one component**:

- **`<ListenAndAnswerStoryQuestion>`** — Question 2. EA reads a short narrative aloud to the child from the device, then asks 5 comprehension questions one at a time. Child answers verbally. EA taps each question card to mark correct.

**Layout shells:**

- **Intro screen:** the full story script is rendered as scrollable text in EA-readable size, with a prominent "I've finished reading" primary action that advances to the question phase. Bilingual rendering is driven by the `language` prop. The story string lives in `itemSet.story.{en|xh}` — the same payload shape as Pattern C's reading passages, so this adds no new content type to the OSS package.
- **Question phase:** reuses Pattern B's single-vertical-column auto-scroll shell. One question card at a time, large and centred, with the acceptable-answer rubric strings displayed as a small gloss beneath the prompt (same pattern as Q4's `(sun)` gloss under `s-u-n`). Auto-scroll to next un-marked item on tap. Finish-confirms-unmarked.
- **Re-read-story affordance:** a persistent "Re-read story" pill at the top of every question card opens a non-destructive modal sheet showing the story text again. Dismissing the sheet returns to the same question card with all marking state preserved. Re-read count is **not** logged on the result row (keeps the row simple; can be added later if pedagogy wants the analytics signal).

**Marking convention:** Unified with Patterns A, B, C, D — tap = correct (green), no tap = wrong/blank, second tap clears. `assessment_items.is_correct boolean DEFAULT false`. No new mechanic introduced for Q2 — the EA uses the same gesture they already know from nine other Questions.

**Timer:** none.

**Stop rule:** none.

**Item-set shape:**

```
{
  story: { en: string, xh: string },
  questions: [
    {
      prompt:             { en: string, xh: string },
      acceptable_answers: { en: string[], xh: string[] }
    },
    // … typically 5 questions per the WelaPLUS PDF; count is driven
    //   by `questions.length`, not hardcoded.
  ]
}
```

Number of comprehension questions is driven by `questions.length` (matching Pattern C's "passage length variable" convention). The `acceptable_answers` shape is intentionally minimal for v1 — a flat list of strings per language. The OSS package's TypeScript type can later widen to `string[] | { text: string, note?: string }[]` without breaking adopters, because the host passes `itemSet` opaquely and only the Question component renders the rubric.

**Artifact / photo capture:** **None in v1.** The child's response is verbal and no paper sheet exists. `<ListenAndAnswerStoryQuestion>` does not surface a photo or audio callback. The host's end-of-Run capture queue (Pattern D's flow) silently skips Q2 because the Battery config does not flag it as paper-marked. `battery_run_artifacts.question_code` already permits a future Battery variant adding Q2 photo capture with **zero schema change and zero Question-component change** — the host just opts Q2 in via Battery config.

**Out-of-scope for v1 (schema-hooked where possible, otherwise deferred):**

- **Audio recording** of child responses. Would require a new artifacts table with different metadata, microphone permissions, a different sync lane, and privacy review. Not hooked — adding it later is a larger lift.
- **Structured-per-answer rubric** (`[{ text, note? }]` instead of `string[]`). The OSS TypeScript type is the only place this lives; widening is non-breaking. Defer until a real consumer (picker mode, variant-matched analytics) appears.
- **Re-read count logged on the result row.** Pedagogy-team signal that hasn't been requested. Add a nullable column later if it becomes useful.

### Pattern E — Story Writing rubric (Question 11)

Per the "one component per major question" rule, **one component**:

- **`<StoryWritingRubricQuestion>`** — Question 11. After the child writes a multi-sentence story on paper about a picture prompt, the EA reads the story and scores 4 dimensions (Meaning Making, Spelling, Length, Vocabulary) on a 0–4 rubric for a /16 total. The same Question opts into Pattern D's end-of-Run photo capture so the paper artifact reaches HQ for the calibration experiment.

**Layout:**

- **Picture-prompt reference** at the top: the picture the child wrote about renders as a small inline thumbnail with tap-to-enlarge to a full-screen sheet. The picture lives in `itemSet.picture.{ uri, alt: { en, xh } }` — bundled default in the OSS package, overridable via the `itemSet` prop. **One picture per Run** for v1; Battery config picks which. EA-time picture choice is deferred.
- **Four dimension cards** stacked vertically. Each card shows: (a) the dimension name as a large header (e.g. "MEANING MAKING"); (b) a small "View full rubric" button on the right of the header; (c) a row of **five tappable chips** numbered 0–4 — tap one to commit; tap a different chip to re-score (no "tap again to clear" because 0 is itself a valid score); (d) an **end-anchored gloss line** beneath the chips showing the 0 / middle / 4 anchors (e.g. "no attempt → partial → sophisticated") for at-a-glance scale awareness.
- **"View full rubric" sheet** opens a modal listing all five anchor descriptions with their numbers as a vertical list. Dismissing returns to the scoring screen with selections preserved. This is the inter-rater reliability lever — EAs reach for it when uncertain between adjacent scores, without cluttering the default scoring view.
- **Running total** beneath the four dimension cards: "Total: N / 16" — updates as the EA scores.
- **"Finish Question 11"** primary action — confirms unscored dimensions if any.

**Marking convention:** Diverges from A/B/C/D/F's binary tap-correct. Pattern E's primitive is still tap-once-to-commit, but the EA picks one of five values per dimension rather than toggling a binary mark on/off. See the Marking convention section above for the full statement of how Pattern E's shape relates to the rest of the Battery.

**Timer:** none. **Stop rule:** none.

**Item-set shape:**

```
{
  picture: { uri: string, alt: { en: string, xh: string } },
  dimensions: [
    {
      code: 'meaning_making',
      label: { en: 'Meaning Making', xh: '…' },
      anchors: {
        en: [
          { score: 0, text: 'no attempt' },
          { score: 1, text: 'fragment, unclear' },
          { score: 2, text: 'partial idea, some development' },
          { score: 3, text: 'clear and developed' },
          { score: 4, text: 'sophisticated, fully developed' }
        ],
        xh: [ /* same shape, isiXhosa anchors */ ]
      },
      end_anchor_gloss: {
        en: 'no attempt → partial → sophisticated',
        xh: '…'
      }
    },
    // … three more dimensions: spelling, length, vocabulary
  ]
}
```

The four canonical dimensions (`meaning_making`, `spelling`, `length`, `vocabulary`) are bundled by default for WelaPLUS but adopters may override the dimension list, codes, and labels via `itemSet.dimensions`. Number of dimensions is driven by `dimensions.length` — not hardcoded at 4 — so a 3-dimension or 5-dimension variant ships with no code change.

**Result shape:**

The Question emits results in the standard OSS shape, with `items` populated as one entry per dimension:

```
{
  question_code: 'wela_plus_story_writing',
  question_version: '2024.1',
  item_set_id: 'wela_plus_story_writing@2024.1.en',
  language: 'en',
  duration_ms: …,
  stopped_reason: 'completed',
  items: [
    { position: 1, item_key: 'ea:meaning_making', prompt: 'Meaning Making', is_correct: false,
      metadata: { score: 2, scorer: 'ea', anchor_text: 'partial idea, some development' } },
    { position: 2, item_key: 'ea:spelling',       prompt: 'Spelling',       is_correct: false,
      metadata: { score: 1, scorer: 'ea', anchor_text: 'fragment, unclear' } },
    { position: 3, item_key: 'ea:length',         prompt: 'Length',         is_correct: false,
      metadata: { score: 3, scorer: 'ea', anchor_text: '…' } },
    { position: 4, item_key: 'ea:vocabulary',     prompt: 'Vocabulary',     is_correct: false,
      metadata: { score: 2, scorer: 'ea', anchor_text: '…' } }
  ],
  derived: {
    ea_rubric_total: 8,
    max: 16,
    by_dimension: {
      meaning_making: 2,
      spelling: 1,
      length: 3,
      vocabulary: 2
    }
  }
}
```

**Calibration column shape (load-bearing for the future HQ NextJS dashboard):**

- `assessments.ea_rubric_total INTEGER NULL` — set by the host when the EA finishes Q11 (from `result.derived.ea_rubric_total`). NULL for every non-Q11 row.
- `assessments.hq_rubric_total INTEGER NULL` — set later by the HQ NextJS dashboard when HQ marks the paper. NULL for every non-Q11 row.
- `assessment_items` rows: 4 by the EA on completion, +4 by HQ later. Each row carries **scorer-prefixed `item_key`** — EA rows use `item_key ∈ {'ea:meaning_making', 'ea:spelling', 'ea:length', 'ea:vocabulary'}` and HQ rows use `item_key ∈ {'hq:meaning_making', 'hq:spelling', 'hq:length', 'hq:vocabulary'}`, `is_correct = false` on every Q11 row (not the carrier here), `metadata = { score: 0–4, scorer: 'ea' | 'hq', anchor_text?: string }`. The `ea:` / `hq:` prefix prevents collision with the existing `deterministicItemId` helper (see ADR-0004). A fully-calibrated Q11 result has **8 distinct `assessment_items` rows**.
- **EA-vs-HQ delta is computed at query time** (`hq_rubric_total - ea_rubric_total` for totals; equivalent joins through `assessment_items` for per-dimension drift) — not stored.
- **Why hybrid normalized**: (a) the architecture doc explicitly anticipated rubric dimensions living in `assessment_items.metadata`; (b) the totals on `assessments` make the top-level "did EAs and HQ agree?" query a one-column subtraction; (c) HQ inserts *new* rows rather than updating EA rows, avoiding any write conflict with already-synced EA data; (d) only 2 new columns on `assessments`, both NULL for every non-Q11 row — minimal table bloat.
- **See [`docs/adr/0004-q11-calibration-column-shape.md`](../docs/adr/0004-q11-calibration-column-shape.md)** for the full decision record including the considered alternatives (denormalized 10-column shape, JSONB pair, late-HQ-update-EA-rows pattern, dedicated `assessment_rubric_scores` table) and the reasoning for rejecting each.

**Photo capture for Q11:**

Q11 opts into Pattern D's end-of-Run photo capture queue via the Battery config (the `photo_eligible_questions` array in `wela_plus_full` includes `wela_plus_story_writing`). The photo lane uses Pattern D's standard compression (~1080px longest edge / ~70% JPEG / ~200KB target). The "Add another" affordance handles multi-page stories. `battery_run_artifacts.question_code = 'wela_plus_story_writing'`.

Q11 is pedagogically the *highest-value* paper artifact in the Battery — HQ rubric-marks from this exact photo for the calibration experiment. If field testing shows HQ cannot rubric-score reliably from standard-quality photos, a `photoQualityPreset` prop / Battery-config field can be added in v2 as a non-breaking API extension. v1 ships the simple uniform spec.

**Out-of-scope for v1 (deferred):**

- **Per-Question photo quality presets** — explicitly deferred to v2 pending field-testing evidence.
- **Multiple-picture-choice at administration time** (EA picks which scene the child writes about) — itemSet supports one picture per Run; choice-at-time is a future enhancement.
- **Direct /16 entry** (EA types a total without scoring per-dimension) — would skip the per-dimension data that's the whole point of the calibration experiment.
- **EA-vs-HQ delta stored as a column** — computed at query time; revisit if analytics performance is a real problem.

### Open-source package shape (rough sketch — to be detailed in the OSS release plan)

- **Package name:** TBD (proposed: `@masinyusane/assessment-questions` or similar).
- **What ships:** all Question components, all Battery definitions, all bundled Item Sets, the `useToggleMark` and similar internal hooks, the shared design tokens (`childReadingFontSize` etc.), the `result` shape type, the `question_code @ question_version` registry, and the `stopped_reason` enum.
- **What does NOT ship:** SQLite/Supabase wiring, RLS, photo sync, `battery_runs` / `battery_run_artifacts` table definitions, Run lifecycle UI, child/EA/programme integration, RLS policies.
- **Supplemental setup guide:** a Markdown document published with the package describing the host's responsibilities — required tables, suggested RLS shape, suggested sync wiring, photo storage. Includes an LLM-agent prompt template that a new adopter pastes into Claude Code (or similar) to scaffold their backend.

## Testing Decisions

A good test in this codebase exercises a module's **external behaviour** — its public callbacks, its emitted results, its rendered output — not its internal state, queries, or render-tree details. Tests must survive refactor inside the module.

### Modules to test

- **Question components (every one of them)**, in isolation, using a story-style harness that injects `itemSet` and asserts on the `onComplete` result shape and item-level `onItemMarked` calls. No host, no DB, no Supabase. Prior art: existing `__tests__/AssessmentResultsScreen.test.js` for the rendering side; new tests required for the result-shape side.
- **The `useToggleMark` hook**, in isolation, to confirm the tap-correct cycle and the unmark-on-second-tap behaviour.
- **Battery definition evaluation** — the function that takes a Battery config + an in-progress set of Question results and returns "next Question" + "Questions auto-skipped by prerequisite gates." This is the **deep module** of the Battery layer; its interface is small and stable; its implementation can grow without rippling outward.
- **Battery Run repository writes** — using a file-backed SQLite integration suite (consistent with the existing pattern under `__tests__/`), confirming that `onComplete` from a Question produces exactly one `assessments` row + N `assessment_items` rows + the appropriate `sync_outbox` entries, all atomic per Question.
- **Sync outbox ordering** — confirming that for any Run, `battery_runs` is enqueued before its `assessments` rows, which are enqueued before their `assessment_items` rows, which are enqueued before `battery_run_artifacts` photos.

Tests to be written for: every Question component shipped, the deep module above, the new repository methods, and the outbox ordering. EGRA tests stay as-is.

## Out of Scope

- **Migration of existing EGRA Letter Sound and Word Reading to the new OSS Question components.** Existing EGRA capture continues to work; the migration is a follow-up after WelaPLUS is field-proven.
- **The HQ NextJS dashboard.** Read-side consumption of Run / Question result data lives in a separate project and PRD.
- **Auto-grouping algorithms based on Battery Run scores.** Per `CONTEXT.md`, auto-grouping is "deferred and unbundled" and not part of this PRD.
- **Per-child historical reporting across academic years.** Build now; report later.
- **Programme-specific Battery selection by the EA at Run-start.** v1 uses one canonical Battery per Programme; multi-Battery selection is a future hook.
- **Numeracy assessments.** WelaPLUS is literacy-only. A future Numeracy battery would use the same scaffolding but is not designed here.

## Further Notes

- **Question 11 (Story Writing) is a calibration experiment.** It ships with EA-rubric scoring in-app *and* HQ rubric scoring on paper. The `assessments` row carries both an `ea_rubric_total` and an optional `hq_rubric_total` (both /16, both NULL for non-Q11 rows). Per-dimension scores live as `assessment_items` rows tagged with `metadata.scorer ∈ {'ea','hq'}` — 4 rows by the EA on Run completion, 4 more by HQ when paper marking lands via the future NextJS dashboard, 8 rows at full calibration. Masi product retains the option to compare EA-vs-HQ drift and decide whether holistic-rubric Questions are safe to fully move into the app long-term.
- **Stop rules are soft.** Questions with prescribed stop rules expose the rule as `instructions` copy; the EA decides. No code enforcement.
- **Prerequisite gate thresholds are TBD pedagogy input.** Letter Sounds → Word Reading / Sentence Reading / Oral Reading Fluency cascade is the initial gating; exact thresholds are not yet supplied.
- **Item sets are TBD content input.** Masi will supply WelaPLUS letter sets, word lists, sentences, passages, and rubrics in both English and isiXhosa before any field deployment.
- **The mobile target is mostly Android tablets specifically** (Codex review finding 16). Masi's field deployment is overwhelmingly Android tablets purchased for the field staff; iPad is not currently in scope. The existing `app.config.js` is portrait-only and sets `ios.supportsTablet = false`, which is consistent with Android-tablet-first. Phone-fallback behaviour is supported but not the primary design target. If iPad support becomes a future requirement, `app.config.js` must be updated, `ios.supportsTablet` flipped to `true`, and the Question layouts re-tested on iPad dimensions (Pattern A's grid pagination, Pattern E's chip grid, and the photo-capture intro screens are the load-bearing layouts).

---

## Implementation handoff

The PRD design is complete. This section is the handoff to implementation — it lists what was locked in design, what was deferred to implementation, and what is off-team work outside the PRD surface.

### Codex review revisions (2026-05-29 — first pass)

A Codex adversarial review (`documentation/archive/wela-plus-battery-prd-2026-review.md`) identified 18 findings before implementation begins. All are addressed in this revision:

| # | Finding | Section addressing it |
|---|---|---|
| 1 | New rows must satisfy existing required columns (`assessment_type`, `assessment_date`, `assessment_purpose`, `assessment_window_id`) | *Masi storage mapping (OSS result → rows)* — row-by-row mapping table |
| 2 | Skipped Question storage shape undefined | *Masi storage mapping* — skipped row spec: `score = NULL`, `total_items = NULL`, no `assessment_items` rows |
| 3 | EGRA backfill missed mobile-created rows without `assessment_tool_id` | *EGRA backfill* — fallback chain via `assessment_type` for `letter_egra` / `letter_sounds` / `egra_letter_sounds` → canonical `egra_letter_sound` |
| 4 | Q11 EA + HQ `assessment_items` would collide under existing deterministic-ID helper | ADR-0004 amended; PRD Pattern E + three-level schema sections updated; **`item_key` carries `ea:` / `hq:` prefix** |
| 5 | `battery_runs` RLS too weak | *RLS policies* — three-check pattern (owner + active `child_ea_assignments` + active `staff_programme_assignments`) |
| 6 | `storage_path` integrity | *New table: battery_run_artifacts* — CHECK constraint enforces `battery-run-photos/{run_id}/{id}.jpg` shape |
| 7 | HQ calibration write path undefined | *HQ calibration write path* — three options (service-role, RPC, dedicated role) with RPC recommended; final lock deferred to HQ NextJS dashboard PRD |
| 8 | Result-to-storage contract incomplete | *Masi storage mapping*; new nullable columns `assessments.language`, `assessments.duration_ms`; new repository method `saveQuestionResult` alongside legacy `saveAssessment` |
| 9 | Timed Questions need attempted/not-reached signal | OSS contract `result.derived.last_attempted_position` for Q1, Q6, Q8 |
| 10 | Photo sync needs concrete local queue/state model | *Photo upload queue (local-only state model)* — new SQLite table with status / retry / cellular-override columns; dependencies (`expo-image-picker`, `expo-image-manipulator`, NetInfo); camera permissions for iOS + Android |
| 11 | `battery_run_artifacts.question_code` nullability contradiction | `documentation/learning/assessment_battery_architecture.md` updated to NOT NULL with per-Question constraint explanation |
| 12 | `programmes.default_battery_code` needs local mirror + version pinning | `default_battery_version` added; local SQLite mirror + `referenceDataRepository` allowlist updates documented |
| 13 | One-result-per-Question-per-Run idempotency missing | Partial unique index `(battery_run_id, question_code) WHERE battery_run_id IS NOT NULL` |
| 14 | `stopped_reason` enum inconsistent | Canonical 10-value enum unified across OSS result shape, SQL CHECK, and user stories; adds `stop_rule` and `skipped_tired` |
| 15 | "No risk" wording too confident for sync/RLS | Risk table now distinguishes schema risk (low) from integration risk (often high) |
| 16 | App not configured for tablets | *Further Notes* — explicit "Android tablets specifically" with iPad support as future work |
| 17 | OSS package pnpm + peer deps + release safety | *OSS package engineering policies* — pnpm + `minimumReleaseAge: 1440`; peer deps listed; CI gates spec'd; leadership sign-off gates *public* release only |
| 18 | Field-test success criteria too vague | *Field-testing plan* — explicit widen/hold/rollback decision matrix with 5 measurable thresholds |

### Codex review revisions (2026-05-29 — second pass)

A follow-up Codex pass after the first-pass fixes surfaced 8 remaining contradictions and underspecified surfaces (3 high-priority, 5 medium-priority). All addressed:

| # | Finding | Severity | Where it was fixed |
|---|---|---|---|
| 1 | OSS package peer deps included camera / compression / NetInfo — these are host concerns | High | *OSS package engineering policies* — peer deps narrowed to `react`/`react-native`; camera/compression/NetInfo are Masi-app integration deps |
| 2a | Photo lifecycle contradiction — PRD said completed Runs cannot add photos but RLS allowed inserts on status ∈ ('in_progress', 'completed') | High | *RLS policies* — `battery_run_artifacts_insert_via_writable_run` now requires `r.status = 'in_progress'` only |
| 2b | `local_path` duplicated between `battery_run_artifacts` (claimed device-only column) and `photo_upload_queue.local_path` (canonical) | High | *Photo sync architecture* + *Photo upload queue* + CONTEXT.md + agent-context — single source of truth is `photo_upload_queue.local_path`; `battery_run_artifacts` carries no local path |
| 3 | `item_key` missing from OSS items contract but storage mapping required it with `ea:` / `hq:` prefixes | High | *The OSS Question contract* — `item_key?` added as first-class field on each item; Q11 example updated; storage mapping reads `result.items[i].item_key`; contract test gates require it for every WelaPLUS Question |
| 4 | RLS SQL sketches used bare `auth.uid()` and missing `WITH CHECK` — diverged from project convention | Medium | *RLS policies* — rewritten using `(select auth.uid())`, `to authenticated`, and explicit `USING` + `WITH CHECK` per migration `20260521120147_masi_rls_advisor_cleanup.sql` style |
| 5 | Stale doc contradictions — PRD:92 said `question_code` nullable; CONTEXT.md said `ea_score`/`head_office_score`; CONTEXT.md listed `onStopRuleTriggered` callback; agent-context said "60% complete" | Medium | PRD `battery_run_artifacts` summary corrected to NOT NULL; CONTEXT.md Q11 updated to `ea_rubric_total`/`hq_rubric_total`; OSS contract bullet in CONTEXT.md dropped `onStopRuleTriggered` (stop rules are soft via `instructions` prop); agent-context status line updated to "design-complete + Codex-reviewed twice" |
| 6 | NetInfo vs expo-network inconsistency — PRD photo queue chose NetInfo but PRD/CONTEXT/agent-context elsewhere still referenced expo-network | Medium | All three docs unified on `@react-native-community/netinfo` (already in `package.json`) |
| 7 | Support export claim — PRD said `debugDump.js` includes `photo_upload_queue` state but it does not | Medium | *Photo upload queue* — explicit `getPhotoUploadQueueState` + `getPhotoUploadQueueSummary` diff specified for `src/db/debugDump.js` |
| 8 | Architecture doc said new EGRA captures get a Run wrapper while PRD said EGRA stays on legacy `saveAssessment` | Medium | `documentation/learning/assessment_battery_architecture.md` reframed — Run-wrapped EGRA is the eventual end state, deferred per the WelaPLUS PRD's *Out of Scope*; `LetterAssessmentScreen` stays on `saveAssessment` for now |

### Codex review revisions (2026-05-29 — third pass)

A third Codex pass focused on the mobile/local sync surface and the deferred Storage RLS. 5 findings — 2 high-priority, 2 medium-priority, 1 low-priority. All addressed:

| # | Finding | Severity | Where it was fixed |
|---|---|---|---|
| 1 | Artifact INSERT RLS only checked Run ownership + status, not the three-check producer pattern; a revoked EA could still write artifacts | High | *RLS policies* — `battery_run_artifacts_insert_via_writable_run` rewritten to re-check active `child_ea_assignments` and active `staff_programme_assignments`, mirroring the `battery_runs` INSERT shape |
| 2 | Run lifecycle was ambiguous — "completed when all Questions decided" suggested automatic transition, but artifact INSERT required `in_progress` | High | *Run lifecycle and navigation* — explicit two-step lifecycle documented: all-Questions-decided → eligible to finalize (still `in_progress`); EA-tapped "Finalize Run" is the explicit transition to `completed`; photo capture happens in the eligible-to-finalize window |
| 3 | PRD spec'd Postgres tables/columns but was silent on local SQLite mirror — outbox can't enqueue rows for tables that don't exist locally | Medium | *Local SQLite mirror — tables, sync columns, push order, allowlists* — full subsection added with concrete `src/db/migrations.js` table SQL, additive ALTERs on existing `assessments` / `programmes`, `SERVER_COLUMNS` entries, `PUSH_ORDER` + `TABLE_DEPENDENCIES` updates, `referenceDataRepository` allowlist, and `CURRENT_SCHEMA_VERSION` bump |
| 4 | Storage bucket RLS left as a comment "full SQL deferred to implementation" | Medium | *Storage bucket RLS* — four concrete policies written: SELECT (owner + child-history), INSERT (three-check via `storage.foldername()`), DELETE (owner). UPDATE intentionally absent (photos are write-once from EA side). Layered-defence note added |
| 5 | Three stale doc crumbs: high-level Battery selection bullets mentioned only `default_battery_code`; "still in *To Be Continued*" note; Settings sheet count source named the wrong table | Low | (5a) Battery selection bullets in PRD, agent-context, and architecture doc all updated to mention both `default_battery_code` and `default_battery_version`. (5b) Stale "in *To Be Continued*" note rewritten to point at the now-spec'd Storage subsections. (5c) Settings count source corrected to `photo_upload_queue.status in ('pending', 'in_flight', 'failed_retryable')` |

### Codex review revisions (2026-05-29 — fourth pass)

A fourth Codex pass focused on the Storage RLS spec the third pass had just produced — catching that I had introduced a Supabase Storage misconception and a contradiction with the "write-once" claim. 4 findings — 2 high-priority, 1 medium-priority, 1 low-priority. All addressed:

| # | Finding | Severity | Where it was fixed |
|---|---|---|---|
| 1 | Storage path parsing used `storage.foldername(name)[2]` and assumed bucket name is part of the path — but Supabase stores bucket in `storage.objects.bucket_id` separately, and `name` is the path INSIDE the bucket | High | *Storage bucket RLS* — all four parse sites changed to `(storage.foldername(name))[1]`; `battery_run_artifacts.storage_path` CHECK constraint changed from `'battery-run-photos/' \|\| ... \|\| '.jpg'` to `battery_run_id::text \|\| '/' \|\| id::text \|\| '.jpg'` (no bucket prefix); column-description bullets in PRD section 1 and *Photo sync* prose updated to match |
| 2 | Authenticated DELETE policy contradicted the "write-once + immutable" claim — an EA could destroy audit evidence after Run finalization | High | `battery_run_photos_delete_owner` policy removed entirely; Storage RLS now ships SELECT + INSERT only. Cleanup is documented as a future service-role orphan job (out of scope for this PRD); layered-defence note updated to call out "No authenticated DELETE — audit trail survives a compromised EA token" |
| 3 | `photo_upload_queue.artifact_id` was declared `text primary key` with a comment claiming FK to `battery_run_artifacts.id`, but no actual FK was declared | Medium | `references battery_run_artifacts(id) on delete cascade` added — queue cannot outlive its artifact |
| 4 | One stale agent-context crumb: `docs/agent-context/wela-assessment-component-build.md:210` referenced "PRD's *Out of Scope* and *To Be Continued* sections" — but *To Be Continued* sections were closed when the PRD reached design-complete | Low | Updated to "*Out of Scope* section and the *Out-of-scope for v1* bullets inside each Pattern"; *Implementation handoff* called out as the on-team-vs-off-team source of truth |

### What's in this PRD (locked)

- Vocabulary (Question / Battery / Run / Window / Progress check / Marking mode) — `CONTEXT.md`
- Three-level schema shape — `documentation/learning/assessment_battery_architecture.md`
- All six capture Patterns (A, B, C, D, E, F) — sections above
- ADR-0004 Q11 calibration column shape — `docs/adr/0004-q11-calibration-column-shape.md`
- OSS release plan — repo location, package name, licensing, layout (section 1 below)
- Migrations and rollout — additive SQL spec, RLS shape, sync ordering, EGRA backfill, phased rollout (section 2 below)
- Settings UX — Profile screen Settings section with two rows (section 3 below)

### What was deferred (implementation work, not design)

- **Actual `.sql` migration files** under `supabase/migrations/`. The PRD specifies the shape; implementation produces the files via `/writing-plans` followed by `/executing-plans`. Filenames follow the `YYYYMMDDHHMMSS_description.sql` convention against the `masi-app-sqlite` backend.
- **Safe integration and publication of the existing Question island.** The 11 components, hooks,
  item-set stubs, types, and tests exist on `feature/wela-plus-battery-merge`, but they require a
  current-main reconciliation, design/chrome review, typecheck gate, package-boundary decision,
  documentation, and public release.
- **The Run lifecycle UI in the Masi app**: Battery overview screen, Run-start primary entry from Child profile, secondary entry from Assessments tab, Run-completion screen with photo-capture queue, score summary.
- **The Settings screen implementation** (the two rows described in section 3 below).
- **HQ NextJS dashboard** — its own PRD; consumes the Battery Run data this PRD produces.
- **`documentation/rls-sync-contract-map.md` update** — must add `battery_runs` and `battery_run_artifacts` rows with producer fields, SELECT/INSERT shapes, outbox ordering, and verification tests, per the CLAUDE.md rule that RLS, repository producers, Supabase payload columns, and outbox ordering are one contract.

### What is off-team (pedagogy content, blocking field deployment but outside the PRD surface)

- Item sets bilingual (English + isiXhosa) for every Question: Q1 letter sets, Q3 first-sound prompts, Q4 phoneme blend prompts, Q5 picture cards + expected letters, Q6 word lists, Q7 sentences, Q8 oral-reading-fluency passages, Q9 CVC words, Q10 dictation sentences, Q11 rubric anchor text + picture
- Stop-rule reminder copy for Questions 1, 6, and any other timed/stop-ruled Question
- Prerequisite gate thresholds (Q1 minimum below which Q6/Q7/Q8 auto-skip)
- Durations for timed Questions (Q6 Word Reading, Q8 Read Passage)
- Story script + acceptable answers for Q2 (Pattern F is designed; the content is pedagogy work)
- Picture cards + rubric anchors for Q11 (Pattern E is designed; the content is pedagogy work)
- **Question 5 picture card image assets** — once Pattern D ships, this is a real OSS-blocker for the package's "install and run" experience

### Suggested handoff sequence

1. **Pedagogy team begins item-set authoring** in parallel — bilingual content, picture asset commissioning, rubric anchor wording. No engineering dependency.
2. **Reconcile and review `feature/wela-plus-battery-merge`** against current `main`; verify the
   identity rekey remains defused and complete the design/chrome/typecheck pass.
3. **Write and execute the host schema plan** against `masi-app-sqlite`, including EGRA backfill,
   SQLite mirror, RLS/sync contract update, release tests, and physical smoke.
4. **Extract or publish the reviewed Question island** as `@masinyusane/assessment-questions@0.1.0`
   with the locked package docs and licensing.
5. **Masi app integration**: Run lifecycle UI, Settings screen, photo capture queue. EAS preview build for stakeholder testing. Production build pinned to OSS package `0.1.x`.
6. **Field test Window 1 (Baseline 2026)**: 50 Runs as the calibration data point per section 2's field-testing plan. Iterate on photo quality, RLS surprises, sync failures.
7. **Promote OSS package to `1.0.0`** after one Window of clean field data.

### Reference of what was locked, in suggested implementation order:

### 1. OSS release plan (locked)

**Repo location.** The package ships from a **separate dedicated GitHub repo** at `masinyusane/assessment-questions` (new repo, sibling to `masinyusane/masi-app`). External NGOs can clone, fix, and PR against the package without touching the Masi app. The package has its own issue tracker, releases, CI, and `CHANGELOG.md`. The Masi app depends on the package via npm. Rejected: monorepo workspace (would force external contributors to clone the whole Masi app), in-tree under `src/oss/` (would make the OSS pitch hollow with no install path).

**Package name and npm strategy.** Published to npm as **`@masinyusane/assessment-questions`** with scoped-public access (`npm publish --access public`). Semver starts at **`0.1.0`** to honestly signal "in field testing, expect minor breaking changes during the 2026 Baseline / Midline Windows." Promote to `1.0.0` after one full Assessment Window of field-proven use with no breaking schema changes. Release cadence is ad-hoc until 1.0, quarterly thereafter.

**Licensing — two-tier (subject to Masi leadership ratification).**

- **Code:** MIT licence. Standard for OSS UI component libraries, maximally permissive for adopters, no friction for derivative work.
- **Content:** Creative Commons Attribution 4.0 (CC-BY 4.0). The bundled item sets (letter lists, word lists, sentences, story scripts, picture cards, rubric anchors) ship under CC-BY so adopters can use, remix, and redistribute them as long as Masi (and where applicable, The Learning Trust) is credited. The repo carries `LICENSE` for code and `LICENSE-CONTENT` for content, with the boundary documented in `README.md`. CC-BY 4.0 was chosen over CC-BY-NC because Masi's mission is reach over restriction, and OSI-aligned content licences avoid the "is this really open?" friction that NC variants face. **This decision requires Masi leadership sign-off before the first public release** — it sets a precedent for every future Masi-developed assessment content the package bundles.

**Repo layout (committed shape):**

```
masinyusane/assessment-questions/
├── LICENSE                         MIT, for code
├── LICENSE-CONTENT                 CC-BY 4.0, for bundled item sets
├── README.md                       quick install + minimal example
├── CHANGELOG.md
├── package.json
├── tsconfig.json
├── docs/
│   ├── setup-guide.md              deep adopter walkthrough
│   ├── llm-prompt-template.md      paste-into-Claude-Code template
│   └── content-licensing.md        which assets are CC-BY, attribution requirements
└── src/
    ├── questions/                  one folder per Question component
    │   ├── LetterSoundsQuestion/
    │   ├── ListenAndAnswerStoryQuestion/
    │   ├── ListenFirstSoundQuestion/
    │   ├── ListenPhonemeBlendQuestion/
    │   ├── LetterWritingFromPicturesQuestion/
    │   ├── ReadWordsQuestion/
    │   ├── ReadSentencesQuestion/
    │   ├── ReadPassageQuestion/
    │   ├── WriteCvcsQuestion/
    │   ├── WriteSentencesFromDictationQuestion/
    │   └── StoryWritingRubricQuestion/
    ├── hooks/                      internal hooks (useToggleMark, etc.)
    ├── itemsets/                   bundled WelaPLUS content (CC-BY tagged per file)
    ├── batteries/                  Battery definitions (wela_plus_full, egra_full)
    └── types/                      shared TypeScript types (Result, ItemSet, BatteryConfig)
```

**OSS package engineering policies (Codex review finding 17).** Because the new `masinyusane/assessment-questions` repo starts clean — unburdened by the npm/`package-lock.json` choice frozen into the existing Masi app — it adopts the project's preferred policies as written in CLAUDE.md's *Cybersecurity* section, rather than inheriting Masi-app's transitional posture.

- **Package manager: pnpm**, with `minimumReleaseAge: 1440` (24-hour quarantine for newly-published versions). This is the explicit CLAUDE.md recommendation for new JavaScript work; the Masi app stays on npm only because migration is a separate task there. The new repo has no such legacy.
- **Peer dependencies** (declared in `package.json`, not bundled): `react`, `react-native` only. The OSS package's Question components are **pure capture components** — they do not touch the camera, the network, or any storage client (see CONTEXT.md's *OSS Question contract* bullet). Camera, compression, and connection detection are host-app concerns: `expo-image-picker`, `expo-image-manipulator`, and `@react-native-community/netinfo` are added to the *Masi app's* `package.json` for the photo capture queue (see PRD section 2's *Photo upload queue* subsection), not to the OSS package's peer-dependency list. An external adopter that does not need photo capture (e.g. a Battery without Pattern D Questions) is not forced to install those three. Codex review (second pass) finding 1.
- **Direct dependencies** (bundled in the package): TypeScript types, internal hooks (`useToggleMark`), design-token resolver, the bundled item sets and picture assets.
- **CI release gates** (run on every PR + on every `npm publish`):
  1. **Code licence check** — every source file declares MIT in its header or the repo's `LICENSE` file covers it; no GPL-tainted dependencies.
  2. **Content licence check** — every file under `src/itemsets/` and every binary asset carries a content licence header tagged `CC-BY-4.0` with attribution string; `docs/content-licensing.md` is up to date with the asset inventory.
  3. **TypeScript type-check** — `tsc --noEmit` passes with zero errors.
  4. **Question contract test** — every Question component conforms to the OSS result shape (see *Implementation Decisions* above): emits `question_code`, `question_version`, `item_set_id`, `language`, `duration_ms`, `stopped_reason`, `items`, and `derived` (with `last_attempted_position` populated for timed Questions).
  5. **No host concerns leak** — automated grep / AST check confirms no Question component imports `react-native-async-storage`, `supabase`, or anything else Masi-specific.
- **Leadership sign-off as release gate:** ratification of CC-BY 4.0 content licensing is a **hard gate for *public* npm release** (`npm publish --access public`) and the GitHub repo going public. It is **not** a gate for Masi's private integration — the Masi app can depend on the package while it lives in a private GitHub repo with placeholder/private content during early field testing. This separation lets the field-testing schedule run independently of the legal review schedule.
- **Versioning policy:** strict semver from `0.1.0` onward. Breaking changes — to the Question result shape, the OSS contract props, the bundled item-set shape, or the dimension code list for Q11 — bump the MINOR version pre-1.0 and the MAJOR version post-1.0. Non-breaking additions (new Questions, new optional props, new bundled item sets) bump PATCH pre-1.0 and MINOR post-1.0.
- **Breaking-change cooldown:** between `0.1.0` and `1.0.0`, breaking changes are allowed but should be batched and timed for the gap *between* Assessment Windows so a Window opens against a stable package version.

**Supplemental setup guide.** `README.md` is the entry point — install command + a 20-line minimal example showing one Question rendering. `docs/setup-guide.md` is the deep walkthrough an adopter uses to scaffold their backend: required tables (`battery_runs`, `assessments`, `assessment_items`, `battery_run_artifacts`); suggested RLS shape; sync outbox wiring; photo storage bucket setup. `docs/llm-prompt-template.md` is the Claude-Code-ready prompt that an adopter pastes into an agent to scaffold the above against their stack — Masi ships a stub template; the OSS team fills in the concrete prompt content during the build phase (out of scope for this PRD).

**What the host (Masi or any other adopter) owns, not the package:** the `battery_runs` table and its sync, the `battery_run_artifacts` row writes, the photo capture flow plumbing, RLS policies, photo upload, programme-to-Battery mapping, Run navigation UX, Settings UX, the EA / child / programme identity layer. The boundary is documented in `docs/setup-guide.md`.

### 2. Migrations and rollout (specified)

All schema changes are **additive and forward-compatible** with older app builds in the field — required by the deployment-status rule that "multiple versions are simultaneously deployed across iOS and Android devices." Each new column is nullable; each new table is independent of any existing read path. The actual `.sql` migration files are produced in a follow-up implementation pass (`/writing-plans` then `/executing-plans`); this section specifies the *shape*.

#### Overview of changes

| Change | Type | Schema risk | Integration risk |
|---|---|---|---|
| Create `battery_runs` table | New table | None — additive | **High — sync/RLS:** new producer table requiring three-check RLS (owner + active child + active programme), `sync_outbox` ordering integration, repository producer fields, and full update to `documentation/rls-sync-contract-map.md` |
| Create `battery_run_artifacts` table | New table | None — additive | **Medium — sync:** new outbox category for the row, plus the *separate* photo file upload lane; CHECK on `storage_path` shape; Storage bucket policy must be in sync with row RLS |
| Add 9 nullable columns to `assessments` | Additive columns | None — all NULL for old rows | **Medium — sync:** column allowlist updates in `assessmentsRepository`; new `saveQuestionResult` method coexisting with legacy `saveAssessment` until EGRA migrates; partial unique index `(battery_run_id, question_code)` |
| Add `default_battery_code` + `default_battery_version` to `programmes` | Additive columns | None — NULL for unconfigured programmes | **Medium — reference data:** must add to local SQLite `programmes` mirror AND to `referenceDataRepository`'s allowlist — without the local-side update, the columns never reach EA devices |
| Set `assessment_items.is_correct DEFAULT false` | Default change | Safe — existing rows unchanged | None |
| Create `battery-run-photos` Storage bucket | New bucket | None — additive | **Medium — Storage RLS:** policy SQL has different shape from row-level policies (filters on `bucket_id` and uses `storage.foldername(name)[1]` to extract the `{run_id}` segment, where `name` is the path inside the bucket); coordinated with the photo-file sync lane |
| Add RLS policies for new tables/bucket | Additive RLS | None — only grants access | **High:** RLS is the project's single contract per CLAUDE.md; must be proven against live sync before shipping |
| Backfill EGRA rows with `question_code` | Data backfill | Safe — only sets new column | **Low:** fallback chain via `assessment_type` for mobile rows; sanity-check query expected count = 0 unmapped |
| Add local-only `photo_upload_queue` SQLite table | New local table | None — local only | **Medium:** queue drain pass logic, NetInfo integration, one-shot cellular override semantics, retry/backoff |

#### New table: `battery_runs`

Parent row for one EA × one Battery × one child × one date. Created when the EA starts a Run from the Child profile or from the Assessments tab.

```sql
create table if not exists public.battery_runs (
  id                   uuid primary key default gen_random_uuid(),
  battery_code         text not null,             -- e.g. 'wela_plus_full'
  battery_version      text not null,             -- e.g. '2024.1'
  child_id             uuid not null references public.children(id) on delete cascade,
  user_id              uuid not null references public.users(id) on delete cascade,
  programme_id         uuid not null references public.programmes(id) on delete restrict,
  class_id             uuid references public.classes(id) on delete set null,
  assessment_window_id uuid references public.assessment_windows(id) on delete set null,
                                                  -- NULL = progress check (excluded from window roll-ups)
  language             text not null,             -- 'en' | 'xh'
  started_at           timestamptz not null,
  completed_at         timestamptz,
  status               text not null default 'in_progress'
                       check (status in ('in_progress', 'completed', 'abandoned')),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_battery_runs_child_id        on public.battery_runs(child_id);
create index idx_battery_runs_user_id         on public.battery_runs(user_id);
create index idx_battery_runs_programme_id    on public.battery_runs(programme_id);
create index idx_battery_runs_window_id       on public.battery_runs(assessment_window_id);
create index idx_battery_runs_status_started  on public.battery_runs(status, started_at desc);
```

Notes:
- `assessment_windows` table is assumed to exist already (or is created in the same migration if not — out of scope for this section).
- `child_id`/`user_id`/`programme_id` are denormalised onto descendant `assessments` rows; the parent `battery_runs` row carries them too for fast Run-list queries.
- `class_id` is captured at Run-start time so historical Runs do not lose context when the child's class changes.

#### New table: `battery_run_artifacts`

Photos of paper sheets for paper-marked Questions (Pattern D) and Q11 calibration photos (Pattern E).

```sql
create table if not exists public.battery_run_artifacts (
  id              uuid primary key default gen_random_uuid(),
  battery_run_id  uuid not null references public.battery_runs(id) on delete cascade,
  question_code   text not null,                 -- e.g. 'wela_plus_letter_writing'
                                                 -- NOT NULL per Pattern D's per-Question photo design
  storage_path    text not null,                 -- '{battery_run_id}/{id}.jpg' — path INSIDE
                                                  -- the bucket; bucket is in storage.objects.bucket_id
  captured_at     timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Integrity constraint: storage_path must exactly encode (battery_run_id, id) so
  -- a malicious or buggy client cannot point an artifact row at another object's path.
  -- Codex review finding 6; corrected per Codex fourth-pass finding 1 to match
  -- Supabase's data model (bucket name is NOT in storage.objects.name).
  constraint battery_run_artifacts_storage_path_shape check (
    storage_path = battery_run_id::text || '/' || id::text || '.jpg'
  )
);

create index idx_battery_run_artifacts_run_id        on public.battery_run_artifacts(battery_run_id);
create index idx_battery_run_artifacts_question      on public.battery_run_artifacts(battery_run_id, question_code);
```

Notes:
- The device-local file path (`${documentDirectory}battery_run_photos/...`) is **not** carried on `battery_run_artifacts` at all — neither synced nor mirrored. It lives only on the local-only `photo_upload_queue.local_path` column (see the *Photo upload queue* subsection below). Codex review (second pass) finding 2b — single source of truth for the local file.
- The CHECK constraint enforces the storage path shape at the row level. Storage RLS (below) additionally parses `storage.objects.name` and verifies ownership through `battery_runs`, so a row with a valid CHECK but without writable Run access still fails the Storage write.

#### Additive columns on `assessments`

```sql
alter table public.assessments
  add column if not exists battery_run_id   uuid references public.battery_runs(id) on delete cascade,
  add column if not exists question_code    text,
  add column if not exists question_version text,
  add column if not exists item_set_id      text,
  add column if not exists stopped_reason   text
    check (stopped_reason is null or stopped_reason in (
      -- Canonical 10-value enum unified across OSS result shape and SQL.
      -- Codex review finding 14.
      'completed', 'timer', 'ea_ended', 'stop_rule',
      'skipped_child_refused', 'skipped_tired', 'skipped_time', 'skipped_age',
      'skipped_prerequisite_unmet', 'skipped_other'
    )),
  add column if not exists ea_rubric_total  integer check (ea_rubric_total is null or (ea_rubric_total between 0 and 16)),
  add column if not exists hq_rubric_total  integer check (hq_rubric_total is null or (hq_rubric_total between 0 and 16));

create index if not exists idx_assessments_battery_run_id on public.assessments(battery_run_id);
create index if not exists idx_assessments_question_code  on public.assessments(question_code);

-- Idempotency: one assessments row per (battery_run_id, question_code).
-- Partial index — pre-Run-era EGRA rows (battery_run_id IS NULL) are untouched.
-- Protects against retry/restart bugs that would otherwise create duplicate Question rows
-- in the same Run. Codex review finding 13.
create unique index if not exists battery_run_question_unique
  on public.assessments(battery_run_id, question_code)
  where battery_run_id is not null;
```

Notes:
- The seven new columns plus two added below (`language`, `duration_ms`) are all **nullable**. Pre-Run-era EGRA rows keep `battery_run_id = NULL`; the EGRA backfill (below) sets `question_code` with a fallback chain.
- The `ea_rubric_total` / `hq_rubric_total` columns are Q11-specific and NULL for every non-Q11 row. The CHECK constraint enforces the 0–16 range. See ADR-0004.
- The `stopped_reason` CHECK is permissive (NULL allowed) for backwards compatibility with old EGRA rows that never had a stop reason. See the unified-enum subsection further below for the canonical value list.
- Re-running a Question inside the same Run is **not supported in v1** (per the PRD's Run-lifecycle decision: force-quit during a Question restarts the Question from scratch on re-entry; no mid-Question resume). The partial unique index aligns with that — the in-flight Question doesn't write a row until completion, so retry is naturally idempotent against the index.

Two additional nullable columns are also added to `assessments` to carry generic Question-result fields the OSS contract emits (Codex finding 8 — result-to-storage):

```sql
alter table public.assessments
  add column if not exists language    text,        -- e.g. 'en', 'xh'; from result.language
  add column if not exists duration_ms integer;     -- from result.duration_ms; useful for timed Questions (Q1, Q6, Q8)
```

Both NULL for pre-Run-era EGRA rows. The host writes them from the OSS result on every new Question.

#### Additive columns on `programmes`

```sql
alter table public.programmes
  add column if not exists default_battery_code    text,
  add column if not exists default_battery_version text;
```

- `default_battery_code` — e.g. `'wela_plus_full'`. NULL for unconfigured programmes (which simply do not surface a Battery Run option in v1).
- `default_battery_version` — e.g. `'2024.1'`. **Required when `default_battery_code` is set** (enforced at the application layer; not a DB CHECK because legacy rows have neither). Without explicit version pinning, the installed OSS package's `latest` Battery would silently change shape on package upgrades — a programme admin cannot then pin to a Battery version once the field is using it. Codex review finding 12.
- Masi admin sets the values per programme via Supabase Studio for now; eventually moves to a Masi admin UI.

**Local SQLite mirror + reference-data sync (Codex finding 12).** These columns are pulled-reference data — the local SQLite `programmes` table mirror must also gain `default_battery_code TEXT NULL` and `default_battery_version TEXT NULL`, and `src/db/repositories/referenceDataRepository.js`'s `programmes` column allowlist must include both. Without the local-mirror update, the columns exist on the server but never reach EA devices; the app would always fall back to the no-Battery-configured branch.

#### Default change on `assessment_items.is_correct`

Pattern A/B/C/D/F's unified marking convention requires `is_correct` to default to `false` (blank = wrong). This is a safe default change — only affects new rows.

```sql
alter table public.assessment_items
  alter column is_correct set default false;
```

Existing rows are unaffected. Existing EGRA `assessment_items` rows have `is_correct` already populated (TRUE/FALSE per item), so no backfill is needed.

#### Storage bucket: `battery-run-photos`

```sql
insert into storage.buckets (id, name, public)
values ('battery-run-photos', 'battery-run-photos', false)
on conflict (id) do nothing;
```

Bucket is **private** (not `public`). Photos are accessed via signed URLs or RLS-aware service calls.

#### RLS policies (shape only — concrete policies derive from `documentation/rls-sync-contract-map.md`)

Following the project's established RLS patterns (creator-SELECT for upsert visibility per migration `20260526151352_creator_select_upsert_visibility.sql`):

**Producer-only RLS is too weak (Codex review finding 5).** The existing assessment-write contract (`documentation/rls-sync-contract-map.md:22-28`, `:71-72`) requires three checks for every domain write: `user_id = auth.uid()`, active `child_ea_assignments` row for the target `child_id`, and active `staff_programme_assignments` row for the target `programme_id`. The new `battery_runs` parent table is the most-upstream domain row in the entire assessment graph — it cannot be weaker than the rows underneath it. The corrected RLS spec:

**SQL conventions used by this project (Codex review second-pass finding 4).** Existing RLS migrations (e.g. `supabase/migrations/20260521120147_masi_rls_advisor_cleanup.sql:97-104`) follow three conventions that the spec below honours so the `.sql` produced in `/writing-plans` doesn't diverge from project style:

1. `for <op> to authenticated` is set on **every** policy (the project does not write public-role policies).
2. `auth.uid()` is always wrapped as `(select auth.uid())` — Supabase's *Optimizing RLS* guidance to lift the `select` to a single per-statement evaluation rather than per-row.
3. UPDATE policies carry **both** `using (...)` (which rows are visible to update) **and** `with check (...)` (which post-update rows are still valid). Symmetric three-check on both sides for `battery_runs`.

```sql
-- battery_runs: producer (EA) full access requires (a) self-ownership,
-- (b) active child write-access, and (c) active programme assignment.
alter table public.battery_runs enable row level security;

-- INSERT — all three checks
create policy battery_runs_insert on public.battery_runs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.child_ea_assignments cea
       where cea.user_id    = (select auth.uid())
         and cea.child_id   = battery_runs.child_id
         and cea.unassigned_at is null
    )
    and exists (
      select 1 from public.staff_programme_assignments spa
       where spa.user_id      = (select auth.uid())
         and spa.programme_id = battery_runs.programme_id
         and spa.ended_at is null
    )
  );

-- UPDATE — same three-check shape (status transitions, notes edits).
-- Symmetric USING + WITH CHECK: the row must be writable both before and
-- after the update, so the EA cannot retarget a Run to a different
-- child / programme they don't have active access to.
create policy battery_runs_update on public.battery_runs
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.child_ea_assignments cea
       where cea.user_id    = (select auth.uid())
         and cea.child_id   = battery_runs.child_id
         and cea.unassigned_at is null
    )
    and exists (
      select 1 from public.staff_programme_assignments spa
       where spa.user_id      = (select auth.uid())
         and spa.programme_id = battery_runs.programme_id
         and spa.ended_at is null
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.child_ea_assignments cea
       where cea.user_id    = (select auth.uid())
         and cea.child_id   = battery_runs.child_id
         and cea.unassigned_at is null
    )
    and exists (
      select 1 from public.staff_programme_assignments spa
       where spa.user_id      = (select auth.uid())
         and spa.programme_id = battery_runs.programme_id
         and spa.ended_at is null
    )
  );

-- SELECT — owner full visibility (for upsert visibility and local list rendering)
create policy battery_runs_select_owner on public.battery_runs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- SELECT — broader child-history visibility for trusted field staff on the same child
-- (matches the existing "broad cross-programme reads for the same child" pattern from
--  the SQLite-cutover spec / `documentation/rls-sync-contract-map.md`).
create policy battery_runs_select_child_history on public.battery_runs
  for select to authenticated
  using (
    exists (
      select 1 from public.child_ea_assignments cea
       where cea.user_id  = (select auth.uid())
         and cea.child_id = battery_runs.child_id
         and cea.unassigned_at is null
    )
  );

-- (HQ programme-scoped read policy added once the HQ role mechanism is finalised in
--  the future HQ NextJS dashboard PRD. See "HQ calibration write path" subsection.)

-- battery_run_artifacts: writability matches the parent Run's writability, not visibility.
-- A "visible" Run (e.g. via child-history SELECT) is not necessarily writable; INSERT
-- requires going through the producer check on the parent Run.
alter table public.battery_run_artifacts enable row level security;

create policy battery_run_artifacts_select_via_run on public.battery_run_artifacts
  for select to authenticated
  using (
    exists (
      select 1 from public.battery_runs r
       where r.id      = battery_run_artifacts.battery_run_id
         and r.user_id = (select auth.uid())
    )
    or exists (
      -- Mirror the child-history SELECT for cross-programme visibility.
      select 1
        from public.battery_runs r
        join public.child_ea_assignments cea
          on cea.child_id = r.child_id
       where r.id            = battery_run_artifacts.battery_run_id
         and cea.user_id     = (select auth.uid())
         and cea.unassigned_at is null
    )
  );

create policy battery_run_artifacts_insert_via_writable_run on public.battery_run_artifacts
  for insert to authenticated
  with check (
    -- Re-run the same three-check producer pattern as battery_runs above.
    -- Codex review (third pass) finding 1 — earlier draft only checked Run
    -- ownership + status, which would let a revoked EA still write artifacts
    -- against their previously-owned in-flight Runs.
    exists (
      select 1
        from public.battery_runs r
        join public.child_ea_assignments cea
          on cea.child_id = r.child_id
        join public.staff_programme_assignments spa
          on spa.programme_id = r.programme_id
       where r.id              = battery_run_artifacts.battery_run_id
         and r.user_id          = (select auth.uid())
         and r.status           = 'in_progress'
                              -- Photos are only insertable while the Run is
                              -- still in_progress. 'completed' and 'abandoned'
                              -- both block late photo attachment, matching the
                              -- PRD's "Once the Run is finalized, no more
                              -- photos can be added through this flow" rule.
         and cea.user_id        = (select auth.uid())
         and cea.unassigned_at is null
         and spa.user_id        = (select auth.uid())
         and spa.ended_at      is null
    )
  );

-- Storage bucket RLS (Codex review third-pass finding 4 — was previously
-- left as a comment "deferred to implementation"; spec'd here so /writing-plans
-- can produce migrations directly. Codex fourth-pass finding 1 — corrected
-- path parsing per Supabase's actual data model).
--
-- Supabase Storage stores the bucket name in storage.objects.bucket_id, and
-- storage.objects.name is the path INSIDE the bucket. So for the path-inside
-- '{battery_run_id}/{id}.jpg':
--   storage.foldername(name) = ARRAY['{battery_run_id}']   (one element)
--   storage.foldername(name)[1] = '{battery_run_id}'        (the segment we want)
-- The previous draft used [2], which would only work if the bucket name were
-- part of the path — it is not.

create policy battery_run_photos_select_via_run on storage.objects
  for select to authenticated
  using (
    bucket_id = 'battery-run-photos'
    and (
      exists (
        select 1 from public.battery_runs r
         where r.id::text = (storage.foldername(storage.objects.name))[1]
           and r.user_id  = (select auth.uid())
      )
      or exists (
        -- Mirror the child-history SELECT for cross-programme visibility,
        -- matching battery_run_artifacts_select_via_run on the row.
        select 1
          from public.battery_runs r
          join public.child_ea_assignments cea
            on cea.child_id = r.child_id
         where r.id::text       = (storage.foldername(storage.objects.name))[1]
           and cea.user_id      = (select auth.uid())
           and cea.unassigned_at is null
      )
    )
  );

create policy battery_run_photos_insert_via_writable_run on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'battery-run-photos'
    -- Three-check producer pattern: owner + active child + active programme
    -- + Run still in_progress. Mirrors battery_run_artifacts INSERT exactly.
    and exists (
      select 1
        from public.battery_runs r
        join public.child_ea_assignments cea
          on cea.child_id = r.child_id
        join public.staff_programme_assignments spa
          on spa.programme_id = r.programme_id
       where r.id::text        = (storage.foldername(storage.objects.name))[1]
         and r.user_id           = (select auth.uid())
         and r.status            = 'in_progress'
         and cea.user_id         = (select auth.uid())
         and cea.unassigned_at  is null
         and spa.user_id         = (select auth.uid())
         and spa.ended_at       is null
    )
  );

-- Photos are write-once + immutable from the EA side. No UPDATE and no DELETE
-- policy is granted to the `authenticated` role:
--   * No UPDATE — once a photo is in Storage, it cannot be edited. To replace,
--     the EA captures a new artifact row (Pattern D's "Add another" affordance);
--     the old row's photo file becomes orphaned in Storage and is collected
--     later by a service-role cleanup job (out of scope for this PRD).
--   * No DELETE — the audit trail is the whole reason photos exist; granting
--     authenticated DELETE would let an EA destroy evidence after the Run is
--     finalized. Service-role cleanup with explicit orphan criteria (no
--     matching battery_run_artifacts row, or matching row whose parent Run is
--     'abandoned' and older than N days) is the only deletion path. Codex
--     review (fourth pass) finding 2.

-- Layered defence:
--   1. The CHECK constraint on battery_run_artifacts.storage_path enforces
--      the path shape at row-write time ('{run_id}/{id}.jpg').
--   2. The Storage INSERT policy above re-checks the same {run_id} against
--      battery_runs ownership at file-upload time.
--   3. The bucket is private (public = false), so signed URLs are the only
--      external access path for the HQ dashboard.
--   4. No authenticated DELETE — the photos themselves cannot be removed by
--      EAs once uploaded; the audit trail survives a compromised EA token.
-- Together these prevent cross-Run path-pointing attacks even if one layer
-- is misconfigured.
```

**The full RLS contract map is the operative source** — see `documentation/rls-sync-contract-map.md`. The implementation phase **must** update that document to include `battery_runs` and `battery_run_artifacts` rows with producer fields, SELECT/INSERT shapes, outbox ordering, and verification tests, per the CLAUDE.md rule that "RLS policies, repository producers, Supabase payload columns, and outbox ordering are one contract." This is a hard prerequisite for the migrations to ship.

#### HQ calibration write path (Codex review finding 7)

The PRD says HQ writes `hq_rubric_total` on the `assessments` row and four HQ-prefixed `assessment_items` rows weeks after the EA finishes Q11. The existing RLS for `assessments` UPDATE and `assessment_items` INSERT is EA-owner-scoped with active child write access — HQ would not satisfy that as an authenticated mobile-style user. The PRD must commit to *which* write surface HQ uses, because the columns are unusable until it does. Three options:

1. **Service-role backend** — the future HQ NextJS API layer authenticates HQ users via a separate identity tier, then writes through Supabase's service-role key which bypasses RLS entirely. The NextJS layer owns programme authorisation. *Pros:* simplest write code (raw inserts/updates); no new SQL surface. *Cons:* the security boundary moves to the NextJS layer with no DB enforcement; a bug in the NextJS API can write rows that violate domain invariants; audits cannot be easily proven via DB policy alone.

2. **RPC functions (Recommended)** — Postgres functions like `hq_record_q11_calibration(p_assessment_id uuid, p_ea_user_id uuid, p_hq_user_id uuid, p_meaning_making int, p_spelling int, p_length int, p_vocabulary int, p_total int)` declared `security definer`, called via PostgREST from the NextJS dashboard. The function performs the multi-row write (one `assessments` UPDATE + four `assessment_items` INSERTs) inside a transaction and runs its own programme-scope authorisation check. *Pros:* the write contract is codified in SQL and version-controlled in migrations; RLS stays the security model for everything else; the RPC is the documented HQ surface; auditable from the DB. *Cons:* multi-argument signature must evolve carefully; the function must be kept in sync with the row shape (the calibration-shape ADR-0004 columns).

3. **Dedicated HQ role + policy** — define an `hq_reviewer` Postgres role with HQ users assigned to it; add RLS policies on `assessments` and `assessment_items` that grant UPDATE/INSERT to that role with programme-scope checks. *Pros:* most-uniform RLS posture (everything goes through policies). *Cons:* the role mechanism does not exist today; assigning users to roles in Supabase Auth requires JIT claims or a separate role-management surface; the new policy must coexist with the EA-owner policies without cracking the existing contract.

**Recommended direction (to be inherited or revisited by the HQ NextJS dashboard PRD):** Option 2 — RPC functions. It keeps RLS as the security model for the EA-side write path (which has been carefully proven through the SQLite cutover), confines HQ-write surface to a single auditable Postgres function per write operation, and the function signature is the API contract the NextJS layer codes against. The exact RPC signature lives in the HQ dashboard PRD.

**Until the HQ PRD locks one of these options, the calibration columns are unusable.** The Masi app and the OSS package both work without it (Q11 EA-side scoring still ships and writes `ea_rubric_total`); the calibration *experiment* (the EA-vs-HQ comparison Q11 exists to support) is blocked on this decision.

#### Masi storage mapping — OSS result → rows (Codex review findings 1, 2, 8)

The OSS Question contract emits a result object; the **host** (Masi or any adopter) decides how that maps to its own storage rows. This subsection specifies the mapping for the Masi app — it is **not** part of the OSS contract.

The current `assessments` table has several pre-Run-era required columns (`assessment_type NOT NULL`, `assessment_date NOT NULL`) and constraint pairs (`assessment_purpose` + `assessment_window_id` for official-Window rows from the SQLite cutover). Any new WelaPLUS row must satisfy them in addition to setting the new Run-era columns. Without this spec, repository code would produce rows that violate existing NOT NULL/CHECK constraints on first contact with the live database.

**Per-Question result row (`assessments`):**

| Column | Source / value | Notes |
|---|---|---|
| `id` | New UUID | Generated by `gen_random_uuid()` or deterministic-ID helper |
| `user_id` | Host context (EA) | From the host's auth session |
| `child_id` | Host context | Set from `battery_runs.child_id` |
| `programme_id` | Host context | Set from `battery_runs.programme_id` |
| `battery_run_id` | Parent Run | The new FK column |
| `question_code` | `result.question_code` | New column |
| `question_version` | `result.question_version` | New column |
| `item_set_id` | `result.item_set_id` | New column |
| `stopped_reason` | `result.stopped_reason` | New column; canonical 10-value enum |
| `assessment_type` | `= question_code` | **Back-compat: writes the new code into the legacy required column.** Old consumers reading `assessment_type` see the new question codes; new consumers prefer `question_code`. Both columns agree per row going forward. |
| `assessment_date` | `battery_runs.completed_at::date` (fallback `started_at::date`) | Pre-Run-era column; `completed_at` is preferred but may be NULL on in-flight Questions |
| `assessment_tool_id` | NULL | Legacy FK; new Question rows do not populate it |
| `assessment_purpose` | Copied from `battery_runs` (`NULL` → `'progress_check'`; non-NULL `assessment_window_id` → `'official_window'`) | Pre-existing SQLite-cutover constraint requires it |
| `assessment_window_id` | Copied from `battery_runs.assessment_window_id` | NULL for progress checks |
| `language` | `result.language` | New column |
| `duration_ms` | `result.duration_ms` | New column |
| `score` | `result.derived.total_correct` for tap-marked Patterns; **`result.derived.ea_rubric_total` for Q11** | NULL for skipped Questions |
| `total_items` | `result.items.length` (or `result.derived.total_attempted`) | NULL for skipped Questions |
| `items_tested` | `result.derived` as JSON | Existing JSONB column — holds the full derived blob including `last_attempted_position` for timed Questions |
| `ea_rubric_total` | `result.derived.ea_rubric_total` (Q11 only) | NULL for every non-Q11 row |
| `hq_rubric_total` | Set later by the HQ write path (see HQ subsection above) | NULL on EA write |
| `notes` | NULL | Reserved for future EA-entered notes |
| `created_at` / `updated_at` | `now()` | Standard |

**Per-item rows (`assessment_items`):**

Written for every entry in `result.items`. Identity is `deterministicItemId(assessment_id, position, item_key, is_correct)` per the existing helper at `src/db/repositories/domainRepositoryUtils.js`.

| Column | Source / value | Notes |
|---|---|---|
| `id` | Deterministic | Per the existing helper |
| `assessment_id` | Parent `assessments.id` | |
| `item_key` | `result.items[i].item_key` (top-level field; Codex review second-pass finding 3). Fallback to `position`-derived only if absent. Q11 EA rows carry `ea:` prefix; Q11 HQ rows carry `hq:` prefix; all other Questions use bare codes (e.g. `'a'`, `'cat'`, `'q3.first_sound.item_1'`). | Q11-specific prefix per ADR-0004 |
| `prompt` | `result.items[i].prompt` | |
| `response` | `result.items[i].response` (or NULL) | |
| `is_correct` | `result.items[i].is_correct` (always `false` for Q11 rubric rows) | Default `false` |
| `position` | `result.items[i].position` | |
| `metadata` | `result.items[i].metadata` as JSON | For Q11 includes `{ score, scorer, anchor_text }` |
| `created_at` / `updated_at` | `now()` | Standard |

**Skipped Question row shape:**

A Question that is **skipped** (manual or auto-prerequisite-unmet) writes **one `assessments` row** with the following shape and **zero `assessment_items` rows**:

- `question_code` set
- `stopped_reason` set to one of `skipped_child_refused`, `skipped_tired`, `skipped_time`, `skipped_age`, `skipped_prerequisite_unmet`, `skipped_other`
- `score = NULL` (NULL is more honest than 0 — 0 falsely implies "child got 0 correct" when it means "we have no data")
- `total_items = NULL` (same reason)
- `items_tested = '{}'::jsonb` (empty derived; the OSS Question never emitted because it was skipped)
- `duration_ms = NULL`, `language = NULL` (no Question presented)
- `ea_rubric_total = NULL`, `hq_rubric_total = NULL`
- All other columns set per the standard mapping above

Run-completion logic treats a row with `stopped_reason` set and non-NULL `question_code` as "decided" — the Question has been resolved for this Run, even though no items were captured. The partial unique index `(battery_run_id, question_code)` prevents duplicate skip rows for the same Question within one Run.

**Auto-skipped (prerequisite-unmet) rows:** Same as skipped, with `stopped_reason = 'skipped_prerequisite_unmet'`. The host writes this row **before** presenting any UI for the Question — the EA never sees the skipped Question's intro screen. This row is the EA's record that the prerequisite gate fired.

**Q11 result write sequence (one-shot, EA finishes Q11):**

1. INSERT `assessments` row with `question_code = 'wela_plus_story_writing'`, `ea_rubric_total = result.derived.ea_rubric_total`, `hq_rubric_total = NULL`, plus all standard columns. `score = ea_rubric_total`, `total_items = 16` (max), `items_tested = result.derived`.
2. INSERT 4 `assessment_items` rows with `item_key` taken from each item's top-level field (`'ea:meaning_making'`, `'ea:spelling'`, `'ea:length'`, `'ea:vocabulary'`), `is_correct = false`, `metadata = { score, scorer: 'ea', anchor_text }`. The OSS Question component sets the `ea:`-prefixed `item_key` directly per the OSS contract above.

**Q11 HQ calibration write sequence (one-shot, weeks later via HQ NextJS dashboard):**

Per the HQ calibration write path subsection: an RPC `hq_record_q11_calibration(...)` performs the multi-row write inside one transaction:

1. UPDATE the existing `assessments` row to set `hq_rubric_total`.
2. INSERT 4 *new* `assessment_items` rows with `item_key ∈ {'hq:meaning_making', 'hq:spelling', 'hq:length', 'hq:vocabulary'}`, `metadata = { score, scorer: 'hq', anchor_text }`. These do **not** overwrite the EA's rows.

**New repository method `saveQuestionResult` alongside legacy `saveAssessment`:**

The current `src/db/repositories/assessmentsRepository.saveAssessment` is EGRA-specific — it writes a `__summary__` `assessment_items` row with EGRA-only summary fields, and it does not understand Battery Runs. A new method `saveQuestionResult(result, runContext)` lives alongside it:

```js
// New for WelaPLUS Battery Runs. Generic over Question shape.
saveQuestionResult({ result, batteryRun, child, ea, programme })
  → writes one assessments row + N assessment_items rows + sync_outbox entries,
    all in one SQLite transaction; satisfies the existing NOT NULL/CHECK
    constraints via the mapping table above.

// Existing for legacy EGRA capture in LetterAssessmentScreen.
saveAssessment(...)   // unchanged
```

The legacy `saveAssessment` stays as-is for back-compat with the existing EGRA capture path. New WelaPLUS Battery Runs use `saveQuestionResult`. Once WelaPLUS is field-proven and EGRA Letter Sound has been migrated to the OSS package (out of scope for this PRD), `saveAssessment` can be retired.

#### Local SQLite mirror — tables, sync columns, push order, allowlists (Codex review third-pass finding 3)

The PRD's Postgres section above defines what reaches the server; this subsection defines what the **local SQLite store** needs so the outbox can enqueue the rows in the first place. Without these additions, the Masi app could not write a Battery Run locally — there would be no local table to write to and no allowlist entry for the sync engine to extract payload columns from.

**New local tables** in `src/db/migrations.js` (next migration after schema version 1). Both use the project's standard `LOCAL_SYNC_COLUMNS` (`sync_status` / `last_sync_error` / `server_updated_at`).

```js
// In src/db/migrations.js — additions inside a new migration block (CURRENT_SCHEMA_VERSION bumped to 2):

create table if not exists battery_runs (
  id                   text primary key,
  battery_code         text not null,
  battery_version      text not null,
  child_id             text not null references children(id) on delete cascade,
  user_id              text not null,
  programme_id         text not null references programmes(id) on delete restrict,
  class_id             text references classes(id) on delete set null,
  assessment_window_id text references assessment_windows(id) on delete set null,
  language             text not null,
  started_at           text not null,
  completed_at         text,
  status               text not null default 'in_progress'
                       check (status in ('in_progress', 'completed', 'abandoned')),
  notes                text,
  created_at           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ${LOCAL_SYNC_COLUMNS}
);

create index if not exists idx_battery_runs_child_id        on battery_runs(child_id);
create index if not exists idx_battery_runs_status_started  on battery_runs(status, started_at desc);

create table if not exists battery_run_artifacts (
  id              text primary key,
  battery_run_id  text not null references battery_runs(id) on delete cascade,
  question_code   text not null,
  storage_path    text not null,
  captured_at     text not null,
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ${LOCAL_SYNC_COLUMNS}
  -- No local_path column here — single source of truth lives on
  -- photo_upload_queue.local_path per Codex second-pass finding 2b.
);

create index if not exists idx_battery_run_artifacts_run_id    on battery_run_artifacts(battery_run_id);
create index if not exists idx_battery_run_artifacts_question  on battery_run_artifacts(battery_run_id, question_code);
```

**Additive ALTERs on existing local tables** — same migration:

```js
-- assessments gains the new Battery-aware columns. SQLite ALTER TABLE only
-- supports ADD COLUMN, so each is a separate statement; all nullable.
alter table assessments add column battery_run_id   text references battery_runs(id) on delete cascade;
alter table assessments add column question_code    text;
alter table assessments add column question_version text;
alter table assessments add column item_set_id      text;
alter table assessments add column stopped_reason   text;
alter table assessments add column ea_rubric_total  integer;
alter table assessments add column hq_rubric_total  integer;
alter table assessments add column language         text;
alter table assessments add column duration_ms      integer;

create index if not exists idx_assessments_battery_run_id on assessments(battery_run_id);
create index if not exists idx_assessments_question_code  on assessments(question_code);

-- Partial unique index — matches the Postgres one.
create unique index if not exists battery_run_question_unique
  on assessments(battery_run_id, question_code)
  where battery_run_id is not null;

-- programmes gains the default-Battery reference columns.
alter table programmes add column default_battery_code    text;
alter table programmes add column default_battery_version text;

-- assessment_items.is_correct default flips (existing rows unaffected; new rows
-- default to 0 = false-equivalent in SQLite's integer-boolean convention).
-- Done at the SQL level on insert via the repository, not via ALTER (SQLite
-- ALTER cannot change a DEFAULT on an existing column); the repository's
-- buildAssessmentItemRow helper sets is_correct = 0 by default.
```

**`photo_upload_queue` is the third new local table** — defined in detail in the *Photo upload queue* subsection below; not repeated here. Local-only, never reaches the outbox.

**`SERVER_COLUMNS` allowlist additions** in `src/services/offlineSync.js`:

```js
// Append to SERVER_COLUMNS at src/services/offlineSync.js:55-132:

battery_runs: [
  'id', 'battery_code', 'battery_version', 'child_id', 'user_id', 'programme_id',
  'class_id', 'assessment_window_id', 'language', 'started_at', 'completed_at',
  'status', 'notes', 'created_at', 'updated_at',
],
battery_run_artifacts: [
  'id', 'battery_run_id', 'question_code', 'storage_path', 'captured_at',
  'created_at', 'updated_at',
],

// Extend the existing assessments entry to include the new columns:
assessments: [
  // ... existing columns ...
  'battery_run_id', 'question_code', 'question_version', 'item_set_id',
  'stopped_reason', 'ea_rubric_total', 'hq_rubric_total', 'language', 'duration_ms',
],
```

**`PUSH_ORDER` entries** in `src/services/offlineSync.js`:

```js
// Updated PUSH_ORDER at src/services/offlineSync.js:134-152 — battery_runs
// must come BEFORE assessments (FK target), and battery_run_artifacts must
// come AFTER assessment_items (artifacts are the lowest-priority lane, after
// all Question result data is in place):
export const PUSH_ORDER = [
  'time_entries',
  'classes',
  'children',
  'child_ea_assignments',
  'child_programme_enrollments',
  'child_class_memberships',
  'class_ea_assignments',
  'grouping_versions',
  'class_grouping_state',
  'groups',
  'group_ea_assignments',
  'child_group_memberships',
  'sessions',
  'session_attendees',
  'battery_runs',          // NEW — parent of assessments; must precede it
  'assessments',
  'assessment_items',
  'battery_run_artifacts', // NEW — sibling of assessments; row goes through
                           //  main outbox; the photo *file* uploads via the
                           //  separate photo_upload_queue lane.
  'letter_mastery',
];
```

**`TABLE_DEPENDENCIES` entries:**

```js
// Append at src/services/offlineSync.js:154-170:
battery_runs:           ['children', 'programmes'],
battery_run_artifacts:  ['battery_runs'],
```

**`referenceDataRepository` allowlist** — the `programmes` pull must include the two new columns so they reach EA devices:

```js
// In src/db/repositories/referenceDataRepository.js — extend the programmes
// column list (existing patterns in the file) to add:
programmes: [
  // ... existing columns ...
  'default_battery_code', 'default_battery_version',
],
```

**`SCHEMA_VERSION` bump:** `src/db/migrations.js`'s `CURRENT_SCHEMA_VERSION` constant goes from `1` → `2`. The new migration block carries all of the above additions atomically.

#### Sync outbox ordering

The local SQLite mirror writes to `sync_outbox` in this order so that Postgres FK constraints are satisfied when the outbox drains:

```
1. battery_runs                       (parent — must exist before assessments rows reference it)
2. assessments                        (per-Question result rows under the Run)
3. assessment_items                   (per-item rows under each assessments row)
4. battery_run_artifacts (row only)   (Postgres row carrying storage_path — file uploads separately)
```

The **photo file lane** is a separate sync queue with its own retry cadence (see PRD's "Photo sync architecture — eventually consistent" section and the *Photo upload queue* subsection below). The `battery_run_artifacts` row arrives in Postgres before its photo file is in Storage; the HQ dashboard handles that gracefully with a "photo uploading…" placeholder.

#### Photo upload queue (local-only state model) — Codex review finding 10

The PRD's "separate low-priority photo lane" requires a concrete local state surface the lane can operate on. The Settings UX "Sync photos over cellular now" affordance also counts pending photos from this surface. A new SQLite table `photo_upload_queue` (local-only, **not synced**) holds the queue state:

```sql
-- LOCAL SQLite ONLY — not mirrored to Postgres.
create table if not exists photo_upload_queue (
  artifact_id                  text primary key references battery_run_artifacts(id) on delete cascade,
                                                         -- Real FK to local battery_run_artifacts.id.
                                                         -- Cascade deletes the queue row when its parent
                                                         -- artifact is removed (e.g. abandoned-Run cleanup);
                                                         -- the queue should never outlive the artifact it
                                                         -- tracks. Codex review (fourth pass) finding 3 —
                                                         -- earlier draft only had a comment, not a real FK.
  local_path                   text not null,            -- ${documentDirectory}battery_run_photos/{run_id}/{id}.jpg
  compressed_bytes             integer not null,         -- post-compression file size
  status                       text not null check (status in (
    'pending',          -- waiting for upload conditions to be met
    'in_flight',        -- upload in progress
    'uploaded',         -- confirmed in Supabase Storage; file may be deletable
    'failed_retryable', -- failed but will retry per backoff
    'failed_terminal'   -- exceeded retry budget; surface to user in support package
  )),
  retry_count                  integer not null default 0,
  last_error                   text,                     -- error message from most recent failure
  next_retry_at                text,                     -- ISO-8601 timestamp; NULL for non-retrying statuses
  uploaded_at                  text,                     -- ISO-8601 timestamp; set when status → 'uploaded'
  one_shot_cellular_override   integer not null default 0, -- 1 = include in next batch even on cellular
  created_at                   text not null default (datetime('now')),
  updated_at                   text not null default (datetime('now'))
);

create index if not exists idx_photo_upload_queue_status
  on photo_upload_queue(status, next_retry_at);
```

**Queue transitions:**

```
[capture]
   ↓                                                        ┌──────────────────────────┐
[compress to ~1080px/70%, write to documentDirectory] ─→ ┤ INSERT row, status=pending │
                                                          └──────────────────────────┘
                                                                       ↓
                                                          ┌──────────────────────────┐
                                                          │ photo lane drain pass    │
                                                          │ (checks NetInfo +        │
                                                          │  wifi/cellular policy)   │
                                                          └──────────────────────────┘
                                                                       ↓
                                          status=in_flight, attempt upload to Storage
                                                                       ↓
                                                                   success?
                                                                  ↓        ↓
                                                                 yes       no
                                                                  ↓        ↓
                                                       status=uploaded   status=failed_retryable
                                                       uploaded_at=now   retry_count++
                                                       (DELETE local     last_error=...
                                                        file)            next_retry_at=backoff
                                                                         (if retry_count > N
                                                                          → failed_terminal)
```

**Settings sheet counts:** "3 photos waiting to upload" = `count(*) where status in ('pending', 'in_flight', 'failed_retryable')`. "Total size: ~600 KB" = sum of `compressed_bytes` for the same rows.

**One-shot cellular override:** the "Upload now over cellular" Settings affordance sets `one_shot_cellular_override = 1` on all qualifying rows. The drain pass sees this flag and ignores the wifi-only policy for those rows on the next pass only — the flag is **cleared** when the row's status moves to `in_flight` (regardless of outcome), so a retry after failure does not silently keep using cellular.

**Connection detection:** the existing `@react-native-community/netinfo` is the canonical connection-info library (already in `package.json`). Codex review finding 10 noted both NetInfo and `expo-network` would work; sticking with the already-installed NetInfo avoids a second connection-info dependency.

**New dependencies (must be added to `package.json`):**

- `expo-image-picker` — `launchCameraAsync` for OS-native camera capture (Pattern D mechanism)
- `expo-image-manipulator` — resize + JPEG re-encode at capture (Pattern D's ~1080px/~70%/~200KB compression)
- `expo-file-system` — *already in `package.json`*, used for `documentDirectory` reads/writes/deletes

**Camera permissions (must be added to `app.config.js`):**

- iOS — `ios.infoPlist.NSCameraUsageDescription = "Masi uses your camera to capture photos of paper assessment sheets so they reach Head Office for review."`
- Android — `android.permissions` array adds `'android.permission.CAMERA'`. The Expo image-picker plugin also requires `'android.permission.READ_EXTERNAL_STORAGE'` on older Android versions; add it conditionally.

**Support / debug package coverage:** the existing `src/db/debugDump.js` does **not** include the `photo_upload_queue` today — it returns `tableCounts`, `syncState`, and `failedOutboxRows` only (Codex review second-pass finding 7). Implementation must extend `debugDump.js` with two new sections so field debugging is tractable when photos fail to upload:

```js
// New addition to src/db/debugDump.js after getFailedOutboxRows
const getPhotoUploadQueueState = async (db, tableNames) => {
  if (!tableNames.includes('photo_upload_queue')) return [];
  try {
    return await db.getAllAsync(`
      select artifact_id, status, retry_count, last_error,
             next_retry_at, compressed_bytes, uploaded_at,
             one_shot_cellular_override, created_at, updated_at
        from photo_upload_queue
       order by case status
                  when 'failed_terminal'  then 0
                  when 'failed_retryable' then 1
                  when 'in_flight'        then 2
                  when 'pending'          then 3
                  when 'uploaded'         then 4
                end,
                updated_at desc
       limit 100
    `);
  } catch (error) { return { error: String(error) }; }
};

const getPhotoUploadQueueSummary = async (db, tableNames) => {
  if (!tableNames.includes('photo_upload_queue')) return null;
  try {
    return await db.getFirstAsync(`
      select
        sum(case when status = 'pending'           then 1 else 0 end) as pending,
        sum(case when status = 'in_flight'         then 1 else 0 end) as in_flight,
        sum(case when status = 'uploaded'          then 1 else 0 end) as uploaded,
        sum(case when status = 'failed_retryable'  then 1 else 0 end) as failed_retryable,
        sum(case when status = 'failed_terminal'   then 1 else 0 end) as failed_terminal,
        sum(compressed_bytes) as total_compressed_bytes
        from photo_upload_queue
    `);
  } catch (error) { return { error: String(error) }; }
};

// Add to debugDump's return:
//   photoUploadQueueSummary: await getPhotoUploadQueueSummary(db, tableNames),
//   photoUploadQueueRows:    await getPhotoUploadQueueState(db, tableNames),
```

The summary surface is the one a Masi support engineer reads first ("how many photos are stuck?"); the detail rows are bounded at 100 most-recent so a runaway queue doesn't blow up the support bundle.

**Tests required (gate on field testing):**

- Wifi-only path — queue drains when connection type = wifi, leaves rows pending on cellular
- Remote `photo_upload_over_cellular` flag override — flag flips queue to "any connection" during open Windows
- One-shot override — `one_shot_cellular_override = 1` causes upload on cellular, then flag clears
- Retry path — `failed_retryable` rows retry per exponential backoff with `retry_count` increment
- Terminal-fail path — after retry budget exceeded, status moves to `failed_terminal` and stops retrying
- Delete-after-upload — confirmed `uploaded_at` triggers `documentDirectory` file deletion via post-upload hook

#### EGRA backfill

Existing EGRA `assessments` rows must be tagged with `question_code` so the new Run-aware queries treat them coherently. Two write paths exist in the wild:

- **Old EGRA rows with `assessment_tool_id` set** — joined to `assessment_tools.code`. Standard path.
- **Mobile-created EGRA rows from `LetterAssessmentScreen.js`** — these write `assessment_type` (e.g. `'letter_egra'`, `'letter_sounds'`, `'egra_letter_sounds'`) but **do not set `assessment_tool_id`**. Codex review finding 3 — the original join-only backfill would have missed every mobile EGRA row.

The backfill uses a **fallback chain**: `assessment_tool_id` join first, then `assessment_type` mapping for the known legacy variants, all canonicalised to **`egra_letter_sound`** (the single canonical code).

```sql
-- Step 1 — backfill rows that have assessment_tool_id (server-side and older app builds).
update public.assessments a
   set question_code    = at.code,
       question_version = coalesce(at.version, '2024.1')
  from public.assessment_tools at
 where a.assessment_tool_id = at.id
   and a.question_code is null;

-- Step 2 — backfill mobile-created rows that wrote assessment_type but no assessment_tool_id.
-- All legacy variants canonicalise to 'egra_letter_sound'.
update public.assessments
   set question_code    = 'egra_letter_sound',
       question_version = '2024.1'
 where question_code is null
   and assessment_type in (
     'letter_egra',
     'letter_sounds',
     'egra_letter_sounds',
     'egra_letter_sound'
   );

-- Step 3 — sanity check: rows still with question_code IS NULL are unmapped legacy data.
-- Expected count = 0 after the two backfills above. The implementation pass should
-- run this as a verification query and treat any non-zero count as a migration failure.
-- select count(*) from public.assessments
--  where question_code is null
--    and (assessment_tool_id is not null or assessment_type is not null);

-- battery_run_id stays NULL for all pre-Run-era EGRA rows. Reporting joins still work
-- because question_code is set on every row after Steps 1 + 2.
```

**Canonical legacy code:** `egra_letter_sound` (singular). The variants `letter_egra`, `letter_sounds`, and `egra_letter_sounds` (plural) all map to the singular form. Implementation tests must include a fixture for a mobile-created EGRA row with no `assessment_tool_id` to prove the fallback chain works.

The existing `assessment_tools` table remains in place for backwards compatibility with older app builds that still write `assessment_tool_id`. The OSS direction is "definitions in code, references in DB" — new Questions land as code-only and do not need `assessment_tools` rows. The mobile app writes `question_code` directly on new rows; the legacy `assessment_tool_id` is left NULL for new-Question results.

#### Phased rollout

The migration is forward-compatible with older app builds because every change is additive. The recommended sequence:

| Phase | Change | App builds in field |
|---|---|---|
| 1 | Apply Postgres migration to `masi-app-sqlite` (`segygjzpujphwvrubusm`) | Old builds keep working — they just don't write to the new columns |
| 2 | Publish OSS package `@masinyusane/assessment-questions` at `0.1.0` | (no app impact) |
| 3 | Ship Masi app build with the WelaPLUS Battery enabled | New app writes to new tables; sync drains cleanly because Phase 1 prepared the schema |
| 4 | Run first WelaPLUS Battery Runs in the Baseline 2026 Window | Field-testing begins; Codex review loop active |
| 5 | After one full Window of clean field data, promote OSS package to `1.0.0` | Indicates production stability |

Phase 1 to Phase 3 can be hours apart if the Masi build pipeline is hot; in practice expect a few days for the EAS preview build + on-device testing. Phase 4 is the calendar-driven moment (Baseline Window opens), not a Masi engineering moment.

#### Field-testing plan (Window 1) — Codex review finding 18

For the first Baseline Window using the WelaPLUS Battery, treat every Run as a **calibration data point**:

- All EA Runs land in `battery_runs` + `assessments` + `assessment_items` + `battery_run_artifacts` as designed.
- The first 50 Runs are reviewed by Masi pedagogy team for:
  - Q1–Q10 score distributions (sanity check against paper benchmarks)
  - Q11 EA-rubric scores collected (HQ rubric scores still on paper until the future NextJS dashboard ships)
  - Photo legibility for Q5/Q9/Q10/Q11 — does the ~1080px/~70% standard reach HQ usable for primary rubric scoring?
- The Codex review loop captures sync failures, RLS issues, and edge cases as they surface.

**Explicit decision criteria (widen / hold / rollback).** After 50 Runs, the decision is data-driven, not vibes-driven:

| Metric | Threshold | Source | Decision if met / unmet |
|---|---|---|---|
| Sync success rate | **≥ 95%** of EA Runs reach Postgres with `battery_runs` + all `assessments` + all `assessment_items` rows synced within 48 hours of completion | `sync_outbox` drain telemetry; cross-check Run counts on device vs in Postgres | Met → continue; Unmet → **hold**, fix sync failure modes, do not widen |
| Photo upload success rate | **≥ 90%** of captured photos reach Supabase Storage within 48 hours of being on wifi | `photo_upload_queue.status = 'uploaded'` rate; conditioned on EA having had wifi access in window | Met → continue; Unmet → **hold**, investigate connection / Storage / RLS path |
| Stuck-outbox rate | **≤ 1%** of Runs have any row left in `failed_terminal` status after retry budget | `sync_outbox` + `photo_upload_queue` `failed_terminal` counts | Met → continue; Unmet → **investigate** for systematic write-conflict, RLS, or migration drift; **rollback if** the root cause is structural |
| Q11 photo legibility | **≥ 95%** of Q11 photos are rated "rubric-markable" by Masi pedagogy reviewers | Manual rubric-scoring spot-check by pedagogy team | Met → continue with standard compression; Unmet → **ship v0.2** of the OSS package with `photoQualityPreset = 'high'` (~1440px/~80%/~400KB) on Q11 specifically; field test for one more Window before locking |
| EA-vs-HQ rubric drift (Q11) | Mean absolute difference per dimension **≤ 0.8 / 4** | Compare EA in-app score with HQ paper rubric on the same paper artifact for the 50-Run sample | Met → calibration experiment is viable, proceed; Unmet → **investigate** whether EAs need anchor refinement or training; **do not retire** HQ paper scoring until drift is acceptable |

**Widen decision:** all five metrics meeting threshold → roll out to remaining EAs in the next sub-Window slot (typically days).

**Hold decision:** any sync/photo/outbox metric below threshold → freeze the rollout at 50 Runs, address root cause in v0.1.x, re-test.

**Rollback decision:** if a structural defect (FK violations, RLS denial cascade, sync engine producing duplicate or missing rows) is found that can't be hot-patched, revert the Masi app build pinned to the OSS package to the previous EGRA-only build. Note: rollback does NOT touch the schema migrations — those are additive and safe. Rollback only undoes the *app integration* that exercises the new tables. The schema waits for the next rollout attempt.

**Post-Window-1 commitments before promoting OSS package to `1.0.0`:** sync success ≥ 99%, photo upload ≥ 95%, stuck-outbox ≤ 0.1%, Q11 photo legibility ≥ 98%, no breaking-change releases since Window 1 close.

### 3. Settings UX (locked)

A new **Settings** section on the Profile screen, sitting between the existing admin/debug tools (Export Logs, Export Database) and the Sign Out action. The section header (small caps "SETTINGS") divides it visually. Two rows ship in v1:

**Row 1 — Assessment text size.** Tapping opens a **bottom sheet** (per the project's "bottom sheets over dialogs" UX convention) showing four labelled options with live previews:

```
┌─ Assessment text size ─────────────┐
│                                    │
│  ○ Small                           │
│    The bear went into the woods.   │
│                                    │
│  ● Medium                          │
│    The bear went into the woods.   │
│                                    │
│  ○ Large                           │
│    The bear went into the woods.   │
│                                    │
│  ○ Extra Large                     │
│    The bear went into the woods.   │
│                                    │
│  [   Done   ]                      │
└────────────────────────────────────┘
```

- Four discrete levels: `small | medium | large | xlarge`. Default `medium` (matches current EGRA letter pill size).
- Token-to-pixel mapping lives in the shared `childReadingFontSize` design-token resolver in the OSS package (e.g. `small: 28`, `medium: 36`, `large: 44`, `xlarge: 52` — exact values pending tablet display testing).
- Stored as a string token in AsyncStorage under `settings.assessmentTextSize`.
- **Per-device, not per-EA.** Vision/comfort is a device-relative preference: different EAs sharing a tablet inherit; the same EA on a phone vs tablet sets each independently. Skips the sync complexity tax for a preference that doesn't need it.
- The setting affects every Pattern C reading Question (Q6 Word Reading, Q7 Sentence Reading, Q8 Read Passage). It does **not** affect Pattern A's letter grid (whose pill size is driven by the same token but Q1's grid pagination geometry has its own tablet/phone breakpoint logic).

**Row 2 — Sync photos over cellular now.** Tapping opens a bottom sheet:

```
┌─ Sync photos over cellular ────────┐
│                                    │
│  3 photos waiting to upload        │
│  Total size: ~600 KB               │
│                                    │
│  Your normal setting waits for     │
│  wifi. Tap below to upload these   │
│  3 photos using cellular data      │
│  now.                              │
│                                    │
│  [   Upload now over cellular   ]  │
│  [   Cancel   ]                    │
└────────────────────────────────────┘
```

- Counts pending `photo_upload_queue` rows whose `status` is in `('pending', 'in_flight', 'failed_retryable')` (Codex review third-pass finding 5c — was previously written as counting `battery_run_artifacts` rows, but the queue is the canonical local-state surface for upload progress per PRD section 2's *Photo upload queue* subsection). The total size hint is `sum(compressed_bytes)` over the same rows.
- Tapping "Upload now over cellular" flips the connection policy to "any" **for the next sync batch only** — a one-shot override. Does not persist; the next batch defaults back to wifi-only. The remote `photo_upload_over_cellular` feature flag remains the canonical mechanism for Window-wide overrides during open Assessment Windows.
- If no photos are pending, the bottom sheet shows "No photos waiting" and a single "Done" button. Defensive empty state for the curious tap.

**What does *not* ship in v1 Settings UX:**

- A settings screen with more than these two entries — keep it minimal until field EAs ask for more.
- Per-EA synced preferences (vision/comfort is a device thing).
- Continuous-slider text size (discrete labelled options are more EA-trainable).
- A persistent "always use cellular" toggle (would invert the safe default; the remote flag and one-shot override cover the legitimate cases).
- A full sync-status screen with per-Question / per-Run diagnostics — useful for a future debugging tranche, not for Settings.

### 4. Pedagogy team inputs (blocking field deployment, not this PRD)

The full list lives in the **What is off-team** subsection at the top of *Implementation handoff* above. Summary: bilingual item sets for all 11 Questions; stop-rule copy; prerequisite thresholds; timed-Question durations; Q2 story script + acceptable answers; Q11 rubric anchor text + picture asset; Q5 picture card image assets.
