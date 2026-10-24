# Whole-class assessment access — Design

> **Implementation status — 2026-10-23:** Tasks 1–8 are implemented on
> `feat/whole-class-assessment` (rebased through `6215c04`). Staging application of
> `20261023120000_whole_class_assessment_access.sql` needs Jim's go; staging verification and
> the A03/iPhone device gates remain open. The design and original recon below describe the
> starting point; current implementation and verification are recorded in
> [the build log](../../../documentation/build-log.md#2026-10-23--whole-class-assessment-access).

**Date:** 2026-10-23
**Status:** Decisions by Jim, 2026-10-23 (in conversation). Revision 4 after Codex design review rounds 1–3.
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

*Revision 2, after Codex design review round 1: reconcile by class, an exact grace predicate,
and a deterministic membership choice.*

### 5.1 Pull: the class roster scope

**Inputs.** The EA's own active class assignments in the active programme are already pulled and
persisted (`ClassesContext.js:190-224`, `preloadedChildData.js:439-444`). Never derive "my
classes" from the `classes` table: its SELECT also admits same-school staff and ended assignees
(`…alignment_schema.sql:338-366`).

**New scope, `classRoster`.** For those class ids it pulls two kinds of row:
- every open `child_class_memberships` row (`exited_at is null`) in those classes, chunked by
  class id;
- the children rows for those memberships, chunked, with full columns (W2).

**It is complete only when** both queries succeed and neither hits
`PULL_SCOPE_COMPLETENESS_LIMIT`. An incomplete or errored scope persists what it fetched, but
never feeds reconcile.

**Where it runs.** Implement it in **both** live paths (`ChildrenContext.performPullFromServer` and
`persistPreloadedChildData`). The dead `handleServices.pullRoster` is left alone.

**Persist order:** classes (already first), then children, then memberships, so the membership →
class foreign key holds.

**Writing a class-roster child:**
- It goes through the same `saveServerChildRow` path, so a history-reference stub is promoted to
  a full row (`childrenRepository.js:542-558`).
- `children.class_id` is not trusted for assessment metadata (5.3), so its FK nulling
  (`:674-683`) is harmless.
- Roster rows are written as `synced`, with no outbox rows.

**Class moves converge from server rows, never from inference** (rev 4, Codex rounds 2–3).
- The server allows one open membership per child per academic year, and so does the phone
  (`src/db/migrations.js:389-391`). So a child who moves A → B needs the old row closed before
  the new one can be saved.
- The roster query therefore fetches, **in one query**, every membership in the **active academic
  year** for the roster's children, open and closed, with `row_version`/`updated_at`.
  RLS allows it, because the child is readable through the current membership
  (`…alignment_schema.sql:855-859`).
- Persistence writes the closed rows first, carrying their real server `exited_at`, then the
  open rows. Every row goes through the existing per-id version guard
  (`domainRepositoryUtils.js:143-155`), which refuses a **lower** `row_version`.
  It does not order equal versions: the server's `enforce_row_version` refuses decreases but does
  not bump on update (`20261018180000_upload_contract_row_version.sql:28-43`). So a stale open
  copy at the same version, applied after the closed one within one pull cycle, can reopen it
  (Task 2 report). That is accepted: the window is seconds, and the next pull's class or delivery
  reconcile ends the reopened row, after which the replacement lands.
- No exit date is ever inferred. If an open local `synced` row still conflicts after the closed
  rows are applied, the incoming open row is skipped and logged, and the next pull converges.
  The same applies when the conflicting row is pending, failed or terminal.
- Tests:
  - A → B in one year, with delivery and class responses applied in both orders: the
    server-current membership ends up open and the old one closed with its server `exited_at`;
  - equal `enrolled_at` values;
  - a replacement whose `enrolled_at` is earlier than the old row's;
  - a pending local row that blocks the replacement.

**Publishing.** `ChildrenContext` bumps a `rosterVersion` after the scope persists.
`useAssessableChildren` (5.3) reloads on that version and on `ClassesContext`'s assignment
version, so either pull finishing first is safe. Cold start offline reads the last persisted
rows.

### 5.2 Reconcile: membership exits in the EA's classes

**The rule: reconcile by class, not by child.** A membership is a fact about a child and a
class, not about an EA.

- **Server.** `get_reconcile_acknowledgments` adds two keys, under the same `schema_version` 1;
  old clients ignore them:
  - `roster_class_ids`: the class ids of the caller's active class assignments in the active
    programme;
  - `roster_membership_ids`: every open membership in those classes.
  An authoritative empty roster is `[]`. An absent key, from an older server, means "not
  provided".
- **Candidates.** Local rows for children **not** in the delivery pass's `acknowledgedChildIds`
  (the two populations are disjoint, see below), with `class_id in roster_class_ids`,
  `exited_at is null`,
  `sync_status = 'synced'` and `id not in roster_membership_ids`. Those are ended with
  `exited_at = pulledAt`.
  - This covers the last control child leaving a still-assigned class.
  - It covers a delivery child's membership in that class too, because the roster key lists
    every open membership in the class, so both acknowledgments agree. Both come from one
    server snapshot.
- **Never a candidate:**
  - memberships in classes **not** in `roster_class_ids`. Losing a class assignment removes
    class-based access through the read model's join (5.3), not by inventing exits;
  - rows that are pending, failed or terminal;
  - anything at all when either key is absent or the snapshot is incomplete.
- **The existing delivery pass is unchanged** (it is by child, over `visible_children`). It
  alone owns every membership of a delivery-acknowledged child. The class pass never touches
  those children (rev 3, Codex round 2), so each breaker sees the whole of its own population
  and neither pass can apply a removal the other withheld.
  - The two passes cannot conflict: a membership the delivery acknowledgment keeps is open on
    the server, so if its class is in `roster_class_ids` it is also in `roster_membership_ids`.
  - They run in one transaction from one snapshot.
  - Test: 12 delivery memberships end inside a 40-child class. The delivery breaker trips, and
    the class pass ends none of those 12. Check both execution orders.
- **Breaker:** the existing per-scope mass-end breaker applies to the class pass as its own
  scope, `classRosterMemberships`. There is **no handover exemption**: a handover ends no
  memberships under this rule. A real mass exit, such as a whole class moving at year end, still
  escalates to needs-attention, as designed.

### 5.3 Phone read model

`childrenRepository.getAssessableChildren(userId)` returns one row per child: the union of two
arms.

- **Delivery arm.** Exactly `getMyChildren(userId)`'s population, unchanged (`:739-767`), with
  `is_delivery = true`.
- **Class arm.** Children with an open membership in a class where the EA has an active, own,
  active-programme `class_ea_assignments` row, on a non-archived class, with
  `history_reference = 0`. These have `is_delivery = false` unless the delivery arm also has
  them.

**Choosing the metadata membership.** Each child gets one deterministically chosen membership for
`class_id`, `grade` and `home_language`. It is chosen from that child's open memberships in the
EA's **assigned** classes, ordered by:
1. a membership whose `academic_year_id` is the active year;
2. otherwise the latest `enrolled_at`;
3. ties broken by `id` ascending.

A delivery child with no membership in an assigned class falls back to its existing class via
`children.class_id`, which is today's behaviour. The chosen `class_id` is also the one used as
`battery_runs.class_id`.

`useAssessableChildren()` exposes it, sorted into two sections (W3): `is_delivery` first, then
the rest.

### 5.4 Server: late-upload grace (W4)

W4 **adds** acceptance; it removes none. A new family or run is authorized when **either** of
these holds:
1. today's rule: `current_user_can_write_for_child(child)`, plus the open programme assignment;
2. the caller held a grant **for the child on local day `d`**, plus the open programme
   assignment.

Rule 1 stays as it is. An EA with a current grant may submit a result dated before that grant,
exactly as today. The date is phone-stamped at save, field staff are trusted, and narrowing
this would turn phone clock skew into lost results. That is a deliberate call against Codex
review round 1.

**`private.user_held_grant_on(p_child uuid, p_day date) returns boolean`**
- It is SECURITY DEFINER and `search_path`-pinned.
- It uses `ds = (p_day::timestamp at time zone 'Africa/Johannesburg')` and
  `de = ((p_day + 1)::timestamp at time zone 'Africa/Johannesburg')`.
- It returns true if any arm has a single interval that overlaps `[ds, de)`, with every row in
  that arm active at the same time:
  - **Delivery:** a `child_ea_assignments` row for the caller and child with
    `assigned_at < de` and `coalesce(unassigned_at, 'infinity') > ds`.
  - **Class:** a `class_ea_assignments` row `cea` for the caller, and a membership `m` for the
    child in `cea.class_id`, with
    `greatest(cea.assigned_at, m.enrolled_at) < least(coalesce(cea.unassigned_at,'infinity'), coalesce(m.exited_at,'infinity'))`,
    and that intersection overlapping `[ds, de)`.
  - **Group:** the same intersection, using `group_ea_assignments` and `child_group_memberships`
    (`joined_at`/`removed_at`, `…clean_base_schema.sql:164-174`).

**Bounds:** `p_day` must be on or before the Johannesburg date of `now()` and within an
`academic_years` row with `is_active`. Otherwise the result is false.

**Which date `d` is:**
- for `submit_assessment` (new family only), `d` is the payload's `assessment_date`;
- for `save_battery_run` (new run only), `d` is the Johannesburg date of `started_at`.

The committed-family confirmation and the existing-run lifecycle paths run first, unchanged
(`20261021120000_…:281-299, 428-478`). `save_battery_run`'s exact-`started_at` class membership
check is also unchanged.

**Known imprecision (accepted).** Group assignments are reactivated on the same row: the restore
clears `unassigned_at` and keeps `assigned_at` (`groupsRepository.js:113-151`). So that row's
interval hides an intervening gap, and a result dated inside the gap is accepted. Fixing this
needs grant-period history, which no table records. For trusted staff and a rare sequence
(assign → end → restore → end, then an upload dated in the gap), this is accepted and
documented. Class and delivery assignments are not restored in place today; turnover inserts a
new row (`CONTEXT.md` Class assignment).

### 5.5 Guards

- **`classesRepository.archiveClass`** (`:219-257`): its children and membership cascade only
  touches children the EA delivers to (an active local `child_ea_assignments` row) or created
  (`children.created_by = me`). It never rewrites class-roster rows or enqueues writes for them.
- **`deleteChild`/`EditChild`** are reachable only from delivery surfaces, which stay delivery
  scope. Add a repository-level refusal for a non-delivery, non-creator child.
- **`setLetterMastery`** refuses a child without an active local delivery assignment (C2). The
  mastery panel hides its confirm taps for `is_delivery = false`.

### 5.6 Surfaces that switch to `useAssessableChildren` (C1)

**Switch to the assessable roster:**
- `AssessmentChildSelectScreen.js:35`, standalone and battery, in two sections;
- `AssessmentsScreen.js:26` stats;
- `HomeScreen.js:46`: assessment coverage and the assessment-due card only;
- `ChildrenListScreen.js:62-66, 115`, "Unassessed". `getChildrenTabStats` (`dashboardStats.js:325-330`)
  takes two inputs, the delivery list for the child count and the assessable list for coverage;
- `AssessmentRankingScreen.js:58, 87-91` "not assessed".

**Stay delivery scope:**
- `LetterMasteryRankingScreen.js:29, 42` (mastery is delivery, C2);
- `SessionCountRankingScreen`, `ChildSelector`, `GroupPickerBottomSheet`, ClassDetail,
  onboarding and EditChild.

`AssessmentHistoryScreen.js:48` already resolves missing names through `getChildNamesByIds`. It
switches to the assessable roster for names, with that fallback kept.

`ChildResultsScreen` and `LetterTrackerScreen` receive their child and class from route params,
and use the 5.3 metadata when entered from an assessment surface.

## 6. Testing

- **PostgreSQL harness** (`scripts/assessment-results-postgres-harness.cjs`), including the grace
  predicate cases:
  - assign → end → submit, with the result dated inside and outside the window;
  - a class assignment and a membership that never overlapped, refused;
  - a same-day grant;
  - SAST/UTC midnight boundaries;
  - a future date, and a date outside the active year, refused;
  - `rls:probe` extended for `roster_class_ids` and `roster_membership_ids`, with a class-only
    seed.
- **Other harness cases:**
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
  - a class the EA no longer holds ends no memberships;
  - a child with delivery and class memberships keeps the memberships both passes acknowledge;
  - the last control child leaving a still-assigned class has their membership ended;
  - an absent key from an older server, or an incomplete scope, ends nothing;
  - a year-end mass exit trips the `classRosterMemberships` breaker;
  - a child with two open memberships in different years gets the active-year one's metadata;
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
