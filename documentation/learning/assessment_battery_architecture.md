# Assessment Batteries — The Three-Level Hierarchy

> **Status (2026-07-13): DESIGNED, NOT BUILT on `main`.** This chapter is written in the present tense,
> but the tables it describes (`battery_runs`, `battery_run_artifacts`) **do not exist on `main`** — no
> migration creates them and nothing in `src/` references them. It is forward design, filed under
> `learning/` alongside shipped-code narratives, which is misleading without this header.
>
> The implementation is in flight on an unmerged worktree
> (`.claude/worktrees/feature+wela-plus-battery`). Spec: `documentation/wela-plus-battery-prd-2026.md`.
> Treat this chapter as "how it is meant to work", not "how it works today".

---

## Why three levels?

The old EGRA Letter Sound feature only ever needed *two* levels: an `assessments` row (one subtest's worth of work) and `assessment_items` rows (per-letter responses). That worked because EGRA Letter Sound is a one-subtest Question — there was nothing above the `assessments` row that mattered.

WelaPLUS breaks that. A single WelaPLUS administration is **11 subtests**, captured over the course of 45–75 minutes by one EA with one child. Treating each of those subtests as 11 unrelated `assessments` rows loses something important: they belong together. They were captured in one sitting. They share a window. They roll up to one body of evidence about a child.

So we add a layer *above* `assessments` for that "one sitting of work":

```
battery_runs                         (NEW — "one body of assessment work")
  └── assessments                    (EXISTING — "one subtest's score within that body")
        └── assessment_items         (EXISTING — "one response within that subtest")

  └── battery_run_artifacts          (NEW — "photos of the paper sheets")
```

Each level answers a different question:

| Level | Answers | Example row |
|---|---|---|
| `battery_runs` | Who assessed this child with which Battery, when, in which Window? | "EA Nomvuyo ran WelaPLUS Full on Lwazi at 09:00 Monday, Baseline 2026." |
| `assessments` | What was the per-Question score within that Run? | "Lwazi scored 47/60 on the Letter Sounds Question." |
| `assessment_items` | How did the child respond to a specific item? | "On letter 'k' at position 14, Lwazi answered correctly in 1.2 seconds." |

---

## The vocabulary that goes with the shape

Three first-class terms (also in [`CONTEXT.md`](../../CONTEXT.md)):

- **Assessment Question** — one subtest with its own UI, scoring rule, and React component. Example: "WelaPLUS Listening Comprehension." A Question is the OSS unit; one component per Question.
- **Assessment Battery** — a named, ordered set of Questions administered together. Example: "WelaPLUS Full" = 11 Questions in a specific order. Same Question can appear in many Batteries.
- **Battery Run** — one EA running one Battery on one child on one date. Materialised as N `assessments` rows (one per Question) plus a parent `battery_runs` row that owns lifecycle.

The Battery is the *recipe*; the Run is *one time someone cooked it*.

---

## What the schema looks like

### `battery_runs` (new)

```
id                      uuid PK
battery_code            text          -- e.g. 'wela_plus_full'
battery_version         text          -- e.g. '2024.1'
child_id                uuid
user_id                 uuid          -- the EA
programme_id            text
class_id                uuid nullable
assessment_window_id    uuid nullable -- NULL = progress check
language                text          -- e.g. 'en' | 'xh'
started_at              timestamptz
completed_at            timestamptz nullable
status                  text          -- 'in_progress' | 'completed' | 'abandoned'
notes                   text nullable
created_at, updated_at, sync columns
```

### `assessments` (existing, additive changes)

New columns, all nullable to preserve compatibility with existing EGRA data:

```
battery_run_id          uuid FK → battery_runs.id  (NULL for pre-Run-era rows)
question_code               text                       -- e.g. 'wela_plus_letter_sounds'
question_version            text                       -- e.g. '2024.1'
item_set_id             text                       -- e.g. 'wela_plus_letter_sounds@2024.1.en'
stopped_reason          text                       -- 'completed' | 'stop_rule' | 'timer'
                                                   --   | 'ea_ended' | 'skipped_child_refused'
                                                   --   | 'skipped_time' | 'skipped_age'
                                                   --   | 'skipped_prerequisite_unmet' | 'skipped_other'
```

`child_id`, `user_id`, `programme_id` stay on the row even though they're derivable through `battery_run_id` — they're cheap denormalisation that keeps RLS policies and per-Question queries simple.

### `assessment_items` (existing, no schema change)

The shape already accommodates any Question's items: `item_key`, `prompt`, `response`, `is_correct`, `position`, plus a freeform `metadata` JSON column for Question-specific extras (the four rubric dimensions on Story Writing, latency in milliseconds, audio recording references, etc.).

### `battery_run_artifacts` (new)

For photos of paper sheets — the first asset-sync feature in the codebase.

```
id                  uuid PK
battery_run_id      uuid FK → battery_runs.id
question_code       text NOT NULL    -- which Question's page; every artifact is bound to one Question
storage_path        text             -- 'battery-run-photos/{battery_run_id}/{id}.jpg'
                                     -- (CHECK constraint enforces this exact shape)
captured_at         timestamptz
created_at, updated_at, sync columns
```

Photos themselves live in Supabase Storage; the table just records references. Each artifact row is one Storage upload + one row insert, retried independently in the outbox.

**`question_code` is NOT NULL** per the Pattern D capture design — every photo is bound to a specific paper-marked Question (Q5 / Q9 / Q10 / Q11), never a whole-Run blob. The "Add another" affordance handles multi-page Questions by adding more rows with the same `question_code`.

---

## Concrete example — Lwazi takes WelaPLUS on Monday

**One row in `battery_runs`:**

| id | battery_code | child | EA | started_at | completed_at | status |
|---|---|---|---|---|---|---|
| run_42 | wela_plus_full | lwazi | nomvuyo | Mon 09:00 | Mon 10:15 | completed |

**Eleven rows in `assessments`** (all sharing `battery_run_id = run_42`):

| question_code | score | total | stopped_reason |
|---|---|---|---|
| wela_plus_letter_sounds | 47 | 60 | completed |
| wela_plus_listening_comp | 4 | 5 | completed |
| wela_plus_initial_sound | 8 | 10 | completed |
| wela_plus_phoneme_blend | 6 | 8 | completed |
| wela_plus_letter_writing | 19 | 26 | completed |
| wela_plus_word_reading | 28 | 40 | stop_rule |
| wela_plus_sentence_reading | 14 | 20 | completed |
| wela_plus_oral_reading_fluency | 53 | 80 | timer |
| wela_plus_cvc_writing | 7 | 12 | completed |
| wela_plus_sentence_writing | 8 | 12 | completed |
| wela_plus_story_writing | 11 | 16 | completed |

**~284 rows in `assessment_items`**: 60 under Letter Sounds, 5 under Listening Comp, ... 80 under ORF, ... etc.

**Four rows in `battery_run_artifacts`**: one photo each of Question 5's writing page, Question 9's CVC sheet, Question 10's dictation sheet, and Question 11's story page. Each row has a NOT NULL `question_code` tying it to exactly one Question — per-Question photos, no shared spreads (an EA who captures Q9 and Q10 on the same physical sheet still takes one photo per Question, scoping each row independently for HQ filtering).

---

## How existing EGRA data fits

Old EGRA `assessments` rows from before this change:
- `battery_run_id` is NULL (no Run wrapper existed yet).
- `question_code` is backfilled to `'egra_letter_sound'`.
- `question_version` is backfilled to the version that matches today's letter set.

The app reads NULL `battery_run_id` as "a pre-Run assessment, treat as a standalone Question result." Reporting joins still work because `question_code` is set on every row. No EGRA data is lost or migrated.

**Future state — Run wrapper for new EGRA captures (deferred).** Eventually, new EGRA Letter Sound captures will also be wrapped in a one-Question Battery (`battery_code = 'egra_letter_sound_only'`) so every assessment in the codebase shares the three-level shape. The cost is one extra row per capture; the gain is consistent treatment across all assessments going forward. This unification is **deferred** until after WelaPLUS field-test validation, per the WelaPLUS PRD's *Out of Scope* section. **Until then, the existing `LetterAssessmentScreen` continues to use the legacy `saveAssessment` repository method and writes pre-Run-era rows with `battery_run_id = NULL`.** The architecture doc describes the eventual end state, not the immediate behaviour. Codex review (second pass) finding 8.

---

## Why this shape supports the OSS goal

Each Question is a self-contained React component that knows nothing about Masi's domain — no `child_id`, no `programme_id`, no Supabase client. It just emits a result object via callbacks. The host (Masi or any other org) wraps it, owns identity and storage, and writes the host-relevant fields to its own `assessments` table.

**The Battery is a thin config** — a code-as-config object inside the OSS package that declares which Questions, in which order, with which prerequisite gates. Swap the Battery and you have a new assessment with no Question code changes. Build a new Question and you can drop it into any Battery.

**The Run is a host concern** — it carries `child_id`, `user_id`, `programme_id` etc. Those are Masi's domain. Another org open-sourcing on top would use the same Questions and Batteries with their own Run table shape.

Practically: an external org installing the OSS package gets the Question components and the Battery definitions for free. They write their own migrations for `battery_runs`, `assessments`, `assessment_items`, and `battery_run_artifacts` — guided by a supplemental setup doc — and they're ready to administer assessments. The Questions render, score, and emit; the host stores.

---

## What this enables down the line

- **Multiple Runs per child per Window** without losing history — the parent Run row makes "latest in Window" a clean query.
- **Prerequisite gates** (skip Word Reading if Letter Sounds < threshold) declared at the Battery level, evaluated by the host against per-Question scores within the Run.
- **Per-Question resume** between Questions (without mid-Question resume): the Run stays in `in_progress` status as Questions complete one by one.
- **Programme-specific Battery selection** — `programmes.default_battery_code` *and* `programmes.default_battery_version` together point to the canonical Battery at a pinned version; the host opens the right one when a Run starts. The version field is required when the code is set so a programme cannot silently inherit a different Battery shape when the OSS package upgrades.
- **HQ dashboard** queries one row per child per Run rather than reconstructing from N `assessments` rows.

The three-level shape is the foundation; everything else is config or UI on top.
