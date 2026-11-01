---
status: accepted
date: 2026-10-31
---

# The Maths assessment gates Core EGMA behind early number Questions

## Context

Masi's numeracy TaRL intervention, run with a partner maths organisation, needs one assessment that
places Foundation Phase children and shows growth. It must also serve as mastery evidence for the
numeracy EA tracker, which is organised by skill and number range.

The RTI Core EGMA toolkit (March 2014) is the published standard, but it has a hard floor problem.
Most children Masi serves start below its first items. Run alone, it gives many children a string
of zeros and tells the EA nothing about what to teach next. The partner's Weeks 1–4 curriculum
(finger flash, count out, more or fewer, before and after, combine, fingers up and down) sits below
Core EGMA.

The design is in
[the maths assessment spec](../superpowers/specs/2026-10-31-egma-maths-assessment-design.md) and the
[implementation plan](../superpowers/plans/2026-10-31-egma-maths-assessment.md).

## Decision

**One Battery, floor first.** `masi_maths` has nine Masi-authored early number Questions, then the
eight Core EGMA Questions in toolkit order. Each Core Question that has a natural floor is gated by
it, using the Battery's existing prerequisite rules:

- Read numbers ≥ 7 → Read big numbers.
- Which is more ≥ 7 → Bigger number.
- Before and after ≥ 7 → Missing number.
- Add with counters ≥ 4 → Addition 1 and Word problems.
- Take away with counters ≥ 4 → Subtraction 1.
- Level 1 ≥ 1 → level 2.

A gated-out Question is saved as `skipped_prerequisite_unmet` and shown as "Not ready yet". Gates
read totals, not per-band scores. Prerequisites now chain in one evaluation pass, so a child gated
out of Addition 1 is never offered Addition 2.

**Gated-out Questions count as 0 in evaluation.** A child who never reached Core addition has not
shown that skill. Reports that compare with published EGMA results must footnote the gating.

**Deviations from the toolkit, recorded in the content pack's source notes:**

- **Stop rules.** Early number Questions stop at 3 wrong in a row, and Count aloud at the first
  mistake. Every Core EGMA Question stops at 4 wrong in a row, including the three 60-second ones,
  where the toolkit has no stop rule. Jim accepted the timed stop rule "for now"
  (2026-10-31). It is one named constant in the adapter. Changing it requires a new
  `question_version` and a new Battery version, so results under the two rules are never pooled.
- **The clock starts on Start**, not when the child first speaks.
- **The rate is stored, not just the count.** `derived.correct_per_minute` scales only when a
  timed Question is completed early. Every other stop uses the raw count, as the toolkit does.
- **Addition and Subtraction 1 items 6–20 are Masi-authored** to the toolkit specification; items
  1–5 are printed toolkit items. Word problems use six items, one per problem type.

**Every item carries `{skill, band}`.** The band is the smallest of 5, 10, 20, 50, 100 and 1000 at
or above the largest number in the item. These tags are finer than the tracker's cells, so the
tracker can group them without re-reading item content. Strategy evidence is captured where it
informs teaching: per item on the two counters Questions, and once per Core arithmetic Question.

**Draft and frozen identities are separate.** Pilot builds submit themselves to the stores, so
content cannot be frozen just by shipping it. The draft form `masi-egma-en-2026-1-draft` and the
Battery `masi_maths@2026.1-draft` are used until the release gates pass. The freeze is a
deliberate commit that adds `masi_maths@2026.1`, supersedes the draft, and moves the numeracy
default in a second migration. No draft score gates a frozen Question.

**The subject comes from the programme code.** `programmeSubject` maps `numeracy` to maths. It is
keyed on the code, not the Battery, so screens still hide literacy surfaces for a numeracy EA
whose phone cannot resolve the Battery.

## Consequences

- One assessment both places children (where the gates stop them) and measures Core EGMA growth
  for children above the floor. Totals are comparable only within a Battery version.
- Published-comparison reports need footnotes for gating, the timed stop rule and the clock start.
- Content changes after the freeze need a new form id and Battery version, as with the EGRA pack.
- isiXhosa and other languages are new forms in the same pack. The adapter checks each form
  against the same contract.
- The Number Card is generated from the pack, so it cannot drift from the items the phone marks.

## Considered alternatives

- **Core EGMA alone.** Rejected because of the floor problem: most children would score zero on
  most Questions, which helps neither placement nor teaching.
- **A re-levelled EGMA** (easier items in the toolkit's own tasks). Rejected because it breaks
  comparability with published EGMA and still lacks the counting and counters skills the partner
  teaches first.
- **Two assessments** (a placement check and a separate Core EGMA). Rejected because it doubles
  administration for EAs and splits one child's evidence across two results. Gating inside one
  Battery gives the same placement with one start and one summary.
