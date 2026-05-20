# Schema Hardening Plan Review - Rev 3

Reviewed plan: `/Users/jimmckeown/.claude/plans/i-can-update-my-glistening-milner.md`  
Review date: 2026-05-12  
Prior reviews:
- `docs/plan-reviews/schema-hardening-plan-review-2026-05-12.md`
- `docs/plan-reviews/schema-hardening-plan-review-rev2-2026-05-12.md`

Verdict: much closer, but I would not execute Rev 3 exactly as written yet. The architecture is now broadly sound: additive schema first, compatibility build, buffer week, exported-device verification, then destructive cleanup. The remaining issues are narrower than before, but a few can still break field sync or leave the database with stale objects.

## Blocking Corrections

### 1. Add the missing `sessions.session_type_id` backfill

The plan adds `sessions.session_type_id`, the compatibility app dual-writes it for new sessions, and the Phase 5 gate requires:

```sql
SELECT COUNT(*) FROM sessions WHERE session_type_id IS NULL;
```

But none of the listed migrations backfills existing historical sessions. `supabase-migrations/00_initial_schema.sql` defines `sessions.session_type TEXT NOT NULL`, and the live mobile code still writes only `session_type: 'Literacy Coach'` in `src/screens/sessions/LiteracySessionForm.js`.

Add a sessions preflight and backfill before the Phase 5 gate, either in migration 15 or in a dedicated migration before 16:

```sql
SELECT s.session_type, COUNT(*)
FROM public.sessions s
LEFT JOIN public.job_titles j
  ON lower(trim(s.session_type)) = lower(trim(j.name))
WHERE s.session_type IS NOT NULL
  AND j.id IS NULL
GROUP BY s.session_type
ORDER BY COUNT(*) DESC, s.session_type;

UPDATE public.sessions s
SET session_type_id = j.id
FROM public.job_titles j
WHERE s.session_type_id IS NULL
  AND lower(trim(s.session_type)) = lower(trim(j.name));
```

Without this, Phase 5 should never pass on a real database with any pre-existing sessions.

### 2. Scope `offlineSync` stripping by table, not globally

Rev 3 says to extend `src/services/offlineSync.js` so it strips `class`, `school`, `teacher`, and `assigned_school` from local payloads. That is dangerous if implemented in the current generic `syncRecord()` destructuring, because `classes.teacher` is still an intentional, required field:

- `supabase-migrations/06_add_schools_and_classes.sql` defines `classes.teacher TEXT NOT NULL`.
- `CreateClassScreen` and `EditClassScreen` still write `teacher`.
- The user decision in the plan says `classes.teacher` stays free text.

The strip logic needs to be table-aware:

- For `children`, strip legacy `class`, `school`, and `teacher` only when syncing to `public.children`.
- For `sessions`, keep `session_type` during Phase 4 and strip it only in the post-Phase-5 follow-up build.
- Do not globally strip `teacher`, or class create/edit sync can fail with a NOT NULL violation.
- `assigned_school` is not currently part of any synced `users` table flow, so including it in a generic strip list is at best unused and at worst a sign the strip layer is too broad.

Add a focused regression check around class sync payloads so `teacher` cannot accidentally disappear.

### 3. Handle `public.get_children_in_group` before dropping child text columns

The plan says `children.class`, `children.school`, and `children.teacher` have zero mobile reads. That appears true in the current app code, but the database still has a function from `supabase-migrations/01_add_groups_feature.sql`:

```sql
CREATE OR REPLACE FUNCTION get_children_in_group(group_uuid UUID)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  teacher TEXT,
  class TEXT,
  age INTEGER,
  school TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.first_name, c.last_name, c.teacher, c.class, c.age, c.school
  FROM children c
  INNER JOIN children_groups cg ON c.id = cg.child_id
  WHERE cg.group_id = group_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Before Phase 5 drops those columns, either drop this unused RPC or replace it with a version that joins `classes` / `schools` and fixes the `SECURITY DEFINER` exposure noted in `PRD.md`. Otherwise the function can become a stale runtime failure, and it keeps an old privacy risk alive.

### 4. Do not mark the sanitizer complete before session enrichment actually happened

The one-shot `asyncStorageSanitizer` is the right idea, but the plan should be more explicit about ordering. If it runs before `job_titles` has been cached, it may be unable to add `session_type_id` to existing unsynced `@sessions` records. If it then writes `migrationVersion: 2`, it will not try again.

Safer options:

- Make the sanitizer record per-task completion, not just one global version.
- Leave the session-enrichment task incomplete until the job-title cache exists.
- Or enrich missing `session_type_id` just-in-time in the session sync path before a session is upserted.

The Phase 5 exported-database review should explicitly flag any unsynced `@sessions` record with `session_type` but no `session_type_id`.

## Important Fixes

### Confirm whether session types are really job titles

`PRD.md` currently says `sessions.session_type` matches `job_title`, so using `job_titles` as the temporary lookup may be acceptable. Still, this deserves one explicit product decision in the plan. A staff role and a session/programme type are not always the same concept. If Masi may later have one role run multiple session types, create a separate `session_types` or `programmes` lookup now instead of pointing `sessions.session_type_id` at `job_titles`.

### Expand the Phase 5 device gate beyond "all 10 testers"

The context says 32 more testers are about to be onboarded. If any of those 32 use the app before Phase 5, the destructive-drop gate must include them too. Phrase the gate as "every active field install/account that has used the app before Phase 5" rather than "all 10 testers."

### Add explicit Data API access verification for `job_titles`

The plan creates RLS and a SELECT policy, which is necessary. In Supabase, table exposure/grants can still matter separately from row visibility. Add an explicit authenticated-client read check for `job_titles`, and if this project does not auto-grant access to new public tables, include the needed `GRANT SELECT ON public.job_titles TO authenticated;` in the migration.

### Fix the documentation path

The plan says to update `documentation/PRD.md`, but this repo's PRD is at root: `PRD.md`. `documentation/LEARNING.md` and `documentation/DATABASE_SCHEMA_GUIDE.md` are the docs under `documentation/`.

### Add storage key details for the sanitizer

The plan lists `JOB_TITLES` storage helpers, but the sanitizer also needs an explicit storage key for its migration status. Add the key name to `src/utils/storage.js`, decide whether it belongs in `clearDomainData()`, and make Export Database review instructions name that key.

### Use robust CSV parsing for tester import too

Rev 3 correctly calls out that `scripts/createTesters.js` has a naive comma-split parser and that `csv-parse` is not currently in `package.json`. Once `csv-parse` is added for the schools seed, use the same parser in `createTesters.js`; tester names and school names are operational data, and this is a low-cost way to avoid a future import surprise.

## What Looks Good Now

- Migration numbering now starts after the existing `12_add_children_hidden_at.sql`.
- The schools seed no longer truncates FK-referenced rows.
- The plan correctly keeps `classes.teacher` free text.
- The profile lookup aliases avoid the `job_title` column/object collision.
- `normalizeProfile()` now handles legacy cached profiles with a display-name-to-code fallback.
- The Phase 4 plan correctly keeps `sessions.session_type` until the column is actually dropped.
- The sanitizer now targets the real per-table AsyncStorage arrays instead of assuming a central sync queue.
- The Phase 5 gate is operationally much stronger than Rev 1 and Rev 2.
- The tester import script is now treated as phase-aware, which matters for the 32-person onboarding.

## Bottom Line

I would approve this plan after the four blocking corrections are incorporated. The most important changes are: backfill historical sessions, make sync stripping table-specific, resolve the stale `get_children_in_group` function, and make the sanitizer retry session enrichment until it has actually happened. Those are the pieces most likely to prevent another `PGRST204` or field-sync failure during the destructive cleanup.
