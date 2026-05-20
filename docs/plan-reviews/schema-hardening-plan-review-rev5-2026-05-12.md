# Schema Hardening Plan Review - Rev 5

Reviewed plan: `/Users/jimmckeown/.claude/plans/i-can-update-my-glistening-milner.md`  
Review date: 2026-05-12  
Prior review: `docs/plan-reviews/schema-hardening-plan-review-rev4-2026-05-12.md`

Scope of this pass: static review against the Rev 5 plan, the current repo, and the prior Rev 4 feedback. I did not re-query the live Supabase database in this pass.

Verdict: Rev 5 is close and the major Rev 4 blockers have been addressed. In particular, the new Build B sequence before `sessions.session_type` is dropped is the right architectural correction, and the plan now includes the missing users RLS lockdown. I would still make two corrections before implementation because both affect the final destructive-drop gate.

## Blocking Corrections

### 1. The Build B gate depends on export metadata that does not exist yet

Rev 5 says the Phase 5 gate should confirm each active install is on Build B, and the verification checklist says to confirm the build version field in the exported database equals Build B.

That is a good gate, but the current export cannot support it. `src/utils/debugExport.js:42-48` hardcodes:

```js
app_version: '1.0.0',
device_info: {
  platform: Platform.OS,
  version: Platform.Version,
},
```

Meanwhile `app.json` is already `1.1.0`, and the Profile screen displays version/build from `Constants.expoConfig`, not from the export path. If operators rely on Export Database snapshots as the proof that a tester is on Build B, every export will currently look stale or ambiguous.

Add `src/utils/debugExport.js` to the Phase 4/Build A file list and include real release metadata in the JSON export:

- app version from `Constants.expoConfig?.version`
- iOS build number / Android version code from `Constants.expoConfig`
- `runtimeVersion` and update URL/channel if available
- optionally a named app build marker such as `schemaHardeningBuild: 'build-a' | 'build-b'`

Then make the gate explicit: before Phase 6, every exported JSON must show the Build B marker/version, not just a WhatsApp confirmation. A manual confirmation can still be a backup, but it should not be the only evidence for the destructive drop.

### 2. Build B needs a defined offline fallback when `session_type_id` is unavailable

Rev 5 says Build A dual-writes `session_type` and `session_type_id`, and if the `job_titles` cache is unavailable Build A may write only `session_type` and enrich later. That is safe while `sessions.session_type` still exists.

Build B is different: the plan says `LiteracySessionForm.js` writes only `session_type_id` and strips `session_type` from sync payloads. After Phase 6, `session_type_id` becomes `NOT NULL`. If a fresh or cache-poor device captures a session offline without a usable job-title UUID, the record has no valid final-schema session type. Current `offlineSync.syncRecord()` sends all non-local fields directly, so a missing `session_type_id` would become a sync failure after the final drop.

Make the Build B rule explicit:

- Source `session_type_id` from `profile.jobTitleId` first. The normalized profile should already have it after the joined users fetch.
- Fall back to cached `job_titles` by `jobTitleCode` or display name.
- If neither is available, save the local session with a pending `session_type_code` or `jobTitleCode`, but do not attempt to sync that session yet.
- In the sessions sync path, enrich just-in-time before upsert. If enrichment still cannot run, leave the record unsynced with a clear local reason instead of sending an invalid final-schema payload.

Add one smoke test to the Build B section: simulate no `@job_titles` cache, create a session offline, then restore connectivity after the lookup cache loads; expected result is that the session syncs with `session_type_id` and never posts an empty `session_type_id`.

## Important Fixes

### 3. Update the verification wording to avoid the old central-queue trap

The plan correctly says the actual sync sources are the per-table AsyncStorage arrays (`@sessions`, `@children`, `@classes`, etc.), not a central `@masi/sync_queue`. But the Phase 4 smoke test still says to verify "the sync queue contains no records with legacy keys."

That wording is risky because `src/utils/storage.js` still has a `SYNC_QUEUE` key, but `src/services/offlineSync.js` reads from per-table `getUnsyncedRecords()` / `getUnsyncedChildren()` sources. Checking only a queue key could miss the records that actually sync.

Change the verification to:

- inspect all per-table sync sources for `synced === false`
- inspect `@sync_meta.failedItems`
- for each failed item, look up the matching record in its source table and inspect the actual payload keys

### 4. Make sanitizer state idempotent or account-scoped

Rev 5 recommends excluding `SANITIZER_STATE` from `clearDomainData()` so a re-login does not rerun sanitation. I would be careful with that. Re-running a well-written sanitizer should be harmless; skipping a sanitizer because a stale state flag survived can be more dangerous.

Safer options:

- Make each sanitizer task idempotent and allow it to rerun after re-login.
- Or store sanitizer state per user/build, for example `@sanitizer_state:{userId}` with a schema-hardening task version.

At minimum, do not let `{ sessionsEnriched: true }` from one data set suppress enrichment for a later user or a later build.

### 5. Centralize the role vocabulary in the app code

The plan introduces five canonical job-title codes, including `one_thousand_stories`, but current `src/constants/jobTitles.js` only has four display labels and no stable codes. Rev 5 currently puts a new `JOB_TITLE_CODE_BY_NAME` map inside `AuthContext`.

That will work, but it creates drift-prone duplication immediately. Prefer updating `src/constants/jobTitles.js` to export one canonical app-side map, for example:

```js
export const JOB_TITLE_CODES = {
  LITERACY_COACH: 'literacy_coach',
  NUMERACY_COACH: 'numeracy_coach',
  ZZ_COACH: 'zz_coach',
  YEBONEER: 'yeboneer',
  ONE_THOUSAND_STORIES: 'one_thousand_stories',
};

export const JOB_TITLE_BY_CODE = {
  [JOB_TITLE_CODES.LITERACY_COACH]: 'Literacy Coach',
  // ...
};
```

Then use that in `AuthContext`, `SessionFormScreen`, and any app-side session-type logic. The scripts can still resolve against the database lookup, but the mobile app should not have the same vocabulary hand-copied in multiple files.

### 6. Fix a couple of phase-number typos

The tester import section says the legacy columns are dropped at Phase 5. Rev 5 now drops them at Phase 6. Update that wording so operators do not accidentally switch the tester script too early.

The Phase 3 preflight paragraph says "the two backfill pre-flights," but there are now three: `assigned_school`, `job_title`, and `session_type`.

## What Looks Good Now

- The Build B sequencing fixes the biggest Rev 4 problem: the destructive drop now happens only after an app build exists that no longer writes `session_type`.
- Dropping the permissive `Users can update own profile` policy before `job_title_id` and `school_id` become canonical is the right security move.
- The plan now backfills historical `sessions.session_type_id` before enforcing final constraints.
- The `SessionHistoryScreen` query and renderer are both called out, which avoids losing display names after the legacy text column is gone.
- The sync strip map is table-scoped, so `classes.teacher` should not be accidentally stripped.
- The `get_children_in_group` RPC is explicitly handled before dropping `children.class`, `children.school`, and `children.teacher`.
- The tester import script now has an explicit `--mode=transition|final` design instead of time-based behavior.

## Bottom Line

I would do one more small revision before implementation. Rev 5's architecture is now basically sound, but the final destructive-drop gate needs hard evidence that every device is on Build B, and Build B needs a no-invalid-payload path for sessions created before the job-title lookup UUID is available. After those are added, the remaining issues are mostly clarity and drift-prevention cleanup.
