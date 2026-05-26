# RLS/App Contract Audit - 2026-05-25

## Scope

This audit compares the clean-slate SQLite app against the live `masi-app-sqlite` Supabase RLS contract. The goal is to identify real contract mismatches, brittle ordering, and cleanup work before field cutover, not to keep adding one-off payload repairs.

Inputs checked:

- Live linked Supabase project: `segygjzpujphwvrubusm`.
- Supabase migrations under `supabase/migrations/`.
- App push path in `src/services/offlineSync.js`.
- Local write producers in `src/db/repositories/*Repository.js`.
- Server pull paths in `src/services/preloadedChildData.js`, `src/context/ClassesContext.js`, `src/context/AuthContext.js`, and `src/context/LookupsContext.js`.
- Current staging data health checks for missing ownership/relationship rows.

## Executive Verdict

Status after the 2026-05-25 fix pass: the app/RLS contract issues found in this audit are closed for the clean-slate SQLite cutover.

The current live staging data is clean, the recent group ownership bug is fixed for new writes, and the structural issues identified below now have migrations, outbox behavior tests, and live staging verification.

Resolved in this pass:

1. `child_ea_assignments` now has a narrow self-update archive policy.
2. Assignment identity columns are protected by database triggers, so update policies cannot become reassignment back doors.
3. Archive outbox ordering is operation-aware and keeps access-granting assignment rows until dependent relationship cleanup has synced.
4. Class UPDATE/DELETE now use `private.current_user_can_write_for_class(id)`, matching the app's assigned-class edit/archive surface.
5. Assessment, assessment item, and letter mastery SELECT policies now use the same child-read helper model as the rest of the app.
6. Reference/admin table grants now match intent, and `authenticated` no longer has `TRUNCATE`, `REFERENCES`, or `TRIGGER` privileges on public tables.

Remaining non-code note: Supabase Auth leaked-password protection is still disabled in hosted settings. That advisor warning is outside the mobile app/RLS contract.

## Implementation Status

- [x] Add RLS contract test for assignment archive, class write, helper-aligned reads, and grant drift.
- [x] Add `20260525231506_masi_rls_contract_cleanup.sql`.
- [x] Add assignment identity-immutability triggers for child/class/group assignment tables.
- [x] Remove assignment DELETE policies and revoke assignment DELETE grants from `authenticated`.
- [x] Add narrow assignment archive UPDATE policies.
- [x] Move class UPDATE/DELETE to `private.current_user_can_write_for_class(id)`.
- [x] Align assessment, assessment item, and letter mastery SELECT policies to `private.current_user_can_read_child(...)`.
- [x] Drop redundant created-by SELECT policies on children/classes/groups.
- [x] Add archive-order behavior tests for child and group archive flows.
- [x] Add operation-aware archive ordering and archive dependency propagation in `offlineSync`.
- [x] Add `20260525232108_masi_rls_grant_cleanup.sql`.
- [x] Push both migrations to `masi-app-sqlite`.
- [x] Re-run live policy, grant, trigger, RLS-enabled, no-view, advisor, and rollback-only authenticated smoke checks.

## What Looks Good

- Every live public table checked has RLS enabled.
- There are no exposed views in `public` or `private`.
- App-facing private authorization functions use `security definer` with `search_path = ''`.
- No app-callable security-definer function is exposed from `public`; the public wrapper `delete_child_if_no_history` is not security definer.
- Current staging row health checks are clean:
  - no active groups without `created_by`;
  - no active groups without active `group_ea_assignments`;
  - no active classes without active `class_ea_assignments`;
  - no active children without active `child_ea_assignments`;
  - no active child group/class/programme relationship rows missing `created_by`;
  - no orphan `session_attendees` or `assessment_items` in the checked parent relationships.
- The recent group creation fix now matches the live policy shape: group insert first, group assignment next, membership after both.

## Findings

### 1. Blocker: `child_ea_assignments` Archive Has No UPDATE Policy

**Status: resolved.** `20260525231506_masi_rls_contract_cleanup.sql` adds `child_ea_assignments_update_self_archive`, keeps the policy self-owned, removes assignment DELETE policies, revokes assignment DELETE grants, and protects immutable assignment identity columns with `private.prevent_assignment_identity_change()`.

Live policy state:

- `child_ea_assignments` has SELECT and INSERT policies.
- It has no UPDATE or DELETE policy.
- The authenticated role still has UPDATE/DELETE grants, but RLS has no matching policy.

App behavior:

- `childrenRepository.deleteStaffChild()` updates `child_ea_assignments.unassigned_at`.
- `childrenRepository.archiveChild()` updates active `child_ea_assignments.unassigned_at`.
- Both enqueue `child_ea_assignments` `archive` outbox rows.
- `offlineSync` sends archive rows through the same Supabase upsert path.

Expected result today: a synced child EA assignment archive can fail RLS when the upsert conflicts and becomes an UPDATE.

Context: this UPDATE/DELETE policy was intentionally removed earlier to prevent mobile users from doing arbitrary handover edits. That was directionally right, but the app still has a legitimate self-archive/unassign flow. The fix should be a narrow archive path, not a return to broad assignment update permission.

Recommended fix:

- Add a real UPDATE policy for self-owned assignment archive.
- Keep it narrow. The app only needs to end the relationship, not reassign child identity.
- Add regression coverage that proves an archived child sync includes and successfully orders the `child_ea_assignments` archive.

Open design decision:

- If mobile users should only archive their own child assignment rows, the policy should be self-owned.
- If managers/admins will assign/unassign other EAs later, that should be a separate service-role/admin path, not silently mixed into the field app policy.

### 2. Blocker: Insert Push Order and Archive Push Order Need Different Rules

**Status: resolved.** `src/services/offlineSync.js` now uses operation-aware archive ordering and archive-specific dependency propagation. The behavior tests cover child archive ordering, child assignment skip-on-cleanup-failure, and group archive ordering.

The current `PUSH_ORDER` in `offlineSync.js` is mostly an insert dependency order:

1. parent rows;
2. assignment rows;
3. relationship/event rows.

That works for create flows, but archive/unassignment flows often need the opposite for relationship rows. A user must keep their active assignment until the rows protected by that assignment have been ended.

Risk examples:

- Child archive currently syncs `children`, then `child_ea_assignments`, then `child_programme_enrollments`, then `child_class_memberships`, then `child_group_memberships`.
- If `child_ea_assignments` is ended before programme/class/group relationship rows, later policies using `private.current_user_can_write_for_child(child_id)` can lose the authority they need.
- Group archive currently syncs `groups`, then `group_ea_assignments`, then `child_group_memberships`. For non-created/admin-assigned groups, ending the group assignment before memberships can remove `current_user_can_write_for_group(group_id)`.
- Class archive has the same shape around `class_ea_assignments` and `child_class_memberships`.

Recommended fix:

- Keep insert ordering as-is.
- Add operation-aware ordering for `archive` rows.
- For child archive, process:
  1. `children` archive/update while child assignment is still active;
  2. `child_programme_enrollments`, `child_class_memberships`, `child_group_memberships`;
  3. `child_ea_assignments` last.
- For group archive, process:
  1. `groups` archive/update;
  2. `child_group_memberships`;
  3. `group_ea_assignments` last.
- For class archive, process:
  1. `classes` archive/update;
  2. `children` class-null updates and `child_class_memberships`;
  3. `class_ea_assignments` last.

Add tests that fail if an archive flow uploads the access-granting assignment before the relationship cleanup rows.

### 3. High: Class UI Allows Edit/Delete, But Class RLS Is Creator-Only

**Status: resolved with product option A.** Assigned EAs may edit/archive assigned classes. `classes_update_assigned_ea` and `classes_delete_assigned_ea` now use `private.current_user_can_write_for_class(id)`.

Live policy state:

- `classes_update_created_by` uses `created_by = auth.uid()`.
- `classes_delete_created_by` uses `created_by = auth.uid()`.
- The newer helper `private.current_user_can_write_for_class(class_id)` exists, but class UPDATE/DELETE policies do not use it.

App behavior:

- `ClassesContext.loadClasses()` loads classes through active `class_ea_assignments`.
- `ClassDetailScreen` exposes navigation to `EditClass`.
- `EditClassScreen` exposes Save Changes and Delete Class for the loaded class.
- The UI does not appear to distinguish "created by me" from "assigned to me".

Expected result today:

- A class that is assigned to an EA but created by admin/service/another user can appear in the app but fail update/archive sync.

Clean options:

- Product option A: assigned EAs may edit/archive assigned classes. Then change class UPDATE/DELETE policies to use `private.current_user_can_write_for_class(id)`.
- Product option B: only the creator/admin may edit/archive class metadata. Then hide or disable Edit/Delete for non-created classes and avoid enqueuing local class updates that cannot sync.

I would not leave this ambiguous.

### 4. Medium: Assessment/Mastery Read Policies Are Behind the New Assignment Model

**Status: resolved.** `assessments_select_assigned_child_history`, `assessment_items_select_visible_assessment`, and `letter_mastery_select_assigned_child_history` now use `private.current_user_can_read_child(...)`.

Live policies still use older direct assignment checks for reads:

- `assessments_select_assigned_child_history` checks `user_id = auth.uid()` or direct `child_ea_assignments`.
- `assessment_items_select_visible_assessment` checks assessment owner or direct `child_ea_assignments`.
- `letter_mastery_select_assigned_child_history` checks owner or direct `child_ea_assignments`.

Newer helper model:

- `private.current_user_can_read_child(child_id)` supports created-by, direct child assignment, class assignment, and group assignment.
- Children, child relationships, sessions, and session attendees use the helper-based model.

Current app impact:

- Low immediate risk if the app only surfaces children through direct `child_ea_assignments`.
- Higher future risk because the schema and RLS helpers already claim class/group assignment is a valid access path.

Recommended cleanup:

- Update assessment, assessment item, and letter mastery SELECT policies to use `private.current_user_can_read_child(child_id)` or parent assessment child equivalent.
- Add policy regression checks so future schema additions do not drift back to direct-only child assignment.

### 5. Medium: Relationship Insert Policies Are Good, But Producer Tests Need To Stay Explicit

The current contract relies on mobile producers creating relationship evidence in the same local transaction:

- child create -> `children`, `child_ea_assignments`, `child_programme_enrollments`, maybe `child_class_memberships`;
- class create -> `classes`, `class_ea_assignments`;
- group create -> `groups`, `group_ea_assignments`;
- session create -> `sessions`, then `session_attendees`;
- assessment create -> `assessments`, then `assessment_items`.

This is the right model. The recent group bug happened because the producer missed the relationship evidence and owner fields.

Recommended guard:

- For every mobile-created table protected by assignment-based RLS, keep a repository test that asserts both:
  - the domain row contains the policy-required owner/foreign-key fields;
  - the outbox payload contains those same fields after server-column filtering.

Minimum contract tests to keep:

- child create produces child assignment, programme enrollment, class membership when applicable;
- class create produces class EA assignment;
- group create produces group EA assignment;
- child-to-group produces `created_by` and `grouping_version_id` when available;
- session create produces attendees after the session;
- assessment create produces assessment items after the assessment.

### 6. Low: Authenticated Grants Are Broader Than The Policy Model

**Status: resolved.** Reference/admin tables now expose SELECT only to `authenticated`; non-DML table privileges were revoked across public tables. Live grant audit returned zero `TRUNCATE`, `REFERENCES`, or `TRIGGER` grants for `authenticated`.

The live database grants authenticated INSERT/UPDATE/DELETE privileges on several tables that only have SELECT policies:

- `schools`
- `job_titles`
- `programmes`
- `academic_years`
- `assessment_windows`
- `assessment_tools`
- `teachers`
- `staff_programme_assignments`
- `users`

RLS blocks writes because there are no matching write policies, so this is not the same as open write access. Still, it is not clean least-privilege design.

Recommended cleanup:

- Revoke INSERT/UPDATE/DELETE on reference/admin tables from `authenticated`.
- Grant only the operations the app actually needs.
- Keep RLS policies as the row-level control, but make table grants match intent too.

### 7. Low: `repairGroupOwnershipForSync()` Should Be Treated As A Cutover Healer

The group ownership repair is now doing useful work for stale tester-device rows. It should not be the permanent reason group creation works.

Current state:

- New producers now write `created_by` and group assignment rows.
- The repair path exists so failed old local outbox payloads can retry.

Recommended cleanup:

- Keep it through cutover validation.
- After field devices are confirmed on the clean build, either remove it or clearly mark it as a narrow historical repair with tests proving it is no-op for healthy rows.

## Operation Contract Matrix

| Table | App Operation | Current RLS Fit | Risk |
| --- | --- | --- | --- |
| `time_entries` | self create/update | Good | Low |
| `children` | create/update/archive via upsert; hard delete through RPC | Mostly good | Archive depends on child assignment remaining active until related rows finish |
| `child_ea_assignments` | insert and archive | Insert good; archive missing policy | Blocker |
| `child_programme_enrollments` | insert and archive | Insert/update policy depends on child write access | Brittle if child EA assignment is ended first |
| `child_class_memberships` | insert and archive | Policy depends on child write and class access | Brittle if child/class assignment is ended first |
| `classes` | create/update/archive | Create good; update/archive creator-only | High for admin/precreated classes |
| `class_ea_assignments` | insert and archive | Good for self-created/assigned rows | Must be archived after dependent child class rows |
| `groups` | create/update/archive | Good after ownership fix | Non-created assigned group behavior depends on product decision |
| `group_ea_assignments` | insert and archive | Good for mobile-created group owner | Must be archived after child group memberships |
| `child_group_memberships` | insert and archive | Good after ownership fix | Brittle if group assignment is ended first |
| `sessions` | insert/update-like upsert | Good for own active programme | Update/delete needs existing attendees |
| `session_attendees` | insert/update/delete-like upsert | Good when child write access exists | Depends on child/group/class relationships syncing first |
| `assessments` | insert/update-like upsert | Good for direct child write | Read policy should be helper-aligned |
| `assessment_items` | insert/update-like upsert | Good when parent assessment is visible/writable | Read policy should be helper-aligned |
| `letter_mastery` | insert/update/archive | Good for direct child write | Read policy should be helper-aligned |

## Recommended Fix Sequence

1. [x] Add a migration for `child_ea_assignments` UPDATE policy.
2. [x] Add operation-aware outbox ordering for archive rows and tests for child/group archive order.
3. [x] Decide class edit/archive product behavior: assigned EAs may edit/archive assigned classes.
4. [x] Align assessment, assessment item, and letter mastery SELECT policies with `current_user_can_read_child`.
5. [x] Add RLS contract tests:
   - static migration/policy assertions for required commands per app-written table;
   - behavior-level outbox ordering tests for archive flows;
   - live/staging rollback probe using `SET LOCAL ROLE authenticated`.
6. [x] Revoke extra authenticated write and non-DML grants on reference/admin tables.
7. [ ] Keep `repairGroupOwnershipForSync()` through cutover, then remove or clearly time-box it after field devices are confirmed on the clean build.

## Verification Performed

Commands run:

```bash
supabase db query --linked -o csv "select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname = 'public' order by tablename, policyname;"
supabase db query --linked -o csv "with public_tables as (...) select relname, relrowsecurity, relforcerowsecurity, policy_cmds, policy_count ..."
supabase db query --linked -o csv "select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns ..."
supabase db query --linked -o csv "select ... from information_schema.role_table_grants ..."
supabase db query --linked -o csv "select ... missing ownership / relationship health checks ..."
supabase db query --linked -o csv "select table_schema, table_name from information_schema.views ..."
supabase db query --linked -o csv "select private/public function security_definer and execute grants ..."
npm run sqlite:staging:advisors
```

Observed results:

- RLS enabled on all checked public tables.
- No public/private views.
- Current staging data health checks returned zero for the ownership/relationship anomalies listed above.
- Initial policy/grant mismatch query showed missing policies for several granted reference/admin writes, plus the app-relevant `child_ea_assignments` UPDATE/DELETE gap.
- Post-fix policy query shows `child_ea_assignments_update_self_archive`, `class_ea_assignments_update_self`, `group_ea_assignments_update_self`, `classes_update_assigned_ea`, `classes_delete_assigned_ea`, and helper-aligned assessment/mastery SELECT policies.
- Post-fix grant query shows no `TRUNCATE`, `REFERENCES`, or `TRIGGER` grants for `authenticated`.
- Post-fix trigger query shows assignment identity guards on `child_ea_assignments`, `class_ea_assignments`, and `group_ea_assignments`.
- Rollback-only authenticated smoke test passed for group insert, group assignment insert, child group membership insert, group archive, membership archive, group assignment archive, and child assignment archive.
- Function grant query showed no app-callable public security-definer functions.
- Supabase advisors now return only leaked-password protection disabled. The previous multiple permissive SELECT warnings on `children`, `classes`, and `groups` are gone after dropping redundant created-by SELECT policies.

## Bottom Line

The group bug was not an isolated accident. It exposed a real class of contract risk: mobile producers, outbox ordering, and RLS policies must be reviewed as one system.

That contract has now been tightened in the database and in the sync engine. I would still keep physical-device testing as a release gate, but I no longer consider RLS/app wiring an open blocker for the SQLite cutover.
