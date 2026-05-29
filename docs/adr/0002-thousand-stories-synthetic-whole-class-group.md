---
status: accepted
date: 2026-05-27
---

# 1000 Stories uses a synthetic one-row-per-class group

## Context

1000 Stories is a whole-class programme: every child enrolled in 1000 Stories in a given class is in "the group" for that class, and an EA never edits group composition because the group simply *is* the class. This makes 1000 Stories the odd-one-out against the existing schema invariant — settled in `CONTEXT.md` — that **every child has a group** and **every session has a group** (`sessions.group_id` is planned `NOT NULL` after a nullable rollout window). The cleanest way to honour that invariant for 1000 Stories is to seed one `groups` row per class and route every enrolled child through a `child_group_memberships` row to it. The alternative is to relax the invariant for whole-class programmes, leaving `sessions.group_id` permanently nullable and special-casing 1000 Stories in every group-aware query.

## Decision

For 1000 Stories, the seed script and any future programme-creation flow materialise **one synthetic `groups` row per (class, `one_thousand_stories` programme) pair**, named `"{class_name} (Whole class)"`. Every child enrolled in 1000 Stories in that class is given a `child_group_memberships` row pointing to this group. Sessions for 1000 Stories reference the synthetic group's `id` like any other programme.

Membership in the synthetic group is maintained by a **database trigger on `child_programme_enrollments` insert**: when an enrollment is created with `programme_id` resolving to `one_thousand_stories`, the trigger inserts the corresponding membership in the class's synthetic group. The trigger lives in both SQLite (for EA-side local enrollments) and Postgres (for the future Head Office NextJS dashboard).

The synthetic group is **read-only from the EA's perspective**. The future group editor either hides 1000 Stories or renders it read-only as "All children in {class_name}". The EA-facing primitive for adding or removing a child from 1000 Stories is the **enrollment** UI (`child_programme_enrollments`), not the group editor.

## Consequences

- The schema invariant "every child has a group, every session has a group" holds uniformly across all programmes. The planned `sessions.group_id NOT NULL` migration is unblocked.
- Group-aware queries (sessions per group per term, group attendance, ring math) do not branch on programme. Reporting code stays uniform.
- A new schema artefact — synthetic groups — exists that has no EA-facing meaning. A future code reader who does not know this decision will see groups named "(Whole class)" with no editing UI and a programme-specific trigger, and reasonably ask "why?" This ADR is that answer.
- The trigger introduces hidden logic at the data layer. Future contributors must know to grep for `child_programme_enrollments` triggers when debugging "child enrolled but groupless" issues. The trade-off is that the invariant is preserved without depending on every application code path to remember the membership insert.
- "Remove a child from 1000 Stories" is unambiguously an enrollment-end action, not a group-edit action. The two concepts stay separate, which prevents the "two ways to remove a child" bug class.
- For the May 2026 go-live, only the SQLite-side trigger and the seed-time membership inserts are on the critical path. The Postgres-side trigger and HO dashboard integration are next-year work.

## Considered alternatives

- **Class stands in for the group at the data layer.** No `groups` rows for 1000 Stories; sessions have `class_id` set and `group_id` NULL. Rejected: forces `sessions.group_id` to stay nullable forever and special-cases every group-aware query. Saves a few dozen rows per school at the cost of permanent branching in code.
- **Synthetic group with application-level membership maintenance.** Every "add child + enroll in 1000 Stories" code path inserts the membership explicitly, no trigger. Rejected: the invariant becomes application-level and depends on every future code path remembering it. Easy to forget when a new flow is added; the resulting bug (enrolled but groupless child) is silent until session capture fails.
- **Synthetic group with lazy membership at session-capture time.** When an EA captures a 1000-Stories session and an attendee is missing the membership, the session-write path creates it. Rejected: the invariant is *eventually* true, not always true. Reporting queries between enrollment and first session would see a groupless child.
- **Synthetic group with EA-editable composition.** EAs can add or remove children from the 1000-Stories group like any other; removing implicitly ends the enrollment. Rejected: conflates "remove from group" with "end enrollment" — two terms for one concept, two UI affordances doing the same job, a bug factory.
