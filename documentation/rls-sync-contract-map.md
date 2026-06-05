# RLS / Sync Contract Map

This is the current source of truth for how the SQLite app writes local rows, pushes them through `sync_outbox`, and satisfies Supabase Row Level Security on the clean-slate `masi-app-sqlite` backend.

Use this map before changing any synced table, repository producer, outbox operation, migration, RLS policy, or Supabase payload allowlist. A table-level policy audit is not enough: the contract is the combination of producer fields, sync operation shape, RLS visibility, dependency ordering, and tests/probes.

## Backend Scope

- Backend: `masi-app-sqlite`
- Supabase project ref: `segygjzpujphwvrubusm`
- Canonical migrations: `supabase/migrations/`
- Historical migrations: `supabase-migrations/` is old-backend reference only
- Sync engine: `src/services/offlineSync.js`
- Local write boundary: repository methods under `src/db/repositories/`
- Durable queue: `sync_outbox`
- Server payload allowlist: `SERVER_COLUMNS` in `src/services/offlineSync.js`
- Insert order: `PUSH_ORDER` in `src/services/offlineSync.js`
- Archive order: `ARCHIVE_PUSH_ORDER` plus `ARCHIVE_TABLE_DEPENDENCIES` in `src/services/offlineSync.js`

## Global Contracts

1. Domain writes are local-first. A user-facing write must persist the domain row and enqueue the matching `sync_outbox` row in the same SQLite transaction.
2. RLS-required ownership and relationship columns must be present before enqueue. Missing values should fail locally through repository guards, not hours later as terminal sync failures.
3. Mobile upsert requires SELECT visibility. Supabase/PostgREST upsert checks row visibility while resolving conflicts, so policies must account for the exact operation shape, not only `INSERT WITH CHECK`.
4. Parent rows that create later access evidence need direct owner SELECT fallback. This is why `children`, `classes`, `groups`, and `sessions` keep direct creator/user visibility in addition to relationship-derived policies.
5. Relationship tables that grant access are not generic mutable rows. `child_ea_assignments`, `class_ea_assignments`, and `group_ea_assignments` have immutable identity columns protected by database triggers. Insert retries must not become identity-changing updates.
6. Insert and archive ordering differ. Insert can create access evidence early; archive must keep access-granting assignment rows alive until protected cleanup rows have synced.
7. Reference/admin tables are pulled from the server and are not mobile-writable through app-role DML.

## Operation Semantics

| Operation shape | Tables | Server call | RLS implication |
| --- | --- | --- | --- |
| Default outbox push | Most synced domain tables | `upsert(payload, { onConflict: 'id' })` | Needs both write permission and SELECT visibility for upsert. |
| Batched upsert | `assessment_items` | `upsert(payloads, { onConflict: 'id' })` | Parent `assessments` row must be visible/writable first. |
| Immutable assignment insert retry | `child_ea_assignments`, `class_ea_assignments`, `group_ea_assignments` when `operation === 'insert'` | `upsert(payload, { onConflict: 'id', ignoreDuplicates: true })` | Duplicate insert retry must be insert-or-ignore, not update-capable upsert, because identity triggers reject changed identity/timestamp columns. |
| Assignment archive/update | Same assignment tables when `operation === 'archive'` or update-like payload | Update-capable upsert | Allowed only for lifecycle fields such as `unassigned_at` / `handover_reason`; identity columns remain immutable. |
| No-history child delete | `children` hard delete | RPC `delete_child_if_no_history(p_child_id)` | Direct mobile child DELETE is blocked; history rows require archive instead. |

## Upsert Visibility Rules

These direct SELECT fallbacks are intentional and should not be removed just to satisfy advisor output:

| Table | Required direct visibility | Reason |
| --- | --- | --- |
| `children` | `children_select_created_by` with `created_by = auth.uid()` | Child row syncs before child EA assignment/programme/class relationship rows can authorize relationship-derived SELECT. |
| `classes` | `classes_select_created_by` with `created_by = auth.uid()` | Mobile-created class row syncs before the matching class EA assignment may authorize relationship-derived SELECT. |
| `groups` | `groups_select_created_by` with `created_by = auth.uid()` | Mobile-created group row syncs before group EA assignment and memberships may authorize relationship-derived SELECT. |
| `sessions` | Direct `user_id = auth.uid()` inside the session SELECT policy | Session parent syncs before `session_attendees` exist, so attendee-derived SELECT cannot be the only visibility path. |

Accepted advisor context: `multiple_permissive_policies` warnings on `children`, `classes`, and `groups` SELECT are expected while the mobile client uses Supabase upsert from queued local rows.

## Table Contract Map

| Table | Producer | Local required fields | Sync operation | RLS authority / SELECT dependency | Ordering / dependencies | Tests and probes |
| --- | --- | --- | --- | --- | --- | --- |
| `time_entries` | `timeEntriesRepository` | `id`, `user_id` | Default upsert | Self-scoped by `user_id = auth.uid()` | No domain dependencies | `offlineSyncOutbox.test.js` time-entry sync coverage |
| `classes` | `classesRepository.saveClass` | `id`, `created_by`, active `programme_id` for local class EA assignment | Default upsert | `classes_select_created_by`; `private.current_user_can_access_class` / `private.current_user_can_write_for_class` | Before `children`, `class_ea_assignments`, grouping rows, sessions with `class_id` | `classesRepository.test.js`; `sqlitePlan1Migrations.test.js` creator SELECT coverage |
| `class_ea_assignments` | `classesRepository.saveClass`; `classEaAssignmentsRepository` | `class_id`, `ea_user_id`, `programme_id`, `created_by` | Insert uses insert-or-ignore; archive/update uses update-capable upsert | EA self assignment and class access; identity trigger blocks reassignment by update | Insert after `classes`; archive after dependent child/class cleanup rows | `junctionRepositoryGuards.test.js`; `offlineSyncOutbox.test.js` immutable assignment retry |
| `children` | `childrenRepository.saveChildRecord` / storage child facade | `id`, `created_by`; active programme and academic year when local save creates relationship rows | Default upsert; hard delete via RPC only | `children_select_created_by`; `private.current_user_can_read_child` / write helper | After `classes` only when `class_id` is present; before child relationship rows | `childrenRepository.test.js`; `sqlitePlan1Migrations.test.js`; live rollback child upsert probe |
| `child_ea_assignments` | `childrenRepository` relationship producer | `user_id`, `child_id`, `created_by` | Insert uses insert-or-ignore; archive/update uses update-capable upsert | Self assignment; insert helper for locally-created child; identity trigger blocks reassignment by update | Insert after `children`; archive after child programme/class/group cleanup | `childrenRepository.test.js`; `offlineSyncOutbox.test.js`; `junctionRepositoryGuards.test.js` patterns |
| `child_programme_enrollments` | `childrenRepository` relationship producer | `child_id`, `programme_id`, `created_by` | Default upsert | Active child write access plus active programme | Insert after `children` and child EA access evidence; archive before ending child EA assignment | `childrenRepository.test.js`; `offlineSyncOutbox.test.js` archive ordering |
| `child_class_memberships` | `childrenRepository` (incl. `updateChild` class-change reassignment); `childClassMembershipsRepository` | `child_id`, `class_id`, `academic_year_id`, `created_by` | Default upsert; on a class change the new membership is inserted (`insert` op) and the old active one is exited. If the old membership's original insert has already synced it is archived (`exited_at`, `archive` op); if that insert is still pending in `sync_outbox` (offline create→reassign before first sync) the reassignment **coalesces** by rewriting the pending insert to carry `exited_at` instead of queuing an archive (#35 P1) | Active child write access plus class access | Insert after `children` and `classes`; archive before ending child/class EA assignment. Membership archives sort **before** inserts (`ARCHIVE_PUSH_ORDER` 4 < `PUSH_ORDER` 5), so archiving a still-pending insert would reorder ahead of the stale active insert and recreate the old membership active — hence the unsynced case coalesces in place rather than archiving (same `updateChild` txn, #35) | `junctionRepositoryGuards.test.js`; `childrenRepository.test.js`; `childClassReassignment.test.js` (synced-archive, offline-coalesce, and end-to-end sync against a real-schema server) |
| `grouping_versions` | grouping repositories / class grouping flows | `class_id`, `academic_year_id`, `created_by` | Default upsert | Class write/access policy | After `classes`; before `class_grouping_state` and groups that reference a grouping version | `sqlitePlan1Migrations.test.js`; grouping repository tests |
| `class_grouping_state` | class grouping state repository | `class_id`, `academic_year_id` | Default upsert | Class write/access policy | After `classes` and `grouping_versions` when `active_grouping_version_id` is present | `offlineSyncOutbox.test.js` dependency coverage |
| `groups` | `groupsRepository.saveGroup` / `ChildrenContext.addGroup` path | `id`, `name`, `programme_id`, `created_by`; `class_id` when class-scoped | Default upsert | `groups_select_created_by`; group access helper via class/group EA assignment | After `classes` when `class_id` exists; before `group_ea_assignments` and memberships | `offlineSyncOutbox.test.js`; `sqlitePlan1Migrations.test.js`; live rollback group probes |
| `group_ea_assignments` | `groupsRepository.saveGroup`; `groupEaAssignmentsRepository` | `group_id`, `ea_user_id`, `programme_id`, `created_by` | Insert uses insert-or-ignore; archive/update uses update-capable upsert | EA self assignment and group ownership/access; identity trigger blocks reassignment by update | Insert after `groups`; archive after `child_group_memberships` cleanup | `offlineSyncOutbox.test.js` immutable assignment retry and group archive ordering |
| `child_group_memberships` | `groupsRepository.addChildToGroup` / child group facade | `child_id`, `group_id`, `grouping_version_id`, `created_by` | Default upsert | Active child write access plus group write/access | After `children`, `groups`, and group EA access evidence; archive before ending group EA assignment | `offlineSyncOutbox.test.js`; group ownership repair tests |
| `sessions` | `sessionsRepository.saveSession` | `user_id`, `programme_id` | Default upsert | Direct `user_id = auth.uid()` SELECT fallback plus session read/write helpers | Before `session_attendees`; after `classes` only when `class_id` exists | `sessionsRepository.test.js`; `offlineSyncOutbox.test.js` session-before-attendees lock; `sqlitePlan1Migrations.test.js` |
| `session_attendees` | `sessionsRepository.saveSession` | `session_id`, `child_id`, `attendance_status` | Default upsert | Parent session ownership plus active child/group/class access | After `sessions`, `children`, and `groups` when `group_id` exists | `sessionsRepository.test.js`; `offlineSyncOutbox.test.js` |
| `assessments` | `assessmentsRepository.saveAssessment` | `user_id`, `child_id`, `programme_id` | Default upsert | Direct owner plus `private.current_user_can_read_child`; writes require active child/programme access | After `children`; before `assessment_items` | `assessmentsRepository.test.js`; `sqlitePlan1Migrations.test.js` |
| `assessment_items` | `assessmentsRepository.saveAssessment` item producer | `assessment_id`, `item_key`, `position` / generated UUID `id` | Batched upsert with per-record fallback | Parent assessment visibility/write access | After `assessments` | `offlineSyncOutbox.test.js` batch and fallback coverage |
| `letter_mastery` | `masteryRepository.saveLetterMasteryRecord` | `user_id`, `child_id`, `programme_id`, `letter`, `language`, `source` | **Prevention, not reconciliation.** New rows get a **deterministic logical-key id** (`letterMasteryDomainId`), and `buildSyncPayload` maps **every** `letter_mastery` push to that id (so a pre-fix random local id on an OTA-updated device still lands on the canonical server row). Same record → same id on every device/install → insert-by-id is idempotent and the `23505` collision is **impossible by construction** (no runtime adoption). `saveLetterMasteryRecord` returns the canonical id so callers (`LetterTrackerScreen`) track the persisted row; `LetterTrackerScreen` also toggles off by logical key (defensive). A soft-delete/edit on a row whose `insert` is still queued **coalesces** into that pending insert (rewrites it) instead of a separate `archive`/`update` that could sort ahead of it (the #35 ordering hazard); once synced, soft-delete uses an `archive` op. **Mandatory deploy gates:** (1) legacy random-id `letter_mastery` rows on staging MUST be cleaned before the deterministic build ships (else a deterministic push 23505-collides with them — codified by the REGRESSION GUARD test); (2) the rollout must ensure no active old build still writes random-id rows. Local `record_id` may stay device-local for pre-fix rows — only the **push identity** is canonical (same pattern as `session_attendees`/`assessment_items`). | Direct owner plus `private.current_user_can_read_child`; writes require active child/programme access | After `children` | `masteryRepository.test.js`; `letterMasterySync.test.js`; `sqlitePlan1Migrations.test.js` |

> **`sessions` forward-prep columns (not yet in the push payload, RLS-guarded to defaults).** SQLite migration v3 (`sessions_forward_prep_columns`) and Supabase migration `20260529214500_masi_sessions_forward_prep_columns` add `sessions.group_id` (nullable FK to `groups`) and `sessions.state` (NOT NULL DEFAULT `'completed'`, CHECK on `completed|in_progress|paused|discarded`). These are schema-only for go-live: `sessionsRepository.saveSession` does **not** write them and they are **not** in the session push allowlist (`SERVER_COLUMNS`), so the `sessions` producer fields, upsert shape, and outbox ordering above are unchanged.
>
> Because the existing permissive session policies (`sessions_insert_active_programme`, `sessions_update_own`) only validate `user_id`/active programme — not these columns — the Supabase migration also adds two **RESTRICTIVE** guard policies (`sessions_forward_prep_pin_defaults_insert` / `_update`) that pin `state = 'completed' AND group_id IS NULL` at the write boundary. This prevents a direct/raw client from writing a non-default state or an unauthorized group before the feature exists. Submit-and-go writes (which omit both columns) pass the guard via the server defaults.
>
> The later state-machine slice must, in one migration applied **before** wiring client writes: drop both guard policies, add real per-state/per-group authorization, add the columns to the producer set and the push allowlist. Writing a column the server lacks would `PGRST204`, so the Supabase migration must land before the client begins sending these fields.

## Future RLS Audit Checklist

Use this checklist instead of a static "does the table have policies" audit.

1. Identify the exact repository producer and confirm it writes all RLS-required fields before enqueue.
2. Identify the exact Supabase call shape: default upsert, batched upsert, insert-or-ignore assignment retry, archive/update, delete, or RPC.
3. For every upserted table, prove SELECT visibility exists for the row at the moment it is pushed.
4. For rows that create future access evidence, verify the parent row has direct owner visibility until the evidence row syncs.
5. For relationship rows that end access, verify archive ordering keeps the access-granting row active until dependent cleanup rows sync.
6. For immutable assignment tables, verify insert retry cannot run an identity-changing update.
7. Confirm `SERVER_COLUMNS` includes every server-required writable column and strips every local-only screen/cache field.
8. Add or update a behavior test at the producer or sync-engine boundary.
9. Add or update a migration/static test for policy names or trigger invariants when RLS changes.
10. Run a live rollback probe for high-risk RLS changes before field builds.

## Current Accepted Advisor Warnings

| Warning | Status | Reason |
| --- | --- | --- |
| `multiple_permissive_policies` on `children`, `classes`, `groups` SELECT | Accepted for current SQLite backend | Direct creator SELECT fallback is required by mobile upsert visibility before relationship rows sync. |
| `auth_leaked_password_protection` | Product / Supabase project setting | Hosted Auth setting, not an app-code or migration correctness failure. Decide before broader external field rollout. |

## Source Files to Review Together

- `src/services/offlineSync.js`
- `src/db/repositories/domainRepositoryUtils.js`
- `src/db/repositories/childrenRepository.js`
- `src/db/repositories/classesRepository.js`
- `src/db/repositories/groupsRepository.js`
- `src/db/repositories/sessionsRepository.js`
- `src/db/repositories/assessmentsRepository.js`
- `src/db/repositories/masteryRepository.js`
- `supabase/migrations/20260522103000_masi_session_upsert_visibility.sql`
- `supabase/migrations/20260525231506_masi_rls_contract_cleanup.sql`
- `supabase/migrations/20260526151352_creator_select_upsert_visibility.sql`
- `__tests__/offlineSyncOutbox.test.js`
- `__tests__/sqlitePlan1Migrations.test.js`
- `__tests__/childrenRepository.test.js`
- `__tests__/classesRepository.test.js`
- `__tests__/sessionsRepository.test.js`
- `__tests__/assessmentsRepository.test.js`
- `__tests__/masteryRepository.test.js`
- `__tests__/junctionRepositoryGuards.test.js`
