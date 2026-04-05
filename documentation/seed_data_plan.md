# Seed Data Script for Test Users

> **Status:** Plan only — not yet implemented. Saved 2026-04-02.

## Context
The app is in field testing with real users, but new test users need realistic data to exercise the app's features (classes, children, sessions, assessments, etc.). Currently there's no way to quickly populate a test account. This script will be a reusable SQL file that can be run via the Supabase SQL Editor or MCP `execute_sql` tool whenever a new test user needs data.

## Approach: PL/pgSQL `DO` Block (Standalone SQL Script)

**Why not a stored function?** A `CREATE FUNCTION` would persist in the production schema. A `DO $$ ... $$` block runs once and leaves no footprint — perfect for a dev/test utility.

**Why not a JS script?** SQL via service role bypasses RLS entirely. A JS script would need the service role key, an HTTP client, and careful auth handling. Raw SQL is simpler and more portable.

### File Location
`scripts/seed_test_data.sql` (new `scripts/` directory — not in `supabase-migrations/` since this is NOT a migration).

## What Gets Created

| Table | Records | Details |
|-------|---------|---------|
| `schools` | 1 | Uses user's `assigned_school`, upserts if exists |
| `classes` | 1 | "1A", Grade 1, isiXhosa, linked to school |
| `children` | 6 | South African names, ages 5-8, mix of genders |
| `staff_children` | 6 | Links user to all 6 children |
| `groups` | 2 | "Group 1" (3 kids), "Group 2" (3 kids) |
| `children_groups` | 6 | 3 children per group |
| `sessions` | 4 | Spread over past week, realistic activities JSONB |
| `assessments` | 3 | EGRA letter_egra type, for 3 different children |
| `letter_mastery` | 8 | Across 2 children, source='taught' |
| `time_entries` | 3 | Past week, Cape Town area GPS coords |

## Implementation Details

Single SQL file containing a `DO $$ ... $$` block with one user-editable variable at the top:

```sql
DO $$
DECLARE
  p_user_id UUID := 'REPLACE_WITH_USER_UUID';
  -- everything else is auto-derived from user profile
```

### Script logic:

1. **Look up user profile** — `SELECT job_title, assigned_school FROM users WHERE id = p_user_id`. Raise exception if not found.
2. **Pre-generate all UUIDs** — `gen_random_uuid()` into variables for cross-referencing across tables.
3. **Upsert school** — `INSERT ... ON CONFLICT (name) DO NOTHING`, then `SELECT id` to get existing or new ID.
4. **Insert class** — Grade 1, teacher "Mrs. Nkosi", `home_language = 'isiXhosa'`. `ON CONFLICT (staff_id, name, school_id) DO NOTHING`.
5. **Insert 6 children** — Culturally appropriate SA names. Set `created_by` explicitly, plus legacy `class`/`teacher`/`school` TEXT columns for backwards compat. `ON CONFLICT (id) DO NOTHING`.
6. **Fix `created_by`** — UPDATE to set `created_by = p_user_id` (the BEFORE INSERT trigger sets it to `auth.uid()` which is NULL when running via service role).
7. **Insert `staff_children`** — 6 junction records. `ON CONFLICT DO NOTHING`.
8. **Insert 2 groups** — `ON CONFLICT (staff_id, name) DO NOTHING`.
9. **Insert `children_groups`** — 3 kids per group. `ON CONFLICT DO NOTHING`.
10. **Insert 4 sessions** — Past week dates, `session_type` matches user's `job_title`, realistic `activities` JSONB with `letters_focused`, `session_reading_level`, `child_reading_levels`.
11. **Insert 3 assessments** — `letter_egra` type, `isixhosa_60` letter set, realistic scores (accuracy 40-85%), completion times ~45-60s.
12. **Insert `letter_mastery`** — 8 records for 2 children. `ON CONFLICT DO NOTHING`.
13. **Insert 3 `time_entries`** — Sign-in ~07:30, sign-out ~14:00, GPS near Cape Town (-33.92, 18.42).
14. **RAISE NOTICE** — Summary message confirming what was created.

### Cleanup (commented out at bottom of script)

Delete all seed data for a user UUID in correct FK order:
```sql
-- DELETE FROM letter_mastery WHERE user_id = '<UUID>';
-- DELETE FROM assessments WHERE user_id = '<UUID>';
-- DELETE FROM sessions WHERE user_id = '<UUID>';
-- DELETE FROM time_entries WHERE user_id = '<UUID>';
-- DELETE FROM children_groups WHERE group_id IN (SELECT id FROM groups WHERE staff_id = '<UUID>');
-- DELETE FROM groups WHERE staff_id = '<UUID>';
-- DELETE FROM staff_children WHERE staff_id = '<UUID>';
-- DELETE FROM children WHERE created_by = '<UUID>';
-- DELETE FROM classes WHERE staff_id = '<UUID>';
```

## Key Design Decisions

- **All `synced` = TRUE** — data is being inserted directly into Supabase, so it's already "synced"
- **`ON CONFLICT DO NOTHING`** everywhere — safe to re-run; generates new data each time (fresh UUIDs) but won't break on unique constraints
- **`created_by` fix** — the `BEFORE INSERT` triggers on `children` and `classes` call `auth.uid()`, which returns NULL via service role. We UPDATE after insert.
- **Legacy columns populated** — `children.class`, `children.teacher`, `children.school` TEXT columns filled for backwards compat with older app versions
- **Session activities JSONB** — matches exact structure from `LiteracySessionForm.js`: `{ letters_focused, session_reading_level, child_reading_levels }`

## Critical Source Files
- `src/constants/egraConstants.js` — letter set IDs and languages
- `src/constants/literacyConstants.js` — reading levels, letter order
- `src/screens/sessions/LiteracySessionForm.js` — activities JSONB structure
- `supabase-migrations/06_add_schools_and_classes.sql` — classes/schools schema
- `supabase-migrations/07_restore_class_column_compat.sql` — legacy column requirements

## Verification
1. Run the script via Supabase MCP `execute_sql` with a real test user UUID
2. Verify: `SELECT count(*) FROM children WHERE created_by = '<UUID>'` (expect 6)
3. Verify: `SELECT count(*) FROM sessions WHERE user_id = '<UUID>'` (expect 4+)
4. Open the app as that user and confirm children, sessions, and assessments appear
