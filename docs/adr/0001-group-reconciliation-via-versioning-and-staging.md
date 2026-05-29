---
status: accepted
date: 2026-05-27
updated: 2026-05-29
---

# Group reconciliation via versioning and a staging surface

> **Update 2026-05-29 — the two deferred implementation choices are now resolved.**
> - **Staging surface:** a `staged` status on `grouping_versions` (widen the `status` CHECK from `('active','archived')` to add `'staged'`), **not** a separate `proposed_groupings` table. A staged version carries its own `grouping_version_id`; its memberships are invisible to EA-facing reads because those reads scope to `class_grouping_state.active_grouping_version_id`. Acceptance flips that pointer to the new version and stamps the existing `accepted_at` / `accepted_by_user_id` columns. The separate-table option was rejected because it forks the membership model and forces a copy-on-accept dual-write that the offline outbox handles poorly.
> - **Provenance:** a `last_written_by_role` column (`'ea' | 'head_office'`) on `child_group_memberships`, **not** an audit-log table. The itemized-merge gate needs only the row's *current* last-writer, not full history; `grouping_versions` already records version-level who/when. The column lives on memberships only (placement provenance, not group identity).
>
> Both remain next-year work; only the schema shape is fixed. The reasoning is captured in `CONTEXT.md` settled decisions.

## Context

Two parties write to Masi child-group memberships: EAs (in the mobile app, editing the groups they work with) and Head Office (in a planned NextJS dashboard, regrouping based on long-form Field Assessments). Last-write-wins sync would silently destroy intentional EA field edits when a Head Office regrouping push arrives — a trust-killer for an app used by young, low-trained field staff. The existing SQLite schema already includes `grouping_versions`, `class_grouping_state`, and `grouping_version_id` on `groups` and `child_group_memberships`, anticipating this exact problem.

## Decision

Groupings are versioned snapshots, not mutable state. Day-to-day EA edits — add, remove, move children — happen **inside the active version** without bumping the version number. A new version (v2, v3…) is created only by deliberate re-grouping events: a Head Office regrouping push, or a future "redo all groups" EA action. New versions written by Head Office land in a **staging surface** (`grouping_versions.status = 'staged'` — resolved 2026-05-29, see header), never silently active.

When a staged version exists, the EA sees an explicit acceptance gate (Option B: itemized merge): for each child whose membership in the active version was last written by the EA, the EA picks "Keep my edit" or "Use office's placement." For children with no EA edits, the office placement applies via bulk accept. No deadline, no auto-apply — staged versions wait indefinitely until the EA decides. Membership changes carry provenance (per-row `last_written_by_role` column — resolved 2026-05-29, see header) so the gate UI knows which rows to surface.

Head Office never writes to Supabase directly — all writes flow through the NextJS dashboard, which is the only producer of staged grouping versions.

## Consequences

- Historical reporting can recover the *exact grouping* a child was in at the time of any session or assessment by reading the row's `grouping_version_id` and joining through `child_group_memberships` for that version. Longitudinal grade/dosage research depends on this.
- The acceptance gate is a rare event (most classes have one version per year), so the gate UX can afford to be slow and explanatory rather than fast.
- Sync remains last-write-wins for memberships *within* a version, because two writers are no longer expected within a version after this decision. Only Head Office regroups produce a new version.
- The NextJS dashboard is now on the critical path for any Head Office grouping workflow; until it exists, all grouping is EA-driven in the field.
- The `class_list_status` lifecycle (`building` / `complete` / `reopened`) remains a soft nudge in the EA UI, not a hard gate — EAs must be able to add a new mid-term child without an explicit "reopen the class" ceremony.

## Considered alternatives

- **Last-write-wins.** Rejected: silently destroys EA field intelligence when Head Office pushes.
- **Bulk accept gate (no per-child merge).** Rejected: accepting an office regrouping would erase EA edits unless the EA manually re-applies them after.
- **Stay-or-Switch (wholesale diff).** Rejected: forces an all-or-nothing choice; in practice EAs will want to keep some edits and adopt some office moves.
- **Advisory-only office push (no acceptance).** Rejected: Head Office still needs an effective way to push regroupings; pure notification is too weak.
- **Head Office writes Supabase directly via Studio.** Rejected: Head Office staff are not technical; a dashboard is needed regardless, and that dashboard is the natural place for the staging-surface logic.
