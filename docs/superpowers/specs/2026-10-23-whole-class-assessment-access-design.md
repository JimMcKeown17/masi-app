# Whole-class assessment access — Design

**Date:** 2026-10-23
**Status:** Decisions by Jim, 2026-10-23 (in conversation). Ready for plan and Codex review.
**Implements:** ADR-0005's two-tier access model. Assessment scope is the class; delivery scope
is a subset. Today the phone only implements delivery scope.
**Consumed by:** WelaPLUS Plan 3 (`docs/superpowers/plans/2026-10-23-welaplus-plan-3-host-run-flow.md`).
Its child select, overview and Question host read the roster defined here.
**Evidence:** a read-only recon of `origin/main` `0c5d161` (five agents, 2026-10-23). The
file:line citations below come from it and were spot-checked by Claude.

## 1. Why

EAs must be able to assess **every child in a class they are assigned to**: the children they
deliver to, and the class's control-group children (Jim, 2026-10-23). WelaPLUS is an evaluation
battery, so control children are its point. Today every assessment picker uses `useChildren()`
→ `childrenRepository.getMyChildren`, which is delivery scope only (`childrenRepository.js:739-767`).
The phone never downloads control children (`preloadedChildData.js:279-313`).

## 2. What already works (no change)

- **Server reads.** `private.current_user_can_read_child` has a class arm: an active
  `class_ea_assignments` row plus an open `child_class_memberships` row. It already exposes
  control children, their memberships and their enrolments
  (`20260521144901_masi_zazi_alignment_schema.sql:442-481, 667-670, 693-695, 855-860`).
- **Server writes.** `submit_assessment` and `save_battery_run` authorize through
  `private.current_user_can_write_for_child`. That function has the same class arm (`:483-517`),
  and both RPCs also require an open `staff_programme_assignments` row
  (`20261021120000_assessment_results_contract.sql:281-299, 428-444`).
- **Result history.** `can_read_assessment` and the history pagers already have a class arm for
  the active academic year (`20261022120000_assessment_history_pull.sql:8-55, 207-224, 355-371`).
  So a control child's results from any EA already come down.
- **Upload classification.** `GRANT_SUBJECTS` for `assessments` and `battery_runs` has a
  `membershipMediatedChild` arm (`offlineSync.js:172-211, 384-417`). A 42501 whose only grant is a
  not-yet-synced class assignment retries. It is not terminal, provided the local membership and
  class-assignment pair exists.

## 3. Decisions (Jim, 2026-10-23)

| # | Decision |
|---|---|
| W1 | **The class is everyone with an open membership** in a class the EA holds an active class assignment for, in the active programme. Programme enrolment is **not** required. This matches the server's write rule, so control children work however Head Office loads them. |
| W2 | **The phone holds the full child record** for control children, the same columns as delivery children. Jim accepted the POPIA cost: more personal data on more phones. This is recorded here so the Data Protection review sees it. |
| W3 | **The picker shows two sections**: "Your children" (delivery scope) first, then "Rest of the class". Each section is sorted as today, and search covers both. |
| W4 | **Late uploads are accepted if the EA was allowed on the assessment date.** A new family or run is authorized when the EA held a delivery, class or group grant for the child **on the result's local date**, even if that grant has since ended. The open programme assignment check stays. |

## 4. Calls I made (Jim can override)

- **C1. One assessment population everywhere assessments are counted.** These surfaces read
  the class-scoped roster:
  - the assessment pickers (standalone tests and WelaPLUS);
  - the Assessments tab "% Assessed";
  - Home's "children to assess" and its assessment-due card;
  - the Children tab's "Unassessed";
  - the ranking screens' "not assessed" lists.

  Delivery surfaces stay on `getMyChildren`: My Children, the session and attendee pickers,
  groups, daily targets, ChildOnboarding and EditChild. *Why:* Home and the Assess tab must
  agree on "x of N assessed".
- **C2. Letter-mastery confirmation stays delivery-only.** Confirming that a letter was taught is
  a delivery act, and the server's `set_letter_mastery` is delivery-only
  (`20261021160000_letter_mastery_current_state.sql:22-35, 198-203`). For a control child, the
  confirm taps are hidden. Mastery shown from assessment evidence still works.
- **C3. Roster year.** The class roster is open memberships, matching the server write rule and
  W1. Results read back only for the active academic year, as today. A child with an open
  prior-year membership can be assessed. The EA sees their own result, but not co-EAs' results
  for that child. This is documented, not fixed.
- **C4. The class roster is a separate local read model.** `getMyChildren`, `ChildrenContext` and
  `getChildrenInClass` keep meaning delivery scope. Widening them would leak control children
  into session pickers and daily targets.

## 5. Design

### 5.1 Pull: the class roster scope

The pull adds a class-roster scope. Its roster is the children with an open
`child_class_memberships` row in a class where the EA has an active, own, active-programme
`class_ea_assignments` row. It pulls:
- those children rows;
- their open memberships;
- the classes, which `ClassesContext` already scopes correctly (`ClassesContext.js:190-203`).

Rules for the pull:
- Never derive "my classes" from the `classes` table. Its SELECT also admits same-school staff
  and ended assignees (`:338-366`).
- Implement it in **both** live pull paths (`ChildrenContext.performPullFromServer` and
  `persistPreloadedChildData`), not in the dead `handleServices.pullRoster`.
- Persist classes, then children, then memberships, so the membership → class foreign key holds.
- Chunk every `.in()` list.
- An incomplete or errored scope is never reconciled (`PULL_SCOPE_COMPLETENESS_LIMIT`,
  `preloadedChildData.js:3`).

### 5.2 Reconcile: keeping the class roster fresh

Today's membership reconcile only covers the server's delivery children (`visible_children` in
`get_reconcile_acknowledgments`, `20260714220000_…:41-84`). So a control child who leaves the
class would stay assessable on the phone forever. The server would then refuse the upload.

- **Server.** `get_reconcile_acknowledgments` gains two keys, keeping `schema_version 1`; old
  clients ignore keys they don't know:
  - `class_roster_child_ids`;
  - `class_roster_membership_ids`, the open memberships in the EA's active class assignments.
- **Phone.** The membership reconcile runs a second pass over the class-roster children using
  those keys. The usual rules hold: it ends only `synced` rows, never on an incomplete scope.
- **Mass-end breaker.** A class handover legitimately ends a whole class's memberships at once.
  When the EA's `class_ea_assignments` row for that class has itself been ended by the same
  reconcile, those memberships are exempt from the breaker. Every other mass end still
  escalates.

### 5.3 Phone read model

`childrenRepository.getAssessableChildren(userId)` returns one row per child in the class
roster, built from three tables:
- `children`;
- open `child_class_memberships`;
- the EA's active `class_ea_assignments` in the active programme, on a non-archived class.

It excludes `history_reference = 1` and is deduplicated against delivery. Each row has the
following fields:
- `is_delivery`, true when the EA also holds an active `child_ea_assignments` row for the child;
- `class_id`, `grade` and `home_language` from the **membership's** class, never from
  `children.class_id`, which can be null before the class row lands
  (`childrenRepository.js:416-428`).

A `useAssessableChildren()` hook exposes it, reloading on pull and roster changes like
`useChildren()`.

**Who is in it.** A delivery child who has no class membership is still assessable, as today. It
appears under "Your children" with its class from `children.class_id`. So the roster is
`delivery ∪ class roster`.

### 5.4 Server: late-upload grace (W4)

A new `private.user_could_write_for_child_on(p_child_id uuid, p_on date)` returns true when the
caller held any of these grants **covering local date `p_on` in Africa/Johannesburg**:
- a `child_ea_assignments` row;
- a `class_ea_assignments` row with a `child_class_memberships` row for that class;
- a `group_ea_assignments` row with a `child_group_memberships` row.

"Covering" uses the `assigned_at`/`unassigned_at` and `enrolled_at`/`exited_at` windows.

`submit_assessment` (new family) and `save_battery_run` (new run) accept
`current_user_can_write_for_child(child) OR user_could_write_for_child_on(child, d)`, where:
- `d` is the payload's `assessment_date` for an assessment;
- `d` is the local date of `started_at` for a run.

Both keep the open programme check. The date must also be in the active academic year and not
after today, so the grace window cannot be stretched by a forged date. `save_battery_run`'s
`class_id` membership-at-`started_at` check is unchanged.

### 5.5 Guards

These guards stop class-scope rows from being edited as if they were the EA's own:
- `classesRepository.archiveClass` (`:239-257`) only rewrites `class_id` on children the EA
  delivers to or created. It never rewrites class-roster rows.
- `deleteChild`/`EditChild` are unreachable for a non-delivery child.
- `setLetterMastery` refuses a child without an active local delivery assignment (C2).

## 6. Testing

- **PostgreSQL harness** (`scripts/assessment-results-postgres-harness.cjs`):
  - a class-only EA can submit and save a run for a control child;
  - that is refused after the class assignment ends, unless the result's date falls inside the
    old window (W4);
  - it is refused with no open programme assignment;
  - it is refused for a future date or a date outside the active year;
  - the new acknowledgment keys contain only the caller's active class rosters.
- **Real-SQLite integration:**
  - the class-roster pull persists children, memberships and classes in order;
  - an incomplete scope never reconciles;
  - a control child who leaves the class has their membership ended and drops out of
    `getAssessableChildren`;
  - pending and failed rows are never ended;
  - a handover is exempt from the breaker, but any other mass end still escalates;
  - `getAssessableChildren` takes class, grade and language from the membership.
- **Scope assertions:** a control child appears in both assessment pickers and every C1 surface.
  It does **not** appear in My Children, the session and attendee pickers, groups or daily
  targets.
- **Sync:** a control child's result whose class assignment is still pending retries. A result
  dated inside an ended window succeeds.
- **Device gate (A03 + iPhone):** sign in as a class-assigned EA, see "Rest of the class", assess
  a control child (standalone letter test and WelaPLUS), sync, and verify the rows in staging.

## 7. Docs that change in the same branch

- `documentation/rls-sync-contract-map.md`: the class-roster pull row, the reconcile
  acknowledgment keys, the grace rule, the Error Classification precondition (the local pair
  must exist) and the letter-mastery exclusion.
- `CONTEXT.md`: add "Control child", and update the ClassDetail note around line 305.
- ADR-0005: a dated implementation-status note.
- `documentation/ROADMAP.md`: the whole-class visibility item.
- `PRD.md` access sections.
- `documentation/build-log.md`.

## 8. Not in scope

- A class-wide ClassDetail roster screen.
- Control children in session or group screens.
- Letter-mastery confirmation by class assessors.
- Programme-loss recovery for open runs (Plan 3 Known Limits).

## 9. Risks

- **More personal data on more phones (W2).** Accepted by Jim.
- **Device-side stale roster** until the next pull. Mitigated by reconcile (5.2). The server
  remains the authority.
- **Head Office data.** This depends on Head Office emitting one `class_ea_assignments` row per
  EA per class, co-EAs included (ADR-0005's premise). That is unverified, and the device gate
  checks it on staging.
