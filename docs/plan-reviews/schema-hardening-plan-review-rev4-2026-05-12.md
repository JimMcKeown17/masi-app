# Schema Hardening Plan Review - Rev 4

Reviewed plan: `/Users/jimmckeown/.claude/plans/i-can-update-my-glistening-milner.md`  
Review date: 2026-05-12  
Prior reviews:
- `docs/plan-reviews/schema-hardening-plan-review-2026-05-12.md`
- `docs/plan-reviews/schema-hardening-plan-review-rev2-2026-05-12.md`
- `docs/plan-reviews/schema-hardening-plan-review-rev3-2026-05-12.md`

Scope of this pass: static review against the current repo, prior review artifacts, and the referenced schools CSV. I did not re-query the live Supabase database in this pass.

Verdict: Rev 4 is much closer, but I would not execute it exactly as written. The Rev 3 blockers are mostly addressed: historical sessions are backfilled, sync stripping is table-scoped, `get_children_in_group` is handled, and sanitizer completion is now per-task. The remaining issues are narrower, but one sequencing bug can still recreate the exact `PGRST204` failure pattern this plan is trying to avoid.

## Blocking Corrections

### 1. Phase 5 drops `sessions.session_type` before the installed app stops sending it

Rev 4's Phase 4 compatibility build intentionally dual-writes sessions:

```js
session_type: 'Literacy Coach',
session_type_id: '<uuid>'
```

It also explicitly says not to strip `session_type` during Phase 4 because the current database column is `TEXT NOT NULL`. That part is correct.

The problem is Phase 5 then drops `sessions.session_type`, and only **after that migration** does the plan ship a follow-up mobile build that removes `session_type` from local writes and sync payloads. That leaves the active compatibility build installed on testers' phones sending a now-dropped column. Current `src/services/offlineSync.js` forwards every record field except `synced` and `_deleted`, so a compatibility-build session created after the drop can be posted with `session_type` and fail with `PGRST204`.

The verification step that says "Open the running mobile build ... create a session ... Nothing should error" should fail if "running mobile build" means the Phase 4 compatibility build.

Safer options:

- Make the Phase 4 app post-drop-safe before Phase 5, e.g. schema-version-aware session sync, or a targeted `PGRST204` retry path that removes `session_type` only after the column is confirmed gone.
- Or relax `sessions.session_type` to nullable while keeping the column, ship a final-payload build that no longer sends `session_type`, confirm every active install opened that build and all queues drained, then drop the column.
- Or keep `sessions.session_type` through Phase 5 and schedule the destructive drop only after a final-safe build is deployed and verified.

The destructive-drop gate should require every active install/account to have opened the **final-safe build**, not just the compatibility build.

### 2. Canonical role/school fields need a `users` RLS update

The plan makes `users.job_title_id` and `users.school_id` the canonical role and school assignments, and `jobTitleCode` controls app behavior such as session-form routing. The existing migration still has:

```sql
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (id = auth.uid());
```

That policy was already loose for the old text fields, but it becomes more important once role and school are canonical lookup FKs. A signed-in user should not be able to change their own `job_title_id` or `school_id` through the Data API.

Before relying on these fields, add an RLS/privilege correction:

- If field staff do not need profile self-editing, drop the self-update policy and keep profile changes service-role/admin-script only.
- If they do need self-editing for harmless fields, restrict updates to those columns via column privileges or a narrow RPC; a `WITH CHECK (id = auth.uid())` alone does not prevent changing role/school.
- Add a verification query or authenticated-client negative test proving a normal user cannot update their own `job_title_id` or `school_id`.

## Important Fixes

### 3. Replace the remaining `migrationVersion: 2` wording

The plan correctly moved to `@sanitizer_state = { childrenLegacyKeysStripped, sessionsEnriched, ... }`, but Phase 4 verification still says to confirm `migrationVersion: 2`. Remove the old global-version check and make the export review look only at the per-task sanitizer state.

### 4. Fix the migration 15 filename mismatch

Phase 3 introduces:

```text
supabase-migrations/15_fk_backfill_and_checks.sql
```

but the file list and verification section refer to:

```text
supabase-migrations/15_users_fk_backfill_and_checks.sql
```

Pick one name and use it everywhere. This is small, but migration sequencing is already high-risk enough that the plan should not have two names for the same step.

### 5. Make the `job_titles` anon access decision consistent

The migration grants `SELECT` on `job_titles` to both `authenticated` and `anon`, but the RLS policy is only:

```sql
FOR SELECT TO authenticated USING (true)
```

If no pre-auth screen reads job titles, remove the `anon` grant. If anon access is genuinely needed, the policy must include `anon` too. Right now the comment and SQL disagree.

### 6. Tighten the Phase 3 preflight wording

Rev 4 includes the useful unmatched-value queries earlier in the plan, but the verification checklist still says to run `SELECT COUNT(*) FROM users WHERE school_id IS NULL` before applying migration 15. Before the backfill, that count is expected to be high and does not prove matchability.

In the checklist, point operators to the unmatched `assigned_school` / `job_title` / `session_type` queries first. The null-count checks should be post-backfill gates.

### 7. Make tester-import mode explicit

The plan says `--transition` is the default during Phase 4 and "without the flag" is the default after Phase 5. A script cannot safely infer that from time unless it introspects schema or requires an explicit mode.

Prefer one of:

- `--mode=transition|final`, required every run.
- Schema introspection that refuses transition writes once legacy columns are gone.
- Both.

### 8. Correct the `LETTER_LANGUAGES` reference

The plan says `src/constants/egraConstants.js` defines `LETTER_LANGUAGES`, but the current file exports `LETTER_SETS` and `WORD_SETS`, not `LETTER_LANGUAGES`. Either add the constant as part of the work or phrase the documentation update as deriving allowed languages from the existing sets.

## What Looks Good Now

- The migration numbering starts after existing migration `12_add_children_hidden_at.sql`.
- The schools seed no longer truncates FK-referenced rows.
- I checked the referenced schools CSV locally: 325 rows, no duplicate normalized `School` names, and no duplicate `School UID` values.
- `csv-parse` is correctly called out as not currently installed.
- The plan now keeps `classes.teacher` out of the legacy strip list.
- The profile join aliases avoid the old `job_title` string/object collision.
- `normalizeProfile()` now handles old cached profiles well enough for offline startup.
- `SessionHistoryScreen` now includes both query and renderer changes.
- The Phase 5 gate correctly includes the 32 newly onboarded testers if they use the app during the buffer.

## Bottom Line

Do one more revision before implementation. The required changes are: make the app installed before Phase 5 safe to run after `session_type` is dropped, and lock down `users` role/school updates before those fields become canonical. After that, the remaining fixes are mostly operator-safety and documentation cleanup.
