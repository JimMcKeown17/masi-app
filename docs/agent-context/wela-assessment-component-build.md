# Agent Context: WelaPLUS Assessment Battery — Component Build

**Purpose:** This file is *progressive disclosure* for any agent picking up the WelaPLUS Assessment Battery work mid-stream. Read this once and you should have enough context to continue grilling, design, or implementation without re-reading the full conversation that produced the decisions.

**Current status, verified 2026-07-23:** PRD design is complete and Codex-reviewed four times. The
11 Question components and tests exist on unmerged branch `feature/wela-plus-battery-merge` at
`fed3175`, currently 34 commits behind `main` and 19 ahead. The old `.claude` worktree no longer
exists. Nothing from the branch is on `main`; host schema, sync, Run lifecycle, package publication,
content, and field validation remain open. Start with `documentation/ROADMAP.md` section 8 before
using the historical sequence later in this briefing.

Four Codex adversarial reviews on 2026-05-29 surfaced 35 findings total — 18 in the first pass (`documentation/archive/wela-plus-battery-prd-2026-review.md`: 8 critical, 6 high-priority, 4 medium-priority), 8 in the second pass (3 high-priority, 5 medium-priority), 5 in the third pass (2 high-priority, 2 medium-priority, 1 low-priority), and 4 in the fourth pass (2 high-priority, 1 medium-priority, 1 low-priority). **All 35 are addressed** in the current PRD; see all four *Codex review revisions* tables in the PRD's *Implementation handoff* section. Fourth-pass headline changes: Storage path parsing corrected per Supabase's actual data model — `storage.objects.bucket_id` carries the bucket, `name` is the inside-bucket path, so the parse index is `[1]` not `[2]` and the CHECK constraint drops the `'battery-run-photos/'` prefix; authenticated DELETE policy removed (photos are write-once; cleanup is service-role only); `photo_upload_queue.artifact_id` made a real `references battery_run_artifacts(id) on delete cascade` FK; last stale "*To Be Continued*" reference in this briefing cleaned up.

**Remaining is implementation** (writing-plans → executing-plans → OSS package build → Masi app integration → EAS builds → field testing) and **pedagogy content** (off-team: item sets, story scripts, picture cards, rubric anchors). See "Resumption point" at the bottom for the implementation entry.

---

## What this is

A modular open-source React Native component library that implements the **WelaPLUS** literacy assessment battery as 11 self-contained Question components. Each Question is a pure capture component (knows language, content, scoring, UI; knows nothing about children, EAs, programmes, storage). The components are designed so Masi can use them inside its existing offline-first SQLite/Supabase app, **and** any other literacy NGO can install the package, supply their own item content, and host it against their own backend.

This is not a backend-only design or a paper-replacement scanner. It is **in-app, EA-marked-live or EA-marked-from-paper** assessment, with photo capture for paper-marked Questions as a backup/audit channel.

---

## Required reading, in order

1. **[`CONTEXT.md`](../../CONTEXT.md)** — the domain glossary. Critical: the terms **Assessment Question**, **Assessment Battery**, **Battery Run**, **Assessment Window**, **Progress check**, **Marking mode** were defined during this work. The "Settled product decisions" section also gained ~8 new bullets specific to WelaPLUS — read them.
2. **[`documentation/wela-plus-battery-prd-2026.md`](../../documentation/wela-plus-battery-prd-2026.md)**: design-complete and Codex-reviewed four times. Picking this up means first reconciling the existing component branch with current `main`, then planning host schema and integration. Do not restart the 11 components from scratch.
3. **[`documentation/learning/assessment_battery_architecture.md`](../../documentation/learning/assessment_battery_architecture.md)** — the three-level hierarchy explainer (Battery Run → Question result → Item response) with worked example. Read this if any data-model decision is unclear.
4. **The WelaPLUS source PDF** — currently at `~/Library/CloudStorage/GoogleDrive-mckeown.james@gmail.com/My Drive/Masinyusane/Masi Marketing/Marketing Materials/Adobe Creative Cloud Packages/Literacy Programme Materials/Masi WelaPLUS Literacy Assessment 2024 Folder/Masi WelaPLUS Literacy Assessment 2024 - FINAL/Masi WelaPLUS Literacy Assessment 2024 (English).pdf`. The isiXhosa version is in the same folder.
5. **The existing EGRA implementation:** `src/screens/assessments/LetterAssessmentScreen.js` and `src/components/assessment/EgraLetterGrid.js`. This is the codebase precedent for Pattern A and an example of what we're moving *away from* (component coupled to Masi auth/storage).

---

## The eleven Questions at a glance

| # | Question name | Pattern | Marking | Timed | Stop rule | Status |
|---|---|---|---|---|---|---|
| 01 | Letter Sounds | A — Timed tap-grid | tap-correct | 60s | "row wrong" reminder via `instructions` prop | **Designed** |
| 02 | Listen-and-Answer Story | F — Listen-and-answer | tap-correct (with visible rubric gloss) | no | n/a | **Designed** |
| 03 | Listen First Sound | B — Oral response checklist | tap-correct | no | n/a | **Designed** |
| 04 | Listen Phoneme Blend | B — Oral response checklist | tap-correct | no | n/a | **Designed** |
| 05 | Letter Writing from Pictures | D — Paper-marked + photo (batch cadence, grid layout, picture thumbnails) | tap-correct | no | n/a | **Designed** |
| 06 | Word Reading | C — Reading | tap-correct (default; escape hatch prop) | yes (durSec TBD) | "5 in a row wrong" reminder via `instructions` prop | **Designed** |
| 07 | Sentence Reading | C — Reading | tap-correct per word | no | n/a | **Designed** |
| 08 | Read Passage (ORF) | C — Reading | tap-correct (default; escape hatch prop) | yes (durSec TBD, default 60s) | n/a | **Designed** |
| 09 | CVC Writing | D — Paper-marked + photo (live cadence, single-column layout) | tap-correct | no | n/a | **Designed** |
| 10 | Dictation / Sentence Writing | D — Paper-marked + photo (live cadence, single-column layout) | tap-correct | no | n/a | **Designed** |
| 11 | Story Writing (rubric) | E — Discrete rubric | segmented chips (0–4) per dimension | no | n/a | **Designed** |

The six "Patterns" (A through F) are capture archetypes; multiple Questions share the same Pattern with different content / prop values. The user explicitly chose "one component per major question" (DRY violation) for clarity to OSS contributors. Shared logic lives in internal hooks (e.g. `useToggleMark`), not in a shared "binary list" component.

---

## The decisions that are locked

### Vocabulary and shape

- **Three-level hierarchy:** `battery_runs` (new, parent) → `assessments` (existing, gains `battery_run_id` and `question_code`/`question_version`/`item_set_id`/`stopped_reason`) → `assessment_items` (existing, unchanged). Photos in `battery_run_artifacts` (new, sibling of `assessments`).
- **Definitions live in OSS code,** not DB lookup tables. DB stores only string references.
- **One canonical Battery per Programme** via new `programmes.default_battery_code` *and* `programmes.default_battery_version` columns (version is required when code is set — pin the Battery to a specific OSS package version so `latest` doesn't silently drift). No EA-facing Battery picker in v1.
- **Multiple Runs per child per Window allowed.** Latest-in-Window is canonical for reporting. Progress checks have `assessment_window_id = NULL`.

### OSS contract

- **A Question is a pure capture component.** Props: `language`, optional `itemSet` (overrides bundled content), `instructions`, optional `durationSec`, callbacks (`onItemMarked`, `onComplete`, `onAbandon`).
- **No child/EA/programme/storage props** — those belong to the host.
- **No mid-Question resume.** Restart on force-quit. Between-Question resume is fine — the Run stays open.
- **Content bundled by default, overridable via `itemSet` prop.** Item-set IDs are versioned (`{question_code}@{question_version}.{language}`).
- **Question versioning is explicit** — every result row carries `question_code` + `question_version` + `item_set_id`.

### Marking convention

- **Unified across Patterns A, B, C: tap = correct (green); no tap = wrong/blank.** Stored as `assessment_items.is_correct boolean DEFAULT false`. Second tap clears.
- For Pattern C passage reading specifically, the Question exposes an optional `markingPolarity` prop (`'tap_correct' | 'tap_wrong'`) as an escape hatch, defaulting to `'tap_correct'`. Switch the default after field testing if needed.

### Run lifecycle

- **Run start:** primary entry from Child profile; secondary entry from Assessments tab. Same `battery_runs` row underneath.
- **Question order:** linear by default in v1; not hardcoded — future config can enable a free picker.
- **Skipping:** explicit, reason-captured. Enum on `stopped_reason`.
- **Prerequisite gates declared in the Battery definition,** evaluated by the host. WelaPLUS Full gates Questions 6, 7, 8 on Question 1's score (threshold TBD).
- **Stop rules are soft** — exposed as `instructions` copy, not enforced in code.

### Pattern A — Letter Sounds (Question 1)

- New `<LetterSoundsQuestion>` built fresh. Existing `LetterAssessmentScreen.js` stays for EGRA.
- Paginated grid; `durationSec=60`; pill size scales with `childReadingFontSize` design token.
- Item set TBD (Masi pedagogy team).

### Pattern B — Oral response checklist (Questions 3, 4)

- Two separate components: `<ListenFirstSoundQuestion>` and `<ListenPhonemeBlendQuestion>`.
- Single vertical column, one item large-and-centered, auto-scroll to next un-marked.
- Question 4 shows a smaller gloss `(sun)` below segmented prompt `s-u-n`, always visible.
- Finish-confirms-unmarked.
- Shared logic in `useToggleMark` hook (internal, not a Question).

### Pattern C — Reading Questions (Questions 6, 7, 8)

- Three separate components: `<ReadWordsQuestion>`, `<ReadSentencesQuestion>`, `<ReadPassageQuestion>`.
- Pills in `flex-wrap` container; single scrollable view, no pagination.
- Shared `childReadingFontSize` design token, adjustable via new Settings entry.
- One-line hint on first reading Question of a Run reminds EA of font-size setting.
- Question 6 timed; Question 7 untimed; Question 8 timed.
- Question 7 scoring: per-word; derived per-sentence percentage in `result.derived`.
- Question 8 passage length variable (from `itemSet`, not hardcoded 80).

### Pattern D — Paper-marked Questions (Questions 5, 9, 10) + photo capture

- **Three separate components:** `<LetterWritingFromPicturesQuestion>` (5), `<WriteCvcsQuestion>` (9), `<WriteSentencesFromDictationQuestion>` (10).
- **Mixed marking cadence — locked per Question, not unified for the Pattern:**
  - Question 5 = **batch** marking (26 items, child-self-paced). EA marks on device after child completes the paper sheet.
  - Questions 9 and 10 = **live** marking (12 items each, EA-dictation-paced). EA marks on device as child writes.
- **Layouts:**
  - Question 5 = paginated grid mirroring the paper sheet's row structure; cells show **picture thumbnail + small expected-letter label**; pictures bundled with OSS package, overridable via `itemSet`.
  - Questions 9 and 10 = single vertical column auto-scroll, large prompt centred — identical to Pattern B's shell.
- **Prompt privacy** (Questions 9 and 10): large prominent display, EA's physical responsibility to angle the device away from the child. No tap-to-reveal, no auto-hide. Same discipline as the paper prompt list today.
- **Shared internals:** all three use `useToggleMark`; the layout shells are the only thing that varies.

### Pattern D — photo capture flow

- **Timing — end-of-Run batch.** No per-Question photo prompt during the Run. Run-completion screen drives one capture per paper-marked Question.
- **Mechanism — Expo Image Picker, camera-only.** `launchCameraAsync` with `mediaTypes: 'Images'`. OS native camera UI; OS preview/retake. Image lands in `documentDirectory`.
- **Unit — one photo per paper-marked Question, "Add another" affordance.** `battery_run_artifacts.question_code` is **NOT NULL**.
- **Compression — non-negotiable.** ~1080px longest edge, ~70% JPEG quality, target ~200KB per photo. Raw camera image discarded immediately. Implemented via `expo-image-manipulator`.
- **Missing-photo policy — soft warning.** EA can finalize a Run without photos. Once `status = 'completed'`, no further photos can be added through this flow. Status enum stays at three values.
- **Sync architecture — eventually consistent.** `battery_run_artifacts` row goes through the main outbox alongside other Postgres-row writes. The photo file uploads via a **separate low-priority sync lane** with its own retry cadence. HQ briefly sees a row pointing at a not-yet-uploaded file; dashboard handles that gracefully.
- **Local storage:** `${documentDirectory}battery_run_photos/${battery_run_id}/${artifact_id}.jpg`. The local path is recorded **only** on the local-only `photo_upload_queue.local_path` column (Masi-app SQLite), never on `battery_run_artifacts` itself — single source of truth per Codex second-pass finding 2b.
- **Supabase Storage path:** `battery-run-photos/${battery_run_id}/${artifact_id}.jpg`. RLS shape mirrors `assessments` (producer/owner check, programme-scoped HQ SELECT).
- **Connection policy — wifi-by-default with Window override.** `@react-native-community/netinfo` (already a Masi-app dependency) reads connection type. Default upload over wifi only. Masi-controlled remote flag `photo_upload_over_cellular` flips to "any connection" during open Assessment Windows. EA has explicit "Upload now over cellular" affordance on a sync screen.
- **Local retention:** photo files deleted from `documentDirectory` after confirmed Storage upload.

### Pattern F — Listen-and-Answer Story (Question 2)

- **Single component:** `<ListenAndAnswerStoryQuestion>`.
- **Intro screen:** the full story script (from `itemSet.story.{en|xh}`) renders as scrollable text in EA-readable size; "I've finished reading" primary action advances to the question phase. Same content-asset shape as Pattern C's reading passages — no new bundled type in the OSS package.
- **Question phase:** reuses Pattern B's single-vertical-column auto-scroll shell exactly. One question card at a time, large and centred, with acceptable-answer rubric strings shown as a small gloss beneath the prompt (same gloss pattern as Q4's `(sun)` under `s-u-n`). Auto-scroll to next un-marked on tap; finish-confirms-unmarked.
- **Marking convention:** unified tap-correct from A/B/C/D — Q2 introduces **no new gesture** for the EA. `assessment_items.is_correct boolean DEFAULT false`.
- **Re-read-story affordance:** persistent "Re-read story" pill anchored at the top of every question card opens a non-destructive modal sheet showing the story text again. Dismiss returns to the same question card with marking state preserved. Re-read count NOT logged on the result row.
- **Item-set shape:** `{ story: { en, xh }, questions: [{ prompt: { en, xh }, acceptable_answers: { en: string[], xh: string[] } }] }`. Comprehension-question count driven by `questions.length` (not hardcoded), matching Pattern C's "passage length variable" convention. Rubric structure intentionally minimal; OSS package's TypeScript type can widen to `string[] | { text, note? }[]` later without breaking adopters (the host passes `itemSet` opaquely).
- **Timer:** none. **Stop rule:** none.
- **No artifact / photo capture in v1.** Child's response is verbal; no paper sheet exists. `battery_run_artifacts.question_code` already permits a future Battery variant adding Q2 photo capture with zero schema or component change.
- **Out for v1, not schema-hooked:** audio recording of child responses (would need a new artifacts table, microphone permissions, different sync lane, privacy review); structured-per-answer rubric (`{ text, note? }[]`); re-read count logged on the result row.

### Pattern E — Story Writing rubric (Question 11)

- **Single component:** `<StoryWritingRubricQuestion>`.
- **Layout:** picture prompt as a small inline thumbnail at the top (tap-to-enlarge to full-screen sheet); four dimension cards stacked vertically (Meaning Making, Spelling, Length, Vocabulary). Each card: dimension name header with a "View full rubric" button on the right; row of five tappable chips (0–4); end-anchored gloss line beneath (e.g. "no attempt → partial → sophisticated"). Running total beneath the cards; "Finish Question 11" primary action.
- **"View full rubric" sheet:** opens non-destructively per dimension, listing all five anchor descriptions as a vertical list. Dismiss returns to the scoring screen with selections preserved. This is the inter-rater reliability lever — EAs reach for it when undecided between adjacent scores.
- **Marking convention:** Pattern E is the **only** Pattern that diverges from A/B/C/D/F's unified tap-correct primitive. Still tap-once-to-commit, but EA picks one of five values per dimension rather than toggling a binary mark. Re-score by tapping a different chip — no "tap to clear" because 0 is itself a valid score. `assessment_items.is_correct` stays `false` for Q11 rows; `metadata.score` is the carrier.
- **Item-set shape:** `{ picture: { uri, alt: { en, xh } }, dimensions: [{ code, label: { en, xh }, anchors: { en: [{ score, text }, …], xh: [{ score, text }, …] }, end_anchor_gloss: { en, xh } }, …] }`. Dimension count driven by `dimensions.length` (not hardcoded at 4) — supports 3- or 5-dimension variants without code change. Picture bundled by default in the OSS package, overridable via `itemSet.picture`. **One picture per Run** for v1; Battery config picks which. EA-time picture choice is deferred.
- **Calibration column shape (hybrid-normalized — load-bearing for the future HQ NextJS dashboard):**
  - `assessments.ea_rubric_total INTEGER NULL` — set by host on EA completion.
  - `assessments.hq_rubric_total INTEGER NULL` — set later by the HQ NextJS dashboard when paper marking lands.
  - Per-dimension scores live as `assessment_items` rows with **scorer-prefixed `item_key`** — EA rows use `'ea:meaning_making'` / `'ea:spelling'` / `'ea:length'` / `'ea:vocabulary'`; HQ rows use `'hq:meaning_making'` / etc. `is_correct = false` on all Q11 rows, `metadata = { score: 0–4, scorer: 'ea' | 'hq', anchor_text?: string }`. EA writes 4 rows; HQ writes 4 *additional* rows later. 8 rows at full calibration. The `ea:` / `hq:` prefix is load-bearing — without it, the existing `deterministicItemId` helper would collide same-dimension rows. See ADR-0004.
  - EA-vs-HQ delta computed at query time (`hq_rubric_total - ea_rubric_total` for totals; join through `assessment_items` for per-dimension drift). Not stored.
  - **Full decision record:** `docs/adr/0004-q11-calibration-column-shape.md` (considered alternatives: 10-column denormalized, JSONB pair, late-HQ-update-EA-rows, dedicated rubric-scores table — all rejected with reasons).
- **Result shape (OSS contract):** standard `{ question_code, question_version, item_set_id, language, duration_ms, stopped_reason, items, derived }` where `items` is one entry per dimension (`is_correct: false`, `metadata.score`/`scorer`/`anchor_text`) and `derived = { ea_rubric_total, max: 16, by_dimension: { meaning_making, spelling, length, vocabulary } }`. Host writes the row and items.
- **Photo capture:** Q11 opts into Pattern D's end-of-Run capture queue via Battery config (`photo_eligible_questions` includes `wela_plus_story_writing`). Uses Pattern D's standard ~1080px/~70%/~200KB compression. If field testing shows HQ can't rubric-score from standard-quality photos, a `photoQualityPreset` prop is a non-breaking v2 addition.
- **Timer:** none. **Stop rule:** none.
- **Out for v1, deferred:** multi-picture choice at administration time; per-Question photo quality presets; direct /16 entry without per-dimension scoring; EA-vs-HQ delta stored as a column.

---

## What is open (implementation + content, no design left)

The PRD design surface is closed. What remains is **implementation work** (different skill vehicles) and **off-team content work** (pedagogy team). Listed for the next agent's awareness, not as grilling targets.

1. **Implementation — migrations to apply.** Concrete `.sql` files for the additive schema spec'd in the PRD's section 2. Run via `/writing-plans` → `/executing-plans` against `masi-app-sqlite` (project ref `segygjzpujphwvrubusm`). Filenames follow `YYYYMMDDHHMMSS_description.sql` per Supabase CLI. Must also update `documentation/rls-sync-contract-map.md` with `battery_runs` and `battery_run_artifacts` rows per the project's "RLS is one contract" rule.
2. **Implementation: component integration and OSS publication.** Reconcile the existing
   `feature/wela-plus-battery-merge` island with current Masi primitives and design tokens, then
   extract or publish it with README, setup guide, LLM prompt template, MIT code license, and
   leadership-ratified CC-BY 4.0 content license.
3. **Implementation — Masi app integration.** Run lifecycle UI in the existing app (Battery overview, Run-start primary entry from Child profile, secondary entry from Assessments tab, Run-completion screen with photo-capture queue, score summary), Settings screen (Profile section with the two locked rows), photo capture pipeline wiring, sync outbox ordering update.
4. **Implementation — HQ NextJS dashboard.** Out of scope for this PRD; its own future PRD. Consumes Battery Run data via the schema this PRD locks. The Q11 calibration column shape (ADR-0004) is the load-bearing contract for that PRD.
5. **Pedagogy content (off-team).** Item sets bilingual (EN + XH) for all 11 Questions; stop-rule reminder copy; prerequisite gate thresholds; timed-Question durations; Q2 story script + acceptable answers; Q11 rubric anchor text + picture asset; Q5 picture card image assets (real OSS-blocker for the package's "install and run" experience).
6. **Leadership ratification.** The content licensing (CC-BY 4.0 for bundled item sets, picture cards, story scripts, rubric anchors) needs Masi leadership sign-off before the first public OSS release. The decision sets a precedent for every future Masi-developed assessment content the package bundles.

---

## Resumption point

**The PRD design phase is complete.** No more design grilling is needed; the next agent picks up implementation. The PRD's *Implementation handoff* section at the bottom of `documentation/wela-plus-battery-prd-2026.md` lays out the suggested handoff sequence in detail.

**Most natural next step:** inspect and reconcile `feature/wela-plus-battery-merge` against current
`main`. Confirm the merge commit still defuses the live `assessmentItemDomainId` rekey, review the
19 branch-only commits, and complete the Masi token/chrome/typecheck pass. Then write the concrete
host migration and integration plan from the PRD.

**Then:** build and deploy the host schema/sync contract, wire Run lifecycle and photos, and extract
or publish the reviewed component island as the OSS package.

**Then — Masi app integration.** Wire the OSS package into the existing app: Run lifecycle UI, Battery overview, photo capture queue, Settings screen with the two locked rows, sync outbox ordering update.

**Field test Window 1 — Baseline 2026.** First 50 Runs as the calibration data point per PRD section 2's field-testing plan. Iterate on photo quality, RLS surprises, sync failures. After one clean Window, promote OSS package to `1.0.0`.

**Off-team — pedagogy content.** Item sets, story scripts, picture cards, rubric anchors — runs in parallel with implementation, no engineering dependency. Tracked in PRD's "What is off-team" subsection.

**Leadership ratification gate.** Before the first public OSS release, Masi leadership signs off on the CC-BY 4.0 content licensing (PRD section 1).

Suggested prompt for resuming on migrations:

> "Continuing the WelaPLUS Assessment Battery PRD work. Read `CONTEXT.md`, `documentation/wela-plus-battery-prd-2026.md` (particularly the *Implementation handoff* section and section 2 *Migrations and rollout*), and `docs/agent-context/wela-assessment-component-build.md` first. The PRD design phase is complete; next is implementation. Please invoke `/writing-plans` to produce the concrete `.sql` migration files for `battery_runs`, `battery_run_artifacts`, and the additive `assessments` + `programmes` columns. Target backend is `masi-app-sqlite` (project ref `segygjzpujphwvrubusm`). Include RLS policies, the `battery-run-photos` Storage bucket, the EGRA backfill, and an update to `documentation/rls-sync-contract-map.md` per the project's 'RLS is one contract' rule."

---

## Files this work has touched

- **Created:** `documentation/wela-plus-battery-prd-2026.md` (this PRD)
- **Created:** `documentation/learning/assessment_battery_architecture.md` (three-level hierarchy explainer)
- **Created:** `docs/agent-context/wela-assessment-component-build.md` (this file)
- **Modified:** `CONTEXT.md` (new glossary terms; new "Settled product decisions" bullets; new "Open product questions" entry; updated "Flagged ambiguities" entry on the assessment overload)
- **Modified:** `AGENTS.md` (added pointer to this agent-context file)
- **Not yet touched:** any source code in `src/`. The existing EGRA implementation under `src/screens/assessments/` and `src/components/assessment/` remains running for production EGRA capture and will not be migrated as part of this work.

## Conventions to follow for future sessions

- Use the **Question / Battery / Run / Window / Progress check / Marking mode** vocabulary throughout. Do not slip back into "assessment" as a noun for "Battery."
- When designing a new Question component, lead with what it emits (the result shape), then what it accepts (props), then UI. Result-shape-first because that is the OSS contract.
- When in doubt about scope, default to "out for now, hook in the schema so we can add it later." The PRD's *Out of Scope* section and the *Out-of-scope for v1* bullets inside each Pattern are the explicit deferrals; the *Implementation handoff* section names what is on-team vs off-team. (The earlier "*To Be Continued*" sections were closed when the PRD reached design-complete — no remaining open design surface.)
- When updating decisions, update **both** the PRD and this agent-context file. CONTEXT.md only changes for vocabulary or cross-feature settled decisions.
