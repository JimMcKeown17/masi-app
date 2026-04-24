# Mobile Field Reliability and UX Code Review

Date: 2026-04-24

Scope: static code review of the React Native/Expo mobile app, focused on field reliability, offline sync, Android variability, and user experience under intermittent connectivity. No runtime code was changed.

## Executive Summary

The app has several strong field-ready foundations: offline-first writes, cache-first reads, visible sync status, explicit sync ordering, failed-item persistence, auth refresh hardening, an app-level error boundary, exportable logs, exportable AsyncStorage, and Expo Updates configuration. These are the right priorities for first-weeks field testing.

The biggest reliability risk is not general architecture. It is incomplete mutation semantics around deletes/removals. Several UI actions remove data locally but do not create a syncable tombstone or server delete operation, so records can reappear after the next online fetch. This can directly undermine field staff trust because the app appears to accept a change and later silently undoes it.

The second major risk is sync retry behavior. Current retry backoff sleeps inside the sync loop, sequentially, per record. On a poor connection or after a schema/RLS incident, one sync attempt can remain "in progress" for minutes per failed item, blocking other tables and making the UI look stuck.

## Priority Findings

### P0 - Local Deletes and Removals Do Not Sync to Supabase

Impact: A user can delete a child, delete a group, remove a child from a group, or delete a class locally, but those operations are not represented as syncable operations. When online data is fetched again, the server record is merged back into local storage. In the field this looks like the app "forgot" a user action.

Evidence:

- [src/context/ChildrenContext.js](/Users/jimmckeown/Development/masi-app/src/context/ChildrenContext.js:169) deletes a child by calling `storage.deleteChild(childId)` and updating state only.
- [src/context/ChildrenContext.js](/Users/jimmckeown/Development/masi-app/src/context/ChildrenContext.js:271) deletes a group by removing it and its memberships from local state/storage only.
- [src/context/ChildrenContext.js](/Users/jimmckeown/Development/masi-app/src/context/ChildrenContext.js:368) removes a child from a group by deleting the local `children_groups` record only.
- [src/context/ClassesContext.js](/Users/jimmckeown/Development/masi-app/src/context/ClassesContext.js:159) deletes a class locally and marks affected children unsynced, but does not create a server-side class delete operation.
- [src/utils/storage.js](/Users/jimmckeown/Development/masi-app/src/utils/storage.js:114), [src/utils/storage.js](/Users/jimmckeown/Development/masi-app/src/utils/storage.js:170), [src/utils/storage.js](/Users/jimmckeown/Development/masi-app/src/utils/storage.js:192), and [src/utils/storage.js](/Users/jimmckeown/Development/masi-app/src/utils/storage.js:235) hard-remove records from local arrays.
- [src/services/offlineSync.js](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:193) only has `_deleted` handling for records that remain in the unsynced list. In practice that path currently works for `letter_mastery`, not for children, classes, groups, or junction tables.

Field scenario:

A coach moves a child from Group 1 to Group 2 while online. The UI first removes the old membership locally, then adds the new membership. Sync inserts the new membership, but the old membership still exists on the server. The next `loadChildrenGroups()` fetches server memberships and merges the old one back. The UI enforces "one group" by reading the first matching membership, so the child can appear assigned to the wrong group even though the coach just fixed it.

Recommended fix:

Use one consistent mutation model for all removable synced entities:

- Prefer tombstones for field-owned records: keep the local record with `_deleted: true`, `synced: false`, and sync it through a delete path.
- For junction rows, delete by the same conflict identity used for upsert, such as `child_id + group_id`, not just by generated local `id`.
- Keep tombstoned records hidden from UI selectors while still present in storage until server delete succeeds.
- For child deletion, decide whether this means "unassign from my caseload" or "delete the child record globally." In a multi-coach model, unassigning via `staff_children` is usually safer than deleting the `children` row.

### P1 - Terminal Sync Failures Are Marked Synced, So Retry Cannot Work

Impact: A record that hits a terminal error is added to `failedItems` but also marked `synced: true`. The retry button clears failed metadata, but it does not mark the record unsynced again. That means a user can tap Retry and nothing will retry.

Evidence:

- [src/services/offlineSync.js](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:234) handles terminal classifications.
- [src/services/offlineSync.js](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:244) adds the failed item, then [src/services/offlineSync.js](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:245) marks the record synced.
- [src/services/offlineSync.js](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:417) retries by removing failed metadata and clearing the last error only. It does not call `markAsUnsynced`.

Recommended fix:

Represent quarantined records separately from synced records. For example, keep `synced: false` plus `sync_blocked: true`, or store a `failed` state in sync metadata and have retry explicitly set the record back to `synced: false`. The UI can still avoid automatic retry loops by checking `failedItems`, but manual Retry must make the record eligible for sync again.

### P1 - Backoff Sleeps Inside the Sync Loop and Can Make Sync Look Stuck

Impact: Backoff delays are awaited sequentially per record. With multiple failed records and weak connectivity, `isSyncing` can remain true for a long time while no visible progress occurs. This is especially risky on low-end Android phones because the app appears busy, users may force-close it, and dependent tables wait behind unrelated failed rows.

Evidence:

- [src/services/offlineSync.js](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:70) defines delays up to 135 seconds by attempt 5.
- [src/services/offlineSync.js](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:186) applies the delay inside each record loop.
- [src/services/offlineSync.js](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:190) awaits the delay before trying the record.
- [src/services/offlineSync.js](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:324) processes tables sequentially.

Recommended fix:

Store `nextRetryAt` per failed record and skip records that are not ready yet. Sync should be quick: scan, attempt eligible records, update metadata, exit. This preserves backoff without holding the sync lock or spinner for minutes. It also lets healthy tables continue syncing while one table has delayed retry records.

### P1 - Location "Timeout" Is Not Actually a Timeout

Impact: Sign in/out depends on GPS. On low-quality Android phones, indoors, or devices with weak GPS/network provider behavior, the app can sit on "Getting location..." much longer than the intended 10 seconds. This blocks clock-in and clock-out, which is a core daily field action.

Evidence:

- [src/services/locationService.js](/Users/jimmckeown/Development/masi-app/src/services/locationService.js:11) documents "Timeout handling (10 seconds max)."
- [src/services/locationService.js](/Users/jimmckeown/Development/masi-app/src/services/locationService.js:98) passes `timeInterval: LOCATION_TIMEOUT` to `getCurrentPositionAsync`.
- The installed Expo Location type docs define `timeInterval` as "Minimum time to wait between each update", not as a timeout: [node_modules/expo-location/src/Location.types.ts](/Users/jimmckeown/Development/masi-app/node_modules/expo-location/src/Location.types.ts:120).

Recommended fix:

Wrap `Location.getCurrentPositionAsync()` in a JavaScript timeout with `Promise.race()`. Consider a two-step fallback: first try `getLastKnownPositionAsync({ maxAge: 5-10 minutes, requiredAccuracy: 250 })` for fast UX, then request current position when needed. If current GPS fails, allow a clearly marked "Save without GPS / GPS failed" path only if Masi operational policy accepts that tradeoff.

### P2 - Session Child Selector Renders All Matching Children Inside a ScrollView

Impact: The session form wraps the child selector in a `ScrollView`, and `ChildSelector` renders a `FlatList` with `scrollEnabled={false}`. This disables list virtualization in the exact screen where a coach may search and select many children. It is probably fine for small caseloads, but it is a known Android jank risk as data grows.

Evidence:

- [src/screens/sessions/LiteracySessionForm.js](/Users/jimmckeown/Development/masi-app/src/screens/sessions/LiteracySessionForm.js:356) uses a parent `ScrollView`.
- [src/components/children/ChildSelector.js](/Users/jimmckeown/Development/masi-app/src/components/children/ChildSelector.js:97) renders a `FlatList`.
- [src/components/children/ChildSelector.js](/Users/jimmckeown/Development/masi-app/src/components/children/ChildSelector.js:121) disables scrolling, which causes all filtered children to render into the parent scroll layout.

Recommended fix:

Do not rewrite this preemptively if field caseloads are small. Add a practical threshold first: if a coach can have more than about 75-100 children/classes locally, change the selector to a modal/bottom sheet with its own virtualized list. If caseloads stay small, leave it alone.

### P2 - Assessment Child Select Does O(n²) Counting on Focus

Impact: The assessment selector computes each child's attempt count by filtering all assessments inside a loop over all assessments. This is not a blocker today, but the cost grows quickly because assessment history accumulates over time and is stored locally.

Evidence:

- [src/screens/assessments/AssessmentChildSelectScreen.js](/Users/jimmckeown/Development/masi-app/src/screens/assessments/AssessmentChildSelectScreen.js:42) computes `attemptCount` with `typeFiltered.filter(...)` inside the loop.

Recommended fix:

Build one map in a single pass: `{ child_id: { latest, count } }`. This is a small, low-risk performance cleanup before assessment volumes grow.

### P2 - Diagnostic Export Reports the Wrong App Version

Impact: Debug exports are a field-support tool. The database export hardcodes `app_version: '1.0.0'`, while `app.json` is `1.1.0`. During multi-version field testing, wrong version metadata slows support triage.

Evidence:

- [src/utils/debugExport.js](/Users/jimmckeown/Development/masi-app/src/utils/debugExport.js:44) hardcodes `1.0.0`.
- [app.json](/Users/jimmckeown/Development/masi-app/app.json:5) declares `1.1.0`.

Recommended fix:

Read version/build metadata from `Constants.expoConfig` or `Application.nativeApplicationVersion` / `nativeBuildVersion` if `expo-application` is available. Include `runtimeVersion` and update channel if possible because OTA updates are enabled.

## UX Notes

### What Is Working Well

- The Home screen puts clock-in/out and sync state in the highest-value location.
- Sync banners and Sync Status give users a mental model for offline behavior.
- The error boundary prevents a blank screen after a render crash.
- Profile export tools are pragmatic for WhatsApp/email support in the field.
- Cache-first loading is correct for intermittent connectivity.
- The auth grace period is a practical field reliability improvement.

### UX Risks to Watch in Field Testing

- Failed items can be below the fold on Sync Status, after the Sync Now button. During a real incident, users need the "needs attention" section first.
- The Sync Now button can remain loading for too long because of in-loop backoff, making users think the app froze.
- Clock-in/out is fully blocked by location. If GPS is unreliable on a subset of Android devices, users have no fallback except retrying.
- Deletions/removals currently have high risk of reappearing, which is more damaging to trust than an operation being explicitly unavailable.

## Engineering Suggestions

### 1. Keep AsyncStorage for Now, but Set a Migration Trigger for SQLite

Status quo: All domain tables are arrays stored in AsyncStorage, with read-modify-write helpers.

Why this is acceptable today:

- It is simple and has worked well enough during early field testing.
- It keeps the offline model understandable.
- The data volume is likely modest per user right now.

Why SQLite becomes better at the next scale point:

- AsyncStorage rewrites whole arrays for every update, which becomes slower as children, assessments, sessions, and logs grow.
- AsyncStorage has no indexes, transactions, relational constraints, or efficient queries.
- Several current operations rely on manual array merging and identity rules. SQLite would let you encode tombstones, sync status, conflict keys, and `nextRetryAt` as rows.
- SQLite improves reliability without requiring an over-engineered sync engine. A small repository layer over `expo-sqlite` is enough.

Recommendation:

Do not rewrite storage immediately. Define a clear trigger: move to SQLite when any coach regularly has 100+ children, 500+ assessments/sessions, or if support sees repeated duplicate/merge/delete bugs. If you do move, use `expo-sqlite` directly or with a light query helper. Avoid adopting a heavy local-first framework unless you need bidirectional conflict resolution.

### 2. Add Lightweight Crash/Error Reporting, Preferably Sentry

Status quo: Logs are stored locally and exported by the user.

Why the status quo is not enough:

- It only works if the user can navigate to Profile and share logs.
- It does not automatically capture fatal crashes, device model distribution, OS version clusters, release version, or frequency.
- Low-end Android issues are often device-specific. You need aggregate evidence, not just individual WhatsApp exports.

Why Sentry is better:

- It captures JavaScript errors, native crashes, release versions, device model, OS version, breadcrumbs, and offline queued reports.
- It complements, rather than replaces, the existing Export Logs feature.
- It helps distinguish one-off field confusion from systemic Android/device issues.

Recommendation:

Add Sentry with conservative PII settings. Do not log child names, notes, coordinates, or full AsyncStorage. Include app version, runtime version, sync counts, table name, error code, and device metadata. This is low-overhead and directly improves field reliability support.

## Suggested Review Order

1. Fix delete/removal/tombstone semantics before adding more features.
2. Fix terminal retry and backoff scheduling in the sync loop.
3. Add a real GPS timeout and decide whether a no-GPS fallback is operationally acceptable.
4. Improve Sync Status UX around failed items and Retry All.
5. Add version-correct diagnostics.
6. Watch list performance and storage volume before committing to SQLite.

## Testing Recommendations

Use a small manual test matrix before the next field release:

- Android low-end emulator or physical device, airplane mode on, create class, child, group, session, and assessment, then reconnect and verify all server rows.
- Online delete/removal tests: remove child from group, move child between groups, delete group, delete class, delete/unassign child, restart app, pull to refresh, verify the change does not reappear unexpectedly.
- Poor GPS test: disable location services, deny permission, indoor weak signal, and verify clock-in/out feedback is bounded and actionable.
- Sync failure simulation: force a known RLS/FK error, verify failed item appears, Retry actually retries after the server-side issue is fixed.
- Multi-version compatibility check before any migration: older app can still write, newer app can still sync, and no `PGRST204` path is introduced.

