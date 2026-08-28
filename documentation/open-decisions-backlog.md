# Open Decisions Backlog

> Decisions that are **not** settled and are not required for the current SQLite pilot. Moved out of
> `CONTEXT.md` on 2026-05-29 so the glossary stays a glossary. Current execution work belongs in
> `ROADMAP.md`; this file contains product choices that require Jim or pedagogy input. When one is
> resolved, record the outcome in `CONTEXT.md` and/or an ADR, then remove it from here.

## Required before session-history authorization is committed or deployed

- **Complete session aggregate versus child-sliced privacy.** The working-branch migration treats a
  session as one aggregate: owning the session or having a historical direct delivery assignment
  to any attendee grants the parent plus every attendee row. This avoids a misleading partial
  session because `sessions.activities.child_reading_levels` can contain facts keyed by every
  attendee child, but it also exposes coattendee `notes`, `grade_snapshot`, and attendance status to
  an EA whose delivery relationship may cover only one attendee. The alternative is not merely an
  attendee-policy change: it requires a redacted parent projection or moving per-child facts out of
  the parent JSON, plus child-filtered attendee hydration. Decide the aggregate privacy boundary
  explicitly before the candidate migration is committed or applied.

## Required before assessment-history hydration

- **Current-year class scope across a mid-year child move.** ADR-0005 says assessment history is
  current-academic-year class-scoped, but three non-equivalent grants fit those words: only the
  child's currently active class; any class-membership history in the current academic year; or the
  class that contained the child at `assessment_date`. Choose deliberately, including the timezone and
  same-day rule for the assessment-date option. This decision controls both RLS and the canonical
  SQLite assessment-scope query.
- **Whether `letter_mastery` is year-scoped history or current derived state.** ADR-0005 currently
  groups it with assessment reads, but `letter_mastery` has no academic-year or event-date key that
  can faithfully enforce current-year class history. Decide whether it stays a cross-year current
  projection, derives visibility through source assessment evidence, or receives an explicit year
  dimension. Do not pretend the assessment predicate can be copied onto it unchanged.

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
