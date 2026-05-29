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

Each `(tool_code, grade, language)` row carries two cut points on the Question's **raw score**:

| Field | Meaning |
|---|---|
| `good_min` | raw score ≥ this → **good** (on / above benchmark) |
| `okay_min` | raw score ≥ this (but < `good_min`) → **okay** (approaching) |
| (below `okay_min`) | → **needs_work** |

## EGRA Letter Sounds (`tool_code = letter_sounds`) — go-live

- **Raw score:** letters correct per minute (LCPM), out of a 60-letter set (`english_60` /
  `isixhosa_60`), 60-second timed window.
- **Language:** `*` — South Africa sets the LCPM benchmark independent of language.
- **National anchor (given):** **Grade 1 benchmark = 40 LCPM, all languages.** Taken here as the
  `good_min` for Grade 1. The `okay_min` (the "approaching vs needs-work" line) is a Masi judgement
  and is still TBD.
- Confirm which grades Masi actually administers Letter Sounds to; the rows below assume Core
  Literacy R–3. Whether ECD (`core_literacy_ecd`) takes Letter Sounds at all is for pedagogy to
  confirm.

| tool_code | grade | language | good_min | okay_min | source / note |
|---|---|---|---|---|---|
| `letter_sounds` | R | `*` | TBD | TBD | pedagogy |
| `letter_sounds` | 1 | `*` | **40** | TBD | good_min = SA national LCPM benchmark; okay_min TBD |
| `letter_sounds` | 2 | `*` | TBD | TBD | pedagogy |
| `letter_sounds` | 3 | `*` | TBD | TBD | pedagogy |
| `letter_sounds` | ECD? | `*` | TBD | TBD | confirm Letter Sounds applies to ECD at all |

## WelaPLUS Questions (post-go-live)

These ship as WelaPLUS Questions land (~45% built). Each needs its own rows; comprehension/writing
Questions are expected to need **explicit per-language** cuts (not the `*` wildcard). Add a section
per Question as it is built — e.g. `listening_comprehension`, `word_reading`, `sentence_reading`,
`oral_reading_fluency`, `story_writing`. Numbers all TBD-pedagogy.

## Related: prerequisite-gate thresholds (separate config)

Distinct from colour bands: the WelaPLUS Battery declares prerequisite gates (e.g. "Word Reading
requires `min_score` N on Letter Sounds"). Those thresholds live in **Battery** config, not here,
and are also pedagogy-TBD. See CONTEXT.md ("Battery definitions can declare prerequisite gates")
and the open-questions entry. Listed here only so the two pedagogy-number tasks are not confused.
