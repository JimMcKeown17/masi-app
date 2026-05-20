# Schema Hardening Plan Review - Rev 9

Reviewed plan: `/Users/jimmckeown/.claude/plans/i-can-update-my-glistening-milner.md`  
Review date: 2026-05-12  
Prior review: `docs/plan-reviews/schema-hardening-plan-review-rev8-2026-05-12.md`

Scope of this pass: static review against the Rev 9 plan and the live repo files. I did not re-query the live Supabase database, so production counts and live introspection results are treated as plan-provided facts. I did re-check the app code, migration history, scripts, docs, and the existing plan-review trail.

Verdict: Rev 9 is close enough that I would not ask for another architecture rewrite. The high-level migration shape is now right: additive schema, compatibility Build A, real sync/export gate, nullable `sessions.session_type`, Build B that stops legacy writes, then destructive drops only after evidence. I would still fix the items below before handing this to an implementer, because the remaining issues are the kind of precision gaps that can produce a wrong backfill or a runtime regression.

## Blocking Corrections

### 1. The school canonicalization contract is not carried through to the Phase 3 SQL

Rev 9 now requires a deterministic `canonicalSchoolName()` helper and update-before-insert seed ordering (`plan:202-229`). That fixes the Rev 8 seed-ordering blocker in principle. But the actual backfill SQL and its preflight still use `lower(trim(...))`:

- `plan:249-255` backfills `users.school_id` with `lower(trim(u.assigned_school)) = lower(trim(s.name))`.
- `plan:313-318` uses the same `lower(trim(...))` check for unmatched schools.
- The live `schools.name` column is case-sensitive `TEXT NOT NULL UNIQUE`, so canonical duplicates can still exist even when exact names are unique (`supabase-migrations/06_add_schools_and_classes.sql:8-11`).

That leaves two risks:

1. A punctuation/internal-whitespace variant that the seed script treats as the same school may not match during migration 15.
2. If existing schools plus CSV rows contain more than one row for the same canonical name, `UPDATE ... FROM public.schools s` can update from an arbitrary matching row.

Recommended change:

- Use the same canonical expression in every school comparison, including Phase 3 preflights and the `users.school_id` backfill.
- Before applying migration 15, preflight existing schools by canonical name, not just CSV rows. Abort if any canonical school name maps to more than one `schools.id`.
- Add a preflight that joins each distinct `users.assigned_school` to schools by canonical name and returns rows where the match count is not exactly 1.
- If any ambiguity exists, do not run the name-based backfill. Use the plan's explicit `assigned_school -> school_uid` mapping path and backfill through `school_uid`.

This is the one place where I would still treat Rev 9 as not quite implementation-ready, because a wrong school assignment is a data-integrity problem, not just an implementation inconvenience.

### 2. Clean up the old Phase 2 seed-script wording so implementers do not follow the stale path

The corrected Phase 2 sequence says to build `byUid` / `byCanonical`, update existing matches first, then insert new rows (`plan:217-229`). A few later bullets still describe the older algorithm:

- `plan:232` says "for each CSV row, upsert by `school_uid`".
- `plan:233` says the 5 placeholder rows should be matched later by a "case-insensitive, trimmed" fuzzy name match.

That conflicts with the deterministic canonical/update-first approach above. Remove or rewrite those bullets so the script has one algorithm:

1. Parse and validate the full CSV.
2. Detect canonical duplicates in the CSV and existing `schools`.
3. Resolve existing rows by UID or canonical name.
4. Perform all updates first.
5. Insert only truly new schools.

## Important Fixes

### 3. Put `useLookupsContext()` at the top level of `SessionHistoryScreen`

The plan correctly adds a cached `job_titles` fallback for Build B local sessions (`plan:399-407`). The sample is ambiguous, though, and can be read as calling `useLookupsContext()` inside the `renderItem` callback. In the live file, `renderItem` is a nested function (`src/screens/sessions/SessionHistoryScreen.js:98-147`), and hooks should not be called there.

Recommended implementation shape:

```js
export default function SessionHistoryScreen() {
  const { jobTitles } = useLookupsContext();

  const renderItem = ({ item }) => {
    const sessionLabel =
      item.session_type_lookup?.name ||
      item.session_type ||
      jobTitles.find(j => j.id === item.session_type_id)?.name ||
      'Session';

    // render...
  };
}
```

This is small, but if copied literally in the wrong place it can create a hook-order/runtime problem.

### 4. Make the Build B pending-session resolution inputs explicit

The plan now correctly says Build B must not post a session without `session_type_id` (`plan:441-452`) and that `offlineSync` should skip unresolved pending sessions without routing them through the terminal quarantine branch (`plan:620-624`). The remaining ambiguity is where the sync path gets enough information to resolve the ID.

`plan:620-622` says to resolve from cached `job_titles` by `jobTitleCode` or display name, but a Build B pending session may no longer have `session_type`, and the current `syncRecord()` signature only receives the table name and record (`src/services/offlineSync.js:119-139`). The test list later expects the sync path to use cached profile state (`plan:655`), but the implementation contract is not stated in the main instructions.

Recommended change:

- State that session sync resolution reads cached normalized `@user_profile` first (`profile.jobTitleId`, then `profile.jobTitleCode` / `profile.jobTitleName`), then cached `@job_titles`.
- If the local session itself needs a hint, persist `pendingSessionTypeCode` or `pendingSessionTypeName` as local-only metadata when saving the pending row, and strip it before upsert. The plan already lists `pendingSessionTypeCode` as a local-only key (`plan:605-610`); connect that to `LiteracySessionForm` and the pending-session sync path.
- Add a test that the payload posted to Supabase never contains `_pendingJobTitleResolve`, `pendingSessionTypeCode`, or `pendingSessionTypeName`.

### 5. Use one sanitizer-state shape everywhere

The file list correctly says sanitizer state should be user-scoped as `@sanitizer_state:{userId}` and should carry task versions (`plan:582`). Earlier, the asyncStorageSanitizer section still says `@sanitizer_state = { childrenLegacyKeysStripped: true, sessionsEnriched: false, ... }` (`plan:424`).

Recommended change:

- Use only `@sanitizer_state:{userId}` in the plan.
- Define the exact shape once, for example:

```js
{
  childrenLegacyKeysStripped: { done: true, taskVersion: 1, completedAt: '...' },
  sessionsEnriched: { done: true, taskVersion: 1, completedAt: '...' }
}
```

- Make the export-gate checks match that shape exactly.

The current boolean examples are easy to misread and would make future task-version reruns awkward.

### 6. Tighten the destructive-drop gate around failed sync metadata

The Phase 5 and Phase 6 gates correctly require Build B export evidence and zero unsynced records (`plan:470-486`, `plan:718-724`). The only wording I would tighten is:

> `@sync_meta.failedItems` contains no entries - or each entry resolves to a record the sanitizer demonstrably cleaned.

For Phase 6, I would require `@sync_meta.failedItems` to be empty unless there is a deliberately documented operator exception. A "cleaned" failed item can still represent a record that never reached Supabase, especially because the live terminal-error path can mark records synced to stop retries (`src/services/offlineSync.js:234-248`). Before dropping columns, the safer gate is:

- no unsynced records in any sync source,
- no failed items,
- no retry metadata for cleaned records,
- any exception documented with the actual record, table, reason, and why it is safe to ignore.

## Smaller Improvements

- Use `JOB_TITLE_CODES.LITERACY_COACH` in `SessionFormScreen` instead of the raw `'literacy_coach'` literal. The plan says `jobTitles.js` becomes the single source of truth, so use it consistently (`plan:347-367`, `plan:627`).
- Consider making `job_titles` seed idempotence stronger with `ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active`. `DO NOTHING` is fine for a brand-new table, but weaker after partial/manual runs (`plan:130-136`).
- Consider splitting `ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_uid text UNIQUE` into `ADD COLUMN` plus an explicitly named unique constraint/index. If a partial run ever leaves the column present without uniqueness, `IF NOT EXISTS` will skip the uniqueness part (`plan:151-162`).
- If this work is going to claim any PRD security-advisor cleanup, be precise. Dropping `get_children_in_group` addresses one exposed `SECURITY DEFINER` helper (`plan:490-521`), but `PRD.md:597-616` also lists mutable search-path functions and `public.set_class_created_by()` RPC exposure. Either include those in this work or leave the PRD backlog explicitly open.

## What Looks Good Now

- The Rev 8 `children.age` drift blocker is now captured in Phase 0 and verification (`plan:72-113`, `plan:662-667`).
- The Build A -> migration 16 -> Build B -> destructive-drop sequence is the right compatibility shape for slow tester updates (`plan:437-476`).
- The export gate now relies on real metadata fields from `debugExport.js`, and the plan correctly notes that `app.json`'s `expo.version` is what `Constants.expoConfig?.version` reads (`plan:453`, `plan:583-597`).
- Table-scoped legacy-key stripping avoids the `children.teacher` vs `classes.teacher` collision; the live classes table really does require `teacher` (`supabase-migrations/06_add_schools_and_classes.sql:27-38`).
- The sanitizer now clears retry and failed-item metadata for mutated records, which fits the live retry model in `src/utils/storage.js:408-473` and `src/services/offlineSync.js:171-183`.
- The provider tree now preserves the current `ClassesProvider` dependency on `useChildren()` (`App.js:124-131`, `src/context/ClassesContext.js:12-16`, `plan:562-579`).
- The test list is pointed at the right failure modes: profile normalization, table-scoped strip behavior, pending Build B sessions, and idempotent sanitizer runs (`plan:646-656`).

## Bottom Line

I am happy with the architecture now. Before implementation, I would make the Phase 3 school backfill use the same canonical/mapping contract as the seed script, remove the stale Phase 2 wording, and tighten the small React/sync-state ambiguities above. After that, the main risk moves from plan design to careful phased execution and verification.
