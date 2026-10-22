# Open Decisions Backlog

> Decisions that are **not** settled and are not required for the current SQLite pilot. Moved out of
> `CONTEXT.md` on 2026-05-29 so the glossary stays a glossary. Current execution work belongs in
> `ROADMAP.md`; this file contains product choices that require Jim or pedagogy input. When one is
> resolved, record the outcome in `CONTEXT.md` and/or an ADR, then remove it from here.

## Lesson flow C2–C3: Jim's pass before merge (2026-10-22)

The implementation is on `feat/lesson-flow`; P1–P12 are the plan calls recorded in the build-log
Decision Register. Jim's final wording/decision pass covers: **P1** standard picker header;
**P2** separate Wrap up screen; **P3** first-change/Wrap-up draft creation; **P4** leave-and-keep
warning with separate Discard (Jim's 2026-10-22 instruction); **P5** Home Resume without clock-in;
**P6** explicit missing-language choice and isiZulu manual capture; **P7** ungrouped-only group
creation/placement; **P8** per-child No one new yet, aggregated tracker check; **P9** last-seen
labels; **P10** old form retired; **P11** letters-only release packs and preview-content device
coverage; **P12** completion gains language code, blend/book receipt deferred. The build log
links each decision to source. These are implemented calls, not twelve unbuilt features.

**ADR open:** "advice from the children, record with the group" (lesson-plan spec §11). Draft it
with Jim through `grill-with-docs` before the PR merges. This task does not draft or ratify it.

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
