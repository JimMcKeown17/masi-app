---
status: accepted
date: 2026-07-24
---

# Assessment vs delivery access: a class/delivery/group tiered scope model

> **Implementation status — 2026-08-27:** The accepted tier model below remains the target, but
> Gate 0 live inspection found that current RLS does not implement it faithfully. Both session and
> assessment SELECT policies reuse `private.current_user_can_read_child`, whose class and group
> branches make session history broader than delivery scope; assessment reads also lack the
> current-academic-year bound. See
> [`../../documentation/pre-live-gate0-audit-2026-08-27.md`](../../documentation/pre-live-gate0-audit-2026-08-27.md).
> Align and behavior-prove the live predicates before history hydration.

## Context

Masi's field model separates two things an EA does with children: they **assess** and they **deliver an intervention**. In Core Literacy an EA assesses the *whole class* but runs the intervention with a *subset* (typically 12 children in 6 pairs), and must still assess the non-delivery children at end of year as a control group. When a delivery child leaves, the EA replaces them from the wider class. EAs turn over frequently, so an incoming EA must take over a class another EA assessed at the start of the year. Sometimes several EAs share the same physical classes (e.g. two EAs across 1A/1B/1C, four children each per class) and split the assessing between them by agreement.

The current mobile client narrows every read to the EA's **delivery** children: `childrenRepository.getMyChildren` and `preloadedChildData` both hydrate through `child_ea_assignments!inner` + active-programme enrollment, and `ClassesContext.getChildrenInClass` filters that already-narrowed list. So the wider class surface — needed for control-group assessment and for picking replacements — does not exist on the device.

Crucially, the **server** is already wider than the client, but inconsistently:
- `private.current_user_can_read_child` / `current_user_can_write_for_child` already grant read **and write** through four/three paths including a **class-assignment** branch (`class_ea_assignments` → `child_class_memberships`). Class assignment already confers assessment authority.
- `assessments` and `sessions` SELECT policies both call the general child-read helper. That makes both activity families class/group-readable as well as delivery-readable; it does not preserve the deliberately different history scopes defined below.
- `ClassesContext` already pulls active `class_ea_assignments` and persists them through
  `classEaAssignmentsRepository`. The remaining gap is that the assessment-capable wider-roster
  and history flow does not yet consume that durable class scope as one canonical SQLite-derived
  capability.

We needed a single authorization model that lets whole-class assessment and child-replacement coexist with assignment-scoped delivery, without exposing every EA's full delivery diary to every co-EA who shares a classroom.

## Decision

Adopt a **three-tier scope model**, with the class assignment as the durable primary grant.

1. **Class assignment (`class_ea_assignments`) is the primary grant and defines assessment scope.** It makes an EA responsible for a whole class within one programme: every child in the class is visible and assessable, including control-group children never delivered to. It is **durable across delivery churn** (it does not end when the EA's last delivery child leaves) and multiple EAs may hold an active class assignment for the same class (the active-unique index is `(class_id, ea_user_id, programme_id)`). Turnover is an explicit class-assignment swap using the existing `unassigned_at` / `handover_reason` columns.

2. **Delivery assignment (`child_ea_assignments`) defines delivery scope**, a subset of the class the EA runs the intervention with. It drives "My Children", session pickers, and daily targets. **Assessing never implies delivering** — an EA assesses control children on class scope without creating a delivery assignment (which would pollute delivery rosters and counts).

3. **Group scope (`group_ea_assignments`) authorizes composition edits / replacement.** Seeing the replacement pool is class-scoped; *editing* a specific delivery group requires owning that group (`current_user_can_write_for_group`). A co-EA who merely shares the classroom can see and assess your children but cannot reach into your delivery groups.

Wider-scope visibility is **split by activity type**:
- **Child identity / current roster** → class scope (the replacement pool).
- **Assessment history, current academic year only** → class scope. Serves turnover, control-group comparison, and co-EA divvy coordination. Bounded to the current year through the `child_class_memberships.academic_year_id` window. The current broad helper already has a class arm, but the assessment date/year bound is missing and must be explicit in the assessment-specific predicate.
- **Session / delivery history** → delivery scope only, and **capturer-agnostic**. Holding (or having held) a delivery assignment on a child shows every session that child attended, including sessions captured by the previous EA. The current live policy incorrectly reaches class/group arms through the general child-read helper and must be narrowed to an activity-specific delivery-history predicate. A handover therefore transfers delivery assignments, not just the class assignment; a pure-assessor takeover deliberately does not gain session history.

The **assessment divvy between co-EAs is soft coordination the app permits but never enforces.** Both EAs are authorized over the whole shared class; who assesses whom lives in human agreement (optionally a soft UI hint), never in RLS.

A child leaving a delivery group requires a **structured removal reason** (`child_group_memberships.removal_reason` enum + `removed_by`), distinct from the child-level `archive_reason`, retained for Head Office impact reporting. The child-archive cascade that auto-ends memberships must stamp a reason too.

## Consequences

- **Existing class-assignment hydration must be verified and integrated.** `ClassesContext` already
  pulls and persists active `class_ea_assignments`; the assessment flow must consume that durable
  state through a canonical SQLite query, prove inactive/revoked rows do not grant current scope,
  and ensure the Head Office source emits the required row per EA-class.
- **Activity-specific RLS predicates.** Assessment reads (`assessments`, `assessment_items`, `letter_mastery`) use current-year class scope; session/attendee reads use capturer-or-delivery-history scope. Neither activity family may inherit every arm of the general child-identity helper.
- **`getChildrenInClass` is a misnomer today** — it returns delivery children filtered by class, not the class. The wider class roster is a new read; the assignment-scoped delivery list (`getMyChildren`) is preserved unchanged alongside it.
- **`GRANT_SUBJECTS` single-hop error map** in `offlineSync.js` already flags that child writes granted *only* via class/group membership can false-terminal; that limitation must be resolved before class-mediated writes ship.
- **Cross-EA assessment visibility within a shared class is intentional** — it is how co-EAs avoid double-assessing. Session diaries stay private to the delivering EA.
- Most of the write side already exists: local class creation auto-emits the class assignment, HO already seeds at class grain, and group-scoped edit authority is already in RLS. The work is concentrated in class-assignment integration/verification, activity-specific history predicates, history hydration, and the additive removal-reason columns.
- This is **next-year (group-centred) workstream** scope, not May 2026 go-live. Go-live groups remain seeded and static.

## Considered alternatives

- **(B) Derive assessment scope from delivery** ("I can read any child in a class where I have ≥1 delivery child"), no explicit class-assignment row. Rejected: assessment scope would **collapse under delivery churn** exactly when a replacement is needed (the last delivery child in a class leaves → the EA loses the roster they must pick a replacement from); it cannot express a pure-assessor or a pre-delivery handover; and it requires a broader, slower, self-referential RLS predicate. Its main appeal — "no extra admin" — is largely illusory because local creation already auto-creates the row and HO already seeds at class grain.
- **(C) Two fully independent explicit grants (class + delivery), both HO-managed.** Rejected as needless admin burden; delivery is naturally a subset of class.
- **Ratify class read but require a delivery assignment to *write* an assessment.** Rejected: assessing a control child would force creating a delivery assignment, polluting delivery rosters and counts — the exact churn the model avoids.
- **Widen session reads to class scope.** Rejected: leaks every EA's full delivery diary to any co-EA sharing the classroom, even for children they never touch. The capturer-agnostic delivery-scoped policy already gives an incoming EA the previous EA's sessions once delivery transfers.
- **Encode the co-EA assessment divvy as a permission boundary.** Rejected: it is a labour-splitting agreement, not an authorization rule; enforcing it would block an EA from covering a sick colleague's half.
- **Reuse `archive_reason` for group removal.** Rejected: a child can leave a delivery group while staying enrolled in the class (becoming a control child); that is a membership event, not a child archive, and needs its own narrower taxonomy.
