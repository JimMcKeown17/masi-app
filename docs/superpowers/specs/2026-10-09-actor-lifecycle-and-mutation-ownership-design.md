# Design Spec: Actor Lifecycle and Mutation Ownership

**Status:** revised after Codex adversarial review rounds 1–4 (§11). Design walked through with Jim section by section on 2026-10-09 (brainstorming); every
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
2. Waits up to the drain bound (§5.5) for in-flight work.
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
| `defaultQueue` and its `tail` closure | `src/services/supabaseRequestQueue.js:13` | Replaced by one queue per handle (§5.3) |
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

### 5.2 Every server request goes through the handle's own data client

A check at queue entry is not enough: one queued task can send several requests. For example,
`reconcileChildClassMembership` (`src/services/offlineSync.js:600-614`) sends a SELECT, then
possibly an UPDATE, then the final upsert, and swallows every error on the way (Codex review of
this spec, round 2). So the fence sits on **each request**, not on each task.

Each handle owns a **data client**: a Supabase client created with supabase-js's `accessToken`
option (available in the pinned 2.100.1) and a fenced `fetch`.

- `accessToken: () => handle.requireAccessToken()` returns the access token from the single auth
  client's latest session, which the handle keeps current from `onAuthStateChange`. It throws
  `StaleActorError` unless the handle is `open` **and** that session's user is the handle's
  `userId`. It never calls `getSession()`, which would add an auth-lock contender
  (`AuthContext.js:61-63`).
- `global.fetch` is `handle.fencedFetch`. It repeats the same check at the moment of sending,
  attaches the handle's `AbortController` signal, and applies a per-request timeout (provisional
  30 s, set by D4). A timeout or abort is reported as the existing codeless network error, so the
  row stays retriable.
- A client created with `accessToken` has no `auth` module. The one shared auth client keeps sign-in,
  refresh, and storage, so the reason for rejecting a client per EA in the first draft (auth storage
  and the refresh lock) no longer applies.

**Every data request in the app uses the handle's data client.** The 16 direct `from`/`rpc` call sites
in `AuthContext`, `ClassesContext`, `LookupsContext`, `offlineSync`, and `preloadedChildData` (as of
2026-10-09) move to it, and so do the history pulls. A test fails if `from(` or `rpc(` is called on
the shared client outside the auth module. A request built by EA A's client can therefore never carry
EA B's token, however deep inside a task it is sent and whatever a `catch` does with the refusal.

**A stale refusal survives the SDK.** postgrest-js 2.100.1 defaults to
`shouldThrowOnError = false`, and it catches a rejected `fetch` (including a rejection from the
`accessToken` callback) and returns an ordinary error object with an empty code
(`@supabase/postgrest-js/dist/index.cjs:168-198`). A `StaleActorError` thrown in the fence would
therefore reach application code as a retriable network error (Codex review of this spec, round
3). The refusal is restored at a boundary we own, the handle's request queue:

- Data requests may be made **only inside a task run by `handle.enqueueRequest`**. The fence refuses
  any request made outside a running task, so the rule is enforced at runtime, not by convention.
- When `requireAccessToken` or `fencedFetch` refuses, it marks the **current task** as stale. The
  queue runs one task at a time per handle, so the refusal cannot be attributed to the wrong task.
- When a stale-marked task settles, the queue discards whatever the task returned or threw and
  rejects with `StaleActorError`. Application code never sees the SDK's codeless error for a stale
  refusal.
- On `StaleActorError`, the caller **skips finalization entirely**. It needs no finalize token
  because it records nothing. The outbox row stays `in_flight` or `pending` in that EA's file, and
  `resetInFlight` returns it to `pending` at the next open. A refused request is never counted as
  a sync failure, an attempt, or a backoff.
- Inside a task, conservative fallbacks such as `reconcileChildClassMembership`'s may still run, but
  every later request in the same task is refused too. The fence, not the fallback's error handling,
  is what stops the send.

### 5.3 Each handle has its own request queue

The process-wide `defaultQueue` in `src/services/supabaseRequestQueue.js` is replaced by one serial
queue per handle (`handle.enqueueRequest`), and `enqueueSupabaseRequest` is deleted. Serialization
within one EA's work is kept, as the 2026-05 queue tests require. EA B's queue never waits behind a
request of EA A's that never returns. The queue's `tail` joins the §5.1a inventory.

### 5.4 Transaction doors

Each handle has a state: `open`, `draining` (from sign-out until §5.5 ends), or `closed`.

| Door | Location | Admits |
|---|---|---|
| Transaction admission | handle `withTransaction` / `runRepositoryTransaction` | handle `open`; or `draining` and the transaction carries a **finalize token** |
| Commit | immediately before `COMMIT` | the same rule, re-checked; otherwise `ROLLBACK` and `StaleActorError` |

A finalize token is issued by the fenced fetch for a request it actually sent. It authorizes only
**recording that request's result** in the same EA's file. It never authorizes sending anything:
the data client refuses every request once the handle leaves `open`. With one file per EA, a stale
write can only reach its own EA's file, so these doors are a second layer behind the per-file
design. `StaleActorError` is logged once and is never retried or treated as a sync failure.

### 5.5 Sign-out drain

When the epoch advances, the handle becomes `draining`, and the following happens in order:

1. Requests already sent get up to a **drain bound of 10 seconds** to return and record their
   results with their finalize tokens.
2. At the bound, the handle aborts every outstanding request through its `AbortController`.
3. Each aborted request's result-recording runs as a retriable network error, still under its token,
   within a short grace (provisional 2 s).
4. The handle becomes `closed` and its connections close.

Rows still `in_flight` in the file return to `pending` through `resetInFlight` the next time that
EA's file opens. They upload again then, which is safe today because uploads are idempotent by
deterministic id. EA B is unaffected throughout, because B has a separate queue (§5.3) and a separate
client (§5.2).

Both bounds are provisional and are set by device measurement D4 (§9.3).

**Dependency on the upload-contract spec:** once that spec adds base-version checks, a re-sent
mutation the server already applied must be recognised as already applied, not treated as a
conflict. The upload-contract spec must state how its uncertain-outcome recovery covers mutations
left by a sign-out drain or a request timeout.

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
permission. The 2026-10-09 table-by-operation inventory (§6.5a) shows that `update` is produced for
`time_entries`, `classes`, `children`, `groups`, `letter_mastery`, and `class_grouping_state`. For
the first five, `runServerOperation` sends `update` the way it already sends lifecycle archives:

- `update(patch).eq('id', serverId).select('id')`. `serverId` is the payload id **after**
  `buildSyncPayload`'s remap, not the outbox `record_id`: `letter_mastery` always re-derives its
  deterministic id, and a pre-fix local row can still carry a random one.
- `patch` is the payload minus provenance and identity columns: `id`, `created_by`, `created_at`,
  `user_id`, and `archived_by_user_id`. `updated_at` may stay in the patch, but the server's
  `set_updated_at` trigger overwrites it.
- Success requires exactly the requested id back. Zero rows is `UPDATE_NOT_APPLIED`, and it never
  creates the row. Zero rows has several causes: the row has not landed yet, its FK parent has not
  landed, or the row exists but the UPDATE `USING` policy excludes the caller until a pending
  assignment lands. For example, `letter_mastery` SELECT admits `user_id = auth.uid()` while its
  UPDATE also requires `current_user_can_write_for_child` (Codex review of this spec, round 2).
  Classification therefore reuses the engine's existing evidence rules rather than a new one:
  - **Retriable** while dependency evidence is still pending: the same record's own `insert`
    outbox row is unacknowledged, **or** `computeEvidencePending` (`src/services/offlineSync.js:404`)
    with `includeGrant: true` finds a pending FK parent or a pending active assignment that grants
    the write. This matches how `42501` is already handled.
  - **The grant-evidence resolver is extended** so that it matches the server's write helpers
    (`current_user_can_write_for_child/class/group`, `20260521144901:368-517`) for every table this
    spec sends as UPDATE. Today `GRANT_SUBJECTS` (`offlineSync.js:252-270`) has no entries for
    these tables, and its own comment records the gap for authorization reached through a class or
    group membership (Codex review of this spec, round 3). The resolver gains two shapes:
    - **Own id as subject:** `classes` → `class_ea_assignments.class_id = id`; `groups` →
      `group_ea_assignments.group_id = id`; `children` → `child_ea_assignments.child_id = id`.
    - **Via a membership:** for any child-scoped write (`children` by own id, and `letter_mastery`,
      `assessments`, `session_attendees`, `child_class_memberships`, `child_group_memberships`,
      `child_programme_enrollments` by `child_id`), the server grant is a **conjunction**: an active
      `class_ea_assignments` row for the actor joined to the child's active `child_class_memberships`
      row (`exited_at is null`), or an active `group_ea_assignments` row for the actor joined to the
      child's active `child_group_memberships` row (`removed_at is null`)
      (`20260521144901:496-516`). Evidence is pending when the local pair exists and **either half**
      is still unacknowledged and not terminal: the assignment row, or the membership row. A pair
      whose half is terminal contributes no evidence (Codex review of this spec, round 4).

    Fixing the shared resolver also clears the existing false-terminal limitation for the tables
    that already used it. `time_entries` needs no grant (`user_id = me`).
  - **Terminal** with reason `update_not_applied` when no dependency is pending.
    `hasPendingRecord` already ignores terminal rows, so an update whose insert or grant was
    permanently rejected becomes terminal too, rather than retrying forever.
  - **Recovery:** an edit that was waiting on a pending grant stays retriable, so the next
    automatic pass after the grant uploads sends it, with no manual step. A terminal edit (nothing
    was pending) surfaces on the needs-attention card. If Head Office later restores an
    authorization, the existing forced "Sync Now", which includes terminal rows, applies it. No
    automatic requeue of terminal rows is added in this spec.
- `runBatchServerOperation` batches only `insert` operations for these five tables; `update`
  operations go one by one through the path above. This also removes a possible same-batch conflict,
  where a `children` insert and update for one id share an upsert array.
- **Same-record ordering:** an `update` is not sent while the same record's own `insert` outbox row
  is unacknowledged and not terminal. `findBlockingDependency` (`src/services/offlineSync.js:1329`)
  today only gates on parent tables, so an update can run in the same pass after its own insert
  failed. This narrow gate is the part of same-record ordering this spec needs. The upload-contract
  spec owns the general rule.

This exercises the UPDATE policy only, as the contract map already requires for archives. An EA can
then edit a Head Office-created child (UPDATE admits `created_by = me OR
current_user_can_write_for_child`) or a Head Office-created class (`current_user_can_write_for_class`
admits an active class EA), while every INSERT policy still stops anyone creating a row in someone
else's name.

**One exception stays on upsert:** `class_grouping_state`. `update` is its only operation and means
create-or-update (one row per class and academic year), and its INSERT policy is authorization-based
(`current_user_can_write_for_class`), not creator-bound. Its repository has no production caller
today.

### 6.5a Inventory summary (2026-10-09)

| Table | `update` producer | Server id | Sent as |
|---|---|---|---|
| `time_entries` | `timeEntriesRepository.js:71` (only after the insert row is acknowledged, or for a pulled row) | same as local | UPDATE by id |
| `classes` | `classesRepository.js:166` (Edit Class screen, including Head Office classes) | same | UPDATE by id |
| `children` | `childrenRepository.js:424`, `classesRepository.js:252` | same | UPDATE by id |
| `groups` | `groupsRepository.js:319` (no screen calls it today) | same | UPDATE by id |
| `letter_mastery` | `masteryRepository.js:62` via `:174` (reactivating a soft-deleted letter) | re-derived deterministic id | UPDATE by the payload id; the server row is always the same EA's (the id includes the user id, and every policy requires `user_id = me`) |
| `class_grouping_state` | `classGroupingStateRepository.js:43` (no production caller) | deterministic, same | upsert (exception) |

No producer emits `restore` today, although the SQLite CHECK allows it. The contract map records this
table as part of this branch, and it corrects one drift the inventory found: the map's "Batched
upsert" row omits the three assignment tables, which do batch their inserts.

### 6.5b Related defect found by the inventory: group assignment reactivation is lost

`groupsRepository.js:111-129` reactivates an archived `group_ea_assignments` row by enqueuing
`insert`. Assignment inserts are sent with `ignoreDuplicates: true`
(`src/services/offlineSync.js:708-710`), so the server does nothing, keeps the row archived, and the
phone records success. Fix in this branch: send reactivation as a lifecycle update
(`unassigned_at = null`, plus `handover_reason` if the table carries it) through the existing
archive-style exact acknowledgement. Unlike identity columns, those fields are not immutable, and
the UPDATE policy admits `ea_user_id = me`. Test T21 covers it.

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

Steps 1–4 repeat for `children`, `classes`, and `groups` (each created by Head Office and edited by
an assigned EA), and steps 2–3 for `time_entries` and `letter_mastery` (own rows). If any table
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
  drained by the sync engine through the handle's data client (§5.2).
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
3. Signed-in tree remount, module-state move, per-handle data client and queue, stale-refusal
   boundary, transaction doors, and drain (§5) with T3, T4, T5, T14–T16, T18–T20, and T23.
4. Ownership, edits-as-UPDATE, same-record ordering, and the reactivation fix (§6) with T6–T9, T17,
   T21, and T22, including the extended grant-evidence resolver. Lands with or after step 2, because the
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
| T3 | Live defect 2: A queues an upload, A signs out, B signs in, A's queued task runs; nothing is sent (asserted at the fetch layer) and the task fails with `StaleActorError` |
| T4 | A transaction admitted under epoch N with sign-out before `COMMIT` is rolled back, unless it carries a finalize token for a request already sent; a token-less write while draining is refused |
| T5 | An in-flight upload records its result within the drain bound; past the bound it is aborted, recorded as a retriable network error, the file closes, and on A's next open `resetInFlight` returns it to pending and it uploads |
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
| T17 | `UPDATE_NOT_APPLIED`, against migration-backed RLS: for each converted table, an edit sent before its granting assignment (direct child, class, group, and membership-mediated class/group for a child) is retriable; so is an edit whose class or group assignment is already synced but whose child membership is still pending, including a membership that failed transiently; and after the assignment uploads, the **next automatic pass** sends it with no manual step; a terminal grant makes the edit terminal instead of retrying forever; a readable `letter_mastery` row with a pending child assignment is retriable; an RLS-invisible row with nothing pending is terminal; an update whose own insert is terminal becomes terminal; a forced sync after authorization is restored applies it; no row is ever created; `update` operations are excluded from batches for the tables §6.5 moves to UPDATE |
| T18 | Through the **real** supabase-js/postgrest-js 2.100.1 builders over a fake transport: `reconcileChildClassMembership` paused inside its SELECT; A signs out, B signs in, the SELECT resumes; neither the archive UPDATE nor the final upsert reaches the transport; the queue rejects with `StaleActorError`; the row is not finalized, and its attempt count and backoff are unchanged. Repeated for `rpc`, and for a refusal between token acquisition and fetch |
| T23 | Token lifecycle: after `TOKEN_REFRESHED`, the next request carries the new token; after the token expires in the background, a foreground refresh lets requests proceed without a stale refusal; a request made outside a queued task is refused |
| T19 | A's upload never resolves; A signs out; B signs in: B's reference-data pull and first upload start within a defined bound, and A's request is aborted at the drain bound |
| T20 | No `from(` or `rpc(` call on the shared auth client outside the auth module (static test over `src/`) |
| T21 | Reactivating an archived group assignment is sent as a lifecycle update; the server row's `unassigned_at` becomes null; zero rows acknowledged is not reported as success |
| T22 | Same-record ordering: a `children` update is not sent while its own insert is unacknowledged and not terminal; once the insert is acknowledged, the update is sent by id |

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
| D4 | Measure sign-out to file closed on the A03s; this sets the §5.5 drain bound, the abort grace, and the §5.2 request timeout |
| D5 | Cold start with the file opened after sign-in, compared with today's build |
| D6 | Leave the app in the background past token expiry on both phones, then foreground and capture: requests resume under the refreshed token, with no stale refusal and no sign-out |

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
- **Codex adversarial review, round 2 (2026-10-09), verdict needs-attention, three findings, all
  accepted:**
  1. A check at queue entry does not fence later requests inside the same task. Every request now
     goes through the handle's own data client, which checks the actor at send time (§5.2).
  2. The process-wide request queue could leave EA B waiting behind EA A's hung request. Each handle
     now has its own queue, plus request timeouts and aborts at the end of the drain (§5.3, §5.5).
  3. Zero-row updates were classified without authorization evidence. They now reuse
     `computeEvidencePending` (§6.5).

  Codex also asked for the table-by-operation inventory before §6.5 is frozen. It was done
  (§6.5a). It corrected the first draft's claim that only a class's creator may update it, and it
  found the group-assignment reactivation defect (§6.5b).
- **Codex adversarial review, round 3 (2026-10-09), verdict needs-attention, two findings, both
  accepted.** Codex judged the core design proportionate.
  1. The reused grant-evidence map had no entries for the converted tables and could not follow
     authorization through class or group memberships. The resolver is extended (§6.5).
  2. postgrest-js turns a rejected fetch into an ordinary returned error, so a thrown stale refusal
     would be misread as a network failure. The handle's queue now restores the refusal and skips
     finalization (§5.2). T18 must run through the real SDK builders.
- **Codex adversarial review, round 4 (2026-10-09), verdict needs-attention, one medium finding,
  accepted.** A grant through a membership needs both the assignment and the membership, and either
  half can be the one waiting to upload. Evidence now counts either half (§6.5). Codex found no
  further actor-isolation issue: every data request is queued, the history RPCs use the queue,
  fallback concurrency still serializes server tasks, and skipping stale finalization keeps
  `in_flight` work recoverable. The loop stops here, because the catches have narrowed from four
  structural findings to one mechanical one.

## 12. Out of scope (owned by the upload-contract spec)

Uncertain-outcome recovery, same-record ordering, base versions and `stale_base`, the assessment
bundle as the exclusive insertion boundary, queue-level deadlines, and duplicate-proof submit. This
spec's §5.5 drain states the one dependency it places on that work.
