# Assessment Score Bands — Config Scaffold

> **Status:** Scaffold for pedagogy fill-in (created 2026-05-29 in a grill-with-docs session).
> The *structure* is settled (see `docs/adr/0003-assessment-score-bands.md` and CONTEXT.md). The
> *numbers* below are pedagogy-team input. Cells marked `TBD` block nothing structural — drop
> integers in and the colour bands work, no code change.

## What this is

The lookup `getScoreBand({ toolCode, grade, language, rawScore }) → 'good' | 'okay' | 'needs_work'`
reads its cut points from this table. For go-live it is materialised as a **bundled host-app
constant**; later it may be promoted to a synced `assessment_score_bands` reference table. Either
way, the rows below are the source of truth for the cuts.

## Key shape

`(tool_code, grade, language)` — where:

- **`tool_code`** — the Question (e.g. `letter_sounds`). Each Question has its own raw-score scale.
- **`grade`** — matches `classes.grade`; the child's grade is taken **at assessment date** via the
  `child_class_memberships` window (never the child's current class).
- **`language`** — `english`, `isixhosa`, …, or **`*`** (wildcard = "applies to all languages").
  Use the wildcard for Questions whose benchmark is language-independent. Letter Sounds (LCPM) is
  language-independent, so it uses `*`. Comprehension / writing Questions are expected to need
  explicit per-language rows.

## Band semantics

> **Refinement 2026-05-30 — four bands, not three.** Pedagogy chose a four-tier
> scale with two greens: a darker **great** (at / above the grade benchmark) and a
> lighter **good** (approaching it), then **okay** and **needs_work**. So each row
> now carries **three** cut points (was two). `getScoreBand` returns
> `great | good | okay | needs_work | unknown`. This widened the original two-cut
> scheme below.

Each `(tool_code, grade, language)` row carries up to three cut points on the
Question's **raw score** (all bounds **inclusive**):

| Field | Meaning |
|---|---|
| `great_min` | raw score ≥ this → **great** (at / above grade benchmark) |
| `good_min` | raw score ≥ this (but < `great_min`) → **good** (approaching benchmark) |
| `okay_min` | raw score ≥ this (but < `good_min`) → **okay** |
| (below `okay_min`) | → **needs_work** |

Thresholds are **null-guarded**: a partly-configured row (e.g. `okay_min` still
TBD) asserts only the bands its cuts can back; a below-`good` score on such a row
degrades to **unknown** (neutral grey) rather than inventing a misleading colour.
A `(tool_code, grade, language)` with no row at all is also **unknown**.

## EGRA Letter Sounds (`tool_code = letter_sounds`) — go-live

- **Raw score:** letters correct per minute (LCPM), out of a 60-letter set (`english_60` /
  `isixhosa_60`), 60-second timed window.
- **Language:** `*` — South Africa sets the LCPM benchmark independent of language.
- **National anchor (given):** **Grade 1 benchmark = 40 LCPM, all languages** — the
  `great_min` for Grade 1.
- **Cuts set 2026-05-30 (pedagogy).** Foundation grades 1–3 share one ladder
  (`great` 40 / `good` 30 / `okay` 20); Grade R and ECD share a lower one
  (`great` 20 / `good` 15 / `okay` 10). ECD takes the Grade R ladder; Grade 3
  reuses the Grade 1/2 ladder. All language `*`. These are seeded as a bundled
  constant in `src/utils/scoreBands.js`.

| tool_code | grade | language | great_min | good_min | okay_min | source / note |
|---|---|---|---|---|---|---|
| `letter_sounds` | R | `*` | **20** | **15** | **10** | pedagogy 2026-05-30 |
| `letter_sounds` | ECD | `*` | **20** | **15** | **10** | = Grade R ladder |
| `letter_sounds` | 1 | `*` | **40** | **30** | **20** | great_min = SA national LCPM benchmark |
| `letter_sounds` | 2 | `*` | **40** | **30** | **20** | = Grade 1 ladder |
| `letter_sounds` | 3 | `*` | **40** | **30** | **20** | reuses Grade 1/2 ladder |

The lookup normalises grade input, so the stored class labels (`Grade R`,
`Grade 1`, …, `ECD`) resolve to these keys.

## WelaPLUS Questions (post-go-live)

These ship as WelaPLUS Questions land (~45% built). Each needs its own rows; comprehension/writing
Questions are expected to need **explicit per-language** cuts (not the `*` wildcard). Add a section
per Question as it is built — e.g. `listening_comprehension`, `word_reading`, `sentence_reading`,
`oral_reading_fluency`, `story_writing`. Numbers all TBD-pedagogy.

> **`word_reading` is already a live consumer.** `AssessmentRankingScreen` has a
> **Letters / Words** toggle (added 2026-05-30). Letters mode uses `letter_sounds`
> (the rows above); Words mode passes `tool_code = word_reading`, which has **no
> rows yet**, so every word bar degrades to neutral grey ("No benchmark") and the
> screen says so. Dropping `word_reading` rows here (great/good/okay per grade,
> likely per-language) lights up Words-mode colours with **no code change**.

## Related: prerequisite-gate thresholds (separate config)

Distinct from colour bands: the WelaPLUS Battery declares prerequisite gates (e.g. "Word Reading
requires `min_score` N on Letter Sounds"). Those thresholds live in **Battery** config, not here,
and are also pedagogy-TBD. See CONTEXT.md ("Battery definitions can declare prerequisite gates")
and the open-questions entry. Listed here only so the two pedagogy-number tasks are not confused.
