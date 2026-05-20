# Schema Hardening Plan Review - Rev 7

Reviewed plan: `/Users/jimmckeown/.claude/plans/i-can-update-my-glistening-milner.md`  
Review date: 2026-05-12  
Prior review: `docs/plan-reviews/schema-hardening-plan-review-rev6-2026-05-12.md`

Scope of this pass: static review against the current Rev 7 plan and the live repo files. I did not re-query the live Supabase database in this pass, so the row counts and current production values in the plan are treated as plan-provided facts.

Verdict: Rev 7 is materially stronger than Rev 6. The two-build cutover shape is now correct, the pending-session sync path is described, the sanitizer has an owner, and the docs/test list is much better. I would still do one more revision before implementation, because the remaining gaps are exactly the sort that can make a migration look clean while old local records still fail to drain.

## Blocking Corrections

### 1. Sanitizer-cleaned records must be re-queued by clearing retry and failed metadata

The plan says `asyncStorageSanitizer` should clean per-table AsyncStorage rows and inspect `@sync_meta.failedItems`, but it does not say that cleaned records have their retry metadata cleared.

That matters because the live sync loop refuses to retry a record once it reaches the max retry count:

- `src/services/offlineSync.js:171-183`

The metadata helpers that control this live in:

- `src/utils/storage.js:408-473`

So if a child/session record already hit max retries due to legacy-column `PGRST204`, the sanitizer can remove the bad keys and the record will still be skipped forever unless the sanitizer also clears the failed state.

Add this explicitly:

- When the sanitizer mutates a record, clear that record's retry attempts, last sync error, and failed item entry.
- Use the same table key shape as sync metadata uses, e.g. `CHILDREN_<id>` / `SESSIONS_<id>`.
- Leave the record `synced: false`.
- Call `refreshSyncStatus()` after the cleanup so auto-sync can retry it.
- Add a test where a record has `retryAttempts >= MAX_RETRY_ATTEMPTS`, gets cleaned by the sanitizer, and is actually attempted on the next sync.

Without this, the buffer-week drain can produce reassuring-looking cleaned payloads while the app still never posts them.

### 2. School import and backfill need an explicit duplicate-name/ambiguity preflight

The plan moves schools toward `school_uid` as the canonical external key, but the live `schools` table currently has `name TEXT NOT NULL UNIQUE`:

- `supabase-migrations/06_add_schools_and_classes.sql:8-11`

The seed script will import 325 CSV rows and the user backfill later matches by `lower(trim(users.assigned_school)) = lower(trim(schools.name))`. That only works safely if normalized school names are unique in the CSV and in the resulting table.

Add a required Phase 2 preflight:

- Parse the CSV and report duplicate `lower(trim(name))` values before writing.
- Check existing placeholder rows for normalized-name collisions before inserting by `school_uid`.
- Decide explicitly whether `schools.name` remains globally unique.
- If duplicate names exist, do not run the name-based `users.school_id` backfill until there is an explicit `assigned_school` to `school_uid` mapping.

If names are unique, the plan can keep the current constraint. If they are not, the current seed can fail on `schools_name_key`, and relaxing the constraint without changing the backfill would make school assignments nondeterministic.

### 3. The final verification checklist still weakens the Build B gate

The main Phase 5 and Phase 6 sections correctly say the destructive drop is gated on Export Database evidence showing `schema_hardening_build === 'build-b'`.

But the later verification checklist still says:

> confirm each active install is on Build B (via WhatsApp confirmation OR a `MIN_REQUIRED_BUILD` constant the app warns on)

That wording should be removed. WhatsApp confirmation and a minimum-build warning are useful prompts, but they are not evidence. The destructive migration gate should only accept:

- Export Database JSON from every active install/account.
- `schema_hardening_build === 'build-b'`.
- `app_version` matches Build B.
- Per-table local stores and sync metadata pass the cleanup checks.

This was a Rev 6 issue that is fixed in the main plan text but still present in the end-to-end checklist.

## Important Fixes

### 4. `normalizeProfile()` must preserve already-normalized cached profiles

The plan says cached profiles must work in legacy, transitional, and final shapes. Good. The sample normalizer, though, only reads `raw.job_title_lookup?.name` and `raw.job_title`; it does not read already-normalized cached fields such as `raw.jobTitleName`, `raw.jobTitleCode`, `raw.schoolName`, or `raw.schoolId`.

That can matter because `AuthContext` is cache-first today:

- `src/context/AuthContext.js:103-124`

If a normalized legacy profile is saved without lookup objects, then later read offline and normalized again, the sample code could erase the role/school display and break session routing.

Add explicit fallback order:

```js
const jobTitleName =
  raw.job_title_lookup?.name ?? raw.jobTitleName ?? raw.job_title ?? null;
const jobTitleCode =
  raw.job_title_lookup?.code ?? raw.jobTitleCode ??
  (jobTitleName ? JOB_TITLE_CODE_BY_NAME[jobTitleName] : null) ?? null;
const schoolName =
  raw.school_lookup?.name ?? raw.schoolName ?? raw.assigned_school ?? null;
const schoolId =
  raw.school_lookup?.id ?? raw.schoolId ?? raw.school_id ?? null;
```

Also add this as a fourth `normalizeProfile.test.js` case: "already-normalized cached legacy profile with no lookup objects."

### 5. Children sanitizer rules conflict with the final gate

Rev 7 says the sanitizer strips `children.class` / `school` / `teacher` only when `class_id` is set. Later, the Build A and Build B export gates say unsynced `@children` records should have none of those legacy keys.

Those two rules can conflict for old local children with legacy text fields but no `class_id`. The sync-strip map will prevent the keys from being posted, but the export gate will still fail because the keys remain in AsyncStorage.

Pick one explicit rule:

- Preferred: the sanitizer strips legacy child keys from all unsynced `@children` records before the final gate, and separately logs `class_id IS NULL` children for manual review if preserving the old class/school text matters.
- Alternative: keep the conditional strip, but change the export gate to allow `class_id`-null legacy children and rely on `offlineSync.js` stripping before upsert.

Given the plan already says those child text fields have zero mobile reads and are being dropped, the first option is cleaner.

### 6. Add a legacy `job_title` constraint preflight before transition-mode tester imports

The transition-mode tester script will write both `job_title_id` and legacy `users.job_title`, including the new `1000 Stories` role. The plan captures that `job_title` is now text and the enum type is gone, but it does not explicitly check whether any old CHECK constraint still limits legacy text values.

Add a preflight before onboarding the 32 testers:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass
  AND pg_get_constraintdef(oid) ILIKE '%job_title%';
```

If any constraint still allows only the old four values, transition-mode imports for `1000 Stories` will fail even though the new lookup row exists.

## Smaller Improvements

- `debugExport.js` should use build metadata that is actually populated in production. The current export is hardcoded (`src/utils/debugExport.js:42-50`), and `app.json` does not define `ios.buildNumber` or `android.versionCode` directly. If build number is only defense-in-depth, say so; otherwise use a reliable source such as native build metadata.
- The tester import script should validate all CSV rows and resolve all `job_title_code` / `school_uid` lookups before creating any Auth users. That avoids partial "auth user exists, profile failed" onboarding runs.
- The Build B smoke test that clears `@job_titles` may not exercise the pending-session path if `profile.jobTitleId` is still cached. Add a mock/unit test or manual variant where both `jobTitles` and `profile.jobTitleId` are absent.
- Update the `SessionFormScreen` unsupported-role message along with the gate. It currently displays `profile?.job_title` (`src/screens/sessions/SessionFormScreen.js:20`); after final-shape profiles it should use `profile?.jobTitleName`.

## What Looks Good Now

- The Build A / migration 16 / Build B / destructive drop sequence is the right compatibility shape for devices that update slowly.
- The plan now correctly treats `session_type_id` as mandatory before dropping `session_type`.
- The new `LOCAL_ONLY_KEYS_TO_STRIP` layer addresses the `_pendingJobTitleResolve` `PGRST204` risk from Rev 6.
- The named `SchemaHardeningBootstrap` owner closes the previous "service exists but never runs" gap.
- The table-scoped strip map avoids breaking `classes.teacher`, which is still required.
- `SessionHistoryScreen` now accounts for server joined rows, legacy local rows, and Build B local rows with only `session_type_id`.
- Documentation updates now include `documentation/DATABASE_SCHEMA_GUIDE.md`, which is necessary because this is a schema-shape change.

## Bottom Line

I would not call Rev 7 implementation-ready until the three blocking corrections are folded in. After that, the plan is in good enough shape to implement phase by phase with tight verification. The remaining work is mostly precision around migration operations and local-state cleanup, not a change to the overall architecture.
