# Open Decisions Backlog

> Decisions that are **not** settled and are not required for the current SQLite pilot. Moved out of
> `CONTEXT.md` on 2026-05-29 so the glossary stays a glossary. Current execution work belongs in
> `ROADMAP.md`; this file contains product choices that require Jim or pedagogy input. When one is
> resolved, record the outcome in `CONTEXT.md` and/or an ADR, then remove it from here.

## Required before assessment-history hydration

- **Assessment item correction identity.** The current deterministic item id incorporates whether
  the answer was correct, while the server also enforces one non-null item per
  `(assessment_id, position)`. Correcting an answer can therefore produce a new id that conflicts
  with the old row at the same position. Settle whether a submitted assessment is an immutable
  attempt that must be superseded by a new attempt, or whether each position is mutable and keeps
  a stable identity independent of its answer. Do not widen assessment hydration or add correction
  UI until this semantic choice is reflected in SQLite, Supabase, repository, and outbox contracts.

## Deferred to next academic year

- **Gap UX at the start of a new academic year, before office grouping data exists.** For ECD the
  seed script's random-pairing fallback resolves this once data is loaded; for Core Literacy R-3 and
  Numeracy, an EA arriving at a fresh-cohort class without office groups has no pair/group to capture
  against. Options: an explicit "Awaiting office groups" placeholder + a temporary EA-managed group
  reconciled when office groups arrive; or block capture entirely until office data arrives. **This
  is start-of-year only** — mid-year operations (including the May 2026 go-live) load existing office
  pairs and do not hit this gap, which is why it is out of go-live scope.
- **Post-go-live random partition feature for fresh ECD intakes.** Distinct from the seed-time
  fallback (settled): an in-app or operations-side mechanism to generate ECD pairs for a brand-new
  cohort at start of academic year. Deferred until next year.

## Pending pedagogy-team input (structure settled, numbers only)

- **Assessment score colour band numbers** (roadmap 1.2). Structure and key are settled — raw-score
  bands keyed per `(Question, grade, language-or-`*`)`, host-app config, `getScoreBand` lookup (see
  ADR-0003). Fill-in table scaffolded at `assessment-score-bands-config.md`. Anchored: EGRA Letter
  Sounds **Grade 1 `good` line = 40 LCPM (all languages)** per the SA national benchmark. Still
  pending: the `okay` line for Grade 1, all cuts for the other grades, whether ECD takes Letter
  Sounds at all, and per-language cuts for each WelaPLUS Question as it ships. All drop into the
  scaffold with no code change.
- **WelaPLUS prerequisite-gate thresholds.** What minimum Letter Sounds score should auto-skip Word
  Reading / Sentence Reading / Oral Reading Fluency, and are there gates *within* the reading
  sub-progression? Structure is settled (configurable Battery-level rules — see CONTEXT.md "Battery
  definitions can declare prerequisite gates"); only the numbers are pending. WelaPLUS is post-go-live.
