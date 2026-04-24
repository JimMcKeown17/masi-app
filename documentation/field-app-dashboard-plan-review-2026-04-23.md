# Review Findings: `i-have-testers-using-precious-breeze.md`

Date: 2026-04-23
Plan reviewed: `/Users/jimmckeown/.claude/plans/i-have-testers-using-precious-breeze.md`

## Findings

### High

1. `getSyncHealth()` query pattern will fail on `children_groups`.
   - The plan proposes repeating `SUM(CASE WHEN synced = false THEN 1 ELSE 0 END)` across tables including `children_groups`.
   - In current schema, `children_groups` does not have a `synced` column.
   - Evidence:
     - Plan: `/Users/jimmckeown/.claude/plans/i-have-testers-using-precious-breeze.md` (sync health SQL pattern)
     - Schema: `supabase-migrations/01_add_groups_feature.sql` (`children_groups` columns)

2. Query execution approach is underspecified.
   - The plan states queries run as "raw Postgres via the service-role Supabase client," while also deferring RPC.
   - The SQL shown cannot be executed directly via standard `.from(...).select(...)` patterns.
   - A concrete mechanism should be locked in up front (RPC functions or direct Postgres driver).
   - Evidence:
     - Plan: `/Users/jimmckeown/.claude/plans/i-have-testers-using-precious-breeze.md` (query section and RPC note)

### Medium

3. Top-level page fetch plan conflicts with drill-down route responsibilities.
   - The plan says the top-level page fetches all four queries in parallel.
   - It also defines drill-down as a separate dynamic route that fetches `getCoachDetail(userId)`.
   - This creates ambiguity and likely redundant fetches.
   - Evidence:
     - Plan: `/Users/jimmckeown/.claude/plans/i-have-testers-using-precious-breeze.md` (files to create section)

4. Assessment joins can drop rows due to no FK on `assessments.child_id`.
   - The plan says assessments are joined with children and users.
   - In current schema, `assessments.child_id` intentionally has no FK; orphaned child IDs are possible.
   - Inner joins could undercount/hide valid assessment records.
   - Evidence:
     - Plan: `/Users/jimmckeown/.claude/plans/i-have-testers-using-precious-breeze.md` (`getAssessmentResults`)
     - Schema: `supabase-migrations/05_add_assessments_table.sql` (no FK on `child_id`)

5. Security model should not rely on middleware alone for service-role data.
   - Plan correctly keeps service role server-side, but relies on middleware route gating for access.
   - Because service-role bypasses RLS, server-side role checks in page loaders/data functions should be added for defense in depth.
   - Evidence:
     - Plan: `/Users/jimmckeown/.claude/plans/i-have-testers-using-precious-breeze.md` (architecture and access-tier sections)

## Open Questions

1. Should `children_groups` be excluded from unsynced metrics, or should a backward-compatible `synced` column be added?
2. Should assessment queries preserve rows with missing child records (LEFT JOIN behavior)?
3. Should role authorization be duplicated in server code (`/pm/field-app` page and data layer) in addition to middleware?
