# Design Spec: Actor Lifecycle and Mutation Ownership

**Status:** revised after Codex adversarial review round 1 (§11). Design walked through with Jim section by section on 2026-10-09 (brainstorming); every
section approved. Awaiting Jim's review of this written spec, then a Codex adversarial review, then
an implementation plan. Companion decision record: an ADR for one database per EA, to be created
through `grill-with-docs`.

**Owner of build:** Codex, through the plugin, task by task from the implementation plan that
follows this spec. Claude specifies, reviews the diff and tests, and verifies.

**Inputs:** [`documentation/zazi-sync-lessons-for-masi-2026-10-08.md`](../../../documentation/zazi-sync-lessons-for-masi-2026-10-08.md)
(Part 2, decision D2, and the "Codex round 2" section that found both live defects);
`documentation/ROADMAP.md` priority 5.

## 1. Problem

Masi keeps every EA's domain data, outbox, and sync cursors in one SQLite file (`masi.db`), opened
once at app start before anyone is signed in. EAs bring their own phones, and two EAs sharing one
phone for a day or two is common. Two confirmed defects follow from today's design:

1. **Live defect 1, wrong outbox owner.** `enqueueDomainOutbox`
   (`src/db/repositories/domainRepositoryUtils.js:105`) derives `owner_user_id` from the record's
   content through `OWNER_RESOLVERS` (`src/db/repositories/outboxOwnership.js`), for example
   `children: directOwner('created_by')`. An EA's edit to a child that Head Office created is owned
   by Head Office, so the owner-scoped upload query never picks it up and the edit never reaches the
   server. About 45 call sites rely on this resolution. The auth-restore heal
   (`requeueTerminalRlsFailures`, `src/services/offlineSync.js:1563`) asks the same wrong question
   and skips such rows as "owner mismatch".
   **The defect has a server half (Codex review of this spec, round 1).** Every `update` operation
   is sent as an upsert (`runServerOperation`, `src/services/offlineSync.js:704-711`, and the batch
   path at `:719-728`). PostgreSQL checks INSERT `WITH CHECK` "for all rows proposed for insertion,
   regardless of whether or not they end up being inserted" (PostgreSQL 17, `CREATE POLICY`). The
   `children` INSERT policy requires `created_by = auth.uid()`, so even with the right owner, the
   server refuses an EA's edit of a Head Office-created child. The same applies to every table whose
   INSERT policy binds `created_by` to the caller.
2. **Live defect 2, upload under the next EA's session.** The sync engine checks the session when it
   queues a server request (`getMatchingPassSession`, `src/services/offlineSync.js:976`), not when
   the queued task runs (`src/services/supabaseRequestQueue.js` is a bare serial promise chain). A
   task queued under EA A can execute on the shared Supabase client after EA B has signed in.

There is also a structural gap: `OfflineProvider` sits above `AuthProvider` (`App.js:128-140`), so
the sync engine starts, repairs, and reads the outbox before any actor is known.

## 2. Decisions locked with Jim

| Decision | Choice | Date |
|---|---|---|
| Local storage | One SQLite file per EA, `masi-<userId>.db`. Another EA's file is deleted only when it has nothing unsent **and** has been idle for 30 days | 2026-10-08 |
| Letter-mastery conflicts (input to the upload-contract spec, recorded here for completeness) | The most recently *made* correction wins | 2026-10-08 |
| Removing an EA's data | Automatic only (the 30-day rule); no manual removal screen | 2026-10-09 |
| Unsent work at sign-out | Warn, allow, track: a warning with "Try uploading now" or "Sign out anyway", plus a privacy-safe support report while the work stays unsent | 2026-10-09 |
| Still clocked in at sign-out | Ask: "Clock out now" or "Stay clocked in and sign out" | 2026-10-09 |
| Architecture | Approach A: one signed-in EA handle that owns the file, an epoch fence, and the outbox owner | 2026-10-09 |

Rejected approaches: B (filename switch plus edge checks and passing `actorUserId` at about 45 call
sites; leaves isolation to each future author) and C (a full port of Zazi's installation
coordinator; built for a problem Masi does not have, because Masi is pre-live with no legacy data).

## 3. Domain language

- **Signed-in EA handle**: the single object that represents "who is working on this phone right
  now". It holds `{ userId, epoch, db }` and is the only way production code reaches a domain
  database.
- **Epoch**: a number the handle advances at every sign-out. Work stamped with an older epoch is
  stale and is refused.
- **Stale work**: any task, request, transaction, or timer that began under an earlier epoch.
- **Unsent**: an outbox row whose status is `pending`, `failed`, `in_flight`, or `terminal`.
  `terminal` counts because the server does not have that work.
- **Left-behind work**: unsent rows in an EA's file while a different EA is signed in on the phone.
- **Mutation owner**: the EA who made the change. Never derived from the record's content.

`CONTEXT.md` gains "Signed-in EA handle", "Unsent", and "Left-behind work" in the same branch.

## 4. Storage lifecycle

### 4.1 What lives where

| Store | Scope | Contents |
|---|---|---|
| `masi-<userId>.db` | per EA | All domain tables, `sync_outbox`, `sync_state`, `local_state`, and that EA's copy of reference data |
| AsyncStorage | device | Supabase auth session, `deviceSettings`, app logs, the per-install id (§7.4) |
| Nothing open | signed out | No domain database is open; the login screen reads none |

### 4.2 Opening

- `DatabaseBootstrapGate` stops calling `initializeDatabase()`. It becomes a check that the SQLite
  engine loads.
- A new module, the signed-in EA handle, opens `masi-<userId>.db` after a fresh sign-in succeeds or
  when a persisted session is restored (`restoreOfflineSession`, `src/context/AuthContext.js:46`;
  works offline). It runs migrations on the writer, opens the `query_only` reader, applies the
  existing PRAGMAs (WAL, `busy_timeout`, foreign keys), and only then publishes the handle.
- `src/db/client.js` loses its module-level writer, reader, and `databaseQueue`. Each handle owns
  its own pair of connections and its own serial write queue. `withTransaction` and `getDatabase`
  become methods reached through the current handle.
- `withTransaction` keeps its existing non-re-entrant contract and its ROLLBACK-failure disposal.

### 4.3 Closing

At sign-out, after the questions in §7.1, the handle:

1. Advances the epoch, so new work is refused.
2. Waits up to the drain bound (§5.3) for in-flight work.
3. Writes `last_active_at` into the file's `local_state`.
4. Closes both connections.

The file stays on the phone.

### 4.4 Discovering files

There is no separate registry. At each sign-in the handle lists the SQLite directory for
`masi-*.db` and, for each file belonging to another EA, opens it read-only to read its unsent count
and `last_active_at`. The file system is the only source of truth, so there is nothing to drift.

### 4.5 The existing shared `masi.db` is untrusted legacy storage

Only test phones carry one (Masi is pre-live). It may hold several EAs' cached data, and its outbox
owners record provenance rather than who made each change, so no rule can prove who made its
unsent work. A persisted session only says who signed in last. Therefore:

- The app never opens `masi.db` as an EA's file, never renames it, and never uploads from it. Every
  EA starts with a fresh `masi-<userId>.db`.
- §4.4 discovery treats `masi.db` like any other file: it opens it read-only to count unsent rows
  and read its idle age. If it holds unsent rows, one incident of kind `legacy_shared_file_unsent`
  is reported (counts by table and oldest age only). It is deleted under the §7.3 rule.
- Profile → Export Database can still export it, so support can recover anything that matters by
  hand.
- The existing field-cutover rule stands: phones moving to the SQLite build are freshly installed
  (`documentation/rls-sync-contract-map.md`, deploy gate status). This section only covers test phones
  that skip that rule.

There is no other legacy path.

### 4.6 Accepted cost

When two EAs share a phone, each one's first sign-in downloads their own reference data and
history. CAP-004's faster history download is what keeps this acceptable.

## 5. Fencing

### 5.1 Remount the signed-in tree by key

`OfflineProvider`, `TimeTrackingProvider`, `LookupsProvider`, `ChildrenProvider`,
`ClassesProvider`, and `MainNavigator` move inside one wrapper rendered only when a handle exists:

```jsx
<AuthProvider>
  {handle
    ? <SignedInEA key={`${handle.userId}:${handle.epoch}`} handle={handle}> …providers… </SignedInEA>
    : <AuthNavigator />}
</AuthProvider>
```

A change of key unmounts every provider, ref, interval, and listener from the previous EA.
`LoginScreen` and `AuthContext` do not use `useOffline` (checked 2026-10-09), so the signed-out
branch needs no database. `AuthContext`'s post-sign-in work (`loadUserProfile` and
`pullReferenceData`, `AuthContext.js:161-166`) moves inside the signed-in tree so it runs only after
the file is open. While the handle opens, the signed-in tree shows "loading", never an empty state.

`OfflineContext`'s hand-maintained `currentUserIdRef` guard is removed once the handle supplies the
actor.

### 5.1a Module-scoped state moves into the handle

Remounting the React tree does not reset module-level variables. On 2026-10-09 the inventory of
mutable module state under `src/` (excluding tests and constants) is:

| State | Location | Treatment |
|---|---|---|
| `initPromise`, `writerConnection`, `readerConnection`, `databaseQueue` | `src/db/client.js:18-21` | Owned by each handle (§4.2) |
| `appMigrationQueue` | `src/db/migrations.js:10` | Owned by each handle |
| `referenceDataReadyThisSession`, `referenceDataPromise` | `src/services/offlineSync.js:1659-1660` | Owned by each handle as `handle.referenceDataReady`, a single-flight promise. `ChildrenContext` and `ClassesContext` pulls, and history pulls, await **their handle's** readiness before persisting. EA B can never see EA A's fulfilled or pending barrier |
| `actorGeneration`, `inFlight` | `src/services/sessionHistoryPull.js:26-27` | Keyed by the handle; a new handle starts empty, and A's in-flight runs are fenced by §5.2 |
| `snapshot`, `listeners`, `statusGeneration` | `src/services/sessionHistoryStatus.js:11-16` | Reset when the handle changes |
| `reportedSyncIssueKeys`, `operationalErrorTimes` | `src/services/observability.js:9-11` | Keys include the actor's user id |
| `initialized`, `enabled`, `runtimeContext`, `navigationIntegration` | `src/services/observability.js:5-8` | Device-level; unchanged |

The startup `pullReferenceData` call is no longer fire-and-forget: it is the handle's
`referenceDataReady` promise, so dependent pulls are ordered after it instead of racing it.

A test fails if a new top-level `let`, `var`, `Map`, or `Set` appears under `src/services` or
`src/db` without an entry in an allowlist that names its treatment. This keeps the inventory true as
the code grows.

### 5.2 Check the actor at the doors

Remounting does not cancel promises that are already running. Every unit of work therefore captures
`{ userId, epoch }` from the handle when it starts. That actor is checked again at three doors.

Each handle also has a state: `open`, `draining` (from sign-out until the §5.3 drain ends), or
`closed`. When the network door lets a request through, it issues a **finalize token** bound to that
handle and that request. The token is the only thing that admits a transaction while the handle is
draining.

| Door | Location | Check | If stale |
|---|---|---|---|
| Network | the queued task inside the Supabase request queue, immediately before the request is sent | the handle is `open`, the epoch is current, **and** the Supabase client's in-memory session user equals the actor's `userId` | throw `StaleActorError`; send nothing |
| Transaction admission | `runRepositoryTransaction` / handle `withTransaction` | the handle is `open` with the current epoch, **or** it is `draining` and the transaction carries a finalize token for a request already sent | throw `StaleActorError` |
| Commit | immediately before `COMMIT` | the same rule, re-checked | `ROLLBACK`, throw `StaleActorError` |

The network door is the direct fix for live defect 2. With one file per EA, a stale write can only
reach its own EA's file, so the two transaction doors are a second layer of protection.
`StaleActorError` is logged once and is never retried or treated as a sync failure.

The Supabase session user is read from a value the handle keeps current from
`onAuthStateChange`. The door does not call `getSession()`, because a second auth-lock contender
causes Android startup contention (`AuthContext.js:61-63`).

### 5.3 Sign-out drain

When the epoch advances, the handle becomes `draining`. Requests already sent (past the network
door) get up to a **drain bound of 10 seconds** to return and record their result in their own EA's
file, using their finalize tokens. No other work is admitted. When the drain ends, the handle becomes
`closed` and its connections close. Anything unfinished at the
bound stays unsent in that EA's file. It uploads again the next time that EA signs in, and that is
safe today because uploads are upserts by deterministic id.

The 10 s value is provisional and is set by device measurement D4 (§9.3).

**Dependency on the upload-contract spec:** once that spec adds base-version checks, a re-sent
mutation the server already applied must be recognised as already applied, not treated as a
conflict. The upload-contract spec must state how its uncertain-outcome recovery covers mutations
left by a sign-out drain.

### 5.4 Rejected: one Supabase client per EA

This would make session mix-ups impossible by construction, but Supabase's auth storage and refresh
lock assume a single client, and Masi already sees Android lock contention with one. The epoch
check gives nearly all of the benefit.

## 6. Mutation ownership

### 6.1 Owner equals the actor, stamped at one choke point

`enqueueDomainOutbox` takes the owner from the transaction's handle actor. The
`{ ownerRow, ownerUserId }` options and the `resolvePrimaryOwner` call are removed. The explicit
`ownerUserId: record.user_id` arguments in the assessments, sessions, and letter-mastery
repositories are removed too, leaving a single source of truth. None of the roughly 45 call sites
otherwise change. Tests that inject a raw database pass an explicit actor through the test helper.

### 6.2 A missing owner fails closed

- JavaScript: `insertOutboxRecord` throws when there is no actor.
- SQLite: a migration adds
  `create trigger sync_outbox_owner_required before insert on sync_outbox when new.owner_user_id is null begin select raise(abort, 'sync_outbox.owner_user_id is required'); end;`.
  A trigger is chosen over a table rebuild with `NOT NULL` because it gives the same guarantee
  without rebuilding the outbox's indexes.
- The upload queries in `src/db/repositories/syncOutboxRepository.js` (`getReadyRecords`,
  `getPendingHardDeleteIds`, `resetInFlight`, around lines 88, 118, and 170) lose their null-owner
  wildcard and become a plain `owner_user_id = ?`, a second guard behind §6.3.
- `getSyncStatus` (around line 283) and every "unsent" count become **file-wide** with no owner
  filter. In a per-EA file every row is that EA's responsibility, and a filtered count would hide
  exactly the rows §6.3 exists to surface.

### 6.3 Owner integrity scan

A per-record check before sending cannot work, because owner-filtered upload queries never hand it a
foreign row (Codex review of this spec, round 1). Instead, an **unfiltered** scan runs:

- when the handle opens a file, before it is published; and
- at the start of each upload pass, before candidates are read.

The scan selects every unsent outbox row whose `owner_user_id` differs from the file's EA. Each such
row is moved to `terminal` with reason `foreign_owner`, so it is never sent and is never healed by
§6.4. One incident of kind `foreign_owner_in_file` is reported per file and repeat key, containing
counts by table only. These rows stay in the file-wide unsent count (§7.2), so the sign-out warning
and the 30-day rule both protect them. With fresh per-EA files (§4.5) and actor-stamped owners
(§6.1) this should never fire; if it does, the isolation design has failed and we need to know.

### 6.4 Rescue heal uses the stamped owner

`requeueTerminalRlsFailures` compares `record.owner_user_id === userId` instead of calling
`resolveRecordOwners`, and never requeues a row whose terminal reason is `foreign_owner`.
`src/db/repositories/outboxOwnership.js` then has no users and is deleted, with its tests.

### 6.5 Edits are sent as UPDATE, not upsert

An `update` operation means "change a row the server already has". It must not ask for insert
permission. For every table whose INSERT policy binds `created_by` (or another provenance column) to
the caller, `runServerOperation` sends an `update` operation the way it already sends lifecycle
archives:

- `update(patch).eq('id', recordId).select('id')`, where `patch` is the payload minus identity and
  provenance columns (`id`, `created_by`, `created_at`, and the table's immutable identity columns).
- Success requires exactly the requested id back. Zero rows is `UPDATE_NOT_APPLIED`, which is
  **retriable** while the same record has an unsent `insert` in this file (the insert has not
  landed yet), and **terminal** otherwise. It never creates the row.
- `runBatchServerOperation` batches only `insert` operations for these tables; `update` operations
  go one by one through the path above.

This exercises the UPDATE policy only, as the contract map already requires for archives. An EA can
then edit a Head Office-created child, while the INSERT policy still stops anyone creating a row in
someone else's name.

**Exceptions stay on upsert, by name, with a reason.** A table keeps upsert for `update` only when
its update genuinely means "create or update" and its INSERT policy is authorization-based, not
creator-bound. The first known case is `class_grouping_state` (its INSERT policy is
`current_user_can_write_for_class`). The implementation plan's first task produces the full
table-by-operation inventory from the producers and the policies, and the contract map records each
table's choice.

**Known product limit surfaced by the policies:** `classes_update_created_by` lets only a class's
creator update it. An EA's edit of a Head Office-created class will be refused by design. The
inventory task checks whether the app offers that edit. If it does, that is a product question for
Jim, not something this spec silently widens.

**Relationship to the upload-contract spec:** the base-version (`stale_base`) check that spec adds
will sit on this UPDATE path. The exact-acknowledgement shape chosen here is the hook it builds on.

### 6.6 Server proof (verified first)

Test S1 (§9.2) runs before any app code. It proves, in the migration-replay Postgres harness and
using the exact PostgREST request shapes the app sends:

1. **Red today:** an assigned EA's current upsert of a Head Office-created `children` row fails on
   the INSERT policy. This reproduces the server half of defect 1.
2. **Green with §6.5:** the same edit sent as `update … eq('id') … select('id')` succeeds and returns
   exactly one id.
3. An unassigned EA's UPDATE affects zero rows (it reads as `UPDATE_NOT_APPLIED`, never success).
4. **Impersonation negative:** an EA cannot INSERT a row with `created_by` set to Head Office or
   another EA.

Steps 1–4 repeat for every table the inventory marks as edited by EAs through `update`. If any table
needs a policy change to allow a legitimate edit, the work returns to Jim before building.

## 7. Sign-out and clean-up

### 7.1 Sign-out questions, in order

Each question is a bottom sheet, not a dialog.

1. **Still clocked in.** "You're still clocked in." Options: **Clock out now** (the normal
   clock-out, including location), **Stay clocked in and sign out**, **Cancel**.
2. **Unsent work.** Shown when the unsent count is above zero after step 1 (clocking out creates
   an unsent time entry, so this question must come second). The sheet reads: "N items haven't
   uploaded yet. If you sign out, they'll upload next time you sign in on this phone." Options:
   - **Try uploading now** runs a forced sync with visible progress. If the count reaches zero,
     sign-out continues without asking again; otherwise the sheet updates the count. When the phone
     is offline the button is disabled and labelled "No connection".
   - **Sign out anyway**.
   - **Cancel**.
3. The §4.3 close sequence.

Sign-outs not started by the EA (the server ending the session) skip the questions. The file still
closes through §4.3.

"Stay clocked in" leaves the time entry open until that EA next signs in on this phone, possibly
days later. The existing on-phone ten-hour auto clock-out then runs, and the Step 5 policy (the
staff report says "still open") applies. A server-side auto clock-out remains out of scope.

Copy is provisional and gets a wording pass with Jim.

### 7.2 What counts as unsent

Status `pending`, `failed`, `in_flight`, or `terminal`. The sign-out warning, the 30-day deletion
rule, and the left-behind report all use this one definition, through one repository function.

### 7.3 Thirty-day deletion

At each sign-in, during §4.4 discovery, another EA's file (and its `-wal` and `-shm` companions) is
deleted only when **both** hold:

- it has zero unsent rows;
- its `last_active_at` (falling back to the file's modification time) is more than 30 days old.

A file is never deleted if it is the signed-in EA's own file, or if it fails to open or read; when
in doubt, keep it. Each deletion writes one app-log line (user id, idle days, file size). No UI.

### 7.4 Left-behind report and the minimal incident envelope

When §4.4 discovery finds another EA's file with unsent rows, the signed-in EA's session reports
one incident of kind `left_behind_unsent_work`:

- **Payload:** `{ strandedUserId, unsentByTable: { <table>: count }, oldestUnsentAgeHours,
  appVersion, buildNumber, updateId, backend, installId }`.
- **Excluded:** child ids, names, notes, or any record payload.
- **Repeat key:** `strandedUserId + installId + oldest unsent outbox row id`. The same situation
  reports once.

This spec builds the **minimal incident envelope**, Zazi's proven shape, with the first three
incident kinds (`left_behind_unsent_work`, `foreign_owner_in_file`, and `legacy_shared_file_unsent`):

- **Server:** a migration creates a table readable only by `service_role`, and a `SECURITY DEFINER`
  RPC `report_mobile_support_incident` for authenticated callers. The RPC validates the kind against
  an allowlist and the payload size against a limit (8 KB), and is idempotent on a hash of
  `(reporter, kind, repeat key)`.
- **Phone:** a small local queue in the signed-in EA's file (at most 200 rows, each at most 8 KB)
  drained by the sync engine through the network door.
- **`installId`:** a random UUID kept in AsyncStorage, created on first launch.

The `/bug-sync` sweep, further incident kinds, and support actions belong to Step 4's own spec,
which extends this envelope rather than replacing it.

### 7.5 Not doing

- No manual "remove this EA's data" screen (Jim, 2026-10-09).
- No upload of EA A's work while EA B is signed in; that needs A's credentials and is exactly the
  defect this spec closes.

**Known gap:** if EA A never signs in on that phone again, their unsent work stays there. The
report is how support finds out; the remedy is a call asking A to sign in once on that phone.

## 8. Sequencing

1. **Inventory and S1** (§6.5, §6.6): the table-by-operation inventory, then S1 in the
   migration-replay harness. About a day, as a gate.
2. Handle module, per-EA file lifecycle, `client.js` refactor, legacy file handling (§4) with T1,
   T2, T11.
3. Signed-in tree remount, module-state move, and the three doors (§5, §5.1a) with T3, T4, T5, T14,
   T15, T16.
4. Ownership and edits-as-UPDATE (§6) with T6–T9 and T17. Lands with or after step 2, because the
   owner comes from the handle.
5. Incident envelope (§7.4) with S2 and T12, then the sign-out questions and 30-day deletion
   (§7.1–7.3) with T10 and T13.
6. Device checks D1–D5 with the build intended to ship. Hosted migration apply and S3 need Jim's
   explicit yes.

Estimated 5–7 days of Codex implementation plus review. The largest pieces are the remount (§5.1)
and the incident envelope.

## 9. Testing

Built test-first through the repository TDD skill, in vertical slices. SQLite behaviour (triggers,
WAL companions, connection close, file deletion) uses real SQLite through better-sqlite3.

### 9.1 Unit and integration (`npm test`, `npm run test:integration`)

| # | Behaviour |
|---|---|
| T1 | Sign-in as A opens `masi-A.db`; sign-in as B opens `masi-B.db`; signed out, no domain file is open and the login screen reads none |
| T2 | Offline restore of a saved session opens the right file; data screens show loading, never "no children" |
| T3 | Live defect 2: A queues an upload, A signs out, B signs in, A's queued task runs; nothing is sent and the task fails with `StaleActorError` |
| T4 | A transaction admitted under epoch N with sign-out before `COMMIT` is rolled back, unless it carries a finalize token for a request already sent; a token-less write while draining is refused |
| T5 | An in-flight upload records its result within the drain bound; past the bound the row stays unsent in A's file and uploads after A signs in again |
| T6 | Live defect 1: an EA edits a Head Office-created child; the outbox owner is the EA, the upload query returns the row, and it is sent as `update … eq('id') … select('id')` without `created_by` |
| T7 | Inserting an outbox row with no actor throws in JavaScript; the trigger aborts a raw null insert |
| T8 | Integrity scan, through the public open and sync paths: an outbox row owned by X in Y's file becomes terminal `foreign_owner` at open and before an upload pass, is never sent or healed, stays in the file-wide unsent count, and reports one incident |
| T9 | Rescue heal requeues an RLS-quarantined row by its stamped owner, including Head Office-created records |
| T10 | Deletion only when zero unsent (terminal counts) and idle over 30 days; removes `-wal`/`-shm`; never deletes the current EA's file or an unreadable file |
| T11 | Legacy `masi.db` holding two EAs' cached data, null-owner mutations, and an edit stamped with Head Office's id: never opened as an EA file, never renamed, nothing uploaded from it; one `legacy_shared_file_unsent` incident; deleted only under the §7.3 rule |
| T12 | Left-behind report sent once per repeat key; a deny-list test proves the payload holds no child ids, names, or notes |
| T13 | Sign-out order: the clock-out sheet comes before the unsent sheet; "Clock out now" increases the unsent count shown next |
| T14 | After a key change, no timer, interval, or listener from the previous EA's tree remains |
| T15 | Account switch with A's reference-data barrier both fulfilled and still pending, B's file empty, and B's reference requests delayed or failing: B's roster and history pulls wait for B's own barrier and never persist before it |
| T16 | Module-state allowlist: a new top-level `let`, `var`, `Map`, or `Set` under `src/services` or `src/db` without an allowlist entry fails the suite |
| T17 | `UPDATE_NOT_APPLIED`: retriable while the record's `insert` is unsent in this file, terminal otherwise; never creates a row; `update` operations are excluded from batches for creator-bound tables |

### 9.2 Server

| # | Behaviour |
|---|---|
| S1 | The four §6.6 steps in the migration-replay Postgres harness, with the app's exact request shapes, for every table the inventory marks as EA-edited through `update`: today's upsert fails (red), UPDATE-by-id succeeds with one id, an unassigned EA gets zero rows, and impersonating INSERTs are refused |
| S2 | Incident RPC: anonymous callers refused; authenticated caller accepted; duplicate payload recorded once; unknown kind and oversize payload refused; only `service_role` reads the table |
| S3 | After a hosted apply (Jim's yes), `npm run rls:probe` repeats S1 against `segygjzpujphwvrubusm` with real test accounts |

### 9.3 Device (an iPhone and the Galaxy A03s, using the build intended to ship)

| # | Check |
|---|---|
| D1 | A and B share a phone: A works offline, signs out with "Sign out anyway"; B signs in and works; A signs back in. A's work uploads, B never sees A's children, and the left-behind incident is on the server |
| D2 | Sign-out during an upload on a throttled network: no request under B's session; A's work arrives exactly once later |
| D3 | "Stay clocked in and sign out", sign back in after more than ten hours: the auto clock-out runs and the report shows "still open" |
| D4 | Measure sign-out to file closed on the A03s; this sets the §5.3 drain bound |
| D5 | Cold start with the file opened after sign-in, compared with today's build |

These cover next-steps Step 7's "switch accounts on the same phone" case and the sign-out half of
Codex round 2's live defect 2.

## 10. Documentation in the same branch

- `documentation/rls-sync-contract-map.md`: the owner rule, the doors, the incident table and RPC.
- `CONTEXT.md`: the §3 terms.
- `documentation/ROADMAP.md` priority 5: mark what this delivers.
- `documentation/build-log.md`: decisions, verification, and device results.
- ADR for one database per EA with 30-day deletion, through `grill-with-docs`.

## 11. Review history

- **Codex adversarial review, round 1 (2026-10-09), verdict needs-attention, four findings, all
  accepted:**
  1. The PostgreSQL premise in the first §6.5 was wrong: INSERT `WITH CHECK` applies to every
     upsert. Edits now go as UPDATE (§6.5), and S1 proves both halves (§6.6).
  2. The per-record tripwire was unreachable behind owner-filtered queries. It is now an
     unfiltered integrity scan with file-wide counts (§6.2, §6.3).
  3. Adopting the shared `masi.db` could misattribute another EA's work. It is now untrusted legacy
     storage that is never opened as an EA file (§4.5).
  4. Module-scoped state survives a React remount. It now moves into the handle, guarded by an
     allowlist test (§5.1a).

## 12. Out of scope (owned by the upload-contract spec)

Uncertain-outcome recovery, same-record ordering, base versions and `stale_base`, the assessment
bundle as the exclusive insertion boundary, queue-level deadlines, and duplicate-proof submit. This
spec's §5.3 drain states the one dependency it places on that work.
