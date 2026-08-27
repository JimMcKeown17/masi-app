# Group-Centred Session Workflow

**Status:** Active product and architecture specification. Not built end to end on `main`.

**Extracted 2026-07-23 from:** the completed and mostly stale
[`Zazi iZandi to Masi feature-port roadmap`](./archive/zazi-izandi-feature-port-roadmap.md).

## Why this specification exists

Masi's operational unit is a group block, but the current capture flow still resolves a group
selection into child ids and stores a child-oriented session. `sessions.group_id` exists locally,
yet the outbound payload currently strips it. That means the server cannot answer a basic
longitudinal question: which group received this session?

This work is not a navigation reskin. It crosses access grants, group identity, RLS, local
persistence, sync payloads, session lifecycle, and reporting. The dependency order is load-bearing.

## Locked domain rules

- One completed session represents one group block of work.
- EAs need whole-class visibility for control-group assessment and replacing a child who leaves a
  delivery group. Assessment scope can therefore be wider than delivery scope. The access model that
  makes this coexist with assignment-scoped delivery is settled in
  [ADR-0005](../docs/adr/0005-assessment-delivery-scope-two-tier-access.md): class assignment =
  assessment scope, delivery assignment = delivery scope, group assignment = composition-edit scope;
  assessment history follows class scope (current year), session history follows delivery scope.
- Group membership and class membership retain history. Head Office does not hard-delete captured
  records merely to change the current operational view.
- The latest letters shown for a group come from that group's latest literacy session, not from a
  temporary per-child summary.
- Programme remains a first-class scope. Group, session, assignment, and reporting behavior must
  not silently fall back to job title.
- **The group-first shell is driven by programme *delivery mode*, not job title.** Every session
  carries a `group_id` *uniformly* — whole-class programmes use their synthetic one-row-per-class
  group (ADR-0002) — so the **data spine is universal**. The **capture UX adapts** to delivery mode:
  multi-group programmes (Core Literacy pairs, Numeracy/Zazi bands) show a group picker; whole-class
  programmes (1000 Stories, whole-class Yebo) auto-select the single synthetic group with no picker.
  Group size is configurable per programme, never hardcoded to 2 (Masi is already experimenting with
  4). This is what lets a new programme slot in by *configuration* (the future per-programme grouping
  matrix) rather than a new capture screen — maximum flexibility with one shell.

## Prerequisites

Do not start the group-first UI before these contracts are settled:

1. Extend sync dependency evidence beyond direct `child_ea_assignments`. The current
   `GRANT_SUBJECTS` model does not represent class- or group-membership-mediated grants.
2. Define collision-proof identity and lifecycle rules for `grouping_versions`,
   `groups.display_number`, and `child_group_memberships`.
3. Define server authorization for non-null `sessions.group_id`, including creator visibility,
   active Programme scope, assignment changes, history reads, and archive behavior. **The
   assessment/delivery/group access model, wider-scope history split, replacement authorization,
   and turnover behavior are now settled in [ADR-0005](../docs/adr/0005-assessment-delivery-scope-two-tier-access.md)
   and the `CONTEXT.md` settled decisions.** What remains here is the session-specific slice:
   authorization for a non-null `sessions.group_id` write and its archive behavior.
4. Update `rls-sync-contract-map.md`, canonical Supabase migrations, local migrations, repository
   producers, server-column allowlists, outbox ordering, and real-SQLite/RLS tests as one contract.

## Product requirements

### 1. Class detail becomes group-aware

- Provide a compact Children/Groups switch without hiding child-level escape hatches.
- Group cards show group number/name, child count, sessions this week, the current teaching focus,
  and the most recent session summary.
- Child replacement remains possible from the wider class roster.
- Auto-grouping is a separate future product feature. It is not part of this workflow.

### 2. Group detail becomes the operational hub

- Show current members and the group's latest literacy-session letters.
- Make the next action obvious: record a session for this group.
- Keep access to child results, assessment, letter mastery, and edit paths.
- Empty, stale, pending, and failed sync states must be explicit.

### 3. Session capture becomes group-first

- The user chooses one group block before entering literacy capture.
- The attendee set starts from the current group roster but can record justified attendance
  differences without rewriting historical membership.
- The local session and server session both persist the same non-null `group_id`.
- `session_attendees` remains the historical attendee snapshot.
- The server must never strip group context from a successfully synced session.

### 4. In-progress sessions become durable

- Persist an explicit draft state machine in SQLite.
- Surface a global "Session in progress" resume action.
- Warn before discard or navigation away.
- Recover the draft after force-quit, process death, offline restart, and normal app upgrade.
- Finalization must atomically persist the completed domain rows and their outbox work, then remove
  or close the draft without a split-brain window.

### 5. Product decisions still required

- Whether a group session needs an explicit timer.
- Whether attendance toggles belong in capture or are derived from the starting roster plus
  exceptions.
- Whether Masi needs a backfill mode for late entry.
- The exact copy and authorization model for Head Office changes visible to the EA.

Record settled answers in [`open-decisions-backlog.md`](./open-decisions-backlog.md) and the
build log before implementation.

## Deliberate non-goals

- No Zazi branding or yellow semantics.
- No automatic grouping algorithm.
- No group UI that writes only local `group_id` while the server discards it.
- No temporary child-first "last session letters" feature that will be deleted by this rebuild.
- No hard deletion of historical sessions, assessments, or membership history.

## Definition of done

- The group identity, grant, RLS, persistence, payload, ordering, and reconcile contracts are
  documented and behavior-tested.
- A session captured for a group on device A hydrates with the same group and attendees on device B.
- Force-quit recovery resumes an in-progress session without losing or duplicating work.
- Group cards and Group Detail derive their summaries from SQLite, not ad-hoc in-memory merge state.
- Low-end Android device gates cover roster scrolling, draft resume, capture responsiveness, and
  sync-state truthfulness.
- The build log records focused RED/GREEN evidence, full gates, migration deployment, live RLS
  probes, and physical-device results.
