# Bulk Import Children & Groups for New Users

> **Status:** Plan only — not yet implemented. Saved 2026-04-02.

## Context
Most new users already have class lists with children grouped. Rather than having each user manually enter 20-30+ children through the app, the admin (Jim) needs a way to bulk-import real children and group assignments directly into Supabase for a given user.

## Recommended Approach: Parameterized SQL Script

A single SQL `DO $$ ... $$` block where the admin fills in:
1. The user's UUID
2. Class details (name, grade, teacher, language)
3. A literal list of children with group assignments

### Why SQL over CSV Import?
- **RLS bypass**: Running via service role (SQL Editor or MCP `execute_sql`) bypasses all Row Level Security policies
- **Relationship wiring**: A SQL script can create children, `staff_children` junction records, groups, and `children_groups` in one atomic operation. CSV import into the Supabase Table Editor doesn't handle relationships.
- **`created_by` trigger workaround**: The `BEFORE INSERT` trigger on `children` and `classes` sets `created_by = auth.uid()`, which is NULL via service role. The script can UPDATE after insert.
- **Repeatable**: Save the template, swap in new data each time

### Why Not Supabase CSV Import?
- Doesn't create junction table records (`staff_children`, `children_groups`)
- Doesn't set `created_by` correctly
- Requires manual follow-up SQL to wire relationships
- More error-prone for this use case

## Script Template Design

### Input Variables (admin fills these in)

```sql
DO $$
DECLARE
  -- === FILL THESE IN ===
  p_user_id UUID := 'USER_UUID_HERE';
  p_class_name TEXT := '1A';
  p_grade TEXT := 'Grade 1';         -- 'ECD', 'Grade R', 'Grade 1', 'Grade 2', 'Grade 3'
  p_teacher TEXT := 'Mrs. Nkosi';
  p_language TEXT := 'isiXhosa';     -- 'isiXhosa', 'English', 'Afrikaans'
  -- Children and groups defined below in the body
```

### Children Data Format

Children would be defined as a simple array of records that the script loops through:

```sql
  -- Define children as a temporary table or array of composites
  -- Each child: (first_name, last_name, age, gender, group_name)
  TYPE child_rec AS (
    first_name TEXT, last_name TEXT, age INT, gender TEXT, group_name TEXT
  );
```

Or more practically, as a series of INSERT statements generated from the spreadsheet:

```sql
  -- Group 1 children
  INSERT INTO children (id, first_name, last_name, age, gender, class_id, created_by, synced)
  VALUES
    (gen_random_uuid(), 'Amahle', 'Ndlovu', 6, 'Female', v_class_id, p_user_id, true),
    (gen_random_uuid(), 'Litha', 'Mthembu', 7, 'Male', v_class_id, p_user_id, true),
    ...
```

### Script Logic (same pattern as seed data script)

1. Look up user's `assigned_school` from `users` table
2. Upsert school (`ON CONFLICT (name) DO NOTHING`, then SELECT id)
3. Insert class with provided details
4. Fix `created_by` on class (trigger sets NULL via service role)
5. Insert all children
6. Fix `created_by` on children
7. Insert `staff_children` junction records (one per child)
8. Create groups (from distinct group names in the children list)
9. Insert `children_groups` junction records
10. RAISE NOTICE with summary

### Important Details

- All `synced` fields set to `TRUE` (data is going directly into Supabase)
- Legacy `class`, `teacher`, `school` TEXT columns on children filled for backwards compat
- `ON CONFLICT DO NOTHING` on all unique constraints for safety
- Groups created from the distinct group names found in the children data

## Workflow for Admin

1. Open the class list spreadsheet
2. Format children as SQL INSERT values (or use a simple find-replace from CSV)
3. Fill in user UUID, class details
4. Run via Supabase SQL Editor or MCP `execute_sql`
5. Verify in app — user should see all children and groups immediately

## File Location
`scripts/bulk_import_children.sql` (to be created alongside `scripts/seed_test_data.sql`)

## Related
- See `documentation/seed_data_plan.md` for the fake/test data seed script (similar approach, different purpose)
