---
status: accepted
date: 2026-05-29
updated: 2026-05-29
---

# Assessment score colours band on raw score, keyed per (Question, grade, language)

> **Refinement 2026-05-29 — the band key includes language, with a wildcard.** The key is
> `(tool_code, grade, language)`, where `language` may be `*` ("applies to all languages") for
> Questions whose benchmark is language-independent. Whether cuts vary by language is a *per-Question*
> property: EGRA Letter Sounds measured as letters-correct-per-minute (LCPM) is language-independent
> (South Africa sets the **Grade 1 benchmark at 40 LCPM for all languages**), so it uses `*`;
> comprehension/writing Questions are expected to need explicit per-language rows. This widens the
> original `(tool_code, grade)` key below but does not change anything else in this decision. The
> fill-in scaffold (numbers are pedagogy-TBD) lives at
> `documentation/assessment-score-bands-config.md`.

# Assessment score colours band on raw score, keyed per (Question, grade)

## Context

`AssessmentRankingScreen` ranks a EA's children by raw letters-correct on their most recent EGRA Letter Sounds assessment, but colours each bar with `getBarColor(percent)`, where `percent = correct / attempted × 100` and the bands are fixed and grade-agnostic (≥70% green, 40–69% yellow, <40% red).

Accuracy percent is a measurement distortion for EGRA-style timed subtests. Because it divides by *attempted* items, it rewards children who attempt few items: a child who attempts 5 letters and gets 4 scores 80% ("good") while knowing only 4 letters, whereas a child who attempts all 60 and gets 35 scores 58% ("okay") while being substantially more skilled. The pedagogically meaningful value is the **raw correct count** (letters per minute), benchmarked against grade-level expectations — which is also how the screen already *ranks* (it just doesn't *colour* that way).

This decision also has to survive the assessment vocabulary the project standardised on: an assessment is no longer "an EGRA test" but a **Battery Run** made of N `assessment` rows, one per **Question** (Letter Sounds, Listening Comprehension, Story Writing, …), each with its own scale and `tool_code` / `tool_version`. A single global colour band cannot span Questions whose scales differ (60 letters/min vs N comprehension items vs a 4-dimension rubric). And within one Question, the "good / okay / needs-work" cut is grade-referenced — knowing 20 letters is strong for Grade R and weak for Grade 3 — while a single EA's ranked list spans multiple grades (Core Literacy R-3 EAs hold children across grades 1–3).

A separate constraint comes from the OSS Tool contract (settled in `CONTEXT.md`): a Question component is a *pure capture component* that emits raw results and receives no scoring, identity, or storage configuration. Score interpretation is therefore a host-app concern, not part of the open-source package.

## Decision

Assessment result colours are computed from the **raw score on the Question's own scale**, never from accuracy percent.

Bands are keyed by **`(tool_code, grade)`**. The child's grade is the grade **at assessment date**, recovered through the `child_class_memberships` window that covers the row's date (the same grade-recovery rule used everywhere else in the domain), not the child's current class.

The interpreting contract is a lookup:

```
getScoreBand({ toolCode, grade, rawScore }) → 'good' | 'okay' | 'needs_work'
```

The lookup lives in the **host app**, never inside an OSS Question component. The numeric cuts are pedagogy-team input and are TBD; only the structure is fixed by this ADR.

For the May 2026 go-live the lookup is backed by a **bundled constant band table** covering only EGRA Letter Sounds for the grades Masi runs. The documented forward path is to promote the data source to a synced `assessment_score_bands` reference table (joining `programmes`, `academic_years`, and assessment Windows as siblings in the reference-data sync) once additional WelaPLUS Questions ship or pedagogy needs to tune cuts without an app release. Because call sites depend only on `getScoreBand`, swapping the constant for the synced table does not touch `AssessmentRankingScreen` or any other consumer.

## Consequences

- The ranking colour stops contradicting the ranking order. A child higher on the list (more letters correct) can no longer be coloured worse than a lower child who happened to attempt fewer items.
- The model generalises to every WelaPLUS Question for free: a new Question brings its own band rows under its own `tool_code`; no consumer code changes.
- Colour is grade-correct across a multi-grade EA list, because the band is selected with the child's grade-at-assessment-date.
- The `(tool_code, grade)` **key shape is load-bearing** and effectively hard to change once reports, dashboards, and the eventual synced table are built around it. The numeric cuts behind the key are cheap to change — that asymmetry is deliberate, so pedagogy can tune freely while the structure stays stable.
- A future reader who sees raw-score bands instead of the "obvious" percent will wonder why; this ADR is the answer. The percent path was rejected for a concrete measurement reason, not an oversight.
- For go-live, only the bundled EGRA Letter Sounds table is on the critical path. The synced reference table and per-Question expansion are post-go-live work, unblocked by this structure.
- Bands stay out of the OSS Question packages, so threshold re-tunes never force a package republish and Masi-specific pedagogy never leaks into open-source components.

## Considered alternatives

- **Keep accuracy-percent bands (status quo).** Minimal effort, no new structure. Rejected: it is the documented distortion this decision exists to remove, and it cannot span Questions with different scales or honour grade benchmarks.
- **Raw-score bands, but global (not grade-keyed).** Colour by raw count against one set of cuts for all grades. Rejected: a single EA's list spans grades 1–3, so one benchmark mis-colours most of it; the roadmap explicitly asked for grade-awareness and warned against copying Zazi's Grade-R cuts blindly.
- **Bands inside the Question component.** Each Question ships its own colour logic. Rejected: violates the OSS "Question emits, host interprets" contract, forces a package republish on every threshold tune, and embeds Masi pedagogy in shared open-source code.
- **Build the synced `assessment_score_bands` table now.** Consistent with the "tunable without a release" precedent. Rejected for go-live timing only: it is schema + sync-contract work ahead of need for a single shipping Question whose numbers are still TBD. The lookup abstraction lets us adopt it later without consumer churn, so building it now buys nothing the go-live needs.
