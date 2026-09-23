---
status: accepted
date: 2026-09-23
---

# Submitted assessments are immutable; answer identity stays as it is

Jim decided on 2026-09-21 that correcting an assessment answer is an edit only until the assessment
is submitted, and that the assessment is locked afterwards. The app already behaves this way by
construction. Marks live only in screen state until the EA finishes, and `finishAndSave` persists the
assessment and all its `assessment_items` exactly once, in one SQLite transaction with their outbox
rows. No screen, repository function, or outbox path edits a saved assessment, and "assess again"
creates a new attempt. We therefore treat the save as **submission** and make the lock an enforced
contract rather than an accident of the current screens. EAs may add assessments and answers; they
may not change or delete them. A later correction is a new attempt, and the latest attempt is
canonical.

`assessmentItemDomainId` hashes `(assessment_id, position ?? item_key, correct|incorrect)`, while
PostgreSQL allows one non-null item per `(assessment_id, position)`. Under mutable answers this would
be a defect: a corrected mark would get a new id, collide with the old row (`23505`), and be
quarantined permanently as terminal. Under immutability the collision cannot arise, so we keep the
id as it is. Changing it would rekey every existing positioned row and buys nothing while submitted
answers never change.

## Considered options

- **Mutable positions with a stable per-position id.** Remove correctness from the id and push
  corrections as updates. Needed only if submitted answers may change, which Jim ruled out. It costs
  a rekey, update-capable RLS, and conflict rules for concurrent corrections.
- **Record the rule without enforcement.** Cheapest option, but hosted RLS today lets the owning EA
  update and delete assessments and items indefinitely, so the rule would hold only while every
  future screen happens to respect it.
- **Enforce immutability and keep the id** (chosen).

## Consequences (implemented with the assessment-history slice, Step 3 of the plan)

- **Supabase:** remove EA `UPDATE` and `DELETE` on `assessments` and `assessment_items`. Head Office
  and service-role tooling are outside this mobile contract; Q11 calibration remains additional HQ
  rows (ADR-0004), never edits of EA rows.
- **Outbox:** push this family as insert-or-ignore by `id`, the pattern already used for immutable
  assignment inserts. A plain upsert that meets an existing row requires `UPDATE` permission, so a
  harmless retry of an already-landed answer would otherwise fail.
- **Repository:** `saveAssessment` refuses to save an assessment id that already exists locally,
  pinned by a real-SQLite test.
- **Drafts:** any future "save an unfinished assessment" feature keeps draft marks outside
  `assessments`/`assessment_items` until submission. Mid-Question resume remains unsupported
  (`CONTEXT.md`).
- **Hydration:** pulled assessment families are write-once facts, so idempotent inserts are enough
  and no correction conflict rule is needed.
- Revisit if Masi ever needs post-submission correction (for example, a supervisor fixing a
  mis-mark). That would need the stable-id option above plus an audit trail, not an in-place edit.
