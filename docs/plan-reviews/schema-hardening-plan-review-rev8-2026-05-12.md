# Schema Hardening Plan Review - Rev 8

Reviewed plan: `/Users/jimmckeown/.claude/plans/i-can-update-my-glistening-milner.md`  
Review date: 2026-05-12  
Prior review: `docs/plan-reviews/schema-hardening-plan-review-rev7-2026-05-12.md`

Scope of this pass: static review against the Rev 8 plan and the live repo files. I did not re-query the live Supabase database, so the plan's production row counts and live introspection results are treated as plan-provided facts. I did trace the app code, migration history, scripts, and docs that the plan would touch.

Verdict: Rev 8 is close. The overall architecture now looks correct: additive schema first, compatibility Build A, a real buffer and export gate, nullable `sessions.session_type`, Build B that stops legacy writes, then destructive drops only after evidence. I would still fold in the corrections below before implementation, because they are the kind of small ambiguity that can break a migration even when the high-level strategy is right.

## Blocking Corrections

### 1. School seed ordering and name normalization still need to be made deterministic

The plan correctly says `schools.name` is live as `TEXT NOT NULL UNIQUE` (`supabase-migrations/06_add_schools_and_classes.sql:8-11`) and that user backfill depends on a name match (`plan:195-201`). The remaining risk is the seed script's ordering and normalization contract.

The plan says:

- preflight duplicate names by `lower(trim(name))`
- upsert each CSV row by `school_uid`
- then attempt to match the 5 existing placeholder rows with no `school_uid`

That can still fail. If an existing placeholder has the same `schools.name` as an incoming CSV row, inserting by `school_uid` first can hit `schools_name_key` before the later placeholder-match step gets a chance to attach the UID to the existing row. Also, the plan's example says values like `Khwezi Lomso` / `Khwezi-Lomso` should collapse, but `lower(trim(name))` does not collapse punctuation or internal whitespace.

Recommended change:

- Define one explicit `canonicalSchoolName()` helper for the seed script and preflight. If you intend punctuation/spacing collapse, implement it directly; otherwise remove the examples that imply it.
- Resolve existing placeholder rows before inserting new CSV rows. Build a candidate map from existing schools by `school_uid` and canonical name, attach CSV UIDs to matched placeholders first, and only then insert truly new rows.
- Require non-empty `school_uid` on every CSV row before any write.
- If canonical names collide, abort and require an explicit mapping file from `assigned_school` text to `school_uid` before Phase 3. Do not rely on the name-based `UPDATE users SET school_id = ...` when names are ambiguous.

Without this, the migration can fail in Phase 2 or, worse, seed duplicate-looking schools and make the Phase 3 user backfill nondeterministic.

### 2. Capture or resolve the existing `children.age` schema drift before calling the audit complete

The plan captures the known `users.job_title` drift, but the repo shows another schema mismatch that belongs in a schema-hardening pass:

- `supabase-migrations/00_initial_schema.sql:50` defines `children.age INTEGER NOT NULL CHECK (age > 0 AND age < 18)`.
- `src/screens/children/AddChildScreen.js:48-68` allows blank age (`null`) and values up to 20.
- `documentation/DATABASE_SCHEMA_GUIDE.md` describes nullable age.

If production already drifted to nullable age, add a capture migration the same way Rev 8 handles `job_title`. If production did not drift, the current app can save local children that will fail sync. Either way, this should be settled before this schema-hardening work ships.

Recommended preflight:

```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'children'
  AND column_name = 'age';

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.children'::regclass
  AND pg_get_constraintdef(oid) ILIKE '%age%';
```

Then choose one source of truth:

- make DB match the app: nullable age with `age IS NULL OR age BETWEEN 1 AND 20`, plus a migration capturing that; or
- make the app match the DB: require age and cap it at 17.

Given the current UI and docs, I would align the DB to the app and document it.

## Important Fixes

### 3. Make the final `App.js` provider tree explicit

The plan correctly introduces `LookupsProvider` and `SchemaHardeningBootstrap`, but the final tree should preserve the existing dependency between `ChildrenProvider` and `ClassesProvider`.

Current app tree:

- `App.js:124-130` has `OfflineProvider -> AuthProvider -> ChildrenProvider -> ClassesProvider`.
- `src/context/ClassesContext.js:12-16` calls `useChildren()`, so `ClassesProvider` must remain below `ChildrenProvider`.

Spell the intended tree out:

```jsx
<OfflineProvider>
  <AuthProvider>
    <LookupsProvider>
      <SchemaHardeningBootstrap>
        <ChildrenProvider>
          <ClassesProvider>
            <AppNavigator />
            <StatusBar style="auto" />
          </ClassesProvider>
        </ChildrenProvider>
      </SchemaHardeningBootstrap>
    </LookupsProvider>
  </AuthProvider>
</OfflineProvider>
```

That keeps the new lookup/bootstrap work inside auth/offline context without breaking class screens.

### 4. Use one exact export metadata field name and bump the app metadata that `debugExport` reads

Most of the plan uses `schema_hardening_build`, but the Build B section says `schemaHardeningBuild` once. Because this field is the destructive-drop gate, avoid any naming drift:

- Use `schema_hardening_build` everywhere.
- Add a test or tiny assertion around `exportDatabase()` metadata so Build A and Build B cannot accidentally ship with the same marker.
- When bumping versions, explicitly bump `app.json`'s `expo.version` because the proposed `Constants.expoConfig?.version` reads from Expo config. `package.json` is currently `1.0.0`, while `app.json` is `1.1.0`; do not let the gate depend on the wrong file.

### 5. Adjust the sync tests to match the module's public API or intentionally export a test seam

The plan's test list calls `syncRecord(...)`, but in the live file `syncRecord` is currently local to `src/services/offlineSync.js:119-139`. Either:

- intentionally export `syncRecord` for focused tests, or
- write the tests through `syncTableByName()` / `syncAll()` with AsyncStorage fixtures and mocked Supabase calls.

Do not leave the test plan depending on an unexported helper unless implementation also includes that test seam.

## Smaller Improvements

- The manual legacy-profile smoke test says to clear the app, sign in online, kill the app, go offline, then open New Session. After the new `AuthContext` ships, that sign-in will cache the normalized profile, not a true legacy string-only profile. Keep the manual smoke test, but cover the true legacy cache case with the planned `normalizeProfile.test.js` fixture or by importing a pre-change `@user_profile` export.
- The export gate says to inspect per-table sources for `assigned_school` / `job_title`, but there is no `@users` sync source in `src/utils/storage.js`. Clarify that `@user_profile` is display/cache data, not a sync source, and that the sync-source inspection is about `@children` and `@sessions`.
- Add stale-document cleanup for `documentation/bulk_import_children_plan.md`, `documentation/seed_data_plan.md`, and `documentation/COMPONENT_TREE.md`, or explicitly mark them historical. They still reference `assigned_school`, `job_title`, legacy child text fields, or `session_type` and could mislead the next onboarding/import task.

## What Looks Good Now

- Rev 7's blocking issues are materially addressed: sanitizer-cleaned records clear retry/failed metadata, the school duplicate-name preflight exists in principle, and the Build B gate now relies on Export Database evidence rather than WhatsApp confirmation.
- The Build A / migration 16 / Build B / destructive-drop sequence is the right compatibility shape for slow tester updates.
- The table-scoped strip map avoids the `children.teacher` vs `classes.teacher` collision.
- The pending-session path correctly avoids the terminal quarantine branch that marks records synced.
- `SessionHistoryScreen` now accounts for joined server rows, legacy local rows, and Build B local rows with only `session_type_id`.
- The tester import script requirements are much safer now: explicit mode, schema introspection, stable `job_title_code` / `school_uid`, and all-row validation before Auth user creation.

## Bottom Line

I would not ask for another architecture rewrite. I would make the corrections above, especially the school seed determinism and `children.age` drift check, then proceed phase by phase with the verification gates in the plan. The plan is close enough that the next risk is implementation precision, not the core migration design.
