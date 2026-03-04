# Offline Sync Review

Date: 2026-03-04

## Review Scope and Test Method

This review focused on offline sync behavior across time entries, sessions, children, groups, staff-child assignments, and group memberships.

Checks performed:
- Static flow review of sync/write/read paths in:
  - `src/services/offlineSync.js`
  - `src/utils/storage.js`
  - `src/context/OfflineContext.js`
  - `src/context/ChildrenContext.js`
  - `src/hooks/useTimeTracking.js`
  - `src/screens/main/SyncStatusScreen.js`
  - `src/context/AuthContext.js`
- Schema and policy compatibility review in:
  - `supabase-migrations/00_initial_schema.sql`
  - `supabase-migrations/01_add_groups_feature.sql`
  - `supabase-migrations/02_staff_children_junction.sql`
  - `supabase-migrations/03_tighten_children_rls.sql`
  - `supabase-migrations/04_drop_assigned_staff_id.sql`
- Executed available project checks:
  - `npm run` (confirms there are no automated test scripts)
  - `npx expo-doctor` (project health check)

Limit note:
- There are no automated sync unit/integration tests in this repository today, and no device/emulator test harness in scripts. So testing here is code-path and runtime-risk analysis rather than simulator/device execution.

---

## 1) Bugs and Errors Found

### Critical

1. **Delete operations are not synced to Supabase**
- Evidence:
  - `src/services/offlineSync.js` only performs `upsert` operations.
  - `src/context/ChildrenContext.js` delete actions (`deleteChild`, `deleteGroup`, `removeChildFromGroup`) remove records from local storage only.
  - No tombstone (`deleted_at`, `is_deleted`, `sync_action`) pattern exists.
- Impact:
  - User deletes offline, record disappears locally, but remains in Supabase.
  - On next server reload, deleted records can reappear.
  - Data trust issue for field staff.

### High

2. **Sync error handler contains out-of-scope variable usage**
- Evidence:
  - In `src/services/offlineSync.js`, `syncTable` catch block references `unsyncedRecords?.length` even though `unsyncedRecords` is declared inside the `try` block.
- Impact:
  - On table-level failure, catch handling can throw a new `ReferenceError`.
  - May break sync result reporting and mask the original error.

3. **Cross-user local data leakage risk on shared devices**
- Evidence:
  - Storage keys in `src/utils/storage.js` are global (not user-scoped).
  - `src/context/AuthContext.js` sign-out clears only `USER_PROFILE`, not local domain data.
  - `src/hooks/useTimeTracking.js` loads active entry using first `sign_out_time === null` entry without user filtering.
  - `src/context/ChildrenContext.js` loads full cached children/groups/memberships before online filtering.
- Impact:
  - New user on same device may see previous user data while offline.
  - Sync attempts may process records belonging to another user, causing repeated RLS failures.
  - Privacy and data integrity risk.

4. **Delete actions do not refresh sync status**
- Evidence:
  - `deleteChild`, `deleteGroup`, `removeChildFromGroup` in `src/context/ChildrenContext.js` do not call `refreshSyncStatus`.
- Impact:
  - Sync indicators can become stale after destructive actions.
  - Combined with missing delete-sync support, this makes deletion state hard to trust.

### Medium

5. **Potential schema mismatch between app payloads and migration constraints**
- Evidence:
  - `src/screens/children/AddChildScreen.js` allows nullable `teacher`, `class`, `age`, `school` and allows age up to 20.
  - `supabase-migrations/00_initial_schema.sql` defines `teacher`, `class`, `age`, `school` as required and age check `< 18`.
- Impact:
  - Environments built strictly from migrations may reject child sync inserts (`23502` or `23514`).
  - This can present as "offline sync failing" even if app logic is correct.

6. **Failed-item escalation occurs one sync cycle later than expected**
- Evidence:
  - In `src/services/offlineSync.js`, item is marked failed only when entering next cycle with attempts already at max.
- Impact:
  - UI and support visibility lag after final retry failure.

7. **"Last Synced" time is updated even when sync has failures**
- Evidence:
  - `syncAll` updates `lastSyncTime` unconditionally.
- Impact:
  - `SyncStatusScreen` can look successful when some records actually failed.
  - Troubleshooting can become confusing.

8. **Online detection may evaluate to false when reachability is null**
- Evidence:
  - `src/context/OfflineContext.js` uses `state.isConnected && state.isInternetReachable` directly.
- Impact:
  - On some transitions/startup, app may remain "offline" until another network event arrives.
  - Can delay automatic sync start.

---

## 2) Suggested Remedial Changes (Low Complexity, High Reliability)

Priority order is intentionally practical and minimal.

1. **Add minimal delete-sync support**
- Implement a simple tombstone approach for locally deleted records (for children/groups/junction tables), then process tombstones in `offlineSync` with `delete` on Supabase.
- Keep implementation narrow: only tables already managed by `ChildrenContext`.
- Benefit: resolves the most visible trust issue quickly.

2. **Fix `syncTable` catch-scope bug**
- Move `unsyncedRecords` declaration outside `try`, or remove dependency on it in catch.
- Benefit: stabilizes failure handling and preserves root-cause errors.

3. **Isolate storage by user or clear domain data on sign out**
- Fastest safe option: clear local domain keys on sign out.
- Better medium-term option: namespace AsyncStorage keys by user id.
- Also filter active time entry by `user_id` in `useTimeTracking`.
- Benefit: prevents cross-user leakage and spurious sync failures.

4. **Call `refreshSyncStatus` after delete/remove actions**
- Add status refresh to all destructive mutations.
- Benefit: keeps banners/badges consistent with current local state.

5. **Align schema and form assumptions**
- Confirm current production schema for `children` optional fields and age range.
- If migrations are source of truth, add migration to match current app behavior.
- Benefit: avoids avoidable sync failures and inconsistent environments.

6. **Mark failed items immediately at final failed attempt**
- On the attempt that reaches max retries, persist to `failedItems` immediately.
- Benefit: faster operator visibility, simpler support flow.

7. **Track both `lastSyncAttemptTime` and `lastSuccessfulSyncTime`**
- Keep existing behavior but add a success-only timestamp.
- Benefit: avoids false confidence in status UI.

---

## 3) Features Worth Adding (Without Overengineering)

These are small reliability features, not architecture-heavy changes.

1. **Retry All Failed Items**
- Add one button on `SyncStatusScreen` to clear failed markers and trigger one sync cycle.
- Helps field staff/support recover quickly.

2. **Preflight Validation for Sync-Critical Fields**
- Before queueing/syncing, run a lightweight validator for known required fields (for example: `created_by`, `user_id`).
- Show a direct reason in failed items when missing.

3. **Pending Deletions Section in Sync Status**
- Show counts for items queued for deletion separately from normal unsynced updates.
- Makes destructive actions transparent and easier to trust.

---

## Recommended Acceptance Test Checklist (Post-Fix)

1. Create, update, delete child while offline; reconnect; verify server and local states match.
2. Create group, add/remove children, delete group while offline; reconnect; verify exact parity.
3. Sign in/out offline; reconnect; verify one complete time entry syncs with correct user id.
4. Force one record to fail sync (invalid payload), confirm failure appears immediately after max retry.
5. Sign out and sign in as another user on same device; confirm no previous-user local data appears offline.
6. Confirm Sync Status distinguishes last attempt vs last successful sync.

---

## Additional Note From Automated Check

`npx expo-doctor` reported dependency mismatch warnings (`expo` patch level and `react-native-get-random-values` major version). These are not direct offline-sync logic bugs, but they are worth resolving to reduce runtime unpredictability.
