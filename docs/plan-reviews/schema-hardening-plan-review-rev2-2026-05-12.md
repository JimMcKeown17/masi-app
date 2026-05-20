# Schema Hardening Plan Review - Rev 2

Reviewed plan: `/Users/jimmckeown/.claude/plans/i-can-update-my-glistening-milner.md`  
Review date: 2026-05-12  
Prior review: `docs/plan-reviews/schema-hardening-plan-review-2026-05-12.md`  
Verdict: much improved, but I would still make a few corrections before executing it.

The revised plan fixes the major first-pass problems: it no longer reuses migration numbers `11`/`12`, it avoids truncating referenced `schools` rows, it recognizes the `job_title` drift, and it adds the right high-level compatibility strategy before destructive drops. The remaining risks are narrower, but two of them can still create field sync failures if implemented literally.

## Blocking Corrections

### 1. Do not strip `sessions.session_type` during the compatibility phase

Phase 4 says `LiteracySessionForm` should dual-write both:

- `session_type: 'Literacy Coach'`
- `session_type_id: <uuid>`

That is the right compatibility shape while the legacy column still exists.

But the same phase also says `asyncStorageSanitizer.js` and `offlineSync.js` should strip legacy keys including `session_type` from records that have the FK equivalent. That contradicts the dual-write requirement and conflicts with the current schema: `sessions.session_type` is `TEXT NOT NULL` in `supabase-migrations/00_initial_schema.sql`.

If a new unsynced session is inserted during Phase 4 with `session_type` stripped, Supabase will receive a session insert without a required `session_type` column and can fail with a NOT NULL violation. If the intent is to strip `session_type` before Phase 5, the plan must first relax `sessions.session_type` to nullable. Otherwise, keep `session_type` in sync payloads during Phase 4 and only strip it after the destructive migration has dropped the column.

Recommended correction:

- Phase 4 sanitizer should **enrich** session records with `session_type_id` when possible, not remove `session_type`.
- Phase 4 `offlineSync` should continue sending `session_type` until the database no longer requires it.
- After Phase 5, either ship a follow-up build that strips `session_type`, or make the Phase 4 sync logic schema-version-aware so it only strips after the column is dropped.

### 2. `normalizeProfile` must derive `jobTitleCode` from legacy cached profiles

The proposed adapter is close:

```js
jobTitleCode: raw.job_title_lookup?.code ?? null
```

But old cached profiles only have `profile.job_title = 'Literacy Coach'`. If a tester opens the updated app offline, or before the joined profile fetch succeeds, `jobTitleCode` will be `null`. Then `SessionFormScreen` will stop routing them to `LiteracySessionForm`, because the plan also changes the gate to:

```js
profile?.jobTitleCode === 'literacy_coach'
```

That breaks the existing session workflow exactly when the compatibility build is supposed to be forgiving.

Recommended correction:

- Add a small display-name-to-code fallback in `normalizeProfile`.
- Keep `jobTitleName` and `jobTitleCode` populated for all three shapes: legacy cache, transitional joined profile, final FK-only profile.
- Add a regression test or manual smoke step for "old cached profile, offline startup, tap New Session."

Example fallback:

```js
const JOB_TITLE_CODE_BY_NAME = {
  'Literacy Coach': 'literacy_coach',
  'Numeracy Coach': 'numeracy_coach',
  'ZZ Coach': 'zz_coach',
  Yeboneer: 'yeboneer',
  '1000 Stories': 'one_thousand_stories',
};
```

### 3. The sanitizer needs to target the real storage model, not only a queue

The plan mentions walking `@masi/sync_queue` and equivalent keys. In this app, the active sync source of truth is the per-table AsyncStorage arrays:

- `@sessions`
- `@children`
- `@classes`
- `@staff_children`
- `@children_groups`
- `@assessments`
- `@letter_mastery`
- plus `@sync_meta` for retry/failed state

`@sync_queue` exists in `storage.js`, but the current `offlineSync.js` syncs by scanning records where `synced === false`; it does not drain a central queue.

Recommended correction:

- Make the sanitizer explicitly scan the per-table arrays that can contain stale payload keys.
- For `children`, strip `class` / `school` / `teacher` only when `class_id` exists.
- For `sessions`, do not strip `session_type` in Phase 4; enrich `session_type_id` instead.
- Include `@sync_meta.failedItems` in the review because terminal failures can be marked `synced: true` locally while still needing operator attention.

## Important Plan Fixes

### 4. Add provider/storage wiring for `LookupsContext`

The plan lists `src/context/LookupsContext.js`, but implementation will also need:

- `App.js` provider wiring under `AuthProvider` and inside `OfflineProvider`.
- New storage keys/helpers in `src/utils/storage.js`, e.g. `JOB_TITLES`.
- A fetch/cache service or context method for `job_titles`.
- Startup/reconnect behavior similar to `ClassesContext.loadSchools()`.

Without those wiring steps, `LiteracySessionForm` will not have a durable offline source for `session_type_id`.

### 5. Update the `SessionHistoryScreen` query, not only the renderer

The plan updates the renderer to use:

```js
item.session_type_lookup?.name || item.session_type || 'Session'
```

But the current screen fetches sessions with `.select('*')`. After Phase 5, server rows will only have `session_type_id`; no lookup object will be present unless the query embeds it.

Recommended correction:

```js
.select('*, session_type_lookup:job_titles(id,name,code)')
```

Then the renderer can safely handle cached legacy rows, transitional rows, and final FK-only rows.

### 6. Fix the "missing FK" preflight queries

The plan's Phase 3 dirty-data preflight includes:

```sql
SELECT COUNT(*) AS users_missing_school_id FROM public.users WHERE school_id IS NULL;
SELECT COUNT(*) AS users_missing_job_title_id FROM public.users WHERE job_title_id IS NULL;
```

Before the backfill migration runs, those counts are expected to be all users, so they do not tell you whether the backfill will work. The useful preflight is "which existing text values will fail to match a lookup row?"

Add queries like:

```sql
SELECT u.assigned_school, COUNT(*)
FROM public.users u
LEFT JOIN public.schools s
  ON lower(trim(u.assigned_school)) = lower(trim(s.name))
WHERE u.assigned_school IS NOT NULL
  AND s.id IS NULL
GROUP BY u.assigned_school
ORDER BY COUNT(*) DESC, u.assigned_school;

SELECT u.job_title, COUNT(*)
FROM public.users u
LEFT JOIN public.job_titles j
  ON lower(trim(u.job_title)) = lower(trim(j.name))
WHERE u.job_title IS NOT NULL
  AND j.id IS NULL
GROUP BY u.job_title
ORDER BY COUNT(*) DESC, u.job_title;
```

Then the post-migration zero-null checks become meaningful.

### 7. `csv-parse` is not currently in `package.json`

The plan says to use `csv-parse` and verify it is already present. I checked `package.json`; it is not listed. That is fine, but the plan should explicitly add one of these choices:

- add `csv-parse` as a script dependency, or
- implement robust CSV parsing with a standard library/tool already available.

Given the schools CSV has a UTF-8 BOM and multiline quoted fields, do not use the current `scripts/createTesters.js` line-splitting parser as a template for `seedSchools.js`.

### 8. Make `createTesters.js` phase-aware

The revised plan correctly says the tester import script should write both legacy text fields and FK fields during the transition window. After Phase 5, those legacy columns are gone, so the same script must stop writing `assigned_school` and `job_title`.

Recommended correction:

- Add an explicit `--transition` or `--legacy-compatible` mode for dual-writes.
- Make the default final-schema path write only `school_id` and `job_title_id`.
- Update `scripts/testers.example.csv`; the current example includes `Field Manager`, which is not in the planned `job_titles` seed.

## What Looks Good Now

- The migration numbering is now aligned with the repo's existing `13+` path.
- The school seed approach is now reproducible and avoids deleting FK-referenced placeholder rows.
- `ON DELETE RESTRICT` for required user lookup FKs is the right correction.
- The soft cutover with a buffer week is the right operational shape for a field app with multiple builds in use.
- The Phase 5 gate is much stronger than the prior plan, especially requiring exported databases and zero unsynced records.
- Keeping `classes.teacher` free text remains a good product decision.
- CHECK constraints for picker-backed fields are appropriate, provided dirty-data queries are run first.

## Suggested Updated Bottom Line

I would approve the architecture after the plan incorporates the corrections above. The biggest required change is to separate "dual-write legacy `session_type` during compatibility" from "strip dropped columns after the destructive migration." The second required change is making profile normalization truly backward-compatible for old cached profiles, or the compatibility build can accidentally block literacy session capture while offline.

Once those are fixed, this is a reasonable, cautious schema hardening plan.
