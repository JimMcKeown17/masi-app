# Schema Hardening Plan Review - Rev 6

Reviewed plan: `/Users/jimmckeown/.claude/plans/i-can-update-my-glistening-milner.md`  
Review date: 2026-05-12  
Prior review: `docs/plan-reviews/schema-hardening-plan-review-rev5-2026-05-12.md`

Scope of this pass: static review against the current Rev 5 plan and the live repo. I did not re-query the live Supabase database in this pass.

Verdict: the architecture is close, and the earlier major blockers are materially fixed. I would not treat the plan as implementation-ready until the first two corrections below are added, because both affect whether Build A/Build B can safely drain and sync session records before the destructive migration.

## Blocking Corrections

### 1. Define the local-only session marker behavior in `offlineSync.js`

The plan now introduces `_pendingJobTitleResolve` for sessions that were captured before `session_type_id` could be resolved. That is the right idea, but the plan does not yet say how this marker is removed before Supabase upsert.

The live sync path currently strips only `synced` and `_deleted` before posting a record:

- `src/services/offlineSync.js:119-129`

Rev 5 adds a table-scoped legacy strip map, but the example only includes `children`, `users`, and later `sessions: ['session_type']`. It does not include `_pendingJobTitleResolve` or any future local fallback such as `session_type_code`. If a pending session is enriched and then posted with `_pendingJobTitleResolve` still present, Supabase will reject it as an unknown column, likely another `PGRST204`.

Add an explicit local-only strip layer before every upsert, separate from schema-legacy stripping:

```js
const LOCAL_ONLY_KEYS_TO_STRIP = [
  'synced',
  '_deleted',
  '_pendingJobTitleResolve',
  'pendingSessionTypeCode',
];
```

Also make the pending-session sync path explicit:

- For `sessions`, attempt just-in-time `session_type_id` resolution before upsert.
- If resolution succeeds, update the local session, clear `_pendingJobTitleResolve`, and post a clean payload.
- If resolution still fails, leave the record `synced: false`, set a clear local sync reason, and return a skipped/non-terminal result.
- Do not use the existing terminal quarantine path for this case.

That last point matters because the live terminal failure branch marks failed rows as synced to stop retries:

- `src/services/offlineSync.js:243-246`

If a pending Build B session ever goes through that branch, it can become stranded locally and never sync after the lookup cache is available.

Add a focused test around this exact case: a local session with `_pendingJobTitleResolve: true` gets enriched from cached `job_titles`, posts without the marker, clears the marker locally, and is marked synced. Add a second test where no lookup is available and the record remains unsynced without being posted.

### 2. Give the sanitizer a concrete runtime owner and timing

The plan says `src/services/asyncStorageSanitizer.js` "runs on app startup", but no component or context is assigned to call it. The file list creates the service and wires `LookupsProvider`, but it does not specify the bootstrap hook that runs the sanitizer after the prerequisites exist.

This is easy to miss during implementation because the app's existing startup work lives in `OfflineContext`:

- `src/context/OfflineContext.js:161-180`

That is not a good place to run this sanitizer as-is, because the sanitizer state is user-scoped and session enrichment depends on a populated `job_titles` cache. Running it before `AuthContext` has `user.id`, or before `LookupsContext` has loaded `job_titles`, creates exactly the partial-run problem the plan is trying to avoid.

Add an explicit implementation target, for example:

- `src/context/SchemaHardeningBootstrap.js` or a hook inside `LookupsProvider`
- Mounted inside `OfflineProvider`, `AuthProvider`, and `LookupsProvider`
- Runs when `user.id` is present
- Reruns when cached `job_titles` first becomes non-empty
- Reruns on reconnect if either sanitizer task is incomplete
- Calls `refreshSyncStatus()` after mutating records so the sync badge and auto-sync state are correct

The sanitizer state design is good. It just needs a named execution point so the service cannot be implemented and then never invoked.

## Important Fixes

### 3. Tighten the Build B gate wording in the verification section

The main Phase 6 gate correctly says every active install/account must have an Export Database JSON showing `schema_hardening_build === 'build-b'`.

However, the later verification checklist still says:

> confirm each active install is on Build B (via WhatsApp confirmation OR a `MIN_REQUIRED_BUILD` constant...)

Keep WhatsApp or a minimum-build warning as operational aids, but do not word them as an alternative gate. For the destructive drop, the gate should be:

- Every active install exports JSON with `schema_hardening_build === 'build-b'`.
- `app_version` matches Build B.
- The exported per-table stores and `@sync_meta.failedItems` pass the cleanup checks.

This avoids an operator reading the shorter checklist and proceeding without the export evidence.

### 4. Add `documentation/DATABASE_SCHEMA_GUIDE.md` to the docs updates

The plan updates `CLAUDE.md`, `documentation/LEARNING.md`, and `PRD.md`, but this repo's standing instructions call out `documentation/DATABASE_SCHEMA_GUIDE.md` as a key schema reference.

That file still documents the old shape, including:

- `users.job_title` / `users.assigned_school`
- `job_title` as a CHECK-constrained text field
- `sessions.session_type TEXT NOT NULL`

After this migration, that guide needs to describe `job_titles`, `users.school_id`, `users.job_title_id`, `sessions.session_type_id`, the transition period, and the final removal of the legacy text columns.

### 5. Preserve session history labels for local Build B records

The plan correctly updates `SessionHistoryScreen` to fetch `session_type_lookup` from Supabase and render:

```js
item.session_type_lookup?.name || item.session_type || 'Session'
```

That fixes server-fetched rows. But Build B local pending records will have `session_type_id` and no `session_type`. Until they sync and reload from Supabase, they will render as generic `"Session"`.

Add one more fallback for local records: resolve `item.session_type_id` against cached `job_titles`. This is not a data-integrity blocker, but it keeps the field UX from regressing during offline use.

### 6. Make the test additions explicit

The plan has strong manual verification. I would add a small automated net for the highest-risk mobile code changes:

- `normalizeProfile()` handles legacy cached, transitional, and final joined profile shapes.
- `offlineSync` strips table-scoped legacy keys without stripping `classes.teacher`.
- `offlineSync` strips local-only pending markers before upsert.
- Build B pending sessions do not post until `session_type_id` is resolvable.
- The sanitizer is idempotent and does not mark `sessionsEnriched` complete until `job_titles` was available.

These are cheap tests and they protect the exact compatibility behavior that makes the migration safe.

## Minor Cleanup

- In the high-level Strategy D summary, replace "pending records in the sync queue" with "pending records in the per-table AsyncStorage stores". The detailed section is already correct, but the summary still uses the old queue wording.
- The plan says `seedSchools.js` and `createTesters.js` should share the same `csv-parse` helper. Add the helper file path to the file list, for example `scripts/lib/parseCsv.js`, so implementation workers do not duplicate parser setup.

## What Looks Good Now

- The plan now has the right two-build migration shape: Build A dual-writes, migration 16 relaxes `session_type`, Build B stops writing the legacy text column, and only then does migration 17 drop it.
- The user self-update RLS issue is addressed before `school_id` and `job_title_id` become routing/security-relevant.
- `SessionHistoryScreen` now includes both the joined query and renderer change for server rows.
- The tester import script is correctly phase-aware and uses stable `job_title_code` / `school_uid` values.
- The destructive migration is gated on build evidence, clean exports, null-count checks, and a `pg_dump` snapshot.

## Bottom Line

I would do one more revision before implementation. The remaining work is not a rethink of the architecture; it is tightening the execution details around pending session records, sanitizer startup, and final gate wording. Once those are explicit, the plan is in good shape to implement carefully phase by phase.
