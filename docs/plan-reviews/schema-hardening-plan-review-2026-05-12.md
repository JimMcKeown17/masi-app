# Schema Hardening Plan Review

Reviewed plan: `/Users/jimmckeown/.claude/plans/i-can-update-my-glistening-milner.md`  
Review date: 2026-05-12  
Verdict: good direction, but not safe to execute as written.

The target architecture is broadly right: make schools and staff roles canonical, keep `classes.teacher` free text, enforce existing picker values with database constraints, and avoid Postgres enum churn for new role values. The blockers are in sequencing and compatibility. This plan touches the exact sync/schema boundary that previously caused the `PGRST204` incident, so it needs stricter gates before any destructive migration.

## Blocking Issues

### 1. Proposed migration numbers already exist

The plan proposes:

- `supabase-migrations/11_create_lookup_tables.sql`
- `supabase-migrations/12_users_lookup_fks.sql`

Those filenames collide with existing migrations:

- `supabase-migrations/11_drop_children_synced.sql`
- `supabase-migrations/12_add_children_hidden_at.sql`

Use the next available numbers if keeping this repo's numbered-file convention, or generate migration names through the Supabase CLI if switching to Supabase-managed migration naming. Do not reuse `11` or `12`.

### 2. Do not truncate `schools` without handling existing `classes.school_id`

Phase 1 says the five placeholder schools can be truncated because `users.assigned_school` is text. That ignores the live `classes` table: `supabase-migrations/06_add_schools_and_classes.sql` creates `classes.school_id UUID REFERENCES schools(id) ON DELETE RESTRICT NOT NULL`.

If any class rows exist, `TRUNCATE schools` will either fail due to the FK or require `CASCADE`, which would delete class data. The safer path is:

- Seed/upsert the 325 CSV schools without deleting referenced school rows.
- Add `school_uid` and other metadata to existing matching school rows where possible.
- Backfill/remap `classes.school_id` to canonical schools if placeholder IDs need replacement.
- Only remove unreferenced placeholder schools after verifying no `classes` rows point at them.

This needs a preflight query before the seed:

```sql
select s.id, s.name, count(c.id) as class_count
from public.schools s
left join public.classes c on c.school_id = s.id
group by s.id, s.name
order by class_count desc, s.name;
```

### 3. "All testers updated" is not enough before dropping legacy columns

Migration `07_restore_class_column_compat.sql` exists because old app builds wrote `children.class`, `children.teacher`, and `children.school`; dropping those columns caused `PGRST204` sync failures and cascaded into junction-table FK failures.

The proposed Phase 4 repeats the same destructive move. Even if a tester updates the app, old unsynced records can remain in AsyncStorage. `src/services/offlineSync.js` strips only local fields like `synced` and `_deleted`, so any legacy keys still present in unsynced local records would still be sent to Supabase after the app update.

Before dropping `children.class`, `children.school`, `children.teacher`, `users.assigned_school`, `users.job_title`, or `sessions.session_type`, the plan needs a hard sync-drain gate:

- All devices on the compatibility build.
- `SyncStatus` shows zero unsynced and zero failed items on every tester device.
- Local caches are sanitized or migrated so old unsynced child/session payloads cannot include dropped columns.
- Server logs or exported databases show no current `PGRST204` failures.

If that gate is not practical, keep the legacy columns longer. In this app, a nullable compatibility column is cheaper than a field-sync outage.

### 4. `users.job_title` assumptions conflict with the repo

The plan says `users.job_title` is free text. The original schema defines it as a Postgres enum:

```sql
CREATE TYPE job_title AS ENUM ('Literacy Coach', 'Numeracy Coach', 'ZZ Coach', 'Yeboneer');
```

The docs are inconsistent, so production must be introspected before writing the migration. If the live column is still an enum, `lower(trim(u.job_title))` may fail without casting. Use `u.job_title::text` in backfills unless live schema proves it is already text.

There is also vocabulary drift:

- Existing app constants: `Literacy Coach`, `Numeracy Coach`, `ZZ Coach`, `Yeboneer`
- Proposed lookup seed: `Literacy Coach`, `Numeracy Coach`, `Yebo Youth`, `1000 Stories`

Decide whether `Yebo Youth` and `1000 Stories` replace the older values or are additional roles. A lookup table should probably include a stable `code` column (`literacy_coach`, `numeracy_coach`, etc.) so app logic does not depend on display names that may be renamed.

### 5. The proposed embedded profile shape is risky during the transition

The app currently reads:

- `profile.job_title` as a string in `HomeScreen`, `ProfileScreen`, and `SessionFormScreen`
- `profile.assigned_school` as a string in `HomeScreen` and `ProfileScreen`

The plan proposes `SELECT *, school:schools(id,name), job_title:job_titles(id,name) FROM users` while the legacy `job_title` column still exists. That creates a key-name collision between the legacy column and the embedded relationship alias.

Use non-colliding aliases during the dual-column phase, for example:

```js
.select('*, school_lookup:schools(id,name), job_title_lookup:job_titles(id,name)')
```

Then normalize the cached profile through a small adapter so the app can handle all three shapes:

- old cached profile with string `job_title` / `assigned_school`
- transitional profile with both legacy strings and lookup objects
- final profile with only lookup IDs/objects

`SessionFormScreen.js` is missing from the mobile-change list, but it currently gates the form on `profile?.job_title === JOB_TITLES.LITERACY_COACH`; that must be updated too.

### 6. Converting `sessions.session_type` to only an FK is not offline-safe yet

`LiteracySessionForm.js` writes a local session before sync. If the new build requires `session_type_id`, the app must have a durable local way to resolve that ID while offline. A fresh install or newly updated device may not have loaded `job_titles` yet.

Safer transition:

- Add nullable `session_type_id`.
- App dual-writes `session_type` and `session_type_id` while both columns exist.
- If lookup cache is unavailable, keep the text value and mark the record for later enrichment instead of blocking field capture.
- Backfill `session_type_id` server-side.
- Verify no sessions are left without `session_type_id`.
- Drop `session_type` only after the same sync-drain gate used for children.

The Phase 4 `ALTER COLUMN session_type_id SET NOT NULL` also needs a preflight for historical values that do not match a job title.

### 7. The FK delete behavior conflicts with later `NOT NULL`

Phase 2 adds:

```sql
school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
job_title_id uuid REFERENCES public.job_titles(id) ON DELETE SET NULL
```

Phase 4 then makes both columns `NOT NULL`. `ON DELETE SET NULL` is the wrong semantic for required lookups; it will either fail on delete or encode a behavior the schema no longer allows. Use `ON DELETE RESTRICT` for required profile lookups, or keep the columns nullable and make the app handle unassigned users explicitly.

### 8. Phase 3 constraints need idempotent SQL and better preflights

`ALTER TABLE ... ADD CONSTRAINT` is not idempotent. Running the same migration twice will fail if the constraint already exists. Wrap each constraint in a `DO $$` existence check or accept that these are one-shot migrations and name them carefully.

Before adding each constraint, include explicit dirty-data queries in the plan:

```sql
select gender, count(*) from public.children
where gender is not null and gender not in ('Male', 'Female')
group by gender;

select grade, count(*) from public.classes
where grade not in ('ECD', 'Grade R', 'Grade 1', 'Grade 2', 'Grade 3')
group by grade;

select home_language, count(*) from public.classes
where home_language not in ('isiXhosa', 'English', 'Afrikaans')
group by home_language;

select assessment_type, count(*) from public.assessments
where assessment_type not in ('letter_egra', 'word_egra')
group by assessment_type;
```

For larger tables, consider adding constraints `NOT VALID` and validating after cleanup to reduce lock risk. The current dataset may be small enough that direct constraints are fine, but the plan should make that an explicit choice.

### 9. Add the missing FK/index/RLS details

The plan correctly indexes `users.school_id` and `users.job_title_id`, but it should also index `sessions.session_type_id` if that FK remains part of the model. Postgres does not automatically index FK columns.

Also verify the new `job_titles` table is actually readable through the Supabase Data API:

- RLS enabled
- SELECT policy for `authenticated`
- grants/data API exposure consistent with the project settings

The `schools` table already has a read policy, but the seeded columns are new contract surface for the app and import tooling, so the verification should include a mobile-client read using the anon/authenticated client, not only service-role SQL.

### 10. The CSV seed needs to be scripted, not ad hoc

I verified the referenced CSV has 325 rows, no duplicate `School`, no duplicate `School UID`, and no blank `School UID`. It also has a UTF-8 BOM and a multiline quoted `School Info` column, so a naive line-based parser will break.

Prefer a committed seed/import script with:

- robust CSV parsing
- dry-run output
- duplicate checks
- existing-school/reference checks
- explicit `upsert` or remap behavior
- no service-role key in source

Using MCP `execute_sql` manually is fine for a one-off data load, but the transformation should still be reproducible.

## Missing Mobile Changes

Add these to the plan before implementation:

- `src/screens/sessions/SessionFormScreen.js` must route based on the normalized role shape, not the old string only.
- `AuthContext` should normalize old cached profile objects and new joined profile objects before saving to AsyncStorage.
- `HomeScreen` and `ProfileScreen` should render through helper functions like `getProfileJobTitleName(profile)` and `getProfileSchoolName(profile)` so old cached profiles do not blank out offline.
- `SessionHistoryScreen` needs a transitional renderer: `item.session_type?.name || item.session_type_lookup?.name || item.session_type || 'Session'`.
- The session submit path should not require an online lookup just to save a field session locally.
- Add a one-time local cache cleanup for legacy child/session keys before destructive DB drops.
- Export Database output should be reviewed with both old and new profile/session shapes.

## Suggested Safer Sequence

1. **Phase 0: live preflight and backup**
   - Confirm live column types for `users.job_title`.
   - Count existing classes by `school_id`.
   - Count dirty enum-ish values.
   - Count sessions with unexpected `session_type`.
   - Confirm current migration history and choose non-colliding filenames.

2. **Phase 1: additive schema only**
   - Create `job_titles` with stable `code`, display `name`, `sort_order`, `is_active`.
   - Extend `schools` with CSV metadata.
   - Seed schools by upsert/remap, not blind truncate.
   - Add nullable `users.school_id`, `users.job_title_id`, and `sessions.session_type_id`.
   - Add RLS/policies/indexes.

3. **Phase 2: compatibility app release**
   - Read both legacy and lookup-backed profile shapes.
   - Dual-write `sessions.session_type` and `sessions.session_type_id` when possible.
   - Preserve local-first behavior when lookups are not cached.
   - Add local cache migration/sanitizer for stale legacy payload keys.

4. **Phase 3: backfill and validate**
   - Backfill users and sessions.
   - Resolve every unmatched school/job/session type.
   - Run mobile smoke tests and Supabase read tests as authenticated users.
   - Confirm every field device has zero unsynced and zero failed records.

5. **Phase 4: tighten**
   - Add CHECK constraints.
   - Set FK columns `NOT NULL` only after zero-null preflights.
   - Drop legacy text columns only after the sync-drain gate is complete.

## What Looks Good

- Keeping `classes.teacher` free text is the right call for current product value.
- Moving from role/school free text to lookup-backed values is directionally correct.
- CHECK constraints over app picker values are a pragmatic fit for `gender`, `grade`, `home_language`, and `assessment_type`.
- Deferring `sync_outbox` and sync-status redesign is reasonable; that is a separate architecture project.

## Bottom Line

I would not run the current plan as written. I would approve it after the blockers above are incorporated, especially the school seeding/remapping fix, the dual-column mobile compatibility release, the sync-drain gate before drops, and the role vocabulary/type reconciliation.
