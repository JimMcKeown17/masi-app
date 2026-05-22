# Plan 5 Review Brief — Context and Screen Migration

**Date:** 2026-05-21
**Reviewer:** Claude (mentor/review pass)
**Branch reviewed:** `plan-5/context-screen-migration` @ `a11a615`
**Commit range:** `bafc893..a11a615` (8 commits, 61 files, +2971 / −939)
**Suite state at review:** 44 suites / 199 tests passing; `git diff --check` clean.

> **Workflow:** This brief is TDD-shaped. Each finding lists the bug, why it matters,
> why the current tests miss it, the fix shape, and explicit **failing-test contracts**
> to write first (red) before implementing (green). Follow the local TDD skill.

---

## Verdict

**Plan 5 is NOT ready for signoff.** It contains one **ship-blocking Critical**
defect that makes the app non-functional for any real field user, plus two High
and several Medium issues. The 199/199 green suite and the "reached Home screen"
Android check both miss the Critical bug *by construction* — the tests build the
precondition production lacks, and the device check stopped before the write path.

The auth slice (Supabase client singleton, request queue, `INITIAL_SESSION`
startup, profile-load versioning) and the transaction-backed
`literacySessionPersistence` are genuinely well built. The problem is a missing
producer for a table every consumer now depends on.

---

## CRITICAL 1 — Local `staff_programme_assignments` is never populated; every domain write throws and every programme-scoped read is empty on a real device

### Problem

Plan 5 made the entire repository layer programme-scoped:

- Every domain **write** calls `resolveProgrammeId(txn, { userId })`
  (`domainRepositoryUtils.js:60`), which reads the **local** SQLite
  `staff_programme_assignments` table via `getActiveProgrammeId`. With
  `allowLegacyFallback` defaulting `false`, it **throws**
  `No active programme assignment found for user <id>` when that table is empty.
- Every programme-scoped **read** (`getMyChildren`, `getClasses`, `getSessions`,
  `getAssessments`, `getLetterMastery`, `getGroups`) returns `[]` when no active
  programme resolves.

**Nothing populates the local `staff_programme_assignments` table.** Verified by grep:

- `pullReferenceData` (`offlineSync.js:668`) — **zero callers** in `src/`. Decision
  register entry 65 explicitly says its production wiring was *"deferred to Plan 5."*
  Plan 5 did not wire it.
- `staffProgrammeAssignmentsRepository` (`referenceDataRepository.js:269`) — defined,
  **never imported**. Dead code.
- `staff_programme_assignments` is **not in any pull's table set**.
  `pullReferenceData` covers only `academic_years`, `assessment_windows`, `teachers`.
  `pullPreloadedChildData` (`preloadedChildData.js:38`) and
  `ClassesContext.loadClasses` (`ClassesContext.js:106`) query Supabase's
  `staff_programme_assignments` *transiently* for a `programme_id` to scope their
  pulls — they never write the row into local SQLite.

The local tables `staff_programme_assignments`, `academic_years`,
`assessment_windows`, `teachers` are created empty by `migrations.js` and never filled.

### Why this matters — blast radius

| Action | Fails via | Location |
|---|---|---|
| Save session / persistLiteracySession | `resolveProgrammeId` throws | `sessionsRepository.js:121`, `literacySessionPersistence.js:29` |
| Save assessment | `resolveProgrammeId` throws | `assessmentsRepository.js:118` |
| Save letter mastery | `resolveProgrammeId` throws | `masteryRepository.js:76` |
| Add group | `resolveProgrammeId` throws | `groupsRepository.js:76` |
| Add child | `resolveProgrammeId` throws | `childrenRepository.js:93` |
| Add child (also) | `getActiveAcademicYear` empty → throw | `childrenRepository.js:159-162` |
| Add class | `academicYearsRepository.getActive()` empty → throw | `ClassesContext.js:163-165` |
| My Children / Sessions / Assessments / Classes / Groups / Trackers | read returns `[]` | all `get*({ userId })` |

Net production behavior on a real signed-in device: every list renders empty and
every create/save action throws. The app is unusable for field work.

### Why the tests didn't catch it

- **Repository tests hand-build the missing precondition.** Every repository test
  inserts `staff_programme_assignments` rows directly (e.g. `childrenRepository.test.js`)
  and seeds `academic_years` via `seedCoreData`. The fixtures construct exactly the
  state production lacks — the suite is greener than reality.
- **The device check stopped before the write path.** Codex seeded a staging
  profile *and assignment manually in the DB*, then validated only reaching the
  Home screen (a read screen — empty lists do not redbox). The plan's own Review
  Gate item *"Exercise … group save, session save, assessment save"* is unchecked.

### Fix shape

This is one root cause with one fix location — authenticated startup pull discipline
(Plan 5 Task 1's actual subject):

1. Extend `pullReferenceData` to also pull the **current user's**
   `staff_programme_assignments` rows into local SQLite (user-scoped:
   `.eq('user_id', userId).is('ended_at', null)` is the active row, but pull the
   full set so history is consistent). Use `staffProgrammeAssignmentsRepository`
   (already exists) or an equivalent typed write — not a generic cache blob.
2. **Call** `pullReferenceData` on authenticated startup, through
   `enqueueSupabaseRequest`, before/with context hydration. AuthContext's profile
   load or a dedicated startup effect is the natural site.
3. Keep `resolveProgrammeId` reading **local** SQLite — do not make it query
   Supabase; offline writes depend on the local read.
4. Run the unchecked signed-in Android smoke test (write a child, a class, a group,
   a session, an assessment; kill/reopen) as the real gate.

### Failing-test contracts (write these first, red)

- `pullReferenceData pulls the current user's staff_programme_assignments into
  local SQLite` — after the pull, `getActiveProgrammeId(db, userId)` returns the
  server programme id (not null).
- `authenticated startup runs the reference + assignment pull exactly once` —
  mounting the provider tree for a signed-in user triggers one `pullReferenceData`
  call (assert via the queue / a spy), and a second auth event does not duplicate it.
- `saveSession succeeds after the startup assignment pull and throws before it` —
  integration test: with an empty local `staff_programme_assignments`,
  `sessionsRepository.saveSession` rejects; after `pullReferenceData` seeds the
  assignment, the same call writes the `sessions` row + `session_attendees` +
  `sync_outbox` rows. Repeat the before/after shape for `saveAssessment`,
  `saveLetterMasteryRecord`, `groupsRepository.saveGroup`, and
  `childrenRepository.save`.
- `addClass succeeds after academic_years is pulled and throws before it` —
  with empty local `academic_years`, `ClassesContext.addClass` returns
  `{ success: false }`; after `pullReferenceData`, it creates the class with the
  active `academic_year_id`.
- **Remove the hand-inserted `staff_programme_assignments` fixtures from at least
  one end-to-end test** and prove the startup pull path provides them instead, so
  the suite stops masking this class of gap.

---

## HIGH 1 — `mergeServerRows` can never remove a row; cross-device archive/unassign/reassign never propagates

### Problem

`ChildrenContext.mergeServerRows` (`ChildrenContext.js:10-14`) and the inline merge
in `ClassesContext.loadClasses` (`ClassesContext.js:140-142`):

```js
const mergeServerRows = (cached, serverRows) => {
  const serverIds = new Set(serverRows.map(row => row.id));
  const localToKeep = cached.filter(row => !serverIds.has(row.id));
  return [...serverRows, ...localToKeep];
};
```

`localToKeep` keeps **every** local row absent from the server result — including
already-**synced** rows. The merge was written to preserve unsynced local writes
(correct intent), but it cannot distinguish "local row the server hasn't seen yet"
from "row the server deliberately removed."

### Why this matters

When a child, class, group, or membership is archived / unassigned / reassigned on
**another device**, the server pull returns the set *without* that row. `mergeServerRows`
finds it in `cached` but not in `serverRows` and keeps it in `localToKeep` — forever.
`visibleChildren` filters `archived_at`, but the stale local row still has
`archived_at = null` (this device never learned otherwise). Real field scenario: a
coach reassigns children between EAs; the losing EA keeps seeing children they no
longer work with. Affects children, groups, child-group memberships, and classes.

### Why the tests didn't catch it

`ChildrenContext.test.js`'s "partial preload failure keeps cached lists" tests the
*opposite* direction (don't wipe on error). No test asserts that a successful pull
*omitting* a previously-synced row drops it locally.

### Fix shape

`shouldApplyPulledRows` already guarantees the merge runs only on a successful pull,
so the server list is authoritative for synced rows. Keep only **unsynced** local rows:

```js
const localToKeep = cached.filter(row =>
  !serverIds.has(row.id) && (row.synced === false || row.sync_status === 'pending' || row.sync_status === 'failed')
);
```

Apply the same change to the `ClassesContext.loadClasses` inline merge.

### Failing-test contracts

- `mergeServerRows drops a synced local row absent from a successful server pull` —
  cached `[syncedA, syncedB]`, server `[syncedA]` → result `[syncedA]` (B gone).
- `mergeServerRows keeps an unsynced local row absent from the server pull` —
  cached `[syncedA, unsyncedC]`, server `[syncedA]` → result contains `unsyncedC`.
- `ChildrenContext reflects a child reassigned away on another device` —
  integration: child present locally as synced; `pullPreloadedChildData` returns a
  set without it and no errors; after `loadPreloadedChildData`, `children` no longer
  contains it.
- Same shape for `ClassesContext.loadClasses` and a class removed server-side.

---

## HIGH 2 — Unguarded `async` write handlers strand completed work on any error

### Problem

Two screen write handlers are `async` with **no try/catch**:

- `LetterAssessmentScreen.saveAssessment` — `await assessmentsRepository.saveAssessment(...)`
  then `navigation.navigate('AssessmentResults', ...)`. On throw, navigation is
  skipped, the throw is an unhandled rejection, and the screen is frozen in the
  `finished` phase with a disabled grid. The completed 60-second assessment is lost
  with no error and no retry path.
- `LetterTrackerScreen.handleCellTap` — every branch `await`s a mastery write before
  `setTaughtLetters`. On throw, the cell silently does not change colour and the
  throw is an unhandled rejection. No snackbar, not even a `console.error`.

Given Critical 1, *every* such call currently throws — but this is an independent
defect: any SQLite/serialization error produces the same silent data loss.

### Why this matters

`LiteracySessionForm` is the correct contrast: `persistLiteracySession` is awaited
inside `try`, a throw shows "Failed to save session", resets `submitting`, retains
form state for retry, and does **not** navigate or show false success. The two
unguarded handlers should match that behavior.

### Why the tests didn't catch it

`LetterAssessmentScreen.plan5.test.js` asserts only the happy path
(`navigation.navigate` called). No screen test exercises a repository rejection.

### Fix shape

Wrap each handler in `try/catch`; on error show a snackbar/error state, keep the
data in component state for retry, do not navigate, reset any `submitting`/`phase`
flag so the UI is not frozen.

### Failing-test contracts

- `LetterAssessmentScreen shows an error and does not navigate when saveAssessment
  rejects` — mock `assessmentsRepository.saveAssessment` to reject; assert an error
  surface is shown, `navigation.navigate` was not called, and the screen is not
  stuck disabled.
- `LetterTrackerScreen surfaces an error when a mastery write rejects` — mock the
  mastery repo to reject on a cell tap; assert an error surface and that the cell
  state did not change (no false success).
- Regression: `LiteracySessionForm` already-correct behavior — keep/strengthen a
  test asserting no navigation + snackbar on `persistLiteracySession` rejection.

---

## MEDIUM

### M1 — `ClassesContext.getChildrenInClass` contradicts the class-membership contract

`getChildrenInClass` (`ClassesContext.js:234-236`) is
`childrenList.filter(c => c.class_id === classId)` — it derives class membership
purely from `children.class_id`. The Plan 5 Task 2 contract states *"My Children
derives current class through active `child_class_memberships`, not only
`children.class_id`."* Untested. Decide: either derive from active
`child_class_memberships`, or document why the `class_id` pointer is acceptable here.
**Test contract:** `getChildrenInClass uses active child_class_memberships` — a child
whose `class_id` still points at class A but whose active membership moved to class B
appears under B, not A.

### M2 — `class_grouping_state.class_list_status` contract is silently unimplemented

The Task 2 contract *"class roster screens respect `class_grouping_state.class_list_status`"*
has zero implementation (`class_list_status` appears in no screen/component) and
`classGroupingStateRepository` has no test. Either implement it or explicitly defer
it in the plan doc with a note — do not leave a contract silently dropped.
**Test contract:** add a dedicated `classGroupingStateRepository` test, and a roster
screen test asserting behavior differs by `class_list_status`.

### M3 — `isOnline`-gating inconsistency for server pulls

`loadClasses` (`ClassesContext.js:103`) and `loadPreloadedChildData`
(`ChildrenContext.js:96`) gate their server pull on `isOnline` — which
`loadSchools`'s own comment (`ClassesContext.js:62-65`) calls unreliable on mount.
ChildrenContext has no online-recovery re-pull; ClassesContext re-pulls only
*schools* on reconnect (`ClassesContext.js:45-50`), not classes. Make these pulls
follow the `loadSchools` pattern (attempt unconditionally, keep cache on failure),
or add online-transition re-pull effects for classes and children.
**Test contract:** `loadClasses pulls from server even when isOnline is false at
mount` / `ChildrenContext re-pulls when connectivity is restored`.

### M4 — Tab screens go stale on a programme change

`SessionHistoryScreen`, `AssessmentHistoryScreen`, `TimeEntriesListScreen` load via
`useEffect([user?.id])`. A change in the active `staff_programme_assignments` row
without a `user.id` change leaves them showing the previous programme's data until
relaunch. Switch to `useFocusEffect` (as the insights/select screens already do).
**Test contract:** `SessionHistoryScreen refreshes when the active programme changes`.

### M5 — Test quality: context/App tests are tautological

The user asked specifically that tests be "high enough quality to matter." These
are not:

- `ChildrenContext.test.js :: deleteChild …` and `:: addChild …` — `storage` is
  fully mocked; the tests assert that the context calls the function the test
  mocked, and assert a sibling method was not called. They never verify a child is
  archived/created in the DB. **Should** mount `ChildrenProvider` over the real
  `better-sqlite3` test runtime (the infra exists and `hiddenChildren.test.js`'s one
  good test proves the facade works in tests).
- `ChildrenContext.hiddenChildren.test.js` — 3 describe blocks (≈8 tests) test
  **inline copies** of `visibleChildren` / `getChildrenInGroup` / `mergeServerRows`
  defined in the test file. The inline `filterVisible` copy filters only `hidden_at`
  while the real `visibleChildren` also filters `archived_at` — the test is already
  out of sync with the code and would pass against a real regression. Delete or
  rewrite against the real provider.
- `App.plan5.test.js :: renders without legacy bootstrap imports` — every provider
  is mocked to `<>{children}</>`; nothing asserts the absence of a legacy bootstrap
  import. The test name claims a guarantee the test does not check.
- No screen test covers any failure path (repository rejection → snackbar/error).
  `useTimeTracking.plan5.test.js` covers only clock-in — no clock-out, no
  GPS-denied, no auto-clock-out.

**Action:** stop mocking `storage` in the context tests; mount providers over real
SQLite. Delete the inline-logic tests. Add one failure-path test per screen.

---

## LOW / CONCERNS

- **L1** — `ChildrenContext.deleteGroup` and `removeChildFromGroup` call neither
  `refreshSyncStatus` nor `triggerBackgroundSync` → stale unsynced-count badge and
  sync delayed up to 30s (until the periodic `refreshSyncStatus` interval). Every
  other write method calls `refreshSyncStatus` (which auto-triggers a debounced
  sync — that part is correct). Add `await refreshSyncStatus()` to both.
- **L2** — `LookupsContext.loadJobTitles` has no stale-async guard; bug 131's
  sign-out/active-user guard was applied to Auth/Children/Classes but not Lookups.
  Low impact (job titles are non-sensitive reference data) but inconsistent.
- **L3** — `ChildrenContext.loadPreloadedChildData`'s `finally { setLoading(false) }`
  is not stale-guarded; a stale load (after a user switch) flips the spinner off
  during the new user's load. Guard the `finally` with the `activeUserIdRef` check.
- **L4** — `AuthContext` re-runs `scheduleUserProfileLoad` on every session-bearing
  event, so the full `users` profile row is re-fetched on every `TOKEN_REFRESHED`
  (~hourly). Wasteful, not incorrect; consider only re-loading on `SIGNED_IN` /
  `USER_UPDATED` / `INITIAL_SESSION`.
- **L5** — `HomeScreen` `daysWorked` uses `getTimeEntries()` (unscoped) +
  `getDaysWorkedThisMonth` (no `user_id` filter) → counts all users on a shared
  device. Pre-existing, but Plan 5 touched this line while scoping the adjacent
  sessions/assessments stats; scope it for consistency.
- **L6 (verify)** — `classesRepository.archiveClass` enqueues `children` `update`
  outbox rows with a 3-field partial payload `{ id, class_id: null, updated_at }`,
  unlike every other `update` row which carries the full record. Confirm the sync
  engine's upsert tolerates a partial `children` payload against the `ON CONFLICT`
  INSERT arm vs. NOT NULL columns; if not, enqueue the full child record.

---

## What is correct — keep as the quality bar

- **Auth slice.** `supabaseClient.js` — `globalThis`-stashed singleton +
  `module.hot.dispose` cleanup + `!appStateSubscription` guard is a correct
  singleton-across-reloads pattern. `supabaseRequestQueue.js` — correct serial
  queue, errors isolated so one failure does not block the chain, caller still
  receives the rejection. `AuthContext` — `INITIAL_SESSION`-only startup resolves
  `loading` in every branch; `profileLoadVersionRef` + `isCurrentProfileLoad`
  correctly invalidate stale loads on sign-out. The request queue is correctly
  scoped to startup/reference reads only — the outbox sync **push** path is not
  serialized through it.
- **`literacySessionPersistence.js`** — correct transaction discipline: session +
  attendees + tracker changes in one atomic unit, rollback on failure; mastery
  reuse double-scoped by `programme_id` + `child_id` (bug-128 fix is real).
- **Repository / persistence tests** — run against real `better-sqlite3` with
  concrete row and outbox assertions; these are the standard the context and
  screen tests should be raised to.

---

## Acceptance criteria for Plan 5 signoff

1. Critical 1 fixed: a signed-in device with a server-side programme assignment can
   create a child, class, group, session, and assessment, and see them in their
   lists, with no manual DB seeding.
2. High 1 + High 2 fixed with the failing-test contracts above going red → green.
3. Mediums M1–M4 fixed or explicitly deferred in the plan doc with rationale.
4. M5: context tests mount real SQLite; inline-logic tests removed; one failure-path
   test per migrated screen.
5. The plan doc Review Gate's signed-in Android flow is actually executed and checked.
6. `npm test -- --runInBand` green; `git diff --check` clean.
7. `documentation/sqlite-refactor-log.md` updated with Decision / Bug-Gap /
   Verification entries for every fix.

## Out of scope for this brief

- Full storage-facade / profile-facade removal — already deferred to Plan 6
  (decision 73).
- `pullReferenceData` becoming an incremental cursor-based pull — full-replace is
  acceptable for Plan 5; cursoring can come with the Plan 6/later domain pull engine.
