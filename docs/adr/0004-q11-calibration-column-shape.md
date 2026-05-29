---
status: accepted
date: 2026-05-29
updated: 2026-05-29
---

# Q11 (Story Writing) EA-vs-HQ calibration column shape is hybrid-normalized

## Context

WelaPLUS Question 11 (Story Writing) is the only rubric Question in the Battery — it scores a child's handwritten story across four dimensions (Meaning Making, Spelling, Length, Vocabulary), each 0–4, total /16. Q11 is also Masi's **calibration experiment**: the EA scores the rubric in-app on the device, *and* HQ continues to score the same paper artifact independently weeks later via the future NextJS dashboard. Both score-sets need to live on the same Battery Run for analysts to measure EA-vs-HQ drift over time and decide whether holistic-rubric Questions are safe to fully move into the app long-term.

The data shape has to satisfy three constraints simultaneously: (a) a fast top-level "did EAs and HQ agree on the total?" query for dashboards; (b) per-dimension drift queries ("do EAs systematically under-score Spelling?") for the calibration analysis; and (c) **HQ writes scores LATE**, weeks after the EA's Battery Run has already synced to Postgres — so any shape that requires HQ to *update* EA-written rows risks a write conflict with the EA's already-synced data and clobbers the audit chain.

A separate constraint comes from the existing three-level hierarchy documented in `documentation/learning/assessment_battery_architecture.md`: it explicitly names `assessment_items.metadata` as the home for "Question-specific extras (the four rubric dimensions on Story Writing, latency in milliseconds, audio recording references, etc.)." The architecture doc anticipates rubric dimensions living there, and the shape we pick should honour that or explicitly deviate with reason.

## Decision

EA-vs-HQ rubric scores use a **hybrid-normalized** shape that splits totals and dimensions across the existing three-level hierarchy:

- **`assessments.ea_rubric_total INTEGER NULL`** — set when the EA finishes Q11 (`result.derived.ea_rubric_total`, 0–16).
- **`assessments.hq_rubric_total INTEGER NULL`** — set by the future HQ NextJS dashboard when HQ marks the paper, 0–16.
- Both columns are NULL for every non-Q11 row.
- **Per-dimension scores live as `assessment_items` rows.** Each dimension is one row with **`item_key` prefixed by scorer** — EA rows use `item_key ∈ {'ea:meaning_making', 'ea:spelling', 'ea:length', 'ea:vocabulary'}` and HQ rows use `item_key ∈ {'hq:meaning_making', 'hq:spelling', 'hq:length', 'hq:vocabulary'}`. `is_correct = false` on every Q11 row (not the carrier here); `metadata = { score: 0–4, scorer: 'ea' | 'hq', anchor_text?: string }`. The scorer prefix on `item_key` is **load-bearing** — the existing `domainRepositoryUtils.deterministicItemId` helper hashes `(assessmentId, position, item_key, is_correct)` and would otherwise collide an EA's `meaning_making` row with an HQ's `meaning_making` row for the same Q11 result. Prefixing makes the disambiguation visible at the data layer rather than buried in a hash function. The bare canonical dimension code (`meaning_making` etc.) still appears inside `metadata` and the OSS package's `derived.by_dimension` map; the prefix lives only in the storage `item_key`.
- The EA writes **4 rows** when finishing Q11 (with `ea:` prefixes). HQ writes **4 additional** rows later (with `hq:` prefixes) — *not* updates to the EA's rows. A fully-calibrated Q11 result has **8 `assessment_items` rows** with 8 distinct deterministic IDs.
- The EA-vs-HQ delta is **computed at query time** (`hq_rubric_total - ea_rubric_total` for totals; equivalent join through `assessment_items` filtered on `metadata.scorer` for per-dimension drift). Not stored.

The dimension codes (`meaning_making`, `spelling`, `length`, `vocabulary`) are the canonical four for WelaPLUS but the count is driven by the `itemSet.dimensions` array, not hardcoded — a future Battery variant could ship a 3- or 5-dimension rubric without schema change.

## Consequences

- **Top-level drift queries are trivial.** "Did EAs and HQ agree on the total?" is a one-column subtraction on `assessments`. Dashboards don't pay a join cost for the headline metric.
- **HQ writes new rows rather than racing with the EA's already-synced data.** Late HQ marking weeks after the Run never touches a row the EA wrote — no write conflict, no clobbered EA score, no need for last-write-wins reconciliation. The audit trail is preserved by row creation rather than mutation.
- **The architecture-doc named home is respected.** `assessment_items.metadata` was already where rubric dimensions were anticipated to live; this decision uses that surface rather than inventing a parallel one.
- **Schema bloat for Q11 is minimal.** Only 2 new columns on `assessments` (both NULL on every non-Q11 row, 9 out of every 10 rows for Masi's WelaPLUS Full Battery). The 10 non-Q11 Questions pay no schema tax.
- **Per-dimension queries pay a join cost.** Analysts asking "which dimension drifts most?" must join `assessments` to `assessment_items` and filter on `metadata.scorer`. That cost is paid only for calibration analysis, not for routine dashboards.
- **`is_correct = false` on Q11 dimension rows is a small semantic compromise.** The column is meaningless for rubric rows; its carrier role is taken by `metadata.score`. Documented in the Pattern E section of the PRD.
- **This shape is load-bearing for the future HQ NextJS dashboard PRD.** That PRD must write HQ rows as new inserts (not updates), set `hq_rubric_total` on the parent `assessments` row, and emit `metadata.scorer = 'hq'` on each dimension row. Codifying it in this ADR means the HQ dashboard PRD can quote the contract by reference rather than re-deriving it.
- **A future reader looking at `assessment_items` for Q11 will see 8 rows for one Battery Run, and 4 rows for the same Run when only the EA has scored.** This ADR is the answer to "why does this look duplicated?" — the duplication is the calibration experiment.
- **The dimension codes and Q11-specific columns are the load-bearing contract.** The numeric scores, anchor text, picture asset, and even the rubric dimension *labels* are cheap to change. That asymmetry is deliberate: schema stable, pedagogy tunable.
- **The `ea:` / `hq:` `item_key` prefix is the load-bearing disambiguator that prevents EA and HQ rows from colliding under the existing `deterministicItemId(assessmentId, position, item_key, is_correct)` helper.** Without the prefix, an EA's `meaning_making` row at position 1 and an HQ's `meaning_making` row at position 1 would hash to the same ID, and the HQ INSERT would conflict-or-overwrite instead of producing the 8th distinct row this ADR requires. Tests must assert that a fully-calibrated Q11 result has 8 `assessment_items` rows with 8 distinct IDs.

## Considered alternatives

- **Fully denormalized: 10 Q11-specific columns on `assessments`.** `ea_meaning_making`, `ea_spelling`, `ea_length`, `ea_vocabulary`, `ea_rubric_total`, `hq_meaning_making`, `hq_spelling`, `hq_length`, `hq_vocabulary`, `hq_rubric_total`. Q11 produces zero `assessment_items` rows; the dimension scores *are* the data. *Pros:* trivial analyst queries (one-table SELECT); per-dimension drift is a per-column subtraction. *Cons:* 10 NULL columns on every non-Q11 row, hardcoded Q11 dimensions in the schema, and any future rubric Question with a different dimension set compounds the bloat. Rejected: schema-clarity tax across the lifetime of the table outweighs the analyst convenience for one Question.

- **Two JSONB columns on `assessments`: `ea_rubric_scores`, `hq_rubric_scores`.** Each holds `{ meaning_making, spelling, length, vocabulary, total }`. *Pros:* compact (2 columns), JSONB is queryable in Postgres. *Cons:* SQLite (the local store the mobile app writes to first) has weaker JSON support than Postgres, the shape lives in code not schema (no FK or CHECK enforcement on dimension codes), and it's inconsistent with how every other Question's items work — analysts would need to know two schemas. Rejected: the SQLite-Postgres asymmetry and the consistency cost outweigh the compactness.

- **EA writes 4 rows; HQ updates the same 4 rows with `metadata.hq_score`.** Same row carries both scorers. *Pros:* fewer rows (4 instead of 8). *Cons:* late HQ writes race with EA re-syncs; same row carries two scorers in different metadata sub-shapes; audit trail loses the "HQ added a new fact" signal. Rejected: write-conflict risk and audit muddling, for a trivial savings of 4 rows per Q11 result.

- **New dedicated `assessment_rubric_scores` table.** `(id, assessments_id FK, scorer, dimension, score, scored_at)`. Cleanest normalization. *Pros:* explicit history, supports future per-dimension rescoring out of the box, isolates Q11 from `assessment_items`. *Cons:* yet another table to add to RLS, sync outbox ordering, and the SQLite migration; the `assessment_items` table already accommodates this shape via `metadata`; overkill for v1's one rubric Question. Rejected for v1; revisitable if multi-dimensional rubric Questions multiply.
