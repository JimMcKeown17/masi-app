# SQLite Migration Design Spec

**Status:** Draft for review before implementation.

**Decision:** This is a clean-slate storage and backend rebuild for the Masi app. We are not preserving current local AsyncStorage domain data and we are not requiring backwards compatibility with the current Supabase backend.

## Why This Replaces The 2026-05-19 Plan

The previous plan assumed field-test data preservation was a major constraint. That led to a large legacy migration task, compatibility table names, compatibility view models, and current-backend cutover risk. The user clarified on 2026-05-20 that field users can install a fresh app and start from there. That removes a large amount of complexity.

The new objective is to build the correct offline-first model from day one:

- SQLite is the local source of truth for domain and sync data.
- Supabase Auth session storage and logs may remain in AsyncStorage.
- New Supabase backend is the target backend.
- Current Supabase data can be ported manually later if truly needed, but the app architecture does not bend around that possibility.
- The Zazi refactor log remains a primary source of implementation traps.

## Non-Goals

- No AsyncStorage-to-SQLite domain migration.
- No current-backend compatibility release.
- No `sessions.children_ids` or `sessions.group_ids` storage in the new local schema.
- No `staff_children` or `children_groups` compatibility tables in the new backend.
- No different-user pending-outbox recovery flow for old local data. Fresh installs start with a clean local SQLite database.
- No package-manager migration during this storage refactor.
- No full group-first session UX until the SQLite repository and outbox layers are in place.

## Package Manager Decision

Use npm for this refactor because the repo already uses npm scripts and `package-lock.json`. Converting to pnpm while replacing storage would add unrelated churn and make dependency failures harder to diagnose.

During this refactor, dependency changes must be explicit and reviewed in `package-lock.json`.

## Programme Model

Current Masi code uses job title as a proxy for session type and programme. That should end here.

Definitions:

- **Job title:** HR/user profile label such as Literacy Coach, Numeracy Coach, ZZ Coach, Yeboneer, or 1000 Stories.
- **Programme:** operational work stream such as literacy, numeracy, zazi-izandi, yeboneer, or one-thousand-stories.
- **Assignment:** the link that says a staff user, child, or group participates in a programme for a period.

Locked model:

- `job_titles` remains for profile display and role defaults.
- `programmes` becomes the operational dimension used by groups, sessions, assessments, and programme-specific progress.
- `staff_programme_assignments` links users to programmes and schools.
- `child_programme_enrollments` links children to programmes.
- `child_ea_assignments` links a staff user/EA to the children they are actively responsible for.
- Child programme membership is direct through `child_programme_enrollments`; staff assignment controls who can work with the child, not which programme the child belongs to.
- `classes` are school/year/grade containers and are not inherently programme-specific.
- `groups` are programme-specific and may optionally be class-specific.
- `sessions.programme_id` is stored at creation time. It is not inferred later from the user's current job title.
- `assessments.programme_id` is stored at creation time.
- `assessment_tools.programme_id` identifies which programme owns a tool.

## Programme Behavior

When an EA creates a child, the repository auto-enrolls that child in the EA's currently active programme assignment. This happens in the same transaction as the child insert.

`childrenRepository.save(child)` must perform the following in one `withTransaction` call:

1. Insert the `children` row.
2. Insert a `child_ea_assignments` row for `(current_user_id, child.id)` with `assigned_at = now()`.
3. Insert a `child_programme_enrollments` row for `(child.id, current_user_programme_id)` derived from the EA's active `staff_programme_assignments`.
4. Enqueue one `sync_outbox` row per inserted record.

Children may have multiple concurrent `child_programme_enrollments` rows. When two EAs in different programmes work with the same child, each EA sees only their programme's slice: their own sessions, their own assessments, and their own letter mastery records. Sessions and assessments store one `programme_id` at creation, derived from the actor's active `staff_programme_assignments`. The child's enrollment list is the union of all programmes any EA has worked with them in; it is not used to filter individual session or assessment writes.

`childrenRepository.getMyChildren(userId)` is scoped to the user's current active programme. It joins on:

- `child_ea_assignments` where `user_id = userId` and `unassigned_at is null`
- `child_programme_enrollments` where `programme_id` equals the user's active programme and `ended_at is null`

This means an EA's primary My Children list shows the children they are currently responsible for in their current programme. If an EA rotates from Programme A to Programme B, children who are only enrolled in Programme A disappear from that working list. They can be surfaced later through an explicit recent/history surface if needed, but not through the default My Children query.

## New Server Table Names

Use clean names instead of legacy compatibility names:

- `child_ea_assignments`, not `staff_children`
- `child_group_memberships`, not `children_groups`
- `session_attendees`, not `sessions.children_ids`
- `assessment_items`, not array fields as the source of truth

The old names can remain only in the old backend. The new backend starts clean.

## Local SQLite Architecture

Use `expo-sqlite` directly with:

- `src/db/client.js` for database open/init and serialized transactions
- `src/db/migrations.js` for schema versioning
- repository files under `src/db/repositories/`
- `src/utils/storage.js` as a temporary facade while contexts/screens migrate
- `src/db/debugDump.js` for support export

Repository rules:

- Screens never call SQL.
- All multi-row mutations happen inside one `withTransaction` call.
- Transaction object is threaded through nested repository operations.
- Any domain write that should sync enqueues or updates `sync_outbox` in the same transaction as the domain row.
- Marking a row synced and deleting the outbox row happens in the same transaction.
- Delete/archive operations are explicit outbox operations, never inferred from local absence.

## Local SQLite Tables

Foundation:

- `schema_migrations`
- `local_state`
- `sync_state`
- `sync_outbox`

Reference:

- `schools`
- `job_titles`
- `programmes`
- `staff_programme_assignments`
- `assessment_tools`

Domain:

- `classes`
- `children`
- `child_ea_assignments`
- `child_programme_enrollments`
- `groups`
- `child_group_memberships`
- `time_entries`
- `sessions`
- `session_attendees`
- `assessments`
- `assessment_items`
- `letter_mastery`

Every syncable domain table has:

- `sync_status` with values `pending`, `synced`, `failed`, `terminal`
- `last_sync_error`
- `server_updated_at` when inbound incremental pull is needed
- indexes for owner/scope columns and sync status

## Server Backend Requirements

The new Supabase backend must be created and verified before mobile storage is wired to it.

Important current Supabase change for new projects:

- New public tables may not be exposed to the Data API automatically. Every table the mobile client reads or writes must have explicit grants for `authenticated`, with RLS enabled and policies in place.
- Source: Supabase's May 2026 developer update notes that new projects can opt out of automatic Data API exposure, so explicit grants are part of this plan's backend gate: `https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically`.

Migration convention:

- Use `supabase/migrations/` and Supabase CLI-created migration filenames for the new backend.
- Keep `supabase-migrations/` only as historical reference for the current backend.
- Rationale: the new backend is a fresh project, so we should use Supabase's canonical CLI migration flow from day one instead of continuing the older plain-file convention.

Server rules:

- Enable RLS on every table in exposed schemas.
- Grant only needed table privileges to `authenticated`.
- Keep service-role-only seed/admin paths out of the mobile app.
- Never expose service-role or secret keys through Expo config.
- Do not use user-editable metadata in RLS authorization.
- Keep internal helper functions in a private schema.
- Do not rewrite policy SQL by string replacement against `pg_policies`.
- Use explicit `CREATE POLICY`, `DROP POLICY`, or `ALTER POLICY` statements.
- UPDATE/upsert paths must have matching SELECT visibility.

## RLS Policy Strategy

Read visibility: all mobile-created tables such as `children`, `classes`, and `groups` have two SELECT policies for `authenticated`: one through the relevant assignment or membership join, and a fallback `created_by = auth.uid()` policy to preserve upsert visibility for newly inserted rows that have not yet synced their assignment.

Handover model for writes: writes to `sessions`, `session_attendees`, `assessments`, `assessment_items`, and `letter_mastery` require an active `child_ea_assignments` row for the actor at the time of write. Reads remain available for any historical assignment. After handover, when `unassigned_at` is set, the old EA cannot insert or update child-specific event rows for that child.

Self-scoped tables: `time_entries` rows are visible and writeable only to the EA whose `user_id` matches `auth.uid()`. No assignment join is needed.

Class creation: `classes` are EA-created with `created_by = auth.uid()`. Admin-preloaded classes use service role and never the mobile path.

Cross-programme reads for the same child are permitted at the RLS layer. The app enforces programme-scoped display by filtering at the repository/query layer; RLS does not enforce programme isolation on reads. Writes remain programme-scoped because `sessions.programme_id` and `assessments.programme_id` are set from the actor's active `staff_programme_assignments` at creation.

Known future revisit trigger: if Masi introduces less-trusted account classes such as third-party partner accounts or parent read-only access, revisit programme-scoped RLS. The broad-read policy is acceptable for the current trusted field-staff app, but it should not be assumed correct for every future audience.

## Sync Model

Use durable outbox sync, not `synced:false` array scanning.

Outbox operations:

- `insert`
- `update`
- `archive`
- `hard_delete`
- `restore`

Outbox statuses:

- `pending`
- `in_flight`
- `failed`
- `terminal`

Push order:

1. `time_entries`
2. `classes`
3. `children`
4. `child_ea_assignments`
5. `child_programme_enrollments`
6. `groups`
7. `child_group_memberships`
8. `sessions`
9. `session_attendees`
10. `assessments`
11. `assessment_items`
12. `letter_mastery`

Failure rules:

- `23505` can be equivalent success only when the server state is known equivalent.
- `23503` is terminal and remains visibly failed.
- `42501` is terminal and remains visibly failed.
- Network/timeouts are retriable using `next_retry_at`; do not sleep inside the whole sync loop.

## UI Migration Principle

Migrate data plumbing before redesigning workflow.

Allowed before SQLite:

- plan/spec work
- read-only group exploration
- release metadata
- log/export improvements

Blocked until SQLite/outbox exists:

- full group-first session capture
- group attendance
- session resume/backfill
- group history that depends on normalized session attendees

## Field Cutover

Cutover communication is the user's responsibility. The user will notify all field staff 1-2 days before the new build is distributed. Unsynced data on field devices at the moment of the new-build install is acceptable to lose; no support-export step is required from field staff before cutover.

Cutover is one-shot: everyone receives the new build at the same time. There is no rolling internal-then-wider field phase.

Risk acknowledged: a defect in the new build affects all field staff at once with no fallback group on the old build. Mitigation is internal Android validation in Plan 6 Task 5, including at least one real-device session covering the full offline-write/sync/restart loop before the new build is distributed.

## Review Checkpoints

Each implementation plan must end with:

- targeted tests
- `git diff --check`
- refactor log update
- parallel code-review pass focused on the changed surface, using `feature-dev:code-reviewer` if that agent is available in the implementation environment
- user signoff before the next plan starts

The shared log is durable and more important than any individual plan. Add every decision, bug, review finding, and verification result to `documentation/sqlite-refactor-log.md`.
